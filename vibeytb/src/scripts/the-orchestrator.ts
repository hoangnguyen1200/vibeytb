import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import { supabase } from '../lib/supabase/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { VideoStatus, type VideoProject, type ScriptJson } from '../types/video-script';
import { generateScriptFromTrend } from '../agents/agent-2-strategist/generator';
import { generateAudioFromText } from '../agents/agent-3-producer/tts-client';
import { downloadStockVideo } from '../agents/agent-3-producer/pexels-client';
import { downloadBGMFromPixabay } from '../agents/agent-3-producer/pixabay-client';
import { recordWebsiteScroll } from '../agents/agent-3-producer/playwright-recorder';
import { mergeAudioVideoScene, concatScenes } from '../agents/agent-3-producer/media-stitcher';
import { uploadToYouTube } from '../agents/agent-4-publisher/youtube-uploader';
import { uploadToTikTok } from '../agents/agent-4-publisher/tiktok-uploader';
import { runVisualQC } from '../agents/agent-3-producer/visual-qc';
import { pickBestTool, discoverViaGeminiSearch, discoverViaGoogleCSE, type DiscoveredTool } from '../agents/agent-1-data-miner/tool-discovery';
import { validateVideo } from './qc-video';
import { notifyDiscord } from '../utils/notifier';

type Mode = 'cron' | 'worker' | 'all';

// Fallback topics — only used when LLM discovery fails
const FALLBACK_TOPICS = [
  'best new AI tools this week',
  'free AI tools nobody talks about',
  'AI automation tools for beginners',
  'AI tools that save 10 hours a week',
  'underrated AI tools under the radar',
  'AI video tools going viral',
  'AI coding assistants trending right now',
  'AI tools for content creators on YouTube',
  'new AI voice cloning tools',
  'AI tools replacing traditional jobs',
];

const ACTIVE_STATUSES: VideoStatus[] = [
  VideoStatus.PENDING,
  VideoStatus.PROCESSING,
  VideoStatus.APPROVED_FOR_SYNTHESIS,
  VideoStatus.READY_FOR_VIDEO,
  VideoStatus.READY_FOR_UPLOAD,
  VideoStatus.UPLOAD_PENDING,
];

const WORKER_STATUSES: VideoStatus[] = [
  VideoStatus.APPROVED_FOR_SYNTHESIS,
  VideoStatus.READY_FOR_VIDEO,
  VideoStatus.READY_FOR_UPLOAD,
  VideoStatus.UPLOAD_PENDING,
];

const envFlag = (key: string, defaultValue = false): boolean => {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
};

export class TheMasterOrchestrator {
  /**
   * Master loop
   * @param mode 'cron' (Phase 1+2 only), 'worker' (Phase 3+4 only), or 'all' (E2E)
   */
  async runAutoPilot(mode: Mode = 'all', retryCount: number = 0): Promise<void> {
    console.log('====================================================');
    console.log(`[ORCHESTRATOR] STARTING PIPELINE (Mode: ${mode.toUpperCase()} | Retry: ${retryCount})`);
    console.log('====================================================\n');
    this.pipelineStartMs = Date.now();

    let jobId: string | null = null;

    try {
      const job = await this.getOrCreateJob(mode);
      if (!job) return;

      jobId = job.id;
      let currentStatus = job.status;

      console.log(`[ORCHESTRATOR] Job ID: ${jobId} | Status: [${currentStatus}]\n`);

      if (currentStatus === VideoStatus.PENDING || currentStatus === VideoStatus.PROCESSING) {
        await this.runPhase1And2(job);
        // Reload job status
        const updatedJob = await this.fetchJobById(jobId);
        if (updatedJob?.status === VideoStatus.APPROVED_FOR_SYNTHESIS) {
          await this.runPhase3(updatedJob);
          if (process.env.SKIP_UPLOAD === 'true') {
            console.log('[ORCHESTRATOR] SKIP_UPLOAD=true → Skipping Phase 4 (upload)');
          } else {
            await this.runPhase4(updatedJob);
          }
        }
        return;
      }

      if (currentStatus === VideoStatus.APPROVED_FOR_SYNTHESIS || currentStatus === VideoStatus.READY_FOR_VIDEO) {
        await this.runPhase3(job);
        currentStatus = VideoStatus.READY_FOR_UPLOAD;
      }

      if (currentStatus === VideoStatus.READY_FOR_UPLOAD || currentStatus === VideoStatus.UPLOAD_PENDING) {
        // Self-healing: if video file is missing (e.g. ephemeral CI runner), re-run Phase 3
        const videoPath = this.getFinalVideoPath(job.id);
        if (!(await this.fileExists(videoPath))) {
          console.warn('[ORCHESTRATOR] Video file missing at resume. Re-running Phase 3 to regenerate...');
          await this.runPhase3(job);
        }

        if (process.env.SKIP_UPLOAD === 'true') {
          console.log('[ORCHESTRATOR] SKIP_UPLOAD=true → Skipping Phase 4 (upload)');
        } else {
          await this.runPhase4(job);
        }
      } else if (currentStatus === VideoStatus.PENDING_APPROVAL) {
        console.log('[ORCHESTRATOR] Job is waiting for human approval. Aborting.');
      }
    } catch (error) {
      // Mark job as FAILED first — prevents zombie jobs if cleanup or discord notify throws
      await this.failJob(jobId, error);
      // Then cleanup tmp files to prevent disk from filling up
      if (jobId) {
        try { await this.cleanupTmp(jobId); } catch { /* ignore cleanup errors */ }
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      await notifyDiscord({ status: 'failure', jobId: jobId || 'unknown', error: errorMsg, durationMs: Date.now() - this.pipelineStartMs });
      throw error;
    }
  }

  private async getOrCreateJob(mode: Mode): Promise<VideoProject | null> {
    if (mode === 'cron') {
      console.log('[CRON] Seeding a new job into database...');
      return this.createSeedJob();
    }

    const statuses = mode === 'worker' ? WORKER_STATUSES : ACTIVE_STATUSES;
    const job = await this.fetchNextJob(statuses);
    if (job) return job;

    if (mode === 'worker') {
      console.log('[WORKER] No approved jobs found. Sleeping.');
      return null;
    }

    if (!envFlag('ALLOW_DRY_SEED')) {
      console.log('[INFO] No active jobs found and ALLOW_DRY_SEED is off. Exiting.');
      return null;
    }

    console.log('[INFO] No active jobs found. Seeding a dry-run job...');
    return this.createSeedJob();
  }

  private async createSeedJob(): Promise<VideoProject> {
    const { data, error } = await supabase
      .from('video_projects')
      .insert([
        {
          target_region: 'US',
          target_language: 'en-US',
          tone_of_voice: 'tech review, engaging',
          status: VideoStatus.PENDING,
        },
      ])
      .select();

    if (error) throw error;
    const job = data?.[0];
    if (!job) throw new Error('Seed job insert succeeded but returned no rows.');
    return job as VideoProject;
  }

  private async fetchNextJob(statuses: VideoStatus[]): Promise<VideoProject | null> {
    const { data, error } = await supabase
      .from('video_projects')
      .select('*')
      .in('status', statuses)
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) throw error;
    return (data?.[0] as VideoProject) ?? null;
  }

  private async fetchJobById(id: string): Promise<VideoProject | null> {
    const { data, error } = await supabase
      .from('video_projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.warn(`[WARNING] Failed to fetch job by id ${id}:`, error.message);
      return null;
    }
    return (data as VideoProject) ?? null;
  }

  /**
   * Content Memory: Extract tool names from recently completed videos
   * to prevent duplicate content within a 7-day window.
   */
  private async getRecentlyUsedTools(): Promise<string[]> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Strategy: prefer top-level tool_name column, fallback to JSONB parsing
      const { data, error } = await supabase
        .from('video_projects')
        .select('tool_name, script_json')
        .gte('created_at', sevenDaysAgo);

      if (error || !data) return [];

      const toolNames = new Set<string>();
      for (const row of data) {
        // Prefer top-level column (fast, clean)
        if (typeof row.tool_name === 'string' && row.tool_name.trim()) {
          toolNames.add(row.tool_name.trim());
          continue;
        }
        // Fallback: parse JSONB (legacy rows without tool_name column)
        const script = row.script_json as ScriptJson | null;
        if (!script?.scenes) continue;
        for (const scene of script.scenes) {
          const name = (scene as Record<string, unknown>).tool_name;
          if (typeof name === 'string' && name.trim()) {
            toolNames.add(name.trim());
          }
        }
      }

      const tools = Array.from(toolNames);
      if (tools.length > 0) {
        console.log(`[CONTENT MEMORY] 🧠 Tools used in last 7 days: ${tools.join(', ')}`);
      }
      return tools;
    } catch (err) {
      console.warn('[CONTENT MEMORY] Failed to fetch history, skipping.', err);
      return [];
    }
  }

  private async runPhase1And2(job: VideoProject): Promise<void> {
    const jobId = job.id;
    console.log('[PHASE 1] Data Mining');
    await this.updateJobStatus(jobId, VideoStatus.PROCESSING);

    // Content Memory: get tools to avoid (used by both topic discovery and script generation)
    const recentTools = await this.getRecentlyUsedTools();

    // MULTI-SOURCE: Discover from Gemini Search + Google CSE
    const allTools = await this.discoverFromAllSources(recentTools);
    const selectedTool = await pickBestTool(allTools, recentTools);

    let selectedTrend: string;
    let toolData: { name: string; tagline: string; url: string } | undefined;

    if (selectedTool) {
      selectedTrend = `${selectedTool.name}: ${selectedTool.tagline}`;
      toolData = { name: selectedTool.name, tagline: selectedTool.tagline, url: selectedTool.websiteUrl };
      console.log(`[PHASE 1] 🎯 Selected: "${selectedTool.name}" — ${selectedTool.tagline}`);
      console.log(`[PHASE 1] 🔗 Website: ${selectedTool.websiteUrl} (source: ${selectedTool.urlSource})`);

      // Persist tool metadata to DB for Content Memory + analytics
      await this.updateJob(jobId, {
        tool_name: selectedTool.name,
        tool_url: selectedTool.websiteUrl,
        discovery_source: selectedTool.urlSource,
      });
    } else {
      // FALLBACK: LLM keyword discovery
      selectedTrend = await this.discoverFreshTopic(recentTools);
      console.log(`[PHASE 1] 🔍 LLM keyword (fallback): "${selectedTrend}"`);
      await this.updateJob(jobId, { discovery_source: 'fallback' });
    }

    console.log('[PHASE 2] Content Strategist (AI script generation)');
    const language = (typeof job.target_language === 'string' && job.target_language.trim()) || 'en-US';
    const tone = (typeof job.tone_of_voice === 'string' && job.tone_of_voice.trim()) || 'casual';
    const aiOutput = await generateScriptFromTrend(selectedTrend, language, tone, recentTools, toolData);
    const normalized = this.normalizeScript(aiOutput);

    // Persist tool metadata at TOP LEVEL of script_json (backup for Phase 3/4 recovery)
    if (toolData?.name) {
      (normalized as Record<string, unknown>).__tool_name = toolData.name;
      (normalized as Record<string, unknown>).__tool_tagline = toolData.tagline;
    }

    // Force-inject tool name into ALL scenes (LLM often omits tool_name)
    // This ensures website recording always has the correct tool context
    if (toolData?.name) {
      for (const scene of normalized.scenes) {
        if (!(scene as Record<string, unknown>).tool_name) {
          (scene as Record<string, unknown>).tool_name = toolData.name;
        }
      }
      console.log(`[TOOL NAME] Injected "${toolData.name}" into all scenes for Layer 2 cascade`);
    }

    const isScenesSufficient = normalized.scenes.length >= 4;
    const title = (normalized as Record<string, unknown>).youtube_title;
    const isTitleValid = typeof title === 'string' && title.trim().length > 10;
    const isNarrationValid = normalized.scenes.every(s => typeof s.narration === 'string' && s.narration.trim().length > 0);

    if (isScenesSufficient && isTitleValid && isNarrationValid) {
      await this.updateJob(jobId, {
        script_json: normalized,
        status: VideoStatus.APPROVED_FOR_SYNTHESIS,
      });
      console.log('[AUTO-APPROVE] Script passed quality check');
    } else {
      let rejectReason = '';
      if (!isScenesSufficient) rejectReason = `Not enough scenes (${normalized.scenes.length} < 4)`;
      else if (!isTitleValid) rejectReason = 'youtube_title is empty or too short';
      else rejectReason = 'One or more scenes have empty narration';

      await this.updateJob(jobId, {
        script_json: normalized,
        status: VideoStatus.FAILED,
        error_logs: `[AUTO-REJECT] Script failed: ${rejectReason}`,
      });
      console.log(`[AUTO-REJECT] Script failed: ${rejectReason}`);
      await this.createSeedJob();
    }
  }

  private async runPhase3(job: VideoProject): Promise<void> {
    const jobId = job.id;
    console.log('[PHASE 3] Synthesizer (media generation)');

    const scriptData = this.normalizeScript(job.script_json);
    const tmpDir = this.getJobTmpDir(jobId);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const finalSceneFiles: string[] = [];

    // Propagate tool URL to ALL scenes — prevents stock footage fallback
    // LLM often only sets target_website_url on some scenes (e.g. scenes 2-3),
    // leaving intro/outro with null → generic stock footage. Fix: share the URL.
    const sharedUrl = scriptData.scenes.find(
      (s: Record<string, unknown>) => typeof s.target_website_url === 'string' && s.target_website_url
    )?.target_website_url as string | undefined;
    const sharedToolName = scriptData.scenes.find(
      (s: Record<string, unknown>) => typeof s.tool_name === 'string' && s.tool_name
    )?.tool_name as string | undefined;

    // Recovery: if no scene has tool_name, recover from top-level backup
    const recoveredToolName =
      sharedToolName ||
      ((scriptData as Record<string, unknown>).__tool_name as string | undefined);

    if (recoveredToolName && !sharedToolName) {
      console.log(`[TOOL NAME RECOVERY] Recovered "${recoveredToolName}" from __tool_name backup`);
    }

    if (sharedUrl || recoveredToolName) {
      for (const scene of scriptData.scenes) {
        if (!scene.target_website_url && sharedUrl) {
          scene.target_website_url = sharedUrl;
          console.log(`[URL PROPAGATE] Scene ${scene.scene_index} → inherited URL: ${sharedUrl}`);
        }
        if (!scene.tool_name && recoveredToolName) {
          scene.tool_name = recoveredToolName;
        }
      }
    }

    for (const [index, scene] of scriptData.scenes.entries()) {
      const sceneIndex = Number.isInteger(scene.scene_index) ? scene.scene_index : index + 1;
      console.log(`[PHASE 3] Rendering scene ${sceneIndex}`);

      const sceneFinalPath = path.join(tmpDir, `scene_${sceneIndex}_final.mp4`);
      if (await this.fileExists(sceneFinalPath)) {
        console.log(`[PHASE 3] Scene ${sceneIndex} already rendered. Skipping.`);
        finalSceneFiles.push(sceneFinalPath);
        continue;
      }

      const { filePath: audioPath, vttPath, duration } = await generateAudioFromText(
        scene.narration,
        jobId,
        sceneIndex
      );

      let videoPath: string = '';

      // Runtime blacklist guard — LLM hay bướng, cần code chặn
      const BLOCKED_DOMAINS = [
        'perplexity.ai', 'chatgpt.com', 'chat.openai.com',
        'claude.ai', 'bard.google.com', 'character.ai',
        'you.com', 'poe.com', 'gemini.google.com',
      ];
      const targetUrl = scene.target_website_url;
      if (targetUrl) {
        // Use proper hostname matching — prevents false positives like
        // "guideyou.com" being blocked by "you.com" substring match
        let isBlocked = false;
        try {
          const hostname = new URL(targetUrl).hostname.toLowerCase();
          isBlocked = BLOCKED_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith(`.${domain}`)
          );
        } catch {
          // Invalid URL — don't block
        }
        if (isBlocked) {
          console.log(`[GUARD] ⛔ URL bị chặn bởi blacklist: ${targetUrl} → Fallback sang stock video.`);
          scene.target_website_url = null;
        }
      }

      let websiteRecorded = false;

      if (scene.target_website_url) {
        // === LAYER 1: Try original website homepage ===
        try {
          console.log(`[PHASE 3] Layer 1 → Recording website: ${scene.target_website_url}`);
          videoPath = await recordWebsiteScroll(
            scene.target_website_url,
            duration,
            path.join(tmpDir, `scene_${sceneIndex}_raw.webm`),
            scene.target_search_query || undefined,
            sceneIndex
          );

          console.log(`[PHASE 3] Running Visual QC on Layer 1 recording...`);
          const isPass = await runVisualQC(videoPath, jobId, scene.target_website_url);
          if (isPass) {
            websiteRecorded = true;
          } else {
            console.log('[VISUAL QC] ❌ Layer 1 FAIL → Using stock video.');
          }
        } catch (error: unknown) {
          console.log('[LAYER 1] Playwright failed → Using stock video.');
        }
      }

      // Layer 2 REMOVED (2026-03-30) — PH page recording always fails due to Cloudflare Turnstile

      // === LAYER 3: Stock video (last resort) ===
      if (!websiteRecorded) {
        const keywords = scene.stock_search_keywords || 'technology';
        console.log(`[LAYER 3] Downloading stock video (keywords: "${keywords}")`);
        videoPath = await downloadStockVideo(keywords, jobId, sceneIndex);
      }

      await mergeAudioVideoScene(videoPath, audioPath, sceneFinalPath, duration, vttPath);
      finalSceneFiles.push(sceneFinalPath);
    }

    if (finalSceneFiles.length === 0) {
      throw new Error('Phase 3 produced zero scene outputs. Aborting.');
    }

    const bgmTargetMood = scriptData.music_mood || 'upbeat';
    console.log(`[PHASE 3] Fetching BGM for mood "${bgmTargetMood}"`);
    const bgmPath = await downloadBGMFromPixabay(bgmTargetMood, jobId);

    const finalVideoOutput = this.getFinalVideoPath(jobId);
    await concatScenes(finalSceneFiles, finalVideoOutput, jobId, bgmPath);

    await this.updateJobStatus(jobId, VideoStatus.READY_FOR_UPLOAD);
    console.log('[PHASE 3] Completed. Status saved: [ready_for_upload]');
  }

  private async runPhase4(job: VideoProject): Promise<void> {
    const jobId = job.id;
    console.log('[PHASE 4] Publisher — Sequential upload with pre-flight check');

    // ── Pre-flight: check which platforms have credentials ──────────────
    const hasYouTube = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
    const hasTikTok = !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REFRESH_TOKEN);

    console.log(`[PHASE 4] Pre-flight → YouTube: ${hasYouTube ? '✅ creds OK' : '❌ missing creds'} | TikTok: ${hasTikTok ? '✅ creds OK' : '❌ missing creds'}`);

    if (!hasYouTube && !hasTikTok) {
      console.warn('[PHASE 4] ⚠️ No platform credentials configured. Video saved, marking as UPLOAD_PENDING.');
      await this.updateJob(jobId, {
        status: VideoStatus.UPLOAD_PENDING,
        error_logs: 'UPLOAD_PENDING: No platform credentials available (both YouTube and TikTok missing)',
      });
      await notifyDiscord({ status: 'warning', jobId, title: 'Upload skipped — no platform creds', durationMs: Date.now() - this.pipelineStartMs });
      return;
    }

    // ── Prepare metadata ────────────────────────────────────────────────
    const meta = this.extractScriptMeta(job.script_json);
    const title = meta.title || 'Auto Generated YouTube Short';
    const rawDesc = meta.description || 'Auto upload from orchestrator';
    const tags = meta.tags || ['shorts', 'automation', 'tech'];

    const scriptData = this.parseJsonMaybe(job.script_json) as Record<string, unknown> | null;
    const scenes = (scriptData?.scenes as Array<Record<string, unknown>>) || [];
    const toolUrl = scenes.find(s => typeof s.target_website_url === 'string')?.target_website_url as string | undefined;
    const toolName = scenes.find(s => typeof s.tool_name === 'string')?.tool_name as string | undefined;

    // SEO: Auto-inject tool name into tags if LLM forgot
    if (toolName) {
      const toolLower = toolName.toLowerCase();
      const hasToolTag = tags.some(t => t.toLowerCase().includes(toolLower));
      if (!hasToolTag) {
        tags.unshift(toolLower);
        tags.unshift(`${toolLower} ai`);
        console.log(`[SEO] Auto-injected "${toolLower}" into tags`);
      }
    }

    const cleanDesc = rawDesc.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();

    // SEO: Build tool-specific hashtag (e.g., #gamma #boltnew)
    const toolHashtag = toolName
      ? `#${toolName.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : '';

    const descParts = [
      cleanDesc,
      '',
      toolUrl ? `🔗 Try it: ${toolUrl}` : '',
      toolName ? `📌 Tool featured: ${toolName}` : '',
      '',
      '👉 Follow @TechHustleLabs for daily AI tool reviews!',
      '🔔 Turn on notifications to never miss a new discovery.',
      '📅 New AI tool review uploaded EVERY DAY',
      '🔗 All links: https://linktr.ee/techhustlelabs',
      '',
      `#shorts #ai #aitools #tech #trending #productivity ${toolHashtag}`.trim(),
    ].filter(Boolean);
    const desc = descParts.join('\n');

    // Extract tagline for thumbnail badge
    const toolTagline = (scriptData as Record<string, unknown>)?.__tool_tagline as string | undefined;

    // ── Video file check ────────────────────────────────────────────────
    const finalVideoOutput = this.getFinalVideoPath(jobId);
    if (!(await this.fileExists(finalVideoOutput))) {
      throw new Error('Final video output missing. Phase 3 must complete before upload.');
    }

    await this.trimIfTooLong(finalVideoOutput, 59);

    // ── QC validation ───────────────────────────────────────────────────
    let qcPassed = false;
    try {
      qcPassed = await validateVideo(finalVideoOutput);
    } catch (qcErr) {
      console.error('[QC] Validation threw an error:', qcErr);
      qcPassed = false;
    }

    if (!qcPassed) {
      console.error('[QC] Upload blocked. Moving file to failed_videos.');
      const movedPath = await this.moveFailedVideo(finalVideoOutput, jobId);
      try {
        await this.updateJob(jobId, {
          status: VideoStatus.FAILED,
          error_logs: `QC_FAILED${movedPath ? `: ${movedPath}` : ''}`,
        });
      } catch (updateErr) {
        console.error('[QC] Failed to update job status after QC failure:', updateErr);
      }
      return;
    }

    // ── Sequential upload: YouTube first, then TikTok ───────────────────
    console.log('[PHASE 4] QC passed. Starting sequential upload...');
    let youtubeUrl = '';
    let tiktokUrl = '';
    const uploadErrors: string[] = [];

    // 1) YouTube
    if (hasYouTube) {
      try {
        console.log('[PHASE 4] ▶ Uploading to YouTube...');
        youtubeUrl = await uploadToYouTube(jobId, finalVideoOutput, title, desc, tags, false, toolUrl, toolName, toolTagline);
        console.log(`[PHASE 4] ✅ YouTube upload OK: ${youtubeUrl}`);
      } catch (ytErr: unknown) {
        const ytMsg = ytErr instanceof Error ? ytErr.message : String(ytErr);
        console.error(`[PHASE 4] ❌ YouTube upload failed: ${ytMsg}`);
        uploadErrors.push(`YouTube: ${ytMsg}`);
      }
    } else {
      console.log('[PHASE 4] ⏭ YouTube skipped (no credentials)');
    }

    // 2) TikTok
    if (hasTikTok) {
      try {
        console.log('[PHASE 4] ▶ Uploading to TikTok...');
        tiktokUrl = await uploadToTikTok(jobId, finalVideoOutput, title, tags, toolUrl, toolName);
        console.log(`[PHASE 4] ✅ TikTok upload OK: ${tiktokUrl}`);
      } catch (ttErr: unknown) {
        const ttMsg = ttErr instanceof Error ? ttErr.message : String(ttErr);
        console.error(`[PHASE 4] ❌ TikTok upload failed: ${ttMsg}`);
        uploadErrors.push(`TikTok: ${ttMsg}`);
      }
    } else {
      console.log('[PHASE 4] ⏭ TikTok skipped (no credentials)');
    }

    // ── Determine final status ──────────────────────────────────────────
    const hasAnyUrl = !!(youtubeUrl || tiktokUrl);

    if (hasAnyUrl) {
      // At least one platform succeeded → PUBLISHED
      await this.cleanupTmp(jobId);
      await this.updateJob(jobId, {
        status: VideoStatus.PUBLISHED,
        ...(youtubeUrl ? { youtube_url: youtubeUrl } : {}),
        ...(tiktokUrl ? { tiktok_url: tiktokUrl } : {}),
        ...(uploadErrors.length > 0 ? { error_logs: `PARTIAL_UPLOAD: ${uploadErrors.join(' | ')}` } : {}),
      });

      console.log('[DONE] Pipeline complete.');
      if (youtubeUrl) console.log(`YouTube URL: ${youtubeUrl}`);
      if (tiktokUrl) console.log(`TikTok URL: ${tiktokUrl}`);
      if (uploadErrors.length > 0) console.warn(`[PHASE 4] Partial upload — some platforms failed: ${uploadErrors.join(' | ')}`);

      await notifyDiscord({ status: 'success', jobId, title, youtubeUrl: youtubeUrl || undefined, tiktokUrl: tiktokUrl || undefined, durationMs: Date.now() - this.pipelineStartMs });
    } else {
      // All platforms failed → UPLOAD_PENDING (video is saved, can retry later)
      console.warn('[PHASE 4] ⚠️ All platform uploads failed. Video preserved for retry. Marking as UPLOAD_PENDING.');
      await this.updateJob(jobId, {
        status: VideoStatus.UPLOAD_PENDING,
        error_logs: `UPLOAD_PENDING: ${uploadErrors.join(' | ')}`,
      });

      await notifyDiscord({ status: 'warning', jobId, title: `Upload failed (retry later): ${title}`, durationMs: Date.now() - this.pipelineStartMs });
    }
  }

  // Expose start time for notifications
  private pipelineStartMs: number = Date.now();

  private normalizeScript(raw: unknown): ScriptJson {
    const parsed = this.parseJsonMaybe(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('script_json is missing or invalid.');
    }

    const scenesRaw = (parsed as { scenes?: unknown }).scenes;
    if (!Array.isArray(scenesRaw) || scenesRaw.length === 0) {
      throw new Error('script_json.scenes is missing or empty.');
    }

    const scenes = scenesRaw.map((scene: Record<string, unknown>, index: number) => {
      const narration = typeof scene?.narration === 'string' ? scene.narration.trim() : '';
      if (!narration) throw new Error(`Scene ${index + 1} is missing narration text.`);

      return {
        scene_index: Number.isInteger(scene?.scene_index) ? scene.scene_index : index + 1,
        narration,
        target_website_url:
          typeof scene?.target_website_url === 'string' && scene.target_website_url.trim()
            ? scene.target_website_url.trim()
            : undefined,
        target_search_query:
          typeof scene?.target_search_query === 'string' && scene.target_search_query.trim()
            ? scene.target_search_query.trim()
            : undefined,
        stock_search_keywords:
          typeof scene?.stock_search_keywords === 'string' && scene.stock_search_keywords.trim()
            ? scene.stock_search_keywords.trim()
            : 'technology',
        estimated_duration: typeof scene?.estimated_duration === 'number' ? scene.estimated_duration : 5,
      };
    });

    return { ...(parsed as object), scenes } as ScriptJson;
  }

  private extractScriptMeta(raw: unknown): { title?: string; description?: string; tags?: string[] } {
    const parsed = this.parseJsonMaybe(raw);
    if (!parsed || typeof parsed !== 'object') return {};

    const parsedRecord = parsed as Record<string, unknown>;
    const youtubeTitle =
      typeof parsedRecord.youtube_title === 'string' ? parsedRecord.youtube_title : undefined;
    const youtubeDescription =
      typeof parsedRecord.youtube_description === 'string'
        ? parsedRecord.youtube_description
        : undefined;
    const youtubeTags = Array.isArray(parsedRecord.youtube_tags)
      ? parsedRecord.youtube_tags.filter((tag: unknown) => typeof tag === 'string') as string[]
      : undefined;

    return {
      title: youtubeTitle,
      description: youtubeDescription,
      tags: youtubeTags,
    };
  }

  private parseJsonMaybe(raw: unknown): unknown | null {
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * MULTI-SOURCE discovery: Gemini AI Search + Google CSE.
   * Returns merged tool list (unpicked). pickBestTool() runs separately.
   */
  private async discoverFromAllSources(avoidTools: string[]): Promise<DiscoveredTool[]> {
    const allTools: DiscoveredTool[] = [];

    // Source 1: Gemini AI Search (primary — AI finds trending tools)
    try {
      const geminiTools = await discoverViaGeminiSearch();
      allTools.push(...geminiTools);
    } catch (err) {
      console.warn('[SOURCE 1] Gemini Search failed:', (err as Error).message?.slice(0, 60));
    }

    // Source 2: Google Custom Search API (searches tech/AI sites)
    try {
      const cseTools = await discoverViaGoogleCSE();
      allTools.push(...cseTools);
    } catch (err) {
      console.warn('[SOURCE 2] Google CSE failed:', (err as Error).message?.slice(0, 60));
    }

    console.log(`[PHASE 1] Total tools from all sources: ${allTools.length} (Gemini + Google CSE)`);
    return allTools;
  }

  /**
   * FALLBACK data source: LLM generates a trending keyword.
   * Used when Product Hunt is unavailable or all tools are already covered.
   */
  private async discoverFreshTopic(avoidTools: string[]): Promise<string> {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error('No GEMINI_API_KEY');

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const today = new Date().toISOString().split('T')[0];
      const avoidStr = avoidTools.length > 0
        ? `\nDo NOT suggest these tools (already covered): ${avoidTools.join(', ')}`
        : '';

      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: `You are a YouTube Shorts content researcher. Today is ${today}.

Suggest ONE specific, trending AI tool niche keyword for a YouTube Shorts video that would get high views right now.

Rules:
- Focus on a SPECIFIC category (e.g. "AI tools for video editing" not just "AI tools")
- The topic should feel FRESH and timely
- Target US audience, English content
- Think about what people are searching for RIGHT NOW${avoidStr}

Respond with ONLY the keyword phrase, nothing else. Example: "AI tools that replace Photoshop for free"`
          }]
        }],
      });

      const topic = result.response.text().trim().replace(/^["']|["']$/g, '');
      if (topic && topic.length > 10 && topic.length < 100) {
        console.log(`[TOPIC DISCOVERY] 🔍 LLM suggested: "${topic}"`);
        return topic;
      }

      throw new Error(`Invalid topic response: "${topic}"`);
    } catch (err) {
      console.warn('[TOPIC DISCOVERY] LLM failed, using fallback.', err);
      return FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)];
    }
  }

  /**
   * Auto-fit: if video exceeds maxSeconds, speed it up instead of cutting.
   * This preserves ALL content — no sentences get cut mid-word.
   * Speed up to 1.3x is virtually unnoticeable to viewers.
   */
  private async trimIfTooLong(videoPath: string, maxSeconds: number): Promise<void> {
    const { getMediaDuration } = await import('../agents/agent-3-producer/tts-client');
    const duration = await getMediaDuration(videoPath);

    if (duration <= maxSeconds) {
      console.log(`[FIT] Video is ${duration.toFixed(1)}s — within ${maxSeconds}s limit. ✅`);
      return;
    }

    const speedFactor = duration / maxSeconds; // e.g. 65/59 = 1.10x
    const { ffmpeg: ff } = await import('../utils/ffmpeg');
    const fittedPath = videoPath.replace('.mp4', '_fitted.mp4');

    if (speedFactor <= 1.3) {
      // Smart speed-up: barely noticeable, keeps ALL content
      console.log(`[FIT] ⚡ Video is ${duration.toFixed(1)}s → speed up ${speedFactor.toFixed(2)}x to fit ${maxSeconds}s`);

      await new Promise<void>((resolve, reject) => {
        ff(videoPath)
          .complexFilter([
            `[0:v]setpts=${(1 / speedFactor).toFixed(4)}*PTS[v]`,
            `[0:a]atempo=${speedFactor.toFixed(4)}[a]`,
          ])
          .outputOptions([
            '-map [v]',
            '-map [a]',
            '-c:v libx264',
            '-preset fast',
            '-b:v 8M',
            '-c:a aac',
            '-b:a 128k',
            '-movflags +faststart',
          ])
          .save(fittedPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });
    } else {
      // Extreme case (>1.3x would sound weird) — hard trim + fade out
      console.log(`[FIT] ✂️ Video is ${duration.toFixed(1)}s — too long for speed-up. Trimming with fade-out.`);

      await new Promise<void>((resolve, reject) => {
        const fadeStart = maxSeconds - 1.5;
        ff(videoPath)
          .complexFilter([
            `[0:v]trim=0:${maxSeconds},setpts=PTS-STARTPTS,fade=t=out:st=${fadeStart}:d=1.5[v]`,
            `[0:a]atrim=0:${maxSeconds},asetpts=PTS-STARTPTS,afade=t=out:st=${fadeStart}:d=1.5[a]`,
          ])
          .outputOptions([
            '-map [v]',
            '-map [a]',
            '-c:v libx264',
            '-preset fast',
            '-b:v 8M',
            '-c:a aac',
            '-b:a 128k',
            '-movflags +faststart',
          ])
          .save(fittedPath)
          .on('end', () => resolve())
          .on('error', (err: Error) => reject(err));
      });
    }

    // Replace original with fitted version
    fs.unlinkSync(videoPath);
    fs.renameSync(fittedPath, videoPath);
    console.log(`[FIT] ✅ Video fitted to ≤${maxSeconds}s successfully.`);
  }

  private getJobTmpDir(jobId: string): string {
    return path.join(process.cwd(), 'tmp', jobId);
  }

  private getFinalVideoPath(jobId: string): string {
    return path.join(this.getJobTmpDir(jobId), 'final_output.mp4');
  }

  private getFailedVideosDir(): string {
    return path.join(process.cwd(), 'failed_videos');
  }

  private async moveFailedVideo(filePath: string, jobId: string): Promise<string | null> {
    try {
      const failedDir = this.getFailedVideosDir();
      await fs.promises.mkdir(failedDir, { recursive: true });

      const baseName = path.basename(filePath);
      const targetPath = path.join(failedDir, `${jobId}_${Date.now()}_${baseName}`);

      try {
        await fs.promises.rename(filePath, targetPath);
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as Record<string, unknown>).code === 'EXDEV') {
          await fs.promises.copyFile(filePath, targetPath);
          await fs.promises.unlink(filePath);
        } else {
          throw err;
        }
      }

      console.log(`[QC] Failed video moved to: ${targetPath}`);
      return targetPath;
    } catch (err) {
      console.error('[QC] Failed to move video to failed_videos:', err);
      return null;
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupTmp(jobId: string): Promise<void> {
    const tmpDir = this.getJobTmpDir(jobId);
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
      console.log(`[CLEANUP] Removed tmp directory: ${tmpDir}`);
    } catch (error) {
      console.warn('[CLEANUP] Failed to remove tmp directory:', error);
    }
  }

  private async updateJobStatus(jobId: string, status: VideoStatus): Promise<void> {
    await this.updateJob(jobId, { status });
  }

  private async updateJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await supabase.from('video_projects').update(patch).eq('id', jobId);
    if (error) throw error;
  }

  private async failJob(jobId: string | null, error: unknown): Promise<void> {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('\n====================================================');
    console.error('[FATAL] Pipeline crashed.');
    console.error(errMessage);
    console.error('====================================================');

    if (!jobId) return;

    try {
      await this.updateJob(jobId, { status: VideoStatus.FAILED, error_logs: errMessage });
      console.log(`[ERROR] Marked job ${jobId} as failed.`);
    } catch (dbErr) {
      console.error('[ERROR] Failed to write error log to database:', dbErr);
    }
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const modeArg: Mode = args.includes('--worker') ? 'worker' : args.includes('--cron') ? 'cron' : 'all';

  const orchestrator = new TheMasterOrchestrator();
  orchestrator
    .runAutoPilot(modeArg)
    .then(() => {
      console.log('[EXIT] Process completed safely.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[EXIT] Process failed.', error);
      process.exit(1);
    });
}

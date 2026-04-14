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
import {
  publishFacebookReel,
  publishFacebookPost,
  buildReelCaption,
  buildPostDescription,
  generateFbMiniReview,
  isFacebookConfigured,
} from '../agents/agent-4-publisher/facebook-publisher';
import {
  publishInstagramReel,
  buildInstagramCaption,
  isInstagramConfigured,
} from '../agents/agent-4-publisher/instagram-publisher';
import { runVisualQC, type VisualQCResult } from '../agents/agent-3-producer/visual-qc';
import { pickBestTool, pickTopTools, discoverViaGeminiSearch, discoverViaGoogleCSE, type DiscoveredTool } from '../agents/agent-1-data-miner/tool-discovery';
import { validateVideo } from './qc-video';
import { notifyDiscord, notifyDailyDigest } from '../utils/notifier';
import { CHANNEL_HANDLE, LINKTREE_URL, TOOLS_PAGE_URL, DEFAULT_HASHTAGS, AFFILIATE_DISCLOSURE } from '../utils/branding';
import { resolveAffiliateUrlFromDb, loadAffiliatesFromDb } from '../utils/affiliate-registry';

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
  private pipelineStartMs = 0;
  private currentToolName = '';
  private currentWebsiteUrl = '';
  private currentDataSource = '';
  private selectedTool: DiscoveredTool | null = null;
  private pipelineRunId: string | null = null;
  private logBuffer: Map<number, Array<{ ts: string; level: string; msg: string; meta?: Record<string, unknown> }>> = new Map();
  /**
   * Master loop
   * @param mode 'cron' (Phase 1+2 only), 'worker' (Phase 3+4 only), or 'all' (E2E)
   */
  async runAutoPilot(mode: Mode = 'all', retryCount: number = 0): Promise<void> {
    console.log('====================================================');
    console.log(`[ORCHESTRATOR] STARTING PIPELINE (Mode: ${mode.toUpperCase()} | Retry: ${retryCount})`);
    console.log('====================================================\n');
    this.pipelineStartMs = Date.now();

    // A3: Pipeline run logging — record start
    const triggerType = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' ? 'manual' : 'scheduled';
    this.pipelineRunId = await this.createPipelineRun(triggerType);

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
        // A3: Record success
        await this.finishPipelineRun('completed', 1);
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
      // A3: Record success
      await this.finishPipelineRun('completed', 1);
    } catch (error) {
      // Mark job as FAILED first — prevents zombie jobs if cleanup or discord notify throws
      await this.failJob(jobId, error);
      // A3: Record failure with categorized error
      const category = this.categorizeError(error);
      await this.finishPipelineRun('failed', 0, error);
      // Then cleanup tmp files to prevent disk from filling up
      if (jobId) {
        try { await this.cleanupTmp(jobId); } catch { /* ignore cleanup errors */ }
      }
      const errorMsg = error instanceof Error ? error.message : String(error);
      await notifyDiscord({ status: 'failure', jobId: jobId || 'unknown', error: `[${category}] ${errorMsg}`, toolName: this.currentToolName || undefined, websiteUrl: this.currentWebsiteUrl || undefined, dataSource: this.currentDataSource || undefined, durationMs: Date.now() - this.pipelineStartMs });
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
    await this.logPhaseStart(1, 'data_mining');
    this.logEntry(1, 'info', '🔍 Starting tool discovery...');
    await this.updateJobStatus(jobId, VideoStatus.PROCESSING);

    // Content Memory: get tools to avoid (used by both topic discovery and script generation)
    const recentTools = await this.getRecentlyUsedTools();

    // Discovery source: Gemini AI Search only (Google CSE disabled 2026-04-06)
    const allTools = await this.discoverFromAllSources(recentTools);

    // P1: Enrich tools with DB affiliate status for smart scoring
    await this.enrichAffiliateStatus(allTools);

    // A1: Get top 3 verified tools for retry pool
    const topTools = await pickTopTools(allTools, recentTools, 3);

    const language = (typeof job.target_language === 'string' && job.target_language.trim()) || 'en-US';
    const tone = (typeof job.tone_of_voice === 'string' && job.tone_of_voice.trim()) || 'casual';

    // A1: Multi-tool retry loop — try each tool until one succeeds
    if (topTools.length > 0) {
      for (let attempt = 0; attempt < topTools.length; attempt++) {
        const tool = topTools[attempt];
        console.log(`\n[RETRY LOOP] 🔄 Attempt ${attempt + 1}/${topTools.length}: "${tool.name}"`);
        this.logEntry(1, 'info', `🎯 Selected: ${tool.name} (attempt ${attempt + 1}/${topTools.length})`, { url: tool.websiteUrl, source: tool.urlSource });

        this.currentToolName = tool.name;
        this.currentWebsiteUrl = tool.websiteUrl;
        this.currentDataSource = tool.urlSource;

        const selectedTrend = `${tool.name}: ${tool.tagline}`;
        const toolData = { name: tool.name, tagline: tool.tagline, url: tool.websiteUrl };

        // Persist tool metadata to DB
        await this.updateJob(jobId, {
          tool_name: tool.name,
          tool_url: tool.websiteUrl,
          discovery_source: tool.urlSource,
        });

        this.selectedTool = tool;

        // P0: Auto-save detected affiliate program to DB (pending status)
        if (tool.hasAffiliate) {
          await this.savePendingAffiliate(tool);
        }

        try {
          this.logEntry(1, 'info', `✅ Tool verified: ${tool.name}`);
          await this.logPhaseEnd(1, 'completed');
          console.log('[PHASE 2] Content Strategist (AI script generation)');
          await this.logPhaseStart(2, 'scripting');
          this.logEntry(2, 'info', `✍️ Generating script for "${tool.name}"...`);
          const { script: aiOutput, titleStyleId } = await generateScriptFromTrend(selectedTrend, language, tone, recentTools, toolData);
          const normalized = this.normalizeScript(aiOutput);

          // Persist tool metadata at TOP LEVEL of script_json (backup for Phase 3/4 recovery)
          (normalized as Record<string, unknown>).__tool_name = toolData.name;
          (normalized as Record<string, unknown>).__tool_tagline = toolData.tagline;

          // Force-inject tool name into ALL scenes
          for (const scene of normalized.scenes) {
            if (!(scene as Record<string, unknown>).tool_name) {
              (scene as Record<string, unknown>).tool_name = toolData.name;
            }
          }
          console.log(`[TOOL NAME] Injected "${toolData.name}" into all scenes`);

          // Quality gate
          const isScenesSufficient = normalized.scenes.length >= 4;
          const title = (normalized as Record<string, unknown>).youtube_title;
          const isTitleValid = typeof title === 'string' && title.trim().length > 10;
          const isNarrationValid = normalized.scenes.every(s => typeof s.narration === 'string' && s.narration.trim().length > 0);

          if (isScenesSufficient && isTitleValid && isNarrationValid) {
            await this.updateJob(jobId, {
              script_json: normalized,
              status: VideoStatus.APPROVED_FOR_SYNTHESIS,
              title_style: titleStyleId,
            });
            console.log(`[AUTO-APPROVE] ✅ Script passed quality check (tool: ${tool.name}, attempt ${attempt + 1}, style: ${titleStyleId})`);
            this.logEntry(2, 'info', `✅ Script approved: "${(title as string).slice(0, 60)}" [style: ${titleStyleId}]`, { scenes: normalized.scenes.length });
            return; // Success — exit retry loop
          } else {
            let rejectReason = '';
            if (!isScenesSufficient) rejectReason = `Not enough scenes (${normalized.scenes.length} < 4)`;
            else if (!isTitleValid) rejectReason = 'youtube_title is empty or too short';
            else rejectReason = 'One or more scenes have empty narration';
            console.warn(`[AUTO-REJECT] Script failed for "${tool.name}": ${rejectReason}`);
            this.logEntry(2, 'warn', `⚠️ Script rejected: ${rejectReason}`);
            // Don't throw — continue to next tool
          }
        } catch (err) {
          const category = this.categorizeError(err);
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(`[RETRY LOOP] ❌ Tool "${tool.name}" failed [${category}]: ${errMsg.slice(0, 100)}`);
          this.logEntry(1, 'error', `❌ ${tool.name} failed: [${category}] ${errMsg.slice(0, 80)}`);

          // If more tools to try, wait briefly then continue
          if (attempt < topTools.length - 1) {
            const waitMs = 5000; // 5s between tool retries
            console.log(`[RETRY LOOP] Waiting ${waitMs / 1000}s before trying next tool...`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
          }
          // Continue to next tool
        }
      }

      // All tools failed
      console.error(`[RETRY LOOP] ❌ All ${topTools.length} tools failed. Marking job as FAILED.`);
      await this.updateJob(jobId, {
        status: VideoStatus.FAILED,
        error_logs: `[multi-tool-retry] All ${topTools.length} tools failed: ${topTools.map(t => t.name).join(', ')}`,
      });
      await this.createSeedJob();
      return;
    }

    // FALLBACK: No tools discovered — use LLM keyword
    const selectedTrend = await this.discoverFreshTopic(recentTools);
    console.log(`[PHASE 1] 🔍 LLM keyword (fallback): "${selectedTrend}"`);
    await this.updateJob(jobId, { discovery_source: 'fallback' });

    console.log('[PHASE 2] Content Strategist (AI script generation)');
    const { script: aiOutput, titleStyleId } = await generateScriptFromTrend(selectedTrend, language, tone, recentTools);
    const normalized = this.normalizeScript(aiOutput);

    const isScenesSufficient = normalized.scenes.length >= 4;
    const title = (normalized as Record<string, unknown>).youtube_title;
    const isTitleValid = typeof title === 'string' && title.trim().length > 10;
    const isNarrationValid = normalized.scenes.every(s => typeof s.narration === 'string' && s.narration.trim().length > 0);

    if (isScenesSufficient && isTitleValid && isNarrationValid) {
      await this.updateJob(jobId, {
        script_json: normalized,
        status: VideoStatus.APPROVED_FOR_SYNTHESIS,
        title_style: titleStyleId,
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
    await this.logPhaseEnd(2, 'completed');
    await this.logPhaseStart(3, 'production');
    this.logEntry(3, 'info', `🎬 Starting video production (${this.normalizeScript(job.script_json).scenes.length} scenes)`);

    const scriptData = this.normalizeScript(job.script_json);
    const tmpDir = this.getJobTmpDir(jobId);
    await fs.promises.mkdir(tmpDir, { recursive: true });

    const finalSceneFiles: string[] = [];
    const sceneSrtPaths: string[] = [];

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
      this.logEntry(3, 'info', `🎞️ Rendering scene ${sceneIndex}...`);

      const sceneFinalPath = path.join(tmpDir, `scene_${sceneIndex}_final.mp4`);
      if (await this.fileExists(sceneFinalPath)) {
        console.log(`[PHASE 3] Scene ${sceneIndex} already rendered. Skipping.`);
        finalSceneFiles.push(sceneFinalPath);
        continue;
      }

      const { filePath: audioPath, vttPath, srtPath, duration } = await generateAudioFromText(
        scene.narration,
        jobId,
        sceneIndex
      );

      // Scene 1 needs minimum 5s for website to fully load + render.
      // Short TTS hooks (< 5s) cause blank page → Visual QC fail → stock fallback.
      const recordDuration = (sceneIndex <= 1 && duration < 5) ? 5 : duration;

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
            recordDuration,
            path.join(tmpDir, `scene_${sceneIndex}_raw.webm`),
            scene.target_search_query || undefined,
            sceneIndex
          );

          console.log(`[PHASE 3] Running Visual QC on Layer 1 recording...`);
          const qcResult = await runVisualQC(videoPath, jobId, scene.target_website_url);
          if (qcResult.pass) {
            websiteRecorded = true;
            this.logEntry(3, 'info', `🌐 Website recorded: ${scene.target_website_url}`);
            if (qcResult.quality === 'weak') {
              console.warn('[VISUAL QC] ⚠️ WEAK: Website is text-heavy — video may have low retention');
              this.logEntry(3, 'warn', '⚠️ Visual QC WEAK: text-heavy page');
            }
          } else {
            console.log('[VISUAL QC] ❌ Layer 1 FAIL → Using stock video.');
            this.logEntry(3, 'warn', '⚠️ Visual QC fail → fallback to stock video');
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

      // Viral hook overlay: extract first sentence of Scene 1 narration (under 40 chars)
      const hookText = sceneIndex === 0
        ? (scene.narration.split(/[.!?]/)[0] || '').trim().slice(0, 40)
        : undefined;
      if (hookText) console.log(`[PHASE 3] 🔥 Hook overlay: "${hookText}"`);

      await mergeAudioVideoScene(videoPath, audioPath, sceneFinalPath, duration, vttPath, hookText);
      finalSceneFiles.push(sceneFinalPath);
      if (srtPath && fs.existsSync(srtPath)) sceneSrtPaths.push(srtPath);
    }

    if (finalSceneFiles.length === 0) {
      throw new Error('Phase 3 produced zero scene outputs. Aborting.');
    }

    const bgmTargetMood = scriptData.music_mood || 'upbeat';
    console.log(`[PHASE 3] Fetching BGM for mood "${bgmTargetMood}"`);
    const bgmPath = await downloadBGMFromPixabay(bgmTargetMood, jobId);

    const finalVideoOutput = this.getFinalVideoPath(jobId);
    await concatScenes(finalSceneFiles, finalVideoOutput, jobId, bgmPath);

    // Merge per-scene SRT files into single SRT for YouTube caption upload
    const mergedSrtPath = path.join(tmpDir, 'merged_captions.srt');
    this.mergeSrtFiles(sceneSrtPaths, finalSceneFiles, mergedSrtPath);

    await this.updateJob(jobId, {
      status: VideoStatus.READY_FOR_UPLOAD,
      ...(fs.existsSync(mergedSrtPath) ? { srt_path: mergedSrtPath } : {}),
    });
    this.logEntry(3, 'info', `✅ Video produced: ${finalSceneFiles.length} scenes stitched`);
    console.log('[PHASE 3] Completed. Status saved: [ready_for_upload]');
  }

  private async runPhase4(job: VideoProject): Promise<void> {
    const jobId = job.id;
    console.log('[PHASE 4] Publisher — Sequential upload with pre-flight check');
    await this.logPhaseEnd(3, 'completed');
    await this.logPhaseStart(4, 'publishing');
    this.logEntry(4, 'info', '📤 Starting upload sequence...');

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

    // Affiliate: resolve direct URL → affiliate URL (or UTM-tagged fallback)
    const { url: resolvedUrl, isAffiliate } = await resolveAffiliateUrlFromDb(toolName || '', toolUrl || '');
    if (isAffiliate) {
      console.log(`[AFFILIATE] 💰 Using affiliate link for ${toolName}: ${resolvedUrl}`);
    }

    // P0: Alert when affiliate tool publishes without registered referral URL
    if (!isAffiliate && this.selectedTool?.hasAffiliate) {
      console.warn(`[AFFILIATE] ⚠️ MISSED: ${toolName} has affiliate program but no referral URL registered`);
      await notifyDiscord({
        status: 'warning',
        jobId,
        title: `💰 Affiliate Opportunity Missed: ${toolName} (${this.selectedTool.affiliateCommission || 'detected'})`,
        toolName,
        websiteUrl: this.selectedTool.affiliateSignupUrl || toolUrl || '',
        durationMs: 0,
      });
    }

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
      resolvedUrl ? `🔗 Try it: ${resolvedUrl}` : '',
      toolName ? `📌 Tool featured: ${toolName}` : '',
      '',
      `👉 Follow ${CHANNEL_HANDLE} for daily AI tool reviews!`,
      '🔔 Turn on notifications to never miss a new discovery.',
      '📅 New AI tool review uploaded EVERY DAY',
      `🔗 All links: ${LINKTREE_URL}`,
      `🤖 All AI tools I recommend: ${TOOLS_PAGE_URL}`,
      '',
      `${DEFAULT_HASHTAGS} ${toolHashtag}`.trim(),
      // FTC disclosure — only when affiliate link is present
      ...(isAffiliate ? ['', `📋 ${AFFILIATE_DISCLOSURE}`] : []),
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
    this.logEntry(4, 'info', '✅ QC passed, uploading...');
    let youtubeUrl = '';
    let tiktokUrl = '';
    const uploadErrors: string[] = [];

    // 1) YouTube
    if (hasYouTube) {
      try {
        console.log('[PHASE 4] ▶ Uploading to YouTube...');
        // Resolve SRT path from job metadata or tmp dir
        const srtPath = (job as Record<string, unknown>).srt_path as string | undefined;
        youtubeUrl = await uploadToYouTube(jobId, finalVideoOutput, title, desc, tags, false, resolvedUrl || toolUrl, toolName, toolTagline, srtPath);
        console.log(`[PHASE 4] ✅ YouTube upload OK: ${youtubeUrl}`);
        this.logEntry(4, 'info', `🎬 YouTube published: ${youtubeUrl}`);
      } catch (ytErr: unknown) {
        const ytMsg = ytErr instanceof Error ? ytErr.message : String(ytErr);
        console.error(`[PHASE 4] ❌ YouTube upload failed: ${ytMsg}`);
        uploadErrors.push(`YouTube: ${ytMsg}`);
        this.logEntry(4, 'error', `❌ YouTube failed: ${ytMsg.slice(0, 100)}`);
      }
    } else {
      console.log('[PHASE 4] ⏭ YouTube skipped (no credentials)');
    }

    // 2) TikTok
    if (hasTikTok) {
      try {
        console.log('[PHASE 4] ▶ Uploading to TikTok...');
        tiktokUrl = await uploadToTikTok(jobId, finalVideoOutput, title, tags, resolvedUrl || toolUrl, toolName);
        if (tiktokUrl) {
          console.log(`[PHASE 4] ✅ TikTok upload OK: ${tiktokUrl}`);
          this.logEntry(4, 'info', `📱 TikTok published: ${tiktokUrl}`);
        } else {
          console.log('[PHASE 4] ⚠️ TikTok returned no URL — treating as skipped');
          tiktokUrl = '';
        }
      } catch (ttErr: unknown) {
        const ttMsg = ttErr instanceof Error ? ttErr.message : String(ttErr);
        console.error(`[PHASE 4] ❌ TikTok upload failed: ${ttMsg}`);
        uploadErrors.push(`TikTok: ${ttMsg}`);
        this.logEntry(4, 'error', `❌ TikTok failed: ${ttMsg.slice(0, 100)}`);
      }
    } else {
      console.log('[PHASE 4] ⏭ TikTok skipped (no credentials)');
    }

    // 3) Facebook Page (Reel + Post)
    let fbReelId = '';
    let fbPostId = '';
    if (isFacebookConfigured()) {
      try {
        console.log('[PHASE 4] ▶ Publishing to Facebook Page...');

        // Build varied caption from script hook (different each video)
        const scriptHook = (scriptData as Record<string, unknown>)?.__hook as string
          || (scriptData as Record<string, unknown>)?.hook as string
          || `Check out ${toolName} — an amazing AI tool! 🔥`;

        const fbToolName = toolName || 'AI Tool';
        const reelCaption = buildReelCaption(fbToolName, scriptHook, resolvedUrl);
        const reelResult = await publishFacebookReel(finalVideoOutput, reelCaption);
        if (reelResult.success) {
          fbReelId = reelResult.videoId || '';
          this.logEntry(4, 'info', `📱 FB Reel published: ${fbReelId}`);
        }

        // Generate mini-review via Gemini (varied blog-style format)
        const scriptText = typeof (scriptData as Record<string, unknown>)?.script === 'string'
          ? ((scriptData as Record<string, unknown>).script as string).slice(0, 800)
          : `${fbToolName} is an incredible AI tool that can transform your workflow.`;

        const miniReview = await generateFbMiniReview(fbToolName, scriptText, toolUrl);
        const postDesc = buildPostDescription(fbToolName, miniReview, resolvedUrl);
        const postResult = await publishFacebookPost(finalVideoOutput, `${fbToolName} — AI Tool Review`, postDesc);
        if (postResult.success) {
          fbPostId = postResult.postId || '';
          this.logEntry(4, 'info', `📝 FB Post published: ${fbPostId}`);
        }

        console.log(`[PHASE 4] ✅ Facebook done (Reel: ${fbReelId || 'failed'}, Post: ${fbPostId || 'failed'})`);
      } catch (fbErr: unknown) {
        const fbMsg = fbErr instanceof Error ? fbErr.message : String(fbErr);
        console.error(`[PHASE 4] ❌ Facebook failed: ${fbMsg}`);
        uploadErrors.push(`Facebook: ${fbMsg}`);
        this.logEntry(4, 'error', `❌ Facebook failed: ${fbMsg.slice(0, 100)}`);
      }
    } else {
      console.log('[PHASE 4] ⏭ Facebook skipped (no credentials)');
    }

    // 4) Instagram Reel
    let igReelId = '';
    let igPermalink = '';
    if (isInstagramConfigured()) {
      try {
        console.log('[PHASE 4] ▶ Publishing to Instagram...');
        const igToolName = toolName || 'AI Tool';
        const igHook = (scriptData as Record<string, unknown>)?.__hook as string
          || (scriptData as Record<string, unknown>)?.hook as string
          || `Check out ${igToolName} — an amazing AI tool! 🔥`;

        const igCaption = buildInstagramCaption(igToolName, igHook, resolvedUrl);
        const igResult = await publishInstagramReel(finalVideoOutput, igCaption);
        if (igResult.success) {
          igReelId = igResult.mediaId || '';
          igPermalink = igResult.permalink || '';
          console.log(`[PHASE 4] ✅ Instagram Reel published: ${igPermalink || igReelId}`);
          this.logEntry(4, 'info', `📸 IG Reel published: ${igPermalink || igReelId}`);
        } else {
          console.log(`[PHASE 4] ⚠️ Instagram Reel failed: ${igResult.error}`);
          uploadErrors.push(`Instagram: ${igResult.error}`);
        }
      } catch (igErr: unknown) {
        const igMsg = igErr instanceof Error ? igErr.message : String(igErr);
        console.error(`[PHASE 4] ❌ Instagram failed: ${igMsg}`);
        uploadErrors.push(`Instagram: ${igMsg}`);
        this.logEntry(4, 'error', `❌ Instagram failed: ${igMsg.slice(0, 100)}`);
      }
    } else {
      console.log('[PHASE 4] ⏭ Instagram skipped (no credentials)');
    }

    // ── Determine final status ──────────────────────────────────────────
    // Defense-in-depth: validate URLs are real, not error placeholders
    const isValidYouTube = youtubeUrl.startsWith('https://youtu.be/') && !youtubeUrl.includes('error_');
    const isValidTikTok = tiktokUrl.startsWith('https://www.tiktok.com/');
    const hasAnyUrl = isValidYouTube || isValidTikTok;

    if (hasAnyUrl) {
      // At least one platform succeeded → PUBLISHED
      await this.cleanupTmp(jobId);
      await this.updateJob(jobId, {
        status: VideoStatus.PUBLISHED,
        youtube_title: title,
        youtube_description: desc.substring(0, 5000),
        youtube_tags: tags,
        ...(youtubeUrl ? { youtube_url: youtubeUrl } : {}),
        ...(tiktokUrl ? { tiktok_url: tiktokUrl } : {}),
        ...(uploadErrors.length > 0 ? { error_logs: `PARTIAL_UPLOAD: ${uploadErrors.join(' | ')}` } : {}),
      });

      await this.logPhaseEnd(4, 'completed');
      console.log('[DONE] Pipeline complete.');
      if (youtubeUrl) console.log(`YouTube URL: ${youtubeUrl}`);
      if (tiktokUrl) console.log(`TikTok URL: ${tiktokUrl}`);
      if (uploadErrors.length > 0) console.warn(`[PHASE 4] Partial upload — some platforms failed: ${uploadErrors.join(' | ')}`);

      await notifyDiscord({
        status: 'success',
        jobId,
        title,
        toolName: this.currentToolName || undefined,
        websiteUrl: this.currentWebsiteUrl || undefined,
        dataSource: this.currentDataSource || undefined,
        youtubeUrl: youtubeUrl || undefined,
        tiktokUrl: tiktokUrl || undefined,
        thumbnailUrl: youtubeUrl ? `https://img.youtube.com/vi/${youtubeUrl.split('v=')[1]?.split('&')[0] || youtubeUrl.split('/').pop()}/maxresdefault.jpg` : undefined,
        durationMs: Date.now() - this.pipelineStartMs,
      });

      // Daily Digest — send weekly stats summary
      try {
        const weekStats = await this.getWeeklyStats();
        await notifyDailyDigest({
          todayStatus: 'success',
          todayTitle: title,
          todayTool: this.currentToolName || undefined,
          todayDurationMs: Date.now() - this.pipelineStartMs,
          ...weekStats,
        });
      } catch (digestErr) {
        console.warn('[DIGEST] Non-fatal error:', digestErr);
      }
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
   * Tool discovery: Gemini AI Search only.
   * Google CSE was disabled (2026-04-06) — user decision.
   * Returns tool list (unpicked). pickBestTool() runs separately.
   */
  private async discoverFromAllSources(avoidTools: string[]): Promise<DiscoveredTool[]> {
    const allTools: DiscoveredTool[] = [];

    // Source 1: Gemini AI Search (primary — AI finds trending tools + affiliate detection)
    try {
      const geminiTools = await discoverViaGeminiSearch();
      allTools.push(...geminiTools);
    } catch (err) {
      console.warn('[SOURCE 1] Gemini Search failed:', (err as Error).message?.slice(0, 60));
    }

    // Source 2: Google CSE — DISABLED (returns empty [])
    // Kept for API compatibility but no longer calls external API
    const cseTools = await discoverViaGoogleCSE();
    if (cseTools.length > 0) allTools.push(...cseTools);

    console.log(`[PHASE 1] Total tools discovered: ${allTools.length}`);
    return allTools;
  }

  /**
   * Save detected affiliate program to DB if not already registered.
   * Sets active=false so dashboard shows it as "pending signup".
   */
  private async savePendingAffiliate(tool: DiscoveredTool): Promise<void> {
    try {
      const { data: existing } = await supabase
        .from('affiliate_links')
        .select('id')
        .ilike('tool_name', tool.name)
        .maybeSingle();

      if (existing) return; // Already registered (active or pending)

      await supabase.from('affiliate_links').insert([{
        tool_name: tool.name,
        affiliate_url: '',
        direct_url: tool.websiteUrl,
        commission: tool.affiliateCommission || '',
        signup_url: tool.affiliateSignupUrl || '',
        active: false,
        notes: `Gemini auto-detected (${new Date().toISOString().slice(0, 10)})`,
      }]);

      console.log(`[AFFILIATE] 📥 Saved pending affiliate: ${tool.name} (${tool.affiliateCommission || 'detected'})`);
    } catch (err) {
      console.warn('[AFFILIATE] ⚠️ Failed to save pending:', (err as Error).message?.slice(0, 60));
    }
  }

  /**
   * Check DB for which discovered tools have active referral URLs.
   * Enriches tool.hasActiveReferralUrl for smart scoring (+30 vs +10).
   */
  private async enrichAffiliateStatus(tools: DiscoveredTool[]): Promise<void> {
    const affiliateTools = tools.filter(t => t.hasAffiliate);
    if (affiliateTools.length === 0) return;

    try {
      const dbAffiliates = await loadAffiliatesFromDb();
      for (const tool of affiliateTools) {
        const match = dbAffiliates.find(
          a => a.name.toLowerCase().trim() === tool.name.toLowerCase().trim()
        );
        // Only mark as active if there's an actual referral URL (not just pending)
        tool.hasActiveReferralUrl = !!(match?.affiliateUrl);
      }
      const activeCount = affiliateTools.filter(t => t.hasActiveReferralUrl).length;
      console.log(`[AFFILIATE] 🔍 Enriched ${affiliateTools.length} affiliate tools (${activeCount} with registered URLs)`);
    } catch (err) {
      console.warn('[AFFILIATE] ⚠️ Enrichment failed (non-fatal):', (err as Error).message?.slice(0, 60));
    }
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

  /**
   * Merge per-scene SRT files into a single SRT with offset timestamps.
   * Each scene's timestamps are shifted by the cumulative duration of previous scenes.
   */
  private mergeSrtFiles(srtPaths: string[], sceneVideoPaths: string[], outputPath: string): void {
    if (srtPaths.length === 0) {
      console.log('[SRT MERGE] No SRT files to merge — skipping.');
      return;
    }

    try {
      let mergedContent = '';
      let cueIndex = 1;
      let cumulativeOffsetMs = 0;

      for (let i = 0; i < srtPaths.length; i++) {
        const srtPath = srtPaths[i];
        if (!fs.existsSync(srtPath)) continue;

        const content = fs.readFileSync(srtPath, 'utf-8');
        const blocks = content.trim().split(/\n\n+/);

        for (const block of blocks) {
          const lines = block.split('\n');
          if (lines.length < 3) continue;

          // Parse timestamp line: "00:00:01,500 --> 00:00:03,200"
          const timeMatch = lines[1].match(
            /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
          );
          if (!timeMatch) continue;

          const startMs = this.srtTimeToMs(timeMatch.slice(1, 5)) + cumulativeOffsetMs;
          const endMs = this.srtTimeToMs(timeMatch.slice(5, 9)) + cumulativeOffsetMs;
          const text = lines.slice(2).join('\n');

          mergedContent += `${cueIndex}\n`;
          mergedContent += `${this.msToSrtTime(startMs)} --> ${this.msToSrtTime(endMs)}\n`;
          mergedContent += `${text}\n\n`;
          cueIndex++;
        }

        // Get scene duration for offset calculation (approximate from video file)
        // Use the SRT's last timestamp as duration estimate
        const lastBlock = content.trim().split(/\n\n+/).pop();
        if (lastBlock) {
          const lastTimeMatch = lastBlock.split('\n')[1]?.match(
            /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
          );
          if (lastTimeMatch) {
            cumulativeOffsetMs = this.srtTimeToMs(lastTimeMatch.slice(1, 5)) + cumulativeOffsetMs;
          }
        }
      }

      if (mergedContent.trim()) {
        fs.writeFileSync(outputPath, mergedContent, 'utf-8');
        console.log(`[SRT MERGE] ✅ Merged ${srtPaths.length} SRT files → ${outputPath} (${cueIndex - 1} cues)`);
      }
    } catch (err) {
      console.warn('[SRT MERGE] ⚠️ Non-fatal error during merge:', err);
    }
  }

  private srtTimeToMs(parts: string[]): number {
    return (
      parseInt(parts[0]) * 3600000 +
      parseInt(parts[1]) * 60000 +
      parseInt(parts[2]) * 1000 +
      parseInt(parts[3])
    );
  }

  private msToSrtTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
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

  // A4: Error categorization — classify errors into actionable types
  private categorizeError(error: unknown): string {
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate')) return 'gemini_rate_limit';
    if (msg.includes('generativelanguage') || msg.includes('gemini')) return 'gemini_api';
    if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('navigation')) return 'playwright_timeout';
    if (msg.includes('ffmpeg') || msg.includes('filter') || msg.includes('reinitializing')) return 'ffmpeg';
    if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('fetch')) return 'network';
    if (msg.includes('visual_qc') || msg.includes('blank') || msg.includes('cloudflare')) return 'visual_qc';
    if (msg.includes('supabase') || msg.includes('42501') || msg.includes('rls')) return 'database';
    return 'unknown';
  }

  // A3: Pipeline run logging — create a run record
  private async createPipelineRun(triggerType: string): Promise<string | null> {
    try {
      const runId = `run_${Date.now()}`;
      const { error } = await supabase.from('pipeline_runs').insert([{
        run_id: runId,
        status: 'running',
        trigger_type: triggerType,
        started_at: new Date().toISOString(),
      }]);
      if (error) {
        console.warn('[PIPELINE RUN] Failed to create run record:', error.message);
        return null;
      }
      console.log(`[PIPELINE RUN] 📝 Created run: ${runId}`);
      return runId;
    } catch {
      return null;
    }
  }

  // A3: Pipeline run logging — update run result
  private async finishPipelineRun(status: 'completed' | 'failed', videosPublished: number, error?: unknown): Promise<void> {
    if (!this.pipelineRunId) return;
    try {
      const durationMs = Date.now() - this.pipelineStartMs;
      const errorMsg = error ? (error instanceof Error ? error.message : String(error)).slice(0, 500) : null;
      const category = error ? this.categorizeError(error) : null;
      await supabase.from('pipeline_runs').update({
        status,
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        videos_published: videosPublished,
        videos_failed: status === 'failed' ? 1 : 0,
        videos_processed: 1,
        error_message: category ? `[${category}] ${errorMsg}` : errorMsg,
      }).eq('run_id', this.pipelineRunId);
      console.log(`[PIPELINE RUN] ${status === 'completed' ? '✅' : '❌'} Run ${this.pipelineRunId} → ${status} (${(durationMs / 1000).toFixed(0)}s)`);
    } catch {
      // Non-critical — don't crash pipeline over logging
    }
  }

  // Phase-level logging for dashboard live progress
  // ── Structured log entry (buffered in memory, flushed on phase end) ──
  private logEntry(
    phase: number,
    level: 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ): void {
    const entry = { ts: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) };
    if (!this.logBuffer.has(phase)) this.logBuffer.set(phase, []);
    this.logBuffer.get(phase)!.push(entry);
  }

  private async flushLogs(phase: number): Promise<void> {
    if (!this.pipelineRunId) return;
    const entries = this.logBuffer.get(phase);
    if (!entries || entries.length === 0) return;
    try {
      await supabase.from('pipeline_phase_logs')
        .update({ logs: entries })
        .eq('run_id', this.pipelineRunId)
        .eq('phase', phase);
    } catch {
      // Non-critical
    }
    this.logBuffer.delete(phase);
  }

  private async logPhaseStart(phase: number, phaseName: string): Promise<void> {
    if (!this.pipelineRunId) return;
    try {
      await supabase.from('pipeline_phase_logs').insert([{
        run_id: this.pipelineRunId,
        phase,
        phase_name: phaseName,
        status: 'running',
        started_at: new Date().toISOString(),
      }]);
    } catch {
      // Non-critical
    }
  }

  private async logPhaseEnd(phase: number, status: 'completed' | 'failed' | 'skipped', error?: string): Promise<void> {
    if (!this.pipelineRunId) return;
    try {
      // Flush buffered logs before marking phase complete
      await this.flushLogs(phase);
      const now = new Date().toISOString();
      await supabase.from('pipeline_phase_logs')
        .update({
          status,
          finished_at: now,
          error_message: error?.slice(0, 500) ?? null,
        })
        .eq('run_id', this.pipelineRunId)
        .eq('phase', phase);
    } catch {
      // Non-critical
    }
  }

  private async failJob(jobId: string | null, error: unknown): Promise<void> {
    const errMessage = error instanceof Error ? error.message : String(error);
    const category = this.categorizeError(error);
    console.error('\n====================================================');
    console.error(`[FATAL] Pipeline crashed. Category: ${category}`);
    console.error(errMessage);
    console.error('====================================================');

    if (!jobId) return;

    try {
      await this.updateJob(jobId, { status: VideoStatus.FAILED, error_logs: `[${category}] ${errMessage}` });
      console.log(`[ERROR] Marked job ${jobId} as failed [${category}].`);
    } catch (dbErr) {
      console.error('[ERROR] Failed to write error log to database:', dbErr);
    }
  }

  /**
   * Get weekly stats for daily digest notification.
   * Queries last 7 days of published videos for views/likes aggregates.
   */
  private async getWeeklyStats(): Promise<{
    yesterdayViews?: number;
    yesterdayLikes?: number;
    weekAvgViews?: number;
    weekBestTitle?: string;
    weekBestViews?: number;
    successRate7d?: number;
  }> {
    try {
      const since = new Date();
      since.setDate(since.getDate() - 7);

      // Get published videos with views
      const { data: videos } = await supabase
        .from('video_projects')
        .select('youtube_title, views_24h, likes_24h, created_at')
        .eq('status', 'published')
        .gte('created_at', since.toISOString())
        .order('views_24h', { ascending: false, nullsFirst: false });

      // Get pipeline runs for success rate
      const { data: runs } = await supabase
        .from('pipeline_runs')
        .select('status')
        .gte('started_at', since.toISOString());

      const result: Record<string, unknown> = {};

      if (videos && videos.length > 0) {
        // Yesterday's video (most recent)
        const yesterday = videos.find(v => v.views_24h != null);
        if (yesterday) {
          result.yesterdayViews = yesterday.views_24h ?? 0;
          result.yesterdayLikes = yesterday.likes_24h ?? 0;
        }

        // Week average
        const totalViews = videos.reduce((s, v) => s + (v.views_24h ?? 0), 0);
        result.weekAvgViews = Math.round(totalViews / videos.length);

        // Best video
        const best = videos[0];
        if (best) {
          result.weekBestTitle = best.youtube_title ?? 'Unknown';
          result.weekBestViews = best.views_24h ?? 0;
        }
      }

      if (runs && runs.length > 0) {
        const success = runs.filter(r => r.status === 'completed').length;
        result.successRate7d = Math.round((success / runs.length) * 100);
      }

      return result;
    } catch {
      return {};
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

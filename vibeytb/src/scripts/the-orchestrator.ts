import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import { supabase } from '../lib/supabase/client';
import { VideoStatus, type VideoProject, type ScriptJson } from '../types/video-script';
import { generateScriptFromTrend } from '../agents/agent-2-strategist/generator';
import { generateAudioFromText } from '../agents/agent-3-producer/tts-client';
import { downloadStockVideo } from '../agents/agent-3-producer/pexels-client';
import { downloadBGMFromPixabay } from '../agents/agent-3-producer/pixabay-client';
import { recordWebsiteScroll } from '../agents/agent-3-producer/playwright-recorder';
import { mergeAudioVideoScene, concatScenes } from '../agents/agent-3-producer/media-stitcher';
import { uploadToYouTube } from '../agents/agent-4-publisher/youtube-uploader';
import { validateVideo } from './qc-video';

type Mode = 'cron' | 'worker' | 'all';

const SEED_TOPICS = [
  'secret AI tools',
  'affiliate marketing hacks',
  'coding for beginners',
  'SaaS ideas',
  'passive income digital products',
  'freelance tech tips',
  'chatgpt hidden features',
  'make money with automation',
];

const ACTIVE_STATUSES: VideoStatus[] = [
  VideoStatus.PENDING,
  VideoStatus.PROCESSING,
  VideoStatus.APPROVED_FOR_SYNTHESIS,
  VideoStatus.READY_FOR_VIDEO,
  VideoStatus.READY_FOR_UPLOAD,
];

const WORKER_STATUSES: VideoStatus[] = [
  VideoStatus.APPROVED_FOR_SYNTHESIS,
  VideoStatus.READY_FOR_VIDEO,
  VideoStatus.READY_FOR_UPLOAD,
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
  async runAutoPilot(mode: Mode = 'all') {
    console.log('====================================================');
    console.log(`[ORCHESTRATOR] STARTING PIPELINE (Mode: ${mode.toUpperCase()})`);
    console.log('====================================================\n');

    let jobId: string | null = null;

    try {
      const job = await this.getOrCreateJob(mode);
      if (!job) return;

      jobId = job.id;
      let currentStatus = job.status;

      console.log(`[ORCHESTRATOR] Job ID: ${jobId} | Status: [${currentStatus}]\n`);

      if (currentStatus === VideoStatus.PENDING || currentStatus === VideoStatus.PROCESSING) {
        await this.runPhase1And2(job);
        return;
      }

      if (currentStatus === VideoStatus.APPROVED_FOR_SYNTHESIS || currentStatus === VideoStatus.READY_FOR_VIDEO) {
        await this.runPhase3(job);
        currentStatus = VideoStatus.READY_FOR_UPLOAD;
      }

      if (currentStatus === VideoStatus.READY_FOR_UPLOAD) {
        await this.runPhase4(job);
      } else if (currentStatus === VideoStatus.PENDING_APPROVAL) {
        console.log('[ORCHESTRATOR] Job is waiting for human approval. Aborting.');
      }
    } catch (error) {
      await this.failJob(jobId, error);
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

  private async runPhase1And2(job: VideoProject): Promise<void> {
    const jobId = job.id;
    console.log('[PHASE 1] Data Mining');
    await this.updateJobStatus(jobId, VideoStatus.PROCESSING);

    const selectedTrend = this.pickSeedTopic();
    console.log(`[PHASE 1] Selected niche keyword: "${selectedTrend}"`);

    console.log('[PHASE 2] Content Strategist (AI script generation)');
    const language = (typeof job.target_language === 'string' && job.target_language.trim()) || 'en-US';
    const tone = (typeof job.tone_of_voice === 'string' && job.tone_of_voice.trim()) || 'casual';
    const aiOutput = await generateScriptFromTrend(selectedTrend, language, tone);
    const normalized = this.normalizeScript(aiOutput);

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

      let videoPath: string;
      if (scene.target_website_url) {
        try {
          console.log(`[PHASE 3] Recording website: ${scene.target_website_url}`);
          videoPath = await recordWebsiteScroll(
            scene.target_website_url,
            duration,
            path.join(tmpDir, `scene_${sceneIndex}_raw.webm`),
            scene.target_search_query || undefined
          );
        } catch (error: unknown) {
          console.log('[FALLBACK] Playwright failed, switching to stock video');
          const keywords = scene.stock_search_keywords || 'technology';
          videoPath = await downloadStockVideo(keywords, jobId, sceneIndex);
        }
      } else {
        const keywords = scene.stock_search_keywords || 'technology';
        console.log(`[PHASE 3] Downloading stock video (keywords: "${keywords}")`);
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
    console.log('[PHASE 4] Publisher (YouTube upload)');

    const meta = this.extractScriptMeta(job.script_json);
    const title = meta.title || 'Auto Generated YouTube Short';
    const desc = meta.description || 'Auto upload from orchestrator';
    const tags = meta.tags || ['shorts', 'automation', 'tech'];

    const finalVideoOutput = this.getFinalVideoPath(jobId);
    if (!(await this.fileExists(finalVideoOutput))) {
      throw new Error('Final video output missing. Phase 3 must complete before upload.');
    }

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

    console.log('[PHASE 4] QC passed. Launching browser for upload...');
    const youtubeUrl = await uploadToYouTube(jobId, finalVideoOutput, title, desc, tags, false);

    await this.cleanupTmp(jobId);
    await this.updateJob(jobId, { status: VideoStatus.PUBLISHED, youtube_url: youtubeUrl });

    console.log('[DONE] Pipeline complete.');
    console.log(`Video URL: ${youtubeUrl}`);
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

  private pickSeedTopic(): string {
    return SEED_TOPICS[Math.floor(Math.random() * SEED_TOPICS.length)];
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

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

import { recordWebsiteScroll } from '../agents/agent-3-producer/playwright-recorder';
import { mergeAudioVideoScene, concatScenes } from '../agents/agent-3-producer/media-stitcher';
import { validateVideo } from './qc-video';

const TARGET_URL = process.env.E2E_TARGET_URL || 'https://www.perplexity.ai/';
const DURATION_SEC = Number(process.env.E2E_DURATION_SEC || '40');
const SEARCH_QUERY = 'Explain quantum computing in simple terms';

const TMP_DIR = path.join(process.cwd(), 'tmp');
const TEST_VIDEO = path.join(TMP_DIR, 'test_video.mp4');
const TEST_AUDIO = path.join(TMP_DIR, 'test_audio.mp3');
const TEST_BGM = path.join(TMP_DIR, 'test_bgm.mp3');
const TEST_VTT = path.join(TMP_DIR, 'test_subs.vtt');
const SCENE_OUTPUT = path.join(TMP_DIR, 'scene_1_final.mp4');
const FINAL_OUTPUT = path.join(TMP_DIR, 'final_output.mp4');
const PROJECT_ID = 'e2e_test';

const color = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function paint(text: string, c: keyof typeof color) {
  return `${color[c]}${text}${color.reset}`;
}

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function formatVttTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

function ensureVtt(filePath: string, durationSec: number) {
  if (fs.existsSync(filePath)) return;
  const lines: string[] = ['WEBVTT', ''];
  const step = 5;
  let t = 0;
  let idx = 1;
  while (t < durationSec) {
    const start = t;
    const end = Math.min(t + step, durationSec);
    lines.push(`${formatVttTime(start)} --> ${formatVttTime(end)}`);
    lines.push(`E2E test caption line ${idx}`);
    lines.push('');
    t += step;
    idx += 1;
  }
  fs.writeFileSync(filePath, lines.join('\n'));
}

function runFfmpeg(args: string[], label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = ffmpegInstaller.path;
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} failed (exit code ${code}). ${stderr}`));
    });
  });
}

async function ensureSampleAudio(filePath: string, durationSec: number, frequency: number, label: string) {
  if (fs.existsSync(filePath)) return;

  console.log(paint(`[E2E] Creating sample audio: ${path.basename(filePath)}`, 'yellow'));
  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `sine=frequency=${frequency}:duration=${durationSec}`,
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    '-ar', '48000',
    '-ac', '2',
    filePath
  ];

  try {
    await runFfmpeg(args, label);
  } catch (err) {
    console.error(paint('[E2E] Failed to auto-generate sample audio.', 'red'));
    console.error(err instanceof Error ? err.stack : err);
    console.log(
      paint(
        `[E2E] Please place a valid MP3 at: ${filePath}`,
        'yellow'
      )
    );
    throw err;
  }
}

async function runPhase<T>(label: string, fn: () => Promise<T>): Promise<T> {
  console.time(label);
  try {
    return await fn();
  } catch (err) {
    console.error(paint(`[E2E] ${label} failed`, 'red'));
    console.error(err instanceof Error ? err.stack : err);
    throw err;
  } finally {
    console.timeEnd(label);
  }
}

async function main() {
  ensureDir(TMP_DIR);

  await ensureSampleAudio(TEST_AUDIO, DURATION_SEC, 440, 'generate-test-audio');
  await ensureSampleAudio(TEST_BGM, DURATION_SEC, 220, 'generate-test-bgm');
  ensureVtt(TEST_VTT, DURATION_SEC);

  await runPhase('Phase 1 - Record', async () => {
    console.log(paint(`[E2E] Recording from ${TARGET_URL}`, 'cyan'));
    await recordWebsiteScroll(TARGET_URL, DURATION_SEC, TEST_VIDEO, SEARCH_QUERY);
    console.log(paint(`[E2E] Record output: ${TEST_VIDEO}`, 'green'));
  });

  await runPhase('Phase 2 - Stitch', async () => {
    ensureDir(path.join(TMP_DIR, PROJECT_ID));
    if (fs.existsSync(SCENE_OUTPUT)) fs.rmSync(SCENE_OUTPUT);
    if (fs.existsSync(FINAL_OUTPUT)) fs.rmSync(FINAL_OUTPUT);

    await mergeAudioVideoScene(TEST_VIDEO, TEST_AUDIO, SCENE_OUTPUT, DURATION_SEC, TEST_VTT);
    await concatScenes([SCENE_OUTPUT], FINAL_OUTPUT, PROJECT_ID, TEST_BGM);
    console.log(paint(`[E2E] Final output: ${FINAL_OUTPUT}`, 'green'));
  });

  const qcPassed = await runPhase('Phase 3 - QC', async () => {
    return await validateVideo(FINAL_OUTPUT);
  });

  await runPhase('Phase 4 - Mock Upload', async () => {
    if (qcPassed) {
      console.log(paint('🚀 Bắn lên YouTube Shorts/TikTok thành công!', 'green'));
    } else {
      console.log(paint('❌ QC failed. Upload blocked.', 'red'));
      throw new Error('QC failed. Upload blocked.');
    }
  });
}

main().catch((err) => {
  console.error(paint('[E2E] Test run failed.', 'red'));
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});

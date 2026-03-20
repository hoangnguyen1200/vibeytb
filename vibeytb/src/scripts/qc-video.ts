import { ffmpeg } from '../utils/ffmpeg';
import fs from 'fs';
import path from 'path';

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  bit_rate?: string;
};

type ProbeFormat = {
  duration?: string;
  bit_rate?: string;
};

type ProbeData = {
  streams?: ProbeStream[];
  format?: ProbeFormat;
};

type QCResult = {
  width?: number;
  height?: number;
  durationSec?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  audioCodec?: string;
  hasAudio: boolean;
  aspectOk: boolean;
  durationOk: boolean;
  bitrateOk: boolean;
  audioOk: boolean;
};

const MBPS = 1_000_000;
const MIN_DURATION = 15;
const MAX_DURATION = 60;
const MIN_VIDEO_BITRATE = 0.2 * MBPS;
const SOFT_VIDEO_BITRATE = 2 * MBPS;

const color = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function paint(text: string, c: keyof typeof color) {
  return `${color[c]}${text}${color.reset}`;
}

function fmtMbps(value?: number): string {
  if (!value || Number.isNaN(value)) return 'unknown';
  return `${(value / MBPS).toFixed(2)} Mbps`;
}

function fmtDuration(value?: number): string {
  if (!value || Number.isNaN(value)) return 'unknown';
  return `${value.toFixed(2)}s`;
}

function fmtBool(value: boolean): string {
  return value ? paint('PASS', 'green') : paint('FAIL', 'red');
}

function probe(filePath: string): Promise<ProbeData> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err: Error | null, data: ProbeData) => {
      if (err) return reject(err);
      resolve(data || {});
    });
  });
}

function pickStream(streams: ProbeStream[] | undefined, type: string): ProbeStream | undefined {
  return (streams || []).find((s) => s.codec_type === type);
}

function parseBitrate(value?: string): number | undefined {
  if (!value) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function buildReport(result: QCResult) {
  const rows: Array<[string, string]> = [
    ['Resolution', `${result.width || 'unknown'}x${result.height || 'unknown'} (${fmtBool(result.aspectOk)})`],
    ['Duration', `${fmtDuration(result.durationSec)} (${fmtBool(result.durationOk)})`],
    ['Video Bitrate', `${fmtMbps(result.videoBitrate)} (${fmtBool(result.bitrateOk)})`],
    ['Audio', result.hasAudio ? `${result.audioCodec || 'unknown'} (${fmtBool(result.audioOk)})` : paint('missing', 'red')]
  ];

  const header = `${paint('QC VIDEO REPORT', 'cyan')}`;
  const sep = paint('---------------------------', 'gray');

  console.log(header);
  console.log(sep);
  rows.forEach(([label, value]) => {
    const padded = label.padEnd(14, ' ');
    console.log(`${padded} : ${value}`);
  });
  console.log(sep);
}

export async function validateVideo(filePath: string): Promise<boolean> {
  if (!filePath) {
    throw new Error('validateVideo: filePath is required.');
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`validateVideo: file not found at ${absPath}`);
  }

  let data: ProbeData;
  try {
    data = await probe(absPath);
  } catch (err) {
    throw new Error(`validateVideo: ffprobe failed -> ${(err as Error).message}`);
  }

  const videoStream = pickStream(data.streams, 'video');
  const audioStream = pickStream(data.streams, 'audio');

  const width = videoStream?.width;
  const height = videoStream?.height;
  const durationSec = data.format?.duration ? Number(data.format.duration) : undefined;

  const videoBitrate =
    parseBitrate(videoStream?.bit_rate) ??
    (() => {
      const formatBr = parseBitrate(data.format?.bit_rate);
      const audioBr = parseBitrate(audioStream?.bit_rate);
      if (formatBr && audioBr && formatBr > audioBr) return formatBr - audioBr;
      return formatBr;
    })();

  const audioBitrate = parseBitrate(audioStream?.bit_rate);
  const audioCodec = audioStream?.codec_name;

  const hasAudio = !!audioStream;
  const aspectOk = width === 1080 && height === 1920;
  const durationOk = typeof durationSec === 'number' && durationSec >= MIN_DURATION && durationSec <= MAX_DURATION;
  const bitrateOk = typeof videoBitrate === 'number' && videoBitrate >= MIN_VIDEO_BITRATE;
  const lowBitrateWarning =
    typeof videoBitrate === 'number' && videoBitrate >= MIN_VIDEO_BITRATE && videoBitrate < SOFT_VIDEO_BITRATE;
  const audioOk = hasAudio && audioCodec === 'aac';

  const result: QCResult = {
    width,
    height,
    durationSec,
    videoBitrate,
    audioBitrate,
    audioCodec,
    hasAudio,
    aspectOk,
    durationOk,
    bitrateOk,
    audioOk
  };

  buildReport(result);

  if (lowBitrateWarning) {
    console.log(paint('[WARNING] Low video bitrate detected (acceptable for static UI).', 'yellow'));
  }

  const errors: string[] = [];
  if (!aspectOk) errors.push('Aspect ratio must be 1080x1920 (9:16).');
  if (!durationOk) errors.push('Duration must be between 15s and 60s.');
  if (!hasAudio) errors.push('Audio stream is required.');
  if (!audioOk) errors.push('Audio codec must be AAC.');
  if (!bitrateOk) errors.push('Video bitrate must be >= 0.2 Mbps.');

  if (errors.length > 0) {
    console.log(paint('QC FAILED:', 'red'));
    errors.forEach((msg) => console.log(`- ${msg}`));
    return false;
  }

  console.log(paint('QC PASSED: Video meets all requirements.', 'green'));
  return true;
}

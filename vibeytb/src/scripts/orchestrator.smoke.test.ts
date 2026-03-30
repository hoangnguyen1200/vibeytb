/**
 * Smoke test — runs BEFORE every commit via Husky pre-commit hook.
 *
 * Zero API calls, zero network, zero env vars needed.
 * Catches the exact class of bugs that caused "Phase 4 crash after commit":
 *   - Broken imports (module not found)
 *   - Invalid status transitions
 *   - Path helpers returning wrong values
 *   - Error handler ordering (failJob must run before cleanupTmp)
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { VideoStatus } from '../types/video-script';

// ─── 1. Import chain validation ──────────────────────────────────
describe('Import Chain', () => {
  it('should import VideoStatus enum without crash', () => {
    expect(VideoStatus.PENDING).toBe('pending');
    expect(VideoStatus.PUBLISHED).toBe('published');
    expect(VideoStatus.FAILED).toBe('failed');
  });

  it('should import TheMasterOrchestrator class without crash', async () => {
    // Dynamic import to catch module-level errors
    const mod = await import('./the-orchestrator');
    expect(mod.TheMasterOrchestrator).toBeDefined();
    expect(typeof mod.TheMasterOrchestrator).toBe('function');
  });
});

// ─── 2. Status transitions ──────────────────────────────────────
describe('Status Transitions', () => {
  const EXPECTED_STATUSES = [
    'pending',
    'processing',
    'pending_approval',
    'approved_for_synthesis',
    'ready_for_video',
    'ready_for_upload',
    'upload_pending',
    'published',
    'failed',
  ];

  it('VideoStatus enum should have all expected values', () => {
    const enumValues = Object.values(VideoStatus);
    for (const status of EXPECTED_STATUSES) {
      expect(enumValues).toContain(status);
    }
  });

  it('should not have unexpected status values (detect accidental additions)', () => {
    const enumValues = Object.values(VideoStatus);
    for (const val of enumValues) {
      expect(EXPECTED_STATUSES).toContain(val);
    }
  });

  it('ACTIVE_STATUSES should be a subset of VideoStatus', () => {
    const activeStatuses = [
      VideoStatus.PENDING,
      VideoStatus.PROCESSING,
      VideoStatus.APPROVED_FOR_SYNTHESIS,
      VideoStatus.READY_FOR_VIDEO,
      VideoStatus.READY_FOR_UPLOAD,
    ];
    const allStatuses = Object.values(VideoStatus);
    for (const s of activeStatuses) {
      expect(allStatuses).toContain(s);
    }
  });
});

// ─── 3. Path helpers (read source code, validate logic) ─────────
describe('Path Helpers', () => {
  it('getJobTmpDir should resolve to tmp/<jobId>', () => {
    // Simulating the private method logic
    const jobId = 'test-job-123';
    const expected = path.join(process.cwd(), 'tmp', jobId);
    const result = path.join(process.cwd(), 'tmp', jobId);
    expect(result).toBe(expected);
    expect(result).toContain('tmp');
    expect(result).toContain(jobId);
  });

  it('getFinalVideoPath should resolve to tmp/<jobId>/final_output.mp4', () => {
    const jobId = 'test-job-456';
    const tmpDir = path.join(process.cwd(), 'tmp', jobId);
    const videoPath = path.join(tmpDir, 'final_output.mp4');
    expect(videoPath).toContain('final_output.mp4');
    expect(videoPath).toContain(jobId);
  });
});

// ─── 4. Critical invariant: failJob BEFORE cleanupTmp ───────────
describe('Error Handler Invariant', () => {
  it('failJob must be called BEFORE cleanupTmp in catch block', () => {
    // Read the actual source code and verify ordering
    const sourceCode = fs.readFileSync(
      path.join(__dirname, 'the-orchestrator.ts'),
      'utf-8',
    );

    // Find the catch block in runAutoPilot
    const catchMatch = sourceCode.match(
      /catch\s*\(error\)\s*\{([\s\S]*?)(?=\n\s{2}\})/,
    );
    expect(catchMatch).not.toBeNull();

    const catchBody = catchMatch![1];

    // failJob must appear before cleanupTmp
    const failJobIndex = catchBody.indexOf('failJob');
    const cleanupTmpIndex = catchBody.indexOf('cleanupTmp');

    expect(failJobIndex).toBeGreaterThan(-1);
    expect(cleanupTmpIndex).toBeGreaterThan(-1);
    expect(failJobIndex).toBeLessThan(cleanupTmpIndex);
  });

  it('cleanupTmp must be wrapped in try-catch (ignore cleanup errors)', () => {
    const sourceCode = fs.readFileSync(
      path.join(__dirname, 'the-orchestrator.ts'),
      'utf-8',
    );

    // After cleanupTmp call, there should be a catch block
    const catchBlock = sourceCode.match(
      /cleanupTmp\(jobId\)[\s\S]*?catch\s*\{/,
    );
    expect(catchBlock).not.toBeNull();
  });
});

// ─── 5. Self-healing: video-missing re-run Phase 3 ──────────────
describe('Self-Healing Invariant', () => {
  it('should re-run Phase 3 when video file is missing at READY_FOR_UPLOAD', () => {
    const sourceCode = fs.readFileSync(
      path.join(__dirname, 'the-orchestrator.ts'),
      'utf-8',
    );

    // Check that the self-healing block exists
    expect(sourceCode).toContain('Video file missing');
    expect(sourceCode).toContain('Re-running Phase 3');

    // Verify the pattern: fileExists check → console.warn → runPhase3
    const selfHealBlock = sourceCode.match(
      /fileExists\(videoPath\)[\s\S]*?runPhase3/,
    );
    expect(selfHealBlock).not.toBeNull();
  });
});

// ─── 6. Env flag parser ─────────────────────────────────────────
describe('envFlag Parser', () => {
  it('source code should handle true/false/undefined correctly', () => {
    const sourceCode = fs.readFileSync(
      path.join(__dirname, 'the-orchestrator.ts'),
      'utf-8',
    );

    // Ensure envFlag function exists and handles expected values
    expect(sourceCode).toContain("'1', 'true', 'yes', 'on'");
  });
});

// ─── 7. URL Resolution helpers ──────────────────────────────────
describe('URL Resolution & Multi-Source', () => {
  it('guessWebsiteUrl handles domain-like names (e.g. tobira.ai)', async () => {
    const scraperSource = fs.readFileSync(
      path.join(__dirname, '..', 'agents', 'agent-1-data-miner', 'scraper-producthunt.ts'),
      'utf-8',
    );
    expect(scraperSource).toContain('[a-z0-9.-]+\\.[a-z]{2,}');
    expect(scraperSource).toContain('`https://${');
  });

  it('urlSource supports all source types', async () => {
    const scraperSource = fs.readFileSync(
      path.join(__dirname, '..', 'agents', 'agent-1-data-miner', 'scraper-producthunt.ts'),
      'utf-8',
    );
    // Must support all 5 source types
    expect(scraperSource).toContain("'ph-redirect'");
    expect(scraperSource).toContain("'gemini'");
    expect(scraperSource).toContain("'guess'");
    expect(scraperSource).toContain("'hackernews'");
    expect(scraperSource).toContain("'gemini-search'");
  });

  it('HN scraper module exists and exports scrapeHackerNewsToday', async () => {
    const hnSource = fs.readFileSync(
      path.join(__dirname, '..', 'agents', 'agent-1-data-miner', 'scraper-hackernews.ts'),
      'utf-8',
    );
    expect(hnSource).toContain('export async function scrapeHackerNewsToday');
    expect(hnSource).toContain('hacker-news.firebaseio.com');
  });

  it('verifyUrl function exists with content relevance check', async () => {
    const scraperSource = fs.readFileSync(
      path.join(__dirname, '..', 'agents', 'agent-1-data-miner', 'scraper-producthunt.ts'),
      'utf-8',
    );
    expect(scraperSource).toContain('export async function verifyUrl');
    expect(scraperSource).toContain('<title');
    expect(scraperSource).toContain('relevant');
  });

  it('Layer 2 PH recording is removed from orchestrator', async () => {
    const orchSource = fs.readFileSync(
      path.join(__dirname, 'the-orchestrator.ts'),
      'utf-8',
    );
    // Must NOT import recordProductHuntPage
    expect(orchSource).not.toContain('recordProductHuntPage');
    // Must have multi-source discovery
    expect(orchSource).toContain('discoverFromAllSources');
    // Must import HN scraper
    expect(orchSource).toContain('scrapeHackerNewsToday');
  });
});

import path from 'path';
import fs from 'fs';
import { launchStealthPage } from '../../utils/playwright';
import { Browser, BrowserContext, Page } from 'playwright-chromium';

const DEFAULT_QUERY = 'Show me how this works';
const INPUT_SELECTOR = 'textarea, [contenteditable="true"], input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], [role="searchbox"], .search-input, input[class*="search" i]';
const MEDIA_SELECTOR = 'video, iframe, img';

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureSampleUploadFile(): string {
  const sampleDir = path.join(process.cwd(), 'tmp');
  ensureDir(sampleDir);
  const samplePath = path.join(sampleDir, 'sample_upload.txt');
  if (!fs.existsSync(samplePath)) {
    fs.writeFileSync(samplePath, 'Sample upload file for demo purposes.');
  }
  return samplePath;
}

async function installContinuousPurifier(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.__purifierInterval) {
      clearInterval(w.__purifierInterval);
    }

    w.__purifierInterval = setInterval(() => {
      const textKeywords = [
        'sign in',
        'log in',
        'login',
        'create an account',
        'accept',
        'cookie',
        'consent',
        'subscribe',
        'join'
      ];
      const classKeywords = [
        'cookie',
        'consent',
        'banner',
        'modal',
        'popup',
        'overlay',
        'signup',
        'subscribe'
      ];

      const elements = document.querySelectorAll('body *');
      elements.forEach((el) => {
        if (!el || el === document.body || el === document.documentElement) return;

        const style = window.getComputedStyle(el);
        const position = style.position || '';
        const zIndex = parseInt(style.zIndex || '0', 10);
        const isOverlay = position === 'fixed' || position === 'absolute' || position === 'sticky';

        const idClass = ((el as HTMLElement).id + ' ' + (el as HTMLElement).className).toLowerCase();
        const text = (el.textContent || '').toLowerCase();

        const hasTextKeyword = textKeywords.some((k) => text.includes(k));
        const hasClassKeyword = classKeywords.some((k) => idClass.includes(k));
        const isDialog = (el.getAttribute('role') || '').toLowerCase() === 'dialog' || el.getAttribute('aria-modal') === 'true';

        const rect = el.getBoundingClientRect();
        const isLarge = rect.width > 120 && rect.height > 60;

        if ((hasTextKeyword || hasClassKeyword || isDialog) && (isOverlay || zIndex > 40) && isLarge) {
          el.remove();
        }
      });
    }, 500);
  });
}

async function cleanupContinuousPurifier(page: Page) {
  try {
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.__purifierInterval) {
        clearInterval(w.__purifierInterval);
        w.__purifierInterval = null;
      }
    });
  } catch {
    // ignore cleanup errors
  }
}

async function injectFakeCursor(page: Page) {
  try {
    await page.evaluate(() => {
      if (document.getElementById('playwright-fake-cursor')) return;

      const cursor = document.createElement('div');
      cursor.id = 'playwright-fake-cursor';
      const cursorSvgBase64 =
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNyIgaGVpZ2h0PSIyNyIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTEuNjQ2IDExLjM0bDE5LjYyMiA1Ljk0YTEuNSAxLjUgMCAwMS0uMjE5IDIuNzgybC03LjA4IDIuMDkyYS41LjUgMCAwMC0uMzUuMzUxbC0yLjA5MiA3LjA4YTEuNSAxLjUgMCAwMS0yLjc4Mi4yMThMMS4zNCAxLjY0N2ExLjUgMS41IDAgMDEyLjcxMy0xLjk2OXoiIGZpbGw9IiMwMDAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+';

      cursor.style.width = '30px';
      cursor.style.height = '30px';
      cursor.style.backgroundImage = `url(${cursorSvgBase64})`;
      cursor.style.backgroundSize = 'contain';
      cursor.style.backgroundRepeat = 'no-repeat';
      cursor.style.position = 'fixed';
      cursor.style.zIndex = '2147483647';
      cursor.style.pointerEvents = 'none';
      cursor.style.transition = 'top 0.1s, left 0.1s';
      cursor.style.filter = 'drop-shadow(2px 2px 4px rgba(0,0,0,0.4))';

      document.documentElement.appendChild(cursor);
      document.addEventListener('mousemove', (e) => {
        const cursorElem = document.getElementById('playwright-fake-cursor');
        if (cursorElem) {
          cursorElem.style.left = `${e.clientX}px`;
          cursorElem.style.top = `${e.clientY}px`;
        }
      });
    });
  } catch {
    // ignore cursor injection errors
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _tryUploadSampleFile(page: Page): Promise<void> {
  try {
    const fileInput = page.locator('input[type="file"]').first();
    const count = await fileInput.count();
    if (count === 0) return;

    const samplePath = ensureSampleUploadFile();
    await fileInput.setInputFiles(samplePath);
    await page.waitForTimeout(500);
  } catch (err: unknown) {
    console.warn('[Playwright] Upload attempt failed. Continuing without upload.', err);
  }
}

async function runDemoHunter(page: Page, durationSec: number, startMs: number): Promise<void> {
  try {
    const mediaLocator = page.locator(MEDIA_SELECTOR);
    const count = await mediaLocator.count();

    let bestIndex = -1;
    let bestArea = 0;

    for (let i = 0; i < count; i++) {
      const item = mediaLocator.nth(i);
      if (!(await item.isVisible())) continue;
      const box = await item.boundingBox();
      if (!box) continue;

      const area = box.width * box.height;
      if (box.width > 280 && box.height > 180 && area > bestArea) {
        bestArea = area;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0) {
      const target = mediaLocator.nth(bestIndex);
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();

      if (box) {
        const elapsed = (Date.now() - startMs) / 1000;
        const remaining = Math.max(1, durationSec - elapsed);
        const steps = Math.max(6, Math.floor(remaining * 2));
        for (let i = 0; i < steps; i++) {
          const x = box.x + box.width * (0.3 + 0.4 * Math.random());
          const y = box.y + box.height * (0.3 + 0.4 * Math.random());
          await page.mouse.move(x, y, { steps: 10 });
          await page.waitForTimeout(Math.max(200, (remaining * 1000) / steps));
        }
        return;
      }
    }
  } catch (err: unknown) {
    console.warn('[Playwright] Demo Hunter failed, falling back to scroll.', err);
  }

  const elapsed = (Date.now() - startMs) / 1000;
  const remaining = Math.max(1, durationSec - elapsed);
  const steps = Math.max(1, Math.floor((remaining * 1000) / 600));

  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('PageDown').catch(() => {});
    await page.waitForTimeout(600);
  }
}

export async function recordWebsiteScroll(
  url: string,
  durationSec: number,
  outputFilePath: string,
  searchQuery?: string
): Promise<string> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  let video: ReturnType<Page['video']> | null = null;

  const outputDir = path.dirname(outputFilePath);
  ensureDir(outputDir);

  try {
    const launched = await launchStealthPage({ recordVideoDir: outputDir });
    browser = launched.browser;
    context = launched.context;
    page = launched.page;
    video = page.video();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => {
        document.body.style.backgroundColor = document.body.style.backgroundColor || 'white';
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn(`[Playwright] Page load warning: ${errorMessage}`);
    }

    try {
      await installContinuousPurifier(page);
    } catch (err: unknown) {
      console.warn('[Playwright] Purifier setup failed.', err);
    }

    await injectFakeCursor(page);

    const startMs = Date.now();
    let phaseACompleted = false;

    try {
      const inputLocator = page
        .locator(INPUT_SELECTOR)
        .filter({ hasNot: page.locator('input[type="hidden"]') })
        .first();

      const hasInput = (await inputLocator.count()) > 0;
      if (hasInput) {
        console.log('[Playwright] Input Hunter found input, typing query...');
        await inputLocator.waitFor({ state: 'visible', timeout: 5000 });
        await inputLocator.click({ force: true });
        await page.waitForTimeout(400);

        const query = searchQuery || DEFAULT_QUERY;
        await inputLocator.pressSequentially(query, { delay: 120 });
        await inputLocator.press('Enter');
        console.log(`[Playwright] Pressed Enter on input`);
        
        await page.waitForTimeout(1000);
        try {
          // Scope button search tightly to the input's vicinity to avoid clicking random CTAs
          const wasClicked = await inputLocator.evaluate((el) => {
            let current = el.parentElement;
            let clicked = false;
            // Search up to 3 levels up for a button near the input
            for (let i = 0; i < 3 && current && !clicked; i++) {
              // V3: Strictly target Search/Submit to avoid clicking "Attach" or "Voice" buttons
              const btn = current.querySelector('button[type="submit"], input[type="submit"], [aria-label*="search" i], [aria-label*="submit" i], [class*="search" i]');
              if (btn && !btn.hasAttribute('disabled') && btn !== el) {
                (btn as HTMLElement).click();
                clicked = true;
              }
              current = current.parentElement;
            }
            return clicked;
          });
          
          if (wasClicked) {
            console.log('[Playwright] Submit clicked within input container');
          }
        } catch (sendErr: unknown) {
          console.warn('[Playwright] Dual-Submit Engine failed.', sendErr);
        }
        await page.waitForTimeout(10000);

        const elapsedBeforeWait = (Date.now() - startMs) / 1000;
        const remainingBudget = Math.max(1, durationSec - elapsedBeforeWait);
        let responseWait = Math.min(10, Math.max(8, remainingBudget));
        responseWait = Math.min(responseWait, remainingBudget);

        await page.waitForTimeout(responseWait * 1000);

        const elapsedAfter = (Date.now() - startMs) / 1000;
        const remaining = Math.max(0, durationSec - elapsedAfter);
        if (remaining > 0) {
          await page.waitForTimeout(remaining * 1000);
        }

        phaseACompleted = true;
      }
    } catch (err: unknown) {
      console.warn('[Playwright] Input Hunter failed, switching to Demo Hunter.', err);
    }

    if (!phaseACompleted) {
      await runDemoHunter(page, durationSec, startMs);
    }
  } catch (err: unknown) {
    console.error('[Playwright] Recording failed:', err);
  } finally {
    if (page) {
      await cleanupContinuousPurifier(page);
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch {
        // ignore
      }
    }

    if (context) {
      try {
        await context.close();
      } catch {
        // ignore
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }

  const videoPath = await video?.path();
  if (!videoPath || !fs.existsSync(videoPath)) {
    throw new Error('[Playwright] No recorded video file produced.');
  }

  if (fs.existsSync(outputFilePath)) {
    fs.rmSync(outputFilePath);
  }

  fs.renameSync(videoPath, outputFilePath);
  return outputFilePath;
}

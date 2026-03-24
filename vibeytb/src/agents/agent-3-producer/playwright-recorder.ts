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
  const getRemaining = () => Math.max(0, durationSec - (Date.now() - startMs) / 1000);

  // Helper: safely click an element with cursor movement
  async function safeClick(selector: string, label: string): Promise<boolean> {
    try {
      const el = page.locator(selector).first();
      if ((await el.count()) === 0) return false;
      if (!(await el.isVisible())) return false;
      const box = await el.boundingBox();
      if (!box) return false;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 15 });
      await page.waitForTimeout(300);
      await el.click({ force: true, timeout: 3000 });
      console.log(`[Smart Interact] ✅ Clicked: ${label}`);
      return true;
    } catch {
      return false;
    }
  }

  // Helper: smooth scroll
  async function smoothScroll(pixels: number, stepMs: number = 80): Promise<void> {
    const steps = Math.ceil(pixels / 100);
    for (let i = 0; i < steps && getRemaining() > 1; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(stepMs);
    }
  }

  // Helper: hover over visible elements
  async function hoverElements(selector: string, maxItems: number = 3): Promise<void> {
    try {
      const items = page.locator(selector);
      const count = Math.min(await items.count(), maxItems);
      for (let i = 0; i < count && getRemaining() > 2; i++) {
        const el = items.nth(i);
        if (!(await el.isVisible())) continue;
        const box = await el.boundingBox();
        if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
        await page.waitForTimeout(600);
      }
    } catch {
      // ignore hover errors
    }
  }

  console.log(`[Smart Interact] 🧠 Starting smart interaction (${durationSec}s budget)...`);

  // === STEP 0: Quick-scroll past hero to reach actual product content ===
  if (getRemaining() > 4) {
    console.log('[Smart Interact] Step 0: Quick-skip past hero section...');
    await smoothScroll(1500, 40); // Fast scroll past hero text/CTA
    await page.waitForTimeout(500);
  }

  // === STEP 1: Hover hero section elements (trigger animations) ===
  if (getRemaining() > 3) {
    console.log('[Smart Interact] Step 1: Hovering visible elements...');
    await hoverElements('h1, h2, [class*="hero" i] button, [class*="hero" i] a, [class*="cta" i]', 3);
    await page.waitForTimeout(500);
  }

  // === STEP 2: Click a nav link (Features, Pricing, How it works) ===
  if (getRemaining() > 5) {
    console.log('[Smart Interact] Step 2: Looking for nav links...');
    const navSelectors = [
      'nav a:has-text("Gallery")', 'a:has-text("Gallery")',
      'nav a:has-text("Examples")', 'a:has-text("Examples")',
      'nav a:has-text("Showcase")', 'a:has-text("Showcase")',
      'nav a:has-text("Templates")', 'a:has-text("Templates")',
      'nav a:has-text("Demo")', 'a:has-text("Demo")',
      'nav a:has-text("Features")', 'a:has-text("Features")',
      'nav a:has-text("How it works")', 'a:has-text("How it")',
      'nav a:has-text("Use Cases")', 'a:has-text("Use Cases")',
      'nav a:has-text("Pricing")', 'a:has-text("Pricing")',
    ];
    for (const sel of navSelectors) {
      if (getRemaining() < 4) break;
      const label = sel.replace(/nav a:has-text\("|a:has-text\("|"\)/g, '');
      const clicked = await safeClick(sel, label);
      if (clicked) {
        await page.waitForTimeout(1500);
        break;
      }
    }
  }

  // === STEP 3: Smooth scroll through content ===
  if (getRemaining() > 4) {
    console.log('[Smart Interact] Step 3: Smooth scrolling through features...');
    await smoothScroll(1200, 100);
    await page.waitForTimeout(800);
  }

  // === STEP 4: Hover interactive cards/feature items ===
  if (getRemaining() > 3) {
    console.log('[Smart Interact] Step 4: Hovering feature cards...');
    await hoverElements('[class*="card" i], [class*="feature" i], [class*="benefit" i], [class*="pricing" i] > div', 3);
  }

  // === STEP 5: Click FAQ accordions ===
  if (getRemaining() > 4) {
    console.log('[Smart Interact] Step 5: Looking for FAQ...');
    const faqSelectors = [
      'details summary',
      '[class*="accordion" i] button', '[class*="accordion" i] h3',
      '[class*="faq" i] button', '[class*="faq" i] h3',
      '[data-toggle="collapse"]',
      'button[aria-expanded]',
    ];
    let faqClicked = 0;
    for (const sel of faqSelectors) {
      if (faqClicked >= 2 || getRemaining() < 2) break;
      try {
        const items = page.locator(sel);
        const count = Math.min(await items.count(), 2);
        for (let i = 0; i < count && faqClicked < 2 && getRemaining() > 2; i++) {
          const el = items.nth(i);
          if (!(await el.isVisible())) continue;
          const box = await el.boundingBox();
          if (!box) continue;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
          await page.waitForTimeout(300);
          await el.click({ force: true, timeout: 2000 });
          faqClicked++;
          console.log(`[Smart Interact] ✅ Expanded FAQ item ${faqClicked}`);
          await page.waitForTimeout(1000);
        }
      } catch {
        // skip this selector
      }
    }
  }

  // === STEP 6: Final scroll to fill remaining time ===
  const finalRemaining = getRemaining();
  if (finalRemaining > 1) {
    console.log(`[Smart Interact] Step 6: Final scroll (${finalRemaining.toFixed(1)}s remaining)...`);
    const scrollSteps = Math.max(1, Math.floor(finalRemaining / 0.7));
    for (let i = 0; i < scrollSteps && getRemaining() > 0.5; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(600);
    }
  }

  console.log('[Smart Interact] ✅ Interaction complete.');
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
    // Auto-detect saved auth cookies for this domain
    const authDir = path.join(process.cwd(), 'auth');
    let storageState: string | undefined;
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace(/^www\./, '');
      const domainFile = domain.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
      const authFile = path.join(authDir, domainFile);
      if (fs.existsSync(authFile)) {
        storageState = authFile;
        console.log(`[Auth] 🔑 Loaded saved session for ${domain}`);
      }
    } catch {
      // URL parsing error, skip auth
    }

    const launched = await launchStealthPage({ recordVideoDir: outputDir, storageState });
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

/**
 * Layer 2 Cascade: Record Product Hunt page for a given tool name.
 * Product Hunt NEVER has captcha and always shows real screenshots of the tool.
 */
export async function recordProductHuntPage(
  toolName: string,
  durationSec: number,
  outputFilePath: string
): Promise<string> {
  // Build Product Hunt URL from tool name
  const toolSlug = toolName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const phUrl = `https://www.producthunt.com/products/${toolSlug}`;
  console.log(`[Product Hunt Cascade] Recording: ${phUrl}`);

  return recordWebsiteScroll(phUrl, durationSec, outputFilePath);
}

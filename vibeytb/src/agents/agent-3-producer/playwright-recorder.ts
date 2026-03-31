import path from 'path';
import fs from 'fs';
import { launchStealthPage, RECORDING_SIZE } from '../../utils/playwright';
import { Browser, BrowserContext, Page } from 'playwright-chromium';

type InputType = 'url' | 'email' | 'search' | 'text';

const SMART_QUERIES: Record<InputType, string> = {
  url: 'https://example.com',
  email: 'demo@example.com',
  search: 'Show me how this works',
  text: 'Show me how this works',
};

function detectInputType(attrs: Record<string, string>): InputType {
  const type = (attrs.type || '').toLowerCase();
  const placeholder = (attrs.placeholder || '').toLowerCase();
  const name = (attrs.name || '').toLowerCase();
  const ariaLabel = (attrs['aria-label'] || '').toLowerCase();
  const allText = `${type} ${placeholder} ${name} ${ariaLabel}`;

  if (type === 'url' || /url|website|domain|http/.test(allText)) return 'url';
  if (type === 'email' || /email|e-mail/.test(allText)) return 'email';
  if (type === 'search' || /search|find|query/.test(allText)) return 'search';
  return 'text';
}

async function detectValidationError(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    // Check 1: aria-invalid on any input
    const invalidInputs = document.querySelectorAll('[aria-invalid="true"]');
    if (invalidInputs.length > 0) return true;

    // Check 2: Visible error messages near inputs
    const errorSelectors = [
      '.error', '.error-message', '.field-error', '.input-error',
      '.invalid-feedback', '.form-error', '.validation-error',
      '[class*="error" i]', '[class*="invalid" i]',
      '[role="alert"]',
    ];
    for (const sel of errorSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = (el as HTMLElement).innerText?.trim() || '';
        if (text.length > 5 && text.length < 200) {
          const style = window.getComputedStyle(el as HTMLElement);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return true;
          }
        }
      }
    }

    // Check 3: Native HTML5 validation
    const inputs = document.querySelectorAll('input, textarea');
    for (const input of inputs) {
      if (!(input as HTMLInputElement).checkValidity()) return true;
    }

    return false;
  });
}
const INPUT_SELECTOR = 'textarea, [contenteditable="true"], input[type="text"], input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], [role="searchbox"], .search-input, input[class*="search" i]';
const MEDIA_SELECTOR = 'video, iframe, img';

/**
 * Detect and wait for Cloudflare "Checking your browser" challenge to auto-pass.
 * On residential IP, CF challenges resolve in 5-8 seconds automatically.
 * Polls every 2s, max timeout configurable (default 15s).
 */
async function waitForCloudflarePass(page: Page, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  let cfDetected = false;

  while (Date.now() - start < timeoutMs) {
    const hasCF = await page.evaluate(() => {
      const body = document.body?.innerText?.toLowerCase() || '';
      const title = document.title?.toLowerCase() || '';
      return (
        body.includes('verify you are human') ||
        body.includes('checking your browser') ||
        body.includes('just a moment') ||
        body.includes('attention required') ||
        body.includes('enable javascript and cookies') ||
        title.includes('just a moment') ||
        !!document.querySelector('#challenge-running') ||
        !!document.querySelector('#challenge-stage') ||
        !!document.querySelector('.cf-browser-verification') ||
        !!document.querySelector('#cf-challenge-running')
      );
    }).catch(() => false);

    if (!hasCF) {
      if (cfDetected) {
        console.log('[Cloudflare] ✅ Challenge passed!');
      }
      return; // No CF or CF already passed
    }

    if (!cfDetected) {
      cfDetected = true;
      console.log('[Cloudflare] ⏳ Challenge detected, waiting for auto-pass...');
    }
    await page.waitForTimeout(2000);
  }

  if (cfDetected) {
    console.warn('[Cloudflare] ⚠️ Challenge did not pass within timeout — continuing anyway');
  }
}

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
        'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNyIgaGVpZ2h0PSIyNyIgZmlsbD0ibm9uZSI+PHBhdGggZD0iTTEuNjQ2IDExLjM0bDE5LjYyMiA1Ljk0YTEuNSAxLjUgMCAwMS0uMjE5IDIuNzgybC03LjA4IDIuMDkyYS41LjUgMCAwMC0uMzUuMzUxbC0yLjA5MiA3LjA0YTEuNSAxLjUgMCAwMS0yLjc4Mi4yMThMMS4zNCAxLjY0N2ExLjUgMS41IDAgMDEyLjcxMy0xLjk2OXoiIGZpbGw9IiMwMDAiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIyIi8+PC9zdmc+';

      cursor.style.width = '48px';
      cursor.style.height = '48px';
      cursor.style.backgroundImage = `url(${cursorSvgBase64})`;
      cursor.style.backgroundSize = 'contain';
      cursor.style.backgroundRepeat = 'no-repeat';
      cursor.style.position = 'fixed';
      cursor.style.zIndex = '2147483647';
      cursor.style.pointerEvents = 'none';
      cursor.style.transition = 'top 0.15s ease-out, left 0.15s ease-out';
      cursor.style.filter = 'drop-shadow(2px 2px 6px rgba(0,0,0,0.5))';

      document.documentElement.appendChild(cursor);
      document.addEventListener('mousemove', (e) => {
        const cursorElem = document.getElementById('playwright-fake-cursor');
        if (cursorElem) {
          cursorElem.style.left = `${e.clientX}px`;
          cursorElem.style.top = `${e.clientY}px`;
        }
      });

      // Click ripple animation — visible white circle expanding on click
      const style = document.createElement('style');
      style.textContent = `@keyframes clickRipple {
        0% { transform: scale(0.5); opacity: 1; }
        100% { transform: scale(2.5); opacity: 0; }
      }`;
      document.head.appendChild(style);

      document.addEventListener('mousedown', (e) => {
        const ripple = document.createElement('div');
        ripple.style.cssText = `
          position: fixed; left: ${e.clientX - 20}px; top: ${e.clientY - 20}px;
          width: 40px; height: 40px; border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.8);
          background: rgba(255,255,255,0.15);
          pointer-events: none; z-index: 2147483646;
          animation: clickRipple 0.5s ease-out forwards;
        `;
        document.documentElement.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
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
      await page.waitForTimeout(500);
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
        await page.waitForTimeout(1200);
      }
    } catch {
      // ignore hover errors
    }
  }

  console.log(`[Smart Interact] 🧠 Starting smart interaction (${durationSec}s budget)...`);

  // === STEP 0: Pause on hero to show brand name/UI ===
  if (getRemaining() > 3) {
    console.log('[Smart Interact] Step 0: Showing hero section (brand visible)...');
    await page.waitForTimeout(2500); // Let viewer see brand/hero
  }

  // === STEP 0.5: Smart CTA Click — try entering app page ===
  let enteredAppPage = false;
  if (getRemaining() > 6) {
    console.log('[Smart CTA] Trying to enter app page via CTA button...');
    // Scroll back to top to find CTA buttons
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);

    const ctaSelectors = [
      'a:has-text("Upload Image")', 'button:has-text("Upload Image")',
      'a:has-text("Try Free")', 'a:has-text("Try for Free")',
      'a:has-text("Start Free")', 'a:has-text("Get Started Free")',
      'a:has-text("Try it")', 'a:has-text("Try Now")',
      'button:has-text("Try Free")', 'button:has-text("Try for Free")',
      'button:has-text("Start Free")', 'button:has-text("Get Started Free")',
      'button:has-text("Try it")', 'button:has-text("Try Now")',
      'a:has-text("Start now")', 'button:has-text("Start now")',
      'a:has-text("Start Now")', 'button:has-text("Start Now")',
      'a:has-text("Get Started")', 'button:has-text("Get Started")',
      'a:has-text("Start designing")', 'button:has-text("Start designing")',
      'a:has-text("Launch App")', 'button:has-text("Launch App")',
      'a:has-text("Open App")', 'button:has-text("Open App")',
    ];

    const originalUrl = page.url();
    let ctaClicked = false;

    for (const sel of ctaSelectors) {
      if (ctaClicked) break;
      try {
        const el = page.locator(sel).first();
        if ((await el.count()) === 0) continue;
        if (!(await el.isVisible())) continue;
        const box = await el.boundingBox();
        if (!box) continue;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
        await page.waitForTimeout(300);
        await el.click({ force: true, timeout: 3000 });
        ctaClicked = true;
        console.log(`[Smart CTA] ✅ Clicked: ${sel}`);
        await page.waitForTimeout(3000);
      } catch {
        // skip this selector
      }
    }

    if (ctaClicked) {
      // Detect login/signup page by scoring signals
      const currentUrl = page.url();
      const urlIsAuth = /\/(login|signin|signup|sign-up|sign-in|register|auth)/i.test(currentUrl);

      const isLoginPage = await page.evaluate((urlFlag: boolean) => {
        const hasPasswordInput = !!document.querySelector('input[type="password"]');
        const headingText = (document.querySelector('h1, h2, h3') as HTMLElement)?.innerText || '';
        const hasLoginHeading = /\b(sign in|log in|sign up|create account|register)\b/i.test(headingText);
        const hasOAuth = !!document.querySelector(
          '[class*="google" i], [class*="github" i], [class*="oauth" i], [data-provider]'
        );
        const bodyText = document.body.innerText.toLowerCase();
        const hasContinueWith = bodyText.includes('continue with google') ||
          bodyText.includes('continue with facebook') ||
          bodyText.includes('continue with apple');
        const titleIsAuth = /\b(login|sign.?in|sign.?up|register)\b/i.test(document.title);

        let score = 0;
        if (hasPasswordInput) score += 3;
        if (hasLoginHeading) score += 3;
        if (hasOAuth) score += 2;
        if (hasContinueWith) score += 3;
        if (titleIsAuth) score += 2;
        if (urlFlag) score += 2;
        if (bodyText.includes('forgot password')) score += 1;
        if (bodyText.includes("don't have an account")) score += 1;
        return score >= 2;
      }, urlIsAuth);

      if (isLoginPage) {
        console.log('[Smart CTA] ⚠️ Login page detected → Going back');
        try {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 });
        } catch {
          await page.goto(originalUrl, { waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => {});
        }
        await page.waitForTimeout(1000);
      } else {
        console.log('[Smart CTA] 🎯 Entered app page! Recording product UI...');
        enteredAppPage = true;
        await smoothScroll(600, 80);
        await page.waitForTimeout(500);
      }
    }
  }

  // === STEP 1: Hover visible elements (trigger animations) ===
  if (getRemaining() > 3 && !enteredAppPage) {
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

    const launched = await launchStealthPage({ recordVideoDir: outputDir, recordVideoSize: RECORDING_SIZE, storageState });
    browser = launched.browser;
    context = launched.context;
    page = launched.page;
    video = page.video();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Wait for Cloudflare challenge to auto-pass (residential IP: 5-8s)
      await waitForCloudflarePass(page, 15000);
      await page.waitForTimeout(2000); // Buffer for JS render after CF pass
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
        // Step 1: Detect input type from DOM attributes
        const inputAttrs = await inputLocator.evaluate((el) => ({
          type: el.getAttribute('type') || '',
          placeholder: el.getAttribute('placeholder') || '',
          name: el.getAttribute('name') || '',
          'aria-label': el.getAttribute('aria-label') || '',
        }));
        const inputType = detectInputType(inputAttrs);
        const query = searchQuery || SMART_QUERIES[inputType];
        console.log(`[Input Hunter] Detected type: ${inputType}, query: "${query}"`);

        await inputLocator.waitFor({ state: 'visible', timeout: 5000 });
        await inputLocator.click({ force: true });
        await page.waitForTimeout(400);

        await inputLocator.pressSequentially(query, { delay: 120 });
        await inputLocator.press('Enter');
        console.log(`[Input Hunter] Pressed Enter on input`);

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
            console.log('[Input Hunter] Submit clicked within input container');
          }
        } catch (sendErr: unknown) {
          console.warn('[Input Hunter] Dual-Submit Engine failed.', sendErr);
        }

        // Step 4: Validation check — wait for error to appear then scan DOM
        await page.waitForTimeout(1500);
        const hasError = await detectValidationError(page);

        if (hasError) {
          console.warn('[Input Hunter] ⚠️ Validation error detected! Falling back to Demo Hunter.');
          // Clear input to remove error state from screen
          try {
            await inputLocator.fill('');
            await page.waitForTimeout(300);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          } catch {
            // Input may have become detached — ignore
          }
          // DO NOT set phaseACompleted — allows Demo Hunter fallback
        } else {
          console.log('[Input Hunter] ✅ No validation error — continuing recording.');
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

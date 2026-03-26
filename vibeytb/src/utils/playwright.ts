import { chromium } from 'playwright-chromium';
import type { Browser, BrowserContext, Page, LaunchOptions } from 'playwright';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Desktop viewport — websites render at full width, no mobile layout */
export const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

/** Recording resolution — matches the viewport */
export const RECORDING_SIZE = { width: 1920, height: 1080 };

/** Final 9:16 output dimensions (center-cropped in FFmpeg) */
export const CROP_OUTPUT = { width: 1080, height: 1920 };

export type StealthLaunchOptions = LaunchOptions;

export type StealthContextOptions = {
  recordVideoDir?: string;
  recordVideoSize?: { width: number; height: number };
  storageState?: string; // Path to auth/*.json for cookie injection
  locale?: string;
  timezoneId?: string;
  geolocation?: { longitude: number; latitude: number };
  permissions?: string[];
};

export async function launchStealthBrowser(options: StealthLaunchOptions = {}): Promise<Browser> {
  const launchOptions: StealthLaunchOptions = {
    headless: options.headless ?? true,
    slowMo: options.slowMo,
    args: options.args,
  };

  return chromium.launch(launchOptions);
}

export async function createStealthContext(
  browser: Browser,
  options: StealthContextOptions = {}
): Promise<BrowserContext> {
  return browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: DEFAULT_VIEWPORT,
    storageState: options.storageState,
    recordVideo: options.recordVideoDir
      ? {
          dir: options.recordVideoDir,
          size: options.recordVideoSize ?? DEFAULT_VIEWPORT,
        }
      : undefined,
    locale: options.locale,
    timezoneId: options.timezoneId,
    geolocation: options.geolocation,
    permissions: options.permissions,
  });
}

export async function launchStealthPage(
  options: StealthContextOptions & { launch?: StealthLaunchOptions } = {}
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await launchStealthBrowser(options.launch ?? {});
  const context = await createStealthContext(browser, options);
  const page = await context.newPage();
  return { browser, context, page };
}

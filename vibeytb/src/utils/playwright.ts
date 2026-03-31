import { chromium } from 'playwright-chromium';
import type { Browser, BrowserContext, Page, LaunchOptions } from 'playwright';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

/** Compact desktop viewport — full width visible in 9:16 frame, no horizontal cropping */
export const DEFAULT_VIEWPORT = { width: 1080, height: 1200 };

/** Recording resolution — matches the viewport */
export const RECORDING_SIZE = { width: 1080, height: 1200 };

/** Final 9:16 output dimensions (padded vertically in FFmpeg) */
export const CROP_OUTPUT = { width: 1080, height: 1920 };

/**
 * Chrome launch args for anti-bot evasion.
 * These disable automation-related flags that fingerprinting scripts check.
 */
const STEALTH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process,AutomationControlled',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-infobars',
  '--window-size=1080,1200',
];

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
  const userArgs = options.args ?? [];
  const mergedArgs = [...new Set([...STEALTH_ARGS, ...userArgs])];

  const launchOptions: StealthLaunchOptions = {
    headless: options.headless ?? true,
    slowMo: options.slowMo,
    args: mergedArgs,
  };

  return chromium.launch(launchOptions);
}

/**
 * Stealth init script — injected before any page JS runs.
 *
 * Covers the standard bot-detection vectors:
 *   1. navigator.webdriver → undefined
 *   2. navigator.plugins → realistic Chrome plugin list
 *   3. navigator.languages → ['en-US', 'en']
 *   4. navigator.platform → 'Win32'
 *   5. navigator.hardwareConcurrency → 8
 *   6. navigator.deviceMemory → 8
 *   7. WebGL renderer/vendor → generic ANGLE strings
 *   8. window.chrome.runtime → empty object (sites check existence)
 *   9. permissions.query('notifications') → 'denied' (not 'prompt')
 */
const STEALTH_INIT_SCRIPT = `
  // --- 1. Remove WebDriver flag ---
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
  });

  // --- 2. Realistic Chrome plugins ---
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        { name: 'Chromium PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chromium PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      ];
      plugins.length = 5;
      return plugins;
    },
  });

  // --- 3. Languages ---
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  // --- 4. Platform ---
  Object.defineProperty(navigator, 'platform', {
    get: () => 'Win32',
  });

  // --- 5. Hardware concurrency ---
  Object.defineProperty(navigator, 'hardwareConcurrency', {
    get: () => 8,
  });

  // --- 6. Device memory ---
  Object.defineProperty(navigator, 'deviceMemory', {
    get: () => 8,
  });

  // --- 7. WebGL fingerprint spoofing ---
  const getParameterOrig = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    // UNMASKED_VENDOR_WEBGL
    if (parameter === 37445) return 'Google Inc. (ANGLE)';
    // UNMASKED_RENDERER_WEBGL
    if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)';
    return getParameterOrig.call(this, parameter);
  };

  // Also cover WebGL2
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const getParameter2Orig = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return 'Google Inc. (ANGLE)';
      if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)';
      return getParameter2Orig.call(this, parameter);
    };
  }

  // --- 8. Chrome runtime mock ---
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: function() {},
      sendMessage: function() {},
    };
  }

  // --- 9. Permission query override ---
  const origQuery = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = function(params) {
    if (params.name === 'notifications') {
      return Promise.resolve({ state: 'denied', onchange: null });
    }
    return origQuery(params);
  };

  // --- 10. Canvas fingerprint noise ---
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function(type) {
    const ctx = this.getContext('2d');
    if (ctx && this.width > 16 && this.height > 16) {
      const style = ctx.fillStyle;
      ctx.fillStyle = 'rgba(0,0,1,0.003)';
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = style;
    }
    return origToDataURL.apply(this, arguments);
  };

  // --- 11. AudioContext fingerprint ---
  if (typeof AudioContext !== 'undefined') {
    const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
    AnalyserNode.prototype.getFloatFrequencyData = function(array) {
      origGetFloatFreq.call(this, array);
      for (let i = 0; i < array.length; i++) {
        array[i] += (Math.random() - 0.5) * 0.001;
      }
    };
  }

  // --- 12. chrome.csi mock (Cloudflare checks this) ---
  if (window.chrome && !window.chrome.csi) {
    window.chrome.csi = function() {
      return {
        onloadT: Date.now(),
        startE: Date.now(),
        pageT: 3947.235,
        tran: 15,
      };
    };
  }
`;

export async function createStealthContext(
  browser: Browser,
  options: StealthContextOptions = {}
): Promise<BrowserContext> {
  const context = await browser.newContext({
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

  // Inject stealth patches before any page script runs
  await context.addInitScript(STEALTH_INIT_SCRIPT);

  // Extra HTTP headers for realistic browser fingerprint (Cloudflare checks these)
  await context.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': '"Chromium";v="134", "Google Chrome";v="134", "Not.A/Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
  });

  return context;
}

export async function launchStealthPage(
  options: StealthContextOptions & { launch?: StealthLaunchOptions } = {}
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await launchStealthBrowser(options.launch ?? {});
  const context = await createStealthContext(browser, options);
  const page = await context.newPage();
  return { browser, context, page };
}

import { chromium } from 'playwright-chromium';
import Parser from 'rss-parser';

const parser = new Parser();

export interface TrendData {
  title: string;
  traffic: string;
  pubDate: string;
  newsUrl: string;
}

export interface YouTubeTrendData {
  title: string;
  url: string;
  source: string;
}

/**
 * Cào dữ liệu kịch bản 1: Google Trends Daily Searches qua RSS theo Geolocation
 */
export async function scrapeGoogleTrendsRSS(geo: string = 'US'): Promise<TrendData[]> {
  try {
    const feed = await parser.parseURL(`https://trends.google.com/trending/rss?geo=${geo}`);
    const trends: TrendData[] = feed.items.map((item: Parser.Item) => ({
      title: item.title ?? '',
      traffic: (item as Record<string, string>)['ht:approx_traffic'] ?? 'N/A',
      pubDate: item.pubDate ?? '',
      newsUrl: item.link ?? ''
    }));
    return trends;
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Lỗi khi cào RSS Google Trends:', err);
    throw new Error(`RSS Engine Failed: ${err.message}`);
  }
}

/**
 * Cào dữ liệu kịch bản 2: Dùng Playwright cào YouTube (Fallback/Mở rộng)
 */
export async function scrapeYouTubeTrends(
  locale: string = 'en-US',
  timezoneId: string = 'America/New_York',
  proxyServer?: string
): Promise<YouTubeTrendData[]> {
  const browser = await chromium.launch({
    headless: true,
    proxy: proxyServer ? { server: proxyServer } : undefined
  });

  const context = await browser.newContext({
    locale,
    timezoneId,
    geolocation: { latitude: 37.7749, longitude: -122.4194 },
    permissions: ['geolocation'],
  });

  const page = await context.newPage();

  // Chặn tải tài nguyên không cần thiết để tiết kiệm băng thông
  await page.route('**/*', (route) => {
    const requestType = route.request().resourceType();
    if (['image', 'font', 'stylesheet', 'media'].includes(requestType)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    await page.goto('https://www.youtube.com/feed/trending', {
      timeout: 15000,
      waitUntil: 'domcontentloaded'
    });

    await page.waitForSelector('#video-title', { timeout: 10000 });

    const trendingVideos = await page.$$eval('#video-title', (nodes) => {
      return nodes.slice(0, 10).map((n) => {
        const anchor = n as HTMLAnchorElement;
        return {
          title: anchor.innerText,
          url: anchor.href,
          source: 'youtube_trending'
        };
      });
    });

    return trendingVideos;
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Lỗi khi cào YouTube Trends:', err);
    throw new Error(`Playwright Timeout/Blocked: ${err.message}`);
  } finally {
    await browser.close();
  }
}
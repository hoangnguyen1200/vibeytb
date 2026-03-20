import { chromium } from 'playwright-chromium';
import Parser from 'rss-parser';

const parser = new Parser();

export interface TrendData {
  title: string;
  traffic: string;
  pubDate: string;
  newsUrl: string;
}

/**
 * Cào dữ liệu kịch bản 1: Google Trends Daily Searches qua RSS theo Geolocation
 */
export async function scrapeGoogleTrendsRSS(geo: string = 'US'): Promise<TrendData[]> {
  try {
    const feed = await parser.parseURL(`https://trends.google.com/trending/rss?geo=${geo}`);
    const trends: TrendData[] = feed.items.map((item: any) => ({
      title: item.title,
      traffic: item['ht:approx_traffic'] || 'N/A',
      pubDate: item.pubDate,
      newsUrl: item.link
    }));
    return trends;
  } catch (error: any) {
    console.error('Lỗi khi cào RSS Google Trends:', error);
    // Throw error để BullMQ ghi nhận vả tự động Retry
    throw new Error(`RSS Engine Failed: ${error.message}`);
  }
}

/**
 * Cào dữ liệu kịch bản 2: Dùng Playwright cào YouTube (Fallback/Mở rộng)
 */
export async function scrapeYouTubeTrends(locale: string = 'en-US', timezoneId: string = 'America/New_York', geo: string = 'US', proxyServer?: string): Promise<any[]> {
  // Config Playwright để đánh lừa YouTube là người dùng US auth chuẩn 
  const browser = await chromium.launch({ 
    headless: true,
    proxy: proxyServer ? { server: proxyServer } : undefined
  });
  
  const context = await browser.newContext({
    locale: locale,               // Ví dụ: 'en-US'
    timezoneId: timezoneId,       // VÍ dụ: 'America/New_York'
    geolocation: { latitude: 37.7749, longitude: -122.4194 }, // Giả lập toạ độ San Francisco
    permissions: ['geolocation'], // Cấp quyền đọc toạ độ
  });
  const page = await context.newPage();
  
  // LEAN INFRASTRUCTURE: Chặn tải tài nguyên không cần thiết
  await page.route('**/*', (route) => {
    const requestType = route.request().resourceType();
    if (['image', 'font', 'stylesheet', 'media'].includes(requestType)) {
      route.abort();
    } else {
      route.continue();
    }
  });

  try {
    // RESILIENCE: Áp đặt timeout vòng đời tuyệt đối là 15 giây
    await page.goto('https://www.youtube.com/feed/trending', { timeout: 15000, waitUntil: 'domcontentloaded' });
    
    // Chờ selector video load
    await page.waitForSelector('#video-title', { timeout: 10000 });
    
    const trendingVideos = await page.$$eval('#video-title', (nodes) => {
      return nodes.slice(0, 10).map((n: any) => ({
        title: n.innerText,
        url: n.href,
        source: 'youtube_trending'
      }));
    });
    
    return trendingVideos;
  } catch (error: any) {
    console.error('Lỗi khi cào YouTube Trends:', error);
    throw new Error(`Playwright Timeout/Blocked: ${error.message}`);
  } finally {
    // Luôn dọn dẹp biến Browser dù try hay catch
    await browser.close();
  }
}

import { scrapeGoogleTrendsRSS, scrapeYouTubeTrends } from '../agents/agent-1-data-miner/scraper';

async function testScraper() {
  console.log('--- Đang test luồng RSS Google Trends (Việt Nam) ---');
  const googleTrends = await scrapeGoogleTrendsRSS();
  console.log('Tổng số Google Trends lấy được:', googleTrends.length);
  for (let i = 0; i < Math.min(3, googleTrends.length); i++) {
    console.log(`Trend ${i + 1}: ${googleTrends[i].title} - Lượng tìm kiếm: ${googleTrends[i].traffic}`);
  }

  console.log('\n--- Đang test luồng YouTube Trending (Giao diện Mobile/Desktop qua Playwright) ---');
  const youtubeTrends = await scrapeYouTubeTrends();
  console.log('Tổng số YouTube Trends lấy được:', youtubeTrends.length);
  for (let i = 0; i < Math.min(3, youtubeTrends.length); i++) {
    console.log(`Video ${i + 1}: ${youtubeTrends[i].title} - Link: ${youtubeTrends[i].url}`);
  }
}

testScraper().catch(console.error);

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const cookiesPath = path.join(process.cwd(), 'youtube-cookies.json');

async function login() {
  console.log('🚀 Đang mở trình duyệt để đăng nhập YouTube...');
  
  const userDataDir = path.join(process.cwd(), 'tmp', 'yt-profile');
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Khởi chạy trình duyệt thật (Chrome/Edge) với Persistent Context thay vì Chromium ảo
  // và cấm flag AutomationControlled để Google không phát hiện ra bot
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'msedge', // Đổi thành 'chrome' nếu bạn muốn dùng Google Chrome
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation']
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  // Load cookies nếu đã có để check
  if (fs.existsSync(cookiesPath)) {
    console.log('🔄 Tìm thấy cookies cũ. Đang thử tải lên session...');
    const oldCookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
    await context.addCookies(oldCookies);
  }

  await page.goto('https://studio.youtube.com');
  
  if (page.url().includes('studio.youtube.com/channel')) {
    console.log('✅ Đã đăng nhập vào YouTube Studio từ session cũ! Thử làm mới session của bạn.');
  } else {
    console.log('⏳ Vui lòng đăng nhập vào tài khoản Google của bạn trên trình duyệt vừa mở.');
    console.log('⏳ Quá trình này diễn ra thủ công. Chú ý: Hãy check vào mục ghi nhớ đăng nhập (Stay signed in).');
    console.log('⏳ Tool đang đợi bạn vào được trang Dashboard của YouTube Studio...');
    
    // Đợi người dùng nhập xong và bị redirect vào YouTube Studio Dashboard có chứa /channel/ trong URL
    await page.waitForURL('**/studio.youtube.com/channel/*', { timeout: 0 }); 
    console.log('✅ Đã phát hiện đăng nhập thành công!');
  }

  // Đợi UI load xong (Thay vì networkidle rất dễ bị timeout do YouTube web socket chạy ngầm liên tục)
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(5000); // Đợi thêm chút thời gian để cookie/session được set hoàn tất
  const cookies = await context.cookies();
  
  fs.writeFileSync(cookiesPath, JSON.stringify(cookies, null, 2));
  console.log(`💾 Đã lưu session cookies tại: ${cookiesPath}`);
  
  console.log(`🛑 Tự động đóng trình duyệt sau 3 giây...`);
  await page.waitForTimeout(3000);
  await context.close();
  console.log(`🎉 [SUCCESS] THE COOKIE MANAGER - Hoàn tất!`);
}

login().catch((err) => {
    console.error(`❌ [THE COOKIE MANAGER] Lỗi xảy ra:`, err);
    process.exit(1);
});

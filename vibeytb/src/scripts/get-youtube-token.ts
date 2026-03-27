import 'dotenv/config';
import { google } from 'googleapis';
import * as http from 'http';

const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}`;

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
  prompt: 'consent'
});

console.log('\n===========================================');
console.log('📋 COPY URL NÀY VÀ MỞ TRONG TRÌNH DUYỆT:');
console.log('===========================================');
console.log(authUrl);
console.log('===========================================\n');
console.log('⏳ Đang chờ callback từ Google...\n');

// Start local server to receive the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>❌ Không tìm thấy code. Vui lòng thử lại.</h1>');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>✅ Thành công! Bạn có thể đóng tab này.</h1><p>Quay lại terminal để lấy refresh token.</p>');

    console.log('\n===========================================');
    console.log('✅ REFRESH TOKEN MỚI:');
    console.log(tokens.refresh_token);
    console.log('===========================================\n');
    console.log('👉 Cập nhật GOOGLE_REFRESH_TOKEN trong:');
    console.log('   1. File .env (local)');
    console.log('   2. GitHub Actions Secrets (remote)');
  } catch (err: any) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>❌ Lỗi: ${err.message}</h1>`);
    console.error('❌ Lỗi lấy token:', err.message);
  } finally {
    server.close();
    setTimeout(() => process.exit(0), 1000);
  }
});

server.listen(PORT, () => {
  console.log(`🔗 Server callback đang chờ tại http://localhost:${PORT}`);
});

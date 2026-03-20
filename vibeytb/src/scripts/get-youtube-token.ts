import 'dotenv/config';
import { google } from 'googleapis';
import * as readline from 'readline';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'urn:ietf:wg:oauth:2.0:oob'
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
  prompt: 'consent'
});

console.log('\n===========================================');
console.log('Mở URL này trong trình duyệt:');
console.log(authUrl);
console.log('===========================================\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Paste code từ Google vào đây: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('\n===========================================');
  console.log('REFRESH TOKEN CỦA BẠN:');
  console.log(tokens.refresh_token);
  console.log('===========================================\n');
  console.log('Lưu refresh token này vào .env với tên GOOGLE_REFRESH_TOKEN');
  rl.close();
  process.exit(0);
});

/**
 * TikTok OAuth2 Token Generator (v2)
 * 
 * Usage: npx tsx src/scripts/tiktok-auth.ts
 */

import 'dotenv/config';
import { exec } from 'child_process';
import readline from 'readline';

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const REDIRECT_URI = 'https://hoangnguyen1200.github.io/vibeytb/callback.html';

if (!CLIENT_KEY || !CLIENT_SECRET) {
  console.error('❌ Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET in .env');
  process.exit(1);
}

// Build URL manually — TikTok is picky about URL encoding
const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${CLIENT_KEY}&response_type=code&scope=user.info.basic,video.publish,video.upload&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=vibeytb_${Date.now()}`;

console.log('═══════════════════════════════════════════════════');
console.log('🎵 TikTok OAuth2 Token Generator');
console.log('═══════════════════════════════════════════════════\n');

console.log('📋 Auth URL (open if browser does not auto-open):\n');
console.log(authUrl);
console.log('');

// Open browser (Windows)
exec(`start "" "${authUrl}"`, (err) => {
  if (err) console.log('⚠️  Could not auto-open browser.');
});

console.log('📋 Steps:');
console.log('   1. Authorize in browser');
console.log('   2. Copy the code shown on the callback page');
console.log('   3. Paste it below\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('🔑 Paste the authorization code here: ', async (code) => {
  rl.close();
  const trimmedCode = code.trim();
  if (!trimmedCode) { console.error('❌ No code.'); process.exit(1); }

  console.log('\n🔄 Exchanging code for tokens...\n');

  try {
    const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: CLIENT_KEY!,
        client_secret: CLIENT_SECRET!,
        code: trimmedCode,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    });

    const body = await res.json();

    if (body.error_description || (body.error && body.error !== 'ok')) {
      console.error('❌ Token exchange failed:');
      console.error(JSON.stringify(body, null, 2));
      process.exit(1);
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ SUCCESS!');
    console.log('═══════════════════════════════════════════════════\n');
    console.log(`TIKTOK_REFRESH_TOKEN=${body.refresh_token}\n`);
    console.log(`# Access Token: ${body.access_token?.slice(0, 20)}...`);
    console.log(`# Open ID: ${body.open_id}`);
    console.log(`# Expires: ${body.expires_in}s | Refresh expires: ${body.refresh_expires_in}s`);
    console.log('\n→ Add TIKTOK_REFRESH_TOKEN to .env + GitHub Secrets\n');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
  process.exit(0);
});

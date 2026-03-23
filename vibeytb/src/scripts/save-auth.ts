/**
 * save-auth.ts — Interactive Login Tool
 *
 * Mở browser THẬT (có giao diện), bạn login thủ công vào website AI.
 * Sau khi login xong, nhấn Enter → cookies được lưu vào auth/{domain}.json
 * Pipeline sẽ tự động dùng cookies này để bypass login wall.
 *
 * Usage:
 *   npx tsx src/scripts/save-auth.ts gamma.app
 *   npx tsx src/scripts/save-auth.ts notion.so
 *   npx tsx src/scripts/save-auth.ts perplexity.ai
 */

import { chromium } from 'playwright-chromium';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const AUTH_DIR = path.join(process.cwd(), 'auth');

function ensureAuthDir() {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }
}

function domainToFilename(domain: string): string {
  return domain.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.json';
}

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
}

async function saveAuth(domain: string) {
  ensureAuthDir();

  const url = domain.startsWith('http') ? domain : `https://${domain}`;
  const authFile = path.join(AUTH_DIR, domainToFilename(domain));

  console.log('====================================================');
  console.log(`[SAVE AUTH] Opening browser for: ${url}`);
  console.log('====================================================\n');
  console.log('👉 Browser sẽ mở ra. Hãy:');
  console.log('   1. Login vào website bình thường');
  console.log('   2. Đợi trang load xong sau khi đăng nhập');
  console.log('   3. Quay lại terminal và nhấn ENTER\n');

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-maximized'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    console.warn('[WARN] Page load timeout, nhưng vẫn tiếp tục...');
  }

  await waitForEnter('✅ Đã login xong? Nhấn ENTER để lưu cookies... ');

  // Save storage state (cookies + localStorage)
  await context.storageState({ path: authFile });

  console.log(`\n✅ Cookies đã lưu vào: ${authFile}`);
  console.log(`📅 Session thường hết hạn sau 7-30 ngày.`);
  console.log(`🔄 Khi hết hạn, chạy lại: npx tsx src/scripts/save-auth.ts ${domain}\n`);

  await browser.close();
}

// Main
const domain = process.argv[2];
if (!domain) {
  console.log('Usage: npx tsx src/scripts/save-auth.ts <domain>');
  console.log('Example: npx tsx src/scripts/save-auth.ts gamma.app');
  console.log('\nSaved auth files:');

  ensureAuthDir();
  const files = fs.readdirSync(AUTH_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) {
    console.log('  (no saved sessions)');
  } else {
    for (const f of files) {
      const stat = fs.statSync(path.join(AUTH_DIR, f));
      const daysSince = Math.floor((Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24));
      const status = daysSince > 14 ? '⚠️ Có thể hết hạn' : '✅ Còn hiệu lực';
      console.log(`  ${f} — ${status} (${daysSince} ngày trước)`);
    }
  }
  process.exit(0);
}

saveAuth(domain).catch(console.error);

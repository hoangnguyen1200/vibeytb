/**
 * Facebook Token Exchange Script
 * Exchanges short-lived token from Graph API Explorer for long-lived Page Token.
 *
 * Usage: npx tsx src/scripts/fb-token-exchange.ts
 *
 * Steps:
 * 1. Get short-lived User Token from Graph API Explorer
 * 2. This script exchanges it for long-lived User Token (60 days)
 * 3. Then fetches long-lived Page Token (never expires)
 * 4. Prints the Page Token → copy to .env
 */
import 'dotenv/config';

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const SHORT_LIVED_TOKEN = process.argv[2]; // Pass as CLI argument

async function main() {
  if (!FB_APP_ID || !FB_APP_SECRET) {
    console.error('❌ Missing FB_APP_ID or FB_APP_SECRET in .env');
    process.exit(1);
  }

  if (!SHORT_LIVED_TOKEN) {
    console.error('❌ Pass your short-lived token as argument:');
    console.error('   npx tsx src/scripts/fb-token-exchange.ts YOUR_TOKEN_HERE');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════════════');
  console.log('  FACEBOOK TOKEN EXCHANGE');
  console.log('═══════════════════════════════════════════════════\n');

  // Step 1: Exchange for long-lived User Token
  console.log('📤 Step 1: Exchanging for long-lived User Token...');
  const llRes = await fetch(
    `https://graph.facebook.com/v25.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${FB_APP_ID}` +
      `&client_secret=${FB_APP_SECRET}` +
      `&fb_exchange_token=${SHORT_LIVED_TOKEN}`
  );

  if (!llRes.ok) {
    const err = await llRes.json();
    console.error('❌ Token exchange failed:', JSON.stringify(err, null, 2));
    process.exit(1);
  }

  const { access_token: longLivedUserToken } = await llRes.json() as { access_token: string };
  console.log('✅ Long-lived User Token obtained');

  // Step 2: Get Page Access Token (never expires when derived from long-lived user token)
  console.log('📤 Step 2: Fetching Page Access Token...');
  const pageRes = await fetch(
    `https://graph.facebook.com/v25.0/me/accounts?access_token=${longLivedUserToken}`
  );

  if (!pageRes.ok) {
    const err = await pageRes.json();
    console.error('❌ Page token fetch failed:', JSON.stringify(err, null, 2));
    process.exit(1);
  }

  const pageData = await pageRes.json() as { data: Array<{ id: string; name: string; access_token: string }> };
  const page = pageData.data?.find(p => p.id === FB_PAGE_ID);

  if (!page) {
    console.error(`❌ Page ${FB_PAGE_ID} not found. Available pages:`);
    pageData.data?.forEach(p => console.log(`   - ${p.name} (${p.id})`));
    process.exit(1);
  }

  console.log(`✅ Page: ${page.name} (${page.id})`);
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  YOUR LONG-LIVED PAGE TOKEN (never expires):');
  console.log('═══════════════════════════════════════════════════\n');
  console.log(page.access_token);
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Copy the token above and add to .env:');
  console.log('  FB_PAGE_ACCESS_TOKEN="<paste here>"');
  console.log('═══════════════════════════════════════════════════');

  // Verify token
  console.log('\n🔍 Verifying token...');
  const debugRes = await fetch(
    `https://graph.facebook.com/v25.0/debug_token?input_token=${page.access_token}&access_token=${FB_APP_ID}|${FB_APP_SECRET}`
  );
  const debugData = await debugRes.json() as { data: { expires_at: number; is_valid: boolean; scopes: string[] } };

  if (debugData.data?.is_valid) {
    const expires = debugData.data.expires_at === 0
      ? 'Never ♾️'
      : new Date(debugData.data.expires_at * 1000).toISOString();
    console.log(`✅ Token valid | Expires: ${expires}`);
    console.log(`📋 Scopes: ${debugData.data.scopes?.join(', ')}`);
  } else {
    console.warn('⚠️ Token may not be valid — verify manually');
  }
}

main().catch(console.error);

import 'dotenv/config';

async function main() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  const igId = process.env.IG_BUSINESS_ACCOUNT_ID;

  console.log('═══════════════════════════════════════════════════');
  console.log('  FB/IG TOKEN VERIFICATION');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Facebook Page check
  console.log('📘 Facebook Page...');
  const fbRes = await fetch(
    `https://graph.facebook.com/v25.0/${pageId}?fields=name,id&access_token=${token}`
  );
  const fbData = await fbRes.json() as any;
  if (fbData.error) {
    console.log(`  ❌ FAIL: ${fbData.error.message}`);
  } else {
    console.log(`  ✅ OK: ${fbData.name} (${fbData.id})`);
  }

  // 2. Facebook post check (dry — just check if we CAN post)
  console.log('\n📝 Facebook Post permission...');
  const postRes = await fetch(
    `https://graph.facebook.com/v25.0/${pageId}/feed?access_token=${token}&limit=1`
  );
  const postData = await postRes.json() as any;
  if (postData.error) {
    console.log(`  ❌ FAIL: ${postData.error.message}`);
  } else {
    console.log(`  ✅ OK: Can read feed (${postData.data?.length ?? 0} posts)`);
  }

  // 3. Instagram check
  console.log('\n📸 Instagram Business Account...');
  if (!igId) {
    console.log('  ⚠️ SKIP: IG_BUSINESS_ACCOUNT_ID not set in .env');
  } else {
    const igRes = await fetch(
      `https://graph.facebook.com/v25.0/${igId}?fields=username,id&access_token=${token}`
    );
    const igData = await igRes.json() as any;
    if (igData.error) {
      console.log(`  ❌ FAIL: ${igData.error.message}`);
    } else {
      console.log(`  ✅ OK: @${igData.username} (${igData.id})`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  DONE');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);

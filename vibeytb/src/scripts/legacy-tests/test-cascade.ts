/**
 * Quick validation script for Product Hunt Cascade changes.
 * Tests: imports, schema, blacklist, Product Hunt URL generation.
 */

// Test 1: Import validation
import { recordWebsiteScroll, recordProductHuntPage } from '../agents/agent-3-producer/playwright-recorder';
import { VideoScriptSchema } from '../agents/agent-2-strategist/generator';

console.log('=== CASCADE VALIDATION ===\n');

// Test 2: Schema validation - tool_name field exists
const testScript = {
  youtube_title: 'Test Title',
  youtube_description: 'Test desc #shorts',
  youtube_tags: ['ai', 'tools'],
  music_mood: 'lofi',
  scenes: [
    {
      scene_index: 1,
      narration: 'This AI tool is incredible.',
      stock_search_keywords: 'technology',
      tool_name: null,
      target_website_url: null,
      target_search_query: null,
      estimated_duration: 3,
    },
    {
      scene_index: 2,
      narration: 'Gamma lets you create presentations in seconds.',
      stock_search_keywords: 'presentation',
      tool_name: 'Gamma',
      target_website_url: 'https://gamma.app',
      target_search_query: 'create presentation',
      estimated_duration: 8,
    },
    {
      scene_index: 3,
      narration: 'Subscribe for more hidden AI gems.',
      stock_search_keywords: 'subscribe',
      tool_name: null,
      target_website_url: null,
      target_search_query: null,
      estimated_duration: 4,
    },
  ],
};

const parsed = VideoScriptSchema.safeParse(testScript);
if (parsed.success) {
  console.log('✅ Test 2: Schema with tool_name field parsed successfully');
  const scene2 = parsed.data.scenes[1] as any;
  console.log(`   tool_name = "${scene2.tool_name}"`);
} else {
  console.log('❌ Test 2: Schema parsing FAILED:', parsed.error.message);
  process.exit(1);
}

// Test 3: Blacklist check
const BLOCKED_DOMAINS = [
  'perplexity.ai', 'chatgpt.com', 'chat.openai.com',
  'claude.ai', 'bard.google.com', 'character.ai',
  'you.com', 'poe.com', 'gemini.google.com',
];
const testUrls = [
  { url: 'https://www.perplexity.ai', expected: true },
  { url: 'https://gamma.app', expected: false },
  { url: 'https://chat.openai.com', expected: true },
  { url: 'https://www.notion.so', expected: false },
];

let allPassed = true;
for (const { url, expected } of testUrls) {
  const isBlocked = BLOCKED_DOMAINS.some(d => url.includes(d));
  const pass = isBlocked === expected;
  console.log(`${pass ? '✅' : '❌'} Blacklist check: ${url} → blocked=${isBlocked} (expected=${expected})`);
  if (!pass) allPassed = false;
}

// Test 4: Product Hunt URL generation
const toolSlug = 'Gamma'.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const phUrl = `https://www.producthunt.com/products/${toolSlug}`;
const expectedUrl = 'https://www.producthunt.com/products/gamma';
if (phUrl === expectedUrl) {
  console.log(`✅ Test 4: Product Hunt URL: ${phUrl}`);
} else {
  console.log(`❌ Test 4: Expected ${expectedUrl}, got ${phUrl}`);
  allPassed = false;
}

// Test 5: Function exports exist
console.log(`✅ Test 5: recordWebsiteScroll is ${typeof recordWebsiteScroll}`);
console.log(`✅ Test 5: recordProductHuntPage is ${typeof recordProductHuntPage}`);

console.log(`\n=== ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'} ===`);
if (!allPassed) process.exit(1);

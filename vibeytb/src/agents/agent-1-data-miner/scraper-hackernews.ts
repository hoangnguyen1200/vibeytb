/**
 * Hacker News Data Source — Fetch "Show HN" posts with AI/tech filter.
 *
 * Strategy: Use HN Firebase API (free, no auth, no Cloudflare).
 * URLs are included directly in the data — no resolution needed.
 *
 * API: https://hacker-news.firebaseio.com/v0/
 */

import type { ProductHuntTool } from './scraper-producthunt';

const HN_API = 'https://hacker-news.firebaseio.com/v0';

/** Keywords that indicate AI/tech/SaaS products */
const TECH_KEYWORDS = [
  'ai', 'llm', 'gpt', 'ml', 'machine learning', 'deep learning',
  'tool', 'app', 'saas', 'api', 'automation', 'agent',
  'chatbot', 'copilot', 'assistant', 'dashboard', 'analytics',
  'dev', 'code', 'editor', 'ide', 'database', 'deploy',
  'open source', 'oss', 'cli', 'sdk', 'framework',
  'pdf', 'video', 'image', 'audio', 'speech', 'voice',
  'search', 'scraper', 'crawler', 'browser', 'extension',
  'monitor', 'alert', 'log', 'debug', 'test',
  'startup', 'launch', 'product', 'platform',
];

interface HNItem {
  id: number;
  title: string;
  url?: string;
  by: string;
  score: number;
  time: number;
  type: string;
}

/**
 * Check if a "Show HN" title indicates an AI/tech product.
 * The title format is usually: "Show HN: ProductName – description"
 */
function isTechProduct(title: string): boolean {
  const lower = title.toLowerCase();
  return TECH_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * Parse "Show HN: Name – description" into name + tagline.
 * Examples:
 *   "Show HN: BreezePDF – Free, in-browser PDF editor"
 *   → { name: "BreezePDF", tagline: "Free, in-browser PDF editor" }
 */
function parseShowHNTitle(title: string): { name: string; tagline: string } {
  // Remove "Show HN: " prefix
  const cleaned = title.replace(/^Show HN:\s*/i, '');

  // Split by common separators: – — - :
  const separators = [' – ', ' — ', ' - ', ': '];
  for (const sep of separators) {
    const idx = cleaned.indexOf(sep);
    if (idx > 0) {
      return {
        name: cleaned.slice(0, idx).trim(),
        tagline: cleaned.slice(idx + sep.length).trim(),
      };
    }
  }

  // No separator found — use full title as name
  return { name: cleaned.trim(), tagline: cleaned.trim() };
}

/**
 * Fetch today's "Show HN" posts and filter for AI/tech products.
 * Returns tools in the same format as ProductHuntTool for easy merging.
 */
export async function scrapeHackerNewsToday(): Promise<ProductHuntTool[]> {
  try {
    console.log('[HN Scraper] 🔍 Fetching Show HN posts...');

    // 1. Get Show HN story IDs (returns ~30-50 IDs)
    const idsRes = await fetch(`${HN_API}/showstories.json`);
    if (!idsRes.ok) {
      console.warn(`[HN Scraper] API returned ${idsRes.status}`);
      return [];
    }
    const allIds: number[] = await idsRes.json();

    // 2. Fetch details for top 30 stories (parallel, fast)
    const top30 = allIds.slice(0, 30);
    const items: HNItem[] = await Promise.all(
      top30.map(async (id) => {
        try {
          const res = await fetch(`${HN_API}/item/${id}.json`);
          return res.ok ? await res.json() : null;
        } catch {
          return null;
        }
      })
    ).then(results => results.filter((item): item is HNItem =>
      item !== null && item.type === 'story' && !!item.url
    ));

    console.log(`[HN Scraper] Fetched ${items.length} Show HN posts with URLs`);

    // 3. Filter for AI/tech products
    const techTools: ProductHuntTool[] = [];
    for (const item of items) {
      if (!isTechProduct(item.title)) continue;
      if (!item.url) continue;

      const { name, tagline } = parseShowHNTitle(item.title);

      techTools.push({
        name,
        tagline,
        websiteUrl: item.url,
        urlSource: 'hackernews',
        topics: [],
        productHuntUrl: `https://news.ycombinator.com/item?id=${item.id}`,
        redirectUrl: undefined,
      });
    }

    console.log(`[HN Scraper] ✅ ${techTools.length}/${items.length} tech/AI products`);

    // Log top 5 for debugging
    for (const tool of techTools.slice(0, 5)) {
      console.log(`  → ${tool.name} — ${tool.tagline.slice(0, 50)}`);
    }

    return techTools;
  } catch (err) {
    console.warn('[HN Scraper] Failed:', (err as Error).message?.slice(0, 80));
    return [];
  }
}

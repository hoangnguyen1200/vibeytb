/**
 * Product Hunt Data Source — Fetch today's top AI/Tech product launches.
 *
 * Strategy: Use Product Hunt's public RSS feed (no API key needed).
 * The RSS `content` field contains:
 *   - First <p>: the product tagline
 *   - Second <p>: Discussion link + official website redirect (/r/p/<id>)
 *
 * Feed URL: https://www.producthunt.com/feed
 */
import Parser from 'rss-parser';

const rssParser = new Parser();

export interface ProductHuntTool {
  name: string;
  tagline: string;
  websiteUrl: string;
  topics: string[];
  productHuntUrl: string;
}

// AI/Tech topic keywords to filter relevant products
const TECH_KEYWORDS = [
  'ai', 'artificial intelligence', 'machine learning', 'developer',
  'productivity', 'saas', 'automation', 'design', 'no-code',
  'marketing', 'analytics', 'writing', 'coding', 'devops',
  'chatbot', 'api', 'data', 'cloud', 'open source',
  'workflow', 'tech', 'software', 'tool', 'app',
  'generator', 'assistant', 'platform', 'builder',
];

/**
 * Extract tagline from RSS content (first <p> tag).
 */
function extractTagline(content: string): string {
  // First <p> tag contains the tagline
  const match = content.match(/<p>\s*(.*?)\s*<\/p>/);
  if (match?.[1]) {
    return match[1].replace(/<[^>]*>/g, '').trim();
  }
  return '';
}

/**
 * Extract the PH redirect URL (/r/p/<id>) from RSS content.
 * This redirects to the product's official website.
 */
function extractRedirectUrl(content: string): string | null {
  const match = content.match(/href="(https:\/\/www\.producthunt\.com\/r\/p\/[^"]+)"/);
  return match?.[1] || null;
}

/**
 * Build a best-guess website URL from the product name.
 * Handles common patterns: "Tool.ai", "ToolAI", "Tool 2.0", etc.
 */
function guessWebsiteUrl(name: string): string {
  // If name is already a domain (e.g., "opencutai.video", "tobira.ai")
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(name.trim())) {
    return `https://${name.trim().toLowerCase()}`;
  }

  // Strip version numbers, special chars
  const cleaned = name
    .replace(/\s*\d+\.\d+.*$/, '')  // Remove "2.0", "v3"
    .replace(/[^a-zA-Z0-9]/g, '')   // Keep only alphanum
    .toLowerCase();

  return `https://${cleaned}.com`;
}

/**
 * Fetch today's Product Hunt launches via RSS feed.
 * Returns AI/Tech products sorted by position in feed (top = most popular).
 */
export async function scrapeProductHuntToday(): Promise<ProductHuntTool[]> {
  console.log('[PH Scraper] 🔍 Fetching today\'s launches via RSS feed...');

  try {
    const feed = await rssParser.parseURL('https://www.producthunt.com/feed');
    console.log(`[PH Scraper] RSS returned ${feed.items.length} items`);

    const tools: ProductHuntTool[] = [];

    for (const item of feed.items) {
      const name = item.title?.trim() || '';
      if (!name) continue;

      const rawContent = item.content || '';

      // Extract real tagline from first <p> tag
      const tagline = extractTagline(rawContent);

      // Extract PH redirect URL (leads to actual website)
      const redirectUrl = extractRedirectUrl(rawContent);

      // Website URL: use redirect if available, otherwise guess from name
      const websiteUrl = redirectUrl || guessWebsiteUrl(name);

      const productHuntUrl = item.link || '';

      tools.push({
        name,
        tagline: tagline.slice(0, 200),
        websiteUrl,
        topics: [],
        productHuntUrl,
      });
    }

    // Filter for tech/AI relevance
    const filtered = tools.filter((p) => {
      const text = `${p.name} ${p.tagline}`.toLowerCase();
      return TECH_KEYWORDS.some(kw => text.includes(kw));
    });

    console.log(`[PH Scraper] ✅ ${filtered.length}/${tools.length} tech/AI products`);
    for (const p of filtered.slice(0, 5)) {
      console.log(`  → ${p.name} — ${p.tagline.slice(0, 60)}`);
      console.log(`    🔗 ${p.websiteUrl}`);
    }

    return filtered;
  } catch (err) {
    console.error('[PH Scraper] ❌ RSS feed failed:', err);
    return [];
  }
}

/**
 * Pick the best tool from today's PH launches, avoiding recently used ones.
 * Returns null if no suitable tool found.
 */
export function pickBestTool(
  tools: ProductHuntTool[],
  avoidNames: string[]
): ProductHuntTool | null {
  const avoidLower = avoidNames.map(n => n.toLowerCase().trim());

  for (const tool of tools) {
    const nameLower = tool.name.toLowerCase().trim();
    if (avoidLower.some(avoid => nameLower.includes(avoid) || avoid.includes(nameLower))) {
      console.log(`[PH Picker] Skipping "${tool.name}" (recently used)`);
      continue;
    }
    console.log(`[PH Picker] 🎯 Selected: "${tool.name}" — ${tool.tagline.slice(0, 50)}`);
    return tool;
  }

  return null;
}

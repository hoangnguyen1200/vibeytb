/**
 * Product Hunt Data Source — Fetch today's top AI/Tech product launches.
 *
 * Strategy: Use Product Hunt's public RSS feed (no API key needed).
 * The RSS `content` field contains:
 *   - First <p>: the product tagline
 *   - Second <p>: Discussion link + official website redirect (/r/p/<id>)
 *
 * The redirect URL is followed via HTTP to resolve the actual website URL.
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
  const match = content.match(/<p>\s*(.*?)\s*<\/p>/);
  if (match?.[1]) {
    return match[1].replace(/<[^>]*>/g, '').trim();
  }
  return '';
}

/**
 * Extract the PH redirect URL (/r/p/<id>) from RSS content.
 * This redirect leads to the product's official website.
 */
function extractRedirectUrl(content: string): string | null {
  const match = content.match(/href="(https:\/\/www\.producthunt\.com\/r\/p\/[^"]+)"/);
  return match?.[1] || null;
}

/**
 * Follow a PH redirect URL to resolve the actual destination website.
 * Uses HTTP HEAD with redirect: 'manual' to read the Location header
 * without actually visiting the target (fast, no browser needed).
 */
async function resolveRedirectUrl(phRedirectUrl: string): Promise<string | null> {
  try {
    // fetch with redirect: 'manual' stops at the 301/302 and gives us Location
    const resp = await fetch(phRedirectUrl, {
      method: 'HEAD',
      redirect: 'manual',
    });

    const location = resp.headers.get('location');
    if (location && !location.includes('producthunt.com')) {
      // Clean tracking params
      try {
        const url = new URL(location);
        // Remove common tracking params
        ['ref', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(p => url.searchParams.delete(p));
        const clean = url.toString().replace(/\/$/, '');
        return clean;
      } catch {
        return location;
      }
    }

    // If Location still points to PH, try GET with follow
    if (location?.includes('producthunt.com')) {
      const resp2 = await fetch(location, { method: 'HEAD', redirect: 'manual' });
      const loc2 = resp2.headers.get('location');
      if (loc2 && !loc2.includes('producthunt.com')) {
        try {
          const url = new URL(loc2);
          ['ref', 'utm_source', 'utm_medium', 'utm_campaign'].forEach(p => url.searchParams.delete(p));
          return url.toString().replace(/\/$/, '');
        } catch {
          return loc2;
        }
      }
    }

    return null;
  } catch (err) {
    console.warn(`  ⚠️ Redirect resolution failed for ${phRedirectUrl}:`, (err as Error).message);
    return null;
  }
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
 * Returns AI/Tech products with REAL website URLs (resolved via redirects).
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
      const tagline = extractTagline(rawContent);
      const redirectUrl = extractRedirectUrl(rawContent);
      const productHuntUrl = item.link || '';

      // Store redirect URL temporarily — will resolve after filtering
      tools.push({
        name,
        tagline: tagline.slice(0, 200),
        websiteUrl: redirectUrl || '', // Temporary — resolved below
        topics: [],
        productHuntUrl,
      });
    }

    // Filter for tech/AI relevance FIRST (before resolving URLs to save time)
    const filtered = tools.filter((p) => {
      const text = `${p.name} ${p.tagline}`.toLowerCase();
      return TECH_KEYWORDS.some(kw => text.includes(kw));
    });

    console.log(`[PH Scraper] ✅ ${filtered.length}/${tools.length} tech/AI products`);

    // Resolve actual website URLs for top 5 (the ones most likely to be picked)
    console.log(`[PH Scraper] 🔗 Resolving website URLs for top ${Math.min(5, filtered.length)} products...`);
    for (const tool of filtered.slice(0, 5)) {
      if (tool.websiteUrl && tool.websiteUrl.includes('producthunt.com/r/p/')) {
        const resolved = await resolveRedirectUrl(tool.websiteUrl);
        if (resolved) {
          console.log(`  ✅ ${tool.name} → ${resolved}`);
          tool.websiteUrl = resolved;
        } else {
          // Fallback: guess from name
          tool.websiteUrl = guessWebsiteUrl(tool.name);
          console.log(`  🔄 ${tool.name} → ${tool.websiteUrl} (guessed)`);
        }
      } else if (!tool.websiteUrl) {
        tool.websiteUrl = guessWebsiteUrl(tool.name);
        console.log(`  🔄 ${tool.name} → ${tool.websiteUrl} (guessed)`);
      }
    }

    // Resolve remaining tools (lazy — only guess URL, don't HTTP resolve)
    for (const tool of filtered.slice(5)) {
      if (!tool.websiteUrl || tool.websiteUrl.includes('producthunt.com')) {
        tool.websiteUrl = guessWebsiteUrl(tool.name);
      }
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

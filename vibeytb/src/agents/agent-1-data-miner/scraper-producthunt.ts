/**
 * Product Hunt Data Source — Fetch today's top AI/Tech product launches.
 *
 * Strategy: Use Product Hunt's public RSS feed (no API key needed).
 * URL Resolution Chain:
 *   1. Gemini LLM lookup (uses existing API key, 1 query/day)
 *   2. URL guessing from product name (fallback)
 *
 * Feed URL: https://www.producthunt.com/feed
 */
import 'dotenv/config';
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
 */
function extractRedirectUrl(content: string): string | null {
  const match = content.match(/href="(https:\/\/www\.producthunt\.com\/r\/p\/[^"]+)"/);
  return match?.[1] || null;
}

/**
 * Use Gemini to find the official website URL for a product.
 * This is more accurate than guessing because Gemini has web knowledge.
 * Only called for the TOP selected tool (1 API call per pipeline run).
 */
async function resolveUrlViaGemini(name: string, tagline: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `What is the OFFICIAL website URL for the product "${name}"?
Description: "${tagline}"
It was recently launched on Product Hunt.

Rules:
- Respond with ONLY the URL, nothing else
- Must be the actual product website, NOT producthunt.com
- If the product name contains a domain (like "jared.so"), use that
- If unsure, respond with exactly: UNKNOWN

Example response: https://teamprompt.ai`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Validate the response is a URL
    if (text === 'UNKNOWN' || !text.startsWith('http')) {
      return null;
    }

    // Clean the URL
    try {
      const url = new URL(text);
      // Don't accept PH or generic URLs
      if (url.hostname.includes('producthunt.com') || url.hostname === 'example.com') {
        return null;
      }
      return url.origin; // Clean URL without path/params
    } catch {
      return null;
    }
  } catch (err) {
    console.warn(`  ⚠️ Gemini URL lookup failed:`, (err as Error).message?.slice(0, 80));
    return null;
  }
}

/**
 * Build a best-guess website URL from the product name.
 * Handles common patterns: "Tool.ai", "ToolAI", "Tool 2.0", etc.
 */
function guessWebsiteUrl(name: string): string {
  // If name is already a domain (e.g., "jared.so", "tobira.ai")
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
      const tagline = extractTagline(rawContent);
      const productHuntUrl = item.link || '';
      // Keep redirect URL as metadata but don't use as websiteUrl
      extractRedirectUrl(rawContent);

      tools.push({
        name,
        tagline: tagline.slice(0, 200),
        websiteUrl: '', // Will be resolved after filtering
        topics: [],
        productHuntUrl,
      });
    }

    // Filter for tech/AI relevance FIRST (before URL resolution)
    const filtered = tools.filter((p) => {
      const text = `${p.name} ${p.tagline}`.toLowerCase();
      return TECH_KEYWORDS.some(kw => text.includes(kw));
    });

    console.log(`[PH Scraper] ✅ ${filtered.length}/${tools.length} tech/AI products`);

    // Log top 5 for debugging
    for (const p of filtered.slice(0, 5)) {
      console.log(`  → ${p.name} — ${p.tagline.slice(0, 60)}`);
    }

    // Set fallback URLs for all tools (guessed from name)
    for (const tool of filtered) {
      tool.websiteUrl = guessWebsiteUrl(tool.name);
    }

    return filtered;
  } catch (err) {
    console.error('[PH Scraper] ❌ RSS feed failed:', err);
    return [];
  }
}

/**
 * Pick the best tool from today's PH launches, avoiding recently used ones.
 * Also resolves the REAL website URL via Gemini for the selected tool.
 * Returns null if no suitable tool found.
 */
export async function pickBestTool(
  tools: ProductHuntTool[],
  avoidNames: string[]
): Promise<ProductHuntTool | null> {
  const avoidLower = avoidNames.map(n => n.toLowerCase().trim());

  for (const tool of tools) {
    const nameLower = tool.name.toLowerCase().trim();
    if (avoidLower.some(avoid => nameLower.includes(avoid) || avoid.includes(nameLower))) {
      console.log(`[PH Picker] Skipping "${tool.name}" (recently used)`);
      continue;
    }

    console.log(`[PH Picker] 🎯 Selected: "${tool.name}" — ${tool.tagline.slice(0, 50)}`);

    // Resolve real URL via Gemini (only for the chosen tool — 1 API call)
    console.log(`[PH Picker] 🔗 Resolving real URL via Gemini...`);
    const realUrl = await resolveUrlViaGemini(tool.name, tool.tagline);
    if (realUrl) {
      console.log(`[PH Picker] ✅ Gemini found: ${realUrl}`);
      tool.websiteUrl = realUrl;
    } else {
      console.log(`[PH Picker] 🔄 Gemini failed, using guess: ${tool.websiteUrl}`);
    }

    return tool;
  }

  return null;
}

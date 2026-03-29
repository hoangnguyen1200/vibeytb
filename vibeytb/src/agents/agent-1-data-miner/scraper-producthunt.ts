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
import { launchStealthPage } from '../../utils/playwright';

const rssParser = new Parser();

export interface ProductHuntTool {
  name: string;
  tagline: string;
  websiteUrl: string;
  urlSource: 'ph-redirect' | 'ph-scrape' | 'gemini' | 'guess';
  topics: string[];
  productHuntUrl: string;
  redirectUrl?: string; // PH /r/p/<id> redirect link from RSS (302 → real website)
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
 * Plan A (NEW): Follow PH redirect URL from RSS feed → actual website.
 * PH redirect URLs (e.g. /r/p/1107440) do a 302 redirect to the real product site.
 * Uses native fetch with redirect: 'manual' — NO browser, NO Cloudflare issue.
 */
async function resolveUrlViaPHRedirect(redirectUrl: string): Promise<string | null> {
  if (!redirectUrl) return null;

  try {
    console.log(`  🔗 [Plan A] Following PH redirect: ${redirectUrl}`);
    // fetch with redirect: 'manual' to capture the 302 Location header
    const response = await fetch(redirectUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      },
    });

    const location = response.headers.get('location');
    if (location && !location.includes('producthunt.com')) {
      const parsed = new URL(location);
      console.log(`  ✅ [Plan A] Redirect resolved: ${parsed.origin}`);
      return parsed.origin;
    }

    // If 302 didn't give us a non-PH URL, try following the full redirect chain
    const followResponse = await fetch(redirectUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      },
    });
    const finalUrl = followResponse.url;
    if (finalUrl && !finalUrl.includes('producthunt.com')) {
      const parsed = new URL(finalUrl);
      console.log(`  ✅ [Plan A] Follow-redirect resolved: ${parsed.origin}`);
      return parsed.origin;
    }

    console.log(`  ⚠️ [Plan A] Redirect did not lead to external URL`);
    return null;
  } catch (err) {
    console.warn(`  ⚠️ [Plan A] Redirect follow failed:`, (err as Error).message?.slice(0, 80));
    return null;
  }
}

/**
 * Plan A: Visit PH product page and scrape the "Visit website" link.
 * This gives us the REAL, verified URL directly from Product Hunt.
 * Timeout: 15s max. Uses stealth browser to bypass Cloudflare.
 */
async function resolveUrlViaPHPage(productHuntUrl: string): Promise<string | null> {
  if (!productHuntUrl) return null;

  let browser;
  try {
    console.log(`  🔗 [Plan A] Visiting PH page: ${productHuntUrl}`);
    const result = await launchStealthPage({ launch: { headless: true } });
    browser = result.browser;
    const page = result.page;

    // Navigate with 15s timeout
    await page.goto(productHuntUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Wait briefly for dynamic content to render
    await page.waitForTimeout(2000);

    // Strategy 1: Find redirect links (PH uses /r/p/<id> redirects to actual site)
    const redirectLink = await page.evaluate(() => {
      // PH redirect links contain /r/p/ and point to the actual product
      const links = Array.from(document.querySelectorAll('a[href*="/r/"]'));
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        // Match /r/p/<id> pattern (product redirect) — skip /r/u/ (user redirect)
        if (href.includes('/r/p/') || href.match(/\/r\/[a-zA-Z0-9]+$/)) {
          return href.startsWith('http') ? href : `https://www.producthunt.com${href}`;
        }
      }
      return null;
    });

    // Strategy 2: Look for "Visit website", "Get it", or external link buttons
    const externalLink = await page.evaluate(() => {
      const selectors = [
        'a[href^="http"]:not([href*="producthunt.com"])',
      ];
      // Look for links with text like "Visit", "Get it", "Website"
      const allLinks = Array.from(document.querySelectorAll('a[href^="http"]'));
      for (const link of allLinks) {
        const href = link.getAttribute('href') || '';
        const text = (link.textContent || '').toLowerCase();
        if (
          !href.includes('producthunt.com') &&
          !href.includes('twitter.com') &&
          !href.includes('x.com') &&
          !href.includes('github.com') &&
          (text.includes('visit') || text.includes('get it') || text.includes('website'))
        ) {
          return href;
        }
      }
      return null;
    });

    // If we got a redirect link, follow it to get the final URL
    if (redirectLink) {
      try {
        const redirectPage = await result.context.newPage();
        const response = await redirectPage.goto(redirectLink, {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        });
        const finalUrl = redirectPage.url();
        await redirectPage.close();

        // Validate: not PH, not empty
        const parsed = new URL(finalUrl);
        if (!parsed.hostname.includes('producthunt.com')) {
          console.log(`  ✅ [Plan A] Found via redirect: ${parsed.origin}`);
          return parsed.origin;
        }
      } catch {
        // Redirect follow failed, continue to next strategy
      }
    }

    // Use the external link if found
    if (externalLink) {
      try {
        const parsed = new URL(externalLink);
        console.log(`  ✅ [Plan A] Found via external link: ${parsed.origin}`);
        return parsed.origin;
      } catch {
        // Invalid URL, skip
      }
    }

    console.log(`  ⚠️ [Plan A] No website link found on PH page`);
    return null;
  } catch (err) {
    console.warn(`  ⚠️ [Plan A] PH page scrape failed:`, (err as Error).message?.slice(0, 80));
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

/**
 * Plan B: Use Gemini to find the official website URL for a product.
 * This is more accurate than guessing because Gemini has web knowledge.
 * Only called for the TOP selected tool (1 API call per pipeline run).
 */
async function resolveUrlViaGemini(name: string, tagline: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Enable Google Search grounding — lets Gemini search the web before answering
    // Without this, Gemini only guesses from training data (often wrong for new products)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} } as any],
    });

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

    // Log grounding status for debugging
    const grounding = (result.response as any).candidates?.[0]?.groundingMetadata;
    if (grounding?.webSearchQueries?.length) {
      console.log(`  🔍 [Gemini] Grounded via search: "${grounding.webSearchQueries.join('", "')}"`);
    }

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
      const redirectUrl = extractRedirectUrl(rawContent) || undefined;

      tools.push({
        name,
        tagline: tagline.slice(0, 200),
        websiteUrl: '', // Will be resolved after filtering
        urlSource: 'guess',
        topics: [],
        productHuntUrl,
        redirectUrl,
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
      tool.urlSource = 'guess';
    }

    return filtered;
  } catch (err) {
    console.error('[PH Scraper] ❌ RSS feed failed:', err);
    return [];
  }
}

/**
 * Pick the best tool from today's PH launches, avoiding recently used ones.
 * Also resolves the REAL website URL via a 4-tier fallback chain.
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

    // === 4-Tier URL Resolution Chain ===

    // Plan A: Follow PH redirect URL from RSS feed (fastest, no browser, no Cloudflare)
    if (tool.redirectUrl) {
      console.log(`[PH Picker] 🔗 Plan A: Following RSS redirect URL...`);
      const redirected = await resolveUrlViaPHRedirect(tool.redirectUrl);
      if (redirected) {
        tool.websiteUrl = redirected;
        tool.urlSource = 'ph-redirect';
        console.log(`[PH Picker] ✅ Plan A success: ${redirected}`);
        return tool;
      }
    }

    // Plan A-bis: Scrape "Visit website" from PH page (often blocked by Cloudflare)
    if (tool.productHuntUrl) {
      console.log(`[PH Picker] 🔗 Plan A-bis: Scraping URL from PH page...`);
      const phUrl = await resolveUrlViaPHPage(tool.productHuntUrl);
      if (phUrl) {
        tool.websiteUrl = phUrl;
        tool.urlSource = 'ph-scrape';
        console.log(`[PH Picker] ✅ Plan A-bis success: ${phUrl}`);
        return tool;
      }
    }

    // Plan B: Gemini LLM lookup with Google Search grounding
    console.log(`[PH Picker] 🔗 Plan B: Resolving URL via Gemini...`);
    const realUrl = await resolveUrlViaGemini(tool.name, tool.tagline);
    if (realUrl) {
      console.log(`[PH Picker] ✅ Plan B success: ${realUrl}`);
      tool.websiteUrl = realUrl;
      tool.urlSource = 'gemini';
    } else {
      // Plan C: guessWebsiteUrl already set as default
      console.log(`[PH Picker] 🔄 Plan B failed, using Plan C (guess): ${tool.websiteUrl}`);
      tool.urlSource = 'guess';
    }

    return tool;
  }

  return null;
}

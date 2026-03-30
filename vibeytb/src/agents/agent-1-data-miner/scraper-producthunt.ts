/**
 * Product Hunt Data Source — Fetch today's top AI/Tech product launches.
 *
 * Strategy: Use Product Hunt's public RSS feed (no API key needed).
 * URL Resolution Chain:
 *   1. PH redirect URL from RSS (/r/p/<id>) — follow HTTP redirect
 *   2. Gemini LLM lookup with Google Search grounding
 *   3. URL guessing from product name (fallback)
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
  urlSource: 'ph-redirect' | 'gemini' | 'guess' | 'hackernews' | 'gemini-search';
  topics: string[];
  productHuntUrl: string;
  redirectUrl?: string; // PH /r/p/<id> redirect link from RSS (302 → real website)
  popularityScore?: number; // HN upvotes, PH feed position, etc.
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
 * Verify a URL is alive AND belongs to the correct product.
 * Layer 1: HTTP check — site responds (200-399, or 403/503 = CF but exists)
 * Layer 2: Content relevance — page title/meta contains the tool name
 */
export async function verifyUrl(
  url: string,
  toolName: string,
): Promise<{ alive: boolean; relevant: boolean; reason: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);

    // Layer 1: HTTP check
    const status = res.status;
    if (status === 404) {
      return { alive: false, relevant: false, reason: `HTTP 404 — page not found` };
    }
    if (status >= 500 && status !== 503) {
      return { alive: false, relevant: false, reason: `HTTP ${status} — server error` };
    }

    // Status 200-399 or 403/503 (Cloudflare) = site exists
    const alive = true;

    // Layer 2: Content relevance — check <title> and <meta description>
    const html = await res.text().catch(() => '');
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i);
    const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i);

    const pageTitle = (titleMatch?.[1] || '').toLowerCase();
    const metaDesc = (metaMatch?.[1] || '').toLowerCase();
    const ogTitle = (ogMatch?.[1] || '').toLowerCase();
    const allContent = `${pageTitle} ${metaDesc} ${ogTitle}`;

    // Normalize tool name for matching (e.g. "GuideYou" → "guideyou")
    const nameWords = toolName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const relevant = nameWords.some(word => allContent.includes(word));

    if (!relevant && allContent.length > 0) {
      console.log(`  ⚠️ [Verify] Page title: "${pageTitle.slice(0, 60)}" — no match for "${toolName}"`);
    }

    return {
      alive,
      relevant: relevant || allContent.length === 0, // If no content (CF block), assume relevant
      reason: relevant ? 'content matches tool name' : `title/meta does not mention "${toolName}"`,
    };
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('abort')) {
      return { alive: false, relevant: false, reason: 'timeout (8s)' };
    }
    return { alive: false, relevant: false, reason: msg.slice(0, 60) };
  }
}

/**
 * Source 3: Use Gemini + Google Search to discover AI tools launched today.
 * Returns tools with URLs already resolved (no need for Plan A/B/C).
 * Costs 1 API call.
 */
export async function discoverViaGeminiSearch(): Promise<ProductHuntTool[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];

  try {
    console.log('[Gemini Search] 🔍 Discovering AI tools launched today...');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} } as any],
    });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const prompt = `Search for AI tools or SaaS products that were launched or announced today (${today}).

For each tool found, provide:
- Name
- One-line description
- Official website URL

Respond in this exact JSON format (array of objects):
[{"name": "ToolName", "tagline": "Short description", "url": "https://example.com"}]

Rules:
- Only include tools with a real website URL (not producthunt.com, twitter.com, github.com)
- Maximum 5 tools
- If you cannot find any tools launched today, respond with: []
- Respond with ONLY the JSON array, no other text`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (!jsonMatch) {
      console.log('[Gemini Search] No tools found or invalid response');
      return [];
    }

    const parsed: Array<{ name: string; tagline: string; url: string }> = JSON.parse(jsonMatch[0]);
    const tools: ProductHuntTool[] = parsed
      .filter(t => t.name && t.url && t.url.startsWith('http'))
      .map(t => ({
        name: t.name,
        tagline: t.tagline || '',
        websiteUrl: t.url,
        urlSource: 'gemini-search' as const,
        topics: [],
        productHuntUrl: '',
        redirectUrl: undefined,
      }));

    console.log(`[Gemini Search] ✅ Found ${tools.length} AI tools`);
    for (const tool of tools) {
      console.log(`  → ${tool.name} — ${tool.tagline.slice(0, 50)}`);
    }

    return tools;
  } catch (err) {
    console.warn('[Gemini Search] Failed:', (err as Error).message?.slice(0, 80));
    return [];
  }
}


/**
 * Plan B: Use Gemini + Google Search grounding to find the official website URL.
 * Strategy: Give Gemini the PH page URL so it can find the website from Google's
 * cached version of the PH page (bypasses Cloudflare since Google already indexed it).
 * Only called for the TOP selected tool (1 API call per pipeline run).
 */
async function resolveUrlViaGemini(
  name: string,
  tagline: string,
  productHuntUrl?: string,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} } as any],
    });

    // Build context-rich prompt with the EXACT PH URL
    const phContext = productHuntUrl
      ? `\nProduct Hunt page: ${productHuntUrl}`
      : '';

    const prompt = `Find the OFFICIAL website URL for this product.

Product: "${name}" — ${tagline}${phContext}

Instructions:
- Search Google for: ${productHuntUrl || `"${name}" "${tagline.split(' ').slice(0, 5).join(' ')}"`}
- On the Product Hunt page, the website URL is shown in "Company Info" sidebar or "Visit website" button
- Respond with ONLY the URL, nothing else
- Do NOT respond with producthunt.com, twitter.com, github.com, or linkedin.com links
- If the product name IS a domain (e.g. "bna.dev", "jared.so"), respond: https://[that domain]
- If you cannot find the website, respond exactly: UNKNOWN`;

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

    // Set fallback URLs and popularity scores for all tools
    for (let i = 0; i < filtered.length; i++) {
      filtered[i].websiteUrl = guessWebsiteUrl(filtered[i].name);
      filtered[i].urlSource = 'guess';
      // PH popularity = feed position (top = most popular on PH today)
      // Max 50 points for #1, decreasing linearly
      filtered[i].popularityScore = Math.max(0, 50 - i * 2);
    }

    return filtered;
  } catch (err) {
    console.error('[PH Scraper] ❌ RSS feed failed:', err);
    return [];
  }
}

// ─── Scoring keywords for video-friendly content ───
const VIDEO_BOOST_KEYWORDS = [
  'ai', 'automation', 'generate', 'build', 'create', 'launch',
  'free', 'open source', 'no-code', 'workflow', 'agent',
];

/**
 * Calculate a selection score for a tool.
 * Higher = better candidate for a YouTube video.
 *
 * Scoring breakdown:
 *   URL reliability:  +40 if URL is pre-resolved (HN/Gemini-search)
 *   Popularity:       0-30 normalized from popularityScore
 *   Tagline quality:  0-15 based on description length
 *   Name quality:     0-10 based on memorability (short = better)
 *   Video keywords:   +5 if tagline contains video-friendly terms
 */
function scoreTool(tool: ProductHuntTool): number {
  let score = 0;

  // 1. URL reliability — pre-resolved URLs are much more reliable
  const hasPreResolvedUrl = tool.urlSource === 'hackernews' || tool.urlSource === 'gemini-search';
  if (hasPreResolvedUrl) score += 40;

  // 2. Popularity — normalized to 0-30
  const rawPop = tool.popularityScore ?? 0;
  score += Math.min(30, Math.round(rawPop * 0.3));

  // 3. Tagline quality — longer descriptions = better video narration
  const tagLen = (tool.tagline || '').length;
  if (tagLen >= 40) score += 15;
  else if (tagLen >= 25) score += 10;
  else if (tagLen >= 15) score += 5;

  // 4. Name quality — short memorable names are better for video
  const nameLen = tool.name.length;
  if (nameLen <= 12) score += 10;
  else if (nameLen <= 20) score += 5;

  // 5. Video-friendly keywords — tools that sound exciting
  const tagLower = (tool.tagline || '').toLowerCase();
  if (VIDEO_BOOST_KEYWORDS.some(kw => tagLower.includes(kw))) score += 5;

  return score;
}

/**
 * Pick the best tool from a merged list using multi-criteria scoring.
 *
 * Strategy:
 *   1. Filter out recently used tools
 *   2. Score all remaining tools
 *   3. Sort by score (highest first)
 *   4. Try each tool: resolve URL (PH only) → verify → return first valid
 *
 * Returns null if no suitable tool found.
 */
export async function pickBestTool(
  tools: ProductHuntTool[],
  avoidNames: string[]
): Promise<ProductHuntTool | null> {
  const avoidLower = avoidNames.map(n => n.toLowerCase().trim());

  // Step 1: Filter out recently used tools
  const candidates = tools.filter(tool => {
    const nameLower = tool.name.toLowerCase().trim();
    const isUsed = avoidLower.some(avoid => nameLower.includes(avoid) || avoid.includes(nameLower));
    if (isUsed) console.log(`[Picker] Skipping "${tool.name}" (recently used)`);
    return !isUsed;
  });

  if (candidates.length === 0) return null;

  // Step 2: Score and sort (highest score first)
  const scored = candidates.map(tool => ({ tool, score: scoreTool(tool) }));
  scored.sort((a, b) => b.score - a.score);

  // Log top 5 candidates with scores
  console.log(`[Picker] 📊 Top candidates (${candidates.length} total):`);
  for (const { tool, score } of scored.slice(0, 5)) {
    const urlTag = tool.urlSource === 'hackernews' || tool.urlSource === 'gemini-search' ? '🔗' : '🔄';
    console.log(`  ${urlTag} [${score}pts] ${tool.name} — ${tool.tagline.slice(0, 45)} (${tool.urlSource})`);
  }

  // Step 3: Try each candidate in score order
  for (const { tool, score } of scored) {
    console.log(`[Picker] 🎯 Trying: "${tool.name}" (${score}pts, source: ${tool.urlSource})`);

    // HN/Gemini-search tools already have URLs — skip resolution
    if (tool.urlSource !== 'hackernews' && tool.urlSource !== 'gemini-search') {
      // === URL Resolution Chain (PH tools only) ===

      // Plan A: Follow PH redirect URL from RSS feed
      if (tool.redirectUrl) {
        console.log(`[Picker] 🔗 Plan A: Following RSS redirect URL...`);
        const redirected = await resolveUrlViaPHRedirect(tool.redirectUrl);
        if (redirected) {
          tool.websiteUrl = redirected;
          tool.urlSource = 'ph-redirect';
          console.log(`[Picker] ✅ Plan A success: ${redirected}`);
        }
      }

      // Plan B: Gemini LLM lookup (if Plan A failed)
      if (tool.urlSource !== 'ph-redirect') {
        console.log(`[Picker] 🔗 Plan B: Resolving URL via Gemini...`);
        const realUrl = await resolveUrlViaGemini(tool.name, tool.tagline, tool.productHuntUrl);
        if (realUrl) {
          console.log(`[Picker] ✅ Plan B success: ${realUrl}`);
          tool.websiteUrl = realUrl;
          tool.urlSource = 'gemini';
        } else {
          console.log(`[Picker] 🔄 Plan B failed, using Plan C (guess): ${tool.websiteUrl}`);
          tool.urlSource = 'guess';
        }
      }
    }

    // === URL Verification (all sources) ===
    console.log(`[Picker] 🔍 Verifying URL: ${tool.websiteUrl}`);
    const verification = await verifyUrl(tool.websiteUrl, tool.name);

    if (!verification.alive) {
      console.log(`[Picker] ❌ URL dead: ${verification.reason} → trying next tool`);
      continue;
    }

    if (!verification.relevant) {
      console.log(`[Picker] ⚠️ URL alive but WRONG site: ${verification.reason} → trying next tool`);
      continue;
    }

    console.log(`[Picker] ✅ Winner: "${tool.name}" (${score}pts) — URL verified`);
    return tool;
  }

  return null;
}

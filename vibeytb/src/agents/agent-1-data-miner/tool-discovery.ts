/**
 * AI Tool Discovery Module
 *
 * Primary source for finding trending AI tools:
 *   - Gemini AI Search — uses Google Search grounding to find new tools
 *   - Google CSE — DISABLED (2026-04-06, user decision)
 *
 * Scoring + URL verification ensures only quality, accessible tools
 * are selected for video production.
 */
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { hasKnownAffiliateProgram } from '../../utils/affiliate-registry';

export interface DiscoveredTool {
  name: string;
  tagline: string;
  websiteUrl: string;
  urlSource: 'gemini-search' | 'google-cse' | 'guess';
  topics: string[];
  popularityScore?: number;
}



/** Domains that are NOT product websites — alive but not suitable for video */
const NON_PRODUCT_DOMAINS = [
  'github.com', 'gitlab.com', 'bitbucket.org',         // Code hosting
  'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', // Social media
  'reddit.com', 'news.ycombinator.com',                 // Forums
  'medium.com', 'substack.com', 'dev.to',               // Blog platforms
  'youtube.com', 'youtu.be', 'vimeo.com',               // Video platforms
  'producthunt.com', 'betalist.com',                     // Launch directories
  'docs.google.com', 'notion.so', 'notion.site',        // Doc platforms
  'apps.apple.com', 'play.google.com',                   // App stores
  'npmjs.com', 'pypi.org', 'crates.io',                 // Package registries
];

/**
 * Verify a URL is alive AND belongs to the correct product.
 * Layer 0: Non-product check — reject GitHub, Twitter, etc.
 * Layer 1: HTTP check — site responds (200-399, or 403/503 = CF but exists)
 * Layer 2: Content relevance — page title/meta contains the tool name
 */
export async function verifyUrl(
  url: string,
  toolName: string,
): Promise<{ alive: boolean; relevant: boolean; reason: string }> {
  // Layer 0: Reject non-product URLs (code hosting, social media, etc.)
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    const isNonProduct = NON_PRODUCT_DOMAINS.some(
      domain => hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (isNonProduct) {
      return { alive: true, relevant: false, reason: `non-product platform (${hostname})` };
    }
  } catch {
    // Invalid URL
  }
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
 * Source 1: Gemini AI Search — discover trending AI tools via Google Search grounding.
 * Returns tools with URLs already resolved. Costs 1 API call.
 */
export async function discoverViaGeminiSearch(): Promise<DiscoveredTool[]> {
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
    const year = new Date().getFullYear();
    const prompt = `Search Google for the MOST TRENDING and NEWEST AI tools right now.
Find AI tools, AI-powered apps, or AI SaaS products that are going viral, just launched, or getting massive attention today (${today}) or this week.
Prioritize tools that people are talking about RIGHT NOW, not old established tools.

For each tool found, provide:
- Name (the product name, not company name)
- One-line description of what the tool does
- Official website URL (the product's own domain)
- Popularity rating from 1-10 (based on how much buzz/coverage the tool has)

Respond in this exact JSON format (array of objects):
[{"name": "ToolName", "tagline": "Short description of what it does", "url": "https://example.com", "popularity": 7}]

Rules:
- Focus on AI/ML/LLM tools that are TRENDING or just LAUNCHED in ${year}
- Only include tools with their OWN website URL (not github.com, twitter.com, producthunt.com, medium.com, linkedin.com)
- Maximum 10 tools
- popularity: 1=unknown niche tool, 5=moderate coverage, 10=viral/trending everywhere
- If you find fewer than 3 tools from today, also include trending AI tools from this week
- If you cannot find any tools, respond with: []
- Respond with ONLY the JSON array, no other text`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // Extract JSON from response (may be wrapped in ```json blocks)
    const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/)
    if (!jsonMatch) {
      console.log('[Gemini Search] No tools found or invalid response');
      return [];
    }

    const parsed: Array<{ name: string; tagline: string; url: string; popularity?: number }> = JSON.parse(jsonMatch[0]);
    const tools: DiscoveredTool[] = parsed
      .filter(t => t.name && t.url && t.url.startsWith('http'))
      .map(t => ({
        name: t.name,
        tagline: t.tagline || '',
        websiteUrl: t.url,
        urlSource: 'gemini-search' as const,
        topics: [],

        // Gemini popularity: 1-10 scale → multiply by 5 to match 0-50 range
        popularityScore: Math.min(50, (t.popularity ?? 5) * 5),
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
 * Source 2: Google Custom Search API — search tech/AI sites for new tools.
 * Uses Programmable Search Engine configured to search producthunt.com,
 * techcrunch.com, theverge.com, venturebeat.com, etc.
 * Free: 100 queries/day. Pipeline uses 1-2/day.
 */
export async function discoverViaGoogleCSE(): Promise<DiscoveredTool[]> {
  // DISABLED (2026-04-06): User decided not to use Google CSE.
  // Pipeline now relies on Gemini AI Search grounding only.
  // CSE required Cloud Billing and was returning 403 errors.
  return [];
}

/**
 * Use Gemini + Google Search grounding to find the official website URL for a product.
 * Called by Google CSE (to resolve article URLs → real product URLs) and as fallback.
 */
async function resolveUrlViaGemini(
  name: string,
  tagline: string,
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      tools: [{ googleSearch: {} } as any],
    });

    const prompt = `Find the OFFICIAL website URL for this AI product.

Product: "${name}" — ${tagline}

Instructions:
- Search Google for: "${name}" official website
- Find the product's OWN domain (not a review site or article)
- Respond with ONLY the URL, nothing else
- Do NOT respond with producthunt.com, twitter.com, github.com, medium.com, or linkedin.com links
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
 *   URL reliability:  +40 if URL is pre-resolved (gemini-search/google-cse)
 *   Popularity:       0-30 normalized from popularityScore
 *   Tagline quality:  0-15 based on description length
 *   Name quality:     0-10 based on memorability (short = better)
 *   Video keywords:   +5 if tagline contains video-friendly terms
 *   Affiliate boost:  +15 if tool has a known affiliate program
 */
function scoreTool(tool: DiscoveredTool): number {
  let score = 0;

  // 1. URL reliability — pre-resolved URLs (gemini-search, google-cse) are reliable
  if (tool.urlSource === 'gemini-search' || tool.urlSource === 'google-cse') score += 40;

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

  // 6. Affiliate boost — prioritize tools with monetization potential
  const affiliateProg = hasKnownAffiliateProgram(tool.name, tool.websiteUrl);
  if (affiliateProg) {
    score += 15;
    console.log(`  💰 [Score] +15 affiliate boost: ${tool.name} (${affiliateProg.commission})`);
  }

  return score;
}

/**
 * Pick the best tool from a merged list using multi-criteria scoring.
 *
 * Strategy:
 *   1. Filter out recently used tools
 *   2. Score all remaining tools
 *   3. Sort by score (highest first)
 *   4. Try each tool: verify URL → return first valid
 *
 * Returns null if no suitable tool found.
 */
export async function pickBestTool(
  tools: DiscoveredTool[],
  avoidNames: string[]
): Promise<DiscoveredTool | null> {
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
    console.log(`  🔗 [${score}pts] ${tool.name} — ${tool.tagline.slice(0, 45)} (${tool.urlSource})`);
  }

  // Step 3: Try each candidate in score order — verify URL
  for (const { tool, score } of scored) {
    console.log(`[Picker] 🎯 Trying: "${tool.name}" (${score}pts, source: ${tool.urlSource})`);

    // === URL Verification ===
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

/**
 * Pick the top N tools from a merged list using multi-criteria scoring.
 * Returns verified tools in score order (best first).
 * Used by orchestrator for multi-tool retry loop.
 */
export async function pickTopTools(
  tools: DiscoveredTool[],
  avoidNames: string[],
  topN: number = 3
): Promise<DiscoveredTool[]> {
  const avoidLower = avoidNames.map(n => n.toLowerCase().trim());

  const candidates = tools.filter(tool => {
    const nameLower = tool.name.toLowerCase().trim();
    const isUsed = avoidLower.some(avoid => nameLower.includes(avoid) || avoid.includes(nameLower));
    if (isUsed) console.log(`[Picker] Skipping "${tool.name}" (recently used)`);
    return !isUsed;
  });

  if (candidates.length === 0) return [];

  const scored = candidates.map(tool => ({ tool, score: scoreTool(tool) }));
  scored.sort((a, b) => b.score - a.score);

  console.log(`[Picker] 📊 Top candidates (${candidates.length} total):`);
  for (const { tool, score } of scored.slice(0, 5)) {
    console.log(`  🔗 [${score}pts] ${tool.name} — ${tool.tagline.slice(0, 45)} (${tool.urlSource})`);
  }

  // Verify URLs and collect up to topN valid tools
  const verified: DiscoveredTool[] = [];
  for (const { tool, score } of scored) {
    if (verified.length >= topN) break;

    console.log(`[Picker] 🔍 Verifying: "${tool.name}" (${score}pts)`);
    const verification = await verifyUrl(tool.websiteUrl, tool.name);

    if (!verification.alive) {
      console.log(`[Picker] ❌ URL dead: ${verification.reason}`);
      continue;
    }
    if (!verification.relevant) {
      console.log(`[Picker] ⚠️ URL wrong site: ${verification.reason}`);
      continue;
    }

    console.log(`[Picker] ✅ Verified: "${tool.name}" (${score}pts)`);
    verified.push(tool);
  }

  console.log(`[Picker] 🎯 ${verified.length} tools ready for retry pool: ${verified.map(t => t.name).join(', ')}`);
  return verified;
}

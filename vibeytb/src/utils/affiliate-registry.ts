/**
 * Affiliate Link Registry — Single Source of Truth.
 *
 * Maps tool names to affiliate URLs + signup info.
 * Pipeline auto-resolves direct URLs → affiliate URLs.
 *
 * HOW TO ADD A NEW AFFILIATE:
 * 1. Sign up at the tool's affiliate program page
 * 2. Get your unique referral link
 * 3. Add entry to AFFILIATE_REGISTRY below
 * 4. Commit & push — pipeline will auto-use the link
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AffiliateEntry {
  /** Tool name (display) */
  name: string;
  /** Your unique affiliate/referral URL */
  affiliateUrl: string;
  /** Commission rate (for reference) */
  commission: string;
  /** Signup page for this affiliate program */
  signupUrl: string;
  /** Whether you've been approved (false = pending/not applied) */
  active: boolean;
}

export interface KnownAffiliateProgram {
  /** Tool name */
  name: string;
  /** Domains associated with this tool */
  domains: string[];
  /** Affiliate program signup URL */
  signupUrl: string;
  /** Commission info */
  commission: string;
  /** How long does the cookie last */
  cookieDays: number;
}

// ─── Your Affiliate Links (fill in after signup) ────────────────────────────

/**
 * Active affiliate links. Key = lowercase tool name.
 * Add your referral URL here after signing up for each program.
 */
export const AFFILIATE_REGISTRY: Record<string, AffiliateEntry> = {
  'elevenlabs': {
    name: 'ElevenLabs',
    affiliateUrl: 'https://try.elevenlabs.io/usuat31azvbv',
    commission: '22% recurring (12 months)',
    signupUrl: 'https://elevenlabs.io/affiliates',
    active: true,
  },
  // HeyGen — pending approval
  // 'heygen': {
  //   name: 'HeyGen',
  //   affiliateUrl: 'https://www.heygen.com/?via=YOUR_ID',
  //   commission: '35% (3 months)',
  //   signupUrl: 'https://www.heygen.com/affiliate-program',
  //   active: true,
  // },
};

// ─── Known Affiliate Programs (for scoring boost) ──────────────────────────

/**
 * AI tools that have affiliate programs.
 * Used by tool-discovery scoring to PRIORITIZE tools with monetization potential.
 * This list does NOT require you to have signed up — it's for discovery boost only.
 */
export const KNOWN_AFFILIATE_PROGRAMS: KnownAffiliateProgram[] = [
  {
    name: 'ElevenLabs',
    domains: ['elevenlabs.io'],
    signupUrl: 'https://elevenlabs.io/affiliates',
    commission: '22% recurring (12mo)',
    cookieDays: 90,
  },
  {
    name: 'HeyGen',
    domains: ['heygen.com'],
    signupUrl: 'https://www.heygen.com/affiliate-program',
    commission: '35% (3 months)',
    cookieDays: 30,
  },
  {
    name: 'Jasper',
    domains: ['jasper.ai'],
    signupUrl: 'https://www.jasper.ai/partners',
    commission: '25-30% recurring (12mo)',
    cookieDays: 30,
  },
  {
    name: 'Copy.ai',
    domains: ['copy.ai'],
    signupUrl: 'https://www.copy.ai/affiliate',
    commission: '45% recurring (12mo)',
    cookieDays: 60,
  },
  {
    name: 'Writesonic',
    domains: ['writesonic.com'],
    signupUrl: 'https://writesonic.com/affiliate',
    commission: '30% lifetime recurring',
    cookieDays: 30,
  },
  {
    name: 'Murf AI',
    domains: ['murf.ai'],
    signupUrl: 'https://murf.ai/resources/affiliate-program',
    commission: '20% recurring (24mo)',
    cookieDays: 30,
  },
  {
    name: 'AdCreative.ai',
    domains: ['adcreative.ai'],
    signupUrl: 'https://www.adcreative.ai/affiliate',
    commission: '30% lifetime recurring',
    cookieDays: 30,
  },
  {
    name: 'Synthesia',
    domains: ['synthesia.io'],
    signupUrl: 'https://www.synthesia.io/affiliates',
    commission: '20% recurring',
    cookieDays: 30,
  },
  {
    name: 'Pictory',
    domains: ['pictory.ai'],
    signupUrl: 'https://pictory.ai/affiliates',
    commission: '20% recurring',
    cookieDays: 30,
  },
  {
    name: 'Descript',
    domains: ['descript.com'],
    signupUrl: 'https://www.descript.com/affiliates',
    commission: '15% recurring',
    cookieDays: 30,
  },
  {
    name: 'Runway',
    domains: ['runwayml.com', 'runway.com'],
    signupUrl: 'https://runwayml.com/affiliate',
    commission: '20% recurring',
    cookieDays: 30,
  },
  {
    name: 'TubeBuddy',
    domains: ['tubebuddy.com'],
    signupUrl: 'https://www.tubebuddy.com/affiliates',
    commission: 'Up to 50% recurring',
    cookieDays: 365,
  },
  {
    name: 'Luma AI',
    domains: ['lumalabs.ai'],
    signupUrl: 'https://lumalabs.ai/affiliate',
    commission: '20%',
    cookieDays: 30,
  },
];

// ─── UTM Tracking ──────────────────────────────────────────────────────────

const UTM_DEFAULTS = {
  utm_source: 'youtube',
  utm_medium: 'shorts',
  utm_campaign: 'techhustlelabs',
} as const;

/**
 * Append UTM parameters to a URL (for non-affiliate tracking).
 */
function appendUtm(url: string): string {
  try {
    const u = new URL(url);
    // Don't overwrite existing UTM params
    if (!u.searchParams.has('utm_source')) {
      for (const [key, val] of Object.entries(UTM_DEFAULTS)) {
        u.searchParams.set(key, val);
      }
    }
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Extract the root domain from a URL (e.g. "elevenlabs.io" from "https://www.elevenlabs.io/path").
 */
function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    // Remove "www." prefix
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Resolve a tool URL to its affiliate URL (if available).
 *
 * Priority:
 * 1. Exact name match in AFFILIATE_REGISTRY (active only)
 * 2. Domain match in AFFILIATE_REGISTRY
 * 3. Fallback: direct URL with UTM tracking
 */
export function resolveAffiliateUrl(
  toolName: string,
  directUrl: string,
): { url: string; isAffiliate: boolean } {
  if (!directUrl) return { url: '', isAffiliate: false };

  const key = toolName.toLowerCase().trim();

  // 1. Exact name match
  const exact = AFFILIATE_REGISTRY[key];
  if (exact?.active && exact.affiliateUrl) {
    return { url: exact.affiliateUrl, isAffiliate: true };
  }

  // 2. Domain match
  const domain = extractDomain(directUrl);
  if (domain) {
    const domainEntry = Object.values(AFFILIATE_REGISTRY).find(
      (entry) => entry.active && extractDomain(entry.affiliateUrl)?.includes(domain),
    );
    if (domainEntry) {
      return { url: domainEntry.affiliateUrl, isAffiliate: true };
    }
  }

  // 3. Fallback: UTM tracking on direct URL
  return { url: appendUtm(directUrl), isAffiliate: false };
}

/**
 * Check if a tool name or domain has a KNOWN affiliate program.
 * Used by tool-discovery scoring to prioritize monetizable tools.
 */
export function hasKnownAffiliateProgram(
  toolName: string,
  websiteUrl?: string,
): KnownAffiliateProgram | undefined {
  const nameLower = toolName.toLowerCase().trim();
  const domain = websiteUrl ? extractDomain(websiteUrl) : null;

  return KNOWN_AFFILIATE_PROGRAMS.find((prog) => {
    // Match by name
    if (prog.name.toLowerCase() === nameLower) return true;
    if (nameLower.includes(prog.name.toLowerCase())) return true;
    // Match by domain
    if (domain && prog.domains.some((d) => domain.includes(d))) return true;
    return false;
  });
}

/**
 * Get summary stats for display.
 */
export function getAffiliateStats(): {
  totalKnown: number;
  totalActive: number;
  activeNames: string[];
} {
  const active = Object.values(AFFILIATE_REGISTRY).filter((e) => e.active);
  return {
    totalKnown: KNOWN_AFFILIATE_PROGRAMS.length,
    totalActive: active.length,
    activeNames: active.map((e) => e.name),
  };
}

// ─── Supabase-backed resolution (for pipeline runtime) ─────────────────────

/** In-memory cache of DB affiliates (refreshed per pipeline run) */
let _dbCache: AffiliateEntry[] | null = null;

/**
 * Load affiliate links from Supabase `affiliate_links` table.
 * Caches result in memory for the duration of the pipeline run.
 * Falls back to hardcoded AFFILIATE_REGISTRY if DB is unavailable.
 */
export async function loadAffiliatesFromDb(): Promise<AffiliateEntry[]> {
  if (_dbCache) return _dbCache;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('No Supabase credentials');

    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('affiliate_links')
      .select('tool_name, affiliate_url, commission, signup_url, active')
      .eq('active', true);

    if (error) throw error;

    _dbCache = (data ?? []).map((row) => ({
      name: row.tool_name,
      affiliateUrl: row.affiliate_url,
      commission: row.commission || '',
      signupUrl: row.signup_url || '',
      active: row.active,
    }));

    console.log(`[AFFILIATE] 📦 Loaded ${_dbCache.length} affiliate links from DB`);
    return _dbCache;
  } catch (err) {
    console.warn(`[AFFILIATE] ⚠️ DB unavailable, using hardcoded registry: ${(err as Error).message?.slice(0, 60)}`);
    _dbCache = Object.values(AFFILIATE_REGISTRY).filter((e) => e.active);
    return _dbCache;
  }
}

/**
 * Resolve affiliate URL using Supabase DB (async version).
 * Call this from the pipeline orchestrator for up-to-date links.
 *
 * Priority:
 * 1. DB match (by tool name)
 * 2. Hardcoded AFFILIATE_REGISTRY match
 * 3. UTM fallback
 */
export async function resolveAffiliateUrlFromDb(
  toolName: string,
  directUrl: string,
): Promise<{ url: string; isAffiliate: boolean }> {
  if (!directUrl) return { url: '', isAffiliate: false };

  const dbAffiliates = await loadAffiliatesFromDb();
  const key = toolName.toLowerCase().trim();

  // 1. DB match by name
  const dbMatch = dbAffiliates.find(
    (a) => a.name.toLowerCase().trim() === key,
  );
  if (dbMatch?.affiliateUrl) {
    return { url: dbMatch.affiliateUrl, isAffiliate: true };
  }

  // 2. Fallback to sync resolver (hardcoded + UTM)
  return resolveAffiliateUrl(toolName, directUrl);
}

/** Reset DB cache (call at start of each pipeline run) */
export function resetAffiliateCache(): void {
  _dbCache = null;
}

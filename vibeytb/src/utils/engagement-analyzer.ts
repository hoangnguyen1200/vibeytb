/**
 * Engagement Analyzer — Learns from past video performance.
 *
 * Queries Supabase for published videos with analytics data,
 * normalizes by age (views_per_day), and extracts winning patterns
 * for tool categories, title styles, and keywords.
 *
 * Usage: Called once at pipeline start, cached for the run.
 */
import { supabase } from '../lib/supabase/client';

export interface EngagementInsights {
  /** Tool categories that perform best (e.g. "AI writing", "AI image") */
  topCategories: string[];
  /** Average views/day by title style */
  titleStyleWeights: Record<string, number>;
  /** Keywords appearing in top-performing titles */
  winningKeywords: string[];
  /** Median views/day — threshold for "good" performance */
  medianViewsPerDay: number;
  /** Total videos analyzed */
  totalAnalyzed: number;
}

interface VideoRow {
  tool_name: string | null;
  youtube_title: string | null;
  title_style: string | null;
  views_latest: number | null;
  created_at: string;
}

/**
 * Categorize a tool name into a broad category.
 * Uses keyword matching on tool name + title.
 */
function categorize(toolName: string, title: string): string {
  const combined = `${toolName} ${title}`.toLowerCase();

  const categoryMap: [string, string[]][] = [
    ['AI Writing', ['write', 'copy', 'content', 'text', 'blog', 'article', 'seo', 'grammar']],
    ['AI Image', ['image', 'photo', 'design', 'art', 'draw', 'logo', 'visual', 'graphic']],
    ['AI Video', ['video', 'animate', 'edit', 'clip', 'reel', 'film', 'render']],
    ['AI Voice', ['voice', 'speech', 'tts', 'audio', 'sound', 'music', 'podcast', 'elevenlabs']],
    ['AI Code', ['code', 'developer', 'programming', 'github', 'debug', 'api']],
    ['AI Chat', ['chat', 'assistant', 'bot', 'conversation', 'gpt', 'claude', 'gemini']],
    ['AI Productivity', ['productivity', 'automation', 'workflow', 'schedule', 'task', 'project', 'notion']],
    ['AI Data', ['data', 'analytics', 'spreadsheet', 'database', 'scrape', 'research']],
    ['AI Marketing', ['marketing', 'ads', 'email', 'social', 'campaign', 'growth']],
  ];

  for (const [category, keywords] of categoryMap) {
    if (keywords.some(kw => combined.includes(kw))) return category;
  }

  return 'AI Tool'; // Generic fallback
}

/**
 * Extract meaningful keywords from a title (removes common words).
 */
function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    'this', 'that', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
    'ai', 'tool', 'new', 'best', 'free', 'how', 'why', 'what',
    'can', 'will', 'your', 'you', 'for', 'with', 'and', 'or',
    'it', 'in', 'on', 'to', 'of', 'just', 'has', 'do', 'does',
  ]);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Analyze top-performing videos and extract patterns.
 * Returns insights for scoring and title style weighting.
 *
 * Cached per pipeline run (called once, results reused).
 */
let cachedInsights: EngagementInsights | null = null;

export async function analyzeTopPerformers(): Promise<EngagementInsights> {
  if (cachedInsights) return cachedInsights;

  console.log('[ENGAGEMENT] Analyzing past video performance...');

  const { data: videos, error } = await supabase
    .from('video_projects')
    .select('tool_name, youtube_title, title_style, views_latest, created_at')
    .eq('status', 'published')
    .not('views_latest', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !videos || videos.length < 3) {
    console.log(`[ENGAGEMENT] Not enough data (${videos?.length ?? 0} videos). Using defaults.`);
    cachedInsights = {
      topCategories: [],
      titleStyleWeights: { question: 25, bold_claim: 25, listicle: 25, urgency: 25 },
      winningKeywords: [],
      medianViewsPerDay: 0,
      totalAnalyzed: 0,
    };
    return cachedInsights;
  }

  const now = Date.now();

  // Calculate views/day for each video
  const enriched = (videos as VideoRow[]).map(v => {
    const ageMs = now - new Date(v.created_at).getTime();
    const ageDays = Math.max(1, ageMs / (1000 * 60 * 60 * 24));
    const viewsPerDay = (v.views_latest ?? 0) / ageDays;
    const category = categorize(v.tool_name || '', v.youtube_title || '');

    return { ...v, viewsPerDay, ageDays, category };
  });

  // Sort by views/day (best first)
  enriched.sort((a, b) => b.viewsPerDay - a.viewsPerDay);

  // Median views/day
  const mid = Math.floor(enriched.length / 2);
  const medianViewsPerDay = enriched[mid]?.viewsPerDay ?? 0;

  // Top 30% performers
  const topCutoff = Math.max(1, Math.floor(enriched.length * 0.3));
  const topPerformers = enriched.slice(0, topCutoff);

  // 1. Top categories
  const categoryCounts: Record<string, number> = {};
  for (const v of topPerformers) {
    categoryCounts[v.category] = (categoryCounts[v.category] || 0) + 1;
  }
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // 2. Title style weights (views/day average per style)
  const styleViews: Record<string, number[]> = {};
  for (const v of enriched) {
    const style = v.title_style || 'unknown';
    if (!styleViews[style]) styleViews[style] = [];
    styleViews[style].push(v.viewsPerDay);
  }

  const styleAvgs: Record<string, number> = {};
  for (const [style, views] of Object.entries(styleViews)) {
    styleAvgs[style] = views.reduce((a, b) => a + b, 0) / views.length;
  }

  // Convert to percentage weights (min 10% per style)
  const totalAvg = Object.values(styleAvgs).reduce((a, b) => a + b, 0) || 1;
  const titleStyleWeights: Record<string, number> = {};
  for (const [style, avg] of Object.entries(styleAvgs)) {
    titleStyleWeights[style] = Math.max(10, Math.round((avg / totalAvg) * 100));
  }

  // 3. Winning keywords from top performer titles
  const keywordCounts: Record<string, number> = {};
  for (const v of topPerformers) {
    const words = extractKeywords(v.youtube_title || '');
    for (const w of words) {
      keywordCounts[w] = (keywordCounts[w] || 0) + 1;
    }
  }
  const winningKeywords = Object.entries(keywordCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([kw]) => kw);

  cachedInsights = {
    topCategories,
    titleStyleWeights,
    winningKeywords,
    medianViewsPerDay,
    totalAnalyzed: enriched.length,
  };

  console.log(`[ENGAGEMENT] Analyzed ${enriched.length} videos:`);
  console.log(`  📈 Median views/day: ${medianViewsPerDay.toFixed(1)}`);
  console.log(`  🏆 Top categories: ${topCategories.join(', ') || 'not enough data'}`);
  console.log(`  🎯 Title weights: ${JSON.stringify(titleStyleWeights)}`);
  console.log(`  🔑 Keywords: ${winningKeywords.join(', ') || 'none'}`);

  return cachedInsights;
}

/**
 * Check if a tool name matches any of the top-performing categories.
 */
export function matchesTopCategory(toolName: string, toolTagline: string, topCategories: string[]): boolean {
  if (topCategories.length === 0) return false;
  const category = categorize(toolName, toolTagline);
  return topCategories.includes(category);
}

/**
 * Select a title style using weighted random selection based on performance data.
 */
export function selectWeightedTitleStyle(weights: Record<string, number>): string {
  const styles = ['question', 'bold_claim', 'listicle', 'urgency'];
  const styleWeights = styles.map(s => weights[s] || 25);
  const total = styleWeights.reduce((a, b) => a + b, 0);

  let random = Math.random() * total;
  for (let i = 0; i < styles.length; i++) {
    random -= styleWeights[i];
    if (random <= 0) return styles[i];
  }

  return styles[0];
}

/**
 * Reset cached insights (for testing).
 */
export function resetInsightsCache(): void {
  cachedInsights = null;
}

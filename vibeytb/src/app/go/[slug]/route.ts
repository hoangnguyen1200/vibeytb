import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * GET /go/[slug] — 301 redirect to affiliate URL.
 * Slug is tool name lowercased with hyphens: "ElevenLabs" → "elevenlabs"
 * Falls back to /tools page if slug not found.
 * Increments click counter for tracking.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  try {
    const supabase = getSupabaseAdmin();

    // Fetch all active affiliates and find by slug match
    const { data, error } = await supabase
      .from('affiliate_links')
      .select('id, tool_name, affiliate_url, direct_url, active')
      .eq('active', true);

    if (error) throw error;

    // Match slug to tool name
    const match = (data ?? []).find(t => {
      const toolSlug = t.tool_name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return toolSlug === slug.toLowerCase();
    });

    if (!match || !match.affiliate_url) {
      // No match — redirect to tools directory
      return NextResponse.redirect(new URL('/tools', _request.url), 302);
    }

    // Increment click counter (best-effort, don't block redirect)
    try {
      await supabase
        .from('affiliate_links')
        .update({ clicks: ((match as any).clicks ?? 0) + 1 })
        .eq('id', match.id);
    } catch {
      // Non-fatal — click tracking failure shouldn't block redirect
    }

    // 301 permanent redirect to affiliate URL
    return NextResponse.redirect(match.affiliate_url, 301);
  } catch {
    // On error, fall back to tools directory
    return NextResponse.redirect(new URL('/tools', _request.url), 302);
  }
}

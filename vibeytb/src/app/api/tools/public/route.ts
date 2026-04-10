import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

/**
 * GET /api/tools/public — Public endpoint for tools landing page.
 * Returns only active tools with affiliate URLs.
 * Does NOT expose admin fields (affiliate_url, signup_url, id).
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('affiliate_links')
      .select('tool_name, direct_url, commission, notes, active, affiliate_url')
      .eq('active', true)
      .order('tool_name', { ascending: true });

    if (error) throw error;

    // Map to public-safe shape — don't expose raw affiliate_url
    const tools = (data ?? [])
      .filter(t => t.affiliate_url && t.affiliate_url.trim() !== '')
      .map(t => {
        // Generate slug from tool name: "ElevenLabs" → "elevenlabs"
        const slug = t.tool_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        return {
          name: t.tool_name,
          slug,
          url: t.direct_url || '',
          commission: t.commission || '',
          description: t.notes || '',
        };
      });

    return NextResponse.json(
      { tools },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const supabase = getSupabase();

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data, error } = await supabase
      .from('video_projects')
      .select('tool_name, status, created_at, youtube_url')
      .not('tool_name', 'is', null)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Deduplicate by tool_name, keep latest
    const toolMap = new Map<string, { tool_name: string; status: string; created_at: string; youtube_url: string | null }>();
    for (const row of data ?? []) {
      if (!toolMap.has(row.tool_name)) {
        toolMap.set(row.tool_name, row);
      }
    }

    return NextResponse.json({ tools: Array.from(toolMap.values()) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

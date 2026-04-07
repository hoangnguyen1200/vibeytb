import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing Supabase environment variables');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const sortBy = searchParams.get('sort') ?? 'date';
    const sortDir = searchParams.get('dir') === 'asc';
    const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100);
    const offset = Number(searchParams.get('offset') ?? 0);

    const sortMap: Record<string, string> = {
      date: 'created_at',
      views: 'views_24h',
      tool: 'tool_name',
    };
    const orderCol = sortMap[sortBy] ?? 'created_at';

    let query = supabase
      .from('video_projects')
      .select('id, status, tool_name, tool_url, youtube_title, youtube_url, tiktok_url, views_24h, likes_24h, comments_24h, views_latest, likes_latest, comments_latest, analytics_updated_at, discovery_source, title_style, created_at, updated_at', { count: 'exact' })
      .order(orderCol, { ascending: sortDir, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.ilike('tool_name', `%${search}%`);
    }

    const { data, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

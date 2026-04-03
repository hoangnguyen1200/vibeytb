import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // Generate notifications from recent video activity
    const { data: recentVideos } = await supabase
      .from('video_projects')
      .select('id, status, tool_name, youtube_title, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(20);

    const notifications = (recentVideos ?? []).map(v => {
      const isPublished = v.status === 'published';
      const isFailed = v.status === 'failed';
      return {
        id: v.id,
        type: isPublished ? 'success' : isFailed ? 'error' : 'info',
        title: isPublished
          ? `✅ Published: ${v.tool_name ?? 'Video'}`
          : isFailed
          ? `❌ Failed: ${v.tool_name ?? 'Video'}`
          : `🔄 ${v.status}: ${v.tool_name ?? 'Video'}`,
        detail: v.youtube_title ?? v.tool_name ?? 'Untitled',
        timestamp: v.updated_at ?? v.created_at,
      };
    });

    return NextResponse.json({ notifications });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

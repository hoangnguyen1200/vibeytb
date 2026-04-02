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

export async function GET() {
  try {
    const supabase = getSupabase();

    // Total videos
    const { count: total } = await supabase
      .from('video_projects')
      .select('*', { count: 'exact', head: true });

    // Published
    const { count: published } = await supabase
      .from('video_projects')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published');

    // Failed
    const { count: failed } = await supabase
      .from('video_projects')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    // Processing / Pending
    const { count: pending } = await supabase
      .from('video_projects')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'processing', 'pending_approval', 'ready_for_video', 'ready_for_upload', 'upload_pending']);

    // Average views (published videos with views_24h)
    const { data: viewsData } = await supabase
      .from('video_projects')
      .select('views_24h, likes_24h, comments_24h')
      .eq('status', 'published')
      .not('views_24h', 'is', null);

    let avgViews = 0;
    let avgLikes = 0;
    let avgComments = 0;
    let totalViews = 0;

    if (viewsData && viewsData.length > 0) {
      totalViews = viewsData.reduce((sum, v) => sum + (v.views_24h ?? 0), 0);
      avgViews = Math.round(totalViews / viewsData.length);
      avgLikes = Math.round(
        viewsData.reduce((sum, v) => sum + (v.likes_24h ?? 0), 0) / viewsData.length
      );
      avgComments = Math.round(
        viewsData.reduce((sum, v) => sum + (v.comments_24h ?? 0), 0) / viewsData.length
      );
    }

    // Success rate (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentTotal } = await supabase
      .from('video_projects')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)
      .in('status', ['published', 'failed']);

    const { count: recentPublished } = await supabase
      .from('video_projects')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)
      .eq('status', 'published');

    const successRate = recentTotal && recentTotal > 0
      ? Math.round(((recentPublished ?? 0) / recentTotal) * 100)
      : 0;

    // Last run
    const { data: lastRun } = await supabase
      .from('video_projects')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      total: total ?? 0,
      published: published ?? 0,
      failed: failed ?? 0,
      pending: pending ?? 0,
      successRate,
      avgViews,
      avgLikes,
      avgComments,
      totalViews,
      lastRun: lastRun?.created_at ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

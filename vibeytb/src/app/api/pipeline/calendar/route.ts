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

    // Get last 14 days of pipeline runs
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('status, started_at, videos_published, videos_failed')
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Group by date
    const calendarMap = new Map<string, { status: string; published: number; failed: number; runs: number }>();

    for (const run of data ?? []) {
      const date = new Date(run.started_at).toISOString().split('T')[0];
      const existing = calendarMap.get(date) ?? { status: 'no_run', published: 0, failed: 0, runs: 0 };
      existing.runs++;
      existing.published += run.videos_published ?? 0;
      existing.failed += run.videos_failed ?? 0;
      // Status: if any run published, it's a success day
      existing.status = existing.published > 0 ? 'completed' : run.status === 'failed' ? 'failed' : existing.status;
      calendarMap.set(date, existing);
    }

    // Fill missing dates with no_run
    const calendar = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const entry = calendarMap.get(dateStr) ?? { status: 'no_run', published: 0, failed: 0, runs: 0 };
      calendar.push({ date: dateStr, ...entry });
    }

    return NextResponse.json({ calendar });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

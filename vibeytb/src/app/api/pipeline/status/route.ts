import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const supabase = getSupabase();

    // Get last 10 runs with phase logs
    const { data: runs, error: runsError } = await supabase
      .from('pipeline_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(10);

    if (runsError) {
      if (runsError.code === '42P01') {
        return NextResponse.json({ latestRun: null, phases: [], recentRuns: [] });
      }
      return NextResponse.json({ error: runsError.message }, { status: 500 });
    }

    const latestRun = runs?.[0] ?? null;

    // Get phase logs for latest run
    let phases: unknown[] = [];
    if (latestRun?.run_id) {
      const { data: phaseData } = await supabase
        .from('pipeline_phase_logs')
        .select('id, run_id, phase, phase_name, status, started_at, finished_at, duration_ms, error_message, logs, metadata')
        .eq('run_id', latestRun.run_id)
        .order('phase', { ascending: true });
      phases = phaseData ?? [];
    }

    // Error category summary (7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFailed } = await supabase
      .from('pipeline_runs')
      .select('error_message')
      .eq('status', 'failed')
      .gte('started_at', sevenDaysAgo);

    const errorCategories: Record<string, number> = {};
    for (const row of recentFailed ?? []) {
      const msg = (row.error_message as string) ?? '';
      const match = msg.match(/^\[(\w+)\]/);
      const category = match?.[1] ?? 'unknown';
      errorCategories[category] = (errorCategories[category] ?? 0) + 1;
    }

    return NextResponse.json({
      latestRun,
      phases,
      recentRuns: runs ?? [],
      errorCategories,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

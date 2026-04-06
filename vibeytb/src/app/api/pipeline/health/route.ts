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
    const alerts: { type: 'success' | 'warning' | 'error' | 'info'; message: string; id: string }[] = [];

    // Get last 14 days of runs
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const { data: runs } = await supabase
      .from('pipeline_runs')
      .select('status, started_at, videos_published')
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: false });

    if (!runs || runs.length === 0) {
      alerts.push({ type: 'info', message: '📊 No pipeline runs in the last 14 days.', id: 'no_runs' });
      return NextResponse.json({ alerts });
    }

    // Check consecutive fails (last N runs)
    let consecutiveFails = 0;
    for (const run of runs) {
      if (run.status === 'failed') consecutiveFails++;
      else break;
    }
    if (consecutiveFails >= 3) {
      alerts.push({
        type: 'error',
        message: `🔥 ${consecutiveFails} consecutive failures! Check API keys and Gemini quota.`,
        id: 'consecutive_fails',
      });
    }

    // Check success streak
    let successStreak = 0;
    for (const run of runs) {
      if (run.status === 'completed') successStreak++;
      else break;
    }
    if (successStreak >= 5) {
      alerts.push({
        type: 'success',
        message: `🎉 ${successStreak} consecutive successes! Pipeline is running great!`,
        id: 'success_streak',
      });
    }

    // Check 7d success rate
    const last7d = runs.filter(r => {
      const d = new Date(r.started_at);
      return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
    });
    const successCount = last7d.filter(r => r.status === 'completed').length;
    const rate = last7d.length > 0 ? Math.round((successCount / last7d.length) * 100) : 0;

    if (rate < 50 && last7d.length >= 3) {
      alerts.push({
        type: 'warning',
        message: `📉 Success rate is ${rate}% (${successCount}/${last7d.length}) this week. Consider checking error logs.`,
        id: 'low_success_rate',
      });
    } else if (rate >= 80 && last7d.length >= 3) {
      alerts.push({
        type: 'success',
        message: `📈 Success rate is ${rate}%! Pipeline is healthy.`,
        id: 'high_success_rate',
      });
    }

    // Check if today had a run
    const today = new Date().toISOString().split('T')[0];
    const todayRuns = runs.filter(r => r.started_at.startsWith(today));
    if (todayRuns.length === 0) {
      const now = new Date();
      // Only alert after expected run time (9 AM VN = 2 AM UTC)
      if (now.getUTCHours() >= 4) {
        alerts.push({
          type: 'info',
          message: '⏰ Pipeline hasn\'t run today yet.',
          id: 'no_run_today',
        });
      }
    }

    return NextResponse.json({ alerts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

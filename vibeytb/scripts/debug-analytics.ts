import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1. All status counts
  const { data: all } = await sb.from('video_projects').select('status');
  const counts: Record<string, number> = {};
  (all || []).forEach((v: any) => counts[v.status] = (counts[v.status] || 0) + 1);
  console.log('=== STATUS COUNTS ===');
  console.log(JSON.stringify(counts, null, 2));

  // 2. Videos with youtube_url
  const { data: withUrl } = await sb.from('video_projects')
    .select('id, status, youtube_url, views_24h, tool_name, updated_at')
    .not('youtube_url', 'is', null)
    .limit(10);
  console.log('\n=== VIDEOS WITH YOUTUBE_URL ===');
  console.log('Count:', withUrl?.length ?? 0);
  for (const v of (withUrl || [])) {
    console.log(`  ${v.tool_name} | status: ${v.status} | views_24h: ${v.views_24h} | url: ${v.youtube_url?.slice(0, 50)} | updated: ${v.updated_at}`);
  }

  // 3. Analytics tracker query (exact same as code)
  const { data: trackable } = await sb.from('video_projects')
    .select('id, youtube_url, tool_name, youtube_title, views_24h')
    .eq('status', 'published')
    .not('youtube_url', 'is', null)
    .is('views_24h', null)
    .limit(50);
  console.log('\n=== TRACKABLE (analytics query) ===');
  console.log('Count:', trackable?.length ?? 0);
  for (const v of (trackable || [])) {
    console.log(`  ${v.tool_name} | url: ${v.youtube_url?.slice(0, 50)}`);
  }

  process.exit(0);
}
main();

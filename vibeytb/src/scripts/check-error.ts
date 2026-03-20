import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from('video_projects')
    .select('id, status, error_logs')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    console.log('✅ Project mới nhất:');
    console.dir(data[0], { depth: null, colors: true });
  } else {
    console.log('Chưa có project nào.');
  }

  setTimeout(() => { process.exit(0); }, 500);
}

check();

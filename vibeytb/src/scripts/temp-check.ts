import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from('video_projects')
    .select('script_json')
    .eq('id', '9bb2cdc5-9939-412c-b305-8ca9723979aa')
    .single();

  console.dir(data, { depth: null });
  setTimeout(() => process.exit(0), 500);
}

check();
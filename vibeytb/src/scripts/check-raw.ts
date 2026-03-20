import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from('video_scripts')
    .select('scenes')
    .order('created_at', { ascending: false })
    .limit(1);

  if (data && data.length > 0) {
    console.log('✅ Kịch bản mới nhất từ CSDL:');
    console.dir(data[0].scenes, { depth: null, colors: true });
  } else {
    console.log('Chưa có kịch bản nào được sinh ra.');
  }

  // Cố tình exit sạch
  setTimeout(() => { process.exit(0); }, 500);
}

check();

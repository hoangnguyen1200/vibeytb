import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

supabase.from('video_projects')
  .select('id, updated_at, error_logs')
  .order('updated_at', { ascending: false })
  .limit(2)
  .then(({ data }) => {
    fs.writeFileSync('db-errors.json', JSON.stringify(data, null, 2), 'utf-8');
    console.log('Saved to db-errors.json');
    process.exit(0);
  });
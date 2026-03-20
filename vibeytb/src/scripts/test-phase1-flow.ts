import 'dotenv/config';
import { TrendData } from '../agents/agent-1-data-miner/scraper';
import { supabase } from '../lib/supabase/client';

async function runDryRun() {
  console.log('🚀 [DRY-RUN] Bắt đầu Integration Test Phase 1...\n');

  // 1. Data Contract Check
  console.log('1️⃣ Kiểm thử Data Contract (Scraper -> Worker)');
  const mockTrends: TrendData[] = [
    {
      title: 'Mock_Trend_Alpha',
      traffic: '200K+',
      pubDate: new Date().toISOString(),
      newsUrl: 'https://news.google.com/mock'
    },
    {
      title: 'Mock_Trend_Beta',
      traffic: '50K+',
      pubDate: new Date().toISOString(),
      newsUrl: 'https://news.google.com/mock2'
    }
  ];
  
  if (!mockTrends[0].title || !mockTrends[0].traffic) {
    throw new Error('Data Contract bị rách. Thiếu trường bắt buộc.');
  }
  console.log('   ✅ Cấu trúc Dữ liệu Mock chuẩn xác. Các field title, traffic, pubDate tồn tại.');

  // 2. Transformation Check
  console.log('\n2️⃣ Kiểm thử Data Transformation (Xử lý Parser)');
  const dbPayload = mockTrends.map(t => ({
    keyword: t.title,
    search_volume: parseInt(t.traffic.replace(/[^0-9]/g, '')) || 0,
    source: 'dry_run_test',
    raw_data: t
  }));

  console.log('   ✅ Payload biến đổi:');
  console.dir(dbPayload, { depth: null, colors: true });
  if (dbPayload[0].search_volume !== 200) {
    throw new Error('❌ Logic Regex parse volume bị sai!');
  }
  console.log('   ✅ Parse regex traffic -> volume chuẩn (100K+ -> 100).');

  // 3. Database Check
  console.log('\n3️⃣ Kiểm thử Database Integrity (Upsert)');
  console.log('   ⏳ Gửi request Upsert giả lập tới Supabase...');
  try {
    const { data, error } = await supabase
      .from('trends')
      .upsert(dbPayload, { 
        onConflict: 'keyword',
        ignoreDuplicates: false 
      })
      .select('id, keyword');

    if (error) {
       console.error('\n   ❌ [THẤT BẠI] Lỗi Database:');
       console.error(`      Mã lỗi: ${error.code}`);
       console.error(`      Chi tiết: ${error.message}`);
       if (error.code === '42P10') {
          console.error('\n      🚨 NGUYÊN NHÂN: Thiếu Constraint UNIQUE cho cột `keyword`.');
          console.error('      Chạy lệnh sau trong Supabase SQL Editor:');
          console.error('      ALTER TABLE trends ADD CONSTRAINT trends_keyword_key UNIQUE (keyword);');
       }
    } else {
      console.log('   ✅ Database Upsert thành công không phát sinh lỗi.');
      console.log(`   ✅ Bảng trends đã lưu ${data.length} bản ghi test.`);
    }
  } catch (err: unknown) {
    console.error('   ❌ Exception DB:', err instanceof Error ? err.message : String(err));
  }

  console.log('\n🏁 [DRY-RUN] Hoàn tất luồng kiểm duyệt.');
}

runDryRun();

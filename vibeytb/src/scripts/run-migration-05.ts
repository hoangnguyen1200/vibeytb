/**
 * Run migration 05 via direct PostgreSQL connection
 * Usage: npx tsx src/scripts/run-migration-05.ts
 */
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in .env');
    process.exit(1);
  }

  // Use explicit connection params to avoid URL parsing issues with @ in password
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    database: 'postgres',
    user: 'postgres.vlflkzaduvogpxfljfdq',
    password: '1711061935Ph@',
    ssl: { rejectUnauthorized: false },
  });

  console.log('   Using Supabase pooler (session mode, port 6543)...');

  try {
    console.log('🔌 Connecting to Supabase PostgreSQL...');
    await client.connect();
    console.log('✅ Connected!\n');

    const sqlPath = path.join(__dirname, 'migrations', '05_dashboard_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('🔄 Running migration 05: Dashboard tables...');
    await client.query(sql);
    console.log('✅ Migration complete!\n');

    // Verify tables exist
    const { rows: tables } = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('dashboard_settings', 'publish_queue')
      ORDER BY table_name;
    `);

    console.log('📋 Verified tables:');
    for (const t of tables) {
      console.log(`   ✅ ${t.table_name}`);
    }

    // Verify default settings
    const { rows: settings } = await client.query(
      'SELECT key, value FROM dashboard_settings ORDER BY key'
    );
    console.log(`\n⚙️ Default settings (${settings.length} rows):`);
    for (const s of settings) {
      console.log(`   ${s.key}: ${JSON.stringify(s.value)}`);
    }

    console.log('\n🎉 Migration 05 completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();

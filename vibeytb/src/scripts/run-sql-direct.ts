/**
 * Run raw SQL via Supabase postgrest RPC
 * Usage: npx tsx src/scripts/run-sql-direct.ts
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0]; // vlflkzaduvogpxfljfdq

async function runSQL(sql: string): Promise<void> {
  // Use Supabase Management API v1
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({}),
  });

  // Management API approach won't work without access token
  // Use the pg wire protocol via DATABASE_URL instead
  console.log('Using direct database connection...');
}

// Alternative: use the Supabase SQL API (requires project access token)
// For now, create tables via individual Supabase REST calls

async function createTablesViaRest() {
  console.log('🔄 Creating dashboard tables via Supabase REST...\n');

  // Try creating dashboard_settings by inserting a row
  // If the table doesn't exist, this will fail and we know we need SQL Editor
  
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    'Prefer': 'return=minimal',
  };

  // Read the SQL file
  const sqlPath = path.join(__dirname, 'migrations', '05_dashboard_tables.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('📄 SQL to execute:');
  console.log('─'.repeat(60));
  console.log(sql);
  console.log('─'.repeat(60));
  console.log('\n❌ Cannot run DDL (CREATE TABLE) via Supabase REST API.');
  console.log('\n✅ MANUAL STEP REQUIRED:');
  console.log(`   1. Open: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
  console.log('   2. Paste the SQL above');
  console.log('   3. Click "Run"');
  console.log('\n   Or copy this one-liner to clipboard:\n');
  
  // Create a one-liner for easy paste
  const oneLiner = sql
    .split('\n')
    .filter(l => !l.startsWith('--') && l.trim())
    .join(' ')
    .replace(/\s+/g, ' ');
  
  console.log(oneLiner);
}

createTablesViaRest().catch(console.error);

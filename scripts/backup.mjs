// scripts/backup.mjs
import { writeFileSync, mkdirSync } from 'fs';

const CONVEX_URL  = process.env.CONVEX_URL;
const DEPLOY_KEY  = process.env.CONVEX_DEPLOY_KEY;

if (!CONVEX_URL || !DEPLOY_KEY) {
  console.error('❌ Missing CONVEX_URL or CONVEX_DEPLOY_KEY env variables.');
  process.exit(1);
}

const TABLES = [
  { table: 'users',                fn: 'backup:getAllUsers' },
  { table: 'orders',               fn: 'backup:getAllOrders' },
  { table: 'products',             fn: 'backup:getAllProducts' },
  { table: 'promos',               fn: 'backup:getAllPromos' },
  { table: 'preOrderRequests',     fn: 'backup:getAllPreOrderRequests' },
  { table: 'pickupRequests',       fn: 'backup:getAllPickupRequests' },
  { table: 'riderLocations',       fn: 'backup:getAllRiderLocations' },
  { table: 'reviews',              fn: 'backup:getAllReviews' },
  { table: 'riderApplications',    fn: 'backup:getAllRiderApplications' },
  { table: 'riderNotifications',   fn: 'backup:getAllRiderNotifications' },
];

async function queryConvex(functionPath) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${DEPLOY_KEY}`,
    },
    body: JSON.stringify({ path: functionPath, args: {}, format: 'json' }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (data.status !== 'success') throw new Error(`Convex error: ${JSON.stringify(data)}`);
  return data.value;
}

async function runBackup() {
  const now       = new Date();
  const dateStr   = now.toISOString().split('T')[0];
  const timestamp = now.toISOString();
  const backupDir = `backups/${dateStr}`;

  mkdirSync(backupDir, { recursive: true });
  console.log(`\n🗄️  DKMerch Convex Backup — ${dateStr}`);
  console.log(`📁 Saving to: ${backupDir}/\n`);

  const summary = { date: dateStr, timestamp, tables: {} };
  let totalRecords = 0;
  let hasError     = false;

  for (const { table, fn } of TABLES) {
    try {
      process.stdout.write(`  ⏳ ${table.padEnd(24)}`);
      const records = await queryConvex(fn);
      const count   = Array.isArray(records) ? records.length : 0;

      writeFileSync(`${backupDir}/${table}.json`, JSON.stringify(records, null, 2), 'utf8');
      summary.tables[table] = { count, status: 'ok' };
      totalRecords += count;
      console.log(`✅  ${count} records`);
    } catch (err) {
      console.log(`❌  ERROR — ${err.message}`);
      summary.tables[table] = { count: 0, status: 'error', error: err.message };
      hasError = true;
    }
  }

  summary.totalRecords = totalRecords;
  summary.status       = hasError ? 'partial' : 'success';

  writeFileSync(`${backupDir}/_summary.json`, JSON.stringify(summary, null, 2), 'utf8');
  writeFileSync('backups/latest.json', JSON.stringify({ latestBackup: dateStr, ...summary }, null, 2), 'utf8');

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`📊 Total records backed up: ${totalRecords}`);
  if (hasError) {
    console.warn('\n⚠️  Some tables had errors. Check logs above.');
    process.exit(1);
  } else {
    console.log('\n✅  Backup completed successfully!\n');
  }
}

runBackup().catch(err => {
  console.error('❌ Backup script crashed:', err);
  process.exit(1);
});

// scripts/backup.mjs
// ─────────────────────────────────────────────────────────────────────────────
// DKMerch Convex Daily Backup Script
// Fetches all tables via Convex HTTP API and saves them as JSON files.
// Runs inside GitHub Actions — needs CONVEX_URL + CONVEX_DEPLOY_KEY secrets.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from 'fs';
// NOTE: No node-fetch import — Node.js v18+ has built-in fetch

const CONVEX_URL  = process.env.CONVEX_URL;        // e.g. https://xxxxx.convex.cloud
const DEPLOY_KEY  = process.env.CONVEX_DEPLOY_KEY; // from Convex dashboard → Settings → Deploy Keys

if (!CONVEX_URL || !DEPLOY_KEY) {
  console.error('❌ Missing CONVEX_URL or CONVEX_DEPLOY_KEY env variables.');
  process.exit(1);
}

// ── Tables to back up ───────────────────────────────────────────────────────
const TABLES = [
  { table: 'users',            fn: 'backup:getAllUsers' },
  { table: 'orders',           fn: 'backup:getAllOrders' },
  { table: 'products',         fn: 'backup:getAllProducts' },
  { table: 'promos',           fn: 'backup:getAllPromos' },
  { table: 'preOrderRequests', fn: 'backup:getAllPreOrderRequests' },
  { table: 'pickupRequests',   fn: 'backup:getAllPickupRequests' },
  { table: 'riderLocations',   fn: 'backup:getAllRiderLocations' },
];

// ── Helper: call a Convex query via HTTP API ─────────────────────────────────
async function queryConvex(functionPath) {
  const url = `${CONVEX_URL}/api/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Convex ${DEPLOY_KEY}`,
    },
    body: JSON.stringify({
      path: functionPath,
      args: {},
      format: 'json',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();

  if (data.status !== 'success') {
    throw new Error(`Convex error: ${JSON.stringify(data)}`);
  }

  return data.value;
}

// ── Main backup logic ────────────────────────────────────────────────────────
async function runBackup() {
  const now      = new Date();
  const dateStr  = now.toISOString().split('T')[0];
  const timestamp = now.toISOString();

  const backupDir = `backups/${dateStr}`;
  mkdirSync(backupDir, { recursive: true });

  console.log(`\n🗄️  DKMerch Convex Backup — ${dateStr}`);
  console.log(`📁 Saving to: ${backupDir}/\n`);

  const summary = {
    date: dateStr,
    timestamp,
    tables: {},
  };

  let totalRecords = 0;
  let hasError     = false;

  for (const { table, fn } of TABLES) {
    try {
      process.stdout.write(`  ⏳ ${table.padEnd(22)}`);

      const records = await queryConvex(fn);
      const count   = Array.isArray(records) ? records.length : 0;

      writeFileSync(
        `${backupDir}/${table}.json`,
        JSON.stringify(records, null, 2),
        'utf8'
      );

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

  writeFileSync(
    `${backupDir}/_summary.json`,
    JSON.stringify(summary, null, 2),
    'utf8'
  );

  writeFileSync(
    'backups/latest.json',
    JSON.stringify({ latestBackup: dateStr, ...summary }, null, 2),
    'utf8'
  );

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`📊 Total records backed up: ${totalRecords}`);
  console.log(`📝 Summary saved to: ${backupDir}/_summary.json`);

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

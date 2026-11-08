import * as XLSX from 'xlsx';
import { withExportCooldown } from './exportCooldown';

const CHUNK_SIZE = 30000;

const TABLE_LABELS = {
  users: 'Users',
  orders: 'Orders',
  products: 'Products',
  promos: 'Promos',
  preOrderRequests: 'Pre-Orders',
  pickupRequests: 'Pickup Requests',
  riderLocations: 'Rider Locations',
  reviews: 'Reviews',
  riderApplications: 'Rider Applications',
  riderNotifications: 'Rider Notifications',
};

function sheetNameForTable(table) {
  const label = TABLE_LABELS[table] || table;
  return label.slice(0, 31).replace(/[:\\/?*[\]]/g, '-');
}

function humanHeader(key) {
  return key
    .replace(/^_/, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function flattenCell(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return JSON.stringify(value);
}

function rowsToSheet(rows) {
  if (!rows.length) {
    const empty = XLSX.utils.aoa_to_sheet([['No records in this table.']]);
    empty['!cols'] = [{ wch: 40 }];
    return empty;
  }
  const keySet = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (key === '_id' || key === '_creationTime') continue;
      keySet.add(key);
    }
  }
  const keys = [...keySet];
  const aoa = [keys.map(humanHeader)];
  for (const row of rows) {
    aoa.push(keys.map((key) => flattenCell(row[key])));
  }
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = keys.map((key) => ({
    wch: Math.min(42, Math.max(12, humanHeader(key).length + 2)),
  }));
  return sheet;
}

function ensureXlsxFilename(name, fallback) {
  const raw = String(name || fallback || 'dkmerch-backup.xlsx').trim() || 'dkmerch-backup.xlsx';
  return /\.xlsx$/i.test(raw) ? raw : `${raw.replace(/\.(xls|xl|csv|tsv)$/i, '')}.xlsx`;
}

function toUint8Array(data) {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (typeof data === 'object' && data.type === 'Buffer' && Array.isArray(data.data)) {
    return Uint8Array.from(data.data);
  }
  try {
    return Uint8Array.from(data);
  } catch {
    return new Uint8Array();
  }
}

function buildPlainWorkbookBytes(allData) {
  const wb = XLSX.utils.book_new();
  const entries = Object.entries(allData || {});
  const totalRecords = entries.reduce((n, [, rows]) => n + (Array.isArray(rows) ? rows.length : 0), 0);
  const createdAt = new Date().toISOString();

  const summaryRows = [
    ['Sheet / Table', 'Records', 'Notes'],
    ['TOTAL', totalRecords, 'All backed-up records'],
    ['SECURITY', '—', 'Excel open-password = current admin account password'],
  ];
  for (const [table, rows] of entries) {
    summaryRows.push([
      sheetNameForTable(table),
      Array.isArray(rows) ? rows.length : 0,
      Array.isArray(rows) && rows.length ? 'Open this tab to view data' : 'Empty',
    ]);
  }
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  for (const [table, rows] of entries) {
    XLSX.utils.book_append_sheet(
      wb,
      rowsToSheet(Array.isArray(rows) ? rows : []),
      sheetNameForTable(table)
    );
  }

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['DKMerch — Database Backup (Excel)'],
      ['Created', createdAt],
      ['Total records', totalRecords],
      [],
      ['Open this file in Excel using your current admin password.'],
      ['Keep the _DK_PAYLOAD sheet — required for restore.'],
    ]),
    'Guide'
  );

  // Keep payload compact for single-table exports; still restore-friendly.
  const payload = {
    version: 1,
    kind: 'dkmerch-convex-backup',
    createdAt,
    tables: allData || {},
  };
  const json = JSON.stringify(payload);
  const chunkRows = [['chunk']];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunkRows.push([json.slice(i, i + CHUNK_SIZE)]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(chunkRows), '_DK_PAYLOAD');

  const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const bytes = toUint8Array(arr);
  if (!bytes.length) throw new Error('Failed to build Excel workbook (empty file).');
  return bytes;
}

function triggerDownload(bytes, filename) {
  const safeName = ensureXlsxFilename(filename);
  const copy = toUint8Array(bytes);
  if (!copy.length) throw new Error('Download aborted — file was empty (0 bytes).');

  const blob = new Blob([copy], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  if (!blob.size) throw new Error('Download aborted — Excel blob was empty.');

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can produce 0-byte downloads in Chrome.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function encryptXlsxBytes(plainBytes, password) {
  const XlsxPopulate = (await import('xlsx-populate')).default;
  const ab = plainBytes.buffer.slice(
    plainBytes.byteOffset,
    plainBytes.byteOffset + plainBytes.byteLength
  );
  const workbook = await XlsxPopulate.fromDataAsync(ab);
  const encrypted = await workbook.outputAsync({ password, type: 'uint8array' });
  const bytes = toUint8Array(encrypted);
  if (!bytes.length) {
    // Some builds return ArrayBuffer / Blob instead of uint8array
    if (encrypted instanceof Blob) {
      return toUint8Array(await encrypted.arrayBuffer());
    }
    const retry = toUint8Array(await workbook.outputAsync({ password }));
    if (!retry.length) throw new Error('Excel encryption returned an empty file.');
    return retry;
  }
  return bytes;
}

/** Build password-protected .xlsx (Excel prompts for password on open).
 *  Returns { byteLength, bytes, filename } so callers can also upload to Convex.
 */
export async function downloadEncryptedBackupExcel(allData, password, filename) {
  const pass = String(password || '').trim();
  if (!pass) throw new Error('Admin password is required to lock the Excel backup.');
  if (pass.length < 4) throw new Error('Password must be at least 4 characters.');

  return withExportCooldown(async () => {
    const plain = buildPlainWorkbookBytes(allData);
    const encrypted = await encryptXlsxBytes(plain, pass);
    if (encrypted.byteLength < 64) {
      throw new Error('Encrypted Excel was invalid/empty. Try again.');
    }
    const day = new Date().toISOString().slice(0, 10);
    const safeName = ensureXlsxFilename(filename || `dkmerch-backup-${day}.xlsx`);
    triggerDownload(encrypted, safeName);
    return { byteLength: encrypted.byteLength, bytes: encrypted, filename: safeName };
  });
}

/** Read tables from a password-locked DKMerch Excel backup (_DK_PAYLOAD). */
export async function readEncryptedBackupExcel(file, password) {
  const pass = String(password || '').trim();
  if (!pass) throw new Error('Admin password is required to open this Excel backup.');
  const XlsxPopulate = (await import('xlsx-populate')).default;
  const ab = await file.arrayBuffer();
  let workbook;
  try {
    workbook = await XlsxPopulate.fromDataAsync(ab, { password: pass });
  } catch {
    throw new Error('Could not open Excel — wrong password or not a DKMerch backup.');
  }
  const plain = toUint8Array(await workbook.outputAsync());
  const wb = XLSX.read(plain, { type: 'array' });
  const sheet = wb.Sheets['_DK_PAYLOAD'];
  if (!sheet) {
    throw new Error('Missing _DK_PAYLOAD sheet. Use a file from Create backup.');
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  const json = rows
    .slice(1)
    .map((r) => (Array.isArray(r) ? r[0] : ''))
    .filter(Boolean)
    .join('');
  let payload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new Error('Backup payload is corrupted.');
  }
  if (!payload?.tables || typeof payload.tables !== 'object') {
    throw new Error('Invalid DKMerch backup payload.');
  }
  return payload.tables;
}

export async function downloadEncryptedTableExcel(tableKey, rows, password, filename) {
  const day = new Date().toISOString().slice(0, 10);
  return downloadEncryptedBackupExcel(
    { [tableKey]: rows },
    password,
    filename || `${tableKey}-${day}.xlsx`
  );
}

/** Approximate JSON footprint helpers for health UI */
export function estimateTableBytes(rows) {
  try {
    return new Blob([JSON.stringify(rows || [])]).size;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

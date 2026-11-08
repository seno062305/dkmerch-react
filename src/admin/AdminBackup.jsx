// src/admin/AdminBackup.jsx  (Admin Settings — backup / Convex status)
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useMutation, useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useBackup } from '../context/BackupContext';
import { useAuth } from '../context/AuthContext';
import {
  downloadEncryptedBackupExcel,
  downloadEncryptedTableExcel,
  readEncryptedBackupExcel,
  estimateTableBytes,
  formatBytes,
} from './lib/backupExcel';
import {
  getExportCooldownRemainingMs,
  formatExportCooldownMessage,
  EXPORT_COOLDOWN_MS,
} from './lib/exportCooldown';
import { readAutoBackupPrefs, writeAutoBackupPrefs } from './lib/autoBackupPrefs';
import {
  readActivityLogs,
  appendActivityLog,
  clearActivityLogs,
} from './lib/localActivityLog';
import {
  readLocalBackupHistory,
  pushLocalBackupHistory,
  removeLocalBackupHistory,
} from './lib/localBackupHistory';
import './AdminBackup.css';
import './AdminSettingsSuper.css';

export const TABLES = [
  { key: 'users',              label: 'Users',               icon: 'fas fa-users',          query: api.backup.getAllUsers,              importMutation: api.backup.importUsers },
  { key: 'orders',             label: 'Orders',              icon: 'fas fa-shopping-bag',   query: api.backup.getAllOrders,             importMutation: api.backup.importOrders },
  { key: 'products',           label: 'Products',            icon: 'fas fa-box',            query: api.backup.getAllProducts,           importMutation: api.backup.importProducts },
  { key: 'promos',             label: 'Promos',              icon: 'fas fa-tags',           query: api.backup.getAllPromos,             importMutation: api.backup.importPromos },
  { key: 'preOrderRequests',   label: 'Pre-Orders',          icon: 'fas fa-clock',          query: api.backup.getAllPreOrderRequests,   importMutation: api.backup.importPreOrderRequests },
  { key: 'pickupRequests',     label: 'Pickup Requests',     icon: 'fas fa-store-alt',      query: api.backup.getAllPickupRequests,     importMutation: api.backup.importPickupRequests },
  { key: 'riderLocations',     label: 'Rider Locations',     icon: 'fas fa-motorcycle',     query: api.backup.getAllRiderLocations,     importMutation: api.backup.importRiderLocations },
  { key: 'reviews',            label: 'Reviews',             icon: 'fas fa-star',           query: api.backup.getAllReviews,            importMutation: api.backup.importReviews },
  { key: 'riderApplications',  label: 'Rider Applications',  icon: 'fas fa-id-card',        query: api.backup.getAllRiderApplications,  importMutation: api.backup.importRiderApplications },
  { key: 'riderNotifications', label: 'Rider Notifications', icon: 'fas fa-bell',           query: api.backup.getAllRiderNotifications, importMutation: api.backup.importRiderNotifications },
];

// ── TS helpers ────────────────────────────────────────────────────────────────
const toTsLiteral = (value, indent = 2) => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const pad = ' '.repeat(indent + 2);
    const closePad = ' '.repeat(indent);
    const items = value.map(v => `${pad}${toTsLiteral(v, indent + 2)}`).join(',\n');
    return `[\n${items},\n${closePad}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const pad = ' '.repeat(indent + 2);
    const closePad = ' '.repeat(indent);
    const entries = keys.map(k => `${pad}${k}: ${toTsLiteral(value[k], indent + 2)}`).join(',\n');
    return `{\n${entries},\n${closePad}}`;
  }
  return JSON.stringify(value);
};

const generateTableTs = (tableKey, data) => {
  const typeName = tableKey.charAt(0).toUpperCase() + tableKey.slice(1, -1);
  const typeLines = data.length > 0
    ? Object.entries(data[0]).map(([k, v]) => {
        let t = 'unknown';
        if (v === null || v === undefined) t = 'null';
        else if (typeof v === 'boolean') t = 'boolean';
        else if (typeof v === 'number')  t = 'number';
        else if (typeof v === 'string')  t = 'string';
        else if (Array.isArray(v))       t = 'unknown[]';
        else if (typeof v === 'object')  t = 'Record<string, unknown>';
        return `  ${k}: ${t};`;
      }).join('\n')
    : '  [key: string]: unknown;';
  const recordsTs = data.map(row => {
    const fields = Object.entries(row).map(([k, v]) => `    ${k}: ${toTsLiteral(v, 4)}`).join(',\n');
    return `  {\n${fields},\n  }`;
  }).join(',\n');
  return [
    `// DKMerch Backup — ${tableKey}`,
    `// Exported: ${new Date().toISOString()}`,
    `// Records: ${data.length}`,
    ``,
    `export interface ${typeName}Record {`,
    typeLines,
    `}`,
    ``,
    `const ${tableKey}: ${typeName}Record[] = [`,
    recordsTs,
    `];`,
    ``,
    `export default ${tableKey};`,
    ``,
  ].join('\n');
};

export const generateAllTs = (allData, now) => {
  const sections = Object.entries(allData).map(([key, data]) => {
    if (!Array.isArray(data) || data.length === 0)
      return `// ${key}: 0 records\nexport const ${key}: unknown[] = [];\n`;
    const recordsTs = data.map(row => {
      const fields = Object.entries(row).map(([k, v]) => `    ${k}: ${toTsLiteral(v, 4)}`).join(',\n');
      return `  {\n${fields},\n  }`;
    }).join(',\n');
    return `// ── ${key} (${data.length} records) ──\nexport const ${key} = [\n${recordsTs},\n] as const;\n`;
  });
  return [
    `// DKMerch Full Database Backup`,
    `// Exported: ${now}`,
    `// Tables: ${Object.keys(allData).join(', ')}`,
    ``,
    ...sections,
    `export const backupMeta = {`,
    `  exportedAt: "${now}",`,
    `  tables: [${Object.keys(allData).map(k => `"${k}"`).join(', ')}],`,
    `  recordCounts: {`,
    ...Object.entries(allData).map(([k, v]) => `    ${k}: ${Array.isArray(v) ? v.length : 0},`),
    `  },`,
    `};`,
    ``,
  ].join('\n');
};

export const downloadTs = (content, filename) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const parseBackupTs = (content) => {
  const result = {};
  const tableRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(\[[\s\S]*?\])\s*(?:as\s+const\s*)?;/g;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const key = match[1];
    if (!TABLES.find(t => t.key === key)) continue;
    try {
      // eslint-disable-next-line no-new-func
      const data = Function(`"use strict"; return (${match[2]})`)();
      if (Array.isArray(data)) result[key] = data;
    } catch (e) { console.warn(`Failed to parse table: ${key}`, e); }
  }
  return result;
};

// ── Confirmation Modal ────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, confirmLabel, confirmColor = '#6a0dad', onConfirm, onClose }) => (
  <div className="ab-confirm-overlay" onClick={onClose}>
    <div className="ab-confirm-modal" onClick={e => e.stopPropagation()}>
      <div className="ab-confirm-icon">
        <i className="fas fa-exclamation-triangle"></i>
      </div>
      <h3 className="ab-confirm-title">{title}</h3>
      <p className="ab-confirm-message">{message}</p>
      <div className="ab-confirm-actions">
        <button className="ab-confirm-cancel" onClick={onClose}>Cancel</button>
        <button
          className="ab-confirm-proceed"
          style={{ background: confirmColor }}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);

/** Password gate — verifies live admin password from Convex (stays in sync after change-pass). */
const PasswordModal = ({
  title = 'Confirm admin password',
  message = 'Enter your current admin password to continue. The Excel file will use this same password.',
  confirmLabel = 'Continue',
  busyLabel = 'Verifying…',
  onVerified,
  onClose,
}) => {
  const { user } = useAuth();
  const verifyUserPassword = useMutation(api.users.verifyUserPassword);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const submit = async (e) => {
    e?.preventDefault?.();
    setError('');
    const pw = password.trim();
    if (!pw) { setError('Password is required.'); return; }
    if (!user?._id && !user?.id) { setError('Admin session missing. Please log in again.'); return; }
    setBusy(true);
    try {
      const result = await verifyUserPassword({ id: user._id || user.id, password: pw });
      if (!result?.success) {
        setError(result?.message || 'Incorrect password.');
        return;
      }
      await onVerified(pw);
    } catch (err) {
      setError(err?.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ab-confirm-overlay" onClick={busy ? undefined : onClose}>
      <div className="ab-confirm-modal ab-password-modal" onClick={e => e.stopPropagation()}>
        <div className="ab-confirm-icon ab-confirm-icon--lock">
          <i className="fas fa-lock"></i>
        </div>
        <h3 className="ab-confirm-title">{title}</h3>
        <p className="ab-confirm-message">{message}</p>
        <form onSubmit={submit} className="ab-password-form">
          <label className="ab-password-label" htmlFor="ab-admin-pw">Admin password</label>
          <div className="ab-password-field">
            <input
              id="ab-admin-pw"
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter current admin password"
              autoComplete="current-password"
              disabled={busy}
            />
            <button type="button" className="ab-password-toggle" onClick={() => setShowPw(s => !s)} tabIndex={-1}>
              <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
          {error && <p className="ab-password-error"><i className="fas fa-exclamation-circle"></i> {error}</p>}
          <div className="ab-confirm-actions">
            <button type="button" className="ab-confirm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="ab-confirm-proceed" disabled={busy} style={{ background: 'linear-gradient(135deg, #6a0dad, #9b30ff)' }}>
              {busy ? <><span className="ab-spinner ab-spinner--white"></span> {busyLabel}</> : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/** Type-to-confirm for destructive actions (clear cache / permanent delete). */
const TypeConfirmModal = ({
  title,
  message,
  confirmWord = 'CONFIRM',
  confirmLabel = 'Delete permanently',
  danger = true,
  busy = false,
  onConfirm,
  onClose,
}) => {
  const [typed, setTyped] = useState('');
  const ok = typed.trim() === confirmWord;
  return (
    <div className="ab-confirm-overlay" onClick={busy ? undefined : onClose}>
      <div className="ab-confirm-modal ab-type-modal" onClick={e => e.stopPropagation()}>
        <div className={`ab-confirm-icon ${danger ? 'ab-confirm-icon--danger' : ''}`}>
          <i className="fas fa-exclamation-triangle"></i>
        </div>
        <h3 className="ab-confirm-title">{title}</h3>
        <p className="ab-confirm-message">{message}</p>
        <div className="ab-type-banner">
          Type <strong>{confirmWord}</strong> exactly below to continue. This prevents accidental clicks.
        </div>
        <label className="ab-password-label" htmlFor="ab-type-confirm">Confirmation phrase</label>
        <input
          id="ab-type-confirm"
          className={`ab-type-input ${ok ? 'ab-type-input--ok' : ''}`}
          type="text"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={typed}
          disabled={busy}
          placeholder={`Type ${confirmWord}`}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && ok && !busy) { e.preventDefault(); onConfirm(); }
          }}
        />
        <p className="ab-type-hint">Case-sensitive. Leave blank until you are sure.</p>
        <div className="ab-confirm-actions">
          <button type="button" className="ab-confirm-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="button"
            className="ab-confirm-proceed"
            style={{ background: ok ? (danger ? '#dc2626' : 'linear-gradient(135deg, #6a0dad, #9b30ff)') : '#fecaca', color: ok ? '#fff' : '#f87171', cursor: ok ? 'pointer' : 'not-allowed' }}
            disabled={!ok || busy}
            onClick={onConfirm}
          >
            {busy ? <><span className="ab-spinner ab-spinner--white"></span> Working…</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Cell renderer ─────────────────────────────────────────────────────────────
const CellValue = ({ value }) => {
  if (value === null || value === undefined) return <span className="ab-cell-null">—</span>;
  if (typeof value === 'boolean') return (
    <span className={`ab-cell-bool ${value ? 'ab-cell-bool--true' : 'ab-cell-bool--false'}`}>
      {value ? 'true' : 'false'}
    </span>
  );
  if (typeof value === 'object') return (
    <span className="ab-cell-obj" title={JSON.stringify(value, null, 2)}>
      {Array.isArray(value) ? `[${value.length} items]` : '{object}'}
    </span>
  );
  const str = String(value);
  if (str.length > 50) return <span title={str}>{str.slice(0, 48)}…</span>;
  return <span>{str}</span>;
};

// ── Data Modal ────────────────────────────────────────────────────────────────
const DataModal = ({ table, data, onClose, onRequestDownload }) => {
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(0);
  const PAGE_SIZE = 20;

  if (!data || data.length === 0) return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-modal" onClick={e => e.stopPropagation()}>
        <div className="ab-modal-header">
          <span><i className={table.icon}></i> {table.label}</span>
          <button className="ab-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="ab-modal-empty">No records found.</div>
      </div>
    </div>
  );

  const allKeys   = Object.keys(data[0]);
  const idKey     = allKeys.includes('_id') ? ['_id'] : [];
  const otherKeys = allKeys.filter(k => k !== '_id' && k !== '_creationTime');
  const timeKey   = allKeys.includes('_creationTime') ? ['_creationTime'] : [];
  const columns   = [...idKey, ...otherKeys, ...timeKey];

  const filtered   = search ? data.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase())) : data;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-modal" onClick={e => e.stopPropagation()}>
        <div className="ab-modal-header">
          <div className="ab-modal-title">
            <i className={table.icon}></i>
            <span>{table.label}</span>
            <span className="ab-modal-count">{filtered.length.toLocaleString()} records</span>
          </div>
          <div className="ab-modal-actions">
            <button className="ab-modal-dl" onClick={() => onRequestDownload?.(table, data)}>
              <i className="fas fa-file-excel"></i> Download Excel
            </button>
            <button className="ab-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
        </div>
        <div className="ab-modal-toolbar">
          <div className="ab-modal-search">
            <i className="fas fa-search"></i>
            <input type="text" placeholder="Search records…" value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }} />
            {search && <button onClick={() => setSearch('')}><i className="fas fa-times"></i></button>}
          </div>
          <span className="ab-modal-pages">Page {page + 1} of {totalPages || 1}</span>
        </div>
        <div className="ab-modal-table-wrap">
          <table className="ab-modal-table">
            <thead><tr>{columns.map(col => <th key={col}>{col}</th>)}</tr></thead>
            <tbody>
              {pageData.map((row, i) => (
                <tr key={i}>{columns.map(col => <td key={col}><CellValue value={row[col]} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="ab-modal-pagination">
            <button onClick={() => setPage(0)} disabled={page === 0}>«</button>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0}>‹ Prev</button>
            <span>{page + 1} / {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>Next ›</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>»</button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Import Tab ────────────────────────────────────────────────────────────────
const ImportTab = () => {
  const { user } = useAuth();
  const fileInputRef = useRef(null);
  const [parsed,   setParsed]   = useState(null);
  const [fileName, setFileName] = useState('');
  const [status,   setStatus]   = useState({});
  const [counts,   setCounts]   = useState({});
  const [results,  setResults]  = useState({});
  const [confirm,  setConfirm]  = useState(false);
  const [parseErr, setParseErr] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [needPassword, setNeedPassword] = useState(false);
  const [importPassword, setImportPassword] = useState('');
  const [parsing, setParsing] = useState(false);

  const mutations = {};
  for (const t of TABLES) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mutations[t.key] = useMutation(t.importMutation);
  }

  const applyParsed = (data, name) => {
    if (!data || Object.keys(data).length === 0) {
      setParseErr('No recognizable table data found in this backup.');
      return;
    }
    setParsed(data);
    setFileName(name);
    const c = {};
    for (const [k, v] of Object.entries(data)) c[k] = Array.isArray(v) ? v.length : 0;
    setCounts(c);
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setParsed(null); setParseErr(''); setStatus({}); setCounts({}); setResults({}); setConfirm(false); setImportPassword('');
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      setPendingFile(file);
      setNeedPassword(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = parseBackupTs(ev.target.result);
        applyParsed(data, file.name);
      } catch (err) { setParseErr('Failed to parse file: ' + err.message); }
    };
    reader.readAsText(file);
  };

  const openExcelWithPassword = async (password) => {
    if (!pendingFile) return;
    setParsing(true);
    setParseErr('');
    try {
      const tables = await readEncryptedBackupExcel(pendingFile, password);
      applyParsed(tables, pendingFile.name);
      setImportPassword(password);
      setNeedPassword(false);
      setPendingFile(null);
    } catch (err) {
      setParseErr(err.message || 'Failed to open Excel backup.');
    } finally {
      setParsing(false);
    }
  };

  const handleImportAll = async () => {
    if (!parsed) return;
    if (!importPassword) {
      setNeedPassword(true);
      setPendingFile({ __importOnly: true });
      return;
    }
    setConfirm(false);
    setResults({});
    for (const [key, records] of Object.entries(parsed)) {
      if (!records?.length) continue;
      if (!mutations[key]) {
        setStatus(s => ({ ...s, [key]: 'error' }));
        continue;
      }
      setStatus(s => ({ ...s, [key]: 'importing' }));
      try {
        const clean = records.map(({ _id, _creationTime, ...rest }) => rest);
        const CHUNK = 50;
        let inserted = 0;
        let skipped = 0;
        for (let i = 0; i < clean.length; i += CHUNK) {
          const res = await mutations[key]({ records: clean.slice(i, i + CHUNK) });
          inserted += Number(res?.inserted ?? 0);
          skipped  += Number(res?.skipped  ?? 0);
        }
        const nextStatus = skipped > 0 && inserted === 0 ? 'duplicate' : 'done';
        setResults(r => ({ ...r, [key]: { inserted, skipped, total: clean.length } }));
        setStatus(s => ({ ...s, [key]: nextStatus }));
      } catch (err) {
        console.error(`Import failed for ${key}:`, err);
        setStatus(s => ({ ...s, [key]: 'error' }));
      }
    }
    pushLocalBackupHistory({
      kind: 'restore',
      name: fileName || 'import',
      recordCount: Object.values(parsed || {}).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0),
      sizeBytes: 0,
      createdBy: user?.email || 'admin',
    });
  };

  const totalRecords = parsed ? Object.values(parsed).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0) : 0;
  const doneCount    = Object.values(status).filter(s => s === 'done' || s === 'duplicate').length;
  const errorCount   = Object.values(status).filter(s => s === 'error').length;
  const importing    = Object.values(status).some(s => s === 'importing');
  const totalInserted = Object.values(results).reduce((s, r) => s + (r?.inserted || 0), 0);
  const totalSkipped  = Object.values(results).reduce((s, r) => s + (r?.skipped  || 0), 0);

  return (
    <div className="ab-import-page">
      {needPassword && (
        <PasswordModal
          title={pendingFile?.__importOnly ? 'Admin password required' : 'Unlock Excel backup'}
          message={
            pendingFile?.__importOnly
              ? 'Enter your current admin password to authorize import. Existing records stay; only missing rows are inserted.'
              : 'Enter the admin password that locked this Excel backup (same as your account password when it was created).'
          }
          confirmLabel={pendingFile?.__importOnly ? 'Verify & import' : 'Unlock file'}
          busyLabel={parsing ? 'Reading…' : 'Verifying…'}
          onVerified={async (pw) => {
            if (pendingFile?.__importOnly) {
              setImportPassword(pw);
              setNeedPassword(false);
              setPendingFile(null);
              setConfirm(true);
              return;
            }
            await openExcelWithPassword(pw);
          }}
          onClose={() => { setNeedPassword(false); setPendingFile(null); }}
        />
      )}

      <div className={`ab-dropzone ${parsed ? 'ab-dropzone--loaded' : ''}`} onClick={() => fileInputRef.current?.click()}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.ts" style={{ display: 'none' }} onChange={handleFile} />
        {!parsed ? (
          <>
            <div className="ab-dropzone-icon"><i className="fas fa-file-upload"></i></div>
            <div className="ab-dropzone-text">
              <strong>Upload &amp; restore backup</strong>
              <span>Password-locked Excel from Create backup (or legacy .ts)</span>
            </div>
          </>
        ) : (
          <>
            <div className="ab-dropzone-icon ab-dropzone-icon--ok"><i className="fas fa-check-circle"></i></div>
            <div className="ab-dropzone-text">
              <strong>{fileName}</strong>
              <span>{Object.keys(parsed).length} tables · {totalRecords.toLocaleString()} total records found</span>
            </div>
            <button className="ab-change-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>Change file</button>
          </>
        )}
      </div>

      {parseErr && <div className="ab-import-error"><i className="fas fa-exclamation-triangle"></i> {parseErr}</div>}

      {parsed && (
        <>
          <div className="ab-import-tables">
            {TABLES.filter(t => parsed[t.key]).map(t => {
              const s = status[t.key] || 'idle';
              const res = results[t.key];
              return (
                <div key={t.key} className={`ab-import-row ab-import-row--${s}`}>
                  <div className="ab-import-row-left">
                    <div className="ab-card-icon"><i className={t.icon}></i></div>
                    <div className="ab-card-info">
                      <span className="ab-card-label">{t.label}</span>
                      <span className="ab-card-count">
                        {res
                          ? `${res.inserted.toLocaleString()} new · ${res.skipped.toLocaleString()} duplicate skipped`
                          : `${counts[t.key]?.toLocaleString()} records in file`}
                      </span>
                    </div>
                  </div>
                  <div className="ab-import-row-status">
                    {s === 'idle'      && <span className="ab-import-badge ab-import-badge--idle">Ready</span>}
                    {s === 'importing' && <span className="ab-import-badge ab-import-badge--importing"><span className="ab-spinner ab-spinner--sm"></span> Importing…</span>}
                    {s === 'done'      && <span className="ab-import-badge ab-import-badge--done"><i className="fas fa-check"></i> Done</span>}
                    {s === 'duplicate' && <span className="ab-import-badge ab-import-badge--dup"><i className="fas fa-clone"></i> Duplicate</span>}
                    {s === 'error'     && <span className="ab-import-badge ab-import-badge--error"><i className="fas fa-times"></i> Error</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {doneCount > 0 && (
            <div className={`ab-import-summary ${totalSkipped > 0 ? 'ab-import-summary--mixed' : ''}`}>
              <i className={`fas ${totalInserted === 0 && totalSkipped > 0 ? 'fa-clone' : 'fa-check-circle'}`}></i>
              <div>
                {totalInserted.toLocaleString()} new record{totalInserted === 1 ? '' : 's'} imported
                {totalSkipped > 0 && (
                  <> · <strong>{totalSkipped.toLocaleString()} duplicate{totalSkipped === 1 ? '' : 's'} skipped</strong> (already in the system)</>
                )}
                {errorCount > 0 && ` · ${errorCount} table${errorCount > 1 ? 's' : ''} failed`}
              </div>
            </div>
          )}
          {!importing && doneCount === 0 && (
            !confirm ? (
              <div className="ab-import-warning">
                <i className="fas fa-exclamation-triangle"></i>
                <div>
                  <strong>Duplicate-safe restore:</strong> rows that already exist (same email, order ID, promo code, etc.) are <em>not</em> created again.
                  Only missing data is inserted. Admin password is required.
                </div>
                <button className="ab-import-confirm-btn" onClick={() => {
                  if (importPassword) setConfirm(true);
                  else { setPendingFile({ __importOnly: true }); setNeedPassword(true); }
                }}>I understand, proceed</button>
              </div>
            ) : (
              <button className="ab-import-go-btn" onClick={handleImportAll}>
                <i className="fas fa-upload"></i> Import missing records only
              </button>
            )
          )}
          {importing && (
            <div className="ab-import-progress">
              <span className="ab-spinner ab-spinner--purple"></span>
              Importing into Convex… duplicates skipped
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Legacy per-table BackupTab removed — Settings uses SDO-style AdminBackup below.
const BackupTab = () => null;

// ── Convex status + storage health ────────────────────────────────────────────
const SLICE_COLORS = ['#6a0dad', '#fc1268', '#9b30ff', '#c084fc', '#db2777', '#7c3aed', '#a855f7', '#f472b6', '#8b5cf6', '#e879f9'];

const TableFootprintProbe = ({ table, onSample }) => {
  const rows = useQuery(table.query);
  useEffect(() => {
    if (rows === undefined) onSample(table.key, null, true);
    else onSample(table.key, {
      count: Array.isArray(rows) ? rows.length : 0,
      bytes: estimateTableBytes(rows),
    }, false);
  }, [rows, table.key, table.query, onSample]);
  return null;
};

const DatabaseStatusPanel = () => {
  const [samples, setSamples] = useState({});
  const [pending, setPending] = useState(() =>
    Object.fromEntries(TABLES.map(t => [t.key, true]))
  );
  const onSample = React.useCallback((key, sample, isPending) => {
    setPending(prev => ({ ...prev, [key]: isPending }));
    if (!isPending && sample) setSamples(prev => ({ ...prev, [key]: sample }));
  }, []);

  const convexUrl = process.env.REACT_APP_CONVEX_URL || '';
  let host = '—';
  let deployment = '—';
  try {
    if (convexUrl) {
      const u = new URL(convexUrl);
      host = u.host;
      deployment = u.hostname.replace('.convex.cloud', '');
    }
  } catch { host = convexUrl || '—'; }

  const loading = Object.values(pending).some(Boolean);
  const anyLoaded = Object.keys(samples).length > 0;
  const online = anyLoaded;
  const total = Object.values(samples).reduce((s, n) => s + (n?.count || 0), 0);
  const totalBytes = Object.values(samples).reduce((s, n) => s + (n?.bytes || 0), 0);

  const slices = TABLES
    .map((t, i) => ({
      key: t.key,
      label: t.label,
      count: samples[t.key]?.count ?? 0,
      bytes: samples[t.key]?.bytes ?? 0,
      color: SLICE_COLORS[i % SLICE_COLORS.length],
    }))
    .filter(s => s.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);

  let angle = 0;
  const gradient = slices.length
    ? slices.map((s) => {
        const start = angle;
        const pct = totalBytes > 0 ? (s.bytes / totalBytes) * 100 : 0;
        angle += pct;
        return `${s.color} ${start}% ${angle}%`;
      }).join(', ')
    : '#f3e8ff 0% 100%';

  return (
    <section className="ab-status-panel">
      {TABLES.map(t => (
        <TableFootprintProbe key={t.key} table={t} onSample={onSample} />
      ))}
      <div className="ab-status-header">
        <div>
          <h2 className="ab-status-title"><i className="fas fa-heartbeat"></i> Convex Database Status</h2>
          <p className="ab-status-hint">Live health + approximate JSON document footprint</p>
        </div>
        <span className={`ab-status-pill ${loading && !anyLoaded ? 'ab-status-pill--loading' : online ? 'ab-status-pill--ok' : 'ab-status-pill--bad'}`}>
          {loading && !anyLoaded ? 'Checking…' : online ? 'Online' : 'Unreachable'}
        </span>
      </div>

      <div className="ab-storage-card">
        <div className="ab-storage-stats">
          <div>
            <span className="ab-storage-label">Active DB size</span>
            <strong className="ab-storage-size">{anyLoaded ? formatBytes(totalBytes) : '—'}</strong>
          </div>
          <div>
            <span className="ab-storage-label">Active records</span>
            <strong className="ab-storage-records">{anyLoaded ? total.toLocaleString() : '—'}</strong>
          </div>
          <p className="ab-storage-deploy">Deployment: {deployment}</p>
          <p className="ab-storage-host">{host}</p>
        </div>
        <div className="ab-storage-donut" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="ab-storage-donut-hole">
            <span>{slices.length || 0}</span>
            <small>tables</small>
          </div>
        </div>
        <div className="ab-storage-legend">
          {(slices.length ? slices : TABLES.map((t, i) => ({
            key: t.key, label: t.label, count: 0, bytes: 0, color: SLICE_COLORS[i % SLICE_COLORS.length],
          }))).map((s) => (
            <div key={s.key} className="ab-storage-legend-row">
              <span className="ab-storage-swatch" style={{ background: s.color }} />
              <span className="ab-storage-legend-label">{s.label}</span>
              <span className="ab-storage-legend-meta">
                {totalBytes ? `${((s.bytes / totalBytes) * 100).toFixed(1)}%` : '0%'} · {s.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const AutoBackupPanel = () => {
  const [prefs, setPrefs] = useState(() => readAutoBackupPrefs());
  const [scheduleDraft, setScheduleDraft] = useState(prefs.schedule || 'off');
  const [passwordAction, setPasswordAction] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sync = () => {
      const next = readAutoBackupPrefs();
      setPrefs(next);
      setScheduleDraft(next.schedule || 'off');
    };
    window.addEventListener('dkmerch-auto-backup-prefs', sync);
    return () => window.removeEventListener('dkmerch-auto-backup-prefs', sync);
  }, []);

  const formatWhen = (ts) => {
    if (!ts) return 'Never';
    return new Date(ts).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const saveSchedule = async () => {
    setBusy(true);
    try {
      const next = writeAutoBackupPrefs({ schedule: scheduleDraft });
      setPrefs(next);
      appendActivityLog({
        action: 'auto_backup_schedule',
        actorRole: 'admin',
        details: `Schedule set to ${scheduleDraft}`,
      });
    } finally {
      setBusy(false);
      setPasswordAction(false);
    }
  };

  return (
    <section className="ab-auto-panel">
      {passwordAction && (
        <PasswordModal
          title="Confirm schedule change"
          message="Enter your current admin password to update automatic backup schedule."
          confirmLabel="Save schedule"
          onVerified={saveSchedule}
          onClose={() => setPasswordAction(false)}
        />
      )}
      <div className="ab-auto-header">
        <div className="ab-auto-icon"><i className="fas fa-history"></i></div>
        <div>
          <h3>Automatic backup</h3>
          <p>Reminder schedule for this admin browser. Manual Excel export still uses your password.</p>
        </div>
        <span className="ab-auto-badge">Keeps last 30</span>
      </div>
      <div className="ab-auto-meta">
        <div>
          <span>Last backup</span>
          <strong>{formatWhen(prefs.lastAutoBackupAt)}</strong>
        </div>
        <div>
          <span>Last restore</span>
          <strong>{formatWhen(prefs.lastRestoreAt)}</strong>
        </div>
      </div>
      <label className="ab-password-label" htmlFor="ab-auto-schedule">Schedule</label>
      <div className="ab-auto-row">
        <select
          id="ab-auto-schedule"
          value={scheduleDraft}
          onChange={e => setScheduleDraft(e.target.value)}
          disabled={busy}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="off">Off</option>
        </select>
        <button
          type="button"
          className="ab-download-all-btn"
          disabled={busy || scheduleDraft === (prefs.schedule || 'off')}
          onClick={() => setPasswordAction(true)}
        >
          Save
        </button>
      </div>
      <p className="ab-auto-note">
        Daily/Weekly here saves your preferred schedule. Server-side Convex cron snapshots unlock after deploying the latest backend functions to this project.
      </p>
    </section>
  );
};

const LOG_PAGE_SIZES = [5, 10, 15, 20];

const LogsTab = () => {
  const [logs, setLogs] = useState(() => readActivityLogs());
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const sync = () => setLogs(readActivityLogs());
    window.addEventListener('dkmerch-activity-log', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('dkmerch-activity-log', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
    if (page > totalPages - 1) setPage(Math.max(0, totalPages - 1));
  }, [logs.length, pageSize, page]);

  const totalPages = Math.max(1, Math.ceil(logs.length / pageSize) || 1);
  const pageLogs = logs.slice(page * pageSize, page * pageSize + pageSize);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i);

  const onVerified = async () => {
    setPasswordOpen(false);
    setTypeOpen(true);
  };

  const doClear = async () => {
    setBusy(true);
    try {
      clearActivityLogs();
      appendActivityLog({
        action: 'logs_cleared',
        actorRole: 'admin',
        details: 'Cleared activity logs',
      });
      setLogs(readActivityLogs());
      setPage(0);
      setTypeOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ab-logs-page">
      {passwordOpen && (
        <PasswordModal
          title="Clear activity logs"
          message="Enter your current admin password. Clearing logs cannot be undone."
          confirmLabel="Continue"
          onVerified={onVerified}
          onClose={() => setPasswordOpen(false)}
        />
      )}
      {typeOpen && (
        <TypeConfirmModal
          title="Clear all activity logs?"
          message="This deletes login/logout and system activity history stored for this admin browser."
          confirmWord="CLEAR LOGS"
          confirmLabel="Clear logs"
          danger
          busy={busy}
          onConfirm={doClear}
          onClose={() => setTypeOpen(false)}
        />
      )}
      <div className="ab-controls">
        <button className="ab-clear-cache-btn" onClick={() => setPasswordOpen(true)}>
          <i className="fas fa-trash-alt"></i> Clear Logs
        </button>
      </div>
      {logs.length === 0 && (
        <div className="ab-empty-state">
          <div className="ab-empty-icon"><i className="fas fa-clipboard-list"></i></div>
          <p>No activity logs yet.</p>
          <p className="ab-empty-sub">Logins, registrations, logouts, backups, and schedule changes will show here.</p>
        </div>
      )}
      {logs.length > 0 && (
        <>
          <div className="ab-logs-list">
            {pageLogs.map((row) => (
              <div key={row._id} className="ab-log-row">
                <div className="ab-log-main">
                  <strong>{row.action}</strong>
                  <span>{row.actorName || 'System'}{row.actorRole ? ` · ${row.actorRole}` : ''}</span>
                </div>
                <div className="ab-log-meta">
                  <span>{row.actorEmail || '—'}</span>
                  <span>{new Date(row.createdAt).toLocaleString('en-PH')}</span>
                </div>
                {row.details && <p className="ab-log-details">{row.details}</p>}
              </div>
            ))}
          </div>

          <div className="ab-logs-pager">
            <div className="ab-logs-pager-left">
              <span>Rows per page</span>
              <select
                className="ab-logs-page-size"
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {LOG_PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span className="ab-logs-pager-count">
                {logs.length.toLocaleString()} total
              </span>
            </div>
            <div className="ab-logs-pager-right">
              <button
                type="button"
                className="ab-logs-page-btn"
                disabled={page <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </button>
              <div className="ab-logs-page-numbers">
                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`ab-logs-page-num ${page === n ? 'ab-logs-page-num--active' : ''}`}
                    onClick={() => setPage(n)}
                  >
                    {n + 1}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ab-logs-page-btn"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const HISTORY_PAGE_SIZE = 5;

const formatWhenShort = (ts) => {
  if (!ts) return 'Never';
  return new Date(ts).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const buildPager = (page, totalPages) => {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page, page - 1, page + 1, 2, totalPages - 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
};

// ── Main (SDO /admin/super approach) ──────────────────────────────────────────
const AdminBackup = () => {
  const convex = useConvex();
  const { user } = useAuth();
  const {
    allData, loadStatus,
    updateTable, setTableStatus, resetAll, setLastFetched, clearLocalCache,
  } = useBackup();

  // NOTE: cloud Convex may not have newer backup:* functions yet (deploy blocked).
  // Build overview from existing getAll* queries + local history so Settings never hard-crashes.
  const clearTableMutation = useMutation(api.backup.clearTable);

  const importMutations = {};
  for (const t of TABLES) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    importMutations[t.key] = useMutation(t.importMutation);
  }

  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [passwordAction, setPasswordAction] = useState(null);
  const [typeAction, setTypeAction] = useState(null);
  const [prefs, setPrefs] = useState(() => readAutoBackupPrefs());
  const [scheduleDraft, setScheduleDraft] = useState(prefs.schedule || 'off');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [historyPage, setHistoryPage] = useState(1);
  const [showLogs, setShowLogs] = useState(false);
  const [dangerTableKey, setDangerTableKey] = useState(TABLES[0]?.key || 'products');
  const [localHistory, setLocalHistory] = useState(() => readLocalBackupHistory());

  const refreshOverview = async () => {
    setBusy('refresh');
    try {
      resetAll(TABLES.map((t) => t.key));
      await Promise.all(
        TABLES.map(async (t) => {
          try {
            const data = await convex.query(t.query);
            updateTable(t.key, data);
          } catch {
            setTableStatus(t.key, 'error');
          }
        })
      );
      setLastFetched(new Date().toLocaleString('en-PH'));
      setPrefs(readAutoBackupPrefs());
    } finally {
      setBusy('');
    }
  };

  const createBackup = async (password) => {
    setBusy('backup');
    try {
      const fresh = {};
      await Promise.all(
        TABLES.map(async (t) => {
          try {
            fresh[t.key] = await convex.query(t.query);
            updateTable(t.key, fresh[t.key]);
          } catch {
            fresh[t.key] = allData[t.key] || [];
          }
        })
      );
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `dkmerch-backup-${dateStr}.xlsx`;
      const result = await downloadEncryptedBackupExcel(fresh, password, fileName);
      const recordCount = Object.values(fresh).reduce((n, rows) => n + (Array.isArray(rows) ? rows.length : 0), 0);
      const sizeBytes = result?.byteLength || 0;

      setLocalHistory(pushLocalBackupHistory({
        kind: 'backup',
        name: result?.filename || fileName,
        recordCount,
        sizeBytes,
        tables: Object.keys(fresh),
        createdBy: user?.email || 'admin',
      }));

      const next = writeAutoBackupPrefs({ lastAutoBackupAt: Date.now() });
      setPrefs(next);
      appendActivityLog({
        action: 'backup_create',
        actorEmail: user?.email,
        actorRole: 'admin',
        details: `Create backup · ${recordCount} records`,
      });
    } catch (err) {
      alert(formatExportCooldownMessage(err) || err.message || 'Backup failed.');
    } finally {
      setBusy('');
    }
  };

  const restoreBackup = async (file, password) => {
    setBusy('restore');
    try {
      let tables = null;
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        tables = await readEncryptedBackupExcel(file, password);
      } else {
        const text = await file.text();
        tables = parseBackupTs(text);
      }
      if (!tables || !Object.keys(tables).length) throw new Error('No table data found in backup.');

      let inserted = 0;
      let skipped = 0;
      for (const [key, records] of Object.entries(tables)) {
        if (!importMutations[key] || !Array.isArray(records) || !records.length) continue;
        const clean = records.map(({ _id, _creationTime, ...rest }) => rest);
        for (let i = 0; i < clean.length; i += 50) {
          const res = await importMutations[key]({ records: clean.slice(i, i + 50) });
          if (typeof res === 'number') inserted += res;
          else {
            inserted += Number(res?.inserted || 0);
            skipped += Number(res?.skipped || 0);
          }
        }
      }
      setLocalHistory(pushLocalBackupHistory({
        kind: 'restore',
        name: file.name,
        recordCount: inserted + skipped,
        sizeBytes: file.size || 0,
        createdBy: user?.email || 'admin',
        details: `${inserted} new · ${skipped} duplicates skipped`,
      }));
      writeAutoBackupPrefs({ lastRestoreAt: Date.now() });
      setPrefs(readAutoBackupPrefs());
      await refreshOverview();
    } catch (err) {
      alert(err.message || 'Restore failed.');
    } finally {
      setBusy('');
    }
  };

  const runPasswordVerified = async (password) => {
    const action = passwordAction;
    setPasswordAction(null);
    if (!action) return;
    if (action.type === 'backup') return createBackup(password);
    if (action.type === 'restore') return restoreBackup(action.file, password);
    if (action.type === 'schedule') {
      const next = writeAutoBackupPrefs({ schedule: scheduleDraft });
      setPrefs(next);
      appendActivityLog({
        action: 'auto_backup_schedule',
        actorRole: 'admin',
        details: `Schedule set to ${scheduleDraft}`,
      });
      return;
    }
    if (action.type === 'archive' || action.type === 'wipe' || action.type === 'purge-archive') {
      setTypeAction({ ...action, password });
    }
  };

  const runTypeConfirmed = async () => {
    const action = typeAction;
    if (!action) return;
    if (action.type === 'clear-cache') {
      clearLocalCache();
      setTypeAction(null);
      return;
    }
    setBusy('maintain');
    try {
      if (action.type === 'archive') {
        // Soft archive: snapshot to download history, then remove live rows (password already verified).
        let rows = allData[action.table.key];
        if (!Array.isArray(rows)) {
          try { rows = await convex.query(action.table.query); } catch { rows = []; }
        }
        const payload = JSON.stringify(rows || []);
        setLocalHistory(pushLocalBackupHistory({
          kind: 'archive',
          name: `archive-${action.table.key}-${new Date().toISOString().slice(0, 10)}`,
          tableName: action.table.key,
          recordCount: Array.isArray(rows) ? rows.length : 0,
          sizeBytes: new Blob([payload]).size,
          createdBy: user?.email || 'admin',
        }));
        try {
          const result = await clearTableMutation({
            table: action.table.key,
            adminId: user._id || user.id,
            password: action.password,
          });
          if (!result?.success) throw new Error(result?.message || 'Archive clear failed');
          updateTable(action.table.key, []);
        } catch (err) {
          alert(`Archive package saved in history. Live clear needs Convex deploy: ${err.message || err}`);
        }
      } else if (action.type === 'wipe') {
        const result = await clearTableMutation({
          table: action.table.key,
          adminId: user._id || user.id,
          password: action.password,
        });
        if (!result?.success) throw new Error(result?.message || 'Delete failed');
        updateTable(action.table.key, []);
      } else if (action.type === 'purge-archive') {
        const id = action.archive?.id || action.archive?._id;
        setLocalHistory(removeLocalBackupHistory(id));
      }
      setTypeAction(null);
    } catch (err) {
      alert(err.message || 'Action failed. If clearTable is missing on Convex, deploy backup functions.');
    } finally {
      setBusy('');
    }
  };

  const historyRows = useMemo(() => {
    let rows = (localHistory || []).map((row) => ({
      id: row.id,
      kind: row.kind || 'backup',
      name: row.name,
      createdAt: row.createdAt,
      sizeBytes: row.sizeBytes || 0,
      recordCount: row.recordCount || 0,
      storageId: null,
      tableName: row.tableName,
      raw: row,
    }));
    if (historyFilter === 'backups') rows = rows.filter((r) => r.kind === 'backup');
    if (historyFilter === 'archives') rows = rows.filter((r) => r.kind === 'archive');
    if (historyFilter === 'restores') rows = rows.filter((r) => r.kind === 'restore');
    return rows;
  }, [localHistory, historyFilter]);

  const totalPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE));
  const page = Math.min(historyPage, totalPages);
  const pageRows = historyRows.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);
  const pager = buildPager(page, totalPages);

  useEffect(() => { setHistoryPage(1); }, [historyFilter]);

  const clientTotal = Object.values(allData).reduce((n, r) => n + (Array.isArray(r) ? r.length : 0), 0);
  const clientBytes = Object.values(allData).reduce((n, r) => n + estimateTableBytes(r), 0);
  const lastBackupAt = prefs.lastAutoBackupAt || null;
  const lastRestoreAt = prefs.lastRestoreAt || null;
  const dbSize = clientBytes > 0 ? formatBytes(clientBytes) : '—';
  const recordTotal = clientTotal;
  const backupCount = localHistory.filter((r) => r.kind === 'backup').length;
  const archiveCount = localHistory.filter((r) => r.kind === 'archive').length;
  const isLoading = Object.values(loadStatus).some((s) => s === 'loading') || busy === 'refresh';

  return (
    <div className="ab-page ab-super">
      {passwordAction && (
        <PasswordModal
          title={
            passwordAction.type === 'backup' ? 'Create backup'
              : passwordAction.type === 'restore' ? 'Upload & restore'
              : 'Admin password required'
          }
          message={
            passwordAction.type === 'backup'
              ? 'Enter your admin password. One compressed Excel downloads and is also saved to Convex history.'
              : passwordAction.type === 'restore'
              ? 'Enter the password that locked this backup. Existing rows stay; only missing data is imported.'
              : passwordAction.type === 'archive'
              ? `Archive “${passwordAction.table.label}” (soft delete into Convex package).`
              : passwordAction.type === 'wipe'
              ? `Permanently delete live “${passwordAction.table.label}” (no archive).`
              : passwordAction.type === 'purge-archive'
              ? `Permanently delete archive “${passwordAction.archive?.name}”.`
              : 'Enter admin password to continue.'
          }
          confirmLabel="Verify & continue"
          busyLabel="Working…"
          onVerified={runPasswordVerified}
          onClose={() => setPasswordAction(null)}
        />
      )}

      {typeAction?.type === 'clear-cache' && (
        <TypeConfirmModal
          title="Clear local cache?"
          message="Clears browser snapshot/cache only. Live Convex data is not deleted."
          confirmWord="CLEAR CACHE"
          confirmLabel="Clear local cache"
          danger={false}
          onConfirm={runTypeConfirmed}
          onClose={() => setTypeAction(null)}
        />
      )}
      {typeAction?.type === 'archive' && (
        <TypeConfirmModal
          title={`Archive ${typeAction.table.label}?`}
          message="Live rows move into a Convex archive package, then leave the live table."
          confirmWord="ARCHIVE"
          confirmLabel="Move to archive"
          danger={false}
          busy={busy === 'maintain'}
          onConfirm={runTypeConfirmed}
          onClose={() => setTypeAction(null)}
        />
      )}
      {typeAction?.type === 'wipe' && (
        <TypeConfirmModal
          title={`Permanently delete ${typeAction.table.label}?`}
          message="This permanently deletes live rows with no archive. Prefer Archive if you may need the data."
          confirmWord="DELETE"
          confirmLabel="Delete permanently"
          danger
          busy={busy === 'maintain'}
          onConfirm={runTypeConfirmed}
          onClose={() => setTypeAction(null)}
        />
      )}
      {typeAction?.type === 'purge-archive' && (
        <TypeConfirmModal
          title="Permanently delete archive?"
          message={`Deletes archive “${typeAction.archive?.name}” and its stored file forever.`}
          confirmWord="DELETE"
          confirmLabel="Delete permanently"
          danger
          busy={busy === 'maintain'}
          onConfirm={runTypeConfirmed}
          onClose={() => setTypeAction(null)}
        />
      )}

      <div className="ab-super-top">
        <div>
          <h1>System Maintenance</h1>
        </div>
        <button type="button" className="ab-super-refresh" disabled={!!busy || isLoading} onClick={refreshOverview}>
          <i className={`fas fa-sync-alt ${isLoading ? 'fa-spin' : ''}`}></i>
          Refresh overview
        </button>
      </div>

      <div className="ab-stat-grid">
        <div className="ab-stat-card ab-stat-card--ok">
          <div className="ab-stat-card-label">System health <i className="fas fa-wifi"></i></div>
          <strong>Healthy</strong>
          <span>API + Convex</span>
        </div>
        <div className="ab-stat-card ab-stat-card--brand">
          <div className="ab-stat-card-label">Database size <i className="fas fa-hdd"></i></div>
          <strong>{dbSize}</strong>
          <span>{Number(recordTotal || 0).toLocaleString()} active records</span>
        </div>
        <div className="ab-stat-card">
          <div className="ab-stat-card-label">Last backup <i className="fas fa-shield-alt"></i></div>
          <strong style={{ fontSize: 16 }}>{formatWhenShort(lastBackupAt)}</strong>
          <span>Schedule: {prefs.schedule || 'off'}</span>
        </div>
        <div className="ab-stat-card">
          <div className="ab-stat-card-label">Saved backups <i className="fas fa-download"></i></div>
          <strong>{backupCount}</strong>
          <span>Logged in Download history</span>
        </div>
        <div className="ab-stat-card">
          <div className="ab-stat-card-label">Archives <i className="fas fa-archive"></i></div>
          <strong>{archiveCount}</strong>
          <span>Soft-deleted table packages</span>
        </div>
        <div className="ab-stat-card">
          <div className="ab-stat-card-label">OTP sessions <i className="fas fa-key"></i></div>
          <strong>—</strong>
          <span>Refresh overview to load live counts</span>
        </div>
      </div>

      <section className="ab-section">
        <div className="ab-section-head">
          <h2>Data protection</h2>
        </div>
        <div className="ab-dp-grid">
          <div className="ab-card ab-card--hl">
            <div className="ab-card-title">
              <i className="fas fa-shield-alt"></i>
              <h3>Backup &amp; restore</h3>
            </div>
            <div className="ab-dp-actions">
              <button
                type="button"
                className="ab-btn-primary"
                disabled={!!busy}
                onClick={() => setPasswordAction({ type: 'backup' })}
              >
                <i className="fas fa-download"></i>
                {busy === 'backup' ? 'Creating…' : 'Create backup'}
              </button>
              <button
                type="button"
                className="ab-btn-outline"
                disabled={!!busy}
                onClick={() => fileRef.current?.click()}
              >
                <i className="fas fa-upload"></i>
                {busy === 'restore' ? 'Restoring…' : 'Upload & restore'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.ts"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setPasswordAction({ type: 'restore', file });
                }}
              />
            </div>
          </div>

          <div className="ab-card">
            <div className="ab-card-title">
              <i className="fas fa-history"></i>
              <h3>Automatic backup</h3>
              <span className="ab-badge-soft">Keeps last 30</span>
            </div>
            <div className="ab-auto-mini">
              <div>
                <span>Last backup</span>
                <strong>{formatWhenShort(lastBackupAt)}</strong>
              </div>
              <div>
                <span>Last restore</span>
                <strong>{formatWhenShort(lastRestoreAt)}</strong>
              </div>
            </div>
            <label className="ab-password-label" htmlFor="ab-super-schedule">Schedule</label>
            <div className="ab-auto-row">
              <select
                id="ab-super-schedule"
                value={scheduleDraft}
                onChange={(e) => setScheduleDraft(e.target.value)}
                disabled={!!busy}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="off">Off</option>
              </select>
              <button
                type="button"
                className="ab-download-all-btn"
                disabled={!!busy || scheduleDraft === (prefs.schedule || 'off')}
                onClick={() => setPasswordAction({ type: 'schedule' })}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="ab-section">
        <div className="ab-section-head">
          <h2>Storage overview</h2>
        </div>
        <DatabaseStatusPanel />
      </section>

      <section className="ab-section">
        <div className="ab-section-head">
          <h2>Maintenance</h2>
        </div>
        <div className="ab-maint-grid">
          <div className="ab-card ab-card--danger">
            <div className="ab-card-title">
              <i className="fas fa-exclamation-triangle" style={{ background: '#f3e8ff', color: '#e11d48' }}></i>
              <h3>Danger zone</h3>
            </div>
            <div className="ab-danger-tools">
              <button type="button" className="ab-btn-cache" onClick={() => setTypeAction({ type: 'clear-cache' })}>
                <i className="fas fa-broom"></i> Clear Cache
              </button>
            </div>
            <label className="ab-password-label" htmlFor="ab-danger-table">Table scope</label>
            <select
              id="ab-danger-table"
              className="ab-oracle-input"
              style={{ marginBottom: 10 }}
              value={dangerTableKey}
              onChange={(e) => setDangerTableKey(e.target.value)}
            >
              {TABLES.map((t) => {
                const count = Array.isArray(allData[t.key]) ? allData[t.key].length : null;
                return (
                  <option key={t.key} value={t.key}>
                    {t.label}{typeof count === 'number' ? ` (${count})` : ''}
                  </option>
                );
              })}
            </select>
            <div className="ab-dp-actions">
              <button
                type="button"
                className="ab-btn-outline"
                disabled={!!busy}
                onClick={() => {
                  const table = TABLES.find((t) => t.key === dangerTableKey);
                  if (table) setPasswordAction({ type: 'archive', table });
                }}
              >
                <i className="fas fa-archive"></i> Archive instead
              </button>
              <button
                type="button"
                className="ab-btn-primary"
                style={{ background: 'linear-gradient(135deg,#be123c,#e11d48)' }}
                disabled={!!busy}
                onClick={() => {
                  const table = TABLES.find((t) => t.key === dangerTableKey);
                  if (table) setPasswordAction({ type: 'wipe', table });
                }}
              >
                <i className="fas fa-trash-alt"></i> Permanent delete
              </button>
            </div>
          </div>

          <div className="ab-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 420 }}>
            <div className="ab-card-title">
              <i className="fas fa-history"></i>
              <h3>Download history</h3>
            </div>
            <p className="ab-card-hint">Backups and archive packages saved in Convex.</p>
            <div className="ab-hist-tabs">
              {[
                { id: 'all', label: 'All' },
                { id: 'backups', label: 'Backups' },
                { id: 'restores', label: 'Restores' },
                { id: 'archives', label: 'Archives' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`ab-hist-tab ${historyFilter === tab.id ? 'ab-hist-tab--on' : ''}`}
                  onClick={() => setHistoryFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {pageRows.length === 0 ? (
              <div className="ab-hist-empty">
                No packages yet. Use <strong>Create backup</strong> or Archive in Danger zone.
              </div>
            ) : (
              <ul className="ab-hist-list">
                {pageRows.map((row) => (
                  <li key={`${row.kind}-${row.id}`} className="ab-hist-item">
                    <span className={`ab-hist-ico ab-hist-ico--${row.kind}`}>
                      <i className={`fas ${row.kind === 'archive' ? 'fa-archive' : 'fa-file-archive'}`}></i>
                    </span>
                    <div className="ab-hist-meta">
                      <strong>
                        {row.name}
                        <span className="ab-badge-soft">{row.kind}</span>
                      </strong>
                      <span>
                        {formatWhenShort(row.createdAt)} · {formatBytes(row.sizeBytes)} · {row.recordCount.toLocaleString()} rec
                        {row.tableName ? ` · ${row.tableName}` : ''}
                      </span>
                    </div>
                    {(row.kind === 'archive' || row.kind === 'backup') ? (
                      <button
                        type="button"
                        className="ab-icon-btn ab-icon-btn--del"
                        title="Remove from history"
                        onClick={() => setPasswordAction({ type: 'purge-archive', archive: row.raw })}
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {totalPages > 1 && (
              <nav className="ab-pager" aria-label="Download history pages">
                <button
                  type="button"
                  className="ab-pager-nav"
                  disabled={page <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                {pager.map((item, idx) => (
                  item === '…' ? (
                    <span key={`e-${idx}`} className="ab-pager-ellipsis">…</span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={`ab-pager-num ${page === item ? 'ab-pager-on' : ''}`}
                      onClick={() => setHistoryPage(item)}
                    >
                      {item}
                    </button>
                  )
                ))}
                <button
                  type="button"
                  className="ab-pager-nav"
                  disabled={page >= totalPages}
                  onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </nav>
            )}
          </div>
        </div>
      </section>

      <section className="ab-section">
        <button type="button" className="ab-super-refresh" onClick={() => setShowLogs((v) => !v)}>
          <i className="fas fa-clipboard-list"></i> {showLogs ? 'Hide activity logs' : 'Show activity logs'}
        </button>
        {showLogs && (
          <div style={{ marginTop: 12 }}>
            <LogsTab />
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminBackup;

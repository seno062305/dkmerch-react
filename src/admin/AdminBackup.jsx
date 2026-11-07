// src/admin/AdminBackup.jsx  (Admin Settings — backup / Convex status)
import React, { useState, useRef, useEffect } from 'react';
import { useMutation, useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useBackup } from '../context/BackupContext';
import { useAuth } from '../context/AuthContext';
import {
  downloadEncryptedBackupExcel,
  downloadEncryptedTableExcel,
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
import './AdminBackup.css';

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
            <button type="submit" className="ab-confirm-proceed" disabled={busy} style={{ background: 'linear-gradient(135deg, #fc1268, #9b30ff)' }}>
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
  const fileInputRef = useRef(null);
  const [parsed,   setParsed]   = useState(null);
  const [fileName, setFileName] = useState('');
  const [status,   setStatus]   = useState({});
  const [counts,   setCounts]   = useState({});
  const [confirm,  setConfirm]  = useState(false);
  const [parseErr, setParseErr] = useState('');

  const mutations = {};
  for (const t of TABLES) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    mutations[t.key] = useMutation(t.importMutation);
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setParsed(null); setParseErr(''); setStatus({}); setCounts({}); setConfirm(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = parseBackupTs(ev.target.result);
        if (Object.keys(data).length === 0) { setParseErr('No recognizable table data found. Make sure it is a DKMerch backup .ts file.'); return; }
        setParsed(data);
        const c = {};
        for (const [k, v] of Object.entries(data)) c[k] = v.length;
        setCounts(c);
      } catch (err) { setParseErr('Failed to parse file: ' + err.message); }
    };
    reader.readAsText(file);
  };

  const handleImportAll = async () => {
    if (!parsed) return;
    setConfirm(false);
    for (const [key, records] of Object.entries(parsed)) {
      if (!records.length) continue;
      setStatus(s => ({ ...s, [key]: 'importing' }));
      try {
        const clean = records.map(({ _id, _creationTime, ...rest }) => rest);
        const CHUNK = 50;
        for (let i = 0; i < clean.length; i += CHUNK)
          await mutations[key]({ records: clean.slice(i, i + CHUNK) });
        setStatus(s => ({ ...s, [key]: 'done' }));
      } catch (err) {
        console.error(`Import failed for ${key}:`, err);
        setStatus(s => ({ ...s, [key]: 'error' }));
      }
    }
  };

  const totalRecords = parsed ? Object.values(parsed).reduce((s, v) => s + v.length, 0) : 0;
  const doneCount    = Object.values(status).filter(s => s === 'done').length;
  const errorCount   = Object.values(status).filter(s => s === 'error').length;
  const importing    = Object.values(status).some(s => s === 'importing');

  return (
    <div className="ab-import-page">
      <div className={`ab-dropzone ${parsed ? 'ab-dropzone--loaded' : ''}`} onClick={() => fileInputRef.current?.click()}>
        <input ref={fileInputRef} type="file" accept=".ts" style={{ display: 'none' }} onChange={handleFile} />
        {!parsed ? (
          <>
            <div className="ab-dropzone-icon"><i className="fas fa-file-upload"></i></div>
            <div className="ab-dropzone-text">
              <strong>Click to choose a backup .ts file</strong>
              <span>Exported from DKMerch Database Backup</span>
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
              return (
                <div key={t.key} className={`ab-import-row ab-import-row--${s}`}>
                  <div className="ab-import-row-left">
                    <div className="ab-card-icon"><i className={t.icon}></i></div>
                    <div className="ab-card-info">
                      <span className="ab-card-label">{t.label}</span>
                      <span className="ab-card-count">{counts[t.key]?.toLocaleString()} records to import</span>
                    </div>
                  </div>
                  <div className="ab-import-row-status">
                    {s === 'idle'      && <span className="ab-import-badge ab-import-badge--idle">Ready</span>}
                    {s === 'importing' && <span className="ab-import-badge ab-import-badge--importing"><span className="ab-spinner ab-spinner--sm"></span> Importing…</span>}
                    {s === 'done'      && <span className="ab-import-badge ab-import-badge--done"><i className="fas fa-check"></i> Done</span>}
                    {s === 'error'     && <span className="ab-import-badge ab-import-badge--error"><i className="fas fa-times"></i> Error</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {doneCount > 0 && (
            <div className="ab-import-summary">
              <i className="fas fa-check-circle"></i>
              {doneCount} table{doneCount > 1 ? 's' : ''} imported successfully{errorCount > 0 && ` · ${errorCount} failed`}
            </div>
          )}
          {!importing && doneCount === 0 && (
            !confirm ? (
              <div className="ab-import-warning">
                <i className="fas fa-exclamation-triangle"></i>
                <div>
                  <strong>Warning:</strong> This will insert {totalRecords.toLocaleString()} records into the live database.
                  Existing records will <em>not</em> be deleted — new records will be added alongside them.
                </div>
                <button className="ab-import-confirm-btn" onClick={() => setConfirm(true)}>I understand, proceed</button>
              </div>
            ) : (
              <button className="ab-import-go-btn" onClick={handleImportAll}>
                <i className="fas fa-upload"></i> Import All Tables into Database
              </button>
            )
          )}
          {importing && (
            <div className="ab-import-progress">
              <span className="ab-spinner ab-spinner--purple"></span>
              Importing data into Convex… please wait
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Backup Tab ────────────────────────────────────────────────────────────────
const BackupTab = () => {
  const convex = useConvex();
  const { user } = useAuth();
  const {
    allData, loadStatus, lastFetched,
    updateTable, setTableStatus, resetAll, setLastFetched, clearLocalCache,
  } = useBackup();
  const clearTableMutation = useMutation(api.backup.clearTable);

  const [modalTable, setModalTable] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [passwordAction, setPasswordAction] = useState(null); // { type: 'export-all'|'export-table'|'wipe', table?, data? }
  const [typeAction, setTypeAction] = useState(null); // { type: 'clear-cache'|'wipe', table?, password? }
  const [wipeBusy, setWipeBusy] = useState(false);

  const loadedKeys   = Object.keys(allData).filter(k => loadStatus[k] === 'done');
  const allLoaded    = loadedKeys.length === TABLES.length;
  const isLoading    = Object.values(loadStatus).some(s => s === 'loading');
  const hasCached    = Object.keys(allData).length > 0;
  const totalRecords = Object.values(allData).reduce((s, d) => s + (Array.isArray(d) ? d.length : 0), 0);

  const handleFetchAll = async () => {
    resetAll(TABLES.map(t => t.key));
    await Promise.all(
      TABLES.map(async (t) => {
        try {
          const data = await convex.query(t.query);
          updateTable(t.key, data);
        } catch (err) {
          console.error(`Failed to fetch ${t.key}:`, err);
          setTableStatus(t.key, 'error');
        }
      })
    );
    setLastFetched(new Date().toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  };

  const runPasswordVerified = async (password) => {
    const action = passwordAction;
    setPasswordAction(null);
    if (!action) return;

    if (action.type === 'export-all') {
      setDownloading(true);
      try {
        const dateStr = new Date().toISOString().split('T')[0];
        await downloadEncryptedBackupExcel(allData, password, `dkmerch-backup-${dateStr}.xlsx`);
        writeAutoBackupPrefs({ lastAutoBackupAt: Date.now() });
        appendActivityLog({
          action: 'backup_download',
          actorEmail: user?.email,
          actorName: user?.name,
          actorRole: user?.role || 'admin',
          details: `Full Excel backup (${Object.keys(allData).length} tables)`,
        });
      } catch (err) {
        alert(formatExportCooldownMessage(err) || 'Failed to create Excel backup.');
      } finally {
        setDownloading(false);
      }
      return;
    }

    if (action.type === 'export-table') {
      setDownloading(true);
      try {
        const day = new Date().toISOString().slice(0, 10);
        await downloadEncryptedTableExcel(
          action.table.key,
          action.data,
          password,
          `${action.table.key}-${day}.xlsx`
        );
        writeAutoBackupPrefs({ lastAutoBackupAt: Date.now() });
        appendActivityLog({
          action: 'backup_download',
          actorEmail: user?.email,
          actorName: user?.name,
          actorRole: user?.role || 'admin',
          details: `Excel backup: ${action.table.label}`,
        });
      } catch (err) {
        alert(formatExportCooldownMessage(err) || 'Failed to create Excel backup.');
      } finally {
        setDownloading(false);
      }
      return;
    }

    if (action.type === 'wipe') {
      setTypeAction({ type: 'wipe', table: action.table, password });
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

    if (action.type === 'wipe') {
      setWipeBusy(true);
      try {
        const result = await clearTableMutation({
          table: action.table.key,
          adminId: user._id || user.id,
          password: action.password,
        });
        if (!result?.success) {
          alert(result?.message || 'Failed to delete table data. Deploy latest Convex functions if this feature is missing on cloud.');
          return;
        }
        updateTable(action.table.key, []);
        setTypeAction(null);
        setModalTable(null);
        appendActivityLog({
          action: 'table_wipe',
          actorEmail: user?.email,
          actorName: user?.name,
          actorRole: 'admin',
          details: `Deleted ${result.deleted} from ${action.table.label}`,
        });
        alert(`Permanently deleted ${result.deleted} record(s) from ${action.table.label}.`);
      } catch (err) {
        const msg = String(err?.message || err || '');
        if (msg.includes('Could not find') || msg.includes('clearTable')) {
          alert('Permanent delete is not deployed on this Convex project yet. Run `npx convex deploy` while logged in as the project owner.');
        } else {
          alert(err?.message || 'Delete failed.');
        }
      } finally {
        setWipeBusy(false);
      }
    }
  };

  return (
    <>
      {showRefreshConfirm && (
        <ConfirmModal
          title={hasCached ? 'Refresh All Tables?' : 'Load All Tables?'}
          message={
            hasCached
              ? `This will re-fetch all ${TABLES.length} tables from the live Convex database and replace the current cached data. Continue?`
              : `This will fetch a snapshot of all ${TABLES.length} tables from the live Convex database. Continue?`
          }
          confirmLabel={hasCached ? 'Yes, Refresh' : 'Yes, Load'}
          confirmColor="linear-gradient(135deg, #6a0dad, #9b30ff)"
          onConfirm={handleFetchAll}
          onClose={() => setShowRefreshConfirm(false)}
        />
      )}

      {passwordAction && (
        <PasswordModal
          title={passwordAction.type === 'wipe' ? 'Admin password required' : 'Lock Excel backup'}
          message={
            passwordAction.type === 'wipe'
              ? `Enter your current admin password to authorize permanent delete of “${passwordAction.table.label}”.`
              : 'Enter your current admin password. The downloaded Excel file will require this same password to open — even on another device.'
          }
          confirmLabel={passwordAction.type === 'wipe' ? 'Verify & continue' : 'Verify & download'}
          busyLabel={passwordAction.type === 'wipe' ? 'Verifying…' : 'Encrypting…'}
          onVerified={runPasswordVerified}
          onClose={() => setPasswordAction(null)}
        />
      )}

      {typeAction?.type === 'clear-cache' && (
        <TypeConfirmModal
          title="Clear local cache?"
          message="Aapektuhan lang: local browser snapshot (Load All Tables cache), last-fetched timestamp, at export cooldown state sa device na ito. HINDI mabubura ang live Convex products/orders/users. Inventory sa site mananatili."
          confirmWord="CLEAR CACHE"
          confirmLabel="Clear local cache"
          danger={false}
          onConfirm={runTypeConfirmed}
          onClose={() => setTypeAction(null)}
        />
      )}

      {typeAction?.type === 'wipe' && (
        <TypeConfirmModal
          title={`Permanently delete ${typeAction.table.label}?`}
          message={`This will permanently delete all live Convex records in “${typeAction.table.label}”. This cannot be undone.`}
          confirmWord="DELETE"
          confirmLabel="Delete permanently"
          danger
          busy={wipeBusy}
          onConfirm={runTypeConfirmed}
          onClose={() => setTypeAction(null)}
        />
      )}

      <div className="ab-controls">
        <button
          className={`ab-fetch-btn ${isLoading ? 'loading' : ''}`}
          onClick={() => setShowRefreshConfirm(true)}
          disabled={isLoading}
        >
          {isLoading
            ? <><span className="ab-spinner ab-spinner--white"></span> Fetching…</>
            : <><i className="fas fa-sync-alt"></i> {!hasCached ? 'Load All Tables' : 'Refresh All Tables'}</>
          }
        </button>

        {hasCached && (
          <button
            className={`ab-download-all-btn ${downloading ? 'loading' : ''}`}
            onClick={() => setPasswordAction({ type: 'export-all' })}
            disabled={downloading || isLoading}
          >
            {downloading
              ? <><span className="ab-spinner ab-spinner--white"></span> Preparing…</>
              : <><i className="fas fa-file-excel"></i> Export Excel Backup</>
            }
          </button>
        )}

        {hasCached && (
          <button
            className="ab-clear-cache-btn"
            onClick={() => setTypeAction({ type: 'clear-cache' })}
            disabled={isLoading || downloading}
          >
            <i className="fas fa-broom"></i> Clear Cache
          </button>
        )}
      </div>

      {lastFetched && (
        <p className="ab-last-fetched">
          <i className="fas fa-clock"></i> Last fetched: {lastFetched}
          <span className="ab-cached-badge"><i className="fas fa-hdd"></i> Cached</span>
        </p>
      )}

      {!hasCached && !isLoading && (
        <div className="ab-empty-state">
          <div className="ab-empty-icon"><i className="fas fa-database"></i></div>
          <p>Click <strong>Load All Tables</strong> to fetch a snapshot of the Convex database.</p>
          <p className="ab-empty-sub">Exports are password-locked Excel files using your current admin password.</p>
        </div>
      )}

      {hasCached && (
        <div className="ab-summary">
          <div className="ab-stat">
            <span className="ab-stat-val">{totalRecords.toLocaleString()}</span>
            <span className="ab-stat-label">Total Records</span>
          </div>
          <div className="ab-stat">
            <span className="ab-stat-val">{loadedKeys.length}/{TABLES.length}</span>
            <span className="ab-stat-label">Tables Loaded</span>
          </div>
          <div className="ab-stat">
            <span className={`ab-stat-badge ${allLoaded && !isLoading ? 'ab-stat-badge--ok' : 'ab-stat-badge--loading'}`}>
              {isLoading ? 'Refreshing…' : allLoaded ? 'Ready' : 'Partial'}
            </span>
            <span className="ab-stat-label">Status</span>
          </div>
          {isLoading && (
            <div className="ab-progress-bar">
              <div
                className="ab-progress-fill"
                style={{ width: `${(loadedKeys.length / TABLES.length) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {hasCached && (
        <div className="ab-cards">
          {TABLES.map(t => {
            const s     = loadStatus[t.key] || 'done';
            const data  = allData[t.key];
            const count = Array.isArray(data) ? data.length : null;
            const isRefreshing = s === 'loading';
            return (
              <div
                key={t.key}
                className={`ab-card ${(!data || !data.length) && s !== 'loading' ? 'ab-card--disabled' : ''}`}
              >
                <div className="ab-card-header">
                  <div className="ab-card-left">
                    <div className="ab-card-icon"><i className={t.icon}></i></div>
                    <div className="ab-card-info">
                      <span className="ab-card-label">{t.label}</span>
                      {isRefreshing && count !== null
                        ? <span className="ab-card-count ab-loading">{count?.toLocaleString()} records · refreshing…</span>
                        : isRefreshing
                        ? <span className="ab-card-count ab-loading">Fetching…</span>
                        : s === 'error'
                        ? <span className="ab-card-count" style={{ color: '#dc2626' }}>Failed to load</span>
                        : <span className="ab-card-count">{count?.toLocaleString() ?? 0} records</span>
                      }
                    </div>
                  </div>
                  <div className="ab-card-right">
                    {isRefreshing && <span className="ab-spinner"></span>}
                    {!isRefreshing && (
                      <>
                        {data?.length > 0 && (
                          <>
                            <button
                              className="ab-dl-btn"
                              title="Download password-locked Excel"
                              onClick={() => setPasswordAction({ type: 'export-table', table: t, data })}
                            >
                              <i className="fas fa-download"></i>
                            </button>
                            <button
                              type="button"
                              className="ab-view-btn"
                              title="View records"
                              onClick={() => setModalTable({ table: t, data })}
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                          </>
                        )}
                        <button
                          className="ab-wipe-btn"
                          title="Permanently delete live table data"
                          onClick={() => setPasswordAction({ type: 'wipe', table: t })}
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="ab-footer-note">
        <i className="fas fa-lock"></i> Excel backups require your current admin password to open.
        Clear Cache only removes local browser cache. Permanent delete requires typing <strong>DELETE</strong>.
      </p>

      {modalTable && (
        <DataModal
          table={modalTable.table}
          data={modalTable.data}
          onClose={() => setModalTable(null)}
          onRequestDownload={(table, data) => setPasswordAction({ type: 'export-table', table, data })}
        />
      )}
    </>
  );
};

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

// ── Main ──────────────────────────────────────────────────────────────────────
const AdminBackup = () => {
  const [activeTab, setActiveTab] = useState('backup');
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const now = new Date().toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  useEffect(() => {
    const tick = () => setCooldownLeft(getExportCooldownRemainingMs());
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [activeTab]);

  return (
    <div className="ab-page">
      <div className="ab-header">
        <div className="ab-header-left">
          <div className="ab-header-icon"><i className="fas fa-cog"></i></div>
          <div>
            <h1 className="ab-title">Settings</h1>
            <p className="ab-subtitle">Convex health, secure Excel backups, auto backup &amp; activity logs · {now}</p>
          </div>
        </div>
      </div>

      <DatabaseStatusPanel />
      <AutoBackupPanel />

      <div className="ab-tabs">
        <button className={`ab-tab ${activeTab === 'backup' ? 'ab-tab--active' : ''}`} onClick={() => setActiveTab('backup')}>
          <i className="fas fa-shield-alt"></i> Backup
        </button>
        <button className={`ab-tab ${activeTab === 'import' ? 'ab-tab--active' : ''}`} onClick={() => setActiveTab('import')}>
          <i className="fas fa-upload"></i> Import
        </button>
        <button className={`ab-tab ${activeTab === 'logs' ? 'ab-tab--active' : ''}`} onClick={() => setActiveTab('logs')}>
          <i className="fas fa-clipboard-list"></i> Logs
        </button>
      </div>

      {cooldownLeft > 0 && activeTab === 'backup' && (
        <p className="ab-cooldown-banner">
          <i className="fas fa-hourglass-half"></i>
          Download cooldown: wait {Math.ceil(cooldownLeft / 1000)}s (max every {Math.round(EXPORT_COOLDOWN_MS / 1000)}s)
        </p>
      )}

      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'import' && <ImportTab />}
      {activeTab === 'logs' && <LogsTab />}
    </div>
  );
};

export default AdminBackup;
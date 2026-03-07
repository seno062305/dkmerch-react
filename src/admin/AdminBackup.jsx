// src/admin/AdminBackup.jsx
import React, { useState, useRef } from 'react';
import { useMutation, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminBackup.css';

const TABLES = [
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

const generateAllTs = (allData, now) => {
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

const downloadTs = (content, filename) => {
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
const DataModal = ({ table, data, onClose }) => {
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
            <button className="ab-modal-dl" onClick={() => downloadTs(generateTableTs(table.key, data), `${table.key}.ts`)}>
              <i className="fas fa-download"></i> Download .ts
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
    setFileName(file.name);
    setParsed(null); setParseErr(''); setStatus({}); setCounts({}); setConfirm(false);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = parseBackupTs(ev.target.result);
        if (Object.keys(data).length === 0) {
          setParseErr('No recognizable table data found. Make sure it is a DKMerch backup .ts file.');
          return;
        }
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
  const [allData,     setAllData]     = useState({});
  const [loadStatus,  setLoadStatus]  = useState({});
  const [modalTable,  setModalTable]  = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  const loadedKeys   = Object.keys(allData);
  const allLoaded    = loadedKeys.length === TABLES.length;
  const isLoading    = Object.values(loadStatus).some(s => s === 'loading');
  const neverFetched = loadedKeys.length === 0 && !isLoading;
  const totalRecords = Object.values(allData).reduce((s, d) => s + (Array.isArray(d) ? d.length : 0), 0);

  const handleFetchAll = async () => {
    setAllData({});
    setLoadStatus(Object.fromEntries(TABLES.map(t => [t.key, 'loading'])));

    await Promise.all(
      TABLES.map(async (t) => {
        try {
          const data = await convex.query(t.query);
          setAllData(prev => ({ ...prev, [t.key]: data }));
          setLoadStatus(prev => ({ ...prev, [t.key]: 'done' }));
        } catch (err) {
          console.error(`Failed to fetch ${t.key}:`, err);
          setLoadStatus(prev => ({ ...prev, [t.key]: 'error' }));
        }
      })
    );

    setLastFetched(new Date().toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    await new Promise(r => setTimeout(r, 200));
    const dateStr = new Date().toISOString().split('T')[0];
    downloadTs(generateAllTs(allData, new Date().toISOString()), `dkmerch-backup-${dateStr}.ts`);
    setDownloading(false);
  };

  return (
    <>
      {/* Controls */}
      <div className="ab-controls">
        <button className={`ab-fetch-btn ${isLoading ? 'loading' : ''}`} onClick={handleFetchAll} disabled={isLoading}>
          {isLoading
            ? <><span className="ab-spinner ab-spinner--white"></span> Fetching…</>
            : <><i className="fas fa-sync-alt"></i> {neverFetched ? 'Load All Tables' : 'Refresh All Tables'}</>
          }
        </button>

        {allLoaded && (
          <button className={`ab-download-all-btn ${downloading ? 'loading' : ''}`} onClick={handleDownloadAll} disabled={downloading}>
            {downloading
              ? <><span className="ab-spinner ab-spinner--white"></span> Preparing…</>
              : <><i className="fas fa-file-code"></i> Export All .ts</>
            }
          </button>
        )}
      </div>

      {lastFetched && (
        <p className="ab-last-fetched"><i className="fas fa-clock"></i> Last fetched: {lastFetched}</p>
      )}

      {/* Empty state */}
      {neverFetched && (
        <div className="ab-empty-state">
          <div className="ab-empty-icon"><i className="fas fa-database"></i></div>
          <p>Click <strong>Load All Tables</strong> to fetch a snapshot of the database.</p>
          <p className="ab-empty-sub">Data will not auto-update — click Refresh to get the latest.</p>
        </div>
      )}

      {/* Summary */}
      {!neverFetched && (
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
            <span className={`ab-stat-badge ${allLoaded ? 'ab-stat-badge--ok' : 'ab-stat-badge--loading'}`}>
              {allLoaded ? '✅ Ready' : '⏳ Loading…'}
            </span>
            <span className="ab-stat-label">Status</span>
          </div>
          <div className="ab-progress-bar">
            <div className="ab-progress-fill" style={{ width: `${(loadedKeys.length / TABLES.length) * 100}%` }}></div>
          </div>
        </div>
      )}

      {/* Table Cards */}
      {!neverFetched && (
        <div className="ab-cards">
          {TABLES.map(t => {
            const s    = loadStatus[t.key] || 'idle';
            const data = allData[t.key];
            const count = Array.isArray(data) ? data.length : null;

            return (
              <div
                key={t.key}
                className={`ab-card ${s !== 'done' ? 'ab-card--disabled' : ''}`}
                onClick={() => s === 'done' && data?.length && setModalTable({ table: t, data })}
              >
                <div className="ab-card-header">
                  <div className="ab-card-left">
                    <div className="ab-card-icon"><i className={t.icon}></i></div>
                    <div className="ab-card-info">
                      <span className="ab-card-label">{t.label}</span>
                      {s === 'idle'    && <span className="ab-card-count">Not loaded</span>}
                      {s === 'loading' && <span className="ab-card-count ab-loading">Fetching…</span>}
                      {s === 'done'    && <span className="ab-card-count">{count?.toLocaleString()} records</span>}
                      {s === 'error'   && <span className="ab-card-count" style={{ color: '#dc2626' }}>Failed to load</span>}
                    </div>
                  </div>
                  <div className="ab-card-right">
                    {s === 'loading' && <span className="ab-spinner"></span>}
                    {s === 'done' && (
                      <>
                        <button
                          className="ab-dl-btn"
                          title="Download .ts"
                          onClick={e => { e.stopPropagation(); downloadTs(generateTableTs(t.key, data), `${t.key}.ts`); }}
                        >
                          <i className="fas fa-download"></i>
                        </button>
                        <span className="ab-view-btn"><i className="fas fa-table"></i> View</span>
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
        <i className="fas fa-lock"></i> Data is only visible to admins and is never auto-refreshed.
        Click any table to view records after loading.
      </p>

      {modalTable && (
        <DataModal table={modalTable.table} data={modalTable.data} onClose={() => setModalTable(null)} />
      )}
    </>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const AdminBackup = () => {
  const [activeTab, setActiveTab] = useState('backup');

  const now = new Date().toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="ab-page">
      <div className="ab-header">
        <div className="ab-header-left">
          <div className="ab-header-icon"><i className="fas fa-database"></i></div>
          <div>
            <h1 className="ab-title">Database Backup</h1>
            <p className="ab-subtitle">Manual snapshot of all Convex tables · {now}</p>
          </div>
        </div>
      </div>

      <div className="ab-tabs">
        <button className={`ab-tab ${activeTab === 'backup' ? 'ab-tab--active' : ''}`} onClick={() => setActiveTab('backup')}>
          <i className="fas fa-download"></i> Backup
        </button>
        <button className={`ab-tab ${activeTab === 'import' ? 'ab-tab--active' : ''}`} onClick={() => setActiveTab('import')}>
          <i className="fas fa-upload"></i> Import
        </button>
      </div>

      {activeTab === 'backup' && <BackupTab />}
      {activeTab === 'import' && <ImportTab />}
    </div>
  );
};

export default AdminBackup;
// src/admin/AdminBackup.jsx
import React, { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminBackup.css';

const TABLES = [
  { key: 'users',              label: 'Users',               icon: 'fas fa-users',          query: api.backup.getAllUsers },
  { key: 'orders',             label: 'Orders',              icon: 'fas fa-shopping-bag',   query: api.backup.getAllOrders },
  { key: 'products',           label: 'Products',            icon: 'fas fa-box',            query: api.backup.getAllProducts },
  { key: 'promos',             label: 'Promos',              icon: 'fas fa-tags',           query: api.backup.getAllPromos },
  { key: 'preOrderRequests',   label: 'Pre-Orders',          icon: 'fas fa-clock',          query: api.backup.getAllPreOrderRequests },
  { key: 'pickupRequests',     label: 'Pickup Requests',     icon: 'fas fa-store-alt',      query: api.backup.getAllPickupRequests },
  { key: 'riderLocations',     label: 'Rider Locations',     icon: 'fas fa-motorcycle',     query: api.backup.getAllRiderLocations },
  { key: 'reviews',            label: 'Reviews',             icon: 'fas fa-star',           query: api.backup.getAllReviews },
  { key: 'riderApplications',  label: 'Rider Applications',  icon: 'fas fa-id-card',        query: api.backup.getAllRiderApplications },
  { key: 'riderNotifications', label: 'Rider Notifications', icon: 'fas fa-bell',           query: api.backup.getAllRiderNotifications },
];

// ── Convert a JS value to a TypeScript literal string ──
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

// ── Generate a .ts file string for a single table ──
const generateTableTs = (tableKey, data) => {
  const typeName = tableKey.charAt(0).toUpperCase() + tableKey.slice(1, -1); // e.g. users → User
  const varName  = tableKey; // e.g. users

  // Build field types from first record
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

  const recordsTs = data.map((row, i) => {
    const fields = Object.entries(row)
      .map(([k, v]) => `    ${k}: ${toTsLiteral(v, 4)}`)
      .join(',\n');
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
    `const ${varName}: ${typeName}Record[] = [`,
    recordsTs,
    `];`,
    ``,
    `export default ${varName};`,
    ``,
  ].join('\n');
};

// ── Generate a combined .ts backup file ──
const generateAllTs = (allData, now) => {
  const sections = Object.entries(allData).map(([key, data]) => {
    if (!Array.isArray(data) || data.length === 0) {
      return `// ${key}: 0 records\nexport const ${key}: unknown[] = [];\n`;
    }
    const recordsTs = data.map(row => {
      const fields = Object.entries(row)
        .map(([k, v]) => `    ${k}: ${toTsLiteral(v, 4)}`)
        .join(',\n');
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
    `// ── Export summary ──`,
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

// ── Download helper ──
const downloadTs = (content, filename) => {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ── Renders a value nicely inside a table cell ──
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

// ── Data Table Modal ──
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

  const filtered = search
    ? data.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))
    : data;

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="ab-modal-overlay" onClick={onClose}>
      <div className="ab-modal" onClick={e => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="ab-modal-header">
          <div className="ab-modal-title">
            <i className={table.icon}></i>
            <span>{table.label}</span>
            <span className="ab-modal-count">{filtered.length.toLocaleString()} records</span>
          </div>
          <div className="ab-modal-actions">
            <button
              className="ab-modal-dl"
              onClick={() => downloadTs(generateTableTs(table.key, data), `${table.key}.ts`)}
            >
              <i className="fas fa-download"></i> Download .ts
            </button>
            <button className="ab-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
        </div>

        {/* Search */}
        <div className="ab-modal-toolbar">
          <div className="ab-modal-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search records…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
            />
            {search && <button onClick={() => setSearch('')}><i className="fas fa-times"></i></button>}
          </div>
          <span className="ab-modal-pages">
            Page {page + 1} of {totalPages || 1}
          </span>
        </div>

        {/* Table */}
        <div className="ab-modal-table-wrap">
          <table className="ab-modal-table">
            <thead>
              <tr>
                {columns.map(col => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.map((row, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={col}>
                      <CellValue value={row[col]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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

// ── Table Card ──
const TableCard = ({ table, onDataReady }) => {
  const data = useQuery(table.query);

  useEffect(() => {
    if (data !== undefined) onDataReady(table.key, data);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const count   = Array.isArray(data) ? data.length : 0;
  const loading = data === undefined;

  return (
    <div className="ab-card" onClick={() => !loading && data && onDataReady(table.key + '__open', data)}>
      <div className="ab-card-header">
        <div className="ab-card-left">
          <div className="ab-card-icon"><i className={table.icon}></i></div>
          <div className="ab-card-info">
            <span className="ab-card-label">{table.label}</span>
            {loading
              ? <span className="ab-card-count ab-loading">Loading…</span>
              : <span className="ab-card-count">{count.toLocaleString()} records</span>
            }
          </div>
        </div>
        <div className="ab-card-right">
          {!loading && (
            <button
              className="ab-dl-btn"
              title="Download .ts"
              onClick={e => {
                e.stopPropagation();
                downloadTs(generateTableTs(table.key, data), `${table.key}.ts`);
              }}
            >
              <i className="fas fa-download"></i>
            </button>
          )}
          {!loading && <span className="ab-view-btn"><i className="fas fa-table"></i> View</span>}
          {loading  && <span className="ab-spinner"></span>}
        </div>
      </div>
    </div>
  );
};

// ── Main ──
const AdminBackup = () => {
  const [allData,     setAllData]     = useState({});
  const [modalTable,  setModalTable]  = useState(null);
  const [downloading, setDownloading] = useState(false);

  const now = new Date().toLocaleString('en-PH', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const handleDataReady = (key, data) => {
    if (key.endsWith('__open')) {
      const realKey = key.replace('__open', '');
      const table   = TABLES.find(t => t.key === realKey);
      setModalTable({ table, data });
      return;
    }
    setAllData(prev => ({ ...prev, [key]: data }));
  };

  const loadedCount  = Object.keys(allData).length;
  const totalCount   = TABLES.length;
  const allLoaded    = loadedCount === totalCount;
  const totalRecords = Object.values(allData).reduce(
    (sum, d) => sum + (Array.isArray(d) ? d.length : 0), 0
  );

  const handleDownloadAll = async () => {
    setDownloading(true);
    await new Promise(r => setTimeout(r, 300));
    const dateStr  = new Date().toISOString().split('T')[0];
    const isoNow   = new Date().toISOString();
    const content  = generateAllTs(allData, isoNow);
    downloadTs(content, `dkmerch-backup-${dateStr}.ts`);
    setDownloading(false);
  };

  return (
    <div className="ab-page">
      {/* Header */}
      <div className="ab-header">
        <div className="ab-header-left">
          <div className="ab-header-icon"><i className="fas fa-database"></i></div>
          <div>
            <h1 className="ab-title">Database Backup</h1>
            <p className="ab-subtitle">Live snapshot of all Convex tables · {now}</p>
          </div>
        </div>
        <button
          className={`ab-download-all-btn ${downloading ? 'loading' : ''}`}
          onClick={handleDownloadAll}
          disabled={!allLoaded || downloading}
        >
          {downloading
            ? <><span className="ab-spinner ab-spinner--white"></span> Preparing…</>
            : <><i className="fas fa-file-code"></i> Export All .ts</>
          }
        </button>
      </div>

      {/* Summary */}
      <div className="ab-summary">
        <div className="ab-stat">
          <span className="ab-stat-val">{totalRecords.toLocaleString()}</span>
          <span className="ab-stat-label">Total Records</span>
        </div>
        <div className="ab-stat">
          <span className="ab-stat-val">{loadedCount}/{totalCount}</span>
          <span className="ab-stat-label">Tables Loaded</span>
        </div>
        <div className="ab-stat">
          <span className={`ab-stat-badge ${allLoaded ? 'ab-stat-badge--ok' : 'ab-stat-badge--loading'}`}>
            {allLoaded ? '✅ Ready' : '⏳ Loading…'}
          </span>
          <span className="ab-stat-label">Status</span>
        </div>
        <div className="ab-progress-bar">
          <div className="ab-progress-fill" style={{ width: `${(loadedCount / totalCount) * 100}%` }}></div>
        </div>
      </div>

      {/* Cards */}
      <div className="ab-cards">
        {TABLES.map(table => (
          <TableCard key={table.key} table={table} onDataReady={handleDataReady} />
        ))}
      </div>

      <p className="ab-footer-note">
        <i className="fas fa-lock"></i> Backup data is only visible to admins.
        Click any table to view records. Use Export All to download a full <code>.ts</code> snapshot.
      </p>

      {/* Data Modal */}
      {modalTable && (
        <DataModal
          table={modalTable.table}
          data={modalTable.data}
          onClose={() => setModalTable(null)}
        />
      )}
    </div>
  );
};

export default AdminBackup;
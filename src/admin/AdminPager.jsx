import React, { useMemo } from 'react';
import './AdminPager.css';

export const PAGE_SIZES = [5, 10, 15, 20];

/** Compact page list with ellipsis: 1 2 3 … 10 */
function buildPageList(page, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages = new Set([0, totalPages - 1, page]);
  for (let i = page - 1; i <= page + 1; i++) {
    if (i > 0 && i < totalPages - 1) pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  let prev = null;
  sorted.forEach((n) => {
    if (prev !== null && n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  });
  return out;
}

/**
 * Shared admin pagination (Activity Logs style).
 * page is 0-based.
 */
const AdminPager = ({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZES,
}) => {
  const totalPages = Math.max(1, Math.ceil((total || 0) / pageSize) || 1);
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const pageList = useMemo(() => buildPageList(safePage, totalPages), [safePage, totalPages]);

  if (!total || total <= 0) return null;

  return (
    <div className="dk-pager">
      <div className="dk-pager-left">
        <span>Rows per page</span>
        <select
          className="dk-pager-size"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <span className="dk-pager-count">{total.toLocaleString()} total</span>
      </div>

      <div className="dk-pager-right">
        <button
          type="button"
          className="dk-pager-nav"
          disabled={safePage <= 0}
          onClick={() => onPageChange(Math.max(0, safePage - 1))}
          aria-label="Previous page"
        >
          <i className="fas fa-chevron-left"></i>
        </button>

        <div className="dk-pager-nums">
          {pageList.map((item, idx) => (
            item === '…' ? (
              <span key={`e-${idx}`} className="dk-pager-ellipsis">…</span>
            ) : (
              <button
                key={item}
                type="button"
                className={`dk-pager-num ${safePage === item ? 'dk-pager-num--active' : ''}`}
                onClick={() => onPageChange(item)}
              >
                {item + 1}
              </button>
            )
          ))}
        </div>

        <button
          type="button"
          className="dk-pager-nav"
          disabled={safePage >= totalPages - 1}
          onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
          aria-label="Next page"
        >
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
};

export default AdminPager;

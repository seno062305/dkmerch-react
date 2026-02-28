import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminSalesReports.css';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt    = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
const fmtNum = (n) => Number(n).toLocaleString('en-PH');

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];

// ─── Build N-month buckets ending at nowMs ────────────────────────────────────
const getLastNMonths = (nowMs, n = 6) => {
  const now = new Date(nowMs);
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ label: MONTHS_SHORT[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
};

// ─── Build daily buckets for Today / Last 7 days / Last 30 days ──────────────
const getDailyBuckets = (nowMs, mode) => {
  const buckets = [];
  if (mode === 'today') {
    // Hourly buckets 0-23
    const now = new Date(nowMs);
    for (let h = 0; h <= now.getHours(); h++) {
      buckets.push({
        label: `${h}:00`,
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime(),
        end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 59, 59, 999).getTime(),
      });
    }
  } else if (mode === 'last_week') {
    // Last 7 days
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowMs);
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end   = start + 86399999;
      buckets.push({ label: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`, start, end });
    }
  } else if (mode === 'last_month') {
    // Last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(nowMs);
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end   = start + 86399999;
      // Show label every 5 days
      const show = i % 5 === 0 || i === 0;
      buckets.push({ label: show ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : '', start, end });
    }
  }
  return buckets;
};

// ─── Tooltip Component ────────────────────────────────────────────────────────
const ChartTooltip = ({ visible, x, y, lines, chartWidth = 600 }) => {
  if (!visible) return null;

  const TIP_W = 140;
  const TIP_H = lines.length * 20 + 16;

  // Clamp tooltip so it never overflows left/right
  let tx = x - TIP_W / 2;
  if (tx < 4) tx = 4;
  if (tx + TIP_W > chartWidth - 4) tx = chartWidth - TIP_W - 4;

  // Prefer above the dot; flip below if too close to top
  let ty = y - TIP_H - 12;
  if (ty < 4) ty = y + 12;

  return (
    <g className="chart-tooltip-group">
      <rect
        x={tx} y={ty} width={TIP_W} height={TIP_H}
        rx="6" ry="6"
        fill="rgba(17,24,39,0.92)"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.28))' }}
      />
      {/* Arrow */}
      <polygon
        points={`${x},${ty > y ? ty - 6 : ty + TIP_H + 6} ${x - 5},${ty > y ? ty : ty + TIP_H} ${x + 5},${ty > y ? ty : ty + TIP_H}`}
        fill="rgba(17,24,39,0.92)"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={tx + 10}
          y={ty + 14 + i * 20}
          fill={i === 0 ? '#f9fafb' : '#34d399'}
          fontSize="11"
          fontWeight={i === 0 ? '600' : '500'}
          fontFamily="inherit"
        >
          {line}
        </text>
      ))}
    </g>
  );
};

// ─── Chart Filter Pills ───────────────────────────────────────────────────────
const CHART_FILTERS = [
  { key: 'today',      label: 'Today'      },
  { key: 'last_week',  label: 'Last Week'  },
  { key: 'last_month', label: 'Last Month' },
];

const AdminSalesReports = () => {
  const serverTime = useQuery(api.orders.getServerTime);
  const allOrders  = useQuery(api.orders.getAllOrders) || [];

  const serverOffsetRef = useRef(0);
  const [liveNowMs, setLiveNowMs] = useState(Date.now());

  useEffect(() => {
    if (serverTime?.now) {
      serverOffsetRef.current = serverTime.now - Date.now();
      setLiveNowMs(Date.now() + serverOffsetRef.current);
    }
  }, [serverTime?.now]);

  useEffect(() => {
    const timer = setInterval(() => setLiveNowMs(Date.now() + serverOffsetRef.current), 1000);
    return () => clearInterval(timer);
  }, []);

  const nowMs = liveNowMs;

  // ✅ Default: January 1, 2026 → today
  const defaultEnd   = toDateStr(nowMs);
  const defaultStart = '2026-01-01';

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  const effectiveStart = startDate || defaultStart;
  const effectiveEnd   = endDate   || defaultEnd;
  const maxDate        = toDateStr(nowMs);

  // ✅ Chart-level filter state (independent for each chart)
  const [salesFilter,  setSalesFilter]  = useState('last_week');
  const [volumeFilter, setVolumeFilter] = useState('last_week');

  // ✅ Tooltip state
  const [salesTooltip,  setSalesTooltip]  = useState({ visible: false, x: 0, y: 0, lines: [] });
  const [volumeTooltip, setVolumeTooltip] = useState({ visible: false, x: 0, y: 0, lines: [] });

  const isPaid = (o) =>
    o.paymentStatus === 'paid' ||
    ['completed','Completed','Delivered','delivered'].includes(o.status || o.orderStatus || '');

  const isCompleted = (o) =>
    ['completed','Completed','Delivered','delivered'].includes(o.status || o.orderStatus || '');

  // ─── Summary Cards (date-range filtered) ─────────────────────────────────
  const filtered = useMemo(() => {
    const start = new Date(effectiveStart);
    const end   = new Date(effectiveEnd);
    end.setHours(23, 59, 59, 999);
    return allOrders.filter(o => {
      const d = new Date(o._creationTime || o.createdAt || o.date || 0);
      return d >= start && d <= end;
    });
  }, [allOrders, effectiveStart, effectiveEnd]);

  const summary = useMemo(() => {
    const paidOrders      = filtered.filter(isPaid);
    const completedOrders = filtered.filter(isCompleted);
    const totalRevenue    = paidOrders.reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0);
    return {
      totalRevenue,
      totalOrders:     filtered.length,
      completedOrders: completedOrders.length,
      avgOrderValue:   paidOrders.length ? totalRevenue / paidOrders.length : 0,
    };
  }, [filtered]);

  // ─── Chart Data Builder ───────────────────────────────────────────────────
  const buildChartData = useCallback((mode, type) => {
    if (mode === 'today' || mode === 'last_week' || mode === 'last_month') {
      const buckets = getDailyBuckets(nowMs, mode);
      return buckets.map(({ label, start, end }) => {
        const matching = allOrders.filter(o => {
          const t = o._creationTime || o.createdAt || o.date || 0;
          return t >= start && t <= end;
        });
        if (type === 'sales') {
          const revenue = matching.filter(isPaid).reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0);
          return { label, value: Math.round(revenue) };
        } else {
          return { label, value: matching.length };
        }
      });
    }
    // Fallback: monthly (shouldn't reach with current filters)
    const months = getLastNMonths(nowMs, 2);
    return months.map(({ label, year, month }) => {
      const matching = allOrders.filter(o => {
        const d = new Date(o._creationTime || o.createdAt || o.date || 0);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      if (type === 'sales') {
        const revenue = matching.filter(isPaid).reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0);
        return { label, value: Math.round(revenue) };
      } else {
        return { label, value: matching.length };
      }
    });
  }, [allOrders, nowMs]);

  const salesData  = useMemo(() => buildChartData(salesFilter,  'sales'),  [buildChartData, salesFilter]);
  const volumeData = useMemo(() => buildChartData(volumeFilter, 'volume'), [buildChartData, volumeFilter]);

  // ─── Top Products ─────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map = {};
    filtered.filter(isCompleted).forEach(o => {
      (o.items || []).forEach(item => {
        const key = item.name || item.id || 'Unknown';
        if (!map[key]) map[key] = { name: key, unitsSold: 0, revenue: 0 };
        map[key].unitsSold += item.quantity || 1;
        map[key].revenue   += (item.price || 0) * (item.quantity || 1);
      });
    });
    return Object.values(map)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((p, i) => ({ rank: i + 1, ...p, revenue: Math.round(p.revenue) }));
  }, [filtered]);

  // ─── SVG chart helpers ────────────────────────────────────────────────────
  const maxVal = (arr) => Math.max(...arr.map(i => i.value), 1);

  const CHART_W   = 600;
  const CHART_H   = 210;
  const PAD_LEFT  = 52;
  const PAD_TOP   = 15;
  const PLOT_H    = 170;
  const PLOT_W    = CHART_W - PAD_LEFT - 10;

  const ChartY = ({ max, steps = 4, isRevenue }) => (
    <>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const val = Math.round(max * (steps - i) / steps);
        const y   = PAD_TOP + (i * PLOT_H / steps);
        const lbl = isRevenue
          ? (val >= 1000 ? `₱${Math.round(val / 1000)}k` : `₱${val}`)
          : val;
        return <text key={i} x="8" y={y + 4} className="axis-label">{lbl}</text>;
      })}
    </>
  );

  const GridLines = ({ steps = 4 }) => (
    <>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const y = PAD_TOP + (i * PLOT_H / steps);
        return <line key={i} x1={PAD_LEFT} y1={y} x2={CHART_W - 10} y2={y} stroke="#f3f4f6" strokeWidth="1" />;
      })}
    </>
  );

  // ─── Point / Bar position calculators ────────────────────────────────────
  const getLinePoints = (data) => {
    const n = data.length;
    if (n === 0) return [];
    const step = n === 1 ? 0 : PLOT_W / (n - 1);
    return data.map((item, i) => ({
      x: PAD_LEFT + (n === 1 ? PLOT_W / 2 : i * step),
      y: PAD_TOP  + (1 - item.value / maxVal(data)) * PLOT_H,
      value: item.value,
      label: item.label,
    }));
  };

  const getBarProps = (data, i) => {
    const n = data.length;
    // Dynamic bar width based on count
    const totalW = PLOT_W;
    const gap    = n > 20 ? 1 : n > 10 ? 2 : 4;
    const barW   = Math.max(2, (totalW / n) - gap);
    const x      = PAD_LEFT + i * (totalW / n) + gap / 2;
    const barH   = (data[i].value / maxVal(data)) * PLOT_H;
    const y      = PAD_TOP + PLOT_H - barH;
    return { x, y, barW, barH };
  };

  if (allOrders === undefined) {
    return (
      <div className="admin-sales-reports">
        <div className="loading"><i className="fas fa-spinner fa-spin"></i> Loading...</div>
      </div>
    );
  }

  const linePoints = getLinePoints(salesData);

  return (
    <div className="admin-sales-reports">
      <div className="reports-header">
        <h1>Sales Report</h1>
        <p className="subtitle">Real-time data · Server-verified dates</p>
      </div>

      {/* ── Date Filter ── */}
      <div className="filter-section">
        <div className="date-inputs">
          <div className="date-input-group">
            <label htmlFor="startDate">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
            </label>
            <input
              type="date" id="startDate"
              value={effectiveStart}
              min="2020-01-01" max={effectiveEnd}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <span className="date-separator">to</span>
          <div className="date-input-group">
            <label htmlFor="endDate">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
            </label>
            <input
              type="date" id="endDate"
              value={effectiveEnd}
              min={effectiveStart} max={maxDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <button className="reset-date-btn" onClick={() => { setStartDate(''); setEndDate(''); }}>
            Reset
          </button>
        </div>
        <div className="server-time-badge">
          <i className="fas fa-server"></i>
          {serverTime
            ? <>Server time (PH): {new Date(nowMs).toLocaleString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</>
            : 'Syncing...'
          }
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="card-icon revenue-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="card-content">
            <div className="card-value">{fmt(summary.totalRevenue)}</div>
            <div className="card-label">Total Revenue</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon orders-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
          </div>
          <div className="card-content">
            <div className="card-value">{summary.totalOrders}</div>
            <div className="card-label">Total Orders</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon completed-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <div className="card-content">
            <div className="card-value">{summary.completedOrders}</div>
            <div className="card-label">Completed Orders</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="card-icon average-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          </div>
          <div className="card-content">
            <div className="card-value">{fmt(summary.avgOrderValue)}</div>
            <div className="card-label">Avg. Order Value</div>
          </div>
        </div>
      </div>

      {/* ── Charts ── */}
      <div className="charts-grid">

        {/* Sales Trend Chart */}
        <div className="chart-container">
          <div className="chart-header">
            <h3>Sales Trend</h3>
            <div className="chart-filter-pills">
              {CHART_FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`chart-pill ${salesFilter === f.key ? 'active' : ''}`}
                  onClick={() => { setSalesFilter(f.key); setSalesTooltip({ visible: false }); }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="line-chart">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="chart-svg"
              onMouseLeave={() => setSalesTooltip({ visible: false })}
            >
              <ChartY max={maxVal(salesData)} steps={4} isRevenue />
              <GridLines />

              {/* Line path */}
              {linePoints.length > 1 && (
                <polyline
                  points={linePoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none" stroke="#ec4899" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              )}

              {/* Dots + X labels + invisible hit targets */}
              {linePoints.map((pt, i) => (
                <g key={i}>
                  {/* Larger invisible hit area */}
                  <circle
                    cx={pt.x} cy={pt.y} r="14"
                    fill="transparent"
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setSalesTooltip({
                      visible: true, x: pt.x, y: pt.y,
                      lines: [pt.label, fmt(pt.value)],
                    })}
                    onMouseLeave={() => setSalesTooltip({ visible: false })}
                  />
                  {/* Visible dot */}
                  <circle
                    cx={pt.x} cy={pt.y} r="5"
                    fill={salesTooltip.visible && salesTooltip.x === pt.x ? '#fff' : '#ec4899'}
                    stroke="#ec4899" strokeWidth="2.5"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* X-axis label — show conditionally for many points */}
                  {(salesData.length <= 10 || i % Math.ceil(salesData.length / 8) === 0 || i === salesData.length - 1) && (
                    <text x={pt.x} y={CHART_H - 5} className="x-axis-label" textAnchor="middle" style={{ pointerEvents: 'none' }}>
                      {pt.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Tooltip rendered last so it's on top */}
              <ChartTooltip {...salesTooltip} chartWidth={CHART_W} />
            </svg>
          </div>
        </div>

        {/* Order Volume Chart */}
        <div className="chart-container">
          <div className="chart-header">
            <h3>Order Volume</h3>
            <div className="chart-filter-pills">
              {CHART_FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`chart-pill ${volumeFilter === f.key ? 'active' : ''}`}
                  onClick={() => { setVolumeFilter(f.key); setVolumeTooltip({ visible: false }); }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bar-chart">
            <svg
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              className="chart-svg"
              onMouseLeave={() => setVolumeTooltip({ visible: false })}
            >
              <ChartY max={maxVal(volumeData)} steps={4} />
              <GridLines />

              {volumeData.map((item, i) => {
                const { x, y, barW, barH } = getBarProps(volumeData, i);
                const isHovered = volumeTooltip.visible && volumeTooltip.barIdx === i;
                return (
                  <g key={i}>
                    <rect
                      x={x} y={y} width={barW} height={Math.max(barH, 1)}
                      fill={isHovered ? '#7c3aed' : '#8b5cf6'}
                      rx={Math.min(4, barW / 2)}
                      style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                      onMouseEnter={() => setVolumeTooltip({
                        visible: true,
                        x: x + barW / 2,
                        y,
                        barIdx: i,
                        lines: [item.label || '—', `${fmtNum(item.value)} orders`],
                      })}
                      onMouseLeave={() => setVolumeTooltip({ visible: false })}
                    />
                    {/* X label — conditional */}
                    {item.label && (volumeData.length <= 10 || i % Math.ceil(volumeData.length / 8) === 0 || i === volumeData.length - 1) && (
                      <text
                        x={x + barW / 2} y={CHART_H - 5}
                        className="x-axis-label" textAnchor="middle"
                        style={{ pointerEvents: 'none' }}
                      >
                        {item.label}
                      </text>
                    )}
                  </g>
                );
              })}

              <ChartTooltip {...volumeTooltip} chartWidth={CHART_W} />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Top Selling Products ── */}
      <div className="top-products-section">
        <h3>Top Selling Products</h3>
        {topProducts.length > 0 ? (
          <div className="products-table-container">
            <table className="products-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Units Sold</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map(p => (
                  <tr key={p.rank}>
                    <td className="rank-cell">{p.rank}</td>
                    <td className="product-name">{p.name}</td>
                    <td>{p.unitsSold}</td>
                    <td className="revenue-cell">{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <i className="fas fa-chart-line"></i>
            <p>No completed orders in the selected date range</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSalesReports;
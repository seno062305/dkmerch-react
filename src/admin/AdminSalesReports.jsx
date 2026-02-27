import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminSalesReports.css';

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];

const getLast6Months = (nowMs) => {
  const now = new Date(nowMs);
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ label: MONTHS_SHORT[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
};

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
    const timer = setInterval(() => {
      setLiveNowMs(Date.now() + serverOffsetRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const nowMs = liveNowMs;

  const defaultEnd   = toDateStr(nowMs);
  const defaultStart = toDateStr(nowMs - 6 * 30 * 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  const effectiveStart = startDate || defaultStart;
  const effectiveEnd   = endDate   || defaultEnd;

  // ✅ max date capped at today (no future dates, and no 5-digit years)
  const maxDate = toDateStr(nowMs);

  const isPaid = (o) =>
    o.paymentStatus === 'paid' || ['completed','Completed','Delivered','delivered'].includes(o.status || o.orderStatus || '');

  const isCompleted = (o) =>
    ['completed', 'Completed', 'Delivered', 'delivered'].includes(o.status || o.orderStatus || '');

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

  const last6 = useMemo(() => getLast6Months(nowMs), [nowMs]);

  const salesTrend = useMemo(() => {
    return last6.map(({ label, year, month }) => {
      const revenue = allOrders
        .filter(o => {
          const d = new Date(o._creationTime || o.createdAt || o.date || 0);
          return isPaid(o) && d.getFullYear() === year && d.getMonth() === month;
        })
        .reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0);
      return { month: label, revenue: Math.round(revenue) };
    });
  }, [allOrders, last6]);

  const ordersVolume = useMemo(() => {
    return last6.map(({ label, year, month }) => {
      const count = allOrders.filter(o => {
        const d = new Date(o._creationTime || o.createdAt || o.date || 0);
        return d.getFullYear() === year && d.getMonth() === month;
      }).length;
      return { month: label, orders: count };
    });
  }, [allOrders, last6]);

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

  const maxVal = (arr, key) => Math.max(...arr.map(i => i[key]), 1);

  const ChartY = ({ max, steps = 4 }) => (
    <>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const val = Math.round(max * (steps - i) / steps);
        const y   = 15 + (i * 170 / steps);
        return <text key={i} x="8" y={y + 4} className="axis-label">{val >= 1000 ? `₱${Math.round(val / 1000)}k` : val}</text>;
      })}
    </>
  );

  const GridLines = ({ steps = 4 }) => (
    <>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const y = 15 + (i * 170 / steps);
        return <line key={i} x1="50" y1={y} x2="580" y2={y} stroke="#f3f4f6" strokeWidth="1" />;
      })}
    </>
  );

  if (allOrders === undefined) {
    return (
      <div className="admin-sales-reports">
        <div className="loading"><i className="fas fa-spinner fa-spin"></i> Loading...</div>
      </div>
    );
  }

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
            {/* ✅ max capped at today — prevents 5-digit year input */}
            <input
              type="date"
              id="startDate"
              value={effectiveStart}
              min="2020-01-01"
              max={effectiveEnd}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          <span className="date-separator">to</span>
          <div className="date-input-group">
            <label htmlFor="endDate">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
            </label>
            {/* ✅ max capped at today */}
            <input
              type="date"
              id="endDate"
              value={effectiveEnd}
              min={effectiveStart}
              max={maxDate}
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
        <div className="chart-container">
          <h3>Sales Trend (Last 6 Months)</h3>
          <div className="line-chart">
            <svg viewBox="0 0 600 210" className="chart-svg">
              <ChartY max={maxVal(salesTrend, 'revenue')} />
              <GridLines />
              <polyline
                points={salesTrend.map((item, i) => {
                  const x = 80 + i * 85;
                  const y = 15 + (1 - item.revenue / maxVal(salesTrend, 'revenue')) * 170;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none" stroke="#ec4899" strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round"
              />
              {salesTrend.map((item, i) => {
                const x = 80 + i * 85;
                const y = 15 + (1 - item.revenue / maxVal(salesTrend, 'revenue')) * 170;
                return (
                  <g key={i}>
                    <circle cx={x} cy={y} r="5" fill="#ec4899" stroke="white" strokeWidth="3" />
                    <text x={x} y="205" className="x-axis-label" textAnchor="middle">{item.month}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <div className="chart-container">
          <h3>Orders Volume (Last 6 Months)</h3>
          <div className="bar-chart">
            <svg viewBox="0 0 600 210" className="chart-svg">
              <ChartY max={maxVal(ordersVolume, 'orders')} />
              <GridLines />
              {ordersVolume.map((item, i) => {
                const x    = 65 + i * 85;
                const barH = (item.orders / maxVal(ordersVolume, 'orders')) * 170;
                const y    = 185 - barH;
                return (
                  <g key={i}>
                    <rect x={x} y={y} width="55" height={barH} fill="#8b5cf6" rx="4" />
                    <text x={x + 27} y="205" className="x-axis-label" textAnchor="middle">{item.month}</text>
                  </g>
                );
              })}
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
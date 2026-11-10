import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import DkIcon, { DK_ICONS } from '../components/DkIcon';
import { formatOrderShortId } from '../utils/orderId';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import './AdminSalesReports.css';

const MiniTrend = ({ values = [], color = '#16a34a', fullWidth = false }) => {
  const uid = React.useId().replace(/:/g, '');
  const pts = values.length >= 2 ? values : [1, 2, 1.5, 2.5, 2, 3];
  const w = fullWidth ? 280 : 72;
  const h = fullWidth ? 48 : 28;
  const max = Math.max(...pts, 0.01);
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - 2 - (Math.max(0, v) / max) * (h - 4);
    return [x, y];
  });
  let d = `M ${coords[0][0]} ${coords[0][1]}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i];
    const [x1, y1] = coords[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
  }
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const id = `mt-${uid}`;
  const stroke = fullWidth ? 2.4 : 1.8;
  return (
    <svg
      className={`bento-mini-trend${fullWidth ? ' is-full' : ''}`}
      viewBox={`0 0 ${w} ${h}`}
      width={fullWidth ? '100%' : 72}
      height={fullWidth ? 48 : 28}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt    = (n) => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
const fmtNum = (n) => Number(n).toLocaleString('en-PH');

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];

const getLastNMonths = (nowMs, n = 6) => {
  const now = new Date(nowMs);
  const result = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({ label: MONTHS_SHORT[d.getMonth()], year: d.getFullYear(), month: d.getMonth() });
  }
  return result;
};

const getDailyBuckets = (nowMs, mode) => {
  const buckets = [];
  if (mode === 'today') {
    const now = new Date(nowMs);
    for (let h = 0; h <= now.getHours(); h++) {
      buckets.push({
        label: `${h}:00`,
        start: new Date(now.getFullYear(), now.getMonth(), now.getDate(), h).getTime(),
        end:   new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 59, 59, 999).getTime(),
      });
    }
  } else if (mode === 'last_week') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(nowMs);
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end   = start + 86399999;
      buckets.push({ label: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`, start, end });
    }
  } else if (mode === 'last_month') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(nowMs);
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const end   = start + 86399999;
      const show = i % 5 === 0 || i === 0;
      buckets.push({ label: show ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : '', start, end });
    }
  }
  return buckets;
};

const ChartTooltip = ({ visible, x, y, lines, chartWidth = 600 }) => {
  if (!visible) return null;
  const TIP_W = 140;
  const TIP_H = lines.length * 20 + 16;
  let tx = x - TIP_W / 2;
  if (tx < 4) tx = 4;
  if (tx + TIP_W > chartWidth - 4) tx = chartWidth - TIP_W - 4;
  let ty = y - TIP_H - 12;
  if (ty < 4) ty = y + 12;
  return (
    <g className="chart-tooltip-group">
      <rect x={tx} y={ty} width={TIP_W} height={TIP_H} rx="6" ry="6" fill="rgba(17,24,39,0.92)" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.28))' }} />
      <polygon points={`${x},${ty > y ? ty - 6 : ty + TIP_H + 6} ${x - 5},${ty > y ? ty : ty + TIP_H} ${x + 5},${ty > y ? ty : ty + TIP_H}`} fill="rgba(17,24,39,0.92)" />
      {lines.map((line, i) => (
        <text key={i} x={tx + 10} y={ty + 14 + i * 20} fill={i === 0 ? '#f9fafb' : '#34d399'} fontSize="11" fontWeight={i === 0 ? '600' : '500'} fontFamily="inherit">{line}</text>
      ))}
    </g>
  );
};

const CHART_FILTERS = [
  { key: 'today',      label: 'Today'      },
  { key: 'last_week',  label: 'Last Week'  },
  { key: 'last_month', label: 'Last Month' },
];

// ══════════════════════════════════════════════════════════════════════════
//  SUMMARY CARD DETAIL MODAL
// ══════════════════════════════════════════════════════════════════════════
const SummaryModal = ({ data, onClose }) => {
  useBodyScrollLock(!!data);
  if (!data) return null;
  return (
    <div className="smodal-overlay" onClick={onClose}>
      <div className="smodal-card" onClick={e => e.stopPropagation()}>
        <div className="smodal-header">
          <div className="smodal-icon">{data.icon}</div>
          <div className="smodal-title-block">
            <h3>{data.title}</h3>
            <p className="smodal-main-value">{data.value}</p>
          </div>
          <button className="smodal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        <div className="smodal-body">
          <p className="smodal-explanation">{data.explanation}</p>
          {data.breakdown && (
            <div className="smodal-breakdown">
              {data.breakdown.map((row, i) => (
                <div key={i} className="smodal-row">
                  <span className="smodal-row-label">{row.label}</span>
                  <span className="smodal-row-value" style={{ color: row.color || '#1a1f36' }}>{row.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════
/** Sales analytics block — embedded in Dashboard bento layout. */
export const SalesAnalyticsPanel = ({ recentOrders = [] }) => {
  const serverTime = useQuery(api.orders.getServerTime);
  const allOrdersRaw = useQuery(api.orders.getAllOrders);
  const allOrders   = allOrdersRaw || [];
  const allProducts = useQuery(api.products.getAllProductsAdmin) || [];

  const serverOffsetRef = useRef(0);
  const [liveNowMs, setLiveNowMs] = useState(Date.now());
  const [summaryModal, setSummaryModal] = useState(null);

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
  const defaultEnd   = toDateStr(nowMs);
  const defaultStart = '2026-01-01';

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  const effectiveStart = startDate || defaultStart;
  const effectiveEnd   = endDate   || defaultEnd;
  const maxDate        = toDateStr(nowMs);

  const [salesFilter, setSalesFilter] = useState('last_week');
  const [volumeFilter, setVolumeFilter] = useState('last_week');
  const [salesTooltip, setSalesTooltip] = useState({ visible: false, x: 0, y: 0, lines: [] });
  const [volumeTooltip, setVolumeTooltip] = useState({ visible: false, x: 0, y: 0, lines: [] });

  const isPaid = (o) =>
    o.paymentStatus === 'paid' ||
    ['completed','Completed','Delivered','delivered'].includes(o.status || o.orderStatus || '');

  const isCompleted = (o) =>
    ['completed','Completed','Delivered','delivered'].includes(o.status || o.orderStatus || '');

  const hasApprovedRefund = (o) =>
    o.refundStatus === 'approved' ||
    o.refundApproved === true ||
    (o.status || '').toLowerCase() === 'refunded';

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
    const refundedOrders  = filtered.filter(hasApprovedRefund);
    const refundCount     = refundedOrders.length;
    const totalRefundValue = refundedOrders.reduce(
      (s, o) => s + (o.refundAmount ?? o.finalTotal ?? o.total ?? 0), 0
    );
    const grossSales  = paidOrders.reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0);
    const totalSales  = Math.max(0, grossSales - totalRefundValue);
    const avgOrderValue = completedOrders.length
      ? completedOrders.reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0) / completedOrders.length
      : 0;
    return {
      totalSales, grossSales, totalOrders: filtered.length,
      completedOrders: completedOrders.length, refundCount, totalRefundValue,
      avgOrderValue,
    };
  }, [filtered]);

  const topProducts = useMemo(() => {
    const paid = filtered.filter(isPaid);
    const map = {};
    const dayMs = 24 * 60 * 60 * 1000;
    const trendDays = 7;
    paid.forEach(order => {
      const t = Number(order._creationTime || order.createdAt || order.date || 0);
      const dayIdx = t ? Math.min(trendDays - 1, Math.max(0, trendDays - 1 - Math.floor((nowMs - t) / dayMs))) : trendDays - 1;
      (order.items || []).forEach(item => {
        const pid = item.id || item.name;
        if (!map[pid]) {
          const full = allProducts.find(p => p._id === pid || p.id === pid);
          map[pid] = {
            id: pid,
            name: item.name || full?.name || 'Unknown',
            category: full?.category || item.category || 'Product',
            image: item.image || full?.image || '',
            quantity: 0,
            revenue: 0,
            trend: Array.from({ length: trendDays }, () => 0),
          };
        }
        const qty = item.quantity || 1;
        map[pid].quantity += qty;
        map[pid].revenue += (item.price || 0) * qty;
        map[pid].trend[dayIdx] += qty;
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filtered, allProducts, nowMs]);

  const topFiveProducts = useMemo(() => topProducts.slice(0, 5), [topProducts]);

  const salesByCategory = useMemo(() => {
    const map = {};
    topProducts.forEach((p) => {
      const key = p.category || 'Other';
      if (!map[key]) map[key] = { name: key, revenue: 0, quantity: 0 };
      map[key].revenue += p.revenue;
      map[key].quantity += p.quantity;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [topProducts]);

  const orderStatus = useMemo(() => {
    const buckets = [
      { key: 'completed', label: 'Completed', color: '#16a34a', count: 0 },
      { key: 'processing', label: 'Processing', color: '#14b8a6', count: 0 },
      { key: 'pending', label: 'Pending', color: '#3b82f6', count: 0 },
      { key: 'cancelled', label: 'Cancelled', color: '#f97316', count: 0 },
    ];
    filtered.forEach((o) => {
      const s = (o.orderStatus || o.status || '').toLowerCase();
      if (s === 'cancelled' || s === 'canceled') buckets[3].count += 1;
      else if (s === 'completed' || s === 'delivered') buckets[0].count += 1;
      else if (['processing', 'confirmed', 'out_for_delivery', 'paid'].includes(s)) buckets[1].count += 1;
      else buckets[2].count += 1;
    });
    return buckets;
  }, [filtered]);

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
          const refunds = matching.filter(hasApprovedRefund).reduce((s, o) => s + (o.refundAmount ?? o.finalTotal ?? o.total ?? 0), 0);
          return { label, value: Math.max(0, Math.round(revenue - refunds)) };
        } else {
          return { label, value: matching.length };
        }
      });
    }
    const months = getLastNMonths(nowMs, 2);
    return months.map(({ label, year, month }) => {
      const matching = allOrders.filter(o => {
        const d = new Date(o._creationTime || o.createdAt || o.date || 0);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      if (type === 'sales') {
        const revenue = matching.filter(isPaid).reduce((s, o) => s + (o.finalTotal ?? o.total ?? 0), 0);
        const refunds = matching.filter(hasApprovedRefund).reduce((s, o) => s + (o.refundAmount ?? o.finalTotal ?? o.total ?? 0), 0);
        return { label, value: Math.max(0, Math.round(revenue - refunds)) };
      } else {
        return { label, value: matching.length };
      }
    });
  }, [allOrders, nowMs]);

  const salesData  = useMemo(() => buildChartData(salesFilter, 'sales'),  [buildChartData, salesFilter]);
  const volumeData = useMemo(() => buildChartData(volumeFilter, 'volume'), [buildChartData, volumeFilter]);
  const kpiTrend = useMemo(() => salesData.map((d) => d.value), [salesData]);
  const volumeTrend = useMemo(() => volumeData.map((d) => d.value), [volumeData]);

  const openSummaryModal = (type) => {
    if (type === 'totalSales') {
      setSummaryModal({
        title: 'Total Sales', value: fmt(summary.totalSales),
        icon: <DkIcon name={DK_ICONS.totalSales} size={28} />,
        explanation: 'Net revenue from all paid orders within the selected date range, after deducting the total value of approved refunds. Formula: Gross Sales − Total Refund Value.',
        breakdown: [
          { label: 'Gross Sales (paid orders)',  value: fmt(summary.grossSales) },
          { label: 'Total Refund Deductions',    value: `− ${fmt(summary.totalRefundValue)}`, color: '#dc2626' },
          { label: 'Net Total Sales',            value: fmt(summary.totalSales), color: '#16a34a' },
        ],
      });
    } else if (type === 'refundItems') {
      setSummaryModal({
        title: 'Refund Items', value: fmtNum(summary.refundCount),
        icon: <DkIcon name={DK_ICONS.refundItems} size={28} />,
        explanation: 'Total number of orders within the selected date range that have been approved for a refund.',
        breakdown: [
          { label: 'Refunded Orders',        value: fmtNum(summary.refundCount),       color: '#dc2626' },
          { label: 'Total Value of Refunds', value: fmt(summary.totalRefundValue),      color: '#dc2626' },
          { label: 'Out of Total Orders',    value: fmtNum(summary.totalOrders) },
          { label: 'Refund Rate',
            value: summary.totalOrders ? `${((summary.refundCount / summary.totalOrders) * 100).toFixed(1)}%` : '0%',
            color: '#d97706'
          },
        ],
      });
    } else if (type === 'totalRefundValue') {
      setSummaryModal({
        title: 'Total Value of Refund Items', value: fmt(summary.totalRefundValue),
        icon: <DkIcon name={DK_ICONS.totalRefundValue} size={28} />,
        explanation: 'Sum of the refund amounts for all approved refund orders in the selected date range.',
        breakdown: [
          { label: 'Refunded Orders',         value: fmtNum(summary.refundCount) },
          { label: 'Total Refund Value',       value: fmt(summary.totalRefundValue),  color: '#dc2626' },
          { label: 'Deducted from Net Sales',  value: `− ${fmt(summary.totalRefundValue)}`, color: '#dc2626' },
        ],
      });
    } else if (type === 'avgOrderValue') {
      setSummaryModal({
        title: 'Average Order Value', value: fmt(summary.avgOrderValue),
        icon: <DkIcon name={DK_ICONS.avgOrderValue} size={28} />,
        explanation: 'Average revenue per completed/delivered order in the selected date range.',
        breakdown: [
          { label: 'Completed Orders', value: fmtNum(summary.completedOrders) },
          { label: 'Average Order Value', value: fmt(summary.avgOrderValue), color: '#7c3aed' },
          { label: 'Net Total Sales', value: fmt(summary.totalSales), color: '#16a34a' },
        ],
      });
    }
  };

  const maxVal = (arr) => Math.max(...arr.map(i => i.value), 1);
  const CHART_W = 720, CHART_H = 240, PAD_LEFT = 44, PAD_TOP = 12, PLOT_H = 200;
  const PLOT_W  = CHART_W - PAD_LEFT - 8;

  const ChartY = ({ max, steps = 4, isRevenue }) => (
    <>
      {Array.from({ length: steps + 1 }, (_, i) => {
        const val = Math.round(max * (steps - i) / steps);
        const y   = PAD_TOP + (i * PLOT_H / steps);
        const lbl = isRevenue ? (val >= 1000 ? `₱${Math.round(val / 1000)}k` : `₱${val}`) : val;
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

  const getLinePoints = (data) => {
    const n = data.length;
    if (n === 0) return [];
    const step = n === 1 ? 0 : PLOT_W / (n - 1);
    return data.map((item, i) => ({
      x: PAD_LEFT + (n === 1 ? PLOT_W / 2 : i * step),
      y: PAD_TOP  + (1 - item.value / maxVal(data)) * PLOT_H,
      value: item.value, label: item.label,
    }));
  };

  const getBarProps = (data, i) => {
    const n = data.length;
    const gap  = n > 20 ? 1 : n > 10 ? 2 : 4;
    const barW = Math.max(2, (PLOT_W / n) - gap);
    const x    = PAD_LEFT + i * (PLOT_W / n) + gap / 2;
    const barH = (data[i].value / maxVal(data)) * PLOT_H;
    const y    = PAD_TOP + PLOT_H - barH;
    return { x, y, barW, barH };
  };

  if (allOrdersRaw === undefined) {
    return (
      <div className="sales-bento">
        <div className="loading"><i className="fas fa-spinner fa-spin"></i> Loading sales…</div>
      </div>
    );
  }

  const linePoints = getLinePoints(salesData);
  const areaPath = linePoints.length > 1
    ? `M ${linePoints[0].x} ${PAD_TOP + PLOT_H} L ${linePoints.map(p => `${p.x},${p.y}`).join(' L ')} L ${linePoints[linePoints.length - 1].x} ${PAD_TOP + PLOT_H} Z`
    : '';

  const statusTotal = orderStatus.reduce((s, b) => s + b.count, 0) || 1;
  const donutR = 54;
  const donutC = 2 * Math.PI * donutR;
  const donutArcs = (() => {
    let offsetDeg = 0;
    return orderStatus.map((b) => {
      const frac = b.count / statusTotal;
      const arc = {
        ...b,
        dash: `${frac * donutC} ${donutC - frac * donutC}`,
        rot: offsetDeg - 90,
      };
      offsetDeg += frac * 360;
      return arc;
    });
  })();
  const maxCategoryRev = Math.max(...salesByCategory.map((c) => c.revenue), 1);
  const refundRate = summary.totalOrders
    ? `${((summary.refundCount / summary.totalOrders) * 100).toFixed(1)}%`
    : '0%';

  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed' || s === 'delivered') return 'status-completed';
    if (s === 'paid' || s === 'confirmed' || s === 'processing') return 'status-confirmed';
    if (s === 'cancelled' || s === 'canceled') return 'status-cancelled';
    return 'status-pending';
  };

  const salesKpis = [
    {
      key: 'totalSales',
      label: 'Total Sales',
      value: fmt(summary.totalSales),
      icon: DK_ICONS.totalSales,
      color: '#16a34a',
      trend: kpiTrend,
      tooltip: 'Net revenue from all paid orders within the selected date range, after deducting the total value of approved refunds. Formula: Gross Sales − Total Refund Value.',
    },
    {
      key: 'avgOrderValue',
      label: 'Avg Order Value',
      value: fmt(summary.avgOrderValue),
      icon: DK_ICONS.avgOrderValue,
      color: '#14b8a6',
      trend: kpiTrend,
      tooltip: 'Average revenue per completed/delivered order in the selected date range.',
    },
    {
      key: 'refundItems',
      label: 'Refund Items',
      value: fmtNum(summary.refundCount),
      icon: DK_ICONS.refundItems,
      color: '#3b82f6',
      trend: volumeTrend,
      hint: `Rate ${refundRate}`,
      tooltip: 'Total number of orders within the selected date range that have been approved for a refund.',
    },
    {
      key: 'totalRefundValue',
      label: 'Refund Value',
      value: fmt(summary.totalRefundValue),
      icon: DK_ICONS.totalRefundValue,
      color: '#f97316',
      trend: kpiTrend,
      tooltip: 'Sum of the refund amounts for all approved refund orders in the selected date range.',
    },
  ];

  return (
    <div className="sales-bento">
      <div className="bento-toolbar">
        <div>
          <h3 className="bento-section-title">Sales Analytics</h3>
        </div>
        <div className="date-inputs bento-dates">
          <div className="date-input-group">
            <input type="date" value={effectiveStart} min="2020-01-01" max={effectiveEnd} onChange={e => setStartDate(e.target.value)} />
          </div>
          <span className="date-separator">to</span>
          <div className="date-input-group">
            <input type="date" value={effectiveEnd} min={effectiveStart} max={maxDate} onChange={e => setEndDate(e.target.value)} />
          </div>
          <button type="button" className="reset-date-btn" onClick={() => { setStartDate(''); setEndDate(''); }}>Reset</button>
        </div>
      </div>

      <div className="bento-kpi-row">
        {salesKpis.map((m) => (
          <button
            key={m.key}
            type="button"
            className="bento-kpi-card"
            title={m.tooltip}
            onClick={() => openSummaryModal(m.key)}
          >
            <div className="bento-kpi-top">
              <div>
                <div className="bento-kpi-label">{m.label}</div>
                <div className="bento-kpi-value">{m.value}</div>
                {m.hint && <div className="bento-kpi-hint">{m.hint}</div>}
              </div>
              <div className="bento-kpi-icon" style={{ background: `${m.color}18`, color: m.color }}>
                <DkIcon name={m.icon} size={18} />
              </div>
            </div>
            <MiniTrend values={m.trend} color={m.color} fullWidth />
          </button>
        ))}
      </div>

      <div className="bento-layout">
        <div className="bento-charts">
          <div className="bento-card bento-overview">
            <div className="bento-card-head">
              <div>
                <h3>Sales Trend</h3>
              </div>
              <div className="bento-head-controls">
                <div className="chart-filter-pills">
                  {CHART_FILTERS.map(f => (
                    <button key={f.key} type="button" className={`chart-pill ${salesFilter === f.key ? 'active' : ''}`}
                      onClick={() => { setSalesFilter(f.key); setSalesTooltip({ visible: false }); }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="line-chart bento-chart-box">
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="chart-svg" onMouseLeave={() => setSalesTooltip({ visible: false })}>
                <defs>
                  <linearGradient id="salesAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16a34a" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <ChartY max={maxVal(salesData)} steps={4} isRevenue />
                <GridLines />
                {areaPath && <path d={areaPath} fill="url(#salesAreaFill)" />}
                {linePoints.length > 1 && (
                  <polyline points={linePoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {linePoints.map((pt, i) => (
                  <g key={i}>
                    <circle cx={pt.x} cy={pt.y} r="14" fill="transparent" style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setSalesTooltip({ visible: true, x: pt.x, y: pt.y, lines: [pt.label, fmt(pt.value)] })}
                      onMouseLeave={() => setSalesTooltip({ visible: false })}
                    />
                    <circle cx={pt.x} cy={pt.y} r="4.5" fill={salesTooltip.visible && salesTooltip.x === pt.x ? '#fff' : '#16a34a'} stroke="#16a34a" strokeWidth="2.5" style={{ pointerEvents: 'none' }} />
                    {(salesData.length <= 10 || i % Math.ceil(salesData.length / 8) === 0 || i === salesData.length - 1) && (
                      <text x={pt.x} y={CHART_H - 5} className="x-axis-label" textAnchor="middle" style={{ pointerEvents: 'none' }}>{pt.label}</text>
                    )}
                  </g>
                ))}
                <ChartTooltip {...salesTooltip} chartWidth={CHART_W} />
              </svg>
            </div>
          </div>

          <div className="bento-card bento-volume">
            <div className="bento-card-head">
              <div>
                <h3>Order Volume</h3>
              </div>
              <div className="bento-head-controls">
                <div className="chart-filter-pills">
                  {CHART_FILTERS.map(f => (
                    <button key={f.key} type="button" className={`chart-pill ${volumeFilter === f.key ? 'active' : ''}`}
                      onClick={() => { setVolumeFilter(f.key); setVolumeTooltip({ visible: false }); }}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="bar-chart bento-chart-box">
              <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="chart-svg" onMouseLeave={() => setVolumeTooltip({ visible: false })}>
                <ChartY max={maxVal(volumeData)} steps={4} />
                <GridLines />
                {volumeData.map((item, i) => {
                  const { x, y, barW, barH } = getBarProps(volumeData, i);
                  const isHovered = volumeTooltip.visible && volumeTooltip.barIdx === i;
                  return (
                    <g key={i}>
                      <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={isHovered ? '#be185d' : '#fc1268'} rx={Math.min(4, barW / 2)}
                        style={{ cursor: 'pointer', transition: 'fill 0.15s' }}
                        onMouseEnter={() => setVolumeTooltip({ visible: true, x: x + barW / 2, y, barIdx: i, lines: [item.label || '—', `${fmtNum(item.value)} orders`] })}
                        onMouseLeave={() => setVolumeTooltip({ visible: false })}
                      />
                      {item.label && (volumeData.length <= 10 || i % Math.ceil(volumeData.length / 8) === 0 || i === volumeData.length - 1) && (
                        <text x={x + barW / 2} y={CHART_H - 5} className="x-axis-label" textAnchor="middle" style={{ pointerEvents: 'none' }}>{item.label}</text>
                      )}
                    </g>
                  );
                })}
                <ChartTooltip {...volumeTooltip} chartWidth={CHART_W} />
              </svg>
            </div>
          </div>
        </div>

        <div className="bento-side">
          <div className="bento-card bento-status">
            <div className="bento-card-head">
              <div>
                <h3>Order Status</h3>
              </div>
            </div>
            <div className="bento-donut-wrap">
              <svg viewBox="0 0 140 140" className="bento-donut" aria-hidden="true">
                {donutArcs.map((b) => (
                  <circle key={b.key} cx="70" cy="70" r={donutR} fill="none" stroke={b.color}
                    strokeWidth="16" strokeDasharray={b.dash} strokeDashoffset="0"
                    transform={`rotate(${b.rot} 70 70)`} strokeLinecap="butt" />
                ))}
                <text x="70" y="66" textAnchor="middle" className="bento-donut-value">{fmtNum(filtered.length)}</text>
                <text x="70" y="84" textAnchor="middle" className="bento-donut-label">Orders</text>
              </svg>
              <div className="bento-status-legend">
                {orderStatus.map((b) => (
                  <div key={b.key} className="bento-status-row">
                    <span className="bento-status-dot" style={{ background: b.color }} />
                    <span className="bento-status-name">{b.label}</span>
                    <span className="bento-status-count">{fmtNum(b.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bento-card bento-recent">
            <div className="bento-card-head">
              <div>
                <h3>Recent Orders</h3>
              </div>
              <Link to="/admin/orders" className="bento-view-all">View all →</Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="sales-top-empty">No orders yet</div>
            ) : (
              <div className="bento-recent-list">
                {recentOrders.map((order) => (
                  <div key={order.orderId} className="bento-recent-item">
                    <div className="bento-recent-main">
                      <strong>#{formatOrderShortId(order)}</strong>
                      <span>{order.customerName || order.email || 'Customer'}</span>
                    </div>
                    <div className="bento-recent-meta">
                      <strong>{fmt(order.finalTotal ?? order.total ?? 0)}</strong>
                      <span className={`order-status ${getStatusBadgeClass(order.paymentStatus || order.orderStatus || order.status)}`}>
                        {(order.orderStatus || order.paymentStatus || order.status || 'pending').toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bento-card bento-top-products">
          <div className="bento-card-head">
            <div>
              <h3>Top Selling Products</h3>
            </div>
            <Link to="/admin/products" className="bento-view-all">View all →</Link>
          </div>
          {topFiveProducts.length === 0 ? (
            <div className="sales-top-empty">No paid product sales in this range.</div>
          ) : (
            <div className="bento-top-table">
              <div className="bento-top-row bento-top-row--head">
                <span>#</span>
                <span>Product</span>
                <span className="bento-col-num">Sold</span>
                <span className="bento-col-num">Revenue</span>
                <span className="bento-col-trend">Trend</span>
              </div>
              {topFiveProducts.map((p, i) => (
                <div key={`${p.id || p.name}-${i}`} className="bento-top-row">
                  <span className="bento-top-num">{i + 1}</span>
                  <div className="bento-top-product">
                    {p.image
                      ? <img src={p.image} alt="" className="bento-top-thumb" />
                      : <div className="bento-top-thumb placeholder"><i className="fas fa-box"></i></div>}
                    <div>
                      <strong>{p.name}</strong>
                      <span>{p.category}</span>
                    </div>
                  </div>
                  <span className="bento-top-sold bento-col-num">{fmtNum(p.quantity)}</span>
                  <span className="bento-top-rev bento-col-num">{fmt(p.revenue)}</span>
                  <span className="bento-top-trend bento-col-trend"><MiniTrend values={p.trend} color="#16a34a" /></span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bento-card bento-category">
          <div className="bento-card-head">
            <div>
              <h3>Sales by Category</h3>
            </div>
          </div>
          {salesByCategory.length === 0 ? (
            <div className="sales-top-empty">No category sales yet.</div>
          ) : (
            <div className="bento-cat-list">
              {salesByCategory.map((c) => (
                <div key={c.name} className="bento-cat-row">
                  <div className="bento-cat-label">
                    <span>{c.name}</span>
                    <strong>{fmt(c.revenue)}</strong>
                  </div>
                  <div className="bento-cat-track">
                    <div className="bento-cat-fill" style={{ width: `${Math.max(6, (c.revenue / maxCategoryRev) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <SummaryModal data={summaryModal} onClose={() => setSummaryModal(null)} />
    </div>
  );
};

export default function AdminSalesReports() {
  return <Navigate to="/admin" replace />;
}
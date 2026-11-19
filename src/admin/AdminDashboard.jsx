import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import DkIcon, { DK_ICONS } from '../components/DkIcon';
import { SalesAnalyticsPanel } from './AdminSalesReports';
import { formatOrderShortId } from '../utils/orderId';
import { useAuth } from '../context/AuthContext';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { downloadEncryptedBackupExcel } from './lib/backupExcel';
import './AdminDashboard.css';

const formatDashDate = (ms) => {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
};

const orderStatusOf = (o) => String(o.orderStatus || 'pending').toLowerCase();

const isFailedDelivery = (o) =>
  String(o.status || '').toLowerCase().includes('failed');

/** Successful delivery — rider or LBC (orderStatus completed / Delivered). */
const isCompleted = (o) => {
  if (isFailedDelivery(o) || orderStatusOf(o) === 'cancelled') return false;
  const os = orderStatusOf(o);
  const st = String(o.status || '').toLowerCase();
  return os === 'completed' || st === 'delivered' || st === 'completed';
};

const isPendingConfirm = (o) => orderStatusOf(o) === 'pending';

const isProcessing = (o) => orderStatusOf(o) === 'confirmed';

const isInTransit = (o) => {
  const os = orderStatusOf(o);
  return os === 'shipped' || os === 'out_for_delivery';
};

const isCancelled = (o) => orderStatusOf(o) === 'cancelled';

const StatModal = ({ data, onClose }) => {
  useBodyScrollLock(!!data);
  if (!data) return null;
  return (
    <div className="stat-modal-overlay" onClick={onClose}>
      <div className="stat-modal-card" onClick={e => e.stopPropagation()}>
        <div className="stat-modal-header">
          <div className="stat-modal-icon">
            {data.dkIcon
              ? <DkIcon name={data.dkIcon} size={28} />
              : <i className={data.icon} style={{ color: data.iconColor }}></i>}
          </div>
          <div>
            <h3>{data.title}</h3>
            <p className="stat-modal-value">{data.value}</p>
          </div>
          <button className="stat-modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="stat-modal-body">
          {data.breakdown && (
            <div className="stat-modal-breakdown">
              {data.breakdown.map((item, i) => (
                <div key={i} className="breakdown-row">
                  <span className="breakdown-label">{item.label}</span>
                  <span className="breakdown-val" style={{ color: item.color || '#1a1f36' }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Same flow as Backup: verify live admin password, then lock Excel with that password. */
const DashboardPasswordModal = ({ onVerified, onClose, busyExport }) => {
  const { user } = useAuth();
  const verifyUserPassword = useMutation(api.users.verifyUserPassword);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const locked = busy || busyExport;

  useBodyScrollLock(true);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
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
    <div className="dash-pw-overlay" onClick={locked ? undefined : onClose}>
      <div className="dash-pw-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Download dashboard data</h3>
        <form onSubmit={submit} className="dash-pw-form">
          <label htmlFor="dash-admin-pw">Admin password</label>
          <div className="dash-pw-field">
            <input
              id="dash-admin-pw"
              ref={inputRef}
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="Enter current admin password"
              autoComplete="current-password"
              disabled={locked}
            />
            <button
              type="button"
              className="dash-pw-toggle"
              onClick={() => setShowPw((s) => !s)}
              tabIndex={-1}
              aria-label={showPw ? 'Hide password' : 'Show password'}
            >
              <i className={`fas ${showPw ? 'fa-eye-slash' : 'fa-eye'}`}></i>
            </button>
          </div>
          {error && (
            <p className="dash-pw-error">
              <i className="fas fa-exclamation-circle"></i> {error}
            </p>
          )}
          <div className="dash-pw-actions">
            <button type="button" className="dash-pw-cancel" onClick={onClose} disabled={locked}>
              Cancel
            </button>
            <button type="submit" className="dash-pw-submit" disabled={locked}>
              {locked
                ? <><i className="fas fa-spinner fa-spin"></i> {busyExport ? 'Encrypting…' : 'Verifying…'}</>
                : <><i className="fas fa-download"></i> Download Excel</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AdminDashboard = () => {
  const [statModal, setStatModal] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const allOrdersRaw   = useQuery(api.orders.getAllOrders);
  const allUsersRaw    = useQuery(api.users.getAllUsers);
  const allProductsRaw = useQuery(api.products.getAllProductsAdmin);
  const ordersReady    = allOrdersRaw !== undefined;
  const usersReady     = allUsersRaw !== undefined;
  const productsReady  = allProductsRaw !== undefined;
  const allUsers       = allUsersRaw || [];
  const allProducts    = allProductsRaw || [];
  const allOrders      = allOrdersRaw || [];
  const validOrders    = useMemo(
    () => allOrders.filter(o => o.orderId && o.items?.length > 0),
    [allOrders]
  );

  const stats = useMemo(() => {
    // Mutually exclusive status buckets — must sum to totalOrders
    const pendingConfirm = validOrders.filter(isPendingConfirm);
    const processingOrders = validOrders.filter(isProcessing);
    const inTransitOrders = validOrders.filter(isInTransit);
    const completedOrders = validOrders.filter(isCompleted);
    const cancelledOrders = validOrders.filter(isCancelled);
    const walkInOrders = validOrders.filter(
      (o) => !!o.isWalkIn || String(o.deliveryMethod || '').toLowerCase() === 'store'
    );
    const outForDeliveryOrders = validOrders.filter(
      (o) => orderStatusOf(o) === 'out_for_delivery'
    );
    const accounted =
      pendingConfirm.length
      + processingOrders.length
      + inTransitOrders.length
      + completedOrders.length
      + cancelledOrders.length;
    const otherOrders = Math.max(0, validOrders.length - accounted);

    const inventoryCosting = allProducts.reduce((sum, p) =>
      sum + ((p.stock ?? 0) * (p.price ?? 0)), 0
    );
    const lowStockProducts = allProducts.filter(p => (p.stock ?? 0) < 10);
    const regularUsers     = allUsers.filter(u => u.role !== 'admin');

    return {
      inventoryCosting,
      totalOrders:     validOrders.length,
      pendingConfirm:  pendingConfirm.length,
      processing:      processingOrders.length,
      inTransit:       inTransitOrders.length,
      outForDelivery:  outForDeliveryOrders.length,
      completedOrders: completedOrders.length,
      walkInOrders:    walkInOrders.length,
      cancelledOrders: cancelledOrders.length,
      otherOrders,
      totalUsers:      regularUsers.length,
      totalProducts:   allProducts.length,
      lowStockProducts: lowStockProducts.length,
      outOfStock:      allProducts.filter(p => (p.stock ?? 0) === 0).length,
    };
  }, [validOrders, allUsers, allProducts]);

  const openStatModal = (type) => {
    if (type === 'inventory') {
      setStatModal({
        title: 'Inventory Costing',
        value: `₱${stats.inventoryCosting.toLocaleString()}`,
        dkIcon: DK_ICONS.inventoryCosting,
        iconBg: '#fff0eb',
        iconColor: '#ee4d2d',
        breakdown: [
          { label: 'Total Products', value: stats.totalProducts },
          { label: 'Low Stock Items', value: stats.lowStockProducts, color: '#d97706' },
          { label: 'Out of Stock Items', value: stats.outOfStock, color: '#dc2626' },
          { label: 'Total Inventory Value', value: `₱${stats.inventoryCosting.toLocaleString()}`, color: '#ee4d2d' },
        ],
      });
    } else if (type === 'orders') {
      setStatModal({
        title: 'Total Orders',
        value: stats.totalOrders,
        dkIcon: DK_ICONS.totalOrders,
        iconBg: '#eff6ff',
        iconColor: '#3b82f6',
        breakdown: [
          { label: 'All Orders', value: stats.totalOrders },
          { label: 'Pending', value: stats.pendingConfirm, color: '#d97706' },
          { label: 'Processing', value: stats.processing, color: '#2563eb' },
          { label: 'In Transit (Shipped / Out for Delivery)', value: stats.inTransit, color: '#f97316' },
          { label: 'Completed (incl. LBC)', value: stats.completedOrders, color: '#16a34a' },
          { label: 'Walk-in / Manual', value: stats.walkInOrders, color: '#059669' },
          { label: 'Canceled', value: stats.cancelledOrders, color: '#64748b' },
          ...(stats.otherOrders > 0
            ? [{ label: 'Other / Legacy', value: stats.otherOrders, color: '#94a3b8' }]
            : []),
        ],
      });
    } else if (type === 'users') {
      setStatModal({
        title: 'Registered Users',
        value: stats.totalUsers,
        dkIcon: DK_ICONS.registeredUsers,
        iconBg: '#f5f3ff',
        iconColor: '#7c3aed',
        breakdown: [
          { label: 'Registered Users', value: stats.totalUsers, color: '#7c3aed' },
        ],
      });
    } else if (type === 'products') {
      setStatModal({
        title: 'Total Products',
        value: stats.totalProducts,
        dkIcon: DK_ICONS.totalProducts,
        iconBg: '#fdf4ff',
        iconColor: '#a855f7',
        breakdown: [
          { label: 'Total Products', value: stats.totalProducts },
          { label: 'Low Stock (< 10)', value: stats.lowStockProducts, color: '#d97706' },
          { label: 'Out of Stock', value: stats.outOfStock, color: '#dc2626' },
          { label: 'Healthy Stock', value: stats.totalProducts - stats.lowStockProducts, color: '#16a34a' },
        ],
      });
    }
  };

  const recentOrders = useMemo(() =>
    [...validOrders]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5),
    [validOrders]
  );

  const dataReady = ordersReady && usersReady && productsReady;

  const buildExportTables = useCallback(() => {
    const summary = [
      { metric: 'Inventory Costing', value: `PHP ${stats.inventoryCosting.toLocaleString()}` },
      { metric: 'Total Orders', value: stats.totalOrders },
      { metric: 'Pending', value: stats.pendingConfirm },
      { metric: 'Processing', value: stats.processing },
      { metric: 'In Transit', value: stats.inTransit },
      { metric: 'Out for Delivery', value: stats.outForDelivery },
      { metric: 'Completed Orders (incl. LBC)', value: stats.completedOrders },
      { metric: 'Walk-in / Manual Sales', value: stats.walkInOrders },
      { metric: 'Canceled', value: stats.cancelledOrders },
      ...(stats.otherOrders > 0 ? [{ metric: 'Other / Legacy', value: stats.otherOrders }] : []),
      { metric: 'Registered Users', value: stats.totalUsers },
      { metric: 'Total Products', value: stats.totalProducts },
      { metric: 'Low Stock Items', value: stats.lowStockProducts },
      { metric: 'Out of Stock', value: stats.outOfStock },
      { metric: 'Generated At', value: new Date().toLocaleString('en-PH') },
    ];

    const products = [...allProducts]
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((p) => {
        const stock = p.stock ?? 0;
        const price = p.price ?? 0;
        return {
          name: p.name || '',
          category: p.category || '',
          stock,
          price,
          inventoryValue: stock * price,
          status: stock <= 0 ? 'Out of Stock' : stock < 10 ? 'Low Stock' : 'Healthy',
        };
      });

    const orders = [...validOrders]
      .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0))
      .map((o) => ({
        orderId: formatOrderShortId(o) || o.orderId || '',
        customerName: o.customerName || '',
        email: o.email || '',
        phone: o.phone || '',
        status: o.orderStatus || o.status || '',
        paymentStatus: o.paymentStatus || '',
        total: o.finalTotal ?? o.total ?? 0,
        itemCount: (o.items || []).length,
        createdAt: formatDashDate(o._creationTime || o.createdAt),
      }));

    const users = allUsers
      .filter((u) => u.role !== 'admin')
      .map((u) => ({
        name: u.name || u.fullName || '',
        email: u.email || '',
        phone: u.phone || '',
        createdAt: formatDashDate(u._creationTime || u.createdAt),
      }));

    return {
      summary,
      products,
      orders,
      users,
    };
  }, [stats, allProducts, validOrders, allUsers]);

  const handleDownloadClick = () => {
    if (!dataReady || exporting) return;
    setExportError('');
    setPwOpen(true);
  };

  const handlePasswordVerified = async (password) => {
    setExporting(true);
    setExportError('');
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadEncryptedBackupExcel(
        buildExportTables(),
        password,
        `dkmerch-dashboard-${stamp}.xlsx`
      );
      setPwOpen(false);
    } catch (err) {
      setExportError(err?.message || 'Download failed.');
    } finally {
      setExporting(false);
    }
  };

  const kpiCards = [
    {
      key: 'inventory',
      type: 'inventory',
      label: 'Inventory Costing',
      value: productsReady ? `₱${stats.inventoryCosting.toLocaleString()}` : null,
      hint: productsReady ? `${stats.totalProducts} products tracked` : 'Loading…',
      color: '#22c55e',
      tone: 'sales',
      icon: DK_ICONS.inventoryCosting,
      loading: !productsReady,
    },
    {
      key: 'orders',
      type: 'orders',
      label: 'Total Orders',
      value: ordersReady ? String(stats.totalOrders) : null,
      hint: ordersReady
        ? `${stats.completedOrders} completed · ${stats.walkInOrders} walk-in · ${stats.pendingConfirm} pending`
        : 'Loading…',
      color: '#14b8a6',
      tone: 'orders',
      icon: DK_ICONS.totalOrders,
      loading: !ordersReady,
    },
    {
      key: 'users',
      type: 'users',
      label: 'Registered Users',
      value: usersReady ? String(stats.totalUsers) : null,
      hint: usersReady
        ? `${stats.totalUsers} customer account${stats.totalUsers === 1 ? '' : 's'}`
        : 'Loading users…',
      color: '#3b82f6',
      tone: 'users',
      icon: DK_ICONS.registeredUsers,
      loading: !usersReady,
    },
    {
      key: 'products',
      type: 'products',
      label: 'Total Products',
      value: productsReady ? String(stats.totalProducts) : null,
      hint: productsReady ? `${stats.lowStockProducts} low stock items` : 'Loading…',
      color: '#f59e0b',
      tone: 'products',
      icon: DK_ICONS.totalProducts,
      warn: productsReady && stats.lowStockProducts > 0,
      loading: !productsReady,
    },
  ];

  return (
    <div className="admin-dashboard">
      <div className="dash-page-intro">
        <h2>Dashboard</h2>
        <div className="dash-page-actions">
          <button
            type="button"
            className="dash-action-btn"
            onClick={handleDownloadClick}
            disabled={!dataReady || exporting}
            title="Download password-protected Excel of dashboard data"
          >
            <i className="fas fa-download" aria-hidden="true"></i>
            Download
          </button>
        </div>
      </div>
      {exportError && (
        <div className="dash-export-error" role="alert">
          <i className="fas fa-exclamation-circle"></i> {exportError}
        </div>
      )}

      <div className="stats-grid">
        {kpiCards.map((card) => (
          <div
            key={card.key}
            className={`stat-card wave-card ${card.tone} clickable-card`}
            onClick={() => {
              if (card.loading) return;
              openStatModal(card.type);
            }}
          >
            <div className="stat-card-top">
              <div className="stat-icon-chip" style={{ color: card.color }}>
                <DkIcon name={card.icon} size={26} />
              </div>
              <div className="stat-card-copy">
                <h3>{card.label}</h3>
                <p className={`stat-value ${card.loading ? 'is-loading' : ''}`}>
                  {card.loading ? '—' : card.value}
                </p>
                <span className={`stat-label ${card.warn ? 'warn' : ''}`}>{card.hint}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <SalesAnalyticsPanel recentOrders={recentOrders} />

      <StatModal data={statModal} onClose={() => setStatModal(null)} />
      {pwOpen && (
        <DashboardPasswordModal
          busyExport={exporting}
          onClose={() => { if (!exporting) setPwOpen(false); }}
          onVerified={handlePasswordVerified}
        />
      )}
    </div>
  );
};

export default AdminDashboard;

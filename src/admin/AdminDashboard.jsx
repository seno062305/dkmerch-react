import React, { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import DkIcon, { DK_ICONS } from '../components/DkIcon';
import { SalesAnalyticsPanel } from './AdminSalesReports';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import './AdminDashboard.css';

const isSaleOrder = (o) => {
  const status = (o.status || '').toLowerCase();
  const orderStatus = (o.orderStatus || '').toLowerCase();
  const paymentStatus = (o.paymentStatus || '').toLowerCase();
  return (
    paymentStatus === 'paid' ||
    status === 'paid' ||
    status === 'delivered' ||
    status === 'completed' ||
    orderStatus === 'completed' ||
    orderStatus === 'confirmed' ||
    orderStatus === 'processing' ||
    orderStatus === 'out_for_delivery'
  );
};

const isCompleted = (o) =>
  ['completed', 'delivered'].includes((o.status || o.orderStatus || '').toLowerCase());

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
          <p className="stat-modal-explanation">{data.explanation}</p>
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

const AdminDashboard = () => {
  const [statModal, setStatModal] = useState(null);

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
    const saleOrders = validOrders.filter(isSaleOrder);
    const completedOrders = validOrders.filter(isCompleted);
    const outForDeliveryOrders = validOrders.filter(o =>
      (o.orderStatus || o.status || '').toLowerCase() === 'out_for_delivery'
    );
    const pendingConfirm = validOrders.filter(o =>
      (o.orderStatus || '').toLowerCase() === 'pending' ||
      ((o.paymentStatus || '').toLowerCase() === 'paid' && (o.orderStatus || '').toLowerCase() === 'pending')
    );
    const inventoryCosting = allProducts.reduce((sum, p) =>
      sum + ((p.stock ?? 0) * (p.price ?? 0)), 0
    );
    const lowStockProducts = allProducts.filter(p => (p.stock ?? 0) < 10);
    const regularUsers     = allUsers.filter(u => u.role !== 'admin');

    return {
      inventoryCosting,
      totalOrders:    validOrders.length,
      outForDelivery: outForDeliveryOrders.length,
      pendingConfirm: pendingConfirm.length,
      saleOrders:     saleOrders.length,
      completedOrders: completedOrders.length,
      totalUsers:     regularUsers.length,
      totalProducts:  allProducts.length,
      lowStockProducts: lowStockProducts.length,
      outOfStock:     allProducts.filter(p => (p.stock ?? 0) === 0).length,
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
        explanation: 'Total estimated value of all current stock (stock × price).',
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
        explanation: 'All orders in the system, regardless of status.',
        breakdown: [
          { label: 'All Orders', value: stats.totalOrders },
          { label: 'Needs Confirm / Pending', value: stats.pendingConfirm, color: '#d97706' },
          { label: 'Out for Delivery', value: stats.outForDelivery, color: '#f97316' },
          { label: 'Paid / Active Sales', value: stats.saleOrders, color: '#2563eb' },
          { label: 'Completed Orders', value: stats.completedOrders, color: '#16a34a' },
        ],
      });
    } else if (type === 'users') {
      setStatModal({
        title: 'Registered Users',
        value: stats.totalUsers,
        dkIcon: DK_ICONS.registeredUsers,
        iconBg: '#f5f3ff',
        iconColor: '#7c3aed',
        explanation: 'Non-admin customer accounts registered in the store.',
        breakdown: [
          { label: 'Registered Users', value: stats.totalUsers, color: '#7c3aed' },
          { label: 'Completed Orders', value: stats.completedOrders },
        ],
      });
    } else if (type === 'products') {
      setStatModal({
        title: 'Total Products',
        value: stats.totalProducts,
        dkIcon: DK_ICONS.totalProducts,
        iconBg: '#fdf4ff',
        iconColor: '#a855f7',
        explanation: 'Active catalog products. Low stock = fewer than 10 units.',
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

  const kpiCards = [
    {
      key: 'inventory',
      type: 'inventory',
      label: 'Inventory Costing',
      value: productsReady ? `₱${stats.inventoryCosting.toLocaleString()}` : null,
      hint: productsReady ? `${stats.totalProducts} products tracked` : 'Loading…',
      tooltip: 'Total estimated value of all current stock (stock × price).',
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
        ? `${stats.outForDelivery} out for delivery · ${stats.pendingConfirm} pending confirm`
        : 'Loading…',
      tooltip: 'All orders in the system, regardless of status.',
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
        ? `${stats.completedOrders} completed orders`
        : 'Loading users…',
      tooltip: 'Non-admin customer accounts registered in the store.',
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
      tooltip: 'Active catalog products. Low stock = fewer than 10 units.',
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
      </div>

      <div className="stats-grid">
        {kpiCards.map((card) => (
          <div
            key={card.key}
            className={`stat-card wave-card ${card.tone} clickable-card`}
            title={card.tooltip}
            onClick={() => {
              if (card.loading) return;
              openStatModal(card.type);
            }}
          >
            <div className="stat-card-top">
              <div className="stat-card-copy">
                <h3>{card.label}</h3>
                <p className={`stat-value ${card.loading ? 'is-loading' : ''}`}>
                  {card.loading ? '—' : card.value}
                </p>
                <span className={`stat-label ${card.warn ? 'warn' : ''}`}>{card.hint}</span>
              </div>
              <div className="stat-icon-chip" style={{ background: `${card.color}18`, color: card.color }}>
                <DkIcon name={card.icon} size={22} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <SalesAnalyticsPanel recentOrders={recentOrders} />

      <StatModal data={statModal} onClose={() => setStatModal(null)} />
    </div>
  );
};

export default AdminDashboard;

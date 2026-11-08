import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
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
  if (!data) return null;
  return (
    <div className="stat-modal-overlay" onClick={onClose}>
      <div className="stat-modal-card" onClick={e => e.stopPropagation()}>
        <div className="stat-modal-header">
          <div className="stat-modal-icon" style={{ background: data.iconBg }}>
            <i className={data.icon} style={{ color: data.iconColor }}></i>
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

  const storeSettings  = useQuery(api.settings.getSettings);
  const updateSettings = useMutation(api.settings.updateSettings);
  const [storeForm, setStoreForm]           = useState({ storeName: '', storeAddress: '', storeLat: '', storeLng: '' });
  const [storeFormSaved, setStoreFormSaved] = useState(false);
  const [storeLocating, setStoreLocating]   = useState(false);

  const allOrdersRaw   = useQuery(api.orders.getAllOrders);
  const allUsers       = useQuery(api.users.getAllUsers) || [];
  const allProducts    = useQuery(api.products.getAllProductsAdmin) || [];
  const allOrders      = allOrdersRaw || [];
  const validOrders    = useMemo(
    () => allOrders.filter(o => o.orderId && o.items?.length > 0),
    [allOrders]
  );

  useEffect(() => {
    if (storeSettings) {
      setStoreForm({
        storeName:    storeSettings.storeName    ?? 'DKMerch Store',
        storeAddress: storeSettings.storeAddress ?? '',
        storeLat:     storeSettings.storeLat     != null ? String(storeSettings.storeLat) : '',
        storeLng:     storeSettings.storeLng     != null ? String(storeSettings.storeLng) : '',
      });
    }
  }, [storeSettings]);

  const handleStoreFormChange = (e) => {
    const { name, value } = e.target;
    setStoreForm(prev => ({ ...prev, [name]: value }));
    setStoreFormSaved(false);
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) { alert('Geolocation is not supported by your browser.'); return; }
    setStoreLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          setStoreForm(prev => ({
            ...prev,
            storeLat: String(lat),
            storeLng: String(lng),
            storeAddress: data.display_name || prev.storeAddress,
          }));
          setStoreFormSaved(false);
        } catch {
          setStoreForm(prev => ({ ...prev, storeLat: String(lat), storeLng: String(lng) }));
        } finally {
          setStoreLocating(false);
        }
      },
      () => { alert('Unable to detect location.'); setStoreLocating(false); },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleSaveStoreSettings = async () => {
    const lat = parseFloat(storeForm.storeLat);
    const lng = parseFloat(storeForm.storeLng);
    if (isNaN(lat) || isNaN(lng)) {
      alert('Please enter valid coordinates or use Detect Location.');
      return;
    }
    try {
      await updateSettings({
        storeName: storeForm.storeName || undefined,
        storeAddress: storeForm.storeAddress || undefined,
        storeLat: lat,
        storeLng: lng,
      });
      setStoreFormSaved(true);
    } catch (err) {
      console.error(err);
      alert('Failed to save store location.');
    }
  };

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
        icon: 'fas fa-boxes',
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
        icon: 'fas fa-shopping-cart',
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
        icon: 'fas fa-users',
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
        icon: 'fas fa-box',
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
      .slice(0, 8),
    [validOrders]
  );

  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed' || s === 'delivered') return 'status-completed';
    if (s === 'paid') return 'status-confirmed';
    if (s === 'confirmed' || s === 'processing') return 'status-confirmed';
    if (s === 'cancelled') return 'status-cancelled';
    return 'status-pending';
  };

  return (
    <div className="admin-dashboard">
      <div className="dash-page-intro">
        <div>
          <h2>Operations Dashboard</h2>
          <p>Store health overview — inventory, orders, users, and pickup location. Sales graphs live in Sales Reports.</p>
        </div>
        <Link to="/admin/sales-reports" className="dash-sales-link">
          <i className="fas fa-chart-bar"></i> Open Sales Reports
        </Link>
      </div>

      <div className="stats-grid">
        <div className="stat-card sales clickable-card" onClick={() => openStatModal('inventory')}>
          <div className="stat-icon"><i className="fas fa-boxes"></i></div>
          <div className="stat-details">
            <h3>Inventory Costing</h3>
            <p className="stat-value">₱{stats.inventoryCosting.toLocaleString()}</p>
            <span className="stat-label">{stats.totalProducts} products tracked</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>

        <div className="stat-card orders clickable-card" onClick={() => openStatModal('orders')}>
          <div className="stat-icon"><i className="fas fa-shopping-cart"></i></div>
          <div className="stat-details">
            <h3>Total Orders</h3>
            <p className="stat-value">{stats.totalOrders}</p>
            <span className="stat-label">{stats.outForDelivery} out for delivery · {stats.pendingConfirm} pending confirm</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>

        <div className="stat-card users clickable-card" onClick={() => openStatModal('users')}>
          <div className="stat-icon"><i className="fas fa-users"></i></div>
          <div className="stat-details">
            <h3>Registered Users</h3>
            <p className="stat-value">{stats.totalUsers}</p>
            <span className="stat-label">{stats.completedOrders} completed orders</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>

        <div className="stat-card products clickable-card" onClick={() => openStatModal('products')}>
          <div className="stat-icon"><i className="fas fa-box"></i></div>
          <div className="stat-details">
            <h3>Total Products</h3>
            <p className="stat-value">{stats.totalProducts}</p>
            <span className="stat-label warn">{stats.lowStockProducts} low stock items</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>
      </div>

      <div className="bottom-grid">
        <div className="data-card recent-orders" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <i className="fas fa-clock"></i>
            <h3>Recent Orders</h3>
            <Link to="/admin/orders" className="dash-inline-link">View all</Link>
          </div>
          <div className="card-body">
            {recentOrders.length > 0 ? (
              <div className="orders-list">
                {recentOrders.map(order => (
                  <div key={order.orderId} className="order-item">
                    <div className="order-info">
                      <div className="order-id"><i className="fas fa-receipt"></i> #{order.orderId?.slice(-8)}</div>
                      <div className="order-customer">{order.customerName || order.email || 'Customer'}</div>
                    </div>
                    <div className="order-details">
                      <div className="order-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</div>
                      <span className={`order-status ${getStatusBadgeClass(order.paymentStatus || order.orderStatus || order.status)}`}>
                        {(order.orderStatus || order.paymentStatus || order.status || 'pending').toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data"><i className="fas fa-shopping-cart"></i><p>No orders yet</p></div>
            )}
          </div>
        </div>
      </div>

      <div className="chart-card full-width" style={{ marginTop: '24px' }}>
        <div className="chart-header">
          <div className="chart-title">
            <i className="fas fa-map-marker-alt" style={{ color: '#fc1268' }}></i>
            <h3>Store / Pickup Location</h3>
          </div>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Used as the starting point for shipping fees in Checkout and rider pickup.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Store Name</label>
              <input type="text" name="storeName" value={storeForm.storeName} onChange={handleStoreFormChange}
                placeholder="DKMerch Store"
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Store Address</label>
              <input type="text" name="storeAddress" value={storeForm.storeAddress} onChange={handleStoreFormChange}
                placeholder="Full store address"
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Latitude</label>
              <input type="number" name="storeLat" value={storeForm.storeLat} onChange={handleStoreFormChange}
                placeholder="e.g. 14.5995" step="0.00001"
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Longitude</label>
              <input type="number" name="storeLng" value={storeForm.storeLng} onChange={handleStoreFormChange}
                placeholder="e.g. 120.9842" step="0.00001"
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1.5px solid #e2e8f0', fontSize: '13px' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleDetectLocation} disabled={storeLocating}
              style={{ padding: '9px 16px', borderRadius: '8px', border: '1.5px solid #3b82f6', background: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '13px', cursor: storeLocating ? 'not-allowed' : 'pointer' }}>
              <i className={storeLocating ? 'fas fa-spinner fa-spin' : 'fas fa-crosshairs'}></i>{' '}
              {storeLocating ? 'Detecting…' : 'Detect My Location'}
            </button>
            <button onClick={handleSaveStoreSettings}
              style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: storeFormSaved ? '#16a34a' : '#fc1268', color: '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}>
              <i className={storeFormSaved ? 'fas fa-check' : 'fas fa-save'}></i>{' '}
              {storeFormSaved ? 'Saved!' : 'Save Location'}
            </button>
          </div>
        </div>
      </div>

      <StatModal data={statModal} onClose={() => setStatModal(null)} />
    </div>
  );
};

export default AdminDashboard;

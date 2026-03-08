import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import './AdminDashboard.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

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

// ══════════════════════════════════════════════════════════════════════════
//  STAT DETAIL MODAL
// ══════════════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════
const AdminDashboard = () => {
  const [timeRange, setTimeRange] = useState('daily');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [statModal, setStatModal] = useState(null);

  const allOrders   = useQuery(api.orders.getAllOrders)     ?? [];
  const allUsers    = useQuery(api.users.getAllUsers)       ?? [];
  const allProducts = useQuery(api.products.getAllProducts) ?? [];

  useEffect(() => {
    document.body.style.overflow = (showProductModal || statModal) ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showProductModal, statModal]);

  const validOrders = useMemo(() =>
    allOrders.filter(o => o.orderId && o.items?.length > 0),
    [allOrders]
  );

  // ── STATS ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const saleOrders = validOrders.filter(isSaleOrder);
    const completedOrders = validOrders.filter(isCompleted);
    const pendingOrders = validOrders.filter(o => {
      const status = (o.status || '').toLowerCase();
      const orderStatus = (o.orderStatus || '').toLowerCase();
      const paymentStatus = (o.paymentStatus || '').toLowerCase();
      return (
        paymentStatus !== 'paid' &&
        status !== 'paid' &&
        (orderStatus === 'pending' || status === 'pending')
      );
    });

    // Inventory costing = sum of (stock × price) per product
    const inventoryCosting = allProducts.reduce((sum, p) =>
      sum + ((p.stock ?? 0) * (p.price ?? 0)), 0
    );

    const lowStockProducts = allProducts.filter(p => (p.stock ?? 0) < 10);
    const regularUsers = allUsers.filter(u => u.role !== 'admin');

    return {
      inventoryCosting,
      totalOrders: validOrders.length,
      pendingOrders: pendingOrders.length,
      saleOrders: saleOrders.length,
      completedOrders: completedOrders.length,
      totalUsers: regularUsers.length,
      totalProducts: allProducts.length,
      lowStockProducts: lowStockProducts.length,
      outOfStock: allProducts.filter(p => (p.stock ?? 0) === 0).length,
    };
  }, [validOrders, allUsers, allProducts]);

  // ── OPEN STAT MODAL ───────────────────────────────────────────────────────
  const openStatModal = (type) => {
    if (type === 'inventory') {
      setStatModal({
        title: 'Inventory Costing',
        value: `₱${stats.inventoryCosting.toLocaleString()}`,
        icon: 'fas fa-boxes',
        iconBg: '#fff0eb',
        iconColor: '#ee4d2d',
        explanation: 'Total estimated value of all current stock. Computed by multiplying each product\'s current stock quantity by its selling price, then summing all products.',
        breakdown: [
          { label: 'Total Products',     value: stats.totalProducts },
          { label: 'Low Stock Items',    value: stats.lowStockProducts,  color: '#d97706' },
          { label: 'Out of Stock Items', value: stats.outOfStock,        color: '#dc2626' },
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
        explanation: 'Total number of all orders placed in the system, regardless of status (pending, paid, completed, cancelled, etc.).',
        breakdown: [
          { label: 'All Orders',       value: stats.totalOrders },
          { label: 'Pending Orders',   value: stats.pendingOrders,    color: '#d97706' },
          { label: 'Paid Orders',      value: stats.saleOrders,       color: '#2563eb' },
          { label: 'Completed Orders', value: stats.completedOrders,  color: '#16a34a' },
        ],
      });
    } else if (type === 'completed') {
      setStatModal({
        title: 'Completed Orders',
        value: stats.completedOrders,
        icon: 'fas fa-check-circle',
        iconBg: '#f0fdf4',
        iconColor: '#16a34a',
        explanation: 'Orders with status "Completed" or "Delivered". These are orders that have been fully processed and received by the customer.',
        breakdown: [
          { label: 'Completed / Delivered', value: stats.completedOrders, color: '#16a34a' },
          { label: 'Out of Total Orders',   value: stats.totalOrders },
          { label: 'Completion Rate',
            value: stats.totalOrders
              ? `${((stats.completedOrders / stats.totalOrders) * 100).toFixed(1)}%`
              : '0%',
            color: '#16a34a'
          },
        ],
      });
    } else if (type === 'products') {
      setStatModal({
        title: 'Total Products',
        value: stats.totalProducts,
        icon: 'fas fa-box',
        iconBg: '#fdf4ff',
        iconColor: '#a855f7',
        explanation: 'Total number of active products in the catalog. Low stock means the item has fewer than 10 units remaining.',
        breakdown: [
          { label: 'Total Products',     value: stats.totalProducts },
          { label: 'Low Stock (< 10)',   value: stats.lowStockProducts,  color: '#d97706' },
          { label: 'Out of Stock',       value: stats.outOfStock,        color: '#dc2626' },
          { label: 'Healthy Stock',      value: stats.totalProducts - stats.lowStockProducts, color: '#16a34a' },
        ],
      });
    }
  };

  // ── SALES CHART DATA ──────────────────────────────────────────────────────
  const salesData = useMemo(() => {
    const saleOrders = validOrders.filter(isSaleOrder);
    const salesByDate = {};
    saleOrders.forEach(order => {
      const dateKey = new Date(order._creationTime).toISOString().split('T')[0];
      salesByDate[dateKey] = (salesByDate[dateKey] || 0) + (order.total || 0);
    });

    const daily = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      daily.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sales: salesByDate[dateKey] || 0
      });
    }

    const weekly = [];
    for (let i = 3; i >= 0; i--) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - i * 7);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      let weekSales = 0;
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        weekSales += salesByDate[d.toISOString().split('T')[0]] || 0;
      }
      weekly.push({ date: `Week ${4 - i}`, sales: weekSales });
    }

    const monthly = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthSales = Object.keys(salesByDate)
        .filter(k => k.startsWith(monthKey))
        .reduce((sum, k) => sum + salesByDate[k], 0);
      monthly.push({
        date: date.toLocaleDateString('en-US', { month: 'short' }),
        sales: monthSales
      });
    }

    return { daily, weekly, monthly };
  }, [validOrders]);

  // ── TOP PRODUCTS ──────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const saleOrders = validOrders.filter(isSaleOrder);
    const productSales = {};
    saleOrders.forEach(order => {
      order.items.forEach(item => {
        const pid = item.id;
        if (!productSales[pid]) {
          const full = allProducts.find(p => p._id === pid || p.id === pid);
          productSales[pid] = {
            quantity: 0, revenue: 0,
            name: item.name || full?.name || 'Unknown',
            image: item.image || full?.image || '/placeholder.png',
            price: item.price || full?.price || 0,
            kpopGroup: full?.kpopGroup || 'N/A',
            category: full?.category || 'N/A',
            stock: full?.stock || 0,
          };
        }
        productSales[pid].quantity += item.quantity || 1;
        productSales[pid].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });
    return Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);
  }, [validOrders, allProducts]);

  // ── RECENT ORDERS ─────────────────────────────────────────────────────────
  const recentOrders = useMemo(() =>
    [...validOrders]
      .sort((a, b) => b._creationTime - a._creationTime)
      .slice(0, 5),
    [validOrders]
  );

  // ── CHART CONFIG ──────────────────────────────────────────────────────────
  const currentChartData = timeRange === 'daily' ? salesData.daily
    : timeRange === 'weekly' ? salesData.weekly
    : salesData.monthly;

  const chartData = {
    labels: currentChartData.map(d => d.date),
    datasets: [{
      label: 'Sales (₱)',
      data: currentChartData.map(d => d.sales),
      borderColor: 'rgb(238, 77, 45)',
      backgroundColor: 'rgba(238, 77, 45, 0.1)',
      tension: 0.4, fill: true,
      pointRadius: 4, pointHoverRadius: 6,
      pointBackgroundColor: 'rgb(238, 77, 45)',
      pointBorderColor: '#fff', pointBorderWidth: 2,
    }]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)', padding: 12,
        titleFont: { size: 14, weight: 'bold' }, bodyFont: { size: 13 },
        callbacks: { label: (ctx) => `Sales: ₱${ctx.parsed.y.toLocaleString()}` }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => '₱' + v.toLocaleString() },
        grid: { color: 'rgba(0,0,0,0.05)' }
      },
      x: { grid: { display: false } }
    }
  };

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

      {/* Stats Cards */}
      <div className="stats-grid">

        {/* Inventory Costing (was Total Sales) */}
        <div className="stat-card sales clickable-card" onClick={() => openStatModal('inventory')}>
          <div className="stat-icon"><i className="fas fa-boxes"></i></div>
          <div className="stat-details">
            <h3>Inventory Costing</h3>
            <p className="stat-value">₱{stats.inventoryCosting.toLocaleString()}</p>
            <span className="stat-label">{stats.totalProducts} products tracked</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>

        {/* Total Orders */}
        <div className="stat-card orders clickable-card" onClick={() => openStatModal('orders')}>
          <div className="stat-icon"><i className="fas fa-shopping-cart"></i></div>
          <div className="stat-details">
            <h3>Total Orders</h3>
            <p className="stat-value">{stats.totalOrders}</p>
            <span className="stat-label">{stats.pendingOrders} pending orders</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>

        {/* Completed Orders (was Registered Users) */}
        <div className="stat-card users clickable-card" onClick={() => openStatModal('completed')}>
          <div className="stat-icon"><i className="fas fa-check-circle"></i></div>
          <div className="stat-details">
            <h3>Completed Orders</h3>
            <p className="stat-value">{stats.completedOrders}</p>
            <span className="stat-label">{stats.totalUsers} registered users</span>
          </div>
          <div className="card-click-hint"><i className="fas fa-info-circle"></i></div>
        </div>

        {/* Total Products */}
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

      {/* Sales Chart */}
      <div className="chart-card sales-chart full-width">
        <div className="chart-header">
          <div className="chart-title"><i className="fas fa-chart-line"></i><h3>Sales Overview</h3></div>
          <div className="chart-controls">
            {['daily', 'weekly', 'monthly'].map(r => (
              <button key={r} className={timeRange === r ? 'active' : ''} onClick={() => setTimeRange(r)}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-body">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>

      {/* Bottom Grid */}
      <div className="bottom-grid">
        <div className="data-card top-products">
          <div className="card-header"><i className="fas fa-trophy"></i><h3>Top Selling Products</h3></div>
          <div className="card-body">
            {topProducts.length > 0 ? (
              <div className="products-list">
                {topProducts.map((product, index) => (
                  <div key={product.id} className="product-item" onClick={() => { setSelectedProduct(product); setShowProductModal(true); }}>
                    <div className="product-rank">#{index + 1}</div>
                    <div className="product-info">
                      <h4>{product.name}</h4>
                      <p className="product-stats">
                        <span className="quantity"><i className="fas fa-box"></i> {product.quantity} sold</span>
                        <span className="revenue">₱{(product.revenue || 0).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data"><i className="fas fa-box-open"></i><p>No sales data yet</p></div>
            )}
          </div>
        </div>

        <div className="data-card recent-orders">
          <div className="card-header"><i className="fas fa-clock"></i><h3>Recent Orders</h3></div>
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
                      <div className="order-total">₱{(order.total || 0).toLocaleString()}</div>
                      <span className={`order-status ${getStatusBadgeClass(order.paymentStatus || order.orderStatus || order.status)}`}>
                        {(order.paymentStatus || order.orderStatus || order.status || 'pending').toUpperCase()}
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

      {/* Product Modal */}
      {showProductModal && selectedProduct && (
        <div className="product-modal-overlay" onClick={() => { setShowProductModal(false); setSelectedProduct(null); }}>
          <div className="product-modal-card" onClick={e => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => { setShowProductModal(false); setSelectedProduct(null); }}>
              <i className="fas fa-times"></i>
            </button>
            <div className="modal-product-image">
              <img src={selectedProduct.image || '/placeholder.png'} alt={selectedProduct.name} />
            </div>
            <div className="modal-product-info">
              <h3>{selectedProduct.name}</h3>
              <div className="modal-product-meta">
                <span className="modal-product-group"><i className="fas fa-users"></i> {selectedProduct.kpopGroup}</span>
                <span className="modal-product-category"><i className="fas fa-tag"></i> {selectedProduct.category}</span>
              </div>
              <div className="modal-product-price">₱{(selectedProduct.price || 0).toLocaleString()}</div>
              <div className="modal-product-stock"><i className="fas fa-box"></i> Stock: {selectedProduct.stock}</div>
            </div>
          </div>
        </div>
      )}

      {/* Stat Detail Modal */}
      <StatModal data={statModal} onClose={() => setStatModal(null)} />
    </div>
  );
};

export default AdminDashboard;
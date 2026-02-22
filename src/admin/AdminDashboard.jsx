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

// ✅ Orders that count as "sales" — paid via PayMongo or delivered
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

const AdminDashboard = () => {
  const [timeRange, setTimeRange] = useState('daily');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);

  const allOrders   = useQuery(api.orders.getAllOrders)    ?? [];
  const allUsers    = useQuery(api.users.getAllUsers)      ?? [];
  const allProducts = useQuery(api.products.getAllProducts) ?? [];

  useEffect(() => {
    document.body.style.overflow = showProductModal ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [showProductModal]);

  const validOrders = useMemo(() =>
    allOrders.filter(o => o.orderId && o.items?.length > 0),
    [allOrders]
  );

  // ── STATS ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // ✅ Count paid + delivered + completed as sales
    const saleOrders = validOrders.filter(isSaleOrder);
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
    const totalSales = saleOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const lowStockProducts = allProducts.filter(p => (p.stock ?? 0) < 10);
    const regularUsers = allUsers.filter(u => u.role !== 'admin');

    return {
      totalSales,
      totalOrders: validOrders.length,
      pendingOrders: pendingOrders.length,
      saleOrders: saleOrders.length,
      totalUsers: regularUsers.length,
      totalProducts: allProducts.length,
      lowStockProducts: lowStockProducts.length,
    };
  }, [validOrders, allUsers, allProducts]);

  // ── SALES CHART DATA ──────────────────────────────────────────────────────
  const salesData = useMemo(() => {
    // ✅ Use all paid/completed orders for chart
    const saleOrders = validOrders.filter(isSaleOrder);

    const salesByDate = {};
    saleOrders.forEach(order => {
      const date = new Date(order._creationTime);
      const dateKey = date.toISOString().split('T')[0];
      salesByDate[dateKey] = (salesByDate[dateKey] || 0) + (order.total || 0);
    });

    // Daily — last 7 days
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

    // Weekly — last 4 weeks
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

    // Monthly — last 6 months
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
    // ✅ Count from all paid/completed orders
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
        <div className="stat-card sales">
          <div className="stat-icon"><i className="fas fa-peso-sign"></i></div>
          <div className="stat-details">
            <h3>Total Sales</h3>
            <p className="stat-value">₱{stats.totalSales.toLocaleString()}</p>
            <span className="stat-label">From {stats.saleOrders} paid orders</span>
          </div>
        </div>
        <div className="stat-card orders">
          <div className="stat-icon"><i className="fas fa-shopping-cart"></i></div>
          <div className="stat-details">
            <h3>Total Orders</h3>
            <p className="stat-value">{stats.totalOrders}</p>
            <span className="stat-label">{stats.pendingOrders} pending orders</span>
          </div>
        </div>
        <div className="stat-card users">
          <div className="stat-icon"><i className="fas fa-users"></i></div>
          <div className="stat-details">
            <h3>Registered Users</h3>
            <p className="stat-value">{stats.totalUsers}</p>
            <span className="stat-label">Active customers</span>
          </div>
        </div>
        <div className="stat-card products">
          <div className="stat-icon"><i className="fas fa-box"></i></div>
          <div className="stat-details">
            <h3>Total Products</h3>
            <p className="stat-value">{stats.totalProducts}</p>
            <span className="stat-label warn">{stats.lowStockProducts} low stock items</span>
          </div>
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
        {/* Top Products */}
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

        {/* Recent Orders */}
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
          <div className="product-modal-card" onClick={(e) => e.stopPropagation()}>
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
    </div>
  );
};

export default AdminDashboard;
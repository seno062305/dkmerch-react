import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
import { Line, Bar } from 'react-chartjs-2';
import './AdminDashboard.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const AdminDashboard = () => {
  const [stats, setStats] = useState({
    totalSales: 0,
    totalOrders: 0,
    pendingOrders: 0,
    completedOrders: 0,
    totalUsers: 0,
    totalProducts: 0,
    lowStockProducts: 0
  });

  const [salesData, setSalesData] = useState({
    daily: [],
    weekly: [],
    monthly: []
  });

  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [timeRange, setTimeRange] = useState('weekly'); // daily, weekly, monthly
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProductModal, setShowProductModal] = useState(false);

  useEffect(() => {
    calculateStats();
    calculateSalesData();
    calculateTopProducts();
    getRecentOrders();

    const handleUpdate = () => {
      calculateStats();
      calculateSalesData();
      calculateTopProducts();
      getRecentOrders();
    };

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('orderUpdated', handleUpdate);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('orderUpdated', handleUpdate);
    };
  }, [timeRange]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showProductModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showProductModal]);

  const calculateStats = () => {
    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const products = JSON.parse(localStorage.getItem('dkmerch_products')) || [];

    const validOrders = orders.filter(order => {
      if (!order.orderId && !order.id) return false;
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) return false;
      return true;
    });

    const completedOrders = validOrders.filter(o => 
      o.orderStatus === 'completed' || o.status === 'completed'
    );
    
    const pendingOrders = validOrders.filter(o => 
      o.orderStatus === 'pending' || o.orderStatus === 'confirmed' ||
      o.status === 'pending' || o.status === 'confirmed'
    );

    const totalSales = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const lowStockProducts = products.filter(p => p.stock < 10);

    setStats({
      totalSales,
      totalOrders: validOrders.length,
      pendingOrders: pendingOrders.length,
      completedOrders: completedOrders.length,
      totalUsers: users.filter(u => u.role === 'user').length,
      totalProducts: products.length,
      lowStockProducts: lowStockProducts.length
    });
  };

  const calculateSalesData = () => {
    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const completedOrders = orders.filter(o => 
      (o.orderStatus === 'completed' || o.status === 'completed') &&
      o.items && o.items.length > 0
    );

    // Group by date
    const salesByDate = {};
    
    completedOrders.forEach(order => {
      const date = new Date(order.createdAt || order.orderDate || Date.now());
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = 0;
      }
      salesByDate[dateKey] += order.total || 0;
    });

    // Get last 7 days for daily
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      last7Days.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        sales: salesByDate[dateKey] || 0
      });
    }

    // Get last 4 weeks for weekly
    const last4Weeks = [];
    for (let i = 3; i >= 0; i--) {
      const endDate = new Date();
      endDate.setDate(endDate.getDate() - (i * 7));
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 6);
      
      let weekSales = 0;
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        weekSales += salesByDate[dateKey] || 0;
      }
      
      last4Weeks.push({
        date: `Week ${4 - i}`,
        sales: weekSales
      });
    }

    // Get last 6 months for monthly
    const last6Months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const year = date.getFullYear();
      const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      let monthSales = 0;
      Object.keys(salesByDate).forEach(dateKey => {
        if (dateKey.startsWith(monthKey)) {
          monthSales += salesByDate[dateKey];
        }
      });
      
      last6Months.push({
        date: month,
        sales: monthSales
      });
    }

    setSalesData({
      daily: last7Days,
      weekly: last4Weeks,
      monthly: last6Months
    });
  };

  const calculateTopProducts = () => {
    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const products = JSON.parse(localStorage.getItem('dkmerch_products')) || [];
    
    const completedOrders = orders.filter(o => 
      (o.orderStatus === 'completed' || o.status === 'completed') &&
      o.items && o.items.length > 0
    );

    // Count product sales
    const productSales = {};
    
    completedOrders.forEach(order => {
      order.items.forEach(item => {
        const productId = item.productId || item.id;
        if (!productSales[productId]) {
          // Find full product details from products array
          const fullProduct = products.find(p => p.id === productId);
          
          productSales[productId] = {
            quantity: 0,
            revenue: 0,
            name: item.name || fullProduct?.name || 'Unknown Product',
            image: item.image || fullProduct?.image || '/placeholder.png',
            price: item.price || fullProduct?.price || 0,
            kpopGroup: fullProduct?.kpopGroup || 'N/A',
            category: fullProduct?.category || 'N/A',
            stock: fullProduct?.stock || 0
          };
        }
        productSales[productId].quantity += item.quantity || 1;
        productSales[productId].revenue += (item.price || 0) * (item.quantity || 1);
      });
    });

    // Sort by quantity and get top 5
    const topProductsList = Object.entries(productSales)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    setTopProducts(topProductsList);
  };

  const getRecentOrders = () => {
    const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    
    const validOrders = orders
      .filter(o => o.items && o.items.length > 0)
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.orderDate || 0);
        const dateB = new Date(b.createdAt || b.orderDate || 0);
        return dateB - dateA;
      })
      .slice(0, 5);

    setRecentOrders(validOrders);
  };

  // Chart Data
  const getSalesChartData = () => {
    const data = timeRange === 'daily' ? salesData.daily : 
                 timeRange === 'weekly' ? salesData.weekly : 
                 salesData.monthly;

    return {
      labels: data.map(d => d.date),
      datasets: [
        {
          label: 'Sales (₱)',
          data: data.map(d => d.sales),
          borderColor: 'rgb(238, 77, 45)',
          backgroundColor: 'rgba(238, 77, 45, 0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: 'rgb(238, 77, 45)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 13 },
        callbacks: {
          label: function(context) {
            return `Sales: ₱${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '₱' + value.toLocaleString();
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  const getStatusBadgeClass = (status) => {
    switch(status?.toLowerCase()) {
      case 'completed': return 'status-completed';
      case 'pending': return 'status-pending';
      case 'confirmed': return 'status-confirmed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-pending';
    }
  };

  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setShowProductModal(true);
  };

  const handleCloseModal = () => {
    setShowProductModal(false);
    setTimeout(() => setSelectedProduct(null), 300);
  };

  return (
    <div className="admin-dashboard">
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card sales">
          <div className="stat-icon">
            <i className="fas fa-peso-sign"></i>
          </div>
          <div className="stat-details">
            <h3>Total Sales</h3>
            <p className="stat-value">₱{stats.totalSales.toLocaleString()}</p>
            <span className="stat-label">From {stats.completedOrders} completed orders</span>
          </div>
        </div>

        <div className="stat-card orders">
          <div className="stat-icon">
            <i className="fas fa-shopping-cart"></i>
          </div>
          <div className="stat-details">
            <h3>Total Orders</h3>
            <p className="stat-value">{stats.totalOrders}</p>
            <span className="stat-label">{stats.pendingOrders} pending orders</span>
          </div>
        </div>

        <div className="stat-card users">
          <div className="stat-icon">
            <i className="fas fa-users"></i>
          </div>
          <div className="stat-details">
            <h3>Registered Users</h3>
            <p className="stat-value">{stats.totalUsers}</p>
            <span className="stat-label">Active customers</span>
          </div>
        </div>

        <div className="stat-card products">
          <div className="stat-icon">
            <i className="fas fa-box"></i>
          </div>
          <div className="stat-details">
            <h3>Total Products</h3>
            <p className="stat-value">{stats.totalProducts}</p>
            <span className="stat-label warn">
              {stats.lowStockProducts} low stock items
            </span>
          </div>
        </div>
      </div>

      {/* Sales Chart - Full Width */}
      <div className="chart-card sales-chart full-width">
        <div className="chart-header">
          <div className="chart-title">
            <i className="fas fa-chart-line"></i>
            <h3>Sales Overview</h3>
          </div>
          <div className="chart-controls">
            <button 
              className={timeRange === 'daily' ? 'active' : ''}
              onClick={() => setTimeRange('daily')}
            >
              Daily
            </button>
            <button 
              className={timeRange === 'weekly' ? 'active' : ''}
              onClick={() => setTimeRange('weekly')}
            >
              Weekly
            </button>
            <button 
              className={timeRange === 'monthly' ? 'active' : ''}
              onClick={() => setTimeRange('monthly')}
            >
              Monthly
            </button>
          </div>
        </div>
        <div className="chart-body">
          <Line data={getSalesChartData()} options={chartOptions} />
        </div>
      </div>

      {/* Bottom Section - Side by Side */}
      <div className="bottom-grid">
        {/* Top Products */}
        <div className="data-card top-products">
          <div className="card-header">
            <i className="fas fa-trophy"></i>
            <h3>Top Selling Products</h3>
          </div>
          <div className="card-body">
            {topProducts.length > 0 ? (
              <div className="products-list">
                {topProducts.map((product, index) => (
                  <div 
                    key={product.id} 
                    className="product-item"
                    onClick={() => handleProductClick(product)}
                  >
                    <div className="product-rank">#{index + 1}</div>
                    <div className="product-info">
                      <h4>{product.name}</h4>
                      <p className="product-stats">
                        <span className="quantity">
                          <i className="fas fa-box"></i> {product.quantity} sold
                        </span>
                        <span className="revenue">₱{(product.revenue || 0).toLocaleString()}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">
                <i className="fas fa-box-open"></i>
                <p>No sales data yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Orders */}
        <div className="data-card recent-orders">
          <div className="card-header">
            <i className="fas fa-clock"></i>
            <h3>Recent Orders</h3>
          </div>
          <div className="card-body">
            {recentOrders.length > 0 ? (
              <div className="orders-list">
                {recentOrders.map(order => (
                  <div key={order.orderId || order.id} className="order-item">
                    <div className="order-info">
                      <div className="order-id">
                        <i className="fas fa-receipt"></i>
                        #{order.orderId || order.id}
                      </div>
                      <div className="order-customer">{order.customerName || 'Customer'}</div>
                    </div>
                    <div className="order-details">
                      <div className="order-total">₱{(order.total || 0).toLocaleString()}</div>
                      <span className={`order-status ${getStatusBadgeClass(order.orderStatus || order.status)}`}>
                        {(order.orderStatus || order.status || 'pending').toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">
                <i className="fas fa-shopping-cart"></i>
                <p>No orders yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Image Modal */}
      {showProductModal && selectedProduct && (
        <div className="product-modal-overlay" onClick={handleCloseModal}>
          <div className="product-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={handleCloseModal}>
              <i className="fas fa-times"></i>
            </button>
            
            <div className="modal-product-image">
              <img src={selectedProduct?.image || '/placeholder.png'} alt={selectedProduct?.name || 'Product'} />
            </div>
            
            <div className="modal-product-info">
              <h3>{selectedProduct?.name || 'Product Name'}</h3>
              <div className="modal-product-meta">
                <span className="modal-product-group">
                  <i className="fas fa-users"></i> {selectedProduct.kpopGroup || 'N/A'}
                </span>
                <span className="modal-product-category">
                  <i className="fas fa-tag"></i> {selectedProduct.category || 'N/A'}
                </span>
              </div>
              <div className="modal-product-price">₱{(selectedProduct?.price || 0).toLocaleString()}</div>
              <div className="modal-product-stock">
                <i className="fas fa-box"></i> Stock: {selectedProduct.stock || 0}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
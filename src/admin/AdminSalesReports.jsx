import React, { useState, useEffect } from 'react';
import './AdminSalesReports.css';
import { getValidOrders } from '../utils/orderStorage';
import { getProducts } from '../utils/productStorage';

const AdminSalesReports = () => {
  const [dateRange, setDateRange] = useState({
    startDate: '2026-01-01',
    endDate: '2026-02-09'
  });
  const [viewMode, setViewMode] = useState('Monthly');
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load and calculate real sales data
  useEffect(() => {
    calculateSalesData();
  }, [dateRange]);

  // Listen for order updates
  useEffect(() => {
    const handleUpdate = () => {
      calculateSalesData();
    };

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('orderUpdated', handleUpdate);
    window.addEventListener('productsUpdated', handleUpdate);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('orderUpdated', handleUpdate);
      window.removeEventListener('productsUpdated', handleUpdate);
    };
  }, [dateRange]);

  const calculateSalesData = () => {
    try {
      setLoading(true);
      
      const orders = getValidOrders();
      const products = getProducts();
      
      // Filter orders by date range
      const filteredOrders = orders.filter(order => {
        const orderDate = new Date(order.date || order.createdAt || order.orderDate);
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        end.setHours(23, 59, 59, 999); // Include end date fully
        
        return orderDate >= start && orderDate <= end;
      });

      // Calculate summary stats
      const totalRevenue = filteredOrders.reduce((sum, order) => {
        const orderTotal = parseFloat(order.totalAmount || order.total || 0);
        // Only count completed orders for revenue
        if (order.status === 'completed' || order.status === 'Completed' || order.status === 'Delivered') {
          return sum + orderTotal;
        }
        return sum;
      }, 0);

      const totalOrders = filteredOrders.length;
      
      const completedOrders = filteredOrders.filter(order => 
        order.status === 'completed' || 
        order.status === 'Completed' || 
        order.status === 'Delivered'
      ).length;

      const avgOrderValue = totalOrders > 0 ? totalRevenue / completedOrders : 0;

      // Calculate monthly sales trend (last 6 months)
      const salesTrend = calculateMonthlySales(orders);

      // Calculate monthly orders volume
      const ordersVolume = calculateMonthlyOrders(orders);

      // Calculate top selling products
      const topProducts = calculateTopProducts(filteredOrders, products);

      const data = {
        summary: {
          totalRevenue: Math.round(totalRevenue),
          totalOrders,
          completedOrders,
          avgOrderValue: Math.round(avgOrderValue)
        },
        salesTrend,
        ordersVolume,
        topProducts
      };

      setSalesData(data);
      setLoading(false);
    } catch (error) {
      console.error('Error calculating sales data:', error);
      setLoading(false);
    }
  };

  // Calculate sales for last 6 months
  const calculateMonthlySales = (orders) => {
    const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
    const monthData = {};

    // Initialize months
    months.forEach(month => {
      monthData[month] = 0;
    });

    // Calculate revenue per month
    orders.forEach(order => {
      const orderDate = new Date(order.date || order.createdAt || order.orderDate);
      const monthName = orderDate.toLocaleString('en', { month: 'short' });
      
      if (months.includes(monthName)) {
        const revenue = parseFloat(order.totalAmount || order.total || 0);
        // Only count completed orders
        if (order.status === 'completed' || order.status === 'Completed' || order.status === 'Delivered') {
          monthData[monthName] = (monthData[monthName] || 0) + revenue;
        }
      }
    });

    return months.map(month => ({
      month,
      revenue: Math.round(monthData[month] || 0)
    }));
  };

  // Calculate orders for last 6 months
  const calculateMonthlyOrders = (orders) => {
    const months = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
    const monthData = {};

    // Initialize months
    months.forEach(month => {
      monthData[month] = 0;
    });

    // Count orders per month
    orders.forEach(order => {
      const orderDate = new Date(order.date || order.createdAt || order.orderDate);
      const monthName = orderDate.toLocaleString('en', { month: 'short' });
      
      if (months.includes(monthName)) {
        monthData[monthName] = (monthData[monthName] || 0) + 1;
      }
    });

    return months.map(month => ({
      month,
      orders: monthData[month] || 0
    }));
  };

  // Calculate top 5 selling products
  const calculateTopProducts = (orders, products) => {
    const productSales = {};

    // Aggregate sales by product
    orders.forEach(order => {
      if (!order.items || !Array.isArray(order.items)) return;

      order.items.forEach(item => {
        const productId = item.id || item.productId;
        const quantity = parseInt(item.quantity || 1);
        const price = parseFloat(item.price || 0);
        const revenue = quantity * price;

        if (!productSales[productId]) {
          productSales[productId] = {
            id: productId,
            unitsSold: 0,
            revenue: 0
          };
        }

        // Only count completed orders
        if (order.status === 'completed' || order.status === 'Completed' || order.status === 'Delivered') {
          productSales[productId].unitsSold += quantity;
          productSales[productId].revenue += revenue;
        }
      });
    });

    // Convert to array and add product names
    const productsArray = Object.values(productSales).map(sale => {
      const product = products.find(p => p.id === sale.id);
      return {
        ...sale,
        name: product ? product.name : 'Unknown Product'
      };
    });

    // Sort by revenue and get top 5
    const topProducts = productsArray
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((product, index) => ({
        rank: index + 1,
        name: product.name,
        unitsSold: product.unitsSold,
        revenue: Math.round(product.revenue)
      }));

    return topProducts;
  };

  const handleDateChange = (e) => {
    setDateRange({
      ...dateRange,
      [e.target.name]: e.target.value
    });
  };

  const formatCurrency = (amount) => {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const getMaxValue = (data, key) => {
    const values = data.map(item => item[key]);
    const max = Math.max(...values);
    return max > 0 ? max : 1; // Avoid division by zero
  };

  if (loading) {
    return (
      <div className="admin-sales-reports">
        <div className="loading">
          <i className="fas fa-spinner fa-spin"></i> Loading sales data...
        </div>
      </div>
    );
  }

  if (!salesData) {
    return (
      <div className="admin-sales-reports">
        <div className="loading">No sales data available</div>
      </div>
    );
  }

  return (
    <div className="admin-sales-reports">
      <div className="reports-header">
        <div>
          <h1>Sales Report</h1>
          <p className="subtitle">Track your store's performance with real-time data</p>
        </div>
      </div>

      {/* Date Filter Section */}
      <div className="filter-section">
        <div className="date-inputs">
          <div className="date-input-group">
            <label htmlFor="startDate">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </label>
            <input
              type="date"
              id="startDate"
              name="startDate"
              value={dateRange.startDate}
              onChange={handleDateChange}
            />
          </div>
          
          <span className="date-separator">to</span>
          
          <div className="date-input-group">
            <label htmlFor="endDate">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </label>
            <input
              type="date"
              id="endDate"
              name="endDate"
              value={dateRange.endDate}
              onChange={handleDateChange}
            />
          </div>
        </div>

        <div className="view-mode-tabs">
          {['Daily', 'Weekly', 'Monthly'].map(mode => (
            <button
              key={mode}
              className={`mode-tab ${viewMode === mode ? 'active' : ''}`}
              onClick={() => setViewMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card revenue">
          <div className="card-icon revenue-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="card-content">
            <div className="card-value">{formatCurrency(salesData.summary.totalRevenue)}</div>
            <div className="card-label">Total Revenue</div>
          </div>
        </div>

        <div className="summary-card orders">
          <div className="card-icon orders-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </div>
          <div className="card-content">
            <div className="card-value">{salesData.summary.totalOrders}</div>
            <div className="card-label">Total Orders</div>
          </div>
        </div>

        <div className="summary-card completed">
          <div className="card-icon completed-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="card-content">
            <div className="card-value">{salesData.summary.completedOrders}</div>
            <div className="card-label">Completed Orders</div>
          </div>
        </div>

        <div className="summary-card average">
          <div className="card-icon average-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div className="card-content">
            <div className="card-value">{formatCurrency(salesData.summary.avgOrderValue)}</div>
            <div className="card-label">Avg. Order Value</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid">
        {/* Sales Trend Chart */}
        <div className="chart-container">
          <h3>Sales Trend (Last 6 Months)</h3>
          <div className="line-chart">
            <svg viewBox="0 0 600 200" className="chart-svg">
              {/* Y-axis labels */}
              <text x="10" y="20" className="axis-label">₱{Math.round(getMaxValue(salesData.salesTrend, 'revenue') / 1000)}k</text>
              <text x="10" y="70" className="axis-label">₱{Math.round(getMaxValue(salesData.salesTrend, 'revenue') * 0.75 / 1000)}k</text>
              <text x="10" y="120" className="axis-label">₱{Math.round(getMaxValue(salesData.salesTrend, 'revenue') * 0.5 / 1000)}k</text>
              <text x="10" y="170" className="axis-label">₱{Math.round(getMaxValue(salesData.salesTrend, 'revenue') * 0.25 / 1000)}k</text>
              <text x="10" y="195" className="axis-label">₱0k</text>

              {/* Grid lines */}
              <line x1="50" y1="20" x2="580" y2="20" className="grid-line" />
              <line x1="50" y1="70" x2="580" y2="70" className="grid-line" />
              <line x1="50" y1="120" x2="580" y2="120" className="grid-line" />
              <line x1="50" y1="170" x2="580" y2="170" className="grid-line" />

              {/* Line chart path */}
              <polyline
                points={salesData.salesTrend.map((item, index) => {
                  const x = 80 + (index * 85);
                  const maxRevenue = getMaxValue(salesData.salesTrend, 'revenue');
                  const y = maxRevenue > 0 ? 190 - (item.revenue / maxRevenue * 170) : 190;
                  return `${x},${y}`;
                }).join(' ')}
                className="chart-line"
              />

              {/* Data points */}
              {salesData.salesTrend.map((item, index) => {
                const x = 80 + (index * 85);
                const maxRevenue = getMaxValue(salesData.salesTrend, 'revenue');
                const y = maxRevenue > 0 ? 190 - (item.revenue / maxRevenue * 170) : 190;
                return (
                  <g key={index}>
                    <circle cx={x} cy={y} r="5" className="data-point" />
                    <text x={x} y="200" className="x-axis-label" textAnchor="middle">{item.month}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Orders Volume Chart */}
        <div className="chart-container">
          <h3>Orders Volume (Last 6 Months)</h3>
          <div className="bar-chart">
            <svg viewBox="0 0 600 200" className="chart-svg">
              {/* Y-axis labels */}
              <text x="10" y="20" className="axis-label">{getMaxValue(salesData.ordersVolume, 'orders')}</text>
              <text x="10" y="70" className="axis-label">{Math.round(getMaxValue(salesData.ordersVolume, 'orders') * 0.75)}</text>
              <text x="10" y="120" className="axis-label">{Math.round(getMaxValue(salesData.ordersVolume, 'orders') * 0.5)}</text>
              <text x="10" y="170" className="axis-label">{Math.round(getMaxValue(salesData.ordersVolume, 'orders') * 0.25)}</text>
              <text x="10" y="195" className="axis-label">0</text>

              {/* Grid lines */}
              <line x1="50" y1="20" x2="580" y2="20" className="grid-line" />
              <line x1="50" y1="70" x2="580" y2="70" className="grid-line" />
              <line x1="50" y1="120" x2="580" y2="120" className="grid-line" />
              <line x1="50" y1="170" x2="580" y2="170" className="grid-line" />

              {/* Bars */}
              {salesData.ordersVolume.map((item, index) => {
                const x = 60 + (index * 85);
                const maxOrders = getMaxValue(salesData.ordersVolume, 'orders');
                const barHeight = maxOrders > 0 ? (item.orders / maxOrders) * 170 : 0;
                const y = 190 - barHeight;
                return (
                  <g key={index}>
                    <rect
                      x={x}
                      y={y}
                      width="60"
                      height={barHeight}
                      className="bar"
                    />
                    <text x={x + 30} y="200" className="x-axis-label" textAnchor="middle">{item.month}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Top Selling Products */}
      <div className="top-products-section">
        <h3>Top Selling Products</h3>
        {salesData.topProducts.length > 0 ? (
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
                {salesData.topProducts.map(product => (
                  <tr key={product.rank}>
                    <td className="rank-cell">{product.rank}</td>
                    <td className="product-name">{product.name}</td>
                    <td>{product.unitsSold}</td>
                    <td className="revenue-cell">{formatCurrency(product.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <i className="fas fa-chart-line"></i>
            <p>No sales data available for the selected period</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminSalesReports;
import React, { useState, useEffect } from 'react';
import './AdminOrders.css';

const AdminOrders = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadOrders();

    const handleUpdate = () => loadOrders();
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('orderUpdated', handleUpdate);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('orderUpdated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    filterOrders();
  }, [activeTab, orders, searchTerm]);

  const loadOrders = () => {
    const storedOrders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    
    const validOrders = storedOrders.filter(order => {
      return order && 
             order.orderId && 
             order.items && 
             Array.isArray(order.items) && 
             order.items.length > 0;
    });

    const sorted = validOrders.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    );

    setOrders(sorted);
  };

  // ✅ FIXED FILTER WITH NULL/UNDEFINED CHECKS
  const filterOrders = () => {
    let filtered = [...orders];

    if (activeTab !== 'all') {
      filtered = filtered.filter(order => order.orderStatus === activeTab);
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(order => {
        // ✅ Safe checks for undefined/null values
        const orderId = order.orderId || '';
        const customerName = order.customerName || '';
        const email = order.email || '';
        
        return orderId.toLowerCase().includes(searchLower) ||
               customerName.toLowerCase().includes(searchLower) ||
               email.toLowerCase().includes(searchLower);
      });
    }

    setFilteredOrders(filtered);
  };

  const getPendingCount = () => {
    return orders.filter(o => o.orderStatus === 'pending').length;
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#ffc107',
      confirmed: '#17a2b8',
      shipped: '#007bff',
      completed: '#28a745',
      cancelled: '#dc3545'
    };
    return colors[status] || '#6c757d';
  };

  // ✅ FIXED: Update BOTH orderStatus AND status fields
  const updateOrderStatus = (orderId, newStatus) => {
    const updatedOrders = orders.map(order => 
      order.orderId === orderId 
        ? { 
            ...order, 
            orderStatus: newStatus,  // For admin panel
            status: mapStatusToTrackingStatus(newStatus),  // For tracking timeline
            updatedAt: new Date().toISOString() 
          }
        : order
    );

    localStorage.setItem('dkmerch_orders', JSON.stringify(updatedOrders));
    setOrders(updatedOrders);
    
    if (selectedOrder?.orderId === orderId) {
      setSelectedOrder({ 
        ...selectedOrder, 
        orderStatus: newStatus,
        status: mapStatusToTrackingStatus(newStatus)
      });
    }

    window.dispatchEvent(new Event('orderUpdated'));
    window.dispatchEvent(new Event('storage'));
  };

  // ✅ NEW: Map admin status to tracking timeline status
  const mapStatusToTrackingStatus = (adminStatus) => {
    const statusMap = {
      'pending': 'Processing',
      'confirmed': 'Confirmed',
      'shipped': 'Shipped',
      'completed': 'Delivered',
      'cancelled': 'Cancelled'
    };
    return statusMap[adminStatus] || 'Processing';
  };

  const deleteOrder = (orderId) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      const updatedOrders = orders.filter(order => order.orderId !== orderId);
      localStorage.setItem('dkmerch_orders', JSON.stringify(updatedOrders));
      setOrders(updatedOrders);
      setSelectedOrder(null);
      window.dispatchEvent(new Event('orderUpdated'));
      window.dispatchEvent(new Event('storage'));
    }
  };

  return (
    <div className="admin-orders-page">
      {/* Tabs */}
      <div className="orders-tabs">
        <button 
          className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <i className="fas fa-list"></i>
          All Orders
        </button>
        <button 
          className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <i className="fas fa-clock"></i>
          Pending {getPendingCount() > 0 && `(${getPendingCount()})`}
        </button>
        <button 
          className={`tab-btn ${activeTab === 'confirmed' ? 'active' : ''}`}
          onClick={() => setActiveTab('confirmed')}
        >
          <i className="fas fa-check-circle"></i>
          Confirmed
        </button>
        <button 
          className={`tab-btn ${activeTab === 'shipped' ? 'active' : ''}`}
          onClick={() => setActiveTab('shipped')}
        >
          <i className="fas fa-shipping-fast"></i>
          Shipped
        </button>
        <button 
          className={`tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <i className="fas fa-check-double"></i>
          Completed
        </button>
      </div>

      {/* Search Filter */}
      <div className="orders-filters">
        <div className="filter-group">
          <input 
            type="text"
            className="search-input"
            placeholder="🔍 Search by Order ID, Customer Name, or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="orders-container">
        {filteredOrders.length === 0 ? (
          <div className="empty-orders">
            <i className="fas fa-inbox"></i>
            <p>No orders found</p>
          </div>
        ) : (
          <div className="orders-table-container">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>ORDER ID</th>
                  <th>CUSTOMER</th>
                  <th>ITEMS</th>
                  <th>TOTAL</th>
                  <th>STATUS</th>
                  <th>DATE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.orderId}>
                    <td>
                      <strong>#{order.orderId.slice(-8)}</strong>
                    </td>
                    <td>
                      <div className="customer-info">
                        <strong>{order.customerName || 'N/A'}</strong>
                        <small>{order.email || 'N/A'}</small>
                      </div>
                    </td>
                    <td>{order.items.length} item(s)</td>
                    <td>
                      <strong>₱{(order.total || 0).toLocaleString()}</strong>
                    </td>
                    <td>
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(order.orderStatus) }}
                      >
                        {order.orderStatus || 'pending'}
                      </span>
                    </td>
                    <td>
                      {order.createdAt 
                        ? new Date(order.createdAt).toLocaleDateString('en-PH')
                        : 'N/A'
                      }
                    </td>
                    <td>
                      <button
                        className="view-btn"
                        onClick={() => setSelectedOrder(order)}
                      >
                        <i className="fas fa-eye"></i> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order Modal */}
      {selectedOrder && (
        <OrderModal 
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onUpdateStatus={updateOrderStatus}
          onDelete={deleteOrder}
        />
      )}
    </div>
  );
};

// Order Modal Component
const OrderModal = ({ order, onClose, onUpdateStatus, onDelete }) => {
  const [productReviews, setProductReviews] = useState([]);

  useEffect(() => {
    loadProductReviews();
  }, [order]);

  const loadProductReviews = () => {
    const allReviews = JSON.parse(localStorage.getItem('product_reviews')) || [];
    
    // Get product IDs from this order
    const productIds = order.items.map(item => item.id);
    
    // Filter reviews for products in this order
    const orderReviews = allReviews.filter(review => 
      productIds.includes(review.productId)
    );
    
    setProductReviews(orderReviews);
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#ffc107',
      confirmed: '#17a2b8',
      shipped: '#007bff',
      completed: '#28a745',
      cancelled: '#dc3545'
    };
    return colors[status] || '#6c757d';
  };

  const subtotal = order.subtotal || 0;
  const shippingFee = order.shippingFee || 0;
  const total = order.total || (subtotal + shippingFee);

  return (
    <div className="order-modal-overlay" onClick={onClose}>
      <div className="order-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Order #{order.orderId?.slice(-8) || 'N/A'}</h2>
            <span 
              className="status-badge"
              style={{ backgroundColor: getStatusColor(order.orderStatus) }}
            >
              {order.orderStatus || 'pending'}
            </span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {/* Customer Information */}
          <div className="modal-section">
            <h3><i className="fas fa-user"></i> Customer Information</h3>
            <div className="order-info-grid">
              <div className="info-item">
                <label>Full Name</label>
                <strong>{order.customerName || 'N/A'}</strong>
              </div>
              <div className="info-item">
                <label>Email Address</label>
                <span>{order.email || 'N/A'}</span>
              </div>
              <div className="info-item">
                <label>Phone Number</label>
                <span>{order.phone || 'N/A'}</span>
              </div>
              <div className="info-item">
                <label>Delivery Address</label>
                <span>{order.address || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Order Information */}
          <div className="modal-section">
            <h3><i className="fas fa-info-circle"></i> Order Information</h3>
            <div className="order-info-grid">
              <div className="info-item">
                <label>Order ID</label>
                <strong>#{order.orderId || 'N/A'}</strong>
              </div>
              <div className="info-item">
                <label>Order Date</label>
                <span>
                  {order.createdAt 
                    ? new Date(order.createdAt).toLocaleString('en-PH')
                    : 'N/A'
                  }
                </span>
              </div>
              <div className="info-item">
                <label>Payment Method</label>
                <span>{order.paymentMethod || 'N/A'}</span>
              </div>
              <div className="info-item">
                <label>Order Status</label>
                <span 
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(order.orderStatus) }}
                >
                  {order.orderStatus || 'pending'}
                </span>
              </div>
            </div>
          </div>

          {/* Order Items */}
          <div className="modal-section">
            <h3>
              <i className="fas fa-box"></i> 
              Order Items ({order.items?.length || 0})
            </h3>
            <div className="order-items-list">
              {order.items && order.items.length > 0 ? (
                order.items.map((item, index) => (
                  <div key={index} className="order-item-card">
                    <div className="item-image">
                      <img 
                        src={item.image} 
                        alt={item.name || 'Product'}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/80x80?text=No+Image';
                        }}
                      />
                    </div>
                    <div className="item-details">
                      <strong>{item.name || 'N/A'}</strong>
                      <div className="item-specs">
                        <span className="spec-badge">Size: {item.size || 'N/A'}</span>
                        <span className="spec-badge">Color: {item.color || 'N/A'}</span>
                      </div>
                      <p className="item-price">
                        ₱{(item.price || 0).toLocaleString()} × {item.quantity || 0} pc(s)
                      </p>
                    </div>
                    <div className="item-subtotal">
                      ₱{((item.quantity || 0) * (item.price || 0)).toLocaleString()}
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                  No items found
                </p>
              )}
            </div>
          </div>

          {/* ✅ PRODUCT REVIEWS SECTION */}
          {productReviews.length > 0 && (
            <div className="modal-section">
              <h3>
                <i className="fas fa-star"></i> 
                Product Reviews ({productReviews.length})
              </h3>
              <div className="reviews-list">
                {productReviews.map((review) => (
                  <div key={review.id} className="review-card">
                    <div className="review-card-header">
                      <div className="review-product-info">
                        <img 
                          src={review.productImage} 
                          alt={review.productName}
                          className="review-product-image"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://via.placeholder.com/50x50?text=No+Image';
                          }}
                        />
                        <div>
                          <strong className="review-product-name">{review.productName}</strong>
                          <div className="review-stars">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <i
                                key={star}
                                className={`fas fa-star ${star <= review.rating ? 'filled' : ''}`}
                              ></i>
                            ))}
                          </div>
                        </div>
                      </div>
                      <span className="review-date">
                        {new Date(review.createdAt).toLocaleDateString('en-PH')}
                      </span>
                    </div>
                    <div className="review-card-body">
                      <p className="review-text">{review.review}</p>
                      <div className="review-customer">
                        <i className="fas fa-user-circle"></i>
                        <span>{review.userName}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div className="modal-section">
            <h3><i className="fas fa-calculator"></i> Order Summary</h3>
            <div className="order-totals">
              <div className="total-row">
                <span>Subtotal ({order.items?.length || 0} items):</span>
                <strong>₱{subtotal.toLocaleString()}</strong>
              </div>
              <div className="total-row">
                <span>Shipping Fee:</span>
                <strong>₱{shippingFee.toLocaleString()}</strong>
              </div>
              <div className="total-row grand-total">
                <span>Total Amount:</span>
                <strong>₱{total.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Status Management */}
          <div className="modal-section">
            <h3><i className="fas fa-tasks"></i> Update Order Status</h3>
            <div className="status-buttons">
              <button
                className="status-btn pending"
                onClick={() => onUpdateStatus(order.orderId, 'pending')}
                disabled={order.orderStatus === 'pending'}
              >
                <i className="fas fa-clock"></i> Pending
              </button>
              <button
                className="status-btn confirmed"
                onClick={() => onUpdateStatus(order.orderId, 'confirmed')}
                disabled={order.orderStatus === 'confirmed'}
              >
                <i className="fas fa-check-circle"></i> Confirmed
              </button>
              <button
                className="status-btn shipped"
                onClick={() => onUpdateStatus(order.orderId, 'shipped')}
                disabled={order.orderStatus === 'shipped'}
              >
                <i className="fas fa-shipping-fast"></i> Shipped
              </button>
              <button
                className="status-btn completed"
                onClick={() => onUpdateStatus(order.orderId, 'completed')}
                disabled={order.orderStatus === 'completed'}
              >
                <i className="fas fa-check-double"></i> Completed
              </button>
              <button
                className="status-btn cancelled"
                onClick={() => onUpdateStatus(order.orderId, 'cancelled')}
                disabled={order.orderStatus === 'cancelled'}
              >
                <i className="fas fa-times-circle"></i> Cancelled
              </button>
            </div>
          </div>

          {/* Delete Order */}
          <div className="modal-actions">
            <button 
              className="delete-order-btn"
              onClick={() => onDelete(order.orderId)}
            >
              <i className="fas fa-trash"></i> Delete Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminOrders;
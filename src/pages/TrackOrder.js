import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './TrackOrder.css';
import { getOrdersByUser } from '../utils/orderStorage';
import { getProducts } from '../utils/productStorage';

const TrackOrder = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order');

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  
  // For non-logged in users - EMAIL ONLY
  const [trackingEmail, setTrackingEmail] = useState('');
  const [trackedOrders, setTrackedOrders] = useState([]);
  const [showTrackedOrders, setShowTrackedOrders] = useState(false);

  useEffect(() => {
    loadProducts();
    
    if (isAuthenticated && user) {
      loadUserOrders();
      
      // If there's an order ID in URL, open that order's modal
      if (orderIdParam) {
        const userOrders = getOrdersByUser(user.email);
        const foundOrder = userOrders.find(o => 
          (o.orderId === orderIdParam || o.id === orderIdParam)
        );
        if (foundOrder) {
          setSelectedOrder(foundOrder);
        }
      }
    }

    const handleStorageChange = () => {
      loadProducts();
      if (isAuthenticated && user) {
        loadUserOrders();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('orderUpdated', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('orderUpdated', handleStorageChange);
    };
  }, [isAuthenticated, user, orderIdParam]);

  const loadProducts = () => {
    const allProducts = getProducts();
    setProducts(allProducts);
  };

  const loadUserOrders = () => {
    if (!user || !user.email) {
      setOrders([]);
      return;
    }

    // ✅ GET ONLY THIS USER'S ORDERS
    const userOrders = getOrdersByUser(user.email);
    setOrders(userOrders);
  };

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    
    if (!trackingEmail.trim()) {
      alert('Please enter your email address');
      return;
    }

    // ✅ GET ALL ORDERS FOR THIS EMAIL
    const emailOrders = getOrdersByUser(trackingEmail.trim());
    
    if (emailOrders.length > 0) {
      setTrackedOrders(emailOrders);
      setShowTrackedOrders(true);
    } else {
      alert('No orders found for this email address.');
      setTrackedOrders([]);
      setShowTrackedOrders(false);
    }
  };

  const getProductById = (id) => {
    return products.find(p => p.id === id);
  };

  const getStatusClass = (status) => {
    const statusMap = {
      'Processing': 'status-processing',
      'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped',
      'In Transit': 'status-transit',
      'Out for Delivery': 'status-delivery',
      'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled',
      'pending': 'status-processing',
      'confirmed': 'status-confirmed',
      'shipped': 'status-shipped',
      'completed': 'status-delivered',
      'cancelled': 'status-cancelled',
    };
    return statusMap[status] || 'status-processing';
  };

  const getTimelineSteps = (status) => {
    const normalizedStatus = (status || '').toLowerCase();
    
    const steps = [
      { 
        label: 'Order Placed', 
        icon: 'fa-shopping-cart',
        completed: true 
      },
      { 
        label: 'Confirmed', 
        icon: 'fa-check-circle',
        completed: ['confirmed', 'shipped', 'in transit', 'out for delivery', 'delivered', 'completed'].includes(normalizedStatus)
      },
      { 
        label: 'Shipped', 
        icon: 'fa-box',
        completed: ['shipped', 'in transit', 'out for delivery', 'delivered', 'completed'].includes(normalizedStatus)
      },
      { 
        label: 'Out for Delivery', 
        icon: 'fa-truck',
        completed: ['out for delivery', 'delivered', 'completed'].includes(normalizedStatus)
      },
      { 
        label: 'Delivered', 
        icon: 'fa-check-double',
        completed: ['delivered', 'completed'].includes(normalizedStatus)
      },
    ];

    if (normalizedStatus === 'cancelled') {
      return [
        { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true },
        { label: 'Cancelled', icon: 'fa-times-circle', completed: true }
      ];
    }

    return steps;
  };

  const filteredOrders = filter === 'all' 
    ? orders 
    : orders.filter(order => {
        const orderStatus = (order.status || order.orderStatus || '').toLowerCase();
        const filterStatus = filter.toLowerCase();
        return orderStatus === filterStatus;
      });

  // ✅ LOGGED IN USER VIEW
  if (isAuthenticated && user) {
    return (
      <main>
        <div className="page-header">
          <div className="container">
            <h1 className="page-title">Track Orders</h1>
            <p className="page-description">View the status of your orders</p>
          </div>
        </div>

        <div className="container">
          <section className="track-order-page">
            <div className="orders-filter">
              <button 
                className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All Orders ({orders.length})
              </button>
              <button 
                className={`filter-btn ${filter === 'processing' ? 'active' : ''}`}
                onClick={() => setFilter('processing')}
              >
                Processing
              </button>
              <button 
                className={`filter-btn ${filter === 'shipped' ? 'active' : ''}`}
                onClick={() => setFilter('shipped')}
              >
                Shipped
              </button>
              <button 
                className={`filter-btn ${filter === 'delivered' ? 'active' : ''}`}
                onClick={() => setFilter('delivered')}
              >
                Delivered
              </button>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="orders-empty">
                <i className="fas fa-shipping-fast"></i>
                <h3>No Orders Found</h3>
                <p>You haven't placed any orders yet. Start shopping to see your orders here!</p>
                <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                  <i className="fas fa-shopping-bag"></i> Start Shopping
                </button>
              </div>
            ) : (
              <div className="orders-list">
                {filteredOrders.map(order => {
                  const orderId = order.orderId || order.id;
                  const orderDate = order.date || order.createdAt;
                  const orderStatus = order.status || order.orderStatus || 'Processing';
                  const orderTotal = order.total || 0;

                  return (
                    <div key={orderId} className="order-card">
                      <div className="order-header">
                        <div className="order-info">
                          <h3>Order #{orderId?.slice(-8) || 'N/A'}</h3>
                          <p className="order-date">
                            <i className="fas fa-calendar"></i>
                            {orderDate 
                              ? new Date(orderDate).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'N/A'
                            }
                          </p>
                        </div>
                        <div className={`order-status ${getStatusClass(orderStatus)}`}>
                          {orderStatus}
                        </div>
                      </div>

                      <div className="order-items">
                        {order.items && order.items.map((item, index) => {
                          const product = getProductById(item.id || item.productId);
                          if (!product) return null;
                          
                          return (
                            <div key={index} className="order-item">
                              <div className="order-item-image">
                                <img src={product.image} alt={product.name} />
                              </div>
                              <div className="order-item-details">
                                <h4>{product.name}</h4>
                                <p className="order-item-group">{product.kpopGroup}</p>
                                <p className="order-item-quantity">Quantity: {item.quantity}</p>
                              </div>
                              <div className="order-item-price">
                                ₱{(product.price * item.quantity).toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="order-footer">
                        <div className="order-total">
                          <span>Total Amount:</span>
                          <span className="total-price">₱{orderTotal.toLocaleString()}</span>
                        </div>
                        <div className="order-actions">
                          <button 
                            className="btn btn-primary btn-small"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <i className="fas fa-search"></i> View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {selectedOrder && (
          <TrackingModal 
            order={selectedOrder}
            products={products}
            onClose={() => setSelectedOrder(null)}
            getTimelineSteps={getTimelineSteps}
            getStatusClass={getStatusClass}
          />
        )}
      </main>
    );
  }

  // ✅ NON-LOGGED IN USER VIEW - REMOVED LOGIN PROMPTS
  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Track Your Order</h1>
          <p className="page-description">Enter your email to view your order status</p>
        </div>
      </div>

      <div className="container">
        <section className="track-order-page">
          <div className="tracking-form-section">
            <div className="tracking-form">
              <h2>Find My Orders</h2>
              <form onSubmit={handleFindMyOrders}>
                <div className="form-group">
                  <label htmlFor="tracking-email">Email Address</label>
                  <input
                    type="email"
                    id="tracking-email"
                    className="form-control"
                    placeholder="Enter your email address"
                    value={trackingEmail}
                    onChange={(e) => setTrackingEmail(e.target.value)}
                    required
                  />
                  <small>Enter the email you used when placing your order</small>
                </div>
                
                <button type="submit" className="btn btn-primary">
                  <i className="fas fa-search"></i> Find My Orders
                </button>
              </form>
            </div>

            <div className="tracking-info">
              <h3>How to Track Your Order</h3>
              <ul>
                <li>
                  <i className="fas fa-check"></i>
                  Enter your email address in the form
                </li>
                <li>
                  <i className="fas fa-check"></i>
                  View all orders using just your email
                </li>
                <li>
                  <i className="fas fa-check"></i>
                  Track multiple orders at once
                </li>
                <li>
                  <i className="fas fa-check"></i>
                  See real-time order status updates
                </li>
              </ul>
            </div>
          </div>

          {/* ✅ SHOW TRACKED ORDERS IF FOUND */}
          {showTrackedOrders && trackedOrders.length > 0 && (
            <div className="tracked-orders-section">
              <div className="tracked-orders-header">
                <h2>Your Orders</h2>
                <p>Found {trackedOrders.length} order{trackedOrders.length > 1 ? 's' : ''} for {trackingEmail}</p>
              </div>

              <div className="orders-list">
                {trackedOrders.map(order => {
                  const orderId = order.orderId || order.id;
                  const orderDate = order.date || order.createdAt;
                  const orderStatus = order.status || order.orderStatus || 'Processing';
                  const orderTotal = order.total || 0;

                  return (
                    <div key={orderId} className="order-card">
                      <div className="order-header">
                        <div className="order-info">
                          <h3>Order #{orderId?.slice(-8) || 'N/A'}</h3>
                          <p className="order-date">
                            <i className="fas fa-calendar"></i>
                            {orderDate 
                              ? new Date(orderDate).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric'
                                })
                              : 'N/A'
                            }
                          </p>
                        </div>
                        <div className={`order-status ${getStatusClass(orderStatus)}`}>
                          {orderStatus}
                        </div>
                      </div>

                      <div className="order-items">
                        {order.items && order.items.map((item, index) => {
                          const product = getProductById(item.id || item.productId);
                          if (!product) return null;
                          
                          return (
                            <div key={index} className="order-item">
                              <div className="order-item-image">
                                <img src={product.image} alt={product.name} />
                              </div>
                              <div className="order-item-details">
                                <h4>{product.name}</h4>
                                <p className="order-item-group">{product.kpopGroup}</p>
                                <p className="order-item-quantity">Quantity: {item.quantity}</p>
                              </div>
                              <div className="order-item-price">
                                ₱{(product.price * item.quantity).toLocaleString()}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="order-footer">
                        <div className="order-total">
                          <span>Total Amount:</span>
                          <span className="total-price">₱{orderTotal.toLocaleString()}</span>
                        </div>
                        <div className="order-actions">
                          <button 
                            className="btn btn-primary btn-small"
                            onClick={() => setSelectedOrder(order)}
                          >
                            <i className="fas fa-search"></i> View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* ✅ TRACKING MODAL */}
      {selectedOrder && (
        <TrackingModal 
          order={selectedOrder}
          products={products}
          onClose={() => setSelectedOrder(null)}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
        />
      )}
    </main>
  );
};

// ✅ TRACKING MODAL COMPONENT
const TrackingModal = ({ order, products, onClose, getTimelineSteps, getStatusClass }) => {
  const orderId = order.orderId || order.id;
  const orderStatus = order.status || order.orderStatus || 'Processing';

  const timelineSteps = getTimelineSteps(orderStatus);

  const getProductById = (id) => {
    return products.find(p => p.id === id);
  };

  // ✅ Prevent background scrolling when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>

        <div className="tracking-result">
          <div className="result-header">
            <h2>Order #{orderId?.slice(-8) || 'N/A'}</h2>
            <div className={`status-badge ${getStatusClass(orderStatus)}`}>
              {orderStatus}
            </div>
          </div>

          <div className="delivery-estimate">
            <i className="fas fa-truck"></i>
            <div>
              <strong>Estimated Delivery</strong>
              <p>To be determined by admin</p>
            </div>
          </div>

          <div className="tracking-timeline">
            <h3>Order Timeline</h3>
            <div className="timeline">
              {timelineSteps.map((step, index) => (
                <div key={index} className={`timeline-item ${step.completed ? 'completed' : ''}`}>
                  <div className="timeline-marker">
                    <i className={`fas ${step.icon}`}></i>
                  </div>
                  <div className="timeline-content">
                    <h4>{step.label}</h4>
                    <p>{step.completed ? 'Completed' : 'Pending'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="order-items-timeline">
            <h3>Order Items</h3>
            {order.items && order.items.map((item, index) => {
              const product = getProductById(item.id || item.productId);
              if (!product) return null;

              return (
                <div key={index} className="order-item-timeline">
                  <div className="item-details">
                    <strong>{product.name}</strong>
                    <span>{product.kpopGroup} • Qty: {item.quantity}</span>
                  </div>
                  <div className="item-price">
                    ₱{(product.price * item.quantity).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackOrder;
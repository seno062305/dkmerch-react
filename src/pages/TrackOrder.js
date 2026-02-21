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

  const [trackingEmail, setTrackingEmail] = useState('');
  const [trackedOrders, setTrackedOrders] = useState([]);
  const [showTrackedOrders, setShowTrackedOrders] = useState(false);

  useEffect(() => {
    loadProducts();

    if (isAuthenticated && user) {
      loadUserOrders();

      if (orderIdParam) {
        const userOrders = getOrdersByUser(user.email);
        const foundOrder = userOrders.find(
          o => o.orderId === orderIdParam || o.id === orderIdParam
        );
        if (foundOrder) setSelectedOrder(foundOrder);
      }
    }

    const handleStorageChange = () => {
      loadProducts();
      if (isAuthenticated && user) loadUserOrders();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('orderUpdated', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('orderUpdated', handleStorageChange);
    };
  }, [isAuthenticated, user, orderIdParam]);

  // Auto-refresh selectedOrder from localStorage
  useEffect(() => {
    if (!selectedOrder) return;
    const interval = setInterval(() => {
      const all = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
      const updated = all.find(o => o.orderId === (selectedOrder.orderId || selectedOrder.id));
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedOrder)) {
        setSelectedOrder(updated);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedOrder]);

  const loadProducts = () => setProducts(getProducts());

  const loadUserOrders = () => {
    if (!user?.email) { setOrders([]); return; }
    setOrders(getOrdersByUser(user.email));
  };

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    if (!trackingEmail.trim()) { alert('Please enter your email address'); return; }
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

  const getProductById = (id) => products.find(p => p.id === id);

  const getStatusClass = (status) => {
    const statusMap = {
      'Processing': 'status-processing',
      'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped',
      'In Transit': 'status-transit',
      'Out for Delivery': 'status-delivery',
      'out_for_delivery': 'status-delivery',
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

  const getTimelineSteps = (status, riderInfo, cancelReason) => {
    const normalizedStatus = (status || '').toLowerCase().replace(/ /g, '_');

    if (normalizedStatus === 'cancelled') {
      return [
        { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true },
        {
          label: 'Cancelled',
          icon: 'fa-times-circle',
          completed: true,
          isCancelled: true,
          cancelReason: cancelReason || null,
        },
      ];
    }

    return [
      {
        label: 'Order Placed',
        icon: 'fa-shopping-cart',
        completed: true,
      },
      {
        label: 'Confirmed',
        icon: 'fa-check-circle',
        completed: ['confirmed', 'shipped', 'in_transit', 'out_for_delivery', 'delivered', 'completed'].includes(normalizedStatus),
      },
      {
        label: 'Shipped',
        icon: 'fa-box',
        completed: ['shipped', 'in_transit', 'out_for_delivery', 'delivered', 'completed'].includes(normalizedStatus),
      },
      {
        label: 'Out for Delivery',
        icon: 'fa-shipping-fast',
        completed: ['out_for_delivery', 'delivered', 'completed'].includes(normalizedStatus),
      },
      {
        label: 'Delivered',
        icon: 'fa-check-double',
        completed: ['delivered', 'completed'].includes(normalizedStatus),
      },
    ];
  };

  const getDisplayStatus = (order) => {
    const s = order.orderStatus || order.status || 'Processing';
    const labels = {
      pending: 'Processing',
      confirmed: 'Confirmed',
      shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery',
      completed: 'Delivered',
      cancelled: 'Cancelled',
    };
    return labels[s] || s;
  };

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(order => {
        const orderStatus = (order.status || order.orderStatus || '').toLowerCase();
        return orderStatus === filter.toLowerCase();
      });

  // ─── LOGGED IN VIEW ───
  if (isAuthenticated && user) {
    return (
      <main className="trackorder-main">
        <div className="page-header">
          <div className="container">
            <h1 className="page-title">Track Orders</h1>
            <p className="page-description">View the status of your orders</p>
          </div>
        </div>

        <div className="container">
          <section className="track-order-page">
            <div className="orders-filter">
              {[
                { key: 'all', label: `All Orders (${orders.length})` },
                { key: 'processing', label: 'Processing' },
                { key: 'shipped', label: 'Shipped' },
                { key: 'delivered', label: 'Delivered' },
              ].map(f => (
                <button
                  key={f.key}
                  className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
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
                  const orderStatus = getDisplayStatus(order);
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
                                  month: 'long', day: 'numeric', year: 'numeric',
                                })
                              : 'N/A'}
                          </p>
                        </div>
                        <div className={`order-status ${getStatusClass(order.orderStatus || order.status)}`}>
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
            getDisplayStatus={getDisplayStatus}
          />
        )}
      </main>
    );
  }

  // ─── NON-LOGGED IN VIEW ───
  return (
    <main className="trackorder-main">
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
                <li><i className="fas fa-check"></i> Enter your email address in the form</li>
                <li><i className="fas fa-check"></i> View all orders using just your email</li>
                <li><i className="fas fa-check"></i> Track multiple orders at once</li>
                <li><i className="fas fa-check"></i> See real-time order status updates</li>
              </ul>
            </div>
          </div>

          {showTrackedOrders && trackedOrders.length > 0 && (
            <div className="tracked-orders-section">
              <div className="tracked-orders-header">
                <h2>Your Orders</h2>
                <p>
                  Found {trackedOrders.length} order{trackedOrders.length > 1 ? 's' : ''} for{' '}
                  {trackingEmail}
                </p>
              </div>

              <div className="orders-list">
                {trackedOrders.map(order => {
                  const orderId = order.orderId || order.id;
                  const orderDate = order.date || order.createdAt;
                  const orderStatus = getDisplayStatus(order);
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
                                  month: 'long', day: 'numeric', year: 'numeric',
                                })
                              : 'N/A'}
                          </p>
                        </div>
                        <div className={`order-status ${getStatusClass(order.orderStatus || order.status)}`}>
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

      {selectedOrder && (
        <TrackingModal
          order={selectedOrder}
          products={products}
          onClose={() => setSelectedOrder(null)}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
          getDisplayStatus={getDisplayStatus}
        />
      )}
    </main>
  );
};

// ─── TRACKING MODAL ───────────────────────────────────────────────────────────
const TrackingModal = ({ order, products, onClose, getTimelineSteps, getStatusClass, getDisplayStatus }) => {
  const orderId = order.orderId || order.id;
  const orderStatus = getDisplayStatus(order);
  const riderInfo = order.riderInfo || null;
  const cancelReason = order.cancelReason || null;
  const timelineSteps = getTimelineSteps(order.orderStatus || order.status, riderInfo, cancelReason);

  // ── OTP generation state
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [localOtp, setLocalOtp] = useState(order.deliveryOtp || null);

  const getProductById = (id) => products.find(p => p.id === id);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);

  // Keep localOtp in sync if order updates externally (polling)
  useEffect(() => {
    if (order.deliveryOtp) setLocalOtp(order.deliveryOtp);
  }, [order.deliveryOtp]);

  const isCancelled = (order.orderStatus || order.status || '').toLowerCase() === 'cancelled';
  const isOutForDelivery = (order.orderStatus || '').toLowerCase() === 'out_for_delivery';
  const isCompleted = (order.orderStatus || '').toLowerCase() === 'completed';

  // ── CUSTOMER GENERATES OTP
  const handleGenerateOtp = () => {
    if (localOtp) {
      // Already generated — just show it again (no re-generation)
      return;
    }

    setGeneratingOtp(true);

    const otp = Math.floor(1000 + Math.random() * 9000).toString();

    // Save OTP to the order in localStorage
    const allOrders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
    const updatedOrders = allOrders.map(o =>
      o.orderId === (order.orderId || order.id)
        ? { ...o, deliveryOtp: otp, otpGeneratedAt: new Date().toISOString() }
        : o
    );
    localStorage.setItem('dkmerch_orders', JSON.stringify(updatedOrders));
    window.dispatchEvent(new Event('orderUpdated'));

    setTimeout(() => {
      setLocalOtp(otp);
      setGeneratingOtp(false);
    }, 600);
  };

  return (
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>

        <div className="tracking-result">
          <div className="result-header">
            <h2>Order #{orderId?.slice(-8) || 'N/A'}</h2>
            <div className={`status-badge ${getStatusClass(order.orderStatus || order.status)}`}>
              {orderStatus}
            </div>
          </div>

          {/* Delivery estimate */}
          {!isCancelled && (
            <div className="delivery-estimate">
              <i className="fas fa-truck"></i>
              <div>
                <strong>Estimated Delivery</strong>
                <p>To be determined by admin</p>
              </div>
            </div>
          )}

          {/* Cancelled banner */}
          {isCancelled && (
            <div className="cancelled-banner">
              <div className="cancelled-banner-icon">
                <i className="fas fa-ban"></i>
              </div>
              <div className="cancelled-banner-text">
                <strong>Order Cancelled</strong>
                <p>This order has been cancelled by the store admin.</p>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════
              OTP SECTION — only when Out for Delivery
              Customer generates their own OTP here
          ══════════════════════════════════════════ */}
          {isOutForDelivery && (
            <div className="customer-otp-section">
              {!localOtp ? (
                /* ── NOT YET GENERATED ── */
                <div className="otp-generate-card">
                  <div className="otp-generate-header">
                    <div className="otp-generate-icon">
                      <i className="fas fa-shield-alt"></i>
                    </div>
                    <div>
                      <strong>Confirm Your Delivery</strong>
                      <p>Your rider is on the way! Generate your OTP to confirm receipt when they arrive.</p>
                    </div>
                  </div>
                  <div className="otp-generate-steps">
                    <div className="otp-step">
                      <span className="otp-step-num">1</span>
                      <span>Tap the button below to generate your unique OTP</span>
                    </div>
                    <div className="otp-step">
                      <span className="otp-step-num">2</span>
                      <span>Show the OTP code to your rider upon receiving your package</span>
                    </div>
                    <div className="otp-step">
                      <span className="otp-step-num">3</span>
                      <span>Rider enters the code to complete the delivery</span>
                    </div>
                  </div>
                  <button
                    className={`otp-generate-btn ${generatingOtp ? 'generating' : ''}`}
                    onClick={handleGenerateOtp}
                    disabled={generatingOtp}
                  >
                    {generatingOtp ? (
                      <>
                        <i className="fas fa-spinner fa-spin"></i>
                        Generating OTP...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-key"></i>
                        Generate My OTP
                      </>
                    )}
                  </button>
                  <p className="otp-generate-warning">
                    <i className="fas fa-exclamation-triangle"></i>
                    Only generate this when your rider has arrived. Do not share before receiving your package.
                  </p>
                </div>
              ) : (
                /* ── OTP ALREADY GENERATED — SHOW IT ── */
                <div className="otp-display-card">
                  <div className="otp-display-header">
                    <div className="otp-display-icon">
                      <i className="fas fa-shield-alt"></i>
                    </div>
                    <div>
                      <strong>Your Delivery OTP</strong>
                      <p>Show this code to your rider when they arrive</p>
                    </div>
                  </div>
                  <div className="otp-code-display">
                    {localOtp.split('').map((digit, i) => (
                      <span key={i} className="otp-digit">{digit}</span>
                    ))}
                  </div>
                  <div className="otp-display-note">
                    <i className="fas fa-info-circle"></i>
                    <span>
                      Only share this code with your rider upon receiving your package.
                      Do not share it before the delivery arrives.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DELIVERY PROOF — shown when Completed ── */}
          {isCompleted && order.deliveryProofPhoto && (
            <div className="delivery-proof-card">
              <div className="delivery-proof-header">
                <i className="fas fa-check-circle"></i>
                <div>
                  <strong>Delivery Confirmed</strong>
                  <span>
                    {order.deliveryConfirmedAt
                      ? new Date(order.deliveryConfirmedAt).toLocaleString('en-PH')
                      : 'Delivered'}
                  </span>
                </div>
              </div>
              <div className="delivery-proof-img-wrap">
                <img
                  src={order.deliveryProofPhoto}
                  alt="Proof of delivery"
                  className="delivery-proof-img"
                />
              </div>
              <div className="delivery-proof-otp-row">
                <i className="fas fa-key"></i>
                <span>OTP Verified — delivery confirmed by customer</span>
              </div>
            </div>
          )}

          {/* ── COMPLETED w/o photo ── */}
          {isCompleted && !order.deliveryProofPhoto && (
            <div className="delivery-completed-simple">
              <i className="fas fa-check-circle"></i>
              <div>
                <strong>Delivery Confirmed</strong>
                <span>
                  {order.deliveryConfirmedAt
                    ? new Date(order.deliveryConfirmedAt).toLocaleString('en-PH')
                    : 'Delivered'}
                </span>
              </div>
              <div className="delivery-proof-otp-row" style={{ marginTop: 8, borderTop: 'none' }}>
                <i className="fas fa-key"></i>
                <span>OTP Verified — delivery confirmed by customer</span>
              </div>
            </div>
          )}

          {/* ── RIDER INFO CARD ── */}
          {riderInfo && !isCancelled && (
            <div className="rider-info-card">
              <div className="rider-info-card-header">
                <i className="fas fa-motorcycle"></i>
                <div>
                  <strong>Your Rider</strong>
                  <span>
                    {isOutForDelivery
                      ? '🚚 On the way to you!'
                      : isCompleted
                      ? '✅ Delivered!'
                      : '📦 Pickup assigned'}
                  </span>
                </div>
              </div>
              <div className="rider-info-card-body">
                <div className="rider-info-card-row">
                  <i className="fas fa-user"></i>
                  <span><strong>Name:</strong> {riderInfo.name}</span>
                </div>
                <div className="rider-info-card-row">
                  <i className="fas fa-phone"></i>
                  <span><strong>Phone:</strong> {riderInfo.phone}</span>
                </div>
                <div className="rider-info-card-row">
                  <i className="fas fa-motorcycle"></i>
                  <span>
                    <strong>Vehicle:</strong>{' '}
                    <span style={{ textTransform: 'capitalize' }}>{riderInfo.vehicle}</span>
                  </span>
                </div>
                <div className="rider-info-card-row">
                  <i className="fas fa-id-card"></i>
                  <span><strong>Plate:</strong> {riderInfo.plate}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── ORDER TIMELINE ── */}
          <div className="tracking-timeline">
            <h3>Order Timeline</h3>
            <div className="timeline">
              {timelineSteps.map((step, index) => (
                <div
                  key={index}
                  className={`timeline-item ${step.completed ? 'completed' : ''} ${step.isCancelled ? 'cancelled-step' : ''}`}
                >
                  <div className="timeline-marker">
                    <i className={`fas ${step.icon}`}></i>
                  </div>
                  <div className="timeline-content">
                    <h4>{step.label}</h4>
                    <p>{step.completed ? (step.isCancelled ? 'Cancelled by admin' : 'Completed') : 'Pending'}</p>

                    {step.isCancelled && step.cancelReason && (
                      <div className="timeline-cancel-reason">
                        <div className="timeline-cancel-reason-label">
                          <i className="fas fa-comment-alt"></i>
                          Reason from admin:
                        </div>
                        <div className="timeline-cancel-reason-text">
                          {step.cancelReason}
                        </div>
                      </div>
                    )}

                    {step.isCancelled && !step.cancelReason && (
                      <div className="timeline-cancel-reason no-reason">
                        <i className="fas fa-info-circle"></i>
                        No reason provided by admin.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── ORDER ITEMS ── */}
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
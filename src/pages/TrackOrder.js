import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserOrders, useOrdersByEmail, useUpdateOrderOtp } from '../utils/orderStorage';
import { useProducts, usePreOrderProducts } from '../utils/productStorage';
import './TrackOrder.css';

const TrackOrder = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order');

  const [filter, setFilter] = useState('processing');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [trackingEmail, setTrackingEmail] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [showTrackedOrders, setShowTrackedOrders] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [hiddenOrders, setHiddenOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hiddenDeliveredOrders') || '[]'); } catch { return []; }
  });

  const orders      = useUserOrders(isAuthenticated ? user?.email : null) || [];
  const emailOrders = useOrdersByEmail(searchEmail) || [];

  // ✅ Include both regular + pre-order products for fallback lookup
  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const products         = [...regularProducts, ...preOrderProducts];

  const selectedOrder = selectedOrderId
    ? (orders.find(o => o._id === selectedOrderId) || emailOrders.find(o => o._id === selectedOrderId))
    : null;

  useEffect(() => {
    if (orderIdParam && orders.length > 0 && !selectedOrderId) {
      const found = orders.find(o => o.orderId === orderIdParam);
      if (found) setSelectedOrderId(found._id);
    }
  }, [orderIdParam, orders]);

  const handleCloseModal = () => setSelectedOrderId(null);
  const handleOpenModal  = (order) => setSelectedOrderId(order._id);

  const getProductById = (id) => products.find(p => p._id === id || p.id === id);

  const getStatusClass = (status) => {
    const map = {
      'Processing': 'status-processing', 'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped', 'In Transit': 'status-transit',
      'Out for Delivery': 'status-delivery', 'out_for_delivery': 'status-delivery',
      'Delivered': 'status-delivered', 'Cancelled': 'status-cancelled',
      'pending': 'status-processing', 'confirmed': 'status-confirmed',
      'shipped': 'status-shipped', 'completed': 'status-delivered',
      'cancelled': 'status-cancelled',
    };
    return map[status] || 'status-processing';
  };

  const getDisplayStatus = (order) => {
    const s = order.orderStatus || order.status || 'pending';
    const labels = {
      pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery', completed: 'Delivered',
      cancelled: 'Cancelled', Processing: 'Processing', Confirmed: 'Confirmed',
      Shipped: 'Shipped', 'Out for Delivery': 'Out for Delivery',
      Delivered: 'Delivered', Cancelled: 'Cancelled',
    };
    return labels[s] || s;
  };

  const getTimelineSteps = (order) => {
    const status = order.orderStatus || order.status || 'pending';
    const norm = status.toLowerCase().replace(/ /g, '_');
    if (norm === 'cancelled') return [
      { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true },
      { label: 'Cancelled', icon: 'fa-times-circle', completed: true, isCancelled: true, cancelReason: order.cancelReason },
    ];
    return [
      { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true },
      { label: 'Confirmed', icon: 'fa-check-circle', completed: ['confirmed','shipped','in_transit','out_for_delivery','delivered','completed'].includes(norm) },
      { label: 'Shipped', icon: 'fa-box', completed: ['shipped','in_transit','out_for_delivery','delivered','completed'].includes(norm) },
      { label: 'Out for Delivery', icon: 'fa-shipping-fast', completed: ['out_for_delivery','delivered','completed'].includes(norm) },
      { label: 'Delivered', icon: 'fa-check-double', completed: ['delivered','completed'].includes(norm) },
    ];
  };

  const isDelivered = (order) => {
    const s = (order.orderStatus || order.status || '').toLowerCase();
    return s === 'delivered' || s === 'completed';
  };

  const handleRemoveOrder = (orderId) => {
    const updated = [...hiddenOrders, orderId];
    setHiddenOrders(updated);
    localStorage.setItem('hiddenDeliveredOrders', JSON.stringify(updated));
    setRemoveConfirm(null);
  };

  const FILTERS = [
    { key: 'processing', label: 'Processing' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'shipped', label: 'Shipped' },
    { key: 'out for delivery', label: 'Out for Delivery' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  const visibleOrders = orders.filter(o => !hiddenOrders.includes(o._id));

  const filteredOrders = visibleOrders.filter(o =>
    getDisplayStatus(o).toLowerCase() === filter.toLowerCase()
  );

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    if (!trackingEmail.trim()) { alert('Please enter your email address'); return; }
    setSearchEmail(trackingEmail.trim());
    setShowTrackedOrders(true);
  };

  // ✅ Check if order has any pre-order items — checks item data first, then fallback to products list
  const getPreOrderReleaseDate = (order) => {
    if (!order.items) return null;
    for (const item of order.items) {
      if (item.isPreOrder && item.releaseDate) return item.releaseDate;
      const product = getProductById(item.id);
      if (product?.isPreOrder && product?.releaseDate) return product.releaseDate;
    }
    return null;
  };

  const OrderCard = ({ order, onViewDetails }) => {
    const ordDate = order._creationTime ? new Date(order._creationTime) : null;
    const orderStatus = getDisplayStatus(order);
    const statusKey = order.orderStatus || order.status || 'pending';
    const firstItem = order.items?.[0];
    const firstProduct = firstItem ? getProductById(firstItem.id) : null;
    const imgSrc = firstItem?.image || firstProduct?.image;
    const itemName = firstItem?.name || firstProduct?.name;
    const extraCount = (order.items?.length || 1) - 1;
    const delivered = isDelivered(order);
    const releaseDate = getPreOrderReleaseDate(order);

    return (
      <div className="order-card">
        <div
          className="order-card-img"
          onClick={() => imgSrc && setLightboxImg(imgSrc)}
          title={imgSrc ? 'Click to view image' : ''}
        >
          {imgSrc
            ? <img src={imgSrc} alt={itemName} />
            : <i className="fas fa-box order-no-img"></i>
          }
          {imgSrc && (
            <div className="order-img-zoom"><i className="fas fa-search-plus"></i></div>
          )}
          {extraCount > 0 && (
            <span className="order-extra-badge">+{extraCount}</span>
          )}
          <span className={`order-status-overlay ${getStatusClass(statusKey)}`}>
            {orderStatus}
          </span>
        </div>

        <div className="order-card-info">
          <p className="order-card-id">Order #{order.orderId?.slice(-8) || 'N/A'}</p>
          <p className="order-card-name">
            {itemName}
            {extraCount > 0 && <span className="order-and-more"> +{extraCount} more</span>}
          </p>

          {/* ✅ Pre-order release date badge */}
          {releaseDate && (
            <div className="order-card-preorder-badge">
              <i className="fas fa-calendar-alt"></i>
              <span>
                Expected:{' '}
                {new Date(releaseDate).toLocaleDateString('en-PH', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </span>
            </div>
          )}

          <div className="order-card-meta">
            <span className={`order-status-text ${getStatusClass(statusKey)}`}>
              <i className="fas fa-circle"></i> {orderStatus}
            </span>
            {ordDate && (
              <span className="order-card-date">
                <i className="fas fa-calendar-alt"></i>
                {ordDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>

          <div className="order-card-price-row">
            <span className="order-card-price">₱{order.total?.toLocaleString()}</span>
          </div>

          <button
            className="btn btn-primary btn-small order-view-btn"
            onClick={() => onViewDetails(order)}
          >
            <i className="fas fa-search"></i> View Details
          </button>

          {delivered && (
            <button
              className="btn order-remove-btn"
              onClick={() => setRemoveConfirm(order._id)}
            >
              <i className="fas fa-trash-alt"></i> Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  if (isAuthenticated && user) {
    return (
      <main className="trackorder-main">
        <div className="page-header">
          <div className="container">
            <h1 className="page-title">Track Orders</h1>
            <p className="page-description">Track and manage your orders</p>
          </div>
        </div>
        <div className="container">
          <section className="track-order-page">
            <div className="orders-filter">
              {FILTERS.map(f => (
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
                <h3>No {filter} Orders</h3>
                <p>You have no {filter} orders at the moment.</p>
                <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                  <i className="fas fa-shopping-bag"></i> Start Shopping
                </button>
              </div>
            ) : (
              <div className="orders-grid">
                {filteredOrders.map(order => (
                  <OrderCard key={order._id} order={order} onViewDetails={handleOpenModal} />
                ))}
              </div>
            )}
          </section>
        </div>

        {selectedOrder && (
          <TrackingModal
            order={selectedOrder}
            products={products}
            onClose={handleCloseModal}
            getTimelineSteps={getTimelineSteps}
            getStatusClass={getStatusClass}
            getDisplayStatus={getDisplayStatus}
          />
        )}

        {lightboxImg && (
          <div className="order-lightbox" onClick={() => setLightboxImg(null)}>
            <button className="lightbox-close" onClick={() => setLightboxImg(null)}>
              <i className="fas fa-times"></i>
            </button>
            <img src={lightboxImg} alt="Product" onClick={e => e.stopPropagation()} />
          </div>
        )}

        {removeConfirm && (
          <div className="remove-confirm-overlay" onClick={() => setRemoveConfirm(null)}>
            <div className="remove-confirm-dialog" onClick={e => e.stopPropagation()}>
              <div className="remove-confirm-icon"><i className="fas fa-trash-alt"></i></div>
              <h3>Remove Order?</h3>
              <p>Are you sure you want to remove this delivered order from your list? This action cannot be undone.</p>
              <div className="remove-confirm-actions">
                <button className="btn btn-outline" onClick={() => setRemoveConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleRemoveOrder(removeConfirm)}>
                  <i className="fas fa-trash-alt"></i> Yes, Remove
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // Guest view
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
                  <input type="email" id="tracking-email" className="form-control" placeholder="Enter your email address" value={trackingEmail} onChange={(e) => setTrackingEmail(e.target.value)} required />
                  <small>Enter the email you used when placing your order</small>
                </div>
                <button type="submit" className="btn btn-primary"><i className="fas fa-search"></i> Find My Orders</button>
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
          {showTrackedOrders && emailOrders.length > 0 && (
            <div className="tracked-orders-section">
              <div className="tracked-orders-header">
                <h2>Your Orders</h2>
                <p>Found {emailOrders.length} order{emailOrders.length > 1 ? 's' : ''} for {searchEmail}</p>
              </div>
              <div className="orders-grid">
                {emailOrders.map(order => (
                  <OrderCard key={order._id} order={order} onViewDetails={handleOpenModal} />
                ))}
              </div>
            </div>
          )}
          {showTrackedOrders && emailOrders.length === 0 && (
            <div className="orders-empty">
              <i className="fas fa-search"></i>
              <h3>No orders found</h3>
              <p>No orders found for {searchEmail}.</p>
            </div>
          )}
        </section>
      </div>
      {selectedOrder && (
        <TrackingModal
          order={selectedOrder}
          products={products}
          onClose={handleCloseModal}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
          getDisplayStatus={getDisplayStatus}
        />
      )}
      {lightboxImg && (
        <div className="order-lightbox" onClick={() => setLightboxImg(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImg(null)}>
            <i className="fas fa-times"></i>
          </button>
          <img src={lightboxImg} alt="Product" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </main>
  );
};

const TrackingModal = ({ order, products, onClose, getTimelineSteps, getStatusClass, getDisplayStatus }) => {
  const updateOrderOtp = useUpdateOrderOtp();
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [localOtp, setLocalOtp] = useState(order.deliveryOtp || null);

  const isCancelled      = ['cancelled'].includes((order.orderStatus || order.status || '').toLowerCase());
  const isOutForDelivery = ['out_for_delivery'].includes((order.orderStatus || order.status || '').toLowerCase());
  const timelineSteps    = getTimelineSteps(order);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => { if (order.deliveryOtp) setLocalOtp(order.deliveryOtp); }, [order.deliveryOtp]);

  const getProductById = (id) => products.find(p => p._id === id || p.id === id);

  const handleGenerateOtp = async () => {
    if (localOtp) return;
    setGeneratingOtp(true);
    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      await updateOrderOtp({ orderId: order.orderId, deliveryOtp: otp });
      setLocalOtp(otp);
    } catch (err) {
      console.error('OTP error:', err);
      alert('Failed to generate OTP. Please try again.');
    } finally {
      setGeneratingOtp(false);
    }
  };

  return (
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} type="button">
          <i className="fas fa-times"></i>
        </button>
        <div className="tracking-result">
          <div className="result-header">
            <h2>Order #{order.orderId?.slice(-8) || 'N/A'}</h2>
            <div className={`status-badge ${getStatusClass(order.orderStatus || order.status)}`}>{getDisplayStatus(order)}</div>
          </div>

          {!isCancelled && (
            <div className="delivery-estimate">
              <i className="fas fa-truck"></i>
              <div><strong>Estimated Delivery</strong><p>To be determined by admin</p></div>
            </div>
          )}

          {isCancelled && (
            <div className="cancelled-banner">
              <div className="cancelled-banner-icon"><i className="fas fa-ban"></i></div>
              <div className="cancelled-banner-text"><strong>Order Cancelled</strong><p>This order has been cancelled.</p></div>
            </div>
          )}

          {isOutForDelivery && (
            <div className="customer-otp-section">
              {!localOtp ? (
                <div className="otp-generate-card">
                  <div className="otp-generate-header">
                    <div className="otp-generate-icon"><i className="fas fa-shield-alt"></i></div>
                    <div>
                      <strong>Confirm Your Delivery</strong>
                      <p>Your rider is on the way! Generate your OTP to confirm receipt.</p>
                    </div>
                  </div>
                  <div className="otp-generate-steps">
                    <div className="otp-step"><span className="otp-step-num">1</span><span>Tap the button below to generate your unique OTP</span></div>
                    <div className="otp-step"><span className="otp-step-num">2</span><span>Show the OTP code to your rider upon receiving your package</span></div>
                    <div className="otp-step"><span className="otp-step-num">3</span><span>Rider enters the code to complete the delivery</span></div>
                  </div>
                  <button className={`otp-generate-btn ${generatingOtp ? 'generating' : ''}`} onClick={handleGenerateOtp} disabled={generatingOtp}>
                    {generatingOtp ? <><i className="fas fa-spinner fa-spin"></i> Generating OTP...</> : <><i className="fas fa-key"></i> Generate My OTP</>}
                  </button>
                  <p className="otp-generate-warning"><i className="fas fa-exclamation-triangle"></i> Only generate this when your rider has arrived.</p>
                </div>
              ) : (
                <div className="otp-display-card">
                  <div className="otp-display-header">
                    <div className="otp-display-icon"><i className="fas fa-shield-alt"></i></div>
                    <div><strong>Your Delivery OTP</strong><p>Show this code to your rider when they arrive</p></div>
                  </div>
                  <div className="otp-code-display">
                    {localOtp.split('').map((digit, i) => <span key={i} className="otp-digit">{digit}</span>)}
                  </div>
                  <div className="otp-display-note">
                    <i className="fas fa-info-circle"></i>
                    <span>Only share this code with your rider upon receiving your package.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="tracking-timeline">
            <h3>Order Timeline</h3>
            <div className="timeline">
              {timelineSteps.map((step, index) => (
                <div key={index} className={`timeline-item ${step.completed ? 'completed' : ''} ${step.isCancelled ? 'cancelled-step' : ''}`}>
                  <div className="timeline-marker"><i className={`fas ${step.icon}`}></i></div>
                  <div className="timeline-content">
                    <h4>{step.label}</h4>
                    <p>{step.completed ? (step.isCancelled ? 'Cancelled by admin' : 'Completed') : 'Pending'}</p>
                    {step.isCancelled && step.cancelReason && (
                      <div className="timeline-cancel-reason">
                        <div className="timeline-cancel-reason-label"><i className="fas fa-comment-alt"></i> Reason from admin:</div>
                        <div className="timeline-cancel-reason-text">{step.cancelReason}</div>
                      </div>
                    )}
                    {step.isCancelled && !step.cancelReason && (
                      <div className="timeline-cancel-reason no-reason"><i className="fas fa-info-circle"></i> No reason provided by admin.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="order-items-timeline">
            <h3>Order Items</h3>
            {order.items?.map((item, index) => {
              const product = getProductById(item.id);
              const qty = item.quantity || item.qty || 1;
              const isPreOrder = item.isPreOrder || product?.isPreOrder;
              const releaseDate = item.releaseDate || product?.releaseDate;
              return (
                <div key={index} className="order-item-timeline">
                  <div className="item-details">
                    <strong>{item.name || product?.name}</strong>
                    {isPreOrder && releaseDate && (
                      <span className="item-preorder-release">
                        <i className="fas fa-calendar-alt"></i>{' '}
                        Expected: {new Date(releaseDate).toLocaleDateString('en-PH', {
                          year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </span>
                    )}
                    <span>Qty: {qty}</span>
                  </div>
                  <div className="item-price">₱{((item.price || product?.price || 0) * qty).toLocaleString()}</div>
                </div>
              );
            })}
            <div className="order-items-total">
              <strong>Total</strong>
              <strong>₱{order.total?.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrackOrder;
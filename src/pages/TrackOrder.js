import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserOrders, useOrdersByEmail, useUpdateOrderOtp } from '../utils/orderStorage';
import { useProducts } from '../utils/productStorage';
import './TrackOrder.css';

const TrackOrder = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order');

  const [filter, setFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [trackingEmail, setTrackingEmail] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [showTrackedOrders, setShowTrackedOrders] = useState(false);

  const orders      = useUserOrders(isAuthenticated ? user?.email : null) || [];
  const emailOrders = useOrdersByEmail(searchEmail) || [];
  const products    = useProducts() || [];

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

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => getDisplayStatus(o).toLowerCase() === filter.toLowerCase());

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    if (!trackingEmail.trim()) { alert('Please enter your email address'); return; }
    setSearchEmail(trackingEmail.trim());
    setShowTrackedOrders(true);
  };

  // Square card component
  const OrderCard = ({ order, onViewDetails }) => {
    const ordDate = order._creationTime ? new Date(order._creationTime) : null;
    const orderStatus = getDisplayStatus(order);
    const firstItem = order.items?.[0];
    const firstProduct = firstItem ? getProductById(firstItem.id) : null;
    const imgSrc = firstItem?.image || firstProduct?.image;
    const itemName = firstItem?.name || firstProduct?.name;
    const extraCount = (order.items?.length || 1) - 1;

    return (
      <div className="order-card">
        {/* Square image */}
        <div className="order-card-img">
          {imgSrc
            ? <img src={imgSrc} alt={itemName} />
            : <i className="fas fa-box order-no-img"></i>
          }
          {extraCount > 0 && (
            <span className="order-extra-badge">+{extraCount}</span>
          )}
          <span className={`order-status-overlay ${getStatusClass(order.orderStatus || order.status)}`}>
            {orderStatus}
          </span>
        </div>

        {/* Info below */}
        <div className="order-card-info">
          <p className="order-card-id">Order #{order.orderId?.slice(-8) || 'N/A'}</p>
          <p className="order-card-name">
            {itemName}
            {extraCount > 0 && <span className="order-and-more"> +{extraCount} more</span>}
          </p>
          <div className="order-card-price-row">
            <span className="order-card-price">₱{order.total?.toLocaleString()}</span>
            <span className="order-card-date">
              {ordDate ? ordDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
            </span>
          </div>
          <button
            className="btn btn-primary btn-small order-view-btn"
            onClick={() => onViewDetails(order)}
          >
            <i className="fas fa-search"></i> View Details
          </button>
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
                <button key={f.key} className={`filter-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            {filteredOrders.length === 0 ? (
              <div className="orders-empty">
                <i className="fas fa-shipping-fast"></i>
                <h3>No Orders Found</h3>
                <p>You haven't placed any orders yet.</p>
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
              return (
                <div key={index} className="order-item-timeline">
                  <div className="item-details">
                    <strong>{item.name || product?.name}</strong>
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
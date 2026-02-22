import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserOrders, useOrdersByEmail, useUpdateOrderOtp } from '../utils/orderStorage';
import { useProducts, usePreOrderProducts } from '../utils/productStorage';
import './TrackOrder.css';

const TrackOrder = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order') || searchParams.get('orderId');

  const [filter, setFilter] = useState('active');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [trackingEmail, setTrackingEmail] = useState('');
  const [searchEmail, setSearchEmail] = useState('');
  const [showTrackedOrders, setShowTrackedOrders] = useState(false);
  const [lightboxData, setLightboxData] = useState(null); // { images: [], index: 0 }
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [hiddenOrders, setHiddenOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hiddenDeliveredOrders') || '[]'); } catch { return []; }
  });

  const orders           = useUserOrders(isAuthenticated ? user?.email : null) || [];
  const emailOrders      = useOrdersByEmail(searchEmail) || [];
  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const products         = [...regularProducts, ...preOrderProducts];

  const allAvailableOrders = [...orders, ...emailOrders];
  const selectedOrder = selectedOrderId
    ? allAvailableOrders.find(o => o._id === selectedOrderId)
    : null;

  useEffect(() => {
    if (orderIdParam && orders.length > 0 && !selectedOrderId) {
      const found = orders.find(o => o.orderId === orderIdParam);
      if (found) setSelectedOrderId(found._id);
    }
  }, [orderIdParam, orders]);

  useEffect(() => {
    if (orderIdParam && emailOrders.length > 0 && !selectedOrderId) {
      const found = emailOrders.find(o => o.orderId === orderIdParam);
      if (found) setSelectedOrderId(found._id);
    }
  }, [orderIdParam, emailOrders]);

  const handleCloseModal = () => setSelectedOrderId(null);
  const handleOpenModal  = (order) => setSelectedOrderId(order._id);
  const getProductById   = (id) => products.find(p => p._id === id || p.id === id);

  const getStatusClass = (status) => {
    const map = {
      'Processing': 'status-processing', 'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped', 'Out for Delivery': 'status-delivery',
      'out_for_delivery': 'status-delivery', 'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled', 'pending': 'status-processing',
      'confirmed': 'status-confirmed', 'shipped': 'status-shipped',
      'completed': 'status-delivered', 'cancelled': 'status-cancelled',
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

  const isDelivered = (order) => {
    const s = (order.orderStatus || order.status || '').toLowerCase();
    return s === 'delivered' || s === 'completed';
  };

  const isCancelledOrder = (order) => {
    const s = (order.orderStatus || order.status || '').toLowerCase();
    return s === 'cancelled';
  };

  const getTimelineSteps = (order) => {
    const status = (order.orderStatus || order.status || 'pending').toLowerCase().replace(/ /g, '_');
    const fmt = (ts) => ts
      ? new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : null;

    const placedAt         = fmt(order._creationTime);
    const paidAt           = fmt(order.paidAt);
    const confirmedAt      = fmt(order.confirmedAt);
    const shippedAt        = fmt(order.shippedAt);
    const outForDeliveryAt = fmt(order.outForDeliveryAt);
    const deliveredAt      = fmt(order.deliveryConfirmedAt);

    if (status === 'cancelled') {
      return [
        { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true,           time: placedAt },
        { label: 'Payment',      icon: 'fa-credit-card',   completed: !!order.paidAt, time: paidAt },
        { label: 'Cancelled',    icon: 'fa-times-circle',  completed: true, isCancelled: true, cancelReason: order.cancelReason, time: null },
      ];
    }

    return [
      {
        label: 'Order Placed', icon: 'fa-shopping-cart', completed: true, time: placedAt,
        desc: 'Your order has been placed successfully.',
      },
      {
        label: 'Payment Confirmed', icon: 'fa-credit-card',
        completed: order.paymentStatus === 'paid', time: paidAt,
        desc: order.paymentStatus === 'paid' ? 'Payment received via PayMongo.' : 'Waiting for payment confirmation.',
      },
      {
        label: 'Order Confirmed', icon: 'fa-check-circle',
        completed: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status),
        time: confirmedAt,
        desc: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status)
          ? 'Admin has confirmed and is preparing your order.'
          : 'Waiting for admin to confirm your order.',
      },
      {
        label: 'Rider Assigned', icon: 'fa-motorcycle',
        completed: ['shipped','out_for_delivery','delivered','completed'].includes(status),
        time: shippedAt,
        desc: order.riderInfo
          ? `${order.riderInfo.name} (${order.riderInfo.plate}) will deliver your order.`
          : ['shipped','out_for_delivery','delivered','completed'].includes(status)
            ? 'A rider has been assigned to your order.'
            : 'Waiting for rider assignment.',
      },
      {
        label: 'Out for Delivery', icon: 'fa-shipping-fast',
        completed: ['out_for_delivery','delivered','completed'].includes(status),
        time: outForDeliveryAt,
        desc: ['out_for_delivery','delivered','completed'].includes(status)
          ? 'Your rider is on the way to deliver your order!'
          : 'Waiting for rider to pick up your order.',
      },
      {
        label: 'Delivered', icon: 'fa-check-double',
        completed: ['delivered','completed'].includes(status),
        time: deliveredAt,
        desc: ['delivered','completed'].includes(status)
          ? 'Your order has been delivered successfully!'
          : 'Waiting for delivery confirmation.',
      },
    ];
  };

  const handleRemoveOrder = (orderId) => {
    const updated = [...hiddenOrders, orderId];
    setHiddenOrders(updated);
    localStorage.setItem('hiddenDeliveredOrders', JSON.stringify(updated));
    setRemoveConfirm(null);
  };

  // Open lightbox with all images of an order, starting at a given index
  const openLightbox = (images, startIndex = 0) => {
    setLightboxData({ images, index: startIndex });
  };

  const closeLightbox = () => setLightboxData(null);

  const lightboxNext = () => {
    setLightboxData(prev => ({ ...prev, index: (prev.index + 1) % prev.images.length }));
  };

  const lightboxPrev = () => {
    setLightboxData(prev => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }));
  };

  const visibleOrders = orders.filter(o => !hiddenOrders.includes(o._id));

  const activeOrders    = visibleOrders.filter(o => !isDelivered(o) && !isCancelledOrder(o));
  const deliveredOrders = visibleOrders.filter(o => isDelivered(o));
  const cancelledOrders = visibleOrders.filter(o => isCancelledOrder(o));

  const filteredOrders = visibleOrders.filter(o => {
    if (filter === 'active')    return !isDelivered(o) && !isCancelledOrder(o);
    if (filter === 'delivered') return isDelivered(o);
    if (filter === 'cancelled') return isCancelledOrder(o);
    return true;
  });

  const FILTERS = [
    { key: 'active',    icon: 'fa-shopping-bag',  label: 'All Orders', count: activeOrders.length,    desc: 'Active & ongoing orders' },
    { key: 'delivered', icon: 'fa-check-double',   label: 'Delivered',  count: deliveredOrders.length, desc: 'Successfully delivered' },
    { key: 'cancelled', icon: 'fa-ban',            label: 'Cancelled',  count: cancelledOrders.length, desc: 'Cancelled orders' },
  ];

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    if (!trackingEmail.trim()) { alert('Please enter your email address'); return; }
    setSearchEmail(trackingEmail.trim());
    setShowTrackedOrders(true);
  };

  const getPreOrderReleaseDate = (order) => {
    if (!order.items) return null;
    for (const item of order.items) {
      if (item.isPreOrder && item.releaseDate) return item.releaseDate;
      const product = getProductById(item.id);
      if (product?.isPreOrder && product?.releaseDate) return product.releaseDate;
    }
    return null;
  };

  // ─── ORDER CARD ─────────────────────────────────────────────────────────────
  const OrderCard = ({ order, onViewDetails }) => {
    const scrollRef = useRef(null);
    const [activeImgIdx, setActiveImgIdx] = useState(0);
    const ordDate     = order._creationTime ? new Date(order._creationTime) : null;
    const orderStatus = getDisplayStatus(order);
    const statusKey   = order.orderStatus || order.status || 'pending';
    const delivered   = isDelivered(order);
    const releaseDate = getPreOrderReleaseDate(order);

    // Collect all item images
    const itemImages = (order.items || []).map(item => {
      const product = getProductById(item.id);
      return {
        src: item.image || product?.image || null,
        name: item.name || product?.name || 'Item',
      };
    }).filter(i => i.src);

    const hasImages = itemImages.length > 0;

    const scrollTo = (idx) => {
      setActiveImgIdx(idx);
      if (scrollRef.current) {
        const child = scrollRef.current.children[idx];
        if (child) child.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    };

    const handleImgClick = (idx) => {
      openLightbox(itemImages.map(i => i.src), idx);
    };

    return (
      <div className="order-card">
        {/* ── Multi-image strip ── */}
        <div className="order-card-img-wrap">
          <span className={`order-status-overlay ${getStatusClass(statusKey)}`}>{orderStatus}</span>

          {hasImages ? (
            <>
              <div className="order-img-strip" ref={scrollRef}>
                {itemImages.map((img, idx) => (
                  <div
                    key={idx}
                    className={`order-img-slide ${idx === activeImgIdx ? 'active' : ''}`}
                    onClick={() => handleImgClick(idx)}
                    title="Click to enlarge"
                  >
                    <img src={img.src} alt={img.name} />
                    <div className="order-img-zoom"><i className="fas fa-search-plus"></i></div>
                  </div>
                ))}
              </div>

              {/* Dot indicators — only show if more than 1 image */}
              {itemImages.length > 1 && (
                <div className="order-img-dots">
                  {itemImages.map((_, idx) => (
                    <button
                      key={idx}
                      className={`order-img-dot ${idx === activeImgIdx ? 'active' : ''}`}
                      onClick={() => scrollTo(idx)}
                      aria-label={`Image ${idx + 1}`}
                    />
                  ))}
                </div>
              )}

              {/* Arrow nav — only if more than 1 */}
              {itemImages.length > 1 && (
                <>
                  <button
                    className="order-img-arrow order-img-arrow-left"
                    onClick={() => scrollTo((activeImgIdx - 1 + itemImages.length) % itemImages.length)}
                    aria-label="Previous image"
                  >
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  <button
                    className="order-img-arrow order-img-arrow-right"
                    onClick={() => scrollTo((activeImgIdx + 1) % itemImages.length)}
                    aria-label="Next image"
                  >
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="order-no-img-wrap">
              <i className="fas fa-box order-no-img"></i>
            </div>
          )}
        </div>

        <div className="order-card-info">
          <p className="order-card-id">Order #{order.orderId?.slice(-8) || 'N/A'}</p>
          <p className="order-card-name">
            {order.items?.[0]?.name || getProductById(order.items?.[0]?.id)?.name || 'Order'}
            {(order.items?.length || 1) > 1 && (
              <span className="order-and-more"> +{order.items.length - 1} more</span>
            )}
          </p>
          {releaseDate && (
            <div className="order-card-preorder-badge">
              <i className="fas fa-calendar-alt"></i>
              <span>Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
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
          <button className="btn btn-primary btn-small order-view-btn" onClick={() => onViewDetails(order)}>
            <i className="fas fa-search"></i> View Details
          </button>
          {delivered && (
            <button className="btn order-remove-btn" onClick={() => setRemoveConfirm(order._id)}>
              <i className="fas fa-trash-alt"></i> Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  // ─── LIGHTBOX ────────────────────────────────────────────────────────────────
  const Lightbox = () => {
    if (!lightboxData) return null;
    const { images, index } = lightboxData;
    const hasMultiple = images.length > 1;

    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight' && hasMultiple) lightboxNext();
        if (e.key === 'ArrowLeft'  && hasMultiple) lightboxPrev();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [hasMultiple]);

    return (
      <div className="order-lightbox" onClick={closeLightbox}>
        <button className="lightbox-close" onClick={closeLightbox}>
          <i className="fas fa-times"></i>
        </button>

        {hasMultiple && (
          <button className="lightbox-arrow lightbox-arrow-left" onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}>
            <i className="fas fa-chevron-left"></i>
          </button>
        )}

        <img
          src={images[index]}
          alt={`Item ${index + 1}`}
          onClick={e => e.stopPropagation()}
        />

        {hasMultiple && (
          <button className="lightbox-arrow lightbox-arrow-right" onClick={(e) => { e.stopPropagation(); lightboxNext(); }}>
            <i className="fas fa-chevron-right"></i>
          </button>
        )}

        {hasMultiple && (
          <div className="lightbox-dots">
            {images.map((_, i) => (
              <button
                key={i}
                className={`lightbox-dot ${i === index ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setLightboxData(prev => ({ ...prev, index: i })); }}
              />
            ))}
          </div>
        )}

        {hasMultiple && (
          <div className="lightbox-counter">{index + 1} / {images.length}</div>
        )}
      </div>
    );
  };

  if (isAuthenticated && user) {
    const activeTab = FILTERS.find(f => f.key === filter);

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
            <div className="orders-tab-bar">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  className={`orders-tab-btn ${filter === f.key ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                >
                  <i className={`fas ${f.icon}`}></i>
                  <span className="tab-label">{f.label}</span>
                  {f.count > 0 && (
                    <span className={`tab-count ${filter === f.key ? 'tab-count-active' : ''}`}>
                      {f.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="tab-context-bar">
              <i className={`fas ${activeTab?.icon}`}></i>
              <span>
                <strong>{activeTab?.label}</strong> — {activeTab?.desc}
                {filteredOrders.length > 0 && (
                  <span className="tab-context-count"> · {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</span>
                )}
              </span>
            </div>

            {filteredOrders.length === 0 ? (
              <div className="orders-empty">
                <i className={`fas ${activeTab?.icon}`}></i>
                <h3>No {activeTab?.label} Yet</h3>
                <p>
                  {filter === 'active'    && 'You have no active orders right now.'}
                  {filter === 'delivered' && 'No delivered orders yet.'}
                  {filter === 'cancelled' && 'No cancelled orders.'}
                </p>
                {filter === 'active' && (
                  <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                    <i className="fas fa-shopping-bag"></i> Start Shopping
                  </button>
                )}
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
          <TrackingModal order={selectedOrder} products={products} onClose={handleCloseModal}
            getTimelineSteps={getTimelineSteps} getStatusClass={getStatusClass} getDisplayStatus={getDisplayStatus} />
        )}
        <Lightbox />
        {removeConfirm && (
          <div className="remove-confirm-overlay" onClick={() => setRemoveConfirm(null)}>
            <div className="remove-confirm-dialog" onClick={e => e.stopPropagation()}>
              <div className="remove-confirm-icon"><i className="fas fa-trash-alt"></i></div>
              <h3>Remove Order?</h3>
              <p>Are you sure you want to remove this delivered order from your list?</p>
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
                  <input type="email" id="tracking-email" className="form-control"
                    placeholder="Enter your email address"
                    value={trackingEmail} onChange={(e) => setTrackingEmail(e.target.value)} required />
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
        <TrackingModal order={selectedOrder} products={products} onClose={handleCloseModal}
          getTimelineSteps={getTimelineSteps} getStatusClass={getStatusClass} getDisplayStatus={getDisplayStatus} />
      )}
      <Lightbox />
    </main>
  );
};

// ─── TRACKING MODAL ─────────────────────────────────────────────────────────
const TrackingModal = ({ order, products, onClose, getTimelineSteps, getStatusClass, getDisplayStatus }) => {
  const updateOrderOtp = useUpdateOrderOtp();
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [localOtp, setLocalOtp] = useState(order.deliveryOtp || null);

  const isCancelled      = (order.orderStatus || order.status || '').toLowerCase() === 'cancelled';
  const isOutForDelivery = (order.orderStatus || order.status || '').toLowerCase() === 'out_for_delivery';
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
            <div className={`status-badge ${getStatusClass(order.orderStatus || order.status)}`}>
              {getDisplayStatus(order)}
            </div>
          </div>

          {order.riderInfo && !isCancelled && (
            <div className="rider-info-banner">
              <div className="rider-info-icon"><i className="fas fa-motorcycle"></i></div>
              <div className="rider-info-details">
                <strong>Your Rider: {order.riderInfo.name}</strong>
                <span>{order.riderInfo.vehicle} • {order.riderInfo.plate}</span>
                {order.riderInfo.phone && <span><i className="fas fa-phone"></i> {order.riderInfo.phone}</span>}
              </div>
            </div>
          )}

          {isCancelled && (
            <div className="cancelled-banner">
              <div className="cancelled-banner-icon"><i className="fas fa-ban"></i></div>
              <div className="cancelled-banner-text">
                <strong>Order Cancelled</strong>
                <p>{order.cancelReason || 'This order has been cancelled.'}</p>
              </div>
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
                  <div className="timeline-marker">
                    <i className={`fas ${step.icon}`}></i>
                  </div>
                  <div className="timeline-content">
                    <h4>{step.label}</h4>
                    {step.time && step.completed && (
                      <span className="timeline-timestamp">
                        <i className="fas fa-clock"></i> {step.time}
                      </span>
                    )}
                    <p className={step.completed ? 'timeline-desc-done' : 'timeline-desc-pending'}>
                      {step.desc || (step.completed ? 'Completed' : 'Pending')}
                    </p>
                    {step.isCancelled && step.cancelReason && (
                      <div className="timeline-cancel-reason">
                        <div className="timeline-cancel-reason-label"><i className="fas fa-comment-alt"></i> Reason:</div>
                        <div className="timeline-cancel-reason-text">{step.cancelReason}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="order-items-timeline">
            <h3>Order Items</h3>
            {order.items?.map((item, index) => {
              const product     = getProductById(item.id);
              const qty         = item.quantity || item.qty || 1;
              const isPreOrder  = item.isPreOrder || product?.isPreOrder;
              const releaseDate = item.releaseDate || product?.releaseDate;
              return (
                <div key={index} className="order-item-timeline">
                  <div className="item-details">
                    <strong>{item.name || product?.name}</strong>
                    {isPreOrder && releaseDate && (
                      <span className="item-preorder-release">
                        <i className="fas fa-calendar-alt"></i>{' '}
                        Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
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
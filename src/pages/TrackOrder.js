import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useUserOrders, useOrdersByEmail, useUpdateOrderOtp } from '../utils/orderStorage';
import { useProducts, usePreOrderProducts } from '../utils/productStorage';
import './TrackOrder.css';

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'unknown';
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
};

// ─── REFUND REASONS ───────────────────────────────────────────────────────────
const REFUND_REASONS = [
  { value: 'damaged',     label: '📦 Item arrived damaged',           desc: 'Product was broken or damaged during delivery' },
  { value: 'wrong_item',  label: '❌ Wrong item received',             desc: 'Received a different product than ordered' },
  { value: 'missing',     label: '🔍 Missing items',                   desc: 'Some items in the order were missing' },
  { value: 'not_as_desc', label: '📋 Not as described',               desc: 'Item does not match the product description' },
  { value: 'defective',   label: '⚠️ Defective / Not working',        desc: 'Product has a defect or does not function properly' },
  { value: 'others',      label: '💬 Others',                         desc: 'Please describe your reason below' },
];

// ─── REFUND MODAL ─────────────────────────────────────────────────────────────
const RefundModal = ({ order, onClose, onSuccess }) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [comment, setComment]               = useState('');
  const [submitting, setSubmitting]         = useState(false);
  const [error, setError]                   = useState('');
  const requestRefund = useMutation(api.orders.requestRefund);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSubmit = async () => {
    if (!selectedReason) { setError('Please select a reason for your refund request.'); return; }
    if (selectedReason === 'others' && !comment.trim()) {
      setError('Please describe your reason in the comment box.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await requestRefund({
        orderId:       order.orderId,
        refundReason:  selectedReason,
        refundComment: comment.trim(),
      });
      if (result?.success) {
        onSuccess();
      } else {
        setError(result?.error || 'Failed to submit refund request. Please try again.');
      }
    } catch (err) {
      console.error('Refund error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="refund-modal-overlay" onClick={onClose}>
      <div className="refund-modal" onClick={e => e.stopPropagation()}>
        <button className="refund-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>

        <div className="refund-modal-header">
          <div className="refund-modal-icon"><i className="fas fa-undo-alt"></i></div>
          <div>
            <h3>Request a Refund</h3>
            <p>Order #{order.orderId?.slice(-8) || 'N/A'} · ₱{order.total?.toLocaleString()}</p>
          </div>
        </div>

        <div className="refund-modal-body">
          <p className="refund-modal-label">Why are you requesting a refund?</p>

          <div className="refund-reasons-list">
            {REFUND_REASONS.map(r => (
              <button
                key={r.value}
                className={`refund-reason-btn ${selectedReason === r.value ? 'selected' : ''}`}
                onClick={() => { setSelectedReason(r.value); setError(''); }}
              >
                <div className="refund-reason-check">
                  {selectedReason === r.value
                    ? <i className="fas fa-check-circle"></i>
                    : <i className="far fa-circle"></i>}
                </div>
                <div className="refund-reason-text">
                  <span className="refund-reason-label">{r.label}</span>
                  <span className="refund-reason-desc">{r.desc}</span>
                </div>
              </button>
            ))}
          </div>

          <div className={`refund-comment-wrap ${selectedReason === 'others' ? 'required' : ''}`}>
            <label className="refund-modal-label">
              {selectedReason === 'others' ? 'Describe your reason *' : 'Additional comments (optional)'}
            </label>
            <textarea
              className="refund-comment-box"
              placeholder={selectedReason === 'others'
                ? 'Please explain why you want a refund...'
                : 'Add any details that may help us process your request...'}
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              maxLength={500}
            />
            <span className="refund-comment-count">{comment.length}/500</span>
          </div>

          {error && (
            <div className="refund-error-msg">
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <div className="refund-modal-note">
            <i className="fas fa-info-circle"></i>
            <span>Refund requests are reviewed within 1-3 business days. We may contact you for additional information.</span>
          </div>
        </div>

        <div className="refund-modal-footer">
          <button className="refund-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="refund-submit-btn" onClick={handleSubmit} disabled={submitting || !selectedReason}>
            {submitting
              ? <><i className="fas fa-spinner fa-spin"></i> Submitting...</>
              : <><i className="fas fa-paper-plane"></i> Submit Refund Request</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── REFUND STATUS BADGE ──────────────────────────────────────────────────────
const RefundBadge = ({ status }) => {
  if (!status) return null;
  const config = {
    requested: { icon: 'fa-clock',        label: 'Refund Pending',  cls: 'refund-badge-pending'  },
    approved:  { icon: 'fa-check-circle', label: 'Refund Approved', cls: 'refund-badge-approved' },
    rejected:  { icon: 'fa-times-circle', label: 'Refund Rejected', cls: 'refund-badge-rejected' },
  };
  const c = config[status];
  if (!c) return null;
  return (
    <span className={`refund-status-badge ${c.cls}`}>
      <i className={`fas ${c.icon}`}></i> {c.label}
    </span>
  );
};

// ─── LEAFLET MAP COMPONENT ───────────────────────────────────────────────────
const RiderMap = ({ orderId, riderName }) => {
  const mapRef            = useRef(null);
  const mapInstanceRef    = useRef(null);
  const markerRef         = useRef(null);
  const accuracyCircleRef = useRef(null);
  const pendingLocRef     = useRef(null);
  const lastLocRef        = useRef(null);
  const [mapReady, setMapReady]           = useState(false);
  const [mapError, setMapError]           = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(!!window.L);
  const [, forceUpdate] = useState(0);

  const locationData = useQuery(
    api.riders.getRiderLocation,
    orderId ? { orderId } : 'skip'
  );

  const isStale = locationData
    ? Date.now() - locationData.updatedAt > 60000
    : true;

  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!orderId) return;
    pendingLocRef.current = null;
    lastLocRef.current    = null;
  }, [orderId]);

  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existingScript = document.getElementById('leaflet-js');
    if (existingScript) {
      if (window.L) { setLeafletLoaded(true); return; }
      existingScript.addEventListener('load', () => setLeafletLoaded(true));
      return;
    }
    const script   = document.createElement('script');
    script.id      = 'leaflet-js';
    script.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload  = () => setLeafletLoaded(true);
    script.onerror = () => setMapError('Failed to load map library.');
    document.head.appendChild(script);
  }, []);

  const applyLocation = useCallback((data) => {
    if (!data?.lat || !data?.lng) return;
    if (!mapInstanceRef.current || !markerRef.current || !window.L) return;

    const L      = window.L;
    const map    = mapInstanceRef.current;
    const marker = markerRef.current;
    const { lat, lng, accuracy, updatedAt, riderName: rName, isTracking } = data;

    try { marker.setLatLng([lat, lng]); } catch {}

    marker.getPopup()?.setContent(
      `<div class="rider-map-popup">
        <strong>🛵 ${rName || riderName || 'Your Rider'}</strong><br>
        <small>${isTracking
          ? `📍 Updated ${formatTimeAgo(updatedAt)}`
          : '⏹ Stopped sharing location'}</small>
      </div>`
    );

    if (accuracyCircleRef.current) {
      try { map.removeLayer(accuracyCircleRef.current); } catch {}
      accuracyCircleRef.current = null;
    }
    if (accuracy && accuracy < 2000) {
      try {
        accuracyCircleRef.current = L.circle([lat, lng], {
          radius: accuracy, color: '#fc1268', fillColor: '#fc1268',
          fillOpacity: 0.1, weight: 1.5, dashArray: '4 4',
        }).addTo(map);
      } catch {}
    }

    const prev  = lastLocRef.current;
    const moved = !prev
      || Math.abs(prev.lat - lat) > 0.00001
      || Math.abs(prev.lng - lng) > 0.00001;
    if (moved) {
      lastLocRef.current = { lat, lng };
      try {
        const targetZoom = Math.max(map.getZoom(), 16);
        map.flyTo([lat, lng], targetZoom, { animate: true, duration: 1.2 });
      } catch {}
    }
  }, [riderName]);

  useEffect(() => {
    if (!leafletLoaded || mapInstanceRef.current || !mapRef.current) return;

    try {
      const L = window.L;
      const map = L.map(mapRef.current, {
        zoomControl: true, attributionControl: true,
        tap: false, scrollWheelZoom: true, doubleClickZoom: true,
      }).setView([14.5995, 120.9842], 15);

      map.zoomControl.setPosition('bottomright');

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const riderIcon = L.divIcon({
        className: 'rider-map-icon',
        html: `<div class="rider-map-marker">
          <div class="rider-map-marker-inner"><i class="fas fa-motorcycle"></i></div>
          <div class="rider-map-pulse"></div>
        </div>`,
        iconSize: [48, 48], iconAnchor: [24, 48], popupAnchor: [0, -50],
      });

      const marker = L.marker([14.5995, 120.9842], { icon: riderIcon })
        .addTo(map)
        .bindPopup(`<div class="rider-map-popup">
          <strong>🛵 ${riderName || 'Your Rider'}</strong><br>
          <small>Waiting for location...</small>
        </div>`);

      mapInstanceRef.current = map;
      markerRef.current      = marker;
      setMapReady(true);
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);

      if (pendingLocRef.current) {
        applyLocation(pendingLocRef.current);
        pendingLocRef.current = null;
      }
    } catch (err) {
      console.error('Leaflet init error:', err);
      setMapError('Failed to initialize map.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletLoaded]);

  useEffect(() => {
    if (!locationData?.lat || !locationData?.lng) return;
    if (!mapReady || !mapInstanceRef.current) {
      pendingLocRef.current = locationData;
      return;
    }
    applyLocation(locationData);
  }, [locationData, mapReady, applyLocation]);

  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current    = null;
        markerRef.current         = null;
        accuracyCircleRef.current = null;
        pendingLocRef.current     = null;
        lastLocRef.current        = null;
      }
    };
  }, []);

  const statusClass = !locationData          ? 'status-waiting'
    : !locationData.isTracking               ? 'status-stopped'
    : isStale                                ? 'status-stale'
    : 'status-live';

  const statusContent = !locationData
    ? <><span className="map-status-dot dot-waiting"></span> Waiting for rider to share location…</>
    : !locationData.isTracking
    ? <><span className="map-status-dot dot-stopped"></span> Rider stopped sharing location</>
    : isStale
    ? <><span className="map-status-dot dot-stale"></span> Location may be outdated · last: {formatTimeAgo(locationData.updatedAt)}</>
    : <><span className="map-status-dot dot-live"></span> <strong>Live</strong> · Updated {formatTimeAgo(locationData.updatedAt)}</>;

  if (mapError) {
    return (
      <div className="rider-map-error">
        <i className="fas fa-map-marked-alt"></i>
        <p>{mapError}</p>
        <small>Try refreshing the page.</small>
      </div>
    );
  }

  return (
    <div className="rider-map-wrapper">
      <div className={`rider-map-status-bar ${statusClass}`}>{statusContent}</div>
      <div ref={mapRef} className="rider-map-container" />
      {locationData?.isTracking && (
        <div className="rider-map-accuracy">
          {locationData.accuracy && (
            <span><i className="fas fa-crosshairs"></i> ±{Math.round(locationData.accuracy)}m</span>
          )}
          {locationData.speed > 0 && (
            <span style={{ marginLeft: 10 }}>
              <i className="fas fa-tachometer-alt"></i> {Math.round((locationData.speed || 0) * 3.6)} km/h
            </span>
          )}
        </div>
      )}
      {!locationData && (
        <div className="rider-map-waiting-overlay">
          <div className="rider-map-waiting-inner">
            <i className="fas fa-motorcycle"></i>
            <p>Rider hasn't shared location yet</p>
            <small>Map updates automatically when rider starts sharing</small>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MAIN TRACK ORDER PAGE ────────────────────────────────────────────────────
const TrackOrder = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order') || searchParams.get('orderId');

  const [filter, setFilter]                       = useState('active');
  const [selectedOrderId, setSelectedOrderId]     = useState(null);

  // ✅ FIX: Separate input state from the committed search email
  // trackingEmail = what user types in the input box
  // searchEmail   = the value actually sent to Convex query (only updated on form submit)
  const [trackingEmail, setTrackingEmail]         = useState('');
  const [searchEmail, setSearchEmail]             = useState('');
  const [showTrackedOrders, setShowTrackedOrders] = useState(false);

  const [lightboxData, setLightboxData]           = useState(null);
  const [removeConfirm, setRemoveConfirm]         = useState(null);
  const [refundOrder, setRefundOrder]             = useState(null);
  const [refundSuccess, setRefundSuccess]         = useState(false);
  const [hiddenOrders, setHiddenOrders]           = useState(() => {
    try { return JSON.parse(localStorage.getItem('hiddenDeliveredOrders') || '[]'); } catch { return []; }
  });

  const orders           = useUserOrders(isAuthenticated ? user?.email : null) || [];
  const emailOrders      = useOrdersByEmail(searchEmail) || [];
  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const products         = [...regularProducts, ...preOrderProducts];

  // ✅ FIX: Use a stable combined list — don't recompute selectedOrder
  // from a list that changes every render due to input changes
  const allAvailableOrders = [...orders, ...emailOrders];

  // ✅ FIX: selectedOrder is derived from the stable allAvailableOrders
  // but selectedOrderId is only set/cleared explicitly by user actions
  const selectedOrder = selectedOrderId
    ? allAvailableOrders.find(o => o._id === selectedOrderId) || null
    : null;

  // ✅ FIX: Only auto-open order from URL param ONCE on mount
  // Use a ref to track if we've already processed the URL param
  const urlParamProcessedRef = useRef(false);

  useEffect(() => {
    if (urlParamProcessedRef.current) return;
    if (!orderIdParam) return;

    const found = [...orders, ...emailOrders].find(o => o.orderId === orderIdParam);
    if (found) {
      urlParamProcessedRef.current = true;
      setSelectedOrderId(found._id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdParam, orders, emailOrders]);

  // ✅ FIX: Stable close/open handlers using useCallback
  // These won't be recreated on re-render, preventing stale closures
  const handleCloseModal = useCallback(() => {
    setSelectedOrderId(null);
  }, []);

  const handleOpenModal = useCallback((order) => {
    setSelectedOrderId(order._id);
  }, []);

  const getProductById = useCallback(
    (id) => products.find(p => p._id === id || p.id === id),
    [products]
  );

  const getStatusClass = (status) => {
    const map = {
      'Processing': 'status-processing', 'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped', 'Out for Delivery': 'status-delivery',
      'out_for_delivery': 'status-delivery', 'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled', 'pending': 'status-processing',
      'confirmed': 'status-confirmed', 'shipped': 'status-shipped',
      'completed': 'status-delivered', 'cancelled': 'status-cancelled',
      'Pending Payment': 'status-pending-payment',
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
      'Pending Payment': 'Pending Payment',
    };
    return labels[s] || s;
  };

  const isPendingPayment = (order) =>
    order.status === 'Pending Payment' && order.paymentStatus !== 'paid';

  const isDelivered = (order) => {
    const s = (order.orderStatus || order.status || '').toLowerCase();
    return s === 'delivered' || s === 'completed';
  };

  const isCancelledOrder = (order) => {
    const s = (order.orderStatus || order.status || '').toLowerCase();
    return s === 'cancelled';
  };

  const isOutForDeliveryStatus = (order) => {
    const checkStr = (val) => {
      if (!val) return false;
      const s = val.toLowerCase().replace(/[\s_-]+/g, '_');
      return s === 'out_for_delivery';
    };
    return checkStr(order.orderStatus) || checkStr(order.status);
  };

  const getTimelineSteps = (order) => {
    const status = (order.orderStatus || order.status || 'pending').toLowerCase().replace(/\s+/g, '_');
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
        { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true, time: placedAt },
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
            ? 'A rider has been assigned to your order.' : 'Waiting for rider assignment.',
      },
      {
        label: 'Out for Delivery', icon: 'fa-shipping-fast',
        completed: ['out_for_delivery','delivered','completed'].includes(status),
        time: outForDeliveryAt,
        desc: ['out_for_delivery','delivered','completed'].includes(status)
          ? 'Your rider is on the way!' : 'Waiting for rider to pick up your order.',
      },
      {
        label: 'Delivered', icon: 'fa-check-double',
        completed: ['delivered','completed'].includes(status),
        time: deliveredAt,
        desc: ['delivered','completed'].includes(status)
          ? 'Your order has been delivered successfully!' : 'Waiting for delivery confirmation.',
      },
    ];
  };

  const handleRemoveOrder = (orderId) => {
    const updated = [...hiddenOrders, orderId];
    setHiddenOrders(updated);
    localStorage.setItem('hiddenDeliveredOrders', JSON.stringify(updated));
    setRemoveConfirm(null);
  };

  const openLightbox  = (images, startIndex = 0) => setLightboxData({ images, index: startIndex });
  const closeLightbox = () => setLightboxData(null);
  const lightboxNext  = () => setLightboxData(prev => ({ ...prev, index: (prev.index + 1) % prev.images.length }));
  const lightboxPrev  = () => setLightboxData(prev => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }));

  const sortByNewest = (arr) =>
    [...arr].sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const visibleOrders   = sortByNewest(orders.filter(o => !hiddenOrders.includes(o._id)));
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
    { key: 'active',    icon: 'fa-shopping-bag', label: 'All Orders', count: activeOrders.length,    desc: 'Active & ongoing orders' },
    { key: 'delivered', icon: 'fa-check-double',  label: 'Delivered',  count: deliveredOrders.length, desc: 'Successfully delivered' },
    { key: 'cancelled', icon: 'fa-ban',           label: 'Cancelled',  count: cancelledOrders.length, desc: 'Cancelled orders' },
  ];

  // ✅ FIX: Only update searchEmail on form submit — NOT on every keystroke
  // This prevents Convex query from re-running while user is still typing,
  // which caused emailOrders to update mid-render and reset selectedOrderId
  const handleFindMyOrders = (e) => {
    e.preventDefault();
    const email = trackingEmail.trim();
    if (!email) { alert('Please enter your email address'); return; }
    setSearchEmail(email);
    setShowTrackedOrders(true);
    // ✅ Clear any open modal when doing a new search
    setSelectedOrderId(null);
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

  const handleRefundSuccess = () => {
    setRefundOrder(null);
    setRefundSuccess(true);
    setTimeout(() => setRefundSuccess(false), 4000);
  };

  const OrderCard = ({ order, onViewDetails }) => {
    const scrollRef = useRef(null);
    const [activeImgIdx, setActiveImgIdx]           = useState(0);
    const [continuingPayment, setContinuingPayment] = useState(false);
    const createPaymentLink = useAction(api.payments.createPaymentLink);

    const ordDate      = order._creationTime ? new Date(order._creationTime) : null;
    const orderStatus  = getDisplayStatus(order);
    const statusKey    = order.orderStatus || order.status || 'pending';
    const delivered    = isDelivered(order);
    const releaseDate  = getPreOrderReleaseDate(order);
    const needsPayment = isPendingPayment(order);

    const itemImages = (order.items || []).map(item => {
      const product = getProductById(item.id);
      return { src: item.image || product?.image || null, name: item.name || product?.name || 'Item' };
    }).filter(i => i.src);

    const hasImages = itemImages.length > 0;

    const scrollTo = (idx) => {
      setActiveImgIdx(idx);
      if (scrollRef.current) {
        const child = scrollRef.current.children[idx];
        if (child) child.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    };

    const handleContinuePayment = async () => {
      setContinuingPayment(true);
      try {
        if (order.paymentLinkUrl) { window.location.href = order.paymentLinkUrl; return; }
        const result = await createPaymentLink({
          orderId: order.orderId, amount: order.finalTotal ?? order.total,
          description: `DKMerch Order ${order.orderId}`,
          customerName: order.customerName, customerEmail: order.email, customerPhone: order.phone,
        });
        window.location.href = result.paymentLinkUrl;
      } catch (err) {
        console.error('Continue payment error:', err);
        alert('Failed to load payment page. Please try again.');
        setContinuingPayment(false);
      }
    };

    return (
      <div className="order-card">
        <div className="order-card-img-wrap">
          <span className={`order-status-overlay ${getStatusClass(statusKey)}`}>{orderStatus}</span>
          {hasImages ? (
            <>
              <div className="order-img-strip" ref={scrollRef}>
                {itemImages.map((img, idx) => (
                  <div key={idx} className={`order-img-slide ${idx === activeImgIdx ? 'active' : ''}`}
                    onClick={() => openLightbox(itemImages.map(i => i.src), idx)} title="Click to enlarge">
                    <img src={img.src} alt={img.name} />
                    <div className="order-img-zoom"><i className="fas fa-search-plus"></i></div>
                  </div>
                ))}
              </div>
              {itemImages.length > 1 && (
                <>
                  <div className="order-img-dots">
                    {itemImages.map((_, idx) => (
                      <button key={idx} className={`order-img-dot ${idx === activeImgIdx ? 'active' : ''}`} onClick={() => scrollTo(idx)} />
                    ))}
                  </div>
                  <button className="order-img-arrow order-img-arrow-left" onClick={() => scrollTo((activeImgIdx - 1 + itemImages.length) % itemImages.length)}>
                    <i className="fas fa-chevron-left"></i>
                  </button>
                  <button className="order-img-arrow order-img-arrow-right" onClick={() => scrollTo((activeImgIdx + 1) % itemImages.length)}>
                    <i className="fas fa-chevron-right"></i>
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="order-no-img-wrap"><i className="fas fa-box order-no-img"></i></div>
          )}
        </div>

        <div className="order-card-info">
          <p className="order-card-id">Order #{order.orderId?.slice(-8) || 'N/A'}</p>
          <p className="order-card-name">
            {order.items?.[0]?.name || getProductById(order.items?.[0]?.id)?.name || 'Order'}
            {(order.items?.length || 1) > 1 && <span className="order-and-more"> +{order.items.length - 1} more</span>}
          </p>
          {releaseDate && (
            <div className="order-card-preorder-badge">
              <i className="fas fa-calendar-alt"></i>
              <span>Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
            </div>
          )}

          {delivered && order.refundStatus && (
            <div style={{ marginBottom: 6 }}>
              <RefundBadge status={order.refundStatus} />
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

          {needsPayment ? (
            <>
              <button className="btn btn-continue-payment" onClick={handleContinuePayment} disabled={continuingPayment}>
                {continuingPayment ? <><i className="fas fa-spinner fa-spin"></i> Loading...</> : <><i className="fas fa-credit-card"></i> Continue Payment</>}
              </button>
              <button className="btn btn-outline btn-small order-view-btn" style={{ marginTop: '6px' }} onClick={() => onViewDetails(order)}>
                <i className="fas fa-search"></i> View Details
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-small order-view-btn" onClick={() => onViewDetails(order)}>
              <i className="fas fa-search"></i> View Details
            </button>
          )}

          {delivered && !order.refundStatus && (
            <button className="btn order-refund-btn" onClick={() => setRefundOrder(order)}>
              <i className="fas fa-undo-alt"></i> Request Refund
            </button>
          )}

          {delivered && (
            <button className="btn order-remove-btn" onClick={() => setRemoveConfirm(order._id)}>
              <i className="fas fa-trash-alt"></i> Remove
            </button>
          )}
        </div>
      </div>
    );
  };

  const Lightbox = () => {
    if (!lightboxData) return null;
    const { images, index } = lightboxData;
    const hasMultiple = images.length > 1;
    useEffect(() => {
      const onKey = (e) => {
        if (e.key === 'Escape')                    closeLightbox();
        if (e.key === 'ArrowRight' && hasMultiple) lightboxNext();
        if (e.key === 'ArrowLeft'  && hasMultiple) lightboxPrev();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [hasMultiple]);
    return (
      <div className="order-lightbox" onClick={closeLightbox}>
        <button className="lightbox-close" onClick={closeLightbox}><i className="fas fa-times"></i></button>
        {hasMultiple && (
          <button className="lightbox-arrow lightbox-arrow-left" onClick={e => { e.stopPropagation(); lightboxPrev(); }}>
            <i className="fas fa-chevron-left"></i>
          </button>
        )}
        <img src={images[index]} alt={`Item ${index + 1}`} onClick={e => e.stopPropagation()} />
        {hasMultiple && (
          <button className="lightbox-arrow lightbox-arrow-right" onClick={e => { e.stopPropagation(); lightboxNext(); }}>
            <i className="fas fa-chevron-right"></i>
          </button>
        )}
        {hasMultiple && (
          <div className="lightbox-dots">
            {images.map((_, i) => (
              <button key={i} className={`lightbox-dot ${i === index ? 'active' : ''}`}
                onClick={e => { e.stopPropagation(); setLightboxData(prev => ({ ...prev, index: i })); }} />
            ))}
          </div>
        )}
        {hasMultiple && <div className="lightbox-counter">{index + 1} / {images.length}</div>}
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

            {refundSuccess && (
              <div className="refund-success-toast">
                <i className="fas fa-check-circle"></i>
                Refund request submitted! We'll review it within 1-3 business days.
              </div>
            )}

            <div className="orders-tab-bar">
              {FILTERS.map(f => (
                <button key={f.key} className={`orders-tab-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                  <i className={`fas ${f.icon}`}></i>
                  <span className="tab-label">{f.label}</span>
                  {f.count > 0 && <span className={`tab-count ${filter === f.key ? 'tab-count-active' : ''}`}>{f.count}</span>}
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
          <TrackingModal
            key={selectedOrderId}
            order={selectedOrder}
            products={products}
            onClose={handleCloseModal}
            getTimelineSteps={getTimelineSteps}
            getStatusClass={getStatusClass}
            getDisplayStatus={getDisplayStatus}
            isOutForDeliveryStatus={isOutForDeliveryStatus}
            onRequestRefund={(order) => { handleCloseModal(); setRefundOrder(order); }}
          />
        )}

        {refundOrder && (
          <RefundModal
            order={refundOrder}
            onClose={() => setRefundOrder(null)}
            onSuccess={handleRefundSuccess}
          />
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

  // ─── NOT LOGGED IN VIEW ───────────────────────────────────────────────────
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
              {/* ✅ FIX: onSubmit only fires on explicit button click/Enter
                  trackingEmail state is isolated to the input field
                  searchEmail only updates when form is submitted */}
              <form onSubmit={handleFindMyOrders}>
                <div className="form-group">
                  <label htmlFor="tracking-email">Email Address</label>
                  <input
                    type="email"
                    id="tracking-email"
                    className="form-control"
                    placeholder="Enter your email address"
                    value={trackingEmail}
                    onChange={e => setTrackingEmail(e.target.value)}
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

          {showTrackedOrders && emailOrders.length > 0 && (
            <div className="tracked-orders-section">
              <div className="tracked-orders-header">
                <h2>Your Orders</h2>
                <p>Found {emailOrders.length} order{emailOrders.length > 1 ? 's' : ''} for {searchEmail}</p>
              </div>
              <div className="orders-grid">
                {sortByNewest(emailOrders).map(order => (
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

      {/* ✅ FIX: key prop ensures modal fully remounts when order changes
          This prevents stale state inside TrackingModal */}
      {selectedOrder && (
        <TrackingModal
          key={selectedOrderId}
          order={selectedOrder}
          products={products}
          onClose={handleCloseModal}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
          getDisplayStatus={getDisplayStatus}
          isOutForDeliveryStatus={isOutForDeliveryStatus}
          onRequestRefund={(order) => { handleCloseModal(); setRefundOrder(order); }}
        />
      )}

      {refundOrder && (
        <RefundModal
          order={refundOrder}
          onClose={() => setRefundOrder(null)}
          onSuccess={handleRefundSuccess}
        />
      )}
      <Lightbox />
    </main>
  );
};

// ─── TRACKING MODAL ──────────────────────────────────────────────────────────
const TrackingModal = ({
  order, products, onClose,
  getTimelineSteps, getStatusClass, getDisplayStatus, isOutForDeliveryStatus,
  onRequestRefund,
}) => {
  const updateOrderOtp    = useUpdateOrderOtp();
  const createPaymentLink = useAction(api.payments.createPaymentLink);
  const [generatingOtp, setGeneratingOtp]         = useState(false);
  const [localOtp, setLocalOtp]                   = useState(order.deliveryOtp || null);
  const [continuingPayment, setContinuingPayment] = useState(false);

  const isCancelled      = (order.orderStatus || order.status || '').toLowerCase() === 'cancelled';
  const isOutForDelivery = isOutForDeliveryStatus(order);
  const needsPayment     = order.status === 'Pending Payment' && order.paymentStatus !== 'paid';
  const delivered        = ['delivered','completed'].includes((order.orderStatus || order.status || '').toLowerCase());
  const timelineSteps    = getTimelineSteps(order);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    if (order.deliveryOtp) setLocalOtp(order.deliveryOtp);
  }, [order.deliveryOtp]);

  // ✅ FIX: Stable Escape key handler that calls onClose directly
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

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

  const handleContinuePayment = async () => {
    setContinuingPayment(true);
    try {
      if (order.paymentLinkUrl) { window.location.href = order.paymentLinkUrl; return; }
      const result = await createPaymentLink({
        orderId: order.orderId, amount: order.finalTotal ?? order.total,
        description: `DKMerch Order ${order.orderId}`,
        customerName: order.customerName, customerEmail: order.email, customerPhone: order.phone,
      });
      window.location.href = result.paymentLinkUrl;
    } catch (err) {
      console.error('Continue payment error:', err);
      alert('Failed to load payment page. Please try again.');
      setContinuingPayment(false);
    }
  };

  return (
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={e => e.stopPropagation()}>
        {/* ✅ FIX: Close button uses onClose directly — no intermediate state */}
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

          {needsPayment && (
            <div className="pending-payment-banner">
              <div className="pending-payment-icon"><i className="fas fa-exclamation-circle"></i></div>
              <div className="pending-payment-text">
                <strong>Payment Incomplete</strong>
                <p>Your order is reserved but payment was not completed.</p>
              </div>
              <button className="btn btn-continue-payment" onClick={handleContinuePayment} disabled={continuingPayment}>
                {continuingPayment
                  ? <><i className="fas fa-spinner fa-spin"></i> Loading...</>
                  : <><i className="fas fa-credit-card"></i> Complete Payment</>}
              </button>
            </div>
          )}

          {order.riderInfo && !isCancelled && (
            <div className="rider-info-banner">
              <div className="rider-info-icon"><i className="fas fa-motorcycle"></i></div>
              <div className="rider-info-details">
                <strong>Your Rider: {order.riderInfo.name}</strong>
                <span>{order.riderInfo.vehicle} • {order.riderInfo.plate}</span>
                {order.riderInfo.phone && (
                  <span><i className="fas fa-phone"></i> {order.riderInfo.phone}</span>
                )}
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

          {delivered && order.refundStatus && (
            <div className={`refund-status-banner refund-banner-${order.refundStatus}`}>
              <div className="refund-banner-icon">
                {order.refundStatus === 'requested' && <i className="fas fa-clock"></i>}
                {order.refundStatus === 'approved'  && <i className="fas fa-check-circle"></i>}
                {order.refundStatus === 'rejected'  && <i className="fas fa-times-circle"></i>}
              </div>
              <div className="refund-banner-text">
                <strong>
                  {order.refundStatus === 'requested' && 'Refund Request Pending'}
                  {order.refundStatus === 'approved'  && 'Refund Approved'}
                  {order.refundStatus === 'rejected'  && 'Refund Request Rejected'}
                </strong>
                <p>
                  {order.refundStatus === 'requested' && `Reason: ${REFUND_REASONS.find(r => r.value === order.refundReason)?.label || order.refundReason}`}
                  {order.refundStatus === 'approved'  && (order.refundAdminNote || 'Your refund has been approved.')}
                  {order.refundStatus === 'rejected'  && (order.refundAdminNote || 'Your refund request was not approved.')}
                </p>
                {order.refundComment && order.refundStatus === 'requested' && (
                  <p style={{ fontStyle: 'italic', marginTop: 2 }}>"{order.refundComment}"</p>
                )}
              </div>
            </div>
          )}

          {delivered && !order.refundStatus && (
            <button className="modal-refund-btn" onClick={() => onRequestRefund(order)}>
              <i className="fas fa-undo-alt"></i> Request Refund
            </button>
          )}

          {isOutForDelivery && (
            <div className="rider-map-section">
              <div className="rider-map-section-title">
                <i className="fas fa-map-marked-alt"></i>
                <span>Real-Time Rider Location</span>
                <span className="rider-map-live-pill">LIVE</span>
              </div>
              <RiderMap orderId={order.orderId} riderName={order.riderInfo?.name} />
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
                    {generatingOtp
                      ? <><i className="fas fa-spinner fa-spin"></i> Generating OTP...</>
                      : <><i className="fas fa-key"></i> Generate My OTP</>}
                  </button>
                  <p className="otp-generate-warning">
                    <i className="fas fa-exclamation-triangle"></i> Only generate this when your rider has arrived.
                  </p>
                </div>
              ) : (
                <div className="otp-display-card">
                  <div className="otp-display-header">
                    <div className="otp-display-icon"><i className="fas fa-shield-alt"></i></div>
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
                    {step.time && step.completed && (
                      <span className="timeline-timestamp"><i className="fas fa-clock"></i> {step.time}</span>
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
                        <i className="fas fa-calendar-alt"></i> Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
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
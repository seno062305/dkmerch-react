// src/admin/AdminRiders.jsx
import React, { useState, useEffect, useRef } from 'react';
import './AdminRiders.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://dkmerchwebsite.vercel.app';
const getRiderLink    = (orderId) => `${SITE_URL}/rider-track/${orderId}`;
const getCustomerLink = (orderId) => `${SITE_URL}/track-order?order=${orderId}`;

// ─── STATUS BADGE ─────────────────────────────────────────────
const StatusBadge = ({ order }) => {
  const s = (order.orderStatus || order.status || '').toLowerCase();
  const map = {
    confirmed:        { label: '✅ Confirmed',        bg: '#059669' },
    processing:       { label: '⚙️ Processing',       bg: '#6366f1' },
    shipped:          { label: '📦 Shipped',           bg: '#0ea5e9' },
    out_for_delivery: { label: '🚚 Out for Delivery', bg: '#f59e0b' },
    completed:        { label: '✅ Delivered',         bg: '#16a34a' },
    delivered:        { label: '✅ Delivered',         bg: '#16a34a' },
  };
  const m = map[s];
  return m
    ? <span className="ar-status-badge" style={{ background: m.bg }}>{m.label}</span>
    : <span className="ar-status-badge" style={{ background: '#6b7280' }}>{order.orderStatus || order.status}</span>;
};

// ─── LIVE BADGE ───────────────────────────────────────────────
const LiveBadge = ({ orderId }) => {
  const loc = useQuery(api.riders.getRiderLocation, { orderId });
  if (!loc?.isTracking || (Date.now() - loc.updatedAt) >= 60000) return null;
  return (
    <span className="ar-live-indicator">
      <span className="ar-gps-live-dot" style={{ width: 7, height: 7 }} />
      Live
    </span>
  );
};

// ─── LIVE MAP MODAL ───────────────────────────────────────────
const LiveMapModal = ({ orderId, order, onClose, fullscreen = false }) => {
  const mapRef       = useRef(null);
  const mapObjRef    = useRef(null);
  const markerRef    = useRef(null);
  const circleRef    = useRef(null);
  const routeLineRef  = useRef(null);
  const destMarkerRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);
  const [lastUpdate,   setLastUpdate]   = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(fullscreen);
  const location = useQuery(api.riders.getRiderLocation, { orderId });

  // Load Leaflet
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // Init map
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapObjRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);

    const destLat = order?.addressLat || null;
    const destLng = order?.addressLng || null;

    // Destination marker (customer address)
    const destIcon = L.divIcon({
      html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">📍</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [20, 40],
    });

    // Rider marker
    const riderIcon = L.divIcon({
      html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(106,13,173,0.55);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>`,
      className: '', iconSize: [40, 40], iconAnchor: [20, 20],
    });

    const centerLat = destLat || 14.5995;
    const centerLng = destLng || 120.9842;
    map.setView([centerLat, centerLng], 14);

    if (destLat && destLng) {
      const dm = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
      dm.bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`).openPopup();
      destMarkerRef.current = dm;
    }

    const marker = L.marker([centerLat, centerLng], { icon: riderIcon }).addTo(map);
    marker.bindPopup(`<b>🛵 ${order.riderInfo?.name || 'Rider'}</b><br>Waiting for GPS…`);
    mapObjRef.current = map;
    markerRef.current = marker;
  }, [leafletReady, order]);

  // Invalidate size on fullscreen toggle
  useEffect(() => {
    if (mapObjRef.current) setTimeout(() => mapObjRef.current.invalidateSize(), 150);
  }, [isFullscreen]);

  // Handle tab/window visibility — reinvalidate map when coming back
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && mapObjRef.current) {
        setTimeout(() => { if (mapObjRef.current) mapObjRef.current.invalidateSize(); }, 200);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Update rider position + draw route line when location changes
  useEffect(() => {
    if (!mapObjRef.current || !markerRef.current || !location?.lat) return;
    const L = window.L;
    const { lat, lng, accuracy } = location;

    markerRef.current.setLatLng([lat, lng]);
    markerRef.current.setPopupContent(
      `<b>🛵 ${order.riderInfo?.name || 'Rider'}</b><br>📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}<br>${accuracy ? `±${Math.round(accuracy)}m` : ''}<br><small>${new Date(location.updatedAt).toLocaleTimeString()}</small>`
    );

    // Accuracy circle
    if (circleRef.current) circleRef.current.remove();
    if (accuracy) {
      circleRef.current = L.circle([lat, lng], {
        radius: accuracy, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.07, weight: 1.5,
      }).addTo(mapObjRef.current);
    }

    // Red dashed route line from rider → destination
    const destLat = order?.addressLat;
    const destLng = order?.addressLng;
    if (routeLineRef.current) { routeLineRef.current.remove(); routeLineRef.current = null; }
    if (destLat && destLng) {
      routeLineRef.current = L.polyline(
        [[lat, lng], [destLat, destLng]],
        { color: '#e53e3e', weight: 4, opacity: 0.85, dashArray: '10, 8', lineJoin: 'round' }
      ).addTo(mapObjRef.current);

      // Fit both in view
      const bounds = L.latLngBounds([lat, lng], [destLat, destLng]);
      mapObjRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
    } else {
      mapObjRef.current.flyTo([lat, lng], Math.max(mapObjRef.current.getZoom(), 16), { animate: true, duration: 1 });
    }

    setLastUpdate(new Date(location.updatedAt));
  }, [location, order]);

  // Cleanup
  useEffect(() => () => {
    if (mapObjRef.current) {
      try { mapObjRef.current.remove(); } catch {}
      mapObjRef.current    = null;
      markerRef.current    = null;
      circleRef.current    = null;
      routeLineRef.current  = null;
      destMarkerRef.current = null;
    }
  }, []);

  const isLive = location?.isTracking && location?.updatedAt && (Date.now() - location.updatedAt) < 60000;

  return (
    <div className={`ar-modal-overlay ${isFullscreen ? 'ar-overlay--full' : ''}`} onClick={onClose}>
      <div className={`ar-map-modal ${isFullscreen ? 'ar-map-modal--full' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="ar-map-header">
          <div className="ar-map-title-row">
            <span className="ar-map-title">📍 Live Rider Location</span>
            <span className="ar-map-order-id">#{orderId?.slice(-8).toUpperCase()}</span>
          </div>
          <div className="ar-map-header-right">
            {isLive
              ? <div className="ar-map-live-badge"><span className="ar-gps-live-dot" />Live · {lastUpdate?.toLocaleTimeString()}</div>
              : location?.updatedAt
              ? <div className="ar-map-stale-badge">⏸ {new Date(location.updatedAt).toLocaleTimeString()}</div>
              : <div className="ar-map-waiting-badge">⏳ Waiting for rider to open link…</div>}
            <button className="ar-map-fullscreen-btn" onClick={() => setIsFullscreen(f => !f)}>
              {isFullscreen ? '⛶ Exit' : '⛶ Full'}
            </button>
            <button className="ar-modal-close ar-modal-close--map" onClick={onClose}>✕</button>
          </div>
        </div>
        <div ref={mapRef} className="ar-map-container" />
        {!location?.lat && (
          <div className="ar-map-waiting-overlay">
            <span className="ar-gps-live-dot" style={{ background: '#f59e0b' }} />
            <span>Waiting for rider to open their link and share GPS…</span>
          </div>
        )}
        {location?.lat && (
          <div className="ar-map-info-bar">
            <span>🛵 {order.riderInfo?.name || 'Rider'}</span>
            <span>📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>
            {location.speed > 0 && <span>🚀 {(location.speed * 3.6).toFixed(1)} km/h</span>}
            <span style={{ color: '#e53e3e', fontWeight: 700 }}>━━ Route</span>
          </div>
        )}
        <div className="ar-map-link-row">
          <code className="ar-map-link-code">{getRiderLink(orderId)}</code>
          <button className="ar-map-copy-btn" onClick={() => navigator.clipboard.writeText(getRiderLink(orderId))}>
            📋 Copy
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── SHARE MODAL ──────────────────────────────────────────────
const ShareModal = ({ order, onClose }) => {
  const [copiedRider,    setCopiedRider]    = useState(false);
  const [copiedCustomer, setCopiedCustomer] = useState(false);
  const [copiedAll,      setCopiedAll]      = useState(false);
  const riderInfo = order.riderInfo || {};
  const riderLink = getRiderLink(order.orderId);
  const custLink  = getCustomerLink(order.orderId);
  const msg = `📦 DKMerch Order Update\n━━━━━━━━━━━━━━━━━━\nOrder: #${order.orderId?.slice(-8).toUpperCase()}\nStatus: Out for Delivery 🚚\n\n🛵 Rider:\n• ${riderInfo.name || '—'}\n• ${riderInfo.phone || '—'}\n• Plate: ${riderInfo.plate || '—'}\n\n📍 Track: ${custLink}\n━━━━━━━━━━━━━━━━━━\nThank you! 💜`;

  const copy = async (text, setter) => {
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setter(true); setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="ar-modal-overlay" onClick={onClose}>
      <div className="ar-share-modal" onClick={e => e.stopPropagation()}>
        <button className="ar-modal-close" onClick={onClose}>✕</button>
        <h3 className="ar-modal-title">📤 Share Links</h3>
        <div className="ar-share-link-block ar-share-link-rider">
          <div className="ar-share-link-header"><span>🛵 Rider Link</span></div>
          <div className="ar-share-link-row">
            <div className="ar-share-link-url">{riderLink}</div>
            <button className="ar-btn ar-btn-primary ar-share-copy-btn" onClick={() => copy(riderLink, setCopiedRider)}>
              {copiedRider ? '✅' : '📋 Copy'}
            </button>
          </div>
        </div>
        <div className="ar-share-link-block ar-share-link-customer">
          <div className="ar-share-link-header"><span>👤 Customer Link</span></div>
          <div className="ar-share-link-row">
            <div className="ar-share-link-url">{custLink}</div>
            <button className="ar-btn ar-btn-secondary ar-share-copy-btn" onClick={() => copy(custLink, setCopiedCustomer)}>
              {copiedCustomer ? '✅' : '📋 Copy'}
            </button>
          </div>
        </div>
        <div className="ar-share-divider">Full message:</div>
        <div className="ar-share-preview"><pre className="ar-share-text">{msg}</pre></div>
        <div className="ar-share-actions">
          <button className="ar-btn ar-btn-primary" onClick={() => copy(msg, setCopiedAll)}>
            {copiedAll ? '✅ Copied!' : '📋 Copy Message'}
          </button>
          <button className="ar-btn ar-btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

// ─── RIDER DETAIL MODAL ───────────────────────────────────────
const RiderDetailModal = ({ rider, onClose }) => (
  <div className="ar-modal-overlay" onClick={onClose}>
    <div className="ar-detail-modal" onClick={e => e.stopPropagation()}>
      <button className="ar-modal-close" onClick={onClose}>✕</button>
      <h3 className="ar-modal-title">🛵 Rider Details</h3>
      <div className="ar-rider-card">
        {rider.riderPhoto
          ? <img src={rider.riderPhoto} alt={rider.fullName} className="ar-rider-avatar" />
          : <div className="ar-rider-avatar-placeholder">👤</div>}
        <div className="ar-rider-info-grid">
          {[
            ['Full Name', rider.fullName],
            ['DK Rider ID', rider.dkRiderId || '—', true],
            ['Email', rider.email],
            ['Phone', rider.phone],
            ['Plate No.', rider.plateNumber || '—'],
          ].map(([label, value, highlight]) => (
            <div key={label} className="ar-info-row">
              <span className="ar-info-label">{label}</span>
              <span className={`ar-info-value ${highlight ? 'ar-id-badge' : ''}`}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <button className="ar-btn ar-btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Close</button>
    </div>
  </div>
);

// ─── REMOVE CONFIRM ───────────────────────────────────────────
const RemoveConfirmModal = ({ order, onConfirm, onClose }) => (
  <div className="ar-modal-overlay" onClick={onClose}>
    <div className="ar-confirm-modal" onClick={e => e.stopPropagation()}>
      <button className="ar-modal-close" onClick={onClose}>✕</button>
      <div className="ar-confirm-icon">🗑️</div>
      <h3 className="ar-modal-title">Remove Order?</h3>
      <p className="ar-confirm-desc">
        Aalisin sa list ang <strong>#{order.orderId?.slice(-8).toUpperCase()}</strong>. Hindi mabubura sa database.
      </p>
      <div className="ar-confirm-actions">
        <button className="ar-btn ar-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="ar-btn ar-btn-danger" onClick={onConfirm}>Remove</button>
      </div>
    </div>
  </div>
);

// ─── ACTIVE ORDER CARD ────────────────────────────────────────
const ActiveOrderCard = ({
  order,
  savingRider, savedRider,
  savingGps,   savedGps,
  copiedLink, collapsed, notifying, notified,
  onSaveRider, onSaveGps,
  onCopyLink, onToggleCollapse, onShareOrder, onOpenMap, onNotifyCustomer,
}) => {
  const { orderId } = order;

  const [ri, setRi] = useState({
    name:  order.riderInfo?.name  || '',
    phone: order.riderInfo?.phone || '',
    plate: order.riderInfo?.plate || '',
  });
  const [gps,    setGps]    = useState(order.riderGpsLink || '');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setRi({
      name:  order.riderInfo?.name  || '',
      phone: order.riderInfo?.phone || '',
      plate: order.riderInfo?.plate || '',
    });
  }, [order.riderInfo?.name, order.riderInfo?.phone, order.riderInfo?.plate]);

  useEffect(() => {
    setGps(order.riderGpsLink || '');
  }, [order.riderGpsLink]);

  const [copiedCust, setCopiedCust] = useState(false);
  const custLink  = getCustomerLink(orderId);
  const riderLink = getRiderLink(orderId);

  const copyCust = () => {
    navigator.clipboard.writeText(custLink).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = custLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
    setCopiedCust(true);
    setTimeout(() => setCopiedCust(false), 2000);
  };

  const validate = () => {
    const e = {};
    if (!ri.name?.trim())                        e.name  = 'Name is required';
    if (!ri.phone?.trim())                       e.phone = 'Phone is required';
    else if (!/^09\d{9}$/.test(ri.phone.trim())) e.phone = 'Must be 11 digits starting with 09';
    if (!ri.plate?.trim())                       e.plate = 'Plate number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePhoneChange = (val) => {
    const digits = val.replace(/\D/g, '').slice(0, 11);
    setRi(prev => ({ ...prev, phone: digits }));
    if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
  };

  const savedRiderInfo    = order.riderInfo || {};
  const hasSavedRiderInfo = !!(
    savedRiderInfo.name?.trim() &&
    savedRiderInfo.phone?.trim() &&
    savedRiderInfo.plate?.trim() &&
    /^09\d{9}$/.test(savedRiderInfo.phone.trim())
  );
  const alreadyNotified = (order.orderStatus || '').toLowerCase() === 'out_for_delivery';

  return (
    <div className={`ar-order-card ${collapsed ? 'ar-card-collapsed' : ''}`}>

      {/* Header */}
      <div className="ar-order-header">
        <div className="ar-order-id-block">
          <span className="ar-order-id">#{orderId?.slice(-8).toUpperCase()}</span>
          <StatusBadge order={order} />
          <LiveBadge orderId={orderId} />
        </div>
        <div className="ar-header-actions">
          <button className="ar-share-btn" onClick={() => onShareOrder({ ...order, riderInfo: ri })}>📤</button>
          <button className="ar-collapse-btn" onClick={() => onToggleCollapse(orderId)}>
            {collapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {collapsed && (
        <div className="ar-collapsed-summary">
          <span className="ar-cs-name">{order.customerName || '—'}</span>
          <span className="ar-cs-sep">·</span>
          <span className="ar-cs-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span>
          {ri.name && (
            <>
              <span className="ar-cs-sep">·</span>
              <span className="ar-cs-rider">🛵 {ri.name}</span>
            </>
          )}
        </div>
      )}

      {!collapsed && (
        <div className="ar-order-body">

          <div className="ar-two-col">
            <div className="ar-section">
              <div className="ar-section-title">👤 Customer</div>
              <div className="ar-compact-row">
                <span className="ar-cl">Name</span>
                <span className="ar-cv">{order.customerName || '—'}</span>
              </div>
              <div className="ar-compact-row">
                <span className="ar-cl">Phone</span>
                <span className="ar-cv">{order.phone || '—'}</span>
              </div>
              <div className="ar-compact-row">
                <span className="ar-cl">Total</span>
                <span className="ar-cv ar-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="ar-section">
              <div className="ar-section-title">🛵 Rider Info</div>
              <div className="ar-input-compact">
                <div className="ar-input-field">
                  <input
                    type="text"
                    placeholder="Name *"
                    value={ri.name}
                    onChange={e => { setRi(prev => ({ ...prev, name: e.target.value })); if (errors.name) setErrors(prev => ({ ...prev, name: '' })); }}
                    className={errors.name ? 'ar-input-error' : ''}
                  />
                  {errors.name && <span className="ar-field-error">{errors.name}</span>}
                </div>
                <div className="ar-input-field">
                  <input
                    type="tel"
                    placeholder="Phone * (09XXXXXXXXX)"
                    value={ri.phone}
                    onChange={e => handlePhoneChange(e.target.value)}
                    maxLength={11}
                    className={errors.phone ? 'ar-input-error' : ''}
                  />
                  {errors.phone
                    ? <span className="ar-field-error">{errors.phone}</span>
                    : <span className="ar-field-hint">{ri.phone.length}/11 digits</span>}
                </div>
                <div className="ar-input-field">
                  <input
                    type="text"
                    placeholder="Plate Number *"
                    value={ri.plate}
                    onChange={e => { setRi(prev => ({ ...prev, plate: e.target.value.toUpperCase() })); if (errors.plate) setErrors(prev => ({ ...prev, plate: '' })); }}
                    className={errors.plate ? 'ar-input-error' : ''}
                  />
                  {errors.plate && <span className="ar-field-error">{errors.plate}</span>}
                </div>
              </div>
              <button
                className="ar-save-btn ar-save-btn-sm"
                onClick={() => { if (validate()) onSaveRider(orderId, ri); }}
                disabled={savingRider}
              >
                {savingRider ? '⏳' : savedRider ? '✅ Saved' : '💾 Save Rider'}
              </button>
            </div>
          </div>

          {/* Notify Section */}
          <div className="ar-notify-section">
            {alreadyNotified ? (
              <div className="ar-notify-done">
                <span>✅ Customer notified — Out for Delivery</span>
              </div>
            ) : (
              <>
                <button
                  className={`ar-notify-btn ${notified ? 'ar-notify-btn--done' : ''}`}
                  onClick={() => { if (validate()) onNotifyCustomer(order, ri); }}
                  disabled={notifying || !hasSavedRiderInfo}
                  title={!hasSavedRiderInfo ? 'Save rider info first before notifying' : ''}
                >
                  {notifying ? '⏳ Sending…' : notified ? '✅ Customer Notified!' : '🔔 Notify Customer (Out for Delivery)'}
                </button>
                {!hasSavedRiderInfo && (
                  <p className="ar-notify-hint">⚠️ Save rider info first (click 💾 Save Rider) before notifying</p>
                )}
              </>
            )}

            {alreadyNotified && (
              <div className="ar-otp-block">
                {order.deliveryOtp ? (
                  <>
                    <div className="ar-otp-label">
                      <span className="ar-otp-label-icon">🔐</span>
                      <span>Customer OTP</span>
                      <span className="ar-otp-ready-badge">✅ Generated</span>
                    </div>
                    <div className="ar-otp-digits">
                      {String(order.deliveryOtp).split('').map((d, i) => (
                        <span key={i} className="ar-otp-digit">{d}</span>
                      ))}
                    </div>
                    <p className="ar-otp-sub">
                      {order.deliveryOtpVerified
                        ? '✅ OTP verified by rider — package delivered!'
                        : '⏳ Waiting for rider to verify this OTP from customer'}
                    </p>
                  </>
                ) : (
                  <div className="ar-otp-waiting">
                    <span className="ar-otp-wait-dot" />
                    <span>Waiting for customer to generate OTP…</span>
                    <small>Customer must tap "Generate OTP" on their tracking page when rider arrives</small>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* GPS Tracking */}
          <div className="ar-section ar-section-full">
            <div className="ar-section-title">📍 GPS Tracking</div>
            <div className="ar-tracking-compact">
              <div className="ar-tl-row">
                <span className="ar-tl-badge">🛵</span>
                <div className="ar-tl-url">{riderLink}</div>
                <button className="ar-tl-copy" onClick={() => onCopyLink(orderId)}>
                  {copiedLink ? '✅' : '📋'}
                </button>
              </div>
              <div className="ar-tl-row">
                <span className="ar-tl-badge">👤</span>
                <div className="ar-tl-url">{custLink}</div>
                <button className="ar-tl-copy ar-tl-copy--green" onClick={copyCust}>
                  {copiedCust ? '✅' : '📋'}
                </button>
              </div>
              <div className="ar-map-btn-row">
                <button className="ar-track-map-btn" onClick={() => onOpenMap(order, false)}>
                  🗺️ Live Map
                </button>
                <button className="ar-track-map-btn ar-track-map-btn--full" onClick={() => onOpenMap(order, true)}>
                  ⛶ Full Map
                </button>
              </div>
            </div>

            <details className="ar-gps-fallback">
              <summary>Manual Google Maps link (optional fallback)</summary>
              <div style={{ marginTop: 8 }}>
                <div className="ar-jnt-row">
                  <input
                    type="url"
                    className="ar-jnt-input"
                    placeholder="Paste Google Maps live link…"
                    value={gps}
                    onChange={e => setGps(e.target.value)}
                  />
                  <button
                    className="ar-save-btn ar-jnt-save"
                    onClick={() => onSaveGps(orderId, gps)}
                    disabled={savingGps}
                  >
                    {savingGps ? '⏳' : savedGps ? '✅' : '💾'}
                  </button>
                </div>
                {order.riderGpsLink && (
                  <a href={order.riderGpsLink} target="_blank" rel="noopener noreferrer"
                    className="ar-gps-open-btn" style={{ marginTop: 6, display: 'inline-block' }}>
                    🗺️ Open Saved Link
                  </a>
                )}
              </div>
            </details>
          </div>

        </div>
      )}
    </div>
  );
};

// ─── COMPLETED ORDER CARD ─────────────────────────────────────
const CompletedOrderCard = ({ order, onRemove }) => {
  const riderInfo   = order.riderInfo || {};
  const deliveredAt = order.deliveryConfirmedAt
    ? new Date(order.deliveryConfirmedAt).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <div className="ar-order-card ar-completed-card">
      <div className="ar-order-header ar-completed-header">
        <div className="ar-order-id-block">
          <span className="ar-order-id">#{order.orderId?.slice(-8).toUpperCase()}</span>
          <StatusBadge order={order} />
        </div>
        <button className="ar-remove-btn" onClick={() => onRemove(order)} title="Remove">🗑️</button>
      </div>
      <div className="ar-completed-body">
        <div className="ar-completed-row">
          <span className="ar-info-label">Customer</span>
          <span className="ar-info-value">{order.customerName || '—'}</span>
        </div>
        <div className="ar-completed-row">
          <span className="ar-info-label">Total</span>
          <span className="ar-info-value ar-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span>
        </div>
        {riderInfo.name && (
          <div className="ar-completed-row">
            <span className="ar-info-label">Rider</span>
            <span className="ar-info-value">🛵 {riderInfo.name}{riderInfo.plate ? ` · ${riderInfo.plate}` : ''}</span>
          </div>
        )}
        {deliveredAt && (
          <div className="ar-completed-row">
            <span className="ar-info-label">Delivered</span>
            <span className="ar-info-value ar-delivered-time">✅ {deliveredAt}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────
const AdminRiders = () => {
  const [tab,           setTab]           = useState('delivery');
  const [shareOrder,    setShareOrder]    = useState(null);
  const [selectedRider, setSelectedRider] = useState(null);
  const [removeTarget,  setRemoveTarget]  = useState(null);
  const [mapOrder,      setMapOrder]      = useState(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);

  const [collapsed,       setCollapsed]       = useState({});
  const [hiddenCompleted, setHiddenCompleted] = useState([]);
  const [savingRider,     setSavingRider]     = useState({});
  const [savedRider,      setSavedRider]      = useState({});
  const [savingGps,       setSavingGps]       = useState({});
  const [savedGps,        setSavedGps]        = useState({});
  const [copiedLink,      setCopiedLink]      = useState({});
  const [notifying,       setNotifying]       = useState({});
  const [notified,        setNotified]        = useState({});

  const allOrders      = useQuery(api.orders.getAllOrders) ?? [];
  const updateFields   = useMutation(api.orders.updateOrderFields);
  const notifyMutation = useMutation(api.orders.notifyCustomerOutForDelivery);

  const activeStatuses    = ['confirmed', 'shipped', 'out_for_delivery', 'processing'];
  const completedStatuses = ['completed', 'delivered'];

  const activeOrders = allOrders
    .filter(o => activeStatuses.includes((o.orderStatus || o.status || '').toLowerCase()))
    .sort((a, b) => (b.confirmedAt || b._creationTime || 0) - (a.confirmedAt || a._creationTime || 0));

  const completedOrders = allOrders
    .filter(o => completedStatuses.includes((o.orderStatus || o.status || '').toLowerCase()))
    .filter(o => !hiddenCompleted.includes(o._id))
    .sort((a, b) => (b.deliveryConfirmedAt || b._creationTime || 0) - (a.deliveryConfirmedAt || a._creationTime || 0));

  const handleSaveRider = async (orderId, ri) => {
    setSavingRider(p => ({ ...p, [orderId]: true }));
    try {
      await updateFields({ orderId, riderInfo: { name: ri.name || '', phone: ri.phone || '', plate: ri.plate || '' } });
      setSavedRider(p => ({ ...p, [orderId]: true }));
      setTimeout(() => setSavedRider(p => ({ ...p, [orderId]: false })), 2000);
    } catch (e) { console.error(e); }
    finally { setSavingRider(p => ({ ...p, [orderId]: false })); }
  };

  const handleSaveGps = async (orderId, gpsValue) => {
    setSavingGps(p => ({ ...p, [orderId]: true }));
    try {
      await updateFields({ orderId, riderGpsLink: gpsValue ?? '' });
      setSavedGps(p => ({ ...p, [orderId]: true }));
      setTimeout(() => setSavedGps(p => ({ ...p, [orderId]: false })), 2000);
    } catch (e) { console.error(e); }
    finally { setSavingGps(p => ({ ...p, [orderId]: false })); }
  };

  const handleCopyLink = (orderId) => {
    const link = getRiderLink(orderId);
    navigator.clipboard.writeText(link).catch(() => {
      const ta = document.createElement('textarea'); ta.value = link;
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    });
    setCopiedLink(p => ({ ...p, [orderId]: true }));
    setTimeout(() => setCopiedLink(p => ({ ...p, [orderId]: false })), 2000);
  };

  const handleNotifyCustomer = async (order, ri) => {
    const { orderId } = order;
    if (!ri.name?.trim() || !ri.phone?.trim()) { alert('Please enter rider name and phone first.'); return; }
    if (!order.email) { alert('No customer email on this order.'); return; }
    setNotifying(p => ({ ...p, [orderId]: true }));
    try {
      await updateFields({ orderId, riderInfo: { name: ri.name, phone: ri.phone, plate: ri.plate || '' } });
      await notifyMutation({ orderId, riderName: ri.name, riderPhone: ri.phone, riderPlate: ri.plate || undefined, customerEmail: order.email });
      setNotified(p => ({ ...p, [orderId]: true }));
      setTimeout(() => setNotified(p => ({ ...p, [orderId]: false })), 4000);
    } catch (e) { console.error('Notify error:', e); alert('Failed to notify customer. Please try again.'); }
    finally { setNotifying(p => ({ ...p, [orderId]: false })); }
  };

  const handleToggleCollapse = (orderId) => setCollapsed(p => ({ ...p, [orderId]: !p[orderId] }));
  const confirmRemove        = ()         => { if (!removeTarget) return; setHiddenCompleted(p => [...p, removeTarget._id]); setRemoveTarget(null); };
  const openMap              = (order, full = false) => { setMapOrder(order); setMapFullscreen(full); };

  return (
    <div className="admin-riders">
      <h1 className="admin-riders-title">🚚 Delivery Management</h1>

      {/* ── Tabs — Riders tab removed ── */}
      <div className="riders-tabs">
        <button className={`riders-tab-btn ${tab === 'delivery' ? 'active' : ''}`} onClick={() => setTab('delivery')}>
          📦 Active {activeOrders.length > 0 && <span className="riders-tab-badge">{activeOrders.length}</span>}
        </button>
        <button className={`riders-tab-btn ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
          ✅ Completed {completedOrders.length > 0 && <span className="riders-tab-badge ar-badge-green">{completedOrders.length}</span>}
        </button>
      </div>

      {/* ── Active Tab ── */}
      {tab === 'delivery' && (
        activeOrders.length === 0
          ? <div className="ar-empty"><div className="ar-empty-icon">📭</div><p>No active deliveries.</p><span>Confirmed orders appear here.</span></div>
          : <div className="ar-orders-list">
              {activeOrders.map(o => (
                <ActiveOrderCard
                  key={o._id} order={o}
                  savingRider={!!savingRider[o.orderId]} savedRider={!!savedRider[o.orderId]}
                  savingGps={!!savingGps[o.orderId]}     savedGps={!!savedGps[o.orderId]}
                  copiedLink={!!copiedLink[o.orderId]}   collapsed={!!collapsed[o.orderId]}
                  notifying={!!notifying[o.orderId]}     notified={!!notified[o.orderId]}
                  onSaveRider={handleSaveRider}          onSaveGps={handleSaveGps}
                  onCopyLink={handleCopyLink}            onToggleCollapse={handleToggleCollapse}
                  onShareOrder={setShareOrder}           onOpenMap={openMap}
                  onNotifyCustomer={handleNotifyCustomer}
                />
              ))}
            </div>
      )}

      {/* ── Completed Tab ── */}
      {tab === 'completed' && (
        completedOrders.length === 0
          ? <div className="ar-empty"><div className="ar-empty-icon">✅</div><p>No completed deliveries yet.</p></div>
          : <div className="ar-orders-list">
              {completedOrders.map(o => (
                <CompletedOrderCard key={o._id} order={o} onRemove={setRemoveTarget} />
              ))}
            </div>
      )}

      {/* ── Modals ── */}
      {shareOrder    && <ShareModal order={shareOrder} onClose={() => setShareOrder(null)} />}
      {selectedRider && <RiderDetailModal rider={selectedRider} onClose={() => setSelectedRider(null)} />}
      {removeTarget  && <RemoveConfirmModal order={removeTarget} onConfirm={confirmRemove} onClose={() => setRemoveTarget(null)} />}
      {mapOrder      && (
        <LiveMapModal
          orderId={mapOrder.orderId} order={mapOrder}
          onClose={() => { setMapOrder(null); setMapFullscreen(false); }}
          fullscreen={mapFullscreen}
        />
      )}
    </div>
  );
};

export default AdminRiders;
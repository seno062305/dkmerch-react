// src/admin/AdminRiders.jsx
import React, { useState, useRef, useEffect } from 'react';
import './AdminRiders.css';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';

const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://dkmerchwebsite.vercel.app';
const getRiderLink    = (orderId) => `${SITE_URL}/rider-track/${orderId}`;
const getCustomerLink = (orderId) => `${SITE_URL}/track-order?order=${orderId}`;

const toDateStr = (ms) => new Date(ms).toISOString().split('T')[0];
const todayStr  = toDateStr(Date.now());

const timeAgo = (ts) => {
  if (!ts) return 'unknown';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10)   return 'just now';
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const REJECT_REASONS = [
  { value: 'incomplete_documents', label: 'Incomplete Documents',     hint: 'Missing required IDs or photos' },
  { value: 'invalid_license',      label: 'Invalid License',          hint: 'License number is invalid or unverifiable' },
  { value: 'invalid_plate',        label: 'Invalid Plate Number',     hint: 'Plate number cannot be verified' },
  { value: 'failed_verification',  label: 'Failed Identity Check',    hint: 'Could not verify applicant identity' },
  { value: 'area_unavailable',     label: 'Area Not Covered',         hint: 'Delivery area not yet available' },
  { value: 'other',                label: 'Other Reason',             hint: 'Specify in the note below' },
];

// ─────────────────────────────────────────────────────────────
// SECTION 1: Rider Applications
// ─────────────────────────────────────────────────────────────
const RiderIdCardModal = ({ rider, onClose }) => {
  const cardRef = useRef();
  const handlePrint = () => {
    const printContent = cardRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=500,height=320');
    win.document.write(`<html><head><title>DKMerch Rider ID</title><style>body{margin:0;padding:20px;font-family:'Segoe UI',sans-serif;background:#f0f0f0;}.dk-id-card{width:380px;min-height:220px;background:linear-gradient(135deg,#fc1268,#e0005a);border-radius:16px;padding:20px;color:white;box-shadow:0 8px 32px rgba(252,18,104,0.4);position:relative;overflow:hidden;}</style></head><body>${printContent}</body></html>`);
    win.document.close(); win.focus(); win.print(); win.close();
  };
  return (
    <div className="id-card-overlay" onClick={onClose}>
      <div className="id-card-modal" onClick={(e) => e.stopPropagation()}>
        <button className="id-card-close" onClick={onClose}>✕</button>
        <h3 className="id-card-modal-title">🎉 Rider Approved!</h3>
        <p className="id-card-modal-sub">DKMerch Rider ID has been generated.</p>
        <div ref={cardRef}>
          <div className="dk-id-card">
            <div className="dk-id-bg-circle1" /><div className="dk-id-bg-circle2" />
            <div className="dk-id-header"><span className="dk-id-logo">🛵</span><div><div className="dk-id-brand">DKMerch</div><div className="dk-id-brand-sub">Official Delivery Rider</div></div></div>
            <div className="dk-id-body">
              {rider.riderPhoto ? <img src={rider.riderPhoto} alt="Rider" className="dk-id-photo" /> : <div className="dk-id-photo-placeholder">👤</div>}
              <div className="dk-id-info">
                <div className="dk-id-name">{rider.fullName}</div>
                <div className="dk-id-role">Delivery Rider</div>
                <div className="dk-id-details">
                  <div className="dk-id-detail">📞 {rider.phone}</div>
                  <div className="dk-id-detail">✉️ {rider.email}</div>
                  <div className="dk-id-detail" style={{ textTransform: 'capitalize' }}>🛵 {rider.vehicleType || '—'} {rider.plateNumber ? `• ${rider.plateNumber}` : ''}</div>
                </div>
              </div>
            </div>
            <div className="dk-id-footer">
              <div><div className="dk-id-number">{rider.dkRiderId}</div><div className="dk-id-number-label">Rider ID</div></div>
              <div className="dk-id-valid">Issued: {rider.dkRiderIdGeneratedAt ? new Date(rider.dkRiderIdGeneratedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
        </div>
        <div className="id-card-actions">
          <button className="id-card-print-btn" onClick={handlePrint}>🖨️ Print ID Card</button>
          <button className="id-card-done-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
};

const ApplicationDetailModal = ({ app, onClose, onApprove, onRejectWithReason }) => {
  const [viewImg, setViewImg] = useState(null);
  return (
    <div className="id-card-overlay" onClick={onClose}>
      <div className="app-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button className="id-card-close" onClick={onClose}>✕</button>
        <h3 className="app-detail-title">📋 Application Details</h3>
        <div className="app-detail-section">
          <div className="app-detail-grid">
            <div><span className="app-detail-label">Full Name</span><span className="app-detail-value">{app.fullName}</span></div>
            <div><span className="app-detail-label">Email</span><span className="app-detail-value">{app.email}</span></div>
            <div><span className="app-detail-label">Phone</span><span className="app-detail-value">{app.phone}</span></div>
            <div><span className="app-detail-label">Address</span><span className="app-detail-value">{app.address || '—'}</span></div>
            <div><span className="app-detail-label">Vehicle</span><span className="app-detail-value" style={{ textTransform: 'capitalize' }}>{app.vehicleType || '—'}</span></div>
            <div><span className="app-detail-label">Plate No.</span><span className="app-detail-value">{app.plateNumber || '—'}</span></div>
            <div><span className="app-detail-label">License No.</span><span className="app-detail-value">{app.licenseNumber || '—'}</span></div>
            <div><span className="app-detail-label">Applied</span><span className="app-detail-value">{app.appliedAt ? new Date(app.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</span></div>
          </div>
        </div>
        <div className="app-detail-photos-header">📸 Submitted Photos</div>
        <div className="app-detail-photos">
          {[{ key: 'riderPhoto', label: '🤳 Selfie' }, { key: 'validId1', label: '🪪 Valid ID #1' }, { key: 'validId2', label: '🪪 Valid ID #2' }].map(({ key, label }) => (
            <div key={key} className="app-photo-box">
              <div className="app-photo-label">{label}</div>
              {app[key] ? <img src={app[key]} alt={label} className="app-photo-img" onClick={() => setViewImg(app[key])} title="Click to enlarge" /> : <div className="app-photo-missing">No photo submitted</div>}
            </div>
          ))}
        </div>
        <div className="app-detail-actions">
          <button className="riders-btn approve" onClick={() => { onClose(); onApprove(app); }}>✅ Approve</button>
          <button className="riders-btn reject" onClick={() => { onClose(); onRejectWithReason(app); }}>❌ Reject</button>
        </div>
      </div>
      {viewImg && (<div className="img-viewer-overlay" onClick={() => setViewImg(null)}><img src={viewImg} alt="ID" className="img-viewer-img" /><div className="img-viewer-hint">Tap anywhere to close</div></div>)}
    </div>
  );
};

const RejectApplicationModal = ({ app, onConfirm, onClose }) => {
  const [reason, setReason] = useState('');
  const [note,   setNote]   = useState('');
  return (
    <div className="id-card-overlay" onClick={onClose}>
      <div className="app-detail-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <button className="id-card-close" onClick={onClose}>✕</button>
        <h3 className="app-detail-title" style={{ color: '#dc2626' }}>❌ Reject Application</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
          <i className="fas fa-motorcycle" style={{ fontSize: 28, color: '#fc1268' }}></i>
          <div><div style={{ fontWeight: 700, color: '#1a1f36', fontSize: 15 }}>{app.fullName}</div><div style={{ fontSize: 12, color: '#6b7280' }}>{app.email}</div></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#374151', marginBottom: 8, fontSize: 13 }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#dc2626' }}></i> Reason for Rejection <span style={{ color: '#dc2626' }}>*</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {REJECT_REASONS.map(r => (
              <button key={r.value} type="button" onClick={() => setReason(r.value)}
                style={{ padding: '10px 12px', border: `2px solid ${reason === r.value ? 'transparent' : '#e2e8f0'}`, borderRadius: 10, background: reason === r.value ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : 'white', color: reason === r.value ? 'white' : '#4a5568', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', display: 'flex', flexDirection: 'column', gap: 2, boxShadow: reason === r.value ? '0 3px 10px rgba(220,38,38,0.3)' : 'none' }}>
                <span style={{ fontWeight: 700, fontSize: 12 }}>{r.label}</span>
                <span style={{ fontSize: 10, opacity: 0.75 }}>{r.hint}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: '#374151', marginBottom: 8, fontSize: 13 }}>
            <i className="fas fa-sticky-note" style={{ color: '#6b7280' }}></i> Additional Note <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
          </label>
          <textarea style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} placeholder="e.g. Please resubmit with a clearer photo of your license..." value={note} onChange={e => setNote(e.target.value)} rows={2} />
        </div>
        {reason && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
            <i className="fas fa-envelope" style={{ marginTop: 2, flexShrink: 0 }}></i>
            <span>An email notification will be sent to <strong>{app.email}</strong> with the rejection reason.</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', background: '#e2e8f0', color: '#4a5568', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={() => reason && onConfirm(app._id, app.fullName, reason, note)} disabled={!reason}
            style={{ padding: '10px 20px', background: reason ? 'linear-gradient(135deg,#dc2626,#b91c1c)' : '#e2e8f0', color: reason ? 'white' : '#9ca3af', border: 'none', borderRadius: 10, fontWeight: 700, cursor: reason ? 'pointer' : 'not-allowed', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fas fa-times-circle"></i> Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION 2: Delivery Management helpers
// ─────────────────────────────────────────────────────────────
const StatusBadge = ({ order }) => {
  const s = (order.orderStatus || order.status || '').toLowerCase();
  const map = {
    confirmed:        { label: '✅ Confirmed',       bg: '#059669' },
    processing:       { label: '⚙️ Processing',       bg: '#6366f1' },
    shipped:          { label: '📦 Shipped',          bg: '#0ea5e9' },
    out_for_delivery: { label: '🚚 Out for Delivery', bg: '#f59e0b' },
    completed:        { label: '✅ Delivered',        bg: '#16a34a' },
    delivered:        { label: '✅ Delivered',        bg: '#16a34a' },
  };
  const m = map[s];
  return m
    ? <span className="ar-status-badge" style={{ background: m.bg }}>{m.label}</span>
    : <span className="ar-status-badge" style={{ background: '#6b7280' }}>{order.orderStatus || order.status}</span>;
};

const LiveBadge = ({ orderId }) => {
  const loc = useQuery(api.riders.getRiderLocation, { orderId });
  if (!loc?.isTracking || (Date.now() - loc.updatedAt) >= 60000) return null;
  return (
    <span className="ar-live-indicator">
      <span className="ar-gps-live-dot" style={{ width: 7, height: 7 }} />Live
    </span>
  );
};

const NotificationBell = () => {
  const [open, setOpen]   = useState(false);
  const dropdownRef       = useRef(null);
  const notifications     = useQuery(api.riderNotifications.getRecent)  ?? [];
  const unread            = useQuery(api.riderNotifications.getUnread)   ?? [];
  const markAllRead       = useMutation(api.riderNotifications.markAllRead);
  const clearAll          = useMutation(api.riderNotifications.clearAll);
  const unreadCount       = unread.length;
  const handleOpen = async () => { setOpen(o => !o); if (!open && unreadCount > 0) await markAllRead().catch(() => {}); };
  const timeAgoStr = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now'; if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago`;
  };
  return (
    <div className="ar-bell-wrap" ref={dropdownRef}>
      <button className="ar-bell-btn" onClick={handleOpen} title="Rider notifications">
        🔔 {unreadCount > 0 && <span className="ar-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="ar-bell-dropdown">
          <div className="ar-bell-header">
            <span className="ar-bell-title">🛵 Rider Notifications</span>
            <div className="ar-bell-header-actions">
              {notifications.length > 0 && <button className="ar-bell-clear" onClick={async () => { await clearAll().catch(() => {}); }}>Clear all</button>}
              <button className="ar-bell-close" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>
          <div className="ar-bell-list">
            {notifications.length === 0 ? (
              <div className="ar-bell-empty"><span>🔕</span><span>No notifications yet</span></div>
            ) : (
              notifications.map(n => (
                <div key={n._id} className={`ar-bell-item ${!n.read ? 'ar-bell-item--unread' : ''}`}>
                  <div className="ar-bell-item-icon">{n.type === 'rider_link_reopened' ? '🔄' : '🛵'}</div>
                  <div className="ar-bell-item-body">
                    <div className="ar-bell-item-msg">{n.message || `Rider opened link for Order #${n.orderId?.slice(-8).toUpperCase()}`}</div>
                    <div className="ar-bell-item-time">{timeAgoStr(n.createdAt)}</div>
                  </div>
                  {!n.read && <span className="ar-bell-unread-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const LiveMapModal = ({ orderId, order, onClose, fullscreen = false }) => {
  const mapRef             = useRef(null);
  const mapObjRef          = useRef(null);
  const markerRef          = useRef(null);
  const lastKnownMarkerRef = useRef(null);
  const circleRef          = useRef(null);
  const routeLineRef       = useRef(null);
  const destMarkerRef      = useRef(null);
  const routeAbortRef      = useRef(null);
  const routeTimerRef      = useRef(null);
  const lastPlottedRef     = useRef({ lat: null, lng: null });
  const [leafletReady, setLeafletReady] = useState(!!window.L);
  const [lastUpdate,   setLastUpdate]   = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(fullscreen);
  const [sidebarWidth, setSidebarWidth] = useState(0);

  useEffect(() => {
    const measure = () => { const sidebar = document.querySelector('.admin-sidebar') || document.querySelector('aside') || document.querySelector('[class*="sidebar"]'); if (sidebar) setSidebarWidth(sidebar.getBoundingClientRect().width); };
    measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure);
  }, []);

  const location   = useQuery(api.riders.getRiderLocation, { orderId });
  const isLive     = !!(location?.isTracking && location?.updatedAt && (Date.now() - location.updatedAt) < 30000);
  const hasLoc     = !!(location?.lat && location?.lng && location.lat !== 0 && location.lng !== 0);
  const hasLastKnown = !!(location?.lastKnownLat && location?.lastKnownLng);

  useEffect(() => {
    const scrollY = window.scrollY; document.body.classList.add('ar-map-open'); document.body.style.top = `-${scrollY}px`;
    return () => { document.body.classList.remove('ar-map-open'); document.body.style.top = ''; window.scrollTo(0, scrollY); };
  }, []);

  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link);
    const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = () => setLeafletReady(true); document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapObjRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    const destLat = order?.addressLat || null; const destLng = order?.addressLng || null;
    if (destLat && destLng) {
      map.setView([destLat, destLng], 15);
      const destIcon = L.divIcon({ html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#fc1268,#e0005a);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">📍</div>`, className: '', iconSize: [40, 40], iconAnchor: [20, 40] });
      const dm = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
      dm.bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`).openPopup();
      destMarkerRef.current = dm;
    } else { map.setView([14.5995, 120.9842], 12); }
    mapObjRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  useEffect(() => { if (mapObjRef.current) setTimeout(() => { try { mapObjRef.current.invalidateSize(); } catch {} }, 150); }, [isFullscreen]);

  const clearRoute = () => {
    if (routeLineRef.current) { if (Array.isArray(routeLineRef.current)) { routeLineRef.current.forEach(l => { try { l.remove(); } catch {} }); } else { try { routeLineRef.current.remove(); } catch {} } routeLineRef.current = null; }
  };

  const drawRoute = (lat, lng, destLat, destLng, dashed = false) => {
    if (routeAbortRef.current) { routeAbortRef.current.abort(); routeAbortRef.current = null; }
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    routeTimerRef.current = setTimeout(async () => {
      if (!mapObjRef.current || !window.L) return;
      const L = window.L; const map = mapObjRef.current; clearRoute();
      if (dashed) { try { routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#9ca3af', weight: 3, opacity: 0.75, dashArray: '8, 8' }).addTo(map); map.fitBounds(L.latLngBounds([lat, lng], [destLat, destLng]), { padding: [48, 48], maxZoom: 17 }); } catch {} return; }
      const controller = new AbortController(); routeAbortRef.current = controller;
      try {
        const url = `https://router.project-osrm.org/route/v1/bike/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal }); const data = await res.json();
        if (!mapObjRef.current || controller.signal.aborted) return;
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const coords = data.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
          const outline = L.polyline(coords, { color: 'white', weight: 7, opacity: 0.6 }).addTo(map);
          const line    = L.polyline(coords, { color: '#e53e3e', weight: 4.5, opacity: 0.92 }).addTo(map);
          routeLineRef.current = [outline, line]; map.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 17 });
        } else { throw new Error('no route'); }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        try { const dLat = order?.addressLat, dLng = order?.addressLng; if (dLat && dLng) { routeLineRef.current = window.L.polyline([[lat, lng], [dLat, dLng]], { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }).addTo(mapObjRef.current); mapObjRef.current.fitBounds(window.L.latLngBounds([lat, lng], [dLat, dLng]), { padding: [48, 48], maxZoom: 17 }); } } catch {}
      } finally { if (routeAbortRef.current === controller) routeAbortRef.current = null; }
    }, 600);
  };

  useEffect(() => {
    if (!mapObjRef.current || !window.L) return;
    const L = window.L; const map = mapObjRef.current;
    const destLat = order?.addressLat; const destLng = order?.addressLng;
    if (isLive && hasLoc) {
      const { lat, lng, accuracy, updatedAt } = location;
      const prev = lastPlottedRef.current; if (prev.lat === lat && prev.lng === lng) return;
      lastPlottedRef.current = { lat, lng };
      if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} lastKnownMarkerRef.current = null; }
      if (!markerRef.current) {
        const riderIcon = L.divIcon({ html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#fc1268,#e0005a);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.55);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>`, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
        markerRef.current = L.marker([lat, lng], { icon: riderIcon }).addTo(map); markerRef.current.bindPopup(`<b>🛵 ${order.riderInfo?.name || 'Rider'}</b><br>📍 Live location`);
      } else { try { markerRef.current.setLatLng([lat, lng]); } catch {} }
      if (circleRef.current) { try { circleRef.current.remove(); } catch {} circleRef.current = null; }
      if (accuracy) { try { circleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#fc1268', fillColor: '#fc1268', fillOpacity: 0.07, weight: 1.5 }).addTo(map); } catch {} }
      if (destLat && destLng) { drawRoute(lat, lng, destLat, destLng, false); } else { try { map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { animate: true, duration: 1 }); } catch {} }
      setLastUpdate(new Date(updatedAt)); return;
    }
    if (!isLive && hasLastKnown) {
      const { lastKnownLat, lastKnownLng, lastKnownAt, lastKnownAddress } = location;
      if (markerRef.current) { try { markerRef.current.setOpacity(0); } catch {} }
      if (circleRef.current) { try { circleRef.current.remove(); } catch {} circleRef.current = null; }
      const ghostIcon = L.divIcon({ className: '', html: `<div style="position:relative;width:40px;height:40px;"><div style="width:40px;height:40px;background:linear-gradient(135deg,#6b7280,#9ca3af);border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:20px;opacity:0.88;">🛵</div><div style="position:absolute;top:-5px;right:-5px;background:#f59e0b;color:white;border-radius:50%;width:17px;height:17px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;">!</div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
      const lastTimeStr = lastKnownAt ? new Date(lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
      if (!lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current = L.marker([lastKnownLat, lastKnownLng], { icon: ghostIcon }).addTo(map).bindPopup(`<div style="min-width:160px"><strong>🛵 ${order.riderInfo?.name || 'Rider'}</strong><br><span style="color:#f59e0b;font-weight:600;font-size:12px">⚠️ Last seen ${lastTimeStr}</span>${lastKnownAddress ? `<br><span style="color:#6b7280;font-size:11px">📍 ${lastKnownAddress}</span>` : ''}</div>`); } catch {} }
      else { try { lastKnownMarkerRef.current.setLatLng([lastKnownLat, lastKnownLng]); lastKnownMarkerRef.current.setIcon(ghostIcon); } catch {} }
      if (destLat && destLng) { drawRoute(lastKnownLat, lastKnownLng, destLat, destLng, true); } else { try { map.panTo([lastKnownLat, lastKnownLng]); } catch {} }
      if (lastKnownAt) setLastUpdate(new Date(lastKnownAt));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, isLive, hasLoc, hasLastKnown]);

  useEffect(() => () => {
    if (routeAbortRef.current) { routeAbortRef.current.abort(); }
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} }
    if (mapObjRef.current) { try { mapObjRef.current.remove(); } catch {} mapObjRef.current = null; }
  }, []);

  const lastKnownTimeStr = location?.lastKnownAt ? new Date(location.lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : null;
  const overlayClass = isFullscreen ? 'ar-modal-overlay ar-map-overlay ar-overlay--full' : 'ar-modal-overlay ar-map-overlay';
  return (
    <div className={overlayClass} style={isFullscreen && sidebarWidth > 0 ? { left: sidebarWidth, width: `calc(100vw - ${sidebarWidth}px)` } : {}} onClick={onClose}>
      <div className={`ar-map-modal ${isFullscreen ? 'ar-map-modal--full' : ''}`}
        style={isFullscreen ? { display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', ...(sidebarWidth > 0 ? { position: 'fixed', top: 0, left: sidebarWidth, width: `calc(100vw - ${sidebarWidth}px)`, maxWidth: `calc(100vw - ${sidebarWidth}px)` } : {}) } : {}}
        onClick={e => e.stopPropagation()}>
        <div className="ar-map-header" style={{ flexShrink: 0 }}>
          <div className="ar-map-title-row"><span className="ar-map-title">📍 Live Rider Location</span><span className="ar-map-order-id">#{orderId?.slice(-8).toUpperCase()}</span></div>
          <div className="ar-map-header-right">
            {isLive ? <div className="ar-map-live-badge"><span className="ar-gps-live-dot" />Live · {lastUpdate?.toLocaleTimeString()}</div>
              : hasLastKnown ? <div className="ar-map-stale-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>⚠️ Offline · Last seen {lastKnownTimeStr || 'unknown'}</div>
              : !location ? <div className="ar-map-waiting-badge">⏳ Waiting for rider…</div>
              : <div className="ar-map-stale-badge">⏸ {lastUpdate?.toLocaleTimeString() || '—'}</div>}
            <button className="ar-map-fullscreen-btn" onClick={() => setIsFullscreen(f => !f)}>{isFullscreen ? '⛶ Exit' : '⛶ Full'}</button>
            <button className="ar-modal-close ar-modal-close--map" onClick={onClose}>✕</button>
          </div>
        </div>
        <div ref={mapRef} className="ar-map-container" style={isFullscreen ? { flex: '1 1 auto', height: 'auto', minHeight: 0 } : {}} />
        {!location && <div className="ar-map-waiting-overlay" style={{ flexShrink: 0 }}><span className="ar-gps-live-dot" style={{ background: '#f59e0b' }} /><span>Waiting for rider GPS…</span></div>}
        {!isLive && hasLastKnown && <div className="ar-map-offline-bar"><span style={{ fontSize: 14 }}>⚠️</span><span><strong>Rider offline</strong> · Last known {lastKnownTimeStr} ({timeAgo(location?.lastKnownAt)}){location?.lastKnownAddress && <> · <strong>📍 {location.lastKnownAddress}</strong></>}</span></div>}
        {isLive && hasLoc && <div className="ar-map-info-bar" style={{ flexShrink: 0 }}><span>🛵 {order.riderInfo?.name || 'Rider'}</span><span>📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>{location.speed > 0 && <span>🚀 {(location.speed * 3.6).toFixed(1)} km/h</span>}<span style={{ color: '#e53e3e', fontWeight: 700 }}>━━ Route</span></div>}
      </div>
    </div>
  );
};

const RemoveConfirmModal = ({ order, onConfirm, onClose }) => (
  <div className="ar-modal-overlay" onClick={onClose}>
    <div className="ar-confirm-modal" onClick={e => e.stopPropagation()}>
      <button className="ar-modal-close" onClick={onClose}>✕</button>
      <div className="ar-confirm-icon">🗑️</div>
      <h3 className="ar-modal-title">Remove Order?</h3>
      <p className="ar-confirm-desc">Aalisin sa list ang <strong>#{order.orderId?.slice(-8).toUpperCase()}</strong>. Hindi mabubura sa database.</p>
      <div className="ar-confirm-actions">
        <button className="ar-btn ar-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="ar-btn ar-btn-danger" onClick={onConfirm}>Remove</button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Active Order Card — no OTP block for privacy
// ─────────────────────────────────────────────────────────────
const ActiveOrderCard = ({
  order, savingGps, savedGps,
  collapsed,
  onSaveGps, onToggleCollapse,
  onOpenMap,
}) => {
  const { orderId } = order;
  const [gps, setGps] = useState(order.riderGpsLink || '');
  useEffect(() => { setGps(order.riderGpsLink || ''); }, [order.riderGpsLink]);

  const pickupReq = order._pickupReq || {};
  const _riderBase = order.riderInfo || {};
  const riderInfo = {
    name:    pickupReq.riderName    || _riderBase.name    || '',
    phone:   pickupReq.riderPhone   || _riderBase.phone   || '',
    plate:   pickupReq.riderPlate   || _riderBase.plate   || '',
    vehicle: pickupReq.riderVehicle || '',
  };
  const hasRiderInfo    = !!(riderInfo.name?.trim());
  const alreadyNotified = (order.orderStatus || '').toLowerCase() === 'out_for_delivery'
    || pickupReq.status === 'out_for_delivery';

  return (
    <div className={`ar-order-card ${collapsed ? 'ar-card-collapsed' : ''}`}>
      <div className="ar-order-header">
        <div className="ar-order-id-block">
          <span className="ar-order-id">#{orderId?.slice(-8).toUpperCase()}</span>
          <StatusBadge order={order} />
          <LiveBadge orderId={orderId} />
        </div>
        <div className="ar-header-actions">
          <button className="ar-collapse-btn" onClick={() => onToggleCollapse(orderId)}>{collapsed ? '▼' : '▲'}</button>
        </div>
      </div>

      {collapsed && (
        <div className="ar-collapsed-summary">
          <span className="ar-cs-name">{order.customerName || '—'}</span><span className="ar-cs-sep">·</span>
          <span className="ar-cs-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span>
          {riderInfo.name && (<><span className="ar-cs-sep">·</span><span className="ar-cs-rider">🛵 {riderInfo.name}</span></>)}
        </div>
      )}

      {!collapsed && (
        <div className="ar-order-body">
          {/* Customer */}
          <div className="ar-section">
            <div className="ar-section-title">👤 Customer</div>
            <div className="ar-compact-row"><span className="ar-cl">Name</span><span className="ar-cv">{order.customerName || '—'}</span></div>
            <div className="ar-compact-row"><span className="ar-cl">Phone</span><span className="ar-cv">{order.phone || '—'}</span></div>
            <div className="ar-compact-row"><span className="ar-cl">Total</span><span className="ar-cv ar-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span></div>
          </div>

          {/* Rider info — read only */}
          <div className="ar-section">
            <div className="ar-section-title">
              🛵 Assigned Rider
              {hasRiderInfo
                ? <span className="ar-rider-locked-badge" style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' }}>✅ From Rider App</span>
                : <span className="ar-rider-locked-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>⏳ Awaiting rider</span>}
            </div>
            {hasRiderInfo ? (
              <div className="ar-rider-locked-view">
                <div className="ar-rider-locked-row"><span className="ar-cl">Name</span><span className="ar-cv ar-locked-value">{riderInfo.name}</span></div>
                <div className="ar-rider-locked-row"><span className="ar-cl">Phone</span><span className="ar-cv ar-locked-value">{riderInfo.phone || '—'}</span></div>
                {riderInfo.vehicle && <div className="ar-rider-locked-row"><span className="ar-cl">Vehicle</span><span className="ar-cv ar-locked-value" style={{textTransform:'capitalize'}}>{riderInfo.vehicle}</span></div>}
                {riderInfo.plate && <div className="ar-rider-locked-row"><span className="ar-cl">Plate</span><span className="ar-cv ar-locked-plate">{riderInfo.plate}</span></div>}
              </div>
            ) : (
              <div className="ar-rider-waiting-notice">
                <i className="fas fa-info-circle"></i>
                <span>Rider info will appear here once a rider accepts this order from the <strong>Rider Dashboard</strong>.</span>
              </div>
            )}
          </div>

          {/* Notify notice — OTP hidden for customer privacy */}
          <div className="ar-notify-section">
            {alreadyNotified ? (
              <div className="ar-notify-done">
                <span>✅ Customer notified — Out for Delivery</span>
              </div>
            ) : (
              <div className="ar-rider-waiting-notice" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e' }}>
                <i className="fas fa-bell"></i>
                <span>The rider will automatically notify the customer when they accept this delivery in the <strong>Rider Dashboard</strong>.</span>
              </div>
            )}
          </div>

          {/* GPS Tracking — map buttons only */}
          <div className="ar-section ar-section-full ar-gps-compact">
            <div className="ar-section-title">📍 GPS Tracking</div>
            <div className="ar-map-btn-row">
              <button className="ar-track-map-btn" onClick={() => onOpenMap(order, false)}>🗺️ Live Map</button>
              <button className="ar-track-map-btn ar-track-map-btn--full" onClick={() => onOpenMap(order, true)}>⛶ Full Map</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const CompletedOrderCard = ({ order, onRemove }) => {
  const riderInfo   = order.riderInfo || {};
  const deliveredAt = order.deliveryConfirmedAt
    ? new Date(order.deliveryConfirmedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  return (
    <div className="ar-order-card ar-completed-card">
      <div className="ar-order-header ar-completed-header">
        <div className="ar-order-id-block"><span className="ar-order-id">#{order.orderId?.slice(-8).toUpperCase()}</span><StatusBadge order={order} /></div>
        <button className="ar-remove-btn" onClick={() => onRemove(order)} title="Remove">🗑️</button>
      </div>
      <div className="ar-completed-body">
        <div className="ar-completed-row"><span className="ar-info-label">Customer</span><span className="ar-info-value">{order.customerName || '—'}</span></div>
        <div className="ar-completed-row"><span className="ar-info-label">Total</span><span className="ar-info-value ar-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span></div>
        {riderInfo.name && <div className="ar-completed-row"><span className="ar-info-label">Rider</span><span className="ar-info-value">🛵 {riderInfo.name}{riderInfo.plate ? ` · ${riderInfo.plate}` : ''}</span></div>}
        {deliveredAt && <div className="ar-completed-row"><span className="ar-info-label">Delivered</span><span className="ar-info-value ar-delivered-time">✅ {deliveredAt}</span></div>}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const AdminRiders = () => {
  const [selectedApp,    setSelectedApp]    = useState(null);
  const [approvedRider,  setApprovedRider]  = useState(null);
  const [rejectTarget,   setRejectTarget]   = useState(null);
  const [removeTarget,   setRemoveTarget]   = useState(null);
  const [mapOrder,       setMapOrder]       = useState(null);
  const [mapFullscreen,  setMapFullscreen]  = useState(false);
  const [collapsed,      setCollapsed]      = useState({});
  const [hiddenCompleted, setHiddenCompleted] = useState([]);
  const [savingGps,      setSavingGps]      = useState({});
  const [savedGps,       setSavedGps]       = useState({});
  const [tab, setTab] = useState('applications');

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const clearDateFilter = () => { setStartDate(''); setEndDate(''); };

  const allRiders         = useQuery(api.riders.getAllRiders)                ?? [];
  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const allOrders         = useQuery(api.orders.getAllOrders)                 ?? [];

  const approveRiderMutation      = useMutation(api.riders.approveRider);
  const updateRiderStatusMutation = useMutation(api.riders.updateRiderStatus);
  const deleteRiderMutation       = useMutation(api.riders.deleteRider);
  const approvePickupMutation     = useMutation(api.pickupRequests.approvePickupRequest);
  const rejectPickupMutation      = useMutation(api.pickupRequests.rejectPickupRequest);
  const updateFields              = useMutation(api.orders.updateOrderFields);
  const sendRiderApprovedEmailAction = useAction(api.sendEmail.sendRiderApprovedEmail);
  const sendRiderRejectedEmailAction = useAction(api.sendEmail.sendRiderRejectedEmail);

  const applications   = allRiders.filter(r => r.status === 'pending');
  const approvedRiders = allRiders.filter(r => r.status === 'approved');
  const pendingPickups = allPickupRequests.filter(p => p.status === 'pending');
  const completedStatuses = ['completed', 'delivered'];

  const matchesDateFilter = (order) => {
    if (!startDate && !endDate) return true;
    const ts = order._creationTime || order.createdAt || 0;
    const d  = new Date(ts);
    if (startDate) { const s = new Date(startDate); s.setHours(0,0,0,0); if (d < s) return false; }
    if (endDate)   { const e = new Date(endDate);   e.setHours(23,59,59,999); if (d > e) return false; }
    return true;
  };

  const activeDeliveryItems = allPickupRequests
    .filter(req => req.status === 'approved' || req.status === 'out_for_delivery')
    .map(req => {
      const order = allOrders.find(o => o.orderId === req.orderId);
      if (!order) return null;
      return { ...order, riderInfo: { name: req.riderName || '', phone: req.riderPhone || '', plate: req.riderPlate || '', email: req.riderEmail || '' }, _pickupReq: req };
    })
    .filter(Boolean)
    .filter(o => matchesDateFilter(o))
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const activeOrders = activeDeliveryItems;

  const completedOrders = allOrders
    .filter(o => completedStatuses.includes((o.orderStatus || o.status || '').toLowerCase()))
    .filter(o => !hiddenCompleted.includes(o._id))
    .filter(o => matchesDateFilter(o))
    .sort((a, b) => (b.deliveryConfirmedAt || b._creationTime || 0) - (a.deliveryConfirmedAt || a._creationTime || 0));

  const handleApproveRider = async (app) => {
    const confirmed = window.confirm(`Approve "${app.fullName}" as a rider?\n\nEmail: ${app.email}\nVehicle: ${app.vehicleType || 'N/A'}`);
    if (!confirmed) return;
    try {
      const result = await approveRiderMutation({ id: app._id });
      try { await sendRiderApprovedEmailAction({ to: app.email, riderName: app.fullName, dkRiderId: result.dkRiderId, email: app.email, vehicleType: app.vehicleType, plateNumber: app.plateNumber }); } catch (emailErr) { console.error('Approval email failed:', emailErr); }
      setApprovedRider({ ...app, dkRiderId: result.dkRiderId, dkRiderIdGeneratedAt: new Date().toISOString() });
    } catch (err) { console.error(err); alert('Failed to approve rider.'); }
  };

  const handleRejectWithReason = (app) => setRejectTarget(app);

  const handleConfirmReject = async (id, name, reason, note) => {
    try {
      await deleteRiderMutation({ id });
      const app = allRiders.find(r => r._id === id);
      if (app?.email) { try { await sendRiderRejectedEmailAction({ to: app.email, riderName: app.fullName, reason, note: note || undefined }); } catch (emailErr) { console.error('Rejection email failed:', emailErr); } }
      setRejectTarget(null);
    } catch (err) { console.error(err); alert('Failed to reject rider.'); }
  };

  const handleRevokeRider = async (id, name) => {
    const confirmed = window.confirm(`Revoke approval for "${name}"?`);
    if (!confirmed) return;
    try { await updateRiderStatusMutation({ id, status: 'pending' }); } catch (err) { console.error(err); }
  };

  const approvePickup = async (requestId, riderName) => {
    if (!window.confirm(`Approve pickup request for rider "${riderName}"?`)) return;
    try { await approvePickupMutation({ requestId }); alert(`✅ Pickup approved for ${riderName}!`); }
    catch (err) { console.error(err); alert('Failed to approve pickup.'); }
  };

  const rejectPickup = async (requestId) => {
    if (!window.confirm('Reject this pickup request?')) return;
    try { await rejectPickupMutation({ requestId }); } catch (err) { console.error(err); }
  };

  const handleSaveGps = async (orderId, gpsValue) => {
    setSavingGps(p => ({ ...p, [orderId]: true }));
    try { await updateFields({ orderId, riderGpsLink: gpsValue ?? '' }); setSavedGps(p => ({ ...p, [orderId]: true })); setTimeout(() => setSavedGps(p => ({ ...p, [orderId]: false })), 2000); }
    catch (e) { console.error(e); } finally { setSavingGps(p => ({ ...p, [orderId]: false })); }
  };

  const handleToggleCollapse = (orderId) => setCollapsed(p => ({ ...p, [orderId]: !p[orderId] }));
  const confirmRemove        = ()         => { if (!removeTarget) return; setHiddenCompleted(p => [...p, removeTarget._id]); setRemoveTarget(null); };
  const openMap              = (order, full = false) => { setMapOrder(order); setMapFullscreen(full); };

  const getPickupStatusColor = (status) => ({ pending: '#ffc107', approved: '#28a745', rejected: '#dc3545', out_for_delivery: '#6366f1', completed: '#059669' }[status] || '#6c757d');
  const getPickupStatusLabel = (status) => ({ pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected', out_for_delivery: '🚚 Out for Delivery', completed: '🎉 Delivered' }[status] || status);

  const DateFilter = () => (
    <div className="ar-date-filter">
      <div className="ar-date-filter-inputs">
        <div className="ar-date-filter-item">
          <label htmlFor="arStart"><i className="fas fa-calendar"></i></label>
          <input type="date" id="arStart" value={startDate} max={endDate || todayStr} onChange={e => setStartDate(e.target.value)} />
        </div>
        <span className="ar-date-filter-sep">to</span>
        <div className="ar-date-filter-item">
          <label htmlFor="arEnd"><i className="fas fa-calendar"></i></label>
          <input type="date" id="arEnd" value={endDate} min={startDate} max={todayStr} onChange={e => setEndDate(e.target.value)} />
        </div>
        {(startDate || endDate) && (
          <button className="ar-date-filter-clear" onClick={clearDateFilter}>
            <i className="fas fa-times"></i> Clear
          </button>
        )}
      </div>
    </div>
  );

  const tabs = [
    { key: 'applications', label: 'Pending Applications', count: applications.length },
    { key: 'approved',     label: 'Approved Riders',      count: approvedRiders.length },
    { key: 'pickups',      label: 'Pickup Requests',      count: pendingPickups.length },
    { key: 'all-pickups',  label: 'All Pickups',          count: allPickupRequests.length },
    { key: 'delivery',     label: '📦 Active Delivery',   count: activeDeliveryItems.length },
    { key: 'completed',    label: '✅ Completed',         count: completedOrders.length, green: true },
  ];

  return (
    <div className="admin-riders">
      <div className="riders-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`riders-tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.count > 0 && (
              <span className={`riders-tab-count-badge ${t.green ? 'riders-tab-count-badge--green' : ''}`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
        <div className="ar-bell-tab-slot"><NotificationBell /></div>
      </div>

      {/* PENDING APPLICATIONS */}
      {tab === 'applications' && (
        applications.length === 0 ? <p className="riders-empty">No pending applications.</p> : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>Date Applied</th><th>Photos</th><th>Actions</th></tr></thead>
              <tbody>
                {applications.map(app => (
                  <tr key={app._id}>
                    <td>{app.fullName}</td><td>{app.email}</td><td>{app.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{app.vehicleType || '—'}</td>
                    <td>{app.appliedAt ? new Date(app.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</td>
                    <td><div className="riders-photo-indicators"><span className={`photo-dot ${app.riderPhoto ? 'has-photo' : 'no-photo'}`} title="Selfie">🤳</span><span className={`photo-dot ${app.validId1 ? 'has-photo' : 'no-photo'}`} title="ID 1">🪪</span><span className={`photo-dot ${app.validId2 ? 'has-photo' : 'no-photo'}`} title="ID 2">🪪</span></div></td>
                    <td className="riders-actions">
                      <button className="riders-btn view" onClick={() => setSelectedApp(app)}>👁 View</button>
                      <button className="riders-btn approve" onClick={() => handleApproveRider(app)}>✅ Approve</button>
                      <button className="riders-btn reject" onClick={() => handleRejectWithReason(app)}>❌ Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* APPROVED RIDERS */}
      {tab === 'approved' && (
        approvedRiders.length === 0 ? <p className="riders-empty">No approved riders yet.</p> : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Vehicle</th><th>DK Rider ID</th><th>Date Applied</th><th>Action</th></tr></thead>
              <tbody>
                {approvedRiders.map(rider => (
                  <tr key={rider._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {rider.riderPhoto ? <img src={rider.riderPhoto} alt={rider.fullName} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #ffc0d8', flexShrink: 0 }} /> : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#fff0f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>}
                        {rider.fullName}
                      </div>
                    </td>
                    <td>{rider.email}</td><td>{rider.phone}</td>
                    <td style={{ textTransform: 'capitalize' }}>{rider.vehicleType || '—'}</td>
                    <td>{rider.dkRiderId ? <span className="dk-rider-id-badge">{rider.dkRiderId}</span> : '—'}</td>
                    <td>{rider.appliedAt ? new Date(rider.appliedAt).toLocaleDateString('en-PH') : 'N/A'}</td>
                    <td className="riders-actions">
                      {rider.dkRiderId && <button className="riders-btn view" onClick={() => setApprovedRider(rider)}>🪪 View ID</button>}
                      <button className="riders-btn reject" onClick={() => handleRevokeRider(rider._id, rider.fullName)}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* PENDING PICKUP REQUESTS */}
      {tab === 'pickups' && (
        pendingPickups.length === 0 ? <p className="riders-empty">No pending pickup requests.</p> : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead><tr><th>Order ID</th><th>Rider</th><th>Phone</th><th>Vehicle / Plate</th><th>Customer</th><th>Total</th><th>Requested</th><th>Actions</th></tr></thead>
              <tbody>
                {pendingPickups.map(req => (
                  <tr key={req._id}>
                    <td><strong>#{req.orderId?.slice(-8)}</strong></td>
                    <td><strong>{req.riderName}</strong><div style={{ fontSize: 12, color: '#888' }}>{req.riderEmail}</div></td>
                    <td>{req.riderPhone || '—'}</td>
                    <td><span style={{ textTransform: 'capitalize' }}>{req.riderVehicle || '—'}</span>{req.riderPlate && <span style={{ display: 'block', fontSize: 12, color: '#666' }}>{req.riderPlate}</span>}</td>
                    <td>{req.customerName || '—'}</td>
                    <td>₱{(req.total || 0).toLocaleString()}</td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('en-PH')}</td>
                    <td className="riders-actions">
                      <button className="riders-btn approve" onClick={() => approvePickup(req._id, req.riderName)}>✅ Approve</button>
                      <button className="riders-btn reject" onClick={() => rejectPickup(req._id)}>❌ Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ALL PICKUPS HISTORY */}
      {tab === 'all-pickups' && (
        allPickupRequests.length === 0 ? <p className="riders-empty">No pickup requests yet.</p> : (
          <div className="riders-table-wrapper">
            <table className="riders-table">
              <thead><tr><th>Order ID</th><th>Rider</th><th>Customer</th><th>Total</th><th>Status</th><th>Requested</th><th>Resolved</th></tr></thead>
              <tbody>
                {allPickupRequests.map(req => (
                  <tr key={req._id}>
                    <td><strong>#{req.orderId?.slice(-8)}</strong></td>
                    <td><strong>{req.riderName}</strong><div style={{ fontSize: 12, color: '#888' }}>{req.riderEmail}</div></td>
                    <td>{req.customerName || '—'}</td>
                    <td>₱{(req.total || 0).toLocaleString()}</td>
                    <td><span className="rider-badge" style={{ backgroundColor: getPickupStatusColor(req.status), color: 'white' }}>{getPickupStatusLabel(req.status)}</span></td>
                    <td>{new Date(req.requestedAt).toLocaleDateString('en-PH')}</td>
                    <td>{req.approvedAt ? new Date(req.approvedAt).toLocaleDateString('en-PH') : req.rejectedAt ? new Date(req.rejectedAt).toLocaleDateString('en-PH') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ACTIVE DELIVERY */}
      {tab === 'delivery' && (
        <>
          <DateFilter />
          {activeOrders.length === 0
            ? <div className="ar-empty"><div className="ar-empty-icon">📭</div><p>No active deliveries{(startDate || endDate) ? ' for selected dates' : ''}.</p><span>Confirmed orders appear here.</span></div>
            : <div className="ar-orders-list">
                {activeOrders.map(o => (
                  <ActiveOrderCard key={o._id} order={o}
                    savingGps={!!savingGps[o.orderId]} savedGps={!!savedGps[o.orderId]}
                    collapsed={!!collapsed[o.orderId]}
                    onSaveGps={handleSaveGps}
                    onToggleCollapse={handleToggleCollapse}
                    onOpenMap={openMap}
                  />
                ))}
              </div>
          }
        </>
      )}

      {/* COMPLETED DELIVERIES */}
      {tab === 'completed' && (
        <>
          <DateFilter />
          {completedOrders.length === 0
            ? <div className="ar-empty"><div className="ar-empty-icon">✅</div><p>No completed deliveries{(startDate || endDate) ? ' for selected dates' : ''} yet.</p></div>
            : <div className="ar-orders-list">{completedOrders.map(o => <CompletedOrderCard key={o._id} order={o} onRemove={setRemoveTarget} />)}</div>
          }
        </>
      )}

      {selectedApp   && <ApplicationDetailModal app={selectedApp} onClose={() => setSelectedApp(null)} onApprove={handleApproveRider} onRejectWithReason={handleRejectWithReason} />}
      {approvedRider && <RiderIdCardModal rider={approvedRider} onClose={() => setApprovedRider(null)} />}
      {rejectTarget  && <RejectApplicationModal app={rejectTarget} onConfirm={handleConfirmReject} onClose={() => setRejectTarget(null)} />}
      {removeTarget  && <RemoveConfirmModal order={removeTarget} onConfirm={confirmRemove} onClose={() => setRemoveTarget(null)} />}
      {mapOrder      && <LiveMapModal orderId={mapOrder.orderId} order={mapOrder} onClose={() => { setMapOrder(null); setMapFullscreen(false); }} fullscreen={mapFullscreen} />}
    </div>
  );
};

export default AdminRiders;
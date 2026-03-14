// src/admin/AdminRiders.jsx
// ── MERGED: Applications + ID Cards (Doc12) + Delivery Management (Doc14) ──
import React, { useState, useRef, useEffect } from 'react';
import './AdminRiders.css';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { QRCodeSVG } from 'qrcode.react';

const SITE_URL = process.env.REACT_APP_SITE_URL || 'https://dkmerchwebsite.vercel.app';
const getRiderLink    = (orderId) => `${SITE_URL}/rider-track/${orderId}`;
const getCustomerLink = (orderId) => `${SITE_URL}/track-order?order=${orderId}`;

const timeAgo = (ts) => {
  if (!ts) return 'unknown';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 10)   return 'just now';
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

// ─────────────────────────────────────────────────────────────
// SECTION 1: Rider Applications (from Doc12)
// ─────────────────────────────────────────────────────────────

const RiderIdCardModal = ({ rider, onClose }) => {
  const cardRef = useRef();

  const handlePrint = () => {
    const printContent = cardRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=500,height=320');
    win.document.write(`
      <html><head><title>DKMerch Rider ID</title>
      <style>
        body { margin: 0; padding: 20px; font-family: 'Segoe UI', sans-serif; background: #f0f0f0; }
        .dk-id-card { width: 380px; min-height: 220px; background: linear-gradient(135deg, #6a0dad, #9b30ff);
          border-radius: 16px; padding: 20px; color: white; box-shadow: 0 8px 32px rgba(106,13,173,0.4); position: relative; overflow: hidden; }
      </style></head><body>${printContent}</body></html>
    `);
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
            <div className="dk-id-header">
              <span className="dk-id-logo">🛵</span>
              <div><div className="dk-id-brand">DKMerch</div><div className="dk-id-brand-sub">Official Delivery Rider</div></div>
            </div>
            <div className="dk-id-body">
              {rider.riderPhoto
                ? <img src={rider.riderPhoto} alt="Rider" className="dk-id-photo" />
                : <div className="dk-id-photo-placeholder">👤</div>}
              <div className="dk-id-info">
                <div className="dk-id-name">{rider.fullName}</div>
                <div className="dk-id-role">Delivery Rider</div>
                <div className="dk-id-details">
                  <div className="dk-id-detail">📞 {rider.phone}</div>
                  <div className="dk-id-detail">✉️ {rider.email}</div>
                  <div className="dk-id-detail" style={{ textTransform: 'capitalize' }}>
                    🛵 {rider.vehicleType || '—'} {rider.plateNumber ? `• ${rider.plateNumber}` : ''}
                  </div>
                </div>
              </div>
            </div>
            <div className="dk-id-footer">
              <div>
                <div className="dk-id-number">{rider.dkRiderId}</div>
                <div className="dk-id-number-label">Rider ID</div>
              </div>
              <div className="dk-id-valid">
                Issued: {rider.dkRiderIdGeneratedAt
                  ? new Date(rider.dkRiderIdGeneratedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                  : new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
              </div>
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

const ApplicationDetailModal = ({ app, onClose, onApprove, onReject }) => {
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
              {app[key]
                ? <img src={app[key]} alt={label} className="app-photo-img" onClick={() => setViewImg(app[key])} title="Click to enlarge" />
                : <div className="app-photo-missing">No photo submitted</div>}
            </div>
          ))}
        </div>
        <div className="app-detail-actions">
          <button className="riders-btn approve" onClick={() => { onClose(); onApprove(app); }}>✅ Approve</button>
          <button className="riders-btn reject" onClick={() => { onClose(); onReject(app._id, app.fullName); }}>❌ Reject</button>
        </div>
      </div>
      {viewImg && (
        <div className="img-viewer-overlay" onClick={() => setViewImg(null)}>
          <img src={viewImg} alt="ID" className="img-viewer-img" />
          <div className="img-viewer-hint">Tap anywhere to close</div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// SECTION 2: Delivery Management helpers (from Doc14)
// ─────────────────────────────────────────────────────────────

const StatusBadge = ({ order }) => {
  const s = (order.orderStatus || order.status || '').toLowerCase();
  const map = {
    confirmed: { label: '✅ Confirmed', bg: '#059669' },
    processing: { label: '⚙️ Processing', bg: '#6366f1' },
    shipped: { label: '📦 Shipped', bg: '#0ea5e9' },
    out_for_delivery: { label: '🚚 Out for Delivery', bg: '#f59e0b' },
    completed: { label: '✅ Delivered', bg: '#16a34a' },
    delivered: { label: '✅ Delivered', bg: '#16a34a' },
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
      <span className="ar-gps-live-dot" style={{ width: 7, height: 7 }} />
      Live
    </span>
  );
};

const QRModal = ({ orderId, onClose }) => {
  const svgRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const riderLink = getRiderLink(orderId);
  const shortId   = orderId?.slice(-8).toUpperCase();

  const handleDownload = () => {
    const svg = svgRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl  = URL.createObjectURL(svgBlob);
    const img     = new Image();
    img.onload = () => {
      const canvas  = document.createElement('canvas');
      canvas.width  = 280; canvas.height = 280;
      const ctx     = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 280, 280);
      ctx.drawImage(img, 0, 0, 280, 280);
      URL.revokeObjectURL(svgUrl);
      const link = document.createElement('a');
      link.download = `rider-qr-${shortId}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = svgUrl;
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(riderLink); }
    catch { const ta = document.createElement('textarea'); ta.value = riderLink; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="ar-modal-overlay ar-qr-overlay" onClick={onClose}>
      <div className="ar-qr-modal" onClick={e => e.stopPropagation()}>
        <button className="ar-modal-close" onClick={onClose}>✕</button>
        <div className="ar-qr-header">
          <div className="ar-qr-title-icon">📱</div>
          <div><h3 className="ar-qr-title">Rider QR Code</h3><p className="ar-qr-subtitle">Order #{shortId}</p></div>
        </div>
        <div className="ar-qr-instruction">
          <span className="ar-qr-step">1</span> Show this QR to the rider
          <span className="ar-qr-step">2</span> Rider scans to open GPS link
        </div>
        <div className="ar-qr-canvas-wrap">
          <div ref={svgRef} className="ar-qr-canvas">
            <QRCodeSVG value={riderLink} size={240} level="H" includeMargin={false} fgColor="#3b0764" bgColor="#ffffff" />
          </div>
        </div>
        <div className="ar-qr-link-preview">
          <span className="ar-qr-link-text">{riderLink}</span>
        </div>
        <div className="ar-qr-actions">
          <button className="ar-btn ar-btn-primary ar-qr-btn" onClick={handleDownload}><i className="fas fa-download" /> Save QR</button>
          <button className="ar-btn ar-btn-ghost ar-qr-btn" onClick={handleCopy}>{copied ? '✅ Copied!' : '📋 Copy Link'}</button>
        </div>
        <p className="ar-qr-footer-note">🔒 This link is unique to this order.</p>
      </div>
    </div>
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

  const handleOpen = async () => {
    setOpen(o => !o);
    if (!open && unreadCount > 0) await markAllRead().catch(() => {});
  };

  const timeAgoStr = (isoStr) => {
    const diff = Date.now() - new Date(isoStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="ar-bell-wrap" ref={dropdownRef}>
      <button className="ar-bell-btn" onClick={handleOpen} title="Rider notifications">
        🔔
        {unreadCount > 0 && <span className="ar-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="ar-bell-dropdown">
          <div className="ar-bell-header">
            <span className="ar-bell-title">🛵 Rider Notifications</span>
            <div className="ar-bell-header-actions">
              {notifications.length > 0 && (
                <button className="ar-bell-clear" onClick={async () => { await clearAll().catch(() => {}); }}>Clear all</button>
              )}
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
    const measure = () => {
      const sidebar = document.querySelector('.admin-sidebar') || document.querySelector('aside') || document.querySelector('[class*="sidebar"]');
      if (sidebar) setSidebarWidth(sidebar.getBoundingClientRect().width);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const location   = useQuery(api.riders.getRiderLocation, { orderId });
  const isLive     = !!(location?.isTracking && location?.updatedAt && (Date.now() - location.updatedAt) < 30000);
  const hasLoc     = !!(location?.lat && location?.lng && location.lat !== 0 && location.lng !== 0);
  const hasLastKnown = !!(location?.lastKnownLat && location?.lastKnownLng);

  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.classList.add('ar-map-open');
    document.body.style.top = `-${scrollY}px`;
    return () => {
      document.body.classList.remove('ar-map-open');
      document.body.style.top = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapObjRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    const destLat = order?.addressLat || null;
    const destLng = order?.addressLng || null;
    if (destLat && destLng) {
      map.setView([destLat, destLng], 15);
      const destIcon = L.divIcon({ html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">📍</div>`, className: '', iconSize: [40, 40], iconAnchor: [20, 40] });
      const dm = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
      dm.bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`).openPopup();
      destMarkerRef.current = dm;
    } else {
      map.setView([14.5995, 120.9842], 12);
    }
    mapObjRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady]);

  useEffect(() => {
    if (mapObjRef.current) setTimeout(() => { try { mapObjRef.current.invalidateSize(); } catch {} }, 150);
  }, [isFullscreen]);

  const clearRoute = () => {
    if (routeLineRef.current) {
      if (Array.isArray(routeLineRef.current)) { routeLineRef.current.forEach(l => { try { l.remove(); } catch {} }); }
      else { try { routeLineRef.current.remove(); } catch {} }
      routeLineRef.current = null;
    }
  };

  const drawRoute = (lat, lng, destLat, destLng, dashed = false) => {
    if (routeAbortRef.current) { routeAbortRef.current.abort(); routeAbortRef.current = null; }
    if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
    routeTimerRef.current = setTimeout(async () => {
      if (!mapObjRef.current || !window.L) return;
      const L = window.L; const map = mapObjRef.current;
      clearRoute();
      if (dashed) {
        try {
          routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#9ca3af', weight: 3, opacity: 0.75, dashArray: '8, 8' }).addTo(map);
          map.fitBounds(L.latLngBounds([lat, lng], [destLat, destLng]), { padding: [48, 48], maxZoom: 17 });
        } catch {}
        return;
      }
      const controller = new AbortController();
      routeAbortRef.current = controller;
      try {
        const url  = `https://router.project-osrm.org/route/v1/bike/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson`;
        const res  = await fetch(url, { signal: controller.signal });
        const data = await res.json();
        if (!mapObjRef.current || controller.signal.aborted) return;
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const coords  = data.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
          const outline = L.polyline(coords, { color: 'white',   weight: 7,   opacity: 0.6 }).addTo(map);
          const line    = L.polyline(coords, { color: '#e53e3e', weight: 4.5, opacity: 0.92 }).addTo(map);
          routeLineRef.current = [outline, line];
          map.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 17 });
        } else { throw new Error('no route'); }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        try {
          const dLat = order?.addressLat, dLng = order?.addressLng;
          if (dLat && dLng) {
            routeLineRef.current = window.L.polyline([[lat, lng], [dLat, dLng]], { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }).addTo(mapObjRef.current);
            mapObjRef.current.fitBounds(window.L.latLngBounds([lat, lng], [dLat, dLng]), { padding: [48, 48], maxZoom: 17 });
          }
        } catch {}
      } finally {
        if (routeAbortRef.current === controller) routeAbortRef.current = null;
      }
    }, 600);
  };

  useEffect(() => {
    if (!mapObjRef.current || !window.L) return;
    const L = window.L; const map = mapObjRef.current;
    const destLat = order?.addressLat; const destLng = order?.addressLng;
    if (isLive && hasLoc) {
      const { lat, lng, accuracy, updatedAt } = location;
      const prev = lastPlottedRef.current;
      if (prev.lat === lat && prev.lng === lng) return;
      lastPlottedRef.current = { lat, lng };
      if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} lastKnownMarkerRef.current = null; }
      if (!markerRef.current) {
        const riderIcon = L.divIcon({ html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(106,13,173,0.55);display:flex;align-items:center;justify-content:center;font-size:20px;">🛵</div>`, className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
        markerRef.current = L.marker([lat, lng], { icon: riderIcon }).addTo(map);
        markerRef.current.bindPopup(`<b>🛵 ${order.riderInfo?.name || 'Rider'}</b><br>📍 Live location`);
      } else { try { markerRef.current.setLatLng([lat, lng]); } catch {} }
      if (circleRef.current) { try { circleRef.current.remove(); } catch {} circleRef.current = null; }
      if (accuracy) { try { circleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.07, weight: 1.5 }).addTo(map); } catch {} }
      if (destLat && destLng) { drawRoute(lat, lng, destLat, destLng, false); }
      else { try { map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { animate: true, duration: 1 }); } catch {} }
      setLastUpdate(new Date(updatedAt));
      return;
    }
    if (!isLive && hasLastKnown) {
      const { lastKnownLat, lastKnownLng, lastKnownAt, lastKnownAddress } = location;
      if (markerRef.current) { try { markerRef.current.setOpacity(0); } catch {} }
      if (circleRef.current) { try { circleRef.current.remove(); } catch {} circleRef.current = null; }
      const ghostIcon = L.divIcon({ className: '', html: `<div style="position:relative;width:40px;height:40px;"><div style="width:40px;height:40px;background:linear-gradient(135deg,#6b7280,#9ca3af);border-radius:50%;border:3px solid white;display:flex;align-items:center;justify-content:center;font-size:20px;opacity:0.88;">🛵</div><div style="position:absolute;top:-5px;right:-5px;background:#f59e0b;color:white;border-radius:50%;width:17px;height:17px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;">!</div></div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
      const lastTimeStr = lastKnownAt ? new Date(lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
      if (!lastKnownMarkerRef.current) {
        try {
          lastKnownMarkerRef.current = L.marker([lastKnownLat, lastKnownLng], { icon: ghostIcon }).addTo(map).bindPopup(`<div style="min-width:160px"><strong>🛵 ${order.riderInfo?.name || 'Rider'}</strong><br><span style="color:#f59e0b;font-weight:600;font-size:12px">⚠️ Last seen ${lastTimeStr}</span>${lastKnownAddress ? `<br><span style="color:#6b7280;font-size:11px">📍 ${lastKnownAddress}</span>` : ''}</div>`);
        } catch {}
      } else { try { lastKnownMarkerRef.current.setLatLng([lastKnownLat, lastKnownLng]); lastKnownMarkerRef.current.setIcon(ghostIcon); } catch {} }
      if (destLat && destLng) { drawRoute(lastKnownLat, lastKnownLng, destLat, destLng, true); }
      else { try { map.panTo([lastKnownLat, lastKnownLng]); } catch {} }
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
    <div className={overlayClass}
      style={isFullscreen && sidebarWidth > 0 ? { left: sidebarWidth, width: `calc(100vw - ${sidebarWidth}px)` } : {}}
      onClick={onClose}>
      <div className={`ar-map-modal ${isFullscreen ? 'ar-map-modal--full' : ''}`}
        style={isFullscreen ? { display: 'flex', flexDirection: 'column', height: '100dvh', maxHeight: '100dvh', ...(sidebarWidth > 0 ? { position: 'fixed', top: 0, left: sidebarWidth, width: `calc(100vw - ${sidebarWidth}px)`, maxWidth: `calc(100vw - ${sidebarWidth}px)` } : {}) } : {}}
        onClick={e => e.stopPropagation()}>
        <div className="ar-map-header" style={{ flexShrink: 0 }}>
          <div className="ar-map-title-row">
            <span className="ar-map-title">📍 Live Rider Location</span>
            <span className="ar-map-order-id">#{orderId?.slice(-8).toUpperCase()}</span>
          </div>
          <div className="ar-map-header-right">
            {isLive
              ? <div className="ar-map-live-badge"><span className="ar-gps-live-dot" />Live · {lastUpdate?.toLocaleTimeString()}</div>
              : hasLastKnown
              ? <div className="ar-map-stale-badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>⚠️ Offline · Last seen {lastKnownTimeStr || 'unknown'}</div>
              : !location
              ? <div className="ar-map-waiting-badge">⏳ Waiting for rider…</div>
              : <div className="ar-map-stale-badge">⏸ {lastUpdate?.toLocaleTimeString() || '—'}</div>}
            <button className="ar-map-fullscreen-btn" onClick={() => setIsFullscreen(f => !f)}>{isFullscreen ? '⛶ Exit' : '⛶ Full'}</button>
            <button className="ar-modal-close ar-modal-close--map" onClick={onClose}>✕</button>
          </div>
        </div>
        <div ref={mapRef} className="ar-map-container" style={isFullscreen ? { flex: '1 1 auto', height: 'auto', minHeight: 0 } : {}} />
        {!location && <div className="ar-map-waiting-overlay" style={{ flexShrink: 0 }}><span className="ar-gps-live-dot" style={{ background: '#f59e0b' }} /><span>Waiting for rider GPS…</span></div>}
        {!isLive && hasLastKnown && <div className="ar-map-offline-bar"><span style={{ fontSize: 14 }}>⚠️</span><span><strong>Rider offline</strong> · Last known {lastKnownTimeStr} ({timeAgo(location?.lastKnownAt)}){location?.lastKnownAddress && <> · <strong>📍 {location.lastKnownAddress}</strong></>}</span></div>}
        {isLive && hasLoc && <div className="ar-map-info-bar" style={{ flexShrink: 0 }}><span>🛵 {order.riderInfo?.name || 'Rider'}</span><span>📍 {location.lat.toFixed(5)}, {location.lng.toFixed(5)}</span>{location.speed > 0 && <span>🚀 {(location.speed * 3.6).toFixed(1)} km/h</span>}<span style={{ color: '#e53e3e', fontWeight: 700 }}>━━ Route</span></div>}
        <div className="ar-map-link-row" style={{ flexShrink: 0 }}>
          <code className="ar-map-link-code">{getRiderLink(orderId)}</code>
          <button className="ar-map-copy-btn" onClick={() => navigator.clipboard.writeText(getRiderLink(orderId))}>📋 Copy</button>
        </div>
      </div>
    </div>
  );
};

const ShareModal = ({ order, onClose }) => {
  const [copiedRider, setCopiedRider]       = useState(false);
  const [copiedCustomer, setCopiedCustomer] = useState(false);
  const [copiedAll, setCopiedAll]           = useState(false);
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
            <button className="ar-btn ar-btn-primary ar-share-copy-btn" onClick={() => copy(riderLink, setCopiedRider)}>{copiedRider ? '✅' : '📋 Copy'}</button>
          </div>
        </div>
        <div className="ar-share-link-block ar-share-link-customer">
          <div className="ar-share-link-header"><span>👤 Customer Link</span></div>
          <div className="ar-share-link-row">
            <div className="ar-share-link-url">{custLink}</div>
            <button className="ar-btn ar-btn-secondary ar-share-copy-btn" onClick={() => copy(custLink, setCopiedCustomer)}>{copiedCustomer ? '✅' : '📋 Copy'}</button>
          </div>
        </div>
        <div className="ar-share-divider">Full message:</div>
        <div className="ar-share-preview"><pre className="ar-share-text">{msg}</pre></div>
        <div className="ar-share-actions">
          <button className="ar-btn ar-btn-primary" onClick={() => copy(msg, setCopiedAll)}>{copiedAll ? '✅ Copied!' : '📋 Copy Message'}</button>
          <button className="ar-btn ar-btn-ghost" onClick={onClose}>Close</button>
        </div>
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

// ── Plate validation ──
const PLATE_REGEX = /^[A-Z]{3}\d{4}$/;
const formatPlateInput = (raw) => {
  const upper = raw.toUpperCase();
  let letters = '', digits = '';
  for (const ch of upper) {
    if (letters.length < 3 && /[A-Z]/.test(ch)) letters += ch;
    else if (letters.length === 3 && digits.length < 4 && /\d/.test(ch)) digits += ch;
  }
  return letters + digits;
};

const ActiveOrderCard = ({
  order, savingRider, savedRider, savingGps, savedGps,
  copiedLink, collapsed, notifying, notified,
  onSaveRider, onSaveGps, onCopyLink, onToggleCollapse,
  onShareOrder, onOpenMap, onNotifyCustomer, onOpenQR,
}) => {
  const { orderId } = order;
  const [ri, setRi]       = useState({ name: order.riderInfo?.name || '', phone: order.riderInfo?.phone || '', plate: order.riderInfo?.plate || '' });
  const [gps, setGps]     = useState(order.riderGpsLink || '');
  const [errors, setErrors] = useState({});

  useEffect(() => { setRi({ name: order.riderInfo?.name || '', phone: order.riderInfo?.phone || '', plate: order.riderInfo?.plate || '' }); }, [order.riderInfo?.name, order.riderInfo?.phone, order.riderInfo?.plate]);
  useEffect(() => { setGps(order.riderGpsLink || ''); }, [order.riderGpsLink]);

  const [copiedCust, setCopiedCust] = useState(false);
  const custLink  = getCustomerLink(orderId);
  const riderLink = getRiderLink(orderId);

  const copyCust = () => {
    navigator.clipboard.writeText(custLink).catch(() => { const ta = document.createElement('textarea'); ta.value = custLink; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); });
    setCopiedCust(true); setTimeout(() => setCopiedCust(false), 2000);
  };

  const validate = () => {
    const e = {};
    if (!ri.name?.trim()) e.name = 'Pangalan ng rider ay required';
    else if (ri.name.trim().length < 2) e.name = 'Minimum 2 characters';
    if (!ri.phone?.trim()) e.phone = 'Phone number ay required';
    else if (!/^09\d{9}$/.test(ri.phone.trim())) e.phone = 'Format: 09XXXXXXXXX (11 digits)';
    if (!ri.plate?.trim()) e.plate = 'Plate number ay required';
    else if (!PLATE_REGEX.test(ri.plate.trim())) e.plate = 'Format: ABC1234 (3 letters + 4 numbers)';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePhoneChange = (val) => { const digits = val.replace(/\D/g, '').slice(0, 11); setRi(prev => ({ ...prev, phone: digits })); if (errors.phone) setErrors(prev => ({ ...prev, phone: '' })); };
  const handlePlateChange = (val) => { const formatted = formatPlateInput(val); setRi(prev => ({ ...prev, plate: formatted })); if (errors.plate) setErrors(prev => ({ ...prev, plate: '' })); };
  const plateIsComplete = PLATE_REGEX.test(ri.plate);

  const savedRiderInfo    = order.riderInfo || {};
  const hasSavedRiderInfo = !!(savedRiderInfo.name?.trim() && savedRiderInfo.phone?.trim() && savedRiderInfo.plate?.trim() && /^09\d{9}$/.test(savedRiderInfo.phone.trim()) && PLATE_REGEX.test(savedRiderInfo.plate.trim()));
  const alreadyNotified   = (order.orderStatus || '').toLowerCase() === 'out_for_delivery';
  const isRiderLocked     = hasSavedRiderInfo || alreadyNotified;

  return (
    <div className={`ar-order-card ${collapsed ? 'ar-card-collapsed' : ''}`}>
      <div className="ar-order-header">
        <div className="ar-order-id-block">
          <span className="ar-order-id">#{orderId?.slice(-8).toUpperCase()}</span>
          <StatusBadge order={order} />
          <LiveBadge orderId={orderId} />
        </div>
        <div className="ar-header-actions">
          <button className="ar-share-btn" onClick={() => onShareOrder({ ...order, riderInfo: ri })}>📤</button>
          <button className="ar-collapse-btn" onClick={() => onToggleCollapse(orderId)}>{collapsed ? '▼' : '▲'}</button>
        </div>
      </div>

      {collapsed && (
        <div className="ar-collapsed-summary">
          <span className="ar-cs-name">{order.customerName || '—'}</span><span className="ar-cs-sep">·</span>
          <span className="ar-cs-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span>
          {ri.name && (<><span className="ar-cs-sep">·</span><span className="ar-cs-rider">🛵 {ri.name}</span></>)}
        </div>
      )}

      {!collapsed && (
        <div className="ar-order-body">
          <div className="ar-two-col">
            <div className="ar-section">
              <div className="ar-section-title">👤 Customer</div>
              <div className="ar-compact-row"><span className="ar-cl">Name</span><span className="ar-cv">{order.customerName || '—'}</span></div>
              <div className="ar-compact-row"><span className="ar-cl">Phone</span><span className="ar-cv">{order.phone || '—'}</span></div>
              <div className="ar-compact-row"><span className="ar-cl">Total</span><span className="ar-cv ar-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span></div>
            </div>
            <div className="ar-section">
              <div className="ar-section-title">🛵 Rider Info{isRiderLocked && <span className="ar-rider-locked-badge">🔒 Locked</span>}</div>
              {isRiderLocked ? (
                <div className="ar-rider-locked-view">
                  <div className="ar-rider-locked-row"><span className="ar-cl">Name</span><span className="ar-cv ar-locked-value">{ri.name || '—'}</span></div>
                  <div className="ar-rider-locked-row"><span className="ar-cl">Phone</span><span className="ar-cv ar-locked-value">{ri.phone || '—'}</span></div>
                  <div className="ar-rider-locked-row"><span className="ar-cl">Plate</span><span className="ar-cv ar-locked-plate">{ri.plate || '—'}</span></div>
                  <p className="ar-rider-locked-note">{alreadyNotified ? '🚚 Naka-dispatch na — hindi na mababago.' : '✅ Na-save na ang rider info.'}</p>
                </div>
              ) : (
                <>
                  <div className="ar-input-compact">
                    <div className="ar-input-field">
                      <input type="text" placeholder="Pangalan ng Rider *" value={ri.name} onChange={e => { setRi(prev => ({ ...prev, name: e.target.value })); if (errors.name) setErrors(prev => ({ ...prev, name: '' })); }} className={errors.name ? 'ar-input-error' : ''} />
                      {errors.name ? <span className="ar-field-error">⚠ {errors.name}</span> : ri.name.trim().length >= 2 ? <span className="ar-field-ok">✓ OK</span> : null}
                    </div>
                    <div className="ar-input-field">
                      <input type="tel" placeholder="Phone * (09XXXXXXXXX)" value={ri.phone} onChange={e => handlePhoneChange(e.target.value)} maxLength={11} className={errors.phone ? 'ar-input-error' : ''} />
                      {errors.phone ? <span className="ar-field-error">⚠ {errors.phone}</span> : <span className={`ar-field-hint ${/^09\d{9}$/.test(ri.phone) ? 'ar-field-hint--ok' : ''}`}>{/^09\d{9}$/.test(ri.phone) ? '✓ Valid number' : `${ri.phone.length}/11 digits`}</span>}
                    </div>
                    <div className="ar-input-field">
                      <div className="ar-plate-input-wrap">
                        <input type="text" placeholder="Plate * (ABC1234)" value={ri.plate} onChange={e => handlePlateChange(e.target.value)} maxLength={7} className={`ar-plate-input ${errors.plate ? 'ar-input-error' : ''} ${plateIsComplete ? 'ar-plate-input--valid' : ''}`} spellCheck={false} autoCapitalize="characters" />
                        <span className={`ar-plate-counter ${plateIsComplete ? 'ar-plate-counter--done' : ''}`}>{ri.plate.length}/7</span>
                      </div>
                      {errors.plate ? <span className="ar-field-error">⚠ {errors.plate}</span> : ri.plate.length > 0 ? plateIsComplete ? <span className="ar-field-ok">✓ Format tama</span> : ri.plate.length < 3 ? <span className="ar-field-hint">Mag-type ng {3 - ri.plate.length} pang letter…</span> : ri.plate.length === 3 ? <span className="ar-field-hint">Ngayon mag-type ng 4 digits…</span> : <span className="ar-field-hint">{7 - ri.plate.length} digit/s pa…</span> : <span className="ar-field-hint">Format: ABC1234 · Auto-caps</span>}
                    </div>
                  </div>
                  <button className="ar-save-btn ar-save-btn-sm" onClick={() => { if (validate()) onSaveRider(orderId, ri); }} disabled={savingRider}>
                    {savingRider ? '⏳' : savedRider ? '✅ Saved' : '💾 Save Rider'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="ar-notify-section">
            {alreadyNotified ? (
              <div className="ar-notify-done"><span>✅ Customer notified — Out for Delivery</span></div>
            ) : (
              <>
                <button className={`ar-notify-btn ${notified ? 'ar-notify-btn--done' : ''}`} onClick={() => { if (validate()) onNotifyCustomer(order, ri); }} disabled={notifying || !hasSavedRiderInfo} title={!hasSavedRiderInfo ? 'I-save muna ang rider info' : ''}>
                  {notifying ? '⏳ Sending…' : notified ? '✅ Customer Notified!' : '🔔 Notify Customer (Out for Delivery)'}
                </button>
                {!hasSavedRiderInfo && <p className="ar-notify-hint">⚠️ I-save muna ang rider info bago mag-notify</p>}
              </>
            )}
            {alreadyNotified && (
              <div className="ar-otp-block">
                {order.deliveryOtp ? (
                  <>
                    <div className="ar-otp-label"><span className="ar-otp-label-icon">🔐</span><span>Customer OTP</span><span className="ar-otp-ready-badge">✅ Generated</span></div>
                    <div className="ar-otp-digits">{String(order.deliveryOtp).split('').map((d, i) => <span key={i} className="ar-otp-digit">{d}</span>)}</div>
                    <p className="ar-otp-sub">{order.deliveryOtpVerified ? '✅ OTP verified — package delivered!' : '⏳ Waiting for rider to verify this OTP'}</p>
                  </>
                ) : (
                  <div className="ar-otp-waiting"><span className="ar-otp-wait-dot" /><span>Waiting for customer to generate OTP…</span><small>Customer must tap "Generate OTP" on tracking page</small></div>
                )}
              </div>
            )}
          </div>

          <div className="ar-section ar-section-full">
            <div className="ar-section-title">📍 GPS Tracking</div>
            <div className="ar-tracking-compact">
              <div className="ar-tl-row">
                <span className="ar-tl-badge">🛵</span>
                <div className="ar-tl-url">{riderLink}</div>
                <button className="ar-tl-qr" title="Show QR Code" onClick={() => onOpenQR(orderId)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3" rx="0.5"/><rect x="18" y="14" width="3" height="3" rx="0.5"/><rect x="14" y="18" width="3" height="3" rx="0.5"/><rect x="18" y="18" width="3" height="3" rx="0.5"/></svg>
                  QR
                </button>
                <button className="ar-tl-copy" onClick={() => onCopyLink(orderId)}>{copiedLink ? '✅' : '📋'}</button>
              </div>
              <div className="ar-tl-row">
                <span className="ar-tl-badge">👤</span>
                <div className="ar-tl-url">{custLink}</div>
                <button className="ar-tl-copy ar-tl-copy--green" onClick={copyCust}>{copiedCust ? '✅' : '📋'}</button>
              </div>
              <div className="ar-map-btn-row">
                <button className="ar-track-map-btn" onClick={() => onOpenMap(order, false)}>🗺️ Live Map</button>
                <button className="ar-track-map-btn ar-track-map-btn--full" onClick={() => onOpenMap(order, true)}>⛶ Full Map</button>
              </div>
            </div>
            <details className="ar-gps-fallback">
              <summary>Manual Google Maps link (optional fallback)</summary>
              <div style={{ marginTop: 8 }}>
                <div className="ar-jnt-row">
                  <input type="url" className="ar-jnt-input" placeholder="Paste Google Maps live link…" value={gps} onChange={e => setGps(e.target.value)} />
                  <button className="ar-save-btn ar-jnt-save" onClick={() => onSaveGps(orderId, gps)} disabled={savingGps}>{savingGps ? '⏳' : savedGps ? '✅' : '💾'}</button>
                </div>
                {order.riderGpsLink && <a href={order.riderGpsLink} target="_blank" rel="noopener noreferrer" className="ar-gps-open-btn" style={{ marginTop: 6, display: 'inline-block' }}>🗺️ Open Saved Link</a>}
              </div>
            </details>
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
// MAIN COMPONENT — All tabs combined
// ─────────────────────────────────────────────────────────────
const AdminRiders = () => {
  // ── Applications state (Doc12) ──
  const [selectedApp,    setSelectedApp]    = useState(null);
  const [approvedRider,  setApprovedRider]  = useState(null);

  // ── Delivery state (Doc14) ──
  const [shareOrder,    setShareOrder]    = useState(null);
  const [removeTarget,  setRemoveTarget]  = useState(null);
  const [mapOrder,      setMapOrder]      = useState(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [qrOrderId,     setQrOrderId]     = useState(null);
  const [collapsed,     setCollapsed]     = useState({});
  const [hiddenCompleted, setHiddenCompleted] = useState([]);
  const [savingRider,   setSavingRider]   = useState({});
  const [savedRider,    setSavedRider]    = useState({});
  const [savingGps,     setSavingGps]     = useState({});
  const [savedGps,      setSavedGps]      = useState({});
  const [copiedLink,    setCopiedLink]    = useState({});
  const [notifying,     setNotifying]     = useState({});
  const [notified,      setNotified]      = useState({});

  // ── Tab: "applications" | "approved" | "pickups" | "all-pickups" | "delivery" | "completed" ──
  const [tab, setTab] = useState('applications');

  // ── Queries ──
  const allRiders         = useQuery(api.riders.getAllRiders)                ?? [];
  const allPickupRequests = useQuery(api.pickupRequests.getAllPickupRequests) ?? [];
  const allOrders         = useQuery(api.orders.getAllOrders)                 ?? [];

  // ── Mutations ──
  const approveRiderMutation      = useMutation(api.riders.approveRider);
  const updateRiderStatusMutation = useMutation(api.riders.updateRiderStatus);
  const deleteRiderMutation       = useMutation(api.riders.deleteRider);
  const approvePickupMutation     = useMutation(api.pickupRequests.approvePickupRequest);
  const rejectPickupMutation      = useMutation(api.pickupRequests.rejectPickupRequest);
  const updateFields              = useMutation(api.orders.updateOrderFields);
  const notifyMutation            = useMutation(api.orders.notifyCustomerOutForDelivery);

  // ── Derived data ──
  const applications   = allRiders.filter(r => r.status === 'pending');
  const approvedRiders = allRiders.filter(r => r.status === 'approved');
  const pendingPickups = allPickupRequests.filter(p => p.status === 'pending');

  const activeStatuses    = ['confirmed', 'shipped', 'out_for_delivery', 'processing'];
  const completedStatuses = ['completed', 'delivered'];

  const activeOrders = allOrders
    .filter(o => activeStatuses.includes((o.orderStatus || o.status || '').toLowerCase()))
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const completedOrders = allOrders
    .filter(o => completedStatuses.includes((o.orderStatus || o.status || '').toLowerCase()))
    .filter(o => !hiddenCompleted.includes(o._id))
    .sort((a, b) => (b.deliveryConfirmedAt || b._creationTime || 0) - (a.deliveryConfirmedAt || a._creationTime || 0));

  // ── Application handlers (Doc12) ──
  const handleApproveRider = async (app) => {
    const confirmed = window.confirm(`Approve "${app.fullName}" as a rider?\n\nEmail: ${app.email}\nVehicle: ${app.vehicleType || 'N/A'}`);
    if (!confirmed) return;
    try {
      const result = await approveRiderMutation({ id: app._id });
      setApprovedRider({ ...app, dkRiderId: result.dkRiderId, dkRiderIdGeneratedAt: new Date().toISOString() });
    } catch (err) { console.error(err); alert('Failed to approve rider.'); }
  };

  const handleRejectRider = async (id, name) => {
    const confirmed = window.confirm(`Reject and remove the application of "${name}"?\n\nThis cannot be undone.`);
    if (!confirmed) return;
    try { await deleteRiderMutation({ id }); } catch (err) { console.error(err); }
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

  // ── Delivery handlers (Doc14) ──
  const handleSaveRider = async (orderId, ri) => {
    setSavingRider(p => ({ ...p, [orderId]: true }));
    try { await updateFields({ orderId, riderInfo: { name: ri.name || '', phone: ri.phone || '', plate: ri.plate || '' } }); setSavedRider(p => ({ ...p, [orderId]: true })); setTimeout(() => setSavedRider(p => ({ ...p, [orderId]: false })), 2000); }
    catch (e) { console.error(e); } finally { setSavingRider(p => ({ ...p, [orderId]: false })); }
  };

  const handleSaveGps = async (orderId, gpsValue) => {
    setSavingGps(p => ({ ...p, [orderId]: true }));
    try { await updateFields({ orderId, riderGpsLink: gpsValue ?? '' }); setSavedGps(p => ({ ...p, [orderId]: true })); setTimeout(() => setSavedGps(p => ({ ...p, [orderId]: false })), 2000); }
    catch (e) { console.error(e); } finally { setSavingGps(p => ({ ...p, [orderId]: false })); }
  };

  const handleCopyLink = (orderId) => {
    const link = getRiderLink(orderId);
    navigator.clipboard.writeText(link).catch(() => { const ta = document.createElement('textarea'); ta.value = link; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); });
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
      await notifyMutation({ orderId, riderName: ri.name, riderPhone: ri.phone, riderPlate: ri.plate || undefined, customerEmail: order.email, customerPhone: order.phone || undefined });
      setNotified(p => ({ ...p, [orderId]: true })); setTimeout(() => setNotified(p => ({ ...p, [orderId]: false })), 4000);
    } catch (e) { console.error('Notify error:', e); alert('Failed to notify customer. Please try again.'); }
    finally { setNotifying(p => ({ ...p, [orderId]: false })); }
  };

  const handleToggleCollapse = (orderId) => setCollapsed(p => ({ ...p, [orderId]: !p[orderId] }));
  const confirmRemove        = ()         => { if (!removeTarget) return; setHiddenCompleted(p => [...p, removeTarget._id]); setRemoveTarget(null); };
  const openMap              = (order, full = false) => { setMapOrder(order); setMapFullscreen(full); };

  const getPickupStatusColor = (status) => ({ pending: '#ffc107', approved: '#28a745', rejected: '#dc3545', out_for_delivery: '#6366f1', completed: '#059669' }[status] || '#6c757d');
  const getPickupStatusLabel = (status) => ({ pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected', out_for_delivery: '🚚 Out for Delivery', completed: '🎉 Delivered' }[status] || status);

  return (
    <div className="admin-riders">
      <div className="ar-title-row">
        <h1 className="admin-riders-title">🛵 Riders Management</h1>
        <NotificationBell />
      </div>

      <div className="riders-tabs">
        {/* Applications tabs */}
        <button className={`riders-tab-btn ${tab === 'applications' ? 'active' : ''}`} onClick={() => setTab('applications')}>
          Pending Applications
          {applications.length > 0 && <span className="riders-tab-badge">{applications.length}</span>}
        </button>
        <button className={`riders-tab-btn ${tab === 'approved' ? 'active' : ''}`} onClick={() => setTab('approved')}>
          Approved Riders ({approvedRiders.length})
        </button>
        <button className={`riders-tab-btn ${tab === 'pickups' ? 'active' : ''}`} onClick={() => setTab('pickups')}>
          Pickup Requests
          {pendingPickups.length > 0 && <span className="riders-tab-badge">{pendingPickups.length}</span>}
        </button>
        <button className={`riders-tab-btn ${tab === 'all-pickups' ? 'active' : ''}`} onClick={() => setTab('all-pickups')}>
          All Pickups ({allPickupRequests.length})
        </button>
        {/* Delivery tabs */}
        <button className={`riders-tab-btn ${tab === 'delivery' ? 'active' : ''}`} onClick={() => setTab('delivery')}>
          📦 Active Delivery {activeOrders.length > 0 && <span className="riders-tab-badge">{activeOrders.length}</span>}
        </button>
        <button className={`riders-tab-btn ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
          ✅ Completed {completedOrders.length > 0 && <span className="riders-tab-badge ar-badge-green">{completedOrders.length}</span>}
        </button>
      </div>

      {/* ─── PENDING APPLICATIONS ─── */}
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
                    <td>
                      <div className="riders-photo-indicators">
                        <span className={`photo-dot ${app.riderPhoto ? 'has-photo' : 'no-photo'}`} title="Selfie">🤳</span>
                        <span className={`photo-dot ${app.validId1 ? 'has-photo' : 'no-photo'}`} title="ID 1">🪪</span>
                        <span className={`photo-dot ${app.validId2 ? 'has-photo' : 'no-photo'}`} title="ID 2">🪪</span>
                      </div>
                    </td>
                    <td className="riders-actions">
                      <button className="riders-btn view" onClick={() => setSelectedApp(app)}>👁 View</button>
                      <button className="riders-btn approve" onClick={() => handleApproveRider(app)}>✅ Approve</button>
                      <button className="riders-btn reject" onClick={() => handleRejectRider(app._id, app.fullName)}>❌ Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ─── APPROVED RIDERS ─── */}
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
                        {rider.riderPhoto ? <img src={rider.riderPhoto} alt={rider.fullName} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: '2px solid #c4b5fd', flexShrink: 0 }} /> : <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>👤</div>}
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

      {/* ─── PENDING PICKUP REQUESTS ─── */}
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

      {/* ─── ALL PICKUPS HISTORY ─── */}
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

      {/* ─── ACTIVE DELIVERY ─── */}
      {tab === 'delivery' && (
        activeOrders.length === 0
          ? <div className="ar-empty"><div className="ar-empty-icon">📭</div><p>No active deliveries.</p><span>Confirmed orders appear here.</span></div>
          : <div className="ar-orders-list">
              {activeOrders.map(o => (
                <ActiveOrderCard key={o._id} order={o}
                  savingRider={!!savingRider[o.orderId]} savedRider={!!savedRider[o.orderId]}
                  savingGps={!!savingGps[o.orderId]}     savedGps={!!savedGps[o.orderId]}
                  copiedLink={!!copiedLink[o.orderId]}   collapsed={!!collapsed[o.orderId]}
                  notifying={!!notifying[o.orderId]}     notified={!!notified[o.orderId]}
                  onSaveRider={handleSaveRider}          onSaveGps={handleSaveGps}
                  onCopyLink={handleCopyLink}            onToggleCollapse={handleToggleCollapse}
                  onShareOrder={setShareOrder}           onOpenMap={openMap}
                  onNotifyCustomer={handleNotifyCustomer}
                  onOpenQR={setQrOrderId}
                />
              ))}
            </div>
      )}

      {/* ─── COMPLETED DELIVERIES ─── */}
      {tab === 'completed' && (
        completedOrders.length === 0
          ? <div className="ar-empty"><div className="ar-empty-icon">✅</div><p>No completed deliveries yet.</p></div>
          : <div className="ar-orders-list">
              {completedOrders.map(o => <CompletedOrderCard key={o._id} order={o} onRemove={setRemoveTarget} />)}
            </div>
      )}

      {/* ─── MODALS ─── */}
      {selectedApp   && <ApplicationDetailModal app={selectedApp} onClose={() => setSelectedApp(null)} onApprove={handleApproveRider} onReject={handleRejectRider} />}
      {approvedRider && <RiderIdCardModal rider={approvedRider} onClose={() => setApprovedRider(null)} />}
      {shareOrder    && <ShareModal order={shareOrder} onClose={() => setShareOrder(null)} />}
      {removeTarget  && <RemoveConfirmModal order={removeTarget} onConfirm={confirmRemove} onClose={() => setRemoveTarget(null)} />}
      {mapOrder      && <LiveMapModal orderId={mapOrder.orderId} order={mapOrder} onClose={() => { setMapOrder(null); setMapFullscreen(false); }} fullscreen={mapFullscreen} />}
      {qrOrderId     && <QRModal orderId={qrOrderId} onClose={() => setQrOrderId(null)} />}
    </div>
  );
};

export default AdminRiders;
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

const getRefundWindow = (order) => {
  const deliveredAt = order.deliveryConfirmedAt;
  if (!deliveredAt) return { canRefund: false, hoursLeft: 0, expired: false };
  const deliveredMs = new Date(deliveredAt).getTime();
  const deadlineMs  = deliveredMs + 24 * 60 * 60 * 1000;
  const nowMs       = Date.now();
  const msLeft      = deadlineMs - nowMs;
  if (msLeft <= 0) return { canRefund: false, hoursLeft: 0, expired: true };
  return { canRefund: true, hoursLeft: Math.floor(msLeft / (1000 * 60 * 60)), minsLeft: Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)), expired: false };
};

// ─── REFUND MODAL ─────────────────────────────────────────────────────────────
const RefundModal = ({ order, onClose, onSuccess }) => {
  const [photo, setPhoto]               = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [refundMethod, setRefundMethod] = useState('');
  const [accountName, setAccountName]   = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [comment, setComment]           = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [error, setError]               = useState('');
  const fileInputRef                    = useRef(null);

  const generateUploadUrl = useMutation(api.orders.generateRefundUploadUrl);
  const requestRefund     = useMutation(api.orders.requestRefund);

  const refundAmount = (order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
  const { canRefund, hoursLeft, minsLeft, expired } = getRefundWindow(order);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please upload an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be less than 5MB.'); return; }
    setError(''); setPhoto(file); setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => { setPhoto(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleSubmit = async () => {
    const { canRefund: stillValid } = getRefundWindow(order);
    if (!stillValid) { setError('Refund window has expired.'); return; }
    if (!photo) { setError('Please upload a photo of the damaged item.'); return; }
    if (!refundMethod) { setError('Please choose GCash or Maya.'); return; }
    if (!accountName.trim()) { setError('Please enter your account name.'); return; }
    if (!accountNumber.trim()) { setError('Please enter your account number.'); return; }
    if (!/^\d{10,11}$/.test(accountNumber.replace(/\s/g, ''))) { setError('Please enter a valid 10 or 11-digit number.'); return; }
    setError(''); setSubmitting(true); setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadRes = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': photo.type }, body: photo });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { storageId } = await uploadRes.json();
      setUploading(false);
      const result = await requestRefund({ orderId: order.orderId, refundPhotoId: storageId, refundMethod, refundAccountName: accountName.trim(), refundAccountNumber: accountNumber.replace(/\s/g, ''), refundComment: comment.trim() });
      if (result?.success) { onSuccess(); } else { setError(result?.error || 'Failed. Please try again.'); }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally { setSubmitting(false); setUploading(false); }
  };

  if (expired || !canRefund) {
    return (
      <div className="refund-modal-overlay" onClick={onClose}>
        <div className="refund-modal" onClick={e => e.stopPropagation()}>
          <button className="refund-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          <div className="refund-modal-header">
            <div className="refund-modal-icon" style={{ background: '#fee2e2' }}><i className="fas fa-clock" style={{ color: '#dc2626' }}></i></div>
            <div><h3>Refund Window Expired</h3><p>Order #{order.orderId?.slice(-8)}</p></div>
          </div>
          <div className="refund-modal-body">
            <div className="refund-expired-notice">
              <i className="fas fa-exclamation-circle"></i>
              <div><strong>The 24-hour refund window has passed.</strong><p>Refunds are only accepted within 24 hours of delivery.</p></div>
            </div>
          </div>
          <div className="refund-modal-footer"><button className="refund-cancel-btn" onClick={onClose}>Close</button></div>
        </div>
      </div>
    );
  }

  return (
    <div className="refund-modal-overlay" onClick={onClose}>
      <div className="refund-modal" onClick={e => e.stopPropagation()}>
        <button className="refund-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        <div className="refund-modal-header">
          <div className="refund-modal-icon"><i className="fas fa-box-open"></i></div>
          <div><h3>Request a Refund</h3><p>Order #{order.orderId?.slice(-8)} · <strong>₱{refundAmount}</strong></p></div>
        </div>
        <div className="refund-window-timer"><i className="fas fa-hourglass-half"></i><span>Closes in <strong>{hoursLeft}h {minsLeft}m</strong></span></div>
        <div className="refund-modal-body">
          <div className="refund-reason-fixed">
            <div className="refund-reason-fixed-icon"><i className="fas fa-box"></i></div>
            <div><span className="refund-reason-fixed-label">📦 Item arrived damaged</span><span className="refund-reason-fixed-desc">Provide photo proof below.</span></div>
          </div>
          <div className="refund-field-group">
            <label className="refund-modal-label"><i className="fas fa-camera"></i> Photo Proof <span className="refund-required">*</span></label>
            {!photoPreview
              ? <div className="refund-photo-upload-area" onClick={() => fileInputRef.current?.click()}><i className="fas fa-cloud-upload-alt"></i><p>Click to upload</p><small>JPG, PNG · Max 5MB</small><input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} /></div>
              : <div className="refund-photo-preview-wrap"><img src={photoPreview} alt="Damage proof" className="refund-photo-preview" /><button className="refund-photo-remove" onClick={removePhoto} type="button"><i className="fas fa-trash-alt"></i> Remove</button></div>}
          </div>
          <div className="refund-field-group">
            <label className="refund-modal-label"><i className="fas fa-wallet"></i> Refund Method <span className="refund-required">*</span></label>
            <div className="refund-method-row">
              <button type="button" className={`refund-method-btn ${refundMethod === 'gcash' ? 'selected' : ''}`} onClick={() => { setRefundMethod('gcash'); setError(''); }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/GCash_logo.svg/200px-GCash_logo.svg.png" alt="GCash" className="refund-method-logo" /><span>GCash</span>{refundMethod === 'gcash' && <i className="fas fa-check-circle refund-method-check"></i>}
              </button>
              <button type="button" className={`refund-method-btn ${refundMethod === 'maya' ? 'selected' : ''}`} onClick={() => { setRefundMethod('maya'); setError(''); }}>
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Maya_logo.svg/200px-Maya_logo.svg.png" alt="Maya" className="refund-method-logo" /><span>Maya</span>{refundMethod === 'maya' && <i className="fas fa-check-circle refund-method-check"></i>}
              </button>
            </div>
          </div>
          {refundMethod && (
            <div className="refund-field-group refund-account-fields">
              <label className="refund-modal-label"><i className="fas fa-id-card"></i> Account Details <span className="refund-required">*</span></label>
              <input type="text" className="refund-input" placeholder="Account Name" value={accountName} onChange={e => { setAccountName(e.target.value); setError(''); }} maxLength={60} />
              <input type="tel" className="refund-input" placeholder="Mobile Number (09XXXXXXXXX)" value={accountNumber} onChange={e => { setAccountNumber(e.target.value); setError(''); }} maxLength={13} />
            </div>
          )}
          <div className="refund-field-group">
            <label className="refund-modal-label">Additional Details <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <textarea className="refund-comment-box" placeholder="Describe the damage…" value={comment} onChange={e => setComment(e.target.value)} rows={2} maxLength={500} />
          </div>
          {error && <div className="refund-error-msg"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="refund-modal-footer">
          <button className="refund-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="refund-submit-btn" onClick={handleSubmit} disabled={submitting || !photo || !refundMethod || !accountName || !accountNumber}>
            {uploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading…</> : submitting ? <><i className="fas fa-spinner fa-spin"></i> Submitting…</> : <><i className="fas fa-paper-plane"></i> Submit Refund Request</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const RefundBadge = ({ status }) => {
  if (!status) return null;
  const config = {
    requested: { icon: 'fa-clock',        label: 'Refund Pending',  cls: 'refund-badge-pending'  },
    approved:  { icon: 'fa-check-circle', label: 'Refund Approved', cls: 'refund-badge-approved' },
    rejected:  { icon: 'fa-times-circle', label: 'Refund Rejected', cls: 'refund-badge-rejected' },
  };
  const c = config[status];
  if (!c) return null;
  return <span className={`refund-status-badge ${c.cls}`}><i className={`fas ${c.icon}`}></i> {c.label}</span>;
};

// ─── RIDER MAP ────────────────────────────────────────────────────────────────
const RiderMap = ({ orderId, riderName, orderData }) => {
  const mapRef             = useRef(null);
  const mapInstanceRef     = useRef(null);
  const markerRef          = useRef(null);
  const lastKnownMarkerRef = useRef(null);
  const destMarkerRef      = useRef(null);
  const accuracyCircleRef  = useRef(null);
  const routeLineRef       = useRef(null);
  const [mapReady,      setMapReady]      = useState(false);
  const [mapError,      setMapError]      = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(!!window.L);
  const [lastUpdateTime,setLastUpdateTime]= useState(null);

  const locationData = useQuery(api.riders.getRiderLocation, orderId ? { orderId } : 'skip');

  const isLive      = !!(locationData?.isTracking && locationData?.lat && locationData?.lng &&
                       (Date.now() - locationData.updatedAt) < 30000);
  const hasLastKnown = !!(locationData?.lastKnownLat && locationData?.lastKnownLng);

  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) { if (window.L) { setLeafletLoaded(true); return; } existing.addEventListener('load', () => setLeafletLoaded(true)); return; }
    const script = document.createElement('script');
    script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload  = () => setLeafletLoaded(true);
    script.onerror = () => setMapError('Failed to load map.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletLoaded || mapInstanceRef.current || !mapRef.current) return;
    try {
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true, tap: false, scrollWheelZoom: true }).setView([14.5995, 120.9842], 15);
      map.zoomControl.setPosition('bottomright');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
      const riderIcon = L.divIcon({
        className: '',
        html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">🛵</div>`,
        iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -26],
      });
      const marker = L.marker([14.5995, 120.9842], { icon: riderIcon, opacity: 0 }).addTo(map)
        .bindPopup(`<div class="rider-map-popup"><strong>🛵 ${riderName || 'Your Rider'}</strong><br><small>Waiting for location…</small></div>`);
      mapInstanceRef.current = map; markerRef.current = marker;
      setMapReady(true);
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);
    } catch { setMapError('Failed to initialize map.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletLoaded]);

  useEffect(() => {
    const h = () => { if (document.visibilityState === 'visible' && mapInstanceRef.current) setTimeout(() => { try { mapInstanceRef.current?.invalidateSize(); } catch {} }, 200); };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, []);

  const clearRoute = useCallback(() => {
    if (routeLineRef.current) {
      if (Array.isArray(routeLineRef.current)) { routeLineRef.current.forEach(l => { try { l.remove(); } catch {} }); }
      else { try { routeLineRef.current.remove(); } catch {} }
      routeLineRef.current = null;
    }
  }, []);

  const drawRoute = useCallback((lat, lng, destLat, destLng, dashed = false) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L   = window.L;
    const map = mapInstanceRef.current;
    clearRoute();
    if (dashed) {
      try {
        routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#9ca3af', weight: 3, opacity: 0.75, dashArray: '8, 8' }).addTo(map);
        map.fitBounds(L.latLngBounds([lat, lng], [destLat, destLng]), { padding: [48, 48], maxZoom: 17 });
      } catch {}
      return;
    }
    fetch(`https://router.project-osrm.org/route/v1/bike/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        if (!mapInstanceRef.current) return;
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const coords  = data.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
          const outline = L.polyline(coords, { color: 'white',   weight: 7, opacity: 0.5, lineJoin: 'round', lineCap: 'round' }).addTo(map);
          const line    = L.polyline(coords, { color: '#e53e3e', weight: 4, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(map);
          routeLineRef.current = [outline, line];
          map.fitBounds(L.latLngBounds(coords), { padding: [48, 48], maxZoom: 17 });
        } else {
          routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }).addTo(map);
          map.fitBounds(L.latLngBounds([lat, lng], [destLat, destLng]), { padding: [48, 48], maxZoom: 17 });
        }
      })
      .catch(() => {
        if (!mapInstanceRef.current) return;
        try {
          routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }).addTo(map);
          map.fitBounds(L.latLngBounds([lat, lng], [destLat, destLng]), { padding: [48, 48], maxZoom: 17 });
        } catch {}
      });
  }, [clearRoute]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !markerRef.current || !window.L) return;
    const L       = window.L;
    const map     = mapInstanceRef.current;
    const destLat = orderData?.addressLat;
    const destLng = orderData?.addressLng;

    if (destLat && destLng && !destMarkerRef.current) {
      try {
        const destIcon = L.divIcon({
          html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">📍</div>`,
          className: '', iconSize: [40, 40], iconAnchor: [20, 40],
        });
        destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
      } catch {}
    }

    if (isLive) {
      const { lat, lng, accuracy, updatedAt } = locationData;
      if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} lastKnownMarkerRef.current = null; }
      try { markerRef.current.setLatLng([lat, lng]); markerRef.current.setOpacity(1); } catch {}
      markerRef.current.getPopup()?.setContent(`<div class="rider-map-popup"><strong>🛵 ${riderName || 'Your Rider'}</strong><br><small>📍 Live</small></div>`);
      if (accuracyCircleRef.current) { try { map.removeLayer(accuracyCircleRef.current); } catch {} accuracyCircleRef.current = null; }
      if (accuracy && accuracy < 2000) {
        try { accuracyCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#7c3aed', fillColor: '#7c3aed', fillOpacity: 0.08, weight: 1.5 }).addTo(map); } catch {}
      }
      if (destLat && destLng) { drawRoute(lat, lng, destLat, destLng, false); }
      else { try { map.panTo([lat, lng], { animate: true, duration: 0.8 }); } catch {} }
      setLastUpdateTime(new Date(updatedAt));
      return;
    }

    if (!isLive && hasLastKnown) {
      const { lastKnownLat, lastKnownLng, lastKnownAt, lastKnownAddress } = locationData;
      try { markerRef.current.setOpacity(0); } catch {}
      if (accuracyCircleRef.current) { try { map.removeLayer(accuracyCircleRef.current); } catch {} accuracyCircleRef.current = null; }
      if (!lastKnownMarkerRef.current) {
        try {
          const ghostIcon = L.divIcon({
            className: '',
            html: `<div style="position:relative;width:44px;height:44px;">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,#6b7280,#9ca3af);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(107,114,128,0.45);display:flex;align-items:center;justify-content:center;font-size:22px;opacity:0.88;">🛵</div>
              <div style="position:absolute;top:-5px;right:-5px;background:#f59e0b;color:white;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;">!</div>
            </div>`,
            iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -26],
          });
          const lastTimeStr = lastKnownAt ? new Date(lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
          lastKnownMarkerRef.current = L.marker([lastKnownLat, lastKnownLng], { icon: ghostIcon })
            .addTo(map)
            .bindPopup(`<div class="rider-map-popup"><strong>🛵 ${riderName || 'Your Rider'}</strong><br><small style="color:#f59e0b;font-weight:600">⚠️ Last seen ${lastTimeStr}</small><br>${lastKnownAddress ? `<small style="color:#6b7280">📍 ${lastKnownAddress}</small>` : ''}</div>`);
        } catch {}
      } else {
        try { lastKnownMarkerRef.current.setLatLng([lastKnownLat, lastKnownLng]); } catch {}
      }
      if (destLat && destLng) { drawRoute(lastKnownLat, lastKnownLng, destLat, destLng, true); }
      else { try { map.panTo([lastKnownLat, lastKnownLng], { animate: true, duration: 0.8 }); } catch {} }
      if (lastKnownAt) setLastUpdateTime(new Date(lastKnownAt));
      return;
    }

    if (destLat && destLng) { try { map.setView([destLat, destLng], 15); } catch {} }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationData, mapReady]);

  useEffect(() => () => {
    clearRoute();
    if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} lastKnownMarkerRef.current = null; }
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch {}
      mapInstanceRef.current = null; markerRef.current = null; destMarkerRef.current = null; accuracyCircleRef.current = null;
    }
  }, [clearRoute]);

  const lastKnownTimeStr = locationData?.lastKnownAt ? new Date(locationData.lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : null;
  const lastKnownAddr = locationData?.lastKnownAddress;

  const statusClass = !locationData ? 'status-waiting' : isLive ? 'status-live' : hasLastKnown ? 'status-stopped' : locationData.isTracking ? 'status-stale' : 'status-stopped';
  const statusContent = !locationData
    ? <><span className="map-status-dot dot-waiting"></span> Waiting for rider to share location…</>
    : isLive
    ? <><span className="map-status-dot dot-live"></span> <strong>Live</strong> · Updated {lastUpdateTime?.toLocaleTimeString()}</>
    : hasLastKnown
    ? <><span className="map-status-dot dot-stopped"></span><span style={{ display:'flex', flexDirection:'column', gap:2 }}><span>Rider offline · Last seen {lastKnownTimeStr || 'unknown'}</span>{lastKnownAddr && <span style={{ fontSize:'0.72rem', color:'#6b7280' }}>📍 {lastKnownAddr}</span>}</span></>
    : <><span className="map-status-dot dot-stopped"></span> Rider stopped sharing location</>;

  if (mapError) return <div className="rider-map-error"><i className="fas fa-map-marked-alt"></i><p>{mapError}</p><small>Try refreshing.</small></div>;

  return (
    <div className="rider-map-wrapper">
      <div className={`rider-map-status-bar ${statusClass}`}>{statusContent}</div>
      <div ref={mapRef} className="rider-map-container" />
      {isLive && (
        <div className="rider-map-accuracy">
          {locationData.accuracy && <span><i className="fas fa-crosshairs"></i> ±{Math.round(locationData.accuracy)}m</span>}
          {locationData.speed > 0 && <span style={{ marginLeft: 10 }}><i className="fas fa-tachometer-alt"></i> {Math.round((locationData.speed || 0) * 3.6)} km/h</span>}
          <span style={{ marginLeft: 'auto', color: '#e53e3e', fontWeight: 700 }}>━━ Route &nbsp;·&nbsp; 🛵 = Rider &nbsp;·&nbsp; 📍 = You</span>
        </div>
      )}
      {!isLive && hasLastKnown && (
        <div className="rider-map-accuracy" style={{ background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
          <span style={{ color: '#92400e' }}><i className="fas fa-exclamation-triangle" style={{ marginRight: 5 }}></i>Showing last known location{lastKnownAddr && <> · <strong>{lastKnownAddr}</strong></>}</span>
          <span style={{ marginLeft: 'auto', color: '#9ca3af', fontWeight: 700 }}>- - = Last seen &nbsp;·&nbsp; 📍 = You</span>
        </div>
      )}
      {!locationData && (
        <div className="rider-map-waiting-overlay">
          <div className="rider-map-waiting-inner">
            <i className="fas fa-motorcycle"></i>
            <p>Rider hasn't shared location yet</p>
            <small>Updates automatically when rider starts moving</small>
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
  const orderIdParam = searchParams.get('order') || searchParams.get('orderId') || searchParams.get('id');

  const [filter,             setFilter]             = useState('active');
  const [selectedOrderId,    setSelectedOrderId]    = useState(null);
  const [qrOrder,            setQrOrder]            = useState(null); // ← for QR scan guest view
  const [trackingEmail,      setTrackingEmail]      = useState('');
  const [searchEmail,        setSearchEmail]        = useState('');
  const [showTrackedOrders,  setShowTrackedOrders]  = useState(false);
  const [lightboxData,       setLightboxData]       = useState(null);
  const [removeConfirm,      setRemoveConfirm]      = useState(null);
  const [refundOrder,        setRefundOrder]        = useState(null);
  const [refundSuccess,      setRefundSuccess]      = useState(false);
  const [hiddenOrders,       setHiddenOrders]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('hiddenDeliveredOrders') || '[]'); } catch { return []; }
  });

  const orders           = useUserOrders(isAuthenticated ? user?.email : null) || [];
  const emailOrders      = useOrdersByEmail(searchEmail) || [];
  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const products         = [...regularProducts, ...preOrderProducts];
  const allAvailableOrders = [...orders, ...emailOrders];
  const selectedOrder = selectedOrderId ? allAvailableOrders.find(o => o._id === selectedOrderId) || null : null;

  // ── Direct lookup via QR scan (works for guests) ──
  const directOrder = useQuery(
    api.orders.getOrderById,
    orderIdParam && !selectedOrderId ? { orderId: orderIdParam } : 'skip'
  );

  const urlParamProcessedRef = useRef(false);

  useEffect(() => {
    if (urlParamProcessedRef.current) return;
    if (!orderIdParam) return;

    // First try to find in own orders (authenticated)
    const found = [...orders, ...emailOrders].find(o => o.orderId === orderIdParam);
    if (found) {
      urlParamProcessedRef.current = true;
      setSelectedOrderId(found._id);
      return;
    }

    // Fallback: use directOrder from Convex (works for anyone scanning QR)
    if (directOrder !== undefined) {
      urlParamProcessedRef.current = true;
      if (directOrder) setQrOrder(directOrder);
    }
  }, [orderIdParam, orders, emailOrders, directOrder]);

  const handleCloseModal = useCallback(() => setSelectedOrderId(null), []);
  const handleOpenModal  = useCallback((order) => setSelectedOrderId(order._id), []);
  const getProductById   = useCallback((id) => products.find(p => p._id === id || p.id === id), [products]);

  const getStatusClass = (status) => {
    const map = {
      'Processing': 'status-processing', 'Confirmed': 'status-confirmed', 'Shipped': 'status-shipped',
      'Out for Delivery': 'status-delivery', 'out_for_delivery': 'status-delivery', 'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled', 'pending': 'status-processing', 'confirmed': 'status-confirmed',
      'shipped': 'status-shipped', 'completed': 'status-delivered', 'cancelled': 'status-cancelled',
      'Pending Payment': 'status-pending-payment',
    };
    return map[status] || 'status-processing';
  };

  const getDisplayStatus = (order) => {
    const s = order.orderStatus || order.status || 'pending';
    const labels = {
      pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery', completed: 'Delivered', cancelled: 'Cancelled',
      Processing: 'Processing', Confirmed: 'Confirmed', Shipped: 'Shipped',
      'Out for Delivery': 'Out for Delivery', Delivered: 'Delivered', Cancelled: 'Cancelled',
      'Pending Payment': 'Pending Payment',
    };
    return labels[s] || s;
  };

  const isPendingPayment       = (order) => order.status === 'Pending Payment' && order.paymentStatus !== 'paid';
  const isDelivered            = (order) => { const s = (order.orderStatus || order.status || '').toLowerCase(); return s === 'delivered' || s === 'completed'; };
  const isCancelledOrder       = (order) => { const s = (order.orderStatus || order.status || '').toLowerCase(); return s === 'cancelled'; };
  const isOutForDeliveryStatus = (order) => {
    const check = (val) => { if (!val) return false; return val.toLowerCase().replace(/[\s_-]+/g, '_') === 'out_for_delivery'; };
    return check(order.orderStatus) || check(order.status);
  };

  const getTimelineSteps = (order) => {
    const status = (order.orderStatus || order.status || 'pending').toLowerCase().replace(/\s+/g, '_');
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
    if (status === 'cancelled') return [
      { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true, time: fmt(order._creationTime) },
      { label: 'Payment',      icon: 'fa-credit-card',   completed: !!order.paidAt, time: fmt(order.paidAt) },
      { label: 'Cancelled',    icon: 'fa-times-circle',  completed: true, isCancelled: true, cancelReason: order.cancelReason },
    ];
    return [
      { label: 'Order Placed',      icon: 'fa-shopping-cart', completed: true, time: fmt(order._creationTime), desc: 'Your order has been placed.' },
      { label: 'Payment Confirmed', icon: 'fa-credit-card',   completed: order.paymentStatus === 'paid', time: fmt(order.paidAt), desc: order.paymentStatus === 'paid' ? 'Payment received.' : 'Waiting for payment.' },
      { label: 'Order Confirmed',   icon: 'fa-check-circle',  completed: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status), time: fmt(order.confirmedAt), desc: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status) ? 'Admin confirmed your order.' : 'Waiting for confirmation.' },
      { label: 'Rider Assigned',    icon: 'fa-motorcycle',    completed: ['shipped','out_for_delivery','delivered','completed'].includes(status), time: fmt(order.shippedAt), desc: order.riderInfo ? `${order.riderInfo.name} will deliver your order.` : ['shipped','out_for_delivery','delivered','completed'].includes(status) ? 'Rider assigned.' : 'Waiting for rider.' },
      { label: 'Out for Delivery',  icon: 'fa-shipping-fast', completed: ['out_for_delivery','delivered','completed'].includes(status), time: fmt(order.outForDeliveryAt), desc: ['out_for_delivery','delivered','completed'].includes(status) ? 'Your rider is on the way!' : 'Waiting for pickup.' },
      { label: 'Delivered',         icon: 'fa-check-double',  completed: ['delivered','completed'].includes(status), time: fmt(order.deliveryConfirmedAt), desc: ['delivered','completed'].includes(status) ? 'Delivered successfully!' : 'Waiting for delivery.' },
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
  const sortByNewest  = (arr) => [...arr].sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const visibleOrders   = sortByNewest(orders.filter(o => !hiddenOrders.includes(o._id)));
  const activeOrders    = visibleOrders.filter(o => !isDelivered(o) && !isCancelledOrder(o));
  const deliveredOrders = visibleOrders.filter(o => isDelivered(o));
  const cancelledOrders = visibleOrders.filter(o => isCancelledOrder(o));
  const filteredOrders  = visibleOrders.filter(o => {
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

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    const email = trackingEmail.trim();
    if (!email) { alert('Please enter your email address'); return; }
    setSearchEmail(email); setShowTrackedOrders(true); setSelectedOrderId(null);
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

  const handleRefundSuccess = () => { setRefundOrder(null); setRefundSuccess(true); setTimeout(() => setRefundSuccess(false), 4000); };

  // ─── ORDER CARD ────────────────────────────────────────────────────────────
  const OrderCard = ({ order, onViewDetails, isGuest = false }) => {
    const scrollRef = useRef(null);
    const [activeImgIdx,       setActiveImgIdx]       = useState(0);
    const [continuingPayment,  setContinuingPayment]  = useState(false);
    const createPaymentLink = useAction(api.payments.createPaymentLink);

    const ordDate      = order._creationTime ? new Date(order._creationTime) : null;
    const orderStatus  = getDisplayStatus(order);
    const statusKey    = order.orderStatus || order.status || 'pending';
    const delivered    = isDelivered(order);
    const releaseDate  = getPreOrderReleaseDate(order);
    const needsPayment = isPendingPayment(order);
    const { canRefund, hoursLeft, expired } = getRefundWindow(order);

    const itemImages = (order.items || []).map(item => {
      const product = getProductById(item.id);
      return { src: item.image || product?.image || null, name: item.name || product?.name || 'Item' };
    }).filter(i => i.src);

    const scrollTo = (idx) => {
      setActiveImgIdx(idx);
      if (scrollRef.current) { const child = scrollRef.current.children[idx]; if (child) child.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }
    };

    const handleContinuePayment = async () => {
      setContinuingPayment(true);
      try {
        if (order.paymentLinkUrl) { window.location.href = order.paymentLinkUrl; return; }
        const result = await createPaymentLink({ orderId: order.orderId, amount: order.finalTotal ?? order.total, description: `DKMerch Order ${order.orderId}`, customerName: order.customerName, customerEmail: order.email, customerPhone: order.phone });
        window.location.href = result.paymentLinkUrl;
      } catch { alert('Failed. Please try again.'); setContinuingPayment(false); }
    };

    return (
      <div className="order-card">
        <div className="order-card-img-wrap">
          <span className={`order-status-overlay ${getStatusClass(statusKey)}`}>{orderStatus}</span>
          {itemImages.length > 0 ? (
            <>
              <div className="order-img-strip" ref={scrollRef}>
                {itemImages.map((img, idx) => (
                  <div key={idx} className={`order-img-slide ${idx === activeImgIdx ? 'active' : ''}`} onClick={() => openLightbox(itemImages.map(i => i.src), idx)} title="Click to enlarge">
                    <img src={img.src} alt={img.name} /><div className="order-img-zoom"><i className="fas fa-search-plus"></i></div>
                  </div>
                ))}
              </div>
              {itemImages.length > 1 && (
                <>
                  <div className="order-img-dots">{itemImages.map((_, idx) => <button key={idx} className={`order-img-dot ${idx === activeImgIdx ? 'active' : ''}`} onClick={() => scrollTo(idx)} />)}</div>
                  <button className="order-img-arrow order-img-arrow-left" onClick={() => scrollTo((activeImgIdx - 1 + itemImages.length) % itemImages.length)}><i className="fas fa-chevron-left"></i></button>
                  <button className="order-img-arrow order-img-arrow-right" onClick={() => scrollTo((activeImgIdx + 1) % itemImages.length)}><i className="fas fa-chevron-right"></i></button>
                </>
              )}
            </>
          ) : <div className="order-no-img-wrap"><i className="fas fa-box order-no-img"></i></div>}
        </div>
        <div className="order-card-info">
          <p className="order-card-id">Order #{order.orderId?.slice(-8) || 'N/A'}</p>
          <p className="order-card-name">
            {order.items?.[0]?.name || getProductById(order.items?.[0]?.id)?.name || 'Order'}
            {(order.items?.length || 1) > 1 && <span className="order-and-more"> +{order.items.length - 1} more</span>}
          </p>
          {releaseDate && <div className="order-card-preorder-badge"><i className="fas fa-calendar-alt"></i><span>Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>}
          {delivered && order.refundStatus && <div style={{ marginBottom: 6 }}><RefundBadge status={order.refundStatus} /></div>}
          {!isGuest && delivered && !order.refundStatus && canRefund && <div className="order-card-refund-timer"><i className="fas fa-hourglass-half"></i><span>Refund window: <strong>{hoursLeft}h left</strong></span></div>}
          {!isGuest && delivered && !order.refundStatus && expired && <div className="order-card-refund-expired"><i className="fas fa-clock"></i><span>Refund window expired</span></div>}
          <div className="order-card-meta">
            <span className={`order-status-text ${getStatusClass(statusKey)}`}><i className="fas fa-circle"></i> {orderStatus}</span>
            {ordDate && <span className="order-card-date"><i className="fas fa-calendar-alt"></i>{ordDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
          </div>
          <div className="order-card-price-row"><span className="order-card-price">₱{order.total?.toLocaleString()}</span></div>
          {!isGuest && needsPayment ? (
            <>
              <button className="btn btn-continue-payment" onClick={handleContinuePayment} disabled={continuingPayment}>{continuingPayment ? <><i className="fas fa-spinner fa-spin"></i> Loading…</> : <><i className="fas fa-credit-card"></i> Continue Payment</>}</button>
              <button className="btn btn-outline btn-small order-view-btn" style={{ marginTop: '6px' }} onClick={() => onViewDetails(order)}><i className="fas fa-search"></i> View Details</button>
            </>
          ) : (
            <button className="btn btn-primary btn-small order-view-btn" onClick={() => onViewDetails(order)}><i className="fas fa-search"></i> View Details</button>
          )}
          {!isGuest && delivered && !order.refundStatus && canRefund && <button className="btn order-refund-btn" onClick={() => setRefundOrder(order)}><i className="fas fa-undo-alt"></i> Request Refund</button>}
          {!isGuest && delivered && order.refundStatus === 'rejected' && canRefund && <button className="btn order-refund-btn order-refund-retry-btn" onClick={() => setRefundOrder(order)}><i className="fas fa-redo"></i> Request Again</button>}
          {!isGuest && delivered && <button className="btn order-remove-btn" onClick={() => setRemoveConfirm(order._id)}><i className="fas fa-trash-alt"></i> Remove</button>}
          {isGuest && delivered && !order.refundStatus && canRefund && <div className="guest-login-prompt"><i className="fas fa-lock"></i><span><a href="/login" onClick={e => { e.preventDefault(); navigate('/'); }}>Log in</a> to request a refund</span></div>}
        </div>
      </div>
    );
  };

  const Lightbox = () => {
    if (!lightboxData) return null;
    const { images, index } = lightboxData;
    const hasMultiple = images.length > 1;
    useEffect(() => {
      const onKey = (e) => { if (e.key === 'Escape') closeLightbox(); if (e.key === 'ArrowRight' && hasMultiple) lightboxNext(); if (e.key === 'ArrowLeft' && hasMultiple) lightboxPrev(); };
      window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
    }, [hasMultiple]);
    return (
      <div className="order-lightbox" onClick={closeLightbox}>
        <button className="lightbox-close" onClick={closeLightbox}><i className="fas fa-times"></i></button>
        {hasMultiple && <button className="lightbox-arrow lightbox-arrow-left" onClick={e => { e.stopPropagation(); lightboxPrev(); }}><i className="fas fa-chevron-left"></i></button>}
        <img src={images[index]} alt={`Item ${index + 1}`} onClick={e => e.stopPropagation()} />
        {hasMultiple && <button className="lightbox-arrow lightbox-arrow-right" onClick={e => { e.stopPropagation(); lightboxNext(); }}><i className="fas fa-chevron-right"></i></button>}
        {hasMultiple && <div className="lightbox-dots">{images.map((_, i) => <button key={i} className={`lightbox-dot ${i === index ? 'active' : ''}`} onClick={e => { e.stopPropagation(); setLightboxData(prev => ({ ...prev, index: i })); }} />)}</div>}
        {hasMultiple && <div className="lightbox-counter">{index + 1} / {images.length}</div>}
      </div>
    );
  };

  // ─── QR SCAN VIEW — show order modal immediately, no login needed ──────────
  if (orderIdParam && qrOrder && !isAuthenticated) {
    return (
      <main className="trackorder-main">
        <div className="page-header">
          <div className="container">
            <h1 className="page-title">Order Tracking</h1>
            <p className="page-description">Scan result — Order #{qrOrder.orderId?.slice(-8)}</p>
          </div>
        </div>
        <TrackingModal
          key={qrOrder.orderId}
          order={qrOrder}
          products={products}
          onClose={() => { setQrOrder(null); navigate('/track-order'); }}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
          getDisplayStatus={getDisplayStatus}
          isOutForDeliveryStatus={isOutForDeliveryStatus}
          onRequestRefund={null}
          isGuest={true}
        />
      </main>
    );
  }

  // ─── AUTHENTICATED VIEW ────────────────────────────────────────────────────
  if (isAuthenticated && user) {
    const activeTab = FILTERS.find(f => f.key === filter);
    return (
      <main className="trackorder-main">
        <div className="page-header"><div className="container"><h1 className="page-title">Track Orders</h1><p className="page-description">Track and manage your orders</p></div></div>
        <div className="container">
          <section className="track-order-page">
            {refundSuccess && <div className="refund-success-toast"><i className="fas fa-check-circle"></i> Refund request submitted! We'll review it within 1-3 business days.</div>}
            <div className="orders-tab-bar">
              {FILTERS.map(f => (
                <button key={f.key} className={`orders-tab-btn ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
                  <i className={`fas ${f.icon}`}></i><span className="tab-label">{f.label}</span>
                  {f.count > 0 && <span className={`tab-count ${filter === f.key ? 'tab-count-active' : ''}`}>{f.count}</span>}
                </button>
              ))}
            </div>
            <div className="tab-context-bar"><i className={`fas ${activeTab?.icon}`}></i><span><strong>{activeTab?.label}</strong> — {activeTab?.desc}{filteredOrders.length > 0 && <span className="tab-context-count"> · {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</span>}</span></div>
            {filteredOrders.length === 0 ? (
              <div className="orders-empty">
                <i className={`fas ${activeTab?.icon}`}></i><h3>No {activeTab?.label} Yet</h3>
                <p>{filter === 'active' && 'No active orders.'}{filter === 'delivered' && 'No delivered orders.'}{filter === 'cancelled' && 'No cancelled orders.'}</p>
                {filter === 'active' && <button className="btn btn-primary" onClick={() => navigate('/collections')}><i className="fas fa-shopping-bag"></i> Start Shopping</button>}
              </div>
            ) : (
              <div className="orders-grid">{filteredOrders.map(order => <OrderCard key={order._id} order={order} onViewDetails={handleOpenModal} isGuest={false} />)}</div>
            )}
          </section>
        </div>
        {selectedOrder && <TrackingModal key={selectedOrderId} order={selectedOrder} products={products} onClose={handleCloseModal} getTimelineSteps={getTimelineSteps} getStatusClass={getStatusClass} getDisplayStatus={getDisplayStatus} isOutForDeliveryStatus={isOutForDeliveryStatus} onRequestRefund={(order) => { handleCloseModal(); setRefundOrder(order); }} isGuest={false} />}
        {refundOrder && <RefundModal order={refundOrder} onClose={() => setRefundOrder(null)} onSuccess={handleRefundSuccess} />}
        <Lightbox />
        {removeConfirm && (
          <div className="remove-confirm-overlay" onClick={() => setRemoveConfirm(null)}>
            <div className="remove-confirm-dialog" onClick={e => e.stopPropagation()}>
              <div className="remove-confirm-icon"><i className="fas fa-trash-alt"></i></div>
              <h3>Remove Order?</h3><p>Remove this order from your list?</p>
              <div className="remove-confirm-actions">
                <button className="btn btn-outline" onClick={() => setRemoveConfirm(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => handleRemoveOrder(removeConfirm)}><i className="fas fa-trash-alt"></i> Remove</button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ─── GUEST VIEW ────────────────────────────────────────────────────────────
  return (
    <main className="trackorder-main">
      <div className="page-header"><div className="container"><h1 className="page-title">Track Your Order</h1><p className="page-description">Enter your email to view your order status</p></div></div>
      <div className="container">
        <section className="track-order-page">
          <div className="tracking-form-section">
            <div className="tracking-form">
              <h2>Find My Orders</h2>
              <form onSubmit={handleFindMyOrders}>
                <div className="form-group"><label htmlFor="tracking-email">Email Address</label><input type="email" id="tracking-email" className="form-control" placeholder="Enter your email" value={trackingEmail} onChange={e => setTrackingEmail(e.target.value)} required /><small>Email used when placing your order</small></div>
                <button type="submit" className="btn btn-primary"><i className="fas fa-search"></i> Find My Orders</button>
              </form>
            </div>
            <div className="tracking-info"><h3>How to Track</h3><ul><li><i className="fas fa-check"></i> Enter your email address</li><li><i className="fas fa-check"></i> View all your orders</li><li><i className="fas fa-check"></i> See real-time status</li></ul></div>
          </div>
          {showTrackedOrders && emailOrders.length > 0 && (
            <div className="tracked-orders-section">
              <div className="tracked-orders-header"><h2>Your Orders</h2><p>Found {emailOrders.length} order{emailOrders.length > 1 ? 's' : ''} for {searchEmail}</p>
                <div className="guest-login-notice"><i className="fas fa-info-circle"></i><span>Viewing as guest. <a href="/login" onClick={e => { e.preventDefault(); navigate('/'); }}>Log in</a> for full access.</span></div>
              </div>
              <div className="orders-grid">{sortByNewest(emailOrders).map(order => <OrderCard key={order._id} order={order} onViewDetails={handleOpenModal} isGuest={true} />)}</div>
            </div>
          )}
          {showTrackedOrders && emailOrders.length === 0 && <div className="orders-empty"><i className="fas fa-search"></i><h3>No orders found</h3><p>No orders for {searchEmail}.</p></div>}
        </section>
      </div>
      {selectedOrder && <TrackingModal key={selectedOrderId} order={selectedOrder} products={products} onClose={handleCloseModal} getTimelineSteps={getTimelineSteps} getStatusClass={getStatusClass} getDisplayStatus={getDisplayStatus} isOutForDeliveryStatus={isOutForDeliveryStatus} onRequestRefund={null} isGuest={true} />}
      <Lightbox />
    </main>
  );
};

// ─── TRACKING MODAL ──────────────────────────────────────────────────────────
const TrackingModal = ({ order, products, onClose, getTimelineSteps, getStatusClass, getDisplayStatus, isOutForDeliveryStatus, onRequestRefund, isGuest = false }) => {
  const updateOrderOtp    = useUpdateOrderOtp();
  const createPaymentLink = useAction(api.payments.createPaymentLink);
  const [generatingOtp,     setGeneratingOtp]     = useState(false);
  const [localOtp,          setLocalOtp]          = useState(order.deliveryOtp || null);
  const [continuingPayment, setContinuingPayment] = useState(false);

  const isCancelled      = (order.orderStatus || order.status || '').toLowerCase() === 'cancelled';
  const isOutForDelivery = isOutForDeliveryStatus(order);
  const needsPayment     = order.status === 'Pending Payment' && order.paymentStatus !== 'paid';
  const delivered        = ['delivered','completed'].includes((order.orderStatus || order.status || '').toLowerCase());
  const timelineSteps    = getTimelineSteps(order);
  const refundAmount     = (order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
  const { canRefund, hoursLeft, minsLeft, expired } = getRefundWindow(order);

  useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);
  useEffect(() => { if (order.deliveryOtp) setLocalOtp(order.deliveryOtp); }, [order.deliveryOtp]);
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey); return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const getProductById = (id) => products.find(p => p._id === id || p.id === id);

  const handleGenerateOtp = async () => {
    if (localOtp) return;
    setGeneratingOtp(true);
    try {
      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      await updateOrderOtp({ orderId: order.orderId, deliveryOtp: otp });
      setLocalOtp(otp);
    } catch { alert('Failed to generate OTP. Please try again.'); }
    finally { setGeneratingOtp(false); }
  };

  const handleContinuePayment = async () => {
    setContinuingPayment(true);
    try {
      if (order.paymentLinkUrl) { window.location.href = order.paymentLinkUrl; return; }
      const result = await createPaymentLink({ orderId: order.orderId, amount: order.finalTotal ?? order.total, description: `DKMerch Order ${order.orderId}`, customerName: order.customerName, customerEmail: order.email, customerPhone: order.phone });
      window.location.href = result.paymentLinkUrl;
    } catch { alert('Failed. Please try again.'); setContinuingPayment(false); }
  };

  return (
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} type="button"><i className="fas fa-times"></i></button>
        <div className="tracking-result">

          <div className="result-header">
            <h2>Order #{order.orderId?.slice(-8) || 'N/A'}</h2>
            <div className={`status-badge ${getStatusClass(order.orderStatus || order.status)}`}>{getDisplayStatus(order)}</div>
          </div>

          {isGuest && (
            <div className="guest-modal-notice"><i className="fas fa-lock"></i><span>Viewing as guest — order timeline only. <a href="/login" onClick={e => { e.preventDefault(); onClose(); }}>Log in</a> for full access.</span></div>
          )}

          {!isGuest && needsPayment && (
            <div className="pending-payment-banner">
              <div className="pending-payment-icon"><i className="fas fa-exclamation-circle"></i></div>
              <div className="pending-payment-text"><strong>Payment Incomplete</strong><p>Your order is reserved but payment was not completed.</p></div>
              <button className="btn btn-continue-payment" onClick={handleContinuePayment} disabled={continuingPayment}>{continuingPayment ? <><i className="fas fa-spinner fa-spin"></i> Loading…</> : <><i className="fas fa-credit-card"></i> Complete Payment</>}</button>
            </div>
          )}

          {order.riderInfo && !isCancelled && (
            <div className="rider-info-banner">
              <div className="rider-info-icon"><i className="fas fa-motorcycle"></i></div>
              <div className="rider-info-details">
                <strong>Your Rider: {order.riderInfo.name || '—'}</strong>
                <span>🏍️ Motorcycle{order.riderInfo.plate ? ` • ${order.riderInfo.plate}` : ''}</span>
                {order.riderInfo.phone && <span><i className="fas fa-phone"></i> {order.riderInfo.phone}</span>}
              </div>
            </div>
          )}

          {isCancelled && (
            <div className="cancelled-banner">
              <div className="cancelled-banner-icon"><i className="fas fa-ban"></i></div>
              <div className="cancelled-banner-text"><strong>Order Cancelled</strong><p>{order.cancelReason || 'This order has been cancelled.'}</p></div>
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
                <strong>{order.refundStatus === 'requested' && 'Refund Pending'}{order.refundStatus === 'approved' && `Refund Approved — ₱${refundAmount}`}{order.refundStatus === 'rejected' && 'Refund Rejected'}</strong>
                <p>{order.refundStatus === 'requested' && 'Under review.'}{order.refundStatus === 'approved' && (order.refundAdminNote || 'Refund approved.')}{order.refundStatus === 'rejected' && (order.refundAdminNote || 'Not approved.')}</p>
              </div>
            </div>
          )}

          {!isGuest && delivered && !order.refundStatus && canRefund && <div className="refund-window-banner"><i className="fas fa-hourglass-half"></i><span>Refund window: <strong>{hoursLeft}h {minsLeft}m</strong> left.</span></div>}
          {!isGuest && delivered && !order.refundStatus && expired && <div className="refund-window-banner refund-window-expired"><i className="fas fa-clock"></i><span>Refund window expired.</span></div>}
          {!isGuest && delivered && (!order.refundStatus || order.refundStatus === 'rejected') && canRefund && (
            <button className="modal-refund-btn" onClick={() => onRequestRefund(order)}><i className="fas fa-undo-alt"></i>{order.refundStatus === 'rejected' ? 'Request Again' : 'Request Refund'}</button>
          )}

          {isOutForDelivery && (
            <div className="rider-map-section">
              <div className="rider-map-section-title">
                <i className="fas fa-map-marked-alt"></i>
                <span>Real-Time Rider Location</span>
                <span className="rider-map-live-pill">LIVE</span>
              </div>
              <RiderMap orderId={order.orderId} riderName={order.riderInfo?.name} orderData={order} />
            </div>
          )}

          {/* OTP — logged-in only, NOT shown to guest QR scanners */}
          {!isGuest && isOutForDelivery && (
            <div className="customer-otp-section">
              {!localOtp ? (
                <div className="otp-generate-card">
                  <div className="otp-generate-header">
                    <div className="otp-generate-icon"><i className="fas fa-shield-alt"></i></div>
                    <div><strong>Confirm Your Delivery</strong><p>Generate your OTP to give to the rider upon arrival.</p></div>
                  </div>
                  <div className="otp-generate-steps">
                    <div className="otp-step"><span className="otp-step-num">1</span><span>Tap below to generate your OTP</span></div>
                    <div className="otp-step"><span className="otp-step-num">2</span><span>Show the code to your rider</span></div>
                    <div className="otp-step"><span className="otp-step-num">3</span><span>Rider enters code to complete delivery</span></div>
                  </div>
                  <button className={`otp-generate-btn ${generatingOtp ? 'generating' : ''}`} onClick={handleGenerateOtp} disabled={generatingOtp}>
                    {generatingOtp ? <><i className="fas fa-spinner fa-spin"></i> Generating…</> : <><i className="fas fa-key"></i> Generate My OTP</>}
                  </button>
                  <p className="otp-generate-warning"><i className="fas fa-exclamation-triangle"></i> Only generate when your rider has arrived.</p>
                </div>
              ) : (
                <div className="otp-display-card">
                  <div className="otp-display-header">
                    <div className="otp-display-icon"><i className="fas fa-shield-alt"></i></div>
                    <div><strong>Your Delivery OTP</strong><p>Show this to your rider when they arrive</p></div>
                  </div>
                  <div className="otp-code-display">{localOtp.split('').map((digit, i) => <span key={i} className="otp-digit">{digit}</span>)}</div>
                  <div className="otp-display-note"><i className="fas fa-info-circle"></i><span>Only share with your rider upon receiving your package.</span></div>
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
                    {step.time && step.completed && <span className="timeline-timestamp"><i className="fas fa-clock"></i> {step.time}</span>}
                    <p className={step.completed ? 'timeline-desc-done' : 'timeline-desc-pending'}>{step.desc || (step.completed ? 'Completed' : 'Pending')}</p>
                    {step.isCancelled && step.cancelReason && <div className="timeline-cancel-reason"><div className="timeline-cancel-reason-label"><i className="fas fa-comment-alt"></i> Reason:</div><div className="timeline-cancel-reason-text">{step.cancelReason}</div></div>}
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
              const isPreOrder  = item.isPreOrder  || product?.isPreOrder;
              const releaseDate = item.releaseDate  || product?.releaseDate;
              return (
                <div key={index} className="order-item-timeline">
                  <div className="item-details">
                    <strong>{item.name || product?.name}</strong>
                    {isPreOrder && releaseDate && <span className="item-preorder-release"><i className="fas fa-calendar-alt"></i> Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                    <span>Qty: {qty}</span>
                  </div>
                  <div className="item-price">₱{((item.price || product?.price || 0) * qty).toLocaleString()}</div>
                </div>
              );
            })}
            <div className="order-items-total"><strong>Total</strong><strong>₱{order.total?.toLocaleString()}</strong></div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default TrackOrder;
// src/pages/RiderTrack.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './RiderTrack.css';

// ── Fullscreen Map Modal (like AdminRiders LiveMapModal) ──────────────────────
function FullscreenMapModal({ order, gpsCoords, onClose }) {
  const modalMapRef    = useRef(null);
  const modalMapObjRef = useRef(null);
  const modalRouteRef  = useRef(null);
  const modalRiderRef  = useRef(null);
  const modalDestRef   = useRef(null);

  // Init map when modal mounts
  useEffect(() => {
    if (!window.L || !modalMapRef.current) return;
    const L   = window.L;
    const map = L.map(modalMapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);

    const dLat = order?.addressLat || 14.5995;
    const dLng = order?.addressLng || 120.9842;

    // Destination marker
    const destIcon = L.divIcon({
      html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">📍</div>`,
      className: '', iconSize: [44, 44], iconAnchor: [22, 44],
    });
    modalDestRef.current = L.marker([dLat, dLng], { icon: destIcon }).addTo(map);
    modalDestRef.current.bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`);

    // Rider marker (if we have GPS)
    if (gpsCoords) {
      const riderIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
        className: '', iconSize: [36, 36], iconAnchor: [18, 18],
      });
      modalRiderRef.current = L.marker([gpsCoords.lat, gpsCoords.lng], { icon: riderIcon }).addTo(map);
      modalRiderRef.current.bindPopup('🛵 You are here');

      // Fit both
      const bounds = L.latLngBounds([gpsCoords.lat, gpsCoords.lng], [dLat, dLng]);
      map.fitBounds(bounds, { padding: [60, 60] });
    } else {
      map.setView([dLat, dLng], 15);
    }

    modalMapObjRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);

    // Draw route
    if (gpsCoords) {
      drawModalRoute(map, gpsCoords.lat, gpsCoords.lng, dLat, dLng);
    }

    return () => {
      try { map.remove(); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update rider marker when gpsCoords changes
  useEffect(() => {
    if (!modalMapObjRef.current || !gpsCoords || !window.L) return;
    const L    = window.L;
    const dLat = order?.addressLat || 14.5995;
    const dLng = order?.addressLng || 120.9842;

    if (modalRiderRef.current) {
      modalRiderRef.current.setLatLng([gpsCoords.lat, gpsCoords.lng]);
    } else {
      const riderIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
        className: '', iconSize: [36, 36], iconAnchor: [18, 18],
      });
      modalRiderRef.current = L.marker([gpsCoords.lat, gpsCoords.lng], { icon: riderIcon }).addTo(modalMapObjRef.current);
      modalRiderRef.current.bindPopup('🛵 You are here');
    }
    drawModalRoute(modalMapObjRef.current, gpsCoords.lat, gpsCoords.lng, dLat, dLng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsCoords]);

  const drawModalRoute = async (map, rLat, rLng, dLat, dLng) => {
    if (!map || !window.L) return;
    if (modalRouteRef.current) {
      if (Array.isArray(modalRouteRef.current)) {
        modalRouteRef.current.forEach(l => l.remove());
      } else {
        modalRouteRef.current.remove();
      }
      modalRouteRef.current = null;
    }
    try {
      const url  = `https://router.project-osrm.org/route/v1/bike/${rLng},${rLat};${dLng},${dLat}?overview=full&geometries=geojson`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
        const coords  = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const outline = window.L.polyline(coords, { color: 'white',    weight: 7,   opacity: 0.6, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        const line    = window.L.polyline(coords, { color: '#e53e3e',  weight: 4.5, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        modalRouteRef.current = [outline, line];
        map.fitBounds(window.L.latLngBounds(coords), { padding: [60, 60], maxZoom: 17 });
      } else {
        modalRouteRef.current = window.L.polyline([[rLat, rLng], [dLat, dLng]], {
          color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8',
        }).addTo(map);
      }
    } catch {
      modalRouteRef.current = window.L.polyline([[rLat, rLng], [dLat, dLng]], {
        color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8',
      }).addTo(map);
    }
  };

  return (
    <div className="rt-fullmap-overlay">
      {/* Top bar */}
      <div className="rt-fullmap-bar">
        <span className="rt-fullmap-title">🗺️ Full Map — #{order?._id?.slice(-8).toUpperCase()}</span>
        <div className="rt-fullmap-bar-right">
          <span className="rt-fullmap-live">
            <span className="rt-live-dot" /> Live
          </span>
          <button className="rt-fullmap-close-btn" onClick={onClose}>✕ Exit</button>
        </div>
      </div>

      {/* Map */}
      <div ref={modalMapRef} className="rt-fullmap-map" />

      {/* Legend */}
      <div className="rt-fullmap-legend">
        <span style={{ color: '#e53e3e', fontWeight: 700 }}>━━</span> Route &nbsp;·&nbsp; 🛵 You &nbsp;·&nbsp; 📍 Destination
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function RiderTrack() {
  const { orderId } = useParams();

  const order             = useQuery(api.orders.getOrderById, orderId ? { orderId } : 'skip');
  const updateFields      = useMutation(api.orders.updateOrderFields);
  const updateLocation    = useMutation(api.riders.updateRiderLocation);
  const generateUploadUrl = useMutation(api.orders.generateRefundUploadUrl);

  // GPS
  const [gpsStatus,  setGpsStatus]  = useState('idle');
  const [gpsCoords,  setGpsCoords]  = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef                  = useRef(null);
  const lastConvexUpdateRef         = useRef(0);
  const riderMarkerRef              = useRef(null);
  const routeLineRef                = useRef(null);

  // Map
  const mapRef        = useRef(null);
  const mapObjRef     = useRef(null);
  const destMarkerRef = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);
  const mapInitializedRef = useRef(false);

  // Fullscreen map modal
  const [showFullMap, setShowFullMap] = useState(false);

  // OTP
  const [otpInput,   setOtpInput]   = useState('');
  const [otpStatus,  setOtpStatus]  = useState('idle');
  const [otpMessage, setOtpMessage] = useState('');

  // Photo
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploading,    setUploading]    = useState(false);

  // Delivery
  const [marking,      setMarking]      = useState(false);
  const [deliveryDone, setDeliveryDone] = useState(false);

  // Tab
  const [activeTab, setActiveTab] = useState('map');

  // Call Modal
  const [showCallModal, setShowCallModal] = useState(false);

  // ── Load Leaflet ──
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script  = document.createElement('script');
    script.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // ── Init or reinit map ──
  const initMap = useCallback(() => {
    if (!leafletReady || !mapRef.current || !order) return;
    if (mapObjRef.current) {
      setTimeout(() => { if (mapObjRef.current) mapObjRef.current.invalidateSize(); }, 150);
      return;
    }
    const L   = window.L;
    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19,
    }).addTo(map);

    const lat = order?.addressLat || 14.5995;
    const lng = order?.addressLng || 120.9842;

    const destIcon = L.divIcon({
      html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">📍</div>`,
      className: '', iconSize: [44, 44], iconAnchor: [22, 44],
    });
    const marker = L.marker([lat, lng], { icon: destIcon }).addTo(map);
    marker.bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`).openPopup();
    map.setView([lat, lng], 15);
    mapObjRef.current     = map;
    destMarkerRef.current = marker;
    mapInitializedRef.current = true;

    if (gpsCoords) {
      drawRoute(map, gpsCoords.lat, gpsCoords.lng, lat, lng);
      const riderIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
        className: '', iconSize: [36, 36], iconAnchor: [18, 18],
      });
      if (!riderMarkerRef.current) {
        riderMarkerRef.current = L.marker([gpsCoords.lat, gpsCoords.lng], { icon: riderIcon }).addTo(map);
        riderMarkerRef.current.bindPopup('🛵 You are here');
      }
      const bounds = L.latLngBounds([gpsCoords.lat, gpsCoords.lng], [lat, lng]);
      map.fitBounds(bounds, { padding: [48, 48] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady, order]);

  // ── Draw OSRM route ──
  const drawRoute = async (map, rLat, rLng, dLat, dLng) => {
    if (!map || !window.L) return;
    if (routeLineRef.current) {
      if (Array.isArray(routeLineRef.current)) {
        routeLineRef.current.forEach(l => l.remove());
      } else {
        routeLineRef.current.remove();
      }
      routeLineRef.current = null;
    }
    try {
      const url  = `https://router.project-osrm.org/route/v1/bike/${rLng},${rLat};${dLng},${dLat}?overview=full&geometries=geojson`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
        const coords  = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        const outline = window.L.polyline(coords, { color: 'white',   weight: 7,   opacity: 0.6,  lineJoin: 'round', lineCap: 'round' }).addTo(map);
        const line    = window.L.polyline(coords, { color: '#e53e3e', weight: 4.5, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        routeLineRef.current = [outline, line];
        map.fitBounds(window.L.latLngBounds(coords), { padding: [48, 48], maxZoom: 17 });
      } else {
        routeLineRef.current = window.L.polyline([[rLat, rLng], [dLat, dLng]], {
          color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8',
        }).addTo(map);
      }
    } catch {
      routeLineRef.current = window.L.polyline([[rLat, rLng], [dLat, dLng]], {
        color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8',
      }).addTo(map);
    }
  };

  // ── Visibility change ──
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (mapObjRef.current) {
          setTimeout(() => { if (mapObjRef.current) mapObjRef.current.invalidateSize(); }, 200);
        } else if (activeTab === 'map') {
          initMap();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [activeTab, initMap]);

  useEffect(() => {
    if (activeTab === 'map') setTimeout(() => initMap(), 100);
  }, [activeTab, initMap]);

  useEffect(() => {
    if (leafletReady && activeTab === 'map') setTimeout(() => initMap(), 100);
  }, [leafletReady, initMap, activeTab]);

  // Cleanup
  useEffect(() => () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    if (mapObjRef.current) {
      try { mapObjRef.current.remove(); } catch {}
      mapObjRef.current      = null;
      destMarkerRef.current  = null;
      riderMarkerRef.current = null;
      routeLineRef.current   = null;
    }
  }, []);

  // ── Auto-start GPS ──
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!order || autoStartedRef.current) return;
    autoStartedRef.current = true;
    startTracking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // ── Start GPS ──
  const startTracking = () => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    setGpsStatus('starting');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        setGpsCoords({ lat, lng, accuracy });
        setGpsStatus('active');
        setIsTracking(true);

        const now = Date.now();
        if (orderId && now - lastConvexUpdateRef.current >= 5000) {
          lastConvexUpdateRef.current = now;
          updateLocation({
            orderId,
            riderEmail: order?.riderInfo?.email || 'rider@dkmerch.com',
            riderName:  order?.riderInfo?.name  || order?.riderInfo?.fullName || 'Rider',
            lat, lng, accuracy, speed: speed || 0, isTracking: true,
          }).catch(() => {});
        }

        if (mapObjRef.current && window.L) {
          const L = window.L;
          const riderIcon = L.divIcon({
            html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
            className: '', iconSize: [36, 36], iconAnchor: [18, 18],
          });
          if (!riderMarkerRef.current) {
            riderMarkerRef.current = L.marker([lat, lng], { icon: riderIcon }).addTo(mapObjRef.current);
            riderMarkerRef.current.bindPopup('🛵 You are here');
          } else {
            riderMarkerRef.current.setLatLng([lat, lng]);
          }
          const dLat = order?.addressLat || 14.5995;
          const dLng = order?.addressLng || 120.9842;
          drawRoute(mapObjRef.current, lat, lng, dLat, dLng);
          const bounds = L.latLngBounds([lat, lng], [dLat, dLng]);
          mapObjRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
        }
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (orderId) updateLocation({
      orderId,
      riderEmail: order?.riderInfo?.email || 'rider@dkmerch.com',
      riderName:  order?.riderInfo?.name  || 'Rider',
      lat: 0, lng: 0, accuracy: 0, speed: 0, isTracking: false,
    }).catch(() => {});
    setIsTracking(false);
    setGpsStatus('idle');
  };

  // ── OTP ──
  const handleVerifyOtp = async () => {
    if (!otpInput.trim() || !order) return;
    setOtpStatus('verifying');
    const saved = order.deliveryOtp;
    if (!saved) {
      setOtpStatus('error');
      setOtpMessage('No OTP found. Ask customer to generate one from their tracking page.');
      return;
    }
    if (otpInput.trim() === saved.toString()) {
      await updateFields({ orderId, deliveryOtpVerified: true }).catch(() => {});
      setOtpStatus('success');
      setOtpMessage('OTP verified! ✅ Proceed to take the delivery photo.');
      setTimeout(() => setActiveTab('photo'), 1200);
    } else {
      setOtpStatus('error');
      setOtpMessage('Wrong OTP. Ask the customer to check their tracking page.');
    }
  };

  // ── Photo ──
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ── Mark Delivered ──
  const handleMarkDelivered = async () => {
    if (!order?.deliveryOtpVerified) { alert('Verify OTP first.'); setActiveTab('otp'); return; }
    if (!photoFile) { alert('Take a delivery photo first.'); setActiveTab('photo'); return; }
    setMarking(true);
    try {
      setUploading(true);
      const uploadUrl  = await generateUploadUrl();
      const res        = await fetch(uploadUrl, { method: 'POST', body: photoFile, headers: { 'Content-Type': photoFile.type } });
      if (!res.ok) throw new Error('Upload failed');
      const { storageId } = await res.json();
      const siteUrl    = process.env.REACT_APP_CONVEX_SITE_URL || '';
      const photoUrl   = `${siteUrl}/getImage?storageId=${storageId}`;
      setUploading(false);
      await updateFields({
        orderId,
        orderStatus:         'completed',
        status:              'Delivered',
        deliveryProofPhoto:  photoUrl,
        deliveryConfirmedAt: new Date().toISOString(),
      });
      stopTracking();
      setDeliveryDone(true);
    } catch {
      alert('Failed. Please try again.');
    } finally {
      setMarking(false);
      setUploading(false);
    }
  };

  const openGoogleMaps = () => {
    if (!order) return;
    const lat = order.addressLat, lng = order.addressLng;
    const url = lat && lng
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.shippingAddress || '')}`;
    window.open(url, '_blank');
  };

  // ── States ──
  if (order === undefined) return (
    <div className="rt-loading"><div className="rt-spinner">🛵</div><p>Loading delivery…</p></div>
  );
  if (!order) return (
    <div className="rt-error"><div className="rt-error-icon">❌</div><h2>Order not found</h2></div>
  );
  if (deliveryDone || order.orderStatus === 'completed') return (
    <div className="rt-done">
      <div className="rt-done-icon">✅</div>
      <h2>Delivery Complete!</h2>
      <p>Order <strong>#{orderId?.slice(-8).toUpperCase()}</strong> has been delivered.</p>
      <p className="rt-done-sub">Thank you for delivering with DKMerch! 💜</p>
    </div>
  );

  const otpVerified   = !!order.deliveryOtpVerified;
  const customerPhone = order.phone || '';

  return (
    <div className="rt-page">

      {/* ── Fullscreen Map Modal ── */}
      {showFullMap && (
        <FullscreenMapModal
          order={order}
          gpsCoords={gpsCoords}
          onClose={() => setShowFullMap(false)}
        />
      )}

      {/* Header */}
      <div className="rt-header">
        <span className="rt-header-logo">🛵 DKMerch Delivery</span>
        <span className="rt-header-order">#{orderId?.slice(-8).toUpperCase()}</span>
      </div>

      {/* Customer Banner */}
      <div className="rt-customer-banner">
        <div className="rt-customer-info">
          <div className="rt-customer-name">📦 {order.customerName || 'Customer'}</div>
          <div className="rt-customer-phone">📞 <strong>{customerPhone || '—'}</strong></div>
        </div>
        {customerPhone
          ? <button className="rt-call-btn" onClick={() => setShowCallModal(true)}>📞 Call</button>
          : <span className="rt-no-phone">No phone</span>
        }
      </div>

      {/* Call Modal */}
      {showCallModal && customerPhone && (
        <div className="rt-call-overlay" onClick={() => setShowCallModal(false)}>
          <div className="rt-call-modal" onClick={e => e.stopPropagation()}>
            <div className="rt-call-modal-avatar">📞</div>
            <div className="rt-call-modal-label">Calling customer…</div>
            <div className="rt-call-modal-name">{order.customerName || 'Customer'}</div>
            <div className="rt-call-modal-number">{customerPhone}</div>
            <div className="rt-call-modal-actions">
              <a href={`tel:${customerPhone}`} className="rt-call-confirm-btn" onClick={() => setShowCallModal(false)}>
                📞 Call {customerPhone}
              </a>
              <button className="rt-call-cancel-btn" onClick={() => setShowCallModal(false)}>✕ Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Address */}
      <div className="rt-address-box">
        <div className="rt-address-label">📍 Delivery Address</div>
        <div className="rt-address-text">{order.shippingAddress || 'No address on file'}</div>
        <button className="rt-gmaps-btn" onClick={openGoogleMaps}>🗺️ Open in Google Maps</button>
      </div>

      {/* GPS Bar */}
      <div className={`rt-gps-bar rt-gps-${gpsStatus}`}>
        {gpsStatus === 'idle'     && <span>📡 Starting GPS…</span>}
        {gpsStatus === 'starting' && <><span className="rt-live-dot rt-dot-yellow" /><span>⏳ Getting your location…</span></>}
        {gpsStatus === 'active'   && <><span className="rt-live-dot" /><span>Live GPS Active — admin &amp; customer can see you{gpsCoords ? ` · ±${Math.round(gpsCoords.accuracy || 0)}m` : ''}</span></>}
        {gpsStatus === 'error'    && <><span>⚠️ GPS unavailable — </span><button className="rt-gps-btn rt-gps-start" onClick={startTracking}>↺ Retry</button></>}
      </div>

      {/* Tabs */}
      <div className="rt-tabs">
        {[
          { key: 'map',   label: '🗺️ Map' },
          { key: 'otp',   label: otpVerified ? '✅ OTP' : '🔐 OTP' },
          { key: 'photo', label: photoFile   ? '✅ Photo' : '📷 Photo' },
        ].map(t => (
          <button key={t.key}
            className={`rt-tab ${activeTab === t.key ? 'active' : ''} ${(t.key === 'otp' && otpVerified) || (t.key === 'photo' && photoFile) ? 'done' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      {/* Tab: Map */}
      <div style={{ display: activeTab === 'map' ? 'block' : 'none' }} className="rt-tab-content">
        <div ref={mapRef} className="rt-map" />
        <div className="rt-map-footer">
          <p className="rt-map-hint">
            📍 = Customer &nbsp;·&nbsp; 🛵 = You &nbsp;·&nbsp;
            <span style={{ color: '#e53e3e', fontWeight: 700 }}>━━</span> = Route
          </p>
          {/* ✅ NOW opens fullscreen Leaflet map instead of Google Maps */}
          <button className="rt-fullmap-btn" onClick={() => setShowFullMap(true)}>
            ⛶ Full Map
          </button>
        </div>
      </div>

      {/* Tab: OTP */}
      {activeTab === 'otp' && (
        <div className="rt-tab-content rt-otp-content">
          {otpVerified ? (
            <div className="rt-verified-box">
              <div className="rt-verified-icon">✅</div>
              <h3>OTP Verified!</h3>
              <p>Proceed to take the delivery photo.</p>
              <button className="rt-next-btn" onClick={() => setActiveTab('photo')}>📷 Go to Photo →</button>
            </div>
          ) : (
            <>
              <div className="rt-otp-header">
                <div className="rt-otp-icon-big">🔐</div>
                <h3>Enter Customer OTP</h3>
                <p>Ask the customer for their 4-digit OTP from their order tracking page.</p>
              </div>
              <div className="rt-otp-row">
                <input
                  type="number"
                  className="rt-otp-input"
                  placeholder="0000"
                  value={otpInput}
                  onChange={e => { setOtpInput(e.target.value.slice(0, 4)); setOtpStatus('idle'); setOtpMessage(''); }}
                />
                <button
                  className="rt-otp-verify-btn"
                  onClick={handleVerifyOtp}
                  disabled={otpStatus === 'verifying' || otpInput.length < 4}
                >
                  {otpStatus === 'verifying' ? '⏳' : '✅ Verify'}
                </button>
              </div>
              {otpMessage && <div className={`rt-otp-msg rt-otp-${otpStatus}`}>{otpMessage}</div>}
              <div className="rt-otp-hint">💡 Tell the customer to go to their tracking page and tap <strong>"Generate OTP"</strong>.</div>
            </>
          )}
        </div>
      )}

      {/* Tab: Photo */}
      {activeTab === 'photo' && (
        <div className="rt-tab-content rt-photo-content">
          <div className="rt-photo-header">
            <div className="rt-photo-icon-big">📷</div>
            <h3>Delivery Photo</h3>
            <p>Take a clear photo of the delivered package as proof of delivery.</p>
          </div>
          <div className="rt-photo-area" onClick={() => document.getElementById('rt-photo-input').click()}>
            {photoPreview
              ? <img src={photoPreview} alt="Delivery proof" className="rt-photo-preview" />
              : <div className="rt-photo-placeholder"><span>📸</span><span>Tap to take or upload photo</span></div>
            }
          </div>
          <input id="rt-photo-input" type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
          {photoFile && (
            <button className="rt-retake-btn" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>🔄 Retake Photo</button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="rt-footer">
        <div className="rt-checklist">
          <div className="rt-check done">✅ GPS Tracking</div>
          <div className={`rt-check ${otpVerified ? 'done' : ''}`}>{otpVerified ? '✅' : '⬜'} OTP Verified</div>
          <div className={`rt-check ${photoFile ? 'done' : ''}`}>{photoFile ? '✅' : '⬜'} Photo Taken</div>
        </div>
        <button
          className={`rt-deliver-btn ${otpVerified && photoFile ? 'ready' : ''}`}
          onClick={handleMarkDelivered}
          disabled={marking || uploading || !otpVerified || !photoFile}
        >
          {marking || uploading ? '⏳ Processing…' : '✅ Mark as Delivered'}
        </button>
        {(!otpVerified || !photoFile) && (
          <p className="rt-footer-hint">
            {!otpVerified && !photoFile ? '⚠️ Verify OTP and take a photo first'
              : !otpVerified ? '⚠️ Verify OTP first'
              : '⚠️ Take a delivery photo first'}
          </p>
        )}
      </div>
    </div>
  );
}
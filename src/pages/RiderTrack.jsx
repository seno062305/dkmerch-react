// src/pages/RiderTrack.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './RiderTrack.css';

const generateSessionId = () =>
  `rt-${Date.now()}-${Math.random().toString(36).slice(2,10)}-${Math.random().toString(36).slice(2,10)}`;

const getTabSessionId = () => {
  const storageKey = 'riderTrackSessionId';
  let id = sessionStorage.getItem(storageKey);
  if (!id) { id = generateSessionId(); sessionStorage.setItem(storageKey, id); }
  return id;
};

const getDeviceInfo = () => {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua))  return 'iPhone';
  if (/iPad/i.test(ua))    return 'iPad';
  if (/Android/i.test(ua)) return 'Android phone';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Mac/i.test(ua))     return 'Mac';
  return 'another device';
};

const getLoggedInRider = () => {
  try {
    const raw = localStorage.getItem('riderUser') || localStorage.getItem('rider') || localStorage.getItem('user');
    if (raw) {
      const parsed = JSON.parse(raw);
      const email = parsed?.email || parsed?.rider?.email || null;
      const name  = parsed?.name  || parsed?.fullName || parsed?.rider?.name || parsed?.rider?.fullName || null;
      if (email) return { email, name };
    }
  } catch {}
  return null;
};

const reverseGeocode = async (lat, lng) => {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.display_name) {
      const a = data.address || {};
      const parts = [
        a.road || a.pedestrian || a.footway,
        a.suburb || a.village || a.town || a.city_district,
        a.city || a.municipality,
      ].filter(Boolean);
      return parts.length ? parts.join(', ') : data.display_name.split(',').slice(0, 3).join(',');
    }
  } catch {}
  return null;
};

const fetchOsrmRoute = async (rLat, rLng, dLat, dLng, retries = 3, timeoutMs = 10000) => {
  const url = `https://router.project-osrm.org/route/v1/bike/${rLng},${rLat};${dLng},${dLat}?overview=full&geometries=geojson`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length > 1) {
        return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      }
    } catch {
      clearTimeout(timer);
      if (attempt < retries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return null;
};

/* ══════════════════════════════════════
   TOO MANY SESSIONS SCREEN
══════════════════════════════════════ */
function TooManySessionsScreen({ activeCount, onRetry }) {
  const [retrying, setRetrying] = useState(false);
  const handleRetry = async () => { setRetrying(true); await onRetry(); setRetrying(false); };
  return (
    <div className="rt-inuse-screen">
      <div className="rt-inuse-icon">⚠️</div>
      <h2 className="rt-inuse-title">Too Many Devices Open</h2>
      <p className="rt-inuse-desc">
        This delivery link is currently open on <strong>{activeCount} other device{activeCount !== 1 ? 's' : ''}</strong>.
      </p>
      <div className="rt-inuse-info-box">
        <p>The link allows up to <strong>5 simultaneous devices</strong>.</p>
        <p>Please close this link on the other devices first, then try again.</p>
        <p>Inactive devices are automatically removed after <strong>2 minutes</strong>.</p>
      </div>
      <button className="rt-inuse-retry-btn" onClick={handleRetry} disabled={retrying}>
        {retrying ? '⏳ Checking…' : '🔄 Try Again'}
      </button>
      <p className="rt-inuse-hint">💡 Closed the other browsers? Wait a moment then tap "Try Again".</p>
    </div>
  );
}

/* ══════════════════════════════════════
   FULLSCREEN MAP MODAL
══════════════════════════════════════ */
function FullscreenMapModal({ order, gpsCoords, onClose }) {
  const modalMapRef     = useRef(null);
  const modalMapObjRef  = useRef(null);
  const modalRouteRef   = useRef(null);
  const modalRiderRef   = useRef(null);
  const modalLastRouteRef = useRef({ rLat: null, rLng: null });

  const drawModalRoute = useCallback(async (map, rLat, rLng, dLat, dLng) => {
    if (!map || !window.L) return;
    const prev = modalLastRouteRef.current;
    const movedEnough = !prev.rLat ||
      Math.abs(rLat - prev.rLat) > 0.00015 ||
      Math.abs(rLng - prev.rLng) > 0.00015;
    if (!movedEnough && modalRouteRef.current) return;
    if (modalRouteRef.current) {
      (Array.isArray(modalRouteRef.current) ? modalRouteRef.current : [modalRouteRef.current])
        .forEach(l => { try { l.remove(); } catch {} });
      modalRouteRef.current = null;
    }
    const coords = await fetchOsrmRoute(rLat, rLng, dLat, dLng);
    if (coords) {
      modalLastRouteRef.current = { rLat, rLng };
      modalRouteRef.current = [
        window.L.polyline(coords, { color: 'white',   weight: 7,   opacity: 0.6  }).addTo(map),
        window.L.polyline(coords, { color: '#e53e3e', weight: 4.5, opacity: 0.92 }).addTo(map),
      ];
      map.fitBounds(window.L.latLngBounds(coords), { padding: [60, 60], maxZoom: 17 });
    } else {
      modalRouteRef.current = window.L.polyline(
        [[rLat, rLng], [dLat, dLng]],
        { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }
      ).addTo(map);
    }
  }, []);

  useEffect(() => {
    if (!window.L || !modalMapRef.current) return;
    const L = window.L;

    if (modalMapRef.current._leaflet_id) {
      try { const t = L.map(modalMapRef.current); t.remove(); } catch {}
      delete modalMapRef.current._leaflet_id;
    }

    const map = L.map(modalMapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);

    const dLat = order?.addressLat || 14.5995, dLng = order?.addressLng || 120.9842;
    const destIcon = L.divIcon({
      html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">📍</div>`,
      className: '', iconSize: [44,44], iconAnchor: [22,44]
    });
    L.marker([dLat, dLng], { icon: destIcon }).addTo(map)
      .bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`);

    if (gpsCoords) {
      const riderIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
        className: '', iconSize: [36,36], iconAnchor: [18,18]
      });
      modalRiderRef.current = L.marker([gpsCoords.lat, gpsCoords.lng], { icon: riderIcon }).addTo(map);
      map.fitBounds(L.latLngBounds([gpsCoords.lat, gpsCoords.lng], [dLat, dLng]), { padding: [60,60] });
      drawModalRoute(map, gpsCoords.lat, gpsCoords.lng, dLat, dLng);
    } else {
      map.setView([dLat, dLng], 15);
    }

    modalMapObjRef.current = map;
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 150);

    return () => { try { map.remove(); } catch {} modalMapObjRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modalMapObjRef.current || !gpsCoords || !window.L) return;
    const dLat = order?.addressLat || 14.5995, dLng = order?.addressLng || 120.9842;
    if (modalRiderRef.current) {
      modalRiderRef.current.setLatLng([gpsCoords.lat, gpsCoords.lng]);
    }
    drawModalRoute(modalMapObjRef.current, gpsCoords.lat, gpsCoords.lng, dLat, dLng);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gpsCoords]);

  return (
    <div className="rt-fullmap-overlay">
      <div className="rt-fullmap-bar">
        <span className="rt-fullmap-title">🗺️ Full Map — #{order?._id?.slice(-8).toUpperCase()}</span>
        <div className="rt-fullmap-bar-right">
          <span className="rt-fullmap-live"><span className="rt-live-dot" /> Live</span>
          <button className="rt-fullmap-close-btn" onClick={onClose}>✕ Exit</button>
        </div>
      </div>
      <div ref={modalMapRef} className="rt-fullmap-map" />
      <div className="rt-fullmap-legend">
        <span style={{ color: '#e53e3e', fontWeight: 700 }}>━━</span> Route &nbsp;·&nbsp; 🛵 You &nbsp;·&nbsp; 📍 Destination
      </div>
    </div>
  );
}

/* ══════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════ */
export default function RiderTrack() {
  const { orderId } = useParams();
  const SESSION_ID  = useRef(getTabSessionId()).current;
  const loggedInRider = useRef(getLoggedInRider()).current;

  const order             = useQuery(api.orders.getOrderById, orderId ? { orderId } : 'skip');
  const updateFields      = useMutation(api.orders.updateOrderFields);
  const updateLocation    = useMutation(api.riders.updateRiderLocation);
  const generateUploadUrl = useMutation(api.orders.generateRefundUploadUrl);
  const claimSession      = useMutation(api.riders.claimRiderLinkSession);
  const heartbeatSession  = useMutation(api.riders.heartbeatRiderLinkSession);
  const releaseSession    = useMutation(api.riders.releaseRiderLinkSession);

  // ── Session state ──
  const [sessionStatus, setSessionStatus] = useState('checking');
  const [blockedInfo,   setBlockedInfo]   = useState(null);
  const heartbeatRef    = useRef(null);
  const sessionLostRef  = useRef(false);

  // ── GPS state ──
  const [gpsStatus,  setGpsStatus]  = useState('idle');
  const [gpsCoords,  setGpsCoords]  = useState(null);
  const gpsCoordsRef        = useRef(null);
  const watchIdRef          = useRef(null);
  const lastConvexUpdateRef = useRef(0);
  const firstFixSentRef     = useRef(false); // ← NEW: track if first fix was sent
  const lastGeocodedRef     = useRef({ lat: null, lng: null, address: null });
  const gpsRetryRef         = useRef(null);

  // ── Map refs ──
  const lastRouteDrawRef  = useRef({ time: 0, rLat: null, rLng: null });
  const riderMarkerRef    = useRef(null);
  const routeLineRef      = useRef(null);
  const mapRef            = useRef(null);
  const mapObjRef         = useRef(null);
  const destMarkerRef     = useRef(null);
  const mapInitializedRef = useRef(false);

  // ── UI state ──
  const [leafletReady,  setLeafletReady]  = useState(!!window.L);
  const [showFullMap,   setShowFullMap]   = useState(false);
  const [activeTab,     setActiveTab]     = useState('map');
  const [showCallModal, setShowCallModal] = useState(false);
  const [otpInput,      setOtpInput]      = useState('');
  const [otpStatus,     setOtpStatus]     = useState('idle');
  const [otpMessage,    setOtpMessage]    = useState('');
  const [photoFile,     setPhotoFile]     = useState(null);
  const [photoPreview,  setPhotoPreview]  = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [marking,       setMarking]       = useState(false);
  const [deliveryDone,  setDeliveryDone]  = useState(false);

  useEffect(() => { gpsCoordsRef.current = gpsCoords; }, [gpsCoords]);

  const getRiderEmail = useCallback(() =>
    loggedInRider?.email || order?.riderInfo?.email || 'rider@dkmerch.com',
  [loggedInRider, order]);

  const getRiderName = useCallback(() =>
    loggedInRider?.name || order?.riderInfo?.name || order?.riderInfo?.fullName || 'Rider',
  [loggedInRider, order]);

  /* ─────────────────────────────────────────
     SESSION: claim / heartbeat / release
  ───────────────────────────────────────── */
  const tryClaim = useCallback(async () => {
    if (!orderId) return;
    setSessionStatus('checking');
    try {
      const result = await claimSession({ orderId, sessionId: SESSION_ID, deviceInfo: getDeviceInfo() });
      if (result.allowed) {
        setSessionStatus('allowed');
        sessionLostRef.current = false;
      } else {
        setSessionStatus('blocked');
        setBlockedInfo({ activeCount: result.activeCount ?? 5 });
      }
    } catch {
      setSessionStatus('allowed');
      sessionLostRef.current = false;
    }
  }, [orderId, SESSION_ID, claimSession]);

  useEffect(() => {
    if (order && sessionStatus === 'checking') tryClaim();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  useEffect(() => {
    if (sessionStatus !== 'allowed' || !orderId) return;
    heartbeatRef.current = setInterval(async () => {
      try {
        const res = await heartbeatSession({ orderId, sessionId: SESSION_ID });
        if (res?.success === false && res?.reason === 'session_expired') {
          const reclaim = await claimSession({ orderId, sessionId: SESSION_ID, deviceInfo: getDeviceInfo() });
          if (!reclaim.allowed) {
            setSessionStatus('blocked');
            setBlockedInfo({ activeCount: reclaim.activeCount ?? 5 });
          }
        }
      } catch {}
    }, 25_000);
    return () => clearInterval(heartbeatRef.current);
  }, [sessionStatus, orderId, SESSION_ID, heartbeatSession, claimSession]);

  useEffect(() => {
    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && orderId) {
        try {
          const res = await claimSession({ orderId, sessionId: SESSION_ID, deviceInfo: getDeviceInfo() });
          if (res.allowed) {
            setSessionStatus('allowed');
            sessionLostRef.current = false;
          }
        } catch {}
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [orderId, SESSION_ID, claimSession]);

  useEffect(() => {
    const release = () => {
      if (sessionLostRef.current) return;
      sessionLostRef.current = true;
      if (orderId && SESSION_ID) {
        releaseSession({ orderId, sessionId: SESSION_ID }).catch(() => {});
        const coords = gpsCoordsRef.current;
        if (coords) {
          updateLocation({
            orderId,
            riderEmail: getRiderEmail(),
            riderName:  getRiderName(),
            lat: 0, lng: 0, accuracy: 0, speed: 0,
            isTracking: false, sessionId: SESSION_ID,
          }).catch(() => {});
        }
      }
    };
    window.addEventListener('beforeunload', release);
    return () => window.removeEventListener('beforeunload', release);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, SESSION_ID]);

  /* ─────────────────────────────────────────
     LEAFLET: load CSS + JS once
  ───────────────────────────────────────── */
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

  /* ─────────────────────────────────────────
     ROUTE helpers
  ───────────────────────────────────────── */
  const clearRouteLines = useCallback(() => {
    if (routeLineRef.current) {
      (Array.isArray(routeLineRef.current) ? routeLineRef.current : [routeLineRef.current])
        .forEach(l => { try { l.remove(); } catch {} });
      routeLineRef.current = null;
    }
  }, []);

  const drawRoute = useCallback(async (map, rLat, rLng, dLat, dLng) => {
    if (!map || !window.L) return;
    const now  = Date.now();
    const prev = lastRouteDrawRef.current;
    const movedEnough   = !prev.rLat || Math.abs(rLat - prev.rLat) > 0.00015 || Math.abs(rLng - prev.rLng) > 0.00015;
    const enoughTime    = now - prev.time > 10_000;
    const noRouteExists = !routeLineRef.current;
    if (!noRouteExists && (!movedEnough || !enoughTime)) return;
    clearRouteLines();
    const coords = await fetchOsrmRoute(rLat, rLng, dLat, dLng);
    if (coords) {
      lastRouteDrawRef.current = { time: now, rLat, rLng };
      routeLineRef.current = [
        window.L.polyline(coords, { color: 'white',   weight: 7,   opacity: 0.6,  lineJoin: 'round', lineCap: 'round' }).addTo(map),
        window.L.polyline(coords, { color: '#e53e3e', weight: 4.5, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(map),
      ];
      map.fitBounds(window.L.latLngBounds(coords), { padding: [48,48], maxZoom: 17 });
    } else if (!routeLineRef.current) {
      routeLineRef.current = window.L.polyline(
        [[rLat,rLng],[dLat,dLng]],
        { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }
      ).addTo(map);
    }
  }, [clearRouteLines]);

  const drawRouteForce = useCallback(async (map, rLat, rLng, dLat, dLng) => {
    if (!map || !window.L) return;
    clearRouteLines();
    const coords = await fetchOsrmRoute(rLat, rLng, dLat, dLng);
    if (coords) {
      lastRouteDrawRef.current = { time: Date.now(), rLat, rLng };
      routeLineRef.current = [
        window.L.polyline(coords, { color: 'white',   weight: 7,   opacity: 0.6,  lineJoin: 'round', lineCap: 'round' }).addTo(map),
        window.L.polyline(coords, { color: '#e53e3e', weight: 4.5, opacity: 0.92, lineJoin: 'round', lineCap: 'round' }).addTo(map),
      ];
      map.fitBounds(window.L.latLngBounds(coords), { padding: [48,48], maxZoom: 17 });
    } else {
      routeLineRef.current = window.L.polyline(
        [[rLat,rLng],[dLat,dLng]],
        { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }
      ).addTo(map);
    }
  }, [clearRouteLines]);

  const destroyMap = useCallback(() => {
    clearRouteLines();
    if (mapObjRef.current) { try { mapObjRef.current.remove(); } catch {} mapObjRef.current = null; }
    destMarkerRef.current     = null;
    riderMarkerRef.current    = null;
    mapInitializedRef.current = false;
    lastRouteDrawRef.current  = { time: 0, rLat: null, rLng: null };
  }, [clearRouteLines]);

  /* ─────────────────────────────────────────
     MAP init
  ───────────────────────────────────────── */
  const initMap = useCallback(() => {
    if (!leafletReady || !mapRef.current || !order) return;

    if (mapObjRef.current && mapInitializedRef.current) {
      try {
        mapObjRef.current.invalidateSize();
        const coords = gpsCoordsRef.current;
        const dLat = order?.addressLat || 14.5995, dLng = order?.addressLng || 120.9842;
        if (coords) {
          if (riderMarkerRef.current) riderMarkerRef.current.setLatLng([coords.lat, coords.lng]);
          drawRouteForce(mapObjRef.current, coords.lat, coords.lng, dLat, dLng);
          mapObjRef.current.fitBounds(
            window.L.latLngBounds([coords.lat, coords.lng], [dLat, dLng]),
            { padding: [48,48], maxZoom: 17 }
          );
        }
        return;
      } catch {
        destroyMap();
      }
    }

    if (mapRef.current._leaflet_id) {
      try { const t = window.L.map(mapRef.current); t.remove(); } catch {}
      delete mapRef.current._leaflet_id;
    }

    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors', maxZoom: 19
    }).addTo(map);

    const dLat = order?.addressLat || 14.5995, dLng = order?.addressLng || 120.9842;
    const destIcon = L.divIcon({
      html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">📍</div>`,
      className: '', iconSize: [44,44], iconAnchor: [22,44]
    });
    const marker = L.marker([dLat, dLng], { icon: destIcon }).addTo(map);
    marker.bindPopup(`<b>📍 Deliver to:</b><br>${order?.customerName || 'Customer'}<br><small>${order?.shippingAddress || ''}</small>`).openPopup();
    map.setView([dLat, dLng], 15);
    mapObjRef.current     = map;
    destMarkerRef.current = marker;
    mapInitializedRef.current = true;

    const coords = gpsCoordsRef.current;
    if (coords) {
      const riderIcon = L.divIcon({
        html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
        className: '', iconSize: [36,36], iconAnchor: [18,18]
      });
      riderMarkerRef.current = L.marker([coords.lat, coords.lng], { icon: riderIcon }).addTo(map);
      riderMarkerRef.current.bindPopup('🛵 You are here');
      map.fitBounds(L.latLngBounds([coords.lat, coords.lng], [dLat, dLng]), { padding: [48,48] });
      drawRouteForce(map, coords.lat, coords.lng, dLat, dLng);
    }
    setTimeout(() => { try { map.invalidateSize(); } catch {} }, 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletReady, order, destroyMap, drawRouteForce]);

  useEffect(() => {
    if (activeTab === 'map') setTimeout(() => initMap(), 100);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const h = () => {
      if (document.visibilityState === 'visible' && activeTab === 'map') {
        setTimeout(() => initMap(), 200);
      }
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [activeTab, initMap]);

  useEffect(() => {
    if (leafletReady && activeTab === 'map') setTimeout(() => initMap(), 100);
  }, [leafletReady, initMap, activeTab]);

  useEffect(() => () => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    if (gpsRetryRef.current) clearTimeout(gpsRetryRef.current);
    destroyMap();
  }, [destroyMap]);

  /* ─────────────────────────────────────────
     GPS tracking — auto-start
  ───────────────────────────────────────── */
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!order || autoStartedRef.current || sessionStatus !== 'allowed') return;
    autoStartedRef.current = true;
    startTracking();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, sessionStatus]);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (gpsRetryRef.current) { clearTimeout(gpsRetryRef.current); gpsRetryRef.current = null; }

    // Reset first-fix flag so new watch sends immediately
    firstFixSentRef.current = false;

    setGpsStatus('starting');

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy, speed } = pos.coords;
        setGpsCoords({ lat, lng, accuracy });
        setGpsStatus('active');

        const now = Date.now();

        // ── INSTANT FIRST FIX: send to Convex immediately, skip throttle ──
        const isFirstFix = !firstFixSentRef.current;
        const throttleOk = now - lastConvexUpdateRef.current >= 3000; // 3s throttle (was 5s)

        if (orderId && (isFirstFix || throttleOk)) {
          firstFixSentRef.current   = true;
          lastConvexUpdateRef.current = now;

          // Send location IMMEDIATELY — don't await geocode
          updateLocation({
            orderId,
            riderEmail: getRiderEmail(),
            riderName:  getRiderName(),
            lat, lng, accuracy, speed: speed || 0,
            isTracking: true, sessionId: SESSION_ID,
            lastKnownAddress: lastGeocodedRef.current.address || undefined,
          }).catch(() => {});

          // Geocode in background — update address when it comes in
          const lastLat = lastGeocodedRef.current.lat, lastLng = lastGeocodedRef.current.lng;
          const movedFar = !lastLat || Math.abs(lat - lastLat) > 0.0003 || Math.abs(lng - lastLng) > 0.0003;
          if (movedFar) {
            reverseGeocode(lat, lng).then(addr => {
              if (addr) {
                lastGeocodedRef.current = { lat, lng, address: addr };
                // Update Convex with address (fire-and-forget)
                updateLocation({
                  orderId,
                  riderEmail: getRiderEmail(),
                  riderName:  getRiderName(),
                  lat, lng, accuracy, speed: speed || 0,
                  isTracking: true, sessionId: SESSION_ID,
                  lastKnownAddress: addr,
                }).catch(() => {});
              }
            });
          }
        }

        // Update map marker + route
        if (mapObjRef.current && window.L) {
          const L = window.L;
          const dLat = order?.addressLat || 14.5995, dLng = order?.addressLng || 120.9842;
          const riderIcon = L.divIcon({
            html: `<div style="width:36px;height:36px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 10px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:18px;">🛵</div>`,
            className: '', iconSize: [36,36], iconAnchor: [18,18]
          });
          if (!riderMarkerRef.current) {
            riderMarkerRef.current = L.marker([lat, lng], { icon: riderIcon }).addTo(mapObjRef.current);
            riderMarkerRef.current.bindPopup('🛵 You are here');
            drawRouteForce(mapObjRef.current, lat, lng, dLat, dLng);
          } else {
            riderMarkerRef.current.setLatLng([lat, lng]);
            drawRoute(mapObjRef.current, lat, lng, dLat, dLng);
          }
          mapObjRef.current.fitBounds(
            L.latLngBounds([lat, lng], [dLat, dLng]),
            { padding: [48,48], maxZoom: 17 }
          );
        }
      },
      (err) => {
        console.warn('GPS error:', err.code, err.message);
        setGpsStatus('error');
        if (err.code !== 1) {
          gpsRetryRef.current = setTimeout(() => startTracking(), 8000);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, order, SESSION_ID, getRiderEmail, getRiderName, updateLocation, drawRoute, drawRouteForce]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current) { navigator.geolocation.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (gpsRetryRef.current) { clearTimeout(gpsRetryRef.current); gpsRetryRef.current = null; }
    if (orderId) updateLocation({
      orderId,
      riderEmail: getRiderEmail(),
      riderName:  getRiderName(),
      lat: 0, lng: 0, accuracy: 0, speed: 0,
      isTracking: false, sessionId: SESSION_ID,
    }).catch(() => {});
    setGpsStatus('idle');
  }, [orderId, SESSION_ID, getRiderEmail, getRiderName, updateLocation]);

  /* ─────────────────────────────────────────
     OTP + Photo + Mark Delivered
  ───────────────────────────────────────── */
  const handleVerifyOtp = async () => {
    if (!otpInput.trim() || !order) return;
    setOtpStatus('verifying');
    const saved = order.deliveryOtp;
    if (!saved) { setOtpStatus('error'); setOtpMessage('No OTP found. Ask customer to generate one.'); return; }
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

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0]; if (!file) return; setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleMarkDelivered = async () => {
    if (!order?.deliveryOtpVerified) { alert('Verify OTP first.'); setActiveTab('otp'); return; }
    if (!photoFile) { alert('Take a delivery photo first.'); setActiveTab('photo'); return; }
    setMarking(true);
    try {
      setUploading(true);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, { method: 'POST', body: photoFile, headers: { 'Content-Type': photoFile.type } });
      if (!res.ok) throw new Error('Upload failed');
      const { storageId } = await res.json();
      const photoUrl = `${process.env.REACT_APP_CONVEX_SITE_URL || ''}/getImage?storageId=${storageId}`;
      setUploading(false);
      await updateFields({
        orderId,
        orderStatus: 'completed',
        status: 'Delivered',
        deliveryProofPhoto: photoUrl,
        deliveryConfirmedAt: new Date().toISOString()
      });
      stopTracking();
      releaseSession({ orderId, sessionId: SESSION_ID }).catch(() => {});
      sessionStorage.removeItem('riderTrackSessionId');
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
    window.open(
      lat && lng
        ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.shippingAddress || '')}`,
      '_blank'
    );
  };

  /* ─────────────────────────────────────────
     RENDER guards
  ───────────────────────────────────────── */
  if (order === undefined || sessionStatus === 'checking') return (
    <div className="rt-loading"><div className="rt-spinner">🛵</div><p>Loading delivery…</p></div>
  );
  if (!order) return (
    <div className="rt-error"><div className="rt-error-icon">❌</div><h2>Order not found</h2></div>
  );
  if (sessionStatus === 'blocked') return (
    <TooManySessionsScreen activeCount={blockedInfo?.activeCount ?? 5} onRetry={tryClaim} />
  );
  if (deliveryDone || order.orderStatus === 'completed') return (
    <div className="rt-done">
      <div className="rt-done-icon">✅</div>
      <h2>Delivery Complete!</h2>
      <p>Order <strong>#{orderId?.slice(-8).toUpperCase()}</strong> has been delivered.</p>
      <p className="rt-done-sub">Thank you for delivering with DKMerch! 💜</p>
    </div>
  );

  const otpVerified = !!order.deliveryOtpVerified;
  const customerPhone = order.phone || '';

  /* ─────────────────────────────────────────
     RENDER
  ───────────────────────────────────────── */
  return (
    <div className="rt-page">
      {showFullMap && (
        <FullscreenMapModal order={order} gpsCoords={gpsCoords} onClose={() => setShowFullMap(false)} />
      )}

      <div className="rt-header">
        <span className="rt-header-logo">🛵 DKMerch Delivery</span>
        <span className="rt-header-order">#{orderId?.slice(-8).toUpperCase()}</span>
      </div>

      <div className="rt-customer-banner">
        <div className="rt-customer-info">
          <div className="rt-customer-name">📦 {order.customerName || 'Customer'}</div>
          <div className="rt-customer-phone">📞 <strong>{customerPhone || '—'}</strong></div>
        </div>
        {customerPhone
          ? <button className="rt-call-btn" onClick={() => setShowCallModal(true)}>📞 Call</button>
          : <span className="rt-no-phone">No phone</span>}
      </div>

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

      <div className="rt-address-box">
        <div className="rt-address-label">📍 Delivery Address</div>
        <div className="rt-address-text">{order.shippingAddress || 'No address on file'}</div>
        <button className="rt-gmaps-btn" onClick={openGoogleMaps}>🗺️ Open in Google Maps</button>
      </div>

      <div className={`rt-gps-bar rt-gps-${gpsStatus}`}>
        {gpsStatus === 'idle'     && <span>📡 Starting GPS…</span>}
        {gpsStatus === 'starting' && <><span className="rt-live-dot rt-dot-yellow" /><span>⏳ Getting your location…</span></>}
        {gpsStatus === 'active'   && (
          <>
            <span className="rt-live-dot" />
            <span>Live GPS Active — admin &amp; customer can see you{gpsCoords ? ` · ±${Math.round(gpsCoords.accuracy||0)}m` : ''}</span>
          </>
        )}
        {gpsStatus === 'error' && (
          <>
            <span>⚠️ GPS unavailable — </span>
            <button className="rt-gps-btn rt-gps-start" onClick={startTracking}>↺ Retry GPS</button>
          </>
        )}
      </div>

      <div className="rt-tabs">
        {[
          { key:'map',   label:'🗺️ Map' },
          { key:'otp',   label: otpVerified ? '✅ OTP'   : '🔐 OTP'   },
          { key:'photo', label: photoFile   ? '✅ Photo' : '📷 Photo' },
        ].map(t => (
          <button
            key={t.key}
            className={`rt-tab ${activeTab===t.key?'active':''} ${(t.key==='otp'&&otpVerified)||(t.key==='photo'&&photoFile)?'done':''}`}
            onClick={() => setActiveTab(t.key)}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ display: activeTab==='map' ? 'block' : 'none' }} className="rt-tab-content">
        <div ref={mapRef} className="rt-map" />
        <div className="rt-map-footer">
          <p className="rt-map-hint">
            📍 = Customer &nbsp;·&nbsp; 🛵 = You &nbsp;·&nbsp;
            <span style={{color:'#e53e3e',fontWeight:700}}>━━</span> = Route
          </p>
          <button className="rt-fullmap-btn" onClick={() => setShowFullMap(true)}>⛶ Full Map</button>
        </div>
      </div>

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
                  onChange={e => { setOtpInput(e.target.value.slice(0,4)); setOtpStatus('idle'); setOtpMessage(''); }}
                />
                <button
                  className="rt-otp-verify-btn"
                  onClick={handleVerifyOtp}
                  disabled={otpStatus==='verifying' || otpInput.length < 4}
                >{otpStatus==='verifying' ? '⏳' : '✅ Verify'}</button>
              </div>
              {otpMessage && <div className={`rt-otp-msg rt-otp-${otpStatus}`}>{otpMessage}</div>}
              <div className="rt-otp-hint">
                💡 Tell the customer to tap <strong>"Generate OTP"</strong> on their tracking page.
              </div>
            </>
          )}
        </div>
      )}

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
          <input
            id="rt-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            style={{display:'none'}}
            onChange={handlePhotoSelect}
          />
          {photoFile && (
            <button className="rt-retake-btn" onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}>
              🔄 Retake Photo
            </button>
          )}
        </div>
      )}

      <div className="rt-footer">
        <div className="rt-checklist">
          <div className="rt-check done">✅ GPS Tracking</div>
          <div className={`rt-check ${otpVerified?'done':''}`}>{otpVerified?'✅':'⬜'} OTP Verified</div>
          <div className={`rt-check ${photoFile?'done':''}`}>{photoFile?'✅':'⬜'} Photo Taken</div>
        </div>
        <button
          className={`rt-deliver-btn ${otpVerified&&photoFile?'ready':''}`}
          onClick={handleMarkDelivered}
          disabled={marking||uploading||!otpVerified||!photoFile}
        >
          {marking||uploading ? '⏳ Processing…' : '✅ Mark as Delivered'}
        </button>
        {(!otpVerified||!photoFile) && (
          <p className="rt-footer-hint">
            {!otpVerified&&!photoFile ? '⚠️ Verify OTP and take a photo first'
              : !otpVerified ? '⚠️ Verify OTP first'
              : '⚠️ Take a delivery photo first'}
          </p>
        )}
      </div>
    </div>
  );
}
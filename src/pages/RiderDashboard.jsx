import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './RiderDashboard.css';

// ─────────────────────────────────────────────────────────────────────────────
// GPS singleton
// ─────────────────────────────────────────────────────────────────────────────
const GPS = {
  _watchId:    null,
  _interval:   null,
  _orderId:    null,
  _riderEmail: null,
  _riderName:  null,
  _sessionId:  null,
  _sendFn:     null,
  _lastPos:    null,

  isActive()      { return this._interval !== null; },
  activeOrderId() { return this._orderId; },
  lastPosition()  { return this._lastPos; },

  start({ orderId, riderEmail, riderName, sessionId, sendFn }) {
    if (this._interval) return;
    if (!navigator.geolocation) return;
    this._orderId    = orderId;
    this._riderEmail = riderEmail;
    this._riderName  = riderName;
    this._sessionId  = sessionId;
    this._sendFn     = sendFn;
    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this._lastPos = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading:  pos.coords.heading,
          speed:    pos.coords.speed,
        };
      },
      (err) => console.error('GPS watch error:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
    // ✅ Send location to Convex every 10 seconds
    this._interval = setInterval(() => {
      if (this._lastPos && this._sendFn) {
        this._sendFn({
          orderId:    this._orderId,
          riderEmail: this._riderEmail,
          riderName:  this._riderName,
          lat:        this._lastPos.lat,
          lng:        this._lastPos.lng,
          accuracy:   this._lastPos.accuracy,
          heading:    this._lastPos.heading ?? undefined,
          speed:      this._lastPos.speed   ?? undefined,
          isTracking: true,
          sessionId:  this._sessionId,
        }).catch(err => console.error('Location send failed:', err));
      }
    }, 10000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this._lastPos = {
          lat:      pos.coords.latitude,
          lng:      pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading:  pos.coords.heading,
          speed:    pos.coords.speed,
        };
        if (this._sendFn) {
          this._sendFn({
            orderId:    this._orderId,
            riderEmail: this._riderEmail,
            riderName:  this._riderName,
            lat:        this._lastPos.lat,
            lng:        this._lastPos.lng,
            accuracy:   this._lastPos.accuracy,
            heading:    this._lastPos.heading ?? undefined,
            speed:      this._lastPos.speed   ?? undefined,
            isTracking: true,
            sessionId:  this._sessionId,
          }).catch(() => {});
        }
      },
      (err) => console.error('GPS initial fix failed:', err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  },

  updateSendFn(fn) { this._sendFn = fn; },

  stopLocal() {
    if (this._interval)         { clearInterval(this._interval); this._interval = null; }
    if (this._watchId !== null) { navigator.geolocation.clearWatch(this._watchId); this._watchId = null; }
    this._lastPos = null;
  },

  async stopOnDelivery(stopFn) {
    const orderId = this._orderId;
    this.stopLocal();
    this._orderId    = null;
    this._riderEmail = null;
    this._riderName  = null;
    this._sessionId  = null;
    this._sendFn     = null;
    if (orderId && stopFn) {
      try { await stopFn({ orderId }); } catch (e) { console.error(e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Route fetcher (OSRM)
// ─────────────────────────────────────────────────────────────────────────────
const fetchRoute = async (fromLat, fromLng, toLat, toLng) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.code === 'Ok' && data.routes?.length > 0)
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {}
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Directional arrow icon builder
// ─────────────────────────────────────────────────────────────────────────────
const buildRiderIconHtml = (heading) => {
  const hasHeading = heading !== null && heading !== undefined && !isNaN(Number(heading));

  if (!document.getElementById('rider-marker-style')) {
    const s = document.createElement('style');
    s.id = 'rider-marker-style';
    s.textContent = `
      @keyframes riderPulse {
        0%   { transform: scale(1);   opacity: 0.6; }
        100% { transform: scale(2.2); opacity: 0; }
      }`;
    document.head.appendChild(s);
  }

  const pulseRing = `
    <div style="
      position:absolute;inset:-6px;
      background:rgba(252,18,104,0.3);
      border-radius:50%;
      animation:riderPulse 1.5s ease-out infinite;
      pointer-events:none;
    "></div>`;

  if (!hasHeading) {
    return `
      <div style="position:relative;width:38px;height:38px;">
        ${pulseRing}
        <div style="
          width:38px;height:38px;
          background:linear-gradient(135deg,#fc1268,#ff5a9d);
          border-radius:50%;
          border:3px solid white;
          box-shadow:0 3px 12px rgba(252,18,104,0.55);
          display:flex;align-items:center;justify-content:center;
          font-size:17px;
        ">🛵</div>
      </div>`;
  }

  return `
    <div style="position:relative;width:50px;height:50px;">
      ${pulseRing}
      <div style="
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        transform:rotate(${Number(heading)}deg);
      ">
        <svg width="50" height="50" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="rg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ff5a9d"/>
              <stop offset="100%" stop-color="#fc1268"/>
            </radialGradient>
            <filter id="ds">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(252,18,104,0.45)"/>
            </filter>
          </defs>
          <circle cx="25" cy="25" r="22" fill="url(#rg)" stroke="white" stroke-width="3" filter="url(#ds)"/>
          <polygon points="25,7 32,30 25,25 18,30" fill="white" opacity="0.95"/>
        </svg>
      </div>
      <div style="
        position:absolute;inset:0;
        display:flex;align-items:center;justify-content:center;
        font-size:14px;
        pointer-events:none;
        padding-top:4px;
      ">🛵</div>
    </div>`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Fullscreen map modal
// ─────────────────────────────────────────────────────────────────────────────
const FullscreenMapModal = ({ address, customerName, coords, riderCoords, riderHeading, onClose }) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const unmountedRef   = useRef(false);
  const routeLayerRef  = useRef(null);
  const riderMarkerRef = useRef(null);
  const routeDrawnRef  = useRef(false);
  const [geocoding, setGeocoding] = useState(!coords);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    unmountedRef.current  = false;
    routeDrawnRef.current = false;
    if (!mapRef.current || mapInstanceRef.current) return;
    let intervalId = null;
    const initMap = () => {
      if (!window.L || !mapRef.current || unmountedRef.current) return;
      try {
        const L      = window.L;
        const startLat = coords?.lat ?? 14.5995;
        const startLng = coords?.lng ?? 120.9842;
        const map = L.map(mapRef.current, { zoomControl: false, tap: false, scrollWheelZoom: true })
          .setView([startLat, startLng], coords ? 16 : 14);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);

        const customerIcon = L.divIcon({
          className: '',
          html: `<div style="background:#3b82f6;color:white;border-radius:50% 50% 50% 0;
            width:44px;height:44px;display:flex;align-items:center;justify-content:center;
            font-size:20px;transform:rotate(-45deg);
            box-shadow:0 4px 14px rgba(59,130,246,0.55);border:3px solid white;">
            <span style="transform:rotate(45deg)">🏠</span></div>`,
          iconSize: [44, 44], iconAnchor: [22, 44], popupAnchor: [0, -48],
        });
        const popupLabel     = customerName ? `${customerName}'s Location` : 'Customer Location';
        const customerMarker = L.marker([startLat, startLng], { icon: customerIcon })
          .addTo(map)
          .bindPopup(`<div style="font-size:13px;max-width:220px"><strong>📍 ${popupLabel}</strong><br><small>${address}</small></div>`)
          .openPopup();
        mapInstanceRef.current = map;
        setTimeout(() => { try { map.invalidateSize(); } catch {} }, 350);

        if (riderCoords?.lat && riderCoords?.lng && !routeDrawnRef.current) {
          routeDrawnRef.current = true;
          const riderIcon = L.divIcon({
            className: '',
            html: buildRiderIconHtml(riderHeading),
            iconSize: [50, 50], iconAnchor: [25, 25], popupAnchor: [0, -28],
          });
          riderMarkerRef.current = L.marker([riderCoords.lat, riderCoords.lng], { icon: riderIcon })
            .addTo(map).bindPopup('<strong>🛵 Your Location</strong>');
          map.fitBounds([[riderCoords.lat, riderCoords.lng], [startLat, startLng]], { padding: [40, 40] });
          fetchRoute(riderCoords.lat, riderCoords.lng, startLat, startLng).then(latlngs => {
            if (unmountedRef.current || !mapInstanceRef.current || !latlngs) return;
            try {
              if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);
              routeLayerRef.current = L.polyline(latlngs, {
                color: '#fc1268', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round',
              }).addTo(mapInstanceRef.current);
            } catch {}
          });
        }

        if (!coords) {
          fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Philippines')}&limit=1`, {
            headers: { 'Accept-Language': 'en' },
          }).then(r => r.json()).then(data => {
            if (unmountedRef.current || !mapInstanceRef.current) return;
            if (data?.length > 0) {
              const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
              customerMarker.setLatLng([lat, lng]).openPopup();
              map.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
            }
            if (!unmountedRef.current) setGeocoding(false);
          }).catch(() => { if (!unmountedRef.current) setGeocoding(false); });
        }
      } catch (err) {
        console.error('FullscreenMap init error:', err);
        if (!unmountedRef.current) setGeocoding(false);
      }
    };
    if (window.L) { initMap(); }
    else { intervalId = setInterval(() => { if (window.L) { clearInterval(intervalId); intervalId = null; initMap(); } }, 100); }
    return () => {
      unmountedRef.current = true;
      if (intervalId !== null) { clearInterval(intervalId); }
      if (mapInstanceRef.current) { try { mapInstanceRef.current.remove(); } catch {} mapInstanceRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fullscreen-map-overlay" onClick={onClose}>
      <div className="fullscreen-map-modal" onClick={e => e.stopPropagation()}>
        <div className="fullscreen-map-header">
          <div className="fullscreen-map-header-left">
            <i className="fas fa-map-marked-alt"></i>
            <div>
              <strong>{customerName ? `${customerName}'s Location` : 'Customer Location'}</strong>
              <span>{address}</span>
            </div>
          </div>
          <button className="fullscreen-map-close" onClick={onClose} type="button" aria-label="Close map">
            <i className="fas fa-times"></i>
          </button>
        </div>
        {geocoding && (
          <div className="fullscreen-map-loading">
            <div className="fullscreen-map-loading-bar"></div>
            <span>Locating address on map…</span>
          </div>
        )}
        <div ref={mapRef} className="fullscreen-map-container" />
        <div className="fullscreen-map-footer">
          <span><i className="fas fa-hand-pointer"></i> Pinch to zoom · Drag to pan</span>
          <span className="fullscreen-map-footer-right">
            {riderCoords
              ? <><i className="fas fa-route" style={{ color: '#fc1268' }}></i> Route shown in pink</>
              : <><i className="fas fa-search-plus"></i> Use +/− to zoom</>}
          </span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer map (inline) — with auto-refresh rider position every 10s
// ─────────────────────────────────────────────────────────────────────────────
const CustomerMap = ({ orderId, allOrders, riderCoords, riderHeading }) => {
  const mapRef             = useRef(null);
  const mapInstanceRef     = useRef(null);
  const markerRef          = useRef(null);
  const routeLayerRef      = useRef(null);
  const riderMarkerRef     = useRef(null);
  const unmountedRef       = useRef(false);
  const routeDrawnRef      = useRef(false);
  const prevRiderRef       = useRef(null);
  const prevHeadingRef     = useRef(null);
  // ✅ Track position where route was last drawn — to redraw when rider moves significantly
  const lastRouteRiderRef  = useRef(null);

  const [mapError, setMapError]           = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(!!window.L);
  const [geocoding, setGeocoding]         = useState(false);
  const [addressText, setAddressText]     = useState('');
  const [showFullscreen, setShowFullscreen] = useState(false);

  const order        = allOrders.find(o => o.orderId === orderId);
  const address      = order?.shippingAddress || order?.address || order?.deliveryAddress || '';
  const customerName = order?.customerName || order?.name || '';
  const savedCoords  = (order?.addressLat && order?.addressLng)
    ? { lat: order.addressLat, lng: order.addressLng } : null;

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
    script.onload = () => setLeafletLoaded(true);
    script.onerror = () => setMapError('Failed to load map library.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletLoaded || mapInstanceRef.current || !mapRef.current) return;
    try {
      const L        = window.L;
      const startLat = savedCoords?.lat ?? 14.5995;
      const startLng = savedCoords?.lng ?? 120.9842;
      const map = L.map(mapRef.current, { zoomControl: false, tap: false, scrollWheelZoom: false, dragging: true })
        .setView([startLat, startLng], savedCoords ? 16 : 14);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const customerIcon = L.divIcon({
        className: '',
        html: `<div style="background:#3b82f6;color:white;border-radius:50% 50% 50% 0;
          width:36px;height:36px;display:flex;align-items:center;justify-content:center;
          font-size:16px;transform:rotate(-45deg);
          box-shadow:0 3px 10px rgba(59,130,246,0.5);border:3px solid white;">
          <span style="transform:rotate(45deg)">🏠</span></div>`,
        iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -40],
      });
      const marker = L.marker([startLat, startLng], { icon: customerIcon })
        .addTo(map)
        .bindPopup(savedCoords
          ? `<div style="font-size:13px;max-width:200px"><strong>📍 ${customerName ? customerName + "'s Location" : 'Customer Location'}</strong><br><small>${address}</small></div>`
          : '<strong>📍 Customer Location</strong>');
      if (savedCoords) marker.openPopup();
      mapInstanceRef.current = map;
      markerRef.current      = marker;
      setTimeout(() => { try { map.invalidateSize(); } catch {} }, 300);
    } catch { setMapError('Failed to initialize map.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletLoaded]);

  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !window.L) return;
    const L = window.L;

    const plotCustomer = (custLat, custLng) => {
      if (unmountedRef.current) return;
      try {
        markerRef.current.setLatLng([custLat, custLng]);
        markerRef.current.getPopup()?.setContent(
          `<div style="font-size:13px;max-width:200px;">
            <strong>📍 ${customerName ? customerName + "'s Location" : 'Customer Location'}</strong><br>
            <small>${address}</small></div>`);
        if (savedCoords) markerRef.current.openPopup();
      } catch {}

      if (riderCoords?.lat && riderCoords?.lng) {
        const coordsChanged   = prevRiderRef.current?.lat !== riderCoords.lat || prevRiderRef.current?.lng !== riderCoords.lng;
        const headingChanged  = prevHeadingRef.current !== riderHeading;
        prevRiderRef.current  = { lat: riderCoords.lat, lng: riderCoords.lng };
        prevHeadingRef.current = riderHeading;

        // ✅ FIX: Check if rider moved >50m from where route was last drawn
        // If so, reset routeDrawnRef so route is redrawn with updated path
        if (routeDrawnRef.current && lastRouteRiderRef.current) {
          const dLat = Math.abs(lastRouteRiderRef.current.lat - riderCoords.lat);
          const dLng = Math.abs(lastRouteRiderRef.current.lng - riderCoords.lng);
          if (dLat > 0.0005 || dLng > 0.0005) {
            // Rider moved ~55m+ — redraw route
            routeDrawnRef.current = false;
          }
        }

        if (!riderMarkerRef.current) {
          const riderIcon = L.divIcon({
            className: '',
            html: buildRiderIconHtml(riderHeading),
            iconSize: [50, 50], iconAnchor: [25, 25], popupAnchor: [0, -28],
          });
          riderMarkerRef.current = L.marker([riderCoords.lat, riderCoords.lng], { icon: riderIcon })
            .addTo(mapInstanceRef.current)
            .bindPopup('<strong>🛵 Your Location</strong>');
        } else {
          if (coordsChanged) {
            try { riderMarkerRef.current.setLatLng([riderCoords.lat, riderCoords.lng]); } catch {}
          }
          if (coordsChanged || headingChanged) {
            try {
              riderMarkerRef.current.setIcon(L.divIcon({
                className: '',
                html: buildRiderIconHtml(riderHeading),
                iconSize: [50, 50], iconAnchor: [25, 25], popupAnchor: [0, -28],
              }));
            } catch {}
          }
        }

        if (!routeDrawnRef.current) {
          routeDrawnRef.current = true;
          lastRouteRiderRef.current = { lat: riderCoords.lat, lng: riderCoords.lng };
          try { mapInstanceRef.current.fitBounds([[riderCoords.lat, riderCoords.lng], [custLat, custLng]], { padding: [30, 30] }); } catch {}
          fetchRoute(riderCoords.lat, riderCoords.lng, custLat, custLng).then(latlngs => {
            if (unmountedRef.current || !latlngs || !mapInstanceRef.current) return;
            try {
              if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);
              routeLayerRef.current = L.polyline(latlngs, {
                color: '#fc1268', weight: 5, opacity: 0.8, lineJoin: 'round', lineCap: 'round',
              }).addTo(mapInstanceRef.current);
            } catch {}
          });
        }
      } else if (!routeDrawnRef.current) {
        routeDrawnRef.current = true;
        try { mapInstanceRef.current.setView([custLat, custLng], 16); } catch {}
      }
    };

    if (savedCoords) {
      setAddressText(address);
      plotCustomer(savedCoords.lat, savedCoords.lng);
    } else if (address) {
      setAddressText(address);
      setGeocoding(true);
      setMapError(null);
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Philippines')}&limit=1`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'DKMerch-RiderApp/1.0' },
      }).then(r => r.json()).then(data => {
        if (unmountedRef.current) return;
        if (data?.length > 0) plotCustomer(parseFloat(data[0].lat), parseFloat(data[0].lon));
        else if (!unmountedRef.current) setMapError('Address not found on map.');
      }).catch(() => { if (!unmountedRef.current) setMapError('Could not load map location.'); })
        .finally(() => { if (!unmountedRef.current) setGeocoding(false); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCoords?.lat, savedCoords?.lng, address, leafletLoaded, riderCoords?.lat, riderCoords?.lng, riderHeading]);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null; markerRef.current = null;
        riderMarkerRef.current = null; routeLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handler = () => setTimeout(() => { try { mapInstanceRef.current?.invalidateSize(); } catch {} }, 350);
    window.addEventListener('rider-sidebar-closed', handler);
    return () => window.removeEventListener('rider-sidebar-closed', handler);
  }, []);

  if (!address) return (
    <div className="customer-map-no-address">
      <i className="fas fa-map-marker-alt"></i>
      <span>No address saved for this order.</span>
    </div>
  );

  return (
    <>
      <div className="customer-map-wrapper">
        <div className="customer-map-address-bar">
          <i className="fas fa-home"></i>
          <span>{addressText || address}</span>
          {geocoding && <span className="customer-map-geocoding">📍 Locating...</span>}
        </div>
        {mapError && <div className="customer-map-error"><i className="fas fa-exclamation-triangle"></i> {mapError}</div>}
        <div className="customer-map-inner-wrapper">
          <div ref={mapRef} className="customer-map-container" />
          <button className="customer-map-fullscreen-btn" onClick={() => setShowFullscreen(true)} type="button" title="View full map">
            <i className="fas fa-expand-alt"></i><span>View Full Map</span>
          </button>
        </div>
        <div className="customer-map-zoom-hint">
          <i className="fas fa-search-plus"></i>
          <span>Use <strong>+</strong> / <strong>−</strong> on map to zoom</span>
          <button className="customer-map-fullscreen-link" onClick={() => setShowFullscreen(true)} type="button">
            <i className="fas fa-expand-alt"></i> Full Screen
          </button>
        </div>
      </div>
      {showFullscreen && address && (
        <FullscreenMapModal
          address={address}
          customerName={customerName}
          coords={savedCoords}
          riderCoords={riderCoords}
          riderHeading={riderHeading}
          onClose={() => setShowFullscreen(false)}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Notif bell
// ─────────────────────────────────────────────────────────────────────────────
const RiderNotifBell = ({ onGoToAvailable }) => {
  const [open, setOpen]   = useState(false);
  const notifications     = useQuery(api.riderNotifications?.getUnread ?? 'skip') || [];
  const markRead          = useMutation(api.riderNotifications?.markAllRead ?? 'skip');
  const unreadCount       = notifications.length;
  const handleMarkRead = async () => {
    try { await markRead({}); } catch {}
    setOpen(false); onGoToAvailable?.();
  };
  if (unreadCount === 0 && !open) return null;
  return (
    <div className="rider-notif-wrapper">
      <button className="rider-notif-bell-btn" onClick={() => setOpen(o => !o)} type="button">
        <i className="fas fa-bell"></i>
        {unreadCount > 0 && <span className="rider-notif-count">{unreadCount}</span>}
      </button>
      {open && (
        <div className="rider-notif-dropdown">
          <div className="rider-notif-header">
            <strong>🔔 New Orders Available</strong>
            <button onClick={() => setOpen(false)} className="rider-notif-close">✕</button>
          </div>
          {notifications.length === 0 ? (
            <div className="rider-notif-empty">No new notifications</div>
          ) : (
            <>
              {notifications.slice(0, 5).map((n, i) => (
                <div key={i} className="rider-notif-item">
                  <div className="rider-notif-icon">📦</div>
                  <div className="rider-notif-text">
                    <strong>New order confirmed!</strong>
                    <span>{n.customerName} · ₱{(n.total || 0).toLocaleString()}</span>
                    <small>#{n.orderId?.slice(-8)}</small>
                  </div>
                </div>
              ))}
              <button className="rider-notif-view-btn" onClick={handleMarkRead}>
                <i className="fas fa-box-open"></i> View Available Orders
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// KICKED-OUT COUNTDOWN
// ─────────────────────────────────────────────────────────────────────────────
const KICKED_DURATION_SEC = 180;

const useKickedCountdown = (kickedAt) => {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!kickedAt) { setRemaining(null); return; }
    const tick = () => {
      const elapsed = Math.floor((Date.now() - kickedAt) / 1000);
      const left    = Math.max(0, KICKED_DURATION_SEC - elapsed);
      setRemaining(left);
      return left;
    };
    const left = tick();
    if (left === 0) return;
    const id = setInterval(() => {
      const l = tick();
      if (l === 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [kickedAt]);

  return remaining;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main dashboard
// ─────────────────────────────────────────────────────────────────────────────
const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation(); // ── CHANGE 2: Added useLocation

  // ── CHANGE 3: Read ?tab from URL on initial mount
  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    // If GPS is active on a delivery, deliver tab takes priority
    if (GPS.isActive()) return 'deliver';
    if (urlTab === 'available' || urlTab === 'my-pickups' || urlTab === 'deliver') return urlTab;
    return 'available';
  });

  const [sidebarOpen, setSidebarOpen]               = useState(false);
  const [expandedOrders, setExpandedOrders]         = useState({});
  const [expandedPickups, setExpandedPickups]       = useState({});
  const [expandedDeliveries, setExpandedDeliveries] = useState({});
  const [otpInputs, setOtpInputs]                   = useState({});
  const [photoData, setPhotoData]                   = useState({});
  const [otpErrors, setOtpErrors]                   = useState({});
  const [confirmingId, setConfirmingId]             = useState(null);
  const [notifyingId, setNotifyingId]               = useState(null);
  const [lastSeenAvailable, setLastSeenAvailable]   = useState(0);
  const [lastSeenPickups, setLastSeenPickups]       = useState(0);
  const [lastSeenDeliveries, setLastSeenDeliveries] = useState(0);
  const initializedRef        = useRef(false);
  const [trackingOrderId, setTrackingOrderId] = useState(() => GPS.activeOrderId());
  const [gpsError, setGpsError]               = useState(null);
  const [currentPosition, setCurrentPosition] = useState(() => GPS.lastPosition());
  const autoStartAttemptedRef = useRef(false);
  const fileInputRefs         = useRef({});

  const [kickedOut, setKickedOut]     = useState(false);
  const hasBeenKickedRef              = useRef(false);
  const [kickedAtTimestamp, setKickedAtTimestamp] = useState(null);
  const remainingCountdown = useKickedCountdown(kickedAtTimestamp);

  // ── PWA Install ──
  const [installPrompt, setInstallPrompt]     = useState(null);
  const [showIosInstall, setShowIosInstall]   = useState(false);
  const [isInstalled, setIsInstalled]         = useState(false);
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  useEffect(() => {
    if (isInStandaloneMode) { setIsInstalled(true); return; }
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setIsInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (isIos) { setShowIosInstall(true); return; }
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setInstallPrompt(null);
  };

  const riderInfo  = useQuery(api.riders.getRiderByEmail,  user?.email ? { email: user.email } : 'skip');
  const allOrders  = useQuery(api.orders.getAllOrders)  || [];
  const allPickups = useQuery(api.pickupRequests.getAllPickupRequests) || [];
  const sessionCheck = useQuery(
    api.riders.checkRiderSession,
    user?.email && user?.sessionId ? { email: user.email, sessionId: user.sessionId } : 'skip'
  );

  const createPickupRequest = useMutation(api.pickupRequests.createPickupRequest);
  const updateOrderFields   = useMutation(api.orders.updateOrderFields);
  const updatePickupStatus  = useMutation(api.pickupRequests.updatePickupStatus);
  const deletePickupRequest = useMutation(api.pickupRequests.deletePickupRequest);
  const updateRiderLocation = useMutation(api.riders.updateRiderLocation);
  const stopRiderTracking   = useMutation(api.riders.stopRiderTracking);
  const setRiderKickedAt    = useMutation(api.riders.setRiderKickedAt);

  useEffect(() => { if (GPS.isActive()) GPS.updateSendFn(updateRiderLocation); });

  useEffect(() => {
    const activeId = GPS.activeOrderId();
    const lastPos  = GPS.lastPosition();
    if (activeId) { setTrackingOrderId(activeId); setTab('deliver'); }
    if (lastPos)   setCurrentPosition(lastPos);
  }, []);

  // ✅ Sync currentPosition every 2s so map updates in real-time
  useEffect(() => {
    const sync = setInterval(() => {
      setTrackingOrderId(GPS.activeOrderId());
      setCurrentPosition(GPS.lastPosition());
    }, 2000);
    return () => clearInterval(sync);
  }, []);

  useEffect(() => {
    if (!riderInfo) return;
    if (hasBeenKickedRef.current) return;
    if (!riderInfo.kickedAt) return;
    const elapsed = Math.floor((Date.now() - riderInfo.kickedAt) / 1000);
    const left    = KICKED_DURATION_SEC - elapsed;
    if (left > 0) {
      hasBeenKickedRef.current = true;
      setKickedOut(true);
      setKickedAtTimestamp(riderInfo.kickedAt);
      GPS.stopLocal();
      setTrackingOrderId(null);
      setCurrentPosition(null);
    }
  }, [riderInfo]);

  const confirmedOrders = allOrders
    .filter(o =>
      (o.orderStatus === 'confirmed' || o.status === 'Confirmed') &&
      !allPickups.some(p => p.orderId === o.orderId && p.status === 'approved')
    )
    .sort((a, b) => {
      const aTime = a.confirmedAt ? new Date(a.confirmedAt).getTime() : (a._creationTime || 0);
      const bTime = b.confirmedAt ? new Date(b.confirmedAt).getTime() : (b._creationTime || 0);
      return bTime - aTime;
    });

  const myPickups = allPickups
    .filter(p => p.riderEmail === user?.email)
    .sort((a, b) => {
      const t = p => p.approvedAt ? new Date(p.approvedAt).getTime() : p.requestedAt ? new Date(p.requestedAt).getTime() : (p._creationTime || 0);
      return t(b) - t(a);
    });

  const myDeliveries = myPickups
    .filter(p => (p.status === 'approved' || p.status === 'out_for_delivery') && allOrders.some(o => o.orderId === p.orderId))
    .sort((a, b) => {
      if (a.status === 'out_for_delivery' && b.status !== 'out_for_delivery') return -1;
      if (b.status === 'out_for_delivery' && a.status !== 'out_for_delivery') return  1;
      return (new Date(b.requestedAt).getTime()) - (new Date(a.requestedAt).getTime());
    });

  const pendingPickupsCount   = myPickups.filter(p => p.status === 'pending').length;
  const activeDeliveriesCount = myDeliveries.length;

  useEffect(() => {
    if (!initializedRef.current && (allOrders.length > 0 || allPickups.length > 0)) {
      setLastSeenAvailable(confirmedOrders.length);
      setLastSeenPickups(myPickups.length);
      setLastSeenDeliveries(myDeliveries.length);
      initializedRef.current = true;
    }
  }, [allOrders.length, allPickups.length]); // eslint-disable-line

  const handleNavClick = useCallback((newTab) => {
    setTab(newTab);
    if (newTab === 'available')  setLastSeenAvailable(confirmedOrders.length);
    if (newTab === 'my-pickups') setLastSeenPickups(myPickups.length);
    if (newTab === 'deliver')    setLastSeenDeliveries(myDeliveries.length);
    setSidebarOpen(false);
    setTimeout(() => window.dispatchEvent(new Event('rider-sidebar-closed')), 350);
  }, [confirmedOrders.length, myPickups.length, myDeliveries.length]);

  const newAvailableCount  = Math.max(0, confirmedOrders.length - lastSeenAvailable);
  const newPickupsCount    = Math.max(0, myPickups.length - lastSeenPickups);
  const newDeliveriesCount = Math.max(0, myDeliveries.length - lastSeenDeliveries);

  useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    if (!riderInfo || !user?.email || !user?.sessionId) return;
    if (myDeliveries.length === 0 || GPS.isActive()) return;
    const active = myDeliveries.find(d => d.status === 'out_for_delivery');
    if (!active) return;
    autoStartAttemptedRef.current = true;
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device.'); return; }
    GPS.start({ orderId: active.orderId, riderEmail: user.email, riderName: riderInfo.fullName, sessionId: user.sessionId, sendFn: updateRiderLocation });
    setTrackingOrderId(active.orderId);
    setTab('deliver');
    setExpandedDeliveries(prev => ({ ...prev, [active._id]: true }));
  }, [riderInfo, myDeliveries, user, updateRiderLocation]);

  const handleForcedLogout = useCallback(() => {
    logout(); navigate('/', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    if (kickedOut && remainingCountdown === 0) {
      handleForcedLogout();
    }
  }, [kickedOut, remainingCountdown, handleForcedLogout]);

  useEffect(() => {
    if (!sessionCheck) return;
    if (hasBeenKickedRef.current) return;
    if (!sessionCheck.valid && sessionCheck.reason === 'new_device_logged_in') {
      hasBeenKickedRef.current = true;
      const now = Date.now();
      setKickedOut(true);
      setKickedAtTimestamp(now);
      GPS.stopLocal();
      setTrackingOrderId(null);
      setCurrentPosition(null);
      if (user?.email) {
        setRiderKickedAt({ email: user.email, kickedAt: now }).catch(e => console.error('setRiderKickedAt failed:', e));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCheck]);

  const startTracking = useCallback((orderId) => {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device.'); return; }
    if (!riderInfo) return;
    setGpsError(null);
    GPS.start({ orderId, riderEmail: user.email, riderName: riderInfo.fullName, sessionId: user.sessionId, sendFn: updateRiderLocation });
    setTrackingOrderId(orderId);
  }, [riderInfo, user, updateRiderLocation]);

  const stopTrackingLocal      = useCallback(() => { GPS.stopLocal(); setTrackingOrderId(null); setCurrentPosition(null); }, []);
  const stopTrackingOnDelivery = useCallback(async () => { await GPS.stopOnDelivery(stopRiderTracking); setTrackingOrderId(null); setCurrentPosition(null); }, [stopRiderTracking]);

  const toggleExpanded   = (id, setFn) => setFn(prev => ({ ...prev, [id]: !prev[id] }));
  const getMyRequestStatus = (orderId) => { const r = myPickups.find(p => p.orderId === orderId); return r ? r.status : null; };
  const getPickupStatusStyle = (status) => ({ pending: { bg: '#fff3cd', color: '#856404' }, approved: { bg: '#d1fae5', color: '#0f5132' }, rejected: { bg: '#fee2e2', color: '#991b1b' }, out_for_delivery: { bg: '#dbeafe', color: '#1e40af' }, completed: { bg: '#d1fae5', color: '#065f46' } }[status] || { bg: '#e2e8f0', color: '#475569' });
  const getStatusLabel = (status) => ({ pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected', out_for_delivery: '🚚 Out for Delivery', completed: '🎉 Delivered' }[status] || status);

  const closeSidebar = useCallback(() => { setSidebarOpen(false); setTimeout(() => window.dispatchEvent(new Event('rider-sidebar-closed')), 350); }, []);
  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?\n\n📍 GPS tracking will continue running for the customer until delivery is confirmed.')) {
      logout(); navigate('/', { replace: true });
    }
  };

  const requestPickup = async (order) => {
    if (!riderInfo) return;
    if (allPickups.find(p => p.orderId === order.orderId && p.status === 'approved')) { alert('❌ Sorry! Another rider was already approved for this order.'); return; }
    if (myPickups.find(p => p.orderId === order.orderId && p.status === 'pending'))   { alert('You already have a pending request for this order.'); return; }
    try {
      await createPickupRequest({ orderId: order.orderId, riderId: riderInfo._id, riderName: riderInfo.fullName, riderEmail: user.email, riderPhone: riderInfo.phone || '', riderVehicle: riderInfo.vehicleType || '', riderPlate: riderInfo.plateNumber || '', customerName: order.customerName || order.name || '', total: order.total || 0, requestedAt: new Date().toISOString(), status: 'pending' });
      alert('✅ Pickup request sent! Waiting for admin approval.');
    } catch (err) { console.error(err); alert('Failed to send pickup request. Please try again.'); }
  };

  const notifyCustomer = async (delivery) => {
    if (!window.confirm('Notify the customer that their order is on the way?')) return;
    setNotifyingId(delivery._id);
    try {
      await updateOrderFields({ orderId: delivery.orderId, orderStatus: 'out_for_delivery', status: 'Out for Delivery', riderInfo: { name: riderInfo.fullName, phone: riderInfo.phone, vehicle: riderInfo.vehicleType, plate: riderInfo.plateNumber } });
      await updatePickupStatus({ requestId: delivery._id, status: 'out_for_delivery' });
      startTracking(delivery.orderId);
      alert('📦 Customer notified!\n\n📍 GPS tracking has started automatically.\nThe customer can now see your location in real-time.\n\nAsk the customer for their OTP code when you arrive.');
    } catch (err) { console.error(err); alert('Failed to notify customer. Please try again.'); }
    finally { setNotifyingId(null); }
  };

  const handlePhotoSelect = (deliveryId, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setOtpErrors(p => ({ ...p, [deliveryId]: 'Photo must be under 5MB.' })); return; }
    const reader = new FileReader();
    reader.onload = (e) => { setPhotoData(p => ({ ...p, [deliveryId]: e.target.result })); setOtpErrors(p => ({ ...p, [deliveryId]: '' })); };
    reader.readAsDataURL(file);
  };

  const confirmDelivery = async (delivery) => {
    const inputOtp = (otpInputs[delivery._id] || '').trim();
    const photo    = photoData[delivery._id];
    const order    = allOrders.find(o => o.orderId === delivery.orderId || o.orderId?.trim() === delivery.orderId?.trim());
    if (!order)                             { setOtpErrors(p => ({ ...p, [delivery._id]: '⏳ Order data is still loading. Please wait a moment and try again.' })); return; }
    if (!inputOtp)                          { setOtpErrors(p => ({ ...p, [delivery._id]: 'Please enter the OTP from the customer.' })); return; }
    if (!order.deliveryOtp)                 { setOtpErrors(p => ({ ...p, [delivery._id]: '⏳ The customer has not generated their OTP yet. Ask them to open their tracking page.' })); return; }
    if (inputOtp !== order.deliveryOtp)     { setOtpErrors(p => ({ ...p, [delivery._id]: '❌ Incorrect OTP. Please ask the customer for the correct code.' })); return; }
    if (!window.confirm('Confirm delivery? This will mark the order as Completed.')) return;
    setConfirmingId(delivery._id);
    try {
      await updateOrderFields({ orderId: delivery.orderId, orderStatus: 'completed', status: 'Delivered', deliveryOtpVerified: true, deliveryConfirmedAt: new Date().toISOString(), ...(photo ? { deliveryProofPhoto: photo } : {}) });
      await updatePickupStatus({ requestId: delivery._id, status: 'completed' });
      await stopTrackingOnDelivery(delivery.orderId);
      setOtpInputs(p => { const n = { ...p }; delete n[delivery._id]; return n; });
      setPhotoData(p => { const n = { ...p }; delete n[delivery._id]; return n; });
      setOtpErrors(p => { const n = { ...p }; delete n[delivery._id]; return n; });
      alert('🎉 Delivery confirmed! Order marked as Completed.');
    } catch (err) { console.error(err); alert('Failed to confirm delivery. Please try again.'); }
    finally { setConfirmingId(null); }
  };

  const handleDeletePickup = async (pickupId, status, orderId) => {
    if (['approved', 'out_for_delivery'].includes(status)) { alert('❌ Cannot delete an active pickup. Complete the delivery first.'); return; }
    if (!window.confirm('Remove this pickup record from your list?')) return;
    try {
      await deletePickupRequest({ requestId: pickupId });
      if (GPS.activeOrderId() === orderId) { GPS.stopLocal(); setTrackingOrderId(null); setCurrentPosition(null); }
    } catch (err) { console.error(err); alert('Failed to remove pickup.'); }
  };

  if (riderInfo === undefined) return <div className="rider-dashboard"><div className="rider-not-approved"><div className="rider-na-icon">🛵</div><h2>Loading...</h2></div></div>;
  if (!riderInfo || riderInfo.status !== 'approved') return (
    <div className="rider-dashboard"><div className="rider-not-approved">
      <div className="rider-na-icon">🛵</div>
      <h2>Account Pending Approval</h2>
      <p>Your rider application is still being reviewed by the admin. Please wait for approval before accessing the dashboard.</p>
      <button className="rider-logout-btn" onClick={handleLogout}>Logout</button>
    </div></div>
  );

  if (kickedOut && remainingCountdown !== null && remainingCountdown > 0) {
    const mins = Math.floor(remainingCountdown / 60);
    const secs = remainingCountdown % 60;
    return (
      <div className="rider-dashboard">
        <div className="rider-kicked-overlay">
          <div className="rider-kicked-card">
            <div className="rider-kicked-icon">📱</div>
            <h2>Logged In on Another Device</h2>
            <p>Your rider account was just logged in on a <strong>new device</strong>. GPS tracking has automatically switched to that device.</p>
            <p className="rider-kicked-note">If this wasn't you, please change your password immediately.</p>
            <div className="rider-kicked-countdown">
              <span className="rider-kicked-timer">{mins}:{secs.toString().padStart(2, '0')}</span>
              <small>This session will close automatically</small>
            </div>
            <button className="rider-kicked-logout-btn" onClick={handleForcedLogout}>
              <i className="fas fa-sign-out-alt"></i> Logout Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  const riderHeading = currentPosition?.heading ?? null;

  return (
    <div className={`rider-dashboard${sidebarOpen ? ' sidebar-open' : ''}`}>
      <header className="rider-mobile-header">
        <button className="rider-burger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><i className="fas fa-bars"></i></button>
        <div className="rider-mobile-logo"><i className="fas fa-motorcycle"></i><span>DKMerch</span></div>
        <div className="rider-mobile-header-right">
          {trackingOrderId && <span className="rider-mobile-gps-pill"><span className="rider-gps-dot"></span>GPS</span>}
          <RiderNotifBell onGoToAvailable={() => handleNavClick('available')} />
          <div className="rider-mobile-avatar"><i className="fas fa-user-circle"></i></div>
        </div>
      </header>
      <div className={`rider-sidebar-overlay ${sidebarOpen ? 'open' : ''}`} onClick={closeSidebar} />
      <aside className={`rider-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="rider-sidebar-header">
          <div>
            <div className="rider-logo"><i className="fas fa-motorcycle"></i><span>DKMerch</span></div>
            <div className="rider-tagline">Rider Dashboard</div>
          </div>
          <button className="rider-sidebar-close" onClick={closeSidebar} aria-label="Close menu"><i className="fas fa-times"></i></button>
        </div>
        <div className="rider-profile-card">
          <div className="rider-avatar"><i className="fas fa-user-circle"></i></div>
          <div className="rider-profile-info">
            <strong>{riderInfo.fullName}</strong>
            <span>{riderInfo.vehicleType}</span>
            <span className="rider-plate">{riderInfo.plateNumber}</span>
          </div>
        </div>
        {trackingOrderId && (
          <div className="rider-gps-sidebar-status">
            <span className="rider-gps-dot"></span>
            <span>GPS Active{currentPosition && <small> · ±{Math.round(currentPosition.accuracy || 0)}m</small>}</span>
          </div>
        )}
        <nav className="rider-nav">
          <button className={`rider-nav-link ${tab === 'available'  ? 'active' : ''}`} onClick={() => handleNavClick('available')}>
            <i className="fas fa-box-open"></i><span>Available Orders</span>
            {confirmedOrders.length > 0 && <span className={`rider-nav-badge ${newAvailableCount  > 0 ? 'rider-nav-badge-new' : ''}`}>{confirmedOrders.length}</span>}
          </button>
          <button className={`rider-nav-link ${tab === 'my-pickups' ? 'active' : ''}`} onClick={() => handleNavClick('my-pickups')}>
            <i className="fas fa-truck-pickup"></i><span>My Pickups</span>
            {pendingPickupsCount > 0 && <span className={`rider-nav-badge ${newPickupsCount > 0 ? 'rider-nav-badge-new' : ''}`}>{pendingPickupsCount}</span>}
          </button>
          <button className={`rider-nav-link ${tab === 'deliver'    ? 'active' : ''}`} onClick={() => handleNavClick('deliver')}>
            <i className="fas fa-shipping-fast"></i><span>Deliver</span>
            {activeDeliveriesCount > 0 && <span className={`rider-nav-badge rider-nav-badge-green ${newDeliveriesCount > 0 ? 'rider-nav-badge-new' : ''}`}>{activeDeliveriesCount}</span>}
          </button>
        </nav>
        <div className="rider-sync-indicator"><span className="sync-dot"></span><span className="sync-text">Live • Real-time</span></div>

        {/* ── PWA Install Button ── */}
        {!isInstalled && (isIos || installPrompt) && (
          <button className="rider-install-btn" onClick={handleInstallClick}>
            <i className="fas fa-download"></i>
            <span>Install App</span>
          </button>
        )}

        <button className="rider-logout-btn" onClick={handleLogout}><i className="fas fa-sign-out-alt"></i><span>Logout</span></button>
      </aside>

      {/* ── iOS Install Modal ── */}
      {showIosInstall && (
        <div className="rider-ios-install-overlay" onClick={() => setShowIosInstall(false)}>
          <div className="rider-ios-install-modal" onClick={e => e.stopPropagation()}>
            <button className="rider-ios-install-close" onClick={() => setShowIosInstall(false)}>
              <i className="fas fa-times"></i>
            </button>
            <div className="rider-ios-install-icon">
              <img src="/images/dklogo2-removebg-preview.png" alt="DKMerch" />
            </div>
            <h3>Install DKMerch</h3>
            <p>Install this app on your iPhone for faster access to your deliveries.</p>
            <div className="rider-ios-steps">
              <div className="rider-ios-step">
                <span className="rider-ios-step-num">1</span>
                <span>Tap the <strong>Share</strong> button <i className="fas fa-share-square" style={{color:'#007AFF'}}></i> at the bottom of Safari</span>
              </div>
              <div className="rider-ios-step">
                <span className="rider-ios-step-num">2</span>
                <span>Scroll down and tap <strong>"Add to Home Screen"</strong> <i className="fas fa-plus-square" style={{color:'#007AFF'}}></i></span>
              </div>
              <div className="rider-ios-step">
                <span className="rider-ios-step-num">3</span>
                <span>Tap <strong>"Add"</strong> in the top right corner</span>
              </div>
            </div>
            <button className="rider-ios-install-done" onClick={() => setShowIosInstall(false)}>
              Got it! 👍
            </button>
          </div>
        </div>
      )}

      <main className="rider-main">
        {tab === 'available' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <div className="rider-page-header-top">
                <div><h1>📦 Available Orders</h1><p>Confirmed orders ready for pickup — sorted by most recently confirmed.</p></div>
                <div className="rider-live-badge"><span className="sync-dot"></span>Live Updates</div>
              </div>
            </div>
            {confirmedOrders.length === 0 ? (
              <div className="rider-empty"><i className="fas fa-box-open"></i><p>No confirmed orders available right now.</p><span>Updates are real-time via Convex.</span></div>
            ) : (
              <div className="rider-compact-list">
                {confirmedOrders.map((order, idx) => {
                  const reqStatus  = getMyRequestStatus(order.orderId);
                  const isExpanded = expandedOrders[order.orderId];
                  const isNewest   = idx === 0;
                  return (
                    <div key={order.orderId} className={`rider-compact-card ${isNewest ? 'rider-card-newest' : ''}`}>
                      {isNewest && <div className="rider-newest-tag"><i className="fas fa-bolt"></i> Just Confirmed</div>}
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{order.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {order.customerName || order.name || 'N/A'}</span>
                          <span className="rider-compact-total">₱{(order.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          {reqStatus === 'pending'          && <span className="rider-req-badge pending">⏳ Pending</span>}
                          {reqStatus === 'approved'         && <span className="rider-req-badge approved">✅ Assigned</span>}
                          {reqStatus === 'rejected'         && <span className="rider-req-badge rejected">❌ Rejected</span>}
                          {reqStatus === 'out_for_delivery' && <span className="rider-req-badge out-delivery">🚚 On Way</span>}
                          {reqStatus === 'completed'        && <span className="rider-req-badge completed-badge">✅ Done</span>}
                          {!reqStatus && <button className="rider-pickup-btn-sm" onClick={() => requestPickup(order)}><i className="fas fa-truck-pickup"></i> Request</button>}
                          <button className="rider-view-btn" onClick={() => toggleExpanded(order.orderId, setExpandedOrders)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {order.shippingAddress || order.address || 'N/A'}</span></div>
                          <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {order.phone || 'N/A'}</span></div>
                          <div className="rider-info-row"><i className="fas fa-box"></i><span><strong>Items:</strong> {order.items?.length || 0} item(s)</span></div>
                          <div className="rider-info-row"><i className="fas fa-calendar"></i><span><strong>Date:</strong> {new Date(order._creationTime).toLocaleDateString('en-PH')}</span></div>
                          {order.confirmedAt && <div className="rider-info-row"><i className="fas fa-check-circle"></i><span><strong>Confirmed:</strong> {new Date(order.confirmedAt).toLocaleString('en-PH')}</span></div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'my-pickups' && (
          <div className="rider-content">
            <div className="rider-page-header"><h1>🚚 My Pickup Requests</h1><p>Active and recent pickup requests — approved ones appear first.</p></div>
            {myPickups.length === 0 ? (
              <div className="rider-empty"><i className="fas fa-truck-pickup"></i><p>No pickup requests yet.</p><span>Go to Available Orders to request your first pickup!</span></div>
            ) : (
              <div className="rider-compact-list">
                {myPickups.map(req => {
                  const style      = getPickupStatusStyle(req.status);
                  const isExpanded = expandedPickups[req._id];
                  return (
                    <div key={req._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{req.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {req.customerName}</span>
                          <span className="rider-compact-total">₱{(req.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className="rider-status-pill" style={{ background: style.bg, color: style.color }}>{getStatusLabel(req.status)}</span>
                          <button className="rider-view-btn" onClick={() => toggleExpanded(req._id, setExpandedPickups)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row"><i className="fas fa-calendar"></i><span><strong>Requested:</strong> {new Date(req.requestedAt).toLocaleDateString('en-PH')}</span></div>
                          {req.status === 'approved'         && <div className="rider-approved-notice">🎉 Pickup approved! Go to the <strong>Deliver</strong> tab to notify the customer.</div>}
                          {req.status === 'rejected'         && <div className="rider-rejected-notice">This pickup request was not approved. You may request other available orders.</div>}
                          {req.status === 'out_for_delivery' && <div className="rider-ofd-notice">🚚 Customer notified. Go to <strong>Deliver</strong> tab to confirm delivery.</div>}
                          {req.status === 'completed'        && <div className="rider-completed-notice">🎉 Delivery confirmed and completed!</div>}
                          {['completed', 'rejected', 'pending'].includes(req.status) && (
                            <button className="rider-delete-btn" onClick={() => handleDeletePickup(req._id, req.status, req.orderId)}>
                              <i className="fas fa-trash-alt"></i> Remove from List
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'deliver' && (
          <div className="rider-content">
            <div className="rider-page-header"><h1>🚀 Deliver</h1><p>Notify the customer you're on the way, then confirm delivery with their OTP.</p></div>
            {gpsError && (
              <div className="rider-gps-error-banner">
                <i className="fas fa-exclamation-triangle"></i><span>{gpsError}</span><button onClick={() => setGpsError(null)}>✕</button>
              </div>
            )}
            {myDeliveries.length === 0 ? (
              <div className="rider-empty"><i className="fas fa-shipping-fast"></i><p>No deliveries ready yet.</p><span>Approved pickups will appear here once admin approves your request.</span></div>
            ) : (
              <div className="rider-compact-list">
                {myDeliveries.map(delivery => {
                  const isOutForDelivery   = delivery.status === 'out_for_delivery';
                  const isApproved         = delivery.status === 'approved';
                  const isExpanded         = !!expandedDeliveries[delivery._id];
                  const errMsg             = otpErrors[delivery._id];
                  const hasPhoto           = !!photoData[delivery._id];
                  const isThisBeingTracked = trackingOrderId === delivery.orderId;
                  const ord          = allOrders.find(o => o.orderId === delivery.orderId);
                  const customerName = ord?.customerName || ord?.name || delivery.customerName || 'Customer';
                  const addr         = ord?.shippingAddress || ord?.address || ord?.deliveryAddress || delivery.customerAddress || '';
                  const phone        = ord?.phone || '';
                  return (
                    <div key={delivery._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{delivery.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {customerName}</span>
                          <span className="rider-compact-total">₱{(delivery.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className={`rider-delivery-badge ${isOutForDelivery ? 'badge-ofd' : ''}`}>
                            {isOutForDelivery ? '🚚 On the Way' : '✅ Pickup Approved'}
                          </span>
                          {isThisBeingTracked && <span className="rider-gps-active-badge"><span className="rider-gps-dot"></span> GPS On</span>}
                          <button className="rider-view-btn" onClick={() => toggleExpanded(delivery._id, setExpandedDeliveries)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-expanded-section">
                            <div className="rider-expanded-section-title"><i className="fas fa-user"></i> Customer Info</div>
                            <div className="rider-info-row"><i className="fas fa-user-circle"></i><span><strong>Name:</strong> {customerName}</span></div>
                            <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {addr || 'N/A'}</span></div>
                            {phone && <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {phone}</span></div>}
                            <div className="customer-map-section-title"><i className="fas fa-map-marked-alt"></i> Customer Location</div>
                            <CustomerMap
                              orderId={delivery.orderId}
                              allOrders={allOrders}
                              riderCoords={currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null}
                              riderHeading={riderHeading}
                            />
                          </div>
                          <div className="rider-expanded-section rider-info-preview">
                            <div className="rider-expanded-section-title"><i className="fas fa-id-badge"></i> Your Info (visible to customer)</div>
                            <div className="rider-info-row"><i className="fas fa-user"></i><span><strong>Name:</strong> {riderInfo.fullName}</span></div>
                            <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {riderInfo.phone}</span></div>
                            <div className="rider-info-row"><i className="fas fa-motorcycle"></i><span><strong>Vehicle:</strong> {riderInfo.vehicleType}</span></div>
                            <div className="rider-info-row"><i className="fas fa-id-card"></i><span><strong>Plate:</strong> {riderInfo.plateNumber}</span></div>
                          </div>
                          {isOutForDelivery && (
                            <div className={`rider-gps-panel ${isThisBeingTracked ? 'gps-panel-active' : ''}`}>
                              <div className="rider-gps-panel-title">
                                <i className="fas fa-map-marker-alt"></i><span>GPS Location Sharing</span>
                                {isThisBeingTracked && <span className="rider-gps-live-tag">LIVE</span>}
                              </div>
                              {isThisBeingTracked ? (
                                <>
                                  <div className="rider-gps-status-row">
                                    <span className="rider-gps-dot"></span>
                                    <span>Sending location every 10 seconds{currentPosition && <> · <strong>±{Math.round(currentPosition.accuracy || 0)}m</strong></>}</span>
                                  </div>
                                  {currentPosition && <div className="rider-gps-coords"><i className="fas fa-crosshairs"></i>{currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}</div>}
                                  <button className="rider-gps-stop-btn" onClick={stopTrackingLocal}><i className="fas fa-stop-circle"></i> Stop Sharing Location</button>
                                </>
                              ) : (
                                <>
                                  <p className="rider-gps-desc">Share your real-time location so the customer can track you on the map.</p>
                                  <button className="rider-gps-start-btn" onClick={() => startTracking(delivery.orderId)}><i className="fas fa-location-arrow"></i> Start Location Sharing</button>
                                </>
                              )}
                            </div>
                          )}
                          {isApproved && (
                            <button className={`rider-notify-btn ${notifyingId === delivery._id ? 'notifying' : ''}`} onClick={() => notifyCustomer(delivery)} disabled={notifyingId === delivery._id}>
                              {notifyingId === delivery._id ? <><i className="fas fa-spinner fa-spin"></i> Notifying...</> : <><i className="fas fa-bell"></i> Notify Customer — I'm On My Way!</>}
                            </button>
                          )}
                          {isOutForDelivery && (
                            <div className="rider-confirm-delivery-section">
                              <div className="rider-confirm-title"><i className="fas fa-shield-alt"></i> Confirm Delivery</div>
                              <p className="rider-confirm-desc">Enter the <strong>OTP code</strong> from the customer's tracking page.</p>
                              <div className="rider-otp-hint">
                                <i className="fas fa-info-circle"></i>
                                <span>Ask the customer to open their <strong>Track Order</strong> page and tap <strong>"Generate My OTP"</strong>.</span>
                              </div>
                              <div className="rider-otp-group">
                                <label className="rider-otp-label"><i className="fas fa-key"></i> Customer OTP Code<span className="otp-required-tag">*Required</span></label>
                                <input type="text" className="rider-otp-input" placeholder="Enter 4-digit OTP" maxLength={4}
                                  value={otpInputs[delivery._id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    setOtpInputs(p => ({ ...p, [delivery._id]: val }));
                                    setOtpErrors(p => ({ ...p, [delivery._id]: '' }));
                                  }}
                                />
                              </div>
                              <div className="rider-photo-group">
                                <label className="rider-otp-label"><i className="fas fa-camera"></i> Photo Proof<span className="proof-optional-tag">(Optional)</span></label>
                                <div className={`rider-photo-dropzone ${hasPhoto ? 'has-photo' : ''}`} onClick={() => fileInputRefs.current[delivery._id]?.click()}>
                                  {hasPhoto ? (
                                    <div className="rider-photo-preview-wrap">
                                      <img src={photoData[delivery._id]} alt="Proof" className="rider-photo-preview" />
                                      <div className="rider-photo-change-overlay"><i className="fas fa-camera"></i><span>Change Photo</span></div>
                                    </div>
                                  ) : (
                                    <div className="rider-photo-placeholder">
                                      <i className="fas fa-cloud-upload-alt"></i>
                                      <span>Click to upload photo (optional)</span>
                                      <small>JPG, PNG — max 5MB</small>
                                    </div>
                                  )}
                                </div>
                                <input type="file" accept="image/*" style={{ display: 'none' }}
                                  ref={el => (fileInputRefs.current[delivery._id] = el)}
                                  onChange={(e) => handlePhotoSelect(delivery._id, e.target.files[0])}
                                />
                              </div>
                              {errMsg && <div className="rider-confirm-error"><i className="fas fa-exclamation-circle"></i> {errMsg}</div>}
                              <button className={`rider-confirm-btn ${confirmingId === delivery._id ? 'confirming' : ''}`} onClick={() => confirmDelivery(delivery)} disabled={confirmingId === delivery._id}>
                                {confirmingId === delivery._id ? <><i className="fas fa-spinner fa-spin"></i> Confirming Delivery...</> : <><i className="fas fa-check-circle"></i> Confirm Delivery</>}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default RiderDashboard;
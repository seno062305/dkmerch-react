import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import WaybillScannerModal from '../components/WaybillScannerModal';
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
    }, 5000);

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
// NCR map constants — locks ALL maps to Metro Manila only
// ─────────────────────────────────────────────────────────────────────────────
const NCR_BOUNDS = [[14.3500, 120.8600], [14.8000, 121.1500]];
const NCR_CENTER = [14.5995, 121.0];
const NCR_MIN_ZOOM = 11;

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
// Directional arrow icon
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
// Fullscreen map covers the viewport (bottom nav stays under overlay).
// ─────────────────────────────────────────────────────────────────────────────
const SIDEBAR_WIDTH = 0;

const FullscreenMapModal = ({ address, customerName, coords, riderCoords, riderHeading, onClose }) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const unmountedRef   = useRef(false);
  const routeLayerRef  = useRef(null);
  const riderMarkerRef = useRef(null);
  const routeDrawnRef  = useRef(false);
  const [geocoding, setGeocoding] = useState(!coords);
  // On mobile (≤768px) use true fullscreen; on desktop offset by sidebar
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    };
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
        const startLat = coords?.lat ?? NCR_CENTER[0];
        const startLng = coords?.lng ?? NCR_CENTER[1];
        const map = L.map(mapRef.current, {
          zoomControl: false, tap: false, scrollWheelZoom: true,
          minZoom: NCR_MIN_ZOOM, maxZoom: 19,
          maxBounds: NCR_BOUNDS, maxBoundsViscosity: 1.0,
        }).setView([startLat, startLng], coords ? 16 : NCR_MIN_ZOOM + 1);
        map.setMaxBounds(NCR_BOUNDS);
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

  // Mobile: start below the sticky mobile header (52px) so burger stays visible
  // Desktop: offset left by sidebar width (260px)
  const MOBILE_HEADER_H = 52;

  return (
    <div
      style={{
        position: 'fixed',
        top: isMobile ? MOBILE_HEADER_H : 0,
        bottom: 0,
        left: isMobile ? 0 : SIDEBAR_WIDTH,
        right: 0,
        zIndex: 9999, // below mobile header z-index:200, above everything else
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1f36',
      }}
      onClick={onClose}
    >
      <div
        style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Desktop only: show address header. Mobile: hidden, burger is already visible above */}
        {!isMobile && (
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
        )}
        {/* Mobile: minimal close button in top-right corner */}
        {isMobile && (
          <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
            <button
              onClick={onClose}
              type="button"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'white', border: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 14, color: '#374151',
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}
        {geocoding && (
          <div className="fullscreen-map-loading">
            <div className="fullscreen-map-loading-bar"></div>
            <span>Locating address on map…</span>
          </div>
        )}
        <div ref={mapRef} style={{ flex: 1, width: '100%', minHeight: 0 }} />
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
// Customer map (inline) — single Full Map button only, no duplicate link
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
      const startLat = savedCoords?.lat ?? NCR_CENTER[0];
      const startLng = savedCoords?.lng ?? NCR_CENTER[1];
      const map = L.map(mapRef.current, {
        zoomControl: false, tap: false, scrollWheelZoom: false, dragging: true,
        minZoom: NCR_MIN_ZOOM, maxZoom: 19,
        maxBounds: NCR_BOUNDS, maxBoundsViscosity: 1.0,
      }).setView([startLat, startLng], savedCoords ? 16 : NCR_MIN_ZOOM + 1);
      map.setMaxBounds(NCR_BOUNDS);
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

        if (routeDrawnRef.current && lastRouteRiderRef.current) {
          const dLat = Math.abs(lastRouteRiderRef.current.lat - riderCoords.lat);
          const dLng = Math.abs(lastRouteRiderRef.current.lng - riderCoords.lng);
          if (dLat > 0.0005 || dLng > 0.0005) routeDrawnRef.current = false;
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
          {/* Single fullscreen button only — no duplicate link */}
          <button className="customer-map-fullscreen-btn" onClick={() => setShowFullscreen(true)} type="button" title="View full map">
            <i className="fas fa-expand-alt"></i><span>Full Map</span>
          </button>
        </div>
        {/* Zoom hint only — no Full Screen link */}
        <div className="customer-map-zoom-hint">
          <i className="fas fa-search-plus"></i>
          <span>Use <strong>+</strong> / <strong>−</strong> on map to zoom</span>
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
// Kicked-out countdown
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
    const id = setInterval(() => { const l = tick(); if (l === 0) clearInterval(id); }, 1000);
    return () => clearInterval(id);
  }, [kickedAt]);
  return remaining;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main dashboard
// ─────────────────────────────────────────────────────────────────────────────
const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const { confirm } = useConfirm();
  const navigate = useNavigate();

  const [tab, setTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTab = params.get('tab');
    if (GPS.isActive()) return 'deliver';
    if (['available', 'my-pickups', 'deliver', 'profile'].includes(urlTab)) return urlTab;
    return 'available';
  });

  const [expandedOrders, setExpandedOrders]         = useState({});
  const [expandedPickups, setExpandedPickups]       = useState({});
  const [expandedDeliveries, setExpandedDeliveries] = useState({});
  const [otpInputs, setOtpInputs]                   = useState({});
  const [photoData, setPhotoData]                   = useState({});
  const [otpErrors, setOtpErrors]                   = useState({});
  const [confirmingId, setConfirmingId]             = useState(null);
  const [notifyingId, setNotifyingId]               = useState(null);
  const [acceptingId, setAcceptingId]               = useState(null);
  const [pickupDateFrom, setPickupDateFrom]         = useState('');
  const [pickupDateTo, setPickupDateTo]             = useState('');
  const [profileView, setProfileView]               = useState('main'); // main | forgot
  const [forgotEmail, setForgotEmail]               = useState('');
  const [verificationCode, setVerificationCode]     = useState('');
  const [sentCode, setSentCode]                     = useState('');
  const [newPassword, setNewPassword]               = useState('');
  const [confirmNewPw, setConfirmNewPw]             = useState('');
  const [forgotMsg, setForgotMsg]                   = useState('');
  const [forgotLoading, setForgotLoading]           = useState(false);
  const [sendingCode, setSendingCode]               = useState(false);
  const [lastSeenAvailable, setLastSeenAvailable]   = useState(0);
  const [lastSeenPickups, setLastSeenPickups]       = useState(0);
  const [lastSeenDeliveries, setLastSeenDeliveries] = useState(0);
  const initializedRef        = useRef(false);
  const [trackingOrderId, setTrackingOrderId] = useState(() => GPS.activeOrderId());
  const [gpsError, setGpsError]               = useState(null);
  const [currentPosition, setCurrentPosition] = useState(() => GPS.lastPosition());
  const autoStartAttemptedRef = useRef(false);
  const fileInputRefs         = useRef({});

  const [kickedOut, setKickedOut]             = useState(false);
  const hasBeenKickedRef                      = useRef(false);
  const [kickedAtTimestamp, setKickedAtTimestamp] = useState(null);
  const remainingCountdown = useKickedCountdown(kickedAtTimestamp);

  const [installPrompt, setInstallPrompt]   = useState(null);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [isInstalled, setIsInstalled]       = useState(false);
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

  const riderInfo    = useQuery(api.riders.getRiderByEmail, user?.email ? { email: user.email } : 'skip');
  const allOrders    = useQuery(api.orders.getAllOrders)  || [];
  const allPickups   = useQuery(api.pickupRequests.getAllPickupRequests) || [];
  const sessionCheck = useQuery(
    api.riders.checkRiderSession,
    user?.email && user?.sessionId ? { email: user.email, sessionId: user.sessionId } : 'skip'
  );

  const acceptOrderMutation = useMutation(api.pickupRequests.acceptOrder);
  const updateOrderFields   = useMutation(api.orders.updateOrderFields);
  const updatePickupStatus  = useMutation(api.pickupRequests.updatePickupStatus);
  const deletePickupRequest = useMutation(api.pickupRequests.deletePickupRequest);
  const updateRiderLocation = useMutation(api.riders.updateRiderLocation);
  const stopRiderTracking   = useMutation(api.riders.stopRiderTracking);
  const setRiderKickedAt    = useMutation(api.riders.setRiderKickedAt);
  const resetPasswordByEmail  = useMutation(api.riders.resetRiderPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const [showWaybillScanner, setShowWaybillScanner] = useState(false);
  const [scanTargetOrderId, setScanTargetOrderId]   = useState(null);

  useEffect(() => { if (GPS.isActive()) GPS.updateSendFn(updateRiderLocation); });

  useEffect(() => {
    const activeId = GPS.activeOrderId();
    const lastPos  = GPS.lastPosition();
    if (activeId) { setTrackingOrderId(activeId); setTab('deliver'); }
    if (lastPos)   setCurrentPosition(lastPos);
  }, []);

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

  // Only admin-confirmed paid orders appear here — never raw customer checkouts.
  const claimedStatuses = ['approved', 'out_for_delivery', 'completed'];

  const availableOrders = allOrders
    .filter(o =>
      (o.orderStatus === 'confirmed' || o.status === 'Confirmed') &&
      !allPickups.some(p => p.orderId === o.orderId && claimedStatuses.includes(p.status))
    )
    .sort((a, b) => {
      const aTime = a.confirmedAt ? new Date(a.confirmedAt).getTime() : (a._creationTime || 0);
      const bTime = b.confirmedAt ? new Date(b.confirmedAt).getTime() : (b._creationTime || 0);
      return bTime - aTime;
    });

  const myDeliveries = allPickups
    .filter(p =>
      p.riderEmail === user?.email &&
      (p.status === 'approved' || p.status === 'out_for_delivery') &&
      allOrders.some(o => o.orderId === p.orderId)
    )
    .sort((a, b) => {
      if (a.status === 'out_for_delivery' && b.status !== 'out_for_delivery') return -1;
      if (b.status === 'out_for_delivery' && a.status !== 'out_for_delivery') return  1;
      return (new Date(b.approvedAt || b.requestedAt).getTime()) - (new Date(a.approvedAt || a.requestedAt).getTime());
    });

  const myPickupHistory = allPickups
    .filter(p =>
      p.riderEmail === user?.email &&
      (p.status === 'out_for_delivery' || p.status === 'completed')
    )
    .filter(p => {
      if (!pickupDateFrom && !pickupDateTo) return true;
      const ts = new Date(p.approvedAt || p.requestedAt || p._creationTime || 0);
      if (pickupDateFrom) {
        const s = new Date(pickupDateFrom); s.setHours(0, 0, 0, 0);
        if (ts < s) return false;
      }
      if (pickupDateTo) {
        const e = new Date(pickupDateTo); e.setHours(23, 59, 59, 999);
        if (ts > e) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const tb = new Date(b.approvedAt || b.requestedAt || 0).getTime();
      const ta = new Date(a.approvedAt || a.requestedAt || 0).getTime();
      return tb - ta;
    });

  const activeDeliveriesCount = myDeliveries.length;
  const historyPickupsCount   = myPickupHistory.length;

  useEffect(() => {
    if (!initializedRef.current && (allOrders.length > 0 || allPickups.length > 0)) {
      setLastSeenAvailable(availableOrders.length);
      setLastSeenPickups(myPickupHistory.length);
      setLastSeenDeliveries(myDeliveries.length);
      initializedRef.current = true;
    }
  }, [allOrders.length, allPickups.length]); // eslint-disable-line

  const handleNavClick = useCallback((newTab) => {
    setTab(newTab);
    if (newTab === 'available')  setLastSeenAvailable(availableOrders.length);
    if (newTab === 'my-pickups') setLastSeenPickups(myPickupHistory.length);
    if (newTab === 'deliver')    setLastSeenDeliveries(myDeliveries.length);
    if (newTab === 'profile')    setProfileView('main');
  }, [availableOrders.length, myPickupHistory.length, myDeliveries.length]);

  const newAvailableCount  = Math.max(0, availableOrders.length - lastSeenAvailable);
  const newPickupsCount    = Math.max(0, myPickupHistory.length - lastSeenPickups);
  const newDeliveriesCount = Math.max(0, myDeliveries.length - lastSeenDeliveries);
  const showAvailableDot   = newAvailableCount > 0 || availableOrders.length > 0;

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
    if (kickedOut && remainingCountdown === 0) handleForcedLogout();
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

  const toggleExpanded     = (id, setFn) => setFn(prev => ({ ...prev, [id]: !prev[id] }));
  const getPickupStatusStyle = (status) => ({ approved: { bg: '#d1fae5', color: '#0f5132' }, out_for_delivery: { bg: '#dbeafe', color: '#1e40af' }, completed: { bg: '#d1fae5', color: '#065f46' }, scanned: { bg: '#fce7f3', color: '#9d174d' } }[status] || { bg: '#e2e8f0', color: '#475569' });
  const getStatusLabel     = (status) => ({ approved: '✅ Accepted', out_for_delivery: '🚚 Out for Delivery', completed: '🎉 Delivered', scanned: '📷 From Scan' }[status] || status);

  const handleLogout  = async () => {
    const ok = await confirm({
      title: 'Logout?',
      message: 'Are you sure you want to logout?\n\n📍 GPS tracking will continue running for the customer until delivery is confirmed.',
      confirmLabel: 'Logout',
      variant: 'warning',
      icon: 'fa-sign-out-alt',
    });
    if (!ok) return;
    logout();
    navigate('/', { replace: true });
  };

  const openOrderScanner = (orderId) => {
    setScanTargetOrderId(orderId);
    setShowWaybillScanner(true);
  };

  const orderIdsMatch = (a, b) => {
    if (!a || !b) return false;
    const A = String(a).trim();
    const B = String(b).trim();
    if (A === B) return true;
    const shortA = A.slice(-8).toUpperCase();
    const shortB = B.slice(-8).toUpperCase();
    return shortA === shortB || A.endsWith(B) || B.endsWith(A) || A.endsWith(shortB) || B.endsWith(shortA);
  };

  /** Scan waybill for a specific available order → accept → Deliver */
  const handleWaybillScan = async (scannedId) => {
    if (!riderInfo || !scanTargetOrderId) return false;
    if (!orderIdsMatch(scannedId, scanTargetOrderId)) {
      return false;
    }
    setAcceptingId(scanTargetOrderId);
    try {
      const result = await acceptOrderMutation({
        orderId: scanTargetOrderId,
        riderId: riderInfo._id,
        riderName: riderInfo.fullName,
        riderEmail: user.email,
        riderPhone: riderInfo.phone || '',
        riderVehicle: riderInfo.vehicleType || 'motorcycle',
        riderPlate: riderInfo.plateNumber || '',
      });
      if (!result?.success) {
        alert(result?.message || 'Failed to accept order.');
        return false;
      }
      setShowWaybillScanner(false);
      setScanTargetOrderId(null);
      setTab('deliver');
      alert(result.alreadyClaimed
        ? '✅ This order is already in Deliver.'
        : '✅ Waybill matched! Order accepted and moved to Deliver.');
      return true;
    } catch (err) {
      console.error(err);
      alert('Failed to verify waybill. Please try again.');
      return false;
    } finally {
      setAcceptingId(null);
    }
  };

  const handleSendForgotCode = async () => {
    const email = (forgotEmail || user?.email || '').trim();
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      setForgotMsg('❌ Enter a valid email.');
      return;
    }
    setSendingCode(true);
    setForgotMsg('');
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setSentCode(code);
    try {
      const result = await sendPasswordResetCode({ to: email, code });
      if (result?.success) setForgotMsg(`✅ Code sent to ${email}`);
      else { setForgotMsg(`❌ ${result?.message || 'Failed to send code.'}`); setSentCode(''); }
    } catch {
      setForgotMsg('❌ Failed to send email.');
      setSentCode('');
    } finally {
      setSendingCode(false);
    }
  };

  const handleResetRiderPassword = async (e) => {
    e.preventDefault();
    const email = (forgotEmail || user?.email || '').trim();
    if (!sentCode) { setForgotMsg('❌ Request a verification code first.'); return; }
    if (verificationCode !== sentCode) { setForgotMsg('❌ Invalid verification code.'); return; }
    if (!newPassword.startsWith('@rider') || newPassword.length < 7 || newPassword.length > 10) {
      setForgotMsg('❌ Password must start with @rider and be 7–10 characters.');
      return;
    }
    if (newPassword !== confirmNewPw) { setForgotMsg('❌ Passwords do not match.'); return; }
    setForgotLoading(true);
    setForgotMsg('');
    try {
      const result = await resetPasswordByEmail({ email, newPassword });
      if (result?.success) {
        setForgotMsg('✅ Password updated.');
        setVerificationCode(''); setNewPassword(''); setConfirmNewPw(''); setSentCode('');
        setTimeout(() => setProfileView('main'), 1200);
      } else {
        setForgotMsg(`❌ ${result?.message || 'Reset failed.'}`);
      }
    } catch {
      setForgotMsg('❌ Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  const notifyCustomer = async (delivery) => {
    const ok = await confirm({
      title: 'Notify customer?',
      message: 'Notify the customer that their order is on the way?',
      confirmLabel: 'Notify',
      variant: 'primary',
      icon: 'fa-bell',
    });
    if (!ok) return;
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
    if (!order)                         { setOtpErrors(p => ({ ...p, [delivery._id]: '⏳ Order data is still loading. Please wait a moment and try again.' })); return; }
    if (!inputOtp)                      { setOtpErrors(p => ({ ...p, [delivery._id]: 'Please enter the OTP from the customer.' })); return; }
    if (!order.deliveryOtp)             { setOtpErrors(p => ({ ...p, [delivery._id]: '⏳ The customer has not generated their OTP yet. Ask them to open their tracking page.' })); return; }
    if (inputOtp !== order.deliveryOtp) { setOtpErrors(p => ({ ...p, [delivery._id]: '❌ Incorrect OTP. Please ask the customer for the correct code.' })); return; }
    const ok = await confirm({
      title: 'Confirm delivery?',
      message: 'Confirm delivery? This will mark the order as Completed.',
      confirmLabel: 'Confirm',
      variant: 'primary',
      icon: 'fa-check-circle',
    });
    if (!ok) return;
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
    if (status !== 'completed') {
      alert('❌ You can only remove completed deliveries from My Pickup.');
      return;
    }
    const ok = await confirm({
      title: 'Remove pickup?',
      message: 'Remove this completed pickup from your list?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
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
  const tabTitle = {
    available: 'Available Orders',
    deliver: 'Deliver',
    'my-pickups': 'My Pickup',
    profile: 'Profile',
  }[tab] || 'Rider';

  return (
    <div className="rider-dashboard rider-dashboard--bottom-nav">
      <header className="rider-topbar">
        <div className="rider-topbar-brand">
          <i className="fas fa-motorcycle"></i>
          <div>
            <strong>DKMerch</strong>
            <span>{tabTitle}</span>
          </div>
        </div>
        <div className="rider-topbar-right">
          {trackingOrderId && (
            <span className="rider-mobile-gps-pill">
              <span className="rider-gps-dot"></span>
              GPS{currentPosition ? ` ±${Math.round(currentPosition.accuracy || 0)}m` : ''}
            </span>
          )}
          <RiderNotifBell onGoToAvailable={() => handleNavClick('available')} />
        </div>
      </header>

      {showIosInstall && (
        <div className="rider-ios-install-overlay" onClick={() => setShowIosInstall(false)}>
          <div className="rider-ios-install-modal" onClick={e => e.stopPropagation()}>
            <button className="rider-ios-install-close" onClick={() => setShowIosInstall(false)}><i className="fas fa-times"></i></button>
            <div className="rider-ios-install-icon"><img src="/images/dklogo2-removebg-preview.png" alt="DKMerch" /></div>
            <h3>Install DKMerch</h3>
            <p>Install this app on your iPhone for faster access to your deliveries.</p>
            <button className="rider-ios-install-done" onClick={() => setShowIosInstall(false)}>Got it!</button>
          </div>
        </div>
      )}

      <main className="rider-main">
        {tab === 'available' && (
          <div className="rider-content">
            <div className="rider-live-pill-row">
              <div className="rider-live-badge"><span className="sync-dot"></span>Live Updates</div>
              {newAvailableCount > 0 && (
                <span className="rider-new-orders-chip"><i className="fas fa-bell"></i> {newAvailableCount} new</span>
              )}
            </div>
            {availableOrders.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-box-open"></i>
                <p>No confirmed orders available right now.</p>
                <span>Orders appear here only after admin confirms payment.</span>
              </div>
            ) : (
              <div className="rider-compact-list">
                {availableOrders.map((order, idx) => {
                  const isNewest = idx === 0;
                  const isExpanded = !!expandedOrders[order.orderId];
                  return (
                    <div key={order.orderId} className={`rider-compact-card rider-available-card ${isNewest ? 'rider-card-newest' : ''}`}>
                      {isNewest && <div className="rider-newest-tag"><i className="fas fa-bolt"></i> Just Confirmed</div>}
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{order.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {order.customerName || order.name || 'N/A'}</span>
                          <span className="rider-compact-total">₱{(order.finalTotal ?? order.total ?? 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <button
                            className="rider-pickup-btn-sm"
                            disabled={acceptingId === order.orderId}
                            onClick={() => openOrderScanner(order.orderId)}
                          >
                            {acceptingId === order.orderId
                              ? <><i className="fas fa-spinner fa-spin"></i></>
                              : <><i className="fas fa-qrcode"></i> Scan</>}
                          </button>
                          <button
                            className="rider-view-btn"
                            onClick={() => toggleExpanded(order.orderId, setExpandedOrders)}
                          >
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {order.shippingAddress || order.address || 'N/A'}</span></div>
                          <div className="rider-info-row">
                            <i className="fas fa-phone"></i>
                            <span><strong>Phone:</strong> {order.phone || 'N/A'}</span>
                            {order.phone && <a href={`tel:${order.phone}`} className="rider-call-btn"><i className="fas fa-phone-alt"></i> Call</a>}
                          </div>
                          <div className="rider-info-row"><i className="fas fa-calendar"></i><span><strong>Ordered:</strong> {new Date(order._creationTime).toLocaleString('en-PH')}</span></div>
                          {order.confirmedAt && (
                            <div className="rider-info-row"><i className="fas fa-check-circle"></i><span><strong>Confirmed:</strong> {new Date(order.confirmedAt).toLocaleString('en-PH')}</span></div>
                          )}

                          <div className="rider-expanded-section-title" style={{ marginTop: 10 }}><i className="fas fa-box"></i> Items</div>
                          {order.items?.length > 0 ? (
                            <div className="rider-items-verify">
                              {order.items.map((item, i) => (
                                <div key={`${item.id || item.name}-${i}`} className="rider-item-row">
                                  {item.image ? <img src={item.image} alt="" className="rider-item-thumb" /> : <div className="rider-item-thumb placeholder">📦</div>}
                                  <div className="rider-item-meta">
                                    <strong>{item.name}</strong>
                                    <span>×{item.quantity} · ₱{(item.price || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rider-info-row"><span>No item details.</span></div>
                          )}

                          <button
                            className="rider-scan-accept-btn"
                            disabled={acceptingId === order.orderId}
                            onClick={() => openOrderScanner(order.orderId)}
                          >
                            {acceptingId === order.orderId
                              ? <><i className="fas fa-spinner fa-spin"></i> Accepting...</>
                              : <><i className="fas fa-qrcode"></i> Scan Waybill to Accept</>}
                          </button>
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
            <div className="rider-date-filter">
              <div className="rider-date-filter-item">
                <label>From</label>
                <input type="date" value={pickupDateFrom} max={pickupDateTo || undefined} onChange={e => setPickupDateFrom(e.target.value)} />
              </div>
              <div className="rider-date-filter-item">
                <label>To</label>
                <input type="date" value={pickupDateTo} min={pickupDateFrom || undefined} onChange={e => setPickupDateTo(e.target.value)} />
              </div>
              {(pickupDateFrom || pickupDateTo) && (
                <button type="button" className="rider-date-filter-clear" onClick={() => { setPickupDateFrom(''); setPickupDateTo(''); }}>
                  Clear
                </button>
              )}
            </div>
            {myPickupHistory.length === 0 ? (
              <div className="rider-empty"><i className="fas fa-truck-pickup"></i><p>No out-for-delivery or completed pickups yet.</p><span>Accepted orders show here after you start or finish delivery.</span></div>
            ) : (
              <div className="rider-compact-list">
                {myPickupHistory.map(req => {
                  const style = getPickupStatusStyle(req.status);
                  const isExpanded = expandedPickups[req._id];
                  const order = allOrders.find(o => o.orderId === req.orderId);
                  return (
                    <div key={req._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{req.orderId?.slice(-8)}</span>
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {req.customerName || order?.customerName || 'Customer'}</span>
                          <span className="rider-compact-total">₱{(req.total || order?.finalTotal || order?.total || 0).toLocaleString()}</span>
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
                          <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {order?.shippingAddress || order?.address || 'N/A'}</span></div>
                          <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {order?.phone || 'N/A'}</span></div>
                          <div className="rider-info-row"><i className="fas fa-calendar"></i><span><strong>Updated:</strong> {new Date(req.approvedAt || req.requestedAt).toLocaleString('en-PH')}</span></div>
                          {order?.items?.length > 0 && (
                            <div className="rider-items-verify">
                              {order.items.map((item, i) => (
                                <div key={`${item.id || item.name}-${i}`} className="rider-item-row">
                                  {item.image ? <img src={item.image} alt="" className="rider-item-thumb" /> : <div className="rider-item-thumb placeholder">📦</div>}
                                  <div className="rider-item-meta">
                                    <strong>{item.name}</strong>
                                    <span>×{item.quantity} · ₱{(item.price || 0).toLocaleString()}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {req.status === 'out_for_delivery' && <div className="rider-ofd-notice">🚚 Still out for delivery — open <strong>Deliver</strong> for map + OTP.</div>}
                          {req.status === 'completed' && <div className="rider-completed-notice">🎉 Delivery completed.</div>}
                          {req.status === 'completed' && (
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
            {gpsError && (
              <div className="rider-gps-error-banner">
                <i className="fas fa-exclamation-triangle"></i><span>{gpsError}</span><button onClick={() => setGpsError(null)}>✕</button>
              </div>
            )}
            {myDeliveries.length === 0 ? (
              <div className="rider-empty"><i className="fas fa-shipping-fast"></i><p>No deliveries yet.</p><span>Accept an order from Available Orders to see it here with the map.</span></div>
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
                            {isOutForDelivery ? '🚚 On the Way' : '✅ Ready to Deliver'}
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
                            <div className="rider-info-row">
                              <i className="fas fa-phone"></i>
                              <span><strong>Phone:</strong> {phone || 'N/A'}</span>
                            </div>
                            {phone && (
                              <a href={`tel:${phone}`} className="rider-scan-accept-btn" style={{ marginTop: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                                <i className="fas fa-phone-alt"></i> Call Customer
                              </a>
                            )}
                            <div className="customer-map-section-title"><i className="fas fa-map-marked-alt"></i> Customer Location</div>
                            <CustomerMap orderId={delivery.orderId} allOrders={allOrders} riderCoords={currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null} riderHeading={riderHeading} />
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
                                    <span>Sending location every 5 seconds{currentPosition && <> · <strong>±{Math.round(currentPosition.accuracy || 0)}m</strong></>}</span>
                                  </div>
                                  {currentPosition && <div className="rider-gps-coords"><i className="fas fa-crosshairs"></i>{currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}</div>}
                                  <button className="rider-gps-stop-btn" disabled style={{ opacity: 0.4, cursor: 'not-allowed' }}>
                                    <i className="fas fa-stop-circle"></i> Stop Sharing Location
                                  </button>
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
                                {confirmingId === delivery._id ? <><i className="fas fa-spinner fa-spin"></i> Confirming...</> : <><i className="fas fa-check-circle"></i> Confirm Delivery</>}
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

        {tab === 'profile' && (
          <div className="rider-content">
            {profileView === 'main' ? (
              <div className="rider-profile-panel">
                <div className="rider-profile-hero">
                  <div className="rider-avatar large"><i className="fas fa-user-circle"></i></div>
                  <h2>{riderInfo.fullName}</h2>
                  <span className="rider-plate">{riderInfo.plateNumber || 'No plate'}</span>
                </div>
                <div className="rider-profile-card-info">
                  <h3><i className="fas fa-id-card"></i> Rider Information</h3>
                  <div className="rider-info-row"><i className="fas fa-envelope"></i><span><strong>Email:</strong> {riderInfo.email || user?.email}</span></div>
                  <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {riderInfo.phone || '—'}</span></div>
                  <div className="rider-info-row"><i className="fas fa-motorcycle"></i><span><strong>Vehicle:</strong> Motorcycle</span></div>
                  <div className="rider-info-row"><i className="fas fa-id-badge"></i><span><strong>Rider ID:</strong> {riderInfo.dkRiderId || '—'}</span></div>
                  <div className="rider-info-row"><i className="fas fa-map-marker-alt"></i><span><strong>Address:</strong> {riderInfo.address || '—'}</span></div>
                </div>
                <div className="rider-profile-settings">
                  <h3><i className="fas fa-cog"></i> Settings</h3>
                  {!isInstalled && (isIos || installPrompt) && (
                    <button type="button" className="rider-profile-action" onClick={handleInstallClick}>
                      <i className="fas fa-download"></i> Install App
                    </button>
                  )}
                  <button type="button" className="rider-profile-action" onClick={() => {
                    setForgotEmail(user?.email || riderInfo.email || '');
                    setForgotMsg('');
                    setProfileView('forgot');
                  }}>
                    <i className="fas fa-key"></i> Forgot Password
                  </button>
                  <button type="button" className="rider-profile-action danger" onClick={handleLogout}>
                    <i className="fas fa-sign-out-alt"></i> Logout
                  </button>
                </div>
              </div>
            ) : (
              <div className="rider-profile-panel">
                <button type="button" className="rider-profile-back" onClick={() => setProfileView('main')}>
                  <i className="fas fa-arrow-left"></i> Back
                </button>
                <h3>Reset Password</h3>
                <p className="rider-profile-hint">Only you can reset your rider password here.</p>
                <form className="rider-forgot-form" onSubmit={handleResetRiderPassword}>
                  <label>Email</label>
                  <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                  <button type="button" className="rider-profile-action" onClick={handleSendForgotCode} disabled={sendingCode}>
                    {sendingCode ? 'Sending…' : 'Send Code'}
                  </button>
                  <label>Verification Code</label>
                  <input value={verificationCode} onChange={e => setVerificationCode(e.target.value)} placeholder="6-digit code" />
                  <label>New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="@rider + up to 4 chars" maxLength={10} />
                  <label>Confirm Password</label>
                  <input type="password" value={confirmNewPw} onChange={e => setConfirmNewPw(e.target.value)} maxLength={10} />
                  {forgotMsg && <div className="rider-forgot-msg">{forgotMsg}</div>}
                  <button type="submit" className="rider-pickup-btn-sm" style={{ width: '100%', justifyContent: 'center' }} disabled={forgotLoading}>
                    {forgotLoading ? 'Saving…' : 'Update Password'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="rider-bottom-nav rider-bottom-nav--4" aria-label="Rider navigation">
        <button type="button" className={`rider-bnav-item ${tab === 'available' ? 'active' : ''}`} onClick={() => handleNavClick('available')}>
          <span className="rider-bnav-icon-wrap">
            <i className="fas fa-home"></i>
            {showAvailableDot && tab !== 'available' && (
              newAvailableCount > 0
                ? <em className="rider-bnav-badge new">{newAvailableCount}</em>
                : <em className="rider-bnav-dot" />
            )}
            {tab === 'available' && availableOrders.length > 0 && (
              <em className="rider-bnav-badge">{availableOrders.length}</em>
            )}
          </span>
          <span>Available</span>
        </button>
        <button type="button" className={`rider-bnav-item ${tab === 'deliver' ? 'active' : ''}`} onClick={() => handleNavClick('deliver')}>
          <span className="rider-bnav-icon-wrap">
            <i className="fas fa-shipping-fast"></i>
            {activeDeliveriesCount > 0 && <em className={`rider-bnav-badge green ${newDeliveriesCount > 0 ? 'new' : ''}`}>{activeDeliveriesCount}</em>}
          </span>
          <span>Deliver</span>
        </button>
        <button type="button" className={`rider-bnav-item ${tab === 'my-pickups' ? 'active' : ''}`} onClick={() => handleNavClick('my-pickups')}>
          <span className="rider-bnav-icon-wrap">
            <i className="fas fa-box"></i>
            {historyPickupsCount > 0 && <em className={`rider-bnav-badge ${newPickupsCount > 0 ? 'new' : ''}`}>{historyPickupsCount}</em>}
          </span>
          <span>My Pickup</span>
        </button>
        <button type="button" className={`rider-bnav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => handleNavClick('profile')}>
          <i className="fas fa-user-circle"></i>
          <span>Profile</span>
        </button>
      </nav>

      {showWaybillScanner && (
        <WaybillScannerModal
          onClose={() => { setShowWaybillScanner(false); setScanTargetOrderId(null); }}
          onScan={handleWaybillScan}
          hint={scanTargetOrderId
            ? `Scan the waybill for #${scanTargetOrderId.slice(-8).toUpperCase()}. Matching QR accepts the order into Deliver.`
            : 'Scan the order waybill QR to accept.'}
        />
      )}
    </div>
  );
};

export default RiderDashboard;
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useQuery, useMutation, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import WaybillScannerModal from '../components/WaybillScannerModal';
import DkIcon, { DK_ICONS } from '../components/DkIcon';
import './RiderDashboard.css';

// ─────────────────────────────────────────────────────────────────────────────
// GPS singleton
// ─────────────────────────────────────────────────────────────────────────────
const GPS = {
  _watchId:    null,
  _interval:   null,
  _visHandler: null,
  _pageHideHandler: null,
  _orderIds:   [],
  _riderEmail: null,
  _riderName:  null,
  _sessionId:  null,
  _sendFn:     null,      // (payload) => Promise — one order
  _sendBatchFn: null,     // ({ orderIds, ...coords }) => Promise — all OFD
  _lastPos:    null,
  _bestGpsAt:  0,
  _source:     'gps',     // 'gps' | 'ip'

  isActive()       { return this._interval !== null; },
  activeOrderId()  { return this._orderIds[0] || null; },
  activeOrderIds() { return [...this._orderIds]; },
  lastPosition()   { return this._lastPos; },
  locationSource() { return this._source; },

  setOrderIds(ids = []) {
    const next = [...new Set((ids || []).filter(Boolean).map(String))];
    this._orderIds = next;
    if (this._interval && next.length) this._pushNow();
  },

  _pushNow() {
    if (!this._lastPos || !this._orderIds.length) return;
    const base = {
      riderEmail: this._riderEmail,
      riderName:  this._riderName,
      lat:        this._lastPos.lat,
      lng:        this._lastPos.lng,
      accuracy:   this._lastPos.accuracy,
      heading:    this._lastPos.heading ?? undefined,
      speed:      this._lastPos.speed   ?? undefined,
      isTracking: true,
      sessionId:  this._sessionId,
      lastKnownAddress: this._lastPos.address || undefined,
    };
    if (this._sendBatchFn) {
      this._sendBatchFn({ orderIds: this._orderIds, ...base }).catch(err => console.error('Location batch send failed:', err));
      return;
    }
    if (!this._sendFn) return;
    this._orderIds.forEach((orderId) => {
      this._sendFn({ orderId, ...base }).catch(err => console.error('Location send failed:', err));
    });
  },

  _applyPos(pos, source = 'gps', address) {
    const lat = pos.coords ? pos.coords.latitude : pos.lat;
    const lng = pos.coords ? pos.coords.longitude : pos.lng;
    const accuracy = pos.coords
      ? pos.coords.accuracy
      : (pos.accuracy ?? (source === 'ip' ? 8000 : undefined));
    const heading = pos.coords ? pos.coords.heading : undefined;
    const speed = pos.coords ? pos.coords.speed : undefined;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    // Prefer precise GPS — never overwrite a fresh accurate GPS fix with IP / poor fixes
    const now = Date.now();
    const hasFreshGps =
      this._source === 'gps' &&
      this._lastPos &&
      (now - this._bestGpsAt) < 20000 &&
      Number.isFinite(this._lastPos.accuracy) &&
      this._lastPos.accuracy <= 45;

    if (source === 'ip' && hasFreshGps) return;
    if (source === 'gps' && this._lastPos && this._source === 'gps') {
      const prevAcc = this._lastPos.accuracy;
      // Ignore much worse GPS blips (keeps pin stable/accurate on customer + admin maps)
      if (Number.isFinite(prevAcc) && Number.isFinite(accuracy) && accuracy > prevAcc * 2.2 && accuracy > 35) {
        this._pushNow();
        return;
      }
    }

    this._source = source;
    if (source === 'gps') this._bestGpsAt = now;
    this._lastPos = {
      lat,
      lng,
      accuracy,
      heading: heading ?? this._lastPos?.heading,
      speed: speed ?? undefined,
      address: address || (source === 'gps' ? undefined : this._lastPos?.address),
    };
    this._pushNow();
  },

  async _tryIpFallback() {
    // Only when we have no usable GPS pin
    const now = Date.now();
    if (
      this._source === 'gps' &&
      this._lastPos &&
      (now - this._bestGpsAt) < 45000 &&
      Number.isFinite(this._lastPos.accuracy) &&
      this._lastPos.accuracy <= 80
    ) {
      this._pushNow();
      return;
    }
    try {
      const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.latitude || !data?.longitude) return;
      const label = [data.city, data.region, data.country_name].filter(Boolean).join(', ');
      this._applyPos(
        { lat: Number(data.latitude), lng: Number(data.longitude), accuracy: 8000 },
        'ip',
        label ? `Approx. via network · ${label}` : 'Approx. via network IP'
      );
    } catch (err) {
      console.error('IP location fallback failed:', err);
    }
  },

  _bindVisibility() {
    if (this._visHandler || typeof document === 'undefined') return;
    this._visHandler = () => {
      if (!this._interval) return;
      if (document.visibilityState === 'visible') {
        this._requestFix(true);
      } else {
        this._pushNow();
        this._requestFix(true);
      }
    };
    document.addEventListener('visibilitychange', this._visHandler);
    if (!this._pageHideHandler) {
      this._pageHideHandler = () => { if (this._interval) this._pushNow(); };
      window.addEventListener('pagehide', this._pageHideHandler);
      window.addEventListener('beforeunload', this._pageHideHandler);
    }
  },

  _requestFix(highAccuracy = true) {
    if (!navigator.geolocation) {
      this._tryIpFallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => this._applyPos(pos, 'gps'),
      () => { this._tryIpFallback(); },
      {
        enableHighAccuracy: true,
        timeout: highAccuracy ? 10000 : 8000,
        maximumAge: 0,
      }
    );
  },

  start({ orderId, orderIds, riderEmail, riderName, sessionId, sendFn, sendBatchFn }) {
    const ids = [...new Set([...(orderIds || []), orderId].filter(Boolean).map(String))];
    if (!ids.length) return;

    this._riderEmail = riderEmail;
    this._riderName  = riderName;
    this._sessionId  = sessionId;
    if (sendFn) this._sendFn = sendFn;
    if (sendBatchFn) this._sendBatchFn = sendBatchFn;

    // Already live — merge order IDs and refresh fix for all OFD cards
    if (this._interval) {
      this.setOrderIds([...this._orderIds, ...ids]);
      this._requestFix(true);
      return;
    }

    this._orderIds = ids;
    this._bindVisibility();

    if (navigator.geolocation) {
      this._watchId = navigator.geolocation.watchPosition(
        (pos) => this._applyPos(pos, 'gps'),
        (err) => {
          console.error('GPS watch error:', err);
          this._tryIpFallback();
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
      this._requestFix(true);
    } else {
      this._tryIpFallback();
    }

    // High-frequency push so customer/admin maps stay precise after Notify OFD
    this._interval = setInterval(() => {
      this._pushNow();
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        this._requestFix(true);
      }
    }, 1500);
  },

  updateSendFn(fn) { this._sendFn = fn; },
  updateSendBatchFn(fn) { this._sendBatchFn = fn; },

  stopLocal() {
    if (this._interval)         { clearInterval(this._interval); this._interval = null; }
    if (this._watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    if (this._visHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visHandler);
      this._visHandler = null;
    }
    if (this._pageHideHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this._pageHideHandler);
      window.removeEventListener('beforeunload', this._pageHideHandler);
      this._pageHideHandler = null;
    }
    this._orderIds = [];
    this._lastPos = null;
    this._bestGpsAt = 0;
    this._source = 'gps';
    this._riderEmail = null;
    this._riderName = null;
    this._sessionId = null;
    this._sendFn = null;
    this._sendBatchFn = null;
  },

  async stopOnDelivery(stopFn) {
    const orderIds = [...this._orderIds];
    this.stopLocal();
    if (orderIds.length && stopFn) {
      try { await stopFn({ orderIds }); } catch (e) { console.error(e); }
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NCR map constants — locks ALL maps to Metro Manila only
// ─────────────────────────────────────────────────────────────────────────────
const NCR_BOUNDS = [[14.3500, 120.8600], [14.8000, 121.1500]];
const NCR_CENTER = [14.5995, 121.0];
const NCR_MIN_ZOOM = 11;

const orderIdsMatch = (a, b) => {
  if (!a || !b) return false;
  const A = String(a).trim();
  const B = String(b).trim();
  if (A === B) return true;
  const shortA = A.slice(-8).toUpperCase();
  const shortB = B.slice(-8).toUpperCase();
  return shortA === shortB || A.endsWith(B) || B.endsWith(A) || A.endsWith(shortB) || B.endsWith(shortA);
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
// Fullscreen map modal — portaled to body so topbar/bottom-nav cannot clip it
// ─────────────────────────────────────────────────────────────────────────────
const FullscreenMapModal = ({ address, customerName, orderId, coords, riderCoords, riderHeading, onClose }) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const unmountedRef   = useRef(false);
  const routeLayerRef  = useRef(null);
  const riderMarkerRef = useRef(null);
  const routeDrawnRef  = useRef(false);
  const [geocoding, setGeocoding] = useState(!coords);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('rider-fullscreen-map-open');
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.classList.remove('rider-fullscreen-map-open');
    };
  }, []);

  useEffect(() => {
    unmountedRef.current  = false;
    routeDrawnRef.current = false;
    if (!mapRef.current || mapInstanceRef.current) return;
    let intervalId = null;
    let resizeObs = null;
    const refreshSize = (map) => {
      try {
        map.invalidateSize({ animate: false });
      } catch { /* ignore */ }
    };
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
        const shortId        = orderId ? String(orderId).slice(-8).toUpperCase() : '';
        const customerMarker = L.marker([startLat, startLng], { icon: customerIcon })
          .addTo(map)
          .bindPopup(
            `<div style="font-size:13px;max-width:220px"><strong>📍 ${popupLabel}</strong>`
            + (shortId ? `<br><small>Order #${shortId}</small>` : '')
            + `<br><small>${address || ''}</small></div>`
          );
        mapInstanceRef.current = map;

        const fitWithPadding = (points) => {
          try {
            map.fitBounds(points, {
              paddingTopLeft: [24, 72],
              paddingBottomRight: [24, 72],
              maxZoom: 17,
            });
          } catch { /* ignore */ }
        };

        [80, 250, 500].forEach((ms) => setTimeout(() => {
          if (unmountedRef.current || !mapInstanceRef.current) return;
          refreshSize(map);
          if (riderCoords?.lat && riderCoords?.lng) {
            fitWithPadding([[riderCoords.lat, riderCoords.lng], [startLat, startLng]]);
          }
        }, ms));

        if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
          resizeObs = new ResizeObserver(() => refreshSize(map));
          resizeObs.observe(mapRef.current);
        }

        if (riderCoords?.lat && riderCoords?.lng && !routeDrawnRef.current) {
          routeDrawnRef.current = true;
          const riderIcon = L.divIcon({
            className: '',
            html: buildRiderIconHtml(riderHeading),
            iconSize: [50, 50], iconAnchor: [25, 25], popupAnchor: [0, -28],
          });
          riderMarkerRef.current = L.marker([riderCoords.lat, riderCoords.lng], { icon: riderIcon })
            .addTo(map).bindPopup('<strong>🛵 Your Location</strong>');
          fitWithPadding([[riderCoords.lat, riderCoords.lng], [startLat, startLng]]);
          fetchRoute(riderCoords.lat, riderCoords.lng, startLat, startLng).then(latlngs => {
            if (unmountedRef.current || !mapInstanceRef.current || !latlngs) return;
            try {
              if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);
              routeLayerRef.current = L.polyline(latlngs, {
                color: '#fc1268', weight: 5, opacity: 0.85, lineJoin: 'round', lineCap: 'round',
              }).addTo(mapInstanceRef.current);
              refreshSize(map);
              fitWithPadding(latlngs);
            } catch { /* ignore */ }
          });
        } else {
          setTimeout(() => { try { customerMarker.openPopup(); } catch { /* ignore */ } }, 400);
        }

        if (!coords) {
          fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Philippines')}&limit=1`, {
            headers: { 'Accept-Language': 'en' },
          }).then(r => r.json()).then(data => {
            if (unmountedRef.current || !mapInstanceRef.current) return;
            if (data?.length > 0) {
              const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
              customerMarker.setLatLng([lat, lng]);
              if (riderCoords?.lat && riderCoords?.lng) {
                fitWithPadding([[riderCoords.lat, riderCoords.lng], [lat, lng]]);
              } else {
                map.flyTo([lat, lng], 17, { animate: true, duration: 1.0 });
                setTimeout(() => { try { customerMarker.openPopup(); } catch { /* ignore */ } }, 500);
              }
            }
            if (!unmountedRef.current) setGeocoding(false);
          }).catch(() => { if (!unmountedRef.current) setGeocoding(false); });
        } else if (!riderCoords?.lat) {
          setGeocoding(false);
        } else {
          setGeocoding(false);
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
      if (resizeObs) { try { resizeObs.disconnect(); } catch { /* ignore */ } }
      if (mapInstanceRef.current) { try { mapInstanceRef.current.remove(); } catch { /* ignore */ } mapInstanceRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shortId = orderId ? String(orderId).slice(-8).toUpperCase() : '';

  return createPortal(
    <div className="fullscreen-map-overlay" role="dialog" aria-modal="true" aria-label="Full map">
      <div className="fullscreen-map-shell" onClick={e => e.stopPropagation()}>
        <div className="fullscreen-map-header">
          <div className="fullscreen-map-header-left">
            <i className="fas fa-map-marked-alt"></i>
            <div>
              <strong>
                {customerName ? `${customerName}'s Location` : 'Customer Location'}
                {shortId ? ` · #${shortId}` : ''}
              </strong>
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
        <div ref={mapRef} className="fullscreen-map-canvas" />
        <div className="fullscreen-map-footer">
          <span><i className="fas fa-hand-pointer"></i> Pinch to zoom · Drag to pan</span>
          <span className="fullscreen-map-footer-right">
            {riderCoords
              ? <><i className="fas fa-route" style={{ color: '#fc1268' }}></i> Route shown in pink</>
              : <><i className="fas fa-search-plus"></i> Use +/− to zoom</>}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Customer map (inline) — single Full Map button only, no duplicate link
// ─────────────────────────────────────────────────────────────────────────────
const findOrderLoose = (orders, orderId) => {
  if (!orderId || !orders?.length) return null;
  const id = String(orderId).trim();
  const short = id.slice(-8).toUpperCase();
  return orders.find(o => {
    const oid = String(o.orderId || '').trim();
    return oid === id
      || oid.slice(-8).toUpperCase() === short
      || oid.endsWith(id)
      || id.endsWith(oid);
  }) || null;
};

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

  const order        = findOrderLoose(allOrders, orderId);
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
      const refresh = () => { try { map.invalidateSize({ animate: false }); } catch {} };
      [80, 250, 500].forEach((ms) => setTimeout(refresh, ms));
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

        // Fit camera only once; later GPS ticks move the pin only
        if (!routeDrawnRef.current) {
          routeDrawnRef.current = true;
          lastRouteRiderRef.current = { lat: riderCoords.lat, lng: riderCoords.lng };
          try {
            mapInstanceRef.current.fitBounds(
              [[riderCoords.lat, riderCoords.lng], [custLat, custLng]],
              { padding: [30, 30], animate: false, maxZoom: 17 }
            );
          } catch {}
          fetchRoute(riderCoords.lat, riderCoords.lng, custLat, custLng).then(latlngs => {
            if (unmountedRef.current || !latlngs || !mapInstanceRef.current) return;
            try {
              if (routeLayerRef.current) mapInstanceRef.current.removeLayer(routeLayerRef.current);
              routeLayerRef.current = L.polyline(latlngs, {
                color: '#fc1268', weight: 5, opacity: 0.8, lineJoin: 'round', lineCap: 'round',
              }).addTo(mapInstanceRef.current);
            } catch {}
          });
        } else if (lastRouteRiderRef.current) {
          const dLat = Math.abs(lastRouteRiderRef.current.lat - riderCoords.lat);
          const dLng = Math.abs(lastRouteRiderRef.current.lng - riderCoords.lng);
          // Redraw route quietly when rider moves ~90m+; do not re-fit the map
          if (dLat > 0.0008 || dLng > 0.0008) {
            lastRouteRiderRef.current = { lat: riderCoords.lat, lng: riderCoords.lng };
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
        }
      } else if (!routeDrawnRef.current) {
        routeDrawnRef.current = true;
        try { mapInstanceRef.current.setView([custLat, custLng], 16, { animate: false }); } catch {}
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
          orderId={orderId}
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
        <DkIcon name={DK_ICONS.notification} size={18} alt="Notifications" />
        {unreadCount > 0 && <span className="rider-notif-count">{unreadCount}</span>}
      </button>
      {open && (
        <div className="rider-notif-dropdown">
          <div className="rider-notif-header">
            <strong><DkIcon name={DK_ICONS.notification} size={14} /> New Orders Available</strong>
            <button onClick={() => setOpen(false)} className="rider-notif-close">✕</button>
          </div>
          {notifications.length === 0 ? (
            <div className="rider-notif-empty">No new notifications</div>
          ) : (
            <>
              {notifications.slice(0, 5).map((n, i) => (
                <div key={i} className="rider-notif-item">
                  <div className="rider-notif-icon"><DkIcon name={DK_ICONS.activeDelivery} size={20} /></div>
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
  const notifyCustomerOfd   = useMutation(api.orders.notifyCustomerOutForDelivery);
  const updatePickupStatus  = useMutation(api.pickupRequests.updatePickupStatus);
  const deletePickupRequest = useMutation(api.pickupRequests.deletePickupRequest);
  const updateRiderLocation = useMutation(api.riders.updateRiderLocation);
  const updateRiderLocationsBatch = useMutation(api.riders.updateRiderLocationsBatch);
  const stopRiderTracking   = useMutation(api.riders.stopRiderTracking);
  const stopRiderTrackingWithAlert = useMutation(api.riders.stopRiderTrackingWithAlert);
  const setRiderKickedAt    = useMutation(api.riders.setRiderKickedAt);
  const resetPasswordByEmail  = useMutation(api.riders.resetRiderPasswordByEmail);
  const sendPasswordResetCode = useAction(api.sendEmail.sendPasswordResetCode);
  const [showWaybillScanner, setShowWaybillScanner] = useState(false);
  const [scanTargetOrderId, setScanTargetOrderId]   = useState(null);

  useEffect(() => {
    if (!GPS.isActive()) return;
    GPS.updateSendFn(updateRiderLocation);
    GPS.updateSendBatchFn(updateRiderLocationsBatch);
  });

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

  const isOrderClaimed = (orderId) =>
    allPickups.some(p =>
      claimedStatuses.includes(p.status) && orderIdsMatch(p.orderId, orderId)
    );

  // Newest confirmed orders first — each order stays its own Available card (never grouped by customer)
  const availableOrders = allOrders
    .filter(o =>
      (o.orderStatus === 'confirmed' || o.status === 'Confirmed') &&
      !isOrderClaimed(o.orderId)
    )
    .sort((a, b) => {
      const aTime = Math.max(
        a._creationTime || 0,
        a.confirmedAt ? new Date(a.confirmedAt).getTime() : 0
      );
      const bTime = Math.max(
        b._creationTime || 0,
        b.confirmedAt ? new Date(b.confirmedAt).getTime() : 0
      );
      return bTime - aTime;
    });

  // One Deliver card per pickup/order — same customer + same rider still = separate list items
  const myDeliveries = allPickups
    .filter(p =>
      p.riderEmail === user?.email &&
      (p.status === 'approved' || p.status === 'out_for_delivery')
    )
    // Dedupe only identical pickup rows / same orderId — never merge different orders by customer
    .filter((p, idx, arr) => {
      const firstIdx = arr.findIndex(x =>
        x._id === p._id || orderIdsMatch(x.orderId, p.orderId)
      );
      return firstIdx === idx;
    })
    .sort((a, b) => {
      const tb = new Date(b.approvedAt || b.requestedAt || b._creationTime || 0).getTime();
      const ta = new Date(a.approvedAt || a.requestedAt || a._creationTime || 0).getTime();
      return tb - ta;
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

  const ofdOrderIds = myDeliveries
    .filter(d => d.status === 'out_for_delivery')
    .map(d => d.orderId)
    .filter(Boolean);

  // Keep GPS broadcasting to every Out-for-Delivery order (all cards show GPS On)
  useEffect(() => {
    if (!GPS.isActive()) return;
    if (ofdOrderIds.length) GPS.setOrderIds(ofdOrderIds);
  }, [ofdOrderIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    if (!riderInfo || !user?.email || !user?.sessionId) return;
    if (ofdOrderIds.length === 0 || GPS.isActive()) return;
    autoStartAttemptedRef.current = true;
    const first = myDeliveries.find(d => d.status === 'out_for_delivery');
    GPS.start({
      orderIds: ofdOrderIds,
      riderEmail: user.email,
      riderName: riderInfo.fullName,
      sessionId: user.sessionId,
      sendFn: updateRiderLocation,
      sendBatchFn: updateRiderLocationsBatch,
    });
    setTrackingOrderId(first?.orderId || ofdOrderIds[0]);
    setTab('deliver');
    if (first?._id) setExpandedDeliveries(prev => ({ ...prev, [first._id]: true }));
  }, [riderInfo, myDeliveries, user, updateRiderLocation, updateRiderLocationsBatch, ofdOrderIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!riderInfo || !user?.email) return;
    setGpsError(null);
    const ids = [...new Set([
      ...myDeliveries.filter(d => d.status === 'out_for_delivery').map(d => d.orderId),
      orderId,
    ].filter(Boolean))];
    GPS.start({
      orderIds: ids,
      orderId,
      riderEmail: user.email,
      riderName: riderInfo.fullName,
      sessionId: user.sessionId,
      sendFn: updateRiderLocation,
      sendBatchFn: updateRiderLocationsBatch,
    });
    setTrackingOrderId(orderId || ids[0] || null);
  }, [riderInfo, user, updateRiderLocation, updateRiderLocationsBatch, myDeliveries]);

  const stopTrackingLocal = useCallback(async () => {
    const ids = GPS.activeOrderIds();
    const name = riderInfo?.fullName || 'Rider';
    GPS.stopLocal();
    setTrackingOrderId(null);
    setCurrentPosition(null);
    if (ids.length) {
      try {
        await stopRiderTrackingWithAlert({
          orderIds: ids,
          riderName: name,
          riderEmail: user?.email,
          reason: 'Live GPS was turned off in the rider app',
        });
      } catch (e) { console.error(e); }
    }
  }, [riderInfo, user, stopRiderTrackingWithAlert]);

  const stopTrackingOnDelivery = useCallback(async (orderId) => {
    // Completing one delivery — stop that order quietly; keep GPS for other OFD jobs
    const remaining = GPS.activeOrderIds().filter(id => id !== orderId);
    try { await stopRiderTracking({ orderId }); } catch (e) { console.error(e); }
    if (remaining.length) {
      GPS.setOrderIds(remaining);
      setTrackingOrderId(remaining[0]);
    } else {
      GPS.stopLocal();
      setTrackingOrderId(null);
      setCurrentPosition(null);
    }
  }, [stopRiderTracking]);

  const toggleExpanded     = (id, setFn) => setFn(prev => ({ ...prev, [id]: !prev[id] }));
  const getPickupStatusStyle = (status) => ({ approved: { bg: '#d1fae5', color: '#0f5132' }, out_for_delivery: { bg: '#dbeafe', color: '#1e40af' }, completed: { bg: '#d1fae5', color: '#065f46' }, scanned: { bg: '#fce7f3', color: '#9d174d' } }[status] || { bg: '#e2e8f0', color: '#475569' });
  const getStatusLabel = (status) => ({ approved: 'Accepted', out_for_delivery: 'Out for Delivery', completed: 'Delivered', scanned: 'From Scan' }[status] || status);
  const getStatusIcon = (status) => ({
    approved: DK_ICONS.completed,
    out_for_delivery: DK_ICONS.outForDelivery,
    completed: DK_ICONS.completed,
    scanned: DK_ICONS.activeDelivery,
  }[status] || null);

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

  /** Scan waybill for a specific available order → accept → Deliver */
  const handleWaybillScan = async (scannedId) => {
    if (!riderInfo || !scanTargetOrderId) {
      return {
        ok: false,
        reason: 'error',
        message: 'No target order selected. Close the scanner and tap Scan on the correct Available order.',
      };
    }
    if (!orderIdsMatch(scannedId, scanTargetOrderId)) {
      const expected = scanTargetOrderId.slice(-8).toUpperCase();
      const got = String(scannedId).slice(-8).toUpperCase();
      // Do not accept — wrong parcel / QR for this Available card
      return {
        ok: false,
        reason: 'mismatch',
        message: `QR mismatch — this waybill is for a different order (#${got}). Scan the QR for #${expected} only. Order was not accepted.`,
      };
    }

    const shortId = scanTargetOrderId.slice(-8).toUpperCase();
    const targetOrder = allOrders.find(o => orderIdsMatch(o.orderId, scanTargetOrderId));
    const itemCount = targetOrder?.items?.length || 0;
    const acceptOk = await confirm({
      title: 'Accept this order?',
      message: `Waybill matched order #${shortId}${itemCount ? ` (${itemCount} item${itemCount === 1 ? '' : 's'})` : ''}.\n\nAccept into Deliver? Live location starts when you notify the customer.`,
      confirmLabel: 'Accept Order',
      cancelLabel: 'Not yet',
      variant: 'primary',
      icon: 'fa-motorcycle',
    });
    if (!acceptOk) {
      return {
        ok: false,
        reason: 'cancelled',
        message: 'Accept cancelled. Order was not claimed — scan again when ready.',
      };
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
        riderPhoto: riderInfo.riderPhoto || null,
      });
      if (!result?.success) {
        return {
          ok: false,
          reason: 'error',
          message: result?.message || 'Failed to accept order. Try again.',
        };
      }
      setShowWaybillScanner(false);
      setScanTargetOrderId(null);
      setTab('deliver');
      if (result.id) {
        setExpandedDeliveries(prev => ({ ...prev, [result.id]: true }));
      }
      // GPS starts only when rider taps Notify Customer — not on accept
      alert(result.alreadyClaimed
        ? '✅ This order is already in Deliver.'
        : '✅ Waybill matched! Order is in Deliver — tap Notify Customer to start live location.');
      return { ok: true };
    } catch (err) {
      console.error(err);
      return {
        ok: false,
        reason: 'error',
        message: 'Failed to verify waybill. Please try again.',
      };
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
    const shortId = String(delivery.orderId || '').slice(-8).toUpperCase();
    const ord = findOrderLoose(allOrders, delivery.orderId);
    const ok = await confirm({
      title: 'Notify customer — Out for Delivery?',
      message: `Order #${shortId}\n\nThis will:\n• Mark Out for Delivery\n• Start live GPS for customer & admin\n• Email the customer a 4-digit OTP to give you on arrival`,
      confirmLabel: 'Notify & Start',
      cancelLabel: 'Cancel',
      variant: 'primary',
      icon: 'fa-bell',
    });
    if (!ok) return;
    setNotifyingId(delivery._id);
    try {
      const result = await notifyCustomerOfd({
        orderId: delivery.orderId,
        riderName: riderInfo.fullName,
        riderPhone: riderInfo.phone || '',
        riderPlate: riderInfo.plateNumber || '',
        riderVehicle: riderInfo.vehicleType || 'motorcycle',
        riderEmail: user.email,
        riderPhoto: riderInfo.riderPhoto || null,
        customerEmail: ord?.email || delivery.customerEmail || '',
        customerPhone: ord?.phone || '',
      });
      await updatePickupStatus({ requestId: delivery._id, status: 'out_for_delivery' });
      setExpandedDeliveries(prev => ({ ...prev, [delivery._id]: true }));
      startTracking(delivery.orderId);
      alert(
        result?.emailed
          ? '📦 Customer notified by email with their delivery OTP.\n\n📍 Live location is sharing now.\nAsk for their OTP when you hand over the parcel.'
          : '📦 Marked Out for Delivery.\n\n📍 Live location is sharing.\nOTP is on the customer Track Order page (email may be missing).'
      );
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
    const order    = findOrderLoose(allOrders, delivery.orderId);
    if (!order)                         { setOtpErrors(p => ({ ...p, [delivery._id]: '⏳ Order data is still loading. Please wait a moment and try again.' })); return; }
    if (!inputOtp)                      { setOtpErrors(p => ({ ...p, [delivery._id]: 'Please enter the OTP from the customer.' })); return; }
    if (!order.deliveryOtp)             { setOtpErrors(p => ({ ...p, [delivery._id]: '⏳ OTP is still loading. Ask the customer to open Track Order, or wait a moment and try again.' })); return; }
    if (inputOtp !== order.deliveryOtp) { setOtpErrors(p => ({ ...p, [delivery._id]: '❌ Incorrect OTP. Please ask the customer for the correct code.' })); return; }
    const shortId = String(delivery.orderId || '').slice(-8).toUpperCase();
    const ok = await confirm({
      title: 'Confirm delivery?',
      message: `Confirm delivery for order #${shortId} with OTP ${inputOtp}?\n\nThis will mark the order as Completed and cannot be undone from the rider app.`,
      confirmLabel: 'Confirm Delivery',
      cancelLabel: 'Cancel',
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
      alert('❌ You can only remove completed deliveries from My Orders.');
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
    'my-pickups': 'My Orders',
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
              GPS On{currentPosition ? ` ±${Math.round(currentPosition.accuracy || 0)}m` : ''}
              {GPS.locationSource() === 'ip' ? ' · approx' : ''}
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
                <span className="rider-new-orders-chip"><DkIcon name={DK_ICONS.notification} size={13} /> {newAvailableCount} new</span>
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
                          <span className="rider-compact-customer"><DkIcon name={DK_ICONS.customer} size={12} /> {order.customerName || order.name || 'N/A'}</span>
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
              <div className="rider-empty"><i className="fas fa-clipboard-list"></i><p>No orders to review yet.</p><span>Accepted jobs appear here so you can quickly see which are still out for delivery or already completed.</span></div>
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
                                                    <span className="rider-compact-customer"><DkIcon name={DK_ICONS.customer} size={12} /> {req.customerName || order?.customerName || 'Customer'}</span>
                          <span className="rider-compact-total">₱{(req.total || order?.finalTotal || order?.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className="rider-status-pill" style={{ background: style.bg, color: style.color }}>
                            {getStatusIcon(req.status) && <DkIcon name={getStatusIcon(req.status)} size={12} />}
                            {getStatusLabel(req.status)}
                          </span>
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
                          {req.status === 'out_for_delivery' && <div className="rider-ofd-notice">🚚 Still out for delivery — open <strong>Deliver</strong> for live map + OTP.</div>}
                          {req.status === 'completed' && <div className="rider-completed-notice">🎉 Completed — order delivered.</div>}
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
              <div className="rider-empty"><DkIcon name={DK_ICONS.outForDelivery} size={36} /><p>No deliveries yet.</p><span>Accept an order from Available Orders to see it here with the map.</span></div>
            ) : (
              <div className="rider-compact-list">
                {myDeliveries.map(delivery => {
                  const isOutForDelivery   = delivery.status === 'out_for_delivery';
                  const isApproved         = delivery.status === 'approved';
                  const isExpanded         = !!expandedDeliveries[delivery._id];
                  const errMsg             = otpErrors[delivery._id];
                  const hasPhoto           = !!photoData[delivery._id];
                  // Every Out-for-Delivery card shows GPS On while rider GPS is live
                  const isThisBeingTracked = isOutForDelivery && !!trackingOrderId && GPS.isActive();
                  const ord          = findOrderLoose(allOrders, delivery.orderId);
                  const customerName = ord?.customerName || ord?.name || delivery.customerName || 'Customer';
                  const addr         = ord?.shippingAddress || ord?.address || ord?.deliveryAddress || delivery.customerAddress || '';
                  const phone        = ord?.phone || '';
                  // Same customer can have multiple active deliveries — each stays its own card
                  const sameCustomerCount = myDeliveries.filter(d => {
                    const other = findOrderLoose(allOrders, d.orderId);
                    const otherName = (other?.customerName || other?.name || d.customerName || '').trim().toLowerCase();
                    return otherName && otherName === customerName.trim().toLowerCase();
                  }).length;
                  return (
                    <div key={delivery._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{String(delivery.orderId || '').slice(-8).toUpperCase()}</span>
                          <span className="rider-compact-customer"><DkIcon name={DK_ICONS.customer} size={12} /> {customerName}</span>
                          {sameCustomerCount > 1 && (
                            <span className="rider-separate-order-tag">Separate order</span>
                          )}
                          <span className="rider-compact-total">₱{(delivery.total || ord?.finalTotal || ord?.total || 0).toLocaleString()}</span>
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
                            <div className="rider-expanded-section-title"><DkIcon name={DK_ICONS.customer} size={14} /> Customer Info</div>
                            <div className="rider-info-row"><DkIcon name={DK_ICONS.customer} size={14} /><span><strong>Name:</strong> {customerName}</span></div>
                            <div className="rider-info-row"><DkIcon name={DK_ICONS.livemap} size={14} /><span><strong>Address:</strong> {addr || 'N/A'}</span></div>
                            <div className="rider-info-row">
                              <i className="fas fa-phone"></i>
                              <span><strong>Phone:</strong> {phone || 'N/A'}</span>
                            </div>
                            {phone && (
                              <a href={`tel:${phone}`} className="rider-scan-accept-btn" style={{ marginTop: 8, background: 'linear-gradient(135deg,#16a34a,#15803d)' }}>
                                <i className="fas fa-phone-alt"></i> Call Customer
                              </a>
                            )}
                            <div className="customer-map-section-title"><DkIcon name={DK_ICONS.livemap} size={15} /> Customer Location · #{String(delivery.orderId || '').slice(-8).toUpperCase()}</div>
                            <CustomerMap
                              key={`map-${delivery._id}`}
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
                            <div className="rider-info-row"><i className="fas fa-motorcycle"></i><span><strong>Vehicle:</strong> Motorcycle</span></div>
                            <div className="rider-info-row"><i className="fas fa-id-card"></i><span><strong>Plate Number:</strong> {riderInfo.plateNumber || '—'}</span></div>
                          </div>
                          {isOutForDelivery && (
                            <div className={`rider-gps-panel ${isThisBeingTracked ? 'gps-panel-active' : ''}`}>
                              <div className="rider-gps-panel-title">
                                <i className="fas fa-map-marker-alt"></i><span>GPS Location Sharing</span>
                                {isThisBeingTracked
                                  ? <span className="rider-gps-live-tag">LIVE</span>
                                  : <span className="rider-gps-live-tag" style={{ background: '#f59e0b' }}>Starting…</span>}
                              </div>
                              {isThisBeingTracked ? (
                                <>
                                  <div className="rider-gps-status-row">
                                    <span className="rider-gps-dot"></span>
                                    <span>
                                      Live for customer &amp; admin
                                      {currentPosition && <> · <strong>±{Math.round(currentPosition.accuracy || 0)}m</strong></>}
                                      {GPS.locationSource() === 'ip' && <> · <strong>approx (network)</strong></>}
                                    </span>
                                  </div>
                                  {currentPosition && <div className="rider-gps-coords"><i className="fas fa-crosshairs"></i>{currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}</div>}
                                  <button
                                    type="button"
                                    className="rider-gps-stop-btn"
                                    onClick={async () => {
                                      const ok = await confirm({
                                        title: 'Turn off GPS?',
                                        message: 'Customer and admin will be notified that you turned off live location. Last known pin stays on the map.',
                                        confirmLabel: 'Turn Off GPS',
                                        cancelLabel: 'Keep On',
                                        variant: 'danger',
                                        icon: 'fa-map-marker-alt',
                                      });
                                      if (ok) await stopTrackingLocal();
                                    }}
                                  >
                                    <i className="fas fa-map-marker-slash"></i> Turn Off GPS
                                  </button>
                                </>
                              ) : (
                                <p className="rider-gps-desc">Location sharing starts automatically after you notify the customer. GPS On shows on every On the Way delivery.</p>
                              )}
                            </div>
                          )}
                          {isApproved && (
                            <button className={`rider-notify-btn ${notifyingId === delivery._id ? 'notifying' : ''}`} onClick={() => notifyCustomer(delivery)} disabled={notifyingId === delivery._id}>
                              {notifyingId === delivery._id ? <><i className="fas fa-spinner fa-spin"></i> Notifying...</> : <><DkIcon name={DK_ICONS.notification} size={14} /> Notify Customer — I'm On My Way!</>}
                            </button>
                          )}
                          {isOutForDelivery && (
                            <div className="rider-confirm-delivery-section">
                              <div className="rider-confirm-title"><i className="fas fa-shield-alt"></i> Confirm Delivery</div>
                              <p className="rider-confirm-desc">Enter the <strong>OTP</strong> emailed to the customer (also on their Track Order page). They should give it only when the parcel is handed over.</p>
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
                                {confirmingId === delivery._id ? <><i className="fas fa-spinner fa-spin"></i> Confirming...</> : <><DkIcon name={DK_ICONS.completed} size={14} /> Confirm Delivery</>}
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
                  {riderInfo.riderPhoto ? (
                    <img src={riderInfo.riderPhoto} alt={riderInfo.fullName} className="rider-avatar-photo large" />
                  ) : (
                    <div className="rider-avatar large"><i className="fas fa-user-circle"></i></div>
                  )}
                  <h2>{riderInfo.fullName}</h2>
                  <div className="rider-plate-block">
                    <span className="rider-plate-label">Plate Number</span>
                    <span className="rider-plate">{riderInfo.plateNumber || 'No plate'}</span>
                  </div>
                </div>
                <div className="rider-profile-card-info">
                  <h3><i className="fas fa-id-card"></i> Rider Information</h3>
                  <div className="rider-info-row"><i className="fas fa-envelope"></i><span><strong>Email:</strong> {riderInfo.email || user?.email}</span></div>
                  <div className="rider-info-row"><i className="fas fa-phone"></i><span><strong>Phone:</strong> {riderInfo.phone || '—'}</span></div>
                  <div className="rider-info-row"><i className="fas fa-motorcycle"></i><span><strong>Vehicle:</strong> Motorcycle</span></div>
                  <div className="rider-info-row"><i className="fas fa-id-card"></i><span><strong>Plate Number:</strong> {riderInfo.plateNumber || '—'}</span></div>
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
            <DkIcon name={DK_ICONS.outForDelivery} size={18} />
            {activeDeliveriesCount > 0 && <em className={`rider-bnav-badge green ${newDeliveriesCount > 0 ? 'new' : ''}`}>{activeDeliveriesCount}</em>}
          </span>
          <span>Deliver</span>
        </button>
        <button type="button" className={`rider-bnav-item ${tab === 'my-pickups' ? 'active' : ''}`} onClick={() => handleNavClick('my-pickups')}>
          <span className="rider-bnav-icon-wrap">
            <DkIcon name={DK_ICONS.activeDelivery} size={18} />
            {/* Indicator only for unseen updates — clears after viewing My Orders */}
            {newPickupsCount > 0 && tab !== 'my-pickups' && (
              <em className="rider-bnav-badge new">{newPickupsCount}</em>
            )}
          </span>
          <span>My Orders</span>
        </button>
        <button type="button" className={`rider-bnav-item ${tab === 'profile' ? 'active' : ''}`} onClick={() => handleNavClick('profile')}>
          <DkIcon name={DK_ICONS.customer} size={18} />
          <span>Profile</span>
        </button>
      </nav>

      {showWaybillScanner && (
        <WaybillScannerModal
          onClose={() => { setShowWaybillScanner(false); setScanTargetOrderId(null); }}
          onScan={handleWaybillScan}
          hint={scanTargetOrderId
            ? `Scan the waybill QR for #${scanTargetOrderId.slice(-8).toUpperCase()} (printed or on screen). Wrong QR = mismatch, not accepted.`
            : 'Scan the waybill QR for this order (printed or on screen).'}
        />
      )}
    </div>
  );
};

export default RiderDashboard;
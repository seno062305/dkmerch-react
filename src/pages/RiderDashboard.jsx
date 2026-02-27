import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './RiderDashboard.css';

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW-LEVEL GPS TRACKER
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
          heading:    this._lastPos.heading  ?? undefined,
          speed:      this._lastPos.speed    ?? undefined,
          isTracking: true,
          sessionId:  this._sessionId,
        }).catch(err => console.error('Location send failed:', err));
      }
    }, 10000);

    // Immediate first fix
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
            heading:    this._lastPos.heading  ?? undefined,
            speed:      this._lastPos.speed    ?? undefined,
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
// FULLSCREEN MAP MODAL
// ─────────────────────────────────────────────────────────────────────────────
const FullscreenMapModal = ({ address, customerName, onClose }) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const unmountedRef   = useRef(false);   // ✅ guard: prevents setState after unmount
  const [geocoding, setGeocoding] = useState(true);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    unmountedRef.current = false; // reset on each mount

    if (!mapRef.current || mapInstanceRef.current) return;

    let intervalId = null;

    const initMap = () => {
      if (!window.L || !mapRef.current || unmountedRef.current) return;
      try {
        const L   = window.L;
        const map = L.map(mapRef.current, {
          zoomControl     : false,
          tap             : false,
          scrollWheelZoom : true,
        }).setView([14.5995, 120.9842], 14);

        L.control.zoom({ position: 'bottomright' }).addTo(map);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            background:#3b82f6;color:white;border-radius:50% 50% 50% 0;
            width:44px;height:44px;display:flex;align-items:center;
            justify-content:center;font-size:20px;transform:rotate(-45deg);
            box-shadow:0 4px 14px rgba(59,130,246,0.55);border:3px solid white;">
            <span style="transform:rotate(45deg)">🏠</span>
          </div>`,
          iconSize: [44, 44], iconAnchor: [22, 44], popupAnchor: [0, -48],
        });

        const popupLabel = customerName ? `${customerName}'s Location` : 'Customer Location';
        const marker = L.marker([14.5995, 120.9842], { icon })
          .addTo(map)
          .bindPopup(`<div style="font-size:13px;max-width:220px">
            <strong>📍 ${popupLabel}</strong><br>
            <small>${address}</small>
          </div>`);

        mapInstanceRef.current = map;

        // ✅ invalidateSize after animation
        setTimeout(() => {
          if (!unmountedRef.current && mapInstanceRef.current) {
            try { mapInstanceRef.current.invalidateSize(); } catch {}
          }
        }, 350);

        // ✅ Geocode — check unmounted before every setState/map call
        const encoded = encodeURIComponent(address + ', Philippines');
        fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`, {
          headers: { 'Accept-Language': 'en' }
        })
          .then(r => r.json())
          .then(data => {
            if (unmountedRef.current || !mapInstanceRef.current) return;
            if (data?.length > 0) {
              const lat = parseFloat(data[0].lat);
              const lng = parseFloat(data[0].lon);
              try {
                marker.setLatLng([lat, lng]);
                marker.getPopup()?.setContent(`
                  <div style="font-size:13px;max-width:220px">
                    <strong>📍 ${popupLabel}</strong><br>
                    <small>${address}</small>
                  </div>`);
                marker.openPopup();
                map.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
              } catch {}
            }
            if (!unmountedRef.current) setGeocoding(false);
          })
          .catch(() => {
            if (!unmountedRef.current) setGeocoding(false);
          });
      } catch (err) {
        console.error('FullscreenMap init error:', err);
        if (!unmountedRef.current) setGeocoding(false);
      }
    };

    if (window.L) {
      initMap();
    } else {
      intervalId = setInterval(() => {
        if (window.L) { clearInterval(intervalId); intervalId = null; initMap(); }
      }, 100);
    }

    // ✅ Single cleanup function — handles both cases
    return () => {
      unmountedRef.current = true;
      if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, [address, customerName]);

  return (
    // ✅ Clicking the dark overlay closes the modal
    <div className="fullscreen-map-overlay" onClick={onClose}>
      {/* ✅ Stop propagation so clicking inside modal doesn't close it */}
      <div className="fullscreen-map-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
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

        {/* Loading bar */}
        {geocoding && (
          <div className="fullscreen-map-loading">
            <div className="fullscreen-map-loading-bar"></div>
            <span>Locating address on map…</span>
          </div>
        )}

        {/* Map — takes all available height */}
        <div ref={mapRef} className="fullscreen-map-container" />

        {/* Footer hint */}
        <div className="fullscreen-map-footer">
          <span><i className="fas fa-hand-pointer"></i> Pinch to zoom · Drag to pan</span>
          <span className="fullscreen-map-footer-right">
            <i className="fas fa-search-plus"></i> Use +/− to zoom
          </span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOMER MAP — inline preview in Deliver tab
// ─────────────────────────────────────────────────────────────────────────────
const CustomerMap = ({ orderId, allOrders }) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef      = useRef(null);
  const unmountedRef   = useRef(false);  // ✅ guard against setState after unmount
  const [mapError, setMapError]             = useState(null);
  const [leafletLoaded, setLeafletLoaded]   = useState(!!window.L);
  const [geocoding, setGeocoding]           = useState(false);
  const [addressText, setAddressText]       = useState('');
  const [showFullscreen, setShowFullscreen] = useState(false);

  // ✅ Get order data including customer name from passed allOrders prop
  const order        = allOrders.find(o => o.orderId === orderId);
  const address      = order?.shippingAddress || order?.address || '';
  const customerName = order?.customerName || order?.name || '';

  // Load Leaflet once
  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const link  = document.createElement('link');
      link.id     = 'leaflet-css';
      link.rel    = 'stylesheet';
      link.href   = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
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

  // Init map
  useEffect(() => {
    if (!leafletLoaded || mapInstanceRef.current || !mapRef.current) return;
    try {
      const L   = window.L;
      const map = L.map(mapRef.current, {
        zoomControl     : false,
        tap             : false,
        scrollWheelZoom : false,
        dragging        : true,
      }).setView([14.5995, 120.9842], 14);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      const customerIcon = L.divIcon({
        className: '',
        html: `<div style="
          background:#3b82f6;color:white;border-radius:50% 50% 50% 0;
          width:36px;height:36px;display:flex;align-items:center;
          justify-content:center;font-size:16px;transform:rotate(-45deg);
          box-shadow:0 3px 10px rgba(59,130,246,0.5);border:3px solid white;">
          <span style="transform:rotate(45deg)">🏠</span>
        </div>`,
        iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -40],
      });

      const marker = L.marker([14.5995, 120.9842], { icon: customerIcon })
        .addTo(map)
        .bindPopup('<strong>📍 Customer Location</strong>');

      mapInstanceRef.current = map;
      markerRef.current      = marker;
      setTimeout(() => map.invalidateSize(), 300);
    } catch { setMapError('Failed to initialize map.'); }
  }, [leafletLoaded]);

  // Geocode address
  useEffect(() => {
    if (!address || !mapInstanceRef.current || !markerRef.current || !window.L) return;
    setAddressText(address);
    setGeocoding(true);
    setMapError(null);

    const encoded = encodeURIComponent(address + ', Philippines');
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'DKMerch-RiderApp/1.0' }
    })
      .then(r => r.json())
      .then(data => {
        if (unmountedRef.current || !markerRef.current || !mapInstanceRef.current) return;
        if (data?.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          try {
            markerRef.current.setLatLng([lat, lng]);
            markerRef.current.getPopup()?.setContent(
              `<div style="font-size:13px;max-width:200px;">
                <strong>📍 ${customerName ? customerName + '\'s Location' : 'Customer Location'}</strong><br>
                <small>${address}</small>
              </div>`
            );
            markerRef.current.openPopup();
            mapInstanceRef.current.flyTo([lat, lng], 16, { animate: true, duration: 1.0 });
          } catch {}
        } else {
          if (!unmountedRef.current) setMapError('Address not found on map.');
        }
      })
      .catch(() => { if (!unmountedRef.current) setMapError('Could not load map location.'); })
      .finally(() => { if (!unmountedRef.current) setGeocoding(false); });
  }, [address, customerName, leafletLoaded]);

  // Cleanup on unmount — set unmounted flag FIRST to stop all pending setState
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
        markerRef.current      = null;
      }
    };
  }, []);

  // Invalidate map size after sidebar closes
  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        if (mapInstanceRef.current) {
          try { mapInstanceRef.current.invalidateSize(); } catch {}
        }
      }, 350);
    };
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
        {/* Address bar */}
        <div className="customer-map-address-bar">
          <i className="fas fa-home"></i>
          <span>{addressText || address}</span>
          {geocoding && <span className="customer-map-geocoding">📍 Locating...</span>}
        </div>

        {mapError && (
          <div className="customer-map-error">
            <i className="fas fa-exclamation-triangle"></i> {mapError}
          </div>
        )}

        {/* Map + View Full Map button */}
        <div className="customer-map-inner-wrapper">
          <div ref={mapRef} className="customer-map-container" />

          <button
            className="customer-map-fullscreen-btn"
            onClick={() => setShowFullscreen(true)}
            type="button"
            title="View full map"
          >
            <i className="fas fa-expand-alt"></i>
            <span>View Full Map</span>
          </button>
        </div>

        {/* Zoom hint bar */}
        <div className="customer-map-zoom-hint">
          <i className="fas fa-search-plus"></i>
          <span>Use <strong>+</strong> / <strong>−</strong> on map to zoom</span>
          <button
            className="customer-map-fullscreen-link"
            onClick={() => setShowFullscreen(true)}
            type="button"
          >
            <i className="fas fa-expand-alt"></i> Full Screen
          </button>
        </div>
      </div>

      {/* ✅ Fullscreen modal — passes customerName so header shows correct name */}
      {showFullscreen && address && (
        <FullscreenMapModal
          address={address}
          customerName={customerName}
          onClose={() => setShowFullscreen(false)}
        />
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const RiderDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab]                               = useState('available');
  const [sidebarOpen, setSidebarOpen]               = useState(false);
  const [expandedOrders, setExpandedOrders]         = useState({});
  const [expandedPickups, setExpandedPickups]       = useState({});
  const [expandedDeliveries, setExpandedDeliveries] = useState({});
  const [otpInputs, setOtpInputs]                   = useState({});
  const [photoData, setPhotoData]                   = useState({});
  const [otpErrors, setOtpErrors]                   = useState({});
  const [confirmingId, setConfirmingId]             = useState(null);
  const [notifyingId, setNotifyingId]               = useState(null);

  // GPS UI STATE
  const [trackingOrderId, setTrackingOrderId] = useState(() => GPS.activeOrderId());
  const [gpsError, setGpsError]               = useState(null);
  const [currentPosition, setCurrentPosition] = useState(() => GPS.lastPosition());

  // ✅ Track whether auto-start has already been attempted this session
  const autoStartAttemptedRef = useRef(false);

  // ✅ File input refs for photo proof upload (keyed by delivery._id)
  const fileInputRefs = useRef({});

  // SESSION GUARD STATE
  const [kickedOut, setKickedOut]             = useState(false);
  const [kickedCountdown, setKickedCountdown] = useState(180);
  const countdownIntervalRef                  = useRef(null);
  const hasBeenKickedRef                      = useRef(false);

  // CONVEX QUERIES
  const riderInfo  = useQuery(api.riders.getRiderByEmail, user?.email ? { email: user.email } : 'skip');
  const allOrders  = useQuery(api.orders.getAllOrders) || [];
  const allPickups = useQuery(api.pickupRequests.getAllPickupRequests) || [];

  const sessionCheck = useQuery(
    api.riders.checkRiderSession,
    user?.email && user?.sessionId
      ? { email: user.email, sessionId: user.sessionId }
      : 'skip'
  );

  // CONVEX MUTATIONS
  const createPickupRequest = useMutation(api.pickupRequests.createPickupRequest);
  const updateOrderFields   = useMutation(api.orders.updateOrderFields);
  const updatePickupStatus  = useMutation(api.pickupRequests.updatePickupStatus);
  const deletePickupRequest = useMutation(api.pickupRequests.deletePickupRequest);
  const updateRiderLocation = useMutation(api.riders.updateRiderLocation);
  const stopRiderTracking   = useMutation(api.riders.stopRiderTracking);

  // Keep GPS sendFn fresh every render
  useEffect(() => {
    if (GPS.isActive()) GPS.updateSendFn(updateRiderLocation);
  });

  // Restore GPS state on mount (e.g. page refresh)
  useEffect(() => {
    const activeId = GPS.activeOrderId();
    const lastPos  = GPS.lastPosition();
    if (activeId) {
      setTrackingOrderId(activeId);
      setTab('deliver');
    }
    if (lastPos) setCurrentPosition(lastPos);
  }, []);

  // Sync GPS state every 2s
  useEffect(() => {
    const sync = setInterval(() => {
      setTrackingOrderId(GPS.activeOrderId());
      setCurrentPosition(GPS.lastPosition());
    }, 2000);
    return () => clearInterval(sync);
  }, []);

  // DERIVED DATA
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
      const getLatestTime = (p) => {
        if (p.approvedAt)  return new Date(p.approvedAt).getTime();
        if (p.requestedAt) return new Date(p.requestedAt).getTime();
        return p._creationTime || 0;
      };
      return getLatestTime(b) - getLatestTime(a);
    });

  const myDeliveries = myPickups
    .filter(p => p.status === 'approved' || p.status === 'out_for_delivery')
    .sort((a, b) => {
      if (a.status === 'out_for_delivery' && b.status !== 'out_for_delivery') return -1;
      if (b.status === 'out_for_delivery' && a.status !== 'out_for_delivery') return 1;
      const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bTime - aTime;
    });

  const pendingPickupsCount   = myPickups.filter(p => p.status === 'pending').length;
  const activeDeliveriesCount = myDeliveries.length;

  // ─────────────────────────────────────────────────────────────────────────
  // ✅ AUTO-START GPS on login if there's an active out_for_delivery order
  // Only runs once after riderInfo and myDeliveries are both loaded
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoStartAttemptedRef.current) return;
    if (!riderInfo || !user?.email || !user?.sessionId) return;
    if (myDeliveries.length === 0) return;
    if (GPS.isActive()) return; // already tracking from page load

    const activeDelivery = myDeliveries.find(d => d.status === 'out_for_delivery');
    if (!activeDelivery) return;

    autoStartAttemptedRef.current = true;

    if (!navigator.geolocation) {
      setGpsError('GPS not supported on this device.');
      return;
    }

    GPS.start({
      orderId:    activeDelivery.orderId,
      riderEmail: user.email,
      riderName:  riderInfo.fullName,
      sessionId:  user.sessionId,
      sendFn:     updateRiderLocation,
    });
    setTrackingOrderId(activeDelivery.orderId);
    setTab('deliver');
    // Auto-expand the active delivery card
    setExpandedDeliveries(prev => ({ ...prev, [activeDelivery._id]: true }));
  }, [riderInfo, myDeliveries, user, updateRiderLocation]);

  // SESSION GUARD
  const handleForcedLogout = useCallback(() => {
    logout();
    navigate('/', { replace: true });
  }, [logout, navigate]);

  useEffect(() => {
    if (!sessionCheck) return;
    if (hasBeenKickedRef.current) return;
    if (!sessionCheck.valid && sessionCheck.reason === 'new_device_logged_in') {
      hasBeenKickedRef.current = true;
      setKickedOut(true);
      setKickedCountdown(180);
      GPS.stopLocal();
      setTrackingOrderId(null);
      setCurrentPosition(null);
      countdownIntervalRef.current = setInterval(() => {
        setKickedCountdown(prev => {
          if (prev <= 1) { clearInterval(countdownIntervalRef.current); handleForcedLogout(); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCheck]);

  useEffect(() => {
    return () => { if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current); };
  }, []);

  // GPS ACTIONS
  const startTracking = useCallback((orderId) => {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device.'); return; }
    if (!riderInfo) return;
    setGpsError(null);
    GPS.start({
      orderId,
      riderEmail: user.email,
      riderName:  riderInfo.fullName,
      sessionId:  user.sessionId,
      sendFn:     updateRiderLocation,
    });
    setTrackingOrderId(orderId);
  }, [riderInfo, user, updateRiderLocation]);

  const stopTrackingLocal = useCallback(() => {
    GPS.stopLocal();
    setTrackingOrderId(null);
    setCurrentPosition(null);
  }, []);

  const stopTrackingOnDelivery = useCallback(async () => {
    await GPS.stopOnDelivery(stopRiderTracking);
    setTrackingOrderId(null);
    setCurrentPosition(null);
  }, [stopRiderTracking]);

  const toggleExpanded = (id, setFn) => setFn(prev => ({ ...prev, [id]: !prev[id] }));

  const getMyRequestStatus = (orderId) => {
    const req = myPickups.find(p => p.orderId === orderId);
    return req ? req.status : null;
  };

  const getPickupStatusStyle = (status) => {
    const map = {
      pending:          { bg: '#fff3cd', color: '#856404' },
      approved:         { bg: '#d1fae5', color: '#0f5132' },
      rejected:         { bg: '#fee2e2', color: '#991b1b' },
      out_for_delivery: { bg: '#dbeafe', color: '#1e40af' },
      completed:        { bg: '#d1fae5', color: '#065f46' },
    };
    return map[status] || { bg: '#e2e8f0', color: '#475569' };
  };

  const getStatusLabel = (status) => {
    const map = {
      pending: '⏳ Pending', approved: '✅ Approved', rejected: '❌ Rejected',
      out_for_delivery: '🚚 Out for Delivery', completed: '🎉 Delivered',
    };
    return map[status] || status;
  };

  // ✅ closeSidebar fires invalidateSize on all maps after transition
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new Event('rider-sidebar-closed'));
    }, 350);
  }, []);

  const handleLogout = async () => {
    if (window.confirm(
      'Are you sure you want to logout?\n\n📍 GPS tracking will continue running for the customer until delivery is confirmed.'
    )) {
      logout();
      navigate('/', { replace: true });
    }
  };

  const handleNavClick = (newTab) => {
    setTab(newTab);
    closeSidebar();
  };

  // ACTIONS
  const requestPickup = async (order) => {
    if (!riderInfo) return;
    const alreadyApproved = allPickups.find(p => p.orderId === order.orderId && p.status === 'approved');
    if (alreadyApproved) { alert('❌ Sorry! Another rider was already approved for this order.'); return; }
    const alreadyRequested = myPickups.find(p => p.orderId === order.orderId && p.status === 'pending');
    if (alreadyRequested) { alert('You already have a pending request for this order.'); return; }
    try {
      await createPickupRequest({
        orderId: order.orderId, riderId: riderInfo._id, riderName: riderInfo.fullName,
        riderEmail: user.email, riderPhone: riderInfo.phone || '', riderVehicle: riderInfo.vehicleType || '',
        riderPlate: riderInfo.plateNumber || '', customerName: order.customerName || order.name || '',
        total: order.total || 0, requestedAt: new Date().toISOString(), status: 'pending',
      });
      alert('✅ Pickup request sent! Waiting for admin approval.');
    } catch (err) { console.error(err); alert('Failed to send pickup request. Please try again.'); }
  };

  const notifyCustomer = async (delivery) => {
    if (!window.confirm(`Notify "${delivery.customerName}" that their order is on the way?`)) return;
    setNotifyingId(delivery._id);
    try {
      await updateOrderFields({
        orderId: delivery.orderId, orderStatus: 'out_for_delivery', status: 'Out for Delivery',
        riderInfo: { name: riderInfo.fullName, phone: riderInfo.phone, vehicle: riderInfo.vehicleType, plate: riderInfo.plateNumber },
      });
      await updatePickupStatus({ requestId: delivery._id, status: 'out_for_delivery' });
      startTracking(delivery.orderId);
      alert('📦 Customer notified!\n\n📍 GPS tracking has started automatically.\nThe customer can now see your location in real-time.\n\nAsk the customer for their OTP code when you arrive.');
    } catch (err) { console.error(err); alert('Failed to notify customer. Please try again.'); }
    finally { setNotifyingId(null); }
  };

  const handlePhotoSelect = (deliveryId, file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setOtpErrors(prev => ({ ...prev, [deliveryId]: 'Photo must be under 5MB.' })); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      setPhotoData(prev => ({ ...prev, [deliveryId]: e.target.result }));
      setOtpErrors(prev => ({ ...prev, [deliveryId]: '' }));
    };
    reader.readAsDataURL(file);
  };

  const confirmDelivery = async (delivery) => {
    const inputOtp = (otpInputs[delivery._id] || '').trim();
    const photo    = photoData[delivery._id];
    const order    = allOrders.find(o => o.orderId === delivery.orderId || o.orderId?.trim() === delivery.orderId?.trim());

    if (!order)             { setOtpErrors(prev => ({ ...prev, [delivery._id]: '⏳ Order data is still loading. Please wait a moment and try again.' })); return; }
    if (!inputOtp)          { setOtpErrors(prev => ({ ...prev, [delivery._id]: 'Please enter the OTP from the customer.' })); return; }
    if (!order.deliveryOtp) { setOtpErrors(prev => ({ ...prev, [delivery._id]: '⏳ The customer has not generated their OTP yet. Ask them to open their tracking page.' })); return; }
    if (inputOtp !== order.deliveryOtp) { setOtpErrors(prev => ({ ...prev, [delivery._id]: '❌ Incorrect OTP. Please ask the customer for the correct code.' })); return; }
    if (!window.confirm('Confirm delivery? This will mark the order as Completed.')) return;

    setConfirmingId(delivery._id);
    const timestamp = new Date().toISOString();
    try {
      await updateOrderFields({
        orderId: delivery.orderId, orderStatus: 'completed', status: 'Delivered',
        deliveryOtpVerified: true, deliveryConfirmedAt: timestamp,
        ...(photo ? { deliveryProofPhoto: photo } : {}),
      });
      await updatePickupStatus({ requestId: delivery._id, status: 'completed' });
      await stopTrackingOnDelivery(delivery.orderId);
      setOtpInputs(prev => { const n = { ...prev }; delete n[delivery._id]; return n; });
      setPhotoData(prev => { const n = { ...prev }; delete n[delivery._id]; return n; });
      setOtpErrors(prev => { const n = { ...prev }; delete n[delivery._id]; return n; });
      alert('🎉 Delivery confirmed! Order marked as Completed.');
    } catch (err) { console.error(err); alert('Failed to confirm delivery. Please try again.'); }
    finally { setConfirmingId(null); }
  };

  const handleDeletePickup = async (pickupId, status) => {
    if (['approved', 'out_for_delivery'].includes(status)) { alert('❌ Cannot delete an active pickup. Complete the delivery first.'); return; }
    if (!window.confirm('Remove this pickup record from your list?')) return;
    try { await deletePickupRequest({ requestId: pickupId }); }
    catch (err) { console.error(err); alert('Failed to remove pickup.'); }
  };

  // LOADING / NOT APPROVED
  if (riderInfo === undefined) {
    return (
      <div className="rider-dashboard">
        <div className="rider-not-approved"><div className="rider-na-icon">🛵</div><h2>Loading...</h2></div>
      </div>
    );
  }

  if (!riderInfo || riderInfo.status !== 'approved') {
    return (
      <div className="rider-dashboard">
        <div className="rider-not-approved">
          <div className="rider-na-icon">🛵</div>
          <h2>Account Pending Approval</h2>
          <p>Your rider application is still being reviewed by the admin. Please wait for approval before accessing the dashboard.</p>
          <button className="rider-logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    );
  }

  // KICKED-OUT OVERLAY
  if (kickedOut) {
    const mins = Math.floor(kickedCountdown / 60);
    const secs = kickedCountdown % 60;
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

  return (
    <div className={`rider-dashboard${sidebarOpen ? ' sidebar-open' : ''}`}>

      {/* MOBILE TOP HEADER */}
      <header className="rider-mobile-header">
        <button className="rider-burger-btn" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
          <i className="fas fa-bars"></i>
        </button>
        <div className="rider-mobile-logo">
          <i className="fas fa-motorcycle"></i>
          <span>DKMerch</span>
        </div>
        <div className="rider-mobile-header-right">
          {trackingOrderId && (
            <span className="rider-mobile-gps-pill">
              <span className="rider-gps-dot"></span>
              GPS
            </span>
          )}
          <div className="rider-mobile-avatar">
            <i className="fas fa-user-circle"></i>
          </div>
        </div>
      </header>

      {/* SIDEBAR OVERLAY */}
      <div
        className={`rider-sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={closeSidebar}
      />

      {/* SIDEBAR */}
      <aside className={`rider-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="rider-sidebar-header">
          <div>
            <div className="rider-logo"><i className="fas fa-motorcycle"></i><span>DKMerch</span></div>
            <div className="rider-tagline">Rider Dashboard</div>
          </div>
          <button className="rider-sidebar-close" onClick={closeSidebar} aria-label="Close menu">
            <i className="fas fa-times"></i>
          </button>
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
          <button className={`rider-nav-link ${tab === 'available' ? 'active' : ''}`} onClick={() => handleNavClick('available')}>
            <i className="fas fa-box-open"></i>
            <span>Available Orders</span>
            {confirmedOrders.length > 0 && <span className="rider-nav-badge">{confirmedOrders.length}</span>}
          </button>
          <button className={`rider-nav-link ${tab === 'my-pickups' ? 'active' : ''}`} onClick={() => handleNavClick('my-pickups')}>
            <i className="fas fa-truck-pickup"></i>
            <span>My Pickups</span>
            {pendingPickupsCount > 0 && <span className="rider-nav-badge">{pendingPickupsCount}</span>}
          </button>
          <button className={`rider-nav-link ${tab === 'deliver' ? 'active' : ''}`} onClick={() => handleNavClick('deliver')}>
            <i className="fas fa-shipping-fast"></i>
            <span>Deliver</span>
            {activeDeliveriesCount > 0 && <span className="rider-nav-badge rider-nav-badge-green">{activeDeliveriesCount}</span>}
          </button>
        </nav>

        <div className="rider-sync-indicator">
          <span className="sync-dot"></span>
          <span className="sync-text">Live • Real-time</span>
        </div>

        <button className="rider-logout-btn" onClick={handleLogout}>
          <i className="fas fa-sign-out-alt"></i><span>Logout</span>
        </button>
      </aside>

      {/* MAIN */}
      <main className="rider-main">

        {/* ─── AVAILABLE ORDERS ─── */}
        {tab === 'available' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <div className="rider-page-header-top">
                <div>
                  <h1>📦 Available Orders</h1>
                  <p>Confirmed orders ready for pickup — sorted by most recently confirmed.</p>
                </div>
                <div className="rider-live-badge">
                  <span className="sync-dot"></span>
                  Live Updates
                </div>
              </div>
            </div>

            {confirmedOrders.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-box-open"></i>
                <p>No confirmed orders available right now.</p>
                <span>Updates are real-time via Convex.</span>
              </div>
            ) : (
              <div className="rider-compact-list">
                {confirmedOrders.map((order, idx) => {
                  const reqStatus  = getMyRequestStatus(order.orderId);
                  const isExpanded = expandedOrders[order.orderId];
                  const isNewest   = idx === 0;
                  return (
                    <div key={order.orderId} className={`rider-compact-card ${isNewest ? 'rider-card-newest' : ''}`}>
                      {isNewest && (
                        <div className="rider-newest-tag">
                          <i className="fas fa-bolt"></i> Just Confirmed
                        </div>
                      )}
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
                          {!reqStatus && (
                            <button className="rider-pickup-btn-sm" onClick={() => requestPickup(order)}>
                              <i className="fas fa-truck-pickup"></i> Request
                            </button>
                          )}
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
                          {order.confirmedAt && (
                            <div className="rider-info-row"><i className="fas fa-check-circle"></i><span><strong>Confirmed:</strong> {new Date(order.confirmedAt).toLocaleString('en-PH')}</span></div>
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

        {/* ─── MY PICKUPS ─── */}
        {tab === 'my-pickups' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <h1>🚚 My Pickup Requests</h1>
              <p>Active and recent pickup requests — approved ones appear first.</p>
            </div>

            {myPickups.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-truck-pickup"></i>
                <p>No pickup requests yet.</p>
                <span>Go to Available Orders to request your first pickup!</span>
              </div>
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
                          <span className="rider-status-pill" style={{ background: style.bg, color: style.color }}>
                            {getStatusLabel(req.status)}
                          </span>
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
                            <button className="rider-delete-btn" onClick={() => handleDeletePickup(req._id, req.status)}>
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

        {/* ─── DELIVER ─── */}
        {tab === 'deliver' && (
          <div className="rider-content">
            <div className="rider-page-header">
              <h1>🚀 Deliver</h1>
              <p>Notify the customer you're on the way, then confirm delivery with their OTP.</p>
            </div>

            {gpsError && (
              <div className="rider-gps-error-banner">
                <i className="fas fa-exclamation-triangle"></i>
                <span>{gpsError}</span>
                <button onClick={() => setGpsError(null)}>✕</button>
              </div>
            )}

            {myDeliveries.length === 0 ? (
              <div className="rider-empty">
                <i className="fas fa-shipping-fast"></i>
                <p>No deliveries ready yet.</p>
                <span>Approved pickups will appear here once admin approves your request.</span>
              </div>
            ) : (
              <div className="rider-compact-list">
                {myDeliveries.map(delivery => {
                  const isOutForDelivery   = delivery.status === 'out_for_delivery';
                  const isApproved         = delivery.status === 'approved';
                  const isExpanded         = expandedDeliveries[delivery._id] || trackingOrderId === delivery.orderId;
                  const errMsg             = otpErrors[delivery._id];
                  const hasPhoto           = !!photoData[delivery._id];
                  const isThisBeingTracked = trackingOrderId === delivery.orderId;

                  // ✅ Get customer name from actual order data
                  const ord          = allOrders.find(o => o.orderId === delivery.orderId);
                  const customerName = ord?.customerName || ord?.name || delivery.customerName || 'Customer';
                  const addr         = ord?.shippingAddress || ord?.address || delivery.customerAddress || '';
                  const phone        = ord?.phone || '';

                  return (
                    <div key={delivery._id} className="rider-compact-card">
                      <div className="rider-compact-row">
                        <div className="rider-compact-left">
                          <span className="rider-order-id">#{delivery.orderId?.slice(-8)}</span>
                          {/* ✅ Shows customer name from order */}
                          <span className="rider-compact-customer"><i className="fas fa-user"></i> {customerName}</span>
                          <span className="rider-compact-total">₱{(delivery.total || 0).toLocaleString()}</span>
                        </div>
                        <div className="rider-compact-right">
                          <span className={`rider-delivery-badge ${isOutForDelivery ? 'badge-ofd' : ''}`}>
                            {isOutForDelivery ? '🚚 On the Way' : '✅ Pickup Approved'}
                          </span>
                          {isThisBeingTracked && (
                            <span className="rider-gps-active-badge">
                              <span className="rider-gps-dot"></span> GPS On
                            </span>
                          )}
                          <button className="rider-view-btn" onClick={() => toggleExpanded(delivery._id, setExpandedDeliveries)}>
                            <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i> {isExpanded ? 'Hide' : 'View'}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="rider-expanded-body">
                          <div className="rider-expanded-section">
                            <div className="rider-expanded-section-title">
                              <i className="fas fa-user"></i> Customer Info
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-user-circle"></i>
                              {/* ✅ Customer name from order */}
                              <span><strong>Name:</strong> {customerName}</span>
                            </div>
                            <div className="rider-info-row">
                              <i className="fas fa-map-marker-alt"></i>
                              <span><strong>Address:</strong> {addr || 'N/A'}</span>
                            </div>
                            {phone && (
                              <div className="rider-info-row">
                                <i className="fas fa-phone"></i>
                                <span><strong>Phone:</strong> {phone}</span>
                              </div>
                            )}

                            <div className="customer-map-section-title">
                              <i className="fas fa-map-marked-alt"></i> Customer Location
                            </div>
                            {/* ✅ Pass allOrders so CustomerMap can find the order + customer name */}
                            <CustomerMap orderId={delivery.orderId} allOrders={allOrders} />
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
                                <i className="fas fa-map-marker-alt"></i>
                                <span>GPS Location Sharing</span>
                                {isThisBeingTracked && <span className="rider-gps-live-tag">LIVE</span>}
                              </div>

                              {isThisBeingTracked ? (
                                <>
                                  <div className="rider-gps-status-row">
                                    <span className="rider-gps-dot"></span>
                                    <span>
                                      Sending location to customer every 10 seconds
                                      {currentPosition && <> · <strong>±{Math.round(currentPosition.accuracy || 0)}m accuracy</strong></>}
                                    </span>
                                  </div>
                                  {currentPosition && (
                                    <div className="rider-gps-coords">
                                      <i className="fas fa-crosshairs"></i>
                                      {currentPosition.lat.toFixed(6)}, {currentPosition.lng.toFixed(6)}
                                    </div>
                                  )}
                                  <button className="rider-gps-stop-btn" onClick={stopTrackingLocal}>
                                    <i className="fas fa-stop-circle"></i> Stop Sharing Location
                                  </button>
                                </>
                              ) : (
                                <>
                                  <p className="rider-gps-desc">
                                    Share your real-time location so the customer can track you on the map.
                                  </p>
                                  <button className="rider-gps-start-btn" onClick={() => startTracking(delivery.orderId)}>
                                    <i className="fas fa-location-arrow"></i> Start Location Sharing
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {isApproved && (
                            <button
                              className={`rider-notify-btn ${notifyingId === delivery._id ? 'notifying' : ''}`}
                              onClick={() => notifyCustomer(delivery)}
                              disabled={notifyingId === delivery._id}
                            >
                              {notifyingId === delivery._id
                                ? <><i className="fas fa-spinner fa-spin"></i> Notifying...</>
                                : <><i className="fas fa-bell"></i> Notify Customer — I'm On My Way!</>}
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
                                <label className="rider-otp-label">
                                  <i className="fas fa-key"></i> Customer OTP Code
                                  <span className="otp-required-tag">*Required</span>
                                </label>
                                <input
                                  type="text" className="rider-otp-input" placeholder="Enter 4-digit OTP" maxLength={4}
                                  value={otpInputs[delivery._id] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                    setOtpInputs(prev => ({ ...prev, [delivery._id]: val }));
                                    setOtpErrors(prev => ({ ...prev, [delivery._id]: '' }));
                                  }}
                                />
                              </div>

                              <div className="rider-photo-group">
                                <label className="rider-otp-label">
                                  <i className="fas fa-camera"></i> Photo Proof
                                  <span className="otp-optional-tag">(Optional)</span>
                                </label>
                                <div
                                  className={`rider-photo-dropzone ${hasPhoto ? 'has-photo' : ''}`}
                                  onClick={() => fileInputRefs.current[delivery._id]?.click()}
                                >
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
                                <input
                                  type="file" accept="image/*" style={{ display: 'none' }}
                                  ref={el => (fileInputRefs.current[delivery._id] = el)}
                                  onChange={(e) => handlePhotoSelect(delivery._id, e.target.files[0])}
                                />
                              </div>

                              {errMsg && (
                                <div className="rider-confirm-error">
                                  <i className="fas fa-exclamation-circle"></i> {errMsg}
                                </div>
                              )}

                              <button
                                className={`rider-confirm-btn ${confirmingId === delivery._id ? 'confirming' : ''}`}
                                onClick={() => confirmDelivery(delivery)}
                                disabled={confirmingId === delivery._id}
                              >
                                {confirmingId === delivery._id
                                  ? <><i className="fas fa-spinner fa-spin"></i> Confirming Delivery...</>
                                  : <><i className="fas fa-check-circle"></i> Confirm Delivery</>}
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
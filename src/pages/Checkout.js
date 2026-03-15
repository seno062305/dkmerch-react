import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useProducts, usePreOrderProducts, useUpdateProduct, useCollectionProducts } from '../utils/productStorage';
import { useCreateOrder } from '../utils/orderStorage';
import { useCart, useClearCart } from '../context/cartUtils';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './Checkout.css';

// ─── NCR BOUNDS — delivery coverage area ─────────────────────────────────────
const NCR_BOUNDS = {
  minLat: 14.3500, maxLat: 14.8000,
  minLng: 120.8600, maxLng: 121.1500,
};

const isWithinNCR = (lat, lng) => {
  if (!lat || !lng) return true; // no coords yet — don't block
  return (
    lat >= NCR_BOUNDS.minLat && lat <= NCR_BOUNDS.maxLat &&
    lng >= NCR_BOUNDS.minLng && lng <= NCR_BOUNDS.maxLng
  );
};

// ─── LALAMOVE-STYLE SHIPPING CONFIG ──────────────────────────────────────────
const LALAMOVE_CONFIG = {
  baseFare:          49,
  freeKm:            2,
  ratePerKm:         10,
  maxReasonableKm:   25,
  extraItemFee:      10,
  heavySurcharge:    50,
  heavyThresholdKg:  10,
  categoryWeights: {
    albums:       0.3,
    photocards:   0.05,
    lightsticks:  0.5,
    apparel:      0.25,
    accessories:  0.15,
    default:      0.2,
  },
};

// ─── HAVERSINE DISTANCE ───────────────────────────────────────────────────────
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── LALAMOVE SHIPPING CALCULATOR ────────────────────────────────────────────
function calcLalamoveShipping(storeLat, storeLng, lat, lng, cartItems = [], products = []) {
  if (!lat || !lng || !storeLat || !storeLng) return null;

  const cfg = LALAMOVE_CONFIG;
  const km  = Math.round(getDistanceKm(storeLat, storeLng, lat, lng) * 10) / 10;

  let fee = cfg.baseFare;
  const chargeableKm = Math.max(0, km - cfg.freeKm);
  fee += Math.ceil(chargeableKm) * cfg.ratePerKm;

  const totalQty = cartItems.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 1), 0);
  if (totalQty > 1) fee += (totalQty - 1) * cfg.extraItemFee;

  let totalWeightKg = 0;
  cartItems.forEach(item => {
    const product  = products.find(p =>
      p._id?.toString() === (item.productId || item.id)?.toString()
    );
    const category = product?.category || 'default';
    const weight   = cfg.categoryWeights[category] ?? cfg.categoryWeights.default;
    totalWeightKg += weight * (item.qty ?? item.quantity ?? 1);
  });
  if (totalWeightKg > cfg.heavyThresholdKg) fee += cfg.heavySurcharge;

  const outOfCoverage = km > cfg.maxReasonableKm;

  const breakdown = [];
  breakdown.push({ label: 'Base fare', amount: cfg.baseFare });
  if (chargeableKm > 0) {
    breakdown.push({
      label:  `Distance (${km} km − ${cfg.freeKm} km free = ${Math.ceil(chargeableKm)} km × ₱${cfg.ratePerKm})`,
      amount: Math.ceil(chargeableKm) * cfg.ratePerKm,
    });
  } else {
    breakdown.push({ label: `Distance (${km} km — within free ${cfg.freeKm} km)`, amount: 0 });
  }
  if (totalQty > 1) {
    breakdown.push({
      label:  `Extra items (${totalQty - 1} item${totalQty > 2 ? 's' : ''} × ₱${cfg.extraItemFee})`,
      amount: (totalQty - 1) * cfg.extraItemFee,
    });
  }
  if (totalWeightKg > cfg.heavyThresholdKg) {
    breakdown.push({ label: `Heavy load surcharge (${totalWeightKg.toFixed(1)} kg)`, amount: cfg.heavySurcharge });
  }

  return {
    fee: Math.round(fee),
    km,
    totalQty,
    totalWeightKg: Math.round(totalWeightKg * 10) / 10,
    breakdown,
    outOfCoverage,
  };
}

// ─── ADDRESS MAP PICKER ───────────────────────────────────────────────────────
const AddressMapPicker = ({ value, onChange, onSelectSuggestion, savedCoords, onNCRViolation }) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef      = useRef(null);
  const debounceRef    = useRef(null);
  const pendingGeocode = useRef(null);

  const [suggestions, setSuggestions]         = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [geocoding, setGeocoding]             = useState(false);
  const [leafletReady, setLeafletReady]       = useState(!!window.L);
  const [mapVisible, setMapVisible]           = useState(false);
  const [statusText, setStatusText]           = useState('');

  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      if (window.L) { setLeafletReady(true); return; }
      existing.addEventListener('load', () => setLeafletReady(true));
      return;
    }
    const script   = document.createElement('script');
    script.id      = 'leaflet-js';
    script.src     = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload  = () => setLeafletReady(true);
    script.onerror = () => console.error('Leaflet failed to load');
    document.head.appendChild(script);
  }, []);

  // Helper: check NCR and call parent callback
  const checkAndNotifyNCR = useCallback((lat, lng) => {
    const valid = isWithinNCR(lat, lng);
    if (onNCRViolation) onNCRViolation(!valid);
    return valid;
  }, [onNCRViolation]);

  const geocodeAddress = useCallback(async (addr) => {
    if (!addr) return;
    if (!mapInstanceRef.current || !markerRef.current) {
      pendingGeocode.current = addr;
      return;
    }
    setGeocoding(true);
    setStatusText('Locating on map…');
    try {
      const encoded = encodeURIComponent(addr + ', Philippines');
      const res     = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data?.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        const withinNCR = checkAndNotifyNCR(lat, lng);
        if (markerRef.current && mapInstanceRef.current) {
          // Update marker icon based on NCR status
          updateMarkerIcon(lat, lng, withinNCR);
          markerRef.current.getPopup()?.setContent(
            `<div style="font-size:12px;max-width:200px"><strong>${withinNCR ? '📍' : '⚠️'} ${withinNCR ? 'Delivery Address' : 'Outside NCR Coverage'}</strong><br><small>${addr}</small></div>`
          );
          markerRef.current.openPopup();
          mapInstanceRef.current.flyTo([lat, lng], 17, { animate: true, duration: 0.8 });
          onSelectSuggestion({ address: addr, lat, lng, city: '', zipCode: '' });
        }
        setStatusText(withinNCR
          ? 'Pin your exact location — drag the marker to adjust'
          : '⚠️ This address is outside our NCR delivery area'
        );
      } else {
        setStatusText('Address not found. Drag the pin to set location manually.');
      }
    } catch {
      setStatusText('Could not locate address. Drag the pin to set location.');
    }
    setGeocoding(false);
  }, [onSelectSuggestion, checkAndNotifyNCR]);

  const updateMarkerIcon = (lat, lng, withinNCR) => {
    if (!markerRef.current || !window.L) return;
    const L = window.L;
    const color = withinNCR ? '#fc1268' : '#dc2626';
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:36px;height:36px;background:${color};border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 10px ${withinNCR ? 'rgba(252,18,104,0.5)' : 'rgba(220,38,38,0.5)'};border:3px solid white;">
        <span style="transform:rotate(45deg);font-size:16px">${withinNCR ? '📍' : '⚠️'}</span>
      </div>`,
      iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -40],
    });
    markerRef.current.setIcon(icon);
    if (lat && lng) markerRef.current.setLatLng([lat, lng]);
  };

  useEffect(() => {
    if (!mapVisible || mapInstanceRef.current || !mapRef.current || !leafletReady) return;
    try {
      const L        = window.L;
      const startLat  = savedCoords?.lat ?? 14.5995;
      const startLng  = savedCoords?.lng ?? 121.0;
      const startZoom = savedCoords ? 17 : 13;

      const map = L.map(mapRef.current, {
        zoomControl    : true,
        tap            : false,
        scrollWheelZoom: false,
        minZoom: 11,
        maxZoom: 19,
        maxBounds: [[14.3500, 120.8600], [14.8000, 121.1500]],
        maxBoundsViscosity: 1.0,
      }).setView([startLat, startLng], startZoom);
      map.setMaxBounds([[14.3500, 120.8600], [14.8000, 121.1500]]);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        minZoom: 11,
      }).addTo(map);

      const initWithinNCR = savedCoords ? isWithinNCR(savedCoords.lat, savedCoords.lng) : true;
      const initColor = initWithinNCR ? '#fc1268' : '#dc2626';
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;background:${initColor};border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;
          box-shadow:0 3px 10px rgba(252,18,104,0.5);border:3px solid white;">
          <span style="transform:rotate(45deg);font-size:16px">📍</span>
        </div>`,
        iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -40],
      });

      const marker = L.marker([startLat, startLng], { icon, draggable: true })
        .addTo(map)
        .bindPopup(
          savedCoords
            ? `<div style="font-size:12px;max-width:200px"><strong>📍 Last Used Location</strong><br><small>${value || 'Your saved address'}</small></div>`
            : '<strong>📍 Delivery Address</strong>'
        );

      if (savedCoords) {
        marker.openPopup();
        checkAndNotifyNCR(savedCoords.lat, savedCoords.lng);
        onSelectSuggestion({ address: value || '', lat: startLat, lng: startLng, city: '', zipCode: '' });
        setStatusText(initWithinNCR
          ? '📍 Showing your last saved location — drag the pin to adjust'
          : '⚠️ Your saved location is outside our NCR delivery area'
        );
      }

      marker.on('dragend', async () => {
        const { lat, lng } = marker.getLatLng();
        const withinNCR = checkAndNotifyNCR(lat, lng);
        setGeocoding(true);
        setStatusText(withinNCR ? 'Getting address for this location…' : '⚠️ Location is outside NCR coverage area');
        updateMarkerIcon(null, null, withinNCR);
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const addr    = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          const city    = data.address?.city || data.address?.town || data.address?.municipality || data.address?.suburb || '';
          const zipCode = data.address?.postcode || '';
          onChange(addr);
          onSelectSuggestion({ address: addr, lat, lng, city, zipCode });
          marker.getPopup()?.setContent(
            `<div style="font-size:12px;max-width:200px"><strong>${withinNCR ? '📍 Delivery Address' : '⚠️ Outside NCR Coverage'}</strong><br><small>${addr}</small></div>`
          );
          marker.openPopup();
          setStatusText(withinNCR
            ? 'Pin your exact location — drag the marker to adjust'
            : '⚠️ This location is outside our NCR delivery coverage'
          );
        } catch {
          setStatusText('Could not get address. Try again.');
        }
        setGeocoding(false);
      });

      mapInstanceRef.current = map;
      markerRef.current      = marker;

      setTimeout(() => {
        map.invalidateSize();
        if (pendingGeocode.current) {
          const addr = pendingGeocode.current;
          pendingGeocode.current = null;
          geocodeAddress(addr);
        } else if (!savedCoords && value) {
          geocodeAddress(value);
        } else if (!savedCoords) {
          setStatusText('Select an address suggestion or drag the pin to set location');
        }
      }, 350);
    } catch (err) {
      console.error('Map init error:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVisible, leafletReady]);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch {}
        mapInstanceRef.current = null;
        markerRef.current      = null;
      }
    };
  }, []);

  const fetchSuggestions = useCallback(async (query) => {
    if (!query || query.length < 4) { setSuggestions([]); return; }
    try {
      const encoded = encodeURIComponent(query + ', Philippines');
      const res     = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      setSuggestions(data.map(d => ({
        label:   d.display_name,
        lat:     parseFloat(d.lat),
        lng:     parseFloat(d.lon),
        address: d.display_name,
        city:    d.address?.city || d.address?.town || d.address?.municipality || d.address?.suburb || '',
        zipCode: d.address?.postcode || '',
      })));
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    onChange(val);
    // Reset NCR violation when user clears/changes address
    if (onNCRViolation) onNCRViolation(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 500);
  };

  const handleSelectSuggestion = (s) => {
    onChange(s.address);
    setSuggestions([]);
    setShowSuggestions(false);
    const withinNCR = checkAndNotifyNCR(s.lat, s.lng);
    if (!mapVisible) {
      pendingGeocode.current = s.address;
      setMapVisible(true);
    } else {
      if (mapInstanceRef.current && markerRef.current) {
        updateMarkerIcon(s.lat, s.lng, withinNCR);
        markerRef.current.getPopup()?.setContent(
          `<div style="font-size:12px;max-width:200px"><strong>${withinNCR ? '📍 Delivery Address' : '⚠️ Outside NCR Coverage'}</strong><br><small>${s.address}</small></div>`
        );
        markerRef.current.openPopup();
        mapInstanceRef.current.flyTo([s.lat, s.lng], 17, { animate: true, duration: 0.8 });
        onSelectSuggestion({ address: s.address, lat: s.lat, lng: s.lng, city: s.city, zipCode: s.zipCode });
        setStatusText(withinNCR
          ? 'Pin your exact location — drag the marker to adjust'
          : '⚠️ This address is outside our NCR delivery area'
        );
      } else {
        pendingGeocode.current = s.address;
      }
    }
  };

  const handleToggleMap = () => {
    if (mapVisible) {
      setMapVisible(false);
    } else {
      setMapVisible(true);
      setTimeout(() => {
        if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize();
      }, 350);
    }
  };

  return (
    <div className="address-map-picker">
      <div className="address-autocomplete-wrap" style={{ position: 'relative' }}>
        <div className="address-input-row">
          <input
            type="text"
            name="address"
            value={value}
            onChange={handleInputChange}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Start typing your address…"
            autoComplete="off"
          />
          <button type="button" className="address-map-toggle-btn" onClick={handleToggleMap} title={mapVisible ? 'Hide map' : 'Show map'}>
            <i className={`fas fa-map${mapVisible ? '-marked-alt' : ''}`}></i>
            {mapVisible ? ' Hide Map' : ' View on Map'}
          </button>
        </div>
        {savedCoords && !mapVisible && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: '#2563eb', fontWeight: 600 }}>
            <i className="fas fa-map-marker-alt" style={{ color: '#fc1268' }}></i>
            Saved pin location available — click "View on Map" to see it
          </div>
        )}
        {showSuggestions && suggestions.length > 0 && (
          <ul className="address-suggestions-list">
            {suggestions.map((s, i) => {
              const sInNCR = isWithinNCR(s.lat, s.lng);
              return (
                <li key={i} onMouseDown={() => handleSelectSuggestion(s)}
                  style={!sInNCR ? { opacity: 0.65 } : {}}>
                  <i className={`fas fa-map-marker-alt`} style={{ color: sInNCR ? '#fc1268' : '#dc2626' }}></i>
                  <span>
                    {s.label}
                    {!sInNCR && (
                      <span style={{ display: 'block', fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 2 }}>
                        ⚠️ Outside NCR — delivery not available
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {mapVisible && (
        <div className="address-map-preview-wrap">
          <div className="address-map-preview-header">
            <i className={geocoding ? 'fas fa-spinner fa-spin' : 'fas fa-map-marked-alt'}></i>
            <span>{geocoding ? 'Locating on map…' : statusText || 'Select an address suggestion or drag the pin'}</span>
          </div>
          <div ref={mapRef} className="address-map-preview-container" />
          <div className="address-map-preview-hint">
            <i className="fas fa-hand-pointer"></i> Drag the 📍 pin to fine-tune your delivery location
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b', fontWeight: 600 }}>📍 NCR Only</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SHIPPING BREAKDOWN DISPLAY ───────────────────────────────────────────────
const ShippingBreakdown = ({ shippingInfo, isEstimate = false }) => {
  const [expanded, setExpanded] = useState(false);
  if (!shippingInfo) return null;
  return (
    <div className="shipping-breakdown-wrap">
      <div className="shipping-breakdown-header" onClick={() => setExpanded(v => !v)}>
        <div className="shipping-breakdown-main">
          <i className="fas fa-motorcycle" style={{ color: '#fc1268' }}></i>
          <div>
            <span className="shipping-fee-label">
              {isEstimate ? '⚠️ Estimated Shipping Fee' : 'Estimated Shipping Fee'}
            </span>
            <strong className="shipping-fee-amount">₱{shippingInfo.fee.toLocaleString()}</strong>
          </div>
        </div>
        <div className="shipping-breakdown-meta">
          <span>{shippingInfo.km} km from store</span>
          <span className="shipping-breakdown-toggle">
            {expanded ? 'Hide' : 'See breakdown'} <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}></i>
          </span>
        </div>
      </div>

      {/* Warning banner when store location is not set by admin */}
      {isEstimate && (
        <div className="shipping-estimate-warning">
          <i className="fas fa-exclamation-triangle"></i>
          <span>
            <strong>Shipping fee is an estimate.</strong> The store pickup location hasn't been precisely set yet — the actual fee may differ slightly when your rider is assigned.
          </span>
        </div>
      )}

      {expanded && (
        <div className="shipping-breakdown-details">
          {shippingInfo.breakdown.map((row, i) => (
            <div key={i} className="shipping-breakdown-row">
              <span>{row.label}</span>
              <span className={row.amount === 0 ? 'shipping-free-label' : ''}>
                {row.amount === 0 ? 'FREE' : `+₱${row.amount}`}
              </span>
            </div>
          ))}
          <div className="shipping-breakdown-total">
            <span>Total Shipping</span>
            <strong>₱{shippingInfo.fee.toLocaleString()}</strong>
          </div>
          <div className="shipping-breakdown-note">
            <i className="fas fa-info-circle"></i>
            Rates based on Lalamove motorcycle delivery. Actual fee may vary slightly.
          </div>
        </div>
      )}

      {shippingInfo.outOfCoverage && (
        <div className="shipping-out-of-coverage">
          <i className="fas fa-exclamation-triangle"></i>
          Your location is {shippingInfo.km} km away — delivery may take longer or require special arrangement.
        </div>
      )}
    </div>
  );
};

// ─── NCR VIOLATION BANNER ─────────────────────────────────────────────────────
const NCRViolationBanner = () => (
  <div className="ncr-violation-banner">
    <div className="ncr-violation-icon">🚫</div>
    <div className="ncr-violation-body">
      <strong>Address Outside Delivery Area</strong>
      <p>
        Sorry, we currently only deliver within <strong>Metro Manila (NCR)</strong>.
        Please enter an address within NCR to proceed with your order.
      </p>
    </div>
  </div>
);

// ─── MAIN CHECKOUT ────────────────────────────────────────────────────────────
const Checkout = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { showNotification }      = useNotification();
  const collectionProducts = useCollectionProducts() || [];
  const regularProducts    = useProducts() || [];
  const preOrderProducts   = usePreOrderProducts() || [];
  const allProductsMap = new Map();
  [...collectionProducts, ...regularProducts, ...preOrderProducts].forEach(p => {
    allProductsMap.set(p._id?.toString(), p);
  });
  const products = Array.from(allProductsMap.values());

  const cartItems     = useCart();
  const createOrder   = useCreateOrder();
  const clearCart     = useClearCart();
  const updateProduct = useUpdateProduct();

  const storeSettings = useQuery(api.settings.getSettings);
  // True only when admin has explicitly saved real coords
  const hasStoreLocation = !!(storeSettings?.storeLat && storeSettings?.storeLng);
  const STORE_LAT = storeSettings?.storeLat ?? 14.5995;
  const STORE_LNG = storeSettings?.storeLng ?? 121.0;

  const savedProfile = useQuery(
    api.users.getProfile,
    user?._id || user?.id ? { userId: user?._id || user?.id } : 'skip'
  );
  const saveProfile           = useMutation(api.users.saveProfile);
  const sendOrderConfirmation = useAction(api.sendEmail.sendOrderConfirmation);
  const createPaymentLink     = useAction(api.payments.createPaymentLink);

  const [loading, setLoading]                   = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [errors, setErrors]                     = useState({ phone: '' });
  const cartPromo = location.state?.appliedPromo || null;

  const [formData, setFormData]         = useState({ fullName: '', email: '', phone: '', address: '', city: '', zipCode: '', notes: '' });
  const [savedContact, setSavedContact] = useState({ fullName: '', email: '', phone: '' });
  const [savedAddress, setSavedAddress] = useState({ address: '', city: '', zipCode: '' });
  const [addressCoords, setAddressCoords] = useState(null);
  const [savedCoords, setSavedCoords]     = useState(null);

  // ── NCR validation state ──────────────────────────────────────────────────
  const [isOutsideNCR, setIsOutsideNCR] = useState(false);

  const shippingInfo = addressCoords && !isOutsideNCR
    ? calcLalamoveShipping(STORE_LAT, STORE_LNG, addressCoords.lat, addressCoords.lng, cartItems, products)
    : null;
  const shippingFee  = shippingInfo?.fee ?? 0;

  useEffect(() => {
    if (!isAuthenticated) {
      showNotification('Please login to checkout', 'warning');
      navigate('/');
      return;
    }
    const profile = savedProfile;
    const init = {
      fullName: profile?.fullName || user?.name  || '',
      email:    profile?.email    || user?.email || '',
      phone:    profile?.phone    || '',
      address:  profile?.address  || '',
      city:     profile?.city     || '',
      zipCode:  profile?.zipCode  || '',
      notes:    ''
    };
    setFormData(init);
    setSavedContact({ fullName: init.fullName, email: init.email, phone: init.phone });
    setSavedAddress({ address: init.address, city: init.city, zipCode: init.zipCode });
    setIsEditingContact(!init.fullName || !init.email || !init.phone);
    setIsEditingAddress(!init.address);
    if (profile?.addressLat && profile?.addressLng) {
      const coords = { lat: profile.addressLat, lng: profile.addressLng };
      setSavedCoords(coords);
      setAddressCoords(coords);
      // Check if saved coords are within NCR
      setIsOutsideNCR(!isWithinNCR(coords.lat, coords.lng));
    }
  }, [isAuthenticated, navigate, showNotification, user, savedProfile]);

  useEffect(() => {
    if (cartItems.length === 0 && products.length > 0) {
      showNotification('Your cart is empty', 'warning');
      navigate('/collections');
    }
  }, [cartItems.length, products.length]);

  const getProductById    = (id) => products.find(p => p._id?.toString() === id?.toString() || p.id === id);
  const getQty            = (item) => item.qty ?? item.quantity ?? 1;
  const getEffectivePrice = (item, product) => {
    if (item.finalPrice !== undefined && item.finalPrice !== null) return item.finalPrice;
    if (item.price     !== undefined && item.price     !== null) return item.price;
    return product?.price ?? 0;
  };
  const calculateSubtotal = () =>
    cartItems.reduce((total, item) => {
      const product = getProductById(item.productId || item.id);
      return total + getEffectivePrice(item, product) * getQty(item);
    }, 0);
  const calculateTotalDiscount = () =>
    cartItems.reduce((total, item) => {
      if (!item.promoCode) return total;
      const product = getProductById(item.productId || item.id);
      const originalPrice = product?.price ?? item.price ?? 0;
      const finalPrice    = item.finalPrice ?? originalPrice;
      return total + (originalPrice - finalPrice) * getQty(item);
    }, 0);

  const subtotal      = calculateSubtotal();
  const totalDiscount = calculateTotalDiscount();
  const finalTotal    = subtotal + shippingFee;

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^\d*$/.test(cleaned)) return 'Phone number must contain only numbers';
    if (cleaned.length > 0 && cleaned.length !== 11) return 'Phone number must be exactly 11 digits';
    if (cleaned.length === 11 && !cleaned.startsWith('09')) return 'Phone number must start with 09';
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const cleaned = value.replace(/\D/g, '').slice(0, 11);
      setFormData(prev => ({ ...prev, [name]: cleaned }));
      setErrors(prev => ({ ...prev, phone: validatePhone(cleaned) }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange = (val) => setFormData(prev => ({ ...prev, address: val }));

  const handleAddressSelect = ({ address, lat, lng, city, zipCode }) => {
    setFormData(prev => ({
      ...prev, address,
      city:    city    || prev.city,
      zipCode: zipCode || prev.zipCode,
    }));
    setAddressCoords({ lat, lng });
  };

  const isContactComplete = () =>
    savedContact.fullName.trim() && savedContact.email.trim() &&
    savedContact.phone.trim() && !validatePhone(savedContact.phone);

  const isAddressComplete = () => savedAddress.address.trim();

  // ── Form is ready only when address is within NCR ───────────────────────
  const isFormReady = () =>
    isContactComplete() && isAddressComplete() && !isEditingContact && !isEditingAddress && !isOutsideNCR;

  const handleSaveContact = async () => {
    if (!formData.fullName.trim()) { showNotification('Please enter your full name', 'error'); return; }
    if (!formData.email.trim())    { showNotification('Please enter your email', 'error'); return; }
    const phoneErr = validatePhone(formData.phone);
    if (phoneErr) { setErrors(prev => ({ ...prev, phone: phoneErr })); return; }
    setSavedContact({ fullName: formData.fullName, email: formData.email, phone: formData.phone });
    setIsEditingContact(false);
    try {
      await saveProfile({
        userId: user?._id || user?.id,
        fullName: formData.fullName, email: formData.email, phone: formData.phone,
        address: savedAddress.address, city: savedAddress.city, zipCode: savedAddress.zipCode,
      });
      showNotification('Contact information saved!', 'success');
    } catch { showNotification('Contact saved locally', 'success'); }
  };

  const handleSaveAddress = async () => {
    if (!formData.address.trim()) { showNotification('Please enter your street address', 'error'); return; }
    // ── Block save if outside NCR ──
    if (isOutsideNCR) {
      showNotification('Please enter an address within Metro Manila (NCR) to proceed.', 'error');
      return;
    }
    setSavedAddress({ address: formData.address, city: formData.city, zipCode: formData.zipCode });
    setIsEditingAddress(false);
    try {
      await saveProfile({
        userId: user?._id || user?.id,
        fullName: savedContact.fullName, email: savedContact.email, phone: savedContact.phone,
        address: formData.address, city: formData.city, zipCode: formData.zipCode,
        ...(addressCoords ? { addressLat: addressCoords.lat, addressLng: addressCoords.lng } : {}),
      });
      showNotification('Shipping address saved!', 'success');
    } catch { showNotification('Address saved locally', 'success'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // ── Extra NCR guard on submit ──
    if (isOutsideNCR) {
      showNotification('Delivery is only available within Metro Manila (NCR). Please update your address.', 'error');
      setIsEditingAddress(true);
      return;
    }
    if (!isFormReady()) {
      showNotification('Please fill in and save all required fields', 'error');
      if (!isContactComplete()) setIsEditingContact(true);
      if (!isAddressComplete()) setIsEditingAddress(true);
      return;
    }
    if (products.length === 0) {
      showNotification('Products are still loading. Please wait a moment and try again.', 'warning');
      return;
    }

    for (const item of cartItems) {
      const product = getProductById(item.productId || item.id);
      if (!product) continue;
      if (product.stock !== undefined && product.stock < getQty(item)) {
        showNotification(`Insufficient stock for ${product.name}. Available: ${product.stock}`, 'error');
        return;
      }
    }

    setLoading(true);

    try {
      const orderId  = `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const shipping = shippingFee;

      const orderItems = cartItems.map(item => {
        const product = getProductById(item.productId || item.id);
        return {
          id:          item.productId || item.id,
          name:        product?.name  || 'Unknown',
          price:       getEffectivePrice(item, product),
          image:       product?.image || '',
          quantity:    getQty(item),
          isPreOrder:  product?.isPreOrder  || false,
          releaseDate: product?.releaseDate || null,
        };
      });

      const originalSubtotal = cartItems.reduce((total, item) => {
        const product = getProductById(item.productId || item.id);
        return total + (product?.price ?? 0) * getQty(item);
      }, 0);

      const promoItem = cartItems.find(i => i.promoCode);

      const addressParts = [savedAddress.address];
      if (savedAddress.city)    addressParts.push(savedAddress.city);
      if (savedAddress.zipCode) addressParts.push(savedAddress.zipCode);
      const shippingAddressStr = addressParts.join(', ');

      await createOrder({
        orderId,
        email:           savedContact.email,
        customerName:    savedContact.fullName,
        phone:           savedContact.phone,
        items:           orderItems,
        total:           originalSubtotal + shipping,
        subtotal:        originalSubtotal,
        shippingFee:     shipping,
        ...(totalDiscount > 0 && promoItem && {
          promoCode:       promoItem.promoCode,
          discountAmount:  totalDiscount,
          discountPercent: promoItem.promoDiscount,
          finalTotal,
        }),
        status:          'Pending Payment',
        orderStatus:     'pending',
        shippingAddress: shippingAddressStr,
        ...(addressCoords ? { addressLat: addressCoords.lat, addressLng: addressCoords.lng } : {}),
        paymentMethod:   'paymongo',
        notes:           formData.notes || '',
        paymentStatus:   'pending',
      });

      let paymentLinkUrl;
      try {
        const result = await createPaymentLink({
          orderId,
          amount:        finalTotal,
          description:   `DKMerch Order ${orderId}${promoItem ? ` (Promo: ${promoItem.promoCode})` : ''}`,
          customerName:  savedContact.fullName,
          customerEmail: savedContact.email,
          customerPhone: savedContact.phone,
        });
        paymentLinkUrl = result.paymentLinkUrl;
      } catch (payError) {
        console.error('PayMongo error:', payError);
        setLoading(false);
        showNotification('Payment setup failed. Please try again or contact support.', 'error');
        return;
      }

      for (const item of cartItems) {
        const product = getProductById(item.productId || item.id);
        if (product) {
          try {
            await updateProduct({ id: product._id, stock: product.stock - getQty(item) });
          } catch (stockErr) {
            console.warn('Stock update failed for', product.name, stockErr);
          }
        }
      }

      if (addressCoords) {
        try {
          await saveProfile({
            userId:   user?._id || user?.id,
            fullName: savedContact.fullName,
            email:    savedContact.email,
            phone:    savedContact.phone,
            address:  savedAddress.address,
            city:     savedAddress.city,
            zipCode:  savedAddress.zipCode,
            addressLat: addressCoords.lat,
            addressLng: addressCoords.lng,
          });
        } catch { /* non-critical */ }
      }

      try {
        await sendOrderConfirmation({
          to:   savedContact.email,
          name: savedContact.fullName,
          orderId,
          items: orderItems.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
          total:              originalSubtotal + shipping,
          promoCode:          promoItem?.promoCode,
          discountAmount:     totalDiscount > 0 ? totalDiscount : undefined,
          finalTotal,
          shippingFee:        shipping,
          shippingDistanceKm: shippingInfo?.km,
        });
      } catch (emailErr) { console.warn('Email failed:', emailErr); }

      await clearCart();
      setLoading(false);
      window.location.href = paymentLinkUrl;

    } catch (error) {
      setLoading(false);
      showNotification('Error placing order. Please try again.', 'error');
      console.error('Order error:', error);
    }
  };

  const promoCartItems    = cartItems.filter(i => !!i.promoCode);
  const nonPromoCartItems = cartItems.filter(i => !i.promoCode);

  const renderSummaryItem = (item) => {
    const product = getProductById(item.productId || item.id);
    if (!product) return null;
    const qty            = getQty(item);
    const hasPromo       = !!item.promoCode;
    const effectivePrice = getEffectivePrice(item, product);
    const itemTotal      = effectivePrice * qty;
    const originalTotal  = product.price * qty;
    return (
      <div key={item._id || `${item.productId}-${item.promoCode || 'nopromo'}`}
           className={`summary-item${hasPromo ? ' summary-item-promo' : ''}`}>
        <img src={product.image} alt={product.name} />
        <div className="item-details">
          <p className="item-name">
            {product.name}
            {product.isPreOrder && <span className="item-preorder-badge">PRE-ORDER</span>}
            {hasPromo && <span className="item-promo-tag"><i className="fas fa-tag"></i> {item.promoDiscount}% OFF</span>}
          </p>
          <p className="item-meta">{product.kpopGroup}</p>
          {product.isPreOrder && product.releaseDate && (
            <p className="item-release-date">
              <i className="fas fa-calendar-alt"></i>{' '}
              Expected: {new Date(product.releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
          <p className="item-qty">Qty: {qty}</p>
          {product.stock < qty && <p className="item-error">⚠️ Only {product.stock} in stock</p>}
        </div>
        <div className="item-price-col">
          <div className={`item-price${hasPromo ? ' item-price-promo' : ''}`}>₱{itemTotal.toLocaleString()}</div>
          {hasPromo && <div className="item-price-original-small">₱{originalTotal.toLocaleString()}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <form onSubmit={handleSubmit} className="checkout-form">
          <div className="checkout-grid">
            <div className="checkout-details">

              {/* ── Contact Information ── */}
              <div className="checkout-section">
                <div className="section-header">
                  <h2>
                    Contact Information
                    {isContactComplete() && !isEditingContact && <span className="section-complete-badge"><i className="fas fa-check-circle"></i> Saved</span>}
                  </h2>
                  {!isEditingContact
                    ? <button type="button" className="edit-info-btn" onClick={() => setIsEditingContact(true)}><i className="fas fa-pen"></i> Edit</button>
                    : <button type="button" className="save-info-btn" onClick={handleSaveContact}><i className="fas fa-check"></i> Save</button>
                  }
                </div>
                {!isEditingContact ? (
                  <div className="info-display-grid">
                    <div className="info-display-item"><span className="info-label"><i className="fas fa-user"></i> Full Name</span><span className="info-value">{savedContact.fullName || <span className="info-missing">Not set — click Edit</span>}</span></div>
                    <div className="info-display-item"><span className="info-label"><i className="fas fa-envelope"></i> Email</span><span className="info-value">{savedContact.email || <span className="info-missing">Not set — click Edit</span>}</span></div>
                    <div className="info-display-item info-display-full"><span className="info-label"><i className="fas fa-phone"></i> Phone Number</span><span className="info-value">{savedContact.phone || <span className="info-missing">Not set — click Edit</span>}</span></div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <div className="form-group"><label>Full Name</label><input type="text" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Juan Dela Cruz" /></div>
                    <div className="form-group"><label>Email</label><input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="juan@example.com" /></div>
                    <div className="form-group full-width">
                      <label>Phone Number</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleChange} placeholder="09XXXXXXXXX" maxLength="11" className={errors.phone ? 'input-error' : ''} />
                      {errors.phone && <span className="error-message"><i className="fas fa-exclamation-circle"></i> {errors.phone}</span>}
                      {!errors.phone && formData.phone?.length === 11 && <span className="success-message"><i className="fas fa-check-circle"></i> Valid phone number</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Shipping Address ── */}
              <div className="checkout-section">
                <div className="section-header">
                  <h2>
                    Shipping Address
                    {isAddressComplete() && !isEditingAddress && !isOutsideNCR && <span className="section-complete-badge"><i className="fas fa-check-circle"></i> Saved</span>}
                    {isOutsideNCR && <span className="section-ncr-badge"><i className="fas fa-exclamation-triangle"></i> Outside NCR</span>}
                  </h2>
                  {!isEditingAddress
                    ? <button type="button" className="edit-info-btn" onClick={() => setIsEditingAddress(true)}><i className="fas fa-pen"></i> Edit</button>
                    : <button
                        type="button"
                        className="save-info-btn"
                        onClick={handleSaveAddress}
                        disabled={isOutsideNCR}
                        style={isOutsideNCR ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                      >
                        <i className="fas fa-check"></i> Save
                      </button>
                  }
                </div>

                {/* NCR violation banner — shown in edit mode */}
                {isEditingAddress && isOutsideNCR && <NCRViolationBanner />}

                {!isEditingAddress ? (
                  <div className="info-display-grid">
                    <div className="info-display-item info-display-full">
                      <span className="info-label"><i className="fas fa-map-marker-alt"></i> Street Address</span>
                      <span className="info-value">{savedAddress.address || <span className="info-missing">Not set — click Edit</span>}</span>
                    </div>
                    {/* NCR violation shown in read mode too */}
                    {isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ padding: 0, background: 'transparent', border: 'none' }}>
                        <NCRViolationBanner />
                      </div>
                    )}
                    {shippingInfo && !isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ padding: 0, background: 'transparent', border: 'none' }}>
                        <ShippingBreakdown shippingInfo={shippingInfo} isEstimate={!hasStoreLocation} />
                      </div>
                    )}
                    {!shippingInfo && isAddressComplete() && !isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ background: '#fffbeb', borderColor: '#fde68a' }}>
                        <span className="info-label" style={{ color: '#92400e' }}><i className="fas fa-motorcycle"></i> Shipping Fee</span>
                        <span className="info-value" style={{ fontSize: '13px', color: '#78350f' }}>
                          <i className="fas fa-map-marker-alt" style={{ color: '#f59e0b', marginRight: '6px' }}></i>
                          Pin your location on the map to compute shipping fee
                        </span>
                      </div>
                    )}
                    {addressCoords && !isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
                        <span className="info-label" style={{ color: '#1e40af' }}><i className="fas fa-map-marker-alt"></i> Map Pin</span>
                        <span className="info-value" style={{ fontSize: '13px', color: '#1e3a8a' }}>
                          <i className="fas fa-check-circle" style={{ color: '#3b82f6', marginRight: '6px' }}></i>
                          Exact location saved — rider will navigate to your pin
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Street Address</label>
                      <AddressMapPicker
                        value={formData.address}
                        onChange={handleAddressChange}
                        onSelectSuggestion={handleAddressSelect}
                        savedCoords={savedCoords}
                        onNCRViolation={setIsOutsideNCR}
                      />
                    </div>
                    {addressCoords && !isOutsideNCR && (() => {
                      const preview = calcLalamoveShipping(STORE_LAT, STORE_LNG, addressCoords.lat, addressCoords.lng, cartItems, products);
                      return preview ? (
                        <div className="form-group full-width">
                          <ShippingBreakdown shippingInfo={preview} isEstimate={!hasStoreLocation} />
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

              {/* ── Promo Applied ── */}
              {totalDiscount > 0 && (
                <div className="checkout-section">
                  <h2>Promo Applied</h2>
                  <div className="promo-applied-checkout">
                    <div className="promo-applied-left">
                      <span className="promo-applied-icon">🎉</span>
                      <div>
                        <span className="promo-applied-code">{cartItems.find(i => i.promoCode)?.promoCode}</span>
                        <span className="promo-applied-desc">
                          {cartItems.find(i => i.promoCode)?.promoDiscount}% off applied on promo items ·{' '}
                          <strong style={{ color: '#16a34a' }}>You save ₱{totalDiscount.toLocaleString()}</strong>
                        </span>
                      </div>
                    </div>
                    <span className="promo-checkout-applied-badge"><i className="fas fa-check-circle"></i> Applied in Cart</span>
                  </div>
                </div>
              )}

              {/* ── Payment ── */}
              <div className="checkout-section">
                <h2>Payment</h2>
                <div className="payment-info-notice">
                  <i className="fas fa-shield-alt"></i>
                  <span>You will be redirected to a secure <strong>PayMongo</strong> page where you can choose to pay via <strong>GCash</strong> or <strong>Maya</strong>.</span>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '14px', alignItems: 'center' }}>
                  <div className="payment-icon-wrap payment-icon-gcash" style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <i className="fas fa-mobile-alt" style={{ fontSize: '18px' }}></i>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>GCash</span>
                  <div className="payment-icon-wrap payment-icon-paymaya" style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '8px' }}>
                    <i className="fas fa-wallet" style={{ fontSize: '18px' }}></i>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Maya</span>
                </div>
              </div>

              {/* ── Order Notes ── */}
              <div className="checkout-section">
                <h2>Order Notes <span className="notes-optional">(Optional)</span></h2>
                <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Any special instructions for your order..." rows="4"></textarea>
              </div>
            </div>

            {/* ── Order Summary ── */}
            <div className="order-summary">
              <div className="summary-card">
                <h2>Order Summary</h2>
                <div className="summary-items">
                  {nonPromoCartItems.length > 0 && (
                    <>
                      {promoCartItems.length > 0 && <div className="summary-group-label"><i className="fas fa-shopping-bag"></i> Regular Items</div>}
                      {nonPromoCartItems.map(item => renderSummaryItem(item))}
                    </>
                  )}
                  {promoCartItems.length > 0 && (
                    <>
                      <div className="summary-group-label summary-group-label-promo"><i className="fas fa-tag"></i> Promo Items</div>
                      {promoCartItems.map(item => renderSummaryItem(item))}
                    </>
                  )}
                </div>
                <div className="summary-divider"></div>

                <div className="summary-totals">
                  {totalDiscount > 0 && (
                    <div className="summary-row summary-row-original">
                      <span>Original Price</span>
                      <span className="summary-strikethrough">₱{(subtotal + totalDiscount).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>₱{subtotal.toLocaleString()}</span>
                  </div>
                  <div className="summary-row">
                    <span>
                      <i className="fas fa-motorcycle" style={{ marginRight: '6px', color: '#fc1268' }}></i>
                      Shipping
                      {shippingInfo && (
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '4px' }}>
                          (~{shippingInfo.km} km · {shippingInfo.totalQty} item{shippingInfo.totalQty > 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                    <span>
                      {isOutsideNCR
                        ? <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 700 }}>
                            <i className="fas fa-ban" style={{ marginRight: '4px' }}></i>
                            NCR only
                          </span>
                        : shippingInfo
                          ? <strong style={{ color: '#1e293b' }}>₱{shippingInfo.fee.toLocaleString()}</strong>
                          : <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 600 }}>
                              <i className="fas fa-map-marker-alt" style={{ marginRight: '4px' }}></i>
                              Set address first
                            </span>
                      }
                    </span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="summary-row promo-discount-row">
                      <span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo Discount</span>
                      <span className="promo-discount-amount">−₱{totalDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="summary-row total">
                    <span>Total</span>
                    <span>
                      {isOutsideNCR
                        ? <span style={{ fontSize: '14px', color: '#dc2626' }}>Address outside NCR</span>
                        : shippingInfo
                          ? `₱${finalTotal.toLocaleString()}`
                          : <span style={{ fontSize: '15px', color: '#f59e0b' }}>Set address to see total</span>
                      }
                    </span>
                  </div>
                  {totalDiscount > 0 && !isOutsideNCR && (
                    <div className="promo-savings-checkout">
                      <i className="fas fa-piggy-bank"></i>
                      You're saving <strong>₱{totalDiscount.toLocaleString()}</strong> with your promo!
                    </div>
                  )}
                </div>

                {/* NCR block notice in summary card */}
                {isOutsideNCR && (
                  <div className="ncr-summary-block">
                    <i className="fas fa-map-marker-alt"></i>
                    <span>We only deliver within <strong>Metro Manila (NCR)</strong>. Please update your address.</span>
                  </div>
                )}

                <button
                  type="submit"
                  className={`btn btn-primary btn-checkout${(!isFormReady() || loading) ? ' btn-checkout-disabled' : ''}`}
                  disabled={loading || !isFormReady()}
                >
                  {loading
                    ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                    : isOutsideNCR
                      ? <><i className="fas fa-ban"></i> Address Outside NCR</>
                      : !isFormReady()
                        ? <><i className="fas fa-lock"></i> Complete Your Info First</>
                        : shippingInfo
                          ? <>Pay ₱{finalTotal.toLocaleString()} Securely</>
                          : <>Pay Securely</>
                  }
                </button>
                {!isFormReady() && !loading && (
                  <p className="form-incomplete-hint">
                    <i className="fas fa-exclamation-circle"></i>{' '}
                    {isOutsideNCR
                      ? 'Your address is outside NCR. We only deliver within Metro Manila.'
                      : isEditingContact ? 'Click "Save" on Contact Information to continue.'
                      : isEditingAddress ? 'Click "Save" on Shipping Address to continue.'
                      : 'Fill in and save your contact and address info above.'}
                  </p>
                )}
                <div className="security-info">
                  <i className="fas fa-shield-alt"></i>
                  <p>Secured by PayMongo. Your payment info is protected.</p>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Checkout;
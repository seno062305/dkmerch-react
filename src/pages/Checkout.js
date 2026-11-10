// src/components/Checkout.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useNotification } from '../context/NotificationContext';
import { useProducts, usePreOrderProducts, useUpdateProduct, useCollectionProducts } from '../utils/productStorage';
import { useCreateOrder } from '../utils/orderStorage';
import { useCart, useClearCart, useRemoveFromCartById } from '../context/cartUtils';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { runWithFailover } from '../lib/failoverWrite';
import { failoverCheckoutAssist, isFailoverPayConfigured } from '../lib/failoverPayEmail';
import { isWithinNCR } from '../utils/deliveryUtils';
import { isAppOutdated } from '../utils/appUpdate';
import './Checkout.css';

// ─── LALAMOVE SHIPPING CONFIG ─────────────────────────────────────────────────
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

// ─── ADDRESS MAP PICKER (manual fields + optional pin w/ search) ─────────────
const buildFullAddress = ({ address, barangay, city, zipCode }) =>
  [address, barangay && `Brgy. ${barangay}`, city, zipCode, 'Philippines']
    .filter(Boolean)
    .join(', ');

const AddressMapPicker = ({
  address,
  barangay,
  city,
  zipCode,
  onFieldsChange,
  onSelectSuggestion,
  savedCoords,
  onNCRViolation,
}) => {
  const mapRef         = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef      = useRef(null);
  const pendingFly     = useRef(null);
  const suggestRef     = useRef(null);
  const fieldsRef      = useRef({ address, barangay, city, zipCode });

  const [leafletReady,    setLeafletReady]    = useState(!!window.L);
  // Never auto-open on load/refresh — only when user taps Add/Edit pin
  const [mapVisible,      setMapVisible]      = useState(false);
  const [statusText,      setStatusText]      = useState('Tap the map or drag the pin to set your location');
  const [pinSet,          setPinSet]          = useState(!!savedCoords);
  const [geocoding,       setGeocoding]       = useState(false);
  const [pinQuery,        setPinQuery]        = useState('');
  const [suggestions,     setSuggestions]     = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    fieldsRef.current = { address, barangay, city, zipCode };
  }, [address, barangay, city, zipCode]);

  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) {
      if (window.L) { setLeafletReady(true); return; }
      existing.addEventListener('load', () => setLeafletReady(true));
      return;
    }
    const script = document.createElement('script');
    script.id = 'leaflet-js';
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setLeafletReady(true);
    script.onerror = () => console.error('Leaflet failed to load');
    document.head.appendChild(script);
  }, []);

  const checkAndNotifyNCR = useCallback((lat, lng) => {
    const valid = isWithinNCR(lat, lng);
    if (onNCRViolation) onNCRViolation(!valid);
    return valid;
  }, [onNCRViolation]);

  const makeIcon = useCallback((withinNCR) => {
    const L = window.L;
    const color = withinNCR ? '#fc1268' : '#dc2626';
    return L.divIcon({
      className: '',
      html: `<div style="width:36px;height:36px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px ${withinNCR ? 'rgba(252,18,104,0.5)' : 'rgba(220,38,38,0.5)'};border:3px solid white;"><span style="transform:rotate(45deg);font-size:16px">${withinNCR ? '📍' : '⚠️'}</span></div>`,
      iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -40],
    });
  }, []);

  const commitPin = useCallback((lat, lng, { fly = true } = {}) => {
    const withinNCR = checkAndNotifyNCR(lat, lng);
    const fields = fieldsRef.current;
    const label = buildFullAddress(fields);
    if (markerRef.current && mapInstanceRef.current && window.L) {
      markerRef.current.setIcon(makeIcon(withinNCR));
      markerRef.current.setLatLng([lat, lng]);
      markerRef.current.getPopup()?.setContent(
        `<div style="font-size:12px;max-width:220px"><strong>${withinNCR ? '📍 Delivery pin' : '⚠️ Outside NCR · LBC'}</strong><br><small>${label || 'Pinned location'}</small></div>`
      );
      markerRef.current.openPopup();
      if (fly) {
        mapInstanceRef.current.flyTo([lat, lng], withinNCR ? 17 : 14, { animate: true, duration: 0.6 });
      }
    } else {
      pendingFly.current = { lat, lng, withinNCR };
    }
    setPinSet(true);
    onSelectSuggestion({ ...fields, lat, lng });
    setStatusText(withinNCR
      ? 'Pin set — drag to fine-tune'
      : '⚠️ Outside NCR — LBC Express shipping'
    );
  }, [checkAndNotifyNCR, makeIcon, onSelectSuggestion]);

  const geocodeFilledAddress = useCallback(async () => {
    const fields = fieldsRef.current;
    const street = (fields.address || '').trim();
    const cty = (fields.city || '').trim();
    if (!street && !cty) return false;
    const query = buildFullAddress(fields);
    setGeocoding(true);
    setStatusText('Locating your filled address…');
    try {
      const params = new URLSearchParams({
        format: 'json',
        q: query,
        countrycodes: 'ph',
        limit: '1',
        addressdetails: '1',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'DKMerchCheckout/1.0' },
      });
      const data = await res.json();
      if (data?.length > 0) {
        commitPin(parseFloat(data[0].lat), parseFloat(data[0].lon));
        setStatusText('Showing your filled address — drag pin to fine-tune');
        setGeocoding(false);
        return true;
      }
      setStatusText('Address not found on map — search below or tap to pin');
    } catch {
      setStatusText('Could not locate address — search or tap the map');
    }
    setGeocoding(false);
    return false;
  }, [commitPin]);

  // Init / tear down map when user opens pin panel
  useEffect(() => {
    if (!mapVisible) {
      if (mapInstanceRef.current) {
        try { mapInstanceRef.current.remove(); } catch { /* ignore */ }
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    if (mapInstanceRef.current || !mapRef.current || !leafletReady) return;
    try {
      const L = window.L;
      const startLat = savedCoords?.lat ?? 14.5995;
      const startLng = savedCoords?.lng ?? 120.9842;
      const startZoom = savedCoords ? 16 : 11;

      const map = L.map(mapRef.current, {
        zoomControl: true,
        tap: false,
        scrollWheelZoom: true,
        minZoom: 5,
        maxZoom: 19,
      }).setView([startLat, startLng], startZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const initWithinNCR = savedCoords ? isWithinNCR(savedCoords.lat, savedCoords.lng) : true;
      const marker = L.marker([startLat, startLng], {
        icon: makeIcon(initWithinNCR),
        draggable: true,
      })
        .addTo(map)
        .bindPopup('<strong>📍 Delivery pin</strong>');

      if (savedCoords) {
        checkAndNotifyNCR(savedCoords.lat, savedCoords.lng);
        marker.openPopup();
        setPinSet(true);
        setStatusText(initWithinNCR
          ? 'Showing your saved pin — drag to adjust'
          : '⚠️ Saved pin is outside NCR (LBC)'
        );
      }

      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        commitPin(lat, lng, { fly: false });
      });

      map.on('click', (e) => {
        commitPin(e.latlng.lat, e.latlng.lng, { fly: false });
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      setTimeout(async () => {
        map.invalidateSize();
        if (pendingFly.current) {
          const p = pendingFly.current;
          pendingFly.current = null;
          commitPin(p.lat, p.lng);
          return;
        }
        // Prefer plotting the address the user typed
        const plotted = await geocodeFilledAddress();
        if (!plotted && savedCoords) {
          commitPin(savedCoords.lat, savedCoords.lng);
        } else if (!plotted && !savedCoords) {
          setStatusText('Search a place below, or tap the map to pin');
        }
      }, 350);
    } catch (err) {
      console.error('Map init error:', err);
      setStatusText('Map failed to load. Check your connection and try again.');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVisible, leafletReady]);

  useEffect(() => () => {
    clearTimeout(suggestRef.current);
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch { /* ignore */ }
      mapInstanceRef.current = null;
      markerRef.current = null;
    }
  }, []);

  // While map is open, keep pin aligned with filled address fields
  useEffect(() => {
    if (!mapVisible || !mapInstanceRef.current) return;
    if (!(address || '').trim() && !(city || '').trim()) return;
    const t = setTimeout(() => { geocodeFilledAddress(); }, 800);
    return () => clearTimeout(t);
  }, [address, barangay, city, zipCode, mapVisible, geocodeFilledAddress]);

  const fetchPinSuggestions = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    try {
      const params = new URLSearchParams({
        format: 'json',
        q: `${query.trim()}, Philippines`,
        countrycodes: 'ph',
        limit: '6',
        addressdetails: '1',
      });
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'en', 'User-Agent': 'DKMerchCheckout/1.0' },
      });
      const data = await res.json();
      setSuggestions((data || []).map((d) => ({
        label: d.display_name,
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
      })));
      setShowSuggestions(true);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handlePinQueryChange = (val) => {
    setPinQuery(val);
    clearTimeout(suggestRef.current);
    suggestRef.current = setTimeout(() => fetchPinSuggestions(val), 400);
  };

  const handleSelectPinSuggestion = (s) => {
    setPinQuery(s.label);
    setSuggestions([]);
    setShowSuggestions(false);
    commitPin(s.lat, s.lng);
  };

  const handleField = (field, val) => {
    onFieldsChange({ address, barangay, city, zipCode, [field]: val });
  };

  const handleOpenPin = () => {
    setMapVisible(true);
  };

  const handleHidePin = () => {
    setMapVisible(false);
    setPinQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div className="address-map-picker">
      <div className="address-fields-grid">
        <div className="address-field address-field-full">
          <label>Street Address <span className="req">*</span></label>
          <input
            type="text"
            value={address || ''}
            onChange={(e) => handleField('address', e.target.value)}
            placeholder="House no., street name"
            autoComplete="street-address"
          />
        </div>

        <div className="address-field">
          <label>Barangay <span className="req">*</span></label>
          <input
            type="text"
            value={barangay || ''}
            onChange={(e) => handleField('barangay', e.target.value)}
            placeholder="Barangay"
            autoComplete="address-level3"
          />
        </div>

        <div className="address-field">
          <label>City / Municipality <span className="req">*</span></label>
          <input
            type="text"
            value={city || ''}
            onChange={(e) => handleField('city', e.target.value)}
            placeholder="City"
            autoComplete="address-level2"
          />
        </div>

        <div className="address-field address-field-full">
          <label>ZIP Code <span className="req">*</span></label>
          <input
            type="text"
            inputMode="numeric"
            value={zipCode || ''}
            onChange={(e) => handleField('zipCode', e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            placeholder="e.g. 1000"
            autoComplete="postal-code"
          />
        </div>
      </div>

      <div className="address-pin-optional">
        {!mapVisible ? (
          <button type="button" className="address-pin-btn" onClick={handleOpenPin}>
            <i className="fas fa-map-marker-alt"></i>
            <span>
              {pinSet || savedCoords ? 'Edit pin location' : 'Add pin location'}
              <small>Optional — helps riders find you</small>
            </span>
          </button>
        ) : (
          <button type="button" className="address-map-toggle-btn" onClick={handleHidePin} style={{ width: '100%', justifyContent: 'center' }}>
            <i className="fas fa-times"></i> Hide Map
          </button>
        )}
      </div>

      {mapVisible && (
        <div className="address-map-preview-wrap">
          <div className="address-map-preview-header">
            <i className={geocoding ? 'fas fa-spinner fa-spin' : 'fas fa-map-marked-alt'}></i>
            <span>{geocoding ? 'Locating your address…' : statusText}</span>
          </div>

          <div className="address-pin-search" style={{ position: 'relative' }}>
            <i className="fas fa-search address-pin-search-icon"></i>
            <input
              type="text"
              value={pinQuery}
              onChange={(e) => handlePinQueryChange(e.target.value)}
              onFocus={() => { if (suggestions.length) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Search place to pin (suggestions)"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <ul className="address-suggestions-list">
                {suggestions.map((s, i) => (
                  <li key={i} onMouseDown={() => handleSelectPinSuggestion(s)}>
                    <i className="fas fa-map-marker-alt" />
                    <span>
                      {s.label}
                      {!isWithinNCR(s.lat, s.lng) && (
                        <span style={{ display: 'block', fontSize: 11, color: '#b45309', fontWeight: 700, marginTop: 2 }}>
                          📦 Outside NCR — LBC Express
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div ref={mapRef} className="address-map-preview-container" />
          <div className="address-map-preview-hint">
            <i className="fas fa-hand-pointer"></i> Tap map or drag 📍 pin
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Optional</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SHIPPING BREAKDOWN ───────────────────────────────────────────────────────
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

// ─── OUTSIDE NCR → LBC BANNER ─────────────────────────────────────────────────
const LbcDeliveryBanner = () => (
  <div className="lbc-delivery-banner">
    <div className="lbc-delivery-icon">📦</div>
    <div className="lbc-delivery-body">
      <strong>Outside NCR — LBC Express delivery</strong>
      <p>
        This address is outside Metro Manila. Your order will ship via <strong>LBC Express</strong>.
        Shipping fee is <strong>not charged here</strong> — you and admin will arrange LBC shipping separately.
        Admin will send your <strong>LBC tracking / order ID</strong>; track it with the <strong>LBC Tracker</strong> on the Track page.
      </p>
    </div>
  </div>
);

// ─── MAIN CHECKOUT ────────────────────────────────────────────────────────────
const Checkout = () => {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, isAuthenticated, role } = useAuth();
  const { confirm }               = useConfirm();
  const { showNotification }      = useNotification();

  const collectionProducts = useCollectionProducts() || [];
  const regularProducts    = useProducts() || [];
  const preOrderProducts   = usePreOrderProducts() || [];
  const allProductsMap = new Map();
  [...collectionProducts, ...regularProducts, ...preOrderProducts].forEach(p => {
    allProductsMap.set(p._id?.toString(), p);
  });
  const products = Array.from(allProductsMap.values());

  const cartItems          = useCart();
  const createOrder        = useCreateOrder();
  const clearCart          = useClearCart();
  const removeFromCartById = useRemoveFromCartById();
  const updateProduct      = useUpdateProduct();

  const storeSettings    = useQuery(api.settings.getSettings);
  const hasStoreLocation = !!(storeSettings?.storeLat && storeSettings?.storeLng);
  const STORE_LAT        = storeSettings?.storeLat ?? 14.5995;
  const STORE_LNG        = storeSettings?.storeLng ?? 121.0;

  const savedProfile = useQuery(
    api.users.getProfile,
    user?._id || user?.id ? { userId: user?._id || user?.id } : 'skip'
  );
  const saveProfileMut           = useMutation(api.users.saveProfile);
  const sendPaymentReceivedEmail = useAction(api.sendEmail.sendPaymentReceivedEmail);
  const createPaymentLink        = useAction(api.payments.createPaymentLink);
  const markOrderPaid            = useMutation(api.payments.markOrderPaid);
  const latestAppUpdate          = useQuery(api.appUpdates.getLatestUpdate);
  const markTicketCheckedOutMut  = useMutation(api.rewards.markTicketCheckedOut);
  const saveProfile = (args) =>
    runWithFailover(saveProfileMut, args, {
      table: "users",
      mutation: "users:saveProfile",
      docKey: String(args?.userId || args?.id || ""),
      payload: args,
    });
  const markTicketCheckedOut = (args) =>
    runWithFailover(markTicketCheckedOutMut, args, {
      table: "rewardRedemptions",
      mutation: "rewards:markTicketCheckedOut",
      docKey: String(args?.ticketCode || ""),
      payload: args,
    });

  // ── Reward order state ────────────────────────────────────────────────────
  const [rewardOrder, setRewardOrder] = useState(location.state?.rewardOrder || null);

  // Only items explicitly selected (cart multi-pay) or Buy Now — never dump the whole cart
  const CHECKOUT_SEL_KEY = 'dk_checkout_selected';
  const CHECKOUT_BUYNOW_KEY = 'dk_checkout_buynow';

  const selectedCartIds = (() => {
    const fromState = location.state?.selectedCartIds;
    if (Array.isArray(fromState) && fromState.length) return fromState;
    try {
      const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_SEL_KEY) || 'null');
      return Array.isArray(saved) && saved.length ? saved : null;
    } catch {
      return null;
    }
  })();

  const buyNowFilter = (() => {
    const fromState = location.state?.buyNowProductId
      ? {
          productId: String(location.state.buyNowProductId),
          promoCode: location.state.buyNowPromoCode || null,
          item: location.state.buyNowItem || null,
        }
      : null;
    if (fromState) return fromState;
    try {
      return JSON.parse(sessionStorage.getItem(CHECKOUT_BUYNOW_KEY) || 'null');
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (Array.isArray(location.state?.selectedCartIds) && location.state.selectedCartIds.length) {
      sessionStorage.setItem(CHECKOUT_SEL_KEY, JSON.stringify(location.state.selectedCartIds));
      sessionStorage.removeItem(CHECKOUT_BUYNOW_KEY);
    }
    if (location.state?.buyNowProductId) {
      sessionStorage.setItem(CHECKOUT_BUYNOW_KEY, JSON.stringify({
        productId: String(location.state.buyNowProductId),
        promoCode: location.state.buyNowPromoCode || null,
        item: location.state.buyNowItem || null,
      }));
      if (!location.state?.selectedCartIds?.length) {
        sessionStorage.removeItem(CHECKOUT_SEL_KEY);
      }
    }
  }, [location.state]);

  const checkoutItems = (() => {
    if (rewardOrder) return [];
    if (selectedCartIds?.length) {
      const matched = cartItems.filter(i => selectedCartIds.includes(i._id));
      if (matched.length) return matched;
    }
    if (buyNowFilter?.productId) {
      const matched = cartItems.filter(i => {
        if (String(i.productId) !== String(buyNowFilter.productId)) return false;
        if (buyNowFilter.promoCode) return i.promoCode === buyNowFilter.promoCode;
        return !i.promoCode;
      });
      if (matched.length) return matched;
      if (buyNowFilter.item) {
        const qty = Math.max(1, Number(buyNowFilter.item.qty) || 1);
        return [{ ...buyNowFilter.item, qty }];
      }
    }
    return [];
  })();

  const [loading,           setLoading]           = useState(false);
  const [isEditingContact,  setIsEditingContact]  = useState(false);
  const [isEditingAddress,  setIsEditingAddress]  = useState(false);
  const [errors,            setErrors]            = useState({ phone: '' });
  const cartPromo = location.state?.appliedPromo || null;

  const [formData,      setFormData]      = useState({ fullName: '', email: '', phone: '', address: '', barangay: '', city: '', zipCode: '', notes: '' });
  const [savedContact,  setSavedContact]  = useState({ fullName: '', email: '', phone: '' });
  const [savedAddress,  setSavedAddress]  = useState({ address: '', barangay: '', city: '', zipCode: '' });
  const [addressCoords, setAddressCoords] = useState(null);
  const [savedCoords,   setSavedCoords]   = useState(null);
  const [isOutsideNCR,  setIsOutsideNCR]  = useState(false);

  // ── For reward orders, use 1 qty item for shipping calc ──────────────────
  const shippingCartItems = rewardOrder
    ? [{ qty: 1, productId: rewardOrder.productId }]
    : checkoutItems;

  const shippingInfo = addressCoords && !isOutsideNCR
    ? calcLalamoveShipping(STORE_LAT, STORE_LNG, addressCoords.lat, addressCoords.lng, shippingCartItems, products)
    : null;
  // LBC fee is arranged with admin — not charged at checkout payment
  const shippingFee = isOutsideNCR ? 0 : (shippingInfo?.fee ?? 0);
  const deliveryMethod = isOutsideNCR ? 'lbc' : 'rider';

  // ── Init form ─────────────────────────────────────────────────────────────
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
      barangay: profile?.barangay || '',
      city:     profile?.city     || '',
      zipCode:  profile?.zipCode  || '',
      notes:    '',
    };
    setFormData(init);
    setSavedContact({ fullName: init.fullName, email: init.email, phone: init.phone });
    setSavedAddress({ address: init.address, barangay: init.barangay, city: init.city, zipCode: init.zipCode });
    setIsEditingContact(!init.fullName || !init.email || !init.phone);
    setIsEditingAddress(!init.address || !init.barangay || !init.city || !init.zipCode);
    if (profile?.addressLat && profile?.addressLng) {
      const coords = { lat: profile.addressLat, lng: profile.addressLng };
      setSavedCoords(coords);
      setAddressCoords(coords);
      setIsOutsideNCR(!isWithinNCR(coords.lat, coords.lng));
    }
  }, [isAuthenticated, navigate, showNotification, user, savedProfile]);

  // ── Cart empty guard — skip for reward orders / wait briefly for Buy Now sync ─
  useEffect(() => {
    if (rewardOrder) return;
    if (products.length === 0) return;
    if (checkoutItems.length > 0) return;

    const hasIntent = !!(selectedCartIds?.length || buyNowFilter?.productId || buyNowFilter?.item);
    const delayMs = hasIntent ? 2500 : 0;
    const timer = setTimeout(() => {
      if (checkoutItems.length > 0) return;
      showNotification(
        hasIntent
          ? 'No items selected for checkout'
          : (cartItems.length === 0 ? 'Your cart is empty' : 'Select items from your cart to checkout'),
        'warning'
      );
      navigate(hasIntent || cartItems.length === 0 ? '/collections' : '/collections');
    }, delayMs);
    return () => clearTimeout(timer);
  }, [cartItems.length, checkoutItems.length, products.length, rewardOrder, selectedCartIds, buyNowFilter, navigate, showNotification]);

  const getProductById    = (id) => products.find(p => p._id?.toString() === id?.toString() || p.id === id);
  const getQty            = (item) => item.qty ?? item.quantity ?? 1;
  const getEffectivePrice = (item, product) => {
    if (item.finalPrice !== undefined && item.finalPrice !== null) return item.finalPrice;
    if (item.price      !== undefined && item.price      !== null) return item.price;
    return product?.price ?? 0;
  };

  // ── Subtotal: 0 for reward orders ────────────────────────────────────────
  const calculateSubtotal = () => {
    if (rewardOrder) return 0;
    return checkoutItems.reduce((total, item) => {
      const product = getProductById(item.productId || item.id);
      return total + getEffectivePrice(item, product) * getQty(item);
    }, 0);
  };

  const calculateTotalDiscount = () => {
    if (rewardOrder) return 0;
    return checkoutItems.reduce((total, item) => {
      if (!item.promoCode) return total;
      const product       = getProductById(item.productId || item.id);
      const originalPrice = product?.price ?? item.price ?? 0;
      const finalPrice    = item.finalPrice ?? originalPrice;
      return total + (originalPrice - finalPrice) * getQty(item);
    }, 0);
  };

  const subtotal      = calculateSubtotal();
  const totalDiscount = calculateTotalDiscount();
  const finalTotal    = subtotal + shippingFee;

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^\d*$/.test(cleaned))                          return 'Phone number must contain only numbers';
    if (cleaned.length > 0 && cleaned.length !== 11)     return 'Phone number must be exactly 11 digits';
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

  const handleAddressFieldsChange = (fields) => {
    setFormData((prev) => ({
      ...prev,
      address: fields.address ?? prev.address,
      barangay: fields.barangay ?? prev.barangay,
      city: fields.city ?? prev.city,
      zipCode: fields.zipCode ?? prev.zipCode,
    }));
  };

  const handleAddressSelect = ({ address, barangay, city, zipCode, lat, lng }) => {
    setFormData((prev) => ({
      ...prev,
      address: address ?? prev.address,
      barangay: barangay ?? prev.barangay,
      city: city ?? prev.city,
      zipCode: zipCode ?? prev.zipCode,
    }));
    if (lat != null && lng != null) setAddressCoords({ lat, lng });
  };

  const isContactComplete = () =>
    savedContact.fullName.trim() && savedContact.email.trim() &&
    savedContact.phone.trim() && !validatePhone(savedContact.phone);

  const isAddressComplete = () =>
    savedAddress.address.trim() &&
    savedAddress.barangay.trim() &&
    savedAddress.city.trim() &&
    savedAddress.zipCode.trim();

  const isFormReady = () =>
    isContactComplete() && isAddressComplete() && !isEditingContact && !isEditingAddress;

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
        address: savedAddress.address,
        barangay: savedAddress.barangay,
        city: savedAddress.city,
        zipCode: savedAddress.zipCode,
      });
      showNotification('Contact information saved!', 'success');
    } catch { showNotification('Contact saved locally', 'success'); }
  };

  const handleSaveAddress = async () => {
    if (!formData.address.trim()) { showNotification('Please enter your street address', 'error'); return; }
    if (!formData.barangay.trim()) { showNotification('Please enter your barangay', 'error'); return; }
    if (!formData.city.trim()) { showNotification('Please enter your city', 'error'); return; }
    if (!formData.zipCode.trim()) { showNotification('Please enter your ZIP code', 'error'); return; }
    setSavedAddress({
      address: formData.address,
      barangay: formData.barangay,
      city: formData.city,
      zipCode: formData.zipCode,
    });
    setIsEditingAddress(false);
    try {
      await saveProfile({
        userId: user?._id || user?.id,
        fullName: savedContact.fullName, email: savedContact.email, phone: savedContact.phone,
        address: formData.address,
        barangay: formData.barangay,
        city: formData.city,
        zipCode: formData.zipCode,
        ...(addressCoords ? { addressLat: addressCoords.lat, addressLng: addressCoords.lng } : {}),
      });
      showNotification(
        addressCoords && isOutsideNCR
          ? 'Address saved — this order will ship via LBC Express.'
          : 'Shipping address saved!',
        'success'
      );
    } catch { showNotification('Address saved locally', 'success'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormReady()) {
      showNotification('Please fill in and save all required fields', 'error');
      if (!isContactComplete()) setIsEditingContact(true);
      if (!isAddressComplete()) setIsEditingAddress(true);
      return;
    }
    // Require latest app version before payment
    if (latestAppUpdate?.isActive && latestAppUpdate.version && isAppOutdated(latestAppUpdate.version)) {
      showNotification('Please update the app before payment.', 'warning');
      navigate(
        {
          pathname: '/checkout',
          search: `?appUpdate=${encodeURIComponent(latestAppUpdate.version)}`,
        },
        { replace: true }
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!rewardOrder && products.length === 0) {
      showNotification('Products are still loading. Please wait a moment and try again.', 'warning');
      return;
    }
    // Stock check — skip for reward orders
    if (!rewardOrder) {
      for (const item of checkoutItems) {
        const product = getProductById(item.productId || item.id);
        if (!product) continue;
        if (product.stock !== undefined && product.stock < getQty(item)) {
          showNotification(`Insufficient stock for ${product.name}. Available: ${product.stock}`, 'error');
          return;
        }
      }
    }

    const isZeroPay = Number(finalTotal || 0) <= 0;
    const payOk = await confirm({
      title: isZeroPay ? 'Place free order?' : 'Proceed to payment?',
      message: isZeroPay
        ? `Place this order?\n\nTotal: ₱0\n${isOutsideNCR ? 'LBC shipping will be arranged with admin separately.' : ''}`
        : `Place this order and continue to PayMongo (GCash / Maya)?\n\nTotal: ₱${Number(finalTotal || 0).toLocaleString('en-PH')}${isOutsideNCR ? '\n(LBC shipping not included — arrange with admin)' : ''}`,
      confirmLabel: isZeroPay ? 'Place Order' : 'Pay Now',
      cancelLabel: 'Cancel',
      variant: 'primary',
      icon: isZeroPay ? 'fa-gift' : 'fa-credit-card',
      rememberKey: 'dk_skip_checkout_pay_confirm',
      rememberLabel: 'Do not show again',
    });
    if (!payOk) return;

    setLoading(true);

    try {
      const orderId  = `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const shipping = shippingFee;

      // ── Build order items ───────────────────────────────────────────────
      const orderItems = rewardOrder
        ? [{
            id:          rewardOrder.productId,
            name:        rewardOrder.productName,
            price:       0,           // FREE — reward item
            image:       rewardOrder.productImage,
            quantity:    1,
            isPreOrder:  false,
            releaseDate: null,
          }]
        : checkoutItems.map(item => {
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

      const originalSubtotal = rewardOrder
        ? 0
        : checkoutItems.reduce((total, item) => {
            const product = getProductById(item.productId || item.id);
            return total + (product?.price ?? 0) * getQty(item);
          }, 0);

      const promoItem = rewardOrder ? null : checkoutItems.find(i => i.promoCode);

      const addressParts = [savedAddress.address];
      if (savedAddress.barangay) addressParts.push(`Brgy. ${savedAddress.barangay}`);
      if (savedAddress.city)    addressParts.push(savedAddress.city);
      if (savedAddress.zipCode) addressParts.push(savedAddress.zipCode);
      const shippingAddressStr = addressParts.join(', ');

      const createResult = await createOrder({
        orderId,
        email:           savedContact.email,
        customerName:    savedContact.fullName,
        phone:           savedContact.phone,
        items:           orderItems,
        total:           originalSubtotal + shipping,
        subtotal:        originalSubtotal,
        shippingFee:     shipping,
        finalTotal,
        ...(totalDiscount > 0 && promoItem && {
          promoCode:       promoItem.promoCode,
          discountAmount:  totalDiscount,
          discountPercent: promoItem.promoDiscount,
        }),
        status:          'Pending Payment',
        orderStatus:     'pending',
        shippingAddress: shippingAddressStr,
        ...(addressCoords ? { addressLat: addressCoords.lat, addressLng: addressCoords.lng } : {}),
        deliveryMethod,
        paymentMethod:   'paymongo',
        notes:           formData.notes || '',
        paymentStatus:   'pending',
        // ── Reward order fields ──
        ...(rewardOrder && {
          isRewardOrder:    true,
          rewardTicketCode: rewardOrder.ticketCode,
        }),
      });
      const usedFailover = !!createResult?.failover;

      // ── Mark ticket as checked out ─────────────────────────────────────
      if (rewardOrder) {
        try {
          await markTicketCheckedOut({
            ticketCode:        rewardOrder.ticketCode,
            checkedOutOrderId: orderId,
          });
        } catch (e) { console.warn('markTicketCheckedOut failed:', e); }
      }

      // ── ₱0 total (e.g. free reward + LBC arranged offline) — skip PayMongo ──
      if (Number(finalTotal || 0) <= 0) {
        try {
          await markOrderPaid({ orderId, paymentMethod: 'free' });
        } catch (e) {
          console.warn('markOrderPaid failed for free order:', e);
        }
        showNotification(
          isOutsideNCR
            ? 'Order placed! Arrange LBC shipping with admin.'
            : 'Order placed successfully!',
          'success'
        );
        setLoading(false);
        navigate(`/order-success?orderId=${encodeURIComponent(orderId)}`);
        return;
      }

      // ── Payment link — PayMongo hosted checkout (GCash / Maya picker) ───
      let paymentLinkUrl;
      const payDescription = rewardOrder
        ? `DKMerch Reward Order ${orderId} (Ticket: ${rewardOrder.ticketCode})`
        : `DKMerch Order ${orderId}${promoItem ? ` (Promo: ${promoItem.promoCode})` : ''}`;
      // Remember who paid so "Back to merchant" returns to their home — not the wrong role UI
      const origin = window.location.origin;
      const payerHome =
        role === 'admin' ? '/admin' :
        role === 'rider' ? '/rider' :
        '/';
      try {
        sessionStorage.setItem('dk_post_payment_home', payerHome);
        sessionStorage.setItem('dk_post_payment_order', orderId);
        sessionStorage.setItem('dk_post_payment_role', role || 'user');
      } catch { /* ignore */ }

      const payArgs = {
        orderId,
        amount:        finalTotal,
        description:   payDescription,
        customerName:  savedContact.fullName,
        customerEmail: savedContact.email,
        customerPhone: savedContact.phone,
        // Always land on order-success first (to verify payment), then page routes by role
        successUrl: `${origin}/order-success?orderId=${encodeURIComponent(orderId)}`,
        cancelUrl:  role === 'admin' || role === 'rider'
          ? `${origin}${payerHome}`
          : `${origin}/checkout`,
      };

      try {
        if (usedFailover && isFailoverPayConfigured()) {
          // Convex already down — go straight to Firebase Cloud Function
          const result = await failoverCheckoutAssist({ ...payArgs, sendEmail: true });
          paymentLinkUrl = result.paymentLinkUrl;
        } else {
          const result = await createPaymentLink(payArgs);
          paymentLinkUrl = result.paymentLinkUrl;
        }
      } catch (payError) {
        console.error('PayMongo error:', payError);
        // Convex pay failed — try Cloud Function fallback if configured
        if (isFailoverPayConfigured()) {
          try {
            const result = await failoverCheckoutAssist({ ...payArgs, sendEmail: true });
            paymentLinkUrl = result.paymentLinkUrl;
          } catch (fnErr) {
            console.error('Failover pay/email error:', fnErr);
            setLoading(false);
            if (usedFailover) {
              showNotification(
                `Order ${orderId} was saved offline, but payment setup failed. Try again later or contact support.`,
                'warning'
              );
              navigate(`/track-order?orderId=${encodeURIComponent(orderId)}`);
              return;
            }
            showNotification('Payment setup failed. Please try again or contact support.', 'error');
            return;
          }
        } else {
          setLoading(false);
          if (usedFailover) {
            showNotification(
              `Order ${orderId} was saved while offline. Configure failover Cloud Functions to enable live payment.`,
              'warning'
            );
            navigate(`/track-order?orderId=${encodeURIComponent(orderId)}`);
            return;
          }
          showNotification('Payment setup failed. Please try again or contact support.', 'error');
          return;
        }
      }

      // ── Stock update — skip for reward orders ──────────────────────────
      if (!rewardOrder) {
        for (const item of checkoutItems) {
          const product = getProductById(item.productId || item.id);
          if (product) {
            try {
              await updateProduct({ id: product._id, stock: product.stock - getQty(item) });
            } catch (stockErr) {
              console.warn('Stock update failed for', product.name, stockErr);
            }
          }
        }
      }

      // ── Save profile coords ────────────────────────────────────────────
      if (addressCoords) {
        try {
          await saveProfile({
            userId:   user?._id || user?.id,
            fullName: savedContact.fullName,
            email:    savedContact.email,
            phone:    savedContact.phone,
            address:  savedAddress.address,
            barangay: savedAddress.barangay,
            city:     savedAddress.city,
            zipCode:  savedAddress.zipCode,
            addressLat: addressCoords.lat,
            addressLng: addressCoords.lng,
          });
        } catch { /* non-critical */ }
      }

      // ── Send email (skip if failover FN already emailed pay-now link) ──
      if (!usedFailover) {
        try {
          await sendPaymentReceivedEmail({
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
      }

      // ── Remove checked-out items only (keep unselected in cart) ────────
      if (!rewardOrder) {
        const idsToRemove = selectedCartIds?.length
          ? selectedCartIds
          : checkoutItems.map(i => i._id).filter(Boolean);
        if (idsToRemove.length) {
          for (const id of idsToRemove) {
            try { await removeFromCartById(id); } catch { /* non-critical */ }
          }
        } else {
          await clearCart();
        }
      }

      try {
        sessionStorage.removeItem(CHECKOUT_SEL_KEY);
        sessionStorage.removeItem(CHECKOUT_BUYNOW_KEY);
      } catch { /* ignore */ }

      setLoading(false);
      window.location.href = paymentLinkUrl;

    } catch (error) {
      setLoading(false);
      showNotification('Error placing order. Please try again.', 'error');
      console.error('Order error:', error);
    }
  };

  const promoCartItems    = rewardOrder ? [] : checkoutItems.filter(i => !!i.promoCode);
  const nonPromoCartItems = rewardOrder ? [] : checkoutItems.filter(i => !i.promoCode);

  const renderSummaryItem = (item) => {
    const product = getProductById(item.productId || item.id);
    if (!product) return null;
    const qty            = getQty(item);
    const hasPromo       = !!item.promoCode;
    const effectivePrice = getEffectivePrice(item, product);
    const itemTotal      = effectivePrice * qty;
    const originalTotal  = product.price * qty;
    return (
      <div
        key={item._id || `${item.productId}-${item.promoCode || 'nopromo'}`}
        className={`summary-item${hasPromo ? ' summary-item-promo' : ''}`}
      >
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
                  <div className="section-header-main">
                    <h2>Contact Information</h2>
                    <div className="section-header-badges">
                      {isContactComplete() && !isEditingContact && (
                        <span className="section-complete-badge"><i className="fas fa-check-circle"></i> Saved</span>
                      )}
                    </div>
                  </div>
                  {!isEditingContact
                    ? <button type="button" className="edit-info-btn" onClick={() => setIsEditingContact(true)}><i className="fas fa-pen"></i> Edit</button>
                    : <button type="button" className="save-info-btn" onClick={handleSaveContact}><i className="fas fa-check"></i> Save</button>
                  }
                </div>
                {!isEditingContact ? (
                  <div className="info-display-grid">
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-user"></i> Full Name</span>
                      <span className="info-value">{savedContact.fullName || <span className="info-missing">Not set — click Edit</span>}</span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-envelope"></i> Email</span>
                      <span className="info-value">{savedContact.email || <span className="info-missing">Not set — click Edit</span>}</span>
                    </div>
                    <div className="info-display-item info-display-full">
                      <span className="info-label"><i className="fas fa-phone"></i> Phone Number</span>
                      <span className="info-value">{savedContact.phone || <span className="info-missing">Not set — click Edit</span>}</span>
                    </div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input type="text" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Juan Dela Cruz" />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="juan@example.com" />
                    </div>
                    <div className="form-group full-width">
                      <label>Phone Number</label>
                      <input
                        type="tel" name="phone" value={formData.phone} onChange={handleChange}
                        placeholder="09XXXXXXXXX" maxLength="11"
                        className={errors.phone ? 'input-error' : ''}
                      />
                      {errors.phone && <span className="error-message"><i className="fas fa-exclamation-circle"></i> {errors.phone}</span>}
                      {!errors.phone && formData.phone?.length === 11 && (
                        <span className="success-message"><i className="fas fa-check-circle"></i> Valid phone number</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Shipping Address ── */}
              <div className="checkout-section">
                <div className="section-header">
                  <div className="section-header-main">
                    <h2>Shipping Address</h2>
                    <div className="section-header-badges">
                      {isAddressComplete() && !isEditingAddress && (
                        <span className="section-complete-badge"><i className="fas fa-check-circle"></i> Saved</span>
                      )}
                    </div>
                  </div>
                  {!isEditingAddress
                    ? <button type="button" className="edit-info-btn" onClick={() => setIsEditingAddress(true)}><i className="fas fa-pen"></i> Edit</button>
                    : <button type="button" className="save-info-btn" onClick={handleSaveAddress}>
                        <i className="fas fa-check"></i> Save
                      </button>
                  }
                </div>

                {!isEditingAddress ? (
                  <div className="info-display-grid">
                    <div className="info-display-item info-display-full">
                      <span className="info-label"><i className="fas fa-map-marker-alt"></i> Street Address</span>
                      <span className="info-value">{savedAddress.address || <span className="info-missing">Not set — click Edit</span>}</span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label">Barangay</span>
                      <span className="info-value">{savedAddress.barangay || <span className="info-missing">—</span>}</span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label">City</span>
                      <span className="info-value">{savedAddress.city || <span className="info-missing">—</span>}</span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label">ZIP Code</span>
                      <span className="info-value">{savedAddress.zipCode || <span className="info-missing">—</span>}</span>
                    </div>
                    {isAddressComplete() && addressCoords && isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ padding: 0, background: 'transparent', border: 'none' }}>
                        <LbcDeliveryBanner />
                      </div>
                    )}
                    {shippingInfo && !isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ padding: 0, background: 'transparent', border: 'none' }}>
                        <ShippingBreakdown shippingInfo={shippingInfo} isEstimate={!hasStoreLocation} />
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
                    {addressCoords && isOutsideNCR && (
                      <div className="info-display-item info-display-full" style={{ background: '#fff7ed', borderColor: '#fdba74' }}>
                        <span className="info-label" style={{ color: '#9a3412' }}><i className="fas fa-map-marker-alt"></i> Map Pin</span>
                        <span className="info-value" style={{ fontSize: '13px', color: '#9a3412' }}>
                          <i className="fas fa-check-circle" style={{ color: '#ea580c', marginRight: '6px' }}></i>
                          Location saved — package will ship via LBC Express
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Delivery Address</label>
                      <AddressMapPicker
                        address={formData.address}
                        barangay={formData.barangay}
                        city={formData.city}
                        zipCode={formData.zipCode}
                        onFieldsChange={handleAddressFieldsChange}
                        onSelectSuggestion={handleAddressSelect}
                        savedCoords={savedCoords}
                        onNCRViolation={setIsOutsideNCR}
                      />
                    </div>
                    {addressCoords && !isOutsideNCR && (() => {
                      const preview = calcLalamoveShipping(STORE_LAT, STORE_LNG, addressCoords.lat, addressCoords.lng, shippingCartItems, products);
                      return preview ? (
                        <div className="form-group full-width">
                          <ShippingBreakdown shippingInfo={preview} isEstimate={!hasStoreLocation} />
                        </div>
                      ) : null;
                    })()}
                    {addressCoords && isOutsideNCR && (
                      <div className="form-group full-width">
                        <LbcDeliveryBanner />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Promo Applied (regular orders only) ── */}
              {!rewardOrder && totalDiscount > 0 && (
                <div className="checkout-section">
                  <h2>Promo Applied</h2>
                  <div className="promo-applied-checkout">
                    <div className="promo-applied-left">
                      <span className="promo-applied-icon">🎉</span>
                      <div>
                        <span className="promo-applied-code">{checkoutItems.find(i => i.promoCode)?.promoCode}</span>
                        <span className="promo-applied-desc">
                          {checkoutItems.find(i => i.promoCode)?.promoDiscount}% off applied on promo items ·{' '}
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
                {rewardOrder && (
                  <div className="reward-payment-notice">
                    <i className="fas fa-gift"></i>
                    <span>
                      {isOutsideNCR
                        ? <>Your reward item is <strong>FREE</strong> — LBC shipping will be arranged with admin (not charged here).</>
                        : <>Your reward item is <strong>FREE</strong> — you only pay for the shipping fee.</>
                      }
                    </span>
                  </div>
                )}
                <div className="payment-info-notice" style={{ marginTop: rewardOrder ? '12px' : '0' }}>
                  <i className="fas fa-shield-alt"></i>
                  <span>You will be redirected to a secure <strong>PayMongo</strong> page where you can choose to pay via <strong>GCash</strong> or <strong>Maya</strong>.</span>
                </div>
                <div className="payment-brands-row" style={{ display: 'flex', gap: '12px', marginTop: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="payment-icon-wrap payment-icon-gcash" style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 0 }}>
                    <img src="/images/payments/gcash.svg" alt="GCash" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>GCash</span>
                  <div className="payment-icon-wrap payment-icon-paymaya" style={{ width: '40px', height: '40px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: '8px', overflow: 'hidden', padding: 0 }}>
                    <img src="/images/payments/maya.svg" alt="Maya" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>Maya</span>
                </div>
              </div>

              {/* ── Order Notes ── */}
              <div className="checkout-section">
                <h2>Order Notes <span className="notes-optional">(Optional)</span></h2>
                <textarea
                  name="notes"
                  className="order-notes-box"
                  value={formData.notes}
                  rows={3}
                  maxLength={500}
                  placeholder="Any special instructions for your order..."
                  onChange={(e) => {
                    handleChange(e);
                    const el = e.target;
                    // Grow only when text needs more than the base box (chat-style)
                    el.style.height = '72px';
                    if (el.scrollHeight > 72) {
                      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
                    }
                  }}
                />
              </div>
            </div>

            {/* ── Order Summary ── */}
            <div className="order-summary">
              <div className="summary-card">
                <h2>Order Summary</h2>

                <div className="summary-items">
                  {/* ── Reward order item ── */}
                  {rewardOrder && (
                    <>
                      <div className="reward-order-banner">
                        <div className="reward-order-banner-icon">🎁</div>
                        <div>
                          <strong>Reward Redemption</strong>
                          <p>
                            {isOutsideNCR
                              ? 'Item is free — LBC shipping arranged with admin.'
                              : 'This item is free — you only pay for shipping.'}
                          </p>
                        </div>
                      </div>
                      <div className="summary-item summary-item-reward">
                        <img src={rewardOrder.productImage} alt={rewardOrder.productName} />
                        <div className="item-details">
                          <p className="item-name">
                            {rewardOrder.productName}
                            <span className="item-reward-tag">
                              <i className="fas fa-gift"></i> FREE REWARD
                            </span>
                          </p>
                          {rewardOrder.productGroup && (
                            <p className="item-meta">{rewardOrder.productGroup}</p>
                          )}
                          <p className="item-qty">Qty: 1</p>
                          <p style={{ fontSize: '10px', color: '#9ca3af', fontFamily: 'Courier New', letterSpacing: '1px', marginTop: '2px' }}>
                            {rewardOrder.ticketCode}
                          </p>
                        </div>
                        <div className="item-price-col">
                          <div className="item-price item-price-free">FREE</div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Regular cart items ── */}
                  {!rewardOrder && (
                    <>
                      {nonPromoCartItems.length > 0 && (
                        <>
                          {promoCartItems.length > 0 && (
                            <div className="summary-group-label"><i className="fas fa-shopping-bag"></i> Regular Items</div>
                          )}
                          {nonPromoCartItems.map(item => renderSummaryItem(item))}
                        </>
                      )}
                      {promoCartItems.length > 0 && (
                        <>
                          <div className="summary-group-label summary-group-label-promo"><i className="fas fa-tag"></i> Promo Items</div>
                          {promoCartItems.map(item => renderSummaryItem(item))}
                        </>
                      )}
                    </>
                  )}
                </div>

                <div className="summary-divider"></div>

                <div className="summary-totals">
                  {/* Regular order discount row */}
                  {!rewardOrder && totalDiscount > 0 && (
                    <div className="summary-row summary-row-original">
                      <span>Original Price</span>
                      <span className="summary-strikethrough">₱{(subtotal + totalDiscount).toLocaleString()}</span>
                    </div>
                  )}

                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>
                      {rewardOrder
                        ? <span style={{ color: '#16a34a', fontWeight: 800 }}>FREE</span>
                        : `₱${subtotal.toLocaleString()}`
                      }
                    </span>
                  </div>

                  <div className="summary-row">
                    <span>
                      <i className={`fas ${isOutsideNCR ? 'fa-truck' : 'fa-motorcycle'}`} style={{ marginRight: '6px', color: isOutsideNCR ? '#ea580c' : '#fc1268' }}></i>
                      Shipping
                      {shippingInfo && !isOutsideNCR && (
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400, marginLeft: '4px' }}>
                          (~{shippingInfo.km} km · {shippingInfo.totalQty} item{shippingInfo.totalQty > 1 ? 's' : ''})
                        </span>
                      )}
                      {isOutsideNCR && (
                        <span style={{ fontSize: '11px', color: '#ea580c', fontWeight: 700, marginLeft: '4px' }}>
                          · LBC (arrange with admin)
                        </span>
                      )}
                    </span>
                    <span>
                      {isOutsideNCR
                        ? <strong style={{ color: '#9a3412' }}>Not included</strong>
                        : shippingInfo
                          ? <strong style={{ color: '#1e293b' }}>₱{shippingInfo.fee.toLocaleString()}</strong>
                          : <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                              Add pin to estimate
                            </span>
                      }
                    </span>
                  </div>

                  {!rewardOrder && totalDiscount > 0 && (
                    <div className="summary-row promo-discount-row">
                      <span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo Discount</span>
                      <span className="promo-discount-amount">−₱{totalDiscount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="summary-row total">
                    <span>Total</span>
                    <span>₱{finalTotal.toLocaleString()}</span>
                  </div>

                  {rewardOrder && shippingInfo && !isOutsideNCR && (
                    <div className="reward-shipping-note">
                      <i className="fas fa-info-circle"></i>
                      Item is free — total is shipping only.
                    </div>
                  )}

                  {rewardOrder && isOutsideNCR && addressCoords && (
                    <div className="reward-shipping-note">
                      <i className="fas fa-info-circle"></i>
                      Item is free — LBC shipping fee will be arranged with admin.
                    </div>
                  )}

                  {!rewardOrder && totalDiscount > 0 && (
                    <div className="promo-savings-checkout">
                      <i className="fas fa-piggy-bank"></i>
                      You're saving <strong>₱{totalDiscount.toLocaleString()}</strong> with your promo!
                    </div>
                  )}
                </div>

                {isOutsideNCR && (
                  <div className="lbc-summary-block">
                    <i className="fas fa-truck"></i>
                    <span>
                      Outside NCR → <strong>LBC Express</strong>. Shipping fee is not in this payment —
                      arrange with admin. Tracking ID will be sent after shipping.
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  className={`btn btn-primary btn-checkout${(!isFormReady() || loading) ? ' btn-checkout-disabled' : ''}`}
                  disabled={loading || !isFormReady()}
                >
                  {loading
                    ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                    : !isFormReady()
                      ? <><i className="fas fa-lock"></i> Complete Your Info First</>
                      : Number(finalTotal || 0) <= 0
                        ? <><i className="fas fa-gift"></i> Place Free Order</>
                        : isOutsideNCR
                          ? <><i className="fas fa-truck"></i> Pay Order</>
                          : <>Pay</>
                  }
                </button>

                {!isFormReady() && !loading && (
                  <p className="form-incomplete-hint">
                    <i className="fas fa-exclamation-circle"></i>{' '}
                    {isEditingContact ? 'Click "Save" on Contact Information to continue.'
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
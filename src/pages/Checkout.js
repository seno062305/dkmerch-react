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

const calcShipping = (totalPcs) => {
  if (totalPcs === 0) return 0;
  if (totalPcs >= 10) return 0;
  return 10 + totalPcs * 10;
};

const AddressMapPicker = ({ value, onChange, onSelectSuggestion, savedCoords }) => {
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
        if (markerRef.current && mapInstanceRef.current) {
          markerRef.current.setLatLng([lat, lng]);
          markerRef.current.getPopup()?.setContent(
            `<div style="font-size:12px;max-width:200px"><strong>📍 Delivery Address</strong><br><small>${addr}</small></div>`
          );
          markerRef.current.openPopup();
          mapInstanceRef.current.flyTo([lat, lng], 17, { animate: true, duration: 0.8 });
          onSelectSuggestion({ address: addr, lat, lng });
        }
        setStatusText('Pin your exact location — drag the marker to adjust');
      } else {
        setStatusText('Address not found. Drag the pin to set location manually.');
      }
    } catch {
      setStatusText('Could not locate address. Drag the pin to set location.');
    }
    setGeocoding(false);
  }, [onSelectSuggestion]);

  useEffect(() => {
    if (!mapVisible || mapInstanceRef.current || !mapRef.current || !leafletReady) return;
    try {
      const L = window.L;
      const startLat  = savedCoords?.lat ?? 14.5995;
      const startLng  = savedCoords?.lng ?? 120.9842;
      const startZoom = savedCoords ? 17 : 13;

      const map = L.map(mapRef.current, {
        zoomControl    : true,
        tap            : false,
        scrollWheelZoom: false,
      }).setView([startLat, startLng], startZoom);

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye',
        maxZoom: 19,
      }).addTo(map);

      // ✅ Labels overlay
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.85,
      }).addTo(map);

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:36px;height:36px;background:#fc1268;border-radius:50% 50% 50% 0;
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
        onSelectSuggestion({ address: value || '', lat: startLat, lng: startLng });
        setStatusText('📍 Showing your last saved location — drag the pin to adjust');
      }

      marker.on('dragend', async () => {
        const { lat, lng } = marker.getLatLng();
        setGeocoding(true);
        setStatusText('Getting address for this location…');
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
            { headers: { 'Accept-Language': 'en' } }
          );
          const data = await res.json();
          const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          onChange(addr);
          onSelectSuggestion({ address: addr, lat, lng });
          marker.getPopup()?.setContent(
            `<div style="font-size:12px;max-width:200px"><strong>📍 Delivery Address</strong><br><small>${addr}</small></div>`
          );
          marker.openPopup();
          setStatusText('Pin your exact location — drag the marker to adjust');
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
      })));
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 500);
  };

  const handleSelectSuggestion = (s) => {
    onChange(s.address);
    setSuggestions([]);
    setShowSuggestions(false);
    if (!mapVisible) {
      pendingGeocode.current = s.address;
      setMapVisible(true);
    } else {
      if (mapInstanceRef.current && markerRef.current) {
        markerRef.current.setLatLng([s.lat, s.lng]);
        markerRef.current.getPopup()?.setContent(
          `<div style="font-size:12px;max-width:200px"><strong>📍 Delivery Address</strong><br><small>${s.address}</small></div>`
        );
        markerRef.current.openPopup();
        mapInstanceRef.current.flyTo([s.lat, s.lng], 17, { animate: true, duration: 0.8 });
        onSelectSuggestion({ address: s.address, lat: s.lat, lng: s.lng });
        setStatusText('Pin your exact location — drag the marker to adjust');
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
            {suggestions.map((s, i) => (
              <li key={i} onMouseDown={() => handleSelectSuggestion(s)}>
                <i className="fas fa-map-marker-alt"></i>
                <span>{s.label}</span>
              </li>
            ))}
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
          </div>
        </div>
      )}
    </div>
  );
};

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
  const [errors, setErrors]                     = useState({ phone: '', zipCode: '' });
  const cartPromo = location.state?.appliedPromo || null;

  const [formData, setFormData] = useState({ fullName: '', email: '', phone: '', address: '', city: '', zipCode: '', notes: '' });
  const [savedContact, setSavedContact] = useState({ fullName: '', email: '', phone: '' });
  const [savedAddress, setSavedAddress] = useState({ address: '', city: '', zipCode: '' });
  const [addressCoords, setAddressCoords] = useState(null);
  const [savedCoords, setSavedCoords]     = useState(null);

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
    setIsEditingAddress(!init.address  || !init.city  || !init.zipCode);
    if (profile?.addressLat && profile?.addressLng) {
      const coords = { lat: profile.addressLat, lng: profile.addressLng };
      setSavedCoords(coords);
      setAddressCoords(coords);
    }
  }, [isAuthenticated, navigate, showNotification, user, savedProfile]);

  useEffect(() => {
    if (cartItems.length === 0 && products.length > 0) {
      showNotification('Your cart is empty', 'warning');
      navigate('/collections');
    }
  }, [cartItems.length, products.length]);

  const getProductById   = (id) => products.find(p => p._id?.toString() === id?.toString() || p.id === id);
  const getQty           = (item) => item.qty ?? item.quantity ?? 1;
  const getTotalPcs      = () => cartItems.reduce((sum, item) => sum + getQty(item), 0);
  const getEffectivePrice = (item, product) => {
    if (item.finalPrice !== undefined && item.finalPrice !== null) return item.finalPrice;
    if (item.price !== undefined && item.price !== null) return item.price;
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
  const shippingFee   = calcShipping(getTotalPcs());
  const totalDiscount = calculateTotalDiscount();
  const finalTotal    = subtotal + shippingFee;

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^\d*$/.test(cleaned)) return 'Phone number must contain only numbers';
    if (cleaned.length > 0 && cleaned.length !== 11) return 'Phone number must be exactly 11 digits';
    if (cleaned.length === 11 && !cleaned.startsWith('09')) return 'Phone number must start with 09';
    return '';
  };
  const validateZipCode = (zipCode) => {
    const cleaned = zipCode.replace(/\s/g, '');
    if (!/^\d*$/.test(cleaned)) return 'Zip code must contain only numbers';
    if (cleaned.length > 0 && cleaned.length !== 4) return 'Zip code must be exactly 4 digits';
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
    if (name === 'zipCode') {
      const cleaned = value.replace(/\D/g, '').slice(0, 4);
      setFormData(prev => ({ ...prev, [name]: cleaned }));
      setErrors(prev => ({ ...prev, zipCode: validateZipCode(cleaned) }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAddressChange  = (val) => setFormData(prev => ({ ...prev, address: val }));
  const handleAddressSelect  = ({ address, lat, lng }) => {
    setFormData(prev => ({ ...prev, address }));
    setAddressCoords({ lat, lng });
  };

  const isContactComplete = () =>
    savedContact.fullName.trim() && savedContact.email.trim() &&
    savedContact.phone.trim() && !validatePhone(savedContact.phone);
  const isAddressComplete = () =>
    savedAddress.address.trim() && savedAddress.city.trim() &&
    savedAddress.zipCode.trim() && !validateZipCode(savedAddress.zipCode);
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
        address: savedAddress.address, city: savedAddress.city, zipCode: savedAddress.zipCode,
      });
      showNotification('Contact information saved!', 'success');
    } catch { showNotification('Contact saved locally', 'success'); }
  };

  const handleSaveAddress = async () => {
    if (!formData.address.trim()) { showNotification('Please enter your street address', 'error'); return; }
    if (!formData.city.trim())    { showNotification('Please enter your city', 'error'); return; }
    const zipErr = validateZipCode(formData.zipCode);
    if (zipErr) { setErrors(prev => ({ ...prev, zipCode: zipErr })); return; }
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
    if (!isFormReady()) {
      showNotification('Please fill in and save all required fields', 'error');
      if (!isContactComplete()) setIsEditingContact(true);
      if (!isAddressComplete()) setIsEditingAddress(true);
      return;
    }
    if (products.length === 0) {
      setLoading(false);
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
      for (const item of cartItems) {
        const product = getProductById(item.productId || item.id);
        if (product) await updateProduct({ id: product._id, stock: product.stock - getQty(item) });
      }
      const orderId  = `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const shipping = calcShipping(getTotalPcs());
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
        shippingAddress: `${savedAddress.address}, ${savedAddress.city} ${savedAddress.zipCode}`,
        ...(addressCoords ? { addressLat: addressCoords.lat, addressLng: addressCoords.lng } : {}),
        paymentMethod:   'paymongo',
        notes:           formData.notes || '',
        paymentStatus:   'pending',
      });
      if (addressCoords) {
        try {
          await saveProfile({
            userId: user?._id || user?.id,
            fullName: savedContact.fullName, email: savedContact.email, phone: savedContact.phone,
            address: savedAddress.address, city: savedAddress.city, zipCode: savedAddress.zipCode,
            addressLat: addressCoords.lat, addressLng: addressCoords.lng,
          });
        } catch { }
      }
      let paymentLinkUrl;
      try {
        const result = await createPaymentLink({
          orderId, amount: finalTotal,
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
      try {
        await sendOrderConfirmation({
          to:   savedContact.email,
          name: savedContact.fullName,
          orderId,
          items: orderItems.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
          total:          originalSubtotal + shipping,
          promoCode:      promoItem?.promoCode,
          discountAmount: totalDiscount > 0 ? totalDiscount : undefined,
          finalTotal,
          shippingFee:    shipping,
        });
      } catch (emailErr) { console.warn('Email failed:', emailErr); }
      await clearCart();
      setLoading(false);
      showNotification('Order created! Redirecting to payment... 💳', 'success');
      setTimeout(() => { window.location.href = paymentLinkUrl; }, 1500);
    } catch (error) {
      setLoading(false);
      showNotification('Error placing order. Please try again.', 'error');
      console.error('Order error:', error);
    }
  };

  const promoCartItems    = cartItems.filter(i => !!i.promoCode);
  const nonPromoCartItems = cartItems.filter(i => !i.promoCode);
  const totalPcs          = getTotalPcs();

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

              <div className="checkout-section">
                <div className="section-header">
                  <h2>
                    Shipping Address
                    {isAddressComplete() && !isEditingAddress && <span className="section-complete-badge"><i className="fas fa-check-circle"></i> Saved</span>}
                  </h2>
                  {!isEditingAddress
                    ? <button type="button" className="edit-info-btn" onClick={() => setIsEditingAddress(true)}><i className="fas fa-pen"></i> Edit</button>
                    : <button type="button" className="save-info-btn" onClick={handleSaveAddress}><i className="fas fa-check"></i> Save</button>
                  }
                </div>
                {!isEditingAddress ? (
                  <div className="info-display-grid">
                    <div className="info-display-item info-display-full"><span className="info-label"><i className="fas fa-map-marker-alt"></i> Street Address</span><span className="info-value">{savedAddress.address || <span className="info-missing">Not set — click Edit</span>}</span></div>
                    <div className="info-display-item"><span className="info-label"><i className="fas fa-city"></i> City</span><span className="info-value">{savedAddress.city || <span className="info-missing">Not set</span>}</span></div>
                    <div className="info-display-item"><span className="info-label"><i className="fas fa-map-pin"></i> Zip Code</span><span className="info-value">{savedAddress.zipCode || <span className="info-missing">Not set</span>}</span></div>
                    {savedCoords && (
                      <div className="info-display-item info-display-full" style={{ background: '#f0fdf4', borderColor: '#86efac' }}>
                        <span className="info-label" style={{ color: '#16a34a' }}><i className="fas fa-map-marker-alt"></i> Map Pin</span>
                        <span className="info-value" style={{ fontSize: '13px', color: '#166534' }}>
                          <i className="fas fa-check-circle" style={{ color: '#16a34a', marginRight: '6px' }}></i>
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
                      />
                    </div>
                    <div className="form-group"><label>City</label><input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="Manila" /></div>
                    <div className="form-group">
                      <label>Zip Code</label>
                      <input type="text" name="zipCode" value={formData.zipCode} onChange={handleChange} placeholder="1000" maxLength="4" className={errors.zipCode ? 'input-error' : ''} />
                      {errors.zipCode && <span className="error-message"><i className="fas fa-exclamation-circle"></i> {errors.zipCode}</span>}
                      {!errors.zipCode && formData.zipCode?.length === 4 && <span className="success-message"><i className="fas fa-check-circle"></i> Valid zip code</span>}
                    </div>
                  </div>
                )}
              </div>

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

              <div className="checkout-section">
                <h2>Order Notes <span className="notes-optional">(Optional)</span></h2>
                <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Any special instructions for your order..." rows="4"></textarea>
              </div>
            </div>

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
                {totalPcs > 0 && totalPcs < 10 && (
                  <div className="shipping-nudge">
                    <i className="fas fa-truck"></i>
                    Add <strong>{10 - totalPcs} more pc{10 - totalPcs > 1 ? 's' : ''}</strong> for <strong>FREE shipping!</strong>
                  </div>
                )}
                {totalPcs >= 10 && <div className="shipping-nudge shipping-nudge-free"><i className="fas fa-check-circle"></i> You got FREE shipping!</div>}
                <div className="summary-totals">
                  {totalDiscount > 0 && (
                    <div className="summary-row summary-row-original">
                      <span>Original Price</span>
                      <span className="summary-strikethrough">₱{(subtotal + totalDiscount).toLocaleString()}</span>
                    </div>
                  )}
                  <div className="summary-row"><span>Subtotal</span><span>₱{subtotal.toLocaleString()}</span></div>
                  <div className="summary-row">
                    <span>Shipping ({totalPcs} pc{totalPcs !== 1 ? 's' : ''})</span>
                    <span>{shippingFee === 0 ? <span className="free-shipping-text">FREE</span> : `₱${shippingFee.toLocaleString()}`}</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div className="summary-row promo-discount-row">
                      <span><i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>Promo Discount</span>
                      <span className="promo-discount-amount">−₱{totalDiscount.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="summary-row total"><span>Total</span><span>₱{finalTotal.toLocaleString()}</span></div>
                  {totalDiscount > 0 && (
                    <div className="promo-savings-checkout">
                      <i className="fas fa-piggy-bank"></i>
                      You're saving <strong>₱{totalDiscount.toLocaleString()}</strong> with your promo!
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className={`btn btn-primary btn-checkout${!isFormReady() || loading ? ' btn-checkout-disabled' : ''}`}
                  disabled={loading || !isFormReady()}
                >
                  {loading
                    ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                    : !isFormReady()
                      ? <><i className="fas fa-lock"></i> Complete Your Info First</>
                      : <>Pay ₱{finalTotal.toLocaleString()} Securely</>
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
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useProducts, usePreOrderProducts, useUpdateProduct } from '../utils/productStorage';
import { useCreateOrder } from '../utils/orderStorage';
import { useCart, useClearCart } from '../context/cartUtils';
import { useMutation, useQuery, useAction } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './Checkout.css';

// Shipping: ₱10 base + ₱10 per pc, FREE if 10+ pcs
const calcShipping = (totalPcs) => {
  if (totalPcs === 0) return 0;
  if (totalPcs >= 10) return 0;
  return 10 + totalPcs * 10;
};

const Checkout = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const products         = [...regularProducts, ...preOrderProducts];

  const cartItems     = useCart();
  const createOrder   = useCreateOrder();
  const clearCart     = useClearCart();
  const updateProduct = useUpdateProduct();

  // Convex hooks
  const savedProfile = useQuery(
    api.users.getProfile,
    user?._id || user?.id ? { userId: user?._id || user?.id } : 'skip'
  );
  const saveProfile           = useMutation(api.users.saveProfile);
  const sendOrderConfirmation = useAction(api.sendEmail.sendOrderConfirmation);
  const createPaymentLink     = useAction(api.payments.createPaymentLink);

  // ── Fetch all promos for validation ──────────────────────────────
  const allPromos = useQuery(api.promos.getAllPromos) ?? [];

  const [loading, setLoading]                   = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [errors, setErrors]                     = useState({ phone: '', zipCode: '' });

  // ── Promo state ───────────────────────────────────────────────────
  const [promoInput, setPromoInput]     = useState('');
  const [promoError, setPromoError]     = useState('');
  const [appliedPromo, setAppliedPromo] = useState(null);
  // appliedPromo = { code, name, discount, maxDiscount, discountAmount }

  const [formData, setFormData] = useState({
    fullName: '', email: '', phone: '',
    address: '', city: '', zipCode: '',
    notes: ''
  });

  const [savedContact, setSavedContact] = useState({ fullName: '', email: '', phone: '' });
  const [savedAddress, setSavedAddress] = useState({ address: '', city: '', zipCode: '' });

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

    const contactMissing = !init.fullName || !init.email || !init.phone;
    const addressMissing = !init.address  || !init.city  || !init.zipCode;
    setIsEditingContact(contactMissing);
    setIsEditingAddress(addressMissing);
  }, [isAuthenticated, navigate, showNotification, user, savedProfile]);

  useEffect(() => {
    if (cartItems.length === 0 && products.length > 0) {
      showNotification('Your cart is empty', 'warning');
      navigate('/collections');
    }
  }, [cartItems.length, products.length]);

  const getProductById    = (id) => products.find(p => p._id === id || p.id === id);
  const getQty            = (item) => item.qty ?? item.quantity ?? 1;
  const getTotalPcs       = () => cartItems.reduce((sum, item) => sum + getQty(item), 0);
  const calculateSubtotal = () =>
    cartItems.reduce((total, item) => {
      const product = getProductById(item.productId || item.id);
      return total + (product ? product.price * getQty(item) : 0);
    }, 0);

  const shippingFee = calcShipping(getTotalPcs());

  // ── Totals with promo ─────────────────────────────────────────────
  const subtotal       = calculateSubtotal();
  const discountAmount = appliedPromo?.discountAmount ?? 0;
  const finalTotal     = Math.max(0, subtotal + shippingFee - discountAmount);

  // ── Promo helpers ─────────────────────────────────────────────────
  const handleApplyPromo = () => {
    const trimmed = promoInput.trim().toUpperCase();
    setPromoError('');

    if (!trimmed) { setPromoError('Please enter a promo code.'); return; }
    if (!allPromos.length) { setPromoError('Loading promos, please try again.'); return; }

    const today = new Date().toISOString().split('T')[0];
    const promo = allPromos.find(p => p.code === trimmed);

    if (!promo)          { setPromoError('Invalid promo code.'); return; }
    if (!promo.isActive) { setPromoError('This promo is no longer active.'); return; }
    if (promo.startDate && promo.startDate > today) { setPromoError('This promo has not started yet.'); return; }
    if (promo.endDate   && promo.endDate   < today) { setPromoError('This promo has expired.'); return; }

    const discount = Math.min(
      Math.floor(subtotal * (promo.discount / 100)),
      promo.maxDiscount
    );

    setAppliedPromo({ ...promo, discountAmount: discount });
    setPromoInput('');
    showNotification(`Promo applied! You save ₱${discount.toLocaleString()} 🎉`, 'success');
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoInput('');
    setPromoError('');
  };

  // ── Validation ────────────────────────────────────────────────────
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

  const isContactComplete = () =>
    savedContact.fullName.trim() && savedContact.email.trim() &&
    savedContact.phone.trim() && !validatePhone(savedContact.phone);

  const isAddressComplete = () =>
    savedAddress.address.trim() && savedAddress.city.trim() &&
    savedAddress.zipCode.trim() && !validateZipCode(savedAddress.zipCode);

  const isFormReady = () =>
    isContactComplete() && isAddressComplete() &&
    !isEditingContact && !isEditingAddress;

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

    for (const item of cartItems) {
      const product = getProductById(item.productId || item.id);
      if (!product) { showNotification('Product not found', 'error'); return; }
      if (product.stock < getQty(item)) {
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
      const totalPcs = getTotalPcs();
      const shipping = calcShipping(totalPcs);
      // finalTotal = subtotal + shipping - discount (this is what PayMongo charges)
      const orderFinalTotal = Math.max(0, subtotal + shipping - discountAmount);

      const orderItems = cartItems.map(item => {
        const product = getProductById(item.productId || item.id);
        return {
          id:          item.productId || item.id,
          name:        product?.name  || 'Unknown',
          price:       product?.price || 0,
          quantity:    getQty(item),
          image:       product?.image || '',
          isPreOrder:  product?.isPreOrder  || false,
          releaseDate: product?.releaseDate || null,
        };
      });

      // Save order with promo fields
      await createOrder({
        orderId,
        email:           savedContact.email,
        customerName:    savedContact.fullName,
        phone:           savedContact.phone,
        items:           orderItems,
        total:           subtotal + shipping,       // original total before discount
        subtotal,
        shippingFee:     shipping,
        // ── promo ──
        ...(appliedPromo && {
          promoCode:       appliedPromo.code,
          promoName:       appliedPromo.name,
          discountAmount,
          discountPercent: appliedPromo.discount,
          finalTotal:      orderFinalTotal,
        }),
        status:          'Pending Payment',
        orderStatus:     'pending',
        shippingAddress: `${savedAddress.address}, ${savedAddress.city} ${savedAddress.zipCode}`,
        paymentMethod:   'paymongo',
        notes:           formData.notes || '',
        paymentStatus:   'pending',
      });

      // PayMongo charges the DISCOUNTED amount
      const { paymentLinkUrl } = await createPaymentLink({
        orderId,
        amount:        orderFinalTotal,   // ← discounted total!
        description:   `DKMerch Order ${orderId}${appliedPromo ? ` (Promo: ${appliedPromo.code})` : ''}`,
        customerName:  savedContact.fullName,
        customerEmail: savedContact.email,
        customerPhone: savedContact.phone,
      });

      // Email receipt with promo info
      try {
        await sendOrderConfirmation({
          to:   savedContact.email,
          name: savedContact.fullName,
          orderId,
          items: orderItems.map(item => ({
            name: item.name, price: item.price, quantity: item.quantity,
          })),
          total:           subtotal + shipping,
          promoCode:       appliedPromo?.code,
          promoName:       appliedPromo?.name,
          discountAmount:  discountAmount > 0 ? discountAmount : undefined,
          finalTotal:      orderFinalTotal,
          shippingFee:     shipping,
        });
      } catch (emailErr) {
        console.warn('Order confirmation email failed:', emailErr);
      }

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

  const totalPcs = getTotalPcs();

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-header">
          <h1>Checkout</h1>
          <p>Complete your order and get ready for K-Pop paradise</p>
        </div>

        <form onSubmit={handleSubmit} className="checkout-form">
          <div className="checkout-grid">
            <div className="checkout-details">

              {/* ── CONTACT INFORMATION ── */}
              <div className="checkout-section">
                <div className="section-header">
                  <h2>
                    Contact Information
                    {isContactComplete() && !isEditingContact && (
                      <span className="section-complete-badge">
                        <i className="fas fa-check-circle"></i> Saved
                      </span>
                    )}
                  </h2>
                  {!isEditingContact ? (
                    <button type="button" className="edit-info-btn" onClick={() => setIsEditingContact(true)}>
                      <i className="fas fa-pen"></i> Edit
                    </button>
                  ) : (
                    <button type="button" className="save-info-btn" onClick={handleSaveContact}>
                      <i className="fas fa-check"></i> Save
                    </button>
                  )}
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
                      <input type="tel" name="phone" value={formData.phone} onChange={handleChange}
                        placeholder="09XXXXXXXXX" maxLength="11"
                        className={errors.phone ? 'input-error' : ''} />
                      {errors.phone && <span className="error-message"><i className="fas fa-exclamation-circle"></i> {errors.phone}</span>}
                      {!errors.phone && formData.phone?.length === 11 && <span className="success-message"><i className="fas fa-check-circle"></i> Valid phone number</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* ── SHIPPING ADDRESS ── */}
              <div className="checkout-section">
                <div className="section-header">
                  <h2>
                    Shipping Address
                    {isAddressComplete() && !isEditingAddress && (
                      <span className="section-complete-badge">
                        <i className="fas fa-check-circle"></i> Saved
                      </span>
                    )}
                  </h2>
                  {!isEditingAddress ? (
                    <button type="button" className="edit-info-btn" onClick={() => setIsEditingAddress(true)}>
                      <i className="fas fa-pen"></i> Edit
                    </button>
                  ) : (
                    <button type="button" className="save-info-btn" onClick={handleSaveAddress}>
                      <i className="fas fa-check"></i> Save
                    </button>
                  )}
                </div>

                {!isEditingAddress ? (
                  <div className="info-display-grid">
                    <div className="info-display-item info-display-full">
                      <span className="info-label"><i className="fas fa-map-marker-alt"></i> Street Address</span>
                      <span className="info-value">{savedAddress.address || <span className="info-missing">Not set — click Edit</span>}</span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-city"></i> City</span>
                      <span className="info-value">{savedAddress.city || <span className="info-missing">Not set</span>}</span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-map-pin"></i> Zip Code</span>
                      <span className="info-value">{savedAddress.zipCode || <span className="info-missing">Not set</span>}</span>
                    </div>
                  </div>
                ) : (
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Street Address</label>
                      <input type="text" name="address" value={formData.address} onChange={handleChange} placeholder="123 Main Street, Barangay" />
                    </div>
                    <div className="form-group">
                      <label>City</label>
                      <input type="text" name="city" value={formData.city} onChange={handleChange} placeholder="Manila" />
                    </div>
                    <div className="form-group">
                      <label>Zip Code</label>
                      <input type="text" name="zipCode" value={formData.zipCode} onChange={handleChange}
                        placeholder="1000" maxLength="4"
                        className={errors.zipCode ? 'input-error' : ''} />
                      {errors.zipCode && <span className="error-message"><i className="fas fa-exclamation-circle"></i> {errors.zipCode}</span>}
                      {!errors.zipCode && formData.zipCode?.length === 4 && <span className="success-message"><i className="fas fa-check-circle"></i> Valid zip code</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* ── PROMO CODE ── */}
              <div className="checkout-section">
                <h2>Promo Code <span className="notes-optional">(Optional)</span></h2>

                {appliedPromo ? (
                  <div className="promo-applied-checkout">
                    <div className="promo-applied-left">
                      <span className="promo-applied-icon">🎉</span>
                      <div>
                        <span className="promo-applied-code">{appliedPromo.code}</span>
                        <span className="promo-applied-desc">
                          {appliedPromo.discount}% off · Max ₱{appliedPromo.maxDiscount?.toLocaleString()} · <strong style={{ color: '#16a34a' }}>−₱{discountAmount.toLocaleString()}</strong>
                        </span>
                      </div>
                    </div>
                    <button type="button" className="promo-remove-checkout" onClick={handleRemovePromo}>
                      <i className="fas fa-times"></i> Remove
                    </button>
                  </div>
                ) : (
                  <div className="promo-input-checkout-row">
                    <input
                      type="text"
                      className={`promo-input-checkout ${promoError ? 'promo-input-error' : ''}`}
                      placeholder="Enter promo code (e.g. DKMERCH25)"
                      value={promoInput}
                      onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApplyPromo(); } }}
                      maxLength={20}
                    />
                    <button type="button" className="promo-apply-checkout" onClick={handleApplyPromo} disabled={!promoInput.trim()}>
                      Apply
                    </button>
                  </div>
                )}
                {promoError && (
                  <p className="promo-error-checkout"><i className="fas fa-times-circle"></i> {promoError}</p>
                )}
              </div>

              {/* ── PAYMENT INFO ── */}
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

              {/* ── ORDER NOTES ── */}
              <div className="checkout-section">
                <h2>Order Notes <span className="notes-optional">(Optional)</span></h2>
                <textarea name="notes" value={formData.notes} onChange={handleChange}
                  placeholder="Any special instructions for your order..." rows="4"></textarea>
              </div>
            </div>

            {/* ── ORDER SUMMARY ── */}
            <div className="order-summary">
              <div className="summary-card">
                <h2>Order Summary</h2>
                <div className="summary-items">
                  {cartItems.map(item => {
                    const product = getProductById(item.productId || item.id);
                    if (!product) return null;
                    const qty = getQty(item);
                    return (
                      <div key={item.productId || item.id} className="summary-item">
                        <img src={product.image} alt={product.name} />
                        <div className="item-details">
                          <p className="item-name">
                            {product.name}
                            {product.isPreOrder && <span className="item-preorder-badge">PRE-ORDER</span>}
                          </p>
                          <p className="item-meta">{product.kpopGroup}</p>
                          {product.isPreOrder && product.releaseDate && (
                            <p className="item-release-date">
                              <i className="fas fa-calendar-alt"></i>{' '}
                              Expected: {new Date(product.releaseDate).toLocaleDateString('en-PH', {
                                year: 'numeric', month: 'long', day: 'numeric'
                              })}
                            </p>
                          )}
                          <p className="item-qty">Qty: {qty}</p>
                          {product.stock < qty && <p className="item-error">⚠️ Only {product.stock} in stock</p>}
                        </div>
                        <div className="item-price">₱{(product.price * qty).toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="summary-divider"></div>

                {totalPcs > 0 && totalPcs < 10 && (
                  <div style={{ background: '#f0f4ff', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#555' }}>
                    <i className="fas fa-truck" style={{ marginRight: '6px', color: '#6c63ff' }}></i>
                    Add <strong>{10 - totalPcs} more pc{10 - totalPcs > 1 ? 's' : ''}</strong> for <strong>FREE shipping!</strong>
                  </div>
                )}
                {totalPcs >= 10 && (
                  <div style={{ background: '#f0fff4', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#22863a', fontWeight: 600 }}>
                    <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>
                    You got FREE shipping!
                  </div>
                )}

                <div className="summary-totals">
                  <div className="summary-row"><span>Subtotal</span><span>₱{subtotal.toLocaleString()}</span></div>
                  <div className="summary-row">
                    <span>Shipping ({totalPcs} pc{totalPcs !== 1 ? 's' : ''})</span>
                    <span>
                      {shippingFee === 0
                        ? <span style={{ color: '#22863a', fontWeight: 600 }}>FREE</span>
                        : `₱${shippingFee.toLocaleString()}`}
                    </span>
                  </div>

                  {/* ── Promo discount row ── */}
                  {appliedPromo && discountAmount > 0 && (
                    <div className="summary-row promo-discount-row">
                      <span>
                        <i className="fas fa-tag" style={{ marginRight: '6px', color: '#ec4899' }}></i>
                        Promo ({appliedPromo.code})
                      </span>
                      <span style={{ color: '#16a34a', fontWeight: 700 }}>−₱{discountAmount.toLocaleString()}</span>
                    </div>
                  )}

                  <div className="summary-row total">
                    <span>Total</span>
                    <span>₱{finalTotal.toLocaleString()}</span>
                  </div>

                  {appliedPromo && discountAmount > 0 && (
                    <div className="promo-savings-checkout">
                      <i className="fas fa-piggy-bank"></i>
                      You're saving <strong>₱{discountAmount.toLocaleString()}</strong> with promo <strong>{appliedPromo.code}</strong>!
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className={`btn btn-primary btn-checkout${!isFormReady() || loading ? ' btn-checkout-disabled' : ''}`}
                  disabled={loading || !isFormReady()}
                  title={!isFormReady() ? 'Please save your contact info and address first' : ''}
                >
                  {loading
                    ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                    : !isFormReady()
                      ? <><i className="fas fa-lock"></i> Complete Your Info First</>
                      : <>Pay ₱{finalTotal.toLocaleString()} Securely</>
                  }
                </button>

                {!isFormReady() && !loading && (
                  <p style={{ textAlign: 'center', fontSize: '12px', color: '#e05', marginTop: '8px' }}>
                    <i className="fas fa-exclamation-circle"></i>{' '}
                    {isEditingContact
                      ? 'Click "Save" on Contact Information to continue.'
                      : isEditingAddress
                        ? 'Click "Save" on Shipping Address to continue.'
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
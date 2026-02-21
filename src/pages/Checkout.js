import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { getProducts, updateProduct } from '../utils/productStorage';
import './Checkout.css';

const Checkout = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Edit mode toggles
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);

  // Confirmed display values
  const [savedContact, setSavedContact] = useState({ fullName: '', email: '', phone: '' });
  const [savedAddress, setSavedAddress] = useState({ address: '', city: '', zipCode: '' });

  const [errors, setErrors] = useState({
    phone: '',
    zipCode: ''
  });

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    zipCode: '',
    paymentMethod: 'gcash',
    notes: ''
  });

  useEffect(() => {
    if (!isAuthenticated) {
      showNotification('Please login to checkout', 'warning');
      navigate('/');
      return;
    }

    const storedCart = JSON.parse(localStorage.getItem('dkmerch_cart')) || [];
    const storedProducts = getProducts();

    if (storedCart.length === 0) {
      showNotification('Your cart is empty', 'warning');
      navigate('/collections');
      return;
    }

    setCart(storedCart);
    setProducts(storedProducts);

    // Load saved profile
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const currentUser = users.find(u => u.id === user?.id) || {};

    const init = {
      fullName: currentUser.name    || user?.name  || '',
      email:    currentUser.email   || user?.email || '',
      phone:    currentUser.phone   || '',
      address:  currentUser.address || '',
      city:     currentUser.city    || '',
      zipCode:  currentUser.zipCode || '',
      paymentMethod: 'gcash',
      notes: ''
    };

    setFormData(init);
    setSavedContact({ fullName: init.fullName, email: init.email, phone: init.phone });
    setSavedAddress({ address: init.address, city: init.city, zipCode: init.zipCode });

    // Auto-open edit if incomplete
    const hasContact = init.fullName && init.email && init.phone;
    const hasAddress = init.address && init.city && init.zipCode;
    if (!hasContact) setIsEditingContact(true);
    if (!hasAddress) setIsEditingAddress(true);

  }, [isAuthenticated, navigate, showNotification]);

  // Persist to localStorage
  const saveProfileToStorage = (data) => {
    const users = JSON.parse(localStorage.getItem('users')) || [];
    const idx = users.findIndex(u => u.id === user?.id);
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        name: data.fullName,
        phone: data.phone,
        address: data.address,
        city: data.city,
        zipCode: data.zipCode,
      };
      localStorage.setItem('users', JSON.stringify(users));
    }
    const authUser = JSON.parse(localStorage.getItem('authUser'));
    if (authUser) {
      localStorage.setItem('authUser', JSON.stringify({
        ...authUser,
        name: data.fullName,
        phone: data.phone,
        address: data.address,
        city: data.city,
        zipCode: data.zipCode,
      }));
    }
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => {
      const product = products.find(p => p.id === item.id);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  };

  const calculateShipping = () => 0;
  const calculateTotal = () => calculateSubtotal() + calculateShipping();

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

  // Save contact section
  const handleSaveContact = () => {
    if (!formData.fullName.trim()) { showNotification('Please enter your full name', 'error'); return; }
    if (!formData.email.trim()) { showNotification('Please enter your email', 'error'); return; }
    const phoneErr = validatePhone(formData.phone);
    if (phoneErr) { setErrors(prev => ({ ...prev, phone: phoneErr })); return; }

    setSavedContact({ fullName: formData.fullName, email: formData.email, phone: formData.phone });
    saveProfileToStorage(formData);
    setIsEditingContact(false);
    showNotification('Contact information saved!', 'success');
  };

  // Save address section
  const handleSaveAddress = () => {
    if (!formData.address.trim()) { showNotification('Please enter your street address', 'error'); return; }
    if (!formData.city.trim()) { showNotification('Please enter your city', 'error'); return; }
    const zipErr = validateZipCode(formData.zipCode);
    if (zipErr) { setErrors(prev => ({ ...prev, zipCode: zipErr })); return; }

    setSavedAddress({ address: formData.address, city: formData.city, zipCode: formData.zipCode });
    saveProfileToStorage(formData);
    setIsEditingAddress(false);
    showNotification('Shipping address saved!', 'success');
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!savedContact.fullName || !savedContact.email || !savedContact.phone ||
        !savedAddress.address || !savedAddress.city || !savedAddress.zipCode) {
      showNotification('Please fill in and save all required fields', 'error');
      if (!savedContact.fullName || !savedContact.email || !savedContact.phone) setIsEditingContact(true);
      if (!savedAddress.address || !savedAddress.city || !savedAddress.zipCode) setIsEditingAddress(true);
      return;
    }

    const phoneError = validatePhone(savedContact.phone);
    if (phoneError) { showNotification(phoneError, 'error'); setIsEditingContact(true); return; }

    const zipError = validateZipCode(savedAddress.zipCode);
    if (zipError) { showNotification(zipError, 'error'); setIsEditingAddress(true); return; }

    for (const item of cart) {
      const product = products.find(p => p.id === item.id);
      if (!product) { showNotification(`Product not found: ${item.id}`, 'error'); return; }
      if (product.stock < item.quantity) {
        showNotification(`Insufficient stock for ${product.name}. Available: ${product.stock}`, 'error');
        return;
      }
    }

    setLoading(true);

    try {
      cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) updateProduct({ ...product, stock: product.stock - item.quantity });
      });

      const orderId = `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const timestamp = new Date().toISOString();
      const fullAddress = `${savedAddress.address}, ${savedAddress.city} ${savedAddress.zipCode}`;

      const order = {
        orderId: orderId,
        id: orderId,
        customerId: user.id,
        customerName: savedContact.fullName,
        customerEmail: savedContact.email,
        email: savedContact.email,
        customerPhone: savedContact.phone,
        phone: savedContact.phone,
        shippingAddress: {
          address: savedAddress.address,
          city: savedAddress.city,
          zipCode: savedAddress.zipCode
        },
        address: fullAddress,
        items: cart.map(item => {
          const product = products.find(p => p.id === item.id);
          return {
            productId: item.id,
            id: item.id,
            name: product?.name || 'Unknown',
            image: product?.image || '',
            productName: product?.name || 'Unknown',
            productImage: product?.image || '',
            kpopGroup: product?.kpopGroup || '',
            description: product?.description || '',
            quantity: item.quantity,
            price: product?.price || 0,
            size: product?.size || 'N/A',
            color: product?.color || 'N/A'
          };
        }),
        subtotal: calculateSubtotal(),
        shipping: 0,
        shippingFee: 0,
        total: calculateSubtotal(),
        paymentMethod: formData.paymentMethod,
        notes: formData.notes,
        orderStatus: 'pending',
        status: 'pending',
        createdAt: timestamp,
        date: timestamp,
        updatedAt: timestamp
      };

      const orders = JSON.parse(localStorage.getItem('dkmerch_orders')) || [];
      orders.unshift(order);
      localStorage.setItem('dkmerch_orders', JSON.stringify(orders));
      localStorage.setItem('dkmerch_cart', JSON.stringify([]));

      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('dkmerch-products-updated'));
      window.dispatchEvent(new Event('orderUpdated'));

      setLoading(false);
      showNotification('Order placed successfully! 🎉', 'success');
      setTimeout(() => navigate(`/track-order?order=${order.orderId}`), 1000);
    } catch (error) {
      setLoading(false);
      showNotification('Error placing order. Please try again.', 'error');
      console.error('Order error:', error);
    }
  };

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
                  <h2>Contact Information</h2>
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

                {/* DISPLAY MODE */}
                {!isEditingContact ? (
                  <div className="info-display-grid">
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-user"></i> Full Name</span>
                      <span className="info-value">
                        {savedContact.fullName || <span className="info-missing">Not set — click Edit</span>}
                      </span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-envelope"></i> Email</span>
                      <span className="info-value">
                        {savedContact.email || <span className="info-missing">Not set — click Edit</span>}
                      </span>
                    </div>
                    <div className="info-display-item info-display-full">
                      <span className="info-label"><i className="fas fa-phone"></i> Phone Number</span>
                      <span className="info-value">
                        {savedContact.phone || <span className="info-missing">Not set — click Edit</span>}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* EDIT MODE */
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        name="fullName"
                        value={formData.fullName}
                        onChange={handleChange}
                        placeholder="Juan Dela Cruz"
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="juan@example.com"
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Phone Number</label>
                      <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="09XXXXXXXXX"
                        maxLength="11"
                        className={errors.phone ? 'input-error' : ''}
                      />
                      {errors.phone && (
                        <span className="error-message">
                          <i className="fas fa-exclamation-circle"></i> {errors.phone}
                        </span>
                      )}
                      {!errors.phone && formData.phone && formData.phone.length === 11 && (
                        <span className="success-message">
                          <i className="fas fa-check-circle"></i> Valid phone number
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── SHIPPING ADDRESS ── */}
              <div className="checkout-section">
                <div className="section-header">
                  <h2>Shipping Address</h2>
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

                {/* DISPLAY MODE */}
                {!isEditingAddress ? (
                  <div className="info-display-grid">
                    <div className="info-display-item info-display-full">
                      <span className="info-label"><i className="fas fa-map-marker-alt"></i> Street Address</span>
                      <span className="info-value">
                        {savedAddress.address || <span className="info-missing">Not set — click Edit</span>}
                      </span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-city"></i> City</span>
                      <span className="info-value">
                        {savedAddress.city || <span className="info-missing">Not set</span>}
                      </span>
                    </div>
                    <div className="info-display-item">
                      <span className="info-label"><i className="fas fa-map-pin"></i> Zip Code</span>
                      <span className="info-value">
                        {savedAddress.zipCode || <span className="info-missing">Not set</span>}
                      </span>
                    </div>
                  </div>
                ) : (
                  /* EDIT MODE */
                  <div className="form-grid">
                    <div className="form-group full-width">
                      <label>Street Address</label>
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="123 Main Street, Barangay"
                      />
                    </div>
                    <div className="form-group">
                      <label>City</label>
                      <input
                        type="text"
                        name="city"
                        value={formData.city}
                        onChange={handleChange}
                        placeholder="Manila"
                      />
                    </div>
                    <div className="form-group">
                      <label>Zip Code</label>
                      <input
                        type="text"
                        name="zipCode"
                        value={formData.zipCode}
                        onChange={handleChange}
                        placeholder="1000"
                        maxLength="4"
                        className={errors.zipCode ? 'input-error' : ''}
                      />
                      {errors.zipCode && (
                        <span className="error-message">
                          <i className="fas fa-exclamation-circle"></i> {errors.zipCode}
                        </span>
                      )}
                      {!errors.zipCode && formData.zipCode && formData.zipCode.length === 4 && (
                        <span className="success-message">
                          <i className="fas fa-check-circle"></i> Valid zip code
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── PAYMENT METHOD ── */}
              <div className="checkout-section">
                <h2>Payment Method</h2>
                <div className="payment-options">

                  {/* GCASH */}
                  <label className={`payment-option ${formData.paymentMethod === 'gcash' ? 'payment-selected' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="gcash"
                      checked={formData.paymentMethod === 'gcash'}
                      onChange={handleChange}
                    />
                    <div className="payment-content">
                      <div className="payment-icon-wrap payment-icon-gcash">
                        <i className="fas fa-mobile-alt"></i>
                      </div>
                      <div>
                        <strong>GCash</strong>
                        <p>Pay via GCash mobile wallet</p>
                      </div>
                    </div>
                    {formData.paymentMethod === 'gcash' && (
                      <span className="payment-check"><i className="fas fa-check-circle"></i></span>
                    )}
                  </label>

                  {/* PAYMAYA */}
                  <label className={`payment-option ${formData.paymentMethod === 'paymaya' ? 'payment-selected' : ''}`}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="paymaya"
                      checked={formData.paymentMethod === 'paymaya'}
                      onChange={handleChange}
                    />
                    <div className="payment-content">
                      <div className="payment-icon-wrap payment-icon-paymaya">
                        <i className="fas fa-credit-card"></i>
                      </div>
                      <div>
                        <strong>PayMaya</strong>
                        <p>Pay via PayMaya / Maya</p>
                      </div>
                    </div>
                    {formData.paymentMethod === 'paymaya' && (
                      <span className="payment-check"><i className="fas fa-check-circle"></i></span>
                    )}
                  </label>

                </div>

                <div className="payment-info-notice">
                  <i className="fas fa-info-circle"></i>
                  <span>Payment details (QR code / account number) will be sent to your email after placing your order.</span>
                </div>
              </div>

              {/* ── ORDER NOTES ── */}
              <div className="checkout-section">
                <h2>Order Notes <span className="notes-optional">(Optional)</span></h2>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="Any special instructions for your order..."
                  rows="4"
                ></textarea>
              </div>

            </div>

            {/* ── ORDER SUMMARY ── */}
            <div className="order-summary">
              <div className="summary-card">
                <h2>Order Summary</h2>

                <div className="summary-items">
                  {cart.map(item => {
                    const product = products.find(p => p.id === item.id);
                    if (!product) return null;
                    return (
                      <div key={item.id} className="summary-item">
                        <img src={product.image} alt={product.name} />
                        <div className="item-details">
                          <p className="item-name">{product.name}</p>
                          <p className="item-meta">{product.kpopGroup}</p>
                          <p className="item-qty">Qty: {item.quantity}</p>
                          {product.stock < item.quantity && (
                            <p className="item-error">⚠️ Only {product.stock} in stock</p>
                          )}
                        </div>
                        <div className="item-price">₱{(product.price * item.quantity).toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="summary-divider"></div>

                <div className="summary-totals">
                  <div className="summary-row">
                    <span>Subtotal</span>
                    <span>₱{calculateSubtotal().toLocaleString()}</span>
                  </div>
                  <div className="summary-row">
                    <span>Shipping</span>
                    <span>To be determined</span>
                  </div>
                  <div className="summary-row total">
                    <span>Total</span>
                    <span>₱{calculateTotal().toLocaleString()}</span>
                  </div>
                  <small style={{
                    display: 'block',
                    marginTop: '12px',
                    color: '#64748b',
                    fontSize: '12px',
                    fontFamily: 'Satoshi, sans-serif',
                    fontWeight: '500',
                    textAlign: 'center'
                  }}>
                    * Shipping fee will be added by admin
                  </small>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-checkout"
                  disabled={loading || errors.phone || errors.zipCode}
                >
                  {loading ? (
                    <><i className="fas fa-spinner fa-spin"></i> Processing Order...</>
                  ) : (
                    <><i className="fas fa-check-circle"></i> Place Order</>
                  )}
                </button>

                <div className="security-info">
                  <i className="fas fa-lock"></i>
                  <p>Secure checkout. Your information is protected.</p>
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
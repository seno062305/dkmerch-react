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

  const [errors, setErrors] = useState({
    phone: '',
    zipCode: ''
  });

  const [formData, setFormData] = useState({
    fullName: user?.name || '',
    email: user?.email || '',
    phone: '',
    address: '',
    city: '',
    zipCode: '',
    paymentMethod: 'cod',
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
  }, [isAuthenticated, navigate, showNotification]);

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => {
      const product = products.find(p => p.id === item.id);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  };

  const calculateShipping = () => {
    return 0;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateShipping();
  };

  const validatePhone = (phone) => {
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^\d*$/.test(cleaned)) {
      return 'Phone number must contain only numbers';
    }
    if (cleaned.length > 0 && cleaned.length !== 11) {
      return 'Phone number must be exactly 11 digits';
    }
    if (cleaned.length === 11 && !cleaned.startsWith('09')) {
      return 'Phone number must start with 09';
    }
    return '';
  };

  const validateZipCode = (zipCode) => {
    const cleaned = zipCode.replace(/\s/g, '');
    if (!/^\d*$/.test(cleaned)) {
      return 'Zip code must contain only numbers';
    }
    if (cleaned.length > 0 && cleaned.length !== 4) {
      return 'Zip code must be exactly 4 digits';
    }
    return '';
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (name === 'phone') {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.slice(0, 11);
      setFormData(prev => ({ ...prev, [name]: limited }));
      const error = validatePhone(limited);
      setErrors(prev => ({ ...prev, phone: error }));
      return;
    }
    
    if (name === 'zipCode') {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.slice(0, 4);
      setFormData(prev => ({ ...prev, [name]: limited }));
      const error = validateZipCode(limited);
      setErrors(prev => ({ ...prev, zipCode: error }));
      return;
    }
    
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.fullName || !formData.email || !formData.phone || 
        !formData.address || !formData.city || !formData.zipCode) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    const phoneError = validatePhone(formData.phone);
    if (phoneError) {
      showNotification(phoneError, 'error');
      setErrors(prev => ({ ...prev, phone: phoneError }));
      return;
    }

    const zipError = validateZipCode(formData.zipCode);
    if (zipError) {
      showNotification(zipError, 'error');
      setErrors(prev => ({ ...prev, zipCode: zipError }));
      return;
    }

    for (const item of cart) {
      const product = products.find(p => p.id === item.id);
      if (!product) {
        showNotification(`Product not found: ${item.id}`, 'error');
        return;
      }
      if (product.stock < item.quantity) {
        showNotification(`Insufficient stock for ${product.name}. Available: ${product.stock}`, 'error');
        return;
      }
    }

    setLoading(true);

    try {
      cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (product) {
          const updatedProduct = {
            ...product,
            stock: product.stock - item.quantity
          };
          updateProduct(updatedProduct);
        }
      });

      const orderId = `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const timestamp = new Date().toISOString();
      const fullAddress = `${formData.address}, ${formData.city} ${formData.zipCode}`;
      
      const order = {
        orderId: orderId,
        id: orderId,
        customerId: user.id,
        customerName: formData.fullName,
        customerEmail: formData.email,
        email: formData.email,
        customerPhone: formData.phone,
        phone: formData.phone,
        shippingAddress: {
          address: formData.address,
          city: formData.city,
          zipCode: formData.zipCode
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
      
      setTimeout(() => {
        navigate(`/track-order?order=${order.orderId}`);
      }, 1000);
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
              <div className="checkout-section">
                <h2>Contact Information</h2>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input 
                      type="text" 
                      name="fullName" 
                      value={formData.fullName} 
                      onChange={handleChange} 
                      placeholder="Juan Dela Cruz" 
                      required 
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
                      required 
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
                      required 
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
              </div>

              <div className="checkout-section">
                <h2>Shipping Address</h2>
                <div className="form-grid">
                  <div className="form-group full-width">
                    <label>Street Address</label>
                    <input 
                      type="text" 
                      name="address" 
                      value={formData.address} 
                      onChange={handleChange} 
                      placeholder="123 Main Street, Barangay" 
                      required 
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
                      required 
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
                      required 
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
              </div>

              <div className="checkout-section">
                <h2>Payment Method</h2>
                <div className="payment-options">
                  <label className="payment-option">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="cod" 
                      checked={formData.paymentMethod === 'cod'} 
                      onChange={handleChange} 
                    />
                    <div className="payment-content">
                      <i className="fas fa-money-bill-wave"></i>
                      <div>
                        <strong>Cash on Delivery</strong>
                        <p>Pay when you receive your order</p>
                      </div>
                    </div>
                  </label>
                  <label className="payment-option">
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value="gcash" 
                      checked={formData.paymentMethod === 'gcash'} 
                      onChange={handleChange} 
                    />
                    <div className="payment-content">
                      <i className="fas fa-mobile-alt"></i>
                      <div>
                        <strong>GCash</strong>
                        <p>Pay via GCash mobile wallet</p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="checkout-section">
                <h2>Order Notes (Optional)</h2>
                <textarea 
                  name="notes" 
                  value={formData.notes} 
                  onChange={handleChange} 
                  placeholder="Any special instructions for your order..." 
                  rows="4"
                ></textarea>
              </div>
            </div>

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
                    <>
                      <i className="fas fa-spinner fa-spin"></i> Processing Order...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle"></i> Place Order
                    </>
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
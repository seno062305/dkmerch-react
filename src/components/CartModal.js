import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import './CartModal.css';

const CartModal = ({ cart, products, onClose, onRemoveFromCart }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  // Lock body scroll when modal is open
  React.useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('cart-modal-open');
    
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.body.classList.remove('cart-modal-open');
      window.scrollTo(0, scrollY);
    };
  }, []);

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => {
      const product = products.find(p => p.id === item.id);
      return total + (product ? product.price * item.quantity : 0);
    }, 0);
  };

  const calculateShipping = () => {
    const subtotal = calculateSubtotal();
    return subtotal > 0 ? 120 : 0;
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateShipping();
  };

  const handleRemoveItem = (productId) => {
    if (window.confirm('Remove this item from cart?')) {
      onRemoveFromCart(productId);
    }
  };

  const updateQuantity = (productId, change) => {
    const currentCart = JSON.parse(localStorage.getItem('dkmerch_cart')) || [];
    const itemIndex = currentCart.findIndex(item => item.id === productId);
    
    if (itemIndex === -1) return;

    const newQuantity = currentCart[itemIndex].quantity + change;
    
    // Get product to check stock
    const product = products.find(p => p.id === productId);
    
    if (newQuantity < 1) {
      // Remove item if quantity goes below 1
      handleRemoveItem(productId);
      return;
    }
    
    // STOCK VALIDATION - prevent exceeding stock
    if (product && newQuantity > product.stock) {
      // Show notification when trying to exceed stock
      showNotification(`Only ${product.stock} item(s) available in stock`, 'error');
      return;
    }
    
    currentCart[itemIndex].quantity = newQuantity;
    localStorage.setItem('dkmerch_cart', JSON.stringify(currentCart));
    window.dispatchEvent(new Event('storage'));
  };

  const handleCheckout = () => {
    // Validate stock before checkout
    const hasStockIssue = cart.some(item => {
      const product = products.find(p => p.id === item.id);
      return product && item.quantity > product.stock;
    });

    if (hasStockIssue) {
      showNotification('Some items in your cart exceed available stock. Please adjust quantities.', 'error');
      return;
    }

    onClose();
    navigate('/checkout');
  };

  const handleContinueShopping = () => {
    onClose();
    navigate('/collections');
  };

  // Helper function to check if item is at max stock
  const isAtMaxStock = (item) => {
    const product = products.find(p => p.id === item.id);
    return product && item.quantity >= product.stock;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Shopping Cart</h3>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          {cart.length === 0 ? (
            <div className="cart-empty">
              <i className="fas fa-shopping-cart"></i>
              <h3>Your cart is empty</h3>
              <p>Add items to proceed.</p>
            </div>
          ) : (
            <>
              <div className="cart-items">
                {cart.map(item => {
                  const product = products.find(p => p.id === item.id);
                  if (!product) return null;
                  
                  const atMaxStock = isAtMaxStock(item);
                  
                  return (
                    <div key={item.id} className="cart-item">
                      <div className="cart-item-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                      <div className="cart-item-details">
                        <div className="cart-item-name-row">
                          <div className="cart-item-name">{product.name}</div>
                          <div className="cart-item-stock-info">
                            {product.stock} available
                          </div>
                        </div>
                        <div className="cart-item-meta">{product.kpopGroup} • {product.category}</div>
                        <div className="cart-item-price">₱{(product.price * item.quantity).toLocaleString()}</div>
                        {atMaxStock && (
                          <div className="stock-limit-notice">
                            <i className="fas fa-info-circle"></i>
                            <span>Maximum stock reached</span>
                          </div>
                        )}
                        <div className="cart-item-actions">
                          <div className="quantity-controls">
                            <button 
                              className="quantity-btn minus"
                              onClick={() => updateQuantity(item.id, -1)}
                            >
                              -
                            </button>
                            <span className="quantity-display">{item.quantity}</span>
                            <button 
                              className={`quantity-btn plus ${atMaxStock ? 'disabled' : ''}`}
                              onClick={() => updateQuantity(item.id, 1)}
                              disabled={atMaxStock}
                            >
                              +
                            </button>
                          </div>
                          <button 
                            className="remove-item"
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            <i className="fas fa-trash"></i> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="cart-summary">
                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>₱{calculateSubtotal().toLocaleString()}</span>
                </div>
                <div className="summary-row">
                  <span>Shipping:</span>
                  <span>₱{calculateShipping().toLocaleString()}</span>
                </div>
                <div className="summary-row summary-total">
                  <span>Total:</span>
                  <span>₱{calculateTotal().toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={handleContinueShopping}>
            Continue Shopping
          </button>
          {cart.length > 0 && (
            <button className="btn btn-primary" onClick={handleCheckout}>
              Proceed to Checkout
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartModal;
import React from 'react';
import './CartModal.css';

const CartModal = ({ cart, products, onClose, onRemoveFromCart }) => {
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
    // This would be implemented with a context or state management
    alert(`Quantity update would be implemented with state management. Change: ${change}`);
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
                  
                  return (
                    <div key={item.id} className="cart-item">
                      <div className="cart-item-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                      <div className="cart-item-details">
                        <div className="cart-item-name">{product.name}</div>
                        <div className="cart-item-meta">{product.kpopGroup} • {product.category}</div>
                        <div className="cart-item-price">₱{(product.price * item.quantity).toLocaleString()}</div>
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
                              className="quantity-btn plus"
                              onClick={() => updateQuantity(item.id, 1)}
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
                  <span id="cartSubtotal">₱{calculateSubtotal().toLocaleString()}</span>
                </div>
                <div className="summary-row">
                  <span>Shipping:</span>
                  <span id="cartShipping">₱{calculateShipping().toLocaleString()}</span>
                </div>
                <div className="summary-row summary-total">
                  <span>Total:</span>
                  <span id="cartTotal">₱{calculateTotal().toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>
            Continue Shopping
          </button>
          {cart.length > 0 && (
            <button className="btn btn-primary" onClick={() => alert('Proceeding to checkout...')}>
              Proceed to Checkout
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CartModal;
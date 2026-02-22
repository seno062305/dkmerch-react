import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { useProducts } from '../utils/productStorage';
import { useUpdateCartQuantity, useRemoveFromCart } from '../context/cartUtils';
import './CartModal.css';

const CartModal = ({ cart, onClose }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const products = useProducts() || [];
  const updateCartQuantity = useUpdateCartQuantity();
  const removeFromCart = useRemoveFromCart();

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

  const findProduct = (productId) =>
    products.find(p => p._id === productId || p.id === productId);

  const getQty = (item) => item.qty ?? item.quantity ?? 1;

  // Total number of pieces across all items
  const getTotalPieces = () =>
    cart.reduce((sum, item) => sum + getQty(item), 0);

  const calculateSubtotal = () =>
    cart.reduce((total, item) => {
      const product = findProduct(item.productId || item.id);
      return total + (product ? product.price * getQty(item) : 0);
    }, 0);

  // Shipping: ₱10 base + ₱10 per piece, FREE if 10 pcs or more
  const calculateShipping = () => {
    if (cart.length === 0) return 0;
    const totalPcs = getTotalPieces();
    if (totalPcs >= 10) return 0;          // FREE shipping
    return 10 + (totalPcs * 10);           // ₱10 base + ₱10 per pc
  };

  const calculateTotal = () => calculateSubtotal() + calculateShipping();

  const handleRemoveItem = async (productId) => {
    if (window.confirm('Remove this item from cart?')) {
      await removeFromCart(productId);
    }
  };

  const handleUpdateQty = async (productId, currentQty, change) => {
    const newQty = currentQty + change;
    const product = findProduct(productId);

    if (newQty < 1) {
      handleRemoveItem(productId);
      return;
    }
    if (product && newQty > product.stock) {
      showNotification(`Only ${product.stock} item(s) available in stock`, 'error');
      return;
    }
    await updateCartQuantity(productId, newQty);
  };

  const handleCheckout = () => {
    const hasStockIssue = cart.some(item => {
      const product = findProduct(item.productId || item.id);
      return product && getQty(item) > product.stock;
    });
    if (hasStockIssue) {
      showNotification('Some items exceed available stock. Please adjust quantities.', 'error');
      return;
    }
    onClose();
    navigate('/checkout');
  };

  const totalPcs = getTotalPieces();
  const shipping = calculateShipping();

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
                  const productId = item.productId || item.id;
                  const product = findProduct(productId);
                  if (!product) return null;

                  const qty = getQty(item);
                  const atMaxStock = qty >= product.stock;

                  return (
                    <div key={productId} className="cart-item">
                      <div className="cart-item-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                      <div className="cart-item-details">
                        <div className="cart-item-name-row">
                          <div className="cart-item-name">{product.name}</div>
                          <div className="cart-item-stock-info">{product.stock} available</div>
                        </div>
                        <div className="cart-item-meta">{product.kpopGroup} • {product.category}</div>
                        <div className="cart-item-price">₱{(product.price * qty).toLocaleString()}</div>
                        {atMaxStock && (
                          <div className="stock-limit-notice">
                            <i className="fas fa-info-circle"></i>
                            <span>Maximum stock reached</span>
                          </div>
                        )}
                        <div className="cart-item-actions">
                          <div className="quantity-controls">
                            <button className="quantity-btn minus" onClick={() => handleUpdateQty(productId, qty, -1)}>-</button>
                            <span className="quantity-display">{qty}</span>
                            <button
                              className={`quantity-btn plus ${atMaxStock ? 'disabled' : ''}`}
                              onClick={() => handleUpdateQty(productId, qty, 1)}
                              disabled={atMaxStock}
                            >+</button>
                          </div>
                          <button className="remove-item" onClick={() => handleRemoveItem(productId)}>
                            <i className="fas fa-trash"></i> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="cart-summary">
                {/* Free shipping progress */}
                {totalPcs < 10 && (
                  <div style={{
                    background: '#f0f4ff',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    fontSize: '13px',
                    color: '#555',
                  }}>
                    <i className="fas fa-truck" style={{ marginRight: '6px', color: '#6c63ff' }}></i>
                    Add <strong>{10 - totalPcs} more pc{10 - totalPcs > 1 ? 's' : ''}</strong> to get <strong>FREE shipping!</strong>
                  </div>
                )}
                {totalPcs >= 10 && (
                  <div style={{
                    background: '#f0fff4',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    fontSize: '13px',
                    color: '#22863a',
                    fontWeight: 600,
                  }}>
                    <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>
                    You got FREE shipping!
                  </div>
                )}

                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>₱{calculateSubtotal().toLocaleString()}</span>
                </div>
                <div className="summary-row">
                  <span>Shipping ({totalPcs} pc{totalPcs > 1 ? 's' : ''}):</span>
                  <span>
                    {shipping === 0
                      ? <span style={{ color: '#22863a', fontWeight: 600 }}>FREE</span>
                      : `₱${shipping.toLocaleString()}`}
                  </span>
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
          <button className="btn btn-outline" onClick={() => { onClose(); navigate('/collections'); }}>
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
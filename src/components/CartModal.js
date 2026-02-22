import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { useProducts, usePreOrderProducts } from '../utils/productStorage';
import { useUpdateCartQuantity, useRemoveFromCart } from '../context/cartUtils';
import './CartModal.css';

const CartModal = ({ cart, onClose }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const allProducts      = [...regularProducts, ...preOrderProducts];

  const updateCartQuantity = useUpdateCartQuantity();
  const removeFromCart     = useRemoveFromCart();

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
    allProducts.find(p => p._id === productId || p.id === productId);

  const getQty = (item) => item.qty ?? item.quantity ?? 1;

  const getTotalPieces = () =>
    cart.reduce((sum, item) => sum + getQty(item), 0);

  const calculateSubtotal = () =>
    cart.reduce((total, item) => {
      const product = findProduct(item.productId || item.id);
      return total + (product ? product.price * getQty(item) : 0);
    }, 0);

  const calculateShipping = () => {
    if (cart.length === 0) return 0;
    const totalPcs = getTotalPieces();
    if (totalPcs >= 10) return 0;
    return 10 + (totalPcs * 10);
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
    if (newQty < 1) { handleRemoveItem(productId); return; }
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
  const shipping  = calculateShipping();

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
                  const product   = findProduct(productId);
                  if (!product) return null;

                  const qty        = getQty(item);
                  const atMaxStock = qty >= product.stock;

                  return (
                    <div key={productId} className="cart-item">
                      <div className="cart-item-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                      <div className="cart-item-details">
                        <div className="cart-item-name-row">
                          <div className="cart-item-name">
                            {product.name}
                            {product.isPreOrder && (
                              <span className="cart-preorder-badge">PRE-ORDER</span>
                            )}
                          </div>
                          <div className="cart-item-stock-info">{product.stock} available</div>
                        </div>

                        <div className="cart-item-meta">{product.kpopGroup} • {product.category}</div>

                        {product.isPreOrder && product.releaseDate && (
                          <div className="cart-preorder-release">
                            <i className="fas fa-calendar-alt"></i>
                            Expected: {new Date(product.releaseDate).toLocaleDateString('en-PH', {
                              year: 'numeric', month: 'long', day: 'numeric'
                            })}
                          </div>
                        )}

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
                {totalPcs < 10 && (
                  <div className="shipping-notice">
                    <i className="fas fa-truck"></i>
                    Add <strong>{10 - totalPcs} more pc{10 - totalPcs > 1 ? 's' : ''}</strong> to get <strong>FREE shipping!</strong>
                  </div>
                )}
                {totalPcs >= 10 && (
                  <div className="shipping-notice free">
                    <i className="fas fa-check-circle"></i>
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
                      ? <span className="free-shipping-text">FREE</span>
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

        {cart.length > 0 && (
          <div className="modal-footer">
            <button className="btn btn-primary" onClick={handleCheckout}>
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartModal;
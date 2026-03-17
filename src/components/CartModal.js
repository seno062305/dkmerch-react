import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { useProducts, usePreOrderProducts, useCollectionProducts } from '../utils/productStorage';
import { useUpdateCartQtyById, useRemoveFromCartById } from '../context/cartUtils';
import { getPointsForPrice } from '../utils/pointsUtils';
import './CartModal.css';

const CartModal = ({ cart, onClose }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const regularProducts    = useProducts() || [];
  const preOrderProducts   = usePreOrderProducts() || [];
  const collectionProducts = useCollectionProducts() || [];

  const allProducts = [...new Map(
    [...regularProducts, ...preOrderProducts, ...collectionProducts]
      .map(p => [p._id || p.id, p])
  ).values()];

  const updateQtyById      = useUpdateCartQtyById();
  const removeFromCartById = useRemoveFromCartById();

  React.useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top      = `-${scrollY}px`;
    document.body.style.width    = '100%';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('cart-modal-open');
    return () => {
      document.body.style.position = '';
      document.body.style.top      = '';
      document.body.style.width    = '';
      document.body.style.overflow = '';
      document.body.classList.remove('cart-modal-open');
      window.scrollTo(0, scrollY);
    };
  }, []);

  const findProduct = (productId) =>
    allProducts.find(p => p._id === productId || p.id === productId);

  const getQty = (item) => item.qty ?? item.quantity ?? 1;

  const getEffectivePrice = (item, product) => {
    if (item.finalPrice !== undefined && item.finalPrice !== null) return item.finalPrice;
    return product?.price ?? item.price ?? 0;
  };

  const calculateSubtotal = () =>
    cart.reduce((total, item) => {
      const product = findProduct(item.productId || item.id);
      return total + getEffectivePrice(item, product) * getQty(item);
    }, 0);

  const calculateTotalDiscount = () =>
    cart.reduce((total, item) => {
      if (!item.promoCode) return total;
      const product       = findProduct(item.productId || item.id);
      const originalPrice = product?.price ?? item.price ?? 0;
      const finalPrice    = item.finalPrice ?? originalPrice;
      return total + (originalPrice - finalPrice) * getQty(item);
    }, 0);

  const subtotal      = calculateSubtotal();
  const totalDiscount = calculateTotalDiscount();

  const promoItems = cart.filter(i => i.promoCode);
  const cartPromo  = promoItems.length > 0 ? {
    code:           promoItems[0].promoCode,
    discount:       promoItems[0].promoDiscount,
    discountAmount: totalDiscount,
  } : null;

  // ✅ Points earned for this order (based on subtotal after discount)
  const orderTotal   = subtotal;
  const pointsToEarn = getPointsForPrice(orderTotal);

  const getEstimatedDelivery = () => {
    const today = new Date();
    const addBusinessDays = (date, days) => {
      let d = new Date(date);
      let added = 0;
      while (added < days) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay();
        if (day !== 0 && day !== 6) added++;
      }
      return d;
    };
    const earliest = addBusinessDays(today, 2);
    const latest   = addBusinessDays(today, 4);
    const fmt = (d) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    return `${fmt(earliest)} – ${fmt(latest)}`;
  };

  const handleRemoveItem = async (item) => {
    if (window.confirm('Remove this item from cart?')) {
      await removeFromCartById(item._id);
    }
  };

  const handleUpdateQty = async (item, change) => {
    const product    = findProduct(item.productId || item.id);
    const currentQty = getQty(item);
    const newQty     = currentQty + change;

    if (newQty < 1) { handleRemoveItem(item); return; }
    if (product && newQty > product.stock) {
      showNotification(`Only ${product.stock} item(s) available in stock`, 'error');
      return;
    }
    await updateQtyById(item._id, newQty);
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
    navigate('/checkout', { state: { appliedPromo: cartPromo } });
  };

  const renderCartItem = (item) => {
    const productId    = item.productId || item.id;
    const product      = findProduct(productId);

    const displayName  = product?.name      ?? item.name  ?? 'Product';
    const displayImage = product?.image     ?? item.image ?? '';
    const displayGroup = product?.kpopGroup ?? '';
    const displayCat   = product?.category  ?? '';
    const displayStock = product?.stock ?? 99;

    const qty            = getQty(item);
    const atMaxStock     = qty >= displayStock;
    const hasPromo       = !!item.promoCode;
    const effectivePrice = getEffectivePrice(item, product);
    const itemTotal      = effectivePrice * qty;
    const originalTotal  = (product?.price ?? item.price ?? 0) * qty;
    const savedAmount    = hasPromo ? originalTotal - itemTotal : 0;

    return (
      <div key={item._id} className={`cart-item${hasPromo ? ' cart-item-promo' : ''}`}>
        <div className="cart-item-image">
          <img src={displayImage} alt={displayName} />
          {hasPromo && (
            <div className="cart-item-promo-badge">
              <i className="fas fa-tag"></i> {item.promoDiscount}% OFF
            </div>
          )}
        </div>

        <div className="cart-item-details">
          <div className="cart-item-name-row">
            <div className="cart-item-name">{displayName}</div>
            <div className="cart-item-stock-info">{displayStock} available</div>
          </div>

          {(displayGroup || displayCat) && (
            <div className="cart-item-meta">{displayGroup}{displayGroup && displayCat ? ' • ' : ''}{displayCat}</div>
          )}

          <div className="cart-item-price-row">
            <span className={`cart-item-price${hasPromo ? ' cart-item-price-discounted' : ''}`}>
              ₱{itemTotal.toLocaleString()}
            </span>
            {hasPromo && (
              <>
                <span className="cart-item-price-original">₱{originalTotal.toLocaleString()}</span>
                <span className="cart-item-saved-badge">Save ₱{savedAmount.toLocaleString()}</span>
              </>
            )}
          </div>

          {hasPromo && (
            <div className="cart-item-promo-tag">
              <i className="fas fa-tag"></i> {item.promoCode}
            </div>
          )}

          {atMaxStock && (
            <div className="stock-limit-notice">
              <i className="fas fa-info-circle"></i>
              <span>Maximum stock reached</span>
            </div>
          )}

          <div className="cart-item-actions">
            <div className="quantity-controls">
              <button className="quantity-btn minus" onClick={() => handleUpdateQty(item, -1)}>-</button>
              <span className="quantity-display">{qty}</span>
              <button
                className={`quantity-btn plus${atMaxStock ? ' disabled' : ''}`}
                onClick={() => handleUpdateQty(item, 1)}
                disabled={atMaxStock}
              >+</button>
            </div>
            <button className="remove-item" onClick={() => handleRemoveItem(item)}>
              <i className="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    );
  };

  const promoCartItems    = cart.filter(i => !!i.promoCode);
  const nonPromoCartItems = cart.filter(i => !i.promoCode);

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
                {nonPromoCartItems.length > 0 && (
                  <>
                    {promoCartItems.length > 0 && (
                      <div className="cart-group-label">
                        <i className="fas fa-shopping-bag"></i> Regular Items
                      </div>
                    )}
                    {nonPromoCartItems.map(item => renderCartItem(item))}
                  </>
                )}
                {promoCartItems.length > 0 && (
                  <>
                    <div className="cart-group-label cart-group-label-promo">
                      <i className="fas fa-tag"></i> Promo Items
                    </div>
                    {promoCartItems.map(item => renderCartItem(item))}
                  </>
                )}
              </div>

              <div className="cart-summary">
                {/* ── Estimated Delivery Banner ── */}
                <div className="cart-estimated-delivery">
                  <div className="cart-delivery-icon">
                    <i className="fas fa-truck"></i>
                  </div>
                  <div className="cart-delivery-info">
                    <span className="cart-delivery-label">Estimated Delivery</span>
                    <span className="cart-delivery-date">{getEstimatedDelivery()}</span>
                  </div>
                  <div className="cart-delivery-badge">2–4 days</div>
                </div>

                <div className="shipping-notice">
                  <i className="fas fa-map-marker-alt"></i>
                  <span>Shipping fee calculated at checkout based on your address.</span>
                </div>

                {totalDiscount > 0 && (
                  <div className="summary-row cart-original-row">
                    <span>Original Price:</span>
                    <span className="cart-original-amount">
                      ₱{(subtotal + totalDiscount).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="summary-row">
                  <span>Subtotal:</span>
                  <span>₱{subtotal.toLocaleString()}</span>
                </div>

                <div className="summary-row" style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
                  <span>Shipping:</span>
                  <span>Calculated at checkout</span>
                </div>

                {totalDiscount > 0 && (
                  <div className="summary-row cart-discount-row">
                    <span>
                      <i className="fas fa-tag" style={{ marginRight: '5px', color: '#ec4899' }}></i>
                      Promo Discount:
                    </span>
                    <span className="cart-discount-amount">−₱{totalDiscount.toLocaleString()}</span>
                  </div>
                )}

                <div className="summary-row summary-total">
                  <span>Subtotal:</span>
                  <span>₱{subtotal.toLocaleString()}</span>
                </div>

                {totalDiscount > 0 && (
                  <div className="cart-savings-badge">
                    <i className="fas fa-piggy-bank"></i>
                    You're saving <strong>₱{totalDiscount.toLocaleString()}</strong> with your promo!
                  </div>
                )}

                {/* ✅ Points banner — shown above checkout button */}
                <div className="cart-points-banner">
                  <span className="cart-points-icon">⭐</span>
                  <span>
                    Complete this order to earn <strong>{pointsToEarn} pts</strong>
                    {' '}toward a free reward!
                  </span>
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
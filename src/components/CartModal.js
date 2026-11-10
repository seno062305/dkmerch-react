import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useProducts, usePreOrderProducts, useCollectionProducts } from '../utils/productStorage';
import { useUpdateCartQtyById, useRemoveFromCartById, useClearCart } from '../context/cartUtils';
import { getPointsForPrice } from '../utils/pointsUtils';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import './CartModal.css';

const CartModal = ({ cart, onClose }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  useCloseOnHistoryBack(true, onClose, 'cartModal');
  useBodyScrollLock(true);

  const regularProducts    = useProducts() || [];
  const preOrderProducts   = usePreOrderProducts() || [];
  const collectionProducts = useCollectionProducts() || [];

  const allProducts = [...new Map(
    [...regularProducts, ...preOrderProducts, ...collectionProducts]
      .map(p => [p._id || p.id, p])
  ).values()];

  const updateQtyById      = useUpdateCartQtyById();
  const removeFromCartById = useRemoveFromCartById();
  const clearCart          = useClearCart();

  const [selectedIds, setSelectedIds] = useState(new Set());
  const prevCartIdsRef = useRef([]);

  // Keep selection in sync — new items auto-selected (TikTok-style)
  const cartIdsKey = cart.map(i => String(i._id)).join('|');
  useEffect(() => {
    const ids = cart.map(i => String(i._id));
    const prevIds = prevCartIdsRef.current;
    setSelectedIds(prev => {
      const next = new Set();
      ids.forEach(id => {
        if (prev.has(id) || !prevIds.includes(id)) next.add(id);
      });
      return next;
    });
    prevCartIdsRef.current = ids;
  }, [cartIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.body.classList.add('cart-modal-open');
    return () => {
      document.body.classList.remove('cart-modal-open');
    };
  }, []);

  const findProduct = (productId) =>
    allProducts.find(p => p._id === productId || p.id === productId);

  const getQty = (item) => item.qty ?? item.quantity ?? 1;

  const getEffectivePrice = (item, product) => {
    if (item.finalPrice !== undefined && item.finalPrice !== null) return item.finalPrice;
    return product?.price ?? item.price ?? 0;
  };

  const selectedItems = cart.filter(i => selectedIds.has(String(i._id)));
  const allSelected   = cart.length > 0 && selectedIds.size === cart.length;
  const someSelected  = selectedIds.size > 0 && !allSelected;

  const calculateSubtotal = () =>
    selectedItems.reduce((total, item) => {
      const product = findProduct(item.productId || item.id);
      return total + getEffectivePrice(item, product) * getQty(item);
    }, 0);

  const calculateTotalDiscount = () =>
    selectedItems.reduce((total, item) => {
      if (!item.promoCode) return total;
      const product       = findProduct(item.productId || item.id);
      const originalPrice = product?.price ?? item.price ?? 0;
      const finalPrice    = item.finalPrice ?? originalPrice;
      return total + (originalPrice - finalPrice) * getQty(item);
    }, 0);

  const subtotal      = calculateSubtotal();
  const totalDiscount = calculateTotalDiscount();

  const promoItems = selectedItems.filter(i => i.promoCode);
  const cartPromo  = promoItems.length > 0 ? {
    code:           promoItems[0].promoCode,
    discount:       promoItems[0].promoDiscount,
    discountAmount: totalDiscount,
  } : null;

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

  const toggleItem = (id, e) => {
    if (e) e.stopPropagation();
    const key = String(id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(cart.map(i => String(i._id))));
  };

  const handleRemoveItem = async (item) => {
    const ok = await confirm({
      title: 'Remove item?',
      message: 'Remove this item from your cart?',
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    await removeFromCartById(item._id);
  };

  const handleRemoveSelected = async () => {
    if (selectedIds.size === 0) {
      showNotification('Select items to remove', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Remove selected?',
      message: `Remove ${selectedIds.size} selected item(s) from cart?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    const ids = [...selectedIds];
    for (const id of ids) {
      await removeFromCartById(id);
    }
    showNotification('Selected items removed', 'success');
  };

  const handleRemoveAll = async () => {
    if (cart.length === 0) return;
    const ok = await confirm({
      title: 'Clear cart?',
      message: 'Remove all items from cart?',
      confirmLabel: 'Clear Cart',
      variant: 'danger',
    });
    if (!ok) return;
    await clearCart();
    setSelectedIds(new Set());
    showNotification('Cart cleared', 'success');
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
    if (selectedItems.length === 0) {
      showNotification('Select at least one item to checkout', 'warning');
      return;
    }
    const hasStockIssue = selectedItems.some(item => {
      const product = findProduct(item.productId || item.id);
      return product && getQty(item) > product.stock;
    });
    if (hasStockIssue) {
      showNotification('Some items exceed available stock. Please adjust quantities.', 'error');
      return;
    }
    onClose();
    navigate('/checkout', {
      state: {
        appliedPromo: cartPromo,
        selectedCartIds: selectedItems.map(i => i._id),
      },
    });
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
    const itemKey   = String(item._id);
    const isChecked = selectedIds.has(itemKey);

    return (
      <div
        key={itemKey}
        role="button"
        tabIndex={0}
        className={`cart-item${hasPromo ? ' cart-item-promo' : ''}${isChecked ? ' cart-item-selected' : ''}`}
        onClick={() => toggleItem(itemKey)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleItem(itemKey);
          }
        }}
      >
        <div
          className={`cart-item-check${isChecked ? ' is-checked' : ''}`}
          onClick={(e) => toggleItem(itemKey, e)}
          role="checkbox"
          aria-checked={isChecked}
          aria-label={`Select ${displayName}`}
        >
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => toggleItem(itemKey, e)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>

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

          <div className="cart-item-actions" onClick={(e) => e.stopPropagation()}>
            <div className="quantity-controls">
              <button type="button" className="quantity-btn minus" onClick={() => handleUpdateQty(item, -1)}>-</button>
              <span className="quantity-display">{qty}</span>
              <button
                type="button"
                className={`quantity-btn plus${atMaxStock ? ' disabled' : ''}`}
                onClick={() => handleUpdateQty(item, 1)}
                disabled={atMaxStock}
              >+</button>
            </div>
            <button type="button" className="remove-item" onClick={() => handleRemoveItem(item)}>
              <i className="fas fa-trash"></i> Remove
            </button>
          </div>
        </div>
      </div>
    );
  };

  const promoCartItems    = cart.filter(i => !!i.promoCode);
  const nonPromoCartItems = cart.filter(i => !i.promoCode);

  return createPortal(
    <div className="modal-overlay cart-modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Shopping Cart</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" aria-hidden="true">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
              <div className="cart-select-bar">
                <button
                  type="button"
                  className={`cart-select-all${allSelected ? ' is-checked' : ''}${someSelected ? ' is-partial' : ''}`}
                  onClick={handleSelectAll}
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected; }}
                    onChange={handleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="cart-select-all-label">
                    Select All ({selectedIds.size}/{cart.length})
                  </span>
                </button>
                <div className="cart-select-actions">
                  <button
                    type="button"
                    className="cart-bulk-btn"
                    onClick={handleRemoveSelected}
                    disabled={selectedIds.size === 0}
                  >
                    <i className="fas fa-trash-alt"></i> Remove Selected
                  </button>
                  <button
                    type="button"
                    className="cart-bulk-btn cart-bulk-btn-danger"
                    onClick={handleRemoveAll}
                  >
                    <i className="fas fa-times-circle"></i> Remove All
                  </button>
                </div>
              </div>

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

                {selectedItems.length === 0 ? (
                  <div className="cart-none-selected">
                    <i className="fas fa-info-circle"></i>
                    Select items to checkout — unchecked items stay in your cart.
                  </div>
                ) : (
                  <>
                    {totalDiscount > 0 && (
                      <div className="summary-row cart-original-row">
                        <span>Original Price:</span>
                        <span className="cart-original-amount">
                          ₱{(subtotal + totalDiscount).toLocaleString()}
                        </span>
                      </div>
                    )}

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
                      <span>Total Amount ({selectedItems.length}):</span>
                      <span>₱{subtotal.toLocaleString()}</span>
                    </div>

                    {totalDiscount > 0 && (
                      <div className="cart-savings-badge">
                        <i className="fas fa-piggy-bank"></i>
                        You're saving <strong>₱{totalDiscount.toLocaleString()}</strong> with your promo!
                      </div>
                    )}

                    <div className="cart-points-banner">
                      <span className="cart-points-icon">⭐</span>
                      <span>
                        After delivery you can claim <strong>{pointsToEarn} pts</strong>
                        {' '}toward a free reward!
                      </span>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {cart.length > 0 && (
          <div className="modal-footer">
            <button
              className="btn btn-primary"
              onClick={handleCheckout}
              disabled={selectedItems.length === 0}
            >
              Checkout{selectedItems.length > 0 ? ` (${selectedItems.length})` : ''}
            </button>
          </div>
        )}
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
};

export default CartModal;

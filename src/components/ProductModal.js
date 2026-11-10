import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm, addToCartConfirmRememberKey } from '../context/ConfirmContext';
import { useNavigate } from 'react-router-dom';
import PromoCodeInput from './PromoCodeInput';
import { formatSaleEndLabel, formatSaleEndShort, formatSaleRange, shouldShowSaleBadge, shouldShowPreOrderBadge, hasDiscountedPrice } from '../utils/saleUtils';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import './ProductModal.css';

const REVIEW_CHAR_LIMIT = 120;

const ProductModal = ({ product, onClose, onAddToCart, onAddToWishlist, onRequireLogin }) => {
  const { isAuthenticated, user } = useAuth();
  const allPromos = useQuery(api.promos.getAllPromos) ?? [];
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const navigate = useNavigate();

  const [rating, setRating]           = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview]           = useState('');
  const [appliedPromo, setAppliedPromo]         = useState(null);
  const [showLightbox, setShowLightbox]         = useState(false);
  const [cartToast, setCartToast]               = useState(false);
  const [expandedReviews, setExpandedReviews]   = useState({});
  const [showBuyNowQty, setShowBuyNowQty]       = useState(false);
  const [buyNowQty, setBuyNowQty]               = useState(1);
  const reviewBoxRef = useRef(null);
  const showLightboxRef = useRef(false);
  const showBuyNowQtyRef = useRef(false);
  const ignorePopRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  showLightboxRef.current = showLightbox;
  showBuyNowQtyRef.current = showBuyNowQty;

  const handleRequestClose = useCallback(() => {
    showLightboxRef.current = false;
    showBuyNowQtyRef.current = false;
    setShowLightbox(false);
    setShowBuyNowQty(false);
    onCloseRef.current?.();
  }, []);

  // App-level login stays on top — do not remount / hide product (spam-safe)
  const requireLogin = useCallback((message) => {
    showNotification(message, 'error', { dedupeKey: 'login-required' });
    if (onRequireLogin) onRequireLogin();
    else window.dispatchEvent(new Event('openLoginModal'));
  }, [onRequireLogin, showNotification]);

  const openLightbox = useCallback(() => {
    showLightboxRef.current = true;
    setShowLightbox(true);
  }, []);

  const closeLightbox = useCallback(() => {
    showLightboxRef.current = false;
    setShowLightbox(false);
  }, []);

  const closeBuyNowQty = useCallback(() => {
    showBuyNowQtyRef.current = false;
    setShowBuyNowQty(false);
  }, []);

  const productId = product._id || product.id || '';

  const convexReviews = useQuery(
    api.reviews.getProductReviews,
    productId ? { productId } : 'skip'
  ) ?? [];
  const soldCount = useQuery(
    api.productStats.getProductSoldCount,
    productId ? { productId: String(productId) } : 'skip'
  );

  const reviewGate = useQuery(
    api.reviews.getReviewEligibility,
    isAuthenticated && user?.email && productId
      ? { productId: String(productId), userEmail: user.email }
      : 'skip'
  );

  const hasPurchased =
    reviewGate === undefined
      ? undefined
      : !!(reviewGate?.canReview || reviewGate?.hasReviewed);

  const canLeaveReview = reviewGate?.canReview === true;

  const submitReviewMutation = useMutation(api.reviews.submitReview);
  const deleteReviewMutation = useMutation(api.reviews.deleteReview);

  const isReleased = (() => {
    if (!product.isPreOrder && product.status !== 'preorder') return true;
    if (!product.releaseDate) return false;
    const rt = product.releaseTime || '00:00';
    const releaseMs = new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
    return Date.now() >= releaseMs;
  })();

  const hasUserReviewed = isAuthenticated && user
    ? convexReviews.some(r => r.userEmail === user.email)
    : false;

  useEffect(() => {
    setRating(0);
    setReview('');
    setAppliedPromo(null);
    setExpandedReviews({});
    setShowLightbox(false);
    setShowBuyNowQty(false);
  }, [productId]);

  // One history trap: Back closes lightbox → buy-now → modal, without leaving the current tab.
  // Keep scroll Y around pushState — some browsers jump to top on history changes.
  useEffect(() => {
    const keepScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      try { window.history.scrollRestoration = 'manual'; } catch { /* ignore */ }
      try {
        window.history.pushState({ dkLayer: 'productModal' }, '');
      } catch { /* ignore */ }
      try { window.scrollTo(0, y); } catch { /* ignore */ }
    };
    keepScroll();

    let closedByBack = false;
    const reTrap = () => {
      keepScroll();
    };

    const onPopState = () => {
      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        return;
      }
      // Higher overlays (login/cart/confirm) share the same popstate — don't close product with them
      if (
        document.body.classList.contains('login-modal-open')
        || document.body.classList.contains('cart-modal-open')
        || document.querySelector('.dk-confirm-overlay')
      ) {
        return;
      }
      if (showLightboxRef.current) {
        showLightboxRef.current = false;
        setShowLightbox(false);
        reTrap();
        return;
      }
      if (showBuyNowQtyRef.current) {
        showBuyNowQtyRef.current = false;
        setShowBuyNowQty(false);
        reTrap();
        return;
      }
      closedByBack = true;
      handleRequestClose();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      showLightboxRef.current = false;
      showBuyNowQtyRef.current = false;
      setShowLightbox(false);
      setShowBuyNowQty(false);
      if (!closedByBack && window.history.state?.dkLayer === 'productModal') {
        ignorePopRef.current = true;
        try { window.history.back(); } catch { ignorePopRef.current = false; }
      }
    };
  }, [productId, handleRequestClose]);

  // Keep review box at fixed base height; grow only when text actually overflows
  useEffect(() => {
    const el = reviewBoxRef.current;
    if (!el) return;
    el.style.height = '72px';
    const next = Math.min(Math.max(el.scrollHeight, 72), 180);
    if (next > 72) el.style.height = `${next}px`;
  }, [review, canLeaveReview]);

  const handleDeleteReview = async (reviewId) => {
    const ok = await confirm({
      title: 'Delete review?',
      message: 'This will permanently remove your review for this product.',
      confirmLabel: 'Delete',
      variant: 'danger',
      icon: 'fa-trash-alt',
    });
    if (!ok) return;
    try {
      await deleteReviewMutation({ reviewId, userEmail: user.email });
      showNotification('Review deleted.', 'success');
    } catch {
      showNotification('Failed to delete review.', 'error');
    }
  };

  const discountedPrice = appliedPromo
    ? Math.max(0, product.price - Math.min((product.price * appliedPromo.discount) / 100, appliedPromo.maxDiscount))
    : product.price;

  const getAverageRating = () => {
    if (convexReviews.length === 0) return 0;
    return (convexReviews.reduce((acc, r) => acc + r.rating, 0) / convexReviews.length).toFixed(1);
  };

  const handleSubmitReview = async () => {
    if (!isAuthenticated) {
      requireLogin('Please login to submit a review');
      return;
    }
    if (!canLeaveReview) {
      showNotification(
        reviewGate?.reason || 'You can only review this item once per order.',
        'error'
      );
      return;
    }
    if (rating === 0) { showNotification('Please select a rating', 'error'); return; }
    if (review.trim() === '') { showNotification('Please write a review', 'error'); return; }
    if (review.length > 250) { showNotification('Review must be 250 characters or less', 'error'); return; }

    try {
      const result = await submitReviewMutation({
        productId,
        userEmail: user.email,
        userName: user.name || user.email,
        rating,
        review: review.trim(),
      });
      showNotification(result.updated ? 'Review updated!' : 'Review submitted!', 'success');
      setRating(0);
      setReview('');
    } catch (err) {
      const msg = err?.data || err?.message || 'Failed to submit review. Please try again.';
      showNotification(String(msg).replace(/^.*Error:\s*/i, '') || 'Failed to submit review. Please try again.', 'error');
    }
  };

  const triggerCartToast = () => {
    setCartToast(true);
    setTimeout(() => setCartToast(false), 2200);
  };

  const stockQty = Number(product.stock) || 0;
  const outOfStock = stockQty <= 0;
  const lowStock = !outOfStock && stockQty <= 5;
  const showSaleBadge = !outOfStock && shouldShowSaleBadge(product);
  const showPreOrderBadge = shouldShowPreOrderBadge(product) && !isReleased;

  const handleAddToCartClick = async () => {
    if (!isAuthenticated) {
      requireLogin('Please login to add to cart');
      return;
    }
    if (outOfStock) {
      showNotification('Product is out of stock — you can still favorite it.', 'warning');
      return;
    }
    if (!onAddToCart) {
      showNotification('Unable to add to cart right now.', 'error');
      return;
    }
    const priceDisplay = appliedPromo
      ? `₱${discountedPrice.toLocaleString()} (${appliedPromo.discount}% off)`
      : `₱${product.price.toLocaleString()}`;
    const rememberKey = addToCartConfirmRememberKey(user?.email);
    const ok = await confirm({
      title: 'Add to cart?',
      message: `Add "${product.name}" to cart?\n\nPrice: ${priceDisplay}`,
      confirmLabel: 'Add to Cart',
      variant: 'primary',
      icon: 'fa-shopping-cart',
      rememberKey,
      rememberLabel: 'Do not show again',
    });
    if (!ok) return;
    onAddToCart({ ...product, appliedPromo, finalPrice: discountedPrice });
    triggerCartToast();
  };

  const maxBuyQty = Math.max(1, Math.min(99, Number(product.stock) > 0 ? Number(product.stock) : 99));

  const handleBuyNowClick = () => {
    if (!isAuthenticated) {
      requireLogin('Please login to buy now');
      return;
    }
    if (outOfStock) {
      showNotification('Product is out of stock — you can still favorite it.', 'warning');
      return;
    }
    if (!onAddToCart) {
      showNotification('Unable to checkout right now.', 'error');
      return;
    }
    setBuyNowQty(1);
    showBuyNowQtyRef.current = true;
    setShowBuyNowQty(true);
  };

  const confirmBuyNow = async () => {
    const qty = Math.max(1, Math.min(maxBuyQty, Math.floor(Number(buyNowQty) || 1)));
    setShowBuyNowQty(false);
    const productId = String(product._id || product.id);
    const result = await onAddToCart({
      ...product,
      qty,
      appliedPromo,
      finalPrice: discountedPrice,
    });
    onClose?.();
    navigate('/checkout', {
      state: {
        selectedCartIds: result?.cartItemId ? [result.cartItemId] : undefined,
        buyNowProductId: productId,
        buyNowPromoCode: appliedPromo?.code || null,
        appliedPromo: appliedPromo || null,
        buyNowItem: {
          _id: result?.cartItemId || `buynow-${productId}`,
          productId,
          name: product.name,
          price: product.price,
          image: product.image,
          qty,
          ...(appliedPromo && {
            finalPrice: discountedPrice,
            promoCode: appliedPromo.code,
            promoDiscount: appliedPromo.discount,
            discountAmount: appliedPromo.discountAmount,
          }),
        },
      },
    });
  };

  const handlePreOrderClick = async () => {
    if (!isAuthenticated) {
      requireLogin('Please login to pre-order');
      return;
    }
    if (outOfStock) {
      showNotification('No pre-order slots left — you can still favorite it.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Place pre-order?',
      message: `Pre-order "${product.name}"?\n\nPrice: ₱${product.price.toLocaleString()}\n\nYou'll be notified via email when this item is available.`,
      confirmLabel: 'Pre-Order',
      variant: 'primary',
      icon: 'fa-clock',
    });
    if (!ok) return;
    onAddToCart({ ...product, appliedPromo, finalPrice: discountedPrice });
    triggerCartToast();
  };

  const handleWishlistClick = () => {
    if (!isAuthenticated) {
      requireLogin('Please login to add to favorites');
      return;
    }
    onAddToWishlist(product);
  };

  const toggleExpand = (id) => {
    setExpandedReviews(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useBodyScrollLock(true);

  useEffect(() => {
    document.body.classList.add('product-modal-open');
    return () => {
      document.body.classList.remove('product-modal-open');
    };
  }, []);

  return createPortal(
    <>
      <div className="product-modal-overlay" onClick={handleRequestClose} role="presentation">
        <div
          className="product-modal-content"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={product?.name || 'Product details'}
        >

          {cartToast && (
            <div className="modal-cart-toast">
              <i className="fas fa-check-circle"></i>
              <span>Added to cart!</span>
            </div>
          )}

          <button className="modal-close" onClick={handleRequestClose}>
            <i className="fas fa-times"></i>
          </button>

          <div className="modal-grid">

            {/* LEFT: Image + Rating + Reviews */}
            <div className="modal-image-section">
              {(showPreOrderBadge || showSaleBadge) && (
                <div className="modal-badge-stack">
                  {showSaleBadge && (
                    <div className="sale-badge">
                      <span>SALE</span>
                      {(formatSaleEndShort(product) || formatSaleEndLabel(product)) && (
                        <span className="sale-badge-end">
                          {formatSaleEndShort(product) || formatSaleEndLabel(product)}
                        </span>
                      )}
                    </div>
                  )}
                  {showPreOrderBadge && <div className="pre-order-badge">PRE-ORDER</div>}
                </div>
              )}
              {appliedPromo && (
                <div className="modal-promo-img-badge">
                  <i className="fas fa-tag"></i> {appliedPromo.discount}% OFF
                </div>
              )}
              <img
                src={product.image}
                alt={product.name}
                className="modal-product-img"
                onClick={openLightbox}
              />
              <div className="modal-img-tap-hint">
                <i className="fas fa-search-plus"></i> Tap to zoom
              </div>

              {/* ── Average Rating ── */}
              {convexReviews.length > 0 && (
                <div className="modal-left-rating">
                  <div className="modal-left-rating-stars">
                    {[1,2,3,4,5].map(s => (
                      <i key={s} className={`fas fa-star ${s <= Math.round(getAverageRating()) ? 'filled' : ''}`}></i>
                    ))}
                  </div>
                  <div className="modal-left-rating-score">{getAverageRating()}</div>
                  <div className="modal-left-rating-count">
                    {convexReviews.length} {convexReviews.length === 1 ? 'review' : 'reviews'}
                  </div>
                </div>
              )}

              {/* ── Customer Reviews list ── */}
              {convexReviews.length > 0 && (
                <div className="modal-left-reviews">
                  {convexReviews.map(rev => {
                    const isLong = rev.review.length > REVIEW_CHAR_LIMIT;
                    const isExpanded = expandedReviews[rev._id];
                    return (
                      <div key={rev._id} className="modal-left-review-item">
                        <div className="modal-left-review-header">
                          <div className="modal-left-review-user">
                            <i className="fas fa-user-circle"></i>
                            <span>{rev.userName}</span>
                          </div>
                          <div className="modal-left-review-actions">
                            <div className="modal-left-review-stars">
                              {[1,2,3,4,5].map(s => (
                                <i key={s} className={`fas fa-star ${s <= rev.rating ? 'filled' : ''}`}></i>
                              ))}
                            </div>
                            {isAuthenticated && user?.email === rev.userEmail && (
                              <button
                                className="modal-left-review-delete"
                                onClick={() => handleDeleteReview(rev._id)}
                                title="Delete your review"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="modal-left-review-text">
                          {isLong && !isExpanded
                            ? rev.review.slice(0, REVIEW_CHAR_LIMIT) + '...'
                            : rev.review}
                        </p>
                        {isLong && (
                          <button
                            className="modal-left-review-toggle"
                            onClick={() => toggleExpand(rev._id)}
                          >
                            {isExpanded ? 'See less ▲' : 'See more ▼'}
                          </button>
                        )}
                        <small className="modal-left-review-date">
                          {new Date(rev.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Details + Review Form */}
            <div className="modal-details-section">
              <div className="modal-product-info">
                <div className="product-group">{product.kpopGroup}</div>
                <h2>{product.name}</h2>

                {product.description && (
                  <p className="product-description">{product.description}</p>
                )}

                <div className="price-section">
                  {appliedPromo ? (
                    <>
                      <div className="current-price promo-price">₱{discountedPrice.toLocaleString()}</div>
                      <div className="original-price">₱{product.price.toLocaleString()}</div>
                      <div className="discount-badge-inline">-{appliedPromo.discount}%</div>
                    </>
                  ) : (
                    <>
                      <div className={`current-price${showSaleBadge ? ' sale' : ''}`}>₱{product.price.toLocaleString()}</div>
                      {showSaleBadge && hasDiscountedPrice(product) && (
                        <div className="original-price">₱{product.originalPrice.toLocaleString()}</div>
                      )}
                    </>
                  )}
                </div>

                {showSaleBadge && (formatSaleEndLabel(product) || formatSaleRange(product)) && (
                  <div className="modal-sale-period">
                    <i className="fas fa-clock"></i>
                    <span>{formatSaleEndLabel(product) || `Sale period: ${formatSaleRange(product)}`}</span>
                  </div>
                )}

                <div className={`stock-info ${outOfStock ? 'stock-out' : lowStock ? 'stock-low' : 'stock-in'}`}>
                  <i className="fas fa-box"></i>
                  <span>
                    {outOfStock
                      ? 'Out of stock'
                      : lowStock
                        ? `Only ${stockQty} left`
                        : `${stockQty} items in stock`}
                  </span>
                </div>
                <div className="sold-info">
                  <i className="fas fa-shopping-bag"></i>
                  <span>
                    {typeof soldCount === 'number'
                      ? `${soldCount.toLocaleString()} sold`
                      : '…'}
                  </span>
                </div>

                {isAuthenticated && (
                  <div className="modal-promo-section">
                    <PromoCodeInput
                      promos={allPromos}
                      onPromoApplied={setAppliedPromo}
                      onPromoRemoved={() => setAppliedPromo(null)}
                      subtotal={product.price}
                      appliedPromo={appliedPromo}
                      productGroup={product.kpopGroup || ''}
                    />
                  </div>
                )}

                <div className="modal-actions">
                  {product.isPreOrder && !isReleased ? (
                    <>
                      <button className="btn btn-preorder" onClick={handlePreOrderClick} disabled={outOfStock}>
                        <i className="fas fa-shopping-cart"></i> Pre-Order Now
                      </button>
                      <button type="button" className="btn-fav-outline" onClick={handleWishlistClick} title="Add to Favorites" aria-label="Add to favorites">
                        <i className="fas fa-heart" aria-hidden="true"></i>
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-add-cart" onClick={handleAddToCartClick} disabled={outOfStock}>
                        <i className="fas fa-shopping-cart"></i> Add to Cart
                      </button>
                      {isAuthenticated && (
                        <button className="btn btn-buy-now" onClick={handleBuyNowClick} disabled={outOfStock}>
                          <i className="fas fa-bolt"></i> Buy Now
                        </button>
                      )}
                      <button type="button" className="btn-fav-outline" onClick={handleWishlistClick} title="Add to Favorites" aria-label="Add to favorites">
                        <i className="fas fa-heart" aria-hidden="true"></i>
                      </button>
                    </>
                  )}
                </div>
                {outOfStock && (
                  <p className="modal-oos-hint">Out of stock — favorite is still available.</p>
                )}

                {product.isPreOrder && !isReleased && product.preOrderSlots !== undefined && (
                  <div className="preorder-slots">
                    <i className="fas fa-info-circle"></i>
                    {product.preOrderSlots > 0
                      ? <span>{product.preOrderSlots} pre-order slots available</span>
                      : <span className="sold-out">Pre-order slots full</span>}
                  </div>
                )}
              </div>

              {/* Review Form only — list is on the left */}
              <div className="review-section">
                <h3><i className="fas fa-star"></i> Rate & Review</h3>

                {!isAuthenticated ? (
                  <div className="login-to-review">
                    <i className="fas fa-lock"></i>
                    <p>Please login to leave a review</p>
                  </div>
                ) : reviewGate === undefined ? (
                  <div className="login-to-review">
                    <i className="fas fa-spinner fa-spin"></i>
                    <p>Checking purchase history...</p>
                  </div>
                ) : !canLeaveReview ? (
                  <div className="login-to-review">
                    <i className="fas fa-info-circle"></i>
                    <p>
                      {reviewGate?.reason ||
                        (hasPurchased
                          ? 'You already reviewed this item. Order again to leave another review.'
                          : 'Only customers who received this item can leave a review')}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rating-input">
                      <label>Your Rating:</label>
                      <div className="stars-input">
                        {[1,2,3,4,5].map(s => (
                          <i key={s}
                            className={`fas fa-star ${s <= (hoverRating || rating) ? 'active' : ''}`}
                            onMouseEnter={() => setHoverRating(s)}
                            onMouseLeave={() => setHoverRating(0)}
                            onClick={() => setRating(s)}
                          ></i>
                        ))}
                      </div>
                    </div>
                    <div className="review-input">
                      <label>Your Review: ({review.length}/250)</label>
                      <textarea
                        ref={reviewBoxRef}
                        className="review-comment-box"
                        value={review}
                        rows={3}
                        maxLength={250}
                        placeholder="Share your thoughts about this product..."
                        onChange={(e) => {
                          if (e.target.value.length > 250) return;
                          setReview(e.target.value);
                        }}
                      />
                    </div>
                    <button
                      className="btn btn-submit-review"
                      onClick={handleSubmitReview}
                      disabled={rating === 0 || review.trim() === ''}
                    >
                      <i className="fas fa-paper-plane"></i> Submit Review
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showLightbox && (
        <div className="modal-lightbox" onClick={closeLightbox}>
          <button className="modal-lightbox-close" onClick={closeLightbox}>
            <i className="fas fa-times"></i>
          </button>
          <img src={product.image} alt={product.name} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {showBuyNowQty && (
        <div className="buynow-qty-overlay" onClick={closeBuyNowQty} role="presentation">
          <div className="buynow-qty-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button type="button" className="buynow-qty-close" onClick={closeBuyNowQty} aria-label="Close">
              <i className="fas fa-times" />
            </button>
            <h3>Buy Now</h3>
            <p className="buynow-qty-name">{product.name}</p>
            <p className="buynow-qty-hint">How many items do you want to buy?</p>
            <div className="buynow-qty-stepper">
              <button
                type="button"
                className="buynow-qty-btn"
                disabled={buyNowQty <= 1}
                onClick={() => setBuyNowQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="number"
                className="buynow-qty-input"
                min={1}
                max={maxBuyQty}
                value={buyNowQty}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value) || 1);
                  setBuyNowQty(Math.max(1, Math.min(maxBuyQty, n)));
                }}
              />
              <button
                type="button"
                className="buynow-qty-btn"
                disabled={buyNowQty >= maxBuyQty}
                onClick={() => setBuyNowQty((q) => Math.min(maxBuyQty, q + 1))}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <p className="buynow-qty-total">
              Total:{' '}
              <strong>
                ₱{((discountedPrice || product.price) * buyNowQty).toLocaleString('en-PH')}
              </strong>
            </p>
            <button type="button" className="buynow-qty-confirm" onClick={confirmBuyNow}>
              <i className="fas fa-bolt" /> Continue to Checkout
            </button>
          </div>
        </div>
      )}

    </>,
    getOverlayRoot() || document.body
  );
};

export default ProductModal;
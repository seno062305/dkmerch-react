import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm, addToCartConfirmRememberKey } from '../context/ConfirmContext';
import { useNavigate } from 'react-router-dom';
import LoginModal from './LoginModal';
import PromoCodeInput from './PromoCodeInput';
import { formatSaleRange } from '../utils/saleUtils';
import './ProductModal.css';

const REVIEW_CHAR_LIMIT = 120;

const ProductModal = ({ product, onClose, onAddToCart, onAddToWishlist }) => {
  const { isAuthenticated, user } = useAuth();
  const allPromos = useQuery(api.promos.getAllPromos) ?? [];
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const navigate = useNavigate();

  const [rating, setRating]           = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview]           = useState('');
  const [showLoginModal, setShowLoginModal]     = useState(false);
  const [hideProductModal, setHideProductModal] = useState(false);
  const [appliedPromo, setAppliedPromo]         = useState(null);
  const [showLightbox, setShowLightbox]         = useState(false);
  const [cartToast, setCartToast]               = useState(false);
  const [expandedReviews, setExpandedReviews]   = useState({});
  const [showBuyNowQty, setShowBuyNowQty]       = useState(false);
  const [buyNowQty, setBuyNowQty]               = useState(1);
  const reviewBoxRef = useRef(null);

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

    // ✅ FIX: Read scrollY from body.style.top if already fixed,
    // otherwise read window.scrollY directly.
    // This prevents jumping to top on close.
    const getScrollY = () => {
      const bodyTop = document.body.style.top;
      if (bodyTop) return Math.abs(parseInt(bodyTop, 10)) || 0;
      return window.scrollY;
    };

    const scrollY = getScrollY();

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      // ✅ Restore exact scroll position — no jump
      window.scrollTo({ top: scrollY, behavior: 'instant' });
    };
  }, [productId]);

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
      showNotification('Please login to submit a review', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
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

  const handleAddToCartClick = async () => {
    if (!isAuthenticated) {
      showNotification('Please login to add to cart', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
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
      rememberLabel: 'Do not show again for my account',
    });
    if (!ok) return;
    onAddToCart({ ...product, appliedPromo, finalPrice: discountedPrice });
    triggerCartToast();
  };

  const maxBuyQty = Math.max(1, Math.min(99, Number(product.stock) > 0 ? Number(product.stock) : 99));

  const handleBuyNowClick = () => {
    if (!isAuthenticated) {
      showNotification('Please login to buy now', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
      return;
    }
    if (product.stock === 0) {
      showNotification('Product is out of stock', 'error');
      return;
    }
    if (!onAddToCart) {
      showNotification('Unable to checkout right now.', 'error');
      return;
    }
    setBuyNowQty(1);
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
      showNotification('Please login to pre-order', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
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
      showNotification('Please login to add to favorites', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
      return;
    }
    onAddToWishlist(product);
  };

  const handleLoginModalClose = () => {
    setShowLoginModal(false);
    setHideProductModal(false);
  };

  const toggleExpand = (id) => {
    setExpandedReviews(prev => ({ ...prev, [id]: !prev[id] }));
  };

  useEffect(() => {
    document.body.classList.add('product-modal-open');
    return () => document.body.classList.remove('product-modal-open');
  }, []);

  if (hideProductModal) return <>{showLoginModal && <LoginModal onClose={handleLoginModalClose} />}</>;

  return (
    <>
      <div className="product-modal-overlay" onClick={onClose}>
        <div className="product-modal-content" onClick={(e) => e.stopPropagation()}>

          {cartToast && (
            <div className="modal-cart-toast">
              <i className="fas fa-check-circle"></i>
              <span>Added to cart!</span>
            </div>
          )}

          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>

          <div className="modal-grid">

            {/* LEFT: Image + Rating + Reviews */}
            <div className="modal-image-section">
              {product.isPreOrder && !isReleased && <div className="pre-order-badge">PRE-ORDER</div>}
              {product.isSale && !product.isPreOrder && <div className="sale-badge">SALE</div>}
              {appliedPromo && (
                <div className="modal-promo-img-badge">
                  <i className="fas fa-tag"></i> {appliedPromo.discount}% OFF
                </div>
              )}
              <img
                src={product.image}
                alt={product.name}
                className="modal-product-img"
                onClick={() => setShowLightbox(true)}
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
                      <div className="current-price">₱{product.price.toLocaleString()}</div>
                      {product.originalPrice > product.price && (
                        <div className="original-price">₱{product.originalPrice.toLocaleString()}</div>
                      )}
                    </>
                  )}
                </div>

                {product.isSale && formatSaleRange(product) && (
                  <div className="modal-sale-period">
                    <i className="fas fa-clock"></i>
                    <span>Sale period: {formatSaleRange(product)}</span>
                  </div>
                )}

                <div className="stock-info">
                  <i className="fas fa-box"></i>
                  <span>{product.stock > 0 ? `${product.stock} items in stock` : 'Out of stock'}</span>
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
                      <button className="btn btn-preorder" onClick={handlePreOrderClick} disabled={product.stock === 0}>
                        <i className="fas fa-shopping-cart"></i> Pre-Order Now
                      </button>
                      <button type="button" className="btn-fav-outline" onClick={handleWishlistClick} title="Add to Favorites" aria-label="Add to favorites">
                        <i className="fas fa-heart" aria-hidden="true"></i>
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-add-cart" onClick={handleAddToCartClick} disabled={product.stock === 0}>
                        <i className="fas fa-shopping-cart"></i> Add to Cart
                      </button>
                      {isAuthenticated && (
                        <button className="btn btn-buy-now" onClick={handleBuyNowClick} disabled={product.stock === 0}>
                          <i className="fas fa-bolt"></i> Buy Now
                        </button>
                      )}
                      <button type="button" className="btn-fav-outline" onClick={handleWishlistClick} title="Add to Favorites" aria-label="Add to favorites">
                        <i className="fas fa-heart" aria-hidden="true"></i>
                      </button>
                    </>
                  )}
                </div>

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
        <div className="modal-lightbox" onClick={() => setShowLightbox(false)}>
          <button className="modal-lightbox-close" onClick={() => setShowLightbox(false)}>
            <i className="fas fa-times"></i>
          </button>
          <img src={product.image} alt={product.name} onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {showBuyNowQty && (
        <div className="buynow-qty-overlay" onClick={() => setShowBuyNowQty(false)} role="presentation">
          <div className="buynow-qty-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <button type="button" className="buynow-qty-close" onClick={() => setShowBuyNowQty(false)} aria-label="Close">
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

      {showLoginModal && <LoginModal onClose={handleLoginModalClose} />}
    </>
  );
};

export default ProductModal;
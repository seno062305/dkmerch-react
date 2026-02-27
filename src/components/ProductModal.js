import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import LoginModal from './LoginModal';
import PromoCodeInput from './PromoCodeInput';
import './ProductModal.css';

const ProductModal = ({ product, onClose, onAddToCart, onAddToWishlist }) => {
  const { isAuthenticated, user } = useAuth();
  const allPromos = useQuery(api.promos.getAllPromos) ?? [];
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [rating, setRating]           = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [review, setReview]           = useState('');
  const [showLoginModal, setShowLoginModal]       = useState(false);
  const [hideProductModal, setHideProductModal]   = useState(false);
  const [appliedPromo, setAppliedPromo]           = useState(null);
  const [showLightbox, setShowLightbox]           = useState(false);

  const productId = product._id || product.id || '';

  const convexReviews = useQuery(
    api.reviews.getProductReviews,
    productId ? { productId } : 'skip'
  ) ?? [];

  const submitReviewMutation = useMutation(api.reviews.submitReview);
  const deleteReviewMutation = useMutation(api.reviews.deleteReview);

  // ✅ FIX: A pre-order is "released" (show Add to Cart) if:
  //   1. It has no isPreOrder flag at all (regular product), OR
  //   2. It IS a pre-order BUT its releaseDate+releaseTime is already past
  const isReleased = (() => {
    // Not a pre-order at all → always show Add to Cart
    if (!product.isPreOrder && product.status !== 'preorder') return true;
    // Pre-order with no release date → still a pre-order
    if (!product.releaseDate) return false;
    // Pre-order with a release date → check if past
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

    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [productId]);

  const handleDeleteReview = async (reviewId) => {
    if (!window.confirm('Delete your review?')) return;
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
    } catch {
      showNotification('Failed to submit review. Please try again.', 'error');
    }
  };

  const handleAddToCartClick = () => {
    if (!isAuthenticated) {
      showNotification('Please login to add to cart', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
      return;
    }
    onAddToCart({ ...product, appliedPromo, finalPrice: discountedPrice });
  };

  const handlePreOrderClick = () => {
    if (!isAuthenticated) {
      showNotification('Please login to pre-order', 'error');
      setHideProductModal(true);
      setShowLoginModal(true);
      return;
    }
    onAddToCart({ ...product, appliedPromo, finalPrice: discountedPrice });
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

  if (hideProductModal) return <>{showLoginModal && <LoginModal onClose={handleLoginModalClose} />}</>;

  return (
    <>
      <div className="product-modal-overlay" onClick={onClose}>
        <div className="product-modal-content" onClick={(e) => e.stopPropagation()}>

          <button className="modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>

          <div className="modal-grid">

            {/* ── LEFT: Image ── */}
            <div className="modal-image-section">
              {/* ✅ Only show PRE-ORDER badge if it's a pre-order AND not yet released */}
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
            </div>

            {/* ── RIGHT: Details ── */}
            <div className="modal-details-section">
              <div className="modal-product-info">
                <div className="product-group">{product.kpopGroup}</div>
                <h2>{product.name}</h2>

                {product.description && (
                  <p className="product-description">{product.description}</p>
                )}

                {convexReviews.length > 0 && (
                  <div className="average-rating">
                    <div className="stars">
                      {[1,2,3,4,5].map(s => (
                        <i key={s} className={`fas fa-star ${s <= Math.round(getAverageRating()) ? 'filled' : ''}`}></i>
                      ))}
                    </div>
                    <span className="rating-text">
                      {getAverageRating()} ({convexReviews.length} {convexReviews.length === 1 ? 'review' : 'reviews'})
                    </span>
                  </div>
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

                <div className="stock-info">
                  <i className="fas fa-box"></i>
                  <span>{product.stock > 0 ? `${product.stock} items in stock` : 'Out of stock'}</span>
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
                  {/* ✅ Show Pre-Order button ONLY if it's a pre-order AND not yet released */}
                  {product.isPreOrder && !isReleased ? (
                    <>
                      <button className="btn btn-preorder" onClick={handlePreOrderClick} disabled={product.stock === 0}>
                        <i className="fas fa-shopping-cart"></i> Pre-Order Now
                      </button>
                      <button className="btn btn-fav-outline" onClick={handleWishlistClick} title="Add to Favorites">
                        <i className="fas fa-star"></i>
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-add-cart" onClick={handleAddToCartClick} disabled={product.stock === 0}>
                        <i className="fas fa-shopping-cart"></i> Add to Cart
                      </button>
                      <button className="btn btn-fav-outline" onClick={handleWishlistClick} title="Add to Favorites">
                        <i className="fas fa-star"></i>
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

              {/* ── Review Section ── */}
              <div className="review-section">
                <h3><i className="fas fa-star"></i> {hasUserReviewed ? 'Update Review' : 'Rate & Review'}</h3>

                {!isAuthenticated ? (
                  <div className="login-to-review">
                    <i className="fas fa-lock"></i>
                    <p>Please login to leave a review</p>
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
                        value={review}
                        onChange={(e) => { if (e.target.value.length <= 250) setReview(e.target.value); }}
                        placeholder="Share your thoughts about this product..."
                        rows="4"
                        maxLength="250"
                      />
                    </div>
                    <button
                      className="btn btn-submit-review"
                      onClick={handleSubmitReview}
                      disabled={rating === 0 || review.trim() === ''}
                    >
                      <i className="fas fa-paper-plane"></i>{' '}
                      {hasUserReviewed ? 'Update Review' : 'Submit Review'}
                    </button>
                  </>
                )}

                {convexReviews.length > 0 && (
                  <div className="all-reviews">
                    <h4>Customer Reviews ({convexReviews.length})</h4>
                    {convexReviews.slice(0, 3).map(rev => (
                      <div key={rev._id} className="review-item">
                        <div className="review-header">
                          <div className="reviewer-info">
                            <i className="fas fa-user-circle"></i>
                            <strong>{rev.userName}</strong>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="review-stars">
                              {[1,2,3,4,5].map(s => (
                                <i key={s} className={`fas fa-star ${s <= rev.rating ? 'filled' : ''}`}></i>
                              ))}
                            </div>
                            {isAuthenticated && user?.email === rev.userEmail && (
                              <button
                                onClick={() => handleDeleteReview(rev._id)}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  color: '#dc2626', fontSize: 13, padding: '2px 4px',
                                  borderRadius: 4, transition: 'background 0.2s'
                                }}
                                title="Delete your review"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="review-text">{rev.review}</p>
                        <small className="review-date">
                          {new Date(rev.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                    ))}
                  </div>
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

      {showLoginModal && <LoginModal onClose={handleLoginModalClose} />}
    </>
  );
};

export default ProductModal;
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollectionProducts } from '../utils/productStorage';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { PointsBadge } from '../utils/pointsUtils';
import LoginModal from './LoginModal';
import './WeverseSection.css';

const MAX_WISHLIST = 10;

const getReleaseMs = (product) => {
  if (!product.isPreOrder || !product.releaseDate) return null;
  const rt = product.releaseTime || '00:00';
  return new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
};

const isReleased = (product) => {
  const ms = getReleaseMs(product);
  return ms !== null && Date.now() >= ms;
};

const WeverseSection = ({ onProductClick, activePromo, highlightPromo }) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  const products       = useCollectionProducts();
  const wishlistItems  = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  const saleProducts = (products || [])
    .filter(p =>
      p.isSale === true ||
      (p.originalPrice && Number(p.originalPrice) > Number(p.price))
    )
    .sort((a, b) => {
      const aReleased  = isReleased(a);
      const bReleased  = isReleased(b);
      const aReleaseMs = getReleaseMs(a) || 0;
      const bReleaseMs = getReleaseMs(b) || 0;
      if (aReleased  && !bReleased) return -1;
      if (!aReleased && bReleased)  return 1;
      if (aReleased  && bReleased)  return bReleaseMs - aReleaseMs;
      return (b._creationTime || 0) - (a._creationTime || 0);
    })
    .slice(0, 8);

  const handleWishlistClick = (e, product) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      setShowLoginModal(true);
      showNotification('Please login to add to favorites', 'error');
      return;
    }
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    if (!alreadyWishlisted && wishlistItems.length >= MAX_WISHLIST) {
      showNotification(`Favorites limit reached (max ${MAX_WISHLIST}). Remove an item first.`, 'error');
      return;
    }
    const msg = alreadyWishlisted
      ? `Remove "${product.name}" from Favorites?`
      : `Add "${product.name}" to Favorites?`;
    if (!window.confirm(msg)) return;
    toggleWishlist(product);
    showNotification(
      alreadyWishlisted ? `${product.name} removed from favorites!` : `${product.name} added to favorites!`,
      'success'
    );
  };

  if (!saleProducts || saleProducts.length === 0) return null;

  const displayPromo = highlightPromo || activePromo;

  return (
    <>
      <section className="weverse-section" id="collections">
        <div className="wv-section-header">
          <h2 className="wv-section-title">
            <i className="fas fa-tag"></i> On Sale
          </h2>
          <p className="wv-section-sub">Limited time discounts on selected K-Pop merch</p>

          {displayPromo && (
            <div className={`wv-promo-banner ${highlightPromo ? 'wv-promo-banner-highlight' : ''}`}>
              <i className="fas fa-tag"></i>
              <span>
                <strong>{displayPromo.name} Promo:</strong> Use code{' '}
                <span className="wv-promo-code">{displayPromo.code}</span> for{' '}
                {displayPromo.discount}% off {displayPromo.name} merch!
                {highlightPromo && (
                  <span className="wv-promo-banner-sub"> · Showing {highlightPromo.name} products only</span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="wv-grid">
          {saleProducts.map((product) => {
            const pid      = product._id || product.id;
            const hasPromo = isPromoProduct(product);

            const releaseMs = getReleaseMs(product);
            const diffMs    = releaseMs !== null ? Date.now() - releaseMs : -1;
            const showReleasedBadge = diffMs >= 0 && diffMs < 60 * 60 * 1000;

            const discountPct =
              product.originalPrice && Number(product.originalPrice) > Number(product.price)
                ? Math.round(
                    ((Number(product.originalPrice) - Number(product.price)) /
                      Number(product.originalPrice)) * 100
                  )
                : null;

            return (
              <div
                key={pid}
                className={`wv-card ${hasPromo ? 'wv-card-promo' : ''} ${showReleasedBadge ? 'wv-card-released' : ''}`}
                onClick={() => onProductClick && onProductClick(product)}
              >
                {showReleasedBadge
                  ? <div className="wv-released-badge"><i className="fas fa-bolt"></i> Just Released</div>
                  : discountPct && <div className="wv-sale-badge">-{discountPct}%</div>
                }

                {hasPromo && !showReleasedBadge && (
                  <div className="wv-promo-badge">
                    <i className="fas fa-tag"></i> {activePromo.discount}% OFF
                  </div>
                )}

                <button
                  className={`wv-card-fav ${isWishlisted(pid) ? 'active' : ''}`}
                  onClick={(e) => handleWishlistClick(e, product)}
                  title={isWishlisted(pid) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <i className="fas fa-star"></i>
                </button>

                <div className="wv-card-img">
                  <img src={product.image} alt={product.name} />
                </div>

                <div className="wv-card-info">
                  <div className="wv-card-group">{product.kpopGroup}</div>
                  <div className="wv-card-name">{product.name}</div>
                  <div className="wv-card-price-row">
                    <span className="wv-card-price-current sale">
                      ₱{Number(product.price)?.toLocaleString()}
                    </span>
                    {Number(product.originalPrice) > Number(product.price) && (
                      <span className="wv-card-price-original">
                        ₱{Number(product.originalPrice)?.toLocaleString()}
                      </span>
                    )}
                    {/* ✅ Points badge */}
                    <PointsBadge price={product.price} />
                  </div>
                  {hasPromo && (
                    <div className="wv-card-promo-hint">
                      <i className="fas fa-ticket-alt"></i> Promo available · use{' '}
                      <strong>{activePromo.code}</strong>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="wv-see-all-row">
          <button className="wv-see-all" onClick={() => navigate('/collections')}>
            See All Items
          </button>
        </div>
      </section>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default WeverseSection;
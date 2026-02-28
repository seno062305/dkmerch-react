import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCollectionProducts } from '../utils/productStorage';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import LoginModal from './LoginModal';
import './WeverseSection.css';

const WeverseSection = ({ onProductClick, activePromo, highlightPromo }) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  // ✅ Use collection products (includes released pre-orders + regular)
  const products = useCollectionProducts();
  const wishlistItems = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  // ✅ Filter: only sale/discounted products
  // Sort: newest first (_creationTime descending) so latest added sale item shows first
  // Limit: max 5 cards
  const saleProducts = (products || [])
    .filter(p =>
      p.isSale === true ||
      (p.originalPrice && Number(p.originalPrice) > Number(p.price))
    )
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0))
    .slice(0, 5);

  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  const handleWishlistClick = (e, product) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      setShowLoginModal(true);
      showNotification('Please login to add to favorites', 'error');
      return;
    }
    const pid = product._id || product.id;
    toggleWishlist(product);
    showNotification(
      isWishlisted(pid) ? 'Removed from favorites' : 'Added to favorites',
      'success'
    );
  };

  const handleProductClick = (product) => {
    if (onProductClick) onProductClick(product);
  };

  // ✅ If no sale products, don't render the section at all
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
            const pid = product._id || product.id;
            const hasPromo = isPromoProduct(product);
            const discountPct =
              product.originalPrice && Number(product.originalPrice) > Number(product.price)
                ? Math.round(
                    ((Number(product.originalPrice) - Number(product.price)) /
                      Number(product.originalPrice)) *
                      100
                  )
                : null;

            return (
              <div
                key={pid}
                className={`wv-card ${hasPromo ? 'wv-card-promo' : ''}`}
                onClick={() => handleProductClick(product)}
              >
                {discountPct && (
                  <div className="wv-sale-badge">-{discountPct}%</div>
                )}

                {hasPromo && (
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
            See All Sale Items
          </button>
        </div>
      </section>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default WeverseSection;
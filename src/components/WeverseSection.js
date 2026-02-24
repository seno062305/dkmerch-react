import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../utils/productStorage';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import LoginModal from './LoginModal';
import './WeverseSection.css';

const WeverseSection = ({ onProductClick, activePromo, highlightPromo }) => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  const products = useProducts();
  const wishlistItems = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  // ── Auto-filter to promo group when coming from email Shop Now link ──
  useEffect(() => {
    if (highlightPromo?.name) {
      setActiveFilter(highlightPromo.name.toUpperCase());
    }
  }, [highlightPromo]);

  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  const groups = [
    'all', 'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN',
    'STRAY KIDS', 'EXO', 'RED VELVET', 'NEWJEANS'
  ];

  const filteredProducts = (
    activeFilter === 'all'
      ? [...products]
      : [...products].filter(p => p.kpopGroup?.toUpperCase() === activeFilter.toUpperCase())
  ).sort((a, b) => {
    const aSales = a.salesCount || a.totalSold || 0;
    const bSales = b.salesCount || b.totalSold || 0;
    return bSales - aSales;
  });

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

  if (!products || products.length === 0) {
    return (
      <section className="weverse-section">
        <div style={{ padding: '50px', textAlign: 'center' }}>
          <h3>No products yet</h3>
          <p>Add products from Admin Panel</p>
        </div>
      </section>
    );
  }

  // The promo to show in banner — highlightPromo takes priority over activePromo
  const displayPromo = highlightPromo || activePromo;

  return (
    <>
      <section className="weverse-section" id="collections">
        <div className="wv-section-header">
          <h2 className="wv-section-title">
            <i className="fas fa-fire"></i> Top Selling
          </h2>
          <p className="wv-section-sub">Most loved by our K-Pop community</p>

          {/* Promo banner */}
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

        <div className="wv-filter-bar">
          {groups.map(group => (
            <button
              key={group}
              className={`wv-filter-tab ${activeFilter === group ? 'active' : ''}`}
              onClick={() => setActiveFilter(group)}
            >
              {group === 'all' ? 'All' : group}
              {activePromo && activePromo.isActive &&
                group.toUpperCase() === activePromo.name?.toUpperCase() && (
                <span className="wv-tab-promo-dot" title={`${activePromo.discount}% off!`}>●</span>
              )}
            </button>
          ))}
        </div>

        <div className="wv-grid">
          {filteredProducts.length === 0 ? (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#999' }}>
              No products found for {activeFilter}.
            </div>
          ) : (
            filteredProducts.map((product, index) => {
              const pid = product._id || product.id;
              const salesCount = product.salesCount || product.totalSold || 0;
              const hasPromo = isPromoProduct(product);

              return (
                <div
                  key={pid}
                  className={`wv-card ${hasPromo ? 'wv-card-promo' : ''}`}
                  onClick={() => handleProductClick(product)}
                >
                  {index < 3 && salesCount > 0 && (
                    <div className={`wv-rank-badge rank-${index + 1}`}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </div>
                  )}

                  {product.isSale && <div className="wv-sale-badge">SALE</div>}

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
                      <span className={`wv-card-price-current ${product.isSale ? 'sale' : ''}`}>
                        ₱{product.price?.toLocaleString()}
                      </span>
                      {product.originalPrice > product.price && (
                        <span className="wv-card-price-original">
                          ₱{product.originalPrice?.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {salesCount > 0 && (
                      <div className="wv-card-sold">
                        <i className="fas fa-shopping-bag"></i> {salesCount} sold
                      </div>
                    )}
                    {hasPromo && (
                      <div className="wv-card-promo-hint">
                        <i className="fas fa-ticket-alt"></i> Promo available · use <strong>{activePromo.code}</strong>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="wv-see-all-row">
          {highlightPromo ? (
            <button className="wv-see-all" onClick={() => setActiveFilter('all')}>
              Show All Products
            </button>
          ) : (
            <button className="wv-see-all" onClick={() => navigate('/collections')}>
              See All
            </button>
          )}
        </div>
      </section>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default WeverseSection;
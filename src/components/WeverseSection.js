import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../utils/productStorage';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import LoginModal from './LoginModal';
import './WeverseSection.css';

const WeverseSection = ({ onProductClick }) => {
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

  const groups = [
    'all', 'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN',
    'STRAY KIDS', 'EXO', 'RED VELVET', 'NEWJEANS'
  ];

  // ✅ Filter by group then sort by top selling (salesCount or totalSold)
  const filteredProducts = (
    activeFilter === 'all'
      ? [...products]
      : [...products].filter(p => p.kpopGroup === activeFilter)
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
      isWishlisted(pid)
        ? 'Removed from favorites'
        : 'Added to favorites',
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

  return (
    <>
      <section className="weverse-section" id="collections">

        {/* ✅ Top Selling label */}
        <div className="wv-section-header">
          <h2 className="wv-section-title">
            <i className="fas fa-fire"></i> Top Selling
          </h2>
          <p className="wv-section-sub">Most loved by our K-Pop community</p>
        </div>

        <div className="wv-filter-bar">
          {groups.map(group => (
            <button
              key={group}
              className={`wv-filter-tab ${activeFilter === group ? 'active' : ''}`}
              onClick={() => setActiveFilter(group)}
            >
              {group === 'all' ? 'All' : group}
            </button>
          ))}
        </div>

        <div className="wv-grid">
          {filteredProducts.map((product, index) => {
            const pid = product._id || product.id;
            const salesCount = product.salesCount || product.totalSold || 0;
            return (
              <div
                key={pid}
                className="wv-card"
                onClick={() => handleProductClick(product)}
              >
                {/* ✅ Top seller rank badge for top 3 */}
                {index < 3 && salesCount > 0 && (
                  <div className={`wv-rank-badge rank-${index + 1}`}>
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                  </div>
                )}

                {product.isSale && <div className="wv-sale-badge">SALE</div>}

                {/* ⭐ Star favorite button */}
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
                  {/* ✅ Show sold count if available */}
                  {salesCount > 0 && (
                    <div className="wv-card-sold">
                      <i className="fas fa-shopping-bag"></i> {salesCount} sold
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="wv-see-all-row">
          <button className="wv-see-all" onClick={() => navigate('/collections')}>
            See All
          </button>
        </div>
      </section>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default WeverseSection;
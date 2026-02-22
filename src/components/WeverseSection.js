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

  const filteredProducts =
    activeFilter === 'all'
      ? products
      : products.filter(p => p.kpopGroup === activeFilter);

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
          {filteredProducts.map(product => {
            const pid = product._id || product.id;
            return (
              <div
                key={pid}
                className="wv-card"
                onClick={() => handleProductClick(product)}
              >
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
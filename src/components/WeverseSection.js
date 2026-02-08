import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProducts } from '../utils/productStorage';
import { toggleWishlist, isInWishlist } from '../utils/wishlistStorage';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import LoginModal from './LoginModal';
import './WeverseSection.css';

const WeverseSection = ({ onProductClick }) => {
  const [activeFilter, setActiveFilter] = useState('all');
  const [products, setProducts] = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  useEffect(() => {
    loadProducts();
    loadWishlist();

    const handleStorageChange = () => {
      loadWishlist();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadProducts = () => {
    setProducts(getProducts());
  };

  const loadWishlist = () => {
    const allProducts = getProducts();
    const wishlist = allProducts.filter(p => isInWishlist(p.id));
    setWishlistItems(wishlist.map(p => p.id));
  };

  const groups = [
    'all',
    'BTS',
    'BLACKPINK',
    'TWICE',
    'SEVENTEEN',
    'STRAY KIDS',
    'EXO',
    'RED VELVET',
    'NEWJEANS'
  ];

  const filteredProducts =
    activeFilter === 'all'
      ? products
      : products.filter(p => p.kpopGroup === activeFilter);

  const handleWishlistClick = (e, productId) => {
    e.stopPropagation(); // Prevent card click

    // ✅ CHECK IF USER IS LOGGED IN FOR WISHLIST
    if (!isAuthenticated) {
      setShowLoginModal(true);
      showNotification('Please login to add to wishlist', 'error');
      return;
    }

    // Toggle wishlist
    toggleWishlist(productId);
    loadWishlist();
    
    const isNowInWishlist = isInWishlist(productId);
    showNotification(
      isNowInWishlist ? 'Added to wishlist' : 'Removed from wishlist',
      'success'
    );
  };

  // ✅ NO LOGIN CHECK HERE - JUST OPEN THE MODAL
  const handleProductClick = (product) => {
    // Just call parent's onProductClick to open the ProductModal
    // Login checks will be handled inside ProductModal
    if (onProductClick) {
      onProductClick(product);
    }
  };

  if (products.length === 0) {
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
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className="wv-card"
              onClick={() => handleProductClick(product)}
            >
              {product.isSale && <div className="wv-sale-badge">SALE</div>}

              {/* ✅ WISHLIST HEART BUTTON - LOGIN CHECK ONLY HERE */}
              <button
                className={`wv-card-heart ${wishlistItems.includes(product.id) ? 'active' : ''}`}
                onClick={(e) => handleWishlistClick(e, product.id)}
                title={wishlistItems.includes(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}
              >
                <i className={`fas fa-heart`}></i>
              </button>

              <div className="wv-card-img">
                <img src={product.image} alt={product.name} />
              </div>

              <div className="wv-card-info">
                <div className="wv-card-group">{product.kpopGroup}</div>
                <div className="wv-card-name">{product.name}</div>
                <div className="wv-card-price-row">
                  <span className={`wv-card-price-current ${product.isSale ? 'sale' : ''}`}>
                    ₱{product.price.toLocaleString()}
                  </span>
                  {product.originalPrice > product.price && (
                    <span className="wv-card-price-original">
                      ₱{product.originalPrice.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="wv-see-all-row">
          <button className="wv-see-all" onClick={() => navigate('/collections')}>
            See All
          </button>
        </div>
      </section>

      {/* ✅ LOGIN MODAL - ONLY FOR WISHLIST */}
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default WeverseSection;
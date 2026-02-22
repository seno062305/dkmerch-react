import React, { useState } from 'react';
import './PreOrder.css';
import { usePreOrderProducts } from '../utils/productStorage';
import { useAddToCart } from '../context/cartUtils';
import { useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import ProductModal from '../components/ProductModal';
import LoginModal from '../components/LoginModal';

const PreOrder = () => {
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  // ✅ Convex hooks
  const preOrderProducts = usePreOrderProducts();
  const addToCart        = useAddToCart();
  const toggleWishlist   = useToggleWishlist();

  const groups = ['all', ...new Set(preOrderProducts.map(p => p.kpopGroup).filter(Boolean))];

  const filteredProducts = selectedGroup === 'all'
    ? preOrderProducts
    : preOrderProducts.filter(p => p.kpopGroup === selectedGroup);

  const handleRequireLogin = () => {
    setSelectedProduct(null);
    setShowLoginModal(true);
  };

  const handleAddToCart = async (product) => {
    if (!isAuthenticated) { handleRequireLogin(); return; }
    try {
      await addToCart(product);
      showNotification(`${product.name} added to cart!`, 'success');
    } catch {
      showNotification('Failed to add to cart', 'error');
    }
  };

  const handleAddToWishlist = async (product) => {
    if (!isAuthenticated) { handleRequireLogin(); return; }
    try {
      await toggleWishlist(product);
      showNotification(`${product.name} added to wishlist!`, 'success');
    } catch {
      showNotification('Failed to add to wishlist', 'error');
    }
  };

  return (
    <main className="preorder-main">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Pre-Order Items</h1>
          <p className="page-description">Be the first to get upcoming releases from your favorite K-Pop groups</p>
        </div>
      </div>

      <div className="container">
        <section className="preorder-page">
          <div className="filter-bar">
            <h3>Filter by Group:</h3>
            <div className="filter-options">
              {groups.map(group => (
                <button key={group} className={`filter-btn ${selectedGroup === group ? 'active' : ''}`} onClick={() => setSelectedGroup(group)}>
                  {group === 'all' ? 'All Groups' : group}
                </button>
              ))}
            </div>
          </div>

          <div className="preorder-grid">
            {filteredProducts.map(product => (
              <div key={product._id || product.id} className="preorder-card" onClick={() => setSelectedProduct(product)} style={{ cursor: 'pointer' }}>
                <div className="preorder-badge">PRE-ORDER</div>
                <div className="preorder-image"><img src={product.image} alt={product.name} /></div>
                <div className="preorder-info">
                  <div className="product-group">{product.kpopGroup}</div>
                  <h3 className="product-name">{product.name}</h3>
                  <div className="product-price">
                    <span className="current-price">₱{product.price?.toLocaleString()}</span>
                    {product.isSale && product.originalPrice > product.price && (
                      <>
                        <span className="original-price">₱{product.originalPrice?.toLocaleString()}</span>
                        <span className="discount">{Math.round((1 - product.price / product.originalPrice) * 100)}% OFF</span>
                      </>
                    )}
                  </div>
                  <div className="stock-info">
                    <i className="fas fa-box"></i>
                    <span>{product.stock > 0 ? `${product.stock} slots remaining` : 'Out of stock'}</span>
                  </div>
                  <button className="btn btn-primary" onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}>
                    <i className="fas fa-shopping-cart"></i> {isAuthenticated ? 'Add to Cart' : 'Pre-Order Now'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="no-results">
              <i className="fas fa-inbox"></i>
              <h3>No pre-orders available</h3>
              <p>Check back soon for upcoming releases!</p>
            </div>
          )}
        </section>
      </div>

      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)}
          onRequireLogin={handleRequireLogin} onAddToCart={handleAddToCart} onAddToWishlist={handleAddToWishlist} />
      )}
      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </main>
  );
};

export default PreOrder;
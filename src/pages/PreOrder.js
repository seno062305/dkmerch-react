import React, { useState, useEffect } from 'react';
import './PreOrder.css';
import { getProducts } from '../utils/productStorage';
import { addToCart } from '../utils/cartStorage';
import { toggleWishlist } from '../utils/wishlistStorage';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import ProductModal from '../components/ProductModal';
import LoginModal from '../components/LoginModal';

const PreOrder = () => {
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [preOrderProducts, setPreOrderProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();

  useEffect(() => {
    loadPreOrderProducts();

    // Listen for product updates from admin
    const handleProductUpdate = () => {
      loadPreOrderProducts();
    };

    window.addEventListener('productsUpdated', handleProductUpdate);
    window.addEventListener('storage', handleProductUpdate);

    return () => {
      window.removeEventListener('productsUpdated', handleProductUpdate);
      window.removeEventListener('storage', handleProductUpdate);
    };
  }, []);

  const loadPreOrderProducts = () => {
    const allProducts = getProducts();
    // Filter only products with isPreOrder = true
    const filtered = allProducts.filter(product => product.isPreOrder === true);
    setPreOrderProducts(filtered);
  };

  // Get unique groups from pre-order products
  const groups = ['all', ...new Set(preOrderProducts.map(p => p.kpopGroup))];

  const filteredProducts = selectedGroup === 'all' 
    ? preOrderProducts 
    : preOrderProducts.filter(p => p.kpopGroup === selectedGroup);

  const handleProductClick = (product) => {
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  const handleRequireLogin = () => {
    setSelectedProduct(null);
    setShowLoginModal(true);
  };

  const handleCloseLoginModal = () => {
    setShowLoginModal(false);
  };

  // ✅ ADD TO CART FUNCTION
  const handleAddToCart = (product) => {
    if (!isAuthenticated) {
      handleRequireLogin();
      return;
    }

    try {
      addToCart(product.id);
      showNotification(`${product.name} added to cart!`, 'success');
      
      // Dispatch event to update cart count in navbar
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      showNotification('Failed to add to cart', 'error');
    }
  };

  // ✅ ADD TO WISHLIST FUNCTION
  const handleAddToWishlist = (product) => {
    if (!isAuthenticated) {
      handleRequireLogin();
      return;
    }

    try {
      toggleWishlist(product.id);
      showNotification(`${product.name} added to wishlist!`, 'success');
      
      // Dispatch event to update wishlist count in navbar
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      showNotification('Failed to add to wishlist', 'error');
    }
  };

  return (
    <main>
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
                <button
                  key={group}
                  className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                  onClick={() => setSelectedGroup(group)}
                >
                  {group === 'all' ? 'All Groups' : group}
                </button>
              ))}
            </div>
          </div>

          <div className="preorder-grid">
            {filteredProducts.map(product => (
              <div 
                key={product.id} 
                className="preorder-card"
                onClick={() => handleProductClick(product)}
                style={{ cursor: 'pointer' }}
              >
                <div className="preorder-badge">PRE-ORDER</div>
                <div className="preorder-image">
                  <img src={product.image} alt={product.name} />
                </div>
                <div className="preorder-info">
                  <div className="product-group">{product.kpopGroup}</div>
                  <h3 className="product-name">{product.name}</h3>
                  
                  <div className="product-price">
                    <span className="current-price">₱{product.price.toLocaleString()}</span>
                    {product.isSale && product.originalPrice > product.price && (
                      <>
                        <span className="original-price">₱{product.originalPrice.toLocaleString()}</span>
                        <span className="discount">
                          {Math.round((1 - product.price/product.originalPrice) * 100)}% OFF
                        </span>
                      </>
                    )}
                  </div>

                  <div className="stock-info">
                    <i className="fas fa-box"></i>
                    <span>{product.stock > 0 ? `${product.stock} slots remaining` : 'Out of stock'}</span>
                  </div>

                  <button 
                    className="btn btn-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProductClick(product);
                    }}
                  >
                    <i className="fas fa-shopping-cart"></i> 
                    {isAuthenticated ? 'Add to Cart' : 'Pre-Order Now'}
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
        <ProductModal
          product={selectedProduct}
          onClose={handleCloseModal}
          onRequireLogin={handleRequireLogin}
          onAddToCart={handleAddToCart}
          onAddToWishlist={handleAddToWishlist}
        />
      )}

      {showLoginModal && (
        <LoginModal onClose={handleCloseLoginModal} />
      )}
    </main>
  );
};

export default PreOrder;
import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { getProducts } from '../utils/productStorage';
import { addToCart } from '../utils/cartStorage';
import { toggleWishlist, isInWishlist } from '../utils/wishlistStorage';
import { useNotification } from '../context/NotificationContext';
import ProductModal from '../components/ProductModal';
import './Collections.css';

const Collections = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();
  const [allProducts, setAllProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const loadProducts = () => {
    setAllProducts(getProducts());
  };

  useEffect(() => {
    loadProducts();

    // SAME TAB (Admin add/edit/delete)
    window.addEventListener('dkmerch-products-updated', loadProducts);

    // CART / WISHLIST / OTHER TAB
    window.addEventListener('storage', loadProducts);

    return () => {
      window.removeEventListener('dkmerch-products-updated', loadProducts);
      window.removeEventListener('storage', loadProducts);
    };
  }, []);

  // Handle filtering from LogoMarquee or search
  useEffect(() => {
    // Check for group filter from LogoMarquee (via state)
    if (location.state?.filterGroup) {
      setSelectedGroup(location.state.filterGroup);
      
      // Scroll to top if requested
      if (location.state.scrollToTop) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      
      // Clear the state to prevent re-applying on future navigations
      window.history.replaceState({}, document.title);
    }

    // Check for product ID from search (via query param)
    const productId = searchParams.get('product');
    if (productId) {
      setHighlightedProductId(parseInt(productId));
      
      // Scroll to highlighted product after a short delay
      setTimeout(() => {
        const element = document.querySelector(`[data-product-id="${productId}"]`);
        if (element) {
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }
      }, 300);

      // Remove highlight after 3 seconds
      setTimeout(() => {
        setHighlightedProductId(null);
      }, 3000);
    }
  }, [location.state, searchParams]);

  const categories = [
    'all',
    'albums',
    'photocards',
    'lightsticks',
    'apparel',
    'accessories'
  ];

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

  const filteredProducts = allProducts.filter(product => {
    const categoryMatch =
      selectedCategory === 'all' || product.category === selectedCategory;
    const groupMatch =
      selectedGroup === 'all' || product.kpopGroup === selectedGroup;
    return categoryMatch && groupMatch;
  });

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSelectedGroup('all');
  };

  const handleProductClick = (product) => {
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  // ✅ CORRECT: Use addToCart from cartStorage
  const handleAddToCart = (product) => {
    try {
      if (product.stock === 0 && !product.isPreOrder) {
        showNotification('Product is out of stock', 'error');
        return;
      }

      addToCart(product.id);
      showNotification(`${product.name} added to cart!`, 'success');
      
      // Trigger storage event for other components
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error adding to cart:', error);
      showNotification('Error adding to cart', 'error');
    }
  };

  // ✅ CORRECT: Use toggleWishlist from wishlistStorage (stores IDs only)
  const handleAddToWishlist = (product) => {
    try {
      const wasInWishlist = isInWishlist(product.id);
      
      toggleWishlist(product.id);
      
      if (wasInWishlist) {
        showNotification(`${product.name} removed from wishlist!`, 'success');
      } else {
        showNotification(`${product.name} added to wishlist!`, 'success');
      }
      
      // Trigger storage event
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error updating wishlist:', error);
      showNotification('Error updating wishlist', 'error');
    }
  };

  return (
    <div className="collections-page">
      <div className="collections-header">
        <h1>All Collections</h1>
        <p>Explore our complete K-Pop merchandise collection</p>
      </div>

      <div className="collections-filters">
        <div className="filters-single-line">
          <div className="filter-group">
            <label>Category:</label>
            <div className="filter-buttons">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <label>Group:</label>
            <div className="filter-buttons">
              {groups.map(group => (
                <button
                  key={group}
                  className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                  onClick={() => setSelectedGroup(group)}
                >
                  {group}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="results-count">
        <p>
          Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          {selectedGroup !== 'all' && ` for ${selectedGroup}`}
          {selectedCategory !== 'all' && ` in ${selectedCategory}`}
        </p>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="no-results">
          <i className="fas fa-box-open"></i>
          <p>
            {selectedGroup !== 'all' 
              ? `No products found for ${selectedGroup}`
              : 'No products available'}
          </p>
          {(selectedGroup !== 'all' || selectedCategory !== 'all') && (
            <button className="reset-filters-btn" onClick={handleResetFilters}>
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="collections-grid">
          {filteredProducts.map(product => (
            <div
              key={product.id}
              data-product-id={product.id}
              className={`collection-card ${highlightedProductId === product.id ? 'highlighted' : ''}`}
              onClick={() => handleProductClick(product)}
            >
              {product.isSale && (
                <div className="collection-sale-badge">SALE</div>
              )}

              <div className="collection-card-img">
                <img src={product.image} alt={product.name} />
              </div>

              <div className="collection-card-info">
                <div className="collection-card-group">
                  {product.kpopGroup}
                </div>

                <div className="collection-card-name">
                  {product.name}
                </div>

                <div className="collection-card-price-row">
                  <span
                    className={`collection-card-price ${product.isSale ? 'sale' : ''}`}
                  >
                    ₱{product.price.toLocaleString()}
                  </span>

                  {product.originalPrice > product.price && (
                    <span className="collection-card-price-original">
                      ₱{product.originalPrice.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Modal with Rating System */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={handleCloseModal}
          onAddToCart={handleAddToCart}
          onAddToWishlist={handleAddToWishlist}
        />
      )}
    </div>
  );
};

export default Collections;
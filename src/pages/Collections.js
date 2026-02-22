import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useProducts } from '../utils/productStorage';
import { useAddToCart } from '../context/cartUtils';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useNotification } from '../context/NotificationContext';
import ProductModal from '../components/ProductModal';
import './Collections.css';

const Collections = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const products = useProducts();
  const wishlistItems = useWishlist();
  const addToCartMutation = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  // FIXED: Split into two separate effects so location.state and searchParams
  // don't interfere with each other, and clear state immediately to prevent re-trigger
  useEffect(() => {
    const filterGroup = location.state?.filterGroup;
    const scrollToTop = location.state?.scrollToTop;
    if (filterGroup) {
      setSelectedGroup(filterGroup);
      if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
      // Clear state immediately so this never runs again on re-render
      window.history.replaceState({}, document.title);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]); // only pathname, never location.state

  useEffect(() => {
    const productId = searchParams.get('product');
    if (productId) {
      setHighlightedProductId(productId);
      setTimeout(() => {
        const element = document.querySelector(`[data-product-id="${productId}"]`);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      setTimeout(() => setHighlightedProductId(null), 3000);
    }
  }, [searchParams]);

  const categories = ['all', 'albums', 'photocards', 'lightsticks', 'apparel', 'accessories'];
  const groups = ['all', 'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN', 'STRAY KIDS', 'EXO', 'RED VELVET', 'NEWJEANS'];

  const filteredProducts = (products || []).filter(product => {
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
    const groupMatch = selectedGroup === 'all' || product.kpopGroup === selectedGroup;
    return categoryMatch && groupMatch;
  });

  const handleAddToCart = (product) => {
    if (product.stock === 0 && !product.isPreOrder) {
      showNotification('Product is out of stock', 'error');
      return;
    }
    addToCartMutation(product);
    showNotification(`${product.name} added to cart!`, 'success');
  };

  const handleAddToWishlist = (product) => {
    const pid = product._id || product.id;
    toggleWishlistMutation(product);
    showNotification(
      isWishlisted(pid) ? `${product.name} removed from wishlist!` : `${product.name} added to wishlist!`,
      'success'
    );
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
                <button key={cat} className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`} onClick={() => setSelectedCategory(cat)}>
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
                <button key={group} className={`filter-btn ${selectedGroup === group ? 'active' : ''}`} onClick={() => setSelectedGroup(group)}>
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
          <p>{selectedGroup !== 'all' ? `No products found for ${selectedGroup}` : 'No products available'}</p>
          {(selectedGroup !== 'all' || selectedCategory !== 'all') && (
            <button className="reset-filters-btn" onClick={() => { setSelectedCategory('all'); setSelectedGroup('all'); }}>
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="collections-grid">
          {filteredProducts.map(product => {
            const pid = product._id || product.id;
            return (
              <div
                key={pid}
                data-product-id={pid}
                className={`collection-card ${highlightedProductId === pid ? 'highlighted' : ''}`}
                onClick={() => setSelectedProduct(product)}
              >
                {product.isSale && <div className="collection-sale-badge">SALE</div>}
                <div className="collection-card-img">
                  <img src={product.image} alt={product.name} />
                </div>
                <div className="collection-card-info">
                  <div className="collection-card-group">{product.kpopGroup}</div>
                  <div className="collection-card-name">{product.name}</div>
                  <div className="collection-card-price-row">
                    <span className={`collection-card-price ${product.isSale ? 'sale' : ''}`}>
                      ₱{product.price?.toLocaleString()}
                    </span>
                    {product.originalPrice > product.price && (
                      <span className="collection-card-price-original">₱{product.originalPrice?.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          onAddToWishlist={handleAddToWishlist}
        />
      )}
    </div>
  );
};

export default Collections;
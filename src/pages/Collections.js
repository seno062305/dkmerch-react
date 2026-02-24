import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
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

  // ✅ Fetch active promo for indicator
  const activePromos = useQuery(api.promos.getActivePromos) || [];
  const activePromo = activePromos[0] || null;

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  // ✅ Check if product is promo-eligible
  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  useEffect(() => {
    const filterGroup = location.state?.filterGroup;
    const scrollToTop = location.state?.scrollToTop;
    if (filterGroup) {
      setSelectedGroup(filterGroup);
      if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
      window.history.replaceState({}, document.title);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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

        {/* ✅ Active promo banner */}
        {activePromo && activePromo.isActive && (
          <div className="collections-promo-banner">
            <i className="fas fa-tag"></i>
            <span>
              <strong>{activePromo.name} Promo Active!</strong> Use code{' '}
              <span className="collections-promo-code">{activePromo.code}</span> for{' '}
              {activePromo.discount}% off — max ₱{activePromo.maxDiscount?.toLocaleString()} discount
            </span>
          </div>
        )}
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
                <button
                  key={group}
                  className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                  onClick={() => setSelectedGroup(group)}
                >
                  {group}
                  {/* ✅ Promo dot on matching group button */}
                  {activePromo && activePromo.isActive &&
                    group.toUpperCase() === activePromo.name?.toUpperCase() && (
                    <span className="filter-promo-dot" title={`${activePromo.discount}% off!`}>●</span>
                  )}
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
            const hasPromo = isPromoProduct(product);
            return (
              <div
                key={pid}
                data-product-id={pid}
                className={`collection-card ${highlightedProductId === pid ? 'highlighted' : ''} ${hasPromo ? 'collection-card-promo' : ''}`}
                onClick={() => setSelectedProduct(product)}
              >
                {product.isPreOrder
                  ? <div className="collection-preorder-badge">PRE-ORDER</div>
                  : product.isSale && <div className="collection-sale-badge">SALE</div>
                }

                {/* ✅ Promo indicator badge */}
                {hasPromo && (
                  <div className="collection-promo-badge">
                    <i className="fas fa-tag"></i> {activePromo.discount}% OFF
                  </div>
                )}

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
                  {/* ✅ Promo hint */}
                  {hasPromo && (
                    <div className="collection-promo-hint">
                      <i className="fas fa-ticket-alt"></i> Code: <strong>{activePromo.code}</strong>
                    </div>
                  )}
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
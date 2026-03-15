import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAddToCart } from '../context/cartUtils';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useNotification } from '../context/NotificationContext';
import ProductModal from '../components/ProductModal';
import './Collections.css';

const MAX_WISHLIST = 10;

const getReleaseMs = (product) => {
  if (!product.isPreOrder || !product.releaseDate) return null;
  const rt = product.releaseTime || '00:00';
  return new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
};

const isReleased = (product) => {
  const ms = getReleaseMs(product);
  return ms !== null && Date.now() >= ms;
};

const Collections = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();

  const [selectedCategory, setSelectedCategory]         = useState('all');
  const [selectedGroup, setSelectedGroup]               = useState('all');
  const [searchTerm, setSearchTerm]                     = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct]           = useState(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen]       = useState(false);

  const categoryRef = useRef(null);
  const groupRef    = useRef(null);

  const products             = useQuery(api.products.getCollectionProducts) || [];
  const wishlistItems        = useWishlist();
  const addToCartMutation    = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();
  const activePromos         = useQuery(api.promos.getActivePromos) || [];
  const activePromo          = activePromos[0] || null;

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target)) setCategoryDropdownOpen(false);
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      setSelectedCategory('all');
      setSelectedGroup('all');
      setSearchTerm('');
      setTimeout(() => {
        const element = document.querySelector(`[data-product-id="${productId}"]`);
        if (element) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
      setTimeout(() => setHighlightedProductId(null), 3000);
    }
  }, [searchParams]);

  const categories = ['all', 'albums', 'photocards', 'lightsticks', 'accessories'];
  const groups     = ['all', 'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN', 'STRAY KIDS', 'EXO', 'RED VELVET', 'NEWJEANS'];

  const filteredProducts = (products || [])
    .filter(product => {
      const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
      const groupMatch    = selectedGroup === 'all'    || product.kpopGroup === selectedGroup;
      const searchMatch   = !searchTerm.trim() ||
        product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.kpopGroup?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.category?.toLowerCase().includes(searchTerm.toLowerCase());
      return categoryMatch && groupMatch && searchMatch;
    })
    .sort((a, b) => {
      const aReleased  = isReleased(a);
      const bReleased  = isReleased(b);
      const aReleaseMs = getReleaseMs(a) || 0;
      const bReleaseMs = getReleaseMs(b) || 0;
      if (aReleased && !bReleased) return -1;
      if (!aReleased && bReleased) return 1;
      if (aReleased && bReleased) return bReleaseMs - aReleaseMs;
      return (b._creationTime || 0) - (a._creationTime || 0);
    });

  const handleAddToCart = (product) => {
    if (product.stock === 0 && !product.isPreOrder) {
      showNotification('Product is out of stock', 'error');
      return;
    }
    addToCartMutation(product);
    showNotification(`${product.name} added to cart!`, 'success');
  };

  const handleCardWishlist = (e, product) => {
    e.stopPropagation();
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    if (!alreadyWishlisted && wishlistItems.length >= MAX_WISHLIST) {
      showNotification(`Favorites limit reached (max ${MAX_WISHLIST}). Remove an item first.`, 'error');
      return;
    }
    const msg = alreadyWishlisted
      ? `Remove "${product.name}" from Favorites?`
      : `Add "${product.name}" to Favorites?`;
    if (!window.confirm(msg)) return;
    toggleWishlistMutation(product);
    showNotification(
      alreadyWishlisted ? `${product.name} removed from favorites!` : `${product.name} added to favorites!`,
      'success'
    );
  };

  const handleAddToWishlist = (product) => {
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    if (!alreadyWishlisted && wishlistItems.length >= MAX_WISHLIST) {
      showNotification(`Favorites limit reached (max ${MAX_WISHLIST}). Remove an item first.`, 'error');
      return;
    }
    const msg = alreadyWishlisted
      ? `Remove "${product.name}" from Favorites?`
      : `Add "${product.name}" to Favorites?`;
    if (!window.confirm(msg)) return;
    toggleWishlistMutation(product);
    showNotification(
      alreadyWishlisted ? `${product.name} removed from favorites!` : `${product.name} added to favorites!`,
      'success'
    );
  };

  return (
    <div className="collections-page">
      <div className="collections-header">
        <h1>All Collections</h1>
        <p>Explore our complete K-Pop merchandise collection</p>

        {activePromo && activePromo.isActive && (
          <div className="collections-promo-banner">
            <i className="fas fa-tag"></i>
            <span>
              <strong>{activePromo.name} Promo Active!</strong> Use code{' '}
              <span className="collections-promo-code">{activePromo.code}</span> for{' '}
              {activePromo.discount}% off
            </span>
          </div>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className="collections-search-wrap">
        <div className="collections-search-box">
          <i className="fas fa-search"></i>
          <input
            type="text"
            placeholder="Search products, groups, categories..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="collections-search-clear" onClick={() => setSearchTerm('')}>
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
      </div>

      <div className="collections-filters">
        <div className="filters-single-line">
          <div className="filter-group">
            <label>CATEGORY:</label>
            <div className="filter-buttons desktop-only">
              {categories.map(cat => (
                <button key={cat} className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`} onClick={() => setSelectedCategory(cat)}>
                  {cat}
                </button>
              ))}
            </div>
            <div className="filter-dropdown mobile-only" ref={categoryRef}>
              <button className="filter-dropdown-toggle" onClick={() => { setCategoryDropdownOpen(o => !o); setGroupDropdownOpen(false); }}>
                <span>{selectedCategory}</span>
                <i className={`fas fa-chevron-down ${categoryDropdownOpen ? 'open' : ''}`}></i>
              </button>
              {categoryDropdownOpen && (
                <div className="filter-dropdown-menu">
                  {categories.map(cat => (
                    <button key={cat} className={`filter-dropdown-item ${selectedCategory === cat ? 'active' : ''}`} onClick={() => { setSelectedCategory(cat); setCategoryDropdownOpen(false); }}>
                      {cat}
                      {selectedCategory === cat && <i className="fas fa-check"></i>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <label>GROUP:</label>
            <div className="filter-buttons desktop-only">
              {groups.map(group => (
                <button key={group} className={`filter-btn ${selectedGroup === group ? 'active' : ''}`} onClick={() => setSelectedGroup(group)}>
                  {group}
                  {activePromo && activePromo.isActive && group.toUpperCase() === activePromo.name?.toUpperCase() && (
                    <span className="filter-promo-dot" title={`${activePromo.discount}% off!`}>●</span>
                  )}
                </button>
              ))}
            </div>
            <div className="filter-dropdown mobile-only" ref={groupRef}>
              <button className="filter-dropdown-toggle" onClick={() => { setGroupDropdownOpen(o => !o); setCategoryDropdownOpen(false); }}>
                <span>
                  {selectedGroup}
                  {activePromo && activePromo.isActive && selectedGroup.toUpperCase() === activePromo.name?.toUpperCase() && (
                    <span className="filter-promo-dot">●</span>
                  )}
                </span>
                <i className={`fas fa-chevron-down ${groupDropdownOpen ? 'open' : ''}`}></i>
              </button>
              {groupDropdownOpen && (
                <div className="filter-dropdown-menu">
                  {groups.map(group => (
                    <button key={group} className={`filter-dropdown-item ${selectedGroup === group ? 'active' : ''}`} onClick={() => { setSelectedGroup(group); setGroupDropdownOpen(false); }}>
                      <span>
                        {group}
                        {activePromo && activePromo.isActive && group.toUpperCase() === activePromo.name?.toUpperCase() && (
                          <span className="filter-promo-dot">●</span>
                        )}
                      </span>
                      {selectedGroup === group && <i className="fas fa-check"></i>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="results-count">
        <p>
          Showing {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''}
          {selectedGroup !== 'all' && ` for ${selectedGroup}`}
          {selectedCategory !== 'all' && ` in ${selectedCategory}`}
          {searchTerm && ` matching "${searchTerm}"`}
        </p>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="no-results">
          <i className="fas fa-box-open"></i>
          <p>{searchTerm ? `No products found for "${searchTerm}"` : selectedGroup !== 'all' ? `No products found for ${selectedGroup}` : 'No products available'}</p>
          {(selectedGroup !== 'all' || selectedCategory !== 'all' || searchTerm) && (
            <button className="reset-filters-btn" onClick={() => { setSelectedCategory('all'); setSelectedGroup('all'); setSearchTerm(''); }}>
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="collections-grid">
          {filteredProducts.map(product => {
            const pid      = product._id || product.id;
            const hasPromo = isPromoProduct(product);
            const wishlisted = isWishlisted(pid);

            // Released badge: visible only within 1 hour of release
            const releaseMs = getReleaseMs(product);
            const diffMs = releaseMs !== null ? Date.now() - releaseMs : -1;
            const showReleasedBadge = diffMs >= 0 && diffMs < 60 * 60 * 1000;

            return (
              <div
                key={pid}
                data-product-id={pid}
                className={`collection-card ${highlightedProductId === pid ? 'highlighted' : ''} ${hasPromo ? 'collection-card-promo' : ''} ${showReleasedBadge ? 'collection-card-released' : ''}`}
                onClick={() => setSelectedProduct(product)}
              >
                {/* Released OR sale badge — never both */}
                {showReleasedBadge
                  ? <div className="collection-released-badge"><i className="fas fa-bolt"></i> Just Released</div>
                  : product.isSale && !product.isPreOrder && <div className="collection-sale-badge">SALE</div>
                }

                {/* Promo badge only when not showing released */}
                {hasPromo && !showReleasedBadge && (
                  <div className="collection-promo-badge">
                    <i className="fas fa-tag"></i> {activePromo.discount}% OFF
                  </div>
                )}

                <button
                  className={`collection-card-fav ${wishlisted ? 'active' : ''}`}
                  onClick={(e) => handleCardWishlist(e, product)}
                  title={wishlisted ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <i className="fas fa-star"></i>
                </button>

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
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCatalogOptions } from '../hooks/useCatalogOptions';
import { useAddToCart } from '../context/cartUtils';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import ProductModal from '../components/ProductModal';
import { PointsBadge } from '../utils/pointsUtils';
import {
  formatSaleEndLabel,
  formatSaleEndShort,
  shouldShowSaleBadge,
  shouldShowPreOrderBadge,
  hasDiscountedPrice,
  isNewArrival,
  isProductReleased,
  toPhtMs,
} from '../utils/saleUtils';
import './Collections.css';

const MAX_WISHLIST = 10;
const JUST_RELEASED_MS = 24 * 60 * 60 * 1000;

const getReleaseMs = (product) => {
  if (product?.releasedAt) return Number(product.releasedAt);
  if (!product?.releaseDate) return null;
  return toPhtMs(product.releaseDate, product.releaseTime);
};

const isReleased = (product) => isProductReleased(product);

const Collections = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();

  const [selectedCategory, setSelectedCategory]         = useState('all');
  const [selectedGroup, setSelectedGroup]               = useState('all');
  const [searchTerm, setSearchTerm]                     = useState('');
  const [highlightedProductId, setHighlightedProductId] = useState(null);
  const [selectedProduct, setSelectedProduct]           = useState(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen]       = useState(false);

  const categoryRef = useRef(null);
  const groupRef    = useRef(null);

  const products               = useQuery(api.products.getCollectionProducts) || [];
  const { items: catalogCategories } = useCatalogOptions('category');
  const { items: catalogGroups } = useCatalogOptions('kpopGroup');
  const wishlistItems          = useWishlist();
  const addToCartMutation      = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();
  const activePromos           = useQuery(api.promos.getActivePromos) || [];
  const activePromo            = activePromos[0] || null;

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
      if (groupRef.current    && !groupRef.current.contains(e.target))    setGroupDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const filterGroup = location.state?.filterGroup;
    const scrollToTop = location.state?.scrollToTop;
    if (filterGroup) {
      // Match casing against known groups / product data
      const known = (catalogGroups || []).map((g) => g.value);
      const matched =
        known.find(g => g.toUpperCase() === String(filterGroup).trim().toUpperCase()) ||
        filterGroup;
      setSelectedGroup(matched);
      if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
      window.history.replaceState({}, document.title);
    }
  }, [location.pathname, location.state, catalogGroups]);

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

  const categories = ['all', ...catalogCategories.map((c) => c.value)];
  const groups = ['all', ...catalogGroups.map((g) => g.value)];

  const filteredProducts = (products || [])
    .filter(product => {
      const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
      const groupMatch    = selectedGroup    === 'all' || product.kpopGroup === selectedGroup;
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
      if (aReleased  && !bReleased) return -1;
      if (!aReleased && bReleased)  return 1;
      if (aReleased  && bReleased)  return bReleaseMs - aReleaseMs;
      return (b._creationTime || 0) - (a._creationTime || 0);
    });

  const handleAddToCart = async (product) => {
    if (Number(product.stock) <= 0) {
      showNotification('Product is out of stock — you can still favorite it.', 'warning');
      return;
    }
    const result = await addToCartMutation(product);
    showNotification(`${product.name} added to cart!`, 'success');
    return result;
  };

  const handleCardWishlist = async (e, product) => {
    e.stopPropagation();
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    if (!alreadyWishlisted && wishlistItems.length >= MAX_WISHLIST) {
      showNotification(`Favorites limit reached (max ${MAX_WISHLIST}). Remove an item first.`, 'error');
      return;
    }
    const ok = await confirm({
      title: alreadyWishlisted ? 'Remove favorite?' : 'Add to favorites?',
      message: alreadyWishlisted
        ? `Remove "${product.name}" from Favorites?`
        : `Add "${product.name}" to Favorites?`,
      confirmLabel: alreadyWishlisted ? 'Remove' : 'Add',
      variant: alreadyWishlisted ? 'danger' : 'primary',
      icon: 'fa-star',
    });
    if (!ok) return;
    toggleWishlistMutation(product);
    showNotification(
      alreadyWishlisted ? `${product.name} removed from favorites!` : `${product.name} added to favorites!`,
      'success'
    );
  };

  const handleAddToWishlist = async (product) => {
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    if (!alreadyWishlisted && wishlistItems.length >= MAX_WISHLIST) {
      showNotification(`Favorites limit reached (max ${MAX_WISHLIST}). Remove an item first.`, 'error');
      return;
    }
    const ok = await confirm({
      title: alreadyWishlisted ? 'Remove favorite?' : 'Add to favorites?',
      message: alreadyWishlisted
        ? `Remove "${product.name}" from Favorites?`
        : `Add "${product.name}" to Favorites?`,
      confirmLabel: alreadyWishlisted ? 'Remove' : 'Add',
      variant: alreadyWishlisted ? 'danger' : 'primary',
      icon: 'fa-star',
    });
    if (!ok) return;
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

            const stockQty = Number(product.stock ?? 0);
            const isOutOfStock = stockQty <= 0;

            const releaseMs = getReleaseMs(product);
            const diffMs    = releaseMs !== null ? Date.now() - releaseMs : -1;
            // Never show "Just Released" on out-of-stock items
            const showReleasedBadge = !isOutOfStock && diffMs >= 0 && diffMs < JUST_RELEASED_MS;
            const showNewBadge = !isOutOfStock && !showReleasedBadge && isNewArrival(product);
            const isLowStock = !isOutOfStock && stockQty > 0 && stockQty <= 5;
            const showSale = shouldShowSaleBadge(product);
            const showPreOrder = shouldShowPreOrderBadge(product) && !isReleased(product);

            return (
              <div
                key={pid}
                data-product-id={pid}
                className={`collection-card ${highlightedProductId === pid ? 'highlighted' : ''} ${hasPromo ? 'collection-card-promo' : ''} ${showReleasedBadge ? 'collection-card-released' : ''} ${isOutOfStock ? 'collection-card-oos' : ''}`}
                onClick={() => setSelectedProduct(product)}
              >
                {showReleasedBadge ? (
                  <div className="collection-released-badge"><i className="fas fa-bolt"></i> Just Released</div>
                ) : showNewBadge ? (
                  <div className="collection-new-badge">NEW</div>
                ) : (showSale || showPreOrder) ? (
                  <div className="collection-badge-stack">
                    {showSale && (
                      <div className="collection-sale-badge">
                        <span>SALE</span>
                        {(formatSaleEndShort(product) || formatSaleEndLabel(product)) && (
                          <span className="collection-sale-badge-end">
                            {formatSaleEndShort(product) || formatSaleEndLabel(product)}
                          </span>
                        )}
                      </div>
                    )}
                    {showPreOrder && <div className="collection-preorder-badge">PRE-ORDER</div>}
                  </div>
                ) : null}

                {hasPromo && !showReleasedBadge && !showNewBadge && (
                  <div className="collection-promo-badge">
                    <i className="fas fa-tag"></i> {activePromo.discount}% OFF
                  </div>
                )}

                <button
                  className={`collection-card-fav ${wishlisted ? 'active' : ''}`}
                  onClick={(e) => handleCardWishlist(e, product)}
                  title={wishlisted ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <i className={`fas fa-star ${wishlisted ? 'filled' : ''}`} aria-hidden="true"></i>
                </button>

                <div className="collection-card-img">
                  <img src={product.image} alt={product.name} />
                  {isOutOfStock && (
                    <div className="collection-oos-overlay">Out of Stock</div>
                  )}
                </div>

                <div className="collection-card-info">
                  <div className="collection-card-group">{product.kpopGroup}</div>
                  <div className="collection-card-name">{product.name}</div>
                  <div className="collection-card-price-row">
                    <span className={`collection-card-price ${showSale ? 'sale' : ''}`}>
                      ₱{product.price?.toLocaleString()}
                    </span>
                    {showSale && hasDiscountedPrice(product) && (
                      <span className="collection-card-price-original">₱{product.originalPrice?.toLocaleString()}</span>
                    )}
                    {/* ✅ Points badge */}
                    <PointsBadge price={product.price} />
                  </div>
                  {showSale && formatSaleEndLabel(product) && (
                    <div className="collection-sale-period">
                      <i className="fas fa-clock"></i>
                      <span>{formatSaleEndLabel(product)}</span>
                    </div>
                  )}
                  <div
                    className={`collection-stock-badge ${
                      isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-in'
                    }`}
                  >
                    <i className="fas fa-box"></i>
                    <span>
                      {isOutOfStock
                        ? 'Out of stock'
                        : isLowStock
                          ? `Only ${stockQty} left`
                          : `${stockQty} in stock`}
                    </span>
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
          onRequireLogin={() => window.dispatchEvent(new Event('openLoginModal'))}
        />
      )}
    </div>
  );
};

export default Collections;
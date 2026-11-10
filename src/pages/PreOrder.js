// src/pages/PreOrder.js
import React, { useState, useEffect, useRef } from 'react';
import './PreOrder.css';
import { usePreOrderProducts } from '../utils/productStorage';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import LoginModal from '../components/LoginModal';
import { formatSaleEndLabel, formatSaleEndShort, shouldShowSaleBadge, hasDiscountedPrice } from '../utils/saleUtils';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import { useCatalogOptions } from '../hooks/useCatalogOptions';

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt12 = (timeStr) => {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const fmtDate = (dateStr) => {
  if (!dateStr) return null;
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
};

const fmtDateTime = (dateStr, timeStr) => {
  if (!dateStr) return null;
  const datePart = fmtDate(dateStr);
  const timePart = fmt12(timeStr);
  if (datePart && timePart) return `${datePart} at ${timePart}`;
  return datePart;
};

// ── Main Component ─────────────────────────────────────────────────────────
const PreOrder = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loadingId, setLoadingId] = useState(null);

  const categoryRef = useRef(null);
  const groupRef = useRef(null);

  const { isAuthenticated, user } = useAuth();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const placePreOrder = useMutation(api.preOrderRequests.placePreOrder);

  const preOrderProducts = usePreOrderProducts();
  const { items: catalogCategories } = useCatalogOptions('category');
  const { items: catalogGroups } = useCatalogOptions('kpopGroup');
  const categories = ['all', ...catalogCategories.map((c) => c.value)];
  const groups = ['all', ...catalogGroups.map((g) => g.value)];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target)) setCategoryDropdownOpen(false);
      if (groupRef.current && !groupRef.current.contains(e.target)) setGroupDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ Sort: latest added first
  const filteredProducts = preOrderProducts
    .filter((p) => {
      const categoryMatch = selectedCategory === 'all' || p.category === selectedCategory;
      const groupMatch = selectedGroup === 'all' || p.kpopGroup === selectedGroup;
      return categoryMatch && groupMatch;
    })
    .slice()
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const handleRequireLogin = () => {
    setSelectedProduct(null);
    setShowLoginModal(true);
  };

  // ── Pre-Order — with confirmation ──
  const handlePreOrder = async (product) => {
    if (!isAuthenticated) { handleRequireLogin(); return; }
    const ok = await confirm({
      title: 'Place pre-order?',
      message: `Pre-order "${product.name}"?\n\nPrice: ₱${product.price?.toLocaleString()}\n\nYou'll be notified via email when this item is available to purchase.`,
      confirmLabel: 'Pre-Order',
      variant: 'primary',
      icon: 'fa-clock',
    });
    if (!ok) return;
    setLoadingId(product._id);
    try {
      const result = await placePreOrder({
        userId: user._id,
        productId: product._id,
        userEmail: user.email,
        userName: user.name,
      });
      if (result.success) {
        showNotification(`${product.name} pre-ordered! You'll be emailed when it's available.`, 'success');
        setSelectedProduct(null);
      } else {
        showNotification(result.message || 'Pre-order failed.', 'error');
      }
    } catch {
      showNotification('Pre-order failed. Please try again.', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <main className="preorder-main">
      <section className="preorder-page">
        <div className="preorder-filter-bar">
          <div className="preorder-filters-row">
            <div className="preorder-filter-group">
              <label>CATEGORY:</label>
              <div className="preorder-dropdown" ref={categoryRef}>
                <button
                  type="button"
                  className="preorder-dropdown-toggle"
                  aria-haspopup="listbox"
                  aria-expanded={categoryDropdownOpen}
                  onClick={() => { setCategoryDropdownOpen((o) => !o); setGroupDropdownOpen(false); }}
                >
                  <span>{selectedCategory === 'all' ? 'All Categories' : selectedCategory}</span>
                  <i className={`fas fa-chevron-down ${categoryDropdownOpen ? 'open' : ''}`}></i>
                </button>
                {categoryDropdownOpen && (
                  <div className="preorder-dropdown-menu" role="listbox">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        role="option"
                        aria-selected={selectedCategory === cat}
                        className={`preorder-dropdown-item ${selectedCategory === cat ? 'active' : ''}`}
                        onClick={() => { setSelectedCategory(cat); setCategoryDropdownOpen(false); }}
                      >
                        {cat === 'all' ? 'All Categories' : cat}
                        {selectedCategory === cat && <i className="fas fa-check"></i>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="preorder-filter-divider" />

            <div className="preorder-filter-group">
              <label>GROUP:</label>
              <div className="preorder-dropdown" ref={groupRef}>
                <button
                  type="button"
                  className="preorder-dropdown-toggle"
                  aria-haspopup="listbox"
                  aria-expanded={groupDropdownOpen}
                  onClick={() => { setGroupDropdownOpen((o) => !o); setCategoryDropdownOpen(false); }}
                >
                  <span>{selectedGroup === 'all' ? 'All Groups' : selectedGroup}</span>
                  <i className={`fas fa-chevron-down ${groupDropdownOpen ? 'open' : ''}`}></i>
                </button>
                {groupDropdownOpen && (
                  <div className="preorder-dropdown-menu" role="listbox">
                    {groups.map((group) => (
                      <button
                        key={group}
                        type="button"
                        role="option"
                        aria-selected={selectedGroup === group}
                        className={`preorder-dropdown-item ${selectedGroup === group ? 'active' : ''}`}
                        onClick={() => { setSelectedGroup(group); setGroupDropdownOpen(false); }}
                      >
                        {group === 'all' ? 'All Groups' : group}
                        {selectedGroup === group && <i className="fas fa-check"></i>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="no-results">
            <i className="fas fa-inbox"></i>
            <h3>No pre-orders available</h3>
            <p>Check back soon for upcoming releases!</p>
          </div>
        ) : (
          <div className="preorder-grid">
            {filteredProducts.map(product => (
              <PreOrderCard
                key={product._id || product.id}
                product={product}
                userId={user?._id}
                isAuthenticated={isAuthenticated}
                loadingId={loadingId}
                onPreOrder={handlePreOrder}
                onOpenModal={() => setSelectedProduct(product)}
                fmtDateTime={fmtDateTime}
                fmtDate={fmtDate}
                fmt12={fmt12}
              />
            ))}
          </div>
        )}
      </section>

      {selectedProduct && (
        <PreOrderModal
          product={selectedProduct}
          userId={user?._id}
          isAuthenticated={isAuthenticated}
          loadingId={loadingId}
          onClose={() => setSelectedProduct(null)}
          onPreOrder={handlePreOrder}
          onRequireLogin={handleRequireLogin}
          fmtDateTime={fmtDateTime}
        />
      )}

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </main>
  );
};

// ── Card ───────────────────────────────────────────────────────────────────
const PreOrderCard = ({
  product, userId, isAuthenticated, loadingId,
  onPreOrder, onOpenModal, fmtDateTime
}) => {
  const isPreOrdered = useQuery(
    api.preOrderRequests.isProductPreOrdered,
    isAuthenticated && userId
      ? { userId, productId: product._id, releaseTime: product.releaseTime || '00:00' }
      : 'skip'
  );

  const releaseLabel = fmtDateTime(product.releaseDate, product.releaseTime);

  return (
    <div className="preorder-card" onClick={onOpenModal}>
      <div className="preorder-badge-stack">
        {shouldShowSaleBadge(product) && (
          <div className="preorder-sale-badge">
            <span>SALE</span>
            {(formatSaleEndShort(product) || formatSaleEndLabel(product)) && (
              <span className="preorder-sale-badge-end">
                {formatSaleEndShort(product) || formatSaleEndLabel(product)}
              </span>
            )}
          </div>
        )}
        <div className="preorder-badge">PRE-ORDER</div>
      </div>

      <div className="preorder-image">
        <img src={product.image} alt={product.name} />
      </div>

      <div className="preorder-info">
        <div className="product-group">{product.kpopGroup}</div>
        <h3 className="product-name">{product.name}</h3>

        {releaseLabel && (
          <div className="release-date-badge">
            <i className="fas fa-calendar-alt"></i>
            {releaseLabel}
          </div>
        )}

        <div className="product-price">
          <span className={`current-price${shouldShowSaleBadge(product) ? ' sale' : ''}`}>₱{product.price?.toLocaleString()}</span>
          {shouldShowSaleBadge(product) && hasDiscountedPrice(product) && (
            <>
              <span className="original-price">₱{product.originalPrice?.toLocaleString()}</span>
              <span className="discount">
                {Math.round((1 - product.price / product.originalPrice) * 100)}% OFF
              </span>
            </>
          )}
        </div>

        {shouldShowSaleBadge(product) && formatSaleEndLabel(product) && (
          <div className="preorder-sale-period">
            <i className="fas fa-clock"></i>
            <span>{formatSaleEndLabel(product)}</span>
          </div>
        )}

        <div className="stock-info">
          <i className="fas fa-box"></i>
          <span>{product.stock > 0 ? `${product.stock} slots remaining` : 'Out of stock'}</span>
        </div>

        <button
          className={`btn ${isPreOrdered ? 'btn-preordered' : 'btn-primary'}`}
          disabled={isPreOrdered || loadingId === product._id}
          onClick={(e) => {
            e.stopPropagation();
            if (!isPreOrdered) onPreOrder(product);
          }}
        >
          {isPreOrdered
            ? <><i className="fas fa-check"></i> Pre-Ordered</>
            : loadingId === product._id
              ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
              : <><i className="fas fa-clock"></i> Pre-Order Now</>
          }
        </button>
      </div>
    </div>
  );
};

// ── Modal — no Add to Wishlist button ──────────────────────────────────────
const PreOrderModal = ({
  product, userId, isAuthenticated, loadingId,
  onClose, onPreOrder, onRequireLogin, fmtDateTime
}) => {
  useCloseOnHistoryBack(true, onClose, 'preOrderModal');
  const isPreOrdered = useQuery(
    api.preOrderRequests.isProductPreOrdered,
    isAuthenticated && userId
      ? { userId, productId: product._id, releaseTime: product.releaseTime || '00:00' }
      : 'skip'
  );

  const releaseLabel = fmtDateTime(product.releaseDate, product.releaseTime);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="preorder-modal-content" onClick={e => e.stopPropagation()}>
        <button className="preorder-modal-close" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>

        <div className="preorder-modal-image">
          <div className="preorder-badge-stack">
            {shouldShowSaleBadge(product) && (
              <div className="preorder-sale-badge">
                <span>SALE</span>
                {(formatSaleEndShort(product) || formatSaleEndLabel(product)) && (
                  <span className="preorder-sale-badge-end">
                    {formatSaleEndShort(product) || formatSaleEndLabel(product)}
                  </span>
                )}
              </div>
            )}
            <div className="preorder-badge">PRE-ORDER</div>
          </div>
          <img src={product.image} alt={product.name} />
        </div>

        <div className="preorder-modal-info">
          <div className="product-group">{product.kpopGroup}</div>
          <h2 className="preorder-modal-name">{product.name}</h2>

          {releaseLabel && (
            <div className="preorder-modal-release">
              <i className="fas fa-calendar-alt"></i>
              <span><strong>Release:</strong> {releaseLabel}</span>
            </div>
          )}

          <div className="preorder-modal-price">
            <span className={shouldShowSaleBadge(product) ? 'sale' : ''}>₱{product.price?.toLocaleString()}</span>
            {shouldShowSaleBadge(product) && hasDiscountedPrice(product) && (
              <span className="original-price" style={{ marginLeft: 8 }}>₱{product.originalPrice?.toLocaleString()}</span>
            )}
          </div>

          {shouldShowSaleBadge(product) && formatSaleEndLabel(product) && (
            <div className="preorder-sale-period">
              <i className="fas fa-clock"></i>
              <span>{formatSaleEndLabel(product)}</span>
            </div>
          )}

          {product.description && (
            <p className="preorder-modal-desc">{product.description}</p>
          )}

          <div className="preorder-modal-stock">
            <i className="fas fa-box"></i>
            <span>{product.stock > 0 ? `${product.stock} slots remaining` : 'Out of stock'}</span>
          </div>

          {/* ✅ Pre-Order button only — Add to Wishlist removed */}
          <div className="preorder-modal-actions">
            <button
              className={`btn ${isPreOrdered ? 'btn-preordered' : 'btn-primary'}`}
              style={{ width: '100%' }}
              disabled={isPreOrdered || loadingId === product._id}
              onClick={() => {
                if (!isAuthenticated) { onRequireLogin(); return; }
                if (!isPreOrdered) onPreOrder(product);
              }}
            >
              {isPreOrdered
                ? <><i className="fas fa-check"></i> Pre-Ordered — We'll notify you!</>
                : loadingId === product._id
                  ? <><i className="fas fa-spinner fa-spin"></i> Processing...</>
                  : <><i className="fas fa-clock"></i> Pre-Order Now</>
              }
            </button>
          </div>

          {isPreOrdered && (
            <div className="preorder-notice">
              <i className="fas fa-bell"></i>
              You'll receive an email when this item is ready to purchase.{' '}
              <a href="/my-preorders">View My Pre-Orders →</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreOrder;
// src/pages/PreOrder.js
import React, { useState } from 'react';
import './PreOrder.css';
import { usePreOrderProducts } from '../utils/productStorage';
import { useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import LoginModal from '../components/LoginModal';

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
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loadingId, setLoadingId] = useState(null);

  const { isAuthenticated, user } = useAuth();
  const { showNotification } = useNotification();
  const toggleWishlist = useToggleWishlist();
  const placePreOrder = useMutation(api.preOrderRequests.placePreOrder);

  const preOrderProducts = usePreOrderProducts();
  const groups = ['all', ...new Set(preOrderProducts.map(p => p.kpopGroup).filter(Boolean))];
  const filteredProducts = selectedGroup === 'all'
    ? preOrderProducts
    : preOrderProducts.filter(p => p.kpopGroup === selectedGroup);

  const handleRequireLogin = () => {
    setSelectedProduct(null);
    setShowLoginModal(true);
  };

  // ✅ Pre-order → goes to preOrderRequests table, NOT cart
  const handlePreOrder = async (product) => {
    if (!isAuthenticated) { handleRequireLogin(); return; }
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

      <section className="preorder-page">
        <div className="preorder-filter-bar">
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

      {/* ── Inline Pre-Order Modal ── */}
      {selectedProduct && (
        <PreOrderModal
          product={selectedProduct}
          userId={user?._id}
          isAuthenticated={isAuthenticated}
          loadingId={loadingId}
          onClose={() => setSelectedProduct(null)}
          onPreOrder={handlePreOrder}
          onRequireLogin={handleRequireLogin}
          onAddToWishlist={handleAddToWishlist}
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
  onPreOrder, onOpenModal, fmtDateTime, fmtDate, fmt12
}) => {
  // ✅ FIX: Pass releaseTime so same product with new time = new pre-order allowed
  const isPreOrdered = useQuery(
    api.preOrderRequests.isProductPreOrdered,
    isAuthenticated && userId
      ? { userId, productId: product._id, releaseTime: product.releaseTime || '00:00' }
      : 'skip'
  );

  const releaseLabel = fmtDateTime(product.releaseDate, product.releaseTime);

  return (
    <div className="preorder-card" onClick={onOpenModal}>
      <div className="preorder-badge">PRE-ORDER</div>

      <div className="preorder-image">
        <img src={product.image} alt={product.name} />
      </div>

      <div className="preorder-info">
        <div className="product-group">{product.kpopGroup}</div>
        <h3 className="product-name">{product.name}</h3>

        {/* ✅ Release date + time on card */}
        {releaseLabel && (
          <div className="release-date-badge">
            <i className="fas fa-calendar-alt"></i>
            {releaseLabel}
          </div>
        )}

        <div className="product-price">
          <span className="current-price">₱{product.price?.toLocaleString()}</span>
          {product.isSale && product.originalPrice > product.price && (
            <>
              <span className="original-price">₱{product.originalPrice?.toLocaleString()}</span>
              <span className="discount">
                {Math.round((1 - product.price / product.originalPrice) * 100)}% OFF
              </span>
            </>
          )}
        </div>

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

// ── Modal ──────────────────────────────────────────────────────────────────
const PreOrderModal = ({
  product, userId, isAuthenticated, loadingId,
  onClose, onPreOrder, onRequireLogin, onAddToWishlist, fmtDateTime
}) => {
  // ✅ FIX: Pass releaseTime here too
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

          <div className="preorder-modal-price">₱{product.price?.toLocaleString()}</div>

          {product.description && (
            <p className="preorder-modal-desc">{product.description}</p>
          )}

          <div className="preorder-modal-stock">
            <i className="fas fa-box"></i>
            <span>{product.stock > 0 ? `${product.stock} slots remaining` : 'Out of stock'}</span>
          </div>

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

            <button
              className="btn btn-outline"
              style={{ width: '100%' }}
              onClick={() => {
                if (!isAuthenticated) { onRequireLogin(); return; }
                onAddToWishlist(product);
              }}
            >
              <i className="fas fa-star"></i> Add to Wishlist
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
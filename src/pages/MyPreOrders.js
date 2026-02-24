// src/pages/MyPreOrders.js
import React, { useState } from 'react';
import './MyPreOrders.css';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAddToCart } from '../context/cartUtils';
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

// ── Main Component ─────────────────────────────────────────────────────────
const MyPreOrders = () => {
  const { isAuthenticated, user } = useAuth();
  const { showNotification } = useNotification();
  const addToCart = useAddToCart();
  const [loadingId, setLoadingId] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'upcoming' | 'available' | 'added'

  const markAddedToCart = useMutation(api.preOrderRequests.markPreOrderAddedToCart);
  const removePreOrder = useMutation(api.preOrderRequests.removePreOrder);

  const myPreOrders = useQuery(
    api.preOrderRequests.getMyPreOrders,
    isAuthenticated && user?._id ? { userId: user._id } : 'skip'
  ) || [];

  if (!isAuthenticated) {
    return (
      <main className="mypreorders-main">
        <div className="page-header">
          <div className="container">
            <h1 className="page-title">My Pre-Orders</h1>
            <p className="page-description">Track your upcoming K-Pop merchandise</p>
          </div>
        </div>
        <div className="mpo-empty-state">
          <i className="fas fa-lock"></i>
          <h3>Login Required</h3>
          <p>Please log in to view your pre-orders.</p>
          <button className="btn btn-primary" onClick={() => setShowLoginModal(true)}>
            <i className="fas fa-sign-in-alt"></i> Login
          </button>
        </div>
        {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
      </main>
    );
  }

  // ── Tab filtering ──
  const filteredOrders = myPreOrders.filter((req) => {
    if (activeTab === 'upcoming') return !req.isAvailable && !req.addedToCart;
    if (activeTab === 'available') return req.isAvailable && !req.addedToCart;
    if (activeTab === 'added') return req.addedToCart;
    return true; // 'all' — show everything
  });

  const upcomingCount = myPreOrders.filter((r) => !r.isAvailable && !r.addedToCart).length;
  const availableCount = myPreOrders.filter((r) => r.isAvailable && !r.addedToCart).length;
  const addedCount = myPreOrders.filter((r) => r.addedToCart).length;

  // ── Add to cart handler ──
  const handleAddToCart = async (req) => {
    setLoadingId(req._id);
    try {
      const cartItem = {
        _id: req.productId,
        id: req.productId,
        name: req.productName,
        price: req.productPrice,
        image: req.productImage,
        stock: req.product?.stock ?? 99,
      };
      addToCart(cartItem);
      await markAddedToCart({ requestId: req._id });
      showNotification(`${req.productName} added to cart!`, 'success');
    } catch {
      showNotification('Failed to add to cart. Please try again.', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  // ── Remove handler ──
  const handleRemove = async (req) => {
    setRemovingId(req._id);
    try {
      await removePreOrder({ requestId: req._id });
      showNotification(`${req.productName} removed from pre-orders.`, 'success');
    } catch {
      showNotification('Failed to remove. Please try again.', 'error');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <main className="mypreorders-main">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">
            <i className="fas fa-clock"></i> My Pre-Orders
          </h1>
          <p className="page-description">
            Track your upcoming K-Pop merchandise releases
          </p>
        </div>
      </div>

      <div className="mpo-page">
        <div className="container">

          {/* ── Summary Stats ── */}
          <div className="mpo-stats">
            <div className="mpo-stat">
              <span className="mpo-stat-num">{myPreOrders.length}</span>
              <span className="mpo-stat-label">Total</span>
            </div>
            <div className="mpo-stat mpo-stat--upcoming">
              <span className="mpo-stat-num">{upcomingCount}</span>
              <span className="mpo-stat-label">Upcoming</span>
            </div>
            <div className="mpo-stat mpo-stat--available">
              <span className="mpo-stat-num">{availableCount}</span>
              <span className="mpo-stat-label">Available</span>
            </div>
            <div className="mpo-stat mpo-stat--added">
              <span className="mpo-stat-num">{addedCount}</span>
              <span className="mpo-stat-label">Added to Cart</span>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="mpo-tabs">
            <button
              className={`mpo-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All <span className="mpo-tab-count">{myPreOrders.length}</span>
            </button>
            <button
              className={`mpo-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming <span className="mpo-tab-count">{upcomingCount}</span>
            </button>
            <button
              className={`mpo-tab mpo-tab--available ${activeTab === 'available' ? 'active' : ''}`}
              onClick={() => setActiveTab('available')}
            >
              {availableCount > 0 && <span className="mpo-tab-dot"></span>}
              Available <span className="mpo-tab-count">{availableCount}</span>
            </button>
            <button
              className={`mpo-tab ${activeTab === 'added' ? 'active' : ''}`}
              onClick={() => setActiveTab('added')}
            >
              Added to Cart <span className="mpo-tab-count">{addedCount}</span>
            </button>
          </div>

          {/* ── Cards ── */}
          {myPreOrders.length === 0 ? (
            <div className="mpo-empty-state">
              <i className="fas fa-shopping-bag"></i>
              <h3>No Pre-Orders Yet</h3>
              <p>Browse the Pre-Order tab to reserve upcoming K-Pop items!</p>
              <a href="/preorder" className="btn btn-primary">
                <i className="fas fa-clock"></i> Browse Pre-Orders
              </a>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="mpo-empty-state mpo-empty-state--small">
              <i className="fas fa-filter"></i>
              <p>No items in this category.</p>
            </div>
          ) : (
            <div className="mpo-grid">
              {filteredOrders.map((req) => (
                <PreOrderCard
                  key={req._id}
                  req={req}
                  loadingId={loadingId}
                  removingId={removingId}
                  onAddToCart={handleAddToCart}
                  onRemove={handleRemove}
                  fmt12={fmt12}
                  fmtDate={fmtDate}
                />
              ))}
            </div>
          )}

        </div>
      </div>
    </main>
  );
};

// ── Card ───────────────────────────────────────────────────────────────────
const PreOrderCard = ({ req, loadingId, removingId, onAddToCart, onRemove, fmt12, fmtDate }) => {
  const isLoading = loadingId === req._id;
  const isRemoving = removingId === req._id;

  const releaseLabel = (() => {
    const d = fmtDate(req.releaseDate);
    const t = fmt12(req.releaseTime);
    if (d && t) return `${d} at ${t}`;
    return d || null;
  })();

  // Status logic
  const status = req.addedToCart
    ? 'added'
    : req.isAvailable
    ? 'available'
    : 'upcoming';

  return (
    <div className={`mpo-card mpo-card--${status}`}>
      {/* Status Badge */}
      <div className={`mpo-status-badge mpo-status-badge--${status}`}>
        {status === 'available' && <><span className="mpo-pulse"></span> Available Now!</>}
        {status === 'upcoming' && <><i className="fas fa-clock"></i> Upcoming</>}
        {status === 'added' && <><i className="fas fa-check"></i> Added to Cart</>}
      </div>

      {/* Image */}
      <div className="mpo-card-image">
        <img src={req.productImage} alt={req.productName} />
      </div>

      {/* Info */}
      <div className="mpo-card-info">
        <h3 className="mpo-card-name">{req.productName}</h3>

        <div className="mpo-card-price">₱{req.productPrice?.toLocaleString()}</div>

        {releaseLabel && (
          <div className={`mpo-release-badge ${status === 'available' || status === 'added' ? 'mpo-release-badge--done' : ''}`}>
            <i className={`fas ${status === 'upcoming' ? 'fa-calendar-alt' : 'fa-check-circle'}`}></i>
            <span>
              {status === 'upcoming' ? 'Releases: ' : 'Released: '}
              <strong>{releaseLabel}</strong>
            </span>
          </div>
        )}

        <div className="mpo-card-meta">
          <span><i className="fas fa-calendar-plus"></i> Pre-ordered {new Date(req.preOrderedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>

        {/* Actions */}
        <div className="mpo-card-actions">
          {status === 'available' && (
            <button
              className="btn btn-primary mpo-btn-cart"
              disabled={isLoading}
              onClick={() => onAddToCart(req)}
            >
              {isLoading
                ? <><i className="fas fa-spinner fa-spin"></i> Adding...</>
                : <><i className="fas fa-cart-plus"></i> Add to Cart</>
              }
            </button>
          )}

          {status === 'upcoming' && (
            <div className="mpo-waiting">
              <i className="fas fa-hourglass-half"></i>
              <span>Waiting for release...</span>
            </div>
          )}

          {status === 'added' && (
            <div className="mpo-added-notice">
              <i className="fas fa-check-circle"></i>
              <span>Already in your cart!</span>
            </div>
          )}

          {/* ✅ Remove button — visible for upcoming and added-to-cart only */}
          {status !== 'available' && (
            <button
              className="mpo-btn-remove"
              disabled={isRemoving}
              onClick={() => onRemove(req)}
            >
              {isRemoving
                ? <><i className="fas fa-spinner fa-spin"></i> Removing...</>
                : <><i className="fas fa-trash-alt"></i> Remove</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyPreOrders;
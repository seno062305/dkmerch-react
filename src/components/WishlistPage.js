import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './WishlistPage.css';
import { useWishlist, useRemoveFromWishlist } from '../context/wishlistUtils';
import { useAddToCart } from '../context/cartUtils';
import { useNotification } from '../context/NotificationContext';

const MAX_WISHLIST = 10;

const WishlistPage = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [lightboxImg, setLightboxImg] = useState(null);

  const wishlistItems = useWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  const addToCart = useAddToCart();

  // ✅ Convex already returns desc order (latest first) — just limit to 10
  const displayItems = (wishlistItems || []).slice(0, MAX_WISHLIST);
  const count = displayItems.length;

  const handleRemoveFromWishlist = (productId, productName) => {
    if (window.confirm(`Remove "${productName}" from your favorites?`)) {
      removeFromWishlist(productId);
      showNotification('Removed from favorites', 'success');
    }
  };

  const handleAddToCart = (item) => {
    if (!window.confirm(`Add "${item.name}" to cart?\n\nPrice: ₱${item.price?.toLocaleString()}`)) return;
    addToCart({
      id: item.productId,
      _id: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
    });
    showNotification('Added to cart successfully', 'success');
  };

  const handleClearWishlist = () => {
    if (window.confirm('Are you sure you want to clear all your favorites?')) {
      wishlistItems.forEach(item => removeFromWishlist(item.productId));
      showNotification('Favorites cleared', 'success');
    }
  };

  return (
    <main className="wishlist-main">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">My Favorites</h1>
          <p className="page-description">Your saved K-Pop merch picks — ready to order anytime!</p>
        </div>
      </div>

      <div className="container">
        <section className="wishlist-page">
          {count === 0 ? (
            <div className="orders-empty">
              <i className="fas fa-star"></i>
              <h3>No favorites yet</h3>
              <p>Click the star on any product to save it here.</p>
              <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                <i className="fas fa-shopping-bag"></i> Browse Products
              </button>
            </div>
          ) : (
            <>
              {/* ✅ Count bar with x/10 indicator */}
              <div className="wishlist-count-bar">
                <i className="fas fa-star"></i>
                <span>{count} favorite{count !== 1 ? 's' : ''}</span>
                <span className="wishlist-slot-indicator">
                  <span className={`wishlist-slot-count ${count >= MAX_WISHLIST ? 'full' : ''}`}>
                    {count}/{MAX_WISHLIST}
                  </span>
                  {count >= MAX_WISHLIST && (
                    <span className="wishlist-slot-full-label">Limit reached</span>
                  )}
                </span>
              </div>

              <div className="orders-grid">
                {displayItems.map(item => (
                  <div key={item.productId} className="order-card">
                    <div
                      className="order-card-img"
                      onClick={() => item.image && setLightboxImg(item.image)}
                      title={item.image ? 'Click to view image' : ''}
                    >
                      {item.image
                        ? <img src={item.image} alt={item.name} />
                        : <i className="fas fa-box order-no-img"></i>
                      }
                      {item.image && (
                        <div className="order-img-zoom">
                          <i className="fas fa-search-plus"></i>
                        </div>
                      )}
                      <span className="wishlist-star-badge">
                        <i className="fas fa-star"></i>
                      </span>
                    </div>

                    <div className="order-card-info">
                      <p className="order-card-name" style={{ minHeight: 'unset', marginBottom: '6px' }}>
                        {item.name}
                      </p>
                      <div className="order-card-price-row" style={{ marginBottom: '12px' }}>
                        <span className="order-card-price">₱{item.price?.toLocaleString()}</span>
                      </div>
                      <button
                        className="btn btn-primary btn-small order-view-btn"
                        style={{ marginBottom: '8px' }}
                        onClick={() => handleAddToCart(item)}
                      >
                        <i className="fas fa-shopping-cart"></i> Add to Cart
                      </button>
                      <button
                        className="order-remove-btn"
                        onClick={() => handleRemoveFromWishlist(item.productId, item.name)}
                      >
                        <i className="fas fa-trash-alt"></i> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="wishlist-footer-actions">
                <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                  <i className="fas fa-shopping-bag"></i> Continue Shopping
                </button>
                <button className="btn btn-outline-danger" onClick={handleClearWishlist}>
                  <i className="fas fa-trash"></i> Clear Favorites
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {lightboxImg && (
        <div className="order-lightbox" onClick={() => setLightboxImg(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImg(null)}>
            <i className="fas fa-times"></i>
          </button>
          <img src={lightboxImg} alt="Product" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </main>
  );
};

export default WishlistPage;
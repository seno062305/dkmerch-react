import React from 'react';
import { useNavigate } from 'react-router-dom';
import './WishlistPage.css';
import { useWishlist, useRemoveFromWishlist } from '../context/wishlistUtils';
import { useAddToCart } from '../context/cartUtils';
import { useNotification } from '../context/NotificationContext';

const WishlistPage = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();

  const wishlistItems = useWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  const addToCart = useAddToCart();

  const handleRemoveFromWishlist = (productId, productName) => {
    if (window.confirm(`Remove "${productName}" from your favorites?`)) {
      removeFromWishlist(productId);
      showNotification('Removed from favorites', 'success');
    }
  };

  const handleAddToCart = (item) => {
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
    <main className="container">
      <section className="wishlist-container">
        <div className="page-header">
          <div className="page-header-icon">
            <i className="fas fa-star"></i>
          </div>
          <h1 className="page-title">My Favorites</h1>
          <p className="page-description">Your saved K-Pop merch picks — ready to order anytime!</p>
        </div>

        {wishlistItems.length === 0 ? (
          <div className="wishlist-empty">
            <i className="fas fa-star"></i>
            <h3>No favorites yet</h3>
            <p>Click the star on any product to save it here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/collections')}>
              Browse Products
            </button>
          </div>
        ) : (
          <>
            <div className="wishlist-count-bar">
              <span><i className="fas fa-star"></i> {wishlistItems.length} favorite{wishlistItems.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="wishlist-grid">
              {wishlistItems.map(item => (
                <div key={item.productId} className="wishlist-item">
                  <div className="wishlist-item-header">
                    <div className="wishlist-item-title">{item.name}</div>
                    <button
                      className="wishlist-item-remove"
                      onClick={() => handleRemoveFromWishlist(item.productId, item.name)}
                      title="Remove from favorites"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="wishlist-item-content">
                    <div className="wishlist-product">
                      <div className="wishlist-product-image">
                        <img src={item.image} alt={item.name} />
                        <div className="favorite-badge">
                          <i className="fas fa-star"></i>
                        </div>
                      </div>
                      <div className="wishlist-product-info">
                        <div className="wishlist-product-name">{item.name}</div>
                        <div className="wishlist-product-price">₱{item.price?.toLocaleString()}</div>
                        <div className="wishlist-actions">
                          <button
                            className="btn btn-primary btn-small"
                            onClick={() => handleAddToCart(item)}
                          >
                            <i className="fas fa-shopping-cart"></i> Add to Cart
                          </button>
                          <button
                            className="btn btn-outline btn-small"
                            onClick={() => handleRemoveFromWishlist(item.productId, item.name)}
                          >
                            <i className="fas fa-trash"></i> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginTop: '40px' }}>
              <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                Continue Shopping
              </button>
              <button className="btn btn-outline" onClick={handleClearWishlist} style={{ marginLeft: '10px' }}>
                Clear Favorites
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
};

export default WishlistPage;
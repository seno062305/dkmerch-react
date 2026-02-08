import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './WishlistPage.css';
import { getWishlist, toggleWishlist } from '../utils/wishlistStorage';
import { getProducts } from '../utils/productStorage';
import { addToCart, getCart } from '../utils/cartStorage';
import { useNotification } from '../context/NotificationContext';

const WishlistPage = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [wishlistIds, setWishlistIds] = useState([]);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    loadWishlist();

    const handleStorageChange = () => {
      loadWishlist();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const loadWishlist = () => {
    const ids = getWishlist();
    const allProducts = getProducts();
    setWishlistIds(ids);
    setProducts(allProducts);
  };

  const handleRemoveFromWishlist = (productId, productName) => {
    // ✅ ADD CONFIRMATION BEFORE REMOVING
    if (window.confirm(`Remove "${productName}" from your wishlist?`)) {
      toggleWishlist(productId);
      loadWishlist();
      showNotification('Removed from wishlist', 'success');
    }
  };

  const handleAddToCart = (product) => {
    if (product.stock === 0) {
      showNotification('Product is out of stock', 'error');
      return;
    }

    // Check current cart quantity
    const cart = getCart();
    const cartItem = cart.find(item => item.id === product.id);
    const currentQuantity = cartItem ? cartItem.quantity : 0;

    // Check if adding one more would exceed stock
    if (currentQuantity >= product.stock) {
      showNotification(`Only ${product.stock} item(s) available in stock`, 'error');
      return;
    }

    addToCart(product.id);
    showNotification('Added to cart successfully', 'success');
    window.dispatchEvent(new Event('storage'));
  };

  const handleClearWishlist = () => {
    if (window.confirm('Are you sure you want to clear your entire wishlist?')) {
      wishlistIds.forEach(id => toggleWishlist(id));
      loadWishlist();
      showNotification('Wishlist cleared', 'success');
    }
  };

  const wishlistProducts = products.filter(p => wishlistIds.includes(p.id));

  return (
    <main className="container">
      <section className="wishlist-container">
        <div className="page-header">
          <h1 className="page-title">My Wishlist</h1>
          <p className="page-description">Save your favorite items and get notified when they're back in stock or on sale!</p>
        </div>
        
        {wishlistProducts.length === 0 ? (
          <div className="wishlist-empty">
            <i className="fas fa-heart"></i>
            <h3>Your wishlist is empty</h3>
            <p>Click the heart on any product to save it here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/collections')}>
              Browse Products
            </button>
          </div>
        ) : (
          <>
            <div className="wishlist-grid">
              {wishlistProducts.map(product => (
                <div key={product.id} className="wishlist-item">
                  <div className="wishlist-item-header">
                    <div className="wishlist-item-title">{product.kpopGroup}</div>
                    <button 
                      className="wishlist-item-remove"
                      onClick={() => handleRemoveFromWishlist(product.id, product.name)}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="wishlist-item-content">
                    <div className="wishlist-product">
                      <div className="wishlist-product-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                      <div className="wishlist-product-info">
                        <div className="wishlist-product-name">{product.name}</div>
                        <div className="wishlist-product-price">₱{product.price.toLocaleString()}</div>
                        <div className={`wishlist-product-stock ${product.stock > 0 ? 'in-stock' : ''}`}>
                          <i className={`fas ${product.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                          {product.stock > 0 ? `${product.stock} in stock` : 'Out of Stock'}
                        </div>
                        <div className="wishlist-actions">
                          <button 
                            className="btn btn-primary btn-small"
                            onClick={() => handleAddToCart(product)}
                            disabled={product.stock === 0}
                          >
                            <i className="fas fa-shopping-cart"></i> Add to Cart
                          </button>
                          <button 
                            className="btn btn-outline btn-small"
                            onClick={() => handleRemoveFromWishlist(product.id, product.name)}
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
                Clear Wishlist
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
};

export default WishlistPage;
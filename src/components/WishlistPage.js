import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './WishlistPage.css';

const WishlistPage = () => {
  const navigate = useNavigate();
  const [wishlists, setWishlists] = useState([
    { id: 1, name: "My K-Pop Favorites", description: "Items I want to buy next month", products: [1, 3, 5] },
    { id: 2, name: "Birthday Wishlist", description: "For my birthday next week!", products: [2, 7] }
  ]);

  const products = [
    { id: 1, name: "BTS 'Proof' Album Set", price: 3599, image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", stock: 15, kpopGroup: "BTS" },
    { id: 2, name: "BLACKPINK 'BORN PINK' Album", price: 2499, image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", stock: 8, kpopGroup: "BLACKPINK" },
    { id: 3, name: "TWICE Official Light Stick", price: 3299, image: "https://images.unsplash.com/photo-1578269174936-2709b6aeb913?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", stock: 5, kpopGroup: "TWICE" },
    { id: 5, name: "BTS Jimin Photocard Set", price: 899, image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", stock: 22, kpopGroup: "BTS" },
    { id: 7, name: "BTS 'LOVE YOURSELF' Hoodie", price: 1899, image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", stock: 7, kpopGroup: "BTS" }
  ];

  const handleRemoveFromWishlist = (listId, productId) => {
    setWishlists(prev => prev.map(list => {
      if (list.id === listId) {
        const updatedProducts = list.products.filter(id => id !== productId);
        return { ...list, products: updatedProducts };
      }
      return list;
    }).filter(list => list.products.length > 0));
  };

  const handleRemoveWishlist = (listId) => {
    setWishlists(prev => prev.filter(list => list.id !== listId));
  };

  const handleClearWishlist = () => {
    if (window.confirm('Are you sure you want to clear your entire wishlist?')) {
      setWishlists([]);
    }
  };

  const getProductById = (id) => {
    return products.find(p => p.id === id);
  };

  return (
    <main className="container">
      <section className="wishlist-container">
        <div className="page-header">
          <h1 className="page-title">My Wishlist</h1>
          <p className="page-description">Save your favorite items and get notified when they're back in stock or on sale!</p>
        </div>
        
        {wishlists.length === 0 ? (
          <div className="wishlist-empty">
            <i className="fas fa-heart"></i>
            <h3>Your wishlist is empty</h3>
            <p>Click the heart on any product to save it here.</p>
            <button className="btn btn-primary" onClick={() => navigate('/')}>
              Browse Products
            </button>
          </div>
        ) : (
          <>
            <div className="wishlist-grid">
              {wishlists.map(list => (
                <div key={list.id} className="wishlist-item">
                  <div className="wishlist-item-header">
                    <div className="wishlist-item-title">{list.name}</div>
                    <button 
                      className="wishlist-item-remove"
                      onClick={() => handleRemoveWishlist(list.id)}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                  <div className="wishlist-item-content">
                    <p style={{ marginBottom: '15px', color: 'var(--gray-color)' }}>
                      {list.description}
                    </p>
                    {list.products.map(productId => {
                      const product = getProductById(productId);
                      if (!product) return null;
                      return (
                        <div key={productId} className="wishlist-product">
                          <div className="wishlist-product-image">
                            <img src={product.image} alt={product.name} />
                          </div>
                          <div className="wishlist-product-info">
                            <div className="wishlist-product-name">{product.name}</div>
                            <div className="wishlist-product-price">₱{product.price.toLocaleString()}</div>
                            <div className={`wishlist-product-stock ${product.stock > 0 ? 'in-stock' : ''}`}>
                              <i className={`fas ${product.stock > 0 ? 'fa-check-circle' : 'fa-times-circle'}`}></i>
                              {product.stock > 0 ? 'In Stock' : 'Out of Stock'}
                            </div>
                            <div className="wishlist-actions">
                              <button className="btn btn-primary btn-small">
                                <i className="fas fa-shopping-cart"></i> Add to Cart
                              </button>
                              <button 
                                className="btn btn-outline btn-small"
                                onClick={() => handleRemoveFromWishlist(list.id, productId)}
                              >
                                <i className="fas fa-trash"></i> Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <button className="btn btn-primary" onClick={() => navigate('/')}>
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
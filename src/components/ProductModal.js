import React from 'react';
import './ProductModal.css';

const ProductModal = ({ product, onClose, onAddToCart }) => {
  if (!product) return null;

  return (
    <div className="product-modal-overlay" onClick={onClose}>
      <div className="product-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose}>
          <i className="fas fa-times"></i>
        </button>
        
        <div className="product-modal-content">
          <div className="product-modal-image">
            <img src={product.image} alt={product.name} />
            {product.isSale && (
              <span className="product-badge sale-badge">SALE</span>
            )}
            {product.isPreOrder && (
              <span className="product-badge preorder-badge">PRE-ORDER</span>
            )}
          </div>
          
          <div className="product-modal-details">
            <span className="product-group">{product.kpopGroup}</span>
            <h2>{product.name}</h2>
            
            <div className="product-rating">
              {[...Array(5)].map((_, i) => (
                <i 
                  key={i} 
                  className={`fas fa-star ${i < Math.floor(product.rating) ? 'filled' : ''}`}
                ></i>
              ))}
              <span>({product.reviewCount} reviews)</span>
            </div>
            
            <div className="product-price">
              <span className="current-price">₱{product.price.toLocaleString()}</span>
              {product.originalPrice && (
                <span className="original-price">₱{product.originalPrice.toLocaleString()}</span>
              )}
              {product.isSale && (
                <span className="discount-percent">
                  {Math.round((1 - product.price/product.originalPrice) * 100)}% OFF
                </span>
              )}
            </div>
            
            <p className="product-description">{product.description}</p>
            
            <div className="product-stock">
              <i className="fas fa-box"></i>
              <span className={product.stock > 0 ? 'in-stock' : 'out-stock'}>
                {product.stock > 0 ? `${product.stock} items left` : 'Out of stock'}
              </span>
            </div>
            
            <div className="product-actions">
              <button 
                className="btn btn-primary add-to-cart-btn"
                onClick={() => {
                  onAddToCart(product.id);
                  onClose();
                }}
                disabled={product.stock === 0}
              >
                <i className="fas fa-shopping-cart"></i>
                Add to Cart
              </button>
              
              <button className="btn btn-outline wishlist-btn">
                <i className="fas fa-heart"></i>
                Add to Wishlist
              </button>
            </div>
            
            <div className="product-shipping">
              <div className="shipping-info">
                <i className="fas fa-shipping-fast"></i>
                <div>
                  <h4>Free Shipping</h4>
                  <p>On orders over ₱2,000</p>
                </div>
              </div>
              <div className="shipping-info">
                <i className="fas fa-undo"></i>
                <div>
                  <h4>Easy Returns</h4>
                  <p>30-day return policy</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
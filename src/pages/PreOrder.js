import React from 'react';
import './PreOrder.css';

const PreOrder = () => {
  const preOrderProducts = [
    {
      id: 1,
      name: "BTS 'Proof' Album Set",
      group: "BTS",
      releaseDate: "June 10, 2024",
      image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      price: 3599,
      description: "Limited edition album set includes CD, photobook, photocard set, poster and more."
    },
    // ... more pre-order products
  ];

  return (
    <div className="preorder-page">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Pre-Order</h1>
          <p className="page-description">Reserve upcoming releases and exclusive items before they're available to everyone!</p>
        </div>
      </div>

      <div className="preorder-content">
        <div className="container">
          <div className="preorder-info">
            <div className="info-card">
              <i className="fas fa-shipping-fast"></i>
              <h3>Guaranteed Stock</h3>
              <p>Pre-ordering ensures you get the item on release day</p>
            </div>
            <div className="info-card">
              <i className="fas fa-gift"></i>
              <h3>Exclusive Bonuses</h3>
              <p>Pre-orders often include extra photocards or posters</p>
            </div>
            <div className="info-card">
              <i className="fas fa-calendar-check"></i>
              <h3>Release Date Delivery</h3>
              <p>Items shipped to arrive on or before release date</p>
            </div>
          </div>

          <div className="preorder-products">
            <h2 className="section-title">Available for Pre-Order</h2>
            <div className="products-grid">
              {preOrderProducts.map(product => (
                <div key={product.id} className="preorder-product-card">
                  <div className="product-image">
                    <img src={product.image} alt={product.name} />
                    <span className="preorder-badge">PRE-ORDER</span>
                  </div>
                  <div className="product-info">
                    <div className="product-group">{product.group}</div>
                    <h3 className="product-name">{product.name}</h3>
                    <p className="release-date">
                      <i className="fas fa-calendar-alt"></i> Releases: {product.releaseDate}
                    </p>
                    <p className="product-description">{product.description}</p>
                    <div className="product-price-row">
                      <div className="price">₱{product.price.toLocaleString()}</div>
                      <button className="btn btn-primary">Pre-Order Now</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreOrder;
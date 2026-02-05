import React from 'react';
import './NewArrivals.css';

const NewArrivals = () => {
  const newProducts = [
    {
      id: 1,
      name: "BTS 'Proof' Album Set",
      group: "BTS",
      price: 3599,
      originalPrice: 3999,
      image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      dateAdded: "Feb 1, 2026",
      isNew: true,
      isSale: true
    },
    {
      id: 2,
      name: "BLACKPINK 'BORN PINK' Album",
      group: "BLACKPINK",
      price: 2499,
      originalPrice: 2799,
      image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      dateAdded: "Feb 2, 2026",
      isNew: true,
      isSale: true
    },
    {
      id: 3,
      name: "TWICE Official Light Stick",
      group: "TWICE",
      price: 3299,
      originalPrice: 3499,
      image: "https://images.unsplash.com/photo-1578269174936-2709b6aeb913?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      dateAdded: "Feb 3, 2026",
      isNew: true,
      isSale: false
    },
    {
      id: 4,
      name: "BTS Jimin Photocard Set",
      group: "BTS",
      price: 899,
      originalPrice: 999,
      image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      dateAdded: "Feb 4, 2026",
      isNew: true,
      isSale: false
    },
    {
      id: 5,
      name: "STRAY KIDS 'MAXIDENT' Album",
      group: "STRAY KIDS",
      price: 1999,
      originalPrice: 2199,
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      dateAdded: "Jan 30, 2026",
      isNew: true,
      isSale: true
    },
    {
      id: 6,
      name: "BTS 'LOVE YOURSELF' Hoodie",
      group: "BTS",
      price: 1899,
      originalPrice: 2199,
      image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      dateAdded: "Jan 28, 2026",
      isNew: true,
      isSale: true
    }
  ];

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">New Arrivals</h1>
          <p className="page-description">Check out the latest additions to our K-Pop merchandise collection</p>
        </div>
      </div>

      <div className="container">
        <section className="new-arrivals-page">
          <div className="new-arrivals-intro">
            <i className="fas fa-star"></i>
            <p>Fresh off the press! These items just arrived and are ready to ship.</p>
          </div>

          <div className="products-grid">
            {newProducts.map(product => (
              <div key={product.id} className="product-card">
                {product.isNew && <span className="badge new-badge">NEW</span>}
                {product.isSale && <span className="badge sale-badge">SALE</span>}
                
                <div className="product-image">
                  <img src={product.image} alt={product.name} />
                  <div className="product-overlay">
                    <button className="btn btn-primary btn-small">
                      <i className="fas fa-eye"></i> Quick View
                    </button>
                  </div>
                </div>
                
                <div className="product-info">
                  <div className="product-meta">
                    <span className="product-group">{product.group}</span>
                    <span className="date-added">
                      <i className="fas fa-clock"></i> {product.dateAdded}
                    </span>
                  </div>
                  <h3 className="product-name">{product.name}</h3>
                  <div className="product-price">
                    <span className="current-price">₱{product.price.toLocaleString()}</span>
                    {product.originalPrice > product.price && (
                      <>
                        <span className="original-price">₱{product.originalPrice.toLocaleString()}</span>
                        <span className="discount-percent">
                          {Math.round((1 - product.price/product.originalPrice) * 100)}% OFF
                        </span>
                      </>
                    )}
                  </div>
                  <button className="btn btn-primary btn-small">
                    <i className="fas fa-shopping-cart"></i> Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};

export default NewArrivals;
import React, { useState } from 'react';
import './PreOrder.css';

const PreOrder = () => {
  const [selectedGroup, setSelectedGroup] = useState('all');

  const preOrderProducts = [
    {
      id: 1,
      name: "SEVENTEEN 'SECTOR 17' Album",
      group: "SEVENTEEN",
      price: 2199,
      originalPrice: 2399,
      releaseDate: "March 15, 2026",
      image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      description: "4th studio repackage album with 3 new tracks and exclusive photocards.",
      stock: 100,
      benefits: ["Early bird discount", "Exclusive photocard", "Poster included"]
    },
    {
      id: 2,
      name: "BLACKPINK 'THE ALBUM' Vinyl",
      group: "BLACKPINK",
      price: 4299,
      originalPrice: 4599,
      releaseDate: "March 20, 2026",
      image: "https://images.unsplash.com/photo-1544785349-c4a5301826fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      description: "Limited edition vinyl version of BLACKPINK's first studio album.",
      stock: 50,
      benefits: ["Limited edition", "Numbered certificate", "Special packaging"]
    },
    {
      id: 3,
      name: "NewJeans 'OMG' Album",
      group: "NEWJEANS",
      price: 1899,
      originalPrice: 2099,
      releaseDate: "April 1, 2026",
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80",
      description: "First full album with 12 tracks including title track 'OMG'.",
      stock: 150,
      benefits: ["Pre-order photocard", "Poster", "Member stickers"]
    }
  ];

  const groups = ['all', 'SEVENTEEN', 'BLACKPINK', 'NEWJEANS', 'BTS', 'TWICE'];

  const filteredProducts = selectedGroup === 'all' 
    ? preOrderProducts 
    : preOrderProducts.filter(p => p.group === selectedGroup);

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Pre-Order Items</h1>
          <p className="page-description">Be the first to get upcoming releases from your favorite K-Pop groups</p>
        </div>
      </div>

      <div className="container">
        <section className="preorder-page">
          <div className="filter-bar">
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

          <div className="preorder-grid">
            {filteredProducts.map(product => (
              <div key={product.id} className="preorder-card">
                <div className="preorder-badge">PRE-ORDER</div>
                <div className="preorder-image">
                  <img src={product.image} alt={product.name} />
                  <div className="release-date">
                    <i className="fas fa-calendar-alt"></i>
                    <span>{product.releaseDate}</span>
                  </div>
                </div>
                <div className="preorder-info">
                  <div className="product-group">{product.group}</div>
                  <h3 className="product-name">{product.name}</h3>
                  <p className="product-description">{product.description}</p>
                  
                  <div className="benefits">
                    <h4>Pre-order Benefits:</h4>
                    <ul>
                      {product.benefits.map((benefit, index) => (
                        <li key={index}>
                          <i className="fas fa-check-circle"></i> {benefit}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="product-price">
                    <span className="current-price">₱{product.price.toLocaleString()}</span>
                    <span className="original-price">₱{product.originalPrice.toLocaleString()}</span>
                    <span className="discount">
                      {Math.round((1 - product.price/product.originalPrice) * 100)}% OFF
                    </span>
                  </div>

                  <div className="stock-info">
                    <i className="fas fa-box"></i>
                    <span>{product.stock} slots remaining</span>
                  </div>

                  <button className="btn btn-primary">
                    <i className="fas fa-shopping-cart"></i> Pre-Order Now
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="no-results">
              <i className="fas fa-inbox"></i>
              <h3>No pre-orders available</h3>
              <p>Check back soon for upcoming releases!</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default PreOrder;
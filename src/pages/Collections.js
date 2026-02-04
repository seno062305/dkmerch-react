import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Collections.css';

const Collections = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const category = queryParams.get('category') || 'all';
  const group = queryParams.get('group') || null;

  const [filter, setFilter] = useState({
    category: category,
    group: group,
    priceRange: [0, 5000],
    sortBy: 'popular'
  });

  const categories = [
    { id: 'all', name: 'All Products' },
    { id: 'albums', name: 'Albums' },
    { id: 'photocards', name: 'Photocards' },
    { id: 'lightsticks', name: 'Lightsticks' },
    { id: 'apparel', name: 'Apparel' },
    { id: 'accessories', name: 'Accessories' }
  ];

  const groups = [
    { id: 'BTS', name: 'BTS' },
    { id: 'BLACKPINK', name: 'BLACKPINK' },
    { id: 'TWICE', name: 'TWICE' },
    { id: 'SEVENTEEN', name: 'SEVENTEEN' },
    { id: 'STRAY KIDS', name: 'STRAY KIDS' },
    { id: 'EXO', name: 'EXO' },
    { id: 'RED VELVET', name: 'RED VELVET' },
    { id: 'NEWJEANS', name: 'NEWJEANS' }
  ];

  const products = [
    // ... products data
  ];

  const filteredProducts = products.filter(product => {
    if (filter.category !== 'all' && product.category !== filter.category) return false;
    if (filter.group && product.kpopGroup !== filter.group) return false;
    if (product.price < filter.priceRange[0] || product.price > filter.priceRange[1]) return false;
    return true;
  });

  return (
    <div className="collections-page">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Collections</h1>
          <p className="page-description">Browse through our extensive collection of official K-Pop merchandise</p>
        </div>
      </div>

      <div className="collections-content">
        <div className="container">
          <div className="collections-grid">
            <div className="collections-sidebar">
              <div className="filter-section">
                <h3>Categories</h3>
                <ul className="filter-list">
                  {categories.map(cat => (
                    <li key={cat.id}>
                      <button 
                        className={`filter-item ${filter.category === cat.id ? 'active' : ''}`}
                        onClick={() => setFilter({...filter, category: cat.id})}
                      >
                        {cat.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="filter-section">
                <h3>K-Pop Groups</h3>
                <div className="group-filter">
                  {groups.map(group => (
                    <button
                      key={group.id}
                      className={`group-chip ${filter.group === group.id ? 'active' : ''}`}
                      onClick={() => setFilter({...filter, group: filter.group === group.id ? null : group.id})}
                    >
                      {group.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-section">
                <h3>Price Range</h3>
                <div className="price-filter">
                  <input
                    type="range"
                    min="0"
                    max="10000"
                    step="100"
                    value={filter.priceRange[1]}
                    onChange={(e) => setFilter({...filter, priceRange: [filter.priceRange[0], parseInt(e.target.value)]})}
                  />
                  <div className="price-display">
                    <span>₱{filter.priceRange[0]}</span> - <span>₱{filter.priceRange[1]}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="collections-main">
              <div className="collections-header">
                <div className="results-count">
                  {filteredProducts.length} products found
                </div>
                <div className="sort-options">
                  <select 
                    value={filter.sortBy}
                    onChange={(e) => setFilter({...filter, sortBy: e.target.value})}
                  >
                    <option value="popular">Most Popular</option>
                    <option value="newest">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                  </select>
                </div>
              </div>

              <div className="products-grid">
                {filteredProducts.map(product => (
                  <div key={product.id} className="product-card">
                    <div className="product-image">
                      <img src={product.image} alt={product.name} />
                      {product.isSale && <span className="sale-badge">SALE</span>}
                    </div>
                    <div className="product-info">
                      <div className="product-group">{product.kpopGroup}</div>
                      <h3 className="product-name">{product.name}</h3>
                      <div className="product-price">
                        <span className="current-price">₱{product.price.toLocaleString()}</span>
                        {product.originalPrice > product.price && (
                          <span className="original-price">₱{product.originalPrice.toLocaleString()}</span>
                        )}
                      </div>
                      <button className="btn btn-primary btn-small">Add to Cart</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Collections;
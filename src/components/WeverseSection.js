import React, { useState } from 'react';
import './WeverseSection.css';

const WeverseSection = ({ onProductClick, onAddToCart }) => {
  const [activeFilter, setActiveFilter] = useState('all');

  const products = [
    { 
      id: 1,  
      name: "BTS 'Proof' Album Set",                   
      category: "albums",      
      price: 3599, 
      originalPrice: 3999, 
      image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Limited edition album set includes CD, photobook, photocard set, poster and more.", 
      stock: 15, 
      isPreOrder: false, 
      isSale: true,
      reviewCount: 24,
      kpopGroup: "BTS",          
      rating: 4.8 
    },
    // ... (same products array as in App.js, pero isa-isahin mo)
    { id: 2, name: "BLACKPINK 'BORN PINK' Album", category: "albums", price: 2499, originalPrice: 2799, image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "Second studio album with 8 tracks including 'Pink Venom' and 'Shut Down'.", stock: 8, isPreOrder: false, isSale: true, reviewCount: 18, kpopGroup: "BLACKPINK", rating: 4.9 },
    { id: 3, name: "TWICE Official Light Stick", category: "lightsticks", price: 3299, originalPrice: 3499, image: "https://images.unsplash.com/photo-1578269174936-2709b6aeb913?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "Candybong Z with Bluetooth connectivity and multiple light modes.", stock: 5, isPreOrder: false, isSale: false, reviewCount: 32, kpopGroup: "TWICE", rating: 4.7 },
    { id: 4, name: "SEVENTEEN 'SECTOR 17' Album", category: "albums", price: 2199, originalPrice: 2399, image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "4th studio repackage album with 3 new tracks and exclusive photocards.", stock: 0, isPreOrder: true, isSale: true, reviewCount: 15, kpopGroup: "SEVENTEEN", rating: 4.6 },
    { id: 5, name: "BTS Jimin Photocard Set", category: "photocards", price: 899, originalPrice: 999, image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "Set of 5 exclusive Jimin photocards from various album releases.", stock: 22, isPreOrder: false, isSale: false, reviewCount: 42, kpopGroup: "BTS", rating: 4.9 },
    { id: 6, name: "STRAY KIDS 'MAXIDENT' Album", category: "albums", price: 1999, originalPrice: 2199, image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "Mini album with 8 tracks including 'CASE 143' and exclusive member versions.", stock: 12, isPreOrder: false, isSale: true, reviewCount: 28, kpopGroup: "STRAY KIDS", rating: 4.8 },
    { id: 7, name: "BTS 'LOVE YOURSELF' Hoodie", category: "apparel", price: 1899, originalPrice: 2199, image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "Official BTS merch hoodie with 'LOVE YOURSELF' logo and album artwork.", stock: 7, isPreOrder: false, isSale: true, reviewCount: 36, kpopGroup: "BTS", rating: 4.5 },
    { id: 8, name: "BLACKPINK 'THE ALBUM' Vinyl", category: "albums", price: 4299, originalPrice: 4599, image: "https://images.unsplash.com/photo-1544785349-c4a5301826fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", description: "Limited edition vinyl version of BLACKPINK's first studio album.", stock: 3, isPreOrder: true, isSale: false, reviewCount: 9, kpopGroup: "BLACKPINK", rating: 5.0 }
  ];

  const groups = ['all', 'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN', 'STRAY KIDS', 'EXO', 'RED VELVET', 'NEWJEANS'];

  const filteredProducts = activeFilter === 'all' 
    ? products 
    : products.filter(product => product.kpopGroup === activeFilter);

  const handleFilterClick = (group) => {
    setActiveFilter(group);
  };

  const handleProductClick = (product) => {
    onProductClick(product);
  };

  const handleAddToCartClick = (e, productId) => {
    e.stopPropagation();
    onAddToCart(productId);
  };

  return (
    <section className="weverse-section" id="collections">
      {/* Navy Banner */}
      <div className="wv-banner">
        <div className="wv-banner-text">
          <h2>DKMerch<br /><span style={{ fontWeight: 400, fontSize: '15px', opacity: 0.75 }}>by Fans</span></h2>
          <p>Design your own merch<br />for a unique fandom experience!</p>
        </div>
        {/* Simple SVG mascot illustration */}
        <div className="wv-banner-illustration">
          <svg viewBox="0 0 160 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Graduation cap character */}
            <circle cx="80" cy="52" r="24" fill="#f5c6a0" />
            <ellipse cx="80" cy="72" rx="28" ry="10" fill="#e8b88a" />
            {/* Cap */}
            <rect x="58" y="28" width="44" height="6" rx="3" fill="#2a2a5a" />
            <polygon points="80,18 58,28 102,28" fill="#2a2a5a" />
            <line x1="100" y1="28" x2="108" y2="40" stroke="#f0c040" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="108" cy="42" r="3" fill="#f0c040" />
            {/* Eyes */}
            <circle cx="72" cy="50" r="2.5" fill="#222" />
            <circle cx="88" cy="50" r="2.5" fill="#222" />
            {/* Smile */}
            <path d="M74 58 Q80 63 86 58" stroke="#222" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            {/* Stars around */}
            <polygon points="30,25 32,30 37,30 33,33 34,38 30,35 26,38 27,33 23,30 28,30" fill="#7b8fcf" opacity="0.7" />
            <polygon points="135,18 136.5,22 141,22 137.5,24.5 138.5,28.5 135,26 131.5,28.5 132.5,24.5 129,22 133.5,22" fill="#a88fd4" opacity="0.6" />
            <circle cx="20" cy="55" r="3" fill="#5a6da0" opacity="0.5" />
            <circle cx="148" cy="50" r="2.5" fill="#7b8fcf" opacity="0.5" />
            {/* Diploma scroll */}
            <rect x="100" y="60" width="22" height="16" rx="2" fill="#fff" stroke="#ccc" strokeWidth="1" />
            <line x1="103" y1="65" x2="119" y2="65" stroke="#ddd" strokeWidth="1.2" />
            <line x1="103" y1="68" x2="115" y2="68" stroke="#ddd" strokeWidth="1.2" />
            <circle cx="111" cy="73" r="3" fill="#f0c040" />
          </svg>
        </div>
      </div>

      {/* Group Filter Tabs */}
      <div className="wv-filter-bar">
        {groups.map(group => (
          <button
            key={group}
            className={`wv-filter-tab ${activeFilter === group ? 'active' : ''}`}
            onClick={() => handleFilterClick(group)}
          >
            {group === 'all' ? 'All' : group}
          </button>
        ))}
      </div>

      {/* 4-col Product Grid */}
      <div className="wv-grid">
        {filteredProducts.map(product => {
          const fullStars = Math.floor(product.rating);
          const hasHalfStar = product.rating % 1 >= 0.5;
          let starsHTML = [];
          for (let i = 0; i < fullStars; i++) {
            starsHTML.push(<i key={i} className="fas fa-star"></i>);
          }
          if (hasHalfStar) {
            starsHTML.push(<i key="half" className="fas fa-star-half-alt"></i>);
          }
          const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
          for (let i = 0; i < emptyStars; i++) {
            starsHTML.push(<i key={`empty-${i}`} className="far fa-star"></i>);
          }

          return (
            <div
              key={product.id}
              className="wv-card"
              onClick={() => handleProductClick(product)}
            >
              {product.isSale && <div className="wv-sale-badge">SALE</div>}
              <div className="wv-card-heart">
                <i className="fas fa-heart"></i>
              </div>
              <div className="wv-card-img">
                <img src={product.image} alt={product.name} />
              </div>
              <div className="wv-card-info">
                <div className="wv-card-group">{product.kpopGroup}</div>
                <div className="wv-card-name">{product.name}</div>
                <div className="wv-card-price-row">
                  <span className={`wv-card-price-current ${product.isSale ? 'sale' : ''}`}>
                    ₱{product.price.toLocaleString()}
                  </span>
                  {product.originalPrice > product.price && (
                    <span className="wv-card-price-original">
                      ₱{product.originalPrice.toLocaleString()}
                    </span>
                  )}
                </div>
                {product.reviewCount > 0 && (
                  <div className="wv-card-reviews">
                    <span className="wv-card-stars">{starsHTML}</span>
                    <span className="wv-card-review-count">
                      {product.reviewCount} Review{product.reviewCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* See All */}
      <div className="wv-see-all-row">
        <button className="wv-see-all" onClick={() => handleFilterClick('all')}>
          See All <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </section>
  );
};

export default WeverseSection;
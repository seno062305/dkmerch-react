import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './Collections.css';

const Collections = () => {
  const [searchParams] = useSearchParams();
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || 'all');
  const [selectedGroup, setSelectedGroup] = useState(searchParams.get('group') || 'all');

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
    { 
      id: 2,  
      name: "BLACKPINK 'BORN PINK' Album",            
      category: "albums",      
      price: 2499, 
      originalPrice: 2799, 
      image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Second studio album with 8 tracks including 'Pink Venom' and 'Shut Down'.", 
      stock: 8, 
      isPreOrder: false, 
      isSale: true,
      reviewCount: 18,
      kpopGroup: "BLACKPINK",    
      rating: 4.9 
    },
    { 
      id: 3,  
      name: "TWICE Official Light Stick",             
      category: "lightsticks", 
      price: 3299, 
      originalPrice: 3499, 
      image: "https://images.unsplash.com/photo-1578269174936-2709b6aeb913?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Candybong Z with Bluetooth connectivity and multiple light modes.", 
      stock: 5, 
      isPreOrder: false, 
      isSale: false,
      reviewCount: 32,
      kpopGroup: "TWICE",           
      rating: 4.7 
    },
    { 
      id: 4,  
      name: "SEVENTEEN 'SECTOR 17' Album",            
      category: "albums",      
      price: 2199, 
      originalPrice: 2399, 
      image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "4th studio repackage album with 3 new tracks and exclusive photocards.", 
      stock: 0, 
      isPreOrder: true, 
      isSale: true,
      reviewCount: 15,
      kpopGroup: "SEVENTEEN",     
      rating: 4.6 
    },
    { 
      id: 5,  
      name: "BTS Jimin Photocard Set",                
      category: "photocards",  
      price: 899,  
      originalPrice: 999,  
      image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Set of 5 exclusive Jimin photocards from various album releases.", 
      stock: 22, 
      isPreOrder: false, 
      isSale: false,
      reviewCount: 42,
      kpopGroup: "BTS",          
      rating: 4.9 
    },
    { 
      id: 6,  
      name: "STRAY KIDS 'MAXIDENT' Album",            
      category: "albums",      
      price: 1999, 
      originalPrice: 2199, 
      image: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Mini album with 8 tracks including 'CASE 143' and exclusive member versions.", 
      stock: 12, 
      isPreOrder: false, 
      isSale: true,
      reviewCount: 28,
      kpopGroup: "STRAY KIDS",   
      rating: 4.8 
    },
    { 
      id: 7,  
      name: "BTS 'LOVE YOURSELF' Hoodie",             
      category: "apparel",     
      price: 1899, 
      originalPrice: 2199, 
      image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Official BTS merch hoodie with 'LOVE YOURSELF' logo and album artwork.", 
      stock: 7, 
      isPreOrder: false, 
      isSale: true,
      reviewCount: 36,
      kpopGroup: "BTS",          
      rating: 4.5 
    },
    { 
      id: 8,  
      name: "BLACKPINK 'THE ALBUM' Vinyl",            
      category: "albums",      
      price: 4299, 
      originalPrice: 4599, 
      image: "https://images.unsplash.com/photo-1544785349-c4a5301826fd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80", 
      description: "Limited edition vinyl version of BLACKPINK's first studio album.", 
      stock: 3, 
      isPreOrder: true, 
      isSale: false,
      reviewCount: 9,
      kpopGroup: "BLACKPINK",    
      rating: 5.0 
    }
  ];

  const categories = ['all', 'albums', 'photocards', 'lightsticks', 'apparel', 'accessories'];
  const groups = ['all', 'BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN', 'STRAY KIDS'];

  const filteredProducts = products.filter(product => {
    const categoryMatch = selectedCategory === 'all' || product.category === selectedCategory;
    const groupMatch = selectedGroup === 'all' || product.kpopGroup === selectedGroup;
    return categoryMatch && groupMatch;
  });

  useEffect(() => {
    const category = searchParams.get('category');
    const group = searchParams.get('group');
    if (category) setSelectedCategory(category);
    if (group) setSelectedGroup(group);
  }, [searchParams]);

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">Our Collections</h1>
          <p className="page-description">Explore authentic K-Pop merchandise from your favorite artists</p>
        </div>
      </div>

      <div className="container">
        <section className="collections-page">
          <div className="filters">
            <div className="filter-group">
              <h3>Category</h3>
              <div className="filter-options">
                {categories.map(cat => (
                  <button
                    key={cat}
                    className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <h3>K-Pop Group</h3>
              <div className="filter-options">
                {groups.map(group => (
                  <button
                    key={group}
                    className={`filter-btn ${selectedGroup === group ? 'active' : ''}`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="products-grid">
            {filteredProducts.map(product => (
              <div key={product.id} className="product-card">
                {product.isSale && <span className="badge sale-badge">SALE</span>}
                {product.isPreOrder && <span className="badge preorder-badge">PRE-ORDER</span>}
                <div className="product-image">
                  <img src={product.image} alt={product.name} />
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
                  <button className="btn btn-primary btn-small">
                    <i className="fas fa-shopping-cart"></i> Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="no-results">
              <i className="fas fa-box-open"></i>
              <h3>No products found</h3>
              <p>Try adjusting your filters</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default Collections;
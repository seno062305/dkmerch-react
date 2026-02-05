import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Collections from './pages/Collections';
import PreOrder from './pages/PreOrder';
import NewArrivals from './pages/NewArrivals';
import TrackOrder from './pages/TrackOrder';
import Help from './pages/Help';
import LoginModal from './components/LoginModal';
import CartModal from './components/CartModal';
import ProductModal from './components/ProductModal';
import WishlistPage from './components/WishlistPage';
import './App.css';

function App() {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  const [cartCount, setCartCount] = useState(2);
  const [wishlistCount, setWishlistCount] = useState(3);
  const [cart, setCart] = useState([
    { id: 4, quantity: 1 },
    { id: 6, quantity: 2 }
  ]);

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

  const handleAddToCart = (productId) => {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock === 0) {
      alert('Out of stock!');
      return;
    }

    setCart(prevCart => {
      const existing = prevCart.find(item => item.id === productId);
      if (existing) {
        return prevCart.map(item => 
          item.id === productId ? { ...item, quantity: item.quantity + 1 } : item
        );
      } else {
        return [...prevCart, { id: productId, quantity: 1 }];
      }
    });

    setCartCount(prev => prev + 1);
    
    // Show notification
    const notification = document.createElement('div');
    notification.className = 'notification show';
    notification.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>Added to cart!</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  };

  const handleRemoveFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.id !== productId));
    setCartCount(prev => Math.max(0, prev - 1));
  };

  const handleOpenProductModal = (product) => {
    setCurrentProduct(product);
    setShowProductModal(true);
  };

  return (
    <Router>
      <div className="App">
        <Header 
          cartCount={cartCount}
          wishlistCount={wishlistCount}
          onLoginClick={() => setShowLoginModal(true)}
          onCartClick={() => setShowCartModal(true)}
        />
        
        <Routes>
          <Route path="/" element={
            <Home 
              onProductClick={handleOpenProductModal}
              onAddToCart={handleAddToCart}
            />
          } />
          <Route path="/collections" element={<Collections />} />
          <Route path="/preorder" element={<PreOrder />} />
          <Route path="/new" element={<NewArrivals />} />
          <Route path="/track-order" element={<TrackOrder />} />
          <Route path="/help" element={<Help />} />
          <Route path="/wishlist" element={<WishlistPage />} />
        </Routes>
        
        <Footer />

        {/* Modals */}
        {showLoginModal && (
          <LoginModal onClose={() => setShowLoginModal(false)} />
        )}
        
        {showCartModal && (
          <CartModal 
            cart={cart}
            products={products}
            onClose={() => setShowCartModal(false)}
            onRemoveFromCart={handleRemoveFromCart}
          />
        )}
        
        {showProductModal && currentProduct && (
          <ProductModal 
            product={currentProduct}
            onClose={() => setShowProductModal(false)}
            onAddToCart={handleAddToCart}
          />
        )}
      </div>
    </Router>
  );
}

export default App;
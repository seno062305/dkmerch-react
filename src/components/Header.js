import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ cartCount, wishlistCount, onLoginClick, onCartClick }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      alert(`Searching for: ${searchQuery}`);
      setShowSearch(false);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
    setIsDropdownOpen(false); // Close dropdown when toggling menu
  };

  const toggleDropdown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
  };

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
    setIsDropdownOpen(false);
  };

  return (
    <header>
      <div className="main-header">
        <div className="container">
          <Link to="/" className="logo">
            <img src="/images/dklogo2-removebg-preview.png" alt="DKMerch" />
            <div className="logo-text">
              <span className="logo-brand">DKMerch</span>
              <span className="logo-tagline">K-Pop Paradise</span>
            </div>
          </Link>

          <nav className={`main-nav ${isMobileMenuOpen ? 'active' : ''}`}>
            <ul className={isMobileMenuOpen ? 'active' : ''}>
              <li><Link to="/" onClick={closeMenu}>Home</Link></li>
              <li className={`dropdown ${isDropdownOpen ? 'active' : ''}`}>
                <Link 
                  to="/collections" 
                  onClick={(e) => {
                    // On mobile, toggle dropdown
                    if (window.innerWidth <= 992) {
                      toggleDropdown(e);
                    } else {
                      closeMenu();
                    }
                  }}
                >
                  Collections <i className="fas fa-chevron-down"></i>
                </Link>
                <ul className="dropdown-menu">
                  <li><Link to="/collections?category=photocards" onClick={closeMenu}>Photocards</Link></li>
                  <li><Link to="/collections?category=albums" onClick={closeMenu}>Albums</Link></li>
                  <li><Link to="/collections?category=lightsticks" onClick={closeMenu}>Lightsticks</Link></li>
                  <li><Link to="/collections?category=apparel" onClick={closeMenu}>Apparel</Link></li>
                  <li><Link to="/collections?category=accessories" onClick={closeMenu}>Accessories</Link></li>
                </ul>
              </li>
              <li><Link to="/preorder" onClick={closeMenu}>Pre-Order</Link></li>
              <li><Link to="/new" onClick={closeMenu}>New Arrivals</Link></li>
              <li><Link to="/track-order" onClick={closeMenu}>Track Order</Link></li>
              <li><Link to="/help" onClick={closeMenu}>Help Center</Link></li>
            </ul>
          </nav>

          <div className="header-actions">
            <button 
              className="header-action-item search-toggle"
              onClick={() => setShowSearch(!showSearch)}
            >
              <i className="fas fa-search"></i>
              <span>Search</span>
            </button>
            
            <a href="#" className="header-action-item" onClick={(e) => { e.preventDefault(); onLoginClick(); }}>
              <i className="fas fa-user"></i>
              <span>Account</span>
            </a>
            
            <Link to="/wishlist" className="header-action-item">
              <i className="fas fa-heart"></i>
              <span>Wishlist</span>
              {wishlistCount > 0 && <div className="wishlist-count">{wishlistCount}</div>}
            </Link>
            
            <a href="#" className="header-action-item" onClick={(e) => { e.preventDefault(); onCartClick(); }}>
              <i className="fas fa-shopping-cart"></i>
              <span>Cart</span>
              {cartCount > 0 && <div className="cart-count">{cartCount}</div>}
            </a>
            
            <button 
              className={`mobile-menu-toggle ${isMobileMenuOpen ? 'active' : ''}`}
              onClick={toggleMobileMenu}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar Overlay */}
      {showSearch && (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
          <div className="search-container" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSearch} className="search-bar-expanded">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search for albums, photocards, lightsticks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button type="button" onClick={() => setShowSearch(false)} className="search-close">
                <i className="fas fa-times"></i>
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
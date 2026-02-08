import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProducts } from '../utils/productStorage';
import './Header.css';

const Header = ({ cartCount, wishlistCount, onCartClick }) => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const dropdownRef = useRef(null);

  // Smooth scroll to top on route change (except when going to home with hash)
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, [location.pathname]);

  // Handle hash navigation (scroll to section)
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }, 100);
      }
    }
  }, [location]);

  // Live search as user types
  useEffect(() => {
    if (searchQuery.trim()) {
      const products = getProducts();
      const query = searchQuery.toLowerCase();
      
      const results = products.filter(product =>
        product.name.toLowerCase().includes(query) ||
        product.kpopGroup.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query)
      ).slice(0, 5); // Limit to 5 results
      
      setSearchResults(results);
      setSelectedIndex(-1);
    } else {
      setSearchResults([]);
      setSelectedIndex(-1);
    }
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowAccountDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lock body scroll when mobile menu or search is open
  useEffect(() => {
    if (showMobileMenu || showSearch) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [showMobileMenu, showSearch]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      // ✅ CLEAR CART AND WISHLIST ON LOGOUT
      localStorage.removeItem('dkmerch_cart');
      localStorage.removeItem('dkmerch_wishlist');
      
      logout();
      setShowAccountDropdown(false);
      
      // ✅ TRIGGER STORAGE EVENT TO UPDATE UI
      window.dispatchEvent(new Event('storage'));
      
      navigate('/');
    }
  };

  const handleLoginClick = () => {
    window.dispatchEvent(new Event('openLoginModal'));
  };

  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };

  const handleHomeClick = (e) => {
    e.preventDefault();
    closeMobileMenu();

    // Always navigate to home page and scroll to top
    if (location.pathname === '/') {
      // Already on home, just scroll to top
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      // Navigate to home
      navigate('/');
    }
  };

  const handleCollectionsClick = (e) => {
    e.preventDefault();
    closeMobileMenu();

    // If already on home page, just scroll to section
    if (location.pathname === '/') {
      const element = document.getElementById('collections');
      if (element) {
        element.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    } else {
      // Navigate to home with hash, then scroll
      navigate('/#collections');
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim() && searchResults.length > 0) {
      // Navigate to collections with first result highlighted
      const product = selectedIndex >= 0 ? searchResults[selectedIndex] : searchResults[0];
      navigate(`/collections?product=${product.id}`);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const handleSearchResultClick = (product) => {
    navigate(`/collections?product=${product.id}`);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleKeyDown = (e) => {
    if (searchResults.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < searchResults.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0) {
        handleSearchResultClick(searchResults[selectedIndex]);
      } else if (searchResults.length > 0) {
        handleSearchResultClick(searchResults[0]);
      }
    }
  };

  const highlightMatch = (text, query) => {
    if (!query) return text;
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <span key={index} className="highlight">{part}</span>
      ) : part
    );
  };

  return (
    <header>
      <div className="main-header">
        <div className="container">
          {/* Logo */}
          <Link to="/" className="logo">
            <img src="/images/dklogo.jpg" alt="DKMerch Logo" />
            <div className="logo-text">
              <div className="logo-brand">DKMerch</div>
              <div className="logo-tagline">K-Pop Paradise</div>
            </div>
          </Link>

          {/* Main Navigation */}
          <nav className={`main-nav ${showMobileMenu ? 'active' : ''}`}>
            <ul>
              <li>
                <a href="/" onClick={handleHomeClick}>
                  Home
                </a>
              </li>
              <li>
                <a href="#collections" onClick={handleCollectionsClick}>
                  Collections
                </a>
              </li>
              <li><Link to="/preorder" onClick={closeMobileMenu}>Pre-Order</Link></li>
              <li><Link to="/track-order" onClick={closeMobileMenu}>Track Order</Link></li>
              <li><Link to="/help" onClick={closeMobileMenu}>Help Center</Link></li>
            </ul>
          </nav>

          {/* Header Actions */}
          <div className="header-actions">
            {/* Search */}
            <button 
              className="header-action-item"
              onClick={() => setShowSearch(true)}
            >
              <i className="fas fa-search"></i>
              <span>Search</span>
            </button>

            {/* Wishlist - ✅ ONLY SHOW COUNT WHEN LOGGED IN */}
            <Link to="/wishlist" className="header-action-item">
              <i className="fas fa-heart"></i>
              <span>Wishlist</span>
              {isAuthenticated && wishlistCount > 0 && (
                <span className="wishlist-count">{wishlistCount}</span>
              )}
            </Link>

            {/* Cart - ✅ ONLY SHOW COUNT WHEN LOGGED IN */}
            <button className="header-action-item" onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onCartClick();
            }}>
              <i className="fas fa-shopping-cart"></i>
              <span>Cart</span>
              {isAuthenticated && cartCount > 0 && (
                <span className="cart-count">{cartCount}</span>
              )}
            </button>

            {/* Account */}
            {isAuthenticated ? (
              <div className="account-dropdown-wrapper" ref={dropdownRef}>
                <button 
                  className="account-btn"
                  onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                >
                  <i className="fas fa-user-circle"></i>
                  <span>{user?.name || 'Account'}</span>
                  <i className={`fas fa-chevron-down dropdown-arrow ${showAccountDropdown ? 'rotate' : ''}`}></i>
                </button>

                {showAccountDropdown && (
                  <div className="account-dropdown-menu">
                    <div className="dropdown-header">
                      <i className="fas fa-user-circle user-avatar"></i>
                      <div className="user-info">
                        <div className="user-name">{user?.name}</div>
                        <div className="user-email">{user?.email}</div>
                      </div>
                    </div>

                    <Link to="/wishlist" className="dropdown-item" onClick={() => setShowAccountDropdown(false)}>
                      <i className="fas fa-heart"></i>
                      My Wishlist
                    </Link>

                    <Link to="/settings" className="dropdown-item" onClick={() => setShowAccountDropdown(false)}>
                      <i className="fas fa-cog"></i>
                      Settings
                    </Link>

                    <div className="dropdown-divider"></div>

                    <button className="dropdown-item logout-btn" onClick={handleLogout}>
                      <i className="fas fa-sign-out-alt"></i>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="header-action-item" onClick={handleLoginClick}>
                <i className="fas fa-user"></i>
                <span>Login</span>
              </button>
            )}

            {/* Mobile Menu Toggle */}
            <button 
              className={`mobile-menu-toggle ${showMobileMenu ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(!showMobileMenu)}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="mobile-overlay" onClick={closeMobileMenu}></div>
      )}

      {/* Search Overlay */}
      {showSearch && (
        <div className="search-overlay" onClick={() => setShowSearch(false)}>
          <div className="search-container" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSearchSubmit} className="search-bar-expanded">
              <i className="fas fa-search"></i>
              <input
                type="text"
                placeholder="Search for K-Pop merchandise..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {searchQuery && (
                <button 
                  type="button"
                  className="search-clear-input"
                  onClick={() => {
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
              <button 
                type="button"
                className="search-close"
                onClick={() => setShowSearch(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </form>

            {/* Search Suggestions */}
            {searchResults.length > 0 && (
              <div className="search-suggestions">
                <div className="suggestions-header">
                  <i className="fas fa-search"></i>
                  Search Results
                </div>
                <div className="suggestions-list">
                  {searchResults.map((product, index) => (
                    <div
                      key={product.id}
                      className={`suggestion-item ${index === selectedIndex ? 'active' : ''}`}
                      onClick={() => handleSearchResultClick(product)}
                    >
                      <div className="suggestion-image">
                        <img src={product.image} alt={product.name} />
                      </div>
                      <div className="suggestion-content">
                        <div className="suggestion-title">
                          {highlightMatch(product.name, searchQuery)}
                        </div>
                        <div className="suggestion-meta">
                          <span>{product.kpopGroup}</span>
                          <span className="suggestion-divider">•</span>
                          <span>₱{product.price.toLocaleString()}</span>
                        </div>
                      </div>
                      <i className="fas fa-arrow-right suggestion-arrow"></i>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Results */}
            {searchQuery && searchResults.length === 0 && (
              <div className="search-suggestions">
                <div className="no-results">
                  <i className="fas fa-search"></i>
                  <p>No products found</p>
                  <span>Try searching for different keywords</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
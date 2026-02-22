import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import RiderRegistrationModal from './RiderRegistrationModal';
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
  const [showRiderModal, setShowRiderModal] = useState(false);
  const dropdownRef = useRef(null);
  const lastScrollTarget = useRef(null);

  const allProductsRaw = useQuery(api.products.getAllProducts);
  const allProducts = React.useMemo(() => allProductsRaw || [], [allProductsRaw]);

  // Scroll to top on page change (not hash changes)
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  // Scroll to hash element
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
      }
    }
  }, [location.hash]);

  // Search filter
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const results = allProducts.filter(product =>
        product.name?.toLowerCase().includes(query) ||
        product.kpopGroup?.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query)
      ).slice(0, 5);
      setSearchResults(results);
      setSelectedIndex(-1);
    } else {
      setSearchResults([]);
      setSelectedIndex(-1);
    }
  }, [searchQuery, allProducts]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowAccountDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Body overflow lock
  useEffect(() => {
    document.body.style.overflow = (showMobileMenu || showSearch || showRiderModal) ? 'hidden' : '';
  }, [showMobileMenu, showSearch, showRiderModal]);

  // FIXED: scroll-to-section — read state once via ref, never put location.state in deps
  useEffect(() => {
    const scrollTarget = location.state?.scrollTo;
    if (
      location.pathname === '/' &&
      scrollTarget &&
      scrollTarget !== lastScrollTarget.current
    ) {
      lastScrollTarget.current = scrollTarget;
      // Clear the state immediately so it doesn't re-trigger on re-renders
      window.history.replaceState({}, '', '/');
      const tryScroll = (attempts = 0) => {
        const element = document.getElementById(scrollTarget);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (attempts < 10) {
          setTimeout(() => tryScroll(attempts + 1), 100);
        }
      };
      tryScroll();
    }
    if (location.pathname !== '/') {
      lastScrollTarget.current = null;
    }
  // IMPORTANT: only depend on pathname — never put location.state here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout();
      setShowAccountDropdown(false);
      navigate('/');
    }
  };

  const handleLoginClick = () => window.dispatchEvent(new Event('openLoginModal'));

  const closeMobileMenu = () => setShowMobileMenu(false);

  const handleHomeClick = (e) => {
    e.preventDefault();
    closeMobileMenu();
    if (location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      navigate('/');
    }
  };

  const handleCollectionsClick = (e) => {
    e.preventDefault();
    closeMobileMenu();
    if (location.pathname === '/') {
      const element = document.getElementById('collections');
      if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate('/', { state: { scrollTo: 'collections' } });
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim() && searchResults.length > 0) {
      const product = selectedIndex >= 0 ? searchResults[selectedIndex] : searchResults[0];
      navigate(`/collections?product=${product._id}`);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const handleSearchResultClick = (product) => {
    navigate(`/collections?product=${product._id}`);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = selectedIndex >= 0 ? searchResults[selectedIndex] : searchResults[0];
      if (target) handleSearchResultClick(target);
    }
  };

  const highlightMatch = (text, query) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <span key={i} className="highlight">{part}</span>
        : part
    );
  };

  return (
    <header>
      <div className="main-header">
        <div className="container">
          <Link to="/" className="logo">
            <img src="/images/dklogo.jpg" alt="DKMerch Logo" />
            <div className="logo-text">
              <div className="logo-brand">DKMerch</div>
              <div className="logo-tagline">K-Pop Paradise</div>
            </div>
          </Link>

          <nav className={`main-nav ${showMobileMenu ? 'active' : ''}`}>
            <ul>
              <li><a href="/" onClick={handleHomeClick}>Home</a></li>
              <li><Link to="/collections" onClick={closeMobileMenu}>Collections</Link></li>
              <li><Link to="/preorder" onClick={closeMobileMenu}>Pre-Order</Link></li>
              <li><Link to="/track-order" onClick={closeMobileMenu}>Track Order</Link></li>
              <li><Link to="/help" onClick={closeMobileMenu}>Help Center</Link></li>
            </ul>
          </nav>

          <div className="header-actions">
            <button className="header-action-item" onClick={() => setShowSearch(true)}>
              <i className="fas fa-search"></i><span>Search</span>
            </button>

            <Link to="/wishlist" className="header-action-item favorites-btn">
              <i className="fas fa-star"></i><span>Favorites</span>
              {isAuthenticated && wishlistCount > 0 && <span className="wishlist-count">{wishlistCount}</span>}
            </Link>

            <button className="header-action-item" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCartClick(); }}>
              <i className="fas fa-shopping-cart"></i><span>Cart</span>
              {isAuthenticated && cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </button>

            {isAuthenticated ? (
              <div className="account-dropdown-wrapper" ref={dropdownRef}>
                <button className="account-btn" onClick={() => setShowAccountDropdown(!showAccountDropdown)}>
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
                      <i className="fas fa-star"></i> My Favorites
                    </Link>
                    <Link to="/my-orders" className="dropdown-item" onClick={() => setShowAccountDropdown(false)}>
                      <i className="fas fa-box"></i> My Orders
                    </Link>
                    <Link to="/settings" className="dropdown-item" onClick={() => setShowAccountDropdown(false)}>
                      <i className="fas fa-cog"></i> Settings
                    </Link>
                    <div className="dropdown-divider"></div>
                    <button className="dropdown-item logout-btn" onClick={handleLogout}>
                      <i className="fas fa-sign-out-alt"></i> Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button className="header-action-item" onClick={handleLoginClick}>
                <i className="fas fa-user"></i><span>Login</span>
              </button>
            )}

            {!isAuthenticated && (
              <button className="header-action-item rider-register-btn" onClick={() => setShowRiderModal(true)} title="Apply as Rider">
                <i className="fas fa-motorcycle"></i><span>Riders</span>
              </button>
            )}

            <button className={`mobile-menu-toggle ${showMobileMenu ? 'active' : ''}`} onClick={() => setShowMobileMenu(!showMobileMenu)}>
              <span></span><span></span><span></span>
            </button>
          </div>
        </div>
      </div>

      {showMobileMenu && <div className="mobile-overlay" onClick={closeMobileMenu}></div>}

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
                <button type="button" className="search-clear-input" onClick={() => { setSearchQuery(''); setSearchResults([]); }}>
                  <i className="fas fa-times"></i>
                </button>
              )}
              <button type="button" className="search-close" onClick={() => setShowSearch(false)}>
                <i className="fas fa-times"></i>
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="search-suggestions">
                <div className="suggestions-header"><i className="fas fa-search"></i> Search Results</div>
                <div className="suggestions-list">
                  {searchResults.map((product, index) => (
                    <div
                      key={product._id}
                      className={`suggestion-item ${index === selectedIndex ? 'active' : ''}`}
                      onClick={() => handleSearchResultClick(product)}
                    >
                      <div className="suggestion-image"><img src={product.image} alt={product.name} /></div>
                      <div className="suggestion-content">
                        <div className="suggestion-title">{highlightMatch(product.name, searchQuery)}</div>
                        <div className="suggestion-meta">
                          <span>{product.kpopGroup}</span>
                          <span className="suggestion-divider">•</span>
                          <span>₱{product.price?.toLocaleString()}</span>
                        </div>
                      </div>
                      <i className="fas fa-arrow-right suggestion-arrow"></i>
                    </div>
                  ))}
                </div>
              </div>
            )}

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

      {showRiderModal && <RiderRegistrationModal onClose={() => setShowRiderModal(false)} />}
    </header>
  );
};

export default Header;
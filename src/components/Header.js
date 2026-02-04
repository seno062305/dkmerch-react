import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Header.css';

const Header = ({ cartCount, wishlistCount, onLoginClick, onCartClick }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      alert(`Searching for: ${searchQuery}`);
      // Implement actual search logic
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const kpopGroups = ['BTS', 'BLACKPINK', 'TWICE', 'SEVENTEEN', 'STRAY KIDS'];

  return (
    <header>
      <div className="header-top">
        <div className="container">
          <div className="header-top-info">
            <span><i className="fas fa-phone"></i> +63 912 345 6789</span>
            <span><i className="fas fa-envelope"></i> support@dkmerch.com</span>
          </div>
          <div className="header-top-links">
            <a href="#">Track Order</a>
            <a href="#">Help Center</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onLoginClick(); }}>Login</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onLoginClick(); }}>Register</a>
          </div>
        </div>
      </div>

      <div className="main-header">
        <div className="container">
          <Link to="/" className="logo">
            <img src="/images/dklogo2-removebg-preview.png" alt="DKMerch Logo" />
          </Link>

          <form className="search-bar" onSubmit={handleSearch}>
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search for albums, photocards, lightsticks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>

          <div className="header-actions">
            <a href="#" className="header-action-item">
              <i className="fas fa-user"></i>
              <span>Account</span>
            </a>
            <Link to="/wishlist" className="header-action-item">
              <i className="fas fa-heart"></i>
              <span>Wishlist</span>
              <div className="wishlist-count">{wishlistCount}</div>
            </Link>
            <a href="#" className="header-action-item" onClick={(e) => { e.preventDefault(); onCartClick(); }}>
              <i className="fas fa-shopping-cart"></i>
              <span>Cart</span>
              <div className="cart-count">{cartCount}</div>
            </a>
            <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>
      </div>

      <nav>
        <div className="container nav-container">
          <ul className={`main-nav ${isMobileMenuOpen ? 'active' : ''}`}>
            <li><Link to="/" onClick={() => setIsMobileMenuOpen(false)}>Home</Link></li>
            <li className="dropdown">
              <Link to="/collections">Collections <i className="fas fa-chevron-down"></i></Link>
              <ul className="dropdown-menu">
                <li><Link to="/collections?category=photocards">Photocards</Link></li>
                <li><Link to="/collections?category=albums">Albums</Link></li>
                <li><Link to="/collections?category=lightsticks">Lightsticks</Link></li>
                <li><Link to="/collections?category=apparel">Apparel</Link></li>
                <li><Link to="/collections?category=accessories">Accessories</Link></li>
              </ul>
            </li>
            <li><Link to="/preorder">Pre-Order</Link></li>
            <li><Link to="/new">New Arrivals</Link></li>
          </ul>
          <div className="kpop-groups">
            {kpopGroups.map(group => (
              <Link key={group} to={`/collections?group=${group}`} className="kpop-group">
                {group}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
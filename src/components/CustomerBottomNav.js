import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './CustomerBottomNav.css';

const CustomerBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const isActive = (to) => {
    if (to === '/') return path === '/';
    return path === to || path.startsWith(`${to}/`);
  };

  const goHome = (e) => {
    e.preventDefault();
    if (path === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate('/');
  };

  return (
    <nav className="customer-bottom-nav" aria-label="Customer navigation">
      <a href="/" className={`cbn-item ${isActive('/') ? 'active' : ''}`} onClick={goHome}>
        <i className="fas fa-home"></i>
        <span>Home</span>
      </a>
      <Link to="/collections" className={`cbn-item ${isActive('/collections') ? 'active' : ''}`}>
        <i className="fas fa-th-large"></i>
        <span>Shop</span>
      </Link>
      <Link to="/preorder" className={`cbn-item ${isActive('/preorder') ? 'active' : ''}`}>
        <i className="fas fa-clock"></i>
        <span>Pre-Order</span>
      </Link>
      <Link to="/track-order" className={`cbn-item ${isActive('/track-order') ? 'active' : ''}`}>
        <i className="fas fa-map-marker-alt"></i>
        <span>Track</span>
      </Link>
      <Link to="/more" className={`cbn-item ${isActive('/more') ? 'active' : ''}`}>
        <i className="fas fa-cog"></i>
        <span>Settings</span>
      </Link>
    </nav>
  );
};

export default CustomerBottomNav;

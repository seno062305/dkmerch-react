import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { goToCustomerTab } from '../utils/navScroll';
import './CustomerBottomNav.css';

const CustomerBottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const { user, isAuthenticated } = useAuth();
  const unread = useQuery(
    api.supportChat.getCustomerUnreadCount,
    isAuthenticated && user?.email ? { customerEmail: user.email } : 'skip'
  ) || 0;

  const isActive = (to) => {
    if (to === '/') return path === '/';
    return path === to || path.startsWith(`${to}/`);
  };

  const goTo = (e, to) => {
    e.preventDefault();
    e.stopPropagation();
    goToCustomerTab(navigate, path, to);
  };

  const goToChat = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      try {
        sessionStorage.setItem('redirectAfterLogin', '/chat');
        sessionStorage.setItem('dk_login_customers_only', '1');
      } catch { /* ignore */ }
      window.dispatchEvent(new CustomEvent('openLoginModal', { detail: { customersOnly: true } }));
      return;
    }
    goToCustomerTab(navigate, path, '/chat');
  };

  return (
    <nav className="customer-bottom-nav customer-bottom-nav--6" aria-label="Customer navigation">
      <a href="/" className={`cbn-item ${isActive('/') ? 'active' : ''}`} onClick={(e) => goTo(e, '/')}>
        <i className="fas fa-home"></i>
        <span>Home</span>
      </a>
      <a href="/collections" className={`cbn-item ${isActive('/collections') ? 'active' : ''}`} onClick={(e) => goTo(e, '/collections')}>
        <i className="fas fa-th-large"></i>
        <span>Shop</span>
      </a>
      <a href="/preorder" className={`cbn-item ${isActive('/preorder') ? 'active' : ''}`} onClick={(e) => goTo(e, '/preorder')}>
        <i className="fas fa-clock"></i>
        <span>Preorder</span>
      </a>
      <a href="/track-order" className={`cbn-item ${isActive('/track-order') ? 'active' : ''}`} onClick={(e) => goTo(e, '/track-order')}>
        <i className="fas fa-map-marker-alt"></i>
        <span>Track</span>
      </a>
      <a href="/chat" className={`cbn-item ${isActive('/chat') ? 'active' : ''}`} onClick={goToChat}>
        <span className="cbn-icon-wrap">
          <i className="fas fa-comments"></i>
          {unread > 0 && <em className="cbn-badge">{unread > 9 ? '9+' : unread}</em>}
        </span>
        <span>Chat</span>
      </a>
      <a href="/help" className={`cbn-item ${isActive('/help') ? 'active' : ''}`} onClick={(e) => goTo(e, '/help')}>
        <i className="fas fa-question-circle"></i>
        <span>Help</span>
      </a>
    </nav>
  );
};

export default CustomerBottomNav;

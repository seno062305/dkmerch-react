import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
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

  const scrollTop = () => {
    try { window.scrollTo({ top: 0, left: 0, behavior: 'smooth' }); }
    catch { window.scrollTo(0, 0); }
    setTimeout(() => window.scrollTo(0, 0), 160);
  };

  const goTo = (e, to) => {
    e.preventDefault();
    if (path === to || (to !== '/' && path.startsWith(`${to}/`))) {
      scrollTop();
      return;
    }
    navigate(to, { state: { scrollToTop: true } });
    scrollTop();
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
      <a href="/chat" className={`cbn-item ${isActive('/chat') ? 'active' : ''}`} onClick={(e) => goTo(e, '/chat')}>
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

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CustomerNotificationPanel } from '../components/CustomerNotificationBell';
import { unlockBodyScroll } from '../utils/navScroll';
import { forceUnlockBodyScroll } from '../utils/scrollLock';
import './Notifications.css';

/**
 * Mobile notifications tab — full-page checklist center.
 */
const Notifications = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Kill leftover modal scroll locks (touchmove preventDefault breaks mobile scroll)
    forceUnlockBodyScroll();
    unlockBodyScroll();
    try {
      document.documentElement.classList.remove('dk-scroll-locked');
      document.body.classList.remove(
        'dk-scroll-locked',
        'product-modal-open',
        'cart-modal-open',
        'login-modal-open'
      );
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('touch-action');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('touch-action');
      document.body.style.removeProperty('overscroll-behavior');
    } catch { /* ignore */ }

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        forceUnlockBodyScroll();
        unlockBodyScroll();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => {
    if (isAuthenticated) return;
    try {
      sessionStorage.setItem('redirectAfterLogin', '/notifications');
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('openLoginModal', { detail: { customersOnly: true } }));
  }, [isAuthenticated]);

  return (
    <div className="notif-page">
      <div className="notif-page-inner">
        <div className="notif-page-top">
          <h1>Notifications</h1>
          <button type="button" className="notif-page-back" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left" /> Back
          </button>
        </div>
        <CustomerNotificationPanel
          email={user?.email}
          variant="page"
        />
      </div>
    </div>
  );
};

export default Notifications;

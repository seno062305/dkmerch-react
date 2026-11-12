import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { CustomerNotificationPanel } from '../components/CustomerNotificationBell';
import { scrollPageToTop } from '../utils/navScroll';
import './Notifications.css';

/**
 * Mobile notifications tab — full-page checklist center.
 */
const Notifications = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    scrollPageToTop({ smooth: false });
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

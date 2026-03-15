import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminSidebar from './AdminSidebar';
import './AdminLayout.css';

const AdminLayout = () => {
  const { user, role, isAuthenticated, isReady } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated || role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [isReady, isAuthenticated, role, navigate]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [window.location.pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [mobileMenuOpen]);

  // Watch for ar-map-open class on body — hide burger when map is fullscreen
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMapOpen(document.body.classList.contains('ar-map-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (!isReady) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f5f5f5' }}>
        <div style={{ width: 48, height: 48, border: '4px solid #f3f4f6', borderTop: '4px solid #fc1268', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!isAuthenticated || role !== 'admin') return null;

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);
  const closeMobileMenu  = () => setMobileMenuOpen(false);

  return (
    <div className="admin-layout">

      {/* Burger — hidden when sidebar open OR map is open */}
      {!mobileMenuOpen && !mapOpen && (
        <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Open menu">
          <i className="fas fa-bars"></i>
        </button>
      )}

      <div className={`mobile-overlay ${mobileMenuOpen ? 'active' : ''}`} onClick={closeMobileMenu}></div>

      <div className={`admin-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <AdminSidebar onLinkClick={closeMobileMenu} onClose={closeMobileMenu} />
      </div>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
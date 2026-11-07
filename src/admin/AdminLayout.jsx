import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminSidebar from './AdminSidebar';
import './AdminLayout.css';

const SIDEBAR_KEY = 'dkmerch_admin_sidebar_collapsed';

const AdminLayout = () => {
  const { user, role, isAuthenticated, isReady } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated || role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [isReady, isAuthenticated, role, navigate]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [window.location.pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setMapOpen(document.body.classList.contains('ar-map-open'));
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch { /* ignore */ }
    document.body.classList.toggle('admin-sidebar-collapsed', sidebarCollapsed);
    return () => document.body.classList.remove('admin-sidebar-collapsed');
  }, [sidebarCollapsed]);

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
  const toggleSidebar    = () => setSidebarCollapsed(prev => !prev);

  return (
    <div className={`admin-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>

      {!mobileMenuOpen && !mapOpen && (
        <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Open menu">
          <i className="fas fa-bars"></i>
        </button>
      )}

      {sidebarCollapsed && !mapOpen && (
        <button
          type="button"
          className="sidebar-expand-toggle"
          onClick={toggleSidebar}
          aria-label="Show sidebar"
          title="Show sidebar"
        >
          <i className="fas fa-bars"></i>
        </button>
      )}

      <div className={`mobile-overlay ${mobileMenuOpen ? 'active' : ''}`} onClick={closeMobileMenu}></div>

      <div className={`admin-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <AdminSidebar
          onLinkClick={closeMobileMenu}
          onClose={closeMobileMenu}
          onToggleCollapse={toggleSidebar}
        />
      </div>

      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;
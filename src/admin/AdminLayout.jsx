import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAuthGateLocked } from '../lib/authGate';
import AdminSidebar from './AdminSidebar';
import AdminBottomNav from './AdminBottomNav';
import './AdminLayout.css';
import './adminMobileTables.css';

const SIDEBAR_KEY = 'dkmerch_admin_sidebar_collapsed';

const AdminLayout = () => {
  const { user, role, isAuthenticated, isReady } = useAuth();
  const navigate = useNavigate();
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
    // Soft-logout on Use another account / Reset PIN — stay put under pink gate
    if (isAuthGateLocked()) return;
    if (!isAuthenticated || role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [isReady, isAuthenticated, role, navigate]);

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

  /* Mobile list cards: inject Details/Hide toggle on admin table rows */
  useEffect(() => {
    const ROW_SEL = [
      '.orders-table tbody tr',
      '.users-table tbody tr',
      '.riders-table tbody tr',
      '.inventory-table tbody tr',
      '.products-table tbody tr',
      '.stock-table tbody tr',
    ].join(', ');

    const syncToggleLabel = (tr, btn) => {
      const open = tr.classList.contains('is-expanded');
      btn.innerHTML = open
        ? '<i class="fas fa-chevron-up"></i> Hide details'
        : '<i class="fas fa-chevron-down"></i> Show details';
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    const ensureToggles = () => {
      if (window.matchMedia && !window.matchMedia('(max-width: 768px)').matches) return;
      document.querySelectorAll(ROW_SEL).forEach((tr) => {
        if (tr.querySelector('.mobile-card-toggle')) return;
        // Skip empty / placeholder rows
        if (!tr.querySelector('td[data-label]')) return;

        const cell = document.createElement('td');
        cell.className = 'mobile-card-toggle-cell';
        cell.setAttribute('data-label', '');

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-card-toggle';
        syncToggleLabel(tr, btn);
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          tr.classList.toggle('is-expanded');
          syncToggleLabel(tr, btn);
        });

        cell.appendChild(btn);
        tr.appendChild(cell);
      });
    };

    ensureToggles();
    const mo = new MutationObserver(() => ensureToggles());
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', ensureToggles);
    return () => {
      mo.disconnect();
      window.removeEventListener('resize', ensureToggles);
    };
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

  const closeMobileMenu  = () => {};
  const toggleSidebar    = () => setSidebarCollapsed(prev => !prev);

  return (
    <div className={`admin-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''} admin-layout--bnav`}>

      {/* Desktop only — mobile uses bottom tabs like customer app */}
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

      <div className="admin-sidebar admin-sidebar--desktop">
        <AdminSidebar
          onLinkClick={closeMobileMenu}
          onClose={closeMobileMenu}
          onToggleCollapse={toggleSidebar}
        />
      </div>

      <main className="admin-content">
        <Outlet />
      </main>

      {!mapOpen && <AdminBottomNav />}
    </div>
  );
};

export default AdminLayout;
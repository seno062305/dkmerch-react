// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useCart, useRemoveFromCart, useCartCount } from './context/cartUtils';
import { useWishlist, useWishlistCount } from './context/wishlistUtils';

import Header from './components/Header';
import Footer from './components/Footer';

import Home from './pages/Home';
import Collections from './pages/Collections';
import PreOrder from './pages/PreOrder';
import TrackOrder from './pages/TrackOrder';
import Help from './pages/Help';
import Settings from './pages/Settings';
import PromoRedirect from './pages/PromoRedirect';
import MyPreOrders from './pages/MyPreOrders';

import LoginModal from './components/LoginModal';
import CartModal from './components/CartModal';
import ProductModal from './components/ProductModal';
import WishlistPage from './components/WishlistPage';

import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminProducts from './admin/AdminProducts';
import AdminInventory from './admin/AdminInventory';
import AdminOrders from './admin/AdminOrders';
import AdminPromos from './admin/AdminPromos';
import AdminSalesReports from './admin/AdminSalesReports';
import AdminUsers from './admin/AdminUsers';
import AdminRiders from './admin/AdminRiders';
import RiderDashboard from './pages/RiderDashboard';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';

import './App.css';

// ─── STARTUP REDIRECT ─────────────────────────────────────────────────────────
// Runs once on app open. If user already has a session (localStorage),
// redirect to their dashboard — but ONLY if they're on the root/home page.
// This prevents force-redirecting if they deep-linked to a specific page.
const StartupRedirect = () => {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated || !role) return;

    const path = location.pathname;
    const isRoot = path === '/' || path === '';

    // Only redirect if they opened the app at root "/"
    if (!isRoot) return;

    if (role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (role === 'rider') {
      navigate('/rider', { replace: true });
    }
    // Customers stay on home — no redirect needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = only runs once on mount (app open)

  return null;
};

// ─── RIDER ROUTE ──────────────────────────────────────────────────────────────
const RiderRoute = ({ children }) => {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', location.pathname + location.search);
      setShowLoginModal(true);
    }
  }, [isAuthenticated, location]);

  if (!isAuthenticated) {
    return (
      <>
        {showLoginModal && (
          <LoginModal
            defaultRiderMode={true}
            onClose={() => {
              setShowLoginModal(false);
              navigate('/');
            }}
            onLoginSuccess={() => {
              setShowLoginModal(false);
              const redirect = sessionStorage.getItem('redirectAfterLogin') || '/rider';
              sessionStorage.removeItem('redirectAfterLogin');
              navigate(redirect);
            }}
          />
        )}
      </>
    );
  }

  if (role !== 'rider') return <Navigate to="/" replace />;
  return children;
};

// ─── PROTECTED ROUTE ──────────────────────────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', location.pathname + location.search);
      setShowLoginModal(true);
    }
  }, [isAuthenticated, location]);

  if (!isAuthenticated) {
    return (
      <>
        {showLoginModal && (
          <LoginModal
            onClose={() => {
              setShowLoginModal(false);
              navigate('/');
            }}
            onLoginSuccess={() => {
              setShowLoginModal(false);
              const redirect = sessionStorage.getItem('redirectAfterLogin') || '/';
              sessionStorage.removeItem('redirectAfterLogin');
              navigate(redirect);
            }}
          />
        )}
      </>
    );
  }

  return children;
};

// ─── APP CONTENT ──────────────────────────────────────────────────────────────
function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, isAuthenticated } = useAuth();

  const cartItems      = useCart();
  const cartCount      = useCartCount();
  const removeFromCart = useRemoveFromCart();
  const wishlistCount  = useWishlistCount();

  const [showLoginModal, setShowLoginModal]               = useState(false);
  const [loginDefaultRiderMode, setLoginDefaultRiderMode] = useState(false);
  const [showCartModal, setShowCartModal]                 = useState(false);
  const [showProductModal, setShowProductModal]           = useState(false);
  const [currentProduct, setCurrentProduct]               = useState(null);

  useEffect(() => {
    const handleOpenLogin = (e) => {
      setLoginDefaultRiderMode(!!e?.detail?.riderMode);
      setShowLoginModal(true);
    };
    window.addEventListener('openLoginModal', handleOpenLogin);
    return () => window.removeEventListener('openLoginModal', handleOpenLogin);
  }, []);

  // After login via header modal — redirect based on role or saved URL
  const handleLoginSuccess = (loginRole) => {
    setShowLoginModal(false);
    setLoginDefaultRiderMode(false);

    const redirect = sessionStorage.getItem('redirectAfterLogin');
    if (redirect) {
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(redirect);
      return;
    }

    // No saved redirect — go to role dashboard
    if (loginRole === 'admin') {
      navigate('/admin', { replace: true });
    } else if (loginRole === 'rider') {
      navigate('/rider', { replace: true });
    }
    // Customers stay on current page
  };

  const isAdminRoute     = location.pathname.startsWith('/admin');
  const isRiderRoute     = location.pathname.startsWith('/rider');
  const isPromoRoute     = location.pathname.startsWith('/promo');
  const hideHeaderFooter = isAdminRoute || isRiderRoute || isPromoRoute;

  return (
    <div className="App">
      {/* Role-based redirect on app open if already logged in */}
      <StartupRedirect />

      {!hideHeaderFooter && (
        <Header
          cartCount={cartCount}
          wishlistCount={wishlistCount}
          onCartClick={() => setShowCartModal(true)}
        />
      )}

      <Routes>
        <Route path="/" element={<Home onProductClick={(p) => { setCurrentProduct(p); setShowProductModal(true); }} />} />
        <Route path="/collections" element={<Collections onProductClick={(p) => { setCurrentProduct(p); setShowProductModal(true); }} />} />
        <Route path="/preorder" element={<PreOrder />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/help" element={<Help />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/my-orders" element={<Navigate to="/track-order" replace />} />
        <Route path="/order-success" element={<OrderSuccess />} />
        <Route path="/promo/:code" element={<PromoRedirect />} />

        <Route path="/my-preorders" element={
          <ProtectedRoute>
            <MyPreOrders />
          </ProtectedRoute>
        } />

        <Route path="/rider" element={
          <RiderRoute>
            <RiderDashboard />
          </RiderRoute>
        } />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="promos" element={<AdminPromos />} />
          <Route path="sales-reports" element={<AdminSalesReports />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="riders" element={<AdminRiders />} />
        </Route>
      </Routes>

      {!hideHeaderFooter && <Footer />}

      {showLoginModal && (
        <LoginModal
          onClose={() => {
            setShowLoginModal(false);
            setLoginDefaultRiderMode(false);
          }}
          onLoginSuccess={handleLoginSuccess}
          defaultRiderMode={loginDefaultRiderMode}
        />
      )}

      {showCartModal && (
        <CartModal
          cart={cartItems}
          onClose={() => setShowCartModal(false)}
          onRemoveFromCart={removeFromCart}
        />
      )}

      {showProductModal && currentProduct && (
        <ProductModal
          product={currentProduct}
          onClose={() => setShowProductModal(false)}
          onRequireLogin={() => {
            setShowProductModal(false);
            setShowLoginModal(true);
          }}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App;
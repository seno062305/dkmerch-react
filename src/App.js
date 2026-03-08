// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useCart, useRemoveFromCart, useCartCount } from './context/cartUtils';
import { useWishlist, useWishlistCount } from './context/wishlistUtils';
import { BackupProvider } from './context/BackupContext';

import Header from './components/Header';
import Footer from './components/Footer';
import DKMerchChatBot from './components/DKMerchChatBot';

import Home from './pages/Home';
import Collections from './pages/Collections';
import PreOrder from './pages/PreOrder';
import TrackOrder from './pages/TrackOrder';
import Help from './pages/Help';
import Settings from './pages/Settings';
import PromoRedirect from './pages/PromoRedirect';
import MyPreOrders from './pages/MyPreOrders';
import RiderTrack from './pages/RiderTrack';
import VerifyEmail from './pages/VerifyEmail';
import TermsAndConditions from './pages/TermsAndConditions';
import PrivacyPolicy from './pages/PrivacyPolicy';

import LoginModal from './components/LoginModal';
import CartModal from './components/CartModal';
import ProductModal from './components/ProductModal';
import WishlistPage from './components/WishlistPage';

import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminProducts from './admin/AdminProducts';
import AdminItemList from './admin/AdminItemList';
import AdminOrders from './admin/AdminOrders';
import AdminPromos from './admin/AdminPromos';
import AdminSalesReports from './admin/AdminSalesReports';
import AdminUsers from './admin/AdminUsers';
import AdminRiders from './admin/AdminRiders';
import AdminBackup from './admin/AdminBackup';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';

import './App.css';

// ─── STARTUP REDIRECT ─────────────────────────────────────────────────────────
const StartupRedirect = ({ children }) => {
  const { isAuthenticated, role, isReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [redirectDone, setRedirectDone] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (isAuthenticated && role) {
      const path = location.pathname;
      const isExempt =
        path.startsWith('/rider-track') ||
        path.startsWith('/promo') ||
        path.startsWith('/order-success') ||
        path.startsWith('/track-order') ||
        path.startsWith('/verify-email');
      if (role === 'admin' && !path.startsWith('/admin') && !isExempt) {
        navigate('/admin', { replace: true });
      }
    }
    setRedirectDone(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  if (!isReady || !redirectDone) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#fff' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:48, height:48, border:'4px solid #f3f4f6', borderTop:'4px solid #ec4899', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
  return children;
};

// ─── PROTECTED ROUTE ──────────────────────────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      sessionStorage.setItem('redirectAfterLogin', location.pathname + location.search);
      setShowLoginModal(true);
    }
  }, [isReady, isAuthenticated, location]);

  if (!isReady) return null;

  if (!isAuthenticated) {
    return (
      <>
        {showLoginModal && (
          <LoginModal
            onClose={() => { setShowLoginModal(false); navigate('/'); }}
            onLoginSuccess={(loginRole) => {
              setShowLoginModal(false);
              const redirect = sessionStorage.getItem('redirectAfterLogin') || '/';
              sessionStorage.removeItem('redirectAfterLogin');
              navigate(redirect, { replace: true });
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

  const cartItems      = useCart();
  const cartCount      = useCartCount();
  const removeFromCart = useRemoveFromCart();
  const wishlistCount  = useWishlistCount();

  const [showLoginModal,    setShowLoginModal]    = useState(false);
  const [showCartModal,     setShowCartModal]     = useState(false);
  const [showProductModal,  setShowProductModal]  = useState(false);
  const [currentProduct,    setCurrentProduct]    = useState(null);

  useEffect(() => {
    const handleOpenLogin = () => setShowLoginModal(true);
    window.addEventListener('openLoginModal', handleOpenLogin);
    return () => window.removeEventListener('openLoginModal', handleOpenLogin);
  }, []);

  const handleLoginSuccess = (loginRole) => {
    setShowLoginModal(false);
    const redirect = sessionStorage.getItem('redirectAfterLogin');
    if (redirect) {
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(redirect, { replace: true });
      return;
    }
    if (loginRole === 'admin') navigate('/admin', { replace: true });
  };

  const isAdminRoute      = location.pathname.startsWith('/admin');
  const isPromoRoute      = location.pathname.startsWith('/promo');
  const isRiderTrackRoute = location.pathname.startsWith('/rider-track');
  const isVerifyRoute     = location.pathname.startsWith('/verify-email');
  const hideHeaderFooter  = isAdminRoute || isPromoRoute || isRiderTrackRoute || isVerifyRoute;
  const showChatBot       = !isAdminRoute && !isPromoRoute && !isRiderTrackRoute && !isVerifyRoute;

  return (
    <StartupRedirect>
      <div className="App">
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
          <Route path="/preorder"      element={<PreOrder />} />
          <Route path="/track-order"   element={<TrackOrder />} />
          <Route path="/help"          element={<Help />} />
          <Route path="/wishlist"      element={<WishlistPage />} />
          <Route path="/checkout"      element={<Checkout />} />
          <Route path="/settings"      element={<Settings />} />
          <Route path="/my-orders"     element={<Navigate to="/track-order" replace />} />
          <Route path="/order-success" element={<OrderSuccess />} />
          <Route path="/promo/:code"   element={<PromoRedirect />} />
          <Route path="/rider-track/:orderId" element={<RiderTrack />} />
          <Route path="/verify-email"  element={<VerifyEmail />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
          <Route path="/privacy-policy"       element={<PrivacyPolicy />} />

          <Route path="/my-preorders" element={
            <ProtectedRoute><MyPreOrders /></ProtectedRoute>
          } />

          {/* ── Admin routes wrapped in BackupProvider ── */}
          <Route path="/admin" element={
            <BackupProvider>
              <AdminLayout />
            </BackupProvider>
          }>
            <Route index                element={<AdminDashboard />} />
            <Route path="products"      element={<AdminProducts />} />
            <Route path="inventory"     element={<AdminItemList />} />
            <Route path="orders"        element={<AdminOrders />} />
            <Route path="promos"        element={<AdminPromos />} />
            <Route path="sales-reports" element={<AdminSalesReports />} />
            <Route path="users"         element={<AdminUsers />} />
            <Route path="riders"        element={<AdminRiders />} />
            <Route path="backup"        element={<AdminBackup />} />
          </Route>

          <Route path="/rider" element={<Navigate to="/" replace />} />
        </Routes>

        {!hideHeaderFooter && <Footer />}
        {showChatBot && <DKMerchChatBot />}

        {showLoginModal && (
          <LoginModal
            onClose={() => setShowLoginModal(false)}
            onLoginSuccess={handleLoginSuccess}
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
            onRequireLogin={() => { setShowProductModal(false); setShowLoginModal(true); }}
          />
        )}
      </div>
    </StartupRedirect>
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
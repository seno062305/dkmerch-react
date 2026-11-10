// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { useAuth } from './context/AuthContext';
import { useCart, useRemoveFromCart, useCartCount, useAddToCart } from './context/cartUtils';
import { useWishlist, useWishlistCount, useToggleWishlist } from './context/wishlistUtils';
import { BackupProvider } from './context/BackupContext';
import { RewardsProvider } from './context/RewardsContext';
import { isPushSupported, subscribeToPush, getNotificationPermission } from './utils/pushNotifications';

import Header from './components/Header';
import Footer from './components/Footer';
import CustomerBottomNav from './components/CustomerBottomNav';
import DKMerchChatBot from './components/DKMerchChatBot';

import Home from './pages/Home';
import Collections from './pages/Collections';
import PreOrder from './pages/PreOrder';
import TrackOrder from './pages/TrackOrder';
import Help from './pages/Help';
import Settings from './pages/Settings';
import MoreSettings from './pages/MoreSettings';
import CustomerChat from './pages/CustomerChat';
import AdminChat from './admin/AdminChat';
import PromoRedirect from './pages/PromoRedirect';
import MyPreOrders from './pages/MyPreOrders';
import RiderTrack from './pages/RiderTrack';
import VerifyEmail from './pages/VerifyEmail';
import TermsAndConditions from './pages/TermsAndConditions';
import PrivacyPolicy from './pages/PrivacyPolicy';

import CartModal from './components/CartModal';
import ProductModal from './components/ProductModal';
import WishlistPage from './components/WishlistPage';
import AppUpdateModal from './components/AppUpdateModal';

import AdminLayout from './admin/AdminLayout';
import AdminDashboard from './admin/AdminDashboard';
import AdminProducts from './admin/AdminProducts';
import AdminItemList from './admin/AdminInventory';
import AdminOrders from './admin/AdminOrders';
import AdminPromos from './admin/AdminPromos';
import AdminSalesReports from './admin/AdminSalesReports';
import AdminUsers from './admin/AdminUsers';
import AdminRiders from './admin/AdminRiders';
import AdminBackup from './admin/AdminBackup';
import AdminRewards from './admin/AdminRewards';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';

// 🛵 Rider Dashboard
import RiderDashboard from './pages/RiderDashboard';

// Lazy LoginModal breaks HMR TDZ with RegisterModal / AuthContext
const LoginModal = React.lazy(() => import('./components/LoginModal'));

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
        path.startsWith('/rider') ||
        path.startsWith('/promo') ||
        path.startsWith('/order-success') ||
        path.startsWith('/track-order') ||
        path.startsWith('/verify-email');

      if (role === 'admin' && path === '/' && !isExempt) {
        navigate('/admin', { replace: true });
      }

      if (role === 'rider' && path === '/' && !isExempt) {
        navigate('/rider', { replace: true });
      }
    }
    setRedirectDone(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady]);

  if (!isReady || !redirectDone) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'linear-gradient(145deg, #fc1268 0%, #ff4d94 50%, #ff85b3 100%)' }}>
        <div style={{ textAlign:'center' }}>
          <img
            src="/images/dklogo2-removebg-preview.png"
            alt="DKMerch"
            width={72}
            height={72}
            style={{ width:72, height:72, objectFit:'contain', display:'block', margin:'0 auto 14px' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div style={{ width:40, height:40, border:'3px solid rgba(255,255,255,0.35)', borderTop:'3px solid #fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }} />
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
          <React.Suspense fallback={null}>
            <LoginModal
              onClose={() => { setShowLoginModal(false); navigate('/'); }}
              onLoginSuccess={(loginRole) => {
                setShowLoginModal(false);
                const redirect = sessionStorage.getItem('redirectAfterLogin') || '/';
                sessionStorage.removeItem('redirectAfterLogin');
                navigate(redirect, { replace: true });
              }}
            />
          </React.Suspense>
        )}
      </>
    );
  }
  return children;
};

// ─── RIDER PROTECTED ROUTE ────────────────────────────────────────────────────
const RiderRoute = ({ children }) => {
  const { isAuthenticated, role, isReady } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isReady) return;
    if (!isAuthenticated) {
      window.dispatchEvent(new Event('openLoginModal'));
      navigate('/', { replace: true });
    }
  }, [isReady, isAuthenticated, navigate]);

  if (!isReady) return null;
  if (!isAuthenticated) return null;

  return children;
};

// ─── APP CONTENT ──────────────────────────────────────────────────────────────
function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated, role, isReady, needsDeviceUnlock, clearDeviceUnlockPrompt } = useAuth();
  const savePushSub = useMutation(api.pushSubscriptions.saveSubscription);

  const cartItems      = useCart();
  const cartCount      = useCartCount();
  const removeFromCart = useRemoveFromCart();
  const addToCart      = useAddToCart();
  const toggleWishlist = useToggleWishlist();
  const wishlistCount  = useWishlistCount();

  const [showLoginModal,    setShowLoginModal]    = useState(false);
  const [showCartModal,     setShowCartModal]     = useState(false);
  const [showProductModal,  setShowProductModal]  = useState(false);
  const [currentProduct,    setCurrentProduct]    = useState(null);

  useEffect(() => {
    const handleOpenLogin = (e) => {
      const customersOnly = !!e?.detail?.customersOnly;
      // Opening login from header/cart/etc. clears the customer-chat-only gate
      if (!customersOnly) {
        try { sessionStorage.removeItem('dk_login_customers_only'); } catch { /* ignore */ }
      }
      setShowLoginModal(true);
    };
    window.addEventListener('openLoginModal', handleOpenLogin);
    return () => window.removeEventListener('openLoginModal', handleOpenLogin);
  }, []);

  // Cold start after closing the app → PIN unlock (not on normal reload)
  useEffect(() => {
    if (!isReady || isAuthenticated || !needsDeviceUnlock) return;
    setShowLoginModal(true);
  }, [isReady, isAuthenticated, needsDeviceUnlock]);

  // Keep / request push subscription for logged-in customers (needed for phone order alerts)
  useEffect(() => {
    if (!isAuthenticated || !user?.email || role === 'admin' || role === 'rider') return;
    if (!isPushSupported()) return;
    const permission = getNotificationPermission();
    if (permission === 'denied') return;
    let cancelled = false;
    (async () => {
      try {
        // Ask once per browser session if not yet granted
        if (permission !== 'granted') {
          const asked = sessionStorage.getItem('dkmerch_push_asked') === '1';
          if (asked) return;
          sessionStorage.setItem('dkmerch_push_asked', '1');
        }
        const sub = await subscribeToPush();
        if (cancelled || !sub?.endpoint || !sub?.keys) return;
        await savePushSub({
          email: user.email,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          userAgent: navigator.userAgent,
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.email, role, savePushSub]);

  const handleLoginSuccess = (loginRole) => {
    setShowLoginModal(false);
    try { sessionStorage.removeItem('dkmerch_push_asked'); } catch { /* ignore */ }
    try { sessionStorage.removeItem('dk_login_customers_only'); } catch { /* ignore */ }
    const redirect = sessionStorage.getItem('redirectAfterLogin');
    if (redirect) {
      sessionStorage.removeItem('redirectAfterLogin');
      // Never send staff into customer chat after login
      if ((loginRole === 'admin' || loginRole === 'rider') && String(redirect).startsWith('/chat')) {
        navigate(loginRole === 'admin' ? '/admin/chat' : '/rider', { replace: true });
        return;
      }
      navigate(redirect, { replace: true });
      return;
    }
    if (loginRole === 'admin')  navigate('/admin',  { replace: true });
    if (loginRole === 'rider')  navigate('/rider',  { replace: true });
  };

  const isAdminRoute      = location.pathname.startsWith('/admin');
  const isPromoRoute      = location.pathname.startsWith('/promo');
  const isRiderTrackRoute = location.pathname.startsWith('/rider-track');
  const isRiderDashRoute  = location.pathname.startsWith('/rider');
  const isVerifyRoute     = location.pathname.startsWith('/verify-email');

  const isCustomerChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
  const isSettingsRoute   = location.pathname === '/settings' || location.pathname.startsWith('/settings/');
  const isMoreRoute       = location.pathname === '/more' || location.pathname.startsWith('/more/');
  const isCheckoutRoute   = location.pathname === '/checkout' || location.pathname.startsWith('/checkout/');
  const hideHeaderFooter  = isAdminRoute || isPromoRoute || isRiderTrackRoute || isRiderDashRoute || isVerifyRoute;
  const hideFooterOnly    = isCustomerChatRoute;
  // Hide floating chat/install FABs on form-heavy pages so they don't cover inputs
  const showChatBot       = !isAdminRoute && !isPromoRoute && !isRiderTrackRoute && !isRiderDashRoute && !isVerifyRoute && !isCustomerChatRoute && !isSettingsRoute && !isMoreRoute && !isCheckoutRoute;
  const showCustomerNav   = !hideHeaderFooter;

  useEffect(() => {
    document.body.classList.toggle('has-customer-bottom-nav', showCustomerNav);
    return () => document.body.classList.remove('has-customer-bottom-nav');
  }, [showCustomerNav]);

  return (
    <StartupRedirect>
      {/* ✅ RewardsProvider wraps everything so RewardsModal state is accessible from Header */}
      <RewardsProvider>
        <div className={`App ${showCustomerNav ? 'app-with-customer-bnav' : ''}`}>
          {!hideHeaderFooter && (
            <Header
              cartCount={cartCount}
              wishlistCount={wishlistCount}
              onCartClick={() => setShowCartModal(true)}
            />
          )}

          <Routes>
            {/* ── Public routes ── */}
            <Route path="/" element={<Home onProductClick={(p) => { setCurrentProduct(p); setShowProductModal(true); }} />} />
            <Route path="/collections" element={<Collections onProductClick={(p) => { setCurrentProduct(p); setShowProductModal(true); }} />} />
            <Route path="/preorder"      element={<PreOrder />} />
            <Route path="/track-order"   element={<TrackOrder onProductClick={(p) => { setCurrentProduct(p); setShowProductModal(true); }} />} />
            <Route path="/help"          element={<Help />} />
            <Route path="/wishlist"      element={<WishlistPage onProductClick={(p) => { setCurrentProduct(p); setShowProductModal(true); }} />} />
            <Route path="/checkout"      element={<Checkout />} />
            <Route path="/settings"      element={<Settings />} />
            <Route path="/more"          element={<MoreSettings />} />
            <Route path="/chat"          element={<CustomerChat />} />
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

            {/* 🛵 Rider Dashboard route */}
            <Route path="/rider" element={
              <RiderRoute><RiderDashboard /></RiderRoute>
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
              <Route path="rewards"       element={<AdminRewards />} />
              <Route path="chat"          element={<AdminChat />} />
              <Route path="settings"      element={<AdminBackup />} />
              <Route path="backup"        element={<AdminBackup />} />
            </Route>
          </Routes>

          {!hideHeaderFooter && !hideFooterOnly && <Footer />}
          {showCustomerNav && <CustomerBottomNav />}
          {showChatBot && <DKMerchChatBot />}

          {showLoginModal && (
            <React.Suspense fallback={null}>
              <LoginModal
                preferPinUnlock={!!needsDeviceUnlock}
                onClose={() => {
                  try { sessionStorage.removeItem('dk_login_customers_only'); } catch { /* ignore */ }
                  clearDeviceUnlockPrompt?.();
                  setShowLoginModal(false);
                }}
                onLoginSuccess={(loginRole) => {
                  clearDeviceUnlockPrompt?.();
                  handleLoginSuccess(loginRole);
                }}
              />
            </React.Suspense>
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
              onAddToCart={(product) => addToCart(product)}
              onAddToWishlist={(product) => toggleWishlist(product)}
              onRequireLogin={() => { setShowProductModal(false); setShowLoginModal(true); }}
            />
          )}

          {!isAdminRoute && !isRiderDashRoute && <AppUpdateModal />}
        </div>
      </RewardsProvider>
    </StartupRedirect>
  );
}

function App() {
  // AuthProvider lives in index.js — nesting it here caused webpack
  // "__WEBPACK_DEFAULT_EXPORT__ before initialization" under HMR.
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
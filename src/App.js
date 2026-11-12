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
import { scrollPageToTop } from './utils/navScroll';
import { clearScrollLockIfIdle } from './utils/scrollLock';
import { isAuthGateLocked } from './lib/authGate';

// Avoid admin↔home bounce while PIN / switch / reset gate is open
function shouldDeferRoleRedirect() {
  try { return isAuthGateLocked(); } catch { return false; }
}

import Header from './components/Header';
import Footer from './components/Footer';
import CustomerBottomNav from './components/CustomerBottomNav';
import DKMerchChatBot from './components/DKMerchChatBot';

import Home from './pages/Home';
import Collections from './pages/Collections';
import PreOrder from './pages/PreOrder';
import TrackOrder from './pages/TrackOrder';
import Help from './pages/Help';
import Notifications from './pages/Notifications';
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
import PointsClaimModal from './components/PointsClaimModal';
import LoginModal from './components/LoginModal';

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

import './App.css';

// ─── STARTUP REDIRECT ─────────────────────────────────────────────────────────
const StartupRedirect = ({ children }) => {
  const { isAuthenticated, role, isReady } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [redirectDone, setRedirectDone] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    if (isAuthenticated && role && !shouldDeferRoleRedirect()) {
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
  }, [isReady, isAuthenticated, role, location.pathname, navigate]);

  // Keep #splash (loading UI) on top — no second pink logo screen
  useEffect(() => {
    if (!isReady || !redirectDone) return;
    try {
      window.__DKMERCH_BOOT__ = true;
      window.dispatchEvent(new Event('dkmerch-boot'));
    } catch { /* ignore */ }
  }, [isReady, redirectDone]);

  if (!isReady || !redirectDone) {
    return <div aria-hidden="true" style={{ minHeight: '100vh', background: '#fc1268' }} />;
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
  const { user, isAuthenticated, role, isReady, needsDeviceUnlock, clearDeviceUnlockPrompt, logout } = useAuth();
  const savePushSub = useMutation(api.pushSubscriptions.saveSubscription);

  const cartItems      = useCart();
  const cartCount      = useCartCount();
  const removeFromCart = useRemoveFromCart();
  const addToCart      = useAddToCart();
  const toggleWishlist = useToggleWishlist();
  const wishlistCount  = useWishlistCount();

  const [showLoginModal,    setShowLoginModal]    = useState(() => isAuthGateLocked());
  const [showCartModal,     setShowCartModal]     = useState(false);
  const [showProductModal,  setShowProductModal]  = useState(false);
  const [currentProduct,    setCurrentProduct]    = useState(null);

  // Close product/cart overlays when switching customer tabs/routes
  useEffect(() => {
    setShowProductModal(false);
    setCurrentProduct(null);
    setShowCartModal(false);
  }, [location.pathname]);

  // Footer / bottom-nav: after landing on a tab, jump to top once
  useEffect(() => {
    if (!location.state?.scrollToTop) return;
    scrollPageToTop({ smooth: false });
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: { ...(location.state || {}), scrollToTop: false },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.key]);

  // Safety: never leave product/cart lock classes stuck (they disable bottom-nav / scroll).
  // Do NOT wipe body top/position while useBodyScrollLock holds the shared lock —
  // that was jumping the page to the header on open and scrolling back down on close.
  useEffect(() => {
    if (!showProductModal) document.body.classList.remove('product-modal-open');
    if (!showCartModal) document.body.classList.remove('cart-modal-open');
    if (
      !showProductModal
      && !showCartModal
      && !showLoginModal
      && !document.body.classList.contains('login-modal-open')
    ) {
      clearScrollLockIfIdle();
    }
  }, [showProductModal, showCartModal, showLoginModal]);

  useEffect(() => {
    const handleOpenLogin = (e) => {
      const customersOnly = !!e?.detail?.customersOnly;
      const redirectTo = e?.detail?.redirectTo;
      // Opening login from header/cart/etc. clears the customer-chat-only gate
      if (!customersOnly) {
        try { sessionStorage.removeItem('dk_login_customers_only'); } catch { /* ignore */ }
      }
      // Profile/header → home. Chat passes customersOnly (keeps /chat). Explicit redirectTo wins.
      try {
        if (typeof redirectTo === 'string' && redirectTo) {
          sessionStorage.setItem('redirectAfterLogin', redirectTo);
        } else if (!customersOnly) {
          sessionStorage.setItem('redirectAfterLogin', '/');
        }
      } catch { /* ignore */ }
      setShowLoginModal(true);
    };
    window.addEventListener('openLoginModal', handleOpenLogin);
    return () => window.removeEventListener('openLoginModal', handleOpenLogin);
  }, []);

  // Cold start after closing the app → PIN unlock (even if session is restored underneath)
  useEffect(() => {
    if (!isReady || !needsDeviceUnlock) return;
    // Don't inherit a stale /chat redirect from an earlier visit
    try { sessionStorage.removeItem('redirectAfterLogin'); } catch { /* ignore */ }
    setShowLoginModal(true);
  }, [isReady, needsDeviceUnlock]);

  // Hard refresh while on Use another account / Reset PIN / PIN gate
  useEffect(() => {
    if (!isReady) return;
    if (isAuthGateLocked()) setShowLoginModal(true);
  }, [isReady]);

  // Waiting for "Yes, it's me" on another device — keep the gate up after reload
  useEffect(() => {
    if (!isReady || isAuthenticated) return;
    try {
      const pending = JSON.parse(sessionStorage.getItem('dkmerch_pending_login') || 'null');
      if (pending?.userId && pending?.sessionId) setShowLoginModal(true);
    } catch { /* ignore */ }
  }, [isReady, isAuthenticated]);

  /**
   * Push notification click → open the matching screen / modal.
   * loginAlert: stay on home; AuthContext shows Yes/No popup.
   * Other urls (track-order, admin, claimPoints): navigate there.
   */
  useEffect(() => {
    const applyDeepLink = (rawUrl) => {
      try {
        const u = new URL(rawUrl, window.location.origin);
        if (u.origin !== window.location.origin) return;
        const open = u.searchParams.get('open') || '';
        if (open === 'loginAlert') {
          const riderAlert = u.pathname.startsWith('/rider');
          // Same email can be customer + rider — don't cross-open the wrong app's Yes/No
          if (role === 'rider' && !riderAlert) return;
          if ((role === 'user' || role === 'admin') && riderAlert) return;
          try { sessionStorage.setItem('dkmerch_open_login_alert', '1'); } catch { /* ignore */ }
          window.dispatchEvent(new Event('dkOpenLoginAlert'));
          const target = riderAlert
            ? `/rider?open=loginAlert${u.hash || ''}`
            : `/?open=loginAlert${u.hash || ''}`;
          if (`${location.pathname}${location.search}` !== target) {
            navigate(target, { replace: true });
          }
          return;
        }
        const next = `${u.pathname}${u.search}${u.hash}`;
        if (next && next !== `${location.pathname}${location.search}${location.hash}`) {
          navigate(next);
        }
      } catch { /* ignore */ }
    };

    // Cold start / hard open from notification
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('open') === 'loginAlert') {
        const riderPath = window.location.pathname.startsWith('/rider');
        if (role === 'rider' && !riderPath) {
          /* customer alert — ignore on rider session */
        } else if ((role === 'user' || role === 'admin') && riderPath) {
          /* rider alert — ignore on customer session */
        } else {
          sessionStorage.setItem('dkmerch_open_login_alert', '1');
          window.dispatchEvent(new Event('dkOpenLoginAlert'));
        }
      }
    } catch { /* ignore */ }

    const onSwMessage = (event) => {
      if (event?.data?.type !== 'DK_NOTIFICATION_OPEN') return;
      if (event.data.url) applyDeepLink(event.data.url);
      else if (event.data.open === 'loginAlert') {
        try { sessionStorage.setItem('dkmerch_open_login_alert', '1'); } catch { /* ignore */ }
        window.dispatchEvent(new Event('dkOpenLoginAlert'));
        navigate('/?open=loginAlert', { replace: true });
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', onSwMessage);
    }
    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('message', onSwMessage);
      }
    };
  }, [navigate, location.pathname, role]);

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
          role: 'user',
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.email, role, savePushSub]);

  // Rider push — separate role so customer login alerts never hit the rider app (same email OK)
  useEffect(() => {
    if (!isAuthenticated || !user?.email || role !== 'rider') return;
    if (!isPushSupported()) return;
    const permission = getNotificationPermission();
    if (permission === 'denied') return;
    let cancelled = false;
    (async () => {
      try {
        if (permission !== 'granted') {
          const asked = sessionStorage.getItem('dkmerch_rider_push_asked') === '1';
          if (asked) return;
          sessionStorage.setItem('dkmerch_rider_push_asked', '1');
        }
        const sub = await subscribeToPush();
        if (cancelled || !sub?.endpoint || !sub?.keys) return;
        await savePushSub({
          email: user.email,
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          userAgent: navigator.userAgent,
          role: 'rider',
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.email, role, savePushSub]);

  const handleLoginSuccess = (loginRole) => {
    setShowLoginModal(false);
    try { sessionStorage.removeItem('dkmerch_push_asked'); } catch { /* ignore */ }
    try { sessionStorage.removeItem('dk_login_customers_only'); } catch { /* ignore */ }
    let redirect = null;
    try {
      redirect = sessionStorage.getItem('redirectAfterLogin');
      sessionStorage.removeItem('redirectAfterLogin');
    } catch { /* ignore */ }

    if (loginRole === 'admin') {
      navigate('/admin', { replace: true });
      return;
    }
    if (loginRole === 'rider') {
      navigate('/rider', { replace: true });
      return;
    }

    // Chat login only when chat explicitly set the redirect
    if (redirect && String(redirect).startsWith('/chat')) {
      navigate(redirect, { replace: true });
      return;
    }

    // Profile / header / generic login → home
    if (redirect === '/' || redirect == null) {
      if (location.pathname !== '/') navigate('/', { replace: true });
      return;
    }

    // Protected-route login (settings, wishlist, etc.) → that page
    if (redirect === location.pathname + location.search) return;
    navigate(redirect, { replace: true });
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
            <Route path="/notifications" element={<Notifications />} />
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

          {/* Hide footer/nav under PIN / login gate — they steal taps (Reset → Home) */}
          {!hideHeaderFooter && !hideFooterOnly && !showLoginModal && <Footer />}
          {showCustomerNav && !showLoginModal && <CustomerBottomNav />}
          {showChatBot && !showLoginModal && <DKMerchChatBot />}
          <PointsClaimModal />

          {showLoginModal && (
            <LoginModal
              preferPinUnlock={!!needsDeviceUnlock}
              onClearUnlockPrompt={() => clearDeviceUnlockPrompt?.()}
              onClose={() => {
                // PIN / switch-account / reset-PIN gate — never dismiss to Home
                if (needsDeviceUnlock || isAuthGateLocked()) return;
                try { sessionStorage.removeItem('dk_login_customers_only'); } catch { /* ignore */ }
                clearDeviceUnlockPrompt?.();
                setShowLoginModal(false);
              }}
              onSwitchAccount={() => {
                // Stay on pink login UI — do not navigate Home
                setShowLoginModal(true);
              }}
              onLoginSuccess={(loginRole) => {
                clearDeviceUnlockPrompt?.();
                setShowLoginModal(false);
                handleLoginSuccess(loginRole);
              }}
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
              onAddToCart={async (product) => addToCart(product)}
              onAddToWishlist={async (product) => toggleWishlist(product)}
              onRequireLogin={() => setShowLoginModal(true)}
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
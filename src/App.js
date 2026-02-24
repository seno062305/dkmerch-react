// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import PromoRedirect from './pages/PromoRedirect'; // ✅ NEW

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

const RiderRoute = ({ children }) => {
  const { isAuthenticated, role } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  if (role !== 'rider') return <Navigate to="/" replace />;
  return children;
};

function AppContent() {
  const location = useLocation();
  const { role } = useAuth();

  const cartItems       = useCart();
  const cartCount       = useCartCount();
  const removeFromCart  = useRemoveFromCart();

  const wishlistItems   = useWishlist();
  const wishlistCount   = useWishlistCount();

  const [showLoginModal, setShowLoginModal]     = useState(false);
  const [showCartModal, setShowCartModal]       = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [currentProduct, setCurrentProduct]     = useState(null);

  useEffect(() => {
    const handleOpenLogin = () => setShowLoginModal(true);
    window.addEventListener('openLoginModal', handleOpenLogin);
    return () => window.removeEventListener('openLoginModal', handleOpenLogin);
  }, []);

  const isAdminRoute = location.pathname.startsWith('/admin');
  const isRiderRoute = location.pathname.startsWith('/rider');
  const isPromoRoute = location.pathname.startsWith('/promo'); // ✅ NEW
  const hideHeaderFooter = isAdminRoute || isRiderRoute || isPromoRoute;

  const handleOpenProductModal = (product) => {
    setCurrentProduct(product);
    setShowProductModal(true);
  };

  return (
    <div className="App">
      {!hideHeaderFooter && (
        <Header
          cartCount={cartCount}
          wishlistCount={wishlistCount}
          onCartClick={() => setShowCartModal(true)}
        />
      )}

      <Routes>
        <Route path="/" element={<Home onProductClick={handleOpenProductModal} />} />
        <Route path="/collections" element={<Collections onProductClick={handleOpenProductModal} />} />
        <Route path="/preorder" element={<PreOrder />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/help" element={<Help />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/my-orders" element={<Navigate to="/track-order" replace />} />
        <Route path="/order-success" element={<OrderSuccess />} />

        {/* ✅ Promo redirect page — checks expiry before showing site */}
        <Route path="/promo/:code" element={<PromoRedirect />} />

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
        <LoginModal onClose={() => setShowLoginModal(false)} />
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
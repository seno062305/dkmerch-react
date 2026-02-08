import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

import Header from './components/Header';
import Footer from './components/Footer';

import Home from './pages/Home';
import Collections from './pages/Collections';
import PreOrder from './pages/PreOrder';
import TrackOrder from './pages/TrackOrder';
import Help from './pages/Help';
import Settings from './pages/Settings';

import LoginModal from './components/LoginModal';
import CartModal from './components/CartModal';
import ProductModal from './components/ProductModal';
import WishlistPage from './components/WishlistPage';

import AdminLayout from './admin/AdminLayout';
import AdminDashboard from '../src/admin/AdminDashboard';
import AdminProducts from './admin/AdminProducts';
import AdminInventory from './admin/AdminInventory';
import AdminOrders from './admin/AdminOrders';
import AdminPromos from './admin/AdminPromos';
import AdminSalesReports from './admin/AdminSalesReports';
import AdminUsers from './admin/AdminUsers';
import Checkout from './pages/Checkout';

import './App.css';

const PRODUCT_KEY = 'dkmerch_products';
const CART_KEY = 'dkmerch_cart';
const WISHLIST_KEY = 'dkmerch_wishlist';

function AppContent() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showCartModal, setShowCartModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);

  // Check if current route is admin
  const isAdminRoute = location.pathname.startsWith('/admin');

  /* ===============================
     SYNC ALL FROM LOCALSTORAGE
  =============================== */
  const syncAll = () => {
    const storedProducts = JSON.parse(localStorage.getItem(PRODUCT_KEY)) || [];
    let storedCart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
    let storedWishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];

    const validIds = storedProducts.map(p => p.id);

    storedCart = storedCart.filter(item => validIds.includes(item.id));
    storedWishlist = storedWishlist.filter(id => validIds.includes(id));

    localStorage.setItem(CART_KEY, JSON.stringify(storedCart));
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(storedWishlist));

    setProducts(storedProducts);
    setCart(storedCart);
    setWishlist(storedWishlist);
  };

  useEffect(() => {
    syncAll();

    const handleUpdate = () => syncAll();
    const handleOpenLogin = () => setShowLoginModal(true);

    window.addEventListener('storage', handleUpdate);
    window.addEventListener('dkmerch-products-updated', handleUpdate);
    window.addEventListener('openLoginModal', handleOpenLogin);

    return () => {
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('dkmerch-products-updated', handleUpdate);
      window.removeEventListener('openLoginModal', handleOpenLogin);
    };
  }, []);

  /* ===============================
     CART REMOVE (FIX NG ERROR MO)
  =============================== */
  const handleRemoveFromCart = (productId) => {
    const updatedCart = cart.filter(item => item.id !== productId);
    localStorage.setItem(CART_KEY, JSON.stringify(updatedCart));
    setCart(updatedCart);
    window.dispatchEvent(new Event('storage'));
  };

  /* ===============================
     PRODUCT MODAL
  =============================== */
  const handleOpenProductModal = (product) => {
    setCurrentProduct(product);
    setShowProductModal(true);
  };

  return (
    <div className="App">
      {/* Only show Header if NOT admin route */}
      {!isAdminRoute && (
        <Header
          cartCount={cart.reduce((sum, i) => sum + i.quantity, 0)}
          wishlistCount={wishlist.length}
          onCartClick={() => setShowCartModal(true)}
        />
      )}

      <Routes>
        <Route path="/" element={<Home onProductClick={handleOpenProductModal} />} />

        <Route
          path="/collections"
          element={
            <Collections
              products={products}
              onProductClick={handleOpenProductModal}
            />
          }
        />

        <Route path="/preorder" element={<PreOrder />} />
        <Route path="/track-order" element={<TrackOrder />} />
        <Route path="/help" element={<Help />} />
        <Route path="/wishlist" element={<WishlistPage />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/settings" element={<Settings />} />

        {/* ✅ COMPLETE ADMIN ROUTES */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="inventory" element={<AdminInventory />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="promos" element={<AdminPromos />} />
          <Route path="sales-reports" element={<AdminSalesReports />} />
          <Route path="users" element={<AdminUsers />} />
        </Route>
      </Routes>

      {/* Only show Footer if NOT admin route */}
      {!isAdminRoute && <Footer />}

      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}

      {showCartModal && (
        <CartModal
          cart={cart}
          products={products}
          onClose={() => setShowCartModal(false)}
          onRemoveFromCart={handleRemoveFromCart}
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
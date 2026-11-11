import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { useLocation } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import HeroCarousel from '../components/HeroCarousel';
import LogoMarquee from '../components/LogoMarquee';
import WeverseSection from '../components/WeverseSection';
import ProductModal from '../components/ProductModal';
import { useAddToCart } from '../context/cartUtils';
import { useToggleWishlist, useWishlist } from '../context/wishlistUtils';
import { useNotification } from '../context/NotificationContext';
import { useConfirm, shopActionConfirmRememberKey } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

function toUtcMs(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr ? timeStr.split(':').map(Number) : [0, 0];
  return Date.UTC(y, mo - 1, d, h, m, 0) - PH_OFFSET_MS;
}

function pickActivePromo(promos, nowMs) {
  if (!promos || promos.length === 0) return null;

  const withWindow = promos
    .filter(p => p?.isActive)
    .map(p => {
      const startMs = toUtcMs(p.startDate, p.startTime || '00:00');
      const endMs   = toUtcMs(p.endDate,   p.endTime   || '23:59');
      const live     = (!startMs || nowMs >= startMs) && (!endMs || nowMs <= endMs);
      const upcoming = startMs != null && nowMs < startMs && (!endMs || endMs > nowMs);
      return { promo: p, startMs, endMs, live, upcoming };
    })
    .filter(x => x.live || x.upcoming);

  if (withWindow.length === 0) return null;

  // Prefer a live promo (soonest end); else soonest upcoming start
  const live = withWindow.filter(x => x.live).sort((a, b) => (a.endMs ?? Infinity) - (b.endMs ?? Infinity));
  if (live.length) return { ...live[0].promo, _carouselPhase: 'live' };

  const upcoming = withWindow
    .filter(x => x.upcoming)
    .sort((a, b) => (a.startMs ?? Infinity) - (b.startMs ?? Infinity));
  return upcoming.length ? { ...upcoming[0].promo, _carouselPhase: 'upcoming' } : null;
}

function isPromoExpired(promo, nowMs) {
  if (!promo) return false;
  const endMs = toUtcMs(promo.endDate, promo.endTime || '23:59');
  if (!endMs) return false;
  return nowMs > endMs;
}

const isSaleOrder = (o) => {
  const status      = (o.status      || '').toLowerCase().trim();
  const orderStatus = (o.orderStatus || '').toLowerCase().trim();
  return (
    status      === 'delivered'  ||
    status      === 'completed'  ||
    orderStatus === 'completed'  ||
    orderStatus === 'delivered'
  );
};

// ── Expired Promo Modal ──
const ExpiredPromoModal = ({ promo, onClose }) => {
  const fmtDate = (d) => {
    if (!d) return '';
    const [y, mo, day] = d.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[mo - 1]} ${day}, ${y}`;
  };
  const fmt12 = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999, padding: '20px',
    }}>
      <div style={{
        background: 'white', borderRadius: '20px', padding: '40px 32px',
        maxWidth: '400px', width: '100%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        animation: 'slideUp 0.3s ease',
      }}>
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>⏰</div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#1a1a1a', margin: '0 0 8px' }}>
          Promo Code Expired
        </h2>
        <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.6 }}>
          Sorry, the promo code{' '}
          <span style={{
            fontFamily: 'Courier New, monospace', fontWeight: 800, color: '#ec4899',
            background: '#fdf2f8', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px',
          }}>
            {promo?.code}
          </span>{' '}
          is no longer valid.
        </p>
        {promo?.endDate && (
          <div style={{
            background: '#fff9f9', border: '1.5px solid #fecaca', borderRadius: '10px',
            padding: '12px 16px', marginBottom: '24px', fontSize: '13px', color: '#dc2626',
          }}>
            ❌ Expired on{' '}
            <strong>
              {fmtDate(promo.endDate)}
              {promo.endTime ? ` • ${fmt12(promo.endTime)} PH` : ''}
            </strong>
          </div>
        )}
        <p style={{ color: '#888', fontSize: '13px', margin: '0 0 24px' }}>
          Check your inbox for newer promos from DKMerch! 💌
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '13px',
            background: 'linear-gradient(135deg, #fc1268, #ec4899)',
            color: 'white', border: 'none', borderRadius: '10px',
            fontSize: '15px', fontWeight: 700, cursor: 'pointer',
          }}
        >
          Browse Products Anyway 🛍️
        </button>
      </div>
    </div>
  );
};

const Home = () => {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [highlightPromo, setHighlightPromo] = useState(null);
  const [expiredPromo, setExpiredPromo] = useState(null);
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  const addToCartMutation      = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();
  const wishlistItems          = useWishlist();

  const allPromos = useQuery(api.promos.getAllPromos) || [];
  const allOrders = useQuery(api.orders.getAllOrders) ?? [];

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const activePromo = pickActivePromo(allPromos, nowMs);

  const productSalesMap = useMemo(() => {
    if (!allOrders || allOrders.length === 0) return {};
    const map = {};
    const saleOrders = allOrders.filter(isSaleOrder);
    saleOrders.forEach(order => {
      (order.items || []).forEach(item => {
        const pid = item.productId || item._id || item.id;
        if (!pid) return;
        map[pid] = (map[pid] || 0) + (Number(item.quantity) || 1);
      });
    });
    return map;
  }, [allOrders]);

  useEffect(() => {
    if (allPromos.length === 0) return;
    const params = new URLSearchParams(location.search);
    const urlPromoCode = params.get('promo');
    if (!urlPromoCode) return;
    const matchedPromo = allPromos.find(p => p.code.toUpperCase() === urlPromoCode.toUpperCase());
    if (!matchedPromo) {
      showNotification(`Promo code "${urlPromoCode}" not found.`, 'error');
      return;
    }
    if (isPromoExpired(matchedPromo, Date.now())) {
      setExpiredPromo(matchedPromo);
      setTimeout(() => {
        const section = document.getElementById('collections');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 600);
      return;
    }
    const startMs = toUtcMs(matchedPromo.startDate, matchedPromo.startTime || '00:00');
    if (startMs && Date.now() < startMs) {
      showNotification(`Promo "${urlPromoCode}" hasn't started yet. Stay tuned!`, 'info');
      return;
    }
    setHighlightPromo(matchedPromo);
    setTimeout(() => {
      const section = document.getElementById('collections');
      if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 600);
  }, [allPromos, location.search]);

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  const staticSlides = [
    {
      image: '/images/BLACKPINK – BORN PINK Album (Black Version).jpg',
      title: 'Welcome to DKMerch',
      description: 'Your one-stop shop for authentic K-Pop merchandise',
      buttonText: 'Shop Now',
      buttonIcon: 'arrow-right',
    },
    {
      image: '/images/BTS – Proof (Standard Edition Album).webp',
      title: 'New Album Releases',
      description: 'Pre-order the latest albums from your favorite groups',
      buttonText: 'Pre-Order Now',
      buttonIcon: 'shopping-bag',
    },
    {
      image: '/images/NewJeans - NJ Get Up PHOTOCARD SET.png',
      title: 'Exclusive Photocards',
      description: 'Complete your collection with rare photocards',
      buttonText: 'Browse Collection',
      buttonIcon: 'images',
    },
  ];

  const promoSlide = activePromo
    ? {
        image: '/images/SEVENTEEN - SECTOR 17 [4th Album Repackage].png',
        title: `${activePromo.name} Promo`,
        description: activePromo._carouselPhase === 'upcoming'
          ? `Coming soon · Use code: ${activePromo.code} · ${activePromo.discount}% off${activePromo.maxDiscount != null ? ` · Max ₱${Number(activePromo.maxDiscount).toLocaleString()}` : ''}`
          : `Use code: ${activePromo.code} · ${activePromo.discount}% off${activePromo.maxDiscount != null ? ` · Max ₱${Number(activePromo.maxDiscount).toLocaleString()}` : ''}`,
        buttonText: activePromo._carouselPhase === 'upcoming' ? 'View Group' : 'Shop Now',
        buttonIcon: 'tag',
        isPromo: true,
        promoPhase:     activePromo._carouselPhase || 'live',
        promoCode:      activePromo.code,
        promoGroup:     activePromo.name,
        promoStartDate: activePromo.startDate,
        promoStartTime: activePromo.startTime,
        promoEndDate:   activePromo.endDate,
        promoEndTime:   activePromo.endTime,
        duration: 8000,
      }
    : null;

  const carouselSlides = promoSlide ? [promoSlide, ...staticSlides] : staticSlides;

  // ── Add to Cart ──
  // NOTE: No window.confirm here — ProductModal already handles confirmation.
  // This is only called via ProductModal's onAddToCart prop.
  const handleAddToCart = async (product) => {
    if (Number(product.stock) <= 0) {
      showNotification('Product is out of stock — you can still favorite it.', 'warning');
      return;
    }
    const result = await addToCartMutation(product);
    showNotification(`${product.name} added to cart!`, 'success');
    return result;
  };

  // ── Add to Wishlist — with confirmation ──
  const handleAddToWishlist = async (product) => {
    if (!isAuthenticated) {
      showNotification('Please login to add to favorites', 'error', { dedupeKey: 'login-required' });
      setSelectedProduct(null);
      window.dispatchEvent(new Event('openLoginModal'));
      return;
    }
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    const ok = await confirm({
      title: alreadyWishlisted ? 'Remove favorite?' : 'Add to favorites?',
      message: alreadyWishlisted
        ? `Remove "${product.name}" from Favorites?`
        : `Add "${product.name}" to Favorites?`,
      confirmLabel: alreadyWishlisted ? 'Remove' : 'Add',
      variant: alreadyWishlisted ? 'danger' : 'primary',
      icon: 'fa-star',
      rememberKey: shopActionConfirmRememberKey(),
      rememberLabel: "Don't show again",
    });
    if (!ok) return;
    toggleWishlistMutation(product);
    showNotification(
      alreadyWishlisted
        ? `${product.name} removed from wishlist!`
        : `${product.name} added to wishlist!`,
      'success'
    );
  };

  return (
    <div className="home-page">
      {expiredPromo && (
        <ExpiredPromoModal promo={expiredPromo} onClose={() => setExpiredPromo(null)} />
      )}

      <HeroCarousel slides={carouselSlides} />
      <LogoMarquee />
      <WeverseSection
        onProductClick={setSelectedProduct}
        activePromo={activePromo}
        highlightPromo={highlightPromo}
        productSalesMap={productSalesMap}
      />

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          onAddToWishlist={handleAddToWishlist}
          onRequireLogin={() => window.dispatchEvent(new Event('openLoginModal'))}
        />
      )}
    </div>
  );
};

export default Home;
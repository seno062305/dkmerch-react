import React, { useState, useEffect } from 'react';
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

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

function toUtcMs(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr ? timeStr.split(':').map(Number) : [0, 0];
  return Date.UTC(y, mo - 1, d, h, m, 0) - PH_OFFSET_MS;
}

function pickActivePromo(promos, nowMs) {
  if (!promos || promos.length === 0) return null;

  const valid = promos.filter(p => {
    if (!p.isActive) return false;
    const startMs = toUtcMs(p.startDate, p.startTime || '00:00');
    const endMs   = toUtcMs(p.endDate,   p.endTime   || '23:59');
    if (startMs && nowMs < startMs) return false;
    if (endMs   && nowMs > endMs)   return false;
    return true;
  });

  if (valid.length === 0) return null;

  return valid.sort((a, b) => {
    const aEnd = toUtcMs(a.endDate, a.endTime || '23:59') ?? Infinity;
    const bEnd = toUtcMs(b.endDate, b.endTime || '23:59') ?? Infinity;
    return aEnd - bEnd;
  })[0];
}

function isPromoExpired(promo, nowMs) {
  if (!promo) return false;
  const endMs = toUtcMs(promo.endDate, promo.endTime || '23:59');
  if (!endMs) return false;
  return nowMs > endMs;
}

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
        background: 'white',
        borderRadius: '20px',
        padding: '40px 32px',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        animation: 'slideUp 0.3s ease',
      }}>
        <div style={{ fontSize: '56px', marginBottom: '12px' }}>⏰</div>
        <h2 style={{
          fontSize: '22px', fontWeight: 800,
          color: '#1a1a1a', margin: '0 0 8px',
        }}>
          Promo Code Expired
        </h2>
        <p style={{ color: '#666', fontSize: '14px', margin: '0 0 20px', lineHeight: 1.6 }}>
          Sorry, the promo code{' '}
          <span style={{
            fontFamily: 'Courier New, monospace',
            fontWeight: 800, color: '#ec4899',
            background: '#fdf2f8', padding: '2px 8px',
            borderRadius: '4px', letterSpacing: '1px',
          }}>
            {promo?.code}
          </span>{' '}
          is no longer valid.
        </p>

        {promo?.endDate && (
          <div style={{
            background: '#fff9f9',
            border: '1.5px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '24px',
            fontSize: '13px',
            color: '#dc2626',
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
            width: '100%',
            padding: '13px',
            background: 'linear-gradient(135deg, #fc1268, #ec4899)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
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
  const [expiredPromo, setExpiredPromo] = useState(null); // for modal
  const { showNotification } = useNotification();
  const location = useLocation();

  const addToCartMutation      = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();
  const wishlistItems          = useWishlist();

  const allPromos = useQuery(api.promos.getAllPromos) || [];

  // Re-check every 10 seconds
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  const activePromo = pickActivePromo(allPromos, nowMs);

  // ── Handle ?promo=CODE in URL (from email Shop Now link) ──
  useEffect(() => {
    if (allPromos.length === 0) return;

    const params = new URLSearchParams(location.search);
    const urlPromoCode = params.get('promo');
    if (!urlPromoCode) return;

    // Find the matching promo
    const matchedPromo = allPromos.find(
      p => p.code.toUpperCase() === urlPromoCode.toUpperCase()
    );

    if (!matchedPromo) {
      // Code not found at all
      showNotification(`Promo code "${urlPromoCode}" not found.`, 'error');
      return;
    }

    // Check if expired
    if (isPromoExpired(matchedPromo, Date.now())) {
      setExpiredPromo(matchedPromo);
      // Still scroll to collections
      setTimeout(() => {
        const section = document.getElementById('collections');
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 600);
      return;
    }

    // Check if not yet started (upcoming)
    const startMs = toUtcMs(matchedPromo.startDate, matchedPromo.startTime || '00:00');
    if (startMs && Date.now() < startMs) {
      showNotification(`Promo "${urlPromoCode}" hasn't started yet. Stay tuned!`, 'info');
      return;
    }

    // Valid and active — set highlight
    setHighlightPromo(matchedPromo);

    // Scroll to collections section after short delay
    setTimeout(() => {
      const section = document.getElementById('collections');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 600);
  }, [allPromos, location.search]);

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  const staticSlides = [
    {
      image: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: 'Welcome to DKMerch',
      description: 'Your one-stop shop for authentic K-Pop merchandise',
      buttonText: 'Shop Now',
      buttonIcon: 'arrow-right',
    },
    {
      image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: 'New Album Releases',
      description: 'Pre-order the latest albums from your favorite groups',
      buttonText: 'Pre-Order Now',
      buttonIcon: 'shopping-bag',
    },
    {
      image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: 'Exclusive Photocards',
      description: 'Complete your collection with rare photocards',
      buttonText: 'Browse Collection',
      buttonIcon: 'images',
    },
  ];

  const promoSlide = activePromo
    ? {
        image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
        title: `🎉 ${activePromo.name} Promo`,
        description: `Use code: ${activePromo.code} · ${activePromo.discount}% off · Max ₱${activePromo.maxDiscount.toLocaleString()} discount`,
        buttonText: 'Shop Now',
        buttonIcon: 'tag',
        isPromo: true,
        promoCode:      activePromo.code,
        promoGroup:     activePromo.name,
        promoStartDate: activePromo.startDate,
        promoStartTime: activePromo.startTime,
        promoEndDate:   activePromo.endDate,
        promoEndTime:   activePromo.endTime,
        duration: 8000,
      }
    : null;

  const carouselSlides = promoSlide
    ? [promoSlide, ...staticSlides]
    : staticSlides;

  const handleAddToCart = (product) => {
    if (product.stock === 0 && !product.isPreOrder) {
      showNotification('Product is out of stock', 'error');
      return;
    }
    addToCartMutation(product);
    showNotification(`${product.name} added to cart!`, 'success');
  };

  const handleAddToWishlist = (product) => {
    const pid = product._id || product.id;
    toggleWishlistMutation(product);
    showNotification(
      isWishlisted(pid)
        ? `${product.name} removed from wishlist!`
        : `${product.name} added to wishlist!`,
      'success'
    );
  };

  return (
    <div className="home-page">
      {/* Expired Promo Modal */}
      {expiredPromo && (
        <ExpiredPromoModal
          promo={expiredPromo}
          onClose={() => setExpiredPromo(null)}
        />
      )}

      <HeroCarousel slides={carouselSlides} />
      <LogoMarquee />
      <WeverseSection
        onProductClick={setSelectedProduct}
        activePromo={activePromo}
        highlightPromo={highlightPromo}
      />

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={handleAddToCart}
          onAddToWishlist={handleAddToWishlist}
        />
      )}
    </div>
  );
};

export default Home;
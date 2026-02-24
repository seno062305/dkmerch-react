import React, { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
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

// Pick best promo:
// - isActive = admin kill switch only. If false, never show.
// - Time window is automatic — no manual toggling needed.
// - If multiple valid promos, show the one expiring soonest.
function pickActivePromo(promos, nowMs) {
  if (!promos || promos.length === 0) return null;

  const valid = promos.filter(p => {
    if (!p.isActive) return false; // admin disabled it

    const startMs = toUtcMs(p.startDate, p.startTime || '00:00');
    const endMs   = toUtcMs(p.endDate,   p.endTime   || '23:59');

    if (startMs && nowMs < startMs) return false; // not started yet
    if (endMs   && nowMs > endMs)   return false; // already expired

    return true;
  });

  if (valid.length === 0) return null;

  return valid.sort((a, b) => {
    const aEnd = toUtcMs(a.endDate, a.endTime || '23:59') ?? Infinity;
    const bEnd = toUtcMs(b.endDate, b.endTime || '23:59') ?? Infinity;
    return aEnd - bEnd;
  })[0];
}

const Home = () => {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const { showNotification } = useNotification();

  const addToCartMutation      = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();
  const wishlistItems          = useWishlist();

  // getAllPromos — so we can do real-time client-side time filtering
  const allPromos = useQuery(api.promos.getAllPromos) || [];

  // Re-check every 10 seconds — catches promo start/end automatically
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  const activePromo = pickActivePromo(allPromos, nowMs);

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
      <HeroCarousel slides={carouselSlides} />
      <LogoMarquee />
      <WeverseSection onProductClick={setSelectedProduct} activePromo={activePromo} />

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
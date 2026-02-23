import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import HeroCarousel from '../components/HeroCarousel';
import LogoMarquee from '../components/LogoMarquee';
import WeverseSection from '../components/WeverseSection';
import ProductModal from '../components/ProductModal';
import { useAddToCart } from '../context/cartUtils';
import { useToggleWishlist, useWishlist } from '../context/wishlistUtils';
import { useNotification } from '../context/NotificationContext';

const Home = () => {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const { showNotification } = useNotification();

  const addToCartMutation = useAddToCart();
  const toggleWishlistMutation = useToggleWishlist();
  const wishlistItems = useWishlist();

  // ── Fetch active promos from Convex ──
  const activePromos = useQuery(api.promos.getActivePromos) || [];
  const activePromo = activePromos[0] || null; // show the first active promo

  const isWishlisted = (productId) =>
    wishlistItems.some(item => item.productId === productId);

  // ── Static slides ──
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

  // ── Build promo slide if there's an active promo ──
  const promoSlide = activePromo
    ? {
        image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
        title: `🎉 ${activePromo.name}`,
        description: `Use code: ${activePromo.code} · ${activePromo.discount}% off · Max ₱${activePromo.maxDiscount.toLocaleString()} discount`,
        buttonText: 'Shop Now',
        buttonIcon: 'tag',
        isPromo: true,
        promoCode: activePromo.code,
        promoEndDate: activePromo.endDate,
        // Longer auto-slide duration for promo so users can read it
        duration: 8000,
      }
    : null;

  // Promo slide goes FIRST, then static slides
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
      <WeverseSection onProductClick={setSelectedProduct} />

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
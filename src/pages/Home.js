import React, { useState } from 'react';
import HeroCarousel from '../components/HeroCarousel';
import LogoMarquee from '../components/LogoMarquee';
import WeverseSection from '../components/WeverseSection';
import ProductModal from '../components/ProductModal';
import { addToCart } from '../utils/cartStorage';
import { toggleWishlist, isInWishlist } from '../utils/wishlistStorage';
import { useNotification } from '../context/NotificationContext';

const Home = () => {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const { showNotification } = useNotification();

  const carouselSlides = [
    {
      image: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: 'Welcome to DKMerch',
      description: 'Your one-stop shop for authentic K-Pop merchandise',
      buttonText: 'Shop Now',
      buttonIcon: 'arrow-right'
    },
    {
      image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: 'New Album Releases',
      description: 'Pre-order the latest albums from your favorite groups',
      buttonText: 'Pre-Order Now',
      buttonIcon: 'shopping-bag'
    },
    {
      image: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80',
      title: 'Exclusive Photocards',
      description: 'Complete your collection with rare photocards',
      buttonText: 'Browse Collection',
      buttonIcon: 'images'
    }
  ];

  const handleProductClick = (product) => {
    setSelectedProduct(product);
  };

  const handleCloseModal = () => {
    setSelectedProduct(null);
  };

  // ✅ CORRECT: Use addToCart from cartStorage
  const handleAddToCart = (product) => {
    try {
      if (product.stock === 0 && !product.isPreOrder) {
        showNotification('Product is out of stock', 'error');
        return;
      }

      addToCart(product.id);
      showNotification(`${product.name} added to cart!`, 'success');
      
      // Trigger storage event for other components
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error adding to cart:', error);
      showNotification('Error adding to cart', 'error');
    }
  };

  // ✅ CORRECT: Use toggleWishlist from wishlistStorage (stores IDs only)
  const handleAddToWishlist = (product) => {
    try {
      const wasInWishlist = isInWishlist(product.id);
      
      toggleWishlist(product.id);
      
      if (wasInWishlist) {
        showNotification(`${product.name} removed from wishlist!`, 'success');
      } else {
        showNotification(`${product.name} added to wishlist!`, 'success');
      }
      
      // Trigger storage event
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error updating wishlist:', error);
      showNotification('Error updating wishlist', 'error');
    }
  };

  return (
    <div className="home-page">
      <HeroCarousel slides={carouselSlides} />
      <LogoMarquee />
      <WeverseSection onProductClick={handleProductClick} />
      
      {/* Product Modal with Rating System */}
      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={handleCloseModal}
          onAddToCart={handleAddToCart}
          onAddToWishlist={handleAddToWishlist}
        />
      )}
    </div>
  );
};

export default Home;
import React from 'react';
import HeroCarousel from '../components/HeroCarousel';
import LogoMarquee from '../components/LogoMarquee';
import WeverseSection from '../components/WeverseSection';

const Home = ({ onProductClick, onAddToCart }) => {
  const heroSlides = [
    {
      image: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80",
      title: "Official K-Pop Merchandise Store",
      description: "Discover exclusive albums, photocards, lightsticks, and more from your favorite K-Pop groups. Pre-order the latest releases!",
      buttonText: "Shop Now",
      buttonIcon: "arrow-right"
    },
    {
      image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80",
      title: "Exclusive Album Collections",
      description: "Get limited edition albums with exclusive photocards, posters, and member benefits. Don't miss out on rare items!",
      buttonText: "View Albums",
      buttonIcon: "record-vinyl"
    },
    {
      image: "https://images.unsplash.com/photo-1578269174936-2709b6aeb913?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80",
      title: "Official Lightsticks",
      description: "Complete your fan experience with authentic lightsticks that connect to concerts. Bluetooth enabled with multiple light modes.",
      buttonText: "Explore Lightsticks",
      buttonIcon: "lightbulb"
    },
    {
      image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80",
      title: "K-Pop Fashion & Apparel",
      description: "Wear your favorite groups with pride. Official merch hoodies, t-shirts, and accessories from top K-Pop brands.",
      buttonText: "Shop Apparel",
      buttonIcon: "tshirt"
    }
  ];

  return (
    <div className="home-page">
      <HeroCarousel slides={heroSlides} />
      <LogoMarquee />
      <WeverseSection 
        onProductClick={onProductClick}
        onAddToCart={onAddToCart}
      />
    </div>
  );
};

export default Home;
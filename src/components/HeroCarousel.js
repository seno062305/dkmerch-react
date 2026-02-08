import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './HeroCarousel.css';

const HeroCarousel = ({ slides }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const totalSlides = slides.length;

  const goToSlide = useCallback((index) => {
    // Infinite loop logic
    let newIndex = index;
    if (index >= totalSlides) {
      newIndex = 0;
    } else if (index < 0) {
      newIndex = totalSlides - 1;
    }
    setCurrentSlide(newIndex);
  }, [totalSlides]);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const interval = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, [currentSlide, isAutoPlaying, goToSlide]);

  const handlePrev = () => {
    goToSlide(currentSlide - 1);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const handleNext = () => {
    goToSlide(currentSlide + 1);
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 10000);
  };

  const handleButtonClick = (slideIndex) => {
    // Navigate based on slide index
    if (slideIndex === 0) {
      // "Shop Now" - go to collections
      navigate('/collections');
    } else if (slideIndex === 1) {
      // "Pre-Order Now" - go to preorder
      navigate('/preorder');
    } else if (slideIndex === 2) {
      // "Browse Collection" - go to collections
      navigate('/collections');
    }

    // Smooth scroll to top after navigation
    setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }, 100);
  };

  return (
    <section className="hero-carousel">
      <div className="carousel-track" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
        {slides.map((slide, index) => (
          <div 
            key={index} 
            className={`carousel-slide ${index === currentSlide ? 'active' : ''}`}
          >
            <img src={slide.image} alt={slide.title} />
            <div className="carousel-content">
              <h1>{slide.title}</h1>
              <p>{slide.description}</p>
              <button 
                className="btn btn-primary"
                onClick={() => handleButtonClick(index)}
              >
                {slide.buttonText} <i className={`fas fa-${slide.buttonIcon}`}></i>
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="carousel-nav">
        <button className="carousel-btn prev-btn" onClick={handlePrev}>
          <i className="fas fa-chevron-left"></i>
        </button>
        <button className="carousel-btn next-btn" onClick={handleNext}>
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>

      <div className="carousel-dots">
        {slides.map((_, index) => (
          <button
            key={index}
            className={`carousel-dot ${index === currentSlide ? 'active' : ''}`}
            onClick={() => {
              goToSlide(index);
              setIsAutoPlaying(false);
              setTimeout(() => setIsAutoPlaying(true), 10000);
            }}
          ></button>
        ))}
      </div>
    </section>
  );
};

export default HeroCarousel;
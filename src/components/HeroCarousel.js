import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './HeroCarousel.css';

const DEFAULT_DURATION = 5000;   // 5s for regular slides
const PROMO_DURATION   = 8000;   // 8s for promo slide (longer so users can read)

const HeroCarousel = ({ slides }) => {
  const navigate = useNavigate();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const totalSlides = slides.length;

  const goToSlide = useCallback(
    (index) => {
      let newIndex = index;
      if (index >= totalSlides) newIndex = 0;
      else if (index < 0) newIndex = totalSlides - 1;
      setCurrentSlide(newIndex);
    },
    [totalSlides]
  );

  // ── Auto-play with per-slide duration ──
  useEffect(() => {
    if (!isAutoPlaying) return;
    const slide = slides[currentSlide];
    const duration = slide?.duration || DEFAULT_DURATION;

    const timer = setTimeout(() => {
      goToSlide(currentSlide + 1);
    }, duration);

    return () => clearTimeout(timer);
  }, [currentSlide, isAutoPlaying, goToSlide, slides]);

  const pauseThenResume = () => {
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 12000);
  };

  const handlePrev = () => { goToSlide(currentSlide - 1); pauseThenResume(); };
  const handleNext = () => { goToSlide(currentSlide + 1); pauseThenResume(); };

  const handleButtonClick = (slide, slideIndex) => {
    // If it's a promo slide, always go to collections
    if (slide.isPromo) {
      navigate('/collections');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      return;
    }

    // Offset index if promo slide is prepended
    const hasPromo = slides[0]?.isPromo;
    const staticIndex = hasPromo ? slideIndex - 1 : slideIndex;

    if (staticIndex === 0) {
      const el = document.getElementById('collections');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        navigate('/', { state: { scrollTo: 'collections' } });
      }
    } else if (staticIndex === 1) {
      navigate('/preorder');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    } else if (staticIndex === 2) {
      navigate('/collections');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }
  };

  return (
    <section className="hero-carousel">
      <div
        className="carousel-track"
        style={{ transform: `translateX(-${currentSlide * 100}%)` }}
      >
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`carousel-slide ${index === currentSlide ? 'active' : ''} ${slide.isPromo ? 'promo-slide' : ''}`}
          >
            <img src={slide.image} alt={slide.title} />

            {/* Promo overlay gradient */}
            {slide.isPromo && <div className="promo-overlay" />}

            <div className="carousel-content">
              {slide.isPromo && (
                <div className="promo-badge">🔥 LIMITED TIME PROMO</div>
              )}
              <h1>{slide.title}</h1>
              <p>{slide.description}</p>

              {/* Promo countdown / end date */}
              {slide.isPromo && slide.promoEndDate && (
                <p className="promo-valid-until">Valid until: {slide.promoEndDate}</p>
              )}

              {/* Promo code pill */}
              {slide.isPromo && slide.promoCode && (
                <div className="promo-code-pill">
                  <span>Code:</span>
                  <strong>{slide.promoCode}</strong>
                </div>
              )}

              <button
                className={`btn btn-primary ${slide.isPromo ? 'btn-promo' : ''}`}
                onClick={() => handleButtonClick(slide, index)}
              >
                {slide.buttonText} <i className={`fas fa-${slide.buttonIcon}`}></i>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Progress bar for current slide duration */}
      <div className="carousel-progress-bar" key={currentSlide}>
        <div
          className="carousel-progress-fill"
          style={{
            animationDuration: `${slides[currentSlide]?.duration || DEFAULT_DURATION}ms`,
            animationPlayState: isAutoPlaying ? 'running' : 'paused',
          }}
        />
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
        {slides.map((slide, index) => (
          <button
            key={index}
            className={`carousel-dot ${index === currentSlide ? 'active' : ''} ${slide.isPromo ? 'promo-dot' : ''}`}
            onClick={() => {
              goToSlide(index);
              pauseThenResume();
            }}
            title={slide.isPromo ? '🎉 Promo' : ''}
          />
        ))}
      </div>
    </section>
  );
};

export default HeroCarousel;
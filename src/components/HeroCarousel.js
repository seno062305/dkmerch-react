import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import LoginModal from './LoginModal';
import './HeroCarousel.css';

const DEFAULT_DURATION = 5000;
const PH_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

// "YYYY-MM-DD" + "HH:MM" → UTC ms (treating as PH time)
function toUtcMs(dateStr, timeStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr ? timeStr.split(':').map(Number) : [0, 0];
  return Date.UTC(y, mo - 1, d, h, m, 0) - PH_OFFSET_MS;
}

// "HH:MM" 24h → "12:00 PM"
function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// "YYYY-MM-DD" → "Feb 24, 2026"
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, mo, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[mo - 1]} ${d}, ${y}`;
}

// ── Countdown hook — anchored to Convex server time ──
const useCountdown = (endDateStr, endTimeStr, serverNowMs, fetchedAtMs) => {
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!endDateStr || serverNowMs == null) return;

    const endMs = toUtcMs(endDateStr, endTimeStr || '23:59');

    const calcTime = () => {
      // Estimate current server time: server anchor + elapsed wall clock time
      const nowMs = serverNowMs + (Date.now() - fetchedAtMs);
      const diff = endMs - nowMs;
      if (diff <= 0) return { expired: true };
      return {
        expired: false,
        days:    Math.floor(diff / 86400000),
        hours:   Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
      };
    };

    setTimeLeft(calcTime());
    const id = setInterval(() => setTimeLeft(calcTime()), 1000);
    return () => clearInterval(id);
  }, [endDateStr, endTimeStr, serverNowMs, fetchedAtMs]);

  return timeLeft;
};

// ── Countdown display ──
const CountdownTimer = ({ endDate, endTime, serverNowMs, fetchedAtMs }) => {
  const t = useCountdown(endDate, endTime, serverNowMs, fetchedAtMs);
  if (!t) return null;
  if (t.expired) return <div className="promo-countdown expired">⏰ Promo has ended</div>;
  return (
    <div className="promo-countdown">
      <span className="countdown-label">Ends in:</span>
      <div className="countdown-blocks">
        {t.days > 0 && (
          <div className="countdown-block">
            <span className="countdown-num">{String(t.days).padStart(2, '0')}</span>
            <span className="countdown-unit">d</span>
          </div>
        )}
        <div className="countdown-block">
          <span className="countdown-num">{String(t.hours).padStart(2, '0')}</span>
          <span className="countdown-unit">h</span>
        </div>
        <div className="countdown-block">
          <span className="countdown-num">{String(t.minutes).padStart(2, '00')}</span>
          <span className="countdown-unit">m</span>
        </div>
        <div className="countdown-block">
          <span className="countdown-num">{String(t.seconds).padStart(2, '00')}</span>
          <span className="countdown-unit">s</span>
        </div>
      </div>
    </div>
  );
};

// ── Schedule bar — shows "Starts: Feb 24 • 10:00 AM → Ends: Feb 24 • 5:00 PM" ──
const PromoScheduleBar = ({ startDate, startTime, endDate, endTime }) => {
  if (!startDate && !endDate) return null;

  const buildLabel = (dateStr, timeStr) => {
    if (!dateStr) return null;
    return `${fmtDate(dateStr)}${timeStr ? ` • ${fmt12(timeStr)}` : ''}`;
  };

  const startLabel = buildLabel(startDate, startTime);
  const endLabel   = buildLabel(endDate, endTime);

  return (
    <div className="promo-schedule-bar">
      <span className="promo-schedule-icon">📅</span>
      <div className="promo-schedule-text">
        {startLabel && <span><strong>Start:</strong> {startLabel}</span>}
        {startLabel && endLabel && <span className="promo-schedule-sep">→</span>}
        {endLabel   && <span><strong>End:</strong> {endLabel}</span>}
      </div>
    </div>
  );
};

// ── Floating hearts ──
const SHAPE_SETS = [
  [
    { cls: 'fs-heart fs-xl',  style: { top: '10%',  left: '7%',   animationDelay: '0s',    animationDuration: '7s'   } },
    { cls: 'fs-heart fs-md',  style: { top: '68%',  left: '4%',   animationDelay: '1.2s',  animationDuration: '9s'   } },
    { cls: 'fs-heart fs-lg',  style: { top: '18%',  left: '82%',  animationDelay: '0.5s',  animationDuration: '6s'   } },
    { cls: 'fs-heart fs-sm',  style: { top: '62%',  left: '88%',  animationDelay: '2s',    animationDuration: '8s'   } },
    { cls: 'fs-heart fs-sm',  style: { top: '82%',  left: '48%',  animationDelay: '0.8s',  animationDuration: '10s'  } },
    { cls: 'fs-heart fs-xs',  style: { top: '33%',  left: '93%',  animationDelay: '1.5s',  animationDuration: '7.5s' } },
    { cls: 'fs-heart fs-xs',  style: { top: '50%',  left: '2%',   animationDelay: '3s',    animationDuration: '5s'   } },
    { cls: 'fs-heart fs-md',  style: { top: '88%',  left: '72%',  animationDelay: '0.3s',  animationDuration: '11s'  } },
    { cls: 'fs-heart fs-sm',  style: { top: '40%',  left: '55%',  animationDelay: '2.5s',  animationDuration: '8.5s' } },
    { cls: 'fs-heart fs-xs',  style: { top: '75%',  left: '22%',  animationDelay: '1.8s',  animationDuration: '6.5s' } },
  ],
  [
    { cls: 'fs-heart fs-lg',  style: { top: '14%',  left: '5%',   animationDelay: '0.2s',  animationDuration: '8s'   } },
    { cls: 'fs-heart fs-xl',  style: { top: '72%',  left: '9%',   animationDelay: '1s',    animationDuration: '6.5s' } },
    { cls: 'fs-heart fs-sm',  style: { top: '8%',   left: '89%',  animationDelay: '0.7s',  animationDuration: '9s'   } },
    { cls: 'fs-heart fs-md',  style: { top: '58%',  left: '91%',  animationDelay: '2.5s',  animationDuration: '7s'   } },
    { cls: 'fs-heart fs-xs',  style: { top: '87%',  left: '53%',  animationDelay: '0.4s',  animationDuration: '11s'  } },
    { cls: 'fs-heart fs-sm',  style: { top: '28%',  left: '2%',   animationDelay: '1.8s',  animationDuration: '6s'   } },
    { cls: 'fs-heart fs-xs',  style: { top: '45%',  left: '76%',  animationDelay: '3.2s',  animationDuration: '8.5s' } },
    { cls: 'fs-heart fs-md',  style: { top: '63%',  left: '32%',  animationDelay: '0.6s',  animationDuration: '10s'  } },
    { cls: 'fs-heart fs-lg',  style: { top: '20%',  left: '60%',  animationDelay: '2s',    animationDuration: '7.5s' } },
    { cls: 'fs-heart fs-xs',  style: { top: '90%',  left: '18%',  animationDelay: '0.9s',  animationDuration: '9.5s' } },
  ],
  [
    { cls: 'fs-heart fs-sm',  style: { top: '7%',   left: '11%',  animationDelay: '0s',    animationDuration: '7s'   } },
    { cls: 'fs-heart fs-md',  style: { top: '70%',  left: '7%',   animationDelay: '1.4s',  animationDuration: '9s'   } },
    { cls: 'fs-heart fs-xl',  style: { top: '16%',  left: '84%',  animationDelay: '0.9s',  animationDuration: '6s'   } },
    { cls: 'fs-heart fs-sm',  style: { top: '67%',  left: '86%',  animationDelay: '2.2s',  animationDuration: '8s'   } },
    { cls: 'fs-heart fs-lg',  style: { top: '88%',  left: '42%',  animationDelay: '0.5s',  animationDuration: '10s'  } },
    { cls: 'fs-heart fs-xs',  style: { top: '38%',  left: '96%',  animationDelay: '3.5s',  animationDuration: '5.5s' } },
    { cls: 'fs-heart fs-md',  style: { top: '24%',  left: '50%',  animationDelay: '1.1s',  animationDuration: '12s'  } },
    { cls: 'fs-heart fs-xs',  style: { top: '55%',  left: '20%',  animationDelay: '0.3s',  animationDuration: '7.5s' } },
    { cls: 'fs-heart fs-sm',  style: { top: '80%',  left: '60%',  animationDelay: '2.8s',  animationDuration: '8s'   } },
    { cls: 'fs-heart fs-lg',  style: { top: '45%',  left: '35%',  animationDelay: '1.6s',  animationDuration: '6.5s' } },
  ],
];

const FloatingShapes = ({ slideIndex }) => {
  const shapes = SHAPE_SETS[slideIndex % SHAPE_SETS.length];
  return (
    <div className="floating-shapes" aria-hidden="true">
      {shapes.map((shape, i) => (
        <span key={i} className={`fs-shape ${shape.cls}`} style={shape.style} />
      ))}
    </div>
  );
};

// ── Main carousel ──
const HeroCarousel = ({ slides }) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  // Fetch server time once on mount — anti-cheat anchor
  const serverTimeData = useQuery(api.promos.getServerTime);
  const serverNowMs  = serverTimeData?.now ?? null;
  // Record wall-clock time when we received server time
  const [fetchedAtMs] = useState(() => Date.now());

  const [currentSlide, setCurrentSlide]   = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const totalSlides = slides.length;

  const goToSlide = useCallback((index) => {
    let i = index;
    if (i >= totalSlides) i = 0;
    else if (i < 0) i = totalSlides - 1;
    setCurrentSlide(i);
  }, [totalSlides]);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const duration = slides[currentSlide]?.duration || DEFAULT_DURATION;
    const timer = setTimeout(() => goToSlide(currentSlide + 1), duration);
    return () => clearTimeout(timer);
  }, [currentSlide, isAutoPlaying, goToSlide, slides]);

  const pauseThenResume = () => {
    setIsAutoPlaying(false);
    setTimeout(() => setIsAutoPlaying(true), 12000);
  };

  const handlePrev = () => { goToSlide(currentSlide - 1); pauseThenResume(); };
  const handleNext = () => { goToSlide(currentSlide + 1); pauseThenResume(); };

  const handleButtonClick = (slide, slideIndex) => {
    if (slide.isPromo) {
      if (!isAuthenticated) { setShowLoginModal(true); return; }
      navigate('/collections');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
      return;
    }
    const hasPromo = slides[0]?.isPromo;
    const staticIndex = hasPromo ? slideIndex - 1 : slideIndex;
    if (staticIndex === 0) {
      const el = document.getElementById('collections');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else navigate('/', { state: { scrollTo: 'collections' } });
    } else if (staticIndex === 1) {
      navigate('/preorder');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    } else {
      navigate('/collections');
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
    }
  };

  return (
    <>
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
              <FloatingShapes slideIndex={index} />

              <div className="carousel-content">
                {slide.isPromo && (
                  <div className="promo-badge">🔥 LIMITED TIME PROMO</div>
                )}

                {slide.isPromo && slide.promoGroup && (
                  <div className="promo-group-display">
                    <span className="promo-group-icon">🎉</span>
                    <span className="promo-group-name">{slide.promoGroup}</span>
                  </div>
                )}

                {!slide.isPromo && <h1>{slide.title}</h1>}
                <p>{slide.description}</p>

                {/* ── Date + time range bar ── */}
                {slide.isPromo && (
                  <PromoScheduleBar
                    startDate={slide.promoStartDate}
                    startTime={slide.promoStartTime}
                    endDate={slide.promoEndDate}
                    endTime={slide.promoEndTime}
                  />
                )}

                {/* ── Accurate countdown (server-time anchored) ── */}
                {slide.isPromo && slide.promoEndDate && serverNowMs != null && (
                  <CountdownTimer
                    endDate={slide.promoEndDate}
                    endTime={slide.promoEndTime}
                    serverNowMs={serverNowMs}
                    fetchedAtMs={fetchedAtMs}
                  />
                )}

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
                  {slide.isPromo && !isAuthenticated
                    ? <><i className="fas fa-lock"></i> Login to Redeem</>
                    : <>{slide.buttonText} <i className={`fas fa-${slide.buttonIcon}`}></i></>
                  }
                </button>

                {slide.isPromo && !isAuthenticated && (
                  <p className="promo-login-hint">
                    <i className="fas fa-info-circle"></i> Login required to use this promo
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

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
              onClick={() => { goToSlide(index); pauseThenResume(); }}
            />
          ))}
        </div>
      </section>

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default HeroCarousel;
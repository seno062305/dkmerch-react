import React, { useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './LogoMarquee.css';

const LogoMarquee = () => {
  const navigate = useNavigate();
  const trackRef = useRef(null);

  const posX = useRef(0);           // current translateX (negative = moved left)
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);
  const dragDistance = useRef(0);
  const isPaused = useRef(false);
  const rafId = useRef(null);
  const itemSetWidth = useRef(0);   // width of ONE set of items

  const SPEED = 0.6; // px per frame — adjust for faster/slower

  const groups = [
    { name: 'BTS',        logo: '/images/BTS_logo.png' },
    { name: 'BLACKPINK',  logo: '/images/bp_logo.png' },
    { name: 'TWICE',      logo: '/images/TWICE-Logo.png' },
    { name: 'SEVENTEEN',  logo: '/images/Seventeen-logo.png' },
    { name: 'STRAY KIDS', logo: '/images/straykids.jpg' },
    { name: 'EXO',        logo: '/images/Exo-Logo.png' },
    { name: 'RED VELVET', logo: '/images/redvelvet.jpg' },
    { name: 'NEWJEANS',   logo: '/images/newjeans.jpg' },
  ];

  // 3 copies — left copy | center (visible) | right copy
  const tripled = [...groups, ...groups, ...groups];

  const animate = useCallback(() => {
    if (!trackRef.current) return;

    const setW = itemSetWidth.current;

    if (!isPaused.current) {
      posX.current -= SPEED;
    }

    // Infinite wrap: if scrolled past one full set, jump back by one set
    if (setW > 0) {
      if (posX.current <= -setW * 2) {
        posX.current += setW;
      }
      if (posX.current >= -setW) {
        // if dragged too far right, wrap forward
        posX.current -= setW;
      }
    }

    trackRef.current.style.transform = `translateX(${posX.current}px)`;
    rafId.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    // Wait for items to render, then measure one set width
    const measure = () => {
      if (!trackRef.current) return;
      const totalW = trackRef.current.scrollWidth;
      itemSetWidth.current = totalW / 3; // 3 copies
      // Start position: show the middle set
      posX.current = -itemSetWidth.current;
      rafId.current = requestAnimationFrame(animate);
    };

    const t = setTimeout(measure, 100);
    return () => {
      clearTimeout(t);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [animate]);

  // ── Mouse ──
  const onMouseDown = (e) => {
    isDragging.current = true;
    dragDistance.current = 0;
    lastMouseX.current = e.clientX;
    isPaused.current = true;
    e.currentTarget.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const onMouseMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouseX.current;
    dragDistance.current += Math.abs(dx);
    posX.current += dx;
    lastMouseX.current = e.clientX;
  };

  const onMouseUp = (e) => {
    isDragging.current = false;
    isPaused.current = false;
    e.currentTarget.style.cursor = 'grab';
  };

  const onMouseLeave = (e) => {
    if (isDragging.current) {
      isDragging.current = false;
      isPaused.current = false;
      e.currentTarget.style.cursor = 'grab';
    }
  };

  // ── Touch ──
  const onTouchStart = (e) => {
    isDragging.current = true;
    dragDistance.current = 0;
    lastMouseX.current = e.touches[0].clientX;
    isPaused.current = true;
  };

  const onTouchMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - lastMouseX.current;
    dragDistance.current += Math.abs(dx);
    posX.current += dx;
    lastMouseX.current = e.touches[0].clientX;
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    isPaused.current = false;
  };

  const handleGroupClick = (groupName) => {
    if (dragDistance.current > 5) return;
    navigate('/collections', {
      state: { filterGroup: groupName, scrollToTop: true }
    });
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  };

  return (
    <section className="logo-marquee-section">
      <div className="container">
        <h2 className="logo-marquee-title">
          Featured <span>K-Pop Groups</span>
        </h2>
      </div>

      <div
        className="marquee-container"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="marquee-gradient-left" />
        <div className="marquee-gradient-right" />

        <div ref={trackRef} className="marquee-track">
          {tripled.map((group, index) => (
            <div
              key={index}
              className="logo-item"
              role="button"
              tabIndex={0}
              onClick={() => handleGroupClick(group.name)}
              onKeyDown={(e) => e.key === 'Enter' && handleGroupClick(group.name)}
            >
              <div className="logo-circle">
                <img src={group.logo} alt={group.name} draggable={false} />
              </div>
              <div className="logo-text">{group.name}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default LogoMarquee;
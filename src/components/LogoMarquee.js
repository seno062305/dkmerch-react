import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './LogoMarquee.css';

const FALLBACK_GROUPS = [
  { name: 'BTS', logo: '/images/BTS_logo.png' },
  { name: 'BLACKPINK', logo: '/images/BLACKPINK-Logo-Font-1.webp' },
  { name: 'TWICE', logo: '/images/TWICE-Logo.png' },
  { name: 'SEVENTEEN', logo: '/images/Seventeen-logo.png' },
  { name: 'STRAY KIDS', logo: '/images/straykids.jpg' },
  { name: 'EXO', logo: '/images/Exo-Logo.png' },
  { name: 'RED VELVET', logo: '/images/redvelvet.jpg' },
  { name: 'NEWJEANS', logo: '/images/newjeans.jpg' },
];

const LogoMarquee = () => {
  const navigate = useNavigate();
  const convex = useConvex();
  const trackRef = useRef(null);
  const [groups, setGroups] = useState(FALLBACK_GROUPS);

  const posX = useRef(0);
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);
  const dragDistance = useRef(0);
  const isPaused = useRef(false);
  const rafId = useRef(null);
  const itemSetWidth = useRef(0);

  const SPEED = 0.6;

  // Safe load — never crash the homepage if a Convex function is mid-deploy
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await convex.query(api.catalogOptions.listForMarquee, {});
        if (!alive) return;
        if (Array.isArray(rows) && rows.length) {
          setGroups(rows);
          return;
        }
      } catch {
        /* try list() fallback below */
      }
      try {
        const rows = await convex.query(api.catalogOptions.list, { type: 'kpopGroup' });
        if (!alive) return;
        const mapped = (Array.isArray(rows) ? rows : [])
          .filter((g) => g?.image)
          .map((g) => ({ name: g.value || g.label, logo: g.image }));
        if (mapped.length) setGroups(mapped);
      } catch {
        if (alive) setGroups(FALLBACK_GROUPS);
      }
    };
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [convex]);

  const tripled = useMemo(() => [...groups, ...groups, ...groups], [groups]);

  const animate = useCallback(() => {
    if (!trackRef.current) return;

    const setW = itemSetWidth.current;

    if (!isPaused.current) {
      posX.current -= SPEED;
    }

    if (setW > 0) {
      if (posX.current <= -setW * 2) {
        posX.current += setW;
      }
      if (posX.current >= -setW) {
        posX.current -= setW;
      }
    }

    trackRef.current.style.transform = `translateX(${posX.current}px)`;
    rafId.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    const measure = () => {
      if (!trackRef.current) return;
      const totalW = trackRef.current.scrollWidth;
      itemSetWidth.current = totalW / 3;
      posX.current = -itemSetWidth.current;
      rafId.current = requestAnimationFrame(animate);
    };

    const t = setTimeout(measure, 100);
    return () => {
      clearTimeout(t);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [animate, groups]);

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
      state: { filterGroup: groupName, scrollToTop: true },
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
              key={`${group.name}-${index}`}
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

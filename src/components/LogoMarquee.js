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
  const setRef = useRef(null);
  const [groups, setGroups] = useState(FALLBACK_GROUPS);

  const posX = useRef(0);
  const isDragging = useRef(false);
  const lastMouseX = useRef(0);
  const dragDistance = useRef(0);
  const isPaused = useRef(false);
  const rafId = useRef(null);
  const setWidth = useRef(0);

  const SPEED = 0.55;

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
        /* fallback below */
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

  // Enough copies that the viewport is always filled
  const copies = useMemo(() => {
    const n = Math.max(3, Math.ceil(8 / Math.max(groups.length, 1)));
    return Array.from({ length: n }, (_, i) => i);
  }, [groups.length]);

  const measure = useCallback(() => {
    const el = setRef.current;
    if (!el) return 0;
    // offsetWidth includes the trailing gap (padding-right on .marquee-set)
    return el.offsetWidth || 0;
  }, []);

  const wrap = useCallback((x) => {
    const w = setWidth.current;
    if (w <= 0) return x;
    // Normalize into [-w, 0)
    x = ((x % w) + w) % w;
    return x === 0 ? 0 : x - w;
  }, []);

  const applyTransform = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${posX.current}px, 0, 0)`;
    }
  }, []);

  const animate = useCallback(() => {
    if (!isPaused.current && setWidth.current > 0) {
      posX.current -= SPEED;
      if (posX.current <= -setWidth.current) {
        posX.current += setWidth.current;
      }
    }
    applyTransform();
    rafId.current = requestAnimationFrame(animate);
  }, [applyTransform]);

  useEffect(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    posX.current = 0;

    const refresh = () => {
      const w = measure();
      if (w > 0) {
        setWidth.current = w;
        posX.current = wrap(posX.current);
        applyTransform();
      }
    };

    refresh();
    const t1 = setTimeout(refresh, 80);
    const t2 = setTimeout(refresh, 400);
    const t3 = setTimeout(refresh, 1000);

    rafId.current = requestAnimationFrame(animate);

    window.addEventListener('resize', refresh);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', refresh);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [animate, applyTransform, groups, measure, wrap]);

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
    if (setWidth.current > 0) {
      while (posX.current <= -setWidth.current) posX.current += setWidth.current;
      while (posX.current > 0) posX.current -= setWidth.current;
    }
    lastMouseX.current = e.clientX;
    applyTransform();
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
    if (setWidth.current > 0) {
      while (posX.current <= -setWidth.current) posX.current += setWidth.current;
      while (posX.current > 0) posX.current -= setWidth.current;
    }
    lastMouseX.current = e.touches[0].clientX;
    applyTransform();
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

  const onImgLoad = () => {
    const w = measure();
    if (w > 0) setWidth.current = w;
  };

  const renderSet = (copyIndex, isMeasureRef) => (
    <div
      key={`set-${copyIndex}`}
      className="marquee-set"
      ref={isMeasureRef ? setRef : undefined}
      aria-hidden={copyIndex > 0 ? true : undefined}
    >
      {groups.map((group) => (
        <div
          key={`${copyIndex}-${group.name}`}
          className="logo-item"
          role="button"
          tabIndex={copyIndex === 0 ? 0 : -1}
          onClick={() => handleGroupClick(group.name)}
          onKeyDown={(e) => e.key === 'Enter' && handleGroupClick(group.name)}
        >
          <div className="logo-circle">
            <img
              src={group.logo}
              alt={group.name}
              draggable={false}
              onLoad={onImgLoad}
            />
          </div>
          <div className="logo-text">{group.name}</div>
        </div>
      ))}
    </div>
  );

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
          {copies.map((i) => renderSet(i, i === 0))}
        </div>
      </div>
    </section>
  );
};

export default LogoMarquee;

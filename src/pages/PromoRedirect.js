import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

const PH_OFFSET_MS = 8 * 60 * 60 * 1000;

function toUtcMs(dateStr, timeStr) {
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m] = timeStr ? timeStr.split(':').map(Number) : [0, 0];
  return Date.UTC(y, mo - 1, d, h, m, 0) - PH_OFFSET_MS;
}

function fmtDate(d) {
  if (!d) return '';
  const [y, mo, day] = d.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[mo - 1]} ${day}, ${y}`;
}

function fmt12(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const infoBox = (bg, border, color) => ({
  background: bg, border: `1.5px solid ${border}`, borderRadius: '10px',
  padding: '12px 16px', marginBottom: '12px', fontSize: '13px', color,
});

const PromoRedirect = () => {
  const { code } = useParams();
  const navigate = useNavigate();
  const allPromos = useQuery(api.promos.getAllPromos);
  const [status, setStatus] = useState('loading');
  const [promo, setPromo] = useState(null);

  useEffect(() => {
    if (allPromos === undefined) return;

    const now = Date.now();
    const matched = allPromos.find(
      p => p.code.toUpperCase() === (code || '').toUpperCase()
    );

    if (!matched || !matched.isActive) {
      navigate('/', { replace: true });
      return;
    }

    const startMs = toUtcMs(matched.startDate, matched.startTime || '00:00');
    const endMs   = toUtcMs(matched.endDate,   matched.endTime   || '23:59');

    setPromo(matched);

    if (endMs && now > endMs) {
      setStatus('expired');
    } else if (startMs && now < startMs) {
      setStatus('upcoming');
    } else {
      // Valid — redirect to homepage with promo
      navigate(`/?promo=${matched.code}`, { replace: true });
    }
  }, [allPromos, code, navigate]);

  // Loading
  if (status === 'loading') {
    return (
      <div style={s.page}>
        <div style={s.miniHeader}>
          <span style={s.logo}>🎵 DKMerch</span>
          <button style={s.backBtn} onClick={() => navigate('/')}>← Back to Shop</button>
        </div>
        <div style={s.center}>
          <p style={{ color: '#888', fontSize: '16px' }}>⏳ Checking promo…</p>
        </div>
      </div>
    );
  }

  // Upcoming
  if (status === 'upcoming') {
    return (
      <div style={s.page}>
        <div style={s.miniHeader}>
          <span style={s.logo}>🎵 DKMerch</span>
          <button style={s.backBtn} onClick={() => navigate('/')}>← Back to Shop</button>
        </div>
        <div style={s.center}>
          <div style={s.card}>
            <div style={{ ...s.cardHeader, background: 'linear-gradient(135deg, #7c3aed, #ec4899)' }}>
              <div style={{ fontSize: '52px', marginBottom: '10px' }}>🗓️</div>
              <h1 style={s.cardTitle}>Coming Soon!</h1>
              <p style={s.cardSub}>DKMerch K-Pop Paradise</p>
            </div>
            <div style={s.cardBody}>
              <p style={s.text}>
                The promo <span style={s.badge}>{promo?.code}</span> for{' '}
                <strong>{promo?.name}</strong> fans hasn't started yet!
              </p>
              {promo?.startDate && (
                <div style={infoBox('#fef9c3', '#fde68a', '#b45309')}>
                  🗓️ Starts: <strong>{fmtDate(promo.startDate)}{promo.startTime ? ` • ${fmt12(promo.startTime)} PH` : ''}</strong>
                </div>
              )}
              <p style={s.hint}>Come back when it starts and use this code at checkout! 💜</p>
              <button style={s.btnPrimary} onClick={() => navigate('/')}>🛍️ Browse Shop</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Expired
  return (
    <div style={s.page}>
      <div style={s.miniHeader}>
        <span style={s.logo}>🎵 DKMerch</span>
        <button style={s.backBtn} onClick={() => navigate('/')}>← Back to Shop</button>
      </div>
      <div style={s.center}>
        <div style={s.card}>
          <div style={{ ...s.cardHeader, background: 'linear-gradient(135deg, #fc1268, #9c27b0)' }}>
            <div style={{ fontSize: '52px', marginBottom: '10px' }}>⏰</div>
            <h1 style={s.cardTitle}>Promo Expired</h1>
            <p style={s.cardSub}>DKMerch K-Pop Paradise</p>
          </div>
          <div style={s.cardBody}>
            <p style={s.text}>
              Sorry! The code <span style={s.badge}>{promo?.code}</span> for{' '}
              <strong>{promo?.name}</strong> fans has already expired.
            </p>
            {promo?.endDate && (
              <div style={infoBox('#fff9f9', '#fecaca', '#dc2626')}>
                ❌ Expired: <strong>{fmtDate(promo.endDate)}{promo.endTime ? ` • ${fmt12(promo.endTime)} PH` : ''}</strong>
              </div>
            )}
            <p style={s.hint}>Check your inbox for newer promos from DKMerch! 💌</p>
            <button style={s.btnPrimary} onClick={() => navigate('/')}>🛍️ Browse Products</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const s = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(135deg, #fdf2f8 0%, #f5f3ff 50%, #fce7f3 100%)',
    fontFamily: "'Segoe UI', sans-serif",
  },
  miniHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 24px', background: 'white',
    boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
  },
  logo: { fontSize: '18px', fontWeight: 800, color: '#fc1268' },
  backBtn: {
    padding: '7px 16px', background: 'none', border: '1.5px solid #e5e7eb',
    borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#555', cursor: 'pointer',
  },
  center: {
    flex: 1, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '32px 20px',
  },
  card: {
    background: 'white', borderRadius: '20px', maxWidth: '420px', width: '100%',
    overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', textAlign: 'center',
  },
  cardHeader: {
    padding: '36px 32px 28px', textAlign: 'center',
  },
  cardTitle: { color: 'white', margin: 0, fontSize: '24px', fontWeight: 900 },
  cardSub: { color: 'rgba(255,255,255,0.85)', margin: '6px 0 0', fontSize: '13px' },
  cardBody: { padding: '28px 28px 32px' },
  text: { color: '#555', fontSize: '14px', lineHeight: 1.7, margin: '0 0 16px' },
  hint: { color: '#aaa', fontSize: '13px', margin: '12px 0 20px', lineHeight: 1.6 },
  badge: {
    fontFamily: 'Courier New, monospace', fontWeight: 800, color: '#ec4899',
    background: '#fdf2f8', padding: '2px 8px', borderRadius: '4px', letterSpacing: '1px',
  },
  btnPrimary: {
    width: '100%', padding: '13px',
    background: 'linear-gradient(135deg, #fc1268, #ec4899)',
    color: 'white', border: 'none', borderRadius: '10px',
    fontSize: '15px', fontWeight: 700, cursor: 'pointer', marginBottom: '10px', display: 'block',
  },
  btnSecondary: {
    width: '100%', padding: '11px', background: 'white', color: '#555',
    border: '1.5px solid #e5e7eb', borderRadius: '10px',
    fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'block',
  },
};

export default PromoRedirect;
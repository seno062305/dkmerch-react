import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import './PointsClaimModal.css';

const SESSION_SKIP_KEY = 'dk_points_claim_later';

const PointsClaimModal = () => {
  const { user, isAuthenticated, role } = useAuth();
  const { showNotification } = useNotification();
  const claimPoints = useMutation(api.rewards.claimOrderPoints);
  const pending = useQuery(
    api.rewards.getPendingPointsClaims,
    isAuthenticated && user?.email && role === 'user'
      ? { email: user.email }
      : 'skip'
  );

  const [open, setOpen] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [skipped, setSkipped] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_SKIP_KEY) === '1';
    } catch {
      return false;
    }
  });

  const claim = useMemo(() => {
    if (!pending?.length) return null;
    // Prefer order from URL ?claimPoints=
    try {
      const wanted = new URLSearchParams(window.location.search).get('claimPoints');
      if (wanted) {
        const match = pending.find((p) => p.orderId === wanted);
        if (match) return match;
      }
    } catch { /* ignore */ }
    return pending[0];
  }, [pending]);

  useEffect(() => {
    if (!isAuthenticated || role !== 'user' || skipped) {
      setOpen(false);
      return;
    }
    setOpen(!!claim);
  }, [isAuthenticated, role, skipped, claim]);

  if (!open || !claim) return null;

  const onLater = () => {
    try { sessionStorage.setItem(SESSION_SKIP_KEY, '1'); } catch { /* ignore */ }
    setSkipped(true);
    setOpen(false);
  };

  const onClaim = async () => {
    if (claiming || !user?.email) return;
    setClaiming(true);
    try {
      const result = await claimPoints({
        email: user.email,
        userName: user.name || user.username || 'Customer',
        orderId: claim.orderId,
      });
      if (result?.success) {
        showNotification(`Claimed ${result.pointsAwarded || claim.points} pts! ⭐`, 'success');
        try {
          const url = new URL(window.location.href);
          if (url.searchParams.has('claimPoints')) {
            url.searchParams.delete('claimPoints');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          }
        } catch { /* ignore */ }
        setOpen(false);
      } else if (result?.reason === 'already_awarded') {
        showNotification('Points already claimed for this order.', 'info');
        setOpen(false);
      } else {
        showNotification('Could not claim points. Please try again.', 'error');
      }
    } catch {
      showNotification('Could not claim points. Please try again.', 'error');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="pcm-overlay" role="dialog" aria-modal="true">
      <div className="pcm-modal">
        <button type="button" className="pcm-close" onClick={onLater} aria-label="Close">
          <i className="fas fa-times" />
        </button>
        <div className="pcm-icon">⭐</div>
        <h2>You earned {claim.points} pts!</h2>
        <p className="pcm-msg">
          Order <strong>#{claim.orderId.slice(-8).toUpperCase()}</strong> was delivered.
          Claim your loyalty points now.
        </p>
        <div className="pcm-pts">+{claim.points} pts</div>
        <button
          type="button"
          className="pcm-claim"
          onClick={onClaim}
          disabled={claiming}
        >
          {claiming ? 'Claiming…' : 'Claim'}
        </button>
        <button type="button" className="pcm-later" onClick={onLater}>
          Maybe later
        </button>
      </div>
    </div>
  );
};

export default PointsClaimModal;

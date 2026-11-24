import React, { useState } from 'react';
import { useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import './OversellChoiceCard.css';

/**
 * Shown when payment succeeded but stock was already taken (oversell race).
 * Customer picks: refund now OR reserve next restock (2–3 weeks).
 */
const OversellChoiceCard = ({ order, onDone, compact = false }) => {
  const { user } = useAuth();
  const { showNotification } = useNotification();
  const chooseReserve = useMutation(api.payments.chooseOversellReserve);
  const chooseRefund = useAction(api.payments.chooseOversellRefund);
  const [busy, setBusy] = useState('');

  if (!order) return null;
  const status = String(order.oversellStatus || '');
  const eta = order.restockEtaLabel || '2–3 weeks';

  if (status === 'reserved' || status === 'awaiting_restock') {
    return (
      <div className={`osc-card osc-card--reserved ${compact ? 'osc-card--compact' : ''}`}>
        <div className="osc-icon"><i className="fas fa-bookmark"></i></div>
        <div className="osc-body">
          <h3>Reserved for you</h3>
          <p>
            Next stock is expected in about <strong>{eta}</strong>.
            You’re locked in line — this item won’t go to another buyer when it arrives.
          </p>
        </div>
      </div>
    );
  }

  if (status !== 'choice_needed') return null;

  const runReserve = async () => {
    setBusy('reserve');
    try {
      const res = await chooseReserve({
        orderId: order.orderId,
        email: user?.email || order.email || undefined,
      });
      if (res?.success) {
        showNotification('Item reserved — next stock is yours.', 'success');
        onDone?.('reserved');
      } else {
        showNotification(res?.message || 'Could not reserve.', 'error');
      }
    } catch (err) {
      showNotification(err?.message || 'Could not reserve.', 'error');
    } finally {
      setBusy('');
    }
  };

  const runRefund = async () => {
    setBusy('refund');
    try {
      const res = await chooseRefund({
        orderId: order.orderId,
        email: user?.email || order.email || undefined,
      });
      if (res?.success) {
        showNotification('Refund sent via PayMongo.', 'success');
        onDone?.('refunded');
      } else {
        showNotification(res?.message || 'Refund failed.', 'error');
      }
    } catch (err) {
      showNotification(err?.message || 'Refund failed.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className={`osc-card osc-card--choice ${compact ? 'osc-card--compact' : ''}`}>
      <div className="osc-icon osc-icon--warn"><i className="fas fa-exclamation-triangle"></i></div>
      <div className="osc-body">
        <h3>Item sold out after payment</h3>
        <p>
          Another customer completed payment first. Your payment went through, but there’s no stock left right now.
        </p>
        <p className="osc-eta">
          <i className="fas fa-clock"></i> Expected restock: <strong>{eta}</strong>
        </p>
        <div className="osc-actions">
          <button
            type="button"
            className="osc-btn osc-btn--reserve"
            disabled={!!busy}
            onClick={runReserve}
          >
            <i className={`fas ${busy === 'reserve' ? 'fa-spinner fa-spin' : 'fa-bookmark'}`}></i>
            {busy === 'reserve' ? 'Reserving…' : 'Reserve next stock'}
          </button>
          <button
            type="button"
            className="osc-btn osc-btn--refund"
            disabled={!!busy}
            onClick={runRefund}
          >
            <i className={`fas ${busy === 'refund' ? 'fa-spinner fa-spin' : 'fa-undo'}`}></i>
            {busy === 'refund' ? 'Refunding…' : 'Refund my payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default OversellChoiceCard;

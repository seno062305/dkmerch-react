import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useQuery, useAction, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useUserOrders, useOrdersByEmail } from '../utils/orderStorage';
import { useProducts, usePreOrderProducts } from '../utils/productStorage';
import { isLbcOrder, openLbcTracker, LBC_TRACK_URL } from '../utils/deliveryUtils';
import { useNotification } from '../context/NotificationContext';
import DeliveryChatPanel from '../components/DeliveryChatPanel';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';
import { createPortal } from 'react-dom';
import { formatOrderShortId } from '../utils/orderId';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { getOverlayRoot } from '../utils/scrollLock';
import { validateImageFile, IMAGE_ACCEPT_NO_GIF } from '../utils/imageUpload';
import './TrackOrder.css';

/** Cancel allowed on Active orders until rider pickup / out for delivery. */
const canCustomerCancelOrder = (order) => {
  if (!order) return false;
  const status = String(order.orderStatus || order.status || '').toLowerCase().replace(/\s+/g, '_');
  if (order.cancelRequestStatus === 'requested') return false;
  if (['cancelled', 'delivered', 'completed', 'out_for_delivery', 'shipped', 'in_transit'].includes(status)) {
    return false;
  }
  if (order.riderId || order.riderInfo) return false;
  return true;
};

const LbcTrackPanel = ({ compact = false }) => (
  <div className={`lbc-track-panel${compact ? ' lbc-track-panel--compact' : ''}`}>
    <div className="lbc-track-panel-icon"><i className="fas fa-truck"></i></div>
    <div className="lbc-track-panel-body">
      <strong>LBC Express tracking</strong>
      <div className="lbc-track-panel-actions">
        <button type="button" className="lbc-track-btn" onClick={openLbcTracker}>
          <i className="fas fa-external-link-alt"></i> Open LBC Tracker
        </button>
        <a className="lbc-track-link" href={LBC_TRACK_URL} target="_blank" rel="noreferrer">
          lbcexpress.com/track
        </a>
      </div>
    </div>
  </div>
);

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return 'unknown';
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  return `${Math.floor(diff / 60)}m ago`;
};

const getRefundWindow = (order) => {
  const deliveredAt = order.deliveryConfirmedAt;
  if (!deliveredAt) return { canRefund: false, hoursLeft: 0, expired: false };
  const deliveredMs = new Date(deliveredAt).getTime();
  const deadlineMs  = deliveredMs + 24 * 60 * 60 * 1000;
  const nowMs       = Date.now();
  const msLeft      = deadlineMs - nowMs;
  if (msLeft <= 0) return { canRefund: false, hoursLeft: 0, expired: true };
  return { canRefund: true, hoursLeft: Math.floor(msLeft / (1000 * 60 * 60)), minsLeft: Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60)), expired: false };
};

const CANCEL_REASON_OPTIONS = [
  { id: 'mistake', label: 'Ordered by mistake' },
  { id: 'changed_mind', label: 'Changed my mind' },
  { id: 'wrong_item', label: 'Wrong item / wrong variant' },
  { id: 'found_cheaper', label: 'Found a better option elsewhere' },
  { id: 'payment_issue', label: 'Payment / checkout issue' },
  { id: 'others', label: 'Others' },
];

// ─── CANCEL ORDER MODAL (before admin confirms — request for review) ─────────
const CancelOrderModal = ({ order, userEmail, onClose, onSuccess }) => {
  useCloseOnHistoryBack(true, onClose, 'cancelOrderModal');
  const requestCustomerCancel = useMutation(api.orders.requestCustomerCancel);
  const paid = String(order.paymentStatus || '').toLowerCase() === 'paid';
  const amount = Number(order.finalTotal ?? order.total ?? 0);
  const pmRaw = String(order.paymentMethod || '').toLowerCase();
  const defaultMethod = pmRaw.includes('maya') ? 'maya' : pmRaw.includes('gcash') ? 'gcash' : '';

  const [reasonId, setReasonId] = useState('');
  const [otherNote, setOtherNote] = useState('');
  const [phone, setPhone] = useState(String(order.phone || '').replace(/\D/g, '').slice(0, 11));
  const [refundMethod, setRefundMethod] = useState(defaultMethod);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useBodyScrollLock(true);

  const handleSubmit = async () => {
    if (!reasonId) {
      setError('Please select a reason for cancelling.');
      return;
    }
    let note = CANCEL_REASON_OPTIONS.find((o) => o.id === reasonId)?.label || '';
    if (reasonId === 'others') {
      const custom = otherNote.trim();
      if (custom.length < 5) {
        setError('Please type your reason (min 5 characters).');
        return;
      }
      note = custom;
    }
    if (paid) {
      if (!refundMethod) { setError('Please select GCash or Maya (how you paid).'); return; }
      if (!phone.trim()) { setError('Please enter your phone number.'); return; }
      if (!/^09\d{9}$/.test(phone.replace(/\s/g, ''))) {
        setError('Enter a valid PH mobile number (09XXXXXXXXX).');
        return;
      }
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await requestCustomerCancel({
        orderId: order.orderId,
        email: userEmail,
        reason: note,
        phone: phone.replace(/\s/g, '') || undefined,
        refundMethod: paid ? refundMethod : undefined,
      });
      if (!result?.success) {
        setError(result?.error || 'Could not submit cancel request.');
        setSubmitting(false);
        return;
      }
      onSuccess(result);
    } catch (err) {
      setError(err?.data || err?.message || 'Request failed. Please try again.');
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="refund-modal-overlay" onClick={onClose}>
      <div className="refund-modal cancel-order-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="refund-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        <div className="refund-modal-header">
          <div className="refund-modal-icon" style={{ background: '#fee2e2' }}>
            <i className="fas fa-ban" style={{ color: '#dc2626' }}></i>
          </div>
          <div>
            <h3>Request Cancel</h3>
            <p>
              Order #{formatOrderShortId(order)}
              {paid ? <> · <strong>₱{amount.toLocaleString('en-PH')}</strong></> : null}
            </p>
          </div>
        </div>
        <div className="refund-modal-body">
          <p className="cancel-order-note">
            Cancel is only available before admin confirms your order. Admin will review your reason
            {paid ? ' and refund if approved' : ''}.
          </p>

          <div className="refund-field-group">
            <label className="refund-modal-label">
              <i className="fas fa-comment-alt"></i> Why do you need to cancel? <span className="refund-required">*</span>
            </label>
            <div className="cancel-reason-options" role="listbox" aria-label="Cancel reasons">
              {CANCEL_REASON_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={reasonId === opt.id}
                  className={`cancel-reason-option ${reasonId === opt.id ? 'selected' : ''}`}
                  onClick={() => {
                    setReasonId(opt.id);
                    setError('');
                    if (opt.id !== 'others') setOtherNote('');
                  }}
                >
                  {opt.label}
                  {reasonId === opt.id && <i className="fas fa-check-circle" aria-hidden="true" />}
                </button>
              ))}
            </div>
            {reasonId === 'others' && (
              <textarea
                className="refund-input cancel-reason-other"
                rows={3}
                placeholder="Type your reason here…"
                value={otherNote}
                maxLength={400}
                onChange={(e) => { setOtherNote(e.target.value); setError(''); }}
              />
            )}
          </div>

          {paid && (
            <>
              <div className="refund-field-group">
                <label className="refund-modal-label">
                  <i className="fas fa-wallet"></i> Refund to <span className="refund-required">*</span>
                </label>
                <div className="refund-method-row">
                  <button
                    type="button"
                    className={`refund-method-btn ${refundMethod === 'gcash' ? 'selected' : ''}`}
                    onClick={() => { setRefundMethod('gcash'); setError(''); }}
                  >
                    <img src="/images/payments/gcash.svg" alt="GCash" className="refund-method-logo" />
                    <span>GCash</span>
                    {refundMethod === 'gcash' && <i className="fas fa-check-circle refund-method-check"></i>}
                  </button>
                  <button
                    type="button"
                    className={`refund-method-btn ${refundMethod === 'maya' ? 'selected' : ''}`}
                    onClick={() => { setRefundMethod('maya'); setError(''); }}
                  >
                    <img src="/images/payments/maya.svg" alt="Maya" className="refund-method-logo" />
                    <span>Maya</span>
                    {refundMethod === 'maya' && <i className="fas fa-check-circle refund-method-check"></i>}
                  </button>
                </div>
              </div>

              <div className="refund-field-group">
                <label className="refund-modal-label">
                  <i className="fas fa-phone"></i> Phone Number <span className="refund-required">*</span>
                </label>
                <input
                  type="tel"
                  className="refund-input"
                  placeholder="09XXXXXXXXX"
                  value={phone}
                  maxLength={11}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, '').slice(0, 11));
                    setError('');
                  }}
                />
              </div>
            </>
          )}

          {error && (
            <div className="refund-error"><i className="fas fa-exclamation-circle"></i> {error}</div>
          )}
        </div>
        <div className="refund-modal-footer">
          <button type="button" className="refund-cancel-btn" onClick={onClose} disabled={submitting}>Keep Order</button>
          <button type="button" className="refund-submit-btn cancel-order-submit" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? <><i className="fas fa-spinner fa-spin"></i> Submitting…</>
              : <><i className="fas fa-paper-plane"></i> Submit Cancel Request</>}
          </button>
        </div>
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
};

// ─── REFUND MODAL ─────────────────────────────────────────────────────────────
const RefundModal = ({ order, onClose, onSuccess }) => {
  useCloseOnHistoryBack(true, onClose, 'refundModal');
  const [photo, setPhoto]               = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [refundMethod, setRefundMethod] = useState('');
  const [accountName, setAccountName]   = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [comment, setComment]           = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [uploading, setUploading]       = useState(false);
  const [error, setError]               = useState('');
  const fileInputRef                    = useRef(null);

  const generateUploadUrl = useMutation(api.orders.generateRefundUploadUrl);
  const requestRefund     = useMutation(api.orders.requestRefund);

  const refundAmount = (order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
  const { canRefund, expired } = getRefundWindow(order);

  useBodyScrollLock(true);

  useEffect(() => {
    if (!refundMethod) return;
    const id = window.setTimeout(() => {
      document.querySelector('.refund-account-fields')?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }, 50);
    return () => window.clearTimeout(id);
  }, [refundMethod]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const check = validateImageFile(file);
    if (!check.ok) { setError(check.error); e.target.value = ''; return; }
    setError(''); setPhoto(file); setPhotoPreview(URL.createObjectURL(file));
  };

  const removePhoto = () => { setPhoto(null); setPhotoPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleSubmit = async () => {
    const { canRefund: stillValid } = getRefundWindow(order);
    if (!stillValid) { setError('Refund window has expired.'); return; }
    if (!photo) { setError('Please upload a photo of the damaged item.'); return; }
    if (!refundMethod) { setError('Please choose GCash or Maya.'); return; }
    if (!accountName.trim()) { setError('Please enter your account name.'); return; }
    if (!accountNumber.trim()) { setError('Please enter your account number.'); return; }
    if (!/^\d{10,11}$/.test(accountNumber.replace(/\s/g, ''))) { setError('Please enter a valid 10 or 11-digit number.'); return; }
    setError(''); setSubmitting(true); setUploading(true);
    try {
      const uploadUrl = await generateUploadUrl();
      const uploadRes = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': photo.type }, body: photo });
      if (!uploadRes.ok) throw new Error('Upload failed');
      const { storageId } = await uploadRes.json();
      setUploading(false);
      const result = await requestRefund({ orderId: order.orderId, refundPhotoId: storageId, refundMethod, refundAccountName: accountName.trim(), refundAccountNumber: accountNumber.replace(/\s/g, ''), refundComment: comment.trim() });
      if (result?.success) { onSuccess(); } else { setError(result?.error || 'Failed. Please try again.'); }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally { setSubmitting(false); setUploading(false); }
  };

  if (expired || !canRefund) {
    return createPortal(
      <div className="refund-modal-overlay" onClick={onClose}>
        <div className="refund-modal" onClick={e => e.stopPropagation()}>
          <button className="refund-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
          <div className="refund-modal-header">
            <div className="refund-modal-icon" style={{ background: '#fee2e2' }}><i className="fas fa-clock" style={{ color: '#dc2626' }}></i></div>
            <div><h3>Refund Window Expired</h3><p>Order #{formatOrderShortId(order)}</p></div>
          </div>
          <div className="refund-modal-body">
            <div className="refund-expired-notice">
              <i className="fas fa-exclamation-circle"></i>
              <div><strong>The 24-hour refund window has passed.</strong><p>Refunds are only accepted within 24 hours of delivery.</p></div>
            </div>
          </div>
          <div className="refund-modal-footer"><button className="refund-cancel-btn" onClick={onClose}>Close</button></div>
        </div>
      </div>,
      getOverlayRoot() || document.body
    );
  }

  return createPortal(
    <div className="refund-modal-overlay" onClick={onClose}>
      <div className="refund-modal" onClick={e => e.stopPropagation()}>
        <button className="refund-modal-close" onClick={onClose}><i className="fas fa-times"></i></button>
        <div className="refund-modal-header">
          <div className="refund-modal-icon"><i className="fas fa-box-open"></i></div>
          <div><h3>Request a Refund</h3><p>Order #{formatOrderShortId(order)} · <strong>₱{refundAmount}</strong></p></div>
        </div>
        <div className="refund-modal-body">
          <div className="refund-reason-fixed">
            <div className="refund-reason-fixed-icon"><i className="fas fa-box"></i></div>
            <div><span className="refund-reason-fixed-label">📦 Item arrived damaged</span><span className="refund-reason-fixed-desc">Provide photo proof below. Damaged-item refunds are accepted within 24 hours of delivery.</span></div>
          </div>
          <div className="refund-field-group">
            <label className="refund-modal-label"><i className="fas fa-camera"></i> Photo Proof <span className="refund-required">*</span></label>
            {!photoPreview
              ? <div className="refund-photo-upload-area" onClick={() => fileInputRef.current?.click()}><i className="fas fa-cloud-upload-alt"></i><p>Click to upload</p><small>JPG, PNG · Max 5MB · No GIF</small><input ref={fileInputRef} type="file" accept={IMAGE_ACCEPT_NO_GIF} style={{ display: 'none' }} onChange={handlePhotoChange} /></div>
              : <div className="refund-photo-preview-wrap"><img src={photoPreview} alt="Damage proof" className="refund-photo-preview" /><button className="refund-photo-remove" onClick={removePhoto} type="button"><i className="fas fa-trash-alt"></i> Remove</button></div>}
          </div>
          <div className="refund-field-group">
            <label className="refund-modal-label"><i className="fas fa-wallet"></i> Refund Method <span className="refund-required">*</span></label>
            <div className="refund-method-row">
              <button type="button" className={`refund-method-btn ${refundMethod === 'gcash' ? 'selected' : ''}`} onClick={() => { setRefundMethod('gcash'); setError(''); }}>
                <img src="/images/payments/gcash.svg" alt="GCash" className="refund-method-logo" /><span>GCash</span>{refundMethod === 'gcash' && <i className="fas fa-check-circle refund-method-check"></i>}
              </button>
              <button type="button" className={`refund-method-btn ${refundMethod === 'maya' ? 'selected' : ''}`} onClick={() => { setRefundMethod('maya'); setError(''); }}>
                <img src="/images/payments/maya.svg" alt="Maya" className="refund-method-logo" /><span>Maya</span>{refundMethod === 'maya' && <i className="fas fa-check-circle refund-method-check"></i>}
              </button>
            </div>
          </div>
          {refundMethod && (
            <div className="refund-field-group refund-account-fields">
              <label className="refund-modal-label"><i className="fas fa-id-card"></i> Account Details <span className="refund-required">*</span></label>
              <input type="text" className="refund-input" placeholder="Account Name" value={accountName} onChange={e => { setAccountName(e.target.value); setError(''); }} maxLength={60} />
              <input type="tel" className="refund-input" placeholder="Mobile Number (09XXXXXXXXX)" value={accountNumber} onChange={e => { setAccountNumber(e.target.value); setError(''); }} maxLength={13} inputMode="numeric" autoComplete="tel" />
            </div>
          )}
          <div className="refund-field-group">
            <label className="refund-modal-label">Additional Details <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
            <textarea
              className="refund-comment-box"
              placeholder="Describe the damage…"
              value={comment}
              rows={2}
              maxLength={500}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          {error && <div className="refund-error-msg"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        </div>
        <div className="refund-modal-footer">
          <button className="refund-cancel-btn" onClick={onClose} disabled={submitting}>Cancel</button>
          <button className="refund-submit-btn" onClick={handleSubmit} disabled={submitting || !photo || !refundMethod || !accountName || !accountNumber}>
            {uploading ? <><i className="fas fa-spinner fa-spin"></i> Uploading…</> : submitting ? <><i className="fas fa-spinner fa-spin"></i> Submitting…</> : <><i className="fas fa-paper-plane"></i> Submit Refund Request</>}
          </button>
        </div>
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
};

const RefundBadge = ({ status }) => {
  if (!status) return null;
  const config = {
    requested: { icon: 'fa-clock',        label: 'Refund Pending',  cls: 'refund-badge-pending'  },
    approved:  { icon: 'fa-check-circle', label: 'Refund Approved', cls: 'refund-badge-approved' },
    rejected:  { icon: 'fa-times-circle', label: 'Refund Rejected', cls: 'refund-badge-rejected' },
  };
  const c = config[status];
  if (!c) return null;
  return <span className={`refund-status-badge ${c.cls}`}><i className={`fas ${c.icon}`}></i> {c.label}</span>;
};

// ─── RIDER MAP ────────────────────────────────────────────────────────────────
// ✅ NCR bounding box — restricts map pan/zoom to Metro Manila only
const NCR_BOUNDS = [
  [14.3500, 120.8500],
  [14.8000, 121.1500],
];

const RiderMap = ({ orderId, riderName, orderData }) => {
  const mapRef             = useRef(null);
  const mapInstanceRef     = useRef(null);
  const markerRef          = useRef(null);
  const lastKnownMarkerRef = useRef(null);
  const destMarkerRef      = useRef(null);
  const accuracyCircleRef  = useRef(null);
  const routeLineRef       = useRef(null);
  const hasFittedRef       = useRef(false);
  const lastRouteRiderRef  = useRef({ lat: null, lng: null });
  const [mapReady,      setMapReady]      = useState(false);
  const [mapError,      setMapError]      = useState(null);
  const [leafletLoaded, setLeafletLoaded] = useState(!!window.L);
  const [lastUpdateTime,setLastUpdateTime]= useState(null);

  const locationData = useQuery(api.riders.getRiderLocation, orderId ? { orderId } : 'skip');

  const isLive      = !!(locationData?.isTracking && locationData?.lat && locationData?.lng &&
                       (Date.now() - locationData.updatedAt) < 12000);
  const hasLastKnown = !!(locationData?.lastKnownLat && locationData?.lastKnownLng);

  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return; }
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    const existing = document.getElementById('leaflet-js');
    if (existing) { if (window.L) { setLeafletLoaded(true); return; } existing.addEventListener('load', () => setLeafletLoaded(true)); return; }
    const script = document.createElement('script');
    script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload  = () => setLeafletLoaded(true);
    script.onerror = () => setMapError('Failed to load map.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!leafletLoaded || mapInstanceRef.current || !mapRef.current) return;
    try {
      const L = window.L;
      // ✅ NCR-restricted map init
      const map = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: true,
        tap: false,
        scrollWheelZoom: true,
        maxBounds: NCR_BOUNDS,
        maxBoundsViscosity: 1.0,
        minZoom: 11,
        maxZoom: 19,
      }).setView([14.5995, 120.9842], 13);

      map.zoomControl.setPosition('bottomright');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map);
      const riderIcon = L.divIcon({
        className: '',
        html: `<div style="width:44px;height:44px;background:linear-gradient(135deg,#6a0dad,#9b30ff);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(106,13,173,0.5);display:flex;align-items:center;justify-content:center;font-size:22px;">🛵</div>`,
        iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -26],
      });
      const marker = L.marker([14.5995, 120.9842], { icon: riderIcon, opacity: 0 }).addTo(map)
        .bindPopup(`<div class="rider-map-popup"><strong>🛵 ${riderName || 'Your Rider'}</strong><br><small>Waiting for location…</small></div>`);
      mapInstanceRef.current = map; markerRef.current = marker;
      setMapReady(true);
      const refresh = () => { try { map.invalidateSize({ animate: false }); } catch {} };
      [80, 250, 500].forEach((ms) => setTimeout(refresh, ms));
    } catch { setMapError('Failed to initialize map.'); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leafletLoaded]);

  useEffect(() => {
    const refresh = () => {
      if (mapInstanceRef.current) setTimeout(() => { try { mapInstanceRef.current?.invalidateSize({ animate: false }); } catch {} }, 120);
    };
    const h = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', h);
    window.addEventListener('resize', refresh);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
      ro = new ResizeObserver(refresh);
      ro.observe(mapRef.current);
    }
    return () => {
      document.removeEventListener('visibilitychange', h);
      window.removeEventListener('resize', refresh);
      if (ro) { try { ro.disconnect(); } catch {} }
    };
  }, []);

  const clearRoute = useCallback(() => {
    if (routeLineRef.current) {
      if (Array.isArray(routeLineRef.current)) { routeLineRef.current.forEach(l => { try { l.remove(); } catch {} }); }
      else { try { routeLineRef.current.remove(); } catch {} }
      routeLineRef.current = null;
    }
  }, []);

  const fitOnce = useCallback((points) => {
    if (hasFittedRef.current || !mapInstanceRef.current || !window.L) return;
    try {
      mapInstanceRef.current.fitBounds(window.L.latLngBounds(points), {
        padding: [48, 48], maxZoom: 17, animate: false,
      });
      hasFittedRef.current = true;
    } catch { /* ignore */ }
  }, []);

  const drawRoute = useCallback((lat, lng, destLat, destLng, dashed = false) => {
    if (!mapInstanceRef.current || !window.L) return;
    const L   = window.L;
    const map = mapInstanceRef.current;
    const prev = lastRouteRiderRef.current;
    const movedFar = !prev.lat
      || Math.abs(lat - prev.lat) > 0.0008
      || Math.abs(lng - prev.lng) > 0.0008;
    if (routeLineRef.current && !movedFar && !dashed) return;

    clearRoute();
    lastRouteRiderRef.current = { lat, lng };
    if (dashed) {
      try {
        routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#9ca3af', weight: 3, opacity: 0.75, dashArray: '8, 8' }).addTo(map);
        fitOnce([[lat, lng], [destLat, destLng]]);
      } catch {}
      return;
    }
    fetch(`https://router.project-osrm.org/route/v1/bike/${lng},${lat};${destLng},${destLat}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        if (!mapInstanceRef.current) return;
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const coords  = data.routes[0].geometry.coordinates.map(([lo, la]) => [la, lo]);
          const outline = L.polyline(coords, { color: 'white',   weight: 7, opacity: 0.5, lineJoin: 'round', lineCap: 'round' }).addTo(map);
          const line    = L.polyline(coords, { color: '#e53e3e', weight: 4, opacity: 0.9, lineJoin: 'round', lineCap: 'round' }).addTo(map);
          routeLineRef.current = [outline, line];
          fitOnce(coords);
        } else {
          routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }).addTo(map);
          fitOnce([[lat, lng], [destLat, destLng]]);
        }
      })
      .catch(() => {
        if (!mapInstanceRef.current) return;
        try {
          routeLineRef.current = L.polyline([[lat, lng], [destLat, destLng]], { color: '#e53e3e', weight: 4, opacity: 0.8, dashArray: '10, 8' }).addTo(map);
          fitOnce([[lat, lng], [destLat, destLng]]);
        } catch {}
      });
  }, [clearRoute, fitOnce]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !markerRef.current || !window.L) return;
    const L       = window.L;
    const map     = mapInstanceRef.current;
    const destLat = orderData?.addressLat;
    const destLng = orderData?.addressLng;

    if (destLat && destLng && !destMarkerRef.current) {
      try {
        const destIcon = L.divIcon({
          html: `<div style="width:40px;height:40px;background:linear-gradient(135deg,#fc1268,#9c27b0);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(252,18,104,0.5);display:flex;align-items:center;justify-content:center;font-size:20px;">📍</div>`,
          className: '', iconSize: [40, 40], iconAnchor: [20, 40],
        });
        destMarkerRef.current = L.marker([destLat, destLng], { icon: destIcon }).addTo(map);
      } catch {}
    }

    if (isLive) {
      const { lat, lng, accuracy, updatedAt } = locationData;
      if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} lastKnownMarkerRef.current = null; }
      try { markerRef.current.setLatLng([lat, lng]); markerRef.current.setOpacity(1); } catch {}
      const accLabel = accuracy ? ` · ±${Math.round(accuracy)}m` : '';
      markerRef.current.getPopup()?.setContent(`<div class="rider-map-popup"><strong>🛵 ${riderName || 'Your Rider'}</strong><br><small>📍 Live${accLabel}</small></div>`);
      if (accuracyCircleRef.current) { try { map.removeLayer(accuracyCircleRef.current); } catch {} accuracyCircleRef.current = null; }
      if (accuracy && accuracy < 120) {
        try { accuracyCircleRef.current = L.circle([lat, lng], { radius: Math.max(accuracy, 8), color: '#16a34a', fillColor: '#22c55e', fillOpacity: 0.12, weight: 2 }).addTo(map); } catch {}
      }
      // Marker moves with GPS; camera stays put after the first fit
      if (destLat && destLng) {
        if (!hasFittedRef.current) fitOnce([[lat, lng], [destLat, destLng]]);
        drawRoute(lat, lng, destLat, destLng, false);
      } else if (!hasFittedRef.current) {
        try {
          map.setView([lat, lng], 16, { animate: false });
          hasFittedRef.current = true;
        } catch {}
      }
      setLastUpdateTime(new Date(updatedAt));
      return;
    }

    if (!isLive && hasLastKnown) {
      const { lastKnownLat, lastKnownLng, lastKnownAt, lastKnownAddress } = locationData;
      try { markerRef.current.setOpacity(0); } catch {}
      if (accuracyCircleRef.current) { try { map.removeLayer(accuracyCircleRef.current); } catch {} accuracyCircleRef.current = null; }
      if (!lastKnownMarkerRef.current) {
        try {
          const ghostIcon = L.divIcon({
            className: '',
            html: `<div style="position:relative;width:44px;height:44px;">
              <div style="width:44px;height:44px;background:linear-gradient(135deg,#6b7280,#9ca3af);border-radius:50%;border:3px solid white;box-shadow:0 3px 14px rgba(107,114,128,0.45);display:flex;align-items:center;justify-content:center;font-size:22px;opacity:0.88;">🛵</div>
              <div style="position:absolute;top:-5px;right:-5px;background:#f59e0b;color:white;border-radius:50%;width:18px;height:18px;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid white;">!</div>
            </div>`,
            iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -26],
          });
          const lastTimeStr = lastKnownAt ? new Date(lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '';
          lastKnownMarkerRef.current = L.marker([lastKnownLat, lastKnownLng], { icon: ghostIcon })
            .addTo(map)
            .bindPopup(`<div class="rider-map-popup"><strong>🛵 ${riderName || 'Your Rider'}</strong><br><small style="color:#f59e0b;font-weight:600">⚠️ Last seen ${lastTimeStr}</small><br>${lastKnownAddress ? `<small style="color:#6b7280">📍 ${lastKnownAddress}</small>` : ''}</div>`);
        } catch {}
      } else {
        try { lastKnownMarkerRef.current.setLatLng([lastKnownLat, lastKnownLng]); } catch {}
      }
      if (destLat && destLng) {
        if (!hasFittedRef.current) fitOnce([[lastKnownLat, lastKnownLng], [destLat, destLng]]);
        drawRoute(lastKnownLat, lastKnownLng, destLat, destLng, true);
      } else if (!hasFittedRef.current) {
        try {
          map.setView([lastKnownLat, lastKnownLng], 15, { animate: false });
          hasFittedRef.current = true;
        } catch {}
      }
      if (lastKnownAt) setLastUpdateTime(new Date(lastKnownAt));
      return;
    }

    if (destLat && destLng && !hasFittedRef.current) {
      try {
        map.setView([destLat, destLng], 15, { animate: false });
        hasFittedRef.current = true;
      } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationData, mapReady]);

  useEffect(() => () => {
    clearRoute();
    hasFittedRef.current = false;
    lastRouteRiderRef.current = { lat: null, lng: null };
    if (lastKnownMarkerRef.current) { try { lastKnownMarkerRef.current.remove(); } catch {} lastKnownMarkerRef.current = null; }
    if (mapInstanceRef.current) {
      try { mapInstanceRef.current.remove(); } catch {}
      mapInstanceRef.current = null; markerRef.current = null; destMarkerRef.current = null; accuracyCircleRef.current = null;
    }
  }, [clearRoute]);

  const lastKnownTimeStr = locationData?.lastKnownAt ? new Date(locationData.lastKnownAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : null;
  const lastKnownAddr = locationData?.lastKnownAddress;

  const statusClass = !locationData ? 'status-waiting' : isLive ? 'status-live' : hasLastKnown ? 'status-stopped' : locationData.isTracking ? 'status-stale' : 'status-stopped';
  const statusContent = !locationData
    ? <><span className="map-status-dot dot-waiting"></span> Waiting for rider to share location…</>
    : isLive
    ? <><span className="map-status-dot dot-live"></span> <strong>Live</strong> · Updated {lastUpdateTime?.toLocaleTimeString()}</>
    : hasLastKnown
    ? <><span className="map-status-dot dot-stopped"></span><span style={{ display:'flex', flexDirection:'column', gap:2 }}><span>Rider offline · Last seen {lastKnownTimeStr || 'unknown'}</span>{lastKnownAddr && <span style={{ fontSize:'0.72rem', color:'#6b7280' }}>📍 {lastKnownAddr}</span>}</span></>
    : <><span className="map-status-dot dot-stopped"></span> Rider stopped sharing location</>;

  if (mapError) return <div className="rider-map-error"><i className="fas fa-map-marked-alt"></i><p>{mapError}</p><small>Try refreshing.</small></div>;

  return (
    <div className="rider-map-wrapper">
      <div className={`rider-map-status-bar ${statusClass}`}>{statusContent}</div>
      <div ref={mapRef} className="rider-map-container" />
      {isLive && (
        <div className="rider-map-accuracy">
          {locationData.accuracy && <span><i className="fas fa-crosshairs"></i> ±{Math.round(locationData.accuracy)}m</span>}
          {locationData.speed > 0 && <span style={{ marginLeft: 10 }}><i className="fas fa-tachometer-alt"></i> {Math.round((locationData.speed || 0) * 3.6)} km/h</span>}
          <span style={{ marginLeft: 'auto', color: '#e53e3e', fontWeight: 700 }}>━━ Route &nbsp;·&nbsp; 🛵 = Rider &nbsp;·&nbsp; 📍 = You</span>
        </div>
      )}
      {!isLive && hasLastKnown && (
        <div className="rider-map-accuracy" style={{ background: '#fef3c7', borderTop: '1px solid #fde68a' }}>
          <span style={{ color: '#92400e' }}><i className="fas fa-exclamation-triangle" style={{ marginRight: 5 }}></i>Showing last known location{lastKnownAddr && <> · <strong>{lastKnownAddr}</strong></>}</span>
          <span style={{ marginLeft: 'auto', color: '#9ca3af', fontWeight: 700 }}>- - = Last seen &nbsp;·&nbsp; 📍 = You</span>
        </div>
      )}
      {!locationData && (
        <div className="rider-map-waiting-overlay">
          <div className="rider-map-waiting-inner">
            <i className="fas fa-motorcycle"></i>
            <p>Rider hasn't shared location yet</p>
            <small>Updates automatically when rider starts moving</small>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── MAIN TRACK ORDER PAGE ────────────────────────────────────────────────────
const TrackOrder = ({ onProductClick }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { user, isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const orderIdParam = searchParams.get('order') || searchParams.get('orderId') || searchParams.get('id');
  const highlightParam = searchParams.get('highlight') === '1';

  const [filter,             setFilter]             = useState('active');
  const [selectedOrderId,    setSelectedOrderId]    = useState(null);
  const [highlightOrderId,   setHighlightOrderId]   = useState(null);
  const [qrOrder,            setQrOrder]            = useState(null);
  const [trackingEmail,      setTrackingEmail]      = useState('');
  const [searchEmail,        setSearchEmail]        = useState('');
  const [showTrackedOrders,  setShowTrackedOrders]  = useState(false);
  const [lightboxData,       setLightboxData]       = useState(null);
  const [refundOrder,        setRefundOrder]        = useState(null);
  const [refundSuccess,      setRefundSuccess]      = useState(false);
  const [cancelOrder,        setCancelOrder]        = useState(null);
  const openedFromUrlRef = useRef(null);
  const trackedOrdersRef = useRef(null);
  const ordersListRef    = useRef(null);
  const [hiddenOrders,       setHiddenOrders]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('hiddenDeliveredOrders') || '[]'); } catch { return []; }
  });

  const orders           = useUserOrders(isAuthenticated ? user?.email : null) || [];
  const emailOrders      = useOrdersByEmail(searchEmail) || [];
  const regularProducts  = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const products         = [...regularProducts, ...preOrderProducts];
  const allAvailableOrders = [...orders, ...emailOrders];
  const selectedOrder = selectedOrderId ? allAvailableOrders.find(o => o._id === selectedOrderId) || null : null;

  const directOrder = useQuery(
    api.orders.getOrderById,
    orderIdParam ? { orderId: orderIdParam } : 'skip'
  );

  useEffect(() => {
    if (!orderIdParam) {
      openedFromUrlRef.current = null;
      return;
    }
    // Prevent reopen race after close (URL clear is async)
    if (openedFromUrlRef.current === orderIdParam) return;
    if (selectedOrderId || qrOrder) return;
    const found = [...orders, ...emailOrders].find(o => o.orderId === orderIdParam);
    if (found) {
      openedFromUrlRef.current = orderIdParam;
      setSelectedOrderId(found._id);
      if (highlightParam) setHighlightOrderId(found.orderId);
      return;
    }
    if (directOrder) {
      openedFromUrlRef.current = orderIdParam;
      setQrOrder(directOrder);
      if (highlightParam) setHighlightOrderId(directOrder.orderId);
    }
  }, [orderIdParam, orders, emailOrders, directOrder, selectedOrderId, qrOrder, highlightParam]);

  useEffect(() => {
    if (!highlightOrderId) return;
    const t = setTimeout(() => {
      try {
        document
          .querySelector(`[data-order-id="${CSS.escape(String(highlightOrderId))}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch { /* ignore */ }
    }, 250);
    const clear = setTimeout(() => setHighlightOrderId(null), 4500);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [highlightOrderId]);

  const handleCloseModal = useCallback(() => {
    setLightboxData(null);
    setSelectedOrderId(null);
    setQrOrder(null);
    // Clear ?order= so the reopen effect does not immediately pop the modal again
    if (orderIdParam || highlightParam) {
      openedFromUrlRef.current = orderIdParam; // block reopen until param is gone
      const next = new URLSearchParams(searchParams);
      next.delete('order');
      next.delete('orderId');
      next.delete('id');
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    }
  }, [orderIdParam, highlightParam, searchParams, setSearchParams]);
  const handleOpenModal  = useCallback((order) => setSelectedOrderId(order._id), []);
  const getProductById   = useCallback((id) => products.find(p => p._id === id || p.id === id), [products]);

  const getStatusClass = (status) => {
    const map = {
      'Processing': 'status-processing', 'Confirmed': 'status-confirmed', 'Shipped': 'status-shipped',
      'Out for Delivery': 'status-delivery', 'out_for_delivery': 'status-delivery', 'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled', 'pending': 'status-processing', 'confirmed': 'status-confirmed',
      'shipped': 'status-shipped', 'completed': 'status-delivered', 'cancelled': 'status-cancelled',
      'Pending Payment': 'status-pending-payment',
    };
    return map[status] || 'status-processing';
  };

  const getDisplayStatus = (order) => {
    const s = order.orderStatus || order.status || 'pending';
    const labels = {
      pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery', completed: 'Delivered', cancelled: 'Cancelled',
      Processing: 'Processing', Confirmed: 'Confirmed', Shipped: 'Shipped',
      'Out for Delivery': 'Out for Delivery', Delivered: 'Delivered', Cancelled: 'Cancelled',
      'Pending Payment': 'Pending Payment',
    };
    return labels[s] || s;
  };

  const isPendingPayment       = (order) => order.status === 'Pending Payment' && order.paymentStatus !== 'paid';
  const isDelivered            = (order) => { const s = (order.orderStatus || order.status || '').toLowerCase(); return s === 'delivered' || s === 'completed'; };
  const isCancelledOrder       = (order) => { const s = (order.orderStatus || order.status || '').toLowerCase(); return s === 'cancelled'; };
  const isOutForDeliveryStatus = (order) => {
    const check = (val) => { if (!val) return false; return val.toLowerCase().replace(/[\s_-]+/g, '_') === 'out_for_delivery'; };
    return check(order.orderStatus) || check(order.status);
  };

  const getTimelineSteps = (order) => {
    const status = (order.orderStatus || order.status || 'pending').toLowerCase().replace(/\s+/g, '_');
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
    const lbc = isLbcOrder(order);
    if (status === 'cancelled') return [
      { label: 'Order Placed', icon: 'fa-shopping-cart', completed: true, time: fmt(order._creationTime) },
      { label: 'Payment',      icon: 'fa-credit-card',   completed: !!order.paidAt, time: fmt(order.paidAt) },
      { label: 'Cancelled',    icon: 'fa-times-circle',  completed: true, isCancelled: true, cancelReason: order.cancelReason },
    ];
    if (lbc) {
      return [
        { label: 'Order Placed',      icon: 'fa-shopping-cart', completed: true, time: fmt(order._creationTime), desc: 'Customer · Your order has been placed.', actor: 'customer' },
        { label: 'Payment Confirmed', icon: 'fa-credit-card',   completed: order.paymentStatus === 'paid', time: fmt(order.paidAt), desc: order.paymentStatus === 'paid' ? 'Customer · Payment received.' : 'Customer · Waiting for payment.', actor: 'customer' },
        { label: 'Order Confirmed',   icon: 'fa-check-circle',  completed: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status), time: fmt(order.confirmedAt), desc: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status) ? 'Admin · Order confirmed (LBC shipping).' : 'Admin · Waiting for confirmation.', actor: 'admin' },
        { label: 'Shipped via LBC',   icon: 'fa-truck',         completed: ['shipped','out_for_delivery','delivered','completed'].includes(status), time: fmt(order.shippedAt || order.outForDeliveryAt), desc: ['shipped','out_for_delivery','delivered','completed'].includes(status) ? 'Admin · Package handed to LBC Express. Tracking ID will be sent to you.' : 'Admin · Waiting to ship via LBC.', actor: 'admin' },
        { label: 'Delivered',         icon: 'fa-check-double',  completed: ['delivered','completed'].includes(status), time: fmt(order.deliveryConfirmedAt), desc: ['delivered','completed'].includes(status) ? 'Admin · Delivered successfully!' : 'Waiting for LBC delivery.', actor: 'admin' },
      ];
    }
    return [
      { label: 'Order Placed',      icon: 'fa-shopping-cart', completed: true, time: fmt(order._creationTime), desc: 'Customer · Your order has been placed.', actor: 'customer' },
      { label: 'Payment Confirmed', icon: 'fa-credit-card',   completed: order.paymentStatus === 'paid', time: fmt(order.paidAt), desc: order.paymentStatus === 'paid' ? 'Customer · Payment received.' : 'Customer · Waiting for payment.', actor: 'customer' },
      { label: 'Order Confirmed',   icon: 'fa-check-circle',  completed: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status), time: fmt(order.confirmedAt), desc: ['confirmed','shipped','out_for_delivery','delivered','completed'].includes(status) ? 'Admin · Order confirmed.' : 'Admin · Waiting for confirmation.', actor: 'admin' },
      { label: 'Rider Assigned',    icon: 'fa-motorcycle',    completed: !!order.riderInfo || ['shipped','out_for_delivery','delivered','completed'].includes(status), time: fmt(order.shippedAt), desc: order.riderInfo ? `Rider · ${order.riderInfo.name} accepted your order.` : 'Rider · Waiting for rider.', actor: 'rider' },
      { label: 'Out for Delivery',  icon: 'fa-shipping-fast', completed: ['out_for_delivery','delivered','completed'].includes(status), time: fmt(order.outForDeliveryAt), desc: ['out_for_delivery','delivered','completed'].includes(status) ? 'Rider · On the way to you.' : 'Rider · Waiting for pickup.', actor: 'rider' },
      { label: 'Delivered',         icon: 'fa-check-double',  completed: ['delivered','completed'].includes(status), time: fmt(order.deliveryConfirmedAt), desc: ['delivered','completed'].includes(status) ? 'Rider · Delivered successfully!' : 'Rider · Waiting for delivery.', actor: 'rider' },
    ];
  };

  const openLightbox  = (images, startIndex = 0) => setLightboxData({ images, index: startIndex });
  const closeLightbox = useCallback(() => setLightboxData(null), []);
  useCloseOnHistoryBack(!!lightboxData, closeLightbox, 'orderLightbox');
  const lightboxNext  = () => setLightboxData(prev => ({ ...prev, index: (prev.index + 1) % prev.images.length }));
  const lightboxPrev  = () => setLightboxData(prev => ({ ...prev, index: (prev.index - 1 + prev.images.length) % prev.images.length }));
  const sortByNewest  = (arr) => [...arr].sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0));

  const visibleOrders   = sortByNewest(orders.filter(o => !hiddenOrders.includes(o._id)));
  const activeOrders    = visibleOrders.filter(o => !isDelivered(o) && !isCancelledOrder(o));
  const deliveredOrders = visibleOrders.filter(o => isDelivered(o));
  const cancelledOrders = visibleOrders.filter(o => isCancelledOrder(o));
  const filteredOrders  = visibleOrders.filter(o => {
    if (filter === 'active')    return !isDelivered(o) && !isCancelledOrder(o);
    if (filter === 'delivered') return isDelivered(o);
    if (filter === 'cancelled') return isCancelledOrder(o);
    return true;
  });

  const FILTERS = [
    { key: 'active',    icon: 'fa-box',          label: 'Active',     count: activeOrders.length,    desc: 'Active & ongoing orders' },
    { key: 'delivered', icon: 'fa-check-double', label: 'Delivered',  count: deliveredOrders.length, desc: 'Successfully delivered' },
    { key: 'cancelled', icon: 'fa-ban',          label: 'Cancelled',  count: cancelledOrders.length, desc: 'Cancelled orders' },
  ];

  const guestActiveOrders = sortByNewest(emailOrders).filter(
    (o) => !isDelivered(o) && !isCancelledOrder(o)
  );

  const scrollToTrackedOrders = useCallback(() => {
    const el = trackedOrdersRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (!showTrackedOrders || !searchEmail) return undefined;
    const t = setTimeout(scrollToTrackedOrders, 120);
    return () => clearTimeout(t);
  }, [showTrackedOrders, searchEmail, guestActiveOrders.length, emailOrders.length, scrollToTrackedOrders]);

  const handleFindMyOrders = (e) => {
    e.preventDefault();
    const email = trackingEmail.trim();
    if (!email) { showNotification('Please enter your email address.', 'warning'); return; }
    setSearchEmail(email);
    setShowTrackedOrders(true);
    setSelectedOrderId(null);
    setTimeout(scrollToTrackedOrders, 80);
  };

  const handleFilterClick = (key) => {
    // Keep viewport fixed — don't scroll the page when switching tabs
    setFilter(key);
  };

  const getPreOrderReleaseDate = (order) => {
    if (!order.items) return null;
    for (const item of order.items) {
      if (item.isPreOrder && item.releaseDate) return item.releaseDate;
      const product = getProductById(item.id);
      if (product?.isPreOrder && product?.releaseDate) return product.releaseDate;
    }
    return null;
  };

  const handleRefundSuccess = () => { setRefundOrder(null); setRefundSuccess(true); setTimeout(() => setRefundSuccess(false), 4000); };

  const openCancelOrder = (order) => {
    if (!order?.orderId || !user?.email) return;
    setSelectedOrderId(null);
    setCancelOrder(order);
  };

  const handleCancelOrderSuccess = () => {
    const orderId = cancelOrder?.orderId;
    setCancelOrder(null);
    showNotification(
      'Cancel request submitted. Admin will review your reason and notify you.',
      'success'
    );
    if (orderId && selectedOrder?.orderId === orderId) setSelectedOrderId(null);
  };

  // ─── ORDER CARD ────────────────────────────────────────────────────────────
  const OrderCard = ({ order, onViewDetails, isGuest = false, highlighted = false }) => {
    const [continuingPayment, setContinuingPayment] = useState(false);
    const createPaymentLink = useAction(api.payments.createPaymentLink);
    const assertOrderStock = useMutation(api.payments.assertOrderStock);

    const ordDate      = order._creationTime ? new Date(order._creationTime) : null;
    const orderStatus  = getDisplayStatus(order);
    const statusKey    = order.orderStatus || order.status || 'pending';
    const delivered    = isDelivered(order);
    const releaseDate  = getPreOrderReleaseDate(order);
    const needsPayment = isPendingPayment(order);
    const { canRefund, hoursLeft, expired } = getRefundWindow(order);

    const itemImages = (order.items || []).map(item => {
      const product = getProductById(item.id);
      return { src: item.image || product?.image || null, name: item.name || product?.name || 'Item' };
    }).filter(i => i.src);

    const handleContinuePayment = async (e) => {
      e?.stopPropagation?.();
      setContinuingPayment(true);
      try {
        // Always re-check stock — another customer may have paid first
        const stock = await assertOrderStock({ orderId: order.orderId });
        if (stock && stock.ok === false) {
          showNotification(stock.message || 'Items are out of stock.', 'error');
          setContinuingPayment(false);
          return;
        }
        // Always mint a fresh link after stock check (don't reuse a stale PayMongo session)
        const result = await createPaymentLink({ orderId: order.orderId, amount: order.finalTotal ?? order.total, description: `DKMerch Order ${order.orderId}`, customerName: order.customerName, customerEmail: order.email, customerPhone: order.phone });
        window.location.href = result.paymentLinkUrl;
      } catch (err) {
        const msg = String(err?.message || err?.data || '');
        showNotification(
          /out of stock/i.test(msg) ? msg : 'Failed. Please try again.',
          'error'
        );
        setContinuingPayment(false);
      }
    };

    const openCardDetails = () => onViewDetails(order);

    const thumb = itemImages[0];
    const showReviewRefund = !isGuest && delivered;
    const showRefundBtn = showReviewRefund && (
      (!order.refundStatus && canRefund) || (order.refundStatus === 'rejected' && canRefund)
    );

    return (
      <div
        className={`order-card order-card--list${highlighted ? ' order-card--highlight' : ''}`}
        data-order-id={order.orderId}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if (e.target.closest('.order-card-actions, .order-card-thumb, a, button')) return;
          openCardDetails();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openCardDetails();
          }
        }}
      >
        <button
          type="button"
          className="order-card-thumb"
          onClick={(e) => {
            e.stopPropagation();
            if (thumb) openLightbox(itemImages.map((i) => i.src), 0);
            else openCardDetails();
          }}
          aria-label="View product image"
        >
          {thumb ? (
            <img src={thumb.src} alt={thumb.name} />
          ) : (
            <i className="fas fa-box order-no-img" />
          )}
          {itemImages.length > 1 && <span className="order-thumb-more">+{itemImages.length - 1}</span>}
        </button>

        <div className="order-card-info">
          <div className="order-card-top">
            <p className="order-card-id">#{formatOrderShortId(order) || 'N/A'}</p>
            <span className={`order-status-chip ${getStatusClass(statusKey)}`}>{orderStatus}</span>
          </div>
          <p className="order-card-name">
            {order.items?.[0]?.name || getProductById(order.items?.[0]?.id)?.name || 'Order'}
            {(order.items?.length || 1) > 1 && <span className="order-and-more"> +{order.items.length - 1} more</span>}
          </p>
          <div className="order-card-meta-line">
            <span className="order-card-price">₱{order.total?.toLocaleString()}</span>
            {ordDate && (
              <span className="order-card-date">
                {ordDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
            {isLbcOrder(order) && <span className="order-card-lbc-badge"><i className="fas fa-truck"></i> LBC</span>}
          </div>
          {releaseDate && (
            <div className="order-card-preorder-badge">
              <i className="fas fa-calendar-alt"></i>
              <span>Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          )}
          {delivered && order.refundStatus && <RefundBadge status={order.refundStatus} />}
          {order.cancelRequestStatus === 'requested' && (
            <div className="order-card-refund-timer"><i className="fas fa-hourglass-half"></i><span>Cancel pending</span></div>
          )}
          {!isGuest && delivered && !order.refundStatus && canRefund && (
            <div className="order-card-refund-timer"><i className="fas fa-hourglass-half"></i><span>Refund: <strong>{hoursLeft}h left</strong></span></div>
          )}
          {!isGuest && delivered && !order.refundStatus && expired && (
            <div className="order-card-refund-expired"><i className="fas fa-clock"></i><span>Refund expired</span></div>
          )}

          <div className="order-card-actions" onClick={(e) => e.stopPropagation()}>
            {!isGuest && needsPayment ? (
              <button className="btn btn-continue-payment" onClick={handleContinuePayment} disabled={continuingPayment}>
                {continuingPayment ? <><i className="fas fa-spinner fa-spin"></i> Pay…</> : <><i className="fas fa-credit-card"></i> Pay</>}
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-small order-view-btn" onClick={openCardDetails}>
                <i className="fas fa-eye"></i> Details
              </button>
            )}
            {isLbcOrder(order) && (
              <button type="button" className="btn lbc-track-btn order-card-lbc-btn" onClick={openLbcTracker}>
                <i className="fas fa-truck"></i> LBC
              </button>
            )}
            {!isGuest && canCustomerCancelOrder(order) && (
              <button type="button" className="btn order-cancel-btn" onClick={() => openCancelOrder(order)}>
                <i className="fas fa-ban"></i> Cancel
              </button>
            )}
            {showReviewRefund && (
              <div className="order-card-actions-row">
                <button
                  type="button"
                  className="btn order-review-btn"
                  onClick={() => {
                    const item = order.items?.[0];
                    if (!item) return;
                    const product = getProductById(item.id) || {
                      _id: item.id || item.productId,
                      id: item.id || item.productId,
                      name: item.name,
                      price: item.price,
                      image: item.image,
                      stock: item.stock,
                    };
                    if (onProductClick) onProductClick(product);
                    else showNotification('Open the product to leave a review.', 'info');
                  }}
                >
                  <i className="fas fa-star"></i> Review
                </button>
                {showRefundBtn && (
                  <button
                    type="button"
                    className={`btn order-refund-btn${order.refundStatus === 'rejected' ? ' order-refund-retry-btn' : ''}`}
                    onClick={() => setRefundOrder(order)}
                  >
                    <i className={`fas ${order.refundStatus === 'rejected' ? 'fa-redo' : 'fa-undo'}`}></i> Refund
                  </button>
                )}
              </div>
            )}
          </div>
          {isGuest && delivered && !order.refundStatus && canRefund && (
            <div className="guest-login-prompt">
              <i className="fas fa-lock"></i>
              <span><a href="/login" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('openLoginModal')); }}>Log in</a> to request a refund</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Lightbox = () => {
    const images = lightboxData?.images || [];
    const index = lightboxData?.index || 0;
    const hasMultiple = images.length > 1;

    useEffect(() => {
      if (!lightboxData) return;
      const onKey = (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight' && hasMultiple) lightboxNext();
        if (e.key === 'ArrowLeft'  && hasMultiple) lightboxPrev();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [hasMultiple, lightboxData]);

    if (!lightboxData) return null;

    return (
      <div className="order-lightbox" onClick={closeLightbox}>
        <button className="lightbox-close" onClick={closeLightbox}><i className="fas fa-times"></i></button>
        {hasMultiple && <button className="lightbox-arrow lightbox-arrow-left" onClick={e => { e.stopPropagation(); lightboxPrev(); }}><i className="fas fa-chevron-left"></i></button>}
        <img src={images[index]} alt={`Item ${index + 1}`} onClick={e => e.stopPropagation()} />
        {hasMultiple && <button className="lightbox-arrow lightbox-arrow-right" onClick={e => { e.stopPropagation(); lightboxNext(); }}><i className="fas fa-chevron-right"></i></button>}
        {hasMultiple && <div className="lightbox-dots">{images.map((_, i) => <button key={i} className={`lightbox-dot ${i === index ? 'active' : ''}`} onClick={e => { e.stopPropagation(); setLightboxData(prev => ({ ...prev, index: i })); }} />)}</div>}
        {hasMultiple && <div className="lightbox-counter">{index + 1} / {images.length}</div>}
      </div>
    );
  };

  // ─── QR SCAN VIEW ──────────────────────────────────────────────────────────
  if (orderIdParam && qrOrder && !isAuthenticated) {
    return (
      <main className="trackorder-main">
        <div className="page-header">
          <div className="container">
            <h1 className="page-title">Order Tracking</h1>
            <p className="page-description">Scan result — Order #{formatOrderShortId(qrOrder)}</p>
          </div>
        </div>
        <TrackingModal
          key={qrOrder.orderId}
          order={qrOrder}
          products={products}
          onClose={() => { setQrOrder(null); navigate('/track-order'); }}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
          getDisplayStatus={getDisplayStatus}
          isOutForDeliveryStatus={isOutForDeliveryStatus}
          onRequestRefund={null}
          isGuest={true}
          onOpenLightbox={openLightbox}
        />
        <Lightbox />
      </main>
    );
  }

  // ─── AUTHENTICATED VIEW ────────────────────────────────────────────────────
  if (isAuthenticated && user) {
    const activeTab = FILTERS.find(f => f.key === filter);
    return (
      <main className="trackorder-main">
        <div className="page-header"><div className="container"><h1 className="page-title">Track Orders</h1><p className="page-description">Track and manage your orders</p></div></div>
        <div className="container">
          <section className="track-order-page">
            {refundSuccess && <div className="refund-success-toast"><i className="fas fa-check-circle"></i> Refund request submitted! We'll review it within 1-3 business days.</div>}
            <LbcTrackPanel />
            <div className="orders-tab-bar">
              {FILTERS.map(f => (
                <button key={f.key} className={`orders-tab-btn ${filter === f.key ? 'active' : ''}`} onClick={() => handleFilterClick(f.key)}>
                  <i className={`fas ${f.icon}`}></i><span className="tab-label">{f.label}</span>
                  {f.count > 0 && <span className={`tab-count ${filter === f.key ? 'tab-count-active' : ''}`}>{f.count}</span>}
                </button>
              ))}
            </div>
            <div ref={ordersListRef} className="tab-context-bar"><i className={`fas ${activeTab?.icon}`}></i><span><strong>{activeTab?.label}</strong> — {activeTab?.desc}{filteredOrders.length > 0 && <span className="tab-context-count"> · {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</span>}</span></div>
            {filteredOrders.length === 0 ? (
              <div className="orders-empty">
                <i className="fas fa-shopping-bag orders-empty-icon" aria-hidden="true"></i>
                <h3>{filter === 'active' ? 'No Active Orders' : `No ${activeTab?.label} Yet`}</h3>
                <p>{filter === 'active' && 'No active orders. Delivered and cancelled are under their own tabs.'}{filter === 'delivered' && 'No delivered orders.'}{filter === 'cancelled' && 'No cancelled orders.'}</p>
                {filter === 'active' && (
                  <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                    <i className="fas fa-shopping-bag"></i> Start Shopping
                  </button>
                )}
              </div>
            ) : (
              <div className="orders-grid">{filteredOrders.map(order => (
                <OrderCard
                  key={order._id}
                  order={order}
                  onViewDetails={handleOpenModal}
                  isGuest={false}
                  highlighted={highlightOrderId === order.orderId}
                />
              ))}</div>
            )}
          </section>
        </div>
        {selectedOrder && (
          <TrackingModal
            key={selectedOrderId}
            order={selectedOrder}
            products={products}
            onClose={handleCloseModal}
            getTimelineSteps={getTimelineSteps}
            getStatusClass={getStatusClass}
            getDisplayStatus={getDisplayStatus}
            isOutForDeliveryStatus={isOutForDeliveryStatus}
            onRequestRefund={(order) => { handleCloseModal(); setRefundOrder(order); }}
            onCustomerCancel={openCancelOrder}
            cancelling={false}
            isGuest={false}
            onOpenLightbox={openLightbox}
          />
        )}
        {cancelOrder && (
          <CancelOrderModal
            order={cancelOrder}
            userEmail={user.email}
            onClose={() => setCancelOrder(null)}
            onSuccess={handleCancelOrderSuccess}
          />
        )}
        {refundOrder && <RefundModal order={refundOrder} onClose={() => setRefundOrder(null)} onSuccess={handleRefundSuccess} />}
        <Lightbox />
      </main>
    );
  }

  // ─── GUEST VIEW ────────────────────────────────────────────────────────────
  return (
    <main className="trackorder-main">
      <div className="page-header"><div className="container"><h1 className="page-title">Track Your Order</h1><p className="page-description">Enter your email to view your order status</p></div></div>
      <div className="container">
        <section className="track-order-page">
          <LbcTrackPanel />
          <div className="tracking-form-section">
            <div className="tracking-form">
              <h2>Find My Orders</h2>
              <form onSubmit={handleFindMyOrders}>
                <div className="form-group"><label htmlFor="tracking-email">Email Address</label><input type="email" id="tracking-email" className="form-control" placeholder="Enter your email" value={trackingEmail} onChange={e => setTrackingEmail(e.target.value)} required /><small>Email used when placing your order</small></div>
                <button type="submit" className="btn btn-primary"><i className="fas fa-search"></i> Find My Orders</button>
              </form>
            </div>
            <div className="tracking-info"><h3>How to Track</h3><ul><li><i className="fas fa-check"></i> Enter your email address</li><li><i className="fas fa-check"></i> View all your orders</li><li><i className="fas fa-check"></i> See real-time status</li><li><i className="fas fa-truck"></i> Outside NCR? Admin sends your LBC ID — use LBC Tracker above</li></ul></div>
          </div>
          {showTrackedOrders && (
            <div ref={trackedOrdersRef} className="tracked-orders-section">
              {guestActiveOrders.length > 0 ? (
                <>
                  <div className="tracked-orders-header">
                    <h2>Your Active Orders</h2>
                    <p>
                      Found {guestActiveOrders.length} active order{guestActiveOrders.length > 1 ? 's' : ''} for {searchEmail}
                      {emailOrders.length > guestActiveOrders.length
                        ? ` · ${emailOrders.length - guestActiveOrders.length} delivered/cancelled hidden`
                        : ''}
                    </p>
                    <div className="guest-login-notice">
                      <i className="fas fa-info-circle"></i>
                      <span>
                        Viewing as guest.{' '}
                        <a href="/login" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('openLoginModal')); }}>Log in</a>
                        {' '}for full access.
                      </span>
                    </div>
                  </div>
                  <div className="orders-grid">
                    {guestActiveOrders.map((order) => (
                      <OrderCard key={order._id} order={order} onViewDetails={handleOpenModal} isGuest={true} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="orders-empty">
                  <i className="fas fa-search"></i>
                  <h3>{emailOrders.length > 0 ? 'No active orders' : 'No orders found'}</h3>
                  <p>
                    {emailOrders.length > 0
                      ? `Orders for ${searchEmail} are already delivered or cancelled.`
                      : `No orders for ${searchEmail}.`}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
      {selectedOrder && (
        <TrackingModal
          key={selectedOrderId}
          order={selectedOrder}
          products={products}
          onClose={handleCloseModal}
          getTimelineSteps={getTimelineSteps}
          getStatusClass={getStatusClass}
          getDisplayStatus={getDisplayStatus}
          isOutForDeliveryStatus={isOutForDeliveryStatus}
          onRequestRefund={null}
          isGuest={true}
          onOpenLightbox={openLightbox}
        />
      )}
      <Lightbox />
    </main>
  );
};

// ─── TRACKING MODAL ──────────────────────────────────────────────────────────
const TrackingModal = ({ order, products, onClose, getTimelineSteps, getStatusClass, getDisplayStatus, isOutForDeliveryStatus, onRequestRefund, onCustomerCancel, cancelling = false, isGuest = false, onOpenLightbox }) => {
  useCloseOnHistoryBack(true, onClose, 'trackingModal');
  const { showNotification } = useNotification();
  const createPaymentLink = useAction(api.payments.createPaymentLink);
  const assertOrderStock = useMutation(api.payments.assertOrderStock);
  const [localOtp,          setLocalOtp]          = useState(order.deliveryOtp || null);
  const [continuingPayment, setContinuingPayment] = useState(false);
  const [proofExpanded,     setProofExpanded]     = useState(true);
  const [refundProofExpanded, setRefundProofExpanded] = useState(true);
  const [localProofOpen, setLocalProofOpen] = useState(false);

  const openProofFull = () => {
    if (!order.deliveryProofPhoto) return;
    // Must open inside this portal (#dk-overlay-root) so it sits above the tracking modal
    setLocalProofOpen(true);
  };

  useEffect(() => {
    if (!localProofOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setLocalProofOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [localProofOpen]);

  const cancelRefundProofUrl = useQuery(
    api.orders.getRefundPhotoUrl,
    order.cancelRefundProofId ? { storageId: order.cancelRefundProofId } : 'skip'
  );

  const riderEmail = String(order.riderInfo?.email || '').trim();
  const riderApp = useQuery(
    api.riders.getRiderByEmail,
    riderEmail && !order.riderInfo?.photo ? { email: riderEmail } : 'skip'
  );
  const riderPhoto = order.riderInfo?.photo || riderApp?.riderPhoto || '';

  const isCancelled      = (order.orderStatus || order.status || '').toLowerCase() === 'cancelled';
  const isOutForDelivery = isOutForDeliveryStatus(order);
  const needsPayment     = order.status === 'Pending Payment' && order.paymentStatus !== 'paid';
  const delivered        = ['delivered','completed'].includes((order.orderStatus || order.status || '').toLowerCase());
  const canCancel        = !isGuest && canCustomerCancelOrder(order);
  const timelineSteps    = getTimelineSteps(order);
  const refundAmount     = (order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 });
  const { canRefund, hoursLeft, minsLeft, expired } = getRefundWindow(order);

  useBodyScrollLock(true);

  useEffect(() => { if (order.deliveryOtp) setLocalOtp(order.deliveryOtp); }, [order.deliveryOtp]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      if (localProofOpen) {
        setLocalProofOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, localProofOpen]);

  const getProductById = (id) => products.find(p => p._id === id || p.id === id);

  const handleContinuePayment = async () => {
    setContinuingPayment(true);
    try {
      const stock = await assertOrderStock({ orderId: order.orderId });
      if (stock && stock.ok === false) {
        showNotification(stock.message || 'Items are out of stock.', 'error');
        setContinuingPayment(false);
        return;
      }
      // Always mint a fresh link after stock check (don't reuse a stale PayMongo session)
      const result = await createPaymentLink({ orderId: order.orderId, amount: order.finalTotal ?? order.total, description: `DKMerch Order ${order.orderId}`, customerName: order.customerName, customerEmail: order.email, customerPhone: order.phone });
      window.location.href = result.paymentLinkUrl;
    } catch (err) {
      const msg = String(err?.message || err?.data || '');
      showNotification(
        /out of stock/i.test(msg) ? msg : 'Failed. Please try again.',
        'error'
      );
      setContinuingPayment(false);
    }
  };

  return createPortal(
    <>
    <div className="tracking-modal-overlay" onClick={onClose}>
      <div className="tracking-modal" onClick={e => e.stopPropagation()}>
        <div className="tracking-result">

          <div className="result-header">
            <h2>Order #{formatOrderShortId(order) || 'N/A'}</h2>
            <div className={`status-badge ${getStatusClass(order.orderStatus || order.status)}`}>{getDisplayStatus(order)}</div>
            <button
              className="modal-close-btn"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              type="button"
              aria-label="Close"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>

          {isGuest && (
            <div className="guest-modal-notice"><i className="fas fa-lock"></i><span>Viewing as guest — order timeline only. <a href="/login" onClick={e => { e.preventDefault(); onClose(); window.dispatchEvent(new Event('openLoginModal')); }}>Log in</a> for full access.</span></div>
          )}

          {!isGuest && needsPayment && (
            <div className="pending-payment-banner">
              <div className="pending-payment-icon"><i className="fas fa-exclamation-circle"></i></div>
              <div className="pending-payment-text"><strong>Payment Incomplete</strong><p>Your order is reserved but payment was not completed.</p></div>
              <button className="btn btn-continue-payment" onClick={handleContinuePayment} disabled={continuingPayment}>{continuingPayment ? <><i className="fas fa-spinner fa-spin"></i> Loading…</> : <><i className="fas fa-credit-card"></i> Complete Payment</>}</button>
            </div>
          )}

          {isLbcOrder(order) && !isCancelled && <LbcTrackPanel />}

          {order.riderInfo && !isCancelled && !isLbcOrder(order) && (
            <div className="rider-info-banner">
              {riderPhoto ? (
                <img src={riderPhoto} alt={order.riderInfo.name || 'Rider'} className="rider-info-photo" />
              ) : (
                <div className="rider-info-icon"><i className="fas fa-motorcycle"></i></div>
              )}
              <div className="rider-info-details">
                <strong>Your Rider: {order.riderInfo.name || '—'}</strong>
                <span>🏍️ Motorcycle{order.riderInfo.plate ? ` • Plate Number: ${order.riderInfo.plate}` : ''}</span>
                {order.riderInfo.phone && <span><i className="fas fa-phone"></i> {order.riderInfo.phone}</span>}
              </div>
            </div>
          )}

          {!isGuest && !isCancelled && !isLbcOrder(order) && order.riderInfo && (
            <DeliveryChatPanel
              orderId={order.orderId}
              role="customer"
              userName={order.customerName || 'Customer'}
              userEmail={order.email || ''}
              peerName={order.riderInfo?.name}
              riderName={order.riderInfo?.name}
              riderEmail={order.riderInfo?.email}
              customerName={order.customerName}
              customerEmail={order.email}
            />
          )}

          {isCancelled && (
            <div className="cancelled-banner">
              <div className="cancelled-banner-icon"><i className="fas fa-ban"></i></div>
              <div className="cancelled-banner-text">
                <strong>Order Cancelled</strong>
                <p>{order.cancelReason || 'This order has been cancelled.'}</p>
                {order.cancelledBy === 'customer' && order.refundStatus === 'approved' && (
                  <p style={{ marginTop: 6, fontWeight: 700 }}>
                    Refund ₱{(order.refundAmount ?? order.finalTotal ?? order.total ?? 0).toLocaleString('en-PH')} sent to your payment method.
                  </p>
                )}
              </div>
            </div>
          )}

          {isCancelled && order.cancelRefundProofId && (
            <div className="customer-pod-section customer-refund-proof-section">
              <button
                type="button"
                className="customer-pod-header"
                onClick={() => setRefundProofExpanded((v) => !v)}
              >
                <span className="customer-pod-label">
                  <i className="fas fa-receipt"></i>
                  <strong>Admin Refund Proof</strong>
                </span>
                <i className={`fas fa-chevron-${refundProofExpanded ? 'up' : 'down'}`}></i>
              </button>
              {refundProofExpanded && (
                <div className="customer-pod-body">
                  <p className="customer-pod-note">
                    Screenshot from admin confirming your refund was sent (GCash / Maya / PayMongo).
                  </p>
                  {cancelRefundProofUrl ? (
                    <a href={cancelRefundProofUrl} target="_blank" rel="noreferrer" className="customer-refund-proof-link">
                      <img
                        src={cancelRefundProofUrl}
                        alt="Admin refund proof"
                        className="customer-pod-photo customer-refund-proof-photo"
                      />
                    </a>
                  ) : (
                    <div className="customer-pod-note"><i className="fas fa-spinner fa-spin"></i> Loading proof…</div>
                  )}
                </div>
              )}
            </div>
          )}

          {canCancel && (
            <button
              type="button"
              className="btn order-cancel-btn modal-cancel-order-btn"
              disabled={cancelling}
              onClick={() => onCustomerCancel?.(order)}
            >
              {cancelling
                ? <><i className="fas fa-spinner fa-spin"></i> Submitting…</>
                : <><i className="fas fa-ban"></i> Request Cancel</>}
            </button>
          )}

          {delivered && order.refundStatus && (
            <div className={`refund-status-banner refund-banner-${order.refundStatus}`}>
              <div className="refund-banner-icon">
                {order.refundStatus === 'requested' && <i className="fas fa-clock"></i>}
                {order.refundStatus === 'approved'  && <i className="fas fa-check-circle"></i>}
                {order.refundStatus === 'rejected'  && <i className="fas fa-times-circle"></i>}
              </div>
              <div className="refund-banner-text">
                <strong>{order.refundStatus === 'requested' && 'Refund Pending'}{order.refundStatus === 'approved' && `Refund Approved — ₱${refundAmount}`}{order.refundStatus === 'rejected' && 'Refund Rejected'}</strong>
                <p>{order.refundStatus === 'requested' && 'Under review.'}{order.refundStatus === 'approved' && (order.refundAdminNote || 'Refund approved.')}{order.refundStatus === 'rejected' && (order.refundAdminNote || 'Not approved.')}</p>
              </div>
            </div>
          )}

          {!isGuest && delivered && !order.refundStatus && canRefund && <div className="refund-window-banner"><i className="fas fa-hourglass-half"></i><span>Refund window: <strong>{hoursLeft}h {minsLeft}m</strong> left.</span></div>}
          {!isGuest && delivered && !order.refundStatus && expired && <div className="refund-window-banner refund-window-expired"><i className="fas fa-clock"></i><span>Refund window expired.</span></div>}
          {!isGuest && delivered && (!order.refundStatus || order.refundStatus === 'rejected') && canRefund && (
            <button className="modal-refund-btn" onClick={() => onRequestRefund(order)}><i className="fas fa-undo-alt"></i>{order.refundStatus === 'rejected' ? 'Request Again' : 'Request Refund'}</button>
          )}

          {delivered && order.deliveryProofPhoto && (
            <div className="customer-pod-section">
              <button
                type="button"
                className="customer-pod-header"
                onClick={() => setProofExpanded((v) => !v)}
              >
                <span className="customer-pod-label">
                  <i className="fas fa-camera"></i>
                  <strong>View Successful Delivery Proof</strong>
                </span>
                <i className={`fas fa-chevron-${proofExpanded ? 'up' : 'down'}`}></i>
              </button>
              {proofExpanded && (
                <div className="customer-pod-body">
                  <p className="customer-pod-note">Photo taken by your rider when the order was delivered. Tap the photo to view full size.</p>
                  <button
                    type="button"
                    className="customer-pod-photo-btn"
                    onClick={openProofFull}
                    aria-label="View delivery proof full size"
                  >
                    <img
                      src={order.deliveryProofPhoto}
                      alt="Proof of delivery"
                      className="customer-pod-photo"
                    />
                    <span className="customer-pod-zoom" aria-hidden="true">
                      <i className="fas fa-search-plus"></i>
                    </span>
                  </button>
                  {order.deliveryConfirmedAt && (
                    <span className="customer-pod-time">
                      <i className="fas fa-clock"></i>{' '}
                      {new Date(order.deliveryConfirmedAt).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {isOutForDelivery && !isLbcOrder(order) && (
            <div className="rider-map-section">
              <div className="rider-map-section-title">
                <i className="fas fa-map-marked-alt"></i>
                <span>Real-Time Rider Location</span>
                <span className="rider-map-live-pill">LIVE</span>
              </div>
              <RiderMap orderId={order.orderId} riderName={order.riderInfo?.name} orderData={order} />
            </div>
          )}

          {!isGuest && isOutForDelivery && !isLbcOrder(order) && (
            <div className="customer-otp-section">
              {localOtp ? (
                <div className="otp-display-card">
                  <div className="otp-display-header">
                    <div className="otp-display-icon"><i className="fas fa-shield-alt"></i></div>
                    <div>
                      <strong>Your Delivery OTP</strong>
                      <p>Sent when your rider started delivery — also check your email. Give this code to the rider only when you receive your package.</p>
                    </div>
                  </div>
                  <div className="otp-code-display">{localOtp.split('').map((digit, i) => <span key={i} className="otp-digit">{digit}</span>)}</div>
                  <div className="otp-display-note"><i className="fas fa-info-circle"></i><span>Do not share this code until the parcel is in your hands.</span></div>
                </div>
              ) : (
                <div className="otp-generate-card">
                  <div className="otp-generate-header">
                    <div className="otp-generate-icon"><i className="fas fa-hourglass-half"></i></div>
                    <div>
                      <strong>Waiting for delivery OTP</strong>
                      <p>When your rider taps Notify / Out for Delivery, a 4-digit OTP is emailed to you and shown here automatically.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="tracking-timeline">
            <h3>Order Timeline</h3>
            <div className="timeline">
              {timelineSteps.map((step, index) => (
                <div key={index} className={`timeline-item ${step.completed ? 'completed' : ''} ${step.isCancelled ? 'cancelled-step' : ''}${step.actor ? ` actor-${step.actor}` : ''}`}>
                  <div className="timeline-marker"><i className={`fas ${step.icon}`}></i></div>
                  <div className="timeline-content">
                    <div className="timeline-label-row">
                      <h4>{step.label}</h4>
                      {step.actor && (
                        <span className={`timeline-actor-pill timeline-actor-${step.actor}`}>
                          {step.actor === 'customer' ? 'Customer' : step.actor === 'admin' ? 'Admin' : 'Rider'}
                        </span>
                      )}
                    </div>
                    {step.time && step.completed && <span className="timeline-timestamp"><i className="fas fa-clock"></i> {step.time}</span>}
                    <p className={step.completed ? 'timeline-desc-done' : 'timeline-desc-pending'}>{step.desc || (step.completed ? 'Completed' : 'Pending')}</p>
                    {step.isCancelled && step.cancelReason && <div className="timeline-cancel-reason"><div className="timeline-cancel-reason-label"><i className="fas fa-comment-alt"></i> Reason:</div><div className="timeline-cancel-reason-text">{step.cancelReason}</div></div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="order-items-timeline">
            <h3>Order Items</h3>
            {order.items?.map((item, index) => {
              const product = getProductById(item.id);
              const qty = item.quantity || item.qty || 1;
              const isPreOrder  = item.isPreOrder  || product?.isPreOrder;
              const releaseDate = item.releaseDate  || product?.releaseDate;
              return (
                <div key={index} className="order-item-timeline">
                  <div className="item-details">
                    <strong>{item.name || product?.name}</strong>
                    {isPreOrder && releaseDate && <span className="item-preorder-release"><i className="fas fa-calendar-alt"></i> Expected: {new Date(releaseDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</span>}
                    <span>Qty: {qty}</span>
                  </div>
                  <div className="item-price">₱{((item.price || product?.price || 0) * qty).toLocaleString()}</div>
                </div>
              );
            })}
            <div className="order-items-total"><strong>Total</strong><strong>₱{order.total?.toLocaleString()}</strong></div>
          </div>

        </div>
      </div>
    </div>
    {localProofOpen && order.deliveryProofPhoto && (
      <div
        className="order-lightbox customer-pod-lightbox"
        onClick={() => setLocalProofOpen(false)}
        role="dialog"
        aria-modal="true"
        aria-label="Delivery proof full size"
      >
        <button
          type="button"
          className="lightbox-close"
          onClick={() => setLocalProofOpen(false)}
          aria-label="Close"
        >
          <i className="fas fa-times"></i>
        </button>
        <img
          src={order.deliveryProofPhoto}
          alt="Proof of delivery"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>,
    getOverlayRoot() || document.body
  );
};

export default TrackOrder;
// src/components/RewardsModal.js
import React, { useState, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import { useAuth } from '../context/AuthContext';
import './RewardsModal.css';

const REWARDS = [
  { type: 'album',       label: 'Album',       icon: '💿', cost: 100, desc: 'Redeem for a free K-Pop album' },
  { type: 'photocard',   label: 'Photocard',   icon: '🃏', cost: 120, desc: 'Redeem for a free photocard set' },
  { type: 'lightstick',  label: 'Lightstick',  icon: '🪄', cost: 140, desc: 'Redeem for a free lightstick' },
  { type: 'accessories', label: 'Accessories', icon: '🎀', cost: 150, desc: 'Redeem for free accessories' },
];

const POINT_TIERS = [
  { label: 'Below ₱1,000',      points: 5  },
  { label: '₱1,000 – ₱1,999',  points: 10 },
  { label: '₱2,000 – ₱2,999',  points: 15 },
  { label: '₱3,000 – ₱4,999',  points: 20 },
  { label: '₱5,000 and above',  points: 25 },
];

/* ─────────────────────────────────────────────
   Product Picker Modal
───────────────────────────────────────────── */
const ProductPicker = ({ ticket, onClose, onConfirm }) => {
  const rewardInfo = REWARDS.find(r => r.type === ticket.rewardType);
  const products   = useQuery(api.rewards.getProductsByRewardType, { rewardType: ticket.rewardType }) ?? [];

  const [groupFilter,  setGroupFilter]  = useState('all');
  const [selectedProd, setSelectedProd] = useState(null);
  const [confirming,   setConfirming]   = useState(false);
  const [loading,      setLoading]      = useState(false);

  const groups = useMemo(() => {
    return [...new Set(products.map(p => p.kpopGroup).filter(Boolean))].sort();
  }, [products]);

  const filtered = useMemo(() => {
    if (groupFilter === 'all') return products;
    return products.filter(p => p.kpopGroup === groupFilter);
  }, [products, groupFilter]);

  const handleConfirm = async () => {
    if (!selectedProd) return;
    setLoading(true);
    try { await onConfirm(selectedProd); }
    finally { setLoading(false); }
  };

  if (confirming && selectedProd) {
    return (
      <div className="rm-picker-overlay" onClick={() => setConfirming(false)}>
        <div className="rm-picker-modal" onClick={e => e.stopPropagation()}>
          <div className="rm-picker-header">
            <button className="rm-picker-back" onClick={() => setConfirming(false)}>
              <i className="fas fa-arrow-left"></i>
            </button>
            <h3>Confirm Selection</h3>
            <button className="rm-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>
          <div className="rm-confirm-product-body">
            <div className="rm-confirm-product-icon">{rewardInfo?.icon}</div>
            <p className="rm-confirm-product-label">
              Using your <strong>{rewardInfo?.label} Ticket</strong> for:
            </p>
            <div className="rm-confirm-product-card">
              <img src={selectedProd.image} alt={selectedProd.name} className="rm-confirm-product-img" />
              <div className="rm-confirm-product-info">
                <span className="rm-confirm-product-name">{selectedProd.name}</span>
                {selectedProd.kpopGroup && (
                  <span className="rm-confirm-product-group">{selectedProd.kpopGroup}</span>
                )}
              </div>
            </div>
            <div className="rm-confirm-product-note">
              <i className="fas fa-info-circle"></i>
              Once confirmed, this ticket can no longer be changed.
            </div>
            <div className="rm-confirm-product-actions">
              <button className="rm-btn-primary" onClick={handleConfirm} disabled={loading}>
                {loading
                  ? <i className="fas fa-spinner fa-spin"></i>
                  : <><i className="fas fa-check"></i> Confirm</>}
              </button>
              <button className="rm-btn-secondary" onClick={() => setConfirming(false)} disabled={loading}>
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rm-picker-overlay" onClick={onClose}>
      <div className="rm-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="rm-picker-header">
          <button className="rm-picker-back" onClick={onClose}>
            <i className="fas fa-arrow-left"></i>
          </button>
          <h3>{rewardInfo?.icon} Choose a {rewardInfo?.label}</h3>
          <button className="rm-close" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>

        <div className="rm-picker-ticket-badge">
          <i className="fas fa-ticket-alt"></i>
          Ticket: <strong>{ticket.ticketCode}</strong>
        </div>

        {groups.length > 0 && (
          <div className="rm-picker-filters">
            <button
              className={`rm-picker-filter-btn ${groupFilter === 'all' ? 'active' : ''}`}
              onClick={() => setGroupFilter('all')}
            >All Groups</button>
            {groups.map(g => (
              <button
                key={g}
                className={`rm-picker-filter-btn ${groupFilter === g ? 'active' : ''}`}
                onClick={() => setGroupFilter(g)}
              >{g}</button>
            ))}
          </div>
        )}

        <div className="rm-picker-body">
          {products.length === 0 ? (
            <div className="rm-empty">
              <i className="fas fa-box-open"></i>
              <p>No products available for this reward.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rm-empty">
              <i className="fas fa-filter"></i>
              <p>No products for this group.</p>
            </div>
          ) : (
            <div className="rm-picker-grid">
              {filtered.map(p => (
                <div
                  key={p._id}
                  className={`rm-picker-product ${selectedProd?._id === p._id ? 'rm-picker-selected' : ''}`}
                  onClick={() => setSelectedProd(p)}
                >
                  <img src={p.image} alt={p.name} className="rm-picker-product-img" />
                  <div className="rm-picker-product-name">{p.name}</div>
                  {p.kpopGroup && <div className="rm-picker-product-group">{p.kpopGroup}</div>}
                  {selectedProd?._id === p._id && (
                    <div className="rm-picker-check"><i className="fas fa-check-circle"></i></div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedProd && (
          <div className="rm-picker-footer">
            <div className="rm-picker-selected-info">
              <img src={selectedProd.image} alt={selectedProd.name} className="rm-picker-selected-thumb" />
              <span>{selectedProd.name}</span>
            </div>
            <button className="rm-btn-primary rm-picker-confirm-btn" onClick={() => setConfirming(true)}>
              Use Ticket <i className="fas fa-arrow-right"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   Main RewardsModal
───────────────────────────────────────────── */
const RewardsModal = ({ onClose }) => {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [activeTab,    setActiveTab]    = useState('points');
  const [redeeming,    setRedeeming]    = useState(null);
  const [success,      setSuccess]      = useState(null);
  const [error,        setError]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [pickerTicket, setPickerTicket] = useState(null);
  const [pickSuccess,  setPickSuccess]  = useState(null);

  const userPoints       = useQuery(api.rewards.getUserPoints,      user?.email ? { email: user.email } : 'skip');
  const redemptions      = useQuery(api.rewards.getUserRedemptions, user?.email ? { email: user.email } : 'skip');
  const redeemPointsMut  = useMutation(api.rewards.redeemPoints);
  const selectProductMut = useMutation(api.rewards.selectProductForTicket);

  const totalPoints = userPoints?.totalPoints ?? 0;

  const handleRedeem = async (rewardType) => {
    setError(''); setLoading(true);
    try {
      const result = await redeemPointsMut({
        email:    user.email,
        userName: user.name || user.username || 'Customer',
        rewardType,
      });
      if (result?.success) {
        setSuccess({ rewardType, ticketCode: result.ticketCode });
        setRedeeming(null);
      } else if (result?.reason === 'insufficient_points') {
        setError('Not enough points to redeem this reward.');
      } else {
        setError('Redemption failed. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally { setLoading(false); }
  };

  const handleSelectProduct = async (product) => {
    if (!pickerTicket) return;
    const result = await selectProductMut({
      ticketCode:           pickerTicket.ticketCode,
      selectedProductId:    product._id,
      selectedProductName:  product.name,
      selectedProductImage: product.image,
      selectedProductGroup: product.kpopGroup,
    });
    if (result?.success) {
      setPickerTicket(null);
      setPickSuccess({ productName: product.name });
      // Switch to history tab to show the checkout button
      setActiveTab('history');
    }
  };

  // Navigate to checkout with reward item (free, shipping only)
  const handleProceedToCheckout = (ticket) => {
    onClose();
    navigate('/checkout', {
      state: {
        rewardOrder: {
          ticketCode:    ticket.ticketCode,
          rewardType:    ticket.rewardType,
          productId:     ticket.selectedProductId,
          productName:   ticket.selectedProductName,
          productImage:  ticket.selectedProductImage,
          productGroup:  ticket.selectedProductGroup,
        },
      },
    });
  };

  return (
    <>
      <div className="rm-overlay" onClick={onClose}>
        <div className="rm-modal" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="rm-header">
            <div className="rm-header-left">
              <div className="rm-header-icon">⭐</div>
              <div>
                <h2>DK Rewards</h2>
                <p>Earn points on every purchase</p>
              </div>
            </div>
            <button className="rm-close" onClick={onClose}><i className="fas fa-times"></i></button>
          </div>

          {/* Points Banner — single, no lifetime */}
          <div className="rm-points-banner">
            <div className="rm-points-main">
              <span className="rm-points-number">{totalPoints.toLocaleString()}</span>
              <span className="rm-points-label">Available Points</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="rm-tabs">
            {[
              { key: 'points',  icon: 'fa-star',       label: 'How to Earn' },
              { key: 'redeem',  icon: 'fa-gift',       label: 'Redeem' },
              { key: 'history', icon: 'fa-ticket-alt', label: 'My Tickets' },
            ].map(t => (
              <button
                key={t.key}
                className={`rm-tab ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => {
                  setActiveTab(t.key);
                  setSuccess(null); setError('');
                  setRedeeming(null); setPickSuccess(null);
                }}
              >
                <i className={`fas ${t.icon}`}></i> {t.label}
              </button>
            ))}
          </div>

          <div className="rm-body">

            {/* ── HOW TO EARN ── */}
            {activeTab === 'points' && (
              <div className="rm-earn-tab">
                <p className="rm-earn-desc">
                  Earn points every time your order is <strong>delivered</strong>. Points are based on your order total:
                </p>
                <div className="rm-tiers">
                  {POINT_TIERS.map((tier, i) => (
                    <div key={i} className="rm-tier-row">
                      <span className="rm-tier-range">{tier.label}</span>
                      <span className="rm-tier-pts"><strong>{tier.points}</strong> pts</span>
                    </div>
                  ))}
                </div>
                <div className="rm-earn-note">
                  <i className="fas fa-info-circle"></i>
                  Points are awarded once your order status is marked as <strong>Delivered</strong>.
                </div>
                {userPoints?.history?.length > 0 ? (
                  <>
                    <h4 className="rm-section-title">Points History</h4>
                    <div className="rm-history-list">
                      {userPoints.history.slice(0, 10).map((h, i) => (
                        <div key={i} className="rm-history-row">
                          <div className="rm-history-left">
                            <span className="rm-history-icon">⭐</span>
                            <div>
                              <span className="rm-history-order">Order #{h.orderId.slice(-8).toUpperCase()}</span>
                              <span className="rm-history-date">
                                {new Date(h.earnedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            </div>
                          </div>
                          <div className="rm-history-right">
                            <span className="rm-history-pts">+{h.points} pts</span>
                            <span className="rm-history-total">₱{h.orderTotal.toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rm-empty">
                    <i className="fas fa-star"></i>
                    <p>No points yet. Complete an order to start earning!</p>
                  </div>
                )}
              </div>
            )}

            {/* ── REDEEM ── */}
            {activeTab === 'redeem' && (
              <div className="rm-redeem-tab">
                {success ? (
                  <div className="rm-success-card">
                    <div className="rm-success-icon">🎉</div>
                    <h3>Ticket Earned!</h3>
                    <p>Go to <strong>My Tickets</strong> to choose your specific product and proceed to checkout.</p>
                    <div className="rm-ticket-box">
                      <span className="rm-ticket-label">Your Ticket Code</span>
                      <span className="rm-ticket-code">{success.ticketCode}</span>
                      <span className="rm-ticket-reward">
                        {REWARDS.find(r => r.type === success.rewardType)?.icon}{' '}
                        {REWARDS.find(r => r.type === success.rewardType)?.label}
                      </span>
                    </div>
                    <p className="rm-success-note">
                      <i className="fas fa-hand-pointer"></i> Pick your product in My Tickets then checkout — only shipping is charged!
                    </p>
                    <button className="rm-btn-primary" onClick={() => { setSuccess(null); setActiveTab('history'); }}>
                      Go to My Tickets
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="rm-redeem-desc">
                      Redeem your points for a free item. You'll pick the specific product and checkout — <strong>only shipping is charged</strong>.
                    </p>
                    {error && <div className="rm-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
                    <div className="rm-rewards-grid">
                      {REWARDS.map(r => {
                        const canAfford  = totalPoints >= r.cost;
                        const isSelected = redeeming === r.type;
                        return (
                          <div
                            key={r.type}
                            className={`rm-reward-card ${!canAfford ? 'rm-reward-locked' : ''} ${isSelected ? 'rm-reward-selected' : ''}`}
                          >
                            <div className="rm-reward-icon">{r.icon}</div>
                            <div className="rm-reward-name">{r.label}</div>
                            <div className="rm-reward-desc">{r.desc}</div>
                            <div className="rm-reward-cost">
                              <span className="rm-reward-pts">⭐ {r.cost} pts</span>
                              {!canAfford && (
                                <span className="rm-reward-need">Need {r.cost - totalPoints} more</span>
                              )}
                            </div>
                            {canAfford && !isSelected && (
                              <button className="rm-btn-redeem" onClick={() => setRedeeming(r.type)}>
                                Redeem
                              </button>
                            )}
                            {canAfford && isSelected && (
                              <div className="rm-confirm-row">
                                <span className="rm-confirm-text">Confirm?</span>
                                <button className="rm-btn-confirm" onClick={() => handleRedeem(r.type)} disabled={loading}>
                                  {loading ? <i className="fas fa-spinner fa-spin"></i> : 'Yes'}
                                </button>
                                <button className="rm-btn-cancel-sm" onClick={() => setRedeeming(null)}>No</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── MY TICKETS ── */}
            {activeTab === 'history' && (
              <div className="rm-tickets-tab">

                {pickSuccess && (
                  <div className="rm-pick-success-banner">
                    <i className="fas fa-check-circle"></i>
                    <span>
                      <strong>{pickSuccess.productName}</strong> linked! Now proceed to checkout below — only shipping will be charged.
                    </span>
                    <button onClick={() => setPickSuccess(null)}><i className="fas fa-times"></i></button>
                  </div>
                )}

                {redemptions?.length > 0 ? (
                  <div className="rm-tickets-list">
                    {redemptions.map((r, i) => {
                      const rewardInfo    = REWARDS.find(rw => rw.type === r.rewardType);
                      const hasProduct    = !!r.selectedProductId;
                      const checkedOut    = !!r.checkedOutOrderId;

                      return (
                        <div
                          key={i}
                          className={`rm-ticket-card ${
                            checkedOut   ? 'rm-ticket-checked-out' :
                            hasProduct   ? 'rm-ticket-linked' :
                            'rm-ticket-pending-pick'
                          }`}
                        >
                          <div className="rm-ticket-top">
                            <span className="rm-ticket-emoji">{rewardInfo?.icon}</span>
                            <div className="rm-ticket-info">
                              <span className="rm-ticket-name">{rewardInfo?.label}</span>
                              <span className="rm-ticket-code-sm">{r.ticketCode}</span>
                            </div>
                            {checkedOut ? (
                              <span className="rm-badge rm-badge-checked-out">
                                <i className="fas fa-shopping-bag"></i> Ordered
                              </span>
                            ) : hasProduct ? (
                              <span className="rm-badge rm-badge-linked">
                                <i className="fas fa-check-circle"></i> Ready
                              </span>
                            ) : (
                              <span className="rm-badge rm-badge-choose">
                                <i className="fas fa-hand-pointer"></i> Choose
                              </span>
                            )}
                          </div>

                          {/* Selected product preview */}
                          {hasProduct && (
                            <div className="rm-ticket-product-row">
                              <img
                                src={r.selectedProductImage}
                                alt={r.selectedProductName}
                                className="rm-ticket-product-thumb"
                              />
                              <div className="rm-ticket-product-info">
                                <span className="rm-ticket-product-name">{r.selectedProductName}</span>
                                {r.selectedProductGroup && (
                                  <span className="rm-ticket-product-group">{r.selectedProductGroup}</span>
                                )}
                              </div>
                              {/* FREE badge */}
                              <span className="rm-ticket-free-badge">FREE</span>
                            </div>
                          )}

                          <div className="rm-ticket-meta">
                            <span><i className="fas fa-star"></i> {r.pointsSpent} pts spent</span>
                            <span>
                              <i className="fas fa-calendar-alt"></i>{' '}
                              {new Date(r.requestedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>

                          {/* Checked-out order link */}
                          {checkedOut && (
                            <div className="rm-ticket-order-note">
                              <i className="fas fa-receipt"></i>
                              Order placed · #{r.checkedOutOrderId?.slice(-10).toUpperCase()}
                            </div>
                          )}

                          {/* Choose product CTA */}
                          {!hasProduct && (
                            <button
                              className="rm-btn-choose-product"
                              onClick={() => setPickerTicket(r)}
                            >
                              <i className="fas fa-box-open"></i> Choose Your {rewardInfo?.label}
                            </button>
                          )}

                          {/* Proceed to checkout CTA */}
                          {hasProduct && !checkedOut && (
                            <button
                              className="rm-btn-checkout-reward"
                              onClick={() => handleProceedToCheckout(r)}
                            >
                              <i className="fas fa-motorcycle"></i>
                              Proceed to Checkout
                              <span className="rm-btn-checkout-note">Shipping only</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rm-empty">
                    <i className="fas fa-ticket-alt"></i>
                    <p>No tickets yet. Redeem your points to get started!</p>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {pickerTicket && (
        <ProductPicker
          ticket={pickerTicket}
          onClose={() => setPickerTicket(null)}
          onConfirm={handleSelectProduct}
        />
      )}
    </>
  );
};

export default RewardsModal;
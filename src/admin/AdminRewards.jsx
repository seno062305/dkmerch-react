// src/admin/AdminRewards.jsx
import React, { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import './AdminRewards.css';

const REWARDS = {
  album:       { label: 'Album',       icon: '💿' },
  photocard:   { label: 'Photocard',   icon: '🃏' },
  lightstick:  { label: 'Lightstick',  icon: '🪄' },
  accessories: { label: 'Accessories', icon: '🎀' },
};

const AdminRewards = () => {
  const [activeTab, setActiveTab] = useState('redemptions');
  const [search,    setSearch]    = useState('');

  const redemptions = useQuery(api.rewards.getAllRedemptions);
  const allPoints   = useQuery(api.rewards.getAllUserPoints);

  const filtered = (redemptions || []).filter(r => {
    if (!search) return true;
    return (
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      r.userName.toLowerCase().includes(search.toLowerCase()) ||
      r.ticketCode.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="ar-page">
      <div className="ar-header">
        <div className="ar-header-left">
          <div className="ar-header-icon">⭐</div>
          <div>
            <h1 className="ar-title">Rewards Management</h1>
            <p className="ar-subtitle">View customer points and reward redemptions</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="ar-tabs">
        <button
          className={`ar-tab ${activeTab === 'redemptions' ? 'ar-tab--active' : ''}`}
          onClick={() => setActiveTab('redemptions')}
        >
          <i className="fas fa-history"></i> Redemptions
          <span className="ar-tab-count">{(redemptions || []).length}</span>
        </button>
        <button
          className={`ar-tab ${activeTab === 'points' ? 'ar-tab--active' : ''}`}
          onClick={() => setActiveTab('points')}
        >
          <i className="fas fa-star"></i> User Points
        </button>
      </div>

      {/* ── REDEMPTIONS TAB ── */}
      {activeTab === 'redemptions' && (
        <div className="ar-section">
          <div className="ar-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by name, email or code…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="ar-empty">
              <i className="fas fa-history"></i>
              <p>No redemptions found.</p>
            </div>
          ) : (
            <div className="ar-redemptions-list">
              {filtered.map(r => {
                const reward = REWARDS[r.rewardType] || { label: r.rewardType, icon: '🎁' };
                return (
                  <div key={r._id} className="ar-redemption-card">
                    <div className="ar-card-top">
                      <div className="ar-card-reward">
                        <span className="ar-reward-icon">{reward.icon}</span>
                        <div>
                          <span className="ar-reward-name">{reward.label}</span>
                          <span className="ar-ticket-code">{r.ticketCode}</span>
                        </div>
                      </div>
                      <span className="ar-badge ar-badge-redeemed">
                        <i className="fas fa-check-circle"></i> Redeemed
                      </span>
                    </div>

                    <div className="ar-card-details">
                      <div className="ar-detail-row">
                        <i className="fas fa-user"></i>
                        <span>{r.userName}</span>
                      </div>
                      <div className="ar-detail-row">
                        <i className="fas fa-envelope"></i>
                        <span>{r.email}</span>
                      </div>
                      <div className="ar-detail-row">
                        <i className="fas fa-star"></i>
                        <span>{r.pointsSpent} points spent</span>
                      </div>
                      <div className="ar-detail-row">
                        <i className="fas fa-calendar-alt"></i>
                        <span>{new Date(r.requestedAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── USER POINTS TAB ── */}
      {activeTab === 'points' && (
        <div className="ar-section">
          <div className="ar-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {(allPoints || []).length === 0 ? (
            <div className="ar-empty">
              <i className="fas fa-star"></i>
              <p>No users have earned points yet.</p>
            </div>
          ) : (
            <div className="ar-points-table-wrap">
              <table className="ar-points-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Available</th>
                    <th>Lifetime</th>
                    <th>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {(allPoints || [])
                    .filter(p =>
                      !search ||
                      p.email.toLowerCase().includes(search.toLowerCase()) ||
                      p.userName.toLowerCase().includes(search.toLowerCase())
                    )
                    .sort((a, b) => b.totalPoints - a.totalPoints)
                    .map((p, i) => (
                      <tr key={i}>
                        <td>
                          <div className="ar-user-cell">
                            <span className="ar-user-name">{p.userName}</span>
                            <span className="ar-user-email">{p.email}</span>
                          </div>
                        </td>
                        <td><span className="ar-pts-available">⭐ {p.totalPoints}</span></td>
                        <td><span className="ar-pts-lifetime">{p.lifetimePoints}</span></td>
                        <td><span className="ar-pts-orders">{p.history?.length ?? 0}</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminRewards;
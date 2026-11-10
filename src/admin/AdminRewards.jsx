// src/admin/AdminRewards.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import AdminPager, { fixedPageStyle } from './AdminPager';
import './AdminRewards.css';

const REWARDS = {
  album:       { label: 'Album',       icon: '💿' },
  photocard:   { label: 'Photocard',   icon: '🃏' },
  lightstick:  { label: 'Lightstick',  icon: '🪄' },
  accessories: { label: 'Accessories', icon: '🎀' },
};

const REWARDS_PAGE_SIZES = [8, 16, 24, 32, 40];

const AdminRewards = () => {
  const [redemptionSearch, setRedemptionSearch] = useState('');
  const [pointsSearch, setPointsSearch] = useState('');

  const [redemptionPageSize, setRedemptionPageSize] = useState(8);
  const [redemptionPage, setRedemptionPage] = useState(0);
  const [pointsPageSize, setPointsPageSize] = useState(8);
  const [pointsPage, setPointsPage] = useState(0);

  const redemptions = useQuery(api.rewards.getAllRedemptions);
  const allPoints   = useQuery(api.rewards.getAllUserPoints);

  const filteredRedemptions = useMemo(() => {
    return (redemptions || []).filter((r) => {
      if (!redemptionSearch) return true;
      const q = redemptionSearch.toLowerCase();
      return (
        r.email?.toLowerCase().includes(q)
        || r.userName?.toLowerCase().includes(q)
        || r.ticketCode?.toLowerCase().includes(q)
      );
    });
  }, [redemptions, redemptionSearch]);

  const filteredPoints = useMemo(() => {
    return (allPoints || [])
      .filter((p) => {
        if (!pointsSearch) return true;
        const q = pointsSearch.toLowerCase();
        return (
          p.email?.toLowerCase().includes(q)
          || p.userName?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [allPoints, pointsSearch]);

  useEffect(() => { setRedemptionPage(0); }, [redemptionSearch, redemptionPageSize, filteredRedemptions.length]);
  useEffect(() => { setPointsPage(0); }, [pointsSearch, pointsPageSize, filteredPoints.length]);

  const redemptionTotalPages = Math.max(1, Math.ceil(filteredRedemptions.length / redemptionPageSize) || 1);
  const safeRedemptionPage = Math.min(redemptionPage, redemptionTotalPages - 1);
  const pagedRedemptions = filteredRedemptions.slice(
    safeRedemptionPage * redemptionPageSize,
    safeRedemptionPage * redemptionPageSize + redemptionPageSize
  );

  const pointsTotalPages = Math.max(1, Math.ceil(filteredPoints.length / pointsPageSize) || 1);
  const safePointsPage = Math.min(pointsPage, pointsTotalPages - 1);
  const pagedPoints = filteredPoints.slice(
    safePointsPage * pointsPageSize,
    safePointsPage * pointsPageSize + pointsPageSize
  );

  return (
    <div className="ar-page">
      <div className="ar-header">
        <div className="ar-header-left">
          <div>
            <h1 className="ar-title">Rewards Management</h1>
          </div>
        </div>
      </div>

      <div className="ar-split">
        {/* ── LEFT: Redemptions ── */}
        <section className="ar-panel">
          <div className="ar-panel-head">
            <h2 className="ar-panel-title">
              <i className="fas fa-history"></i>
              Redemptions
              <span className="ar-panel-count">{(redemptions || []).length}</span>
            </h2>
          </div>

          <div className="ar-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by name, email or code…"
              value={redemptionSearch}
              onChange={(e) => setRedemptionSearch(e.target.value)}
            />
          </div>

          <div className="ar-panel-body">
            {filteredRedemptions.length === 0 ? (
              <div
                className="ar-empty dk-fixed-page dk-fixed-page--cards"
                style={fixedPageStyle(redemptionPageSize, { '--dk-row-h': '132px', '--dk-gap': '10px' })}
              >
                <i className="fas fa-history"></i>
                <p>No redemptions found.</p>
              </div>
            ) : (
              <>
                <div
                  className="ar-redemptions-list dk-fixed-page dk-fixed-page--cards"
                  style={fixedPageStyle(redemptionPageSize, { '--dk-row-h': '132px', '--dk-gap': '10px' })}
                >
                  {pagedRedemptions.map((r) => {
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
                <AdminPager
                  total={filteredRedemptions.length}
                  page={safeRedemptionPage}
                  pageSize={redemptionPageSize}
                  onPageChange={setRedemptionPage}
                  onPageSizeChange={setRedemptionPageSize}
                  pageSizeOptions={REWARDS_PAGE_SIZES}
                />
              </>
            )}
          </div>
        </section>

        {/* ── RIGHT: User Points ── */}
        <section className="ar-panel">
          <div className="ar-panel-head">
            <h2 className="ar-panel-title">
              <i className="fas fa-star"></i>
              User Points
              <span className="ar-panel-count">{(allPoints || []).length}</span>
            </h2>
          </div>

          <div className="ar-search">
            <i className="fas fa-search"></i>
            <input
              type="text"
              placeholder="Search by name or email…"
              value={pointsSearch}
              onChange={(e) => setPointsSearch(e.target.value)}
            />
          </div>

          <div className="ar-panel-body">
            {filteredPoints.length === 0 ? (
              <div
                className="ar-empty dk-fixed-page dk-fixed-page--table"
                style={fixedPageStyle(pointsPageSize, { '--dk-row-h': '57px', '--dk-head-h': '44px' })}
              >
                <i className="fas fa-star"></i>
                <p>No users have earned points yet.</p>
              </div>
            ) : (
              <>
                <div
                  className="ar-points-table-wrap dk-fixed-page dk-fixed-page--table"
                  style={fixedPageStyle(pointsPageSize, { '--dk-row-h': '57px', '--dk-head-h': '44px' })}
                >
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
                      {pagedPoints.map((p, i) => (
                        <tr key={p.email || i}>
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
                <AdminPager
                  total={filteredPoints.length}
                  page={safePointsPage}
                  pageSize={pointsPageSize}
                  onPageChange={setPointsPage}
                  onPageSizeChange={setPointsPageSize}
                  pageSizeOptions={REWARDS_PAGE_SIZES}
                />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminRewards;

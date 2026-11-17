import React from 'react';
import { createPortal } from 'react-dom';
import { getOverlayRoot } from '../utils/scrollLock';
import './RoleSwitchLoading.css';

/**
 * Full-screen transition when moving between Rider app and Shop.
 * direction: 'to-shop' | 'to-rider'
 */
const RoleSwitchLoading = ({ direction = 'to-shop' }) => {
  const toShop = direction === 'to-shop';
  return createPortal(
    <div className="role-switch-loading" role="status" aria-live="polite" aria-busy="true">
      <div className="role-switch-card">
        <div className="role-switch-icons" aria-hidden="true">
          <span className={`role-switch-icon ${toShop ? 'is-from' : 'is-to'}`}>
            <i className="fas fa-motorcycle" />
          </span>
          <span className="role-switch-arrow">
            <i className={`fas fa-arrow-${toShop ? 'right' : 'left'}`} />
          </span>
          <span className={`role-switch-icon ${toShop ? 'is-to' : 'is-from'}`}>
            <i className="fas fa-store" />
          </span>
        </div>
        <div className="role-switch-spinner" aria-hidden="true" />
        <h2>{toShop ? 'Switching to Shop…' : 'Switching to Rider…'}</h2>
        <p>
          {toShop
            ? 'Keeping your rider session parked. You can return anytime from the Rider icon.'
            : 'Keeping your shop session parked. Jump back to shopping anytime.'}
        </p>
      </div>
    </div>,
    getOverlayRoot() || document.body
  );
};

export default RoleSwitchLoading;

import React from 'react';

/** Custom icons from /public/icons */
export const DK_ICONS = {
  browseProducts: 'browse-products',
  favorite: 'favorite',
  activeDelivery: 'active-delivery',
  completed: 'completed',
  notification: 'notification',
  outForDelivery: 'out-for-delivery',
  customer: 'customer',
  livemap: 'livemap',
  adminStore: 'admin-store',
  refundItems: 'refund-items',
  avgOrderValue: 'avg-order-value',
  totalRefundValue: 'total-refund-value',
  totalSales: 'total-sales',
  assignedRider: 'assigned-rider',
  inventoryCosting: 'inventory-costing',
  totalOrders: 'total-orders',
  registeredUsers: 'registered-users',
  totalProducts: 'total-products',
  userDeactivated: 'user-deactivated',
  userSuspendedDeleted: 'user-suspended-deleted',
  userActive: 'user-active',
  shoppingBag: 'shopping-bag',
};

const DkIcon = ({
  name,
  className = '',
  invert = false,
  size,
  alt = '',
  style,
}) => {
  const src = `/icons/${name}.png`;
  const sized = size
    ? { width: size, height: size, ...style }
    : style;

  return (
    <img
      src={src}
      alt={alt}
      className={`dk-icon ${invert ? 'dk-icon--invert' : ''} ${className}`.trim()}
      style={sized}
      draggable={false}
    />
  );
};

export default DkIcon;

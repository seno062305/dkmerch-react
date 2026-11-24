import React from 'react';
import './OrderStatusLegend.css';

const STATUS_LEGEND = [
  { label: 'Pending', color: '#ffc107' },
  { label: 'Processing', color: '#0ea5e9' },
  { label: 'Shipped', color: '#6366f1' },
  { label: 'Out for Delivery', color: '#f97316' },
  { label: 'Completed', color: '#28a745' },
  { label: 'Failed Delivery', color: '#dc2626' },
  { label: 'Canceled', color: '#dc3545' },
];

/** Compact color key for order status badges. */
const OrderStatusLegend = ({ className = '' }) => (
  <div className={`order-status-legend ${className}`.trim()} aria-label="Order status color legend">
    <span className="order-status-legend-title">Status</span>
    <ul className="order-status-legend-list">
      {STATUS_LEGEND.map((item) => (
        <li key={item.label} className="order-status-legend-item">
          <span className="order-status-legend-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default OrderStatusLegend;
export { STATUS_LEGEND };

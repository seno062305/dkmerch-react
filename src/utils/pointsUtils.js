// src/utils/pointsUtils.js
// ── Shared helper used by Collections, WeverseSection, CartModal ──────────────

/**
 * Returns the points earned for a given order/product total.
 * Matches the exact tiers in convex/rewards.ts
 */
export const getPointsForPrice = (price) => {
  if (!price || price <= 0) return 0;
  if (price < 1000)              return 5;
  if (price >= 1000 && price < 2000) return 10;
  if (price >= 2000 && price < 3000) return 15;
  if (price >= 3000 && price < 5000) return 20;
  return 25; // 5000+
};

/**
 * Returns a short label like "+5 pts" for display on product cards.
 */
export const getPointsLabel = (price) => {
  const pts = getPointsForPrice(price);
  return `+${pts} pts`;
};

/**
 * Inline badge component — import and drop anywhere.
 * Usage: <PointsBadge price={product.price} />
 */
export const PointsBadge = ({ price, className = '' }) => {
  const pts = getPointsForPrice(price);
  if (!pts) return null;
  return (
    <span className={`points-badge ${className}`}>
      ⭐ +{pts} pts
    </span>
  );
};
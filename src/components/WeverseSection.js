import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCollectionProducts } from '../utils/productStorage';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm, shopActionConfirmRememberKey } from '../context/ConfirmContext';
import { PointsBadge } from '../utils/pointsUtils';
import {
  formatSaleEndLabel,
  formatSaleEndShort,
  shouldShowSaleBadge,
  shouldShowPreOrderBadge,
  hasDiscountedPrice,
  isNewArrival,
  getProductNewAnchorMs,
  toPhtMs,
} from '../utils/saleUtils';
import { goToCustomerTab } from '../utils/navScroll';
import './WeverseSection.css';


const getReleaseMs = (product) => {
  if (product?.releasedAt) return Number(product.releasedAt);
  if (!product?.releaseDate) return null;
  return toPhtMs(product.releaseDate, product.releaseTime);
};

const WeverseSection = ({ onProductClick, activePromo, highlightPromo }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();

  const products = useCollectionProducts();
  const wishlistItems = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const isWishlisted = (productOrId) =>
    wishlistItems.some((item) => {
      if (productOrId && typeof productOrId === 'object') {
        const ids = [productOrId._id, productOrId.id].map((x) => String(x || '').trim()).filter(Boolean);
        return ids.includes(String(item.productId || '').trim());
      }
      return String(item.productId) === String(productOrId || '');
    });

  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  // New Arrivals: max 8 cards; just-released (date+time) always first
  const NEW_ARRIVALS_LIMIT = 8;
  const nowMs = Date.now();
  const newArrivals = (products || [])
    .slice()
    .filter((p) => {
      // Within new-arrival window (by release date+time / createdAt), already out
      return isNewArrival(p, nowMs);
    })
    .sort((a, b) => {
      const tb = getProductNewAnchorMs(b);
      const ta = getProductNewAnchorMs(a);
      if (tb !== ta) return tb - ta;
      return (Number(b._creationTime) || 0) - (Number(a._creationTime) || 0);
    })
    .slice(0, NEW_ARRIVALS_LIMIT);

  const saleProducts = (products || [])
    .filter(
      (p) =>
        p.isSale === true ||
        (p.originalPrice && Number(p.originalPrice) > Number(p.price))
    )
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0))
    .slice(0, 8);

  const statsProductIds = useMemo(() => {
    const ids = [...newArrivals, ...saleProducts]
      .map((p) => String(p._id || p.id))
      .filter(Boolean);
    return [...new Set(ids)];
  }, [newArrivals, saleProducts]);

  const reviewMap =
    useQuery(
      api.productStats.getLatestReviewsForProducts,
      statsProductIds.length ? { productIds: statsProductIds } : 'skip'
    ) || {};
  const soldMap =
    useQuery(
      api.productStats.getSoldCountsForProducts,
      statsProductIds.length ? { productIds: statsProductIds } : 'skip'
    ) || {};

  const handleWishlistClick = async (e, product) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      showNotification('Please login to add to favorites', 'error', { dedupeKey: 'login-required' });
      window.dispatchEvent(new Event('openLoginModal'));
      return;
    }
    const alreadyWishlisted = isWishlisted(product);
    const ok = await confirm({
      title: alreadyWishlisted ? 'Remove favorite?' : 'Add to favorites?',
      message: alreadyWishlisted
        ? `Remove "${product.name}" from Favorites?`
        : `Add "${product.name}" to Favorites?`,
      confirmLabel: alreadyWishlisted ? 'Remove' : 'Add',
      variant: alreadyWishlisted ? 'danger' : 'primary',
      icon: 'fa-star',
      rememberKey: shopActionConfirmRememberKey(),
      rememberLabel: "Don't show again",
    });
    if (!ok) return;
    await toggleWishlist(product);
    showNotification(
      alreadyWishlisted ? 'Removed from favorites!' : 'Added to favorites!',
      'success'
    );
  };

  if ((!newArrivals || newArrivals.length === 0) && (!saleProducts || saleProducts.length === 0)) {
    return null;
  }

  const displayPromo = highlightPromo || activePromo;

  const renderProductCard = (product, { showNewBadge = false } = {}) => {
    const pid = product._id || product.id;
    const hasPromo = isPromoProduct(product);

    const stockQty = Number(product.stock ?? 0);
    const isOutOfStock = stockQty <= 0;

    const releaseMs = getReleaseMs(product);
    // Never show NEW on out-of-stock items
    const showNewBadgeResolved = !isOutOfStock && (showNewBadge || isNewArrival(product));

    const discountPct =
      product.originalPrice && Number(product.originalPrice) > Number(product.price)
        ? Math.round(
            ((Number(product.originalPrice) - Number(product.price)) /
              Number(product.originalPrice)) *
              100
          )
        : null;
    const isLowStock = !isOutOfStock && stockQty > 0 && stockQty <= 5;
    const isOnSale = shouldShowSaleBadge(product);
    const showPreOrder =
      shouldShowPreOrderBadge(product) &&
      !(releaseMs !== null && Date.now() >= releaseMs);

    return (
      <div
        key={pid}
        className={`wv-card ${hasPromo ? 'wv-card-promo' : ''} ${isOutOfStock ? 'wv-card-oos' : ''}`}
        onClick={() => onProductClick && onProductClick(product)}
      >
        {(showNewBadgeResolved || isOnSale || showPreOrder) ? (
          <div className="wv-badge-stack">
            {showNewBadgeResolved && <div className="wv-new-badge">NEW</div>}
            {isOnSale && (
              <div className="wv-sale-badge">
                <span>{discountPct ? `-${discountPct}%` : 'SALE'}</span>
                {(formatSaleEndShort(product) || formatSaleEndLabel(product)) && (
                  <span className="wv-sale-badge-end">
                    {formatSaleEndShort(product) || formatSaleEndLabel(product)}
                  </span>
                )}
              </div>
            )}
            {showPreOrder && <div className="wv-preorder-badge">PRE-ORDER</div>}
          </div>
        ) : null}

        {hasPromo && !showNewBadgeResolved && !isOnSale && (
          <div className="wv-promo-badge">
            <i className="fas fa-tag"></i> {activePromo.discount}% OFF
          </div>
        )}

        <button
          className={`wv-card-fav ${isWishlisted(product) ? 'active' : ''}`}
          onClick={(e) => handleWishlistClick(e, product)}
          title={isWishlisted(product) ? 'Remove from favorites' : 'Add to favorites'}
        >
          <i className={`fas fa-star ${isWishlisted(product) ? 'filled' : ''}`} aria-hidden="true"></i>
        </button>

        <div className="wv-card-img">
          <img src={product.image} alt={product.name} />
          {isOutOfStock && <div className="wv-oos-overlay">Out of Stock</div>}
        </div>

        <div className="wv-card-info">
          <div className="wv-card-group">{product.kpopGroup}</div>
          <div className="wv-card-name">{product.name}</div>
          <div className="wv-card-price-row">
            <span className={`wv-card-price-current${isOnSale ? ' sale' : ''}`}>
              ₱{Number(product.price)?.toLocaleString()}
            </span>
            {isOnSale && hasDiscountedPrice(product) && (
              <span className="wv-card-price-original">
                ₱{Number(product.originalPrice)?.toLocaleString()}
              </span>
            )}
            <PointsBadge price={product.price} />
          </div>
          {isOnSale && (formatSaleEndLabel(product) || formatSaleEndShort(product)) && (
            <div className="wv-sale-period">
              <i className="fas fa-clock"></i>
              <span>{formatSaleEndLabel(product) || formatSaleEndShort(product)}</span>
            </div>
          )}
          <div
            className={`wv-stock-badge ${
              isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-in'
            }`}
          >
            <i className="fas fa-box"></i>
            <span>
              {isOutOfStock
                ? 'Out of stock'
                : isLowStock
                  ? `Only ${stockQty} left`
                  : `${stockQty} in stock`}
            </span>
          </div>
          <div className="wv-card-sold">
            <i className="fas fa-shopping-bag"></i>
            <span>
              {typeof soldMap[pid] === 'number'
                ? `${soldMap[pid].toLocaleString()} sold`
                : '… sold'}
            </span>
          </div>
          {hasPromo && (
            <div className="wv-card-promo-hint">
              <i className="fas fa-ticket-alt"></i> Promo available · use{' '}
              <strong>{activePromo.code}</strong>
            </div>
          )}
          {/* Total average rating on card — same as product modal summary */}
          <div
            className={`wv-card-review${reviewMap[pid] ? '' : ' is-empty'}`}
            aria-hidden={!reviewMap[pid]}
          >
            {reviewMap[pid] ? (
              <div className="wv-card-review-top">
                <span className="wv-card-review-stars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <i
                      key={s}
                      className={`fas fa-star ${s <= Math.round(reviewMap[pid].rating) ? 'on' : ''}`}
                    />
                  ))}
                </span>
                <span className="wv-card-review-score">
                  {Number(reviewMap[pid].rating).toFixed(1)}
                </span>
                <span className="wv-card-review-count">
                  {reviewMap[pid].count} review{reviewMap[pid].count === 1 ? '' : 's'}
                </span>
              </div>
            ) : (
              <div className="wv-card-review-top">
                <span className="wv-card-review-stars" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <i key={s} className="fas fa-star" />
                  ))}
                </span>
                <span className="wv-card-review-count">No reviews</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {newArrivals.length > 0 && (
        <section className="weverse-section" id="new-arrivals">
          <div className="wv-section-header">
            <h2 className="wv-section-title">
              <i className="fas fa-bolt"></i> New Arrivals
            </h2>
          </div>
          <div className="wv-grid">
            {newArrivals.map((product) => renderProductCard(product, { showNewBadge: true }))}
          </div>
        </section>
      )}

      {saleProducts.length > 0 && (
        <section className="weverse-section" id="collections">
          <div className="wv-section-header">
            <h2 className="wv-section-title">
              <i className="fas fa-tag"></i> On Sale
            </h2>

            {displayPromo && (
              <div
                className={`wv-promo-banner ${highlightPromo ? 'wv-promo-banner-highlight' : ''}`}
              >
                <i className="fas fa-tag"></i>
                <span>
                  <strong>{displayPromo.name} Promo:</strong> Use code{' '}
                  <span className="wv-promo-code">{displayPromo.code}</span> for{' '}
                  {displayPromo.discount}% off {displayPromo.name} merch!
                  {highlightPromo && (
                    <span className="wv-promo-banner-sub">
                      {' '}
                      · Showing {highlightPromo.name} products only
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="wv-grid">
            {saleProducts.map((product) => renderProductCard(product))}
          </div>

          <div className="wv-see-all-row">
            <button
              type="button"
              className="wv-see-all"
              onClick={() => goToCustomerTab(navigate, location.pathname, '/collections')}
            >
              See All Items
            </button>
          </div>
        </section>
      )}

    </>
  );
};

export default WeverseSection;

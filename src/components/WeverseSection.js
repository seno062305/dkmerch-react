import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useCollectionProducts } from '../utils/productStorage';
import { useWishlist, useToggleWishlist } from '../context/wishlistUtils';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { PointsBadge } from '../utils/pointsUtils';
import { formatSaleRange, shouldShowSaleBadge, shouldShowPreOrderBadge, hasDiscountedPrice } from '../utils/saleUtils';
import LoginModal from './LoginModal';
import './WeverseSection.css';

const MAX_WISHLIST = 10;

const getReleaseMs = (product) => {
  if (!product.isPreOrder || !product.releaseDate) return null;
  const rt = product.releaseTime || '00:00';
  return new Date(`${product.releaseDate}T${rt}:00+08:00`).getTime();
};

const WeverseSection = ({ onProductClick, activePromo, highlightPromo }) => {
  const [showLoginModal, setShowLoginModal] = React.useState(false);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();

  const products = useCollectionProducts();
  const wishlistItems = useWishlist();
  const toggleWishlist = useToggleWishlist();

  const isWishlisted = (productId) =>
    wishlistItems.some((item) => item.productId === productId);

  const isPromoProduct = (product) => {
    if (!activePromo || !activePromo.isActive) return false;
    if (!activePromo.name) return false;
    return product.kpopGroup?.trim().toUpperCase() === activePromo.name.trim().toUpperCase();
  };

  // Newest products first on the homepage
  const newArrivals = (products || [])
    .slice()
    .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0))
    .slice(0, 8);

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
      setShowLoginModal(true);
      showNotification('Please login to add to favorites', 'error');
      return;
    }
    const pid = product._id || product.id;
    const alreadyWishlisted = isWishlisted(pid);
    if (!alreadyWishlisted && wishlistItems.length >= MAX_WISHLIST) {
      showNotification(`Favorites limit reached (max ${MAX_WISHLIST}). Remove an item first.`, 'error');
      return;
    }
    const ok = await confirm({
      title: alreadyWishlisted ? 'Remove favorite?' : 'Add to favorites?',
      message: alreadyWishlisted
        ? `Remove "${product.name}" from Favorites?`
        : `Add "${product.name}" to Favorites?`,
      confirmLabel: alreadyWishlisted ? 'Remove' : 'Add',
      variant: alreadyWishlisted ? 'danger' : 'primary',
      icon: 'fa-star',
    });
    if (!ok) return;
    toggleWishlist(product);
    showNotification(
      alreadyWishlisted
        ? `${product.name} removed from favorites!`
        : `${product.name} added to favorites!`,
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

    const releaseMs = getReleaseMs(product);
    const diffMs = releaseMs !== null ? Date.now() - releaseMs : -1;
    const showReleasedBadge = diffMs >= 0 && diffMs < 60 * 60 * 1000;

    const discountPct =
      product.originalPrice && Number(product.originalPrice) > Number(product.price)
        ? Math.round(
            ((Number(product.originalPrice) - Number(product.price)) /
              Number(product.originalPrice)) *
              100
          )
        : null;

    const stockQty = Number(product.stock ?? 0);
    const isOutOfStock = stockQty <= 0;
    const isLowStock = !isOutOfStock && stockQty > 0 && stockQty <= 5;
    const isOnSale = shouldShowSaleBadge(product);
    const showPreOrder =
      shouldShowPreOrderBadge(product) &&
      !(releaseMs !== null && Date.now() >= releaseMs);

    return (
      <div
        key={pid}
        className={`wv-card ${hasPromo ? 'wv-card-promo' : ''} ${showReleasedBadge ? 'wv-card-released' : ''} ${isOutOfStock ? 'wv-card-oos' : ''}`}
        onClick={() => onProductClick && onProductClick(product)}
      >
        {showReleasedBadge ? (
          <div className="wv-released-badge">
            <i className="fas fa-bolt"></i> Just Released
          </div>
        ) : showNewBadge ? (
          <div className="wv-new-badge">NEW</div>
        ) : (isOnSale || showPreOrder) ? (
          <div className="wv-badge-stack">
            {isOnSale && (
              <div className="wv-sale-badge">
                {discountPct ? `-${discountPct}%` : 'SALE'}
              </div>
            )}
            {showPreOrder && <div className="wv-preorder-badge">PRE-ORDER</div>}
          </div>
        ) : null}

        {hasPromo && !showReleasedBadge && !showNewBadge && (
          <div className="wv-promo-badge">
            <i className="fas fa-tag"></i> {activePromo.discount}% OFF
          </div>
        )}

        <button
          className={`wv-card-fav ${isWishlisted(pid) ? 'active' : ''}`}
          onClick={(e) => handleWishlistClick(e, product)}
          title={isWishlisted(pid) ? 'Remove from favorites' : 'Add to favorites'}
        >
          <i className={`fas fa-star ${isWishlisted(pid) ? 'filled' : ''}`} aria-hidden="true"></i>
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
            {hasDiscountedPrice(product) && (
              <span className="wv-card-price-original">
                ₱{Number(product.originalPrice)?.toLocaleString()}
              </span>
            )}
            <PointsBadge price={product.price} />
          </div>
          {isOnSale && formatSaleRange(product) && (
            <div className="wv-sale-period">
              <i className="fas fa-clock"></i>
              <span>{formatSaleRange(product)}</span>
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
          {reviewMap[pid] && (
            <div className="wv-card-review">
              <div className="wv-card-review-top">
                <span className="wv-card-review-stars">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <i
                      key={s}
                      className={`fas fa-star ${s <= reviewMap[pid].rating ? 'on' : ''}`}
                    />
                  ))}
                </span>
                <span className="wv-card-review-count">
                  {reviewMap[pid].count} review{reviewMap[pid].count === 1 ? '' : 's'}
                </span>
              </div>
              <p className="wv-card-review-text">
                {reviewMap[pid].review.length > 42
                  ? `${reviewMap[pid].review.slice(0, 42).trim()}…`
                  : reviewMap[pid].review}
              </p>
              {reviewMap[pid].review.length > 42 && (
                <button
                  type="button"
                  className="wv-card-review-more"
                  onClick={(e) => {
                    e.stopPropagation();
                    onProductClick?.(product);
                  }}
                >
                  See more
                </button>
              )}
            </div>
          )}
          {hasPromo && (
            <div className="wv-card-promo-hint">
              <i className="fas fa-ticket-alt"></i> Promo available · use{' '}
              <strong>{activePromo.code}</strong>
            </div>
          )}
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
            <p className="wv-section-sub">Latest drops — newest products first</p>
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
            <p className="wv-section-sub">Limited time discounts on selected K-Pop merch</p>

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
            <button className="wv-see-all" onClick={() => navigate('/collections')}>
              See All Items
            </button>
          </div>
        </section>
      )}

      {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} />}
    </>
  );
};

export default WeverseSection;

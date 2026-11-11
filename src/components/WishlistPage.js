import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './WishlistPage.css';
import { useWishlist, useRemoveFromWishlist } from '../context/wishlistUtils';
import { useAddToCart } from '../context/cartUtils';
import { useNotification } from '../context/NotificationContext';
import { useConfirm, shopActionConfirmRememberKey } from '../context/ConfirmContext';
import { useProducts, usePreOrderProducts } from '../utils/productStorage';
import { formatSaleEndLabel, formatSaleEndShort, shouldShowSaleBadge, shouldShowPreOrderBadge, hasDiscountedPrice } from '../utils/saleUtils';
import { useCloseOnHistoryBack } from '../hooks/useCloseOnHistoryBack';

const MAX_WISHLIST = 10;

const WishlistPage = ({ onProductClick }) => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const { confirm } = useConfirm();
  const [lightboxImg, setLightboxImg] = useState(null);
  useCloseOnHistoryBack(!!lightboxImg, () => setLightboxImg(null), 'wishlistLightbox');

  const regularProducts = useProducts() || [];
  const preOrderProducts = usePreOrderProducts() || [];
  const catalogById = useMemo(() => {
    const map = new Map();
    [...regularProducts, ...preOrderProducts].forEach((p) => {
      const id = String(p._id || p.id || '');
      if (id) map.set(id, p);
    });
    return map;
  }, [regularProducts, preOrderProducts]);

  const resolveLive = (item) => {
    const live = catalogById.get(String(item.productId)) || null;
    return {
      ...item,
      ...(live || {}),
      productId: item.productId,
      _id: live?._id || item.productId,
      id: live?._id || item.productId,
      name: live?.name || item.name,
      price: live?.price ?? item.price,
      image: live?.image || item.image,
      stock: Number(live?.stock ?? item.stock ?? 0),
      isPreOrder: !!(live?.isPreOrder ?? item.isPreOrder),
      isSale: !!(live?.isSale ?? item.isSale),
      originalPrice: live?.originalPrice ?? item.originalPrice,
      releaseDate: live?.releaseDate || item.releaseDate,
      releaseTime: live?.releaseTime || item.releaseTime,
      status: live?.status || item.status,
      category: live?.category || item.category,
      group: live?.group || live?.kpopGroup || item.group,
      kpopGroup: live?.kpopGroup || item.group,
      description: live?.description || item.description,
    };
  };

  const openProduct = (item) => {
    if (!onProductClick || !item) return;
    const live = resolveLive(item);
    onProductClick(live);
  };

  const wishlistItems = useWishlist();
  const removeFromWishlist = useRemoveFromWishlist();
  const addToCart = useAddToCart();

  // ✅ Convex already returns desc order (latest first) — just limit to 10
  const displayItems = (wishlistItems || []).slice(0, MAX_WISHLIST).map(resolveLive);
  const count = displayItems.length;

  const handleRemoveFromWishlist = async (productId, productName) => {
    const ok = await confirm({
      title: 'Remove favorite?',
      message: `Remove "${productName}" from your favorites?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    removeFromWishlist(productId);
    showNotification('Removed from favorites', 'success');
  };

  const handleAddToCart = async (item) => {
    if (Number(item.stock) <= 0) {
      showNotification('Out of stock — favorite only for now.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Add to cart?',
      message: `Add "${item.name}" to cart?\n\nPrice: ₱${item.price?.toLocaleString()}`,
      confirmLabel: 'Add to Cart',
      variant: 'primary',
      icon: 'fa-shopping-cart',
      rememberKey: shopActionConfirmRememberKey(),
      rememberLabel: "Don't show again",
    });
    if (!ok) return;
    addToCart({
      id: item.productId,
      _id: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      stock: item.stock,
    });
    showNotification('Added to cart successfully', 'success');
  };

  const handleBuyNow = async (item) => {
    if (Number(item.stock) <= 0) {
      showNotification('Out of stock — favorite only for now.', 'warning');
      return;
    }
    const ok = await confirm({
      title: 'Buy now?',
      message: `Buy "${item.name}" now?\n\nPrice: ₱${item.price?.toLocaleString()}`,
      confirmLabel: 'Buy Now',
      variant: 'primary',
      icon: 'fa-bolt',
      rememberKey: shopActionConfirmRememberKey(),
      rememberLabel: "Don't show again",
    });
    if (!ok) return;
    const productId = String(item.productId);
    const result = await addToCart({
      id: productId,
      _id: productId,
      name: item.name,
      price: item.price,
      image: item.image,
      stock: item.stock,
      qty: 1,
    });
    navigate('/checkout', {
      state: {
        selectedCartIds: result?.cartItemId ? [result.cartItemId] : undefined,
        buyNowProductId: productId,
        buyNowItem: {
          _id: result?.cartItemId || `buynow-${productId}`,
          productId,
          name: item.name,
          price: item.price,
          image: item.image,
          qty: 1,
        },
      },
    });
  };

  const handleClearWishlist = async () => {
    const ok = await confirm({
      title: 'Clear favorites?',
      message: 'Are you sure you want to clear all your favorites?',
      confirmLabel: 'Clear All',
      variant: 'danger',
    });
    if (!ok) return;
    wishlistItems.forEach(item => removeFromWishlist(item.productId));
    showNotification('Favorites cleared', 'success');
  };

  return (
    <main className="wishlist-main">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">My Favorites</h1>
          <p className="page-description">Your saved K-Pop merch picks — ready to order anytime!</p>
        </div>
      </div>

      <div className="container">
        <section className="wishlist-page">
          {count === 0 ? (
            <div className="orders-empty">
              <i className="fas fa-star" style={{ fontSize: 48, color: '#f5a623' }} aria-hidden="true"></i>
              <h3>No favorites yet</h3>
              <p>Click the star on any product to save it here.</p>
              <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                <i className="fas fa-th-large" aria-hidden="true"></i> Browse Products
              </button>
            </div>
          ) : (
            <>
              {/* ✅ Count bar with x/10 indicator */}
              <div className="wishlist-count-bar">
                <i className="fas fa-star" style={{ color: '#f5a623' }} aria-hidden="true"></i>
                <span>{count} favorite{count !== 1 ? 's' : ''}</span>
                <span className="wishlist-slot-indicator">
                  <span className={`wishlist-slot-count ${count >= MAX_WISHLIST ? 'full' : ''}`}>
                    {count}/{MAX_WISHLIST}
                  </span>
                  {count >= MAX_WISHLIST && (
                    <span className="wishlist-slot-full-label">Limit reached</span>
                  )}
                </span>
              </div>

              <div className="orders-grid">
                {displayItems.map(item => {
                  const oos = Number(item.stock) <= 0;
                  const showSale = shouldShowSaleBadge(item);
                  const showPreOrder = shouldShowPreOrderBadge(item);
                  return (
                  <div
                    key={item.productId}
                    className={`order-card wishlist-card-clickable${oos ? ' wishlist-card-oos' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProduct(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openProduct(item);
                      }
                    }}
                  >
                    <div
                      className="order-card-img"
                      onClick={(e) => {
                        e.stopPropagation();
                        openProduct(item);
                      }}
                      title="View product"
                    >
                      {item.image
                        ? <img src={item.image} alt={item.name} />
                        : <i className="fas fa-box order-no-img"></i>
                      }
                      {(showSale || showPreOrder) && (
                        <div className="wishlist-badge-stack">
                          {showSale && (
                            <span className="wishlist-sale-badge">
                              <span>SALE</span>
                              {(formatSaleEndShort(item) || formatSaleEndLabel(item)) && (
                                <span className="wishlist-sale-badge-end">
                                  {formatSaleEndShort(item) || formatSaleEndLabel(item)}
                                </span>
                              )}
                            </span>
                          )}
                          {showPreOrder && <span className="wishlist-preorder-badge">PRE-ORDER</span>}
                        </div>
                      )}
                      <span className="wishlist-star-badge">
                        <i className="fas fa-star" aria-hidden="true"></i>
                      </span>
                      {oos && <div className="wishlist-oos-overlay">Out of Stock</div>}
                    </div>

                    <div className="order-card-info">
                      <p className="order-card-name" style={{ minHeight: 'unset', marginBottom: '6px' }}>
                        {item.name}
                      </p>
                      <div className="order-card-price-row" style={{ marginBottom: '8px' }}>
                        <span className={`order-card-price${showSale ? ' sale' : ''}`}>₱{item.price?.toLocaleString()}</span>
                        {showSale && hasDiscountedPrice(item) && (
                          <span className="order-card-price-original">₱{Number(item.originalPrice).toLocaleString()}</span>
                        )}
                      </div>
                      <p className={`wishlist-stock-line ${oos ? 'out' : ''}`}>
                        {oos ? 'Out of stock' : `${item.stock} in stock`}
                      </p>
                      <div className="wishlist-card-actions">
                        <button
                          type="button"
                          className="btn btn-add-cart wishlist-action-btn"
                          disabled={oos}
                          onClick={(e) => { e.stopPropagation(); handleAddToCart(item); }}
                        >
                          <i className="fas fa-shopping-cart"></i> Add to Cart
                        </button>
                        <button
                          type="button"
                          className="btn btn-buy-now wishlist-action-btn"
                          disabled={oos}
                          onClick={(e) => { e.stopPropagation(); handleBuyNow(item); }}
                        >
                          <i className="fas fa-bolt"></i> Buy Now
                        </button>
                      </div>
                      <button
                        type="button"
                        className="order-remove-btn"
                        onClick={(e) => { e.stopPropagation(); handleRemoveFromWishlist(item.productId, item.name); }}
                      >
                        <i className="fas fa-trash-alt"></i> Remove
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>

              <div className="wishlist-footer-actions">
                <button className="btn btn-primary" onClick={() => navigate('/collections')}>
                  <i className="fas fa-th-large" aria-hidden="true"></i> Continue Shopping
                </button>
                <button className="btn btn-outline-danger" onClick={handleClearWishlist}>
                  <i className="fas fa-trash"></i> Clear Favorites
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {lightboxImg && (
        <div className="order-lightbox" onClick={() => setLightboxImg(null)}>
          <button className="lightbox-close" onClick={() => setLightboxImg(null)}>
            <i className="fas fa-times"></i>
          </button>
          <img src={lightboxImg} alt="Product" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </main>
  );
};

export default WishlistPage;

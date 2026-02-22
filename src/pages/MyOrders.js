import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUserOrders } from '../utils/orderStorage';
import { useProducts } from '../utils/productStorage';
import './MyOrders.css';

const MyOrders = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [filter, setFilter] = useState('all');
  const [lightboxImg, setLightboxImg] = useState(null);

  const orders   = useUserOrders(user?.email) || [];
  const products = useProducts() || [];

  if (isAuthenticated === false && !user) return null;

  const getProductById = (id) => products.find(p => p._id === id || p.id === id);

  const getStatusClass = (status) => {
    const map = {
      'Processing': 'status-processing', 'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped', 'In Transit': 'status-transit',
      'Out for Delivery': 'status-delivery', 'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled', 'pending': 'status-processing',
      'confirmed': 'status-confirmed', 'shipped': 'status-shipped',
      'out_for_delivery': 'status-delivery', 'completed': 'status-delivered',
      'cancelled': 'status-cancelled',
    };
    return map[status] || 'status-processing';
  };

  const getDisplayStatus = (order) => {
    const s = order.orderStatus || order.status || 'pending';
    const labels = {
      pending: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery', completed: 'Delivered',
      cancelled: 'Cancelled', Processing: 'Processing', Confirmed: 'Confirmed',
      Shipped: 'Shipped', Delivered: 'Delivered', Cancelled: 'Cancelled',
    };
    return labels[s] || s;
  };

  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter(o => getDisplayStatus(o).toLowerCase() === filter.toLowerCase());

  return (
    <main className="orders-page-main">
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">My Orders</h1>
          <p className="page-description">Track and manage your orders</p>
        </div>
      </div>
      <div className="container">
        <section className="orders-page">
          <div className="orders-filter">
            {[
              { key: 'all', label: `All Orders (${orders.length})` },
              { key: 'processing', label: 'Processing' },
              { key: 'shipped', label: 'Shipped' },
              { key: 'delivered', label: 'Delivered' },
            ].map(f => (
              <button
                key={f.key}
                className={`filter-btn ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredOrders.length === 0 ? (
            <div className="orders-empty">
              <i className="fas fa-shopping-bag"></i>
              <h3>No orders found</h3>
              <p>{filter === 'all' ? "You haven't placed any orders yet." : `No ${filter} orders.`}</p>
              <button className="btn btn-primary" onClick={() => navigate('/')}>Start Shopping</button>
            </div>
          ) : (
            <div className="orders-grid">
              {filteredOrders.map(order => {
                const orderDate = order._creationTime ? new Date(order._creationTime) : null;
                const orderStatus = getDisplayStatus(order);
                const statusKey = order.orderStatus || order.status || 'pending';
                const firstItem = order.items?.[0];
                const firstProduct = firstItem ? getProductById(firstItem.id) : null;
                const imgSrc = firstItem?.image || firstProduct?.image;
                const itemName = firstItem?.name || firstProduct?.name;
                const extraCount = (order.items?.length || 1) - 1;

                return (
                  <div key={order._id} className="order-card">
                    {/* Clickable image */}
                    <div
                      className="order-card-img"
                      onClick={() => imgSrc && setLightboxImg(imgSrc)}
                      title="Click to view image"
                    >
                      {imgSrc
                        ? <img src={imgSrc} alt={itemName} />
                        : <i className="fas fa-box order-no-img"></i>
                      }
                      {imgSrc && (
                        <div className="order-img-zoom"><i className="fas fa-search-plus"></i></div>
                      )}
                      {extraCount > 0 && (
                        <span className="order-extra-badge">+{extraCount}</span>
                      )}
                      <span className={`order-status-overlay ${getStatusClass(statusKey)}`}>
                        {orderStatus}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="order-card-info">
                      <p className="order-card-id">Order #{order.orderId?.slice(-8) || 'N/A'}</p>
                      <p className="order-card-name">
                        {itemName}
                        {extraCount > 0 && <span className="order-and-more"> +{extraCount} more</span>}
                      </p>

                      {/* Status + date text row */}
                      <div className="order-card-meta">
                        <span className={`order-status-text ${getStatusClass(statusKey)}`}>
                          <i className="fas fa-circle"></i> {orderStatus}
                        </span>
                        {orderDate && (
                          <span className="order-card-date">
                            <i className="fas fa-calendar-alt"></i>
                            {orderDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        )}
                      </div>

                      {/* Total */}
                      <div className="order-card-price-row">
                        <span className="order-card-price">₱{order.total?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Lightbox */}
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

export default MyOrders;
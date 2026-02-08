import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './MyOrders.css';
import { getOrdersByUser } from '../utils/orderStorage';
import { getProducts } from '../utils/productStorage';

const MyOrders = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    // ✅ Redirect if not logged in
    if (!isAuthenticated || !user) {
      navigate('/');
      return;
    }

    loadOrders();

    const handleStorageChange = () => {
      loadOrders();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('orderUpdated', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('orderUpdated', handleStorageChange);
    };
  }, [isAuthenticated, user, navigate]);

  const loadOrders = () => {
    if (!user || !user.email) {
      setOrders([]);
      return;
    }

    // ✅ GET ONLY THIS USER'S ORDERS
    const userOrders = getOrdersByUser(user.email);
    const allProducts = getProducts();
    
    setOrders(userOrders);
    setProducts(allProducts);
  };

  const getProductById = (id) => {
    return products.find(p => p.id === id);
  };

  const getStatusClass = (status) => {
    const statusMap = {
      'Processing': 'status-processing',
      'Confirmed': 'status-confirmed',
      'Shipped': 'status-shipped',
      'In Transit': 'status-transit',
      'Out for Delivery': 'status-delivery',
      'Delivered': 'status-delivered',
      'Cancelled': 'status-cancelled',
      'pending': 'status-processing',
      'confirmed': 'status-confirmed',
      'shipped': 'status-shipped',
      'completed': 'status-delivered',
      'cancelled': 'status-cancelled',
    };
    return statusMap[status] || 'status-processing';
  };

  const filteredOrders = filter === 'all' 
    ? orders 
    : orders.filter(order => {
        const orderStatus = (order.status || order.orderStatus || '').toLowerCase();
        const filterStatus = filter.toLowerCase();
        return orderStatus === filterStatus;
      });

  return (
    <main>
      <div className="page-header">
        <div className="container">
          <h1 className="page-title">My Orders</h1>
          <p className="page-description">Track and manage your orders</p>
        </div>
      </div>

      <div className="container">
        <section className="orders-page">
          <div className="orders-filter">
            <button 
              className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All Orders ({orders.length})
            </button>
            <button 
              className={`filter-btn ${filter === 'processing' ? 'active' : ''}`}
              onClick={() => setFilter('processing')}
            >
              Processing
            </button>
            <button 
              className={`filter-btn ${filter === 'shipped' ? 'active' : ''}`}
              onClick={() => setFilter('shipped')}
            >
              Shipped
            </button>
            <button 
              className={`filter-btn ${filter === 'delivered' ? 'active' : ''}`}
              onClick={() => setFilter('delivered')}
            >
              Delivered
            </button>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="orders-empty">
              <i className="fas fa-shopping-bag"></i>
              <h3>No orders found</h3>
              <p>
                {filter === 'all' 
                  ? "You haven't placed any orders yet."
                  : `You don't have any ${filter} orders.`}
              </p>
              <button className="btn btn-primary" onClick={() => navigate('/')}>
                Start Shopping
              </button>
            </div>
          ) : (
            <div className="orders-list">
              {filteredOrders.map(order => {
                const orderId = order.orderId || order.id;
                const orderDate = order.date || order.createdAt;
                const orderStatus = order.status || order.orderStatus || 'Processing';
                const orderTotal = order.total || 0;

                return (
                  <div key={orderId} className="order-card">
                    <div className="order-header">
                      <div className="order-info">
                        <h3>Order #{orderId?.slice(-8) || 'N/A'}</h3>
                        <p className="order-date">
                          <i className="fas fa-calendar"></i>
                          {orderDate 
                            ? new Date(orderDate).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric'
                              })
                            : 'N/A'
                          }
                        </p>
                      </div>
                      <div className={`order-status ${getStatusClass(orderStatus)}`}>
                        {orderStatus}
                      </div>
                    </div>

                    <div className="order-items">
                      {order.items && order.items.map((item, index) => {
                        const product = getProductById(item.id || item.productId);
                        if (!product) return null;
                        
                        return (
                          <div key={index} className="order-item">
                            <div className="order-item-image">
                              <img src={product.image} alt={product.name} />
                            </div>
                            <div className="order-item-details">
                              <h4>{product.name}</h4>
                              <p className="order-item-group">{product.kpopGroup}</p>
                              <p className="order-item-quantity">Quantity: {item.quantity}</p>
                            </div>
                            <div className="order-item-price">
                              ₱{(product.price * item.quantity).toLocaleString()}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="order-footer">
                      <div className="order-total">
                        <span>Total Amount:</span>
                        <span className="total-price">₱{orderTotal.toLocaleString()}</span>
                      </div>
                      <div className="order-actions">
                        <button 
                          className="btn btn-outline btn-small"
                          onClick={() => navigate(`/track-order?order=${orderId}`)}
                        >
                          <i className="fas fa-truck"></i> Track Order
                        </button>
                        {(orderStatus === 'Delivered' || orderStatus === 'completed') && (
                          <button className="btn btn-primary btn-small">
                            <i className="fas fa-redo"></i> Buy Again
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
};

export default MyOrders;
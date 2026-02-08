const ORDERS_KEY = 'dkmerch_orders';

/* GET ALL ORDERS (ADMIN ONLY) */
export const getOrders = () => {
  try {
    const data = localStorage.getItem(ORDERS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/* ✅ GET ORDERS BY USER EMAIL - FOR REGULAR USERS */
export const getOrdersByUser = (userEmail) => {
  try {
    if (!userEmail || !userEmail.trim()) {
      return [];
    }
    
    const allOrders = getOrders();
    const products = JSON.parse(localStorage.getItem('dkmerch_products')) || [];
    
    // Filter orders that belong to this user
    const userOrders = allOrders.filter(order => {
      // Check if email matches (case-insensitive)
      if (!order.email || order.email.toLowerCase() !== userEmail.toLowerCase()) {
        return false;
      }
      
      // Check if order has valid items
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
        return false;
      }
      
      // Check if at least one item exists in products
      const hasValidProduct = order.items.some(item => {
        const product = products.find(p => p.id === item.id);
        return product !== undefined;
      });
      
      return hasValidProduct;
    });
    
    // Sort by date (newest first)
    return userOrders.sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0);
      const dateB = new Date(b.date || b.createdAt || 0);
      return dateB - dateA;
    });
  } catch {
    return [];
  }
};

/* ✅ GET ONLY VALID ORDERS (with items and products) - FOR ADMIN */
export const getValidOrders = () => {
  try {
    const orders = getOrders();
    const products = JSON.parse(localStorage.getItem('dkmerch_products')) || [];
    
    // Filter orders that have valid items
    return orders.filter(order => {
      // Check if order has orderId (important for admin display)
      if (!order.orderId && !order.id) {
        return false;
      }
      
      // Check if order has items array and at least one item
      if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
        return false;
      }
      
      // Check if at least one item exists in products
      const hasValidProduct = order.items.some(item => {
        const product = products.find(p => p.id === item.id);
        return product !== undefined;
      });
      
      return hasValidProduct;
    });
  } catch {
    return [];
  }
};

/* SAVE ORDER */
export const saveOrder = (order) => {
  const orders = getOrders();
  const newOrder = {
    id: order.orderId || `DK-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    date: new Date().toISOString(),
    status: 'Processing',
    ...order,
  };
  
  orders.unshift(newOrder); // Add to beginning of array (newest first)
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
  window.dispatchEvent(new Event('storage'));
  
  return newOrder;
};

/* GET ORDER BY ID */
export const getOrderById = (orderId) => {
  const orders = getOrders();
  return orders.find(order => order.id === orderId || order.orderId === orderId);
};

/* ✅ GET ORDER BY ID AND EMAIL - FOR USER VERIFICATION */
export const getOrderByIdAndEmail = (orderId, email) => {
  try {
    if (!orderId || !email) {
      return null;
    }
    
    const orders = getOrders();
    const order = orders.find(order => 
      (order.id === orderId || order.orderId === orderId) && 
      order.email && 
      order.email.toLowerCase() === email.toLowerCase()
    );
    
    return order || null;
  } catch {
    return null;
  }
};

/* ✅ GET ORDERS BY EMAIL - NEW FUNCTION */
export const getOrdersByEmail = (email) => {
  return getOrdersByUser(email);
};

/* UPDATE ORDER STATUS */
export const updateOrderStatus = (orderId, status) => {
  const orders = getOrders();
  const updatedOrders = orders.map(order =>
    (order.id === orderId || order.orderId === orderId) ? { ...order, status } : order
  );
  localStorage.setItem(ORDERS_KEY, JSON.stringify(updatedOrders));
  window.dispatchEvent(new Event('storage'));
};

/* ✅ GET VALID ORDERS COUNT */
export const getOrdersCount = () => {
  return getValidOrders().length;
};

/* ORDER STATUSES */
export const ORDER_STATUS = {
  PROCESSING: 'Processing',
  CONFIRMED: 'Confirmed',
  SHIPPED: 'Shipped',
  IN_TRANSIT: 'In Transit',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};
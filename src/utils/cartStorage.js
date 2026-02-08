const CART_KEY = 'dkmerch_cart';
const PRODUCTS_KEY = 'dkmerch_products';

/* GET CART */
export const getCart = () => {
  try {
    const data = localStorage.getItem(CART_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/* CLEAN INVALID ITEMS */
const cleanCart = (cart) => {
  const products = JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || [];
  const validIds = products.map(p => p.id);
  return cart.filter(item => validIds.includes(item.id));
};

/* SAVE CART */
export const saveCart = (cart) => {
  const cleaned = cleanCart(cart);
  localStorage.setItem(CART_KEY, JSON.stringify(cleaned));
  window.dispatchEvent(new Event('storage'));
};

/* ADD */
export const addToCart = (productId) => {
  const cart = cleanCart(getCart());
  const existing = cart.find(item => item.id === productId);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart(cart);
};

/* REMOVE */
export const removeFromCart = (productId) => {
  saveCart(getCart().filter(item => item.id !== productId));
};

/* COUNT */
export const getCartCount = () => {
  return cleanCart(getCart()).reduce((sum, item) => sum + item.quantity, 0);
};

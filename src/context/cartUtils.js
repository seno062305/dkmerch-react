export const CART_KEY = 'dkmerch_cart';

export const getCart = () => {
  return JSON.parse(localStorage.getItem(CART_KEY)) || [];
};

export const saveCart = (cart) => {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
};

export const addToCart = (product) => {
  const cart = getCart();
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }

  saveCart(cart);
};

export const removeFromCart = (id) => {
  const cart = getCart().filter(item => item.id !== id);
  saveCart(cart);
};

export const updateQty = (id, qty) => {
  const cart = getCart().map(item =>
    item.id === id ? { ...item, qty } : item
  );
  saveCart(cart);
};
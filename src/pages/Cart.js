const CART_KEY = 'dkmerch_cart';

export const getCart = () => {
  return JSON.parse(localStorage.getItem(CART_KEY)) || [];
};

export const saveCart = (cart) => {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
};

export const addToCart = (productId) => {
  const cart = getCart();
  const existing = cart.find(i => i.id === productId);

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart(cart);
};
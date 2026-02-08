export const WISHLIST_KEY = 'dkmerch_wishlist';

export const getWishlist = () => {
  return JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
};

export const toggleWishlist = (product) => {
  const wishlist = getWishlist();
  const exists = wishlist.find(item => item.id === product.id);

  let updated;
  if (exists) {
    updated = wishlist.filter(item => item.id !== product.id);
  } else {
    updated = [...wishlist, product];
  }

  localStorage.setItem(WISHLIST_KEY, JSON.stringify(updated));
};

export const isWishlisted = (id) => {
  return getWishlist().some(item => item.id === id);
};
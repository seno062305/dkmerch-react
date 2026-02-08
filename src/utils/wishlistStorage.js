const WISHLIST_KEY = 'dkmerch_wishlist';
const PRODUCTS_KEY = 'dkmerch_products';

/* GET */
export const getWishlist = () => {
  try {
    const data = localStorage.getItem(WISHLIST_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/* CLEAN */
const cleanWishlist = (wishlist) => {
  const products = JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || [];
  const validIds = products.map(p => p.id);
  return wishlist.filter(id => validIds.includes(id));
};

/* SAVE */
export const saveWishlist = (items) => {
  const cleaned = cleanWishlist(items);
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(cleaned));
  window.dispatchEvent(new Event('storage'));
};

/* TOGGLE */
export const toggleWishlist = (productId) => {
  const wishlist = cleanWishlist(getWishlist());
  const exists = wishlist.includes(productId);

  saveWishlist(
    exists
      ? wishlist.filter(id => id !== productId)
      : [...wishlist, productId]
  );
};

/* CHECK */
export const isInWishlist = (productId) => {
  return cleanWishlist(getWishlist()).includes(productId);
};

/* COUNT */
export const getWishlistCount = () => {
  return cleanWishlist(getWishlist()).length;
};

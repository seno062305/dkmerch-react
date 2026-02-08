const STORAGE_KEY = 'dkmerch_products';
const CART_KEY = 'dkmerch_cart';
const WISHLIST_KEY = 'dkmerch_wishlist';

/* GET PRODUCTS */
export const getProducts = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

/* CLEAN CART + WISHLIST */
const cleanupOrphanedItems = (products) => {
  const validIds = products.map(p => p.id);

  // 🛒 CART CLEANUP
  const cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  const cleanedCart = cart.filter(item => validIds.includes(item.id));
  localStorage.setItem(CART_KEY, JSON.stringify(cleanedCart));

  // ❤️ WISHLIST CLEANUP
  const wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
  const cleanedWishlist = wishlist.filter(id => validIds.includes(id));
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(cleanedWishlist));
};

/* SAVE PRODUCTS */
export const saveProducts = (products) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));

  cleanupOrphanedItems(products);

  // 🔥 same-tab auto refresh
  window.dispatchEvent(new Event('dkmerch-products-updated'));
  window.dispatchEvent(new Event('storage'));
};

/* ADD */
export const addProduct = (product) => {
  const products = getProducts();
  saveProducts([...products, product]);
};

/* UPDATE */
export const updateProduct = (updatedProduct) => {
  const products = getProducts().map(p =>
    p.id === updatedProduct.id ? updatedProduct : p
  );
  saveProducts(products);
};

/* DELETE */
export const deleteProduct = (id) => {
  const products = getProducts().filter(p => p.id !== id);
  saveProducts(products);
};

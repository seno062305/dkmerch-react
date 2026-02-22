import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

// ── HOOKS ─────────────────────────────────────────

export const useProducts = () => {
  return useQuery(api.products.getAllProducts) || [];
};

export const usePreOrderProducts = () => {
  return useQuery(api.products.getPreOrderProducts) || [];
};

export const useAddProduct = () => useMutation(api.products.addProduct);
export const useUpdateProduct = () => useMutation(api.products.updateProduct);
export const useDeleteProduct = () => useMutation(api.products.deleteProduct);

// ── LEGACY FUNCTIONS ──────────────────────────────
const STORAGE_KEY = "dkmerch_products";
const CART_KEY = "dkmerch_cart";
const WISHLIST_KEY = "dkmerch_wishlist";

export const getProducts = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
};

const cleanupOrphanedItems = (products) => {
  const validIds = products.map(p => p.id);
  const cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  localStorage.setItem(CART_KEY, JSON.stringify(cart.filter(i => validIds.includes(i.id))));
  const wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist.filter(id => validIds.includes(id))));
};

export const saveProducts = (products) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  cleanupOrphanedItems(products);
  window.dispatchEvent(new Event("dkmerch-products-updated"));
  window.dispatchEvent(new Event("storage"));
};

export const addProduct = (product) => saveProducts([...getProducts(), product]);

export const updateProduct = (updatedProduct) => {
  saveProducts(getProducts().map(p => p.id === updatedProduct.id ? updatedProduct : p));
};

export const deleteProduct = (id) => {
  saveProducts(getProducts().filter(p => p.id !== id));
};

export const PRODUCTS_KEY = "dkmerch_products";
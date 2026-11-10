import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { runWithFailover } from "../lib/failoverWrite";

// ── HOOKS ─────────────────────────────────────────

export const useProducts = () => {
  return useQuery(api.products.getAllProducts) || [];
};

export const usePreOrderProducts = () => {
  return useQuery(api.products.getPreOrderProducts) || [];
};

// ✅ NEW: Released pre-orders + regular products (for cart, collections, etc.)
export const useCollectionProducts = () => {
  return useQuery(api.products.getCollectionProducts) || [];
};

export const useAddProduct = () => {
  const mutate = useMutation(api.products.addProduct);
  return (args) =>
    runWithFailover(mutate, args, {
      table: "products",
      mutation: "products:addProduct",
      docKey: args?.name || `product-${Date.now()}`,
      payload: args,
    });
};

export const useUpdateProduct = () => {
  const mutate = useMutation(api.products.updateProduct);
  return (args) =>
    runWithFailover(mutate, args, {
      table: "products",
      mutation: "products:updateProduct",
      docKey: String(args?.id || args?._id || ""),
      payload: args,
    });
};

export const useDeleteProduct = () => {
  const mutate = useMutation(api.products.deleteProduct);
  return (args) => {
    const normalized = typeof args === "object" ? args : { id: args };
    return runWithFailover(mutate, normalized, {
      table: "products",
      mutation: "products:deleteProduct",
      docKey: String(normalized?.id || ""),
      payload: normalized,
    });
  };
};

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
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";

export const useCart = () => {
  const { user } = useAuth();
  const userId = user?.id || user?.email || "guest";
  return useQuery(api.cart.getCart, { userId }) ?? [];
};

export const useAddToCart = () => {
  const mutation = useMutation(api.cart.addToCart);
  const { user } = useAuth();
  return (product) => {
    const userId = user?.id || user?.email || "guest";
    return mutation({
      userId,
      productId: product.id || product._id,
      name: product.name,
      price: product.price,
      image: product.image,
    });
  };
};

export const useRemoveFromCart = () => {
  const mutation = useMutation(api.cart.removeFromCart);
  const { user } = useAuth();
  return (productId) => {
    const userId = user?.id || user?.email || "guest";
    return mutation({ userId, productId });
  };
};

export const useUpdateCartQuantity = () => {
  const mutation = useMutation(api.cart.updateQty);
  const { user } = useAuth();
  return (productId, qty) => {
    const userId = user?.id || user?.email || "guest";
    return mutation({ userId, productId, qty });
  };
};

export const useClearCart = () => {
  const mutation = useMutation(api.cart.clearCart);
  const { user } = useAuth();
  return () => {
    const userId = user?.id || user?.email || "guest";
    return mutation({ userId });
  };
};

export const useCartCount = () => {
  const cart = useCart();
  return cart.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 1), 0);
};

// Legacy stubs
export const addToCart = () => console.warn("Use useAddToCart() hook instead.");
export const removeFromCart = () => console.warn("Use useRemoveFromCart() hook instead.");
export const getCart = () => [];
export const getCartCount = () => 0;
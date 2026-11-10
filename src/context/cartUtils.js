import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";
import { runWithFailover } from "../lib/failoverWrite";

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
    const hasPromo = product.appliedPromo && product.finalPrice !== undefined;
    const args = {
      userId,
      productId: product.id || product._id,
      name: product.name,
      price: product.price,
      image: product.image,
      ...(hasPromo && {
        finalPrice: product.finalPrice,
        promoCode: product.appliedPromo.code,
        discountAmount: product.appliedPromo.discountAmount,
        promoDiscount: product.appliedPromo.discount,
      }),
    };
    return runWithFailover(mutation, args, {
      table: "cart",
      mutation: "cart:addToCart",
      docKey: `${userId}_${args.productId}_${args.promoCode || "plain"}`,
      payload: { ...args, qty: 1 },
    });
  };
};

export const useRemoveFromCartById = () => {
  const mutation = useMutation(api.cart.removeFromCartById);
  return (cartItemId) =>
    runWithFailover(
      mutation,
      { cartItemId },
      {
        table: "cart",
        mutation: "cart:removeFromCartById",
        docKey: String(cartItemId),
        payload: { cartItemId },
      }
    );
};

export const useRemoveFromCart = () => {
  const mutation = useMutation(api.cart.removeFromCart);
  const { user } = useAuth();
  return (productId, promoCode) => {
    const userId = user?.id || user?.email || "guest";
    const args = { userId, productId, ...(promoCode && { promoCode }) };
    return runWithFailover(mutation, args, {
      table: "cart",
      mutation: "cart:removeFromCart",
      docKey: `${userId}_${productId}_${promoCode || "plain"}`,
      payload: args,
    });
  };
};

export const useUpdateCartQtyById = () => {
  const mutation = useMutation(api.cart.updateQtyById);
  return (cartItemId, qty) =>
    runWithFailover(
      mutation,
      { cartItemId, qty },
      {
        table: "cart",
        mutation: "cart:updateQtyById",
        docKey: String(cartItemId),
        payload: { cartItemId, qty },
      }
    );
};

export const useUpdateCartQuantity = () => {
  const mutation = useMutation(api.cart.updateQty);
  const { user } = useAuth();
  return (productId, qty, promoCode) => {
    const userId = user?.id || user?.email || "guest";
    const args = { userId, productId, qty, ...(promoCode && { promoCode }) };
    return runWithFailover(mutation, args, {
      table: "cart",
      mutation: "cart:updateQty",
      docKey: `${userId}_${productId}_${promoCode || "plain"}`,
      payload: args,
    });
  };
};

export const useClearCart = () => {
  const mutation = useMutation(api.cart.clearCart);
  const { user } = useAuth();
  return () => {
    const userId = user?.id || user?.email || "guest";
    return runWithFailover(
      mutation,
      { userId },
      {
        table: "cart",
        mutation: "cart:clearCart",
        docKey: userId,
        payload: { userId },
      }
    );
  };
};

export const useCartCount = () => {
  const cart = useCart();
  return cart.reduce((sum, item) => sum + (item.qty ?? item.quantity ?? 1), 0);
};

export const addToCart = () => console.warn("Use useAddToCart() hook instead.");
export const removeFromCart = () => console.warn("Use useRemoveFromCart() hook instead.");
export const getCart = () => [];
export const getCartCount = () => 0;

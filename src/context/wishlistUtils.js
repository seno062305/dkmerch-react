import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";
import { runWithFailover } from "../lib/failoverWrite";

export const useWishlist = () => {
  const { user } = useAuth();
  const userId = user?.id || user?.email || "guest";
  return useQuery(api.wishlist.getWishlist, { userId }) ?? [];
};

export const useToggleWishlist = () => {
  const mutation = useMutation(api.wishlist.toggleWishlist);
  const { user } = useAuth();
  return (product) => {
    const userId = user?.id || user?.email || "guest";
    const args = {
      userId,
      productId: product.id || product._id,
      name: product.name,
      price: product.price,
      image: product.image,
    };
    return runWithFailover(mutation, args, {
      table: "wishlist",
      mutation: "wishlist:toggleWishlist",
      docKey: `${userId}_${args.productId}`,
      payload: args,
    });
  };
};

export const useRemoveFromWishlist = () => {
  const mutation = useMutation(api.wishlist.removeFromWishlist);
  const { user } = useAuth();
  return (productId) => {
    const userId = user?.id || user?.email || "guest";
    const args = { userId, productId };
    return runWithFailover(mutation, args, {
      table: "wishlist",
      mutation: "wishlist:removeFromWishlist",
      docKey: `${userId}_${productId}`,
      payload: args,
    });
  };
};

export const useIsInWishlist = (productId) => {
  const wishlist = useWishlist();
  return wishlist.some((item) => item.productId === productId);
};

export const useWishlistCount = () => {
  return useWishlist().length;
};

export const toggleWishlist = () => console.warn("Use useToggleWishlist() hook instead.");
export const getWishlist = () => [];
export const isInWishlist = () => false;
export const getWishlistCount = () => 0;

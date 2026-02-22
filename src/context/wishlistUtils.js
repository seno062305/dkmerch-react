import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";

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
    return mutation({
      userId,
      productId: product.id || product._id,
      name: product.name,
      price: product.price,
      image: product.image,
    });
  };
};

export const useRemoveFromWishlist = () => {
  const mutation = useMutation(api.wishlist.removeFromWishlist);
  const { user } = useAuth();
  return (productId) => {
    const userId = user?.id || user?.email || "guest";
    return mutation({ userId, productId });
  };
};

export const useIsInWishlist = (productId) => {
  const wishlist = useWishlist();
  return wishlist.some((item) => item.productId === productId);
};

export const useWishlistCount = () => {
  return useWishlist().length;
};

// Legacy stubs
export const toggleWishlist = () => console.warn("Use useToggleWishlist() hook instead.");
export const getWishlist = () => [];
export const isInWishlist = () => false;
export const getWishlistCount = () => 0;
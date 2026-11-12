import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "./AuthContext";
import { runWithFailover } from "../lib/failoverWrite";

/** Canonical product id for wishlist (_id preferred — must match card + modal). */
export function getProductWishlistId(product) {
  return String(product?._id || product?.id || "").trim();
}

/** All known ids for a product (handles legacy wishlist rows keyed by `id`). */
export function getProductWishlistIds(product) {
  return [
    ...new Set(
      [product?._id, product?.id]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    ),
  ];
}

/** True if wishlist contains this product under any known id. */
export function wishlistHasProduct(wishlistItems, productOrId) {
  const ids =
    productOrId && typeof productOrId === "object"
      ? getProductWishlistIds(productOrId)
      : [String(productOrId || "").trim()].filter(Boolean);
  if (!ids.length) return false;
  return (wishlistItems || []).some((item) =>
    ids.includes(String(item.productId || "").trim())
  );
}

export const useWishlist = () => {
  const { user } = useAuth();
  const userId = user?.id || user?.email || "guest";
  return useQuery(api.wishlist.getWishlist, { userId }) ?? [];
};

export const useToggleWishlist = () => {
  const mutation = useMutation(api.wishlist.toggleWishlist);
  const removeMutation = useMutation(api.wishlist.removeFromWishlist);
  const { user } = useAuth();
  const wishlist = useWishlist();

  return async (product) => {
    const userId = user?.id || user?.email || "guest";
    const canonicalId = getProductWishlistId(product);
    if (!canonicalId) return { added: false };

    const ids = getProductWishlistIds(product);
    const existing = (wishlist || []).filter((item) =>
      ids.includes(String(item.productId || "").trim())
    );

    // Already favorited (under any id) → remove all variants so card + modal stay in sync
    if (existing.length) {
      for (const item of existing) {
        const args = { userId, productId: String(item.productId) };
        await runWithFailover(removeMutation, args, {
          table: "wishlist",
          mutation: "wishlist:removeFromWishlist",
          docKey: `${userId}_${args.productId}`,
          payload: args,
        });
      }
      return { added: false };
    }

    const args = {
      userId,
      productId: canonicalId,
      name: product.name,
      price: product.price,
      image: product.image,
    };
    return runWithFailover(mutation, args, {
      table: "wishlist",
      mutation: "wishlist:toggleWishlist",
      docKey: `${userId}_${canonicalId}`,
      payload: args,
    });
  };
};

export const useRemoveFromWishlist = () => {
  const mutation = useMutation(api.wishlist.removeFromWishlist);
  const { user } = useAuth();
  return (productId) => {
    const userId = user?.id || user?.email || "guest";
    const args = { userId, productId: String(productId || "").trim() };
    return runWithFailover(mutation, args, {
      table: "wishlist",
      mutation: "wishlist:removeFromWishlist",
      docKey: `${userId}_${args.productId}`,
      payload: args,
    });
  };
};

export const useIsInWishlist = (productOrId) => {
  const wishlist = useWishlist();
  return wishlistHasProduct(wishlist, productOrId);
};

export const useWishlistCount = () => {
  return useWishlist().length;
};

export const toggleWishlist = () => console.warn("Use useToggleWishlist() hook instead.");
export const getWishlist = () => [];
export const isInWishlist = () => false;
export const getWishlistCount = () => 0;

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

// ── HOOKS ─────────────────────────────────────────

export const useAllOrders = () => {
  return useQuery(api.orders.getAllOrders) || [];
};

export const useUserOrders = (userEmail) => {
  return useQuery(api.orders.getOrdersByEmail, userEmail ? { email: userEmail } : "skip") || [];
};

export const useOrdersByEmail = (email) => {
  return useQuery(api.orders.getOrdersByEmail, email ? { email } : "skip") || [];
};

export const useOrderById = (orderId) => {
  return useQuery(api.orders.getOrderById, orderId ? { orderId } : "skip");
};

export const useCreateOrder  = () => useMutation(api.orders.createOrder);
export const useUpdateOrderStatus = () => useMutation(api.orders.updateOrderStatus);
export const useUpdateOrderFields = () => useMutation(api.orders.updateOrderFields);

// ── OTP — args must match convex/orders.ts updateOrderOtp ──
export const useUpdateOrderOtp = () => {
  const mutate = useMutation(api.orders.updateOrderOtp);
  // Wrapper so callers can pass { orderId, deliveryOtp } or { orderId, otp }
  return ({ orderId, deliveryOtp, otp }) =>
    mutate({ orderId, deliveryOtp: deliveryOtp || otp });
};

export const ORDER_STATUS = {
  PROCESSING:       "Processing",
  CONFIRMED:        "Confirmed",
  SHIPPED:          "Shipped",
  IN_TRANSIT:       "In Transit",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED:        "Delivered",
  CANCELLED:        "Cancelled",
};
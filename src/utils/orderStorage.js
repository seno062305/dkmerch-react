import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { createOrderWithFailoverDual } from "../lib/failoverOrders";
import { runWithFailover } from "../lib/failoverWrite";

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

/** Convex first; on timeout/outage → Firebase failover. */
export const useCreateOrder = () => {
  const mutate = useMutation(api.orders.createOrder);
  return (args) => createOrderWithFailoverDual(mutate, args);
};

export const useUpdateOrderStatus = () => {
  const mutate = useMutation(api.orders.updateOrderStatus);
  return (args) =>
    runWithFailover(mutate, args, {
      table: "orders",
      mutation: "orders:updateOrderStatus",
      docKey: args?.orderId,
      payload: args,
    });
};

export const useUpdateOrderFields = () => {
  const mutate = useMutation(api.orders.updateOrderFields);
  return (args) =>
    runWithFailover(mutate, args, {
      table: "orders",
      mutation: "orders:updateOrderFields",
      docKey: args?.orderId,
      payload: args,
    });
};

// ── OTP — args must match convex/orders.ts updateOrderOtp ──
export const useUpdateOrderOtp = () => {
  const mutate = useMutation(api.orders.updateOrderOtp);
  return ({ orderId, deliveryOtp, otp }) =>
    runWithFailover(
      mutate,
      { orderId, deliveryOtp: deliveryOtp || otp },
      {
        table: "orders",
        mutation: "orders:updateOrderOtp",
        docKey: orderId,
        payload: { orderId, deliveryOtp: deliveryOtp || otp },
      }
    );
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
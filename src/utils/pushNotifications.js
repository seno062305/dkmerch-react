/** Web Push helpers for installed DKMerch PWA / browser. */

// Public VAPID key (safe to ship in client). Private key lives in Convex env only.
export const VAPID_PUBLIC_KEY =
  process.env.REACT_APP_VAPID_PUBLIC_KEY ||
  'BIFn1cO1DI5FtAL1ETu8ifSXdXXb9W5hPdHsr-FXu6Z7p6zEyke9Gj0ReUGq_Jg1fZT6nR9dhoxXibw5BybPSb8';

export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

/**
 * Request permission + subscribe + return PushSubscription JSON for Convex.
 */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  return subscription.toJSON();
}

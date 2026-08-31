'use client';

/**
 * Client-side helpers for browser Web Push — the standard API implemented identically by
 * Chrome, Firefox, Edge (via their FCM-backed push endpoints) and Safari 16.4+ (native Web
 * Push), so no per-browser branching is needed here.
 */

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/**
 * Full opt-in flow: requests browser permission (must be called from a user gesture, e.g. a
 * button click), registers the service worker, subscribes via the Push API, and saves the
 * subscription server-side. Returns false (without throwing) on any failure or denial so the
 * caller can show a simple "couldn't enable notifications" message.
 */
export async function enablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const keyRes = await fetch('/api/notifications/push/vapid-public-key').then((r) => r.json());
    if (!keyRes.success || !keyRes.data.configured || !keyRes.data.publicKey) return false;

    const registration = await registerServiceWorker();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyRes.data.publicKey) as BufferSource
      });
    }

    const subJson = subscription.toJSON();
    const saveRes = await fetch('/api/notifications/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys })
    }).then((r) => r.json());

    return Boolean(saveRes.success);
  } catch (err) {
    console.warn('[push-notifications] enable failed:', err);
    return false;
  }
}

/** Unsubscribes the current browser both locally and server-side. */
export async function disablePushNotifications(): Promise<boolean> {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const res = await fetch('/api/notifications/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint })
    }).then((r) => r.json());

    return Boolean(res.success);
  } catch (err) {
    console.warn('[push-notifications] disable failed:', err);
    return false;
  }
}

/** True if this browser currently holds an active push subscription (regardless of server-side state). */
export async function isPushSubscribedLocally(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

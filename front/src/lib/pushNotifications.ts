import { useAuthStore } from '../store/auth.store';
import { api } from './api';

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error(
      'Ο browser δεν υποστηρίζει ειδοποιήσεις με κλειστή σελίδα. Σε iPhone/iPad ανοίξτε την εφαρμογή από την αρχική οθόνη.',
    );
  }
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const { data } = await api.get<{ publicKey: string }>('/notifications/push-key');
  const decoded = atob(data.publicKey.replace(/-/g, '+').replace(/_/g, '/'));
  const key = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    }));
  await api.post('/notifications/subscription', subscription.toJSON());
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.delete('/notifications/subscription', { data: subscription.toJSON() });
  await subscription.unsubscribe();
}

// Expired sessions also stop this browser receiving the previous account's pushes.
useAuthStore.subscribe((state, previous) => {
  if (previous.accessToken && !state.accessToken && 'serviceWorker' in navigator) {
    void navigator.serviceWorker
      .getRegistration('/sw.js')
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => subscription?.unsubscribe())
      .catch(() => {});
  }
});

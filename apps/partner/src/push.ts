import { api } from './api';

// Browser notifications (Web Push): a service worker (/sw.js) shows them even when the tab is closed.
// The browser asks the user once; the subscription is sent to the API for this profile.

export type PushState = 'unsupported' | 'off' | 'on' | 'denied';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const keyBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function pushState(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  return (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Ask permission, subscribe, register with the API (gateway = partner | client). */
export async function enablePush(gateway: 'partner' | 'client'): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const { PublicKey } = await api<{ PublicKey: string | null }>('GET', '/public/push/key');
  if (!PublicKey) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PublicKey) }));
  const j = sub.toJSON();
  await api('POST', `/${gateway}/push/subscribe`, { Endpoint: j.endpoint, Keys: { P256dh: j.keys?.p256dh, Auth: j.keys?.auth } });
  return 'on';
}

export async function disablePush(gateway: 'partner' | 'client'): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('POST', `/${gateway}/push/unsubscribe`, { Endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}

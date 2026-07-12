import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/http.js';

const initial = { status: 'checking', supported: false };

function supported() {
  return window.isSecureContext
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

function base64ToUint8Array(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const input = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = atob(input);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

export function usePushNotifications(active, publicKey) {
  const [state, setState] = useState(initial);

  const register = useCallback(async () => {
    if (!supported()) throw new Error('Push notifications need the installed app over HTTPS.');
    return navigator.serviceWorker.register('/sw.js');
  }, []);

  useEffect(() => {
    if (!active || !publicKey) { setState({ status: 'unavailable', supported: false }); return; }
    let cancelled = false;
    (async () => {
      try {
        const registration = await register();
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await api('POST', '/api/garden/mine/push-subscriptions', { subscription: subscription.toJSON() });
        }
        if (!cancelled) setState({
          status: subscription ? 'enabled' : (Notification.permission === 'denied' ? 'denied' : 'off'),
          supported: true,
        });
      } catch (e) {
        if (!cancelled) setState({ status: 'unavailable', supported: false });
      }
    })();
    return () => { cancelled = true; };
  }, [active, publicKey, register]);

  const enable = useCallback(async () => {
    if (!active || !publicKey) return { ok: false, message: 'Push notifications are not configured yet.' };
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState({ status: 'denied', supported: true });
        return { ok: false, message: 'Notifications are blocked in this browser’s settings.' };
      }
      const registration = await register();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(publicKey),
      });
      await api('POST', '/api/garden/mine/push-subscriptions', { subscription: subscription.toJSON() });
      setState({ status: 'enabled', supported: true });
      return { ok: true, message: 'Watering reminders are enabled on this device.' };
    } catch (e) {
      return { ok: false, message: 'Could not enable notifications. On iPhone, add this app to your Home Screen first.' };
    }
  }, [active, publicKey, register]);

  const disable = useCallback(async () => {
    try {
      const registration = await register();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api('DELETE', '/api/garden/mine/push-subscriptions', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setState({ status: 'off', supported: true });
      return { ok: true, message: 'Watering reminders are off on this device.' };
    } catch (e) {
      return { ok: false, message: 'Could not turn notifications off. Try again.' };
    }
  }, [register]);

  return { ...state, enable, disable };
}

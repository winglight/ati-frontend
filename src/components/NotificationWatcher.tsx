import { useEffect, useRef } from 'react';
import { useAppSelector } from '@store/hooks';
import type { NotificationItem } from '@features/dashboard/types';
import type { NotificationSettingsResponse } from '@services/notificationSettingsApi';

const hasBrowserNotificationSupport = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window;

const requestPermissionIfNeeded = async (): Promise<boolean> => {
  if (!hasBrowserNotificationSupport()) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission === 'denied') {
    return false;
  }
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch (error) {
    console.warn('请求浏览器通知权限失败：', error);
    return false;
  }
};

const shouldDeliverBrowserNotification = (
  notification: NotificationItem,
  settings: NotificationSettingsResponse | null
): boolean => {
  const modules = settings?.modules ?? {};
  const eventKey = notification.event || 'default';
  const prefs = modules[eventKey] || modules['default'];
  if (prefs && typeof prefs.chrome === 'boolean') {
    return prefs.chrome;
  }
  return true;
};

const showBrowserNotification = (notification: NotificationItem) => {
  if (!hasBrowserNotificationSupport() || Notification.permission !== 'granted') {
    return;
  }
  const title = notification.title || '通知';
  const body = notification.message;
  try {
    new Notification(title, {
      body,
      tag: notification.id,
      data: {
        event: notification.event,
        status: notification.status,
        channel: notification.channel
      }
    });
  } catch (error) {
    console.warn('发送浏览器通知失败：', error);
  }
};

const NotificationWatcher = () => {
  const notifications = useAppSelector((state) => state.notifications.items);
  const settings = useAppSelector((state) => state.notificationSettings.data);
  const deliveredRef = useRef<Set<string>>(new Set());
  const initialisedRef = useRef(false);

  useEffect(() => {
    if (!notifications.length) {
      return;
    }
    if (!initialisedRef.current) {
      for (const item of notifications) {
        deliveredRef.current.add(item.id);
      }
      initialisedRef.current = true;
      return;
    }
    const deliver = async () => {
      const pending = notifications.filter((item) => {
        if (deliveredRef.current.has(item.id)) {
          return false;
        }
        if (!shouldDeliverBrowserNotification(item, settings)) {
          deliveredRef.current.add(item.id);
          return false;
        }
        return true;
      });

      if (!pending.length) {
        return;
      }

      const permission = await requestPermissionIfNeeded();
      if (!permission) {
        pending.forEach((item) => deliveredRef.current.add(item.id));
        return;
      }

      for (const item of pending) {
        deliveredRef.current.add(item.id);
        showBrowserNotification(item);
      }
    };
    void deliver();
  }, [notifications, settings]);

  return null;
};

export default NotificationWatcher;

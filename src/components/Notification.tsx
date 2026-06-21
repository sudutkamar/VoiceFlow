import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (type: NotificationType, message: string, duration?: number) => void;
  removeNotification: (id: string) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }
  return context;
}

let notificationIdCounter = 0;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showNotification = useCallback((type: NotificationType, message: string, duration: number = 4000) => {
    const id = `notif-${++notificationIdCounter}`;
    const notification: Notification = { id, type, message, duration };
    
    setNotifications(prev => [...prev, notification]);

    if (duration > 0) {
      const timer = setTimeout(() => {
        removeNotification(id);
      }, duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [removeNotification]);

  const success = useCallback((message: string, duration?: number) => {
    showNotification('success', message, duration);
  }, [showNotification]);

  const error = useCallback((message: string, duration?: number) => {
    showNotification('error', message, duration);
  }, [showNotification]);

  const warning = useCallback((message: string, duration?: number) => {
    showNotification('warning', message, duration);
  }, [showNotification]);

  const info = useCallback((message: string, duration?: number) => {
    showNotification('info', message, duration);
  }, [showNotification]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
    };
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications,
      showNotification,
      removeNotification,
      success,
      error,
      warning,
      info,
    }}>
      {children}
      <NotificationContainer />
    </NotificationContext.Provider>
  );
}

function NotificationContainer() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((notif) => (
        <NotificationItem
          key={notif.id}
          notification={notif}
          onClose={() => removeNotification(notif.id)}
        />
      ))}
    </div>
  );
}

function NotificationItem({ notification, onClose }: { notification: Notification; onClose: () => void }) {
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300);
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success': return '✓';
      case 'error': return '✕';
      case 'warning': return '⚠';
      case 'info': return 'ℹ';
    }
  };

  return (
    <div 
      className={`notification notification-${notification.type} ${isExiting ? 'notification-exit' : ''}`}
      onClick={handleClose}
    >
      <span className="notification-icon">{getIcon()}</span>
      <span className="notification-message">{notification.message}</span>
      <button className="notification-close" onClick={handleClose}>×</button>
    </div>
  );
}

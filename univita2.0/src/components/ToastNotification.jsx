// src/components/ToastNotification.jsx
import React, { useContext } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { NotificationContext } from '../contexts/NotificationContext';
import './ToastNotification.css';

const NOTIFICATION_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const ToastNotification = () => {
  const { notifications, removeNotification } = useContext(NotificationContext);

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="notification-container" aria-label="System notifications">
      {notifications.map((notif) => {
        const type = ['success', 'error', 'warning', 'info'].includes(notif.type)
          ? notif.type
          : 'info';
        const Icon = NOTIFICATION_ICONS[type];

        return (
          <div
            key={notif.id}
            className={`notification notification-${type}`}
            role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
          >
            <div className="notification-content">
              <span className="notification-icon" aria-hidden="true">
                <Icon size={18} strokeWidth={2} />
              </span>
              <span className="notification-message">{notif.message}</span>
              <button
                type="button"
                className="notification-close"
                onClick={() => removeNotification(notif.id)}
                aria-label="Dismiss notification"
                title="Dismiss notification"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="notification-progress" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
};

export default ToastNotification;

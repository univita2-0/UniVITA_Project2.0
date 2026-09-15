import React, { useContext } from 'react';
import { NotificationContext } from '../contexts/NotificationContext';
import './ToastNotification.css';

const ToastNotification = () => {
  const { notifications, removeNotification } = useContext(NotificationContext);

  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="notification-container">
      {notifications.map((notif) => (
        <div key={notif.id} className={`notification notification-${notif.type}`}>
          <div className="notification-content">
            <span className="notification-message">{notif.message}</span>
            <button
              className="notification-close"
              onClick={() => removeNotification(notif.id)}
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
          <div className="notification-progress"></div>
        </div>
      ))}
    </div>
  );
};

export default ToastNotification;

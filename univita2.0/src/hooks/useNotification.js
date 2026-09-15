import { useContext } from 'react';
import { NotificationContext } from '../contexts/NotificationContext';

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within NotificationProvider');
  }

  return {
    showSuccess: (message, duration = 3000) => context.addNotification(message, 'success', duration),
    showError: (message, duration = 4000) => context.addNotification(message, 'error', duration),
    showWarning: (message, duration = 3500) => context.addNotification(message, 'warning', duration),
    showInfo: (message, duration = 3000) => context.addNotification(message, 'info', duration),
    remove: context.removeNotification,
  };
};

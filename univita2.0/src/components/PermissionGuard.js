import { useAuth } from '../contexts/AuthContext';

export const PermissionGuard = ({ children, resource, action = 'can_view', fallback = null }) => {
  const { hasPermission } = useAuth();
  if (!hasPermission(resource, action)) return fallback;
  return children;
};
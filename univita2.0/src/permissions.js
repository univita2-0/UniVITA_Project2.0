// src/permissions.js

export function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const json = decodeURIComponent(
      atob(padded).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getUserRole() {
  const token = localStorage.getItem('auth_token');
  const payload = decodeJwtPayload(token);
  return payload?.role || null;
}

export const ROUTE_ROLES = {
  dashboard:               ['admin', 'hr_admin', 'security'],
  profile:                 ['admin', 'hr_admin', 'security'],
  settings:                ['admin', 'hr_admin'],

  'audit-logs':            ['admin'],
  'role-management':       ['admin'],
  'system-config':         ['admin'],
  'landing-cms':           ['admin'],
  'manage-request':        ['admin'],
  'manage-reasons':        ['admin'],

  'manage-ble':            ['admin', 'security'],
  'manage-scanners':       ['admin', 'security'],

  'today-visitors':        ['security'],
  'track-visitor':         ['security'],

  'completed-visits':      ['admin', 'security'],
  history:                 ['admin', 'security'],

  payroll:                 ['hr_admin'],
  'payroll-main':          ['hr_admin'],
  'payroll-history':       ['hr_admin'],
  'payroll-summary':       ['hr_admin'],

  'employee-management':   ['admin', 'hr_admin'],
  attendance:              ['admin', 'hr_admin'],
  'attendance-correction': ['admin', 'hr_admin'],
  'attendance-appeals':    ['admin', 'hr_admin'],
  'overtime-requests':     ['admin', 'hr_admin'],
  'leave-management':      ['admin', 'hr_admin'],
  'leave-balances':        ['admin', 'hr_admin'],
  schedule:                ['admin', 'hr_admin'],
  'shared-calendar':       ['admin', 'hr_admin'],
  'location-tracking':     ['admin', 'hr_admin'],
  reports:                 ['admin', 'hr_admin'],
  'compliance-reports':    ['admin', 'hr_admin'],
  locations:               ['admin', 'hr_admin'],
  programs:                ['admin', 'hr_admin'],
  courses:                 ['admin', 'hr_admin'],
  'job-postings':          ['admin', 'hr_admin'],
  'emergency-alerts':      ['admin', 'hr_admin'],
  documents:               ['admin', 'hr_admin'],
  policies:                ['admin', 'hr_admin'],
};

export const ACTION_ROLES = {
  'jobs:create':              ['hr_admin'],
  'jobs:edit':                ['hr_admin'],
  'jobs:delete':              ['hr_admin'],
  'applicants:update':        ['hr_admin'],

  'leaves:approve':           ['hr_admin'],
  'leaves:reject':            ['hr_admin'],
  'leaves:batch':             ['hr_admin'],

  'overtime:approve':         ['hr_admin'],
  'overtime:reject':          ['hr_admin'],

  'corrections:review':       ['hr_admin'],
  'appeals:review':           ['hr_admin'],

  'attendance:update':        ['hr_admin'],

  'employees:create':         ['admin', 'hr_admin'],
  'employees:edit':           ['hr_admin'],
  'employees:deactivate':     ['hr_admin'],
  'employees:archive':        ['hr_admin'],
  'employees:delete':         ['admin'],

  'programs:write':           ['hr_admin'],
  'courses:write':            ['hr_admin'],
  'locations:write':          ['hr_admin'],

  'schedules:write':          ['hr_admin'],

  'leave-types:write':        ['hr_admin'],
  'leave-balances:write':     ['hr_admin'],
  'cto:write':                ['hr_admin'],

  'payroll:run':              ['hr_admin'],
  'payroll:finalize':         ['hr_admin'],
  'payroll:unlock':           ['hr_admin'],
  'payroll:update-salary':    ['hr_admin'],

  'roles:assign':             ['admin'],
  'accounts:reset-password':  ['admin'],
  'accounts:delete':          ['admin'],

  'system:config':            ['admin'],
  'system:landing-cms':       ['admin'],
  'system:audit-log':         ['admin'],
  'system:visit-reasons':     ['admin'],

  'alerts:broadcast':         ['admin', 'hr_admin'],

  'visitors:approve':         ['admin'],
  'visitors:checkin':         ['security'],
  'visitors:destination':     ['admin', 'security'],
  'visitors:return':          ['security'],

  'ble:write':                ['admin', 'security'],
  'scanners:write':           ['admin', 'security'],
};


export const VALID_ROLES = Object.freeze(['admin', 'hr_admin', 'security', 'instructor']);

export function canAccessRoute(role, route) {
  return VALID_ROLES.includes(role) && !!ROUTE_ROLES[route] && ROUTE_ROLES[route].includes(role);
}

export function canForRole(role, action) {
  return VALID_ROLES.includes(role) && !!ACTION_ROLES[action] && ACTION_ROLES[action].includes(role);
}

export function hasRole(...roles) {
  return roles.includes(getUserRole());
}

export function can(action) {
  return canForRole(getUserRole(), action);
}

export function useRole() {
  const role = getUserRole();
  return {
    role,
    isAdmin: role === 'admin',
    isHR: role === 'hr_admin',
    isSecurity: role === 'security',
    is: (...allowed) => allowed.includes(role),
    can: (action) => {
      return canForRole(role, action);
    },
  };
}
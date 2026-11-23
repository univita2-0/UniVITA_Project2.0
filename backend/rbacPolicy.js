
'use strict';

const ACTION_ROLES = Object.freeze({
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

  // HR owns personnel information; Admin owns accounts and roles.
  'employees:view':          ['admin', 'hr_admin'],
  'employees:create':        ['hr_admin'],
  'employees:edit':          ['hr_admin'],
  'employees:change-status': ['hr_admin'],

  'accounts:view':           ['admin', 'hr_admin'],
  'accounts:provision':      ['admin'],
  'accounts:activate':       ['admin'],
  'accounts:deactivate':     ['admin'],

  // Legacy destructive actions intentionally have no registered permission.

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

  'system:config':            ['admin'],
  'system:landing-cms':       ['admin'],
  'system:audit-log':         ['admin'],
  'system:visit-reasons':     ['admin'],

  'reports:instructor:view':   ['admin', 'hr_admin'],
  'reports:visitor:view':      ['admin', 'security'],
  'reports:tracking:print':    ['admin', 'hr_admin', 'security'],

  'alerts:broadcast':         ['admin', 'hr_admin'],

  'visitors:approve':         ['admin'],
  'visitors:checkin':         ['security'],
  'visitors:destination':     ['admin', 'security'],
  'visitors:return':          ['security'],

  'ble:write':                ['admin', 'security'],
  'scanners:write':           ['admin', 'security'],
});

const VALID_ROLES = Object.freeze([
  'admin',
  'hr_admin',
  'security',
  'instructor'
]);

function allowRoles(...roles) {
  if (roles.length === 0 || roles.some(role => !VALID_ROLES.includes(role))) {
    throw new Error('Invalid route role policy');
  }

  return (req, res, next) => {
    if (!req.user || !req.user.id || !VALID_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: authenticated role required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: insufficient role permissions.'
      });
    }

    next();
  };
}

function requireAction(action) {
  const allowed = ACTION_ROLES[action];

  if (!allowed) {
    throw new Error(`Unrecognized RBAC action: ${action}`);
  }

  return allowRoles(...allowed);
}

module.exports = {
  ACTION_ROLES,
  VALID_ROLES,
  allowRoles,
  requireAction
};

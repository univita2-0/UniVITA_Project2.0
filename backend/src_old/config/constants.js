module.exports = {
  ROLES: {
    ADMIN: 'admin',
    HR_ADMIN: 'hr_admin',
    SECURITY: 'security',
    INSTRUCTOR: 'instructor',
    VISITOR: 'visitor'
  },
  ATTENDANCE_STATUS: {
    PRESENT: 'present',
    LATE: 'late',
    ABSENT: 'absent',
    ON_LEAVE: 'on leave'
  },
  LEAVE_STATUS: {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected'
  },
  MAX_OTP_ATTEMPTS: 5,
  OTP_EXPIRY_MINUTES: 5,
  JWT_EXPIRY: '30d'
};
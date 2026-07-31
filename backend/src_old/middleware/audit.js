const pool = require('../config/db');

async function logAudit({ userId, action, targetType, targetId, oldValue = null, newValue = null, ip = null, userAgent = null }) {
  const query = `
    INSERT INTO audit_logs (user_id, action, target_type, target_id, old_value, new_value, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await pool.execute(query, [userId, action, targetType, targetId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null, ip, userAgent]);
}

module.exports = { logAudit };
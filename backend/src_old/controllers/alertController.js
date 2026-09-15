const pool = require('../database');

exports.createAlert = async (req, res) => {
  const { title, message, severity, target_roles } = req.body;
  const targetRolesJson = JSON.stringify(target_roles || ['instructor', 'admin', 'security', 'hr_admin']);
  const [result] = await pool.query(
    'INSERT INTO emergency_alerts (title, message, severity, target_roles) VALUES (?, ?, ?, ?)',
    [title.trim(), message.trim(), severity, targetRolesJson]
  );
  const alertId = result.insertId;

  // Insert receipts for all active users with matching roles
  const placeholders = target_roles.map(() => '?').join(',');
  const users = await pool.query(`SELECT id FROM users WHERE role IN (${placeholders}) AND status = 'active'`, target_roles);
  if (users.length) {
    const receipts = users.map(u => [alertId, u.id]);
    await pool.query('INSERT INTO alert_receipts (alert_id, user_id) VALUES ?', [receipts]);
  }
  res.status(201).json({ success: true, alertId });
};

exports.getActiveAlerts = async (req, res) => {
  const userId = req.user.id;
  const alerts = await pool.query(
    `SELECT a.id, a.title, a.message, a.severity, a.sent_at, ar.read_at 
     FROM alert_receipts ar 
     JOIN emergency_alerts a ON ar.alert_id = a.id 
     WHERE ar.user_id = ? AND a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > NOW()) 
     ORDER BY a.sent_at DESC`,
    [userId]
  );
  res.json(alerts);
};

exports.markAsRead = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  await pool.query('UPDATE alert_receipts SET read_at = NOW() WHERE alert_id = ? AND user_id = ?', [id, userId]);
  res.json({ success: true });
};

exports.getAllAlerts = async (req, res) => {
  const alerts = await pool.query('SELECT * FROM emergency_alerts ORDER BY sent_at DESC');
  res.json(alerts);
};
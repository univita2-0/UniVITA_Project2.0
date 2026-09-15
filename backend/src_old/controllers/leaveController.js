const pool = require('../database');

exports.createLeaveRequest = async (req, res) => {
  const { request_date, reason, type } = req.body;
  const userId = req.user.id;
  const [user] = await pool.query('SELECT employee_id FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const [leaveType] = await pool.query('SELECT id FROM leave_types WHERE name = ?', [type]);
  if (!leaveType) return res.status(400).json({ error: 'Invalid leave type' });

  const year = new Date(request_date).getFullYear();
  const [balance] = await pool.query('SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?', [userId, leaveType.id, year]);
  if (!balance || balance.remaining_days < 1) return res.status(400).json({ error: `Insufficient ${type} balance for ${year}` });

  const image_url = req.file ? `/uploads/leave_images/${req.file.filename}` : null;
  await pool.query('INSERT INTO leave_requests (user_id, request_date, reason, type, image_url, status) VALUES (?, ?, ?, ?, ?, "Pending")', [user.employee_id, request_date, reason, type, image_url]);
  res.status(201).json({ success: true });
};

exports.getMyLeaveRequests = async (req, res) => {
  const userId = req.user.id;
  const [user] = await pool.query('SELECT employee_id FROM users WHERE id = ?', [userId]);
  const requests = await pool.query('SELECT * FROM leave_requests WHERE user_id = ? ORDER BY request_date DESC', [user.employee_id]);
  res.json(requests);
};

exports.getAllLeaveRequests = async (req, res) => {
  const requests = await pool.query(`SELECT lr.*, u.full_name FROM leave_requests lr JOIN users u ON lr.user_id = u.employee_id WHERE lr.is_hidden = 0 ORDER BY lr.request_date DESC`);
  res.json(requests);
};

exports.updateLeaveStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const [leave] = await pool.query('SELECT user_id, request_date, type FROM leave_requests WHERE id = ?', [id]);
  if (!leave) return res.status(404).json({ error: 'Request not found' });

  await pool.query('UPDATE leave_requests SET status = ? WHERE id = ?', [status, id]);

  if (status === 'Approved') {
    const year = new Date(leave.request_date).getFullYear();
    const [typeRow] = await pool.query('SELECT id FROM leave_types WHERE name = ?', [leave.type]);
    const [balance] = await pool.query('SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?', [leave.user_id, typeRow.id, year]);
    const newBalance = balance.remaining_days - 1;
    await pool.query('UPDATE employee_leave_balances SET remaining_days = ?, last_updated = CURDATE() WHERE user_id = ? AND leave_type_id = ? AND year = ?', [newBalance, leave.user_id, typeRow.id, year]);
    await pool.query(`INSERT INTO attendance (user_id, date, status, location) VALUES (?, ?, 'on leave', 'Remote/Leave') ON DUPLICATE KEY UPDATE status = 'on leave'`, [leave.user_id, leave.request_date]);
  }
  res.json({ success: true });
};

exports.dismissLeaveRequest = async (req, res) => {
  await pool.query('UPDATE leave_requests SET is_hidden = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
};

exports.getLeaveBalance = async (req, res) => {
  const { userId } = req.params;
  const year = req.query.year || new Date().getFullYear();
  const balances = await pool.query(`SELECT lt.name as leave_type, eb.remaining_days, lt.annual_quota FROM employee_leave_balances eb JOIN leave_types lt ON eb.leave_type_id = lt.id WHERE eb.user_id = ? AND eb.year = ?`, [userId, year]);
  res.json(balances);
};

exports.updateLeaveBalance = async (req, res) => {
  const { userId } = req.params;
  const { leave_type_id, remaining_days, year } = req.body;
  await pool.query(`INSERT INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated) VALUES (?, ?, ?, ?, CURDATE()) ON DUPLICATE KEY UPDATE remaining_days = VALUES(remaining_days), last_updated = CURDATE()`, [userId, leave_type_id, remaining_days, year]);
  res.json({ success: true });
};

exports.getLeaveTypes = async (req, res) => {
  const types = await pool.query('SELECT id, name, annual_quota FROM leave_types WHERE is_active = 1');
  res.json(types);
};
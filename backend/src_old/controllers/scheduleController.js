const pool = require('../database');
const moment = require('moment');

exports.getUserSchedules = async (req, res) => {
  const { employeeId } = req.params;
  const schedules = await pool.query('SELECT *, DATE_FORMAT(date, "%Y-%m-%d") as date FROM schedules WHERE user_id = ? ORDER BY date ASC, start_time ASC', [employeeId]);
  res.json(schedules);
};

exports.createSchedule = async (req, res) => {
  const { user_id, date, place, course, start_time, end_time } = req.body;
  if (moment(date).isBefore(moment().startOf('day'))) return res.status(400).json({ error: 'Cannot schedule past date' });
  const [loc] = await pool.query('SELECT id FROM school_locations WHERE name = ?', [place]);
  if (!loc) return res.status(400).json({ error: 'Invalid location' });
  if (start_time >= end_time) return res.status(400).json({ error: 'End time must be after start time' });
  const [conflict] = await pool.query(`SELECT id FROM schedules WHERE user_id = ? AND date = ? AND NOT (end_time <= ? OR start_time >= ?)`, [user_id, date, start_time, end_time]);
  if (conflict) return res.status(409).json({ error: 'Schedule conflict' });
  await pool.query('INSERT INTO schedules (user_id, date, place, course, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)', [user_id, date, place, course, start_time, end_time]);
  res.status(201).json({ success: true });
};

exports.updateSchedule = async (req, res) => {
  const { id } = req.params;
  const { date, place, course, start_time, end_time } = req.body;
  const [old] = await pool.query('SELECT user_id FROM schedules WHERE id = ?', [id]);
  if (!old) return res.status(404).json({ error: 'Schedule not found' });
  if (moment(date).isBefore(moment().startOf('day'))) return res.status(400).json({ error: 'Cannot update to past date' });
  if (start_time >= end_time) return res.status(400).json({ error: 'End time must be after start time' });
  const [conflict] = await pool.query(`SELECT id FROM schedules WHERE user_id = ? AND date = ? AND id != ? AND NOT (end_time <= ? OR start_time >= ?)`, [old.user_id, date, id, start_time, end_time]);
  if (conflict) return res.status(409).json({ error: 'Schedule conflict' });
  await pool.query('UPDATE schedules SET date=?, place=?, course=?, start_time=?, end_time=? WHERE id=?', [date, place, course, start_time, end_time, id]);
  res.json({ success: true });
};

exports.deleteSchedule = async (req, res) => {
  await pool.query('DELETE FROM schedules WHERE id = ?', [req.params.id]);
  res.json({ success: true });
};

exports.createScheduleRequest = async (req, res) => {
  const { request_type, date, place, course, start_time, end_time, reason } = req.body;
  const userId = req.user.id;
  const [user] = await pool.query('SELECT employee_id, full_name FROM users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  await pool.query(`INSERT INTO schedule_change_requests (user_id, full_name, request_type, date, place, course, start_time, end_time, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`, [user.employee_id, user.full_name, request_type, date, place, course, start_time, end_time, reason]);
  res.status(201).json({ success: true });
};

exports.getMyRequests = async (req, res) => {
  const userId = req.user.id;
  const [user] = await pool.query('SELECT employee_id FROM users WHERE id = ?', [userId]);
  const requests = await pool.query('SELECT * FROM schedule_change_requests WHERE user_id = ? ORDER BY created_at DESC', [user.employee_id]);
  res.json(requests);
};

exports.getPendingRequests = async (req, res) => {
  const requests = await pool.query('SELECT * FROM schedule_change_requests WHERE status = "pending" ORDER BY created_at DESC');
  res.json(requests);
};

exports.updateRequestStatus = async (req, res) => {
  const { id } = req.params;
  const { status, admin_remarks } = req.body;
  const [request] = await pool.query('SELECT * FROM schedule_change_requests WHERE id = ?', [id]);
  if (!request) return res.status(404).json({ error: 'Request not found' });
  await pool.query('UPDATE schedule_change_requests SET status = ?, admin_remarks = ? WHERE id = ?', [status, admin_remarks || null, id]);
  if (status === 'approved') {
    if (request.request_type === 'new') {
      await pool.query('INSERT INTO schedules (user_id, date, place, course, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)', [request.user_id, request.date, request.place, request.course, request.start_time, request.end_time]);
    } else if (request.request_type === 'change') {
      await pool.query('UPDATE schedules SET place = ?, course = ?, start_time = ?, end_time = ? WHERE user_id = ? AND date = ?', [request.place, request.course, request.start_time, request.end_time, request.user_id, request.date]);
    }
  }
  res.json({ success: true });
};
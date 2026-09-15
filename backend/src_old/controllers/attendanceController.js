const pool = require('../database');
const { getPHTime } = require('../utils/timezone');
const { getDistanceFromLatLonInMeters } = require('../utils/helpers');

exports.clockIn = async (req, res) => {
  const { employee_id, latitude, longitude, biometric_verified } = req.body;
  const userId = req.user.id;
  const { date, time } = getPHTime();

  // Validate user
  const [user] = await pool.query('SELECT employee_id FROM users WHERE id = ? AND employee_id = ?', [userId, employee_id]);
  if (!user) return res.status(403).json({ error: 'Invalid employee' });

  // Get schedule
  const [schedule] = await pool.query('SELECT place, start_time FROM schedules WHERE user_id = ? AND date = ?', [employee_id, date]);
  if (!schedule) return res.status(400).json({ error: 'No schedule for today' });

  // Get location geofence
  const [location] = await pool.query('SELECT latitude, longitude, radius FROM school_locations WHERE name = ?', [schedule.place]);
  if (!location) return res.status(400).json({ error: 'Location not registered' });

  const distance = getDistanceFromLatLonInMeters(latitude, longitude, location.latitude, location.longitude);
  if (distance > location.radius) {
    return res.status(403).json({ error: `You are ${Math.round(distance)}m away from ${schedule.place} (allowed ${location.radius}m)` });
  }

  // Check if already clocked in
  const [existing] = await pool.query('SELECT id FROM attendance WHERE user_id = ? AND date = ?', [employee_id, date]);
  if (existing) return res.status(400).json({ error: 'Already clocked in today' });

  const status = time > schedule.start_time ? 'late' : 'present';
  const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;

  await pool.query(
    `INSERT INTO attendance 
      (user_id, date, time_in, status, clock_in_selfie, clock_in_biometric_verified, clock_in_latitude, clock_in_longitude, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [employee_id, date, time, status, selfiePath, biometric_verified === 'true' ? 1 : 0, latitude, longitude, schedule.place]
  );

  res.json({ success: true, message: `Clocked in as ${status} at ${time}` });
};

exports.clockOut = async (req, res) => {
  const { employee_id, latitude, longitude, biometric_verified } = req.body;
  const { date, time } = getPHTime();

  const [attendance] = await pool.query(
    'SELECT id, time_in FROM attendance WHERE user_id = ? AND date = ? AND time_out IS NULL',
    [employee_id, date]
  );
  if (!attendance) return res.status(400).json({ error: 'No active clock-in' });

  const [schedule] = await pool.query('SELECT place, end_time FROM schedules WHERE user_id = ? AND date = ?', [employee_id, date]);
  if (!schedule) return res.status(400).json({ error: 'No schedule found' });

  if (time < schedule.end_time) {
    return res.status(403).json({ error: `Cannot clock out before ${schedule.end_time}` });
  }

  const [location] = await pool.query('SELECT latitude, longitude, radius FROM school_locations WHERE name = ?', [schedule.place]);
  if (location) {
    const distance = getDistanceFromLatLonInMeters(latitude, longitude, location.latitude, location.longitude);
    if (distance > location.radius) {
      return res.status(403).json({ error: `Outside ${schedule.place} campus` });
    }
  }

  const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;
  const timeIn = attendance.time_in;
  const totalMinutes = (new Date(`1970-01-01T${time}`) - new Date(`1970-01-01T${timeIn}`)) / 60000;
  const totalHours = (totalMinutes / 60).toFixed(2);

  await pool.query(
    `UPDATE attendance SET 
      time_out = ?, clock_out_selfie = ?, clock_out_biometric_verified = ?,
      clock_out_latitude = ?, clock_out_longitude = ?, total_hours = ?
     WHERE id = ?`,
    [time, selfiePath, biometric_verified === 'true' ? 1 : 0, latitude, longitude, totalHours, attendance.id]
  );

  res.json({ success: true, message: `Clocked out at ${time}` });
};

exports.getUserAttendance = async (req, res) => {
  const { employeeId } = req.params;
  const records = await pool.query(
    'SELECT *, DATE_FORMAT(date, "%Y-%m-%d") as date FROM attendance WHERE user_id = ? ORDER BY date DESC',
    [employeeId]
  );
  res.json(records);
};
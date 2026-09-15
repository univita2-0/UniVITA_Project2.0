const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticateToken } = require('../middleware/auth');
const { isWithinGeofence } = require('../services/geofencing');
const pool = require('../config/db');
const { logAudit } = require('../middleware/audit');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.SELFIE_UPLOAD_PATH || 'uploads/selfies/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${req.user.id}.jpg`)
});
const upload = multer({ storage });

// Clock In
router.post('/clock-in', authenticateToken, upload.single('selfie'), async (req, res) => {
  const { latitude, longitude, biometric_verified } = req.body;
  const selfieUrl = req.file ? req.file.path : null;
  const today = new Date().toISOString().slice(0,10);

  // Geofence check
  if (!await isWithinGeofence(parseFloat(latitude), parseFloat(longitude))) {
    return res.status(400).json({ error: 'Outside allowed geofence' });
  }

  // Check if already clocked in today
  const [existing] = await pool.query('SELECT id FROM attendance WHERE user_id = ? AND date = ?', [req.user.id, today]);
  if (existing.length > 0) {
    return res.status(400).json({ error: 'Already clocked in today' });
  }

  const now = new Date();
  const time = now.toTimeString().slice(0,8);
  const status = time > '09:00:00' ? 'late' : 'present';

  await pool.query(`
    INSERT INTO attendance (user_id, date, time_in, status, clock_in_selfie, clock_in_biometric_verified, clock_in_latitude, clock_in_longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [req.user.id, today, time, status, selfieUrl, biometric_verified === 'true', latitude, longitude]);

  await logAudit({ userId: req.user.id, action: 'CLOCK_IN', targetType: 'attendance', targetId: null });
  res.json({ message: 'Clocked in', status });
});

// Clock Out
router.post('/clock-out', authenticateToken, upload.single('selfie'), async (req, res) => {
  const { latitude, longitude, biometric_verified } = req.body;
  const today = new Date().toISOString().slice(0,10);
  const [record] = await pool.query('SELECT * FROM attendance WHERE user_id = ? AND date = ?', [req.user.id, today]);
  if (record.length === 0) return res.status(400).json({ error: 'No clock in found' });
  if (record[0].time_out) return res.status(400).json({ error: 'Already clocked out' });

  const selfieUrl = req.file ? req.file.path : null;
  const now = new Date();
  const timeOut = now.toTimeString().slice(0,8);
  await pool.query(`
    UPDATE attendance SET time_out = ?, clock_out_selfie = ?, clock_out_biometric_verified = ?,
    clock_out_latitude = ?, clock_out_longitude = ?
    WHERE id = ?
  `, [timeOut, selfieUrl, biometric_verified === 'true', latitude, longitude, record[0].id]);

  await logAudit({ userId: req.user.id, action: 'CLOCK_OUT', targetType: 'attendance', targetId: record[0].id });
  res.json({ message: 'Clocked out' });
});

// Request correction (forgot to clock in/out)
router.post('/correction-request', authenticateToken, upload.single('selfie'), async (req, res) => {
  const { requested_clock_in, requested_clock_out, reason, date } = req.body;
  const selfieUrl = req.file?.path;
  await pool.query(`
    INSERT INTO attendance_corrections (user_id, attendance_date, requested_clock_in, requested_clock_out, reason, selfie_url, status)
    VALUES (?, ?, ?, ?, ?, ?, 'pending')
  `, [req.user.id, date, requested_clock_in, requested_clock_out, reason, selfieUrl]);
  res.json({ message: 'Correction request submitted' });
});

// HR/Admin: review correction requests
router.put('/correction-requests/:id/review', authenticateToken, async (req, res) => {
  // requirePermission('attendance', 'can_approve') – add middleware
  const { id } = req.params;
  const { status, admin_remarks } = req.body;
  await pool.query('UPDATE attendance_corrections SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?', [status, req.user.id, id]);
  if (status === 'approved') {
    // Update attendance record
    const [corr] = await pool.query('SELECT * FROM attendance_corrections WHERE id = ?', [id]);
    await pool.query(`
      INSERT INTO attendance (user_id, date, time_in, time_out, status, correction_requested, correction_status)
      VALUES (?, ?, ?, ?, 'present', 1, 'approved')
      ON DUPLICATE KEY UPDATE time_in = VALUES(time_in), time_out = VALUES(time_out), correction_status = 'approved'
    `, [corr[0].user_id, corr[0].attendance_date, corr[0].requested_clock_in, corr[0].requested_clock_out]);
  }
  res.json({ success: true });
});

module.exports = router;
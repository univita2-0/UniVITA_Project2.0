const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../database');
const { sendOTPEmail } = require('../services/emailService');
const { getPHTime } = require('../utils/timezone');
const { OTP_EXPIRY_MINUTES, JWT_EXPIRY } = require('../config/constants');

// Send OTP for login
exports.sendOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const [user] = await pool.query(
    'SELECT id FROM users WHERE email = ? AND status = "active"',
    [email.toLowerCase()]
  );
  if (!user) return res.status(404).json({ error: 'No active account found' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = getPHTime().datetime;
  expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRY_MINUTES);

  await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);
  await pool.query(
    'INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)',
    [email, otp, expiresAt]
  );

  await sendOTPEmail(email, otp);
  res.json({ success: true, message: 'OTP sent' });
};

// Verify OTP and return JWT
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' });

  const [record] = await pool.query(
    'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW()',
    [email, otp]
  );
  if (!record) return res.status(400).json({ error: 'Invalid or expired OTP' });

  await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

  const [user] = await pool.query(
    'SELECT id, employee_id, full_name, email, role, monthly_salary, work_days_per_month, biometric_enabled FROM users WHERE email = ? AND status = "active"',
    [email]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );

  res.json({ success: true, token, user });
};

// Reset password (using OTP)
exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const [record] = await pool.query(
    'SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW()',
    [email, otp]
  );
  if (!record) return res.status(400).json({ error: 'Invalid OTP' });

  const hashed = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password = ?, password_last_changed = CURDATE() WHERE email = ?', [hashed, email]);
  await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);
  res.json({ success: true });
};
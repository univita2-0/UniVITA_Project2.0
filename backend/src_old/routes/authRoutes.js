const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../database');
const { sendOTPEmail } = require('../services/emailService');
const { generateOTP, storeOTP, verifyOTP } = require('../services/otpService');
const { validateOTPRequest, validateResetPassword } = require('../validators/validators');

const router = express.Router();

// Send OTP (for login or password reset)
router.post('/send-otp', validateOTPRequest, async (req, res) => {
  const { email } = req.body;
  const otp = generateOTP();
  await storeOTP(email, otp);
  await sendOTPEmail(email, otp);
  res.json({ success: true, message: 'OTP sent' });
});

// Verify OTP and issue JWT
router.post('/verify-otp', validateOTPRequest, async (req, res) => {
  const { email, otp } = req.body;
  const valid = await verifyOTP(email, otp);
  if (!valid) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

  const [users] = await pool.query(
    `SELECT id, employee_id, full_name, email, role, monthly_salary, work_days_per_month, biometric_enabled
     FROM users WHERE email = ? AND status = 'active'`,
    [email]
  );
  if (!users.length) return res.status(404).json({ success: false, message: 'User not found' });

  const user = users[0];
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
  res.json({ success: true, token, user });
});

// Reset password (using OTP)
router.post('/reset-password', validateResetPassword, async (req, res) => {
  const { email, otp, newPassword } = req.body;
  const valid = await verifyOTP(email, otp);
  if (!valid) return res.status(400).json({ success: false, message: 'Invalid OTP' });

  await pool.query('UPDATE users SET password = ?, password_last_changed = CURDATE() WHERE email = ?', [newPassword, email]);
  res.json({ success: true, message: 'Password reset successful' });
});

// NEW: Password + OTP login (matches old /api/login behaviour)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ? AND status = "active"', [email.toLowerCase()]);
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = users[0];

    // Plain text password comparison (as in old server.js)
    if (user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });

    // Check password expiry (365 days)
    const daysSinceChange = user.password_last_changed
      ? Math.floor((Date.now() - new Date(user.password_last_changed).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    if (daysSinceChange >= 365) {
      const tempToken = jwt.sign({ id: user.id, email: user.email, purpose: 'password-reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });
      return res.json({
        success: true,
        requiresPasswordReset: true,
        message: 'Your password has expired. Please renew it.',
        tempToken,
        user: { id: user.id, employee_id: user.employee_id, full_name: user.full_name, email: user.email, role: user.role }
      });
    }

    // Generate and send OTP
    const otp = generateOTP();
    await storeOTP(email, otp);
    await sendOTPEmail(email, otp);

    res.json({ success: true, message: 'OTP sent to your email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
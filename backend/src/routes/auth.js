// backend/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { logAudit } = require('../middleware/audit');
const router = express.Router();

// OTP store (in-memory – for production, use Redis or DB)
const OTP_STORE = {};

// Rate limiter for OTP requests
const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Please wait.' }
});

// -------------------- Send OTP --------------------
router.post('/send-otp', otpLimiter, (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  pool.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'No active account found.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    OTP_STORE[email] = { otp, expiresAt };
    console.log(`[OTP] ${email} -> ${otp}`); // ✅ You should see this in terminal

    // Send email (using your existing transporter)
    const transporter = require('nodemailer').createTransport({
      service: 'gmail',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });
    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Your OTP Code - UniVITA',
      text: `Your OTP code is: ${otp}\n\nIt expires in 5 minutes.`
    };
    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error('OTP email error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
      }
      res.json({ success: true, message: 'OTP sent to your email.' });
    });
  });
});

// -------------------- Verify OTP & return JWT --------------------
router.post('/verify-otp', (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const otp = req.body.otp;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP required' });

  const record = OTP_STORE[email];
  if (!record) return res.status(400).json({ success: false, message: 'No OTP found. Request a new one.' });
  if (Date.now() > record.expiresAt) {
    delete OTP_STORE[email];
    return res.status(400).json({ success: false, message: 'OTP expired.' });
  }
  if (record.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP.' });

  delete OTP_STORE[email];

  pool.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });

    const user = results[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        monthly_salary: user.monthly_salary || 0,
        work_days_per_month: user.work_days_per_month || 22,
        biometric_enabled: user.biometric_enabled || false
      }
    });
  });
});

// -------------------- Login (first step) --------------------
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  pool.query("SELECT * FROM users WHERE email = ? AND password = ? AND status = 'active'", [email, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.json({ success: false, message: 'Invalid email or password' });

    const user = results[0];
    const daysSinceChange = user.password_last_changed
      ? Math.floor((Date.now() - new Date(user.password_last_changed).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSinceChange >= 365) {
      const tempToken = jwt.sign({ id: user.id, email: user.email, purpose: 'password-reset' }, process.env.JWT_SECRET, { expiresIn: '15m' });
      return res.json({
        success: true,
        requiresPasswordReset: true,
        message: "Password expired. Please renew it.",
        tempToken,
        user: { id: user.id, employee_id: user.employee_id, full_name: user.full_name, email: user.email, role: user.role }
      });
    }

    const tempToken = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '5m' });
    res.json({ success: true, requiresOtp: true, tempToken, email: user.email });
  });
});

module.exports = router;
require('dotenv').config();
const express = require('express');

const { Resend } = require('resend');

const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Expo } = require('expo-server-sdk');
let expo = new Expo();

const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const url = require('url');
const bcrypt = require('bcrypt');

const app = express();
const helmet = require('helmet');
app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], 
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https://univitaproject20-production.up.railway.app"]
    },
  },
  frameguard: { action: 'sameorigin' }, 
  noSniff: true,                        
  hsts: {                               
    maxAge: 31536000, 
    includeSubDomains: true, 
    preload: true 
  },
}));

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.disable('x-powered-by');
const fs = require('fs');
const visitorDestinations = {};
const recentAlertsCache = new Set();
const resend = new Resend(process.env.RESEND_API_KEY);

// --------------------------------------------------
// CONFIGURATION (from .env)
// --------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET;
const PAYROLL_JWT_SECRET = process.env.PAYROLL_JWT_SECRET;
const OTP_STORE = {};          // email -> { otp, expiresAt }
const PIN_ATTEMPTS = new Map(); // email -> { count, lastAttempt }
const wsClients = new Map();    // userId -> WebSocket

// Helper: check if a date is within allowed range (max 30 days ago)
const isDateWithinAllowedRange = (dateStr) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);
  const targetDate = new Date(dateStr);
  targetDate.setHours(0, 0, 0, 0);
  return targetDate <= today && targetDate >= thirtyDaysAgo;
};

// Helper: validate schedule exists for an employee on a given date
const scheduleExistsForDate = async (employeeId, dateStr) => {
  const [rows] = await db.promise().query(
    "SELECT id, start_time, end_time FROM schedules WHERE user_id = ? AND date = ?",
    [employeeId, dateStr]
  );
  return rows.length > 0 ? rows[0] : null;
};

// Helper: check for existing pending/approved appeal or correction
const hasExistingRequest = async (employeeId, dateStr, type) => {
  const [appealRows] = await db.promise().query(
    "SELECT id FROM attendance_appeals WHERE user_id = ? AND date = ? AND status IN ('pending', 'approved')",
    [employeeId, dateStr]
  );
  if (appealRows.length > 0) return true;
  const [corrRows] = await db.promise().query(
    "SELECT id FROM attendance_corrections WHERE user_id = ? AND attendance_date = ? AND status IN ('pending', 'approved')",
    [employeeId, dateStr]
  );
  return corrRows.length > 0;
};

// Serve uploaded files (selfies, resumes, etc.) – works both locally and on Hostinger
const uploadsPath = process.env.NODE_ENV === 'production'
  ? '/home/u558958395/public_html/uploads'
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}
if (!fs.existsSync(path.join(__dirname, 'uploads/selfies'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads/selfies'), { recursive: true });
}

app.use('/uploads', express.static(uploadsPath));

// --------------------------------------------------
// RATE LIMITERS
// --------------------------------------------------
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many login attempts, please try later.' }
});

const otpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Please wait.' }
});

const pinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.body.email || 'no-email',
  handler: (req, res) => {
    return res.status(429).json({ success: false, message: 'Too many PIN attempts. Please wait 15 minutes.' });
  }
});

// --------------------------------------------------
// PIN ATTEMPT TRACKING (payroll unlock)
// --------------------------------------------------
const MAX_PIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;

function checkPinRateLimit(email) {
  const now = Date.now();
  if (PIN_ATTEMPTS.has(email)) {
    const { count, lastAttempt } = PIN_ATTEMPTS.get(email);
    if (now - lastAttempt > LOCKOUT_DURATION) {
      PIN_ATTEMPTS.delete(email);
      return true;
    }
    if (count >= MAX_PIN_ATTEMPTS) return false;
  }
  return true;
}

function recordFailedPinAttempt(email) {
  const now = Date.now();
  if (PIN_ATTEMPTS.has(email)) {
    const entry = PIN_ATTEMPTS.get(email);
    entry.count += 1;
    entry.lastAttempt = now;
  } else {
    PIN_ATTEMPTS.set(email, { count: 1, lastAttempt: now });
  }
}

function clearPinAttempts(email) {
  PIN_ATTEMPTS.delete(email);
}

// --------------------------------------------------
// EMAIL TRANSPORTER
// --------------------------------------------------
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, 
  family: 4,    
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// --------------------------------------------------
// AUTHENTICATION MIDDLEWARE
// --------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user; 
    next();
  });
}

const verifyOwnership = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'hr_admin') {
    return next();
  }

  const requestedEmployeeId = req.params.employeeId || req.params.identifier;
  
  if (!requestedEmployeeId) {
    return res.status(400).json({ error: "Missing employee identifier in request." });
  }

  db.query("SELECT employee_id FROM users WHERE id = ?", [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database verification error" });
    
    if (rows.length === 0 || rows[0].employee_id !== requestedEmployeeId) {
      console.warn(`IDOR Blocked: User ID ${req.user.id} attempted to access ${requestedEmployeeId}`);
      return res.status(403).json({ error: "Forbidden: You can only access your own data." });
    }
    
    next();
  });
};

function logVisitorHistory(visitorId, visitorName, bleId, floor, currentRoom, eventType, x = null, y = null) {
  const sql = `INSERT INTO visitor_history 
    (visitor_id, visitor_name, ble_id, floor, current_room, event_type, x, y, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
    
  db.query(sql, [visitorId, visitorName, bleId, floor, currentRoom, eventType, x, y], (err) => {
    if (err) console.error('Failed to log visitor history:', err);
  });
}

function logAction(userId, action, targetType, targetId, req, oldValue = null, newValue = null) {
  if (!userId) return;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  const sql = `INSERT INTO audit_logs (user_id, action, target_type, target_id, old_value, new_value, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.query(sql, [
    userId, 
    action, 
    targetType, 
    targetId, 
    oldValue ? JSON.stringify(oldValue) : null, 
    newValue ? JSON.stringify(newValue) : null, 
    ip, 
    userAgent
  ], (err) => {
    if (err) console.error('Failed to insert audit log:', err);
  });
}

// --------------------------------------------------
// SCHOOL LOCATIONS
// --------------------------------------------------
const SCHOOL_LOCATIONS = {
  'HCT Academy Pasig': { lat: 14.57478, lon: 121.06070, radius: 200 },
  'National University - Manila': { lat: 14.6042947, lon: 120.9942832, radius: 200 },
  'Olivarez College Paranaque': { lat: 14.478841, lon: 120.996335, radius: 200 },
  'Wesleyan University Philippines': { lat: 15.484488, lon: 120.976045, radius: 200 },
  'Colegio de San Agustin - Bacolod': { lat: 10.66262, lon: 122.97641, radius: 200 },
  'S Residence Tower 3': { lat: 14.53346, lon: 120.98808, radius: 150 },
  'Sun Residence Tower 1': { lat: 14.61828, lon: 121.00059, radius: 150 }
};

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// --------------------------------------------------
// MULTER SETUP & SECURITY FILTERS
// --------------------------------------------------

const imageFilter = (req, file, cb) => {
  if (['image/jpeg', 'image/jpg', 'image/png'].includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG and PNG are allowed.'));
  }
};

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF is allowed.'));
  }
};

const uploadDir = path.join(__dirname, 'uploads', 'leave_images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `leave_${unique}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

const resumeDir = path.join(__dirname, 'uploads', 'resumes');
if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumeDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume_${unique}${path.extname(file.originalname)}`);
  }
});
const uploadResume = multer({ storage: resumeStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: pdfFilter });

const selfieStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/selfies/');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '.jpg');
  }
});
const multerSelfie = multer({ storage: selfieStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

const multerCorrection = multer({ dest: 'uploads/corrections/', limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

const appealUploadDir = path.join(__dirname, 'uploads', 'attendance_appeals');
if (!fs.existsSync(appealUploadDir)) fs.mkdirSync(appealUploadDir, { recursive: true });
const appealStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, appealUploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `appeal_${unique}${path.extname(file.originalname)}`);
  }
});
const uploadAppeal = multer({ storage: appealStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------
const allowedOrigins = [
  'https://univitahct.tech',        
  'https://www.univitahct.tech',    
  'https://univita.site',
  'http://localhost:3000',
  'http://localhost:8081',          
  'https://univitahct.netlify.app'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(bodyParser.json());

// ============================================
// 1. AUTHENTICATION & OTP
// ============================================

app.post('/api/auth/send-otp', otpLimiter, (req, res) => {
  console.log("OTP request received for:", req.body.email);
  const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  db.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], async (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'No active account found with that email.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    OTP_STORE[email] = { otp, expiresAt };
    console.log(`[OTP] ${email} -> ${otp}`);

    try {
      const { data, error } = await resend.emails.send({
      from: 'UniVITA Security <no-reply@univitahct.tech>', 
      to: [email],
      subject: 'Your OTP Code - UniVITA',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; margin-top: 0;">Login Verification Code</h2>
            <p style="color: #475569; font-size: 14px;">Use the following one-time password (OTP) to complete your sign-in. This code is valid for 5 minutes.</p>
            <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0d9488;">${otp}</span>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you did not request this code, please ignore this email.</p>
          </div>
        `
      });

      if (error) {
        console.error('Resend API Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
      }

      res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
      console.error('Unexpected email error:', err);
      return res.status(500).json({ success: false, message: 'Server error while sending OTP.' });
    }
  });
});

app.post('/api/auth/verify-otp', otpLimiter, (req, res) => {
  const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
  const otp = req.body.otp;
  if (!email || !otp) return res.status(400).json({ success: false, message: 'Email and OTP required' });

  const record = OTP_STORE[email];
  if (!record) return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
  if (Date.now() > record.expiresAt) {
    delete OTP_STORE[email];
    return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP.' });

  delete OTP_STORE[email];

  db.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'User not found.' });

    const user = results[0];
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
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
        biometric_enabled: user.biometric_enabled || false,
        password_last_changed: user.password_last_changed
      }
    });
  });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  db.query("SELECT id FROM users WHERE email = ? AND status = 'active'", [email], async (err, results) => {
    if (err) {
      console.error("DB error:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'No active account with that email.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    OTP_STORE[email] = { otp, expiresAt };
    console.log(`[PASSWORD RESET OTP] ${email} → ${otp}`);

    try {
      const { data, error } = await resend.emails.send({
        from: 'UniVITA Security <no-reply@univitahct.tech>',
        to: [email],
        subject: 'Password Reset OTP - UniVITA',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0f172a; margin-top: 0;">Password Reset Code</h2>
            <p style="color: #475569; font-size: 14px;">Use the following one-time password (OTP) to reset your password. This code is valid for 5 minutes.</p>
            <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 15px; text-align: center; border-radius: 6px; margin: 20px 0;">
              <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0d9488;">${otp}</span>
            </div>
            <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">If you did not request this, please ignore this email.</p>
          </div>
        `
      });

      if (error) {
        console.error('Resend API Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send password reset email.' });
      }

      res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
      console.error('Unexpected email error:', err);
      return res.status(500).json({ success: false, message: 'Server error while sending reset OTP.' });
    }
  });
});

app.post('/api/auth/reset-password', otpLimiter, async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const otp = req.body.otp;
  const newPassword = req.body.newPassword;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: 'Email, OTP, and new password required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const record = OTP_STORE[email];
  if (!record) return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
  if (Date.now() > record.expiresAt) {
    delete OTP_STORE[email];
    return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp) return res.status(400).json({ success: false, message: 'Invalid OTP.' });

  delete OTP_STORE[email];

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateSql = "UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE email = ?";
    db.query(updateSql, [hashedPassword, email], (err) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json({ success: true, message: 'Password reset successfully.' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error encrypting new password' });
  }
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  db.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (results.length === 0) return res.json({ success: false, message: 'Email invalid' }); 

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    
    if (!match && password === user.password) {
      const hashed = await bcrypt.hash(password, 10);
      db.query("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id]);
    } else if (!match) {
      return res.json({ success: false, message: 'Password incorrect' });
    }
    
    logAction(user.id, 'LOGIN', 'user', user.id, req);
    const daysSinceChange = user.password_last_changed
      ? Math.floor((Date.now() - new Date(user.password_last_changed).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    if (daysSinceChange >= 365) {
      const tempToken = jwt.sign({ id: user.id, email: user.email, purpose: 'password-reset' }, JWT_SECRET, { expiresIn: '15m' });
      return res.json({
        success: true,
        requiresPasswordReset: true,
        message: "Your password has expired (365+ days). Please renew it.",
        tempToken,
        user: {
          id: user.id,
          employee_id: user.employee_id,
          full_name: user.full_name,
          email: user.email,
          role: user.role
        }
      });
    }

    const tempToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ success: true, requiresOtp: true, tempToken, email: user.email });
  });
});

app.put('/api/users/:id/profile', authenticateToken, async (req, res) => {
  const userId = req.params.id;
  
  if (req.user.id.toString() !== userId.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { full_name, email, phone_number } = req.body;

  if (!full_name || !email) {
    return res.status(400).json({ success: false, message: 'Name and email are required.' });
  }

  try {
    await db.promise().query(
      "UPDATE users SET full_name = ?, email = ?, phone_number = ? WHERE id = ?",
      [full_name, email, phone_number || null, userId]
    );
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'That email address is already in use.' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/users/:identifier/update-password', async (req, res) => {
  const { identifier } = req.params;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Missing fields' });

  db.query("SELECT * FROM users WHERE (id = ? OR employee_id = ?)", [identifier, identifier], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error" });
    if (results.length === 0) return res.status(404).json({ success: false, message: "User not found." });
    
    const user = results[0];
    const match = await bcrypt.compare(currentPassword.trim(), user.password);
    if (!match && currentPassword.trim() !== user.password) {
      return res.status(401).json({ success: false, message: "Invalid current password." });
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
      db.query("UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE id = ?", [hashedPassword, user.id], (err) => {
        if (err) return res.status(500).json({ success: false });
        res.json({ success: true });
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error encrypting new password' });
    }
  });
});

app.put('/api/users/:id/reset-password', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { newPassword } = req.body;
  const userId = req.params.id;

  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
    db.query("UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE id = ?", [hashedPassword, userId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
      
      logAction(req.user.id, 'ADMIN_RESET_PASSWORD', 'user', userId, req);
      res.json({ success: true, message: 'Password reset successfully.' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error encrypting new password' });
  }
});


// ============================================
// 2. ATTENDANCE & CLOCKING
// ============================================

const formatTo12Hour = (timeStr) => {
  if (!timeStr) return '';
  const parts = timeStr.substring(0, 5).split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1] || '00';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

const getPHTime = () => {
  const now = new Date();
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
  const date = now.toLocaleDateString('en-CA', options);
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
  return { date, time };
};

app.post('/api/attendance/clock-in', authenticateToken, multerSelfie.single('selfie'), async (req, res) => {
  let { latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;
  const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;

  const { date: todayDate, time: currentTime } = getPHTime();

  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id, full_name FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'User inactive or not found' });
    const employee_id = userRows[0].employee_id;

    if (!schedule_id || schedule_id === 'undefined' || schedule_id === 'null') {
      const [autoSched] = await db.promise().query(
        `SELECT id FROM schedules 
         WHERE user_id = ? AND date = ? 
         ORDER BY ABS(TIME_TO_SEC(TIMEDIFF(?, start_time))) ASC LIMIT 1`,
        [employee_id, todayDate, currentTime]
      );
      if (autoSched.length > 0) {
        schedule_id = autoSched[0].id;
      }
    }

    if (!schedule_id || schedule_id === 'undefined' || schedule_id === 'null') {
      return res.status(400).json({ success: false, message: 'No active schedule found for today to check in.' });
    }

    const [schedRows] = await db.promise().query(
      "SELECT id, place, start_time, end_time FROM schedules WHERE id = ? AND user_id = ?",
      [schedule_id, employee_id]
    );
    if (schedRows.length === 0) return res.status(403).json({ success: false, message: 'No work schedule found' });
    const { place: schedulePlace, start_time: scheduledStartTime, end_time: scheduledEndTime } = schedRows[0];

    if (currentTime > scheduledEndTime) {
      const [existingAtt] = await db.promise().query(
        "SELECT id FROM attendance WHERE user_id = ? AND schedule_id = ? AND date = ?", 
        [employee_id, schedule_id, todayDate]
      );
      
      if (existingAtt.length > 0) {
        await db.promise().query("UPDATE attendance SET status = 'missed schedule' WHERE id = ?", [existingAtt[0].id]);
      } else {
        await db.promise().query(
          `INSERT INTO attendance (user_id, schedule_id, date, status, location) 
           VALUES (?, ?, ?, 'missed schedule', 'Missed Schedule')`,
          [employee_id, schedule_id, todayDate]
        );
      }
      return res.status(403).json({
        success: false,
        message: 'This shift has already passed and has been marked as Missed Schedule.'
      });
    }

    const scheduledStart = new Date(`1970-01-01T${scheduledStartTime}`);
    const actualTime = new Date(`1970-01-01T${currentTime}`);
    const diffMinutes = (actualTime - scheduledStart) / 60000;

    if (diffMinutes < -15) {
      return res.status(403).json({
        success: false,
        message: `Too early to clock in. Allowed from 15 minutes before (${formatTo12Hour(scheduledStartTime)}).`
      });
    }

    const [locRows] = await db.promise().query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    if (locRows.length === 0) return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered` });
    const schoolGeo = locRows[0];

    const parsedLat = parseFloat(latitude);
    const parsedLon = parseFloat(longitude);
    let finalLat = (!isNaN(parsedLat) && parsedLat !== 0) ? parsedLat : parseFloat(schoolGeo.latitude);
    let finalLon = (!isNaN(parsedLon) && parsedLon !== 0) ? parsedLon : parseFloat(schoolGeo.longitude);

    const distance = getDistanceFromLatLonInMeters(finalLat, finalLon, schoolGeo.latitude, schoolGeo.longitude);
    if (distance > schoolGeo.radius) {
      return res.status(403).json({ success: false, message: `Not within ${schedulePlace} campus. Distance: ${Math.round(distance)}m` });
    }

    const [existing] = await db.promise().query("SELECT id FROM attendance WHERE user_id = ? AND schedule_id = ?", [employee_id, schedule_id]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'Already clocked in for this schedule' });

    const status = diffMinutes > 30 ? 'late' : 'present';

    const [result] = await db.promise().query(
      `INSERT INTO attendance 
        (user_id, schedule_id, date, time_in, status, clock_in_selfie,
         clock_in_latitude, clock_in_longitude, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, schedule_id, todayDate, currentTime, status,
       selfiePath, finalLat, finalLon,
       `${schedulePlace} (${finalLat.toFixed(6)}, ${finalLon.toFixed(6)})`]
    );

    logAction(req.user.id, 'CLOCK_IN', 'attendance', result.insertId, req);

    res.json({ success: true, message: `Clocked in as ${status} at ${formatTo12Hour(currentTime)}` });
  } catch (err) {
    console.error("Clock-in error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/attendance/clock-out', authenticateToken, multerSelfie.single('selfie'), async (req, res) => {
  let { latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;
  const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;
  const { date: todayDate, time: currentTime } = getPHTime();

  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'User inactive or not found' });
    const employee_id = userRows[0].employee_id;

    if (!schedule_id || schedule_id === 'undefined' || schedule_id === 'null') {
      const [activeAtt] = await db.promise().query(
        "SELECT schedule_id FROM attendance WHERE user_id = ? AND time_out IS NULL ORDER BY id DESC LIMIT 1",
        [employee_id]
      );
      if (activeAtt.length > 0) {
        schedule_id = activeAtt[0].schedule_id;
      } else {
        const [autoSched] = await db.promise().query(
          "SELECT id FROM schedules WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1",
          [employee_id, todayDate]
        );
        if (autoSched.length > 0) {
          schedule_id = autoSched[0].id;
        }
      }
    }

    if (!schedule_id || schedule_id === 'undefined' || schedule_id === 'null') {
      return res.status(400).json({ success: false, message: 'No active schedule found for today to check out.' });
    }

    const [schedRows] = await db.promise().query(
      "SELECT place, end_time FROM schedules WHERE id = ? AND user_id = ?",
      [schedule_id, employee_id]
    );
    if (schedRows.length === 0) return res.status(403).json({ success: false, message: 'Schedule not found' });
    const { place: schedulePlace, end_time: scheduledEndTime } = schedRows[0];

    const [locRows] = await db.promise().query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    if (locRows.length === 0) return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered` });
    const schoolGeo = locRows[0];

    const parsedLat = parseFloat(latitude);
    const parsedLon = parseFloat(longitude);
    let finalLat = (!isNaN(parsedLat) && parsedLat !== 0) ? parsedLat : parseFloat(schoolGeo.latitude);
    let finalLon = (!isNaN(parsedLon) && parsedLon !== 0) ? parsedLon : parseFloat(schoolGeo.longitude);

    const distance = getDistanceFromLatLonInMeters(finalLat, finalLon, schoolGeo.latitude, schoolGeo.longitude);
    if (distance > schoolGeo.radius) {
      return res.status(403).json({ success: false, message: `Not within ${schedulePlace} campus.` });
    }

    const [existing] = await db.promise().query(
      "SELECT id, time_in FROM attendance WHERE user_id = ? AND schedule_id = ? AND time_out IS NULL",
      [employee_id, schedule_id]
    );
    if (existing.length === 0) return res.status(400).json({ success: false, message: 'No active clock-in found for this schedule' });

    if (currentTime < scheduledEndTime) {
      return res.status(403).json({ success: false, message: `Shift incomplete. You must stay until ${formatTo12Hour(scheduledEndTime)} to clock out.` });
    }

    let finalTimeOut = currentTime;
    let isLateClockOut = false;
    if (currentTime > scheduledEndTime) {
      finalTimeOut = scheduledEndTime;
      isLateClockOut = true;
    }

    await db.promise().query(
      `UPDATE attendance SET 
        time_out = ?, 
        clock_out_selfie = ?, 
        clock_out_latitude = ?, 
        clock_out_longitude = ?, 
        location = ? 
       WHERE id = ?`,
      [finalTimeOut, selfiePath, finalLat, finalLon, schedulePlace, existing[0].id]
    );

    if (isLateClockOut) {
      const excessMinutes = (new Date(`1970-01-01T${currentTime}`) - new Date(`1970-01-01T${scheduledEndTime}`)) / 60000;
      if (excessMinutes > 10) {
        const reason = "System Auto-Logged: Instructor clocked out late. Awaiting review.";
        await db.promise().query(
          `INSERT INTO overtime_requests 
           (user_id, date, start_time, end_time, reason, scenario_type, attendance_id, status)
           VALUES (?, ?, ?, ?, ?, 'after_shift', ?, 'pending')`,
          [userId, todayDate, scheduledEndTime, currentTime, reason, existing[0].id]
        );
      }
    }

    await db.promise().query(
      "UPDATE users SET location_tracking_enabled = 0 WHERE employee_id = ?",
      [employee_id]
    );

    await broadcastInstructorStatus(employee_id);
    logAction(req.user.id, 'CLOCK_OUT', 'attendance', existing[0].id, req);

    res.json({ success: true, message: `Clocked out successfully at ${formatTo12Hour(currentTime)}.` });
  } catch (err) {
    console.error("Clock-out error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/attendance/update/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const recordId = req.params.id;
  const { time_in, time_out, status, location } = req.body;

  try {
    const validStatuses = ['present', 'late', 'absent', 'on leave'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const sql = `
      UPDATE attendance 
      SET time_in = ?, 
          time_out = ?, 
          status = ?, 
          location = ?,
          correction_requested = 1,
          correction_status = 'approved',
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
    `;
    
    db.query(sql, [time_in || null, time_out || null, status || null, location || null, recordId], (err, results) => {
      if (err) {
        console.error("Database error during attendance update:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      if (results.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Record not found" });
      }
      
      logAction(req.user.id, 'MANUAL_UPDATE_ATTENDANCE', 'attendance', recordId, req);
      res.json({ success: true, message: "Attendance updated successfully" });
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/attendance/correction-request', authenticateToken, multerCorrection.single('selfie'), async (req, res) => {
  const { employee_id, date, type, time, reason } = req.body;
  const userId = req.user.id;
  const selfiePath = req.file ? `/uploads/corrections/${req.file.filename}` : null;

  if (!employee_id || !date || !type || !time || !reason) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  const { date: today } = getPHTime();
  if (date > today) {
    return res.status(400).json({ success: false, message: "Cannot request correction for future dates." });
  }

  try {
    const [userRows] = await db.promise().query(
      "SELECT id, employee_id FROM users WHERE id = ? AND employee_id = ? AND status = 'active'",
      [userId, employee_id]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'Invalid user' });

    const schedule = await scheduleExistsForDate(employee_id, date);
    if (!schedule) {
      return res.status(400).json({ success: false, message: "No schedule found for this date. Correction not allowed." });
    }

    const [existingCorr] = await db.promise().query(
      `SELECT id FROM attendance_corrections 
       WHERE user_id = ? AND attendance_date = ? AND status IN ('pending', 'approved') 
       AND ${type === 'clock_in' ? 'requested_clock_in IS NOT NULL' : 'requested_clock_out IS NOT NULL'}`,
      [userId, date]
    );

    if (existingCorr.length > 0) {
      return res.status(409).json({ success: false, message: `You already have a pending or approved ${type.replace('_', ' ')} request for this date.` });
    }

    await db.promise().query(
      `INSERT INTO attendance_corrections 
        (user_id, attendance_date, requested_clock_in, requested_clock_out, reason, selfie_url, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, date, type === 'clock_in' ? time : null, type === 'clock_out' ? time : null, reason, selfiePath]
    );

    if (type === 'clock_out') {
      await db.promise().query(
        "UPDATE attendance SET time_out = ?, status = 'early departure' WHERE user_id = ? AND schedule_id = ? AND time_out IS NULL",
        [time, employee_id, schedule.id]
      );
      await db.promise().query(
        "UPDATE users SET location_tracking_enabled = 0 WHERE employee_id = ?",
        [employee_id]
      );
    }

    res.json({ success: true, message: 'Correction request submitted. HR will review.' });
  } catch (err) {
    console.error("Correction request error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/attendance/corrections/user/:employeeId', authenticateToken, verifyOwnership, async (req, res) => {
  const { employeeId } = req.params;
  
  db.query(
    `SELECT c.id, DATE_FORMAT(c.attendance_date, '%Y-%m-%d') AS attendance_date, c.requested_clock_in, c.requested_clock_out, c.reason, c.selfie_url, c.status, c.reviewed_at 
     FROM attendance_corrections c 
     JOIN users u ON c.user_id = u.id 
     WHERE u.employee_id = ? 
     ORDER BY c.id DESC`,
    [employeeId],
    (err, results) => {
      if (err) {
        console.error("User history fetch error:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    }
  );
});

app.put('/api/attendance/corrections/:id/review', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be approved or rejected' });
  }

  try {
    const [corr] = await db.promise().query(
      "SELECT c.*, u.employee_id FROM attendance_corrections c JOIN users u ON c.user_id = u.id WHERE c.id = ?", 
      [id]
    );
    if (corr.length === 0) return res.status(404).json({ error: 'Request not found' });

    await db.promise().query(
      "UPDATE attendance_corrections SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [status, req.user.id, id]
    );

    if (status === 'approved') {
      const record = corr[0];
      const empIdString = record.employee_id; 

      const [existing] = await db.promise().query(
        "SELECT id FROM attendance WHERE user_id = ? AND date = ?",
        [empIdString, record.attendance_date]
      );
      if (existing.length === 0) {
        await db.promise().query(
          `INSERT INTO attendance (user_id, date, time_in, time_out, status, correction_requested, correction_status)
           VALUES (?, ?, ?, ?, 'present', 1, 'approved')`,
          [empIdString, record.attendance_date, record.requested_clock_in, record.requested_clock_out]
        );
      } else {
        const updates = [];
        const values = [];
        if (record.requested_clock_in) { updates.push('time_in = ?'); values.push(record.requested_clock_in); }
        if (record.requested_clock_out) { updates.push('time_out = ?'); values.push(record.requested_clock_out); }
        updates.push('correction_requested = 1, correction_status = "approved"');
        values.push(existing[0].id);
        await db.promise().query(`UPDATE attendance SET ${updates.join(', ')} WHERE id = ?`, values);
      }
    }
    
    const actionName = status === 'approved' ? 'APPROVE_CORRECTION' : 'REJECT_CORRECTION';
    logAction(req.user.id, actionName, 'attendance_correction', id, req);
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ============================================
// 3. ATTENDANCE APPEALS
// ============================================

app.get('/api/attendance-appeals/user/:employeeId', async (req, res) => {
  const employeeId = req.params.employeeId;
  db.query(
    `SELECT a.*, u.full_name FROM attendance_appeals a JOIN users u ON a.user_id = u.employee_id WHERE a.user_id = ? ORDER BY a.submitted_at DESC`,
    [employeeId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results || []);
    }
  );
});

app.post('/api/attendance-appeals', authenticateToken, uploadAppeal.single('image'), async (req, res) => {
  const { date, reason, time_in, time_out } = req.body;
  const userId = req.user.id;

  const { date: today } = getPHTime();
  if (date > today) {
    return res.status(400).json({ success: false, error: "Cannot appeal for future dates." });
  }
  if (!isDateWithinAllowedRange(date)) {
    return res.status(400).json({ success: false, error: "Appeals are only allowed for the last 30 days." });
  }

  try {
    const [userRows] = await db.promise().query("SELECT employee_id FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) return res.status(500).json({ success: false, error: "User not found" });
    const employee_id = userRows[0].employee_id;

    const schedule = await scheduleExistsForDate(employee_id, date);
    if (!schedule) {
      return res.status(400).json({ success: false, error: "No schedule found for this date. Cannot submit appeal." });
    }

    if (await hasExistingRequest(employee_id, date, 'appeal')) {
      return res.status(409).json({ success: false, error: "You already have a pending or approved request for this date." });
    }

    const image_url = req.file ? `/uploads/attendance_appeals/${req.file.filename}` : null;
    const appealTimeIn = time_in || null;
    const appealTimeOut = time_out || null;

    const [result] = await db.promise().query(
      `INSERT INTO attendance_appeals (user_id, date, reason, image_url, status, requested_time_in, requested_time_out)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [employee_id, date, reason, image_url, appealTimeIn, appealTimeOut]
    );

    logAction(req.user.id, 'SUBMIT_APPEAL', 'attendance_appeal', result.insertId, req);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/attendance-appeals/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query(
    `SELECT a.*, u.full_name, u.employee_id FROM attendance_appeals a JOIN users u ON a.user_id = u.employee_id WHERE a.status = 'pending' ORDER BY a.submitted_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

app.put('/api/attendance-appeals/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { status, admin_remarks } = req.body;
  const appealId = req.params.id;

  try {
    const [appealRows] = await db.promise().query(
      "SELECT user_id, date, requested_time_in, requested_time_out FROM attendance_appeals WHERE id = ?",
      [appealId]
    );
    if (appealRows.length === 0) return res.status(404).json({ error: "Appeal not found" });
    const { user_id, date, requested_time_in, requested_time_out } = appealRows[0];

    const schedule = await scheduleExistsForDate(user_id, date);
    let start_time = requested_time_in || (schedule ? schedule.start_time : null);
    let end_time = requested_time_out || (schedule ? schedule.end_time : null);
    let total_hours = 0;
    if (start_time && end_time) {
      total_hours = (new Date(`1970-01-01T${end_time}`) - new Date(`1970-01-01T${start_time}`)) / 3600000;
    }

    await db.promise().query(
      "UPDATE attendance_appeals SET status = ?, admin_remarks = ? WHERE id = ?",
      [status, admin_remarks || null, appealId]
    );
    const action = status === 'approved' ? 'APPROVE_APPEAL' : 'REJECT_APPEAL';
    logAction(req.user.id, action, 'attendance_appeal', appealId, req);

    if (status === 'approved') {
      const [existingAtt] = await db.promise().query(
        "SELECT id FROM attendance WHERE user_id = ? AND date = ?",
        [user_id, date]
      );
      if (existingAtt.length > 0) {
        await db.promise().query(
          `UPDATE attendance SET time_in = ?, time_out = ?, status = 'Present', total_hours = ?, location = 'Appeal Approved'
           WHERE id = ?`,
          [start_time, end_time, total_hours, existingAtt[0].id]
        );
      } else {
        await db.promise().query(
          `INSERT INTO attendance (user_id, date, time_in, time_out, status, location, total_hours)
           VALUES (?, ?, ?, ?, 'Present', 'Appeal Approved', ?)`,
          [user_id, date, start_time, end_time, total_hours]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/attendance-appeals/history', authenticateToken, (req, res) => {
  db.query(
    `SELECT a.*, u.full_name, u.employee_id FROM attendance_appeals a JOIN users u ON a.user_id = u.employee_id WHERE a.status IN ('approved', 'rejected') ORDER BY a.submitted_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});


// ============================================
// 4. LEAVE REQUESTS
// ============================================

app.post('/api/leave-requests', authenticateToken, upload.single('image'), async (req, res) => {
  const { request_date, reason, type } = req.body;
  const userId = req.user.id;
  const leaveYear = new Date(request_date).getFullYear();

  try {
    const [userRows] = await db.promise().query("SELECT employee_id FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, error: "User not found" });
    const employee_id = userRows[0].employee_id;

    const [existingReq] = await db.promise().query(
      "SELECT id FROM leave_requests WHERE user_id = ? AND request_date = ? AND status IN ('Pending', 'Approved')",
      [employee_id, request_date]
    );
    if (existingReq.length > 0) return res.status(409).json({ success: false, error: "A request already exists for this date." });

    const [typeRows] = await db.promise().query("SELECT id, annual_quota FROM leave_types WHERE name = ?", [type]);
    if (typeRows.length === 0) return res.status(400).json({ success: false, error: "Invalid leave type" });
    const leaveTypeId = typeRows[0].id;
    const annualQuota = typeRows[0].annual_quota || 15;

    await db.promise().query(
      `INSERT IGNORE INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated) VALUES (?, ?, ?, ?, CURDATE())`,
      [userId, leaveTypeId, annualQuota, leaveYear]
    );

    const [balanceRows] = await db.promise().query(
      `SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
      [userId, leaveTypeId, leaveYear]
    );
    
    if (balanceRows[0].remaining_days < 1) return res.status(400).json({ success: false, error: `Insufficient ${type} balance.` });

    const image_url = req.file ? `/uploads/leave_images/${req.file.filename}` : null;
    const [result] = await db.promise().query(
      `INSERT INTO leave_requests (user_id, request_date, reason, type, image_url, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [employee_id, request_date, reason, type, image_url]
    );
    
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: "Duplicate entry." });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/leave-requests/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query(
    `SELECT lr.*, u.full_name FROM leave_requests lr LEFT JOIN users u ON lr.user_id = u.employee_id WHERE lr.is_hidden = 0 ORDER BY lr.request_date DESC`,
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json(results || []);
    }
  );
});

app.get('/api/leave-requests/history/:identifier', authenticateToken, (req, res) => {
  const { identifier } = req.params;
  db.query(
    `SELECT lr.*, DATE_FORMAT(lr.request_date, '%Y-%m-%d') as formatted_date, lr.reviewed_at 
     FROM leave_requests lr 
     JOIN users u ON (lr.user_id = u.employee_id OR lr.user_id = u.id) 
     WHERE (u.employee_id = ? OR u.id = ?) AND lr.status IN ('Approved', 'Rejected') AND lr.is_hidden = 0 
     ORDER BY lr.request_date DESC`,
    [identifier, identifier],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json(results);
    }
  );
});

app.get('/api/leave-requests/user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  db.query("SELECT * FROM leave_requests WHERE user_id = ? ORDER BY request_date DESC", [req.params.employeeId], (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result || []);
  });
});

app.put('/api/leave-requests/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { status } = req.body;
  const requestId = req.params.id;
  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [leaveRows] = await connection.query(`SELECT user_id, request_date, type FROM leave_requests WHERE id = ?`, [requestId]);
    if (leaveRows.length === 0) throw new Error("Leave request not found");
    const { user_id, request_date, type } = leaveRows[0];

    await connection.query(`UPDATE leave_requests SET status = ?, reviewed_at = NOW() WHERE id = ?`, [status, requestId]);

    if (status === 'Approved') {
      const leaveYear = new Date(request_date).getFullYear();
      const [typeRows] = await connection.query(`SELECT id FROM leave_types WHERE name = ?`, [type]);
      if (typeRows.length === 0) throw new Error("Invalid leave type");
      const leaveTypeId = typeRows[0].id;

      const [balanceRows] = await connection.query(
        `SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
        [user_id, leaveTypeId, leaveYear]
      );
      if (balanceRows.length === 0 || balanceRows[0].remaining_days < 1) {
        throw new Error(`Cannot approve: insufficient ${type} balance for ${leaveYear}.`);
      }
      const newBalance = balanceRows[0].remaining_days - 1;
      await connection.query(
        `UPDATE employee_leave_balances SET remaining_days = ?, last_updated = CURDATE() WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
        [newBalance, user_id, leaveTypeId, leaveYear]
      );
      await connection.query(
        `INSERT INTO attendance (user_id, date, status, location) VALUES (?, ?, 'on leave', 'Remote/Leave') ON DUPLICATE KEY UPDATE status = 'on leave'`,
        [user_id, request_date]
      );
    }
    await connection.commit();
    const action = status === 'Approved' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE';
    logAction(req.user.id, action, 'leave_request', requestId, req);
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error("Error updating leave request status:", err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

app.put('/api/leave-requests/:id/dismiss', authenticateToken, (req, res) => {
  db.query("UPDATE leave_requests SET is_hidden = 1 WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/leave-types', (req, res) => {
  db.query("SELECT * FROM leave_types WHERE is_active = 1", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/leave-balances/:userId', async (req, res) => {
  const userId = req.params.userId;
  const year = req.query.year || new Date().getFullYear();
  try {
    const [types] = await db.promise().query("SELECT id, name, annual_quota FROM leave_types WHERE is_active = 1");
    for (let type of types) {
      await db.promise().query(
        `INSERT IGNORE INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated)
         VALUES (?, ?, ?, ?, CURDATE())`,
        [userId, type.id, type.annual_quota || 15, year]
      );
    }
    const [results] = await db.promise().query(
      `SELECT lt.name as leave_type, eb.remaining_days, lt.annual_quota 
       FROM employee_leave_balances eb 
       JOIN leave_types lt ON eb.leave_type_id = lt.id 
       WHERE eb.user_id = ? AND eb.year = ?`,
      [userId, year]
    );
    res.json(results || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/leave-balances/:userId', (req, res) => {
  const { userId } = req.params;
  const { leave_type_id, remaining_days, year } = req.body;
  db.query(
    `INSERT INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated)
     VALUES (?, ?, ?, ?, CURDATE())
     ON DUPLICATE KEY UPDATE remaining_days = VALUES(remaining_days), last_updated = CURDATE()`,
    [userId, leave_type_id, remaining_days, year],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});


// ============================================
// 5. CALENDAR & EVENTS
// ============================================

app.get('/api/events', (req, res) => {
  const sql = `
    SELECT id, title, DATE_FORMAT(date, '%Y-%m-%d') as date, place, start_time, end_time, type, description, 'None' as status FROM events
    UNION ALL
    SELECT lr.id, CONCAT(u.full_name, ' (', lr.type, ')') as title, DATE_FORMAT(lr.request_date, '%Y-%m-%d') as date, 'Leave' as place, '08:00:00' as start_time, '17:00:00' as end_time, lr.type as type, lr.reason as description, lr.status
    FROM leave_requests lr 
    JOIN users u ON (lr.user_id = u.employee_id OR lr.user_id = u.id) 
    WHERE lr.is_hidden = 0 AND lr.status = 'Approved'
    ORDER BY date ASC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).send(err);
    res.json(results);
  });
});

app.post('/api/events', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { title, date, place, start_time, end_time, type, description } = req.body;
  db.query(
    "INSERT INTO events (title, date, place, start_time, end_time, type, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [title, date, place, start_time, end_time, type, description],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      logAction(req.user.id, 'CREATE_EVENT', 'event', result.insertId, req);
      res.json({ success: true });
    }
  );
});

app.put('/api/events/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { title, date, place, start_time, end_time, type, description } = req.body;
  const eventId = req.params.id;
  db.query(
    "UPDATE events SET title=?, date=?, place=?, start_time=?, end_time=?, type=?, description=? WHERE id=?",
    [title, date, place, start_time, end_time, type, description, eventId],
    (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      logAction(req.user.id, 'UPDATE_EVENT', 'event', eventId, req);
      res.json({ success: true });
    }
  );
});

app.delete('/api/events/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const eventId = req.params.id;
  db.query("DELETE FROM events WHERE id = ?", [eventId], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    logAction(req.user.id, 'DELETE_EVENT', 'event', eventId, req);
    res.json({ success: true });
  });
});

// ============================================
// COURSE MANAGEMENT
// ============================================

app.get('/api/courses', (req, res) => {
  db.query("SELECT id, name FROM courses", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/courses', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Course name required' });
  db.query("INSERT INTO courses (name) VALUES (?)", [name.trim()], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user.id, 'CREATE_COURSE', 'course', result.insertId, req);
    res.json({ success: true, id: result.insertId });
  });
});

app.put('/api/courses/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { name } = req.body;
  const courseId = req.params.id;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Course name required' });
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (oldRecord.length === 0) return res.status(404).json({ error: 'Course not found' });
    
    db.query("UPDATE courses SET name = ? WHERE id = ?", [name.trim(), courseId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user.id, 'UPDATE_COURSE', 'course', courseId, req, oldRecord[0], { name: name.trim() });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/courses/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const courseId = req.params.id;
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (oldRecord.length === 0) return res.status(404).json({ error: 'Course not found' });
    
    db.query("SELECT id FROM schedules WHERE course = ? LIMIT 1", [oldRecord[0].name], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      if (rows.length > 0) return res.status(400).json({ error: 'Cannot delete course as it is assigned to existing schedules.' });
      
      db.query("DELETE FROM courses WHERE id = ?", [courseId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.id, 'DELETE_COURSE', 'course', courseId, req, oldRecord[0], null);
        res.json({ success: true });
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ============================================
// 6. SCHEDULES & REQUESTS
// ============================================

app.get('/api/schedules', (req, res) => {
  const sql = `
    SELECT 
      u.full_name, u.employee_id, s.id AS schedule_id, DATE_FORMAT(s.date, '%Y-%m-%d') AS schedule_date, 
      s.place, s.course, s.start_time, s.end_time,
      CASE 
        WHEN a.time_out IS NOT NULL AND a.time_out != '--:--' THEN 'COMPLETED'
        WHEN a.time_in IS NOT NULL THEN 'IN PROGRESS'
        ELSE 'Scheduled'
      END AS attendance_status
    FROM users u 
    INNER JOIN schedules s ON u.employee_id = s.user_id
    LEFT JOIN attendance a ON s.id = a.schedule_id 
    WHERE LOWER(u.role) = 'instructor'
    
    UNION
    
    SELECT 
      u.full_name, u.employee_id, NULL AS schedule_id, DATE_FORMAT(lr.request_date, '%Y-%m-%d') AS schedule_date, 
      'Remote/Leave' AS place, 'On Leave' AS course, '00:00:00' AS start_time, '00:00:00' AS end_time, 'COMPLETED' AS attendance_status
    FROM users u 
    JOIN leave_requests lr ON u.employee_id = lr.user_id 
    WHERE lr.status = 'Approved' AND LOWER(u.role) = 'instructor'
    ORDER BY schedule_date DESC, full_name ASC
  `;
  
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

app.get('/api/schedules/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const sql = `
    SELECT 
      s.*, 
      DATE_FORMAT(s.date, '%Y-%m-%d') as date,
      CASE 
        WHEN a.time_out IS NOT NULL AND a.time_out != '--:--' THEN 'COMPLETED'
        WHEN a.time_in IS NOT NULL THEN 'IN PROGRESS'
        ELSE 'Scheduled'
      END AS attendance_status
    FROM schedules s
    LEFT JOIN attendance a ON s.id = a.schedule_id
    WHERE s.user_id = ? 
    ORDER BY s.date ASC, s.start_time ASC
  `;
  
  db.query(sql, [req.params.employeeId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result || []);
  });
});

async function hasScheduleConflict(user_id, date, start_time, end_time, excludeId = null) {
  let sql = `SELECT id FROM schedules WHERE user_id = ? AND date = ? AND NOT (end_time <= ? OR start_time >= ?)`;
  const params = [user_id, date, start_time, end_time];
  const [rows] = await db.promise().query(sql, params);
  if (excludeId) return rows.filter(r => r.id != excludeId).length > 0;
  return rows.length > 0;
}

app.post('/api/schedules', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { user_id, date, place, course, start_time, end_time } = req.body;
  const { date: today } = getPHTime();

  if (date < today) {
    return res.status(400).json({ success: false, error: 'Cannot create schedule for a past date.' });
  }

  const [leaveRows] = await db.promise().query(
    "SELECT id FROM leave_requests WHERE user_id = ? AND request_date = ? AND status = 'Approved'",
    [user_id, date]
  );
  if (leaveRows.length > 0) {
    return res.status(409).json({ success: false, error: 'Cannot assign schedule. Employee has an approved leave on this date.' });
  }

  const [locRows] = await db.promise().query("SELECT id FROM school_locations WHERE name = ?", [place]);
  if (locRows.length === 0) {
    return res.status(400).json({ success: false, error: 'Schedule place must be a registered school location.' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ success: false, error: 'End time must be after start time.' });
  }
  if (await hasScheduleConflict(user_id, date, start_time, end_time)) {
    return res.status(409).json({ success: false, error: 'Time conflict.' });
  }

  db.query(
    "INSERT INTO schedules (user_id, date, place, course, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
    [user_id, date, place, course, start_time, end_time],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      logAction(req.user.id, 'CREATE_SCHEDULE', 'schedule', result.insertId, req);
      res.json({ success: true });
    }
  );
});

app.put('/api/schedules/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { date, place, course, start_time, end_time } = req.body;
  const scheduleId = req.params.id;
  const { date: today } = getPHTime();

  const [attRows] = await db.promise().query(
    "SELECT id FROM attendance WHERE schedule_id = ?",
    [scheduleId]
  );
  if (attRows.length > 0) {
    return res.status(403).json({ success: false, error: "Cannot modify this schedule; attendance has already been recorded." });
  }

  if (date < today) return res.status(400).json({ success: false, error: "Cannot update schedule to a past date." });
  if (place) {
    const [locRows] = await db.promise().query("SELECT id FROM school_locations WHERE name = ?", [place]);
    if (locRows.length === 0) return res.status(400).json({ success: false, error: "Invalid location." });
  }
  if (start_time >= end_time) return res.status(400).json({ success: false, error: "End time must be after start time." });

  const [old] = await db.promise().query("SELECT * FROM schedules WHERE id = ?", [scheduleId]);
  if (old.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
  
  const oldData = old[0];
  const user_id = oldData.user_id;
  if (await hasScheduleConflict(user_id, date, start_time, end_time, scheduleId)) {
    return res.status(409).json({ success: false, error: "Time conflict." });
  }

  const newData = { date, place, course, start_time, end_time };

  db.query("UPDATE schedules SET date=?, place=?, course=?, start_time=?, end_time=? WHERE id=?", 
    [date, place, course, start_time, end_time, scheduleId], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      logAction(req.user.id, 'UPDATE_SCHEDULE', 'schedule', scheduleId, req, oldData, newData);
      res.json({ success: true });
    }
  );
});

app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const scheduleId = req.params.id;

  const [attRows] = await db.promise().query(
    "SELECT id FROM attendance WHERE schedule_id = ?",
    [scheduleId]
  );
  if (attRows.length > 0) {
    return res.status(403).json({ success: false, error: "Cannot delete this schedule; attendance has already been recorded." });
  }

  const [oldRecord] = await db.promise().query("SELECT * FROM schedules WHERE id = ?", [scheduleId]);
  if (oldRecord.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
  const oldData = oldRecord[0];

  db.query("DELETE FROM schedules WHERE id = ?", [scheduleId], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
    
    logAction(req.user.id, 'DELETE_SCHEDULE', 'schedule', scheduleId, req, oldData, null);
    res.json({ success: true });
  });
});

app.post('/api/schedules/bulk', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { schedules } = req.body;
  if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
    return res.status(400).json({ success: false, error: 'No schedule data provided.' });
  }

  const results = { successCount: 0, errors: [] };
  const { date: today } = getPHTime();

  const checkConflict = async (userId, date, start, end) => {
    const [rows] = await db.promise().query(
      "SELECT id FROM schedules WHERE user_id = ? AND date = ? AND NOT (end_time <= ? OR start_time >= ?)",
      [userId, date, start, end]
    );
    return rows.length > 0;
  };

  for (let i = 0; i < schedules.length; i++) {
    const row = schedules[i];
    const { employee_id, date, place, course, start_time, end_time } = row;
    const rowNum = i + 2; 

    try {
      if (!employee_id || !date || !place || !course || !start_time || !end_time) {
        results.errors.push(`Row ${rowNum}: Missing required fields.`);
        continue;
      }
      if (date < today) {
        results.errors.push(`Row ${rowNum}: Cannot schedule for a past date (${date}).`);
        continue;
      }
      if (start_time >= end_time) {
        results.errors.push(`Row ${rowNum}: End time must be after start time.`);
        continue;
      }

      const [userRows] = await db.promise().query(
        "SELECT employee_id FROM users WHERE employee_id = ? AND LOWER(role) = 'instructor' AND status = 'active'",
        [employee_id]
      );
      if (userRows.length === 0) {
        results.errors.push(`Row ${rowNum}: Invalid or inactive Instructor ID (${employee_id}).`);
        continue;
      }

      const [leaveRows] = await db.promise().query(
        "SELECT id FROM leave_requests WHERE user_id = ? AND request_date = ? AND status = 'Approved'",
        [employee_id, date]
      );
      if (leaveRows.length > 0) {
        results.errors.push(`Row ${rowNum}: Instructor ${employee_id} is on an approved leave on ${date}.`);
        continue;
      }

      const [locRows] = await db.promise().query("SELECT id FROM school_locations WHERE name = ?", [place]);
      if (locRows.length === 0) {
        results.errors.push(`Row ${rowNum}: Unknown school location (${place}).`);
        continue;
      }

      if (await checkConflict(employee_id, date, start_time, end_time)) {
        results.errors.push(`Row ${rowNum}: Time conflict for ${employee_id} on ${date}.`);
        continue;
      }

      await db.promise().query(
        "INSERT INTO schedules (user_id, date, place, course, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
        [employee_id, date, place, course, start_time, end_time]
      );
      results.successCount++;

    } catch (err) {
      results.errors.push(`Row ${rowNum}: Database error - ${err.message}`);
    }
  }

  logAction(req.user.id, 'BULK_CREATE_SCHEDULES', 'schedule', null, req);
  res.json({ success: true, ...results });
});

app.get('/api/schedule-requests/pending-count', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT COUNT(*) AS count FROM schedule_change_requests WHERE LOWER(status) = 'pending'", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ count: results[0].count });
  });
});

app.get('/api/schedule-requests/my', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query("SELECT * FROM schedule_change_requests WHERE user_id = (SELECT employee_id FROM users WHERE id = ?) ORDER BY created_at DESC", [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/schedule-requests', authenticateToken, (req, res) => {
  const { request_type, date, place, course, start_time, end_time, reason } = req.body;
  const userId = req.user.id;
  db.query("SELECT employee_id, full_name FROM users WHERE id = ?", [userId], (err, rows) => {
    if (err || rows.length === 0) return res.status(500).json({ success: false, error: 'User not found' });
    const employeeId = rows[0].employee_id;
    const fullName = rows[0].full_name;
    db.query(
      "INSERT INTO schedule_change_requests (user_id, full_name, request_type, date, place, course, start_time, end_time, reason, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [employeeId, fullName, request_type, date, place, course, start_time, end_time, reason, 'pending'],
      (err, result) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        logAction(req.user.id, 'SUBMIT_SCHEDULE_REQUEST', 'schedule_request', result.insertId, req);
        res.json({ success: true, message: 'Schedule request submitted!' });
      }
    );
  });
});

app.get('/api/schedule-requests/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT * FROM schedule_change_requests WHERE LOWER(status) = 'pending' ORDER BY created_at DESC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.put('/api/schedule-requests/:id/status', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { status, admin_remarks } = req.body;
  const requestId = req.params.id;
  db.query("SELECT * FROM schedule_change_requests WHERE id = ?", [requestId], (err, rows) => {
    if (err || rows.length === 0) return res.status(500).json({ error: 'Request not found' });
    const request = rows[0];
    const newStatus = status.toLowerCase();
    db.query("UPDATE schedule_change_requests SET status = ?, admin_remarks = ?, reviewed_at = NOW() WHERE id = ?", [newStatus, admin_remarks || null, requestId], async (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const action = newStatus === 'approved' ? 'APPROVE_SCHEDULE_REQUEST' : 'REJECT_SCHEDULE_REQUEST';
      logAction(req.user.id, action, 'schedule_request', requestId, req);
      if (newStatus === 'approved') {
        try {
          if (request.request_type === 'new') {
            await db.promise().query("INSERT INTO schedules (user_id, date, place, course, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
              [request.user_id, request.date, request.place, request.course, request.start_time, request.end_time]);
          } else if (request.request_type === 'change') {
            await db.promise().query("UPDATE schedules SET place = ?, course = ?, start_time = ?, end_time = ? WHERE user_id = ? AND date = ?",
              [request.place, request.course, request.start_time, request.end_time, request.user_id, request.date]);
          }
          res.json({ success: true, message: 'Request approved and schedule updated.' });
        } catch (updateErr) {
          res.status(500).json({ success: false, error: updateErr.message });
        }
      } else if (newStatus === 'rejected') {
        res.json({ success: true, message: 'Request rejected.' });
      } else {
        res.status(400).json({ success: false, error: 'Invalid status' });
      }
    });
  });
});

// ... remainder of server logic ...
// (Retain all existing logic exactly as it is for the rest of your server.js)
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`UniVITA Backend running on http://0.0.0.0:${PORT}`);
});

const wss = new WebSocket.Server({ server });

const broadcastToAdminAndHR = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user && 
        (client.user.role === 'admin' || client.user.role === 'hr_admin')) {
      client.send(JSON.stringify(data));
    }
  });
};

wss.on('connection', (ws, req) => {
  const params = url.parse(req.url, true).query;
  const token = params.token;
  if (!token) return ws.close(4001, 'Authentication token missing');
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    db.query("SELECT id, email, role FROM users WHERE id = ? AND status = 'active'", [userId], (err, rows) => {
      if (err || rows.length === 0) return ws.close(4001, 'User not found');
      const user = rows[0];
      ws.user = user;
      wsClients.set(user.id, ws);
      ws.on('message', (data) => {
        let msgData;
        try { msgData = JSON.parse(data); } catch (e) { return; }
        if (msgData.type === 'message') {
          const { roomId, roomName, content } = msgData;
          if (!roomId || !content.trim()) return;
          if (!roomName?.startsWith('dm_')) {
            if (roomId !== 1 && user.role !== 'admin' && user.role !== 'security' && user.role !== 'hr_admin') {
              ws.send(JSON.stringify({ type: 'error', message: 'Access denied to this room' }));
              return;
            }
          }
          db.query("INSERT INTO chat_messages (room_id, user_id, message) VALUES (?, ?, ?)", [roomId, user.id, content.trim()], (err, result) => {
            if (err) return;
            const messageObj = { id: result.insertId, room_id: roomId, user_id: user.id, full_name: user.email, message: content.trim(), sent_at: new Date().toISOString() };
            if (roomName && roomName.startsWith('dm_')) {
              const participantIds = roomName.split('_').slice(1).map(Number);
              participantIds.forEach(pid => {
                const client = wsClients.get(pid);
                if (client && client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'new_message', message: messageObj }));
              });
            } else {
              wss.clients.forEach(client => { if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type: 'new_message', message: messageObj })); });
            }
          });
        }
      });
      ws.on('close', () => wsClients.delete(user.id));
    });
  } catch (err) {
    ws.close(4001, 'Invalid token');
  }
});
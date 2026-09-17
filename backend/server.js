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


const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];


const allowedOrigins = [
  'https://univitahct.tech',        
  'https://www.univitahct.tech',    
  'https://univita.site',
  'https://univitahct.netlify.app',
  'http://localhost:3000',          
  'http://localhost:8081',          
  ...envOrigins
];

// Strictly allow local development ports ONLY when not in production
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:8081');
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], 
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      // Replaced dead railway domain with your actual API and allowed origins
      connectSrc: ["'self'", "https://api.univitahct.tech", "wss://api.univitahct.tech", ...allowedOrigins]
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

// Dynamic CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Blocked by CORS: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

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


const uploadsPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'uploads');

// Ensure base upload directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
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
    req.user = user; // { id, email, role }
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
  cb(null, true);
};

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF is allowed.'));
  }
};

// 1. LEAVE IMAGES
const uploadDir = path.join(uploadsPath, 'leave_images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `leave_${unique}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

// 2. RESUMES
const resumeDir = path.join(uploadsPath, 'resumes');
if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumeDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume_${unique}${path.extname(file.originalname)}`);
  }
});
const uploadResume = multer({ storage: resumeStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: pdfFilter });

// 3. SELFIES
const selfieDir = path.join(uploadsPath, 'selfies');
if (!fs.existsSync(selfieDir)) fs.mkdirSync(selfieDir, { recursive: true });
const selfieStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, selfieDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '.jpg');
  }
});
const multerSelfie = multer({ storage: selfieStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

// 4. CORRECTIONS
const correctionDir = path.join(uploadsPath, 'corrections');
if (!fs.existsSync(correctionDir)) fs.mkdirSync(correctionDir, { recursive: true });
const correctionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, correctionDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '.jpg');
  }
});
const multerCorrection = multer({ storage: correctionStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

// 5. APPEALS
const appealUploadDir = path.join(uploadsPath, 'attendance_appeals');
if (!fs.existsSync(appealUploadDir)) fs.mkdirSync(appealUploadDir, { recursive: true });
const appealStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, appealUploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `appeal_${unique}${path.extname(file.originalname)}`);
  }
});
const uploadAppeal = multer({ storage: appealStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });





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

// ============================================
// PASSWORD RECOVERY & OTP VERIFICATION ROUTES
// ============================================

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const isMobile = req.body.isMobile;
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  db.query("SELECT id, role FROM users WHERE email = ? AND status = 'active'", [email], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length === 0) {
      return res.status(404).json({ success: false, message: 'No active account found with that email.' });
    }

    const user = results[0];
    
    // 🔴 STRICT ROLE RESTRICTIONS FOR RECOVERY
    if (isMobile && user.role !== 'instructor') {
      return res.status(403).json({ success: false, message: 'This account does not have access.' });
    }
    if (!isMobile && user.role === 'instructor') {
      return res.status(403).json({ success: false, message: 'This account does not have access.' });
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

app.post('/api/auth/verify-reset-otp', otpLimiter, (req, res) => {
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

  res.json({ success: true, message: 'OTP verified successfully.' });
});

app.post('/api/auth/reset-password', otpLimiter, async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const otp = req.body.otp;
  const newPassword = req.body.newPassword;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'For security, your password must be at least 8 characters long.' });
  }

  const record = OTP_STORE[email];
  if (!record) return res.status(400).json({ success: false, message: 'OTP not found. Please request a new one.' });
  if (Date.now() > record.expiresAt) {
    delete OTP_STORE[email];
    return res.status(400).json({ success: false, message: 'Your OTP has expired. Please request a new one.' });
  }
  if (record.otp !== otp) return res.status(400).json({ success: false, message: 'The OTP entered is incorrect.' });

  delete OTP_STORE[email];

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE email = ?", [hashedPassword, email], (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error during password reset.' });
      res.json({ success: true, message: 'Your password has been successfully reset!' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Encryption error. Please try again.' });
  }
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password, isMobile } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  db.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database connection error.' });
    if (results.length === 0) return res.status(401).json({ success: false, message: 'Incorrect password.' }); 

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    
    if (!match && password === user.password) {
      const hashed = await bcrypt.hash(password, 10);
      db.query("UPDATE users SET password = ? WHERE id = ?", [hashed, user.id]);
    } else if (!match) {
      return res.status(401).json({ success: false, message: 'Incorrect password.' });
    }

    // 🔴 MOBILE APP ROLE RESTRICTION: Block Admin/HR/Security from Mobile
    if (isMobile && user.role !== 'instructor') {
      return res.status(403).json({ success: false, message: 'This account does not have access.' });
    }

    // 🔴 WEB PORTAL ROLE RESTRICTION: Block Instructors from Web
    if (!isMobile && user.role === 'instructor') {
      return res.status(403).json({ success: false, message: 'This account does not have access.' });
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
        message: "Your password has expired. Please renew it to continue.",
        tempToken,
        user: { id: user.id, role: user.role }
      });
    }

    const tempToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ success: true, message: 'Login successful.', requiresOtp: true, tempToken, email: user.email });
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

app.put('/api/users/:identifier/update-password', authenticateToken, verifyOwnership, async (req, res) => {
  const { identifier } = req.params;
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new passwords are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
  }

  db.query("SELECT * FROM users WHERE (id = ? OR employee_id = ?)", [identifier, identifier], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection error." });
    if (results.length === 0) return res.status(404).json({ success: false, message: "User not found." });
    
    const user = results[0];
    const match = await bcrypt.compare(currentPassword.trim(), user.password);
    if (!match && currentPassword.trim() !== user.password) {
      return res.status(401).json({ success: false, message: "Invalid current password provided." });
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword.trim(), 10);
      db.query("UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE id = ?", [hashedPassword, user.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "Failed to update password in database." });
        res.json({ success: true, message: "Password updated successfully." });
      });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error encrypting new password.' });
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

  // 1. STRICT PAYLOAD VALIDATION: Require selfie and valid GPS
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A selfie is required to verify your attendance.' });
  }
  
  const parsedLat = parseFloat(latitude);
  const parsedLon = parseFloat(longitude);
  if (!latitude || !longitude || isNaN(parsedLat) || isNaN(parsedLon) || parsedLat === 0 || parsedLon === 0) {
    return res.status(400).json({ success: false, message: 'Unable to retrieve valid GPS location. Ensure location permissions are granted.' });
  }

  const selfiePath = `/uploads/selfies/${req.file.filename}`;
  const { date: todayDate, time: currentTime } = getPHTime();

  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id, full_name FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'User inactive or not found.' });
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
    if (schedRows.length === 0) return res.status(403).json({ success: false, message: 'No work schedule found.' });
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
    if (locRows.length === 0) return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered in the system.` });
    const schoolGeo = locRows[0];

    // Calculate distance strictly using provided GPS coordinates
    const distance = getDistanceFromLatLonInMeters(parsedLat, parsedLon, schoolGeo.latitude, schoolGeo.longitude);
    if (distance > schoolGeo.radius) {
      return res.status(403).json({ success: false, message: `Not within ${schedulePlace} campus. Distance: ${Math.round(distance)}m` });
    }

    const [existing] = await db.promise().query("SELECT id FROM attendance WHERE user_id = ? AND schedule_id = ?", [employee_id, schedule_id]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'You have already clocked in for this schedule.' });

    const status = diffMinutes > 30 ? 'late' : 'present';

    const [result] = await db.promise().query(
      `INSERT INTO attendance 
        (user_id, schedule_id, date, time_in, status, clock_in_selfie,
         clock_in_latitude, clock_in_longitude, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, schedule_id, todayDate, currentTime, status,
       selfiePath, parsedLat, parsedLon,
       `${schedulePlace} (${parsedLat.toFixed(6)}, ${parsedLon.toFixed(6)})`]
    );

    logAction(req.user.id, 'CLOCK_IN', 'attendance', result.insertId, req);

    res.json({ success: true, message: `Clocked in successfully as ${status} at ${formatTo12Hour(currentTime)}.` });
  } catch (err) {
    console.error("Clock-in error:", err);
    res.status(500).json({ success: false, message: "A server error occurred during clock-in." });
  }
});

app.post('/api/attendance/clock-out', authenticateToken, multerSelfie.single('selfie'), async (req, res) => {
  let { latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;

  // 1. STRICT PAYLOAD VALIDATION: Require selfie and valid GPS
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A selfie is required to verify your clock-out.' });
  }
  
  const parsedLat = parseFloat(latitude);
  const parsedLon = parseFloat(longitude);
  if (!latitude || !longitude || isNaN(parsedLat) || isNaN(parsedLon) || parsedLat === 0 || parsedLon === 0) {
    return res.status(400).json({ success: false, message: 'Unable to retrieve valid GPS location. Ensure location permissions are granted.' });
  }

  const selfiePath = `/uploads/selfies/${req.file.filename}`;
  const { date: todayDate, time: currentTime } = getPHTime();

  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'User inactive or not found.' });
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
    if (schedRows.length === 0) return res.status(403).json({ success: false, message: 'Schedule not found.' });
    const { place: schedulePlace, end_time: scheduledEndTime } = schedRows[0];

    const [locRows] = await db.promise().query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    if (locRows.length === 0) return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered in the system.` });
    const schoolGeo = locRows[0];

    // Calculate distance strictly using provided GPS coordinates
    const distance = getDistanceFromLatLonInMeters(parsedLat, parsedLon, schoolGeo.latitude, schoolGeo.longitude);
    if (distance > schoolGeo.radius) {
      return res.status(403).json({ success: false, message: `Not within ${schedulePlace} campus. Distance: ${Math.round(distance)}m` });
    }

    const [existing] = await db.promise().query(
      "SELECT id, time_in FROM attendance WHERE user_id = ? AND schedule_id = ? AND time_out IS NULL",
      [employee_id, schedule_id]
    );
    if (existing.length === 0) return res.status(400).json({ success: false, message: 'No active clock-in found for this schedule.' });

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
      [finalTimeOut, selfiePath, parsedLat, parsedLon, schedulePlace, existing[0].id]
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
    res.status(500).json({ success: false, message: "A server error occurred during clock-out." });
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
// LEAVE REQUESTS (Secured & Validated)
// ============================================

app.post('/api/leave-requests', authenticateToken, upload.single('image'), async (req, res) => {
  const { request_date, reason, type } = req.body;
  const userId = req.user.id;

  // 1. Strict Input Validation
  if (!request_date || !reason || !type) {
    return res.status(400).json({ success: false, message: "Date, reason, and leave type are required." });
  }
  if (reason.trim().length < 10) {
    return res.status(400).json({ success: false, message: "Please provide a more detailed reason (minimum 10 characters)." });
  }

  // 2. Prevent Retroactive Non-Emergency Leaves
  const { date: today } = getPHTime(); 
  if (request_date < today && type !== 'Emergency Leave' && type !== 'Sick Leave') {
    return res.status(400).json({ success: false, message: `${type} cannot be filed retroactively.` });
  }

  const leaveYear = new Date(request_date).getFullYear();

  try {
    const [userRows] = await db.promise().query("SELECT employee_id FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: "User not found in system." });
    const employee_id = userRows[0].employee_id;

    const [existingReq] = await db.promise().query(
      "SELECT id FROM leave_requests WHERE user_id = ? AND request_date = ? AND status IN ('Pending', 'Approved')",
      [employee_id, request_date]
    );
    if (existingReq.length > 0) return res.status(409).json({ success: false, message: "A request already exists for this date." });

    const [typeRows] = await db.promise().query("SELECT id, annual_quota FROM leave_types WHERE name = ?", [type]);
    if (typeRows.length === 0) return res.status(400).json({ success: false, message: "Invalid leave type selected." });
    
    const leaveTypeId = typeRows[0].id;
    const annualQuota = typeRows[0].annual_quota || 15;

    // Ensure balance row exists
    await db.promise().query(
      `INSERT IGNORE INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated) VALUES (?, ?, ?, ?, CURDATE())`,
      [userId, leaveTypeId, annualQuota, leaveYear]
    );

    const [balanceRows] = await db.promise().query(
      `SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
      [userId, leaveTypeId, leaveYear]
    );
    
    if (balanceRows[0].remaining_days < 1) {
      return res.status(400).json({ success: false, message: `Insufficient ${type} balance. You have 0 days remaining.` });
    }

    const image_url = req.file ? `/uploads/leave_images/${req.file.filename}` : null;
    const [result] = await db.promise().query(
      `INSERT INTO leave_requests (user_id, request_date, reason, type, image_url, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [employee_id, request_date, reason, type, image_url]
    );
    
    res.json({ success: true, message: "Leave request submitted successfully." });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: "Duplicate entry detected." });
    console.error("Leave Request Submit Error:", err);
    res.status(500).json({ success: false, message: "Server connection failed while submitting request." });
  }
});

app.get('/api/leave-requests/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }
  db.query(
    `SELECT lr.*, u.full_name FROM leave_requests lr LEFT JOIN users u ON lr.user_id = u.employee_id WHERE lr.is_hidden = 0 ORDER BY lr.request_date DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: "Failed to fetch leave requests." });
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
      if (err) return res.status(500).json({ success: false, message: "Failed to fetch leave history." });
      res.json(results || []);
    }
  );
});

app.get('/api/leave-requests/user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  db.query("SELECT * FROM leave_requests WHERE user_id = ? ORDER BY request_date DESC", [req.params.employeeId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch user leaves." });
    res.json(result || []);
  });
});

app.put('/api/leave-requests/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }
  const { status, admin_remarks } = req.body;
  const requestId = req.params.id;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status update.' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [leaveRows] = await connection.query(`SELECT user_id, request_date, type FROM leave_requests WHERE id = ?`, [requestId]);
    if (leaveRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Leave request not found." });
    }
    const { user_id: employee_id, request_date, type } = leaveRows[0];

    // FIX: Get the INT ID for the employee_leave_balances table
    const [userRows] = await connection.query("SELECT id FROM users WHERE employee_id = ?", [employee_id]);
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Associated user account not found." });
    }
    const internalUserId = userRows[0].id;

    await connection.query(`UPDATE leave_requests SET status = ?, admin_remarks = ?, reviewed_at = NOW() WHERE id = ?`, [status, admin_remarks || null, requestId]);

    if (status === 'Approved') {
      const leaveYear = new Date(request_date).getFullYear();
      const [typeRows] = await connection.query(`SELECT id FROM leave_types WHERE name = ?`, [type]);
      if (typeRows.length === 0) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: "Invalid leave type detected in database." });
      }
      const leaveTypeId = typeRows[0].id;

      const [balanceRows] = await connection.query(
        `SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ? FOR UPDATE`,
        [internalUserId, leaveTypeId, leaveYear]
      );
      
      if (balanceRows.length === 0 || balanceRows[0].remaining_days < 1) {
        await connection.rollback();
        return res.status(400).json({ success: false, message: `Cannot approve: Insufficient ${type} balance for ${leaveYear}.` });
      }
      
      const newBalance = balanceRows[0].remaining_days - 1;
      await connection.query(
        `UPDATE employee_leave_balances SET remaining_days = ?, last_updated = CURDATE() WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
        [newBalance, internalUserId, leaveTypeId, leaveYear]
      );
      
      await connection.query(
        `INSERT INTO attendance (user_id, date, status, location) VALUES (?, ?, 'on leave', 'Remote/Leave') ON DUPLICATE KEY UPDATE status = 'on leave'`,
        [employee_id, request_date]
      );
    }
    await connection.commit();
    
    const action = status === 'Approved' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE';
    logAction(req.user.id, action, 'leave_request', requestId, req);
    res.json({ success: true, message: `Leave request successfully ${status.toLowerCase()}.` });
  } catch (err) {
    await connection.rollback();
    console.error("Error updating leave request status:", err);
    res.status(500).json({ success: false, message: "Server connection failed while updating status." });
  } finally {
    connection.release();
  }
});

app.put('/api/leave-requests/:id/dismiss', authenticateToken, (req, res) => {
  db.query("UPDATE leave_requests SET is_hidden = 1 WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to dismiss request." });
    res.json({ success: true, message: "Request dismissed successfully." });
  });
});

app.get('/api/leave-types', (req, res) => {
  db.query("SELECT * FROM leave_types WHERE is_active = 1", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch leave types." });
    res.json(results || []);
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
    console.error("Leave balances error:", err);
    res.status(500).json({ success: false, message: "Failed to load leave balances." });
  }
});

app.put('/api/leave-balances/:userId', (req, res) => {
  const { userId } = req.params;
  const { leave_type_id, remaining_days, year } = req.body;

  if (!leave_type_id || remaining_days === undefined || !year) {
    return res.status(400).json({ success: false, message: "Missing required balance parameters." });
  }

  db.query(
    `INSERT INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated)
     VALUES (?, ?, ?, ?, CURDATE())
     ON DUPLICATE KEY UPDATE remaining_days = VALUES(remaining_days), last_updated = CURDATE()`,
    [userId, leave_type_id, remaining_days, year],
    (err) => {
      if (err) return res.status(500).json({ success: false, message: "Failed to update leave balance." });
      res.json({ success: true, message: "Leave balance successfully updated." });
    }
  );
});

// ============================================
// 5. CALENDAR & EVENTS (Secured & Validated)
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
    if (err) return res.status(500).json({ success: false, message: "Failed to load events." });
    res.json(results || []);
  });
});

app.post('/api/events', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  const { title, date, place, start_time, end_time, type, description } = req.body;
  
  if (!title || !date || !type) {
    return res.status(400).json({ success: false, message: 'Event title, date, and type are required.' });
  }

  db.query(
    "INSERT INTO events (title, date, place, start_time, end_time, type, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [title.trim(), date, place || null, start_time || null, end_time || null, type, description || ''],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error while creating event.' });
      logAction(req.user.id, 'CREATE_EVENT', 'event', result.insertId, req);
      res.json({ success: true, message: 'Event created successfully.' });
    }
  );
});

app.put('/api/events/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  const { title, date, place, start_time, end_time, type, description } = req.body;
  const eventId = req.params.id;

  if (!title || !date || !type) {
    return res.status(400).json({ success: false, message: 'Event title, date, and type are required.' });
  }

  db.query(
    "UPDATE events SET title=?, date=?, place=?, start_time=?, end_time=?, type=?, description=? WHERE id=?",
    [title.trim(), date, place || null, start_time || null, end_time || null, type, description || '', eventId],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error while updating event.' });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Event not found.' });
      logAction(req.user.id, 'UPDATE_EVENT', 'event', eventId, req);
      res.json({ success: true, message: 'Event updated successfully.' });
    }
  );
});

app.delete('/api/events/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  const eventId = req.params.id;
  db.query("DELETE FROM events WHERE id = ?", [eventId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error while deleting event.' });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Event not found.' });
    logAction(req.user.id, 'DELETE_EVENT', 'event', eventId, req);
    res.json({ success: true, message: 'Event deleted successfully.' });
  });
});


// ============================================
// 6. SCHEDULES & REQUESTS (Secured & Validated)
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
    if (err) return res.status(500).json({ success: false, message: "Failed to load schedules." });
    res.json(result || []);
  });
});

app.get('/api/schedules/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const sql = `
    SELECT 
      s.*, 
      a.time_in,
      a.time_out,
      a.status AS attendance_record_status,
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
    if (err) return res.status(500).json({ success: false, message: "Failed to load personal schedules." });
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
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { user_id, date, place, course, start_time, end_time } = req.body;
  const { date: today } = getPHTime();

  if (!user_id || !date || !place || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: 'All schedule fields are required.' });
  }
  if (date < today) {
    return res.status(400).json({ success: false, message: 'Cannot create a schedule for a past date.' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ success: false, message: 'End time must be after start time.' });
  }

  try {
    const [leaveRows] = await db.promise().query(
      "SELECT id FROM leave_requests WHERE user_id = ? AND request_date = ? AND status = 'Approved'",
      [user_id, date]
    );
    if (leaveRows.length > 0) {
      return res.status(409).json({ success: false, message: 'Cannot assign schedule. Employee is on an approved leave on this date.' });
    }

    const [locRows] = await db.promise().query("SELECT id FROM school_locations WHERE name = ?", [place]);
    if (locRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Schedule place must be a registered school location.' });
    }
    
    if (await hasScheduleConflict(user_id, date, start_time, end_time)) {
      return res.status(409).json({ success: false, message: 'Time conflict with an existing schedule.' });
    }

    const [result] = await db.promise().query(
      "INSERT INTO schedules (user_id, date, place, course, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
      [user_id, date, place, course || '', start_time, end_time]
    );
    logAction(req.user.id, 'CREATE_SCHEDULE', 'schedule', result.insertId, req);
    res.json({ success: true, message: 'Schedule created successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while creating schedule.' });
  }
});

app.put('/api/schedules/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { date, place, course, start_time, end_time } = req.body;
  const scheduleId = req.params.id;
  const { date: today } = getPHTime();

  if (!date || !place || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: 'All schedule fields are required.' });
  }
  if (date < today) return res.status(400).json({ success: false, message: "Cannot update schedule to a past date." });
  if (start_time >= end_time) return res.status(400).json({ success: false, message: "End time must be after start time." });

  try {
    const [attRows] = await db.promise().query("SELECT id FROM attendance WHERE schedule_id = ?", [scheduleId]);
    if (attRows.length > 0) {
      return res.status(403).json({ success: false, message: "Cannot modify this schedule; attendance has already been recorded." });
    }

    const [locRows] = await db.promise().query("SELECT id FROM school_locations WHERE name = ?", [place]);
    if (locRows.length === 0) return res.status(400).json({ success: false, message: "Invalid location." });

    const [old] = await db.promise().query("SELECT * FROM schedules WHERE id = ?", [scheduleId]);
    if (old.length === 0) return res.status(404).json({ success: false, message: "Schedule not found." });
    
    const oldData = old[0];
    const user_id = oldData.user_id;
    if (await hasScheduleConflict(user_id, date, start_time, end_time, scheduleId)) {
      return res.status(409).json({ success: false, message: "Time conflict with another schedule." });
    }

    const newData = { date, place, course, start_time, end_time };

    await db.promise().query("UPDATE schedules SET date=?, place=?, course=?, start_time=?, end_time=? WHERE id=?", 
      [date, place, course || '', start_time, end_time, scheduleId]);
      
    logAction(req.user.id, 'UPDATE_SCHEDULE', 'schedule', scheduleId, req, oldData, newData);
    res.json({ success: true, message: 'Schedule updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while updating schedule.' });
  }
});

app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const scheduleId = req.params.id;

  try {
    const [attRows] = await db.promise().query("SELECT id FROM attendance WHERE schedule_id = ?", [scheduleId]);
    if (attRows.length > 0) {
      return res.status(403).json({ success: false, message: "Cannot delete this schedule; attendance has already been recorded." });
    }

    const [oldRecord] = await db.promise().query("SELECT * FROM schedules WHERE id = ?", [scheduleId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: "Schedule not found." });
    const oldData = oldRecord[0];

    const [result] = await db.promise().query("DELETE FROM schedules WHERE id = ?", [scheduleId]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Schedule not found." });
    
    logAction(req.user.id, 'DELETE_SCHEDULE', 'schedule', scheduleId, req, oldData, null);
    res.json({ success: true, message: 'Schedule deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error while deleting schedule.' });
  }
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


// ============================================
// 7. REPORTS & EMPLOYEES (Secured & Validated)
// ============================================


app.get('/api/attendance/all-recent', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view attendance records.' });
  }
  const sql = `
    SELECT a.*, DATE_FORMAT(a.date, '%Y-%m-%d') as date, u.full_name, u.employee_id 
    FROM attendance a 
    JOIN users u ON a.user_id = u.employee_id 
    ORDER BY a.date DESC, a.time_in DESC 
    LIMIT 500
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to fetch recent attendance records.' });
    res.json(results || []);
  });
});

app.get('/api/attendance/user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const employeeId = req.params.employeeId;
  const sql = "SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as date, ROUND(TIMESTAMPDIFF(MINUTE, time_in, time_out) / 60, 2) as total_hours FROM attendance WHERE user_id = ? ORDER BY date DESC";
  db.query(sql, [employeeId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load user attendance.' });
    res.json(result || []);
  });
});

app.get('/api/payroll/employee-history/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const { employeeId } = req.params;
  const sql = `
    SELECT p.id, p.month_year, p.salary_rate, p.total_hours, p.overtime_hours,
           p.overtime_pay, p.transport_allowance, p.meal_allowance, p.housing_allowance,
           p.sss_deduction, p.philhealth_deduction, p.pagibig_deduction, p.loan_deduction,
           p.other_deduction, p.gross_pay, p.tax_deduction, p.net_pay, p.status
    FROM payroll p
    JOIN users u ON p.user_id = u.id
    WHERE u.employee_id = ?
    ORDER BY p.id DESC
    LIMIT 12
  `;
  db.query(sql, [employeeId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load payroll history.' });
    res.json(results || []);
  });
});

app.get('/api/employees', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  db.query("SELECT * FROM users ORDER BY full_name ASC", (err, result) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to fetch employee list.' });
    res.json(result || []);
  });
});

app.post('/api/employees', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to add employees.' });
  }

  const {
    employee_id, full_name, first_name, last_name, email, password, role,
    employment_type, position_level, contract_type,
    monthly_salary, work_days_per_month,
    payroll_access, payroll_pin,
    middle_initial, date_of_joining, account_expiration_date,
    date_of_birth, phone_number, gender,
    emergency_contact_name, emergency_contact_phone,
    street_address, city, state_province, postal_code, country, additional_info, position
  } = req.body;

  // 1. Strict Payload Validation
  if (!employee_id || !full_name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Employee ID, Name, Email, Password, and Role are mandatory fields.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email format.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'For security, the new password must be at least 8 characters long.' });
  }
  if (monthly_salary && (isNaN(monthly_salary) || monthly_salary < 0)) {
    return res.status(400).json({ success: false, message: 'Monthly salary must be a valid positive number.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const finalPin = payroll_pin || '1234';
    const finalAccess = payroll_access || 0;

    const sql = `INSERT INTO users 
      (employee_id, full_name, first_name, last_name, email, password, role, status,
       employment_type, position_level, contract_type,
       monthly_salary, work_days_per_month,
       payroll_access, payroll_pin,
       middle_initial, date_of_joining, account_expiration_date,
       date_of_birth, phone_number, gender,
       emergency_contact_name, emergency_contact_phone,
       street_address, city, state_province, postal_code, country, additional_info, position, password_last_changed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_DATE)`;

    db.query(sql, [
      employee_id.trim(), full_name.trim(), first_name || null, last_name || null, email.trim().toLowerCase(), hashedPassword, role, 
      employment_type || 'Full-time', position_level || 'Entry Level Simulationist', contract_type || 'Regular',
      monthly_salary || 0, work_days_per_month || 22,
      finalAccess, finalPin,
      middle_initial || null, date_of_joining || null, account_expiration_date || null,
      date_of_birth || null, phone_number || null, gender || 'prefer_not_to_say',
      emergency_contact_name || null, emergency_contact_phone || null,
      street_address || null, city || null, state_province || null,
      postal_code || null, country || 'Philippines', additional_info || null, position || null
    ], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ success: false, message: 'An employee with this ID or Email already exists.' });
        }
        return res.status(500).json({ success: false, message: 'Database error while creating employee.' });
      }
      logAction(req.user.id, 'CREATE_EMPLOYEE', 'user', result.insertId, req);
      res.json({ success: true, message: 'Employee successfully created!', employeeId: employee_id });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error processing password encryption.' });
  }
});

app.put('/api/employees/:id', authenticateToken, async(req, res) => {
  const employeeId = req.params.id;
  
  const isPrivileged = req.user.role === 'admin' || req.user.role === 'hr_admin';
  const isSelf = req.user.id.toString() === employeeId.toString();

  if (!isPrivileged && !isSelf) {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to edit this profile.' });
  }

  const updates = req.body;

  if (updates.email && !isValidEmail(updates.email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email format.' });
  }

  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM users WHERE id = ?", [employeeId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
    const oldData = oldRecord[0];

    // Restrict non-admins from modifying sensitive fields
    if (!isPrivileged) {
      delete updates.role;
      delete updates.status;
      delete updates.monthly_salary;
      delete updates.work_days_per_month;
      delete updates.payroll_access;
      delete updates.payroll_pin;
    }

    const fieldMapping = {
      full_name: 'full_name',
      first_name: 'first_name',
      last_name: 'last_name',
      email: 'email',
      phone: 'phone_number',
      position_level: 'position_level',
      contract_type: 'contract_type',
      status: 'status',
      role: 'role',
      date_of_joining: 'date_of_joining',
      monthly_salary: 'monthly_salary',
      work_days_per_month: 'work_days_per_month',
      payroll_access: 'payroll_access',
      payroll_pin: 'payroll_pin',
      date_of_birth: 'date_of_birth',
      gender: 'gender',
      emergency_contact_name: 'emergency_contact_name',
      emergency_contact_phone: 'emergency_contact_phone',
      street: 'street_address',
      city: 'city',
      state: 'state_province',
      postal_code: 'postal_code',
      country: 'country',
      additional_info: 'additional_info',
      middle_initial: 'middle_initial',
      account_expiry: 'account_expiration_date',
      position: 'position',
    };

    const setClauses = [];
    const values = [];
    for (const [frontField, dbField] of Object.entries(fieldMapping)) {
      if (updates[frontField] !== undefined) {
        setClauses.push(`${dbField} = ?`);
        values.push(updates[frontField]);
      }
    }

    if (setClauses.length === 0) return res.status(400).json({ success: false, message: 'No valid fields provided to update.' });

    values.push(employeeId);
    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;

    db.query(sql, values, (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Email is already in use by another account.' });
        return res.status(500).json({ success: false, message: 'Database error during update.' });
      }
      
      logAction(req.user.id, 'UPDATE_EMPLOYEE', 'user', employeeId, req, oldData, updates);
      res.json({ success: true, message: 'Employee profile updated successfully.' });
    });
  } catch (error) {
    console.error("Update Employee Error:", error);
    res.status(500).json({ success: false, message: 'Server connection failed.' });
  }
});

app.get('/api/employees/last-id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  db.query("SELECT employee_id FROM users WHERE employee_id REGEXP '^E[0-9]+$' ORDER BY id DESC LIMIT 1", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error generating ID.' });
    const lastId = results.length ? results[0].employee_id : 'E000';
    res.json({ success: true, lastId });
  });
});

app.get('/api/employees/:id', authenticateToken, (req, res) => {
  db.query("SELECT * FROM users WHERE id = ?", [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database error loading profile.' });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
    res.json(results[0]);
  });
});

app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to delete accounts.' });
  }

  const userId = req.params.id;

  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM users WHERE id = ?", [userId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: "Employee not found." });
    const oldData = oldRecord[0];

    db.query("DELETE FROM users WHERE id = ?", [userId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to delete employee due to database constraint.' });
      
      logAction(req.user.id, 'DELETE_EMPLOYEE', 'user', userId, req, oldData, null);
      res.json({ success: true, message: 'Employee account successfully deleted.' });
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server connection failed.' });
  }
});

app.put('/api/employees/:employeeId/toggle-status', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to alter account status.' });
  }

  const { employeeId } = req.params;
  db.query("SELECT status FROM users WHERE employee_id = ?", [employeeId], (err, results) => {
    if (err || results.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
    
    const newStatus = results[0].status === 'active' ? 'deactivated' : 'active';
    db.query("UPDATE users SET status = ? WHERE employee_id = ?", [newStatus, employeeId], (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to toggle status.' });
      
      logAction(req.user.id, 'TOGGLE_EMPLOYEE_STATUS', 'user', employeeId, req);
      res.json({ success: true, message: `Employee successfully ${newStatus}.`, newStatus });
    });
  });
});

app.get('/api/attendance-report', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const { date, month } = req.query;
  let dateCondition = "DATE(s.date) = DATE(?)";
  let queryParam = date;

  if (month) {
      dateCondition = "DATE_FORMAT(s.date, '%Y-%m') = ?";
      queryParam = month;
  } else if (!date) {
      return res.status(400).json({ success: false, message: "A valid date or month parameter is required." });
  }

  const sql = `
      SELECT 
          u.id AS user_db_id, u.full_name, u.employee_id, 
          COALESCE(a.status, 'Pending') AS status, 
          COALESCE(a.time_in, '--:--') AS time_in, 
          COALESCE(a.time_out, '--:--') AS time_out, 
          a.location, a.clock_in_latitude, a.clock_in_longitude,
          a.clock_out_latitude, a.clock_out_longitude,
          a.clock_in_selfie, a.clock_out_selfie,
          s.id AS schedule_id, s.start_time AS scheduled_start, s.end_time AS scheduled_end, s.course,
          DATE_FORMAT(s.date, '%Y-%m-%d') AS attendance_date, 
          COALESCE(ROUND(TIME_TO_SEC(TIMEDIFF(a.time_out, a.time_in)) / 3600, 2), 0) AS total_hours
      FROM users u
      INNER JOIN schedules s ON u.employee_id = s.user_id 
      LEFT JOIN attendance a ON s.id = a.schedule_id
      WHERE LOWER(u.role) = 'instructor' 
        AND u.status = 'active'
        AND ${dateCondition}
      ORDER BY u.full_name ASC, s.start_time ASC
  `;

  db.query(sql, [queryParam], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "Database query failed." });
      res.json(result || []);
  });
});

app.get('/api/attendance-report-user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const sql = `
    SELECT a.*, 
           DATE_FORMAT(a.date, '%Y-%m-%d') as date, 
           ROUND(TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60, 2) as total_hours,
           a.reviewed_at, a.updated_at, u.full_name, u.employee_id
    FROM attendance a
    LEFT JOIN users u ON a.user_id = u.employee_id
    WHERE a.user_id = ? 
    ORDER BY a.date DESC
  `;
  db.query(sql, [req.params.employeeId], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "Failed to load report." });
      res.json(result || []);
  });
});


// ============================================
// 8. VISITORS, SCANNERS & BLE TAGS
// ============================================

app.get('/api/appointments/:id/visitors', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM appointment_visitors WHERE appointment_id = ?", [id], (err, results) => {
    if (err) {
      console.error("Fetch appointment visitors error:", err);
      return res.status(500).json({ success: false, message: 'Failed to load companion visitors.' });
    }
    res.json(results || []);
  });
});

app.get('/api/ble-tags', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const sql = `
    SELECT 
      t.id, 
      t.ble_id, 
      t.label, 
      t.mac_address,
      VR_ACTIVE.first_name AS active_first,
      VR_ACTIVE.last_name AS active_last,
      DATE_FORMAT(DATE_ADD(VR_ACTIVE.arrived_at, INTERVAL 8 HOUR), '%Y-%m-%d %h:%i:%s %p') AS active_arrived_at,
      VR_LAST.first_name AS last_first,
      VR_LAST.last_name AS last_last,
      DATE_FORMAT(DATE_ADD(VR_LAST.returned_at, INTERVAL 8 HOUR), '%Y-%m-%d %h:%i:%s %p') AS last_returned_at,
      CASE 
        WHEN VR_ACTIVE.id IS NOT NULL THEN 'IN USE'
        ELSE 'AVAILABLE'
      END AS current_status
    FROM ble_tags t
    LEFT JOIN visitor_requests VR_ACTIVE 
      ON t.ble_id = VR_ACTIVE.ble_id AND VR_ACTIVE.arrived = 1 AND VR_ACTIVE.returned = 0 AND VR_ACTIVE.no_show = 0
    LEFT JOIN visitor_requests VR_LAST 
      ON t.ble_id = COALESCE(VR_LAST.ble_id, VR_LAST.used_ble_id) 
      AND VR_LAST.id = (
        SELECT MAX(id) FROM visitor_requests 
        WHERE ble_id = t.ble_id OR used_ble_id = t.ble_id
      )
    ORDER BY t.label
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Fetch BLE tags error:", err);
      return res.status(500).json({ success: false, message: 'Failed to fetch BLE tags inventory.' });
    }
    res.json(results || []);
  });
});

app.post('/api/ble-tags', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden. Security access required.' });
  }

  const { ble_id, label, mac_address } = req.body;
  if (!ble_id || !mac_address) {
    return res.status(400).json({ success: false, message: "BLE ID and MAC address are required." });
  }

  try {
    const [existing] = await db.promise().query(
      "SELECT id FROM ble_tags WHERE ble_id = ? OR mac_address = ?", 
      [ble_id.trim(), mac_address.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "A tag with this BLE ID or MAC address already exists." });
    }

    const [result] = await db.promise().query(
      "INSERT INTO ble_tags (ble_id, label, mac_address) VALUES (?, ?, ?)",
      [ble_id.trim(), label ? label.trim() : '', mac_address.trim()]
    );

    logAction(req.user.id, 'CREATE_BLE_TAG', 'ble_tag', result.insertId, req);
    res.status(201).json({ success: true, message: "BLE Tag added successfully.", id: result.insertId });
  } catch (err) {
    console.error("BLE Tag creation error:", err);
    res.status(500).json({ success: false, message: "Internal server error while saving tag." });
  }
});

app.delete('/api/ble-tags/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const { id } = req.params;
  db.query("DELETE FROM ble_tags WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection failed." });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Tag not found." });
    logAction(req.user.id, 'DELETE_BLE_TAG', 'ble_tag', id, req);
    res.json({ success: true, message: "BLE Tag deleted successfully." });
  });
});

app.get('/api/ble-tags/in-use', authenticateToken, (req, res) => {
  db.query(
    "SELECT DISTINCT ble_id FROM visitor_requests WHERE arrived = true AND returned = false AND no_show = false AND ble_id IS NOT NULL",
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to fetch active tags.' });
      res.json(results.map(r => r.ble_id) || []);
    }
  );
});

app.put('/api/visitor-requests/:id/return', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.query("SELECT ble_id FROM visitor_requests WHERE id = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection failed." });
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Visitor request not found." });
    
    const ble_id = rows[0].ble_id;
    if (ble_id) {
      delete visitorDestinations[ble_id];   
      delete liveVisitors[ble_id];          
      console.log(`🔓 Cleared destination lock for tag ${ble_id}`);
    }

    db.query(
      `UPDATE visitor_requests 
       SET returned = TRUE, returned_at = NOW(), 
           used_ble_id = ?, ble_id = NULL 
       WHERE id = ? AND arrived = TRUE AND returned = FALSE`,
      [ble_id, id],
      (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Database error during tag return." });
        if (result.affectedRows === 0) {
          return res.status(400).json({ success: false, message: "Visitor is not checked in or has already returned their tag." });
        }
        logAction(req.user.id, 'VISITOR_RETURN', 'visitor_request', id, req);
        res.json({ success: true, message: "BLE tag successfully returned." });
      }
    );
  });
});

app.get('/api/scanners', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  db.query("SELECT * FROM scanners ORDER BY scanner_id ASC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load scanners.' });
    res.json(results || []);
  });
});

// ============================================
// 8. VISITORS, SCANNERS & BLE TAGS (Secured & Validated)
// ============================================

app.post('/api/appointments/book', (req, res) => {
  const { firstName, lastName, email, phone, date, time, reason, primaryBleId, additionalVisitors } = req.body;
  const { date: today } = getPHTime();
  
  // Strict Validation
  if (!firstName || !lastName || !email || !date || !time || !reason) {
    return res.status(400).json({ success: false, message: "All required visitor fields must be filled out." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: "Please provide a valid email address." });
  }
  if (date < today) {
    return res.status(400).json({ success: false, message: "Cannot book appointments for past dates." });
  }

  const appointmentStatus = 'PENDING';
  const sql = `INSERT INTO visitor_requests 
    (first_name, last_name, email, phone, visit_date, visit_time, reason, ble_id, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(sql, [firstName.trim(), lastName.trim(), email.trim(), phone || null, date, time, reason, primaryBleId || null, appointmentStatus], (err, result) => {
    if (err) {
      console.error("DB insert error:", err);
      return res.status(500).json({ success: false, message: "Database connection failed while booking." });
    }

    const appointmentId = result.insertId;

    if (additionalVisitors && additionalVisitors.length > 0) {
      const visSql = "INSERT INTO appointment_visitors (appointment_id, visitor_name, ble_id) VALUES ?";
      const values = additionalVisitors.map(v => [appointmentId, v.name, v.bleId || null]);
      db.query(visSql, [values], (err2) => {
        if (err2) console.error("Error inserting additional visitors:", err2);
      });
    }

    const subject = 'Visit Request Received - HCT Academy';
    const primaryTagText = primaryBleId ? `Your BLE Tag: ${primaryBleId}\n` : '';
    const phoneText = phone ? `Phone: ${phone}\n` : '';
    let visitorDetails = '';

    if (additionalVisitors && additionalVisitors.length > 0) {
      visitorDetails = '\nAdditional Visitors:\n';
      additionalVisitors.forEach((v, i) => {
        visitorDetails += `  ${i+1}. ${v.name} – BLE Tag: ${v.bleId || 'None assigned'}\n`;
      });
      visitorDetails += '\nPlease share the BLE tags with your companions. They will be given to you upon arrival by our security guard.\n';
    }

    const emailBody = `Dear ${firstName} ${lastName},\n\n` +
      `Your visit request has been received. We will review it and notify you once approved.\n\n` +
      `Details:\n` +
      `Date: ${date}\n` +
      `Time: ${time}\n` +
      `${phoneText}` +
      `${primaryTagText}` +
      `Reason: ${reason}\n` +
      `${visitorDetails}\n` +
      `Thank you,\nHCT Academy`;

    res.json({ success: true, message: "Appointment request submitted successfully. Check your email for details." });

    resend.emails.send({
      from: 'UniVITA Academy <no-reply@univitahct.tech>',
      to: [email],
      subject: subject,
      text: emailBody
    }).catch((error) => {
      console.error("Background Email error:", error);
    });
  });
});

app.put('/api/appointments/:id/status', authenticateToken, (req, res) => {
  const { status, adminNotes, adminId } = req.body;
  const requestId = req.params.id;

  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid appointment status." });
  }

  db.query("SELECT * FROM visitor_requests WHERE id = ?", [requestId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection failed." });
    if (results.length === 0) return res.status(404).json({ success: false, message: "Appointment request not found." });

    const request = results[0];
    const { first_name, last_name, email, visit_date, visit_time, reason, phone } = request;

    if (status === 'APPROVED') {
      db.query(
        `SELECT id FROM visitor_requests 
         WHERE email = ? AND visit_date = ? AND visit_time = ? AND status = 'APPROVED' AND id != ?`,
        [email, visit_date, visit_time, requestId],
        (dupErr, existing) => {
          if (dupErr) return res.status(500).json({ success: false, message: "Database connection failed." });
          if (existing.length > 0) {
            return res.status(409).json({ 
              success: false, 
              message: "Conflict: This visitor already has an approved appointment at this exact date and time." 
            });
          }
          proceedToUpdate();
        }
      );
    } else {
      proceedToUpdate();
    }

    function proceedToUpdate() {
      db.query(
        "UPDATE visitor_requests SET status = ?, admin_notes = ?, processed_by = ?, processed_at = NOW() WHERE id = ?", 
        [status, adminNotes || null, adminId, requestId], 
        (updateErr) => {
          if (updateErr) return res.status(500).json({ success: false, message: "Failed to update appointment status." });
          
          const action = status === 'APPROVED' ? 'APPROVE_APPOINTMENT' : 'REJECT_APPOINTMENT';
          logAction(adminId, action, 'visitor_request', requestId, req);
          
          db.query("SELECT * FROM appointment_visitors WHERE appointment_id = ?", [requestId], (visErr, visitors) => {
            if (visErr) visitors = [];
            const isApproved = status === 'APPROVED';
            const subject = isApproved ? "Visit Request Approved - HCT Academy" : "Visit Request Status Update - HCT Academy";
            
            let emailBody = `Dear ${first_name} ${last_name},\n\n`;
            if (isApproved) {
              emailBody += "Your visit request has been APPROVED.\n\nWe look forward to welcoming you to HCT Academy.\n\n";
            } else { 
              emailBody += "We regret to inform you that your visit request has been DECLINED.\n\n"; 
              if (adminNotes) emailBody += `Reason: ${adminNotes}\n\n`; 
            }
            
            emailBody += `Details:\nDate: ${visit_date}\nTime: ${visit_time}\nReason: ${reason}\n`;
            if (phone) emailBody += `Phone: ${phone}\n`;
            
            if (visitors && visitors.length > 0) {
              emailBody += "\nAdditional Visitors:\n";
              visitors.forEach((v, i) => { 
                emailBody += `  ${i+1}. ${v.visitor_name}\n`; 
              });
            }
            
            emailBody += "\nBLE tags for tracking will be assigned to you and your companions upon arrival by our security guard.\n";
            emailBody += "\nThank you for your understanding.\n\nBest regards,\nHCT Academy";
            
            const mailOptions = { from: process.env.MAIL_USER, to: email, subject: subject, text: emailBody };
            transporter.sendMail(mailOptions, (error) => {
              if (error) { 
                console.error("Email error:", error); 
                return res.json({ success: true, message: `Status updated to ${status}, but notification email failed to send.` }); 
              }
              res.json({ success: true, message: `Appointment ${status} successfully. Email sent.` });
            });
          });
        }
      );
    }
  });
});

app.put('/api/appointments/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { id } = req.params;
  const { visit_date, visit_time, admin_notes } = req.body;
  if (!visit_date || !visit_time) {
    return res.status(400).json({ success: false, message: 'Date and time are required to reschedule.' });
  }

  db.query("SELECT * FROM visitor_requests WHERE id = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection failed." });
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Appointment not found.' });
    
    const request = rows[0];
    const sql = `UPDATE visitor_requests SET visit_date = ?, visit_time = ?, admin_notes = ? WHERE id = ?`;
    
    db.query(sql, [visit_date, visit_time, admin_notes || null, id], (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "Failed to update appointment schedule." });
      
      logAction(req.user.id, 'RESCHEDULE_APPOINTMENT', 'visitor_request', id, req);

      const emailBody = `Dear ${request.first_name} ${request.last_name},\n\n` +
        `Your campus visit appointment schedule has been updated by administration.\n\n` +
        `New Schedule Details:\n` +
        `Date: ${visit_date}\n` +
        `Time: ${visit_time}\n` +
        (admin_notes ? `Reason / Remarks for Rescheduling: ${admin_notes}\n\n` : '\n') +
        `We look forward to welcoming you to HCT Academy.\n\nBest regards,\nHCT Academy`;

      const mailOptions = {
        from: process.env.MAIL_USER,
        to: request.email,
        subject: 'Appointment Schedule Updated - HCT Academy',
        text: emailBody
      };

      transporter.sendMail(mailOptions, (error) => {
        if (error) console.error("Reschedule email error:", error);
      });

      res.json({ success: true, message: 'Appointment successfully rescheduled.' });
    });
  });
});

app.get('/api/appointments/pending', authenticateToken, (req, res) => {
  db.query("SELECT * FROM visitor_requests WHERE status = 'PENDING'", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch pending requests." });
    res.json(results || []);
  });
});

app.get('/api/appointments/history', authenticateToken, (req, res) => {
  db.query("SELECT * FROM visitor_requests WHERE status != 'PENDING' ORDER BY visit_date DESC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch history." });
    res.json(results || []);
  });
});

app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const [leaves, visitors, employees] = await Promise.all([
      db.promise().query("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'Pending'"),
      db.promise().query("SELECT COUNT(*) as count FROM attendance WHERE date = CURDATE()"),
      db.promise().query("SELECT COUNT(*) as count FROM events WHERE date = CURDATE()")
    ]);
    res.json({ pendingLeaves: leaves[0][0].count, presentToday: visitors[0][0].count, eventsToday: employees[0][0].count });
  } catch (err) { res.status(500).send(err); }
});


// ============================================
// 9. LIVE TRACKING & SYSTEM MAINTENANCE SWEEPS
// ============================================

let liveVisitors = {}; 
let lastKnownVisitorsData = {};

// SYSTEM MAINTENANCE: AUTO-MARK MISSED SHIFTS
const runMissedShiftSweep = async () => {
  try {
    const { date: todayDate, time: currentTime } = getPHTime();
    const currentDateTime = `${todayDate} ${currentTime}`;
    
    // FIXED: Added INNER JOIN users u ON s.user_id = u.employee_id to filter out orphaned schedules
    const sql = `
      INSERT INTO attendance (user_id, schedule_id, date, status, location)
      SELECT s.user_id, s.id, s.date, 'did not attend', 'Missed Schedule'
      FROM schedules s
      INNER JOIN users u ON s.user_id = u.employee_id
      LEFT JOIN attendance a ON s.id = a.schedule_id
      WHERE s.date <= ? 
        AND CONCAT(s.date, ' ', s.end_time) < ?
        AND a.id IS NULL
    `;
    
    const [result] = await db.promise().query(sql, [todayDate, currentDateTime]);
    if (result.affectedRows > 0) {
      console.log(`Auto-Sweep: Marked ${result.affectedRows} missed shifts as 'did not attend'.`);
    }
  } catch (err) {
    console.error("Missed Shift Sweep Error:", err);
  } finally {
    // Recursively call to prevent interval stacking
    setTimeout(runMissedShiftSweep, 1000 * 60 * 30);
  }
};
setTimeout(runMissedShiftSweep, 1000 * 60 * 30);


// SYSTEM MAINTENANCE: AUTO-FLAG MISSED CLOCK-OUTS
setInterval(async () => {
  try {
    const { date: todayDate, time: currentTime } = getPHTime();
    const currentDateTime = `${todayDate} ${currentTime}`;
    
    const sql = `
      SELECT a.id, a.user_id, s.end_time 
      FROM attendance a
      JOIN schedules s ON a.schedule_id = s.id
      WHERE a.time_out IS NULL 
        AND a.date <= ? 
        AND CONCAT(a.date, ' ', s.end_time) < ?
        AND TIMESTAMPDIFF(HOUR, STR_TO_DATE(CONCAT(a.date, ' ', s.end_time), '%Y-%m-%d %H:%i:%s'), STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')) >= 3
    `;
    
    const [forgottenRecords] = await db.promise().query(sql, [todayDate, currentDateTime, currentDateTime]);
    
    for (const record of forgottenRecords) {
      await db.promise().query(
        "UPDATE attendance SET status = 'missed clock out' WHERE id = ?",
        [record.id]
      );
      await db.promise().query(
        "UPDATE users SET location_tracking_enabled = 0 WHERE employee_id = ?",
        [record.user_id]
      );
      console.log(`⚠️ Auto-Sweep: Flagged missed clock-out for user ${record.user_id}`);
    }
  } catch (err) {
    console.error("Auto-Sweep Error:", err);
  }
}, 1000 * 60 * 60);

setInterval(async () => {
  const now = Date.now();
  const currentVisitorIds = Object.keys(liveVisitors);

  for (const bleId in lastKnownVisitorsData) {
    if (!currentVisitorIds.includes(bleId)) {
      console.log(`⚠️ Visitor ${bleId} disconnected.`);
      const visitor = lastKnownVisitorsData[bleId];
      
      logVisitorHistory(bleId, visitor.name, bleId, visitor.floor, visitor.currentRoom, 'disconnect', null, null);
      delete lastKnownVisitorsData[bleId];
    }
  }

  let validBleIds = new Set();
  try {
    const [activeRows] = await db.promise().query(`
      SELECT ble_id FROM visitor_requests 
      WHERE arrived = 1 AND returned = 0 AND ble_id IS NOT NULL
    `);
    validBleIds = new Set(activeRows.map(row => String(row.ble_id).trim()));
  } catch (err) {
    console.error("Failed to fetch valid BLE IDs", err);
  }

  for (const bleId in liveVisitors) {
    const visitor = liveVisitors[bleId];

    if (!lastKnownVisitorsData[bleId]) {
      console.log(`✅ Visitor ${bleId} connected.`);
      logVisitorHistory(bleId, visitor.name, bleId, visitor.floor, visitor.currentRoom, 'connect', null, null);
    }
    
    lastKnownVisitorsData[bleId] = { ...visitor };

    if (!validBleIds.has(String(bleId).trim()) || (now - visitor.lastSeen > 15000)) {
      console.log(`🧹 Purging: ${bleId}`);
      delete liveVisitors[bleId];
    }
  }
}, 5000);

app.put('/api/user/tracking-enabled', authenticateToken, async (req, res) => {
  if (req.user.role !== 'instructor') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { enabled } = req.body;
  const employeeId = req.user.employee_id;
  await db.promise().query(
    "UPDATE users SET location_tracking_enabled = ? WHERE employee_id = ?",
    [enabled ? 1 : 0, employeeId]
  );
  res.json({ success: true });
});

app.post('/api/ble-data', async (req, res) => {
  const hardwareApiKey = req.headers['x-api-key'];
  if (!hardwareApiKey || hardwareApiKey !== process.env.HARDWARE_API_KEY) {
    console.warn("Unauthorized hardware access attempt blocked.");
    return res.status(401).json({ success: false, message: "Unauthorized hardware access." });
  }

  const { scannerId, beaconId } = req.body;
  if (!scannerId || !beaconId) {
    return res.status(400).json({ success: false, message: "Missing scannerId or beaconId." });
  }

  try {
    const [scannerRows] = await db.promise().query(
      "SELECT assigned_room, assigned_floor FROM scanners WHERE scanner_id = ?",
      [scannerId]
    );

    if (scannerRows.length === 0) {
      return res.status(404).json({ success: false, message: `Scanner ID '${scannerId}' is not registered.` });
    }

    const room = scannerRows[0].assigned_room;
    const floor = scannerRows[0].assigned_floor;

    const sql = `
      SELECT vr.id, vr.first_name, vr.last_name, bt.ble_id, vr.destination
      FROM visitor_requests vr
      JOIN ble_tags bt ON vr.ble_id = bt.ble_id
      WHERE bt.mac_address = ? 
      AND vr.arrived = 1 
      AND vr.no_show = 0 
      AND vr.returned = 0
      LIMIT 1
    `;

    db.query(sql, [beaconId], async (err, results) => {
      if (err) {
        console.error("BLE Data DB Error:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      
      if (results.length === 0) {
        try {
          const [tagRes] = await db.promise().query("SELECT ble_id FROM ble_tags WHERE mac_address = ?", [beaconId]);
          if (tagRes && tagRes.length > 0) {
            const ghostId = tagRes[0].ble_id;
            if (liveVisitors[ghostId]) {
              delete liveVisitors[ghostId];
            }
          }
        } catch (dbErr) {
          console.error("Ghost cleanup DB error:", dbErr);
        }
        return res.json({ success: false, message: "Visitor not found or already returned" });
      }

      const row = results[0];
      const bleId = row.ble_id;
      const visitorName = `${row.first_name} ${row.last_name || ''}`.trim();
      const destination = row.destination || 'Not Assigned';

      liveVisitors[bleId] = {
        id: bleId,
        name: visitorName,
        bleId: bleId,
        floor: floor,
        currentRoom: room,
        destination: destination,
        lastSeen: Date.now()
      };

      visitorDestinations[bleId] = destination;
      res.json({ success: true });
    });

  } catch (dbErr) {
    console.error("Dynamic Scanner Lookup Error:", dbErr);
    return res.status(500).json({ success: false, message: "Server error during scanner lookup" });
  }
});

app.post('/api/scan', async (req, res) => {
  const hardwareApiKey = req.headers['x-api-key'];
  if (process.env.HARDWARE_API_KEY && hardwareApiKey !== process.env.HARDWARE_API_KEY) {
    console.warn("Unauthorized scanner access attempt blocked.");
    return res.status(401).json({ success: false, message: "Unauthorized hardware access." });
  }

  const { scannerId, tagMac, rssi } = req.body;
  if (!scannerId || !tagMac) {
    return res.status(400).json({ success: false, message: "Missing scannerId or tagMac." });
  }

  const sql = `
    SELECT vr.id, vr.first_name, vr.last_name, bt.ble_id, vr.destination
    FROM visitor_requests vr
    JOIN ble_tags bt ON vr.ble_id = bt.ble_id
    WHERE LOWER(bt.mac_address) = LOWER(?) 
    AND vr.arrived = 1 
    AND vr.no_show = 0 
    AND vr.returned = 0
    LIMIT 1
  `;

  db.query(sql, [tagMac.trim()], async (err, results) => {
    if (err) {
      console.error("Scanner DB Error:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    
    if (results.length === 0) {
      return res.json({ success: false, message: "Visitor not found or tag not active" });
    }

    const row = results[0];
    const bleId = row.ble_id;
    const visitorName = `${row.first_name} ${row.last_name || ''}`.trim();
    const destination = row.destination || 'Classroom'; // Safe fallback room

    let detectedFloor = "3";
    let detectedRoom = destination;

    try {
      const [scannerRows] = await db.promise().query(
        "SELECT assigned_floor, assigned_room FROM scanners WHERE scanner_id = ?",
        [scannerId]
      );
      if (scannerRows.length > 0) {
        if (scannerRows[0].assigned_floor) detectedFloor = String(scannerRows[0].assigned_floor);
        if (scannerRows[0].assigned_room) detectedRoom = scannerRows[0].assigned_room;
      }
    } catch (e) {
      console.error("Scanner floor lookup error:", e);
    }

    liveVisitors[bleId] = {
      id: bleId,
      name: visitorName,
      bleId: bleId,
      floor: detectedFloor,
      currentRoom: detectedRoom,
      destination: destination,
      lastSeen: Date.now(),
      rssi: rssi || -50
    };

    res.status(200).json({ success: true, message: "Visitor tracked successfully" });
  });
});

// ============================================
// LIVE POSITIONS & VISIT REASONS (Secured & Validated)
// ============================================

app.get('/api/positions', (req, res) => {
  res.json(Object.values(liveVisitors) || []);
});

app.get('/api/visit-reasons', (req, res) => {
  db.query("SELECT * FROM visit_reasons ORDER BY reason_text", (err, results) => {
    if (err) {
      console.error("Fetch visit reasons error:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch visit reasons." });
    }
    res.json(results || []);
  });
});

app.post('/api/visit-reasons', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  
  const { reason_text } = req.body;
  if (!reason_text || !reason_text.trim()) {
    return res.status(400).json({ success: false, message: "Reason text is required." });
  }
  
  db.query("INSERT INTO visit_reasons (reason_text) VALUES (?)", [reason_text.trim()], (err, result) => {
    if (err) {
      console.error("Create visit reason error:", err);
      return res.status(500).json({ success: false, message: "Failed to create visit reason." });
    }
    
    logAction(req.user.id, 'CREATE_VISIT_REASON', 'visit_reason', result.insertId, req);
    res.status(201).json({ success: true, message: "Visit reason created successfully.", id: result.insertId });
  });
});

app.put('/api/visit-reasons/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  
  const { id } = req.params;
  const { reason_text } = req.body;
  
  if (!reason_text || !reason_text.trim()) {
    return res.status(400).json({ success: false, message: "Reason text is required." });
  }
  
  db.query("UPDATE visit_reasons SET reason_text = ? WHERE id = ?", [reason_text.trim(), id], (err, result) => {
    if (err) {
      console.error("Update visit reason error:", err);
      return res.status(500).json({ success: false, message: "Failed to update visit reason." });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Visit reason not found.' });
    }
    
    logAction(req.user.id, 'UPDATE_VISIT_REASON', 'visit_reason', id, req);
    res.json({ success: true, message: "Visit reason updated successfully." });
  });
});

app.delete('/api/visit-reasons/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  
  const { id } = req.params;
  
  db.query("DELETE FROM visit_reasons WHERE id = ?", [id], (err, result) => {
    if (err) {
      console.error("Delete visit reason error:", err);
      return res.status(500).json({ success: false, message: "Failed to delete visit reason due to dependencies." });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Visit reason not found.' });
    }
    
    logAction(req.user.id, 'DELETE_VISIT_REASON', 'visit_reason', id, req);
    res.json({ success: true, message: "Visit reason deleted successfully." });
  });
});


// ============================================
// 10. EMERGENCY ALERTS, JOBS & POLICIES (Secured & Validated)
// ============================================

app.post('/api/emergency-alerts', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  
  const { title, message, severity, target_roles } = req.body;
  
  // 1. Strict Input Validation
  if (!title || !message || !severity) {
    return res.status(400).json({ success: false, message: 'Alert title, message, and severity level are required.' });
  }
  if (!['info', 'warning', 'critical'].includes(severity)) {
    return res.status(400).json({ success: false, message: 'Invalid severity level. Must be info, warning, or critical.' });
  }

  const rawRoles = target_roles || ['instructor', 'admin', 'security', 'hr_admin'];

  const safeRoles = rawRoles.map(role => {
    const r = role.toLowerCase().trim();
    if (r.includes('security')) return 'security';
    if (r.includes('admin') && !r.includes('hr')) return 'admin';
    if (r.includes('hr')) return 'hr_admin';
    return 'instructor';
  });

  const uniqueRoles = [...new Set(safeRoles)];
  const targetRolesJson = JSON.stringify(uniqueRoles);
  
  try {
    const [result] = await db.promise().query(
      "INSERT INTO emergency_alerts (title, message, severity, target_roles) VALUES (?, ?, ?, ?)", 
      [title.trim(), message.trim(), severity, targetRolesJson]
    );
    const alertId = result.insertId;

    const rolePlaceholders = uniqueRoles.map(() => '?').join(',');
    const [users] = await db.promise().query(
      `SELECT id, role, expo_push_token FROM users WHERE role IN (${rolePlaceholders}) AND status = 'active'`, 
      uniqueRoles
    );

    if (users.length > 0) {
      const receipts = users.map(u => [alertId, u.id]);
      await db.promise().query('INSERT INTO alert_receipts (alert_id, user_id) VALUES ?', [receipts]);

      let messages = [];
      for (let user of users) {
        if (user.expo_push_token && Expo.isExpoPushToken(user.expo_push_token)) {
          messages.push({
            to: user.expo_push_token,
            sound: 'default',
            title: title.trim(),
            body: message.trim(),
            data: { alertId: alertId, severity: severity },
          });
        }
      }

      let chunks = expo.chunkPushNotifications(messages);
      for (let chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (error) {
          console.error("Error sending push chunk:", error);
        }
      }
    }

    logAction(req.user.id, 'CREATE_ALERT', 'emergency_alert', alertId, req);
    res.json({ success: true, message: 'Emergency alert successfully broadcasted.', alertId });

  } catch (err) {
    console.error("Alert creation error:", err);
    res.status(500).json({ success: false, message: 'Server connection failed while broadcasting alert.' });
  }
});

app.put('/api/users/save-push-token', authenticateToken, async (req, res) => {
  const { token } = req.body;
  const userId = req.user.id;
  
  if (!token || !token.trim()) {
    return res.status(400).json({ success: false, message: 'Push token is required.' });
  }

  try {
    await db.promise().query("UPDATE users SET expo_push_token = ? WHERE id = ?", [token.trim(), userId]);
    res.json({ success: true, message: 'Push token saved successfully.' });
  } catch (err) {
    console.error("Failed to save push token:", err);
    res.status(500).json({ success: false, message: 'Database error while saving push token.' });
  }
});

// ============================================
// COURSE MANAGEMENT
// ============================================

app.get('/api/courses', (req, res) => {
  db.query("SELECT id, name FROM courses ORDER BY name ASC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load courses.' });
    res.json(results || []);
  });
});

app.post('/api/courses', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Course name is required.' });
  }
  
  db.query("INSERT INTO courses (name) VALUES (?)", [name.trim()], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, message: 'A course with this name already exists.' });
      }
      console.error("Create course error:", err);
      return res.status(500).json({ success: false, message: 'Failed to create course.' });
    }
    
    logAction(req.user.id, 'CREATE_COURSE', 'course', result.insertId, req);
    res.status(201).json({ success: true, message: 'Course created successfully.', id: result.insertId });
  });
});

app.put('/api/courses/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  
  const { name } = req.body;
  const courseId = req.params.id;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Course name is required.' });
  }
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (oldRecord.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }
    
    db.query("UPDATE courses SET name = ? WHERE id = ?", [name.trim(), courseId], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ success: false, message: 'Another course with this name already exists.' });
        }
        console.error("Update course error:", err);
        return res.status(500).json({ success: false, message: 'Failed to update course.' });
      }
      
      logAction(req.user.id, 'UPDATE_COURSE', 'course', courseId, req, oldRecord[0], { name: name.trim() });
      res.json({ success: true, message: 'Course updated successfully.' });
    });
  } catch (err) {
    console.error("Update course server error:", err);
    res.status(500).json({ success: false, message: 'Server error while updating course.' });
  }
});

app.delete('/api/courses/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  
  const courseId = req.params.id;
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (oldRecord.length === 0) {
      return res.status(404).json({ success: false, message: 'Course not found.' });
    }
    
    db.query("SELECT id FROM schedules WHERE course = ? LIMIT 1", [oldRecord[0].name], (err, rows) => {
      if (err) {
        console.error("Check course schedule dependency error:", err);
        return res.status(500).json({ success: false, message: 'Database error checking dependencies.' });
      }
      if (rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete course as it is assigned to existing schedules.' });
      }
      
      db.query("DELETE FROM courses WHERE id = ?", [courseId], (err, result) => {
        if (err) {
          console.error("Delete course error:", err);
          return res.status(500).json({ success: false, message: 'Failed to delete course.' });
        }
        
        logAction(req.user.id, 'DELETE_COURSE', 'course', courseId, req, oldRecord[0], null);
        res.json({ success: true, message: 'Course deleted successfully.' });
      });
    });
  } catch (err) {
    console.error("Delete course server error:", err);
    res.status(500).json({ success: false, message: 'Server error while deleting course.' });
  }
});

app.get('/api/emergency-alerts/active', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

  try {
    const [userRows] = await db.promise().query("SELECT role FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const userRole = userRows[0].role.toLowerCase().trim();

    const [activeAlerts] = await db.promise().query(`
      SELECT id, title, message, severity, sent_at, target_roles, is_active, expires_at 
      FROM emergency_alerts 
      WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY sent_at DESC
    `);

    const validAlerts = [];

    for (const alert of activeAlerts) {
      let targetRoles = [];
      try {
        targetRoles = JSON.parse(alert.target_roles || '[]');
      } catch (e) {
        targetRoles = ['instructor', 'admin', 'security', 'hr_admin'];
      }

      const isTargeted = targetRoles.map(r => r.toLowerCase().trim()).includes(userRole) || targetRoles.length === 0;

      if (isTargeted) {
        await db.promise().query(
          `INSERT IGNORE INTO alert_receipts (alert_id, user_id) VALUES (?, ?)`,
          [alert.id, userId]
        );

        const [receiptRows] = await db.promise().query(
          `SELECT read_at FROM alert_receipts WHERE alert_id = ? AND user_id = ?`,
          [alert.id, userId]
        );

        const readAt = receiptRows.length > 0 ? receiptRows[0].read_at : null;

        // Include all targeted alerts (both read and unread) for history view
        validAlerts.push({
          id: alert.id,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          sent_at: alert.sent_at,
          read_at: readAt
        });
      }
    }

    res.json(validAlerts);
  } catch (err) {
    console.error("Fetch alerts error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/emergency-alerts/:id/read', (req, res) => {
  const alertId = req.params.id;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  
  db.query(
    "UPDATE alert_receipts SET read_at = NOW() WHERE alert_id = ? AND user_id = ?", 
    [alertId, userId], 
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      
      // If no receipt row existed for this user/alert yet, insert one marked as read
      if (result.affectedRows === 0) {
        db.query(
          "INSERT INTO alert_receipts (alert_id, user_id, read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE read_at = NOW()",
          [alertId, userId],
          (insertErr) => {
            if (insertErr) console.error("Failed to insert alert receipt:", insertErr);
          }
        );
      }
      res.json({ success: true });
    }
  );
});
app.get('/api/emergency-alerts', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT * FROM emergency_alerts ORDER BY sent_at DESC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ============================================
// JOBS & APPLICANTS (Secured & Validated)
// ============================================

app.get('/api/public/jobs', (req, res) => {
  db.query(
    `SELECT id, title, department, description, requirements, employment_type, 
            location_type, location, salary_min, salary_max, created_at 
     FROM job_postings 
     WHERE status = 'open' 
     ORDER BY created_at DESC`, 
    (err, jobs) => {
      if (err) {
        console.error("Fetch public jobs error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load public job postings.' });
      }
      res.json(jobs || []);
    }
  );
});

app.post('/api/jobs/apply', uploadResume.single('resume'), (req, res) => {
  const { job_id, full_name, email, phone, cover_letter } = req.body;
  
  if (!job_id || !full_name || !email) {
    return res.status(400).json({ success: false, message: 'Job ID, full name, and email are required fields.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
  }

  const resumePath = req.file ? `/uploads/resumes/${req.file.filename}` : null;
  
  db.query(
    "INSERT INTO job_applicants (job_id, full_name, email, phone, cover_letter, resume_path) VALUES (?, ?, ?, ?, ?, ?)", 
    [job_id, full_name.trim(), email.trim().toLowerCase(), phone || null, cover_letter || null, resumePath], 
    (err) => {
      if (err) {
        console.error("Job application error:", err);
        return res.status(500).json({ success: false, message: 'Failed to submit job application.' });
      }
      res.json({ success: true, message: 'Application submitted successfully!' });
    }
  );
});

app.get('/api/jobs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  db.query(
    `SELECT jp.id, jp.title, jp.department, jp.description, jp.requirements, jp.employment_type,
            jp.location_type, jp.location, jp.salary_min, jp.salary_max, jp.status, jp.posted_by, jp.created_at,
            (SELECT COUNT(*) FROM job_applicants ja WHERE ja.job_id = jp.id AND ja.status = 'new') AS applicant_count
     FROM job_postings jp 
     ORDER BY jp.created_at DESC`,
    (err, results) => {
      if (err) {
        console.error("Fetch admin jobs error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load jobs.' });
      }
      res.json(results || []);
    }
  );
});

app.post('/api/jobs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  const { 
    title, department, description, requirements, employment_type,
    location_type, location, salary_min, salary_max, status
  } = req.body;

  if (!title || !title.trim() || !description || !description.trim()) {
    return res.status(400).json({ success: false, message: 'Job title and description are required.' });
  }
  if (salary_min && (isNaN(salary_min) || salary_min < 0)) {
    return res.status(400).json({ success: false, message: 'Minimum salary must be a valid positive number.' });
  }
  if (salary_max && (isNaN(salary_max) || salary_max < 0)) {
    return res.status(400).json({ success: false, message: 'Maximum salary must be a valid positive number.' });
  }

  db.query(
    `INSERT INTO job_postings 
      (title, department, description, requirements, employment_type,
       location_type, location, salary_min, salary_max, status, posted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title.trim(), department || null, description.trim(), requirements || null, employment_type || 'Full-time',
      location_type || 'On-site', location || null, salary_min || null, salary_max || null,
      status || 'open', req.user.id
    ],
    (err, result) => {
      if (err) {
        console.error("Create job error:", err);
        return res.status(500).json({ success: false, message: 'Failed to create job posting.' });
      }
      logAction(req.user.id, 'CREATE_JOB', 'job_posting', result.insertId, req);
      res.status(201).json({ success: true, message: 'Job posted successfully.', id: result.insertId });
    }
  );
});

app.put('/api/jobs/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  const { 
    title, department, description, requirements, employment_type,
    location_type, location, salary_min, salary_max, status
  } = req.body;
  const jobId = req.params.id;

  if (!title || !title.trim() || !description || !description.trim()) {
    return res.status(400).json({ success: false, message: 'Job title and description are required.' });
  }

  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM job_postings WHERE id = ?", [jobId]);
    if (oldRecord.length === 0) {
      return res.status(404).json({ success: false, message: 'Job posting not found.' });
    }
    const oldData = oldRecord[0];
    const newData = req.body;

    db.query(
      `UPDATE job_postings SET
        title = ?, department = ?, description = ?, requirements = ?,
        employment_type = ?, location_type = ?, location = ?,
        salary_min = ?, salary_max = ?, status = ?
       WHERE id = ?`,
      [
        title.trim(), department || null, description.trim(), requirements || null,
        employment_type || 'Full-time', location_type || 'On-site', location || null,
        salary_min || null, salary_max || null, status || 'open', jobId
      ],
      (err, result) => {
        if (err) {
          console.error("Update job error:", err);
          return res.status(500).json({ success: false, message: 'Failed to update job posting.' });
        }
        if (result.affectedRows === 0) {
          return res.status(404).json({ success: false, message: 'Job posting not found.' });
        }
        
        logAction(req.user.id, 'UPDATE_JOB', 'job_posting', jobId, req, oldData, newData);
        res.json({ success: true, message: 'Job posting updated successfully.' });
      }
    );
  } catch (err) {
    console.error("Update job server error:", err);
    res.status(500).json({ success: false, message: 'Server error while updating job.' });
  }
});

app.delete('/api/jobs/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const jobId = req.params.id;
  db.query("DELETE FROM job_applicants WHERE job_id = ?", [jobId], (err) => {
    if (err) {
      console.error("Delete job applicants error:", err);
      return res.status(500).json({ success: false, message: 'Failed to delete job applicants.' });
    }
    db.query("DELETE FROM job_postings WHERE id = ?", [jobId], (err, result) => {
      if (err) {
        console.error("Delete job error:", err);
        return res.status(500).json({ success: false, message: 'Failed to delete job posting.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Job posting not found.' });
      }
      logAction(req.user.id, 'DELETE_JOB', 'job_posting', jobId, req);
      res.json({ success: true, message: 'Job posting deleted successfully.' });
    });
  });
});

app.get('/api/jobs/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  db.query(
    `SELECT id, title, department, description, requirements, employment_type,
            location_type, location, salary_min, salary_max, status, posted_by, created_at
     FROM job_postings WHERE id = ?`,
    [req.params.id],
    (err, results) => {
      if (err) {
        console.error("Fetch single job error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load job posting.' });
      }
      if (results.length === 0) {
        return res.status(404).json({ success: false, message: 'Job posting not found.' });
      }
      res.json(results[0]);
    }
  );
});

app.get('/api/jobs/:id/applicants', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const jobId = req.params.id;
  db.query(
    `SELECT id, job_id, full_name, email, phone, cover_letter, resume_path, status, applied_at, score
     FROM job_applicants
     WHERE job_id = ?
     ORDER BY applied_at DESC`,
    [jobId],
    (err, results) => {
      if (err) {
        console.error("Applicants fetch error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load job applicants.' });
      }
      res.json(results || []);
    }
  );
});

app.put('/api/applicants/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { status } = req.body;
  if (!['new', 'reviewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid applicant status provided.' });
  }
  db.query(
    "UPDATE job_applicants SET status = ? WHERE id = ?",
    [status, req.params.id],
    (err, result) => {
      if (err) {
        console.error("Update applicant status error:", err);
        return res.status(500).json({ success: false, message: 'Failed to update applicant status.' });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'Job applicant not found.' });
      }
      logAction(req.user.id, 'UPDATE_APPLICANT_STATUS', 'job_applicant', req.params.id, req);
      res.json({ success: true, message: 'Applicant status successfully updated.' });
    }
  );
});




// ============================================
// 11. CHAT & WEBSOCKETS
// ============================================

app.get('/api/chat/rooms', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = `
    SELECT r.id, r.name, r.type, 
      CASE 
        WHEN r.type = 'direct' THEN (
          SELECT u.full_name FROM users u 
          WHERE u.id = IF(
            CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(r.name, '_', 2), '_', -1) AS UNSIGNED) = ?, 
            CAST(SUBSTRING_INDEX(r.name, '_', -1) AS UNSIGNED), 
            CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(r.name, '_', 2), '_', -1) AS UNSIGNED)
          )
        )
      END as display_name 
    FROM chat_rooms r 
    WHERE (r.type = 'direct' AND (r.name LIKE CONCAT('dm_%\_', ?) OR r.name LIKE CONCAT('dm\_', ?, '\_%'))) 
       OR (r.type = 'group' AND EXISTS (SELECT 1 FROM chat_room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?)) 
    ORDER BY r.created_at DESC
  `;

  db.query(sql, [userId, userId, userId, userId], (err, rooms) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rooms);
  });
});

app.get('/api/chat/history/:roomId', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  db.query("SELECT cm.*, u.full_name, u.employee_id FROM chat_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.room_id = ? ORDER BY cm.sent_at DESC LIMIT ?", [roomId, limit], (err, messages) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(messages.reverse());
  });
});

app.post('/api/chat/dm-room', authenticateToken, (req, res) => {
  const partnerId = req.body.partnerUserId;
  const userId = req.user.id;
  const ids = [userId, partnerId].sort((a,b)=>a-b);
  const roomName = `dm_${ids[0]}_${ids[1]}`;
  db.query("INSERT INTO chat_rooms (name, type) VALUES (?, 'direct') ON DUPLICATE KEY UPDATE name=name", [roomName], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.query("SELECT id FROM chat_rooms WHERE name = ?", [roomName], (err, rows) => {
      if (err || rows.length === 0) return res.status(500).json({ error: 'Failed to get DM room' });
      res.json({ roomId: rows[0].id, roomName });
    });
  });
});

app.delete('/api/chat/rooms/:roomId', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  db.query("SELECT name, type FROM chat_rooms WHERE id = ?", [roomId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    const room = rows[0];
    if (room.type === 'direct') {
      const parts = room.name.split('_');
      if (parts.length !== 3) return res.status(400).json({ error: 'Invalid DM room name' });
      const participantIds = [parseInt(parts[1]), parseInt(parts[2])];
      if (!participantIds.includes(userId)) return res.status(403).json({ error: 'You are not a participant' });
      db.query("DELETE FROM chat_messages WHERE room_id = ?", [roomId], () => {
        db.query("DELETE FROM chat_rooms WHERE id = ?", [roomId], () => res.json({ success: true }));
      });
    } else if (room.type === 'group') {
      db.query("SELECT * FROM chat_room_members WHERE room_id = ? AND user_id = ?", [roomId, userId], (err, memb) => {
        if (err) return res.status(500).json({ error: err.message });
        if (memb.length === 0) return res.status(403).json({ error: 'You are not a member' });
        db.query("DELETE FROM chat_messages WHERE room_id = ?", [roomId], () => {
          db.query("DELETE FROM user_chat_read WHERE room_id = ?", [roomId], () => {
            db.query("DELETE FROM chat_room_members WHERE room_id = ?", [roomId], () => {
              db.query("DELETE FROM chat_rooms WHERE id = ?", [roomId], () => res.json({ success: true }));
            });
          });
        });
      });
    } else return res.status(400).json({ error: 'Unknown room type' });
  });
});

app.delete('/api/chat/rooms/:roomId/leave', authenticateToken, (req, res) => {
  const { roomId } = req.params;
  const userId = req.user.id;
  db.query("SELECT type FROM chat_rooms WHERE id = ?", [roomId], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'Room not found' });
    if (rows[0].type !== 'group') return res.status(400).json({ error: 'Only groups can be left' });
    db.query("DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?", [roomId, userId], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.query("DELETE FROM user_chat_read WHERE room_id = ? AND user_id = ?", [roomId, userId], () => {});
      res.json({ success: true });
    });
  });
});

app.post('/api/chat/read/:roomId', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { roomId } = req.params;
  db.query("INSERT INTO user_chat_read (user_id, room_id, last_read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_read_at = NOW()", [userId, roomId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/chat/unread-counts', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query(`SELECT r.id AS room_id, (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = r.id AND cm.sent_at > COALESCE((SELECT last_read_at FROM user_chat_read WHERE user_id = ? AND room_id = r.id), '1970-01-01')) AS unread FROM chat_rooms r JOIN chat_room_members rm ON r.id = rm.room_id AND rm.user_id = ? WHERE r.type = 'group' UNION ALL SELECT r.id AS room_id, (SELECT COUNT(*) FROM chat_messages cm WHERE cm.room_id = r.id AND cm.sent_at > COALESCE((SELECT last_read_at FROM user_chat_read WHERE user_id = ? AND room_id = r.id), '1970-01-01')) AS unread FROM chat_rooms r WHERE r.type = 'direct' AND (r.name LIKE CONCAT('dm_%', ?, '\_%') OR r.name LIKE CONCAT('dm\_%\_', ?))`, [userId, userId, userId, userId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/chat/group-room', authenticateToken, (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !memberIds || !Array.isArray(memberIds) || memberIds.length < 2) return res.status(400).json({ error: 'Group name and at least 2 members required.' });
  const creatorId = req.user.id;
  if (!memberIds.includes(creatorId)) memberIds.push(creatorId);
  db.query("INSERT INTO chat_rooms (name, type) VALUES (?, 'group')", [name], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    const roomId = result.insertId;
    const values = memberIds.map(id => [roomId, id]);
    db.query("INSERT INTO chat_room_members (room_id, user_id) VALUES ?", [values], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.query("INSERT INTO user_chat_read (user_id, room_id) VALUES ?", [values], () => {});
      res.json({ success: true, roomId });
    });
  });
});


// ============================================
// 12. MONTHLY ATTENDANCE, PAYROLL & REPORTS
// ============================================

app.get('/api/attendance-monthly', async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) {
    return res.status(400).json({ error: 'Month and year required' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const sql = `
    SELECT 
      u.employee_id, 
      u.full_name,
      COALESCE(SUM(TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60), 0) AS regular_hours,
      0 AS overtime_hours,
      COALESCE(SUM(CASE WHEN a.status = 'on leave' THEN 1 ELSE 0 END), 0) AS leave_days,
      COALESCE(SUM(
        CASE 
          WHEN a.time_in IS NOT NULL 
               AND s.start_time IS NOT NULL 
               AND TIME_TO_SEC(TIMEDIFF(a.time_in, s.start_time)) > 900
          THEN TIME_TO_SEC(TIMEDIFF(a.time_in, s.start_time)) / 60
          ELSE 0
        END
      ), 0) AS late_minutes
    FROM users u
    LEFT JOIN attendance a ON u.employee_id = a.user_id 
      AND a.date BETWEEN ? AND ? 
      AND a.status NOT IN ('on leave', 'absent')
    LEFT JOIN schedules s ON a.schedule_id = s.id
    WHERE u.role = 'instructor' AND u.status = 'active'
    GROUP BY u.id
  `;

  db.query(sql, [startDate, endDate], (err, results) => {
    if (err) {
      console.error("Attendance monthly error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.get('/api/payroll/history', (req, res) => {
  const sql = `
    SELECT 
      p.id, p.month_year, p.gross_pay, p.net_pay, p.tax_deduction,
      p.sss_deduction, p.philhealth_deduction, p.pagibig_deduction,
      p.loan_deduction, p.other_deduction, p.status,
      u.full_name, u.employee_id
    FROM payroll p
    JOIN users u ON p.user_id = u.id
    ORDER BY p.id DESC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Payroll history error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});

app.get('/api/school-locations', (req, res) => {
  db.query("SELECT id, name, latitude, longitude, radius FROM school_locations ORDER BY name", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(results || []);
  });
});

app.post('/api/school-locations', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, latitude, longitude, radius } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Location name required' });
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Valid latitude and longitude required' });
  }
  const locRadius = radius && radius > 0 ? radius : 200;
  db.query(
    "INSERT INTO school_locations (name, latitude, longitude, radius) VALUES (?, ?, ?, ?)",
    [name.trim(), latitude, longitude, locRadius],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ error: 'Location name already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      logAction(req.user.id, 'CREATE_LOCATION', 'school_location', result.insertId, req);
      res.json({ success: true, id: result.insertId });
    }
  );
});

app.put('/api/school-locations/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, latitude, longitude, radius } = req.body;
  const locationId = req.params.id;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Location name required' });
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Valid latitude and longitude required' });
  }
  const locRadius = radius && radius > 0 ? radius : 200;

  const [oldRecord] = await db.promise().query("SELECT * FROM school_locations WHERE id = ?", [locationId]);
  if (oldRecord.length === 0) return res.status(404).json({ error: 'Location not found' });
  const oldData = oldRecord[0];
  const newData = { name: name.trim(), latitude, longitude, radius: locRadius };

  db.query(
    "UPDATE school_locations SET name = ?, latitude = ?, longitude = ?, radius = ? WHERE id = ?",
    [name.trim(), latitude, longitude, locRadius, locationId],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(400).json({ error: 'Location name already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      logAction(req.user.id, 'UPDATE_LOCATION', 'school_location', locationId, req, oldData, newData);
      res.json({ success: true });
    }
  );
});

app.delete('/api/school-locations/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const locationId = req.params.id;

  const [oldRecord] = await db.promise().query("SELECT * FROM school_locations WHERE id = ?", [locationId]);
  if (oldRecord.length === 0) return res.status(404).json({ error: 'Location not found' });
  const oldData = oldRecord[0];

  db.query("SELECT id FROM schedules WHERE place = (SELECT name FROM school_locations WHERE id = ?) LIMIT 1", [locationId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete location because it is used in schedules' });
    }
    db.query("DELETE FROM school_locations WHERE id = ?", [locationId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Location not found' });
      }
      
      logAction(req.user.id, 'DELETE_LOCATION', 'school_location', locationId, req, oldData, null);
      res.json({ success: true });
    });
  });
});



app.get('/api/reports/compliance/attendance-compliance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view this report.' });
  }

  const { month, year } = req.query;
  if (!month || !year || isNaN(month) || isNaN(year)) {
    return res.status(400).json({ success: false, message: 'A valid numeric month and year are required.' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  try {
    const [rows] = await db.promise().query(`
      SELECT 
        u.employee_id,
        u.full_name,
        COUNT(DISTINCT s.date) AS scheduled_days,
        COUNT(DISTINCT CASE WHEN a.status IN ('present', 'late') THEN a.date END) AS present_days,
        COALESCE(SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END), 0) AS late_count,
        COALESCE(COUNT(DISTINCT CASE WHEN a.status = 'on leave' THEN a.date END), 0) AS leave_days
      FROM users u
      LEFT JOIN schedules s ON u.employee_id = s.user_id AND s.date BETWEEN ? AND ?
      LEFT JOIN attendance a ON u.employee_id = a.user_id AND a.date BETWEEN ? AND ?
      WHERE u.role = 'instructor' AND u.status = 'active'
      GROUP BY u.id
      ORDER BY u.full_name ASC
    `, [startDate, endDate, startDate, endDate]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active instructors found for the selected period.' });
    }

    const reportData = rows.map(row => {
      const scheduled = Number(row.scheduled_days) || 0;
      const present = Number(row.present_days) || 0;
      const late = Number(row.late_count) || 0;
      const leave = Number(row.leave_days) || 0;
      const absent = Math.max(0, scheduled - present - leave);
      const complianceRate = scheduled > 0 ? (present / scheduled) * 100 : 0;
      return {
        employee_id: row.employee_id || '—',
        full_name: row.full_name || 'Unknown',
        scheduled_days: scheduled,
        present_days: present,
        late_days: late,
        leave_days: leave,
        absent_days: absent,
        compliance_rate: complianceRate.toFixed(1)
      };
    });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    // Do not set headers until we are absolutely sure the PDF is generating
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=attendance_compliance_${year}_${month}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('HCT ACADEMY', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Healthcare Training Center', { align: 'center' });
    doc.fontSize(9).text('123 Healthcare Avenue, Pasay City, Metro Manila', { align: 'center' });
    doc.text('Tel: (02) 8123-4567 | Email: info@hct.ph', { align: 'center' });
    doc.moveDown(0.5);
    
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke();
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold').text('ATTENDANCE COMPLIANCE REPORT', { align: 'center' });
    const monthName = new Date(year, month-1).toLocaleString('default', { month: 'long' });
    doc.fontSize(10).font('Helvetica').text(`Period: ${monthName} ${year}`, { align: 'center' });
    doc.moveDown(1.5);

    const startX = 50;
    const colWidths = [55, 145, 60, 55, 45, 50, 60]; 
    const headers = ['ID', 'Name', 'Scheduled', 'Present', 'Late', 'Leave', 'Comp%'];
    const rowHeight = 22;

    let currentY = doc.y;

    doc.rect(startX, currentY, 470, rowHeight).fillAndStroke('#F3F4F6', '#000000');
    doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
    
    headers.forEach((h, i) => {
      let x = startX;
      for (let j = 0; j < i; j++) x += colWidths[j];
      doc.text(h, x, currentY + 6, { width: colWidths[i], align: 'center' });
      if (i > 0) doc.moveTo(x, currentY).lineTo(x, currentY + rowHeight).stroke();
    });
    
    currentY += rowHeight;
    doc.font('Helvetica').fontSize(8.5);

    for (const emp of reportData) {
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
        
        doc.rect(startX, currentY, 470, rowHeight).fillAndStroke('#F3F4F6', '#000000');
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9);
        headers.forEach((h, i) => {
          let x = startX;
          for (let j = 0; j < i; j++) x += colWidths[j];
          doc.text(h, x, currentY + 6, { width: colWidths[i], align: 'center' });
          if (i > 0) doc.moveTo(x, currentY).lineTo(x, currentY + rowHeight).stroke();
        });
        currentY += rowHeight;
        doc.font('Helvetica').fontSize(8.5);
      }

      doc.rect(startX, currentY, 470, rowHeight).stroke();

      let x = startX;
      doc.text(emp.employee_id, x + 5, currentY + 6, { width: colWidths[0] - 10, align: 'left' });
      doc.moveTo(x + colWidths[0], currentY).lineTo(x + colWidths[0], currentY + rowHeight).stroke();
      x += colWidths[0];

      doc.text(emp.full_name.substring(0, 30), x + 5, currentY + 6, { width: colWidths[1] - 10, align: 'left' });
      doc.moveTo(x + colWidths[1], currentY).lineTo(x + colWidths[1], currentY + rowHeight).stroke();
      x += colWidths[1];

      doc.text(emp.scheduled_days.toString(), x, currentY + 6, { width: colWidths[2], align: 'center' });
      doc.moveTo(x + colWidths[2], currentY).lineTo(x + colWidths[2], currentY + rowHeight).stroke();
      x += colWidths[2];

      doc.text(emp.present_days.toString(), x, currentY + 6, { width: colWidths[3], align: 'center' });
      doc.moveTo(x + colWidths[3], currentY).lineTo(x + colWidths[3], currentY + rowHeight).stroke();
      x += colWidths[3];

      doc.text(emp.late_days.toString(), x, currentY + 6, { width: colWidths[4], align: 'center' });
      doc.moveTo(x + colWidths[4], currentY).lineTo(x + colWidths[4], currentY + rowHeight).stroke();
      x += colWidths[4];

      doc.text(emp.leave_days.toString(), x, currentY + 6, { width: colWidths[5], align: 'center' });
      doc.moveTo(x + colWidths[5], currentY).lineTo(x + colWidths[5], currentY + rowHeight).stroke();
      x += colWidths[5];

      doc.text(`${emp.compliance_rate}%`, x, currentY + 6, { width: colWidths[6], align: 'center' });

      currentY += rowHeight;
    }

    doc.moveDown(2);

    currentY = doc.y;
    const totalScheduled = reportData.reduce((s, e) => s + e.scheduled_days, 0);
    const totalPresent = reportData.reduce((s, e) => s + e.present_days, 0);
    const totalLate = reportData.reduce((s, e) => s + e.late_days, 0);
    const totalLeave = reportData.reduce((s, e) => s + e.leave_days, 0);
    const totalAbsent = totalScheduled - totalPresent - totalLeave;
    const overallRate = totalScheduled > 0 ? (totalPresent / totalScheduled) * 100 : 0;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('EXECUTIVE SUMMARY', startX, currentY, { underline: true });
    
    currentY += 18;
    
    doc.font('Helvetica').fontSize(9);
    const labelWidth = 110;
    const valueWidth = 30;

    const drawSummaryRow = (label, value) => {
      doc.text(label, startX, currentY, { width: labelWidth, align: 'left' });
      doc.text(value.toString(), startX + labelWidth, currentY, { width: valueWidth, align: 'right' });
      currentY += 14;
    };

    drawSummaryRow('Total Scheduled Days:', totalScheduled);
    drawSummaryRow('Total Present Days:', totalPresent);
    drawSummaryRow('Total Late Days:', totalLate);
    drawSummaryRow('Total Leave Days:', totalLeave);
    drawSummaryRow('Total Absent Days:', totalAbsent);
    
    currentY += 4;
    doc.font('Helvetica-Bold');
    doc.text('Overall Compliance Rate:', startX, currentY, { width: labelWidth, align: 'left' });
    doc.text(`${overallRate.toFixed(1)}%`, startX + labelWidth, currentY, { width: valueWidth, align: 'right' });
    
    if (overallRate < 85) {
      doc.font('Helvetica').fillColor('#DC2626').text(' (Below department target of 85%)', startX + labelWidth + valueWidth + 5, currentY);
      doc.fillColor('#000000');
    }

    doc.moveDown(5);
    currentY = doc.y;
    
    doc.moveTo(startX, currentY).lineTo(startX + 120, currentY).stroke();
    doc.moveTo(startX + 175, currentY).lineTo(startX + 295, currentY).stroke();
    doc.moveTo(startX + 350, currentY).lineTo(startX + 470, currentY).stroke();
    
    doc.font('Helvetica').fontSize(8);
    doc.text('Prepared By (HR)', startX, currentY + 5, { width: 120, align: 'center' });
    doc.text('Reviewed By (Manager)', startX + 175, currentY + 5, { width: 120, align: 'center' });
    doc.text('Approved By (Director)', startX + 350, currentY + 5, { width: 120, align: 'center' });

    doc.moveDown(4);
    doc.fontSize(8).fillColor('gray').text(`Generated on ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`, { align: 'center' });
    doc.text('This is a system-generated official document.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Server failed to generate the compliance report.' });
    }
  }
});

app.post('/api/payroll/unlock', (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) {
    return res.status(400).json({ success: false, message: 'Email and PIN are required.' });
  }

  if (!checkPinRateLimit(email)) {
    return res.status(429).json({
      success: false,
      message: 'Too many failed attempts. Please wait 15 minutes before trying again.'
    });
  }

  db.query(
    "SELECT * FROM users WHERE email = ? AND status = 'active' AND (role = 'admin' OR role = 'hr_admin')",
    [email],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database connection error.' });
      if (results.length === 0) {
        return res.status(404).json({ success: false, message: 'Admin account not found or deactivated.' });
      }

      const admin = results[0];
      if (admin.payroll_pin !== pin) {
        recordFailedPinAttempt(email);
        return res.status(401).json({ success: false, message: 'Incorrect security PIN.' });
      }

      clearPinAttempts(email);

      const payrollToken = jwt.sign(
        { id: admin.id, email: admin.email, purpose: 'payroll-access' },
        PAYROLL_JWT_SECRET,
        { expiresIn: '15m' }
      );

      db.query(
        "INSERT INTO payroll_access_logs (user_id, email) VALUES (?, ?)",
        [admin.id, admin.email],
        (err) => {
          if (err) console.error('Failed to log payroll access:', err);
        }
      );

      res.json({ success: true, message: 'Access granted.', token: payrollToken, expiresIn: 900 });
    }
  );
});

// Added authenticateToken to ensure only logged in users can attempt a PIN update
app.put('/api/users/update-pin', authenticateToken, (req, res) => {
  const { email, currentPin, newPin } = req.body;
  
  if (!email || !currentPin || !newPin) {
    return res.status(400).json({ success: false, message: 'Email, current PIN, and new PIN are required.' });
  }
  
  // Ensure exactly 4 to 6 digits
  if (!/^\d{4,6}$/.test(newPin)) {
    return res.status(400).json({ success: false, message: 'The new PIN must be between 4 and 6 numeric digits.' });
  }

  // Ensure the logged in user is actually the one trying to update the PIN
  if (req.user.email !== email) {
      return res.status(403).json({ success: false, message: 'You can only update the PIN for your own account.' });
  }

  db.query(
    "SELECT * FROM users WHERE email = ? AND status = 'active' AND (role = 'admin' OR role = 'hr_admin')",
    [email],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database connection error.' });
      if (results.length === 0) return res.status(404).json({ success: false, message: 'Admin account not found.' });

      const admin = results[0];
      if (admin.payroll_pin !== currentPin) {
        return res.status(401).json({ success: false, message: 'The current PIN provided is incorrect.' });
      }

      db.query("UPDATE users SET payroll_pin = ? WHERE id = ?", [newPin, admin.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Database error while saving new PIN.' });
        clearPinAttempts(email);
        res.json({ success: true, message: 'Security PIN successfully updated.' });
      });
    }
  );
});

// ============================================
// 12. PAYROLL (Secured & Validated)
// ============================================

app.post('/api/payroll/finalize', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to finalize payroll.' });
  }
  const {
    user_id, month_year, salary_rate, total_hours, overtime_hours, overtime_pay,
    transport_allowance, meal_allowance, housing_allowance, sss_deduction, philhealth_deduction,
    pagibig_deduction, loan_deduction, other_deduction, gross_pay, tax_deduction, net_pay,
    total_earnings, status
  } = req.body;

  // 1. Strict Input Validation
  if (!user_id || !month_year || total_hours === undefined || gross_pay === undefined || net_pay === undefined) {
    return res.status(400).json({ success: false, message: 'Missing required payroll fields (user ID, month/year, hours, or pay).' });
  }
  
  if (isNaN(total_hours) || isNaN(gross_pay) || isNaN(net_pay)) {
    return res.status(400).json({ success: false, message: 'Calculated payroll values must be valid numbers.' });
  }

  db.query("SELECT id FROM payroll WHERE user_id = ? AND month_year = ?", [user_id, month_year], (err, rows) => {
    if (err) {
      console.error("Payroll check error:", err);
      return res.status(500).json({ success: false, message: 'Database connection error while checking existing payroll.' });
    }
    if (rows.length > 0) {
      return res.status(409).json({ success: false, message: `Payroll for ${month_year} has already been finalized for this employee.` });
    }

    const finalSalaryRate = salary_rate || (total_hours > 0 ? gross_pay / total_hours : 0);
    
    db.query(
      `INSERT INTO payroll 
        (user_id, month_year, salary_rate, total_hours, overtime_hours, overtime_pay,
         transport_allowance, meal_allowance, housing_allowance, sss_deduction, philhealth_deduction,
         pagibig_deduction, loan_deduction, other_deduction, gross_pay, tax_deduction, net_pay,
         total_earnings, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user_id, month_year, finalSalaryRate, total_hours, overtime_hours || 0, overtime_pay || 0,
        transport_allowance || 0, meal_allowance || 0, housing_allowance || 0,
        sss_deduction || 0, philhealth_deduction || 0, pagibig_deduction || 0,
        loan_deduction || 0, other_deduction || 0, gross_pay, tax_deduction || 0, net_pay,
        total_earnings || net_pay, status || 'paid'
      ],
      (err, result) => {
        if (err) {
          console.error("Payroll insertion error:", err);
          return res.status(500).json({ success: false, message: 'Database error while finalizing payroll.' });
        }
        logAction(req.user.id, 'FINALIZE_PAYROLL', 'payroll', result.insertId, req);
        res.json({ success: true, message: 'Payroll record successfully finalized and saved.' });
      }
    );
  });
});

app.post('/api/payroll/run-monthly', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to run monthly payroll.' });
  }

  const { month, year } = req.body;
  if (!month || !year || isNaN(month) || isNaN(year)) {
    return res.status(400).json({ success: false, message: 'A valid numeric month and year are required.' });
  }

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const monthYear = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  try {
    const [employees] = await db.promise().query(
      "SELECT id, employee_id, full_name, monthly_salary, work_days_per_month FROM users WHERE LOWER(role) = 'instructor' AND status = 'active'"
    );

    if (employees.length === 0) {
      return res.status(400).json({ success: false, message: 'No active instructors found to process.' });
    }

    const processed = [];
    const skipped = [];

    for (const emp of employees) {
      const [existing] = await db.promise().query("SELECT id FROM payroll WHERE user_id = ? AND month_year = ?", [emp.id, monthYear]);
      if (existing.length > 0) {
        skipped.push({ employee: emp.full_name, reason: 'Already finalized' });
        continue;
      }

      const [attendance] = await db.promise().query(
        `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, time_in, time_out) / 60), 0) as total_hours 
         FROM attendance 
         WHERE user_id = ? AND date BETWEEN ? AND ? AND status IN ('present', 'late')`,
        [emp.employee_id, startDate, endDate]
      );
      
      const totalHours = parseFloat(attendance[0]?.total_hours || 0);

      const monthlySalary = parseFloat(emp.monthly_salary) || 0;
      const workDays = parseFloat(emp.work_days_per_month) || 22;
      const hourlyRate = (monthlySalary > 0 && workDays > 0) ? (monthlySalary / workDays) / 8 : 0;
      
      const grossPay = totalHours * hourlyRate;
      const tax = grossPay * 0.10;
      const netPay = grossPay - tax;

      await db.promise().query(
        `INSERT INTO payroll 
          (user_id, month_year, salary_rate, total_hours, overtime_hours, overtime_pay,
           transport_allowance, meal_allowance, housing_allowance, sss_deduction, philhealth_deduction,
           pagibig_deduction, loan_deduction, other_deduction, gross_pay, tax_deduction, net_pay,
           status, total_earnings)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, 'paid', ?)`,
        [
          emp.id, 
          monthYear, 
          hourlyRate.toFixed(2), 
          totalHours.toFixed(2), 
          grossPay.toFixed(2), 
          tax.toFixed(2), 
          netPay.toFixed(2), 
          netPay.toFixed(2)
        ]
      );

      processed.push({ employee: emp.full_name, totalHours, netPay: netPay.toFixed(2) });
    }

    logAction(req.user.id, 'RUN_MONTHLY_PAYROLL', 'payroll', null, req);
    res.json({ 
      success: true, 
      message: `Monthly payroll processed successfully. (${processed.length} processed, ${skipped.length} skipped)`,
      processed: processed.length, 
      skipped: skipped.length, 
      details: { processed, skipped } 
    });

  } catch (err) {
    console.error('Monthly payroll error:', err);
    res.status(500).json({ success: false, message: 'Server connection failed while processing payroll.' });
  }
});

app.put('/api/payroll/update-employee-salary/:employeeId', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to update salaries.' });
  }
  
  const { employeeId } = req.params;
  const { monthly_salary, work_days_per_month } = req.body;
  
  // Strict Validation to prevent NaN database corruption
  if (monthly_salary === undefined || work_days_per_month === undefined) {
    return res.status(400).json({ success: false, message: 'Monthly salary and work days per month are required.' });
  }
  if (isNaN(monthly_salary) || monthly_salary < 0 || isNaN(work_days_per_month) || work_days_per_month <= 0) {
    return res.status(400).json({ success: false, message: 'Salary and work days must be valid positive numbers.' });
  }

  db.query(
    "UPDATE users SET monthly_salary = ?, work_days_per_month = ? WHERE employee_id = ?",
    [monthly_salary, work_days_per_month, employeeId],
    (err, result) => {
      if (err) {
        console.error("Salary update error:", err);
        return res.status(500).json({ success: false, message: 'Database error while updating salary configuration.' });
      }
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
      
      logAction(req.user.id, 'UPDATE_SALARY', 'user', employeeId, req);
      res.json({ success: true, message: 'Employee salary configuration successfully updated.' });
    }
  );
});

// Added missing Auth Middleware
app.get('/api/payroll/access-logs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }

  db.query(
    "SELECT pal.email, u.full_name, pal.accessed_at FROM payroll_access_logs pal JOIN users u ON pal.user_id = u.id ORDER BY pal.accessed_at DESC LIMIT 100",
    (err, results) => {
      if (err) {
        console.error("Fetch payroll logs error:", err);
        return res.status(500).json({ success: false, message: 'Failed to fetch payroll access logs.' });
      }
      res.json(results || []);
    }
  );
});

// ============================================
// 13. ADMIN AUDIT LOGS & CONFIGURATION
// ============================================

app.get('/api/audit-logs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const sql = `
    SELECT al.*, u.email as user_email
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT 2000
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.put('/api/users/:id/role', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const { role } = req.body;
  const userId = req.params.id;
  
  if (!['admin', 'hr_admin', 'security', 'instructor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const [oldRecord] = await db.promise().query("SELECT * FROM users WHERE id = ?", [userId]);
  if (oldRecord.length === 0) return res.status(404).json({ error: 'User not found' });
  const oldData = oldRecord[0];

  db.query("UPDATE users SET role = ? WHERE id = ?", [role, userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    
    logAction(req.user.id, 'UPDATE_USER_ROLE', 'user', userId, req, { role: oldData.role }, { role });
    res.json({ success: true });
  });
});

const createConfigTable = `
  CREATE TABLE IF NOT EXISTS system_config (
    id INT PRIMARY KEY DEFAULT 1,
    password_expiry_days INT DEFAULT 365,
    otp_expiry_minutes INT DEFAULT 5,
    geofence_default_radius INT DEFAULT 200,
    max_login_attempts INT DEFAULT 5,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`;
db.query(createConfigTable, (err) => {
  if (err) console.error('Failed to create system_config table:', err);
  else {
    db.query("INSERT IGNORE INTO system_config (id) VALUES (1)");
  }
});

app.get('/api/system-config', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT password_expiry_days, otp_expiry_minutes, geofence_default_radius, max_login_attempts FROM system_config WHERE id = 1", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || { password_expiry_days: 365, otp_expiry_minutes: 5, geofence_default_radius: 200, max_login_attempts: 5 });
  });
});

app.put('/api/system-config', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { password_expiry_days, otp_expiry_minutes, geofence_default_radius, max_login_attempts } = req.body;
  const sql = `UPDATE system_config SET 
    password_expiry_days = ?, 
    otp_expiry_minutes = ?, 
    geofence_default_radius = ?, 
    max_login_attempts = ? 
    WHERE id = 1`;
  db.query(sql, [password_expiry_days, otp_expiry_minutes, geofence_default_radius, max_login_attempts], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/visitor-requests', authenticateToken, (req, res) => {
  const { date, status } = req.query;
  let sql = "SELECT * FROM visitor_requests WHERE 1=1";
  const params = [];
  if (date) { sql += " AND visit_date = ?"; params.push(date); }
  if (status) { sql += " AND status = ?"; params.push(status); }
  sql += " ORDER BY visit_time ASC";
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.put('/api/visitor-requests/:id/arrive', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { floor, destination, ble_id } = req.body; 

  if (!destination || !ble_id || !floor) {
    return res.status(400).json({ success: false, message: "Floor, destination room, and BLE tag are required." });
  }

  db.query("SELECT first_name, last_name FROM visitor_requests WHERE id = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection failed." });
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Visitor request not found." });
    
    const visitorName = `${rows[0].first_name} ${rows[0].last_name || ''}`.trim();
    const sql = `UPDATE visitor_requests SET arrived = TRUE, arrived_at = NOW(), destination = ?, ble_id = ? WHERE id = ?`;
    
    db.query(sql, [destination.trim(), ble_id.trim(), id], (err) => {
      if (err) return res.status(500).json({ success: false, message: "Failed to check in visitor." });

      logAction(req.user.id, 'VISITOR_ARRIVE', 'visitor_request', id, req);
      visitorDestinations[ble_id] = destination;

      liveVisitors[ble_id] = {
        id: ble_id,
        name: visitorName,
        bleId: ble_id,
        floor: String(floor),
        currentRoom: destination.trim(),
        destination: destination.trim(),
        lastSeen: Date.now() + 60000 
      };

      console.log(`✅ Checked In: ${visitorName} on Floor ${floor} at ${destination}`);
      res.json({ success: true, message: "Visitor successfully checked in." });
    });
  });
});

app.put('/api/visitor-requests/:id/no-show', authenticateToken, (req, res) => {
  const { id } = req.params;
  db.query(
    "UPDATE visitor_requests SET no_show = TRUE, no_show_at = NOW(), arrived = FALSE, arrived_at = NULL WHERE id = ?",
    [id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.post('/api/instructor/location', authenticateToken, async (req, res) => {
  if (req.user.role !== 'instructor') return res.status(403).json({ error: 'Forbidden' });

  const { latitude, longitude, location_enabled } = req.body;
  const userId = req.user.id;

  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id, full_name, location_tracking_enabled FROM users WHERE id = ?",
      [userId]
    );
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

    const employeeId = userRows[0].employee_id;
    const fullName = userRows[0].full_name;
    const { date: today } = getPHTime();

    const [scheduleRows] = await db.promise().query(
      `SELECT id, place, start_time, end_time FROM schedules 
       WHERE user_id = ? AND date = ? AND TIME(NOW()) BETWEEN start_time AND end_time`,
      [employeeId, today]
    );
    const currentSchedule = scheduleRows[0];
    if (!currentSchedule) {
      return res.json({ success: false, message: "No active shift" });
    }

    const [lastRec] = await db.promise().query(
      `SELECT location_enabled, is_inside_campus 
       FROM instructor_location_tracking 
       WHERE employee_id = ? AND schedule_id = ? 
       ORDER BY ping_time DESC LIMIT 1`,
      [employeeId, currentSchedule.id]
    );
    const lastGpsState = lastRec.length ? lastRec[0].location_enabled : null;
    const lastInsideState = lastRec.length ? lastRec[0].is_inside_campus : null;

    let isInside = false;
    let resolvedLocationName = 'Outside Campus';
    if (location_enabled && latitude && longitude) {
      const [locRows] = await db.promise().query(
        "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
        [currentSchedule.place]
      );
      if (locRows.length > 0) {
        const dist = getDistanceFromLatLonInMeters(latitude, longitude, locRows[0].latitude, locRows[0].longitude);
        isInside = dist <= locRows[0].radius;
        resolvedLocationName = isInside ? currentSchedule.place : 'Outside Campus';
      }
    }

    await db.promise().query(
      `INSERT INTO instructor_location_tracking 
       (employee_id, schedule_id, latitude, longitude, location_name, is_inside_campus, location_enabled, ping_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [employeeId, currentSchedule.id, latitude || 0, longitude || 0, resolvedLocationName, isInside ? 1 : 0, location_enabled ? 1 : 0]
    );

    await db.promise().query(
      "UPDATE users SET last_location_ping = NOW(), location_tracking_enabled = ? WHERE employee_id = ?",
      [location_enabled ? 1 : 0, employeeId]
    );

    if (lastGpsState !== null && lastGpsState !== (location_enabled ? 1 : 0)) {
      const alertMsg = location_enabled ? 'GPS turned ON' : 'GPS turned OFF';
      await insertAndBroadcastAlert(alertMsg, { employeeId, fullName, scheduleId: currentSchedule.id });
    }

    if (lastInsideState !== null && lastInsideState !== (isInside ? 1 : 0) && location_enabled) {
      const alertMsg = isInside ? 'Entered campus' : 'Went outside campus';
      await insertAndBroadcastAlert(alertMsg, { employeeId, fullName, scheduleId: currentSchedule.id, locationName: resolvedLocationName });
    }

    await broadcastInstructorStatus(employeeId);
    res.json({ success: true, isInside, inShift: true });
  } catch (err) {
    console.error("Location update error:", err);
    res.status(500).json({ error: err.message });
  }
});

const broadcastInstructorStatus = async (employeeId) => {
  const { date: today } = getPHTime();
  const [rows] = await db.promise().query(`
    SELECT 
      u.employee_id, u.full_name, u.last_location_ping, u.location_tracking_enabled,
      s.id AS schedule_id, s.place AS schedule_place, s.course AS schedule_course, s.start_time, s.end_time,
      (SELECT location_name FROM instructor_location_tracking WHERE employee_id = u.employee_id ORDER BY ping_time DESC LIMIT 1) AS last_position_name,
      (SELECT is_inside_campus FROM instructor_location_tracking WHERE employee_id = u.employee_id ORDER BY ping_time DESC LIMIT 1) AS last_is_inside,
      (CASE 
        WHEN u.last_location_ping IS NULL THEN 'DISABLED'
        WHEN u.location_tracking_enabled = 0 THEN 'DISABLED'
        WHEN TIMESTAMPDIFF(SECOND, u.last_location_ping, NOW()) > 120 THEN 'DISABLED'
        ELSE 'GPS ON'
      END) AS gps_status
    FROM users u
    LEFT JOIN schedules s ON u.employee_id = s.user_id AND DATE(s.date) = ?
    WHERE u.employee_id = ?
  `, [today, employeeId]);

  if (rows.length === 0) return;
  broadcastToAdminAndHR({ type: 'instructor_status_update', instructor: rows[0] });
};

app.get('/api/location-tracking/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });

  const selectedDate = req.query.date || getPHTime().date;
  const { date: todayPh, time: timePh } = getPHTime();
  const currentPhDateTime = `${todayPh} ${timePh}`;

  try {
    const [rows] = await db.promise().query(`
      SELECT 
        u.employee_id, u.full_name, u.location_tracking_enabled,
        s.id AS schedule_id, s.place AS schedule_place, s.course AS schedule_course,
        s.start_time, s.end_time,
        a.time_in, a.time_out,
        
        -- Reliable Manila-time comparison for missed vs scheduled
        COALESCE(a.status, 
          CASE 
            WHEN CONCAT(s.date, ' ', s.end_time) < ? AND a.time_in IS NULL THEN 'Missed Schedule'
            WHEN CONCAT(s.date, ' ', s.start_time) <= ? AND CONCAT(s.date, ' ', s.end_time) >= ? AND a.time_in IS NULL THEN 'Absent'
            ELSE 'Scheduled'
          END
        ) AS attendance_status,
        
        CASE 
          WHEN a.time_in IS NULL THEN 'Unavailable'
          WHEN a.time_out IS NOT NULL AND a.time_out != '--:--' THEN 'Unavailable'
          ELSE COALESCE(ilt.location_name, 'Unavailable') 
        END AS last_position_name, 
        
        CASE 
          WHEN a.time_in IS NULL THEN NULL
          WHEN a.time_out IS NOT NULL AND a.time_out != '--:--' THEN NULL
          ELSE ilt.is_inside_campus 
        END AS last_is_inside,
        
        u.last_location_ping AS last_ping_time,
        
        CASE 
          WHEN a.time_in IS NULL THEN 'GPS OFF'
          WHEN a.time_out IS NOT NULL AND a.time_out != '--:--' THEN 'GPS OFF'
          WHEN u.last_location_ping IS NULL THEN 'GPS OFF'
          WHEN u.location_tracking_enabled = 0 THEN 'GPS OFF'
          WHEN TIMESTAMPDIFF(SECOND, u.last_location_ping, STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s')) > 120 THEN 'GPS OFF'
          ELSE 'GPS ON'
        END AS gps_status,
        
        (SELECT MIN(ping_time) FROM instructor_location_tracking WHERE employee_id = u.employee_id AND schedule_id = s.id AND is_inside_campus = 1) AS campus_entry_time,
        (SELECT MAX(ping_time) FROM instructor_location_tracking WHERE employee_id = u.employee_id AND schedule_id = s.id AND is_inside_campus = 0 AND location_enabled = 1 AND ping_time > (SELECT MIN(ping_time) FROM instructor_location_tracking WHERE employee_id = u.employee_id AND schedule_id = s.id AND is_inside_campus = 1)) AS campus_exit_time

      FROM users u
      INNER JOIN schedules s ON u.employee_id = s.user_id 
      LEFT JOIN attendance a ON s.id = a.schedule_id
      LEFT JOIN (
          SELECT t1.* FROM instructor_location_tracking t1
          INNER JOIN (SELECT MAX(id) as max_id FROM instructor_location_tracking GROUP BY employee_id) t2 ON t1.id = t2.max_id
      ) ilt ON u.employee_id = ilt.employee_id
      WHERE u.role = 'instructor' AND u.status = 'active' AND s.date = ?
      ORDER BY s.start_time ASC
    `, [currentPhDateTime, currentPhDateTime, currentPhDateTime, currentPhDateTime, selectedDate]);

    rows.forEach(row => {
      if (row.campus_entry_time) row.campus_entry_time = new Date(row.campus_entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (row.campus_exit_time) row.campus_exit_time = new Date(row.campus_exit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/location-tracking/instructor-timeline/:employeeId', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  const { employeeId } = req.params;
  const targetDate = req.query.date || getPHTime().date;
  
  try {
    const [rows] = await db.promise().query(`
      SELECT ping_time, location_enabled, is_inside_campus, location_name, latitude, longitude
      FROM instructor_location_tracking
      WHERE employee_id = ? AND DATE(ping_time) = ?
      ORDER BY ping_time ASC
    `, [employeeId, targetDate]);

    const [alerts] = await db.promise().query(`
      SELECT id, alert_message, created_at
      FROM location_alerts
      WHERE employee_id = ? AND DATE(created_at) = ?
      ORDER BY created_at ASC
    `, [employeeId, targetDate]);

    const [schedule] = await db.promise().query(`
      SELECT start_time, end_time FROM schedules 
      WHERE user_id = ? AND date = ? LIMIT 1
    `, [employeeId, targetDate]);

    res.json({ 
      timeline: rows, 
      alerts, 
      start_time: schedule.length > 0 ? schedule[0].start_time : null,
      end_time: schedule.length > 0 ? schedule[0].end_time : null
    });
    
  } catch (err) {
    console.error("Timeline fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/location-tracking/alerts', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const targetDate = req.query.date || getPHTime().date;

  try {
    const sql = `
      SELECT 
        la.*, 
        u.full_name,
        s.place AS location_name
      FROM location_alerts la
      JOIN users u ON la.employee_id = u.employee_id
      LEFT JOIN schedules s ON la.employee_id = s.user_id AND DATE(la.created_at) = s.date
      WHERE DATE(la.created_at) = ?
      ORDER BY la.created_at DESC
    `;

    const [rows] = await db.promise().query(sql, [targetDate]);
    res.json(rows);
  } catch (err) {
    console.error("Alert fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

async function insertAndBroadcastAlert(alertMsg, context) {
  try {
    const [result] = await db.promise().query(
      `INSERT INTO location_alerts (employee_id, alert_message, latitude, longitude, created_at)
       SELECT ?, ?, ?, ?, NOW()
       FROM DUAL
       WHERE NOT EXISTS (
       SELECT 1 FROM location_alerts 
       WHERE employee_id = ? AND alert_message = ? 
       AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
)`,
      [context.employeeId, alertMsg, context.latitude || 0, context.longitude || 0, context.employeeId, alertMsg]
    );

    if (result.affectedRows === 0) return;

    const alert = {
      id: result.insertId,
      full_name: context.fullName,
      alert_message: alertMsg,
      location_name: context.locationName || 'Unavailable',
      created_at: new Date()
    };

    broadcastToAdminAndHR({ type: 'new_alert', alert });
  } catch (err) {
    console.error("Failed to insert/broadcast alert:", err);
  }
}

app.get('/api/visitor-history', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { date } = req.query;
  let sql = `SELECT id, visitor_name, ble_id, floor, current_room, event_type, x, y, created_at as timestamp
             FROM visitor_history ORDER BY created_at DESC LIMIT 500`;
  const params = [];

  if (date) {
    sql = `SELECT id, visitor_name, ble_id, floor, current_room, event_type, x, y, created_at as timestamp
           FROM visitor_history WHERE DATE(created_at) = ? ORDER BY created_at DESC LIMIT 500`;
    params.push(date);
  }

  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error("Visitor history error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/visitor-requests/history', authenticateToken, (req, res) => {
  if (req.user.role !== 'security' && req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start and end dates required' });
  }

  const sql = `
    SELECT 
      id, 
      DATE_FORMAT(visit_date, '%Y-%m-%d') as visit_date,
      first_name, last_name, email, phone,
      visit_time, reason,
      arrived_at, returned_at,
      destination, 
      COALESCE(used_ble_id, ble_id) AS ble_id
    FROM visitor_requests
    WHERE status = 'APPROVED'
      AND arrived = 1
      AND returned = 1
      AND visit_date BETWEEN ? AND ?
    ORDER BY visit_date DESC, arrived_at DESC
  `;

  db.query(sql, [startDate, endDate], (err, results) => {
    if (err) {
      console.error('Visitor history error:', err);
      return res.status(500).json({ error: err.message });
    }

    results.forEach(r => {
      if (r.arrived_at && r.returned_at) {
        const durationMs = new Date(r.returned_at) - new Date(r.arrived_at);
        const hours = Math.floor(durationMs / (1000 * 60 * 60));
        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
        r.duration = `${hours}h ${minutes}m`;
      } else {
        r.duration = '—';
      }
      r.arrived_time = r.arrived_at
        ? new Date(r.arrived_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';
      r.returned_time = r.returned_at
        ? new Date(r.returned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '—';
    });

    res.json(results);
  });
});

// ============================================
// OVERTIME REQUESTS (Secured & Validated)
// ============================================

app.post('/api/overtime-requests', authenticateToken, upload.single('attachment'), async (req, res) => {
  const { date, start_time, end_time, reason, scenario_type } = req.body;
  const userId = req.user.id;
  const attachment = req.file ? `/uploads/${req.file.filename}` : null;

  // 1. Strict Input Validation
  if (!date || !start_time || !end_time || !reason || !scenario_type) {
    return res.status(400).json({ success: false, message: 'All overtime fields are required.' });
  }
  if (reason.trim().length < 5) {
    return res.status(400).json({ success: false, message: 'Please provide a more detailed reason for overtime (minimum 5 characters).' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ success: false, message: 'Overtime end time must be strictly after the start time.' });
  }
  if (!['future', 'ongoing', 'after_shift'].includes(scenario_type)) {
    return res.status(400).json({ success: false, message: 'Invalid overtime scenario type.' });
  }

  // 2. Prevent logical date errors
  const { date: today } = getPHTime();
  if ((scenario_type === 'ongoing' || scenario_type === 'after_shift') && date > today) {
    return res.status(400).json({ success: false, message: 'Ongoing or after-shift overtime cannot be filed for future dates.' });
  }

  try {
    let attendanceId = null;
    
    // For ongoing requests, ensure the user actually has an active clock-in today
    if (scenario_type === 'ongoing') {
      const [attRecords] = await db.promise().query(
        `SELECT id, time_in, time_out FROM attendance 
         WHERE user_id = (SELECT employee_id FROM users WHERE id = ?) AND date = ? AND time_out IS NULL`,
        [userId, date]
      );
      if (attRecords.length === 0) {
        return res.status(400).json({ success: false, message: 'No active clock-in found for today. Cannot request ongoing overtime.' });
      }
      attendanceId = attRecords[0].id;
    }

    const [result] = await db.promise().query(
      `INSERT INTO overtime_requests 
       (user_id, date, start_time, end_time, reason, attachment, scenario_type, attendance_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, date, start_time, end_time, reason, attachment, scenario_type, attendanceId]
    );

    logAction(userId, 'SUBMIT_OVERTIME', 'overtime_request', result.insertId, req);
    res.json({ success: true, message: 'Overtime request submitted successfully.', requestId: result.insertId });
  } catch (err) {
    console.error("Overtime Submit Error:", err);
    res.status(500).json({ success: false, message: 'Server connection failed while submitting request.' });
  }
});

app.get('/api/overtime-requests', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query("SELECT * FROM overtime_requests WHERE user_id = ? ORDER BY date DESC", [userId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load overtime history.' });
    res.json(rows || []);
  });
});

app.get('/api/overtime-requests/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }
  db.query(
    `SELECT o.*, u.full_name, u.employee_id 
     FROM overtime_requests o
     JOIN users u ON o.user_id = u.id
     WHERE o.status = 'pending'
     ORDER BY o.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to load pending requests.' });
      res.json(rows || []);
    }
  );
});

app.put('/api/overtime-requests/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status update provided.' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query(
      `SELECT o.*, u.employee_id, u.id as user_id 
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ? AND o.processed = 0 FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Request not found or has already been processed.' });
    }
    const reqData = rows[0];

    await connection.query(`UPDATE overtime_requests SET status = ?, processed = 1, reviewed_at = NOW() WHERE id = ?`, [status, id]);

    if (status === 'approved') {
      const overtimeHours = calculateHours(reqData.start_time, reqData.end_time);
      const rate = await hourlyRateFromUser(reqData.user_id);
      const overtimePay = overtimeHours * (rate * 1.25); // 125% OT multiplier

      // If it was ongoing, extend the active attendance record
      if (reqData.scenario_type === 'ongoing' && reqData.attendance_id) {
        await connection.query(
          `UPDATE attendance SET time_out = ?, total_hours = TIMESTAMPDIFF(MINUTE, time_in, ?) / 60 
           WHERE id = ?`,
          [reqData.end_time, reqData.end_time, reqData.attendance_id]
        );
      } 
      // If it's a future/after-shift OT that didn't have an active record, create an OT attendance block
      else if (reqData.scenario_type === 'future' || reqData.scenario_type === 'after_shift') {
        await connection.query(
          `INSERT INTO attendance 
           (user_id, date, time_in, time_out, status, location, total_hours, correction_requested)
           VALUES (?, ?, ?, ?, 'overtime', 'Approved Overtime', ?, 0)`,
          [reqData.employee_id, reqData.date, reqData.start_time, reqData.end_time, overtimeHours]
        );
      }

      // Append pay to this month's payroll if it exists
      const monthYear = new Date(reqData.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      const [payrollRows] = await connection.query(
        `SELECT id, overtime_hours, overtime_pay FROM payroll WHERE user_id = ? AND month_year = ?`,
        [reqData.user_id, monthYear]
      );
      if (payrollRows.length > 0) {
        const newOvertimeHours = (parseFloat(payrollRows[0].overtime_hours) || 0) + overtimeHours;
        const newOvertimePay = (parseFloat(payrollRows[0].overtime_pay) || 0) + overtimePay;
        await connection.query(
          `UPDATE payroll 
           SET overtime_hours = ?, overtime_pay = ?, gross_pay = gross_pay + ?, net_pay = net_pay + ?
           WHERE id = ?`,
          [newOvertimeHours, newOvertimePay, overtimePay, overtimePay, payrollRows[0].id]
        );
      }
    }

    await connection.commit();
    
    const action = status === 'approved' ? 'APPROVE_OVERTIME' : 'REJECT_OVERTIME';
    logAction(req.user.id, action, 'overtime_request', id, req);
    res.json({ success: true, message: `Overtime successfully ${status}.` });
  } catch (err) {
    await connection.rollback();
    console.error("Overtime status update error:", err);
    res.status(500).json({ success: false, message: 'Server error while updating request.' });
  } finally {
    connection.release();
  }
});

// Payroll Calculations Helpers
function calculateHours(start, end) {
  const startDate = new Date(`1970-01-01T${start}`);
  const endDate = new Date(`1970-01-01T${end}`);
  const diffHours = (endDate - startDate) / 3600000;
  return diffHours > 0 ? diffHours : 0; // Prevent negative hours
}

async function hourlyRateFromUser(userId) {
  try {
    const [rows] = await db.promise().query(`SELECT monthly_salary, work_days_per_month FROM users WHERE id = ?`, [userId]);
    if (rows.length === 0) return 0;
    
    const salary = parseFloat(rows[0].monthly_salary) || 0;
    const workDays = parseFloat(rows[0].work_days_per_month) || 22;
    if (workDays === 0) return 0;
    
    const dailyRate = salary / workDays;
    return dailyRate / 8;
  } catch(e) {
    console.error("Hourly rate fetch error:", e);
    return 0;
  }
}

app.get('/api/overtime-requests/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }
  db.query(`
    SELECT o.*, u.full_name, u.employee_id
    FROM overtime_requests o
    JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load overtime data.' });
    res.json(rows || []);
  });
});

app.get('/api/attendance/corrections/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }
  db.query(
    `SELECT c.*, DATE_FORMAT(c.attendance_date, '%Y-%m-%d') AS attendance_date, u.full_name, u.employee_id
     FROM attendance_corrections c
     JOIN users u ON c.user_id = u.id  
     WHERE c.status = 'pending'
     ORDER BY c.id DESC`,
    (err, rows) => {
      if (err) {
        console.error("Pending corrections error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load attendance corrections.' });
      }
      res.json(rows || []);
    }
  );
});

app.get('/api/schedule-requests/user/:employeeId', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  db.query(
    `SELECT * FROM schedule_change_requests WHERE user_id = ? ORDER BY id DESC`,
    [employeeId],
    (err, results) => {
      if (err) {
        console.error("Schedule requests fetch error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load schedule requests.' });
      }
      res.json(results || []);
    }
  );
});

app.get('/api/leave-requests/grouped', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view leave requests.' });
  }
  db.query(
    `SELECT lr.id, lr.user_id, lr.request_date, lr.type, lr.reason, lr.status, lr.admin_remarks, lr.submitted_at,
            u.full_name, u.employee_id
     FROM leave_requests lr
     JOIN users u ON lr.user_id = u.employee_id
     WHERE lr.is_hidden = 0
     ORDER BY u.employee_id, lr.request_date ASC`,
    (err, rows) => {
      if (err) {
        console.error("Grouped leave requests fetch error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load grouped leave requests.' });
      }
      
      const grouped = [];
      let currentGroup = null;
      
      rows.forEach(row => {
        const date = row.request_date;
        if (!currentGroup ||
            currentGroup.user_id !== row.user_id ||
            currentGroup.type !== row.type ||
            currentGroup.reason !== row.reason) {
          currentGroup = {
            ids: [row.id],
            user_id: row.user_id,
            full_name: row.full_name,
            employee_id: row.employee_id,
            type: row.type,
            reason: row.reason,
            status: row.status,
            start_date: date,
            end_date: date,
            admin_remarks: row.admin_remarks,
            submitted_at: row.submitted_at,
            request_count: 1
          };
          grouped.push(currentGroup);
        } else {
          const lastDate = new Date(currentGroup.end_date);
          const currentDate = new Date(date);
          const diffDays = (currentDate - lastDate) / (1000 * 60 * 60 * 24);
          
          if (diffDays === 1) {
            currentGroup.ids.push(row.id);
            currentGroup.end_date = date;
            currentGroup.request_count++;
          } else {
            currentGroup = {
              ids: [row.id],
              user_id: row.user_id,
              full_name: row.full_name,
              employee_id: row.employee_id,
              type: row.type,
              reason: row.reason,
              status: row.status,
              start_date: date,
              end_date: date,
              admin_remarks: row.admin_remarks,
              submitted_at: row.submitted_at,
              request_count: 1
            };
            grouped.push(currentGroup);
          }
        }
      });
      res.json(grouped);
    }
  );
});

app.put('/api/leave-requests/batch-status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  
  const { ids, status, admin_remarks } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'No requests selected for batch update.' });
  }
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status provided.' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    for (const reqId of ids) {
      const [leaveRows] = await connection.query(`SELECT user_id, request_date, type FROM leave_requests WHERE id = ?`, [reqId]);
      if (leaveRows.length === 0) continue;
      
      const { user_id: employee_id, request_date, type } = leaveRows[0];
      
      // FIX: Get the INT ID for the employee_leave_balances table
      const [userRows] = await connection.query("SELECT id FROM users WHERE employee_id = ?", [employee_id]);
      if (userRows.length === 0) {
        throw new Error(`User account not found for employee ${employee_id}.`);
      }
      const internalUserId = userRows[0].id;

      await connection.query(
        `UPDATE leave_requests SET status = ?, admin_remarks = ?, reviewed_at = NOW() WHERE id = ?`, 
        [status, admin_remarks || null, reqId]
      );

      if (status === 'Approved') {
        const leaveYear = new Date(request_date).getFullYear();
        const [typeRows] = await connection.query(`SELECT id FROM leave_types WHERE name = ?`, [type]);
        
        if (typeRows.length > 0) {
          const leaveTypeId = typeRows[0].id;
          
          // Use internalUserId (INT) for the balance lookup and lock the row to prevent race conditions
          const [balanceRows] = await connection.query(
            `SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ? FOR UPDATE`,
            [internalUserId, leaveTypeId, leaveYear]
          );
          
          if (balanceRows.length > 0 && balanceRows[0].remaining_days >= 1) {
            const newBalance = balanceRows[0].remaining_days - 1;
            await connection.query(
              `UPDATE employee_leave_balances SET remaining_days = ?, last_updated = CURDATE() WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
              [newBalance, internalUserId, leaveTypeId, leaveYear]
            );
          } else {
            // Throwing here triggers the transaction rollback safely
            throw new Error(`Insufficient ${type} balance for ${employee_id} to approve all selected days.`);
          }
        } else {
            throw new Error(`Invalid leave type: ${type}`);
        }

        await connection.query(
          `INSERT INTO attendance (user_id, date, status, location) VALUES (?, ?, 'on leave', 'Remote/Leave') ON DUPLICATE KEY UPDATE status = 'on leave'`,
          [employee_id, request_date] // Uses employee_id (VARCHAR) for the attendance table
        );
      }
    }
    
    await connection.commit();
    
    // Log the batch action securely
    logAction(req.user.id, `BATCH_${status.toUpperCase()}_LEAVE`, 'leave_request', `Batch IDs: ${ids.join(',')}`, req);
    
    res.json({ success: true, message: `Successfully ${status.toLowerCase()} ${ids.length} leave requests.` });
  } catch (err) {
    await connection.rollback();
    console.error("Batch Leave Update Error:", err);
    res.status(500).json({ success: false, message: err.message || "Database error during batch update." });
  } finally {
    connection.release();
  }
});


// ============================================
// WEBSOCKET SERVER & SERVER INITIALIZATION
// ============================================


app.use((err, req, res, next) => {
  if (err) {
    console.error("Middleware Error:", err.message);
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
});

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
  
  if (!token) {
    return ws.close(4001, 'Authentication token missing');
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    
    db.query("SELECT id, email, role FROM users WHERE id = ? AND status = 'active'", [userId], (err, rows) => {
      if (err || rows.length === 0) {
        return ws.close(4001, 'User not found or inactive');
      }
      
      const user = rows[0];
      ws.user = user;
      wsClients.set(user.id, ws);
      
      ws.on('message', (data) => {
        let msgData;
        try { 
          msgData = JSON.parse(data); 
        } catch (e) { 
          return; 
        }
        
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
            
            const messageObj = { 
              id: result.insertId, 
              room_id: roomId, 
              user_id: user.id, 
              full_name: user.email, 
              message: content.trim(), 
              sent_at: new Date().toISOString() 
            };
            
            if (roomName && roomName.startsWith('dm_')) {
              const participantIds = roomName.split('_').slice(1).map(Number);
              participantIds.forEach(pid => {
                const client = wsClients.get(pid);
                if (client && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'new_message', message: messageObj }));
                }
              });
            } else {
              wss.clients.forEach(client => { 
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({ type: 'new_message', message: messageObj })); 
                }
              });
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
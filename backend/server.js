require('dotenv').config();
const express = require('express');

//const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./db');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
//const fs = require('fs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const WebSocket = require('ws');
const url = require('url');

const app = express();
app.set('trust proxy', 1);
const fs = require('fs');
const visitorDestinations = {};
const recentAlertsCache = new Set();

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

// Ensure directory exists locally
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
  secure: true, // Use SSL/TLS
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

// Helper to log visitor history (place after db connection)
function logVisitorHistory(visitorId, visitorName, bleId, floor, currentRoom, eventType, x = null, y = null) {
  // If visitorId is the bleId (string), we might want to look up the real DB ID
  const sql = `INSERT INTO visitor_history 
    (visitor_id, visitor_name, ble_id, floor, current_room, event_type, x, y, timestamp) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`;
    
  db.query(sql, [visitorId, visitorName, bleId, floor, currentRoom, eventType, x, y], (err) => {
    if (err) console.error('Failed to log visitor history:', err);
  });
}

function logAction(userId, action, targetType, targetId, req) {
  if (!userId) return;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;
  const sql = `INSERT INTO audit_logs (user_id, action, target_type, target_id, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?)`;
  db.query(sql, [userId, action, targetType, targetId, ip, userAgent], (err) => {
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
// MULTER SETUP
// --------------------------------------------------
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
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

const resumeDir = path.join(__dirname, 'uploads', 'resumes');
if (!fs.existsSync(resumeDir)) fs.mkdirSync(resumeDir, { recursive: true });
const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumeDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `resume_${unique}${path.extname(file.originalname)}`);
  }
});
const uploadResume = multer({ storage: resumeStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// Custom storage for selfies – adds .jpg extension
const selfieStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/selfies/');
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, unique + '.jpg');   // ✅ add .jpg extension
  }
});
const multerSelfie = multer({ storage: selfieStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const multerCorrection = multer({ dest: 'uploads/corrections/', limits: { fileSize: 5 * 1024 * 1024 } });

const appealUploadDir = path.join(__dirname, 'uploads', 'attendance_appeals');
if (!fs.existsSync(appealUploadDir)) fs.mkdirSync(appealUploadDir, { recursive: true });
const appealStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, appealUploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `appeal_${unique}${path.extname(file.originalname)}`);
  }
});
const uploadAppeal = multer({ storage: appealStorage, limits: { fileSize: 5 * 1024 * 1024 } });


// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------
const allowedOrigins = [
  'https://univita.site',
  'http://localhost:3000',
  'http://localhost:8081',
  'https://univitahct.netlify.app' // This is the default Expo/React Native port
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
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
// 1. AUTHENTICATION & OTP (FIXED)
// ============================================

// Send OTP for login (callback version – matches original working code)
app.post('/api/auth/send-otp', otpLimiter, (req, res) => {
  console.log("✅ OTP request received for:", req.body.email);
  const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  db.query("SELECT * FROM users WHERE email = ? AND status = 'active'", [email], (err, results) => {
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

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Your OTP Code - UniVITA',
      text: `Your OTP code is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`
    };
    /*transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error('OTP email error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
      }
      res.json({ success: true, message: 'OTP sent to your email.' });
    });*/
    res.json({ success: true, message: 'DEV MODE: Check Railway logs for OTP code.' });
  });
});

// Verify OTP and issue JWT (callback version)
app.post('/api/auth/verify-otp', (req, res) => {
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
        biometric_enabled: user.biometric_enabled || false
      }
    });
  });
});

// Forgot password – send OTP
app.post('/api/auth/forgot-password', async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  db.query("SELECT id FROM users WHERE email = ? AND status = 'active'", [email], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (results.length === 0) return res.status(404).json({ success: false, message: 'No active account with that email.' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    OTP_STORE[email] = { otp, expiresAt };
    console.log(`[PASSWORD RESET OTP] ${email} → ${otp}`);

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: 'Password Reset OTP - UniVITA',
      text: `Your password reset OTP is: ${otp}\n\nThis code expires in 5 minutes.\n\nIf you did not request this, please ignore this email.`
    };
    /*transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error('Reset OTP email error:', error);
        return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
      }
      res.json({ success: true, message: 'OTP sent to your email.' });
    });*/
    res.json({ success: true, message: 'DEV MODE: Check Railway logs for OTP code.' });
  });
});

// Reset password – verify OTP and update password
app.post('/api/auth/reset-password', async (req, res) => {
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

  const updateSql = "UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE email = ?";
  db.query(updateSql, [newPassword, email], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Password reset successfully.' });
  });
});

// Initial login (returns requiresOtp flag)
app.post('/api/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  db.query("SELECT * FROM users WHERE email = ? AND password = ? AND status = 'active'", [email, password], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.json({ success: false, message: 'Invalid email or password' });

    const user = results[0];
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

app.put('/api/users/:identifier/update-password', (req, res) => {
  const { identifier } = req.params;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: 'Missing fields' });

  db.query("SELECT * FROM users WHERE (id = ? OR employee_id = ?)", [identifier, identifier], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error" });
    if (results.length === 0) return res.status(404).json({ success: false, message: "User not found." });
    const user = results[0];
    if (user.password.trim() !== currentPassword.trim()) return res.status(401).json({ success: false, message: "Invalid current password." });
    db.query("UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE id = ?", [newPassword.trim(), user.id], (err) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: true });
    });
  });
});

app.put('/api/users/:id/reset-password', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { newPassword } = req.body;
  const userId = req.params.id;
  if (!newPassword || newPassword.trim().length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  db.query("UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE id = ?", [newPassword.trim(), userId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    logAction(req.user.id, 'ADMIN_RESET_PASSWORD', 'user', userId, req);
    res.json({ success: true, message: 'Password reset successfully.' });
  });
});

// ============================================
// 2. ATTENDANCE & CLOCKING (protected)
// ============================================
const getPHTime = () => {
  const now = new Date();
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
  const date = now.toLocaleDateString('en-CA', options);
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
  return { date, time };
};
app.post('/api/attendance/clock-in', authenticateToken, multerSelfie.single('selfie'), async (req, res) => {
  const { employee_id, latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;
  const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;

  if (!employee_id || !latitude || !longitude || !schedule_id) {
    return res.status(400).json({ success: false, message: 'Missing required fields (including schedule_id)' });
  }

  const { date: todayDate, time: currentTime } = getPHTime();

  try {
    // 1. Verify User
    const [userRows] = await db.promise().query(
      "SELECT employee_id, full_name FROM users WHERE id = ? AND employee_id = ? AND status = 'active'",
      [userId, employee_id]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'User mismatch or inactive' });

    // 2. Fetch specific schedule for verification
    const [schedRows] = await db.promise().query(
      "SELECT place, start_time FROM schedules WHERE id = ? AND user_id = ?",
      [schedule_id, employee_id]
    );
    if (schedRows.length === 0) return res.status(403).json({ success: false, message: 'No work schedule found' });
    const { place: schedulePlace, start_time: scheduledStartTime } = schedRows[0];

    // 3. Time Validation (Strictly prevents early clock-ins)
    const scheduledStart = new Date(`1970-01-01T${scheduledStartTime}`);
    const actualTime = new Date(`1970-01-01T${currentTime}`);
    const diffMinutes = (actualTime - scheduledStart) / 60000;

    // Allow clocking in up to 15 minutes before scheduled start time
if (diffMinutes < -15) {
  return res.status(403).json({
    success: false,
    message: `Too early to clock in. Allowed from ${-15} minutes before (${scheduledStartTime}).`
  });
}

    // 4. Geofence Verification
    const [locRows] = await db.promise().query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    if (locRows.length === 0) return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered` });
    const schoolGeo = locRows[0];
    const distance = getDistanceFromLatLonInMeters(parseFloat(latitude), parseFloat(longitude), schoolGeo.latitude, schoolGeo.longitude);
    if (distance > schoolGeo.radius) {
      return res.status(403).json({ success: false, message: `Not within ${schedulePlace} campus. Distance: ${Math.round(distance)}m` });
    }

    // 5. Check if already clocked in for this schedule
    const [existing] = await db.promise().query("SELECT id FROM attendance WHERE user_id = ? AND schedule_id = ?", [employee_id, schedule_id]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: 'Already clocked in for this schedule' });

    // 6. Determine Status
    const status = diffMinutes > 30 ? 'late' : 'present';

    // 7. Insert attendance and capture result
    const [result] = await db.promise().query(
      `INSERT INTO attendance 
        (user_id, schedule_id, date, time_in, status, clock_in_selfie,
         clock_in_latitude, clock_in_longitude, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, schedule_id, todayDate, currentTime, status,
       selfiePath, latitude, longitude,
       `${schedulePlace} (${parseFloat(latitude).toFixed(6)}, ${parseFloat(longitude).toFixed(6)})`]
    );

    // ✅ Audit log – result.insertId is now defined
    logAction(req.user.id, 'CLOCK_IN', 'attendance', result.insertId, req);

    res.json({ success: true, message: `Clocked in as ${status} at ${currentTime}` });
  } catch (err) {
    console.error("Clock-in error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// MANUALLY UPDATE ATTENDANCE (Admin/HR Only)
// ============================================
app.put('/api/attendance/update/:id', authenticateToken, async (req, res) => {
  // Only allow admins and HR to manually edit records
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const recordId = req.params.id;
  const { time_in, time_out, status, location } = req.body;

  try {
    // Validate ENUM status (present, late, absent, on leave)
    const validStatuses = ['present', 'late', 'absent', 'on leave'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const sql = `
      UPDATE attendance 
      SET time_in = ?, time_out = ?, status = ?, location = ?
      WHERE id = ?
    `;
    
    // Execute update
    db.query(sql, [time_in || null, time_out || null, status || null, location || null, recordId], (err, results) => {
      if (err) {
        console.error("Database error during attendance update:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }
      if (results.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Record not found" });
      }
      
      // Log the action for auditing
      logAction(req.user.id, 'MANUAL_UPDATE_ATTENDANCE', 'attendance', recordId, req);
      
      res.json({ success: true, message: "Attendance updated successfully" });
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/attendance/clock-out', authenticateToken, multerSelfie.single('selfie'), async (req, res) => {
  // Now expecting schedule_id from the mobile request body
  const { employee_id, latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;
  const selfiePath = req.file ? `/uploads/selfies/${req.file.filename}` : null;
  const { date: todayDate, time: currentTime } = getPHTime();

  if (!employee_id || !latitude || !longitude || !schedule_id) {
    return res.status(400).json({ success: false, message: 'Missing required fields (including schedule_id)' });
  }

  try {
    // 1. Verify User
    const [userRows] = await db.promise().query(
      "SELECT employee_id FROM users WHERE id = ? AND employee_id = ? AND status = 'active'",
      [userId, employee_id]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'User mismatch or inactive' });

    // 2. Fetch the specific schedule being clocked out of
    const [schedRows] = await db.promise().query(
      "SELECT place, end_time FROM schedules WHERE id = ? AND user_id = ?",
      [schedule_id, employee_id]
    );
    if (schedRows.length === 0) return res.status(403).json({ success: false, message: 'Schedule not found' });
    const { place: schedulePlace, end_time: scheduledEndTime } = schedRows[0];

    // 3. Geofence Verification
    const [locRows] = await db.promise().query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    if (locRows.length === 0) return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered` });
    const schoolGeo = locRows[0];
    const distance = getDistanceFromLatLonInMeters(parseFloat(latitude), parseFloat(longitude), schoolGeo.latitude, schoolGeo.longitude);
    if (distance > schoolGeo.radius) {
      return res.status(403).json({ success: false, message: `Not within ${schedulePlace} campus.` });
    }

    // 4. Find the specific attendance record for THIS schedule
    const [existing] = await db.promise().query(
      "SELECT id, time_in FROM attendance WHERE user_id = ? AND schedule_id = ? AND time_out IS NULL",
      [employee_id, schedule_id]
    );
    if (existing.length === 0) return res.status(400).json({ success: false, message: 'No active clock-in found for this schedule' });

    // 5. Shift Completion Check
    if (currentTime < scheduledEndTime) {
      return res.status(403).json({ success: false, message: `Shift incomplete. You must stay until ${scheduledEndTime} to clock out.` });
    }

    const timeIn = existing[0].time_in;
    const totalHours = (new Date(`1970-01-01T${currentTime}`) - new Date(`1970-01-01T${timeIn}`)) / 3600000;

    // 6. Update attendance record
    await db.promise().query(
  `UPDATE attendance SET 
    time_out = ?, 
    clock_out_selfie = ?, 
    clock_out_latitude = ?, 
    clock_out_longitude = ?, 
    location = ? 
   WHERE id = ?`,
  [currentTime, selfiePath, latitude, longitude, schedulePlace, existing[0].id]
);

    // 7. Reset global tracking flag
    await db.promise().query(
      "UPDATE users SET location_tracking_enabled = 0 WHERE employee_id = ?",
      [employee_id]
    );

    await broadcastInstructorStatus(employee_id);
    logAction(req.user.id, 'CLOCK_OUT', 'attendance', existing[0].id, req);

    res.json({ success: true, message: `Clocked out successfully for ${schedulePlace}` });
  } catch (err) {
    console.error("Clock-out error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/attendance/correction-request', authenticateToken, multerCorrection.single('selfie'), async (req, res) => {
  const { employee_id, date, type, time, reason } = req.body;
  const userId = req.user.id;
  const selfiePath = req.file ? `/uploads/corrections/${req.file.filename}` : null;

  if (!employee_id || !date || !type || !time || !reason) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

  // 1. Date validation
  const today = new Date().toISOString().split('T')[0];
  if (date > today) {
    return res.status(400).json({ success: false, message: "Cannot request correction for future dates." });
  }
  if (!isDateWithinAllowedRange(date)) {
    return res.status(400).json({ success: false, message: "Corrections are only allowed for the last 30 days." });
  }

  try {
    const [userRows] = await db.promise().query(
      "SELECT id, employee_id FROM users WHERE id = ? AND employee_id = ? AND status = 'active'",
      [userId, employee_id]
    );
    if (userRows.length === 0) return res.status(403).json({ success: false, message: 'Invalid user' });

    // 2. Schedule existence
    const schedule = await scheduleExistsForDate(employee_id, date);
    if (!schedule) {
      return res.status(400).json({ success: false, message: "No schedule found for this date. Correction not allowed." });
    }

    // 3. Duplicate check
    if (await hasExistingRequest(employee_id, date, 'correction')) {
      return res.status(409).json({ success: false, message: "You already have a pending or approved request for this date." });
    }

    // 4. Time bounds validation
    const requestedTime = time;
    if (type === 'clock_in') {
      if (requestedTime < schedule.start_time || requestedTime > schedule.end_time) {
        return res.status(400).json({ success: false, message: `Clock-in time must be between ${schedule.start_time} and ${schedule.end_time}.` });
      }
    } else if (type === 'clock_out') {
      // For clock-out, we need the existing clock-in time (if any)
      const [attRecord] = await db.promise().query(
        "SELECT time_in FROM attendance WHERE user_id = ? AND schedule_id = ?",
        [employee_id, schedule.id]
      );
      if (attRecord.length > 0 && attRecord[0].time_in) {
        if (requestedTime <= attRecord[0].time_in) {
          return res.status(400).json({ success: false, message: "Clock-out time must be after clock-in time." });
        }
      }
      if (requestedTime > schedule.end_time) {
        return res.status(400).json({ success: false, message: `Clock-out time cannot exceed shift end (${schedule.end_time}).` });
      }
    }

    await db.promise().query(
      `INSERT INTO attendance_corrections 
        (user_id, attendance_date, requested_clock_in, requested_clock_out, reason, selfie_url, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [employee_id, date, type === 'clock_in' ? time : null, type === 'clock_out' ? time : null, reason, selfiePath]
    );

    res.json({ success: true, message: 'Correction request submitted. HR will review.' });
  } catch (err) {
    console.error("Correction request error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/attendance/corrections/user/:employeeId', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  if (req.user.employee_id !== employeeId && req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(
    "SELECT id, attendance_date, requested_clock_in, requested_clock_out, reason, selfie_url, status, reviewed_at FROM attendance_corrections WHERE user_id = ? ORDER BY id DESC",
    [employeeId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
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
    const [corr] = await db.promise().query("SELECT * FROM attendance_corrections WHERE id = ?", [id]);
    if (corr.length === 0) return res.status(404).json({ error: 'Request not found' });

    await db.promise().query(
      "UPDATE attendance_corrections SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?",
      [status, req.user.id, id]
    );

    if (status === 'approved') {
      const record = corr[0];
      const [existing] = await db.promise().query(
        "SELECT id FROM attendance WHERE user_id = ? AND date = ?",
        [record.user_id, record.attendance_date]
      );
      if (existing.length === 0) {
        await db.promise().query(
          `INSERT INTO attendance (user_id, date, time_in, time_out, status, correction_requested, correction_status)
           VALUES (?, ?, ?, ?, 'present', 1, 'approved')`,
          [record.user_id, record.attendance_date, record.requested_clock_in, record.requested_clock_out]
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
      logAction(req.user.id, 'APPROVE_CORRECTION', 'attendance_correction', id, req);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// 3. ATTENDANCE APPEALS (protected)
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
  const { date, reason, time_in, time_out } = req.body; // added optional time_in, time_out
  const userId = req.user.id;

  // 1. Date validation
  const today = new Date().toISOString().split('T')[0];
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

    // 2. Schedule existence check
    const schedule = await scheduleExistsForDate(employee_id, date);
    if (!schedule) {
      return res.status(400).json({ success: false, error: "No schedule found for this date. Cannot submit appeal." });
    }

    // 3. Duplicate check
    if (await hasExistingRequest(employee_id, date, 'appeal')) {
      return res.status(409).json({ success: false, error: "You already have a pending or approved request for this date." });
    }

    const image_url = req.file ? `/uploads/attendance_appeals/${req.file.filename}` : null;

    // Store optional time_in/time_out (if not provided, will be NULL)
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

    // Get schedule times as fallback
    const schedule = await scheduleExistsForDate(user_id, date);
    let start_time = requested_time_in || (schedule ? schedule.start_time : null);
    let end_time = requested_time_out || (schedule ? schedule.end_time : null);
    let total_hours = 0;
    if (start_time && end_time) {
      total_hours = (new Date(`1970-01-01T${end_time}`) - new Date(`1970-01-01T${start_time}`)) / 3600000;
    }

    // Update appeal status
    await db.promise().query(
      "UPDATE attendance_appeals SET status = ?, admin_remarks = ? WHERE id = ?",
      [status, admin_remarks || null, appealId]
    );
    const action = status === 'approved' ? 'APPROVE_APPEAL' : 'REJECT_APPEAL';
    logAction(req.user.id, action, 'attendance_appeal', appealId, req);

    if (status === 'approved') {
      // Check if attendance already exists for that date
      const [existingAtt] = await db.promise().query(
        "SELECT id FROM attendance WHERE user_id = ? AND date = ?",
        [user_id, date]
      );
      if (existingAtt.length > 0) {
        // If attendance exists, update it with the approved times (overwrite)
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
// 4. LEAVE REQUESTS (protected)
// ============================================
app.post('/api/leave-requests', authenticateToken, upload.single('image'), async (req, res) => {
  const { request_date, reason, type } = req.body;
  const userId = req.user.id;
  const leaveYear = new Date(request_date).getFullYear();

  try {
    const [userRows] = await db.promise().query("SELECT employee_id FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, error: "User not found" });
    const employee_id = userRows[0].employee_id;

    const [typeRows] = await db.promise().query("SELECT id FROM leave_types WHERE name = ?", [type]);
    if (typeRows.length === 0) return res.status(400).json({ success: false, error: "Invalid leave type" });
    const leaveTypeId = typeRows[0].id;

    const [balanceRows] = await db.promise().query(
      `SELECT remaining_days FROM employee_leave_balances WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
      [userId, leaveTypeId, leaveYear]
    );
    if (balanceRows.length === 0 || balanceRows[0].remaining_days < 1) {
      return res.status(400).json({ success: false, error: `Insufficient ${type} balance for ${leaveYear}. Please contact HR.` });
    }

    const image_url = req.file ? `/uploads/leave_images/${req.file.filename}` : null;
    await db.promise().query(
      `INSERT INTO leave_requests (user_id, request_date, reason, type, image_url, status) VALUES (?, ?, ?, ?, ?, 'Pending')`,
      [employee_id, request_date, reason, type, image_url]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Leave request error:", err);
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
    `SELECT lr.*, DATE_FORMAT(lr.request_date, '%Y-%m-%d') as formatted_date FROM leave_requests lr JOIN users u ON (lr.user_id = u.employee_id OR lr.user_id = u.id) WHERE (u.employee_id = ? OR u.id = ?) AND lr.status IN ('Approved', 'Rejected') AND lr.is_hidden = 0 ORDER BY lr.request_date DESC`,
    [identifier, identifier],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      res.json(results);
    }
  );
});

app.get('/api/leave-requests/user/:employeeId', authenticateToken, (req, res) => {
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

    await connection.query(`UPDATE leave_requests SET status = ? WHERE id = ?`, [status, requestId]);

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

// Leave balances
app.get('/api/leave-types', (req, res) => {
  db.query("SELECT * FROM leave_types WHERE is_active = 1", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/leave-balances/:userId', async (req, res) => {
  const userId = req.params.userId;
  const year = req.query.year || new Date().getFullYear();
  db.query(
    `SELECT lt.name as leave_type, eb.remaining_days, lt.annual_quota FROM employee_leave_balances eb JOIN leave_types lt ON eb.leave_type_id = lt.id WHERE eb.user_id = ? AND eb.year = ?`,
    [userId, year],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results || []);
    }
  );
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
    FROM leave_requests lr JOIN users u ON (lr.user_id = u.employee_id OR lr.user_id = u.id) WHERE lr.is_hidden = 0
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
// 6. SCHEDULES
// ============================================
app.get('/api/schedules', (req, res) => {
  const sql = `
    SELECT 
      u.full_name, 
      u.employee_id, 
      s.id AS schedule_id, 
      DATE_FORMAT(s.date, '%Y-%m-%d') AS schedule_date, 
      s.place, 
      s.course, 
      s.start_time, 
      s.end_time,
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
      u.full_name, 
      u.employee_id, 
      NULL AS schedule_id, 
      DATE_FORMAT(a.date, '%Y-%m-%d') AS schedule_date, 
      'Remote/Leave' AS place, 
      'On Leave' AS course, 
      '00:00:00' AS start_time, 
      '00:00:00' AS end_time, 
      'COMPLETED' AS attendance_status
    FROM users u 
    JOIN attendance a ON u.employee_id = a.user_id 
    WHERE a.status = 'on leave' 
      AND LOWER(u.role) = 'instructor'
    ORDER BY schedule_date DESC, full_name ASC
  `;
  
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

app.get('/api/schedules/:employeeId', (req, res) => {
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

// POST /api/schedules – Create a new schedule (authenticated, admin/hr only)
app.post('/api/schedules', authenticateToken, async (req, res) => {
  // Only admin or hr_admin can create schedules
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { user_id, date, place, course, start_time, end_time } = req.body;
  const { date: today } = getPHTime();

  if (date < today) {
    return res.status(400).json({ success: false, error: 'Cannot create schedule for a past date.' });
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
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, error: err.message });
      }
      // ✅ Log the action – req.user.id is now available
      logAction(req.user.id, 'CREATE_SCHEDULE', 'schedule', result.insertId, req);
      res.json({ success: true });
    }
  );
});
// --- UPDATED PUT (Update Schedule) ---
app.put('/api/schedules/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const { date, place, course, start_time, end_time } = req.body;
  const scheduleId = req.params.id;
  const { date: today } = getPHTime();

  // 1. Check if schedule has existing attendance
  const [attRows] = await db.promise().query(
    "SELECT id FROM attendance WHERE schedule_id = ?",
    [scheduleId]
  );
  if (attRows.length > 0) {
    return res.status(403).json({ success: false, error: "Cannot modify this schedule; attendance has already been recorded." });
  }

  // 2. Existing validation logic
  if (date < today) return res.status(400).json({ success: false, error: "Cannot update schedule to a past date." });
  if (place) {
    const [locRows] = await db.promise().query("SELECT id FROM school_locations WHERE name = ?", [place]);
    if (locRows.length === 0) return res.status(400).json({ success: false, error: "Invalid location." });
  }
  if (start_time >= end_time) return res.status(400).json({ success: false, error: "End time must be after start time." });

  const [old] = await db.promise().query("SELECT user_id FROM schedules WHERE id = ?", [scheduleId]);
  if (old.length === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
  
  const user_id = old[0].user_id;
  if (await hasScheduleConflict(user_id, date, start_time, end_time, scheduleId)) {
    return res.status(409).json({ success: false, error: "Time conflict." });
  }

  db.query("UPDATE schedules SET date=?, place=?, course=?, start_time=?, end_time=? WHERE id=?", 
    [date, place, course, start_time, end_time, scheduleId], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      logAction(req.user.id, 'UPDATE_SCHEDULE', 'schedule', scheduleId, req);
      res.json({ success: true });
    }
  );
});

// --- UPDATED DELETE (Delete Schedule) ---
app.delete('/api/schedules/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }
  const scheduleId = req.params.id;

  // 1. Check if schedule has existing attendance
  const [attRows] = await db.promise().query(
    "SELECT id FROM attendance WHERE schedule_id = ?",
    [scheduleId]
  );
  if (attRows.length > 0) {
    return res.status(403).json({ success: false, error: "Cannot delete this schedule; attendance has already been recorded." });
  }

  db.query("DELETE FROM schedules WHERE id = ?", [scheduleId], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, error: "Schedule not found" });
    logAction(req.user.id, 'DELETE_SCHEDULE', 'schedule', scheduleId, req);
    res.json({ success: true });
  });
});

// ============================================
// SCHEDULE REQUESTS (with case-insensitive status)
// ============================================

// ============================================
// SCHEDULE REQUESTS (case‑insensitive)
// ============================================

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
      (err, result) => {   // ✅ added `result` parameter
        if (err) return res.status(500).json({ success: false, error: err.message });
        // ✅ result.insertId is now available
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
    db.query("UPDATE schedule_change_requests SET status = ?, admin_remarks = ? WHERE id = ?", [newStatus, admin_remarks || null, requestId], async (err) => {
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

// Employee documents (HR only)
app.post('/api/employee-documents', authenticateToken, upload.single('file'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { user_id, title } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = `/uploads/documents/${req.file.filename}`;
  db.query("SELECT employee_id FROM users WHERE id = ?", [user_id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const employeeId = rows[0].employee_id;
    db.query("INSERT INTO employee_documents (user_id, employee_id, title, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)",
      [user_id, employeeId, title, filePath, req.user.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logAction(req.user.id, 'UPLOAD_DOCUMENT', 'employee_document', result.insertId, req);
        res.json({ success: true });
      });
  });
});

app.get('/api/employee-documents/:userId', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT * FROM employee_documents WHERE user_id = ? ORDER BY uploaded_at DESC", [req.params.userId], (err, docs) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(docs);
  });
});
// ============================================
// 6. REPORTS & EMPLOYEES
// ============================================

// ============================================
// ADD THESE MISSING ENDPOINTS
// ============================================

// Alias for attendance history (mobile uses /api/attendance/user/:employeeId)
app.get('/api/attendance/user/:employeeId', (req, res) => {
  const employeeId = req.params.employeeId;
  const sql = "SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as date, ROUND(TIMESTAMPDIFF(MINUTE, time_in, time_out) / 60, 2) as total_hours FROM attendance WHERE user_id = ? ORDER BY date DESC";
  db.query(sql, [employeeId], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result || []);
  });
});

// Payroll employee history (mobile expects /api/payroll/employee-history/:employeeId)
app.get('/api/payroll/employee-history/:employeeId', (req, res) => {
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
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Admin resets another user's password (does not require old password)
app.put('/api/users/:id/reset-password', (req, res) => {
  const { newPassword } = req.body;
  const userId = req.params.id;

  if (!newPassword || newPassword.trim().length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  const sql = 'UPDATE users SET password = ?, password_last_changed = CURRENT_DATE WHERE id = ?';
  db.query(sql, [newPassword.trim(), userId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: 'Password reset successfully.' });
  });
});
app.get('/api/employees', (req, res) => {
  db.query("SELECT * FROM users ORDER BY full_name ASC", (err, result) => {
    if (err) return res.status(500).json(err);
    res.json(result || []);
  });
});

app.post('/api/employees', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
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

  if (!employee_id || !full_name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }

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
     street_address, city, state_province, postal_code, country, additional_info, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(sql, [
    employee_id, full_name, first_name || null, last_name || null, email, password, role,
    employment_type, position_level, contract_type,
    monthly_salary, work_days_per_month,
    finalAccess, finalPin,
    middle_initial || null, date_of_joining || null, account_expiration_date || null,
    date_of_birth || null, phone_number || null, gender || null,
    emergency_contact_name || null, emergency_contact_phone || null,
    street_address || null, city || null, state_province || null,
    postal_code || null, country || 'Philippines', additional_info || null, position || null
  ], (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    logAction(req.user.id, 'CREATE_EMPLOYEE', 'user', result.insertId, req);
    res.json({ success: true, message: 'Employee created successfully', employeeId: employee_id });
  });
});

app.put('/api/employees/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const employeeId = req.params.id;
  const updates = req.body;

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

  if (setClauses.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

  values.push(employeeId);
  const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;

  db.query(sql, values, (err, result) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, error: 'Employee not found.' });
    logAction(req.user.id, 'UPDATE_EMPLOYEE', 'user', employeeId, req);
    res.json({ success: true });
  });
});

// Get the last employee ID (e.g., "E008")
app.get('/api/employees/last-id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query("SELECT employee_id FROM users WHERE employee_id REGEXP '^E[0-9]+$' ORDER BY id DESC LIMIT 1", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const lastId = results.length ? results[0].employee_id : 'E000';
    res.json({ lastId });
  });
});


// Delete employee (admin only, protected)
app.delete('/api/employees/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const userId = req.params.id;
  // Removed "AND LOWER(role) = 'instructor'" to allow deleting any role
  db.query("DELETE FROM users WHERE id = ?", [userId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Employee not found." });
    
    logAction(req.user.id, 'DELETE_EMPLOYEE', 'user', userId, req);
    res.json({ success: true });
  });
});

app.put('/api/employees/:employeeId/toggle-status', (req, res) => {
    const { employeeId } = req.params;
    db.query("SELECT status FROM users WHERE employee_id = ?", [employeeId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ success: false });
        const newStatus = results[0].status === 'active' ? 'deactivated' : 'active';
        db.query("UPDATE users SET status = ? WHERE employee_id = ?", [newStatus, employeeId], (err) => {
            if (err) return res.status(500).json({ success: false });
            logAction(req.user.id, 'TOGGLE_EMPLOYEE_STATUS', 'user', employeeId, req);
            res.json({ success: true, newStatus });
        });
    });
});

app.get('/api/attendance-report', (req, res) => {
    const { date } = req.query;
    
    // Explicitly selecting all columns needed for the details modal
    const sql = `
        SELECT 
            u.id AS user_db_id,
            u.full_name, 
            u.employee_id, 
            COALESCE(a.status, 'Pending') AS status, 
            COALESCE(a.time_in, '--:--') AS time_in, 
            COALESCE(a.time_out, '--:--') AS time_out, 
            a.location, 
            a.clock_in_latitude,
            a.clock_in_longitude,
            a.clock_out_latitude,
            a.clock_out_longitude,
            a.clock_in_selfie,
            a.clock_out_selfie,
            s.id AS schedule_id,
            s.start_time AS scheduled_start, 
            s.end_time AS scheduled_end,
            s.course,
            DATE_FORMAT(s.date, '%Y-%m-%d') AS attendance_date, 
            COALESCE(ROUND(TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60, 2), 0) AS total_hours
        FROM users u
        INNER JOIN schedules s ON u.employee_id = s.user_id 
        LEFT JOIN attendance a ON s.id = a.schedule_id
        WHERE LOWER(u.role) = 'instructor' 
          AND u.status = 'active'
          AND DATE(s.date) = DATE(?)
        ORDER BY u.full_name ASC, s.start_time ASC
    `;

    db.query(sql, [date], (err, result) => {
        if (err) {
            console.error("Attendance Report SQL Error:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(result || []);
    });
});

app.get('/api/attendance-report-user/:employeeId', (req, res) => {
    const sql = "SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as date, ROUND(TIMESTAMPDIFF(MINUTE, time_in, time_out) / 60, 2) as total_hours FROM attendance WHERE user_id = ? ORDER BY date DESC";
    db.query(sql, [req.params.employeeId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result || []);
    });
});

// ============================================
// 7. APPOINTMENTS & VISITOR MANAGEMENT
// ============================================

app.get('/api/appointments/:id/visitors', (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM appointment_visitors WHERE appointment_id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.get('/api/ble-tags', (req, res) => {
  db.query("SELECT * FROM ble_tags ORDER BY label", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/ble-tags', authenticateToken, async (req, res) => {
  // 1. Role Authorization
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { ble_id, label, mac_address } = req.body;

  // 2. Input Validation
  if (!ble_id) return res.status(400).json({ error: "BLE ID is required." });
  if (!mac_address) return res.status(400).json({ error: "MAC address is required." });

  try {
    // 3. Pre-check for duplicate BLE ID or MAC Address
    // Checking both ensures data integrity beyond just the database constraint
    const [existing] = await db.promise().query(
      "SELECT id FROM ble_tags WHERE ble_id = ? OR mac_address = ?", 
      [ble_id, mac_address]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: "A tag with this BLE ID or MAC address already exists." });
    }

    // 4. Insert new tag
    const [result] = await db.promise().query(
      "INSERT INTO ble_tags (ble_id, label, mac_address) VALUES (?, ?, ?)",
      [ble_id.trim(), label ? label.trim() : '', mac_address.trim()]
    );

    // 5. Log action
    logAction(req.user.id, 'CREATE_BLE_TAG', 'ble_tag', result.insertId, req);

    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    console.error("BLE Tag creation error:", err);
    res.status(500).json({ error: "Internal server error while saving tag." });
  }
});

app.delete('/api/ble-tags/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  db.query("DELETE FROM ble_tags WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: "Tag not found." });
    logAction(req.user.id, 'DELETE_BLE_TAG', 'ble_tag', id, req);
    res.json({ success: true });
  });
});

app.get('/api/ble-tags/in-use', (req, res) => {
  db.query(
    "SELECT DISTINCT ble_id FROM visitor_requests WHERE arrived = true AND returned = false AND no_show = false AND ble_id IS NOT NULL",
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results.map(r => r.ble_id));
    }
  );
});
// Mark a visitor as returned (free the BLE tag)
app.put('/api/visitor-requests/:id/return', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Get the BLE tag before clearing
  db.query("SELECT ble_id FROM visitor_requests WHERE id = ?", [id], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length === 0) return res.status(404).json({ error: "Request not found" });
    
    const ble_id = rows[0].ble_id;
    
    // If tag exists, remove from live tracking maps
    if (ble_id) {
      delete visitorDestinations[ble_id];   // 🔓 Remove the lock
      delete liveVisitors[ble_id];          // Remove from map
      console.log(`🔓 Cleared destination lock for ${ble_id}`);
    }

    // Update database: copy ble_id to used_ble_id, then clear ble_id, mark returned
    db.query(
      `UPDATE visitor_requests 
       SET returned = TRUE, returned_at = NOW(), 
           used_ble_id = ?, ble_id = NULL 
       WHERE id = ? AND arrived = TRUE AND returned = FALSE`,
      [ble_id, id],
      (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        if (result.affectedRows === 0) {
          return res.status(400).json({ error: "Visitor not checked in or already returned" });
        }
        logAction(req.user.id, 'VISITOR_RETURN', 'visitor_request', id, req);
        res.json({ success: true });
      }
    );
  });
});

// Manually update live visitor data (called from TodayVisitors after check‑in)
app.post('/api/update-live-visitor', authenticateToken, (req, res) => {
  const { bleId, name, destination, floor, currentRoom } = req.body;
  if (!bleId) return res.status(400).json({ error: 'BLE ID required' });

  if (liveVisitors[bleId]) {
    // Update existing entry
    liveVisitors[bleId].name = name;
    liveVisitors[bleId].destination = destination;
    liveVisitors[bleId].floor = floor;
    liveVisitors[bleId].currentRoom = currentRoom || destination;
    liveVisitors[bleId].lastSeen = Date.now();
  } else {
    // Create new entry
    liveVisitors[bleId] = {
      id: bleId,
      name: name || 'Visitor',
      bleId: bleId,
      floor: floor || '3',
      currentRoom: currentRoom || destination || 'Unknown',
      destination: destination || 'Unknown',
      lastSeen: Date.now()
    };
  }
  console.log(`Live visitor updated: ${bleId} → destination: ${destination}`);
  res.json({ success: true });
});

app.post('/api/appointments/book', (req, res) => {
  const { firstName, lastName, email, phone, date, time, reason, primaryBleId, additionalVisitors } = req.body;
  const { date: today } = getPHTime();
  
  // Prevent past dates
  if (date < today) {
    return res.status(400).json({ success: false, error: "Cannot book appointments for past dates." });
  }

  // Always PENDING – admin must approve
  const appointmentStatus = 'PENDING';

  const sql = `INSERT INTO visitor_requests 
    (first_name, last_name, email, phone, visit_date, visit_time, reason, ble_id, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(sql, [firstName, lastName, email, phone, date, time, reason, primaryBleId || null, appointmentStatus], (err, result) => {
    if (err) {
      console.error("DB insert error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }

    const appointmentId = result.insertId;

    // Insert additional visitors (companions) if any
    if (additionalVisitors && additionalVisitors.length > 0) {
      const visSql = "INSERT INTO appointment_visitors (appointment_id, visitor_name, ble_id) VALUES ?";
      const values = additionalVisitors.map(v => [appointmentId, v.name, v.bleId || null]);
      db.query(visSql, [values], (err2) => {
        if (err2) console.error("Error inserting additional visitors:", err2);
      });
    }

    // Email subject & body – now always "pending" style
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

    const mailOptions = {
      from: process.env.MAIL_USER,
      to: email,
      subject: subject,
      text: emailBody
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Email error:", error);
        return res.json({ success: true, emailSent: false, message: "Request saved but email failed." });
      }
      res.json({ success: true, emailSent: true });
    });
  });
});

app.put('/api/appointments/:id/status', (req, res) => {
  const { status, adminNotes, adminId } = req.body;
  const requestId = req.params.id;
  db.query("SELECT * FROM visitor_requests WHERE id = ?", [requestId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: "Request not found" });
    const request = results[0];
    const { first_name, last_name, email, visit_date, visit_time, reason, phone, ble_id } = request;
    db.query("UPDATE visitor_requests SET status = ?, admin_notes = ?, processed_by = ?, processed_at = NOW() WHERE id = ?", [status, adminNotes || null, adminId, requestId], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      const action = status === 'APPROVED' ? 'APPROVE_APPOINTMENT' : 'REJECT_APPOINTMENT';
        logAction(adminId, action, 'visitor_request', requestId, req);
      db.query("SELECT * FROM appointment_visitors WHERE appointment_id = ?", [requestId], (err, visitors) => {
        if (err) visitors = [];
        const isApproved = status === 'APPROVED';
        const subject = isApproved ? "Visit Request Approved - HCT Academy" : "Visit Request Status Update - HCT Academy";
        let emailBody = `Dear ${first_name} ${last_name},\n\n`;
        if (isApproved) emailBody += "Your visit request has been APPROVED.\n\nWe look forward to welcoming you to HCT Academy.\n\n";
        else { emailBody += "We regret to inform you that your visit request has been DECLINED.\n\n"; if (adminNotes) emailBody += `Reason: ${adminNotes}\n\n`; }
        emailBody += `Details:\nDate: ${visit_date}\nTime: ${visit_time}\nReason: ${reason}\n`;
        if (phone) emailBody += `Phone: ${phone}\n`;
        if (ble_id) emailBody += `Primary BLE Tag: ${ble_id}\n`;
        if (visitors && visitors.length > 0) {
          emailBody += "\nAdditional Visitors / BLE Tags:\n";
          visitors.forEach((v, i) => { emailBody += `  ${i+1}. ${v.visitor_name} – BLE Tag: ${v.ble_id || 'None assigned'}\n`; });
          emailBody += "\nPlease remind your companions to bring their assigned BLE tags. They will be used for tracking inside the building.\n";
        }
        emailBody += "\nThank you for your understanding.\n\nBest regards,\nHCT Academy";
        const mailOptions = { from: process.env.MAIL_USER, to: email, subject: subject, text: emailBody };
        transporter.sendMail(mailOptions, (error) => {
          if (error) { console.error("Email error:", error); return res.json({ success: true, emailSent: false, message: "Status updated but email failed." }); }
          res.json({ success: true, emailSent: true });
        });
      });
    });
  });
});

// PUT /api/appointments/:id – update visit_date and/or visit_time
app.put('/api/appointments/:id', authenticateToken, (req, res) => {
  // Only admin and security can edit appointments (adjust roles as needed)
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  const { visit_date, visit_time } = req.body;
  if (!visit_date || !visit_time) {
    return res.status(400).json({ error: 'Date and time are required' });
  }
  const sql = `UPDATE visitor_requests SET visit_date = ?, visit_time = ? WHERE id = ?`;
  db.query(sql, [visit_date, visit_time, id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Appointment not found' });
    logAction(req.user.id, 'UPDATE_APPOINTMENT', 'visitor_request', id, req);
    res.json({ success: true });
  });
});

app.get('/api/appointments/pending', (req, res) => {
  db.query("SELECT * FROM visitor_requests WHERE status = 'PENDING'", (err, results) => {
    if (err) return res.status(500).json(err);
    res.send(results);
  });
});

app.get('/api/appointments/history', (req, res) => {
  db.query("SELECT * FROM visitor_requests WHERE status != 'PENDING' ORDER BY visit_date DESC", (err, results) => {
    if (err) return res.status(500).json(err);
    res.json(results);
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
// LIVE BLE TRACKING RECEIVER & DATABASE BRIDGE
// ============================================

// We changed this to an object so it can track multiple different badges at the same time
let liveVisitors = {}; 

// Add this at the top level with your 'liveVisitors' object
let lastKnownVisitors = new Set();

setInterval(() => {
  const now = Date.now();
  const currentVisitorIds = Object.keys(liveVisitors);

  // 1. Detect DISCONNECTS
  // If an ID was in lastKnownVisitors but is NOT in currentVisitorIds
  for (const bleId of lastKnownVisitors) {
    if (!currentVisitorIds.includes(bleId)) {
      console.log(`⚠️ Visitor ${bleId} disconnected.`);
      const visitor = lastKnownVisitors.lastData || { name: 'Unknown', floor: null, room: 'Disconnected' };
      
      logVisitorHistory(bleId, visitor.name, bleId, visitor.floor, visitor.currentRoom, 'disconnect', null, null);
    }
  }

  // 2. Detect CONNECTS / RECONNECTS
  // If an ID is in currentVisitorIds but was NOT in lastKnownVisitors
  for (const bleId of currentVisitorIds) {
    if (!lastKnownVisitors.has(bleId)) {
      console.log(`✅ Visitor ${bleId} connected.`);
      const visitor = liveVisitors[bleId];
      
      logVisitorHistory(bleId, visitor.name, bleId, visitor.floor, visitor.currentRoom, 'connect', null, null);
    }
  }

  // 3. Purge timed out visitors (the ghost fix)
  for (const bleId in liveVisitors) {
    if (now - liveVisitors[bleId].lastSeen > 10000) {
      console.log(`👻 Visitor ${bleId} timed out. Removing from server memory.`);
      delete liveVisitors[bleId];
    }
  }

  // 4. Update the Set for the next cycle
  lastKnownVisitors = new Set(Object.keys(liveVisitors));
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
  const { room, floor, beaconId } = req.body;
  
  if (!beaconId) return res.status(400).json({ error: "No beacon ID received." });

  // 1. Join with visitor_requests and check 'returned = 0'
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
      return res.status(500).json({ error: "Database error" });
    }
    
    // 2. If no active record is found, force clear memory for this badge
    if (results.length === 0) {
      try {
        const [tagRes] = await db.promise().query("SELECT ble_id FROM ble_tags WHERE mac_address = ?", [beaconId]);
        if (tagRes && tagRes.length > 0) {
          const ghostId = tagRes[0].ble_id;
          if (liveVisitors[ghostId]) {
            console.log(`👻 Detected stray signal from returned visitor: ${ghostId}. Cleaning memory.`);
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

    // 3. Update liveVisitors (Only if they passed the returned = 0 check)
    const wasPresent = !!liveVisitors[bleId];
    const oldRoom = wasPresent ? liveVisitors[bleId].currentRoom : null;

    liveVisitors[bleId] = {
      id: bleId,
      name: visitorName,
      bleId: bleId,
      floor: floor,
      currentRoom: room,
      destination: destination,
      lastSeen: Date.now()
    };

    // 4. Log history events with coordinate fallback
    if (!wasPresent) {
      logVisitorHistory(row.id, visitorName, bleId, floor, room, 'enter', null, null);
    } else if (oldRoom !== room) {
      logVisitorHistory(row.id, visitorName, bleId, floor, room, 'move', null, null);
    }

    visitorDestinations[bleId] = destination;
    console.log(`📍 Tracking ${visitorName} – Current: ${room}, Dest: ${destination}`);
    res.json({ success: true });
  });
});

// The React Map knocks on this door every 2 seconds to get the latest coordinates
app.get('/api/positions', async (req, res) => {
  try {
    const now = Date.now();
    const TIMEOUT_MS = 10000; // 10 seconds timeout

    // 1. Get database-active visitors
    const [activeRows] = await db.promise().query(`
      SELECT ble_id 
      FROM visitor_requests 
      WHERE arrived = 1 AND returned = 0 AND ble_id IS NOT NULL
    `);
    
    const validBleIds = new Set(activeRows.map(row => String(row.ble_id).trim()));

    // 2. Memory Purge & Liveness Check
    for (const bleId in liveVisitors) {
      const visitor = liveVisitors[bleId];
      
      // A. If they aren't in the DB, delete them (the ghost fix)
      // B. If they haven't pinged in 10 seconds, delete them (the hardware-off fix)
      if (!validBleIds.has(String(bleId).trim()) || (now - visitor.lastSeen > TIMEOUT_MS)) {
        console.log(`🧹 Purging: ${bleId} (Reason: ${!validBleIds.has(bleId) ? 'Database Inactive' : 'Signal Timeout'})`);
        delete liveVisitors[bleId];
      }
    }

    // 3. Return only truly active, pinging visitors
    res.json(Object.values(liveVisitors));
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Sync failed" });
  }
});
// ============================================
// VISIT REASONS MANAGEMENT
// ============================================

app.get('/api/visit-reasons', (req, res) => {
  db.query("SELECT * FROM visit_reasons ORDER BY reason_text", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// CREATE a new visit reason (admin only)
app.post('/api/visit-reasons', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  const { reason_text } = req.body;
  if (!reason_text) return res.status(400).json({ error: "Reason text is required." });
  
  db.query("INSERT INTO visit_reasons (reason_text) VALUES (?)", [reason_text.trim()], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user.id, 'CREATE_VISIT_REASON', 'visit_reason', result.insertId, req);
    res.status(201).json({ success: true, id: result.insertId });
  });
});

// UPDATE a visit reason (admin only)
app.put('/api/visit-reasons/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  const { id } = req.params;
  const { reason_text } = req.body;
  if (!reason_text) return res.status(400).json({ error: "Reason text required." });
  db.query("UPDATE visit_reasons SET reason_text = ? WHERE id = ?", [reason_text.trim(), id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reason not found' });
    logAction(req.user.id, 'UPDATE_VISIT_REASON', 'visit_reason', id, req);
    res.json({ success: true });
  });
});

// DELETE a visit reason (admin only)
app.delete('/api/visit-reasons/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  }
  const { id } = req.params;
  db.query("DELETE FROM visit_reasons WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Reason not found' });
    logAction(req.user.id, 'DELETE_VISIT_REASON', 'visit_reason', id, req);
    res.json({ success: true });
  });
});

// ============================================
// 10. EMERGENCY ALERTS, JOBS, POLICIES, ETC.
// ============================================
app.post('/api/emergency-alerts', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { title, message, severity, target_roles } = req.body;
  const targetRolesJson = JSON.stringify(target_roles || ['instructor', 'admin', 'security', 'hr_admin']);
  db.query("INSERT INTO emergency_alerts (title, message, severity, target_roles) VALUES (?, ?, ?, ?)", [title.trim(), message.trim(), severity, targetRolesJson], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    const alertId = result.insertId;
    const rolePlaceholders = target_roles.map(() => '?').join(',');
    db.query(`SELECT id FROM users WHERE role IN (${rolePlaceholders}) AND status = 'active'`, target_roles, (err, users) => {
      if (!err && users.length) {
        const receipts = users.map(u => [alertId, u.id]);
        db.query('INSERT INTO alert_receipts (alert_id, user_id) VALUES ?', [receipts]);
      }
    });
    logAction(req.user.id, 'CREATE_ALERT', 'emergency_alert', alertId, req);
    res.json({ success: true, alertId });
  });
});

app.get('/api/emergency-alerts/active', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  db.query("SELECT a.id, a.title, a.message, a.severity, a.sent_at, ar.read_at FROM alert_receipts ar JOIN emergency_alerts a ON ar.alert_id = a.id WHERE ar.user_id = ? AND a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > NOW()) ORDER BY a.sent_at DESC", [userId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/emergency-alerts/:id/read', (req, res) => {
  const alertId = req.params.id;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  db.query("UPDATE alert_receipts SET read_at = NOW() WHERE alert_id = ? AND user_id = ?", [alertId, userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.get('/api/emergency-alerts', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT * FROM emergency_alerts ORDER BY sent_at DESC", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ============================================
// JOB POSTINGS & APPLICANTS
// ============================================

// 1. Public: list open jobs
app.get('/api/public/jobs', (req, res) => {
  // FIXED: Now selecting ALL required fields for the complete details modal
  db.query(
    `SELECT id, title, department, description, requirements, employment_type, 
            location_type, location, salary_min, salary_max, created_at 
     FROM job_postings 
     WHERE status = 'open' 
     ORDER BY created_at DESC`, 
    (err, jobs) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(jobs);
    }
  );
});

// 2. Public: submit application
app.post('/api/jobs/apply', uploadResume.single('resume'), (req, res) => {
  const { job_id, full_name, email, phone, cover_letter } = req.body;
  if (!job_id || !full_name || !email) return res.status(400).json({ error: 'Missing required fields.' });
  const resumePath = req.file ? `/uploads/resumes/${req.file.filename}` : null;
  db.query("INSERT INTO job_applicants (job_id, full_name, email, phone, cover_letter, resume_path) VALUES (?, ?, ?, ?, ?, ?)", [job_id, full_name, email, phone, cover_letter, resumePath], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Application submitted successfully!' });
  });
});

// 3. Admin: list all job postings (for dashboard)
app.get('/api/jobs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(
    `SELECT id, title, department, description, requirements, employment_type,
            location_type, location, salary_min, salary_max, status, posted_by, created_at
     FROM job_postings ORDER BY created_at DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// 4. Admin: create new job posting
// POST /api/jobs – create a new job posting
app.post('/api/jobs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { 
    title, department, description, requirements, employment_type,
    location_type, location, salary_min, salary_max, status
  } = req.body;
  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }
  db.query(
    `INSERT INTO job_postings 
      (title, department, description, requirements, employment_type,
       location_type, location, salary_min, salary_max, status, posted_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title, department || null, description, requirements || null, employment_type || 'Full-time',
      location_type || 'On-site', location || null, salary_min || null, salary_max || null,
      status || 'open', req.user.id
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user.id, 'CREATE_JOB', 'job_posting', result.insertId, req);
      res.json({ success: true, id: result.insertId });
    }
  );
});

// 5. Admin: update a job posting
// PUT /api/jobs/:id – update an existing job
app.put('/api/jobs/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { 
    title, department, description, requirements, employment_type,
    location_type, location, salary_min, salary_max, status
  } = req.body;
  const jobId = req.params.id;
  db.query(
    `UPDATE job_postings SET
      title = ?, department = ?, description = ?, requirements = ?,
      employment_type = ?, location_type = ?, location = ?,
      salary_min = ?, salary_max = ?, status = ?
     WHERE id = ?`,
    [
      title, department || null, description, requirements || null,
      employment_type, location_type || 'On-site', location || null,
      salary_min || null, salary_max || null, status || 'open', jobId
    ],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Job not found' });
      logAction(req.user.id, 'UPDATE_JOB', 'job_posting', req.params.id, req);
      res.json({ success: true });
    }
  );
});

// 6. Admin: delete a job posting (and its applicants)
app.delete('/api/jobs/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const jobId = req.params.id;
  // Delete related applicants first (foreign key constraint may be set)
  db.query("DELETE FROM job_applicants WHERE job_id = ?", [jobId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    db.query("DELETE FROM job_postings WHERE id = ?", [jobId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Job not found' });
      logAction(req.user.id, 'DELETE_JOB', 'job_posting', jobId, req);
      res.json({ success: true });
    });
  });
});

// 7. Admin: get a single job by ID (includes all columns)
app.get('/api/jobs/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(
    `SELECT id, title, department, description, requirements, employment_type,
            location_type, location, salary_min, salary_max, status, posted_by, created_at
     FROM job_postings WHERE id = ?`,
    [req.params.id],
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      if (results.length === 0) return res.status(404).json({ error: 'Job not found' });
      res.json(results[0]);
    }
  );
});

app.get('/api/jobs/:id/applicants', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
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
        return res.status(500).json({ error: err.message });
      }
      res.json(results);
    }
  );
});

// 9. Admin: update applicant status
app.put('/api/applicants/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { status } = req.body;
  if (!['new', 'reviewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  db.query(
    "UPDATE job_applicants SET status = ? WHERE id = ?",
    [status, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      logAction(req.user.id, 'UPDATE_APPLICANT_STATUS', 'job_applicant', req.params.id, req);
      res.json({ success: true });
    }
  );
});

// Policies and evaluations (simplified)
app.get('/api/policies', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT * FROM hr_policies ORDER BY uploaded_at DESC", (err, policies) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(policies);
  });
});

app.post('/api/policies', authenticateToken, upload.single('file'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });
  const { title } = req.body;
  const filePath = `/uploads/${req.file.filename}`;
  db.query("INSERT INTO hr_policies (title, file_path, uploaded_by) VALUES (?, ?, ?)", [title, filePath, req.user.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    logAction(req.user.id, 'CREATE_POLICY', 'hr_policy', result.insertId, req);
    res.json({ success: true });
  });
});

// ============================================
// 11. CHAT (WebSocket)
// ============================================
app.get('/api/chat/rooms', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query(`SELECT r.id, r.name, r.type, CASE WHEN r.type = 'direct' THEN (SELECT u.full_name FROM users u WHERE u.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(r.name, '_', -1), '_', 1) AS UNSIGNED)) END as display_name FROM chat_rooms r WHERE (r.type = 'direct' AND (r.name LIKE CONCAT('dm_%\_', ?) OR r.name LIKE CONCAT('dm\_', ?, '\_%'))) OR (r.type = 'group' AND EXISTS (SELECT 1 FROM chat_room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?)) ORDER BY r.created_at DESC`, [userId, userId, userId], (err, rooms) => {
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
// MONTHLY ATTENDANCE SUMMARY (for Reports)
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
               AND TIME_TO_SEC(TIMEDIFF(a.time_in, s.start_time)) > 900   -- 15 minutes grace period
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

// ============================================
// PAYROLL HISTORY (for Reports)
// ============================================
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

// ============================================
// SCHOOL LOCATIONS MANAGEMENT (CRUD)
// ============================================

// GET all school locations (you may already have this)
app.get('/api/school-locations', (req, res) => {
  db.query("SELECT id, name, latitude, longitude, radius FROM school_locations ORDER BY name", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// CREATE a new school location
app.post('/api/school-locations', authenticateToken, (req, res) => {
  // Only admin/hr_admin can create
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

// UPDATE a school location
app.put('/api/school-locations/:id', authenticateToken, (req, res) => {
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
      logAction(req.user.id, 'UPDATE_LOCATION', 'school_location', locationId, req);
      res.json({ success: true });
    }
  );
});

// DELETE a school location
app.delete('/api/school-locations/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const locationId = req.params.id;
  // Optional: check if location is referenced in schedules or attendance before deleting
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
      logAction(req.user.id, 'DELETE_LOCATION', 'school_location', locationId, req);
      res.json({ success: true });
    });
  });
});

app.get('/api/courses', (req, res) => {
  db.query("SELECT id, name FROM courses", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ============================================
// COMPLIANCE REPORTS (PDF generation)
// ============================================
app.get('/api/reports/compliance/attendance-compliance', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

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

    // --- Generate PDF ---
    const PDFDocument = require('pdfkit');
const doc = new PDFDocument({ margin: 50, size: 'A4' });
res.setHeader('Content-Type', 'application/pdf');
res.setHeader('Content-Disposition', `attachment; filename=attendance_compliance_${year}_${month}.pdf`);
doc.pipe(res);

// Header
doc.fontSize(18).font('Helvetica-Bold').text('HCT ACADEMY', { align: 'center' });
doc.fontSize(10).font('Helvetica').text('Healthcare Training Center', { align: 'center' });
doc.fontSize(9).text('123 Healthcare Avenue, Pasay City, Metro Manila', { align: 'center' });
doc.text('Tel: (02) 8123-4567 | Email: info@hct.ph', { align: 'center' });
doc.moveDown(1);

doc.fontSize(14).font('Helvetica-Bold').text('ATTENDANCE COMPLIANCE REPORT', { align: 'center' });
const monthName = new Date(year, month-1).toLocaleString('default', { month: 'long' });
doc.fontSize(10).font('Helvetica').text(`Period: ${monthName} ${year}`, { align: 'center' });
doc.moveDown(1.5);

// Table with fixed column widths
const startX = 50;
const colWidths = [60, 180, 50, 50, 50, 50, 60];
const headers = ['ID', 'Name', 'Sched', 'Pres', 'Late', 'Leave', 'Comp%'];

doc.font('Helvetica-Bold').fontSize(9);
let currentY = doc.y;
headers.forEach((h, i) => {
  let x = startX;
  for (let j = 0; j < i; j++) x += colWidths[j];
  doc.text(h, x, currentY, { width: colWidths[i], align: i === 0 ? 'left' : 'center' });
});
doc.moveTo(startX, currentY + 12).lineTo(startX + colWidths.reduce((a,b)=>a+b,0), currentY + 12).stroke();
currentY += 18;

doc.font('Helvetica').fontSize(8.5);
for (const emp of reportData) {
  if (currentY > 750) {
    doc.addPage();
    currentY = 50;
    headers.forEach((h, i) => {
      let x = startX;
      for (let j = 0; j < i; j++) x += colWidths[j];
      doc.text(h, x, currentY, { width: colWidths[i], align: i === 0 ? 'left' : 'center' });
    });
    doc.moveTo(startX, currentY + 12).lineTo(startX + colWidths.reduce((a,b)=>a+b,0), currentY + 12).stroke();
    currentY += 18;
  }
  let x = startX;
  doc.text(emp.employee_id, x, currentY, { width: colWidths[0], align: 'left' });
  x += colWidths[0];
  doc.text(emp.full_name.substring(0, 25), x, currentY, { width: colWidths[1], align: 'left' });
  x += colWidths[1];
  doc.text(emp.scheduled_days.toString(), x, currentY, { width: colWidths[2], align: 'center' });
  x += colWidths[2];
  doc.text(emp.present_days.toString(), x, currentY, { width: colWidths[3], align: 'center' });
  x += colWidths[3];
  doc.text(emp.late_days.toString(), x, currentY, { width: colWidths[4], align: 'center' });
  x += colWidths[4];
  doc.text(emp.leave_days.toString(), x, currentY, { width: colWidths[5], align: 'center' });
  x += colWidths[5];
  doc.text(`${emp.compliance_rate}%`, x, currentY, { width: colWidths[6], align: 'center' });
  currentY += 18;
}

// Draw bottom line
doc.moveTo(startX, currentY - 6).lineTo(startX + colWidths.reduce((a,b)=>a+b,0), currentY - 6).stroke();
doc.moveDown(1);

// Summary (unchanged but ensure alignment)
const totalScheduled = reportData.reduce((s, e) => s + e.scheduled_days, 0);
const totalPresent = reportData.reduce((s, e) => s + e.present_days, 0);
const totalLate = reportData.reduce((s, e) => s + e.late_days, 0);
const totalLeave = reportData.reduce((s, e) => s + e.leave_days, 0);
const totalAbsent = totalScheduled - totalPresent - totalLeave;
const overallRate = totalScheduled > 0 ? (totalPresent / totalScheduled) * 100 : 0;

doc.font('Helvetica-Bold').fontSize(10);
doc.text('SUMMARY', startX, doc.y, { underline: true });
doc.moveDown(0.5);
doc.font('Helvetica').fontSize(9);
doc.text(`Total Scheduled Days: ${totalScheduled}`, startX);
doc.text(`Total Present Days:   ${totalPresent}`, startX);
doc.text(`Total Late Days:      ${totalLate}`, startX);
doc.text(`Total Leave Days:     ${totalLeave}`, startX);
doc.text(`Total Absent Days:    ${totalAbsent}`, startX);
doc.moveDown(0.5);
doc.text(`Overall Compliance Rate: ${overallRate.toFixed(1)}%`, startX);
if (overallRate < 85) {
  doc.text(' (Below target of 85%)', { continued: true });
}

doc.moveDown(2);
doc.fontSize(8).text(
  `Generated on ${new Date().toLocaleString()}`,
  { align: 'center', color: 'gray' }
);
doc.text('This is a system-generated document.', { align: 'center', color: 'gray' });

doc.end();
  } catch (err) {
    console.error('PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }
});

// ============================================
// payroll endpoints. 
// ============================================
// MISSING PAYROLL ENDPOINTS (add these)
// ============================================

// Unlock payroll with PIN
app.post('/api/payroll/unlock', (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) {
    return res.status(400).json({ success: false, message: 'Email and PIN required.' });
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
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (results.length === 0) {
        return res.status(400).json({ success: false, message: 'Admin account not found.' });
      }

      const admin = results[0];
      if (admin.payroll_pin !== pin) {
        recordFailedPinAttempt(email);
        return res.status(400).json({ success: false, message: 'Incorrect security code.' });
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
          if (err) console.error('Failed to log access:', err);
        }
      );

      res.json({ success: true, token: payrollToken, expiresIn: 900 });
    }
  );
});

// Change PIN
app.put('/api/users/update-pin', (req, res) => {
  const { email, currentPin, newPin } = req.body;
  if (!email || !currentPin || !newPin) {
    return res.status(400).json({ success: false, message: 'All fields required.' });
  }
  if (newPin.length < 4 || newPin.length > 6 || !/^\d+$/.test(newPin)) {
    return res.status(400).json({ success: false, message: 'PIN must be 4-6 digits.' });
  }

  db.query(
    "SELECT * FROM users WHERE email = ? AND status = 'active' AND (role = 'admin' OR role = 'hr_admin')",
    [email],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (results.length === 0) return res.status(400).json({ success: false, message: 'Admin not found.' });

      const admin = results[0];
      if (admin.payroll_pin !== currentPin) {
        return res.status(400).json({ success: false, message: 'Current PIN is incorrect.' });
      }

      db.query("UPDATE users SET payroll_pin = ? WHERE id = ?", [newPin, admin.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to update PIN.' });
        clearPinAttempts(email);
        res.json({ success: true, message: 'PIN updated successfully.' });
      });
    }
  );
});

// Finalize payroll for a single employee
app.post('/api/payroll/finalize', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const {
    user_id, month_year, salary_rate, total_hours, overtime_hours, overtime_pay,
    transport_allowance, meal_allowance, housing_allowance, sss_deduction, philhealth_deduction,
    pagibig_deduction, loan_deduction, other_deduction, gross_pay, tax_deduction, net_pay,
    total_earnings, status
  } = req.body;

  if (!user_id || !month_year || total_hours === undefined || gross_pay === undefined || net_pay === undefined) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  db.query("SELECT id FROM payroll WHERE user_id = ? AND month_year = ?", [user_id, month_year], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (rows.length > 0) return res.status(400).json({ success: false, error: 'Payroll already finalized.' });

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
      (err, result) => {   // ✅ added result parameter
        if (err) return res.status(500).json({ success: false, error: err.message });
        // ✅ Audit log
        logAction(req.user.id, 'FINALIZE_PAYROLL', 'payroll', result.insertId, req);
        res.json({ success: true });
      }
    );
  });
});

// Run monthly payroll for all instructors
app.post('/api/payroll/run-monthly', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];
  const monthYear = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

  try {
    const [employees] = await db.promise().query(
      "SELECT id, employee_id, full_name, monthly_salary, work_days_per_month FROM users WHERE LOWER(role) = 'instructor' AND status = 'active'"
    );

    const processed = [];
    const skipped = [];

    for (const emp of employees) {
      // 1. Skip if payroll already exists
      const [existing] = await db.promise().query("SELECT id FROM payroll WHERE user_id = ? AND month_year = ?", [emp.id, monthYear]);
      if (existing.length > 0) {
        skipped.push({ employee: emp.full_name, reason: 'Already finalized' });
        continue;
      }

      // 2. Get total hours from attendance
      const [attendance] = await db.promise().query(
        `SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, time_in, time_out) / 60), 0) as total_hours 
         FROM attendance 
         WHERE user_id = ? AND date BETWEEN ? AND ? AND status IN ('present', 'late')`,
        [emp.employee_id, startDate, endDate]
      );
      
      const totalHours = parseFloat(attendance[0]?.total_hours || 0);

      // 3. Robust math calculations
      const monthlySalary = parseFloat(emp.monthly_salary) || 0;
      const workDays = parseFloat(emp.work_days_per_month) || 22;
      const hourlyRate = (monthlySalary > 0 && workDays > 0) ? (monthlySalary / workDays) / 8 : 0;
      
      const grossPay = totalHours * hourlyRate;
      const tax = grossPay * 0.10;
      const netPay = grossPay - tax;

      // 4. Insert with sanitized/fixed precision values
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
      processed: processed.length, 
      skipped: skipped.length, 
      details: { processed, skipped } 
    });

  } catch (err) {
    console.error('Monthly payroll error:', err);
    res.status(500).json({ error: 'Failed to process payroll: ' + err.message });
  }
});

// Update monthly salary and work days per month
app.put('/api/payroll/update-employee-salary/:employeeId', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { employeeId } = req.params;
  const { monthly_salary, work_days_per_month } = req.body;
  db.query(
    "UPDATE users SET monthly_salary = ?, work_days_per_month = ? WHERE employee_id = ?",
    [monthly_salary, work_days_per_month, employeeId],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Employee not found' });
      logAction(req.user.id, 'UPDATE_SALARY', 'user', employeeId, req);
      res.json({ success: true });
    }
  );
});

// Payroll access logs
app.get('/api/payroll/access-logs', (req, res) => {
  db.query(
    "SELECT pal.email, u.full_name, pal.accessed_at FROM payroll_access_logs pal JOIN users u ON pal.user_id = u.id ORDER BY pal.accessed_at DESC LIMIT 100",
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
    }
  );
});

// ============================================
// ADMIN‑ONLY ENDPOINTS
// ============================================

// Get audit logs (requires admin)
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

// Update user role (admin only)
app.put('/api/users/:id/role', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { role } = req.body;
  const userId = req.params.id;
  if (!['admin', 'hr_admin', 'security', 'instructor'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  db.query("UPDATE users SET role = ? WHERE id = ?", [role, userId], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    // Also update role_id if roles table exists, but optional
    res.json({ success: true });
  });
});

// System configuration (simple in-memory or new table – we'll use a new table for persistence)
// First, create the table if not exists:
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
    // Insert default row if not exists
    db.query("INSERT IGNORE INTO system_config (id) VALUES (1)");
  }
});

// Get system config
app.get('/api/system-config', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  db.query("SELECT password_expiry_days, otp_expiry_minutes, geofence_default_radius, max_login_attempts FROM system_config WHERE id = 1", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results[0] || { password_expiry_days: 365, otp_expiry_minutes: 5, geofence_default_radius: 200, max_login_attempts: 5 });
  });
});

// Update system config
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

// ============================================
// COURSES MANAGEMENT (CRUD)
// ============================================

// GET all courses (already exists – keep it)
app.get('/api/courses', (req, res) => {
  db.query("SELECT id, name FROM courses ORDER BY name", (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// CREATE a new course
app.post('/api/courses', authenticateToken, (req, res) => {
  // Only admin/hr_admin can create
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Course name required' });
  }
  db.query("INSERT INTO courses (name) VALUES (?)", [name.trim()], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({ error: 'Course already exists' });
      }
      return res.status(500).json({ error: err.message });
    }
    logAction(req.user.id, 'CREATE_COURSE', 'course', result.insertId, req);
    res.json({ success: true, id: result.insertId });
  });
});

// UPDATE a course
app.put('/api/courses/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name } = req.body;
  const courseId = req.params.id;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Course name required' });
  }
  db.query("UPDATE courses SET name = ? WHERE id = ?", [name.trim(), courseId], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Course name already exists' });
      return res.status(500).json({ error: err.message });
    }
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Course not found' });
    logAction(req.user.id, 'UPDATE_COURSE', 'course', courseId, req);
    res.json({ success: true });
  });
});

// DELETE a course
app.delete('/api/courses/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const courseId = req.params.id;
  // Optional: check if course is used in schedules before deleting
  db.query("SELECT id FROM schedules WHERE course = (SELECT name FROM courses WHERE id = ?) LIMIT 1", [courseId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    if (rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete course because it is used in schedules' });
    }
    db.query("DELETE FROM courses WHERE id = ?", [courseId], (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Course not found' });
      }
      logAction(req.user.id, 'DELETE_COURSE', 'course', courseId, req);
      res.json({ success: true });
    });
  });
});

// Get visitor requests by date (optionally with status filter)
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

// Mark as arrived
app.put('/api/visitor-requests/:id/arrive', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { destination, ble_id } = req.body;

  if (!destination || !ble_id) {
    return res.status(400).json({ error: "Destination and BLE tag required" });
  }

  // Update database
  const sql = `
    UPDATE visitor_requests 
    SET arrived = TRUE, arrived_at = NOW(), destination = ?, ble_id = ? 
    WHERE id = ?
  `;
  db.query(sql, [destination, ble_id, id], (err) => {
    if (err) return res.status(500).json({ error: err.message });

    logAction(req.user.id, 'VISITOR_ARRIVE', 'visitor_request', id, req);

    // 🔥 FORCE overwrite the permanent destination lock
    visitorDestinations[ble_id] = destination;
    console.log(`🔒 Destination FORCED for ${ble_id} → ${destination}`);

    // Also update liveVisitors immediately
    liveVisitors[ble_id] = {
      id: ble_id,
      name: "Visitor", // will be updated by BLE ping
      bleId: ble_id,
      floor: "3",
      currentRoom: destination,
      destination: destination,
      lastSeen: Date.now()
    };

    res.json({ success: true });
  });
});

// Mark as no‑show
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

    // Find current active schedule
    const [scheduleRows] = await db.promise().query(
      `SELECT id, place, start_time, end_time FROM schedules 
       WHERE user_id = ? AND date = ? AND TIME(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) BETWEEN start_time AND end_time`,
      [employeeId, today]
    );
    const currentSchedule = scheduleRows[0];
    if (!currentSchedule) {
      return res.json({ success: false, message: "No active shift" });
    }

    // Get last known state from the most recent tracking record
    const [lastRec] = await db.promise().query(
      `SELECT location_enabled, is_inside_campus 
       FROM instructor_location_tracking 
       WHERE employee_id = ? AND schedule_id = ? 
       ORDER BY ping_time DESC LIMIT 1`,
      [employeeId, currentSchedule.id]
    );
    const lastGpsState = lastRec.length ? lastRec[0].location_enabled : null;
    const lastInsideState = lastRec.length ? lastRec[0].is_inside_campus : null;

    // Geofencing
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

    // Insert tracking record (Using proper Manila Time, NOT NOW())
    await db.promise().query(
      `INSERT INTO instructor_location_tracking 
       (employee_id, schedule_id, latitude, longitude, location_name, is_inside_campus, location_enabled, ping_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))`,
      [employeeId, currentSchedule.id, latitude || 0, longitude || 0, resolvedLocationName, isInside ? 1 : 0, location_enabled ? 1 : 0]
    );

    // Update user heartbeat
    await db.promise().query(
      "UPDATE users SET last_location_ping = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), location_tracking_enabled = ? WHERE employee_id = ?",
      [location_enabled ? 1 : 0, employeeId]
    );

    // --- Alert ONLY on distinct state changes ---
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
        WHEN TIMESTAMPDIFF(SECOND, u.last_location_ping, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) > 120 THEN 'DISABLED'
        ELSE 'GPS ON'
      END) AS gps_status
    FROM users u
    LEFT JOIN schedules s ON u.employee_id = s.user_id AND DATE(s.date) = ?
    WHERE u.employee_id = ?
  `, [today, employeeId]);

  if (rows.length === 0) return;
  broadcastToAdminAndHR({ type: 'instructor_status_update', instructor: rows[0] });
};
// GET /api/location-tracking/status (admin/hr only)
// GET /api/location-tracking/status (admin/hr only)
app.get('/api/location-tracking/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') return res.status(403).json({ error: 'Forbidden' });

  const selectedDate = req.query.date || getPHTime().date;

  try {
    const [rows] = await db.promise().query(`
      SELECT 
        u.employee_id, u.full_name, u.location_tracking_enabled,
        s.id AS schedule_id, s.place AS schedule_place, s.course AS schedule_course,
        s.start_time, s.end_time,
        COALESCE(ilt.location_name, '—') AS last_position_name, ilt.is_inside_campus AS last_is_inside,
        u.last_location_ping AS last_ping_time,
        CASE 
          WHEN u.last_location_ping IS NULL 
            OR u.location_tracking_enabled = 0 
            OR TIMESTAMPDIFF(SECOND, u.last_location_ping, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) > 120 
          THEN 'GPS OFF'
          ELSE 'GPS ON'
        END AS gps_status,
        (SELECT MIN(ping_time) FROM instructor_location_tracking WHERE employee_id = u.employee_id AND schedule_id = s.id AND is_inside_campus = 1) AS campus_entry_time,
        
        -- STRICT EXIT LOGIC: Only counts as an exit if GPS is ON (location_enabled = 1) AND coordinates are outside (is_inside_campus = 0)
        (SELECT MAX(ping_time) FROM instructor_location_tracking 
         WHERE employee_id = u.employee_id 
           AND schedule_id = s.id 
           AND is_inside_campus = 0 
           AND location_enabled = 1 
           AND ping_time > (SELECT MIN(ping_time) FROM instructor_location_tracking WHERE employee_id = u.employee_id AND schedule_id = s.id AND is_inside_campus = 1)) AS campus_exit_time

      FROM users u
      INNER JOIN schedules s ON u.employee_id = s.user_id 
      LEFT JOIN attendance a ON s.id = a.schedule_id
      LEFT JOIN (
          SELECT t1.* FROM instructor_location_tracking t1
          INNER JOIN (SELECT MAX(id) as max_id FROM instructor_location_tracking GROUP BY employee_id) t2 ON t1.id = t2.max_id
      ) ilt ON u.employee_id = ilt.employee_id
      WHERE u.role = 'instructor' AND u.status = 'active' AND s.date = ?
        AND TIME(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) BETWEEN s.start_time AND s.end_time
      ORDER BY s.start_time ASC
    `, [selectedDate]);

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
    // ✅ Enforce Manila timezone
    await db.promise().query("SET time_zone = '+08:00'");

    // 1. Fetch tracking records
    const [rows] = await db.promise().query(`
      SELECT ping_time, location_enabled, is_inside_campus, location_name, latitude, longitude
      FROM instructor_location_tracking
      WHERE employee_id = ? AND DATE(ping_time) = ?
      ORDER BY ping_time ASC
    `, [employeeId, targetDate]);

    // 2. Fetch alerts
    const [alerts] = await db.promise().query(`
      SELECT id, alert_message, created_at
      FROM location_alerts
      WHERE employee_id = ? AND DATE(created_at) = ?
      ORDER BY created_at ASC
    `, [employeeId, targetDate]);

    // 3. Fetch schedule times
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

// GET /api/location-tracking/alerts - returns alerts for a given date
app.get('/api/location-tracking/alerts', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const targetDate = req.query.date || getPHTime().date;

  try {
    // ✅ Enforce Manila timezone so dates match correctly
    await db.promise().query("SET time_zone = '+08:00'");

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
       SELECT ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
       FROM DUAL
       WHERE NOT EXISTS (
           SELECT 1 FROM location_alerts 
           WHERE employee_id = ? AND alert_message = ? 
             AND created_at > DATE_SUB(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), INTERVAL 1 MINUTE)
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
  // Allow both admin and security roles
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

// GET /api/visitor-requests/history - completed visits between dates
app.get('/api/visitor-requests/history', authenticateToken, (req, res) => {
  // Allow security, admin, and HR roles
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

    // Add computed duration and formatted times
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

app.post('/api/overtime-requests', authenticateToken, upload.single('attachment'), async (req, res) => {
  const { date, start_time, end_time, reason, scenario_type } = req.body;
  const userId = req.user.id;
  const attachment = req.file ? `/uploads/${req.file.filename}` : null;

  if (!date || !start_time || !end_time || !reason || !scenario_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Validate scenario_type
    if (!['future', 'ongoing', 'after_shift'].includes(scenario_type)) {
      return res.status(400).json({ error: 'Invalid scenario_type' });
    }

    // For 'ongoing' scenario, verify there is an active attendance record today
    let attendanceId = null;
    if (scenario_type === 'ongoing') {
      const [attRecords] = await db.promise().query(
        `SELECT id, time_in, time_out FROM attendance 
         WHERE user_id = (SELECT employee_id FROM users WHERE id = ?) AND date = ? AND time_out IS NULL`,
        [userId, date]
      );
      if (attRecords.length === 0) {
        return res.status(400).json({ error: 'No active clock‑in found for today. Cannot request ongoing overtime.' });
      }
      attendanceId = attRecords[0].id;
    }

    // Insert request
    const [result] = await db.promise().query(
      `INSERT INTO overtime_requests 
       (user_id, date, start_time, end_time, reason, attachment, scenario_type, attendance_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [userId, date, start_time, end_time, reason, attachment, scenario_type, attendanceId]
    );

    res.json({ success: true, requestId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/overtime-requests', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query("SELECT * FROM overtime_requests WHERE user_id = ? ORDER BY date DESC", [userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET pending overtime requests
app.get('/api/overtime-requests/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(
    `SELECT o.*, u.full_name, u.employee_id 
     FROM overtime_requests o
     JOIN users u ON o.user_id = u.id
     WHERE o.status = 'pending'
     ORDER BY o.created_at DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// PUT approve/reject overtime request
app.put('/api/overtime-requests/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { id } = req.params;
  const { status } = req.body; // 'approved' or 'rejected'

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    // Fetch the overtime request with user details
    const [rows] = await connection.query(
      `SELECT o.*, u.employee_id, u.id as user_id 
       FROM overtime_requests o
       JOIN users u ON o.user_id = u.id
       WHERE o.id = ? AND o.processed = 0`,
      [id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Request not found or already processed' });
    }
    const reqData = rows[0];

    // Update status
    await connection.query(`UPDATE overtime_requests SET status = ?, processed = 1 WHERE id = ?`, [status, id]);

    if (status === 'approved') {
      const overtimeHours = calculateHours(reqData.start_time, reqData.end_time);
      const overtimePay = overtimeHours * (hourlyRateFromUser(reqData.user_id) * 1.25); // example 1.25x rate

      // --- Update attendance based on scenario_type ---
      if (reqData.scenario_type === 'ongoing' && reqData.attendance_id) {
        // Extend the ongoing attendance record
        await connection.query(
          `UPDATE attendance SET time_out = ?, total_hours = TIMESTAMPDIFF(HOUR, time_in, ?) 
           WHERE id = ?`,
          [reqData.end_time, reqData.end_time, reqData.attendance_id]
        );
      } 
      else if (reqData.scenario_type === 'future') {
        // Create a separate attendance record for overtime (no clock‑in/out selfies)
        await connection.query(
          `INSERT INTO attendance 
           (user_id, date, time_in, time_out, status, location, total_hours, correction_requested)
           VALUES (?, ?, ?, ?, 'overtime', 'Approved Overtime', ?, 0)`,
          [reqData.employee_id, reqData.date, reqData.start_time, reqData.end_time, overtimeHours]
        );
      } 
      else if (reqData.scenario_type === 'after_shift') {
        // Insert a separate overtime attendance record (even if already clocked out)
        await connection.query(
          `INSERT INTO attendance 
           (user_id, date, time_in, time_out, status, location, total_hours, correction_requested)
           VALUES (?, ?, ?, ?, 'overtime', 'Approved Overtime (After Shift)', ?, 0)`,
          [reqData.employee_id, reqData.date, reqData.start_time, reqData.end_time, overtimeHours]
        );
      }

      // --- Update payroll (add overtime hours & pay) ---
      // Find existing payroll entry for that user & month
      const monthYear = new Date(reqData.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      const [payrollRows] = await connection.query(
        `SELECT id, overtime_hours, overtime_pay FROM payroll 
         WHERE user_id = ? AND month_year = ?`,
        [reqData.user_id, monthYear]
      );
      if (payrollRows.length > 0) {
        const newOvertimeHours = (payrollRows[0].overtime_hours || 0) + overtimeHours;
        const newOvertimePay = (payrollRows[0].overtime_pay || 0) + overtimePay;
        // Optionally recalculate net pay (gross + overtime pay - deductions)
        await connection.query(
          `UPDATE payroll 
           SET overtime_hours = ?, overtime_pay = ?, gross_pay = gross_pay + ?, net_pay = net_pay + ?
           WHERE id = ?`,
          [newOvertimeHours, newOvertimePay, overtimePay, overtimePay, payrollRows[0].id]
        );
      } else {
        // If no payroll entry exists, create one (monthly payroll will later integrate)
        // For simplicity, you may skip or create a minimal entry.
        console.log(`No payroll entry for ${monthYear}, user ${reqData.user_id}. Overtime will be included when monthly payroll is run.`);
      }
    }

    await connection.commit();
    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Helper functions
function calculateHours(start, end) {
  const startDate = new Date(`1970-01-01T${start}`);
  const endDate = new Date(`1970-01-01T${end}`);
  return (endDate - startDate) / 3600000;
}

async function hourlyRateFromUser(userId) {
  const [rows] = await db.promise().query(
    `SELECT monthly_salary, work_days_per_month FROM users WHERE id = ?`,
    [userId]
  );
  if (rows.length === 0) return 0;
  const dailyRate = rows[0].monthly_salary / rows[0].work_days_per_month;
  return dailyRate / 8; // assumes 8‑hour workday
}

app.get('/api/overtime-requests/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(`
    SELECT o.*, u.full_name, u.employee_id
    FROM overtime_requests o
    JOIN users u ON o.user_id = u.id
    ORDER BY o.created_at DESC
  `, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// GET pending correction requests (from attendance_corrections table)
app.get('/api/attendance/corrections/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(
    `SELECT c.*, u.full_name, u.employee_id
     FROM attendance_corrections c
     JOIN users u ON c.user_id = u.employee_id
     WHERE c.status = 'pending'
     ORDER BY c.id DESC`,
    (err, rows) => {
      if (err) {
        console.error("Pending corrections error:", err);
        return res.status(500).json({ error: err.message });
      }
      res.json(rows);
    }
  );
});

// Get grouped leave requests for admin (consecutive days grouped)
app.get('/api/leave-requests/grouped', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.query(
    `SELECT lr.id, lr.user_id, lr.request_date, lr.type, lr.reason, lr.status, lr.admin_remarks, lr.submitted_at,
            u.full_name, u.employee_id
     FROM leave_requests lr
     JOIN users u ON lr.user_id = u.employee_id
     WHERE lr.is_hidden = 0
     ORDER BY u.employee_id, lr.request_date ASC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // Group consecutive dates by same user, type, reason
      const grouped = [];
      let currentGroup = null;
      rows.forEach(row => {
        const date = row.request_date;
        if (!currentGroup ||
            currentGroup.user_id !== row.user_id ||
            currentGroup.type !== row.type ||
            currentGroup.reason !== row.reason) {
          // Start new group
          currentGroup = {
            ids: [row.id],
            user_id: row.user_id,
            full_name: row.full_name,
            employee_id: row.employee_id,
            type: row.type,
            reason: row.reason,
            status: row.status, // pending, approved, rejected
            start_date: date,
            end_date: date,
            admin_remarks: row.admin_remarks,
            submitted_at: row.submitted_at,
            request_count: 1
          };
          grouped.push(currentGroup);
        } else {
          // Check if date is consecutive
          const lastDate = new Date(currentGroup.end_date);
          const currentDate = new Date(date);
          const diffDays = (currentDate - lastDate) / (1000 * 60 * 60 * 24);
          if (diffDays === 1) {
            // Extend group
            currentGroup.ids.push(row.id);
            currentGroup.end_date = date;
            currentGroup.request_count++;
          } else {
            // Not consecutive – create new group
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

// Batch update leave request status
app.put('/api/leave-requests/batch-status', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { ids, status, admin_remarks } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Invalid request IDs' });
  }
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const placeholders = ids.map(() => '?').join(',');
  const query = `UPDATE leave_requests SET status = ?, admin_remarks = ? WHERE id IN (${placeholders})`;
  db.query(query, [status, admin_remarks || null, ...ids], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});
// ============================================
// 12. WEBSOCKET SERVER
// ============================================
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
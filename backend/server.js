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
const crypto = require('crypto');
const { allowRoles, requireAction, ACTION_ROLES } = require('./rbacPolicy');

const app = express();
const GPS_GRACE_MS = 120000; 
const SPOOF_BLOCK_SPEED_KMH = 1500;
const gpsStates = new Map(); 
const campusStates = new Map();
const helmet = require('helmet');
app.set('trust proxy', 1);

const { validateEmailForAccount, normalize: normalizeEmail } = require('./emailValidation');


const envOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [];

// ============================================
// DYNAMIC SYSTEM CONFIGURATION ENGINE
// ============================================
let systemConfigCache = {
  password_expiry_days: 365,
  otp_expiry_minutes: 5,
  geofence_default_radius: 200,
  max_login_attempts: 5
};

const FAILED_LOGIN_ATTEMPTS = new Map(); 

setInterval(() => {
  const now = Date.now();
  const STALE_MS = 60 * 60 * 1000; 
  for (const [email, entry] of FAILED_LOGIN_ATTEMPTS) {
    const lastTouch = entry.lockedUntil || entry.lastFailedAt || 0;
    if (now - lastTouch > STALE_MS) {
      FAILED_LOGIN_ATTEMPTS.delete(email);
    }
  }
}, 15 * 60 * 1000).unref();


const PAYROLL_PIN_PATTERN = /^\d{4,6}$/;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

async function verifyStoredPayrollPin(userId, storedPin, enteredPin) {
  if (typeof enteredPin !== 'string' || !PAYROLL_PIN_PATTERN.test(enteredPin)) {
    return false;
  }

  if (!storedPin || typeof storedPin !== 'string') {
    return false;
  }

  
  if (BCRYPT_HASH_PATTERN.test(storedPin)) {
    return bcrypt.compare(enteredPin, storedPin);
  }


  if (storedPin === enteredPin) {
    const newHash = await bcrypt.hash(enteredPin, 12);

    await db.promise().query(
      `UPDATE users
       SET payroll_pin = ?
       WHERE id = ? AND payroll_pin = ?`,
      [newHash, userId, storedPin]
    );

    return true;
  }

  return false;
}


async function getSystemConfig() {
  try {
    const [rows] = await db.promise().query(
      "SELECT password_expiry_days, otp_expiry_minutes, geofence_default_radius, max_login_attempts FROM system_config WHERE id = 1"
    );
    if (rows && rows.length > 0) {
      systemConfigCache = rows[0];
    }
  } catch (err) {
    
  }
  return systemConfigCache;
}


getSystemConfig();


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


const corsOptions = {
  origin: function (origin, callback) {
   
    if (!origin) return callback(null, true);
    
    
    if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.vercel.app')) {
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


// CONFIGURATION (from .env)

const JWT_SECRET = process.env.JWT_SECRET;
const PAYROLL_JWT_SECRET = process.env.PAYROLL_JWT_SECRET;
const OTP_STORE = {};          // email -> { otp, expiresAt }
const PIN_ATTEMPTS = new Map(); // email -> { count, lastAttempt }
const wsClients = new Map();     // userId -> Set<WebSocket>


const OTP_MAX_ATTEMPTS = 5;

const otpStorageKey = (email, purpose) =>
  `${purpose}:${String(email).trim().toLowerCase()}`;

function createOtpChallenge(email, purpose, expiryMinutes) {
  const otp = String(crypto.randomInt(100000, 1000000));

  const digest = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${purpose}:${email.toLowerCase()}:${otp}`)
    .digest('hex');

  const minutes = Math.min(
    Math.max(Number(expiryMinutes) || 5, 1),
    15
  );

  return {
    otp,
    record: {
      digest,
      expiresAt: Date.now() + minutes * 60 * 1000,
      attempts: 0
    }
  };
}

function checkOtpChallenge(email, purpose, otp, consume = false) {
  const key = otpStorageKey(email, purpose);
  const record = OTP_STORE[key];

  if (!record) {
    return { valid: false, reason: 'missing' };
  }

  if (Date.now() >= record.expiresAt) {
    delete OTP_STORE[key];
    return { valid: false, reason: 'expired' };
  }

  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    delete OTP_STORE[key];
    return { valid: false, reason: 'locked' };
  }

  if (!/^\d{6}$/.test(String(otp || ''))) {
    record.attempts += 1;
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      delete OTP_STORE[key];
    }
    return { valid: false, reason: 'invalid' };
  }

  const suppliedDigest = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${purpose}:${email.toLowerCase()}:${String(otp)}`)
    .digest();

  const storedDigest = Buffer.from(record.digest, 'hex');

  const valid =
    storedDigest.length === suppliedDigest.length &&
    crypto.timingSafeEqual(storedDigest, suppliedDigest);

  if (!valid) {
    record.attempts += 1;

    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      delete OTP_STORE[key];
      return { valid: false, reason: 'locked' };
    }

    return { valid: false, reason: 'invalid' };
  }

  if (consume) {
    delete OTP_STORE[key];
  }

  return { valid: true };
}

function requirePendingLogin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Please enter your password before requesting an OTP.'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (
      decoded.purpose !== 'otp-pending' ||
      !decoded.id ||
      !decoded.email ||
      !['web', 'mobile'].includes(decoded.client)
    ) {
      return res.status(403).json({
        success: false,
        message: 'Invalid OTP verification session.'
      });
    }

    const requestedEmail = String(
      req.body?.email || ''
    ).trim().toLowerCase();

    if (requestedEmail !== decoded.email.toLowerCase()) {
      return res.status(403).json({
        success: false,
        message: 'OTP email does not match the login account.'
      });
    }

    req.pendingLogin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Login verification expired. Please sign in again.'
    });
  }
}


// R06: Reject impossible dates (for example, 2026-02-30) without timezone coercion.
const isValidISOCalendarDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
};

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

const broadcastToAdminAndHR = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user && 
        (client.user.role === 'admin' || client.user.role === 'hr_admin')) {
      client.send(JSON.stringify(data));
    }
  });
};

const broadcastInstructorStatus = async (employeeId) => {
  const { date: today } = getPHTime();
  const phNow = getPHDateTime(); // ✅ ADDED THIS

  const [rows] = await db.promise().query(`
    SELECT 
      u.employee_id, u.full_name, u.last_location_ping, u.location_tracking_enabled,
      s.id AS schedule_id, s.place AS schedule_place, s.course AS schedule_course, s.start_time, s.end_time,
      (CASE 
        WHEN CONCAT(s.date, ' ', s.end_time) < ? THEN 'GPS OFF'  -- ✅ [1] Replaced NOW()

WHEN (
  SELECT t.location_name
  FROM instructor_location_tracking t
  WHERE t.employee_id = u.employee_id
    AND t.schedule_id = s.id
  ORDER BY t.id DESC
  LIMIT 1
) = 'Location Disabled'
  THEN 'Location Disabled'

        WHEN u.location_tracking_enabled = 0 THEN 'GPS Disabled'
        WHEN u.last_location_ping IS NULL THEN 'Unavailable'
        WHEN TIMESTAMPDIFF(SECOND, u.last_location_ping, ?) > ? THEN 'Signal Lost' -- ✅ [2, 3] Replaced NOW()
        ELSE (SELECT location_name FROM instructor_location_tracking WHERE employee_id = u.employee_id ORDER BY id DESC LIMIT 1)
      END) AS last_position_name,
      (CASE 
        WHEN CONCAT(s.date, ' ', s.end_time) < ? THEN NULL -- ✅ [4] Replaced NOW()
        WHEN u.location_tracking_enabled = 0 THEN NULL
        WHEN u.last_location_ping IS NULL THEN NULL
        WHEN TIMESTAMPDIFF(SECOND, u.last_location_ping, ?) > ? THEN NULL -- ✅ [5, 6] Replaced NOW()
        ELSE (SELECT is_inside_campus FROM instructor_location_tracking WHERE employee_id = u.employee_id ORDER BY id DESC LIMIT 1)
      END) AS last_is_inside,
      (
CASE
  WHEN CONCAT(s.date, ' ', s.end_time) < ?
    THEN 'GPS OFF'
  WHEN u.last_location_ping IS NULL
    THEN 'Unavailable'


WHEN (
  SELECT t.location_name
  FROM instructor_location_tracking t
  WHERE t.employee_id = u.employee_id
    AND t.schedule_id = s.id
  ORDER BY t.id DESC
  LIMIT 1
) = 'Location Disabled'
  THEN 'Location Disabled'


  WHEN u.location_tracking_enabled = 0
    THEN 'GPS Disabled'
  WHEN TIMESTAMPDIFF(
    SECOND,
    u.last_location_ping,
    ?
  ) > ?
    THEN 'Signal Lost'
  ELSE 'GPS ON'
END) AS gps_status

    FROM users u
    LEFT JOIN schedules s ON (u.employee_id = s.user_id OR u.id = s.user_id) AND DATE(s.date) = ?
    WHERE u.employee_id = ?
  `, [
    phNow,                       
    phNow, GPS_STALE_SECONDS,     
    phNow,                       
    phNow, GPS_STALE_SECONDS,     
    phNow,                        
    phNow, GPS_STALE_SECONDS,     
    today,                        
    employeeId                    
  ]);

  if (rows.length === 0) return;
  broadcastToAdminAndHR({ type: 'instructor_status_update', instructor: rows[0] });
};


const uploadsPath = process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'uploads');

// Ensure base upload directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

const ROOM_COORDINATES = {
  '3': {
    'Classroom': { x: 37.15, y: 168.5 },
    'AHA Room': { x: 164.9, y: 291.9 },
    'Private Room': { x: 188.2, y: 157.5 },
    'Operating Room': { x: 233.5, y: 197.1 },
    'Delivery Room': { x: 254.7, y: 197.1 },
    'NICU': { x: 320.85, y: 158.25 },
    'ICU': { x: 365.8, y: 156.1 },
    'Library': { x: 113.9, y: 98.85 },
    'Breakout Room 1': { x: 190.3, y: 40.9 },
    'Breakout Room 2': { x: 210.85, y: 84.75 },
    'Breakout Room 3': { x: 255.8, y: 85.8 },
    'Faculty Room': { x: 321.2, y: 6.9 },
    'Faculty Office': { x: 321.2, y: 6.9 },
    'Main Entrance': { x: 360.45, y: 50.75 }
  },
  '5': {
    'Lounge / IV Drip': { x: 65.8, y: 200.4 },
    'Operating Room': { x: 112.1, y: 198.6 },
    'Delivery Room': { x: 161.0, y: 199.6 },
    'ICU': { x: 208.75, y: 196.85 },
    'Educ Head': { x: 249.75, y: 214.55 },
    'Educ. Head': { x: 249.75, y: 214.55 },
    'Executive': { x: 286.2, y: 197.2 },
    'Executive 1': { x: 286.2, y: 197.2 },
    'Executive 2': { x: 322.95, y: 198.6 },
    'Conference': { x: 322.95, y: 198.6 },
    'Creatives': { x: 260.0, y: 141.35 },
    'Debrief Room': { x: 163.75, y: 123.35 },
    'Lobby': { x: 52.75, y: 132.15 },
    'Main El': { x: 52.75, y: 132.15 },
    'Entrance': { x: 52.75, y: 132.15 },
    'AHA Room': { x: 108.25, y: 40.9 },
    'ArriA Room': { x: 108.25, y: 40.9 },
    'Classroom 1': { x: 173.7, y: 43.1 },
    'Classroom 2': { x: 246.9, y: 40.2 },
    'HR / Admin': { x: 307.4, y: 41.25 },
    'HR / Admin Finance': { x: 307.4, y: 41.25 },
    'Pantry': { x: 348.8, y: 52.6 },
    'Toilet': { x: 351.65, y: 18.7 }
  }
};

const ALLOWED_ROOMS = {
  '3': ['Classroom', 'AHA Room', 'Private Room', 'Operating Room', 'Delivery Room', 'NICU', 'ICU', 'Library', 'Breakout Room 1', 'Breakout Room 2', 'Breakout Room 3', 'Faculty Room', 'Main Entrance'],
  '5': ['Lounge / IV Drip', 'Operating Room', 'Delivery Room', 'ICU', 'Educ Head', 'Executive', 'Conference', 'Creatives', 'Debrief Room', 'Lobby', 'Entrance', 'AHA Room', 'Classroom 1', 'Classroom 2', 'HR / Admin', 'Pantry', 'Toilet']
};

const getRoomCoords = (floor, room) => {
  const f = String(floor).trim();
  const r = String(room).trim();
  if (ROOM_COORDINATES[f] && ROOM_COORDINATES[f][r]) {
    return ROOM_COORDINATES[f][r];
  }
 return null;
};



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

const clockLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  message: { success: false, message: 'Too many clock attempts. Please wait a minute and try again.' }
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

function verifyPayrollAccess(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, PAYROLL_JWT_SECRET, (err, decoded) => {
    if (err || decoded.purpose !== 'payroll-access') {
      return res.status(403).json({ success: false, message: 'Payroll access expired or invalid. Please re-enter your PIN.' });
    }
    
    
    req.user = decoded; 
    next();
  });
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
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, session) => {
    if (err || !session) {
      return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
    }

    if (session.purpose !== 'session' || !session.id ||
        !['admin', 'hr_admin', 'security', 'instructor'].includes(session.role)) {
      return res.status(403).json({
        success: false,
        message: 'Complete login verification before accessing this resource.'
      });
    }

    try {
      const [rows] = await db.promise().query(
        'SELECT id, role, status, employment_status FROM users WHERE id = ? LIMIT 1', [session.id]
      );
      const account = rows[0];
      if (!account || account.status !== 'active' || account.employment_status !== 'active') {
        return res.status(401).json({ success: false, message: 'Account is inactive or no longer available. Please sign in again.' });
      }
      if (account.role !== session.role) {
        return res.status(401).json({ success: false, message: 'Account permissions have changed. Please sign in again.' });
      }
      req.user = session;
      return next();
    } catch (databaseError) {
      console.error('Session validation database error:', databaseError);
      return res.status(503).json({ success: false, message: 'Unable to verify your session at this time.' });
    }
  });
}


const getPHTimeFromDate = (dateObj) => {
  const options = { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' };
  const date = dateObj.toLocaleDateString('en-CA', options);
  const time = dateObj.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour12: false });
  return `${date} ${time}`;
};



const verifyOwnership = (req, res, next) => {
  if (!req.user || req.user.id === undefined || req.user.id === null) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required.'
    });
  }


  if (req.user.role === 'admin' || req.user.role === 'hr_admin') {
    return next();
  }

  const requestedIdentifier =
    req.params?.employeeId ??
    req.params?.identifier ??
    req.params?.userId ??
    req.params?.id;

  const requestedValue =
    requestedIdentifier === undefined || requestedIdentifier === null
      ? ''
      : String(requestedIdentifier).trim();

  if (!requestedValue) {
    return res.status(400).json({
      success: false,
      message: 'Missing employee identifier in request.'
    });
  }


  try {
    db.query(
      'SELECT id, employee_id FROM users WHERE id = ? LIMIT 1',
      [req.user.id],
      (err, rows) => {
        if (err) {
          console.error('Ownership DB Error:', err);

          return res.status(500).json({
            success: false,
            message: 'Database verification error.'
          });
        }

        if (!Array.isArray(rows) || rows.length === 0) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: account not found.'
          });
        }

        const owner = rows[0];

        const ownInternalId = String(owner.id);
        const ownEmployeeId =
          owner.employee_id == null
            ? ''
            : String(owner.employee_id);

        
        if (
          requestedValue !== ownInternalId &&
          requestedValue !== ownEmployeeId
        ) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: you can only access your own records.'
          });
        }

        return next();
      }
    );
  } catch (err) {
    console.error('Ownership Middleware Error:', err);

    return res.status(500).json({
      success: false,
      message: 'Unable to verify record ownership.'
    });
  }
};


function logVisitorHistory(visitorId, visitorName, bleId, floor, currentRoom, eventType, x = null, y = null) {
  const phNow = getPHDateTime(); 

 
  const sql = `INSERT INTO visitor_history 
    (visitor_id, visitor_name, ble_id, floor, current_room, event_type, x, y, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
  db.query(sql, [visitorId, visitorName, bleId, floor, currentRoom, eventType, x, y, phNow], (err) => {
    if (err) console.error('Failed to log visitor history:', err);
  });
}

function logAction(userId, action, targetType, targetId, req, oldValue = null, newValue = null) {
  if (!userId) return;
  
  // Extract primary client IP (strip out proxy/load balancer chains)
  const rawIp = req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || null;
  const ip = rawIp ? rawIp.split(',')[0].trim() : null;
  const userAgent = req?.headers?.['user-agent'] || null;
  const phNow = getPHDateTime(); // Explicit Philippine Standard Time

  const sql = `
    INSERT INTO audit_logs 
      (user_id, action, target_type, target_id, old_value, new_value, ip_address, user_agent, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.query(sql, [
    userId, 
    action, 
    targetType, 
    targetId, 
    oldValue ? JSON.stringify(oldValue) : null, 
    newValue ? JSON.stringify(newValue) : null, 
    ip, 
    userAgent,
    phNow
  ], (err) => {
    if (err) console.error('Failed to insert audit log:', err);
  });
}


// ==========================================
// C10.2: Attendance time integrity (Philippine local clock)
// ==========================================
// TIME values have no date component. A shorter clock-out time is
// interpreted as the following day, and excessive shifts are rejected.
const C10_MAX_SHIFT_HOURS = 16;

function c10ParseTimeSeconds(value) {
  if (value == null) return null;
  const input = String(value).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const sec = Number(match[3] || 0);
  if (h > 23 || m > 59 || sec > 59) return null;
  return h * 3600 + m * 60 + sec;
}

function c10AttendanceHours(start, end, maxHours = C10_MAX_SHIFT_HOURS) {
  const from = c10ParseTimeSeconds(start);
  const to = c10ParseTimeSeconds(end);
  if (from == null || to == null) return null;
  const seconds = (to - from + 86400) % 86400;
  if (seconds <= 0 || seconds > maxHours * 3600) return null;
  return Math.round(seconds / 36) / 100;
}

// ==========================================
// C08: ATTENDANCE GPS QUALITY VALIDATION
// ==========================================

const validateAttendanceGpsQuality = (body) => {
  const rawAccuracy = body.gps_accuracy;
  const rawTimestamp = body.gps_timestamp;

  // Both fields are required for online attendance.
  if (
    rawAccuracy === undefined ||
    rawAccuracy === null ||
    String(rawAccuracy).trim() === '' ||
    typeof rawTimestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(rawTimestamp)
  ) {
    return 'GPS accuracy and timestamp are required.';
  }

  const accuracy = Number(rawAccuracy);
  const gpsTime = Date.parse(rawTimestamp);

  // Maximum reported horizontal accuracy: 50 meters
  if (
    !Number.isFinite(accuracy) ||
    accuracy < 0 ||
    accuracy > 50
  ) {
    return 'GPS accuracy is too low. Move to an open area and try again.';
  }

  if (!Number.isFinite(gpsTime)) {
    return 'Invalid GPS timestamp.';
  }

  const ageMs = Date.now() - gpsTime;

  // Allow 2 minutes for upload/network delay.
  // Reject timestamps over 30 seconds in the future.
  if (ageMs > 120000 || ageMs < -30000) {
    return 'GPS reading is outdated or has an invalid timestamp. Please retry.';
  }

  return null;
};

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

const getRecentLocationPings = async (
  dbClient,
  employeeId,
  limit = 10
) => {
  const [rows] = await dbClient.query(
    `SELECT latitude, longitude, ping_time
     FROM instructor_location_tracking
     WHERE employee_id = ?
       AND location_enabled = 1
       AND NOT (latitude = 0 AND longitude = 0)
     ORDER BY id DESC
     LIMIT ?`,
    [employeeId, limit]
  );

  return rows;
};

const parsePHTMillis = (str) => {
  if (!str) return NaN;
  const s = String(str).includes('T') ? String(str) : String(str).replace(' ', 'T');
  return new Date(`${s}+08:00`).getTime();
};

const checkLocationHeuristics = (recentPings, currentLat, currentLon, currentTimeStr) => {
  const flags = [];

  
  const last = recentPings[0];
  if (last) {
    const lastMs = parsePHTMillis(last.ping_time);
    const nowMs  = parsePHTMillis(currentTimeStr);
    const hours  = (nowMs - lastMs) / 3.6e6;
    if (hours > 0) {
      const km = getDistanceFromLatLonInMeters(
        last.latitude, last.longitude, currentLat, currentLon
      ) / 1000;
      const speedKmh = km / hours;
      if (speedKmh > 900) {
        flags.push({
          reason: 'Impossible travel speed',
          speed_kmh: Math.round(speedKmh),   
          detail: `${Math.round(speedKmh)} km/h over ${Math.round(hours * 60)} min`
        });
      }
    }
  }

  
  if (recentPings.length >= 5) {
    const identicalCount = recentPings.filter(p =>
      Math.abs(Number(p.latitude)  - currentLat) < 0.000001 &&
      Math.abs(Number(p.longitude) - currentLon) < 0.000001
    ).length;
    if (identicalCount >= 5) {
      flags.push({
        reason: 'Repeated identical coordinates',
        detail: `${identicalCount} of ${recentPings.length} recent pings matched exactly`
      });
    }
  }

  return { suspicious: flags.length > 0, flags };
};


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


const profilePicDir = path.join(uploadsPath, 'profile_pictures');
if (!fs.existsSync(profilePicDir)) fs.mkdirSync(profilePicDir, { recursive: true });
const uploadProfilePic = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, profilePicDir),
    filename: (req, file, cb) => {
      
      let ext = path.extname(file.originalname || '').toLowerCase();
      if (!ext || ext.length < 2) {
        if (file.mimetype === 'image/png') ext = '.png';
        else if (file.mimetype === 'image/webp') ext = '.webp';
        else ext = '.jpg';
      }
      cb(null, `profile_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

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

const documentFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg', 'image/png', 'image/jpg', 
    'application/pdf', 'application/msword', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ];
  const ext = path.extname(file.originalname || '').toLowerCase();
  const allowedExts = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx'];

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPG, PNG, PDF, DOC, DOCX allowed.'));
  }
};

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: documentFilter });

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
const applicationStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, resumeDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const prefix = file.fieldname === 'tor' ? 'tor' : 'resume';
    cb(null, `${prefix}_${unique}${path.extname(file.originalname || '.pdf')}`);
  }
});
const uploadApplication = multer({
  storage: applicationStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: pdfFilter
}).fields([
  { name: 'resume', maxCount: 1 },
  { name: 'tor',    maxCount: 1 }
]);
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
const multerSelfie = multer({ storage: selfieStorage, limits: { fileSize: 8 * 1024 * 1024 }, fileFilter: imageFilter });

const correctionDir = path.join(uploadsPath, 'corrections');
if (!fs.existsSync(correctionDir)) fs.mkdirSync(correctionDir, { recursive: true });
const correctionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, correctionDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `correction_${unique}${path.extname(file.originalname || '.jpg')}`);
  }
});

const uploadCorrection = multer({ 
  storage: correctionStorage, 
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: documentFilter 
});

const uploadCorrectionFiles = uploadCorrection.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]);

const uploadOvertimeFiles = upload.fields([
  { name: 'attachment', maxCount: 1 },
  { name: 'image', maxCount: 1 }
]);

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
// Applied documentFilter
const uploadAppeal = multer({ storage: appealStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: documentFilter });







// ============================================
// 1. AUTHENTICATION & OTP
// ============================================


app.post('/api/auth/send-otp', otpLimiter, requirePendingLogin, async (req, res) => {

  console.log('OTP request received.');
  const email = req.body.email ? req.body.email.trim().toLowerCase() : '';
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  try {
    const cfg = typeof getSystemConfig === 'function' 
      ? await getSystemConfig() 
      : { otp_expiry_minutes: 5 };
    const otpMinutes = Number(cfg.otp_expiry_minutes) || 5;

    
db.query(
  "SELECT id, email, role FROM users WHERE id = ? AND email = ? AND status = 'active'",
  [req.pendingLogin.id, email],
  async (err, results) => {

      if (err) {
        console.error("DB error:", err);
        return res.status(500).json({ success: false, message: err.message });
      }
      if (results.length === 0) {
        return res.status(404).json({ success: false, message: 'No active account found with that email.' });
      }

      
const { otp, record } = createOtpChallenge(
  email,
  'login',
  otpMinutes
);


      try {
        const { data, error } = await resend.emails.send({
          from: 'UniVITA Security <no-reply@univitahct.tech>', 
          to: [email],
          subject: 'Your OTP Code - UniVITA',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0f172a; margin-top: 0;">Login Verification Code</h2>
              <p style="color: #475569; font-size: 14px;">Use the following one-time password (OTP) to complete your sign-in. This code is valid for ${otpMinutes} minute${otpMinutes > 1 ? 's' : ''}.</p>
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
        
OTP_STORE[otpStorageKey(email, 'login')] = record;


        res.json({ success: true, message: 'OTP sent to your email.' });
      } catch (err) {
        console.error('Unexpected email error:', err);
        return res.status(500).json({ success: false, message: 'Server error while sending OTP.' });
      }
    });
  } catch (configErr) {
    console.error("Config fetch error in send-otp:", configErr);
    res.status(500).json({ success: false, message: 'Server error retrieving system configuration.' });
  }
});


app.post(
  '/api/auth/verify-otp',
  otpLimiter,
  requirePendingLogin,
  (req, res) => {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();

    const otp = String(req.body?.otp || '');

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid six-digit OTP.'
      });
    }

    db.query(
      `SELECT *
       FROM users
       WHERE id = ? AND email = ? AND status = 'active'
       LIMIT 1`,
      [req.pendingLogin.id, email],
      (err, results) => {
        if (err) {
          console.error('OTP account lookup failed:', err.message);

          return res.status(500).json({
            success: false,
            message: 'Unable to verify the account.'
          });
        }

        if (!results.length) {
          return res.status(403).json({
            success: false,
            message: 'This account is unavailable.'
          });
        }

        const user = results[0];

        if (
          (req.pendingLogin.client === 'mobile' &&
            user.role !== 'instructor') ||
          (req.pendingLogin.client === 'web' &&
            user.role === 'instructor')
        ) {
          return res.status(403).json({
            success: false,
            message: 'This account does not have access.'
          });
        }

        const verification = checkOtpChallenge(
          email,
          'login',
          otp,
          true
        );

        if (!verification.valid) {
          return res.status(400).json({
            success: false,
            message:
              verification.reason === 'locked'
                ? 'Too many invalid attempts. Request a new OTP.'
                : verification.reason === 'expired'
                  ? 'OTP expired. Request a new OTP.'
                  : 'Invalid or unavailable OTP.'
          });
        }

        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            role: user.role,
            purpose: 'session'
          },
          JWT_SECRET,
          { expiresIn: '30d' }
        );

        return res.json({
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
      }
    );
  }
);


// ============================================
// PASSWORD RECOVERY & OTP VERIFICATION ROUTES
// ============================================

app.post('/api/auth/forgot-password', otpLimiter, async (req, res) => {
  const email = req.body.email?.trim().toLowerCase();
  const isMobile = req.body.isMobile;
  if (!email) return res.status(400).json({ success: false, message: 'Email required' });

  try {
    const cfg = typeof getSystemConfig === 'function' 
      ? await getSystemConfig() 
      : { otp_expiry_minutes: 5 };
    const otpMinutes = Number(cfg.otp_expiry_minutes) || 5;

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

      
const { otp, record } = createOtpChallenge(
  email,
  'reset',
  otpMinutes
);


      try {
        const { data, error } = await resend.emails.send({
          from: 'UniVITA Security <no-reply@univitahct.tech>',
          to: [email],
          subject: 'Password Reset OTP - UniVITA',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
              <h2 style="color: #0f172a; margin-top: 0;">Password Reset Code</h2>
              <p style="color: #475569; font-size: 14px;">Use the following one-time password (OTP) to reset your password. This code is valid for ${otpMinutes} minute${otpMinutes > 1 ? 's' : ''}.</p>
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

        
OTP_STORE[otpStorageKey(email, 'reset')] = record;


        res.json({ success: true, message: 'OTP sent to your email.' });
      } catch (err) {
        console.error('Unexpected email error:', err);
        return res.status(500).json({ success: false, message: 'Server error while sending reset OTP.' });
      }
    });
  } catch (configErr) {
    console.error("Config fetch error in forgot-password:", configErr);
    res.status(500).json({ success: false, message: 'Server error retrieving system configuration.' });
  }
});


app.post('/api/auth/verify-reset-otp', otpLimiter, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otp = String(req.body?.otp || '');

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: 'Email and OTP are required.'
    });
  }

  const verification = checkOtpChallenge(
    email,
    'reset',
    otp,
    false
  );

  if (!verification.valid) {
    return res.status(400).json({
      success: false,
      message: verification.reason === 'locked'
        ? 'Too many attempts. Request a new reset code.'
        : verification.reason === 'expired'
          ? 'Reset code expired. Request a new one.'
          : 'Invalid or unavailable reset code.'
    });
  }

  return res.json({
    success: true,
    message: 'OTP verified successfully.'
  });
});



app.post('/api/auth/reset-password', otpLimiter, async (req, res) => {
  const email = typeof req.body?.email === 'string'
    ? req.body.email.trim().toLowerCase()
    : '';

  const otp = String(req.body?.otp ?? '');
  const newPassword = req.body?.newPassword;

  // 1. Validate required fields
  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required.'
    });
  }

  // 2. Validate the password type and complexity
  if (
    typeof newPassword !== 'string' ||
    newPassword.length < 8 ||
    !/[A-Z]/.test(newPassword) ||
    !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Your password must be at least 8 characters long, contain 1 uppercase letter, and 1 special character.'
    });
  }

  // 3. Validate the reset OTP format
  if (!/^\d{6}$/.test(otp)) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid 6-digit OTP.'
    });
  }

  try {
   
    const verification = checkOtpChallenge(
      email,
      'reset',
      otp,
      true
    );

    if (!verification.valid) {
      let message = 'The OTP entered is incorrect or unavailable.';

      if (verification.reason === 'missing') {
        message = 'OTP not found. Please request a new one.';
      } else if (verification.reason === 'expired') {
        message = 'Your OTP has expired. Please request a new one.';
      } else if (verification.reason === 'locked') {
        message = 'Too many incorrect OTP attempts. Please request a new one.';
      }

      return res.status(400).json({
        success: false,
        message
      });
    }

    // 5. Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 6. Update the existing user account
    const [result] = await db.promise().query(
      `UPDATE users
       SET password = ?,
           password_last_changed = CURRENT_DATE
       WHERE email = ?
         AND status = 'active'`,
      [hashedPassword, email]
    );

    // 7. Check whether an active account was updated
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active account was found for this email.'
      });
    }

    // 8. Return success
    return res.status(200).json({
      success: true,
      message: 'Your password has been successfully reset!'
    });

  } catch (error) {
    console.error('Password reset error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to reset your password. Please try again.'
    });
  }
});




// R05: Legacy credentials are migrated before login continues. A failed migration
// fails closed; plaintext must not remain stored after a successful login.
const verifyAccountPassword = async (user, candidate) => {
  if (typeof user?.password !== 'string' || typeof candidate !== 'string') return false;
  if (/^\$2[aby]\$\d{2}\$/.test(user.password)) {
    return bcrypt.compare(candidate, user.password);
  }
  // Compatibility for imported legacy accounts only. Use the same length and
  // constant-time byte comparison and write a bcrypt hash before accepting it.
  const submitted = crypto.createHash('sha256').update(candidate).digest();
  const stored = crypto.createHash('sha256').update(user.password).digest();
  if (!crypto.timingSafeEqual(submitted, stored)) return false;
  const hashed = await bcrypt.hash(candidate, 12);
  const [updated] = await db.promise().query(
    'UPDATE users SET password = ?, password_last_changed = COALESCE(password_last_changed, CURRENT_DATE) WHERE id = ? AND password = ?',
    [hashed, user.id, user.password]
  );
  if (updated.affectedRows !== 1) {
    // Concurrent migration: accept only if the stored bcrypt hash matches.
    const [rows] = await db.promise().query('SELECT password FROM users WHERE id = ? LIMIT 1', [user.id]);
    if (!rows.length || !/^\$2[aby]\$\d{2}\$/.test(rows[0].password || '')) return false;
    return bcrypt.compare(candidate, rows[0].password);
  }
  console.warn('Migrated legacy password to bcrypt for user ID:', user.id);
  return true;
};

app.post('/api/login', loginLimiter, async (req, res) => {
  const { email, password, isMobile } = req.body;
  const cfg = typeof getSystemConfig === 'function' 
    ? await getSystemConfig() 
    : { password_expiry_days: 365, max_login_attempts: 5 };
  
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  // 1. Check Max Login Attempts Lockout
  const attemptRecord = FAILED_LOGIN_ATTEMPTS.get(cleanEmail);
  if (attemptRecord && attemptRecord.lockedUntil) {
    if (Date.now() < attemptRecord.lockedUntil) {
      const remainingMins = Math.ceil((attemptRecord.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({ 
        success: false, 
        message: `Account temporarily locked due to ${cfg.max_login_attempts} failed login attempts. Please try again in ${remainingMins} minute(s).` 
      });
    } else {
      FAILED_LOGIN_ATTEMPTS.delete(cleanEmail);
    }
  }

  db.query("SELECT * FROM users WHERE email = ? AND status = 'active' AND employment_status = 'active'", [cleanEmail], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Database connection error.' });
    
    // 1. Email is incorrect or inactive:
    if (results.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const user = results[0];
    let match = false;
    try {
      match = await verifyAccountPassword(user, password);
    } catch (passwordError) {
      console.error('Password verification or legacy migration failed:', passwordError);
      return res.status(503).json({ success: false, message: 'Unable to verify credentials at this time.' });
    }

    if (!match) {
      // Record and escalate failed attempts against System Config limit
      const current = FAILED_LOGIN_ATTEMPTS.get(cleanEmail) || { count: 0, lockedUntil: null, lastFailedAt: 0 };
      current.count += 1;
      current.lastFailedAt = Date.now();

      if (current.count >= cfg.max_login_attempts) {
        current.lockedUntil = Date.now() + 15 * 60 * 1000; // 15-minute security lockout
        FAILED_LOGIN_ATTEMPTS.set(cleanEmail, current);
        return res.status(429).json({
          success: false,
          message: `Too many failed attempts. Security threshold (${cfg.max_login_attempts}) reached. Account locked for 15 minutes.`
        });
      }

      FAILED_LOGIN_ATTEMPTS.set(cleanEmail, current);
      const remainingAttempts = cfg.max_login_attempts - current.count;
      return res.status(401).json({ 
        success: false, 
        message: `Incorrect password. ${remainingAttempts} attempt(s) remaining before security lockout.` 
      });
    }

    // Reset failed counter on successful password match
    FAILED_LOGIN_ATTEMPTS.delete(cleanEmail);

    // 🔴 MOBILE APP ROLE RESTRICTION: Block Admin/HR/Security from Mobile
    if (isMobile && user.role !== 'instructor') {
      return res.status(403).json({ success: false, message: 'This account does not have access.' });
    }

    // 🔴 WEB PORTAL ROLE RESTRICTION: Block Instructors from Web
    if (!isMobile && user.role === 'instructor') {
      return res.status(403).json({ success: false, message: 'This account does not have access.' });
    }
    
    logAction(user.id, 'LOGIN', 'user', user.id, req);
    
    // 3. Dynamic Password Expiry Evaluation based on System Config
    const daysSinceChange = user.password_last_changed
      ? Math.floor((Date.now() - new Date(user.password_last_changed).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const expiryLimit = cfg.password_expiry_days ?? 365;
    if (expiryLimit > 0 && daysSinceChange >= expiryLimit) {
      const tempToken = jwt.sign({ id: user.id, email: user.email, purpose: 'password-reset' }, JWT_SECRET, { expiresIn: '15m' });
      return res.json({
        success: true,
        requiresPasswordReset: true,
        message: `Your password has expired (${daysSinceChange} days old; policy limit: ${expiryLimit} days). Please renew it to continue.`,
        tempToken,
        user: { id: user.id, role: user.role }
      });
    }

    
const tempToken = jwt.sign(
  {
    id: user.id,
    email: user.email,
    purpose: 'otp-pending',
    client: isMobile ? 'mobile' : 'web'
  },
  JWT_SECRET,
  { expiresIn: '5m' }
);

    res.json({
  success: true,
  message: 'Login successful.',
  requiresOtp: true,
  tempToken,
  email: user.email
});
  });
});

app.put('/api/users/:id/profile', authenticateToken, uploadProfilePic.single('profile_picture'), async (req, res) => {
  const userId = req.params.id;
  if (req.user.id.toString() !== userId.toString() && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { full_name, email, phone_number, base64_image } = req.body;

  try {
    let profile_picture = null;
    if (req.file) {
      profile_picture = `/uploads/profile_pictures/${req.file.filename}`;
    } else if (base64_image) {
      const buffer = Buffer.from(base64_image, 'base64');
      const filename = `profile_${Date.now()}.jpg`;
      const filePath = path.join(profilePicDir, filename);
      fs.writeFileSync(filePath, buffer);
      profile_picture = `/uploads/profile_pictures/${filename}`;
    }

    if (profile_picture && (!full_name || !email)) {
      await db.promise().query("UPDATE users SET profile_picture = ? WHERE id = ?", [profile_picture, userId]);
      return res.json({ success: true, message: 'Profile picture updated successfully', profile_picture });
    }

    if (!full_name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }

    let sql = "UPDATE users SET full_name = ?, email = ?, phone_number = ? WHERE id = ?";
    let params = [full_name, email, phone_number || null, userId];

    if (profile_picture) {
      sql = "UPDATE users SET full_name = ?, email = ?, phone_number = ?, profile_picture = ? WHERE id = ?";
      params = [full_name, email, phone_number || null, profile_picture, userId];
    }

    await db.promise().query(sql, params);
    res.json({ success: true, message: 'Profile updated successfully', profile_picture });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'That email is already in use.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/users/:identifier/update-password', authenticateToken, verifyOwnership, async (req, res) => {
  const { identifier } = req.params;
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new passwords are required.' });
  }
  
  if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'New password must be at least 8 characters, contain 1 uppercase letter, and 1 special character.' });
  }

  db.query("SELECT * FROM users WHERE (id = ? OR employee_id = ?)", [identifier, identifier], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database connection error." });
    if (results.length === 0) return res.status(404).json({ success: false, message: "User not found." });
    
    const user = results[0];
    let match = false;
    try {
      match = await verifyAccountPassword(user, currentPassword.trim());
    } catch (passwordError) {
      console.error('Password verification error:', passwordError);
      return res.status(503).json({ success: false, message: 'Unable to verify credentials at this time.' });
    }
    if (!match) {
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
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Password reset is restricted to System Administrators.'
    });
  }

  const { newPassword } = req.body;
  const userId = req.params.id;

  if (!newPassword || newPassword.trim().length < 8 || !/[A-Z]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters, contain 1 uppercase letter, and 1 special character.' });
  }
  
  try {
        const [targetRows] = await db.promise().query('SELECT role,status,employment_status FROM users WHERE id=? LIMIT 1',[userId]);
    if (!targetRows.length) return res.status(404).json({success:false,message:'User not found.'});
    if (!['active','deactivated'].includes(targetRows[0].status) || !targetRows[0].role) {
      return res.status(409).json({success:false,message:'Provision account and assign a role before resetting its password.'});
    }
    if (String(req.user.id)===String(userId)) {
      return res.status(403).json({success:false,message:'Use your personal password-change flow for your own account.'});
    }
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

// Global helper accessible to all routes
const getPHDateTime = () => {
  const { date, time } = getPHTime();
  return `${date} ${time}`;
};

// ✅ Shared validation for report endpoints
function parseReportPeriod(month, year, { allowFuture = false } = {}) {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(m) || m < 1 || m > 12) {
    return { error: 'Month must be an integer between 1 and 12.' };
  }
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    return { error: 'Year must be an integer between 2000 and 2100.' };
  }
  if (!allowFuture) {
    const now = new Date();
    const currentYM = now.getFullYear() * 100 + (now.getMonth() + 1);
    if (y * 100 + m > currentYM) {
      return { error: 'Cannot generate reports for future periods.' };
    }
  }
  return { month: m, year: y };
}

const GEO_EXIT_SUBQUERY = `
  (
    SELECT DATE_FORMAT(MIN(t1.ping_time), '%H:%i:%s')
    FROM instructor_location_tracking t1
    WHERE t1.employee_id = u.employee_id
      AND t1.schedule_id = s.id
      AND t1.is_inside_campus = 0
      AND t1.location_enabled = 1
      AND DATE(t1.ping_time) = s.date 
      AND t1.ping_time > (
        SELECT MAX(t2.ping_time)      
        FROM instructor_location_tracking t2
        WHERE t2.employee_id = u.employee_id
          AND t2.schedule_id = s.id
          AND t2.is_inside_campus = 1
          AND DATE(t2.ping_time) = s.date  -- ✅ ADD THIS LINE
      )
  )
`;


// ==========================================
// C11.1: Machine-readable attendance response codes.
// Existing status, message, success and offline-sync flags remain unchanged.
// ==========================================
const c11AttendanceCode = (status, body) => {
  if (body?.code) return body.code;
  if (body?.success === true) {
    if (body.alreadyRecorded) return 'ATTENDANCE_ALREADY_RECORDED';
    if (body.alreadySubmitted) return 'OFFLINE_EVENT_ALREADY_SUBMITTED';
    if (body.pendingReview) return 'OFFLINE_EVENT_PENDING_REVIEW';
    return 'ATTENDANCE_SUCCESS';
  }
  if (status === 401) return 'AUTH_SESSION_EXPIRED';
  if (status === 403) return 'ATTENDANCE_FORBIDDEN';
  if (status === 429) return 'ATTENDANCE_RATE_LIMITED';
  if (status >= 500) return 'ATTENDANCE_SERVER_ERROR';
  const msg = String(body?.message || '').toLowerCase();
  if (/already clock|already recorded|already.*clocked|active clock-in|already.*attendance/.test(msg)) return 'ATTENDANCE_ALREADY_RECORDED';
  if (/gps|location|geofence|campus|coordinate/.test(msg)) return 'ATTENDANCE_LOCATION_REJECTED';
  if (/selfie|attachment|photo/.test(msg)) return 'ATTENDANCE_SELFIE_REQUIRED';
  if (/schedule|shift|grace|window|time/.test(msg)) return 'ATTENDANCE_SCHEDULE_REJECTED';
  if (/pending|correction/.test(msg)) return 'ATTENDANCE_REVIEW_REQUIRED';
  if (status === 409) return 'ATTENDANCE_CONFLICT';
  if (status === 400 || status === 422) return 'ATTENDANCE_VALIDATION_ERROR';
  return 'ATTENDANCE_REQUEST_FAILED';
};

app.use('/api/attendance', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = body => {
    if (body && typeof body === 'object' && !Array.isArray(body) &&
        typeof body.success === 'boolean' && !body.code) {
      return originalJson({ ...body, code: c11AttendanceCode(res.statusCode, body) });
    }
    return originalJson(body);
  };
  next();
});

// C11.2: Same-process overlapping upload protection. The database's unique
// schedule constraint remains the authoritative cross-process safeguard.
const c11ActiveAttendanceRequests = new Set();
const c11SingleFlight = action => (req, res, next) => {
  const schedule = String(req.body?.schedule_id || '').trim();
  const userId = String(req.user?.id || '').trim();
  if (!userId || !schedule) return next(); // existing endpoint validates these
  const key = `${userId}:${schedule}:${action}`;
  if (c11ActiveAttendanceRequests.has(key)) {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(409).json({ success: false,
      code: 'ATTENDANCE_REQUEST_IN_PROGRESS',
      message: 'Attendance submission is already processing for this shift.' });
  }
  c11ActiveAttendanceRequests.add(key);
  const release = () => c11ActiveAttendanceRequests.delete(key);
  res.once('finish', release);
  res.once('close', release);
  next();
};

/* ==========================================
   C06 — OFFLINE ATTENDANCE SYNC
   Delayed events require HR verification.
   ========================================== */


app.post(
  '/api/attendance/offline-sync',
  authenticateToken,
  uploadCorrectionFiles,
  async (req, res) => {
    const file = req.files?.selfie?.[0];

    const discardFile = () => {
      if (file?.path) {
        fs.promises.unlink(file.path).catch(() => {});
      }
    };

    const reject = (status, message) => {
      discardFile();

      return res.status(status).json({
        success: false,
        message
      });
    };

    const {
      event_id,
      event_type,
      occurred_at,
      schedule_id,
      latitude,
      longitude
    } = req.body || {};

    // 1. Only instructors can submit offline attendance.
    if (req.user.role !== 'instructor') {
      return reject(403, 'Only instructors may sync attendance.');
    }

    if (!file) {
      return reject(400, 'Attendance selfie is required.');
    }

    // 2. Validate the offline event.
    if (
      !/^[a-z0-9]{8,80}$/i.test(String(event_id || '')) ||
      !['clock-in', 'clock-out'].includes(event_type)
    ) {
      return reject(400, 'Invalid offline event.');
    }

    // 3. Validate original device-reported timestamp.
    if (
      typeof occurred_at !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(occurred_at)
    ) {
      return reject(400, 'Invalid original attendance timestamp.');
    }

    const occurredMs = Date.parse(occurred_at);
    const nowMs = Date.now();

    if (
      !Number.isFinite(occurredMs) ||
      occurredMs > nowMs + 5 * 60 * 1000 ||
      nowMs - occurredMs > 30 * 24 * 60 * 60 * 1000
    ) {
      return reject(
        400,
        'Offline attendance time is in the future or older than 30 days.'
      );
    }

    // 4. Validate GPS coordinates.
    const lat = Number(latitude);
    const lon = Number(longitude);

    if (
      latitude === undefined ||
      longitude === undefined ||
      latitude === '' ||
      longitude === '' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180 ||
      (lat === 0 && lon === 0)
    ) {
      return reject(400, 'Valid GPS coordinates are required.');
    }

    // 5. Validate schedule ID.
    if (
      !/^\d+$/.test(String(schedule_id || '')) ||
      Number(schedule_id) <= 0 ||
      !Number.isSafeInteger(Number(schedule_id))
    ) {
      return reject(400, 'A valid schedule ID is required.');
    }

    // Convert original UTC timestamp to Philippine date and time.
    const phDateTime = new Date(
      occurredMs + 8 * 60 * 60 * 1000
    ).toISOString();

    const attendanceDate = phDateTime.slice(0, 10);
    const attendanceTime = phDateTime.slice(11, 19);

    const marker = `[OFFLINE_SYNC:${event_id}]`;

    const correctionType =
      event_type === 'clock-in'
        ? 'clock_in'
        : 'clock_out';

    // 6. Initialize connection safely.
    let connection = null;
    let transactionStarted = false;
    let committed = false;

    try {
      connection = await db.promise().getConnection();

      await connection.beginTransaction();
      transactionStarted = true;

      // 7. Verify authenticated employee.
      // Lock user row to serialize submissions for this account.
      const [users] = await connection.query(
        `SELECT id, employee_id
         FROM users
         WHERE id = ?
           AND status = 'active'
         FOR UPDATE`,
        [req.user.id]
      );

      if (!users.length) {
        await connection.rollback();
        transactionStarted = false;

        return reject(403, 'Employee account is unavailable.');
      }

      const user = users[0];

      // 8. Verify schedule ownership.
      // Supports both employee_id and internal users.id.
      const [schedules] = await connection.query(
        `SELECT s.id, s.place
         FROM schedules s
         WHERE s.id = ?
           AND (s.user_id = ? OR s.user_id = ?)
           AND DATE(s.date) = ?
         LIMIT 1`,
        [
          Number(schedule_id),
          user.employee_id,
          user.id,
          attendanceDate
        ]
      );

      if (!schedules.length) {
        await connection.rollback();
        transactionStarted = false;

        return reject(
          400,
          'The offline event does not match your assigned schedule.'
        );
      }

      // 9. Verify the reported location.
      const [locations] = await connection.query(
        `SELECT latitude, longitude, radius
         FROM school_locations
         WHERE name = ?
         LIMIT 1`,
        [schedules[0].place]
      );

      if (!locations.length) {
        await connection.rollback();
        transactionStarted = false;

        return reject(
          400,
          'Scheduled location is not registered.'
        );
      }

      const school = locations[0];

      const schoolLat = Number(school.latitude);
      const schoolLon = Number(school.longitude);
      const schoolRadius = Number(school.radius);

      if (
        !Number.isFinite(schoolLat) ||
        !Number.isFinite(schoolLon) ||
        !Number.isFinite(schoolRadius) ||
        schoolRadius <= 0
      ) {
        await connection.rollback();
        transactionStarted = false;

        return reject(
          500,
          'Scheduled location configuration is invalid.'
        );
      }

      const distance = getDistanceFromLatLonInMeters(
        lat,
        lon,
        schoolLat,
        schoolLon
      );

      if (!Number.isFinite(distance) || distance > schoolRadius) {
        await connection.rollback();
        transactionStarted = false;

        return reject(
          403,
          'Reported attendance location is outside the scheduled campus.'
        );
      }

      // 10. Prevent duplicate submissions of the same event.
      const [duplicates] = await connection.query(
        `SELECT id
         FROM attendance_corrections
         WHERE user_id = ?
           AND reason LIKE ?
         LIMIT 1`,
        [user.id, `${marker}%`]
      );

      if (duplicates.length) {
        await connection.rollback();
        transactionStarted = false;

        discardFile();

        return res.json({
          success: true,
          pendingReview: true,
          alreadySubmitted: true,
          message: 'This offline event was already submitted to HR.'
        });
      }

      
      // C09.5: Reconcile a previously recorded action.
      const [officialAttendance] = await connection.query(
        `SELECT
           id,
           TIME_TO_SEC(time_in) AS clock_in_seconds,
           TIME_TO_SEC(time_out) AS clock_out_seconds
         FROM attendance
         WHERE user_id = ?
           AND schedule_id = ?
           AND DATE(date) = ?
         LIMIT 1`,
        [
          user.employee_id,
          Number(schedule_id),
          attendanceDate
        ]
      );

      if (officialAttendance.length > 0) {
        const record = officialAttendance[0];

        const parts = attendanceTime.split(':').map(Number);

        const originalSeconds =
          parts[0] * 3600 +
          parts[1] * 60 +
          parts[2];

        const recordedValue =
          correctionType === 'clock_in'
            ? record.clock_in_seconds
            : record.clock_out_seconds;

        const recordedSeconds =
          recordedValue == null
            ? NaN
            : Number(recordedValue);

        // Compare timestamps within 2 minutes.
        const rawDifference = Math.abs(
          recordedSeconds - originalSeconds
        );

        // Account for midnight crossing.
        const difference = Math.min(
          rawDifference,
          86400 - rawDifference
        );

        if (
          Number.isFinite(originalSeconds) &&
          Number.isFinite(recordedSeconds) &&
          rawDifference <= 86400 &&
          difference <= 120
        ) {
          await connection.rollback();
          transactionStarted = false;

          discardFile();

          return res.status(200).json({
            success: true,
            pendingReview: true,
            alreadyRecorded: true,
            message:
              'Matching attendance is already recorded. ' +
              'No additional HR correction is required.'
          });
        }
      }




      // 11. Prevent repeated correction requests for
      // the same shift and attendance action.
      const requestedColumn =
        correctionType === 'clock_in'
          ? 'requested_clock_in'
          : 'requested_clock_out';

      const [existing] = await connection.query(
        `SELECT id
         FROM attendance_corrections
         WHERE user_id = ?
           AND schedule_id = ?
           AND attendance_date = ?
           AND status IN ('pending', 'approved')
           AND ${requestedColumn} IS NOT NULL
         LIMIT 1`,
        [
          user.id,
          Number(schedule_id),
          attendanceDate
        ]
      );

      if (existing.length) {
        await connection.rollback();
        transactionStarted = false;

        return reject(
          409,
          'An attendance correction for this shift and action already exists. Please contact HR.'
        );
      }

      // 12. Limit pending correction requests.
      const [pendingCounts] = await connection.query(
        `SELECT COUNT(*) AS total
         FROM attendance_corrections
         WHERE user_id = ?
           AND status = 'pending'`,
        [user.id]
      );

      if (Number(pendingCounts[0]?.total || 0) >= 10) {
        await connection.rollback();
        transactionStarted = false;

        return reject(
          429,
          'Too many pending corrections. Please wait for HR review.'
        );
      }

      // 13. Prepare HR review information.
      const reason =
        `${marker} Delayed ${correctionType} submission. ` +
        `Device-reported time: ${occurred_at}. ` +
        `GPS: ${lat}, ${lon}. ` +
        'Original time and GPS are device-reported and require HR verification.';

      // 14. Insert pending attendance correction.
      const [inserted] = await connection.query(
        `INSERT INTO attendance_corrections
         (
           user_id,
           attendance_date,
           schedule_id,
           requested_clock_in,
           requested_clock_out,
           reason,
           selfie_url,
           status
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          user.id,
          attendanceDate,
          Number(schedule_id),
          correctionType === 'clock_in'
            ? attendanceTime
            : null,
          correctionType === 'clock_out'
            ? attendanceTime
            : null,
          reason,
          `/uploads/corrections/${file.filename}`
        ]
      );

      // 15. Commit only after successful insertion.
      await connection.commit();

      committed = true;
      transactionStarted = false;

      // Audit logging should not invalidate a successful
      // attendance correction submission.
      try {
        logAction(
          req.user.id,
          'OFFLINE_ATTENDANCE_SUBMITTED',
          'attendance_correction',
          inserted.insertId,
          req,
          null,
          {
            event_id,
            event_type,
            occurred_at
          }
        );
      } catch (auditError) {
        console.error(
          'Offline attendance audit logging error:',
          auditError.message
        );
      }

      // 16. Return successful submission.
      return res.status(200).json({
        success: true,
        pendingReview: true,
        correctionId: inserted.insertId,
        message: 'Offline attendance submitted for HR review.'
      });

    } catch (error) {
      // Only roll back if the transaction is still active.
      if (connection && transactionStarted && !committed) {
        await connection.rollback().catch((rollbackError) => {
          console.error(
            'Offline attendance rollback error:',
            rollbackError.message
          );
        });
      }

      console.error('Offline attendance sync error:', error);

      // Do not delete a file belonging to an already
      // committed correction.
      if (!committed) {
        discardFile();
      }

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: committed
            ? 'Attendance submitted, but the response could not be completed.'
            : 'Unable to submit offline attendance.'
        });
      }

    } finally {
      // Release only an acquired database connection.
      if (connection) {
        connection.release();
      }
    }
  }
);



app.post('/api/attendance/clock-in', clockLimiter, authenticateToken, multerSelfie.single('selfie'), c11SingleFlight('clock-in'), async (req, res) => {
  let { latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A selfie is required to verify your attendance.' });
  }
  
  
const parsedLat = Number(latitude);
const parsedLon = Number(longitude);

 

if (
  latitude === undefined ||
  latitude === null ||
  longitude === undefined ||
  longitude === null ||
  String(latitude).trim() === '' ||
  String(longitude).trim() === '' ||
  !Number.isFinite(parsedLat) ||
  !Number.isFinite(parsedLon) ||
  parsedLat < -90 ||
  parsedLat > 90 ||
  parsedLon < -180 ||
  parsedLon > 180 ||
  (parsedLat === 0 && parsedLon === 0)
) {
  if (req.file?.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  return res.status(400).json({
    success: false,
    message: 'Invalid GPS coordinates. Enable location services and try again.'
  });
}


// C08: Validate reported GPS accuracy and freshness.
const gpsQualityError = validateAttendanceGpsQuality(req.body);

if (gpsQualityError) {
  if (req.file?.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  return res.status(400).json({
    success: false,
    message: gpsQualityError
  });
}



    

  const selfiePath = `/uploads/selfies/${req.file.filename}`;
  const { date: todayDate, time: currentTime } = getPHTime();

  
const connection = await db.promise().getConnection();
let attendanceCommitted = false;

try {
  await connection.beginTransaction();
    const [userRows] = await connection.query(
      "SELECT employee_id, full_name FROM users WHERE id = ? AND status = 'active' FOR UPDATE",
      [userId]
    );
    if (userRows.length === 0) {
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'User inactive or not found.' });
    }
    const employee_id = userRows[0].employee_id;

    if (!schedule_id || schedule_id === 'undefined' || schedule_id === 'null') {
      const [autoSched] = await connection.query(
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
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'No active schedule found for today to check in.' });
    }

    
const [schedRows] = await connection.query(
  `SELECT id, place, start_time, end_time
   FROM schedules
   WHERE id = ?
     AND user_id = ?
     AND DATE(date) = ?`,
  [schedule_id, employee_id, todayDate]
);

    if (schedRows.length === 0) {
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'No work schedule found.' });
    }
    const { place: schedulePlace, start_time: scheduledStartTime, end_time: scheduledEndTime } = schedRows[0];

    // 🚨 STEP 2 & 3: Explicit Approved Leave Check & Half-Day Logic
    const [leaveCheck] = await connection.query(
      "SELECT duration FROM leave_requests WHERE (user_id = ? OR user_id = ?) AND request_date = ? AND status = 'Approved'",
      [employee_id, userId, todayDate]
    );

    if (leaveCheck.length > 0) {
      // Convert current PHT time (HH:mm:ss) to total minutes once
      const [currentHour, currentMinute] = currentTime.split(':').map(Number);
      const currentTotalMins = (currentHour * 60) + currentMinute;
      const NOON_MINS = 12 * 60; // 12:00 PM

      // Evaluate EVERY approved leave for the day, not just the first one.
      // This correctly handles the (rare) case where both a 1st Half and a
      // 2nd Half leave are approved — the combined rule becomes a Whole Day block.
      for (const row of leaveCheck) {
        const duration = row.duration;
        let blockReason = null;

        if (duration === 'Whole Day') {
          blockReason = 'You are on an approved leave for today (Whole Day). Please contact HR if you need to cancel your leave.';
        } else if (duration === '1st Half' && currentTotalMins < NOON_MINS) {
          blockReason = 'You are on an approved leave for the 1st Half of today. Clock-in will be available after 12:00 PM.';
        } else if (duration === '2nd Half' && currentTotalMins >= NOON_MINS) {
          blockReason = 'You are on an approved leave for the 2nd Half of today. Clock-in is only available before 12:00 PM.';
        }

        if (blockReason) {
          await connection.rollback();
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(403).json({ success: false, message: blockReason });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────

  
const [existingAttendance] = await connection.query(
  `SELECT id, time_in, time_out, status
   FROM attendance
   WHERE user_id = ?
     AND schedule_id = ?
     AND DATE(date) = ?
   LIMIT 1`,
  [employee_id, schedule_id, todayDate]
);

if (existingAttendance.length > 0) {
  await connection.rollback();

  if (req.file?.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  return res.status(409).json({
    success: false,
    message:
      'An attendance record already exists for this schedule. ' +
      'Duplicate clock-in is not allowed.'
  });
}


    
// C10.2: Overnight schedules end on the NEXT calendar day.
const c10StartSec = c10ParseTimeSeconds(scheduledStartTime);
const c10EndSec = c10ParseTimeSeconds(scheduledEndTime);
if (c10StartSec == null || c10EndSec == null) {
  await connection.rollback();
  if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
  return res.status(409).json({ success: false, message: 'Schedule has invalid start/end times.' });
}
const c10OvernightSchedule = c10EndSec <= c10StartSec;
if (!c10OvernightSchedule && currentTime > scheduledEndTime) {
  await connection.query(
    `INSERT INTO attendance
     (user_id, schedule_id, date, status, location)
     VALUES (?, ?, ?, 'missed schedule', 'Missed Schedule')`,
    [employee_id, schedule_id, todayDate]
  );

  await connection.commit();

  if (req.file?.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  return res.status(403).json({
    success: false,
    message:
      'This shift has already passed and has been marked as Missed Schedule.'
  });
}


    const scheduledStart = new Date(`1970-01-01T${scheduledStartTime}`);
    const actualTime = new Date(`1970-01-01T${currentTime}`);
    const diffMinutes = (actualTime - scheduledStart) / 60000;

    if (diffMinutes < -15) {
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({
        success: false,
        message: `Too early to clock in. Allowed from 15 minutes before (${formatTo12Hour(scheduledStartTime)}).`
      });
    }

    const [locRows] = await connection.query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    if (locRows.length === 0) {
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `Location '${schedulePlace}' not registered in the system.` });
    }
    const schoolGeo = locRows[0];

    const distance = getDistanceFromLatLonInMeters(parsedLat, parsedLon, schoolGeo.latitude, schoolGeo.longitude);
    
if (distance > schoolGeo.radius) {
  await connection.rollback();
  if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
  return res.status(403).json({
    success: false,
    message: `Not within ${schedulePlace} campus. Distance: ${Math.round(distance)}m`
  });
}

    // ── LAYER 2: server-side spoofing heuristics ─────────────────────
    try {
      const recentPings = await getRecentLocationPings(connection, employee_id, 10);
      const heuristic = checkLocationHeuristics(
        recentPings, parsedLat, parsedLon, `${todayDate} ${currentTime}`
      );

      if (heuristic.suspicious) {
        logAction(userId, 'SUSPICIOUS_LOCATION', 'attendance', null, req, null, {
          event: 'clock_in',
          flags: heuristic.flags,
          lat: parsedLat,
          lon: parsedLon
        });

        // ⚡ Push to any admin currently viewing the Location Tracking page
        broadcastToAdminAndHR({
          type: 'suspicious_location',
          event: {
            employee_id,
            full_name: userRows[0].full_name,
            event_type: 'clock_in',
            flags: heuristic.flags,
            lat: parsedLat,
            lon: parsedLon,
            created_at: getPHDateTime()
          }
        });

        const severeFlag = heuristic.flags.some(f =>
          f.reason === 'Impossible travel speed' &&
          Number(f.speed_kmh) >= SPOOF_BLOCK_SPEED_KMH
        );

        if (severeFlag) {
          await connection.rollback();
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          return res.status(403).json({
            success: false,
            message: 'Location verification failed. Please contact HR to clock in.'
          });
        }
      }
    } catch (heuristicErr) {
      // Never let the heuristic crash the clock-in — log and continue
      console.warn('Spoofing heuristic check failed (non-blocking):', heuristicErr.message);
    }
    // ─────────────────────────────────────────────────────────────────

    const [existing] = await connection.query(
      "SELECT id FROM attendance WHERE user_id = ? AND schedule_id = ? AND DATE(date) = ?", 
      [employee_id, schedule_id, todayDate]
    );
    if (existing.length > 0) {
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'You have already clocked in for this schedule today.' });
    }

    const [activeShift] = await connection.query(
      "SELECT id FROM attendance WHERE user_id = ? AND DATE(date) = ? AND time_out IS NULL AND status != 'missed schedule'", 
      [employee_id, todayDate]
    );
    if (activeShift.length > 0) {
      await connection.rollback();
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'You already have an active clock-in for today. Please clock out first.' });
    }

    const status = diffMinutes > 30 ? 'late' : 'present';

    const [result] = await connection.query(
      `INSERT INTO attendance 
        (user_id, schedule_id, date, time_in, status, clock_in_selfie,
         clock_in_latitude, clock_in_longitude, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, schedule_id, todayDate, currentTime, status,
       selfiePath, parsedLat, parsedLon,
       `${schedulePlace} (${parsedLat.toFixed(6)}, ${parsedLon.toFixed(6)})`]
    );

    // 🚨 Auto-cancel pending leave if they clock in
    await connection.query(
      `UPDATE leave_requests 
       SET status = 'Cancelled', 
           admin_remarks = '[Auto-cancelled by system: Employee clocked in]',
           reviewed_at = ?
       WHERE (user_id = ? OR user_id = ?) AND request_date = ? AND status = 'Pending'`,
      [getPHDateTime(), employee_id, userId, todayDate]
    );

    await connection.query(
      `INSERT INTO instructor_location_tracking 
       (employee_id, schedule_id, latitude, longitude, location_name, is_inside_campus, location_enabled, ping_time)
       VALUES (?, ?, ?, ?, ?, 1, 1, NOW())`,
      [employee_id, schedule_id, parsedLat, parsedLon, schedulePlace]
    );

    await connection.query(
      "UPDATE users SET last_location_ping = NOW(), location_tracking_enabled = 1 WHERE employee_id = ?",
      [employee_id]
    );

    
await connection.commit();
attendanceCommitted = true;

try {
  logAction(
    req.user.id,
    'CLOCK_IN',
    'attendance',
    result.insertId,
    req
  );

  await broadcastInstructorStatus(employee_id);
} catch (notificationError) {
  console.error(
    'Clock-in follow-up notification failed:',
    notificationError
  );
}

return res.json({
  success: true,
  message: `Clocked in successfully as ${status} at ${formatTo12Hour(currentTime)}.`
});

} catch (err) {
  console.error('Clock-in error:', err);

  if (attendanceCommitted) {
    if (!res.headersSent) {
      return res.json({
        success: true,
        message:
          'Clock-in was saved. Refresh attendance to confirm its status.'
      });
    }
    return;
  }

  try {
    await connection.rollback();
  } catch (rollbackError) {
    console.error('Clock-in rollback failed:', rollbackError);
  }

  if (req.file?.path && fs.existsSync(req.file.path)) {
    fs.unlinkSync(req.file.path);
  }

  if (!res.headersSent) {
    return res.status(500).json({
      success: false,
      message: 'A server error occurred during clock-in.'
    });
  }
} finally {
  connection.release();
}

});

app.post('/api/attendance/clock-out', clockLimiter, authenticateToken, multerSelfie.single('selfie'), c11SingleFlight('clock-out'), async (req, res) => {
  const discardSelfie = () => {
      if (req.file?.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
    };
    let clockOutSaved = false;
  let { latitude, longitude, schedule_id } = req.body;
  const userId = req.user.id;

  // 1. STRICT PAYLOAD VALIDATION: Require selfie and valid GPS
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'A selfie is required to verify your clock-out.' });
  }
  
  
const parsedLat = Number(latitude);
const parsedLon = Number(longitude);

  


if (
  latitude === undefined ||
  latitude === null ||
  longitude === undefined ||
  longitude === null ||
  String(latitude).trim() === '' ||
  String(longitude).trim() === '' ||
  !Number.isFinite(parsedLat) ||
  !Number.isFinite(parsedLon) ||
  parsedLat < -90 ||
  parsedLat > 90 ||
  parsedLon < -180 ||
  parsedLon > 180 ||
  (parsedLat === 0 && parsedLon === 0)
) {
  if (req.file?.path) {
    fs.promises.unlink(req.file.path).catch(() => {});
  }

  return res.status(400).json({
    success: false,
    message: 'Invalid GPS coordinates. Enable location services and try again.'
  });
}


// C08: Validate reported GPS accuracy and freshness.
const gpsQualityError = validateAttendanceGpsQuality(req.body);

if (gpsQualityError) {
  discardSelfie();

  return res.status(400).json({
    success: false,
    message: gpsQualityError
  });
}





  const selfiePath = `/uploads/selfies/${req.file.filename}`;
  const { date: todayDate, time: currentTime } = getPHTime();

  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id, full_name FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    
if (userRows.length === 0) {
  discardSelfie();

  return res.status(403).json({
    success: false,
    message: 'User inactive or not found.'
  });
}

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
  discardSelfie();

  return res.status(400).json({
    success: false,
    message: 'No active schedule found for today to check out.'
  });
}


    
const [schedRows] = await db.promise().query(
  `SELECT place, start_time, end_time,
          DATE_FORMAT(date, '%Y-%m-%d') AS shift_date
   FROM schedules
   WHERE id = ?
     AND user_id = ?
     AND DATE(date) BETWEEN DATE_SUB(DATE(?), INTERVAL 1 DAY) AND DATE(?)`,
  [schedule_id, employee_id, todayDate, todayDate]
);

    
if (schedRows.length === 0) {
  discardSelfie();

  return res.status(403).json({
    success: false,
    message: 'Schedule not found.'
  });
}

    const { place: schedulePlace, start_time: scheduledStartTime,
            end_time: scheduledEndTime, shift_date: shiftDate } = schedRows[0];

    // C10.2: compare full Philippine timestamps, not clock times only.
    const startSeconds = c10ParseTimeSeconds(scheduledStartTime);
    const endSeconds = c10ParseTimeSeconds(scheduledEndTime);
    if (startSeconds == null || endSeconds == null) {
      discardSelfie();
      return res.status(409).json({ success: false, message: 'Schedule times are invalid.' });
    }
    const shiftEndMs = Date.parse(`${shiftDate}T${scheduledEndTime}+08:00`) +
      (endSeconds <= startSeconds ? 86400000 : 0);
    const currentMs = Date.parse(`${todayDate}T${currentTime}+08:00`);
    if (!Number.isFinite(shiftEndMs) || !Number.isFinite(currentMs)) {
      discardSelfie();
      return res.status(409).json({ success: false, message: 'Unable to validate shift times.' });
    }
    const minutesFromEnd = (currentMs - shiftEndMs) / 60000;
    const EARLY_GRACE_MINUTES = 5;
    const LATE_GRACE_MINUTES = 15;

    if (minutesFromEnd < -EARLY_GRACE_MINUTES) {
  discardSelfie();

  return res.status(403).json({
    success: false,
    message: `Too early to clock out. You may only clock out starting 5 minutes before your shift ends (${formatTo12Hour(scheduledEndTime)}).`
  });
}


    // 2. Check if clocking out too late
    
if (minutesFromEnd > LATE_GRACE_MINUTES) {
  discardSelfie();

  return res.status(403).json({
    success: false,
    message: 'Clock-out is too late. The 15-minute grace period has expired. Please file an Overtime request or an Attendance Correction for this shift.'
  });
}


    const [locRows] = await db.promise().query(
      "SELECT latitude, longitude, radius FROM school_locations WHERE name = ?",
      [schedulePlace]
    );
    
if (locRows.length === 0) {
  discardSelfie();

  return res.status(400).json({
    success: false,
    message: `Location '${schedulePlace}' not registered in the system.`
  });
}

    const schoolGeo = locRows[0];

    // Calculate distance strictly using provided GPS coordinates
    const distance = getDistanceFromLatLonInMeters(parsedLat, parsedLon, schoolGeo.latitude, schoolGeo.longitude);
   
if (distance > schoolGeo.radius) {
  discardSelfie();

  return res.status(403).json({
    success: false,
    message: `Not within ${schedulePlace} campus. Distance: ${Math.round(distance)}m`
  });
}


    // ── LAYER 2: server-side spoofing heuristics ─────────────────────
    try {
      const recentPings = await getRecentLocationPings(db.promise(), employee_id, 10);
      const heuristic = checkLocationHeuristics(
        recentPings, parsedLat, parsedLon, `${todayDate} ${currentTime}`
      );

      if (heuristic.suspicious) {
  logAction(userId, 'SUSPICIOUS_LOCATION', 'attendance', null, req, null, {
    event: 'clock_out',
    flags: heuristic.flags,
    lat: parsedLat,
    lon: parsedLon
  });

  // ⚡ Push to any admin currently viewing the Location Tracking page
  broadcastToAdminAndHR({
    type: 'suspicious_location',
    event: {
      employee_id,
      full_name: userRows[0].full_name,
      event_type: 'clock_out',
      flags: heuristic.flags,
      lat: parsedLat,
      lon: parsedLon,
      created_at: getPHDateTime()
    }
  });

  const severeFlag = heuristic.flags.some(f =>
    f.reason === 'Impossible travel speed' &&
    Number(f.speed_kmh) >= SPOOF_BLOCK_SPEED_KMH
  );

  if (severeFlag) {
    
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(403).json({
  success: false,
  message: 'Location verification failed. Please contact HR to clock out.'
});
  }
}
    } catch (heuristicErr) {
      console.warn('Spoofing heuristic check failed (non-blocking):', heuristicErr.message);
    }
    // ─────────────────────────────────────────────────────────────────

    
const [existing] = await db.promise().query(
  `SELECT id, time_in
   FROM attendance
   WHERE user_id = ?
     AND schedule_id = ?
     AND DATE(date) = ?
     AND time_in IS NOT NULL
     AND time_out IS NULL
   ORDER BY id DESC
   LIMIT 1`,
  [employee_id, schedule_id, shiftDate]
);


if (existing.length === 0) {
  discardSelfie();

  return res.status(409).json({
    success: false,
    message: 'No active clock-in found. You may have already clocked out.'
  });
}



// C10.2: reject impossible durations and correctly handle midnight crossing.
const [clockInTimeRows] = await db.promise().query(
  `SELECT time_in FROM attendance WHERE id = ? LIMIT 1`,
  [existing[0].id]
);
const calculatedHours = c10AttendanceHours(
  clockInTimeRows[0]?.time_in,
  currentTime
);
if (calculatedHours == null) {
  discardSelfie();
  return res.status(409).json({
    success: false,
    message: 'Clock-out would produce invalid or excessive work hours. Please contact HR.'
  });
}

const [clockOutResult] = await db.promise().query(
  `UPDATE attendance
   SET
     time_out = ?,
     clock_out_selfie = ?,
     clock_out_latitude = ?,
     clock_out_longitude = ?,
     location = ?,
     total_hours = ?,
     status = 'completed'
   WHERE id = ?
     AND time_in IS NOT NULL
     AND time_out IS NULL`,
  [
    currentTime,
    selfiePath,
    parsedLat,
    parsedLon,
    schedulePlace,
    calculatedHours,
    existing[0].id
  ]
);



if (clockOutResult.affectedRows !== 1) {
  discardSelfie();

  return res.status(409).json({
    success: false,
    message: 'This attendance record has already been clocked out.'
  });
}
clockOutSaved = true;



    await db.promise().query(
      "UPDATE users SET location_tracking_enabled = 0 WHERE employee_id = ?",
      [employee_id]
    );

try {
  await broadcastInstructorStatus(employee_id);

  logAction(
    req.user.id,
    'CLOCK_OUT',
    'attendance',
    existing[0].id,
    req
  );
} catch (notificationError) {
  console.error(
    'Clock-out follow-up notification failed:',
    notificationError
  );
}

    // Return success after attendance has been saved.
    return res.json({
      success: true,
      message: `Clocked out successfully at ${formatTo12Hour(currentTime)}.`
    });

  } catch (err) {
    console.error('Clock-out error:', err);

    if (clockOutSaved) {
      console.error(
        'Clock-out was saved, but a follow-up operation failed:',
        err
      );

      if (!res.headersSent) {
        return res.status(200).json({
          success: true,
          message:
            'Clock-out was saved successfully. ' +
            'Refresh attendance to confirm its status.'
        });
      }

      return;
    }

    discardSelfie();

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'A server error occurred during clock-out.'
      });
    }
  }
});

async function uvIsPayrollSnapshotLocked(
  connection,
  userId,
  workDate
) {
  const [rows] = await connection.query(
    `SELECT id
     FROM payroll
     WHERE user_id = ?
       AND (
         (
           period_start IS NOT NULL
           AND DATE(?) BETWEEN period_start AND period_end
         )
         OR (
           period_start IS NULL
           AND month_year = DATE_FORMAT(DATE(?), '%M %Y')
         )
       )
     LIMIT 1`,
    [userId, workDate, workDate]
  );

  // A saved payroll row is already a payroll snapshot.
  // Its 'pending' status means awaiting payment confirmation.
  return rows.length > 0;
}

async function uvSyncCorrectionPending(
  connection,
  internalId,
  employeeId,
  scheduleId,
  workDate
) {
  if (!scheduleId) return;

  const [pending] = await connection.query(
    `SELECT id
     FROM attendance_corrections
     WHERE (user_id = ? OR user_id = ?)
       AND schedule_id = ?
       AND DATE(attendance_date) = DATE(?)
       AND status = 'pending'
     LIMIT 1`,
    [internalId, employeeId, scheduleId, workDate]
  );

  const [latest] = await connection.query(
    `SELECT status
     FROM attendance_corrections
     WHERE (user_id = ? OR user_id = ?)
       AND schedule_id = ?
       AND DATE(attendance_date) = DATE(?)
     ORDER BY id DESC
     LIMIT 1`,
    [internalId, employeeId, scheduleId, workDate]
  );

  const hasPending = pending.length > 0;
  const correctionStatus = hasPending
    ? 'pending'
    : (latest[0]?.status || null);

  await connection.query(
    `UPDATE attendance
     SET correction_requested = ?,
         correction_status = ?
     WHERE (user_id = ? OR user_id = ?)
       AND schedule_id = ?
       AND DATE(date) = DATE(?)`,
    [
      hasPending ? 1 : 0,
      correctionStatus,
      employeeId,
      internalId,
      scheduleId,
      workDate
    ]
  );
}


app.put(
  '/api/attendance/update/:id',
  authenticateToken,
  requireAction('attendance:update'),
  async (req, res) => {
    if (req.user.role !== 'hr_admin') {
      return res.status(403).json({
        success: false,
        message: 'HR access required.'
      });
    }

    const id = Number(req.params.id);
    const { time_in, time_out, status, location } = req.body || {};

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance record ID.'
      });
    }

    const allowedStatuses = ['present', 'late', 'absent', 'on leave'];

    if (
      status !== undefined &&
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid attendance status.'
      });
    }

    const normalizeTime = value => {
      if (value === null || value === '') return null;

      if (
        typeof value !== 'string' ||
        !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)
      ) {
        throw new RangeError('Invalid clock time format.');
      }

      return value.length === 5 ? `${value}:00` : value;
    };

    let connection;
    let transactionStarted = false;

    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [rows] = await connection.query(
        `SELECT
           a.*,
           u.id AS internal_user_id
         FROM attendance a
         JOIN users u
           ON u.employee_id = a.user_id
         WHERE a.id = ?
         FOR UPDATE`,
        [id]
      );

      if (rows.length !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(rows.length === 0 ? 404 : 409).json({
          success: false,
          message: rows.length === 0
            ? 'Attendance record not found.'
            : 'Attendance ownership is ambiguous.'
        });
      }

      const original = rows[0];

      if (
        await uvIsPayrollSnapshotLocked(
          connection,
          original.internal_user_id,
          original.date
        )
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message:
            'Payroll already exists for this attendance period. ' +
            'Use an authorized payroll adjustment workflow.'
        });
      }

      const [pending] = await connection.query(
        `SELECT id
         FROM attendance_corrections
         WHERE (user_id = ? OR user_id = ?)
           AND schedule_id = ?
           AND DATE(attendance_date) = DATE(?)
           AND LOWER(status) = 'pending'
         LIMIT 1`,
        [
          original.internal_user_id,
          original.user_id,
          original.schedule_id,
          original.date
        ]
      );

      if (pending.length > 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message:
            'An attendance correction is pending for this shift. ' +
            'Review the request before editing attendance.'
        });
      }

      const nextIn = time_in === undefined
        ? original.time_in
        : normalizeTime(time_in);

      const nextOut = time_out === undefined
        ? original.time_out
        : normalizeTime(time_out);

      const nextStatus = status === undefined
        ? original.status
        : status;

      const nextLocation = location === undefined
        ? original.location
        : location === null
          ? null
          : typeof location === 'string'
            ? location.trim()
            : null;

      if (
        location !== undefined &&
        location !== null &&
        typeof location !== 'string'
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: 'Location must be a text value.'
        });
      }

      if (String(nextLocation || '').length > 200) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: 'Location must not exceed 200 characters.'
        });
      }

      if (!nextIn && nextOut) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          success: false,
          message: 'Clock-out requires an existing clock-in.'
        });
      }

      let totalHours = 0;

      if (nextIn && nextOut) {
        totalHours = c10AttendanceHours(nextIn, nextOut);

        if (totalHours === null) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message:
              'Attendance duration must be greater than zero ' +
              'and no more than 16 hours.'
          });
        }
      }

      const oldValues = {
        time_in: original.time_in,
        time_out: original.time_out,
        status: original.status,
        location: original.location,
        total_hours: original.total_hours
      };

      const newValues = {
        time_in: nextIn,
        time_out: nextOut,
        status: nextStatus,
        location: nextLocation,
        total_hours: Number(totalHours.toFixed(2))
      };

      const [result] = await connection.query(
        `UPDATE attendance
         SET time_in = ?,
             time_out = ?,
             status = ?,
             location = ?,
             total_hours = ?,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = ?`,
        [
          newValues.time_in,
          newValues.time_out,
          newValues.status,
          newValues.location,
          newValues.total_hours,
          id
        ]
      );

      if (result.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: 'Attendance could not be updated.'
        });
      }

      await connection.commit();
      transactionStarted = false;

      logAction(
        req.user.id,
        'MANUAL_UPDATE_ATTENDANCE',
        'attendance',
        id,
        req,
        oldValues,
        newValues
      );

      return res.json({
        success: true,
        message: 'Attendance updated successfully.'
      });

    } catch (error) {
      if (connection && transactionStarted) {
        await connection.rollback().catch(console.error);
      }

      if (error instanceof RangeError) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      console.error('Attendance update error:', error);

      return res.status(500).json({
        success: false,
        message: 'Attendance update failed.'
      });

    } finally {
      if (connection) connection.release();
    }
  }
);

// ============================================
// ATTENDANCE CORRECTIONS (Secured, Validated & Timezone-Synchronized)
// ============================================

app.post('/api/attendance/correction-request', authenticateToken, uploadCorrectionFiles, async (req, res) => {
  let { employee_id, date, type, time, reason, schedule_id } = req.body;
  const userId = req.user.id;

  const uploadedFile = req.file || (req.files && (
    req.files['attachment']?.[0] ||
    req.files['image']?.[0]      ||
    req.files['selfie']?.[0]
  ));
  const attachmentPath = uploadedFile ? `/uploads/corrections/${uploadedFile.filename}` : null;
  const phNow = getPHDateTime();

  if (!uploadedFile) {
    return res.status(400).json({
      success: false,
      message: 'Supporting proof/document (image or PDF) is required for correction requests.'
    });
  }

  if (!employee_id || !date || !type || !time || !reason || !reason.trim()) {
    return res.status(400).json({ success: false, message: 'Missing required fields.' });
  }

  const ALLOWED_TYPES = ['clock_in', 'clock_out', 'early_out'];
  if (!ALLOWED_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid correction type.' });
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 5) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a more detailed reason (minimum 5 characters).'
    });
  }
  if (trimmedReason.length > 500) {
    return res.status(400).json({
      success: false,
      message: 'Reason is too long (maximum 500 characters).'
    });
  }

  if (!isValidISOCalendarDate(date)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid calendar date. Expected a real YYYY-MM-DD date.'
    });
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid time format. Expected HH:mm or HH:mm:ss.'
    });
  }
  const normalizedTime = time.length === 5 ? `${time}:00` : time;

  const { date: today } = getPHTime();
  if (date > today) {
    return res.status(400).json({ success: false, message: 'Cannot request correction for future dates.' });
  }

  if (!isDateWithinAllowedRange(date)) {
    return res.status(400).json({
      success: false,
      message: 'Corrections are only allowed within the last 30 days.'
    });
  }

  try {
    const [userRows] = await db.promise().query(
      "SELECT id, employee_id FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid or inactive user account.' });
    }
    const resolvedEmployeeId = userRows[0].employee_id;

    const MAX_PENDING_CORRECTIONS = 10;
    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(`SELECT id FROM users WHERE id = ? FOR UPDATE`, [userId]);

      const [pendingCorrRows] = await connection.query(
        `SELECT COUNT(*) AS c FROM attendance_corrections
          WHERE (user_id = ? OR user_id = ?) AND status = 'pending'`,
        [resolvedEmployeeId, userId]
      );
      if (pendingCorrRows[0].c >= MAX_PENDING_CORRECTIONS) {
        await connection.rollback();
        return res.status(429).json({
          success: false,
          message: `You already have ${MAX_PENDING_CORRECTIONS} pending correction requests. Please wait for HR review.`
        });
      }

      
let scheduleRow;

if (
  !schedule_id ||
  schedule_id === 'undefined' ||
  schedule_id === 'null'
) {
  const [schedRows] = await connection.query(
    `SELECT id, start_time, end_time
     FROM schedules
     WHERE (user_id = ? OR user_id = ?)
       AND DATE(date) = DATE(?)
     ORDER BY start_time ASC
     LIMIT 2`,
    [resolvedEmployeeId, userId, date]
  );

  if (schedRows.length !== 1) {
    await connection.rollback();

    return res.status(409).json({
      success: false,
      message: schedRows.length === 0
        ? 'No assigned schedule found for this date.'
        : 'Multiple assigned shifts found. Select the specific shift before submitting a correction.'
    });
  }

  scheduleRow = schedRows[0];
  schedule_id = scheduleRow.id;
} else {
  const [schedVerify] = await connection.query(
    `SELECT id, start_time, end_time
     FROM schedules
     WHERE id = ?
       AND (user_id = ? OR user_id = ?)
       AND DATE(date) = DATE(?)`,
    [schedule_id, resolvedEmployeeId, userId, date]
  );

  if (schedVerify.length !== 1) {
    await connection.rollback();

    return res.status(400).json({
      success: false,
      message: 'The selected schedule does not belong to this instructor and date.'
    });
  }

  scheduleRow = schedVerify[0];
}

      const toMinutes = (t) => {
        const [h, m] = String(t).split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
      };
      const reqMin     = toMinutes(normalizedTime);
      const shiftStart = toMinutes(scheduleRow.start_time);
      const shiftEnd   = toMinutes(scheduleRow.end_time);

      if (type === 'clock_in') {
        if (reqMin < shiftStart - 120 || reqMin > shiftEnd) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Clock-in correction must fall within the shift window (${formatTo12Hour(scheduleRow.start_time)} – ${formatTo12Hour(scheduleRow.end_time)}), up to 2 hours before start.`
          });
        }
      } else if (type === 'clock_out') {
        if (reqMin < shiftStart || reqMin > shiftEnd + 240) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Clock-out correction must be after shift start (${formatTo12Hour(scheduleRow.start_time)}) and no later than 4 hours after shift end (${formatTo12Hour(scheduleRow.end_time)}).`
          });
        }
      } else if (type === 'early_out') {
        if (reqMin < shiftStart || reqMin >= shiftEnd) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Early departure time must be within the shift, strictly before the scheduled end (${formatTo12Hour(scheduleRow.end_time)}).`
          });
        }
      }

      const isClockInRequest = type === 'clock_in';
      const [existingCorr] = await connection.query(
        `SELECT id FROM attendance_corrections
          WHERE (user_id = ? OR user_id = ?)
            AND attendance_date = ?
            AND schedule_id = ?
            AND status IN ('pending', 'approved')
            AND ${isClockInRequest
                   ? 'requested_clock_in  IS NOT NULL'
                   : 'requested_clock_out IS NOT NULL'}`,
        [userId, resolvedEmployeeId, date, schedule_id]
      );

      if (existingCorr.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          message: `You already have a pending or approved ${type.replace('_', ' ')} request for this specific shift.`
        });
      }

      
const [insertResult] = await connection.query(
  `INSERT INTO attendance_corrections
   (
     user_id,
     attendance_date,
     schedule_id,
     correction_type,
     requested_clock_in,
     requested_clock_out,
     reason,
     selfie_url,
     status,
     created_at
   )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
  [
    userId,
    date,
    schedule_id,
    type,
    type === 'clock_in' ? normalizedTime : null,
    type !== 'clock_in' ? normalizedTime : null,
    trimmedReason,
    attachmentPath,
    phNow
  ]
);

await connection.query(
  `UPDATE attendance
   SET correction_requested = 1,
       correction_status = 'pending'
   WHERE (user_id = ? OR user_id = ?)
     AND schedule_id = ?
     AND DATE(date) = DATE(?)`,
  [
    resolvedEmployeeId,
    userId,
    schedule_id,
    date
  ]
);

      await connection.commit();

      logAction(userId, 'SUBMIT_CORRECTION', 'attendance_correction', insertResult.insertId, req);
      void c14NotifyHRPending('correction', insertResult.insertId, resolvedEmployeeId).catch(err => console.warn('C14 correction notify:',err.message));
      return res.json({ success: true, message: 'Correction request submitted. HR will review.' });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;  
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Correction request error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/attendance/corrections/user/:employeeId', authenticateToken, verifyOwnership, async (req, res) => {
  const { employeeId } = req.params;
  try {
    const [results] = await db.promise().query(
      `SELECT c.id, 
              c.schedule_id,
              c.correction_type,
              c.requested_clock_in, 
              c.requested_clock_out, 
              c.reason, 
              c.selfie_url, 
              c.status, 
              c.admin_remarks,
              DATE_FORMAT(c.attendance_date, '%Y-%m-%d') AS attendance_date, 
              DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
              DATE_FORMAT(c.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
              u.full_name,
              u.employee_id
       FROM attendance_corrections c 
       JOIN users u ON (c.user_id = u.id OR c.user_id = u.employee_id)
       WHERE (u.employee_id = ? OR u.id = ? OR c.user_id = ?)
       ORDER BY c.id DESC`,
      [employeeId, employeeId, employeeId]
    );
    res.json(results || []);
  } catch (err) {
    console.error("User history fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});


/* ==========================================
   C07 — TRANSACTIONAL ATTENDANCE CORRECTION REVIEW
   Compatible with C06 offline attendance
   ========================================== */

app.put(
  '/api/attendance/corrections/:id/review',
  authenticateToken,
  requireAction('corrections:review'),
  async (req, res) => {

    // 1. Role verification
    if (!['admin', 'hr_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden'
      });
    }

    const { id } = req.params;
    const { status, admin_remarks } = req.body || {};
    const phNow = getPHDateTime();

    if (!/^\d+$/.test(String(id)) || Number(id) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid correction ID.'
      });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be approved or rejected.'
      });
    }

    // Preserve existing admin remarks validation.
    const cleanAdminRemarks =
      admin_remarks == null
        ? null
        : String(admin_remarks).trim() || null;

    if (
      cleanAdminRemarks &&
      cleanAdminRemarks.length > 500
    ) {
      return res.status(400).json({
        success: false,
        message: 'Admin remarks must be 500 characters or fewer.'
      });
    }

    if (
  status === 'rejected' &&
  (!cleanAdminRemarks || cleanAdminRemarks.length < 5)
) {
  return res.status(400).json({
    success: false,
    message:
      'A rejection reason of 5–500 characters is required.'
  });
}

    let connection = null;
    let transactionStarted = false;
    let committed = false;

    try {
      // 2. Start transaction.
      connection = await db.promise().getConnection();

      await connection.beginTransaction();
      transactionStarted = true;

      // 3. Lock correction to prevent concurrent reviews.
      const [corr] = await connection.query(
        `SELECT
           c.*,
           u.employee_id,
           u.id AS internal_user_id
         FROM attendance_corrections c
         JOIN users u
           ON (
             c.user_id = u.id
             OR c.user_id = u.employee_id
           )
         WHERE c.id = ?
         FOR UPDATE`,
        [id]
      );

      if (!corr.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          success: false,
          message: 'Correction request not found.'
        });
      }

      // Do not review an ambiguously matched owner.
      if (corr.length !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: 'Correction ownership is ambiguous. Contact the administrator.'
        });
      }

      const record = corr[0];
      const empIdString = String(record.employee_id);
      const internalUserId = record.internal_user_id;

      // 4. Prevent self-review.
      if (
        String(internalUserId) === String(req.user.id)
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(403).json({
          success: false,
          message: 'You cannot review your own correction request.'
        });
      }

      // 5. Only pending corrections can be reviewed.
      if (record.status !== 'pending') {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: `This correction has already been ${record.status}.`
        });
      }

      const isOfflineCorrection =
        String(record.reason || '')
          .startsWith('[OFFLINE_SYNC:');

      // 6. Resolve schedule.
      let targetScheduleId = record.schedule_id;

      if (!targetScheduleId) {
        const [schedRows] = await connection.query(
          `SELECT id
           FROM schedules
           WHERE (user_id = ? OR user_id = ?)
             AND DATE(date) = DATE(?)
           ORDER BY start_time ASC
           LIMIT 1`,
          [
            empIdString,
            internalUserId,
            record.attendance_date
          ]
        );

        if (schedRows.length) {
          targetScheduleId = schedRows[0].id;
        }
      }

      // Approval must never insert unscheduled
      // attendance without a verified schedule.
      if (status === 'approved' && !targetScheduleId) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message:
            'No matching schedule found. Assign a valid schedule before approving.'
        });
      }

      // Verify ownership of the resolved schedule.
      if (targetScheduleId) {
        const [validSchedule] = await connection.query(
          `SELECT id
           FROM schedules
           WHERE id = ?
             AND (user_id = ? OR user_id = ?)
             AND DATE(date) = DATE(?)
           LIMIT 1`,
          [
            targetScheduleId,
            empIdString,
            internalUserId,
            record.attendance_date
          ]
        );

        if (!validSchedule.length) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message:
              'Correction schedule does not belong to this employee or date.'
          });
        }
      }

      // 7. Approval processing
      if (status === 'approved') {


if (
  await uvIsPayrollSnapshotLocked(
    connection,
    internalUserId,
    record.attendance_date
  )
) {
  await connection.rollback();
  transactionStarted = false;

  return res.status(409).json({
    success: false,
    message:
      'Payroll for this date is already finalized. ' +
      'Use an authorized payroll adjustment before ' +
      'changing attendance.'
  });
}


        // Lock attendance record for this schedule.
        const [existing] = await connection.query(
          `SELECT id, user_id, time_in, time_out, date
           FROM attendance
           WHERE schedule_id = ?
           FOR UPDATE`,
          [targetScheduleId]
        );

        if (existing.length > 1) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message: 'Duplicate attendance records require administrator review.'
          });
        }

        // Protect against changing another employee's record.
        if (existing.length) {
          const currentOwner = String(existing[0].user_id);

          if (
            currentOwner !== empIdString &&
            currentOwner !== String(internalUserId)
          ) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(409).json({
              success: false,
              message: 'Attendance belongs to another employee.'
            });
          }
        }

        const currentAttendance = existing[0] || null;

        const finalIn =
          record.requested_clock_in ||
          currentAttendance?.time_in ||
          null;

        const finalOut =
          record.requested_clock_out ||
          currentAttendance?.time_out ||
          null;

        // Do not create an invalid clock-out-only record.
        if (!finalIn && finalOut) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message:
              'Clock-out cannot be approved without a clock-in. Review the missing clock-in first.'
          });
        }

        // A valid approved correction requires a time.
        if (!finalIn && !finalOut) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message: 'No attendance time is available for approval.'
          });
        }

        // 8. Validate local clock values; include legitimate overnight work.
        let totalHours = 0;
        const startSeconds = c10ParseTimeSeconds(finalIn);
        const endSeconds = finalOut && finalOut !== '--:--'
          ? c10ParseTimeSeconds(finalOut)
          : null;

        if (startSeconds == null ||
            (finalOut && finalOut !== '--:--' && endSeconds == null)) {
          await connection.rollback();
          transactionStarted = false;
          return res.status(400).json({
            success: false,
            message: 'Invalid attendance time format.'
          });
        }

        if (endSeconds != null) {
          totalHours = c10AttendanceHours(finalIn, finalOut);
          if (totalHours == null) {
            await connection.rollback();
            transactionStarted = false;
            return res.status(409).json({
              success: false,
              message: 'Attendance hours must be greater than zero and at most 16 hours. Check the clock-in/out times.'
            });
          }
        }

        
const [shift] = await connection.query(
  `SELECT start_time
   FROM schedules
   WHERE id = ?
   LIMIT 1`,
  [targetScheduleId]
);

const scheduledStart = c10ParseTimeSeconds(
  shift[0]?.start_time
);

const actualStart = c10ParseTimeSeconds(finalIn);

const attendanceStatus =
  !finalOut || finalOut === '--:--'
    ? 'missing clock-out'
    : (
        scheduledStart !== null &&
        actualStart !== null &&
        actualStart > scheduledStart + 30 * 60
      )
      ? 'late'
      : 'present';


        // 9. Insert or update the attendance record.
        if (!currentAttendance) {

          await connection.query(
            `INSERT INTO attendance
             (
               user_id,
               schedule_id,
               date,
               time_in,
               time_out,
               status,
               total_hours,
               correction_requested,
               correction_status
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'approved')`,
            [
              empIdString,
              targetScheduleId,
              record.attendance_date,
              finalIn,
              finalOut,
              attendanceStatus,
              totalHours.toFixed(2)
            ]
          );

        } else {

          const updates = [];
          const values = [];

          if (record.requested_clock_in) {
            updates.push('time_in = ?');
            values.push(record.requested_clock_in);
          }

          if (record.requested_clock_out) {
            updates.push('time_out = ?');
            values.push(record.requested_clock_out);
          }

          updates.push(
            `status = ?,
             total_hours = ?,
             correction_requested = 0,
             correction_status = 'approved'`
          );

          values.push(attendanceStatus);
          values.push(totalHours.toFixed(2));
          values.push(currentAttendance.id);

          await connection.query(
            `UPDATE attendance
             SET ${updates.join(', ')}
             WHERE id = ?`,
            values
          );
        }

      } else {
        // 10. Rejection processing.
      
        if (!isOfflineCorrection && targetScheduleId) {
          await connection.query(
            `UPDATE attendance
             SET correction_requested = 0,
                 correction_status = 'rejected'
             WHERE schedule_id = ?
               AND (user_id = ? OR user_id = ?)`,
            [
              targetScheduleId,
              empIdString,
              internalUserId
            ]
          );
        }
      }

      // 11. Update correction status in the SAME transaction.
      const [reviewResult] = await connection.query(
        `UPDATE attendance_corrections
         SET
           status = ?,
           admin_remarks = ?,
           reviewed_by = ?,
           reviewed_at = ?
         WHERE id = ?
           AND status = 'pending'`,
        [
          status,
          cleanAdminRemarks,
          req.user.id,
          phNow,
          id
        ]
      );

      if (reviewResult.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: 'Correction was already reviewed.'
        });
      }

      
if (!isOfflineCorrection && targetScheduleId) {
  await uvSyncCorrectionPending(
    connection,
    internalUserId,
    empIdString,
    targetScheduleId,
    record.attendance_date
  );
}

      // If the audit insert fails, the existing catch rolls back everything.
      const oldAuditValue = {
        status: record.status,
        admin_remarks: record.admin_remarks ?? null,
        reviewed_by: record.reviewed_by ?? null,
        reviewed_at: record.reviewed_at ?? null
      };
      const newAuditValue = {
        status,
        admin_remarks: cleanAdminRemarks,
        reviewed_by: req.user.id,
        reviewed_at: phNow,
        employee_id: empIdString,
        schedule_id: targetScheduleId || null,
        requested_clock_in: record.requested_clock_in ?? null,
        requested_clock_out: record.requested_clock_out ?? null,
        attendance_date: record.attendance_date,
        source: isOfflineCorrection ? 'offline_sync' : 'manual_correction'
      };
      const forwardedIp = req.headers['x-forwarded-for'];
      const rawIp = forwardedIp || req.socket?.remoteAddress || null;
      const ipAddress = rawIp ? String(rawIp).split(',')[0].trim() : null;
      await connection.query(
        `INSERT INTO audit_logs
         (user_id, action, target_type, target_id, old_value,
          new_value, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          status === 'approved' ? 'APPROVE_CORRECTION' : 'REJECT_CORRECTION',
          'attendance_correction',
          id,
          JSON.stringify(oldAuditValue),
          JSON.stringify(newAuditValue),
          ipAddress,
          req.headers['user-agent'] || null,
          phNow
        ]
      );

      // Commit only after both data changes AND audit are persisted.
      await connection.commit();
      committed = true;
      transactionStarted = false;
      void c14NotifyInstructorDecision(internalUserId, 'correction', id, status).catch(err => console.warn('C14 correction decision notify:',err.message));

      return res.json({
        success: true,
        message: `Correction request successfully ${status}.`
      });

    } catch (error) {

      if (connection && transactionStarted && !committed) {
        await connection.rollback().catch((rollbackError) => {
          console.error(
            'Correction rollback error:',
            rollbackError
          );
        });
      }

      console.error('Review correction error:', error);

      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: 'Failed to review attendance correction.'
        });
      }

    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);



// ============================================
// 3. ATTENDANCE APPEALS
// ============================================

app.get('/api/attendance-appeals/user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const { employeeId } = req.params;
  const sql = `
    SELECT 
      a.id,
      a.user_id,
      a.schedule_id,
      a.reason,
      a.image_url,
      a.status,
      a.admin_remarks,
      a.requested_time_in,
      a.requested_time_out,
      DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
      DATE_FORMAT(a.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(a.submitted_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(a.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      u.full_name, 
      u.employee_id 
    FROM attendance_appeals a 
    LEFT JOIN users u ON (a.user_id = u.employee_id OR a.user_id = u.id)
    WHERE (a.user_id = ? OR a.user_id = (SELECT employee_id FROM users WHERE id = ?) OR a.user_id = (SELECT id FROM users WHERE employee_id = ?))
    ORDER BY a.submitted_at DESC, a.id DESC
  `;

  db.query(sql, [employeeId, employeeId, employeeId], (err, results) => {
    if (err) {
      console.error("User appeals fetch error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results || []);
  });
});

app.post('/api/attendance-appeals', authenticateToken, uploadAppeal.single('image'), async (req, res) => {
  const { date, reason, time_in, time_out, schedule_id } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  const { date: today } = getPHTime();


  if (!req.file) {
  return res.status(400).json({
    success: false,
    error: "Supporting proof (image/PDF/DOC) is required for appeals."
  });
}

 
  if (!date) {
    return res.status(400).json({ success: false, error: "Date is required." });
  }
  if (!isValidISOCalendarDate(date)) {
    return res.status(400).json({ success: false, error: 'Invalid calendar date. Expected a real YYYY-MM-DD date.' });
  }
  if (date > today) {
    return res.status(400).json({ success: false, error: "Cannot appeal for future dates." });
  }
  if (!isDateWithinAllowedRange(date)) {
    return res.status(400).json({ success: false, error: "Appeals are only allowed for the last 30 days." });
  }

  
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, error: "Reason is required." });
  }
  const trimmedAppealReason = String(reason).trim();
  if (trimmedAppealReason.length < 10) {
  return res.status(400).json({ success: false, error: "Please provide a more detailed reason (minimum 10 characters)." });
}
  if (trimmedAppealReason.length > 500) {
    return res.status(400).json({ success: false, error: "Reason is too long (maximum 500 characters)." });
  }

  
  const HHMM_APPEAL_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
  if (time_in && !HHMM_APPEAL_REGEX.test(String(time_in).trim())) {
    return res.status(400).json({ success: false, error: "Invalid time_in format. Expected HH:mm or HH:mm:ss." });
  }
  if (time_out && !HHMM_APPEAL_REGEX.test(String(time_out).trim())) {
    return res.status(400).json({ success: false, error: "Invalid time_out format. Expected HH:mm or HH:mm:ss." });
  }
  

const normalizeHHMM = (t) => {
  const s = String(t).trim();
  return s.length === 5 ? `${s}:00` : s;
};

if (!time_in && !time_out) {
  return res.status(400).json({
    success: false,
    error: 'Provide at least one requested attendance time.'
  });
}

if (
  time_in &&
  time_out &&
  c10AttendanceHours(time_in, time_out) == null
) {
  return res.status(400).json({
    success: false,
    error: 'Requested attendance duration must be between 0 and 16 hours.'
  });
}


  try {
    const [userRows] = await db.promise().query(
      "SELECT employee_id FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) return res.status(404).json({ success: false, error: "User not found or inactive." });
    const employee_id = userRows[0].employee_id;

       
    const MAX_PENDING_APPEALS = 10;
    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      
      await connection.query(`SELECT id FROM users WHERE id = ? FOR UPDATE`, [userId]);

      
      const [pendingAppealRows] = await connection.query(
        `SELECT COUNT(*) AS c FROM attendance_appeals
          WHERE (user_id = ? OR user_id = ?) AND status = 'pending'`,
        [employee_id, userId]
      );
      if (pendingAppealRows[0].c >= MAX_PENDING_APPEALS) {
        await connection.rollback();
        return res.status(429).json({
          success: false,
          error: `You already have ${MAX_PENDING_APPEALS} pending appeals. Please wait for HR to review them.`
        });
      }

      
      let targetScheduleId = schedule_id;
      if (!targetScheduleId || targetScheduleId === 'undefined' || targetScheduleId === 'null') {
        const [schedRows] = await connection.query(
          "SELECT id FROM schedules WHERE (user_id = ? OR user_id = ?) AND date = ? ORDER BY start_time ASC LIMIT 2",
          [employee_id, userId, date]
        );
        
if (schedRows.length !== 1) {
  await connection.rollback();

  return res.status(409).json({
    success: false,
    error: schedRows.length === 0
      ? 'No schedule found for this date.'
      : 'Multiple shifts found. Select the specific shift before submitting an appeal.'
  });
}

targetScheduleId = schedRows[0].id;

      } else {
        const [schedVerify] = await connection.query(
          "SELECT id FROM schedules WHERE id = ? AND (user_id = ? OR user_id = ?) AND date = ?",
          [targetScheduleId, employee_id, userId, date]
        );
        if (schedVerify.length === 0) {
          await connection.rollback();
          return res.status(400).json({ success: false, error: "Invalid schedule selected for this date." });
        }
      }

      
      const [existingAppeal] = await connection.query(
        `SELECT id FROM attendance_appeals 
         WHERE (user_id = ? OR user_id = ?) AND date = ? AND schedule_id = ? AND status IN ('pending', 'approved')`,
        [employee_id, userId, date, targetScheduleId]
      );

      if (existingAppeal.length > 0) {
        await connection.rollback();
        return res.status(409).json({ success: false, error: "You already have a pending or approved appeal for this specific shift." });
      }

      const image_url = req.file ? `/uploads/attendance_appeals/${req.file.filename}` : null;
      const appealTimeIn = time_in ? normalizeHHMM(time_in) : null;
      const appealTimeOut = time_out ? normalizeHHMM(time_out) : null;

      
      const [result] = await connection.query(
        `INSERT INTO attendance_appeals 
          (user_id, date, schedule_id, reason, image_url, status, requested_time_in, requested_time_out, submitted_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [employee_id, date, targetScheduleId, trimmedAppealReason, image_url, appealTimeIn, appealTimeOut, phNow]
      );

      await connection.commit();

      logAction(req.user.id, 'SUBMIT_APPEAL', 'attendance_appeal', result.insertId, req);
      void c14NotifyHRPending('appeal', result.insertId, employee_id).catch(err => console.warn('C14 appeal notify:',err.message));
      return res.json({ success: true, message: 'Appeal submitted successfully.' });
    } catch (txErr) {
      await connection.rollback();
      throw txErr;  
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Appeal submission error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
app.get('/api/attendance-appeals/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const sql = `
    SELECT 
      a.*, 
      DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
      DATE_FORMAT(a.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(a.submitted_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(a.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      u.full_name, 
      u.employee_id 
    FROM attendance_appeals a 
    JOIN users u ON (a.user_id = u.employee_id OR a.user_id = u.id) 
    WHERE a.status = 'pending' 
    ORDER BY a.submitted_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results || []);
  });
});


app.put('/api/attendance-appeals/:id/status', authenticateToken, requireAction('appeals:review'), async (req, res) => {
  if (!['admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const id = Number(req.params.id);
  const { status, admin_remarks } = req.body || {};
  const remarks = admin_remarks == null ? null : String(admin_remarks).trim() || null;

  if (!Number.isSafeInteger(id) || id <= 0 || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid appeal ID or decision.' });
  }

  if ((remarks && remarks.length > 500) || (status === 'rejected' && (!remarks || remarks.length < 5))) {
    return res.status(400).json({
      success: false,
      message: 'Rejection requires 5–500 characters; other remarks are limited to 500.'
    });
  }

  let connection;
  let started = false;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    started = true;

    const [rows] = await connection.query(
      'SELECT * FROM attendance_appeals WHERE id = ? FOR UPDATE',
      [id]
    );

    if (rows.length !== 1) {
      throw uvLeaveApprovalConflict('Appeal not found.', 404);
    }

    const appeal = rows[0];

    if (String(appeal.status).toLowerCase() !== 'pending') {
      throw uvLeaveApprovalConflict('Appeal has already been reviewed.');
    }

    const [owners] = await connection.query(
      'SELECT id, employee_id FROM users WHERE id = ? OR employee_id = ? FOR UPDATE',
      [appeal.user_id, appeal.user_id]
    );

    if (owners.length !== 1) {
      throw uvLeaveApprovalConflict('Appeal owner is missing or ambiguous.');
    }

    const owner = owners[0];

    if (String(owner.id) === String(req.user.id)) {
      throw uvLeaveApprovalConflict('You cannot review your own appeal.', 403);
    }

    let targetScheduleId = appeal.schedule_id;

    if (!targetScheduleId) {
      const [matches] = await connection.query(
        `SELECT id FROM schedules
         WHERE (user_id = ? OR user_id = ?)
           AND DATE(date) = DATE(?)
         ORDER BY start_time
         LIMIT 2`,
        [owner.employee_id, owner.id, appeal.date]
      );

      if (matches.length === 1) {
        targetScheduleId = matches[0].id;
      }
    }

    if (status === 'approved') {
      if (!targetScheduleId) {
        throw uvLeaveApprovalConflict('Select the specific scheduled shift before approval.');
      }

      const [schedules] = await connection.query(
        `SELECT id, start_time
         FROM schedules
         WHERE id = ?
           AND (user_id = ? OR user_id = ?)
           AND DATE(date) = DATE(?)
         LIMIT 1`,
        [targetScheduleId, owner.employee_id, owner.id, appeal.date]
      );

      if (schedules.length !== 1) {
        throw uvLeaveApprovalConflict('Appeal schedule does not belong to this employee and date.');
      }

      if (await uvIsPayrollSnapshotLocked(connection, owner.id, appeal.date)) {
        throw uvLeaveApprovalConflict(
          'Payroll has already been saved for this attendance date. Use an authorized adjustment.'
        );
      }

      const [pendingCorrections] = await connection.query(
        `SELECT id
         FROM attendance_corrections
         WHERE (user_id = ? OR user_id = ?)
           AND schedule_id = ?
           AND DATE(attendance_date) = DATE(?)
           AND status = 'pending'
         LIMIT 1`,
        [owner.id, owner.employee_id, targetScheduleId, appeal.date]
      );

      if (pendingCorrections.length) {
        throw uvLeaveApprovalConflict(
          'Review the existing attendance correction before approving this appeal.'
        );
      }

      const [attendance] = await connection.query(
        `SELECT id, user_id, time_in, time_out, status, location, total_hours
         FROM attendance
         WHERE schedule_id = ?
         FOR UPDATE`,
        [targetScheduleId]
      );

      if (
        attendance.length > 1 ||
        (
          attendance.length &&
          ![String(owner.id), String(owner.employee_id)]
            .includes(String(attendance[0].user_id))
        )
      ) {
        throw uvLeaveApprovalConflict('Attendance ownership or duplicate record conflict.');
      }

      const original = attendance[0] || null;
      const finalIn = appeal.requested_time_in || original?.time_in || null;
      const finalOut = appeal.requested_time_out || original?.time_out || null;

      if (!finalIn || !finalOut) {
        throw uvLeaveApprovalConflict(
          'Approval requires a verified clock-in and clock-out. A scheduled time cannot replace missing evidence.'
        );
      }

      const hours = c10AttendanceHours(finalIn, finalOut);

      if (hours == null) {
        throw uvLeaveApprovalConflict('Invalid verified attendance interval (maximum 16 hours).');
      }

      const shiftStart = c10ParseTimeSeconds(schedules[0].start_time);
      const checkIn = c10ParseTimeSeconds(finalIn);

      if (shiftStart == null || checkIn == null) {
        throw uvLeaveApprovalConflict(
          'Unable to determine attendance status: invalid schedule or clock-in.'
        );
      }

      const offset = (checkIn - shiftStart + 86400) % 86400;
      const newStatus = offset > 1800 && offset <= 16 * 3600 ? 'late' : 'present';

      if (original) {
        await connection.query(
          `UPDATE attendance
           SET time_in = ?,
               time_out = ?,
               status = ?,
               total_hours = ?
           WHERE id = ?`,
          [finalIn, finalOut, newStatus, hours, original.id]
        );
      } else {
        await connection.query(
          `INSERT INTO attendance
             (user_id, schedule_id, date, time_in, time_out, status, total_hours)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            owner.employee_id,
            targetScheduleId,
            appeal.date,
            finalIn,
            finalOut,
            newStatus,
            hours
          ]
        );
      }
    } else if (targetScheduleId) {
      const [schedules] = await connection.query(
        `SELECT id FROM schedules
         WHERE id = ?
           AND (user_id = ? OR user_id = ?)
           AND DATE(date) = DATE(?)
         LIMIT 1`,
        [targetScheduleId, owner.employee_id, owner.id, appeal.date]
      );

      if (!schedules.length) {
        throw uvLeaveApprovalConflict('Appeal schedule ownership mismatch.');
      }
    }

    const [updated] = await connection.query(
      `UPDATE attendance_appeals
       SET status = ?,
           admin_remarks = ?,
           reviewed_at = ?
       WHERE id = ? AND status = 'pending'`,
      [status, remarks, getPHDateTime(), id]
    );

    if (updated.affectedRows !== 1) {
      throw uvLeaveApprovalConflict('Appeal was already reviewed.');
    }

    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null;

    await connection.query(
      `INSERT INTO audit_logs
         (user_id, action, target_type, target_id, old_value,
          new_value, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        status === 'approved' ? 'APPROVE_APPEAL' : 'REJECT_APPEAL',
        'attendance_appeal',
        String(id),
        JSON.stringify({
          status: appeal.status,
          admin_remarks: appeal.admin_remarks || null
        }),
        JSON.stringify({
          status,
          admin_remarks: remarks,
          schedule_id: targetScheduleId || null,
          reviewed_by: req.user.id
        }),
        ip ? String(ip).split(',')[0].trim() : null,
        req.headers['user-agent'] || null,
        getPHDateTime()
      ]
    );

    await connection.commit();
    started = false;

    void c14NotifyInstructorDecision(owner.id, 'appeal', id, status)
      .catch(error => console.warn('Appeal notification:', error.message));

    return res.json({
      success: true,
      message: `Appeal successfully ${status}.`
    });
  } catch (error) {
    if (started && connection) {
      await connection.rollback().catch(() => {});
    }

    if (!error.httpStatus) {
      console.error('Appeal review error:', error);
    }

    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.httpStatus
        ? error.message
        : 'Unable to review appeal.'
    });
  } finally {
    if (connection) connection.release();
  }
});


app.get('/api/attendance-appeals/history', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const sql = `
    SELECT 
      a.*, 
      DATE_FORMAT(a.date, '%Y-%m-%d') AS date,
      DATE_FORMAT(a.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(a.submitted_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(a.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      u.full_name, 
      u.employee_id 
    FROM attendance_appeals a 
    JOIN users u ON (a.user_id = u.employee_id OR a.user_id = u.id) 
    WHERE a.status IN ('approved', 'rejected', 'cancelled') 
    ORDER BY a.submitted_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results || []);
  });
});


// ============================================
// ADMIN / HR: LEAVE TYPES CONFIGURATION ENDPOINTS
// ============================================

// 1. Get all leave types (including active and disabled) for Admin/HR configuration
app.get('/api/admin/leave-types', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  db.query("SELECT * FROM leave_types ORDER BY name ASC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(results || []);
  });
});

// 2. Add a new leave type
app.post('/api/admin/leave-types', authenticateToken, requireAction('leave-types:write'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { name, annual_quota } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Leave type name is required.' });
  }
  const quota = annual_quota !== undefined ? parseFloat(annual_quota) : 15;

  db.query("INSERT INTO leave_types (name, annual_quota, is_active) VALUES (?, ?, 1)", [name.trim(), quota], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Leave type already exists.' });
      return res.status(500).json({ success: false, message: err.message });
    }
    logAction(req.user.id, 'CREATE_LEAVE_TYPE', 'leave_type', result.insertId, req);
    res.json({ success: true, message: 'Leave type created successfully.', id: result.insertId });
  });
});

// 3. Toggle Enable / Disable state of a leave type
app.put('/api/admin/leave-types/:id/toggle', authenticateToken, requireAction('leave-types:write'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { id } = req.params;
  db.query("SELECT is_active FROM leave_types WHERE id = ?", [id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ success: false, message: 'Leave type not found.' });
    const newStatus = rows[0].is_active ? 0 : 1;
    db.query("UPDATE leave_types SET is_active = ? WHERE id = ?", [newStatus, id], (err2) => {
      if (err2) return res.status(500).json({ success: false, message: err2.message });
      logAction(req.user.id, 'TOGGLE_LEAVE_TYPE', 'leave_type', id, req);
      res.json({ success: true, message: `Leave type successfully ${newStatus ? 'enabled' : 'disabled'}.`, is_active: newStatus });
    });
  });
});

// ============================================
// LEAVE REQUESTS (Secured, Validated & Timezone-Synchronized)
// ============================================

app.post('/api/leave-requests', authenticateToken, upload.single('image'), async (req, res) => {
  // 1. Parse inputs (Supports both single date and array of dates for batching)
  const { reason, type, requests: requestsRaw, request_date, duration, is_paid } = req.body;
  const userId = req.user.id;
  const image_url = req.file ? `/uploads/leave_images/${req.file.filename}` : null;
  const phNow = getPHDateTime();
  // Preserve the historic paid-by-default contract, but reject malformed overrides.
  const isPaidInt = is_paid === undefined || is_paid === null || is_paid === '' ? 1 : Number(is_paid);
  if (isPaidInt !== 0 && isPaidInt !== 1) {
    return res.status(400).json({ success: false, message: 'is_paid must be 0 or 1.' });
  }

  let requests = [];
  if (requestsRaw) {
    try {
      requests = typeof requestsRaw === 'string' ? JSON.parse(requestsRaw) : requestsRaw;
    } catch (e) {
      return res.status(400).json({ success: false, message: "Invalid requests payload format." });
    }
  } else if (request_date) {
    // Fallback for old mobile app versions
    requests = [{ date: request_date, duration: duration || 'Whole Day' }];
  }

  if (!Array.isArray(requests) || requests.length === 0) {
    return res.status(400).json({ success: false, message: "At least one request date is required." });
  }
  
  if (requests.length > 30) {
    return res.status(400).json({ success: false, message: "Cannot request more than 30 days at once." });
  }

  // 2. Generic Validation (applies to all dates)
  if (!reason || !type || !reason.trim() || !type.trim()) {
    return res.status(400).json({ success: false, message: "Reason and leave type are required." });
  }

  const trimmedReason = reason.trim();
  if (trimmedReason.length < 10) {
    return res.status(400).json({ success: false, message: "Please provide a more detailed reason (minimum 10 characters)." });
  }
  if (trimmedReason.length > 500) {
    return res.status(400).json({ success: false, message: "Reason is too long (maximum 500 characters)." });
  }

  const cleanType = String(type).trim();
  if (cleanType.length > 50) {
    return res.status(400).json({ success: false, message: "Leave type name is too long (maximum 50 characters)." });
  }
  const lowerType = cleanType.toLowerCase();

  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: "A supporting document (image/PDF/DOC) is required for leave requests."
    });
  }

  const ALLOWED_DURATIONS = ['Whole Day', '1st Half', '2nd Half'];
  const { date: today } = getPHTime();
  const isRetroactiveAllowed = /emergency|sick/i.test(lowerType);

  // 3. Pre-validate all dates, including duplicate entries in the same batch.
  const requestedDateKeys = new Set();
  for (const reqItem of requests) {
    if (!reqItem || !isValidISOCalendarDate(reqItem.date)) {
      return res.status(400).json({ success: false, message: `Invalid calendar date: ${reqItem?.date ?? 'missing'}. Expected a real YYYY-MM-DD date.` });
    }
    if (requestedDateKeys.has(reqItem.date)) {
      return res.status(409).json({ success: false, message: `Duplicate leave date ${reqItem.date} in this submission. Only one leave per date is allowed.` });
    }
    requestedDateKeys.add(reqItem.date);

    const reqDuration = reqItem.duration || 'Whole Day';
    if (!ALLOWED_DURATIONS.includes(reqDuration)) {
      return res.status(400).json({ success: false, message: `Invalid duration '${reqDuration}' for ${reqItem.date}.` });
    }

    const requestDateObj = new Date(`${reqItem.date}T00:00:00`);
    if (isNaN(requestDateObj.getTime())) {
      return res.status(400).json({ success: false, message: `Invalid calendar date: ${reqItem.date}.` });
    }

    if (reqItem.date < today && !isRetroactiveAllowed) {
      return res.status(400).json({ success: false, message: `${cleanType} cannot be filed retroactively for ${reqItem.date}.` });
    }

    if (reqItem.date < today && !isDateWithinAllowedRange(reqItem.date)) {
      return res.status(400).json({ success: false, message: `Retroactive leaves are only allowed within the last 30 days (${reqItem.date}).` });
    }

    const daysAhead = Math.floor((requestDateObj - new Date(`${today}T00:00:00`)) / 86400000);
    if (daysAhead > 180) {
      return res.status(400).json({ success: false, message: `Leave requests cannot be filed more than 180 days in advance (${reqItem.date}).` });
    }
  }

  // 4. Database Transaction (All or Nothing)
  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    // Serialize submissions for one employee so two concurrent requests cannot both
    // pass the pending/approved duplicate check before either inserts its rows.
    const [userRows] = await connection.query(
      "SELECT employee_id FROM users WHERE id = ? AND status = 'active' FOR UPDATE",
      [userId]
    );
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "User not found or inactive." });
    }
    const employee_id = userRows[0].employee_id;

    // Resolve Leave Type
    const candidateNames = [cleanType];
    if (lowerType === 'pto' || lowerType === 'paid time off') {
      candidateNames.push('PTO', 'Paid Time Off', 'Vacation', 'Vacation Leave');
    } else if (lowerType.includes('vacation')) {
      candidateNames.push('Vacation', 'Vacation Leave', 'PTO', 'Paid Time Off');
    } else if (lowerType.includes('sick')) {
      candidateNames.push('Sick', 'Sick Leave');
    } else if (lowerType.includes('emergency')) {
      candidateNames.push('Emergency', 'Emergency Leave');
    } else if (lowerType.includes('birthday')) {
      candidateNames.push('Birthday', 'Birthday Leave');
    } else if (lowerType.includes('compensatory') || lowerType === 'cpo' || lowerType === 'cto') {
      candidateNames.push('Compensatory Paid Off', 'Compensatory Time Off', 'Compensatory Leave', 'CTO', 'CPO');
    }

     const normalizedCandidates = [
      ...new Set(
        candidateNames.map(name => String(name).trim().toLowerCase())
      )
    ];

    const [typeRows] = await connection.query(
      `SELECT id, name, annual_quota
       FROM leave_types
       WHERE is_active = 1
         AND LOWER(TRIM(name)) IN (
           ${normalizedCandidates.map(() => '?').join(',')}
         )
       ORDER BY (LOWER(TRIM(name)) = ?) DESC, id ASC
       LIMIT 1`,
      [...normalizedCandidates, lowerType]
    );

    if (typeRows.length === 0) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: 'This leave type is unavailable. Please select an active leave type configured by HR.'
      });
    }

    
const leaveTypeId = typeRows[0].id;
const canonicalLeaveType = typeRows[0].name;
const annualQuota = Number(typeRows[0].annual_quota);


    if (
      typeRows[0].annual_quota == null ||
      !Number.isFinite(annualQuota) ||
      annualQuota < 0
    ) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: 'The selected leave type has no valid annual quota. Please contact HR.'
      });
    }

    // 🚨 NEW FIX: Pre-calculate total cost per year and check balance ONCE per year
    if (leaveTypeId) {
      const costsByYear = {};
      for (const reqItem of requests) {
        const reqYear = parseInt(String(reqItem.date).split('-')[0], 10) || new Date().getFullYear();
        const reqDuration = reqItem.duration || 'Whole Day';
        const cost = (reqDuration === '1st Half' || reqDuration === '2nd Half') ? 0.5 : 1.0;
        
        costsByYear[reqYear] = (costsByYear[reqYear] || 0) + cost;
      }

      for (const [yearStr, totalCost] of Object.entries(costsByYear)) {
        const year = parseInt(yearStr, 10);
        
       
const initialBalance =
  /compensatory|cto|cpo/i.test(canonicalLeaveType)
    ? 0
    : annualQuota;

await connection.query(
  `INSERT IGNORE INTO employee_leave_balances
     (user_id, leave_type_id, remaining_days, year, last_updated)
   VALUES (?, ?, ?, ?, CURDATE())`,
  [userId, leaveTypeId, initialBalance, year]
);


        const [balanceRows] = await connection.query(
          `SELECT remaining_days FROM employee_leave_balances
            WHERE user_id = ? AND leave_type_id = ? AND year = ? FOR UPDATE`,
          [userId, leaveTypeId, year]
        );

        const currentRemaining = balanceRows.length > 0 ? parseFloat(balanceRows[0].remaining_days) : 0;
        
        if (currentRemaining < totalCost) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: `Insufficient ${cleanType} balance for ${year}. You requested ${totalCost} day(s), but only have ${currentRemaining.toFixed(2)} day(s) remaining.`
          });
        }
      }
    }

    // Process each day in the array
    const insertedIds = [];
    
    for (const reqItem of requests) {
      const reqDuration = reqItem.duration || 'Whole Day';
      const reqDate = reqItem.date;

     const [existingReq] = await connection.query(
  `SELECT id, duration, status FROM leave_requests
    WHERE (user_id = ? OR user_id = ?)
      AND request_date = ?
      AND status IN ('Pending', 'Approved') FOR UPDATE`,
  [employee_id, userId, reqDate]
);

if (existingReq.length > 0) {
  const existing = existingReq[0];
  await connection.rollback();
  return res.status(409).json({
    success: false,
    message: `A ${existing.status.toLowerCase()} leave already exists for ${reqDate}. Only one leave per date is allowed.`
  });
}

      // Insert Row
      const [result] = await connection.query(
        `INSERT INTO leave_requests
           (user_id, request_date, duration, is_paid, reason, type, image_url, status, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`,
        
[
  employee_id,
  reqDate,
  reqDuration,
  isPaidInt,
  trimmedReason,
  canonicalLeaveType,
  image_url,
  phNow
]
      );
      
      insertedIds.push(result.insertId);
    }

    await connection.commit();
    
    // ✅ FIX: Log the actual inserted request IDs instead of null
    logAction(req.user.id, 'SUBMIT_LEAVE_BATCH', 'leave_request', insertedIds.join(','), req);
    res.json({ success: true, message: "Leave request(s) submitted successfully." });

  } catch (err) {
    await connection.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: "Duplicate entry detected." });
    }
    console.error("Leave Request Submit Error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Server connection failed while submitting request."
    });
  } finally {
    connection.release();
  }
});

app.get('/api/leave-requests/all', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }

  const sql = `
    SELECT 
      lr.*,
      DATE_FORMAT(lr.request_date, '%Y-%m-%d') AS request_date,
      DATE_FORMAT(lr.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(lr.submitted_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(lr.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      u.full_name, 
      u.employee_id 
    FROM leave_requests lr 
    LEFT JOIN users u ON (lr.user_id = u.employee_id OR lr.user_id = u.id) 
    WHERE lr.is_hidden = 0 
    ORDER BY lr.request_date DESC, lr.id DESC
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch leave requests." });
    res.json(results || []);
  });
});

// 3. Get Leave History by Identifier (Formatted with PHT Strings to Prevent UTC Shifting)

app.get('/api/leave-requests/history/:identifier', authenticateToken, verifyOwnership, (req, res) => {
  const { identifier } = req.params;
  const sql = `
    SELECT 
      lr.*, 
      DATE_FORMAT(lr.request_date, '%Y-%m-%d') AS formatted_date,
      DATE_FORMAT(lr.request_date, '%Y-%m-%d') AS request_date,
      DATE_FORMAT(lr.submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(lr.submitted_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(lr.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      u.full_name,
      u.employee_id
    FROM leave_requests lr 
    JOIN users u ON (lr.user_id = u.employee_id OR lr.user_id = u.id) 
    WHERE (u.employee_id = ? OR u.id = ?) 
      AND lr.status IN ('Approved', 'Rejected') 
      AND lr.is_hidden = 0 
    ORDER BY lr.request_date DESC, lr.id DESC
  `;

  db.query(sql, [identifier, identifier], (err, results) => {
    if (err) {
      console.error("Failed to fetch leave history:", err);
      return res.status(500).json({ success: false, message: "Failed to fetch leave history." });
    }
    res.json(results || []);
  });
});

app.get('/api/leave-requests/user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const { employeeId } = req.params;
  const sql = `
    SELECT 
      id, user_id, type, duration, is_paid, reason, status, image_url, admin_remarks, is_hidden,
      DATE_FORMAT(request_date, '%Y-%m-%d') AS request_date,
      DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(submitted_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at
    FROM leave_requests 
    WHERE (user_id = ? OR user_id = (SELECT employee_id FROM users WHERE id = ?) OR user_id = (SELECT id FROM users WHERE employee_id = ?)) 
    ORDER BY request_date DESC, id DESC
  `;

  db.query(sql, [employeeId, employeeId, employeeId], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch user leaves." });
    res.json(result || []);
  });
});


function uvLeaveApprovalConflict(message, httpStatus = 409) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  return error;
}

async function uvApplyApprovedLeave(connection, leave, reviewerId) {
  const {
    id,
    user_id: requestUserId,
    type,
    duration
  } = leave;

  const requestDate = leave.date_key;

  const [owners] = await connection.query(
    `SELECT id, employee_id
     FROM users
     WHERE id = ? OR employee_id = ?
     FOR UPDATE`,
    [requestUserId, requestUserId]
  );

  if (owners.length !== 1) {
    throw uvLeaveApprovalConflict('Leave owner is missing or ambiguous.');
  }

  const owner = owners[0];

  if (String(owner.id) === String(reviewerId)) {
    throw uvLeaveApprovalConflict(
      'You cannot review your own leave request.',
      403
    );
  }

  if (!['Whole Day', '1st Half', '2nd Half'].includes(duration)) {
    throw uvLeaveApprovalConflict('Invalid leave duration.');
  }

  if (
    await uvIsPayrollSnapshotLocked(
      connection,
      owner.id,
      requestDate
    )
  ) {
    throw uvLeaveApprovalConflict(
      'Payroll is already saved for this leave date. Use a separate authorized adjustment workflow.'
    );
  }

  const [conflicts] = await connection.query(
    `SELECT id
     FROM leave_requests
     WHERE (user_id = ? OR user_id = ?)
       AND request_date = ?
       AND status IN ('Pending', 'Approved')
       AND id <> ?
     LIMIT 1`,
    [owner.id, owner.employee_id, requestDate, id]
  );

  if (conflicts.length) {
    throw uvLeaveApprovalConflict(
      'Another pending or approved leave exists for this date.'
    );
  }

  const [types] = await connection.query(
    'SELECT id FROM leave_types WHERE name = ? LIMIT 1',
    [type]
  );

  if (types.length !== 1) {
    throw uvLeaveApprovalConflict(
      'The stored leave type is not configured.'
    );
  }

  const cost = duration === 'Whole Day' ? 1 : 0.5;
  const year = Number(String(requestDate).slice(0, 4));

  const [balances] = await connection.query(
    `SELECT remaining_days
     FROM employee_leave_balances
     WHERE user_id = ?
       AND leave_type_id = ?
       AND year = ?
     FOR UPDATE`,
    [owner.id, types[0].id, year]
  );

  if (
    balances.length !== 1 ||
    Number(balances[0].remaining_days) < cost
  ) {
    throw uvLeaveApprovalConflict(
      'Insufficient configured leave balance for this request.'
    );
  }

  const [attendance] = await connection.query(
    `SELECT id, schedule_id, time_in, time_out
     FROM attendance
     WHERE (user_id = ? OR user_id = ?)
       AND DATE(date) = DATE(?)
     FOR UPDATE`,
    [owner.id, owner.employee_id, requestDate]
  );

  if (
    duration === 'Whole Day' &&
    attendance.some(a => a.time_in != null || a.time_out != null)
  ) {
    throw uvLeaveApprovalConflict(
      'Recorded attendance exists for this date. Full-day leave cannot replace actual work.'
    );
  }

  const [deduction] = await connection.query(
    `UPDATE employee_leave_balances
     SET remaining_days = remaining_days - ?,
         last_updated = CURDATE()
     WHERE user_id = ?
       AND leave_type_id = ?
       AND year = ?
       AND remaining_days >= ?`,
    [
      cost,
      owner.id,
      types[0].id,
      year,
      cost
    ]
  );

  if (deduction.affectedRows !== 1) {
    throw uvLeaveApprovalConflict(
      'Leave balance changed during review. Refresh and retry.'
    );
  }

  if (duration !== 'Whole Day') {
    return;
  }

  
  const [schedules] = await connection.query(
    `SELECT id
     FROM schedules
     WHERE (user_id = ? OR user_id = ?)
       AND DATE(date) = DATE(?)`,
    [owner.id, owner.employee_id, requestDate]
  );

  for (const shift of schedules) {
    const [rows] = await connection.query(
      `SELECT id, user_id, time_in, time_out
       FROM attendance
       WHERE schedule_id = ?
       FOR UPDATE`,
      [shift.id]
    );

    if (
      rows.length > 1 ||
      rows.some(row =>
        ![String(owner.id), String(owner.employee_id)]
          .includes(String(row.user_id)) ||
        row.time_in != null ||
        row.time_out != null
      )
    ) {
      throw uvLeaveApprovalConflict(
        'Attendance conflict. Full-day leave cannot overwrite recorded work.'
      );
    }

    if (rows.length === 1) {
      await connection.query(
        `UPDATE attendance
         SET status = 'on leave'
         WHERE id = ?`,
        [rows[0].id]
      );
    } else {
      await connection.query(
        `INSERT INTO attendance
           (user_id, schedule_id, date, status, location)
         VALUES (?, ?, ?, 'on leave', 'Remote/Leave')`,
        [owner.employee_id, shift.id, requestDate]
      );
    }
  }
}



app.put('/api/leave-requests/:id/status', authenticateToken, requireAction('leaves:approve'), async (req, res) => {
  if (!['admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden.'
    });
  }

  const id = Number(req.params.id);
  const { status, admin_remarks } = req.body || {};
  const remarks = admin_remarks == null
    ? null
    : String(admin_remarks).trim() || null;

  if (
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !['Approved', 'Rejected'].includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid leave request or decision.'
    });
  }

  if (
    (remarks && remarks.length > 500) ||
    (status === 'Rejected' && (!remarks || remarks.length < 5))
  ) {
    return res.status(400).json({
      success: false,
      message: 'Rejection requires 5–500 characters; other remarks are limited to 500.'
    });
  }

  let connection;
  let started = false;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    started = true;

    const [rows] = await connection.query(
      `SELECT *,
              DATE_FORMAT(request_date, '%Y-%m-%d') AS date_key
       FROM leave_requests
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (rows.length !== 1) {
      throw uvLeaveApprovalConflict('Leave request not found.', 404);
    }

    const leave = rows[0];

    if (String(leave.status).toLowerCase() !== 'pending') {
      throw uvLeaveApprovalConflict(
        'Leave request has already been reviewed.'
      );
    }

    if (status === 'Approved') {
      await uvApplyApprovedLeave(connection, leave, req.user.id);
    }

    const [updated] = await connection.query(
      `UPDATE leave_requests
       SET status = ?,
           admin_remarks = ?,
           reviewed_at = ?
       WHERE id = ?
         AND status = 'Pending'`,
      [status, remarks, getPHDateTime(), id]
    );

    if (updated.affectedRows !== 1) {
      throw uvLeaveApprovalConflict('Leave review conflict.');
    }

    await connection.commit();
    started = false;

    logAction(
      req.user.id,
      status === 'Approved' ? 'APPROVE_LEAVE' : 'REJECT_LEAVE',
      'leave_request',
      id,
      req
    );

    return res.json({
      success: true,
      message: `Leave request successfully ${status.toLowerCase()}.`
    });
  } catch (error) {
    if (started && connection) {
      await connection.rollback().catch(() => {});
    }

    if (!error.httpStatus) {
      console.error('Leave review error:', error);
    }

    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.httpStatus
        ? error.message
        : 'Leave review failed.'
    });
  } finally {
    if (connection) connection.release();
  }
});


app.put('/api/leave-requests/:id/dismiss', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const isPrivileged = req.user.role === 'admin' || req.user.role === 'hr_admin';

  try {
    const [rows] = await db.promise().query(
      "SELECT id, user_id FROM leave_requests WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    if (!isPrivileged) {
      const [userRows] = await db.promise().query(
        "SELECT id, employee_id FROM users WHERE id = ?",
        [userId]
      );
      if (userRows.length === 0) {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      const ownIds = new Set([String(userRows[0].id), String(userRows[0].employee_id)]);
      if (!ownIds.has(String(rows[0].user_id))) {
        return res.status(403).json({ success: false, message: "You can only dismiss your own requests." });
      }
    }

    await db.promise().query("UPDATE leave_requests SET is_hidden = 1 WHERE id = ?", [id]);
    logAction(userId, 'DISMISS_LEAVE', 'leave_request', id, req);
    res.json({ success: true, message: "Request dismissed successfully." });
  } catch (err) {
    console.error("Dismiss leave error:", err);
    res.status(500).json({ success: false, message: "Failed to dismiss request." });
  }
});

app.get('/api/leave-types', authenticateToken,(req, res) => {
  db.query("SELECT * FROM leave_types WHERE is_active = 1", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch leave types." });
    res.json(results || []);
  });
});


app.get('/api/leave-balances/:userId', authenticateToken, verifyOwnership, async (req, res) => {
  const userId = Number(req.params.userId);
  const year = Number(req.query.year || new Date().getFullYear());

  if (
    !Number.isSafeInteger(userId) ||
    userId <= 0 ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid user ID or leave year.'
    });
  }

  try {
    const [types] = await db.promise().query(
      `SELECT id, name, annual_quota
       FROM leave_types
       WHERE is_active = 1`
    );

    for (const type of types) {
      const isCto = /compensatory|cto|cpo/i.test(type.name || '');

      if (!isCto && type.annual_quota == null) {
        continue;
      }

      const initialBalance = isCto
        ? 0
        : Number(type.annual_quota);

      if (
        !Number.isFinite(initialBalance) ||
        initialBalance < 0
      ) {
        continue;
      }

      await db.promise().query(
        `INSERT IGNORE INTO employee_leave_balances
           (user_id, leave_type_id, remaining_days, year, last_updated)
         VALUES (?, ?, ?, ?, CURDATE())`,
        [
          userId,
          type.id,
          initialBalance,
          year
        ]
      );
    }

    const [results] = await db.promise().query(
      `SELECT
         lt.name AS leave_type,
         eb.remaining_days,
         lt.annual_quota
       FROM employee_leave_balances eb
       JOIN leave_types lt ON lt.id = eb.leave_type_id
       WHERE eb.user_id = ?
         AND eb.year = ?`,
      [userId, year]
    );

    return res.json(results || []);
  } catch (error) {
    console.error('Leave balances error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load leave balances.'
    });
  }
});


app.put('/api/leave-balances/:userId', authenticateToken, requireAction('leave-balances:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const { userId } = req.params;
  const { leave_type_id, remaining_days, year } = req.body;

  if (!leave_type_id || remaining_days === undefined || !year) {
    return res.status(400).json({ success: false, message: "Missing required balance parameters." });
  }

  try {
    // 🚨 FIX: Verify the leave type to block CTO bypasses
    const [typeCheck] = await db.promise().query("SELECT name FROM leave_types WHERE id = ?", [leave_type_id]);
    if (typeCheck.length > 0) {
      const tName = typeCheck[0].name.toLowerCase();
      if (tName.includes('compensatory') || tName.includes('cto')) {
        return res.status(400).json({ 
          success: false, 
          message: "CTO balances must be adjusted using the CTO Ledger modal, not direct edits." 
        });
      }
    }

    const [userRows] = await db.promise().query(
      "SELECT id FROM users WHERE id = ? OR employee_id = ?",
      [userId, userId]
    );

    if (userRows.length === 0) return res.status(404).json({ success: false, message: "User not found." });
    const internalUserId = userRows[0].id;

    await db.promise().query(
      `INSERT INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated)
       VALUES (?, ?, ?, ?, CURDATE())
       ON DUPLICATE KEY UPDATE remaining_days = VALUES(remaining_days), last_updated = CURDATE()`,
      [internalUserId, leave_type_id, remaining_days, year]
    );

    res.json({ success: true, message: "Leave balance successfully updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to update leave balance." });
  }
});

// ============================================
// 5. CALENDAR & EVENTS (Secured & Validated)
// ============================================

app.get('/api/events', authenticateToken, (req, res) => { 
  const sql = `
    SELECT id, title, DATE_FORMAT(date, '%Y-%m-%d') as date, place, start_time, end_time, type, description, 'None' as status FROM events
    UNION ALL
    SELECT lr.id, CONCAT(u.full_name, ' (', lr.type, ')') as title, DATE_FORMAT(lr.request_date, '%Y-%m-%d') as date, 'Leave' as place, '08:00:00' as start_time, '17:00:00' as end_time, lr.type as type, 
    'Approved Leave' as description, -- MASKED REASON FOR PRIVACY
    lr.status
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
  const { date: today } = getPHTime(); // 🚨 ADDED
  
  if (!title || !date || !type) {
    return res.status(400).json({ success: false, message: 'Event title, date, and type are required.' });
  }
  // 🚨 ADDED VALIDATIONS
  if (date < today) {
    return res.status(400).json({ success: false, message: 'Cannot create events for past dates.' });
  }
  if (start_time && end_time && start_time >= end_time) {
    return res.status(400).json({ success: false, message: 'Event end time must be after start time.' });
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
  
  // 🚨 ADDED: Get today's date in PH time
  const { date: today } = getPHTime(); 

  if (!title || !date || !type) {
    return res.status(400).json({ success: false, message: 'Event title, date, and type are required.' });
  }

  // 🚨 ADDED: Prevent updating to a past date
  if (date < today) {
    return res.status(400).json({ success: false, message: 'Cannot update event to a past date.' });
  }

  // 🚨 ADDED: Prevent invalid time ranges
  if (start_time && end_time && start_time >= end_time) {
    return res.status(400).json({ success: false, message: 'Event end time must be after start time.' });
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

app.get('/api/schedules', authenticateToken, allowRoles('admin','hr_admin'), (req, res) => {
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
  const phNow = getPHDateTime();
  const sql = `
    SELECT 
      s.*, 
      p.program_name,  -- 👈 NEW: Fetches the Program Name
      a.time_in,
      a.time_out,
      DATE_FORMAT(s.date, '%Y-%m-%d') as date,
      lr_approved.duration AS leave_duration,
      
      -- Mobile Badge Status
      CASE 
        WHEN (ac.id IS NOT NULL AND ac.status = 'pending') OR (a.correction_status = 'pending') THEN 'Pending Correction'
        WHEN (ap.id IS NOT NULL AND ap.status = 'pending') THEN 'Pending Appeal'
        WHEN (lr_pending.id IS NOT NULL) THEN 'Pending Leave'
        WHEN (lr_approved.id IS NOT NULL) OR a.status = 'on leave' THEN 'On Leave'
        WHEN a.time_in IS NOT NULL AND a.time_out IS NOT NULL AND a.time_out != '--:--' THEN 'Completed'
        WHEN a.time_in IS NOT NULL AND (a.time_out IS NULL OR a.time_out = '--:--') THEN
          CASE 
            WHEN CONCAT(s.date, ' ', s.end_time) < ? THEN 'Missing Clock-Out'
            ELSE 'In Progress'
          END
        WHEN a.time_in IS NULL THEN
          CASE 
            WHEN CONCAT(s.date, ' ', s.end_time) < ? THEN 'Missed Schedule'
            ELSE 'Scheduled'
          END
        ELSE COALESCE(a.status, 'Scheduled')
      END AS attendance_record_status,

      -- Web UI Schedule Status
      CASE 
        WHEN (ac.id IS NOT NULL AND ac.status = 'pending') OR (a.correction_status = 'pending') OR (ap.id IS NOT NULL AND ap.status = 'pending') THEN 'PENDING'
        WHEN (lr_approved.id IS NOT NULL) OR a.status = 'on leave' THEN 'ON LEAVE'
        WHEN a.time_in IS NOT NULL AND a.time_out IS NOT NULL AND a.time_out != '--:--' THEN 'COMPLETED'
        WHEN a.time_in IS NOT NULL AND CONCAT(s.date, ' ', s.end_time) >= ? THEN 'IN PROGRESS'
        WHEN a.time_in IS NOT NULL AND CONCAT(s.date, ' ', s.end_time) < ? THEN 'MISSING CLOCK-OUT'
        WHEN a.time_in IS NULL AND CONCAT(s.date, ' ', s.end_time) < ? THEN 'MISSED SCHEDULE'
        ELSE 'Scheduled'
      END AS attendance_status

    FROM schedules s
    LEFT JOIN courses c ON s.course = c.name       -- 👈 NEW: Joins Courses
    LEFT JOIN programs p ON c.program_id = p.id    -- 👈 NEW: Joins Programs
    LEFT JOIN attendance a ON s.id = a.schedule_id
    LEFT JOIN attendance_corrections ac ON s.id = ac.schedule_id AND ac.status = 'pending'
    LEFT JOIN attendance_appeals ap ON s.id = ap.schedule_id AND ap.status = 'pending'
    LEFT JOIN leave_requests lr_pending ON (lr_pending.user_id = s.user_id OR lr_pending.user_id = (SELECT id FROM users WHERE employee_id = s.user_id)) 
      AND lr_pending.request_date = s.date AND lr_pending.status = 'Pending'
    LEFT JOIN leave_requests lr_approved ON (lr_approved.user_id = s.user_id OR lr_approved.user_id = (SELECT id FROM users WHERE employee_id = s.user_id)) 
      AND lr_approved.request_date = s.date AND lr_approved.status = 'Approved'
    WHERE s.user_id = ? 
    ORDER BY s.date ASC, s.start_time ASC
  `;
  
  db.query(sql, [phNow, phNow, phNow, phNow, phNow, req.params.employeeId], (err, result) => {
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

app.get('/api/schedules/conflicts', authenticateToken, allowRoles('admin','hr_admin'), async (req, res) => {
  const { user_id, date, exclude_id } = req.query;
  if (!user_id || !date) return res.json([]);

  try {
    let sql = `SELECT id, start_time, end_time FROM schedules WHERE user_id = ? AND date = ?`;
    const params = [user_id, date];
    
    if (exclude_id) {
      sql += ` AND id != ?`;
      params.push(exclude_id);
    }
    
    const [rows] = await db.promise().query(sql, params);
    res.json(rows || []);
  } catch (err) {
    console.error("Conflict check error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules', authenticateToken, requireAction('schedules:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { user_id, date, place, course, start_time, end_time } = req.body;
  const { date: today } = getPHTime();

  if (!user_id || !date || !place || !course || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: 'All schedule fields are required.' });
  }
  if (date < today) {
    return res.status(400).json({ success: false, message: 'Cannot create a schedule for a past date.' });
  }
  if (start_time >= end_time) {
    return res.status(400).json({ success: false, message: 'End time must be after start time.' });
  }

  try {
    // ✅ NEW: Ensure employee is strictly ACTIVE
    const [userStatus] = await db.promise().query("SELECT status FROM users WHERE employee_id = ?", [user_id]);
    if (userStatus.length === 0 || userStatus[0].status !== 'active') {
      return res.status(400).json({ success: false, message: 'Cannot assign schedule. Employee is not active (Deactivated/Archived).' });
    }

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



app.put('/api/schedules/:id', authenticateToken, requireAction('schedules:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  const { date, place, course, start_time, end_time } = req.body;
  const scheduleId = req.params.id;
  const { date: today } = getPHTime();

  if (!date || !place || !course || !start_time || !end_time) {
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

app.delete('/api/schedules/:id', authenticateToken, requireAction('schedules:write'), async (req, res) => {
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

app.post('/api/schedules/bulk', authenticateToken, requireAction('schedules:write'), async (req, res) => {
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
        results.errors.push(`Row ${rowNum}: Cannot assign. Instructor ${employee_id} is not active (Deactivated/Archived/Deleted).`);
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




// ============================================
// 7. REPORTS & EMPLOYEES (Secured & Validated)
// ============================================


app.get('/api/attendance/all-recent', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view attendance records.' });
  }
  
  const sql = `
    SELECT a.*, 
           DATE_FORMAT(a.date, '%Y-%m-%d') as date, 
           u.full_name, 
           u.employee_id,
           COALESCE(
             (SELECT status FROM attendance_corrections c 
              WHERE c.schedule_id = a.schedule_id 
              ORDER BY c.id DESC LIMIT 1),
             a.correction_status
           ) as correction_status,
           -- ✅ FIX: Override the main status if the correction is cancelled/rejected
           CASE
             WHEN COALESCE(
               (SELECT status FROM attendance_corrections c 
                WHERE c.schedule_id = a.schedule_id 
                ORDER BY c.id DESC LIMIT 1),
               a.correction_status
             ) IN ('cancelled', 'rejected') THEN
               CASE
                 WHEN a.time_in IS NOT NULL AND (a.time_out IS NULL OR a.time_out = '--:--') THEN 'missing clock-out'
                 WHEN a.time_in IS NULL THEN 'missed schedule'
                 ELSE COALESCE(a.status, 'present')
               END
             ELSE a.status
           END as status
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
  const phNow = getPHDateTime(); 

    const sql = `
    SELECT 
      a.*, 
      DATE_FORMAT(a.date, '%Y-%m-%d') as date, 
      ROUND(
        TIMESTAMPDIFF(
          MINUTE,
          a.time_in,
          COALESCE(
            NULLIF(NULLIF(a.time_out, '--:--'), '00:00:00'),
            ${GEO_EXIT_SUBQUERY},
            s.end_time
          )
        ) / 60,
        2
      ) as total_hours,
      CASE 
        WHEN a.time_in IS NOT NULL AND (a.time_out IS NULL OR a.time_out = '--:--') THEN
          CASE 
            WHEN CONCAT(a.date, ' ', COALESCE(s.end_time, '23:59:59')) < ? THEN 'Missing Clock-Out'
            ELSE 'In Progress'
          END
        ELSE a.status
      END AS status
    FROM attendance a
    LEFT JOIN schedules s ON a.schedule_id = s.id
    LEFT JOIN users u ON u.employee_id = a.user_id
    WHERE a.user_id = ? 
    ORDER BY a.date DESC
  `;

  db.query(sql, [phNow, employeeId], (err, result) => {
    if (err) {
      console.error('Failed to load user attendance:', err);
      return res.status(500).json({ success: false, message: 'Failed to load user attendance.' });
    }
    res.json(result || []);
  });
});


app.get(
  '/api/payroll/employee-history/:employeeId',
  authenticateToken,
  verifyOwnership,
  (req, res) => {
    const { employeeId } = req.params;

    const sql = `
      SELECT
        p.id,
        p.month_year,
        p.period_start,
        p.period_end,
        p.salary_rate,
        p.total_hours,
        p.overtime_hours,
        p.overtime_pay,
        p.transport_allowance,
        p.meal_allowance,
        p.housing_allowance,
        p.bonus,
        p.sss_deduction,
        p.philhealth_deduction,
        p.pagibig_deduction,
        p.mbf_deduction,
        p.loan_deduction,
        p.other_deduction,
        p.late_deduction,
        p.gross_pay,
        p.tax_deduction,
        p.net_pay,
        p.status
      FROM payroll p
      JOIN users u ON p.user_id = u.id
      WHERE u.employee_id = ?
      ORDER BY p.id DESC
      LIMIT 36
    `;

    db.query(sql, [employeeId], (err, results) => {
      if (err) {
        console.error('Payroll history error:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to load payroll history.'
        });
      }

      res.json(results || []);
    });
  }
);


app.put('/api/employees/:id/employment-status', authenticateToken,
  requireAction('employees:change-status'), async (req,res) => {
  const { employment_status } = req.body || {};
  if (!['active','separated'].includes(employment_status)) {
    return res.status(400).json({success:false,message:'Employment status must be active or separated.'});
  }
  try {
    const [rows] = await db.promise().query('SELECT id,role,employment_status FROM users WHERE id = ? LIMIT 1',[req.params.id]);
    if (!rows.length) return res.status(404).json({success:false,message:'Employee not found.'});
    const current = rows[0];
    if (current.employment_status === null) return res.status(409).json({success:false,message:'Legacy employment status requires manual classification before a transition.'});
    if (current.employment_status === employment_status) return res.json({success:true,message:'Employment status unchanged.'});
    if (current.role === 'admin' && employment_status === 'separated') {
      const [[count]] = await db.promise().query(
        "SELECT COUNT(*) AS total FROM users WHERE role='admin' AND status='active' AND employment_status='active' AND id <> ?",[current.id]);
      if (count.total === 0) return res.status(403).json({success:false,message:'Cannot separate the last active System Administrator.'});
    }
    await db.promise().query('UPDATE users SET employment_status=? WHERE id=?',[employment_status,current.id]);
    logAction(req.user.id,'CHANGE_EMPLOYMENT_STATUS','user',current.id,req,
      {employment_status:current.employment_status},{employment_status});
    return res.json({success:true,employment_status,message:'Employment status updated; access remains managed by Admin.'});
  } catch (err) {
    console.error('Employment status change:',err);
    return res.status(500).json({success:false,message:'Failed to update employment status.'});
  }
});

app.get('/api/accounts', authenticateToken, requireAction('accounts:view'), async(req,res) => {
  try {
    const [rows] = await db.promise().query(
      `SELECT id,employee_id,full_name,email,role,status AS account_status,employment_status,
              account_expiration_date, password_last_changed
       FROM users ORDER BY full_name ASC`);
    res.json(rows);
  } catch(err) {
    console.error('Account directory:',err);
    res.status(500).json({success:false,message:'Unable to load accounts.'});
  }
});

app.post('/api/accounts/:id/provision', authenticateToken,
  requireAction('accounts:provision'), async(req,res) => {
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 8 ||
      !/[A-Z]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return res.status(400).json({success:false,message:'Password must be at least 8 characters, with an uppercase letter and special character.'});
  }
  try {
    const [rows] = await db.promise().query(
      'SELECT id,email,password,role,status,employment_status FROM users WHERE id=? LIMIT 1',[req.params.id]);
    if (!rows.length) return res.status(404).json({success:false,message:'Employee not found.'});
    const target=rows[0];
    if (target.employment_status !== 'active' || target.status !== 'not_provisioned' || target.password !== null || target.role !== null) {
      return res.status(409).json({success:false,message:'Employee is not eligible for new account provisioning.'});
    }
    const emailCheck = await validateEmailForAccount(target.email,{checkDns:true});
    if (!emailCheck.valid) return res.status(400).json({success:false,message:emailCheck.reason});
    const hash=await bcrypt.hash(password,12);
    const [result]=await db.promise().query(
      "UPDATE users SET password=?,password_last_changed=CURRENT_DATE,status='pending_role' WHERE id=? AND status='not_provisioned' AND password IS NULL AND role IS NULL AND employment_status='active'",
      [hash,target.id]);
    if (result.affectedRows!==1) return res.status(409).json({success:false,message:'Account provisioning state changed. Reload and retry.'});
    logAction(req.user.id,'PROVISION_ACCOUNT','user',target.id,req);
    return res.json({success:true,account_status:'pending_role',message:'Credentials provisioned. Assign a role to enable login.'});
  }catch(err){console.error('Provision account:',err);return res.status(500).json({success:false,message:'Account provisioning failed.'});}
});

app.put('/api/accounts/:id/status', authenticateToken, async(req,res) => {
  const {status}=req.body||{};
  if (!['active','deactivated'].includes(status)) return res.status(400).json({success:false,message:'Invalid account status.'});
  if (req.user?.role!=='admin') return res.status(403).json({success:false,message:'System Admin permission required.'});
  if (String(req.params.id)===String(req.user.id)) return res.status(403).json({success:false,message:'Cannot change your own account status.'});
  try {
    const [rows]=await db.promise().query('SELECT id,role,password,status,employment_status FROM users WHERE id=? LIMIT 1',[req.params.id]);
    if(!rows.length)return res.status(404).json({success:false,message:'Account not found.'});
    const target=rows[0];
    if (target.status===status) return res.json({success:true,message:'Account status unchanged.'});
    if (!['active','deactivated'].includes(target.status)) return res.status(409).json({success:false,message:'Account must first be provisioned and assigned a role.'});
    if (status==='active' && (target.employment_status!=='active'|| !['admin','hr_admin','security','instructor'].includes(target.role)|| !target.password)) {
      return res.status(409).json({success:false,message:'Employee must be actively employed with valid credentials and role.'});
    }
    if (target.role==='admin' && status==='deactivated') {
      const [[count]]=await db.promise().query("SELECT COUNT(*) AS total FROM users WHERE role='admin' AND status='active' AND employment_status='active' AND id<>?",[target.id]);
      if (!count.total) return res.status(403).json({success:false,message:'Cannot deactivate last active System Administrator.'});
    }
    const [result]=await db.promise().query('UPDATE users SET status=? WHERE id=? AND status=?',[status,target.id,target.status]);
    if (result.affectedRows!==1) return res.status(409).json({success:false,message:'Account status changed. Reload and retry.'});
    logAction(req.user.id,status==='active'?'ACTIVATE_ACCOUNT':'DEACTIVATE_ACCOUNT','user',target.id,req,{status:target.status},{status});
    return res.json({success:true,status,message:'Account status updated.'});
  }catch(err){console.error('Account status:',err);return res.status(500).json({success:false,message:'Account status update failed.'});}
});

app.get('/api/employees', authenticateToken, allowRoles('admin','hr_admin','security','instructor'), async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
      const [results] = await db.promise().query(
        "SELECT id, employee_id, full_name, role, email FROM users WHERE status = 'active' ORDER BY full_name ASC"
      );
      return res.json(results || []);
    }

        let sql = `SELECT id, employee_id, full_name, first_name, last_name, email, role, status, employment_status,
              employment_type, position_level, contract_type, monthly_salary, 
              work_days_per_month, payroll_access, middle_initial, date_of_joining, 
              account_expiration_date, date_of_birth, phone_number, gender, 
              emergency_contact_name, emergency_contact_phone, street_address, 
              city, state_province, postal_code, country, position, profile_picture, additional_info
       FROM users`;
       
    const params = [];
    
    if (req.user.role !== 'admin') {
      sql += ` WHERE status != 'deleted'`;
    }
    
    sql += ` ORDER BY full_name ASC`;

    const [results] = await db.promise().query(sql, params);
    // Cross-department directory access is view-only and contains only basic fields.
    // Do not expose salary, personal identity details, or emergency contacts across departments.
    const directoryFields = ['id','employee_id','full_name','email','role','status',
      'position_level','position','contract_type','employment_type','phone_number','date_of_joining'];
    const safeResults = (results || []).map(person => {
      const ownsRecord = req.user.role === 'hr_admin' || req.user.role === 'admin';
      if (ownsRecord) return person;
      return Object.fromEntries(directoryFields.map(key => [key, person[key]]));
    });
    res.json(safeResults);
  } catch (err) {
    console.error("Failed to fetch employee directory:", err);
    res.status(500).json({ success: false, message: 'Failed to fetch employee directory.' });
  }
});

app.post('/api/employees', authenticateToken, requireAction('employees:create'), uploadResume.single('resume_file'), async (req, res) => {
  // HR creates personnel records only; an Admin provisions login separately.
  const data = req.body || {};
  const { employee_id, full_name, first_name, last_name, email,
    employment_type, position_level, contract_type, monthly_salary, work_days_per_month,
    payroll_access, payroll_pin, middle_initial, date_of_joining, date_of_birth,
    phone_number, gender, emergency_contact_name, emergency_contact_phone,
    street_address, city, state_province, postal_code, country, additional_info, position } = data;
  if (![employee_id, full_name, email].every(v => typeof v === 'string' && v.trim())) {
    return res.status(400).json({ success:false, message:'Employee ID, name and email are required.' });
  }
  const emailCheck = await validateEmailForAccount(email, { checkDns:true });
  if (!emailCheck.valid) return res.status(400).json({success:false,message:emailCheck.reason});
  

const salary =
  monthly_salary === undefined || monthly_salary === ''
    ? 0
    : Number(monthly_salary);

const workdays =
  work_days_per_month === undefined ||
  work_days_per_month === ''
    ? 22
    : Number(work_days_per_month);

if (
  !Number.isFinite(salary) ||
  salary < 0 ||
  salary > 99999999.99 ||
  !Number.isInteger(workdays) ||
  workdays < 1 ||
  workdays > 31
) {
  return res.status(400).json({
    success: false,
    message: 'Invalid salary or workdays per month.'
  });
}

const allowedEmployment = {
  'Full-time': [
    'Regular',
    'Probationary',
    'Project-based'
  ],
  'Part-time': [
    'Part-time'
  ],
  'Consultant': [
    'On-call Simulationist',
    'Offsite Consultant'
  ]
};

const selectedType = employment_type || 'Full-time';
const selectedContract = contract_type || 'Regular';

if (
  !(
    allowedEmployment[selectedType] || []
  ).includes(selectedContract)
) {
  return res.status(400).json({
    success: false,
    message:
      'Employment type and contract classification must match.'
  });
}

  let finalPin = null;
  if (payroll_pin !== undefined && payroll_pin !== null && String(payroll_pin).trim()) {
    const pin = String(payroll_pin).trim();
    if (!PAYROLL_PIN_PATTERN.test(pin) || pin === '1234') {
      return res.status(400).json({success:false,message:'Payroll PIN must be 4–6 digits and cannot be 1234.'});
    }
    finalPin = await bcrypt.hash(pin, 12);
  }
  let infoObj = {};
  if (additional_info) {
    try { infoObj = typeof additional_info === 'string' ? JSON.parse(additional_info) : additional_info; }
    catch { return res.status(400).json({success:false,message:'Invalid onboarding data.'}); }
    if (!infoObj || typeof infoObj !== 'object' || Array.isArray(infoObj)) {
      return res.status(400).json({success:false,message:'Invalid onboarding data.'});
    }
  }


if (infoObj.compensation_basis !== undefined) {
  const basis = infoObj.compensation_basis;
  const hourlyRate = Number(infoObj.hourly_rate);

  if (!['monthly', 'hourly'].includes(basis)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid compensation basis.'
    });
  }

  if (
    basis === 'hourly' &&
    (
      !Number.isFinite(hourlyRate) ||
      hourlyRate <= 0 ||
      hourlyRate > 99999999.99
    )
  ) {
    return res.status(400).json({
      success: false,
      message: 'A valid positive hourly rate is required.'
    });
  }
}


  if (req.file) infoObj.resume_file = `/uploads/resumes/${req.file.filename}`;
  try {
    const sql = `INSERT INTO users
      (employee_id,full_name,first_name,last_name,email,password,role,status,employment_status,
       employment_type,position_level,contract_type,monthly_salary,work_days_per_month,
       payroll_access,payroll_pin,middle_initial,date_of_joining,account_expiration_date,
       date_of_birth,phone_number,gender,emergency_contact_name,emergency_contact_phone,
       street_address,city,state_province,postal_code,country,additional_info,position,password_last_changed)
      VALUES (?,?,?,?,?,NULL,NULL,'not_provisioned','active',?,?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`;
    const params = [employee_id.trim(),full_name.trim(),first_name || null,last_name || null,email.trim().toLowerCase(),
      selectedType,
position_level || 'Entry Level Simulationist',
selectedContract,
      salary,workdays,payroll_access || 0,finalPin,middle_initial || null,date_of_joining || null,
      date_of_birth || null,phone_number || null,gender || 'prefer_not_to_say',
      emergency_contact_name || null,emergency_contact_phone || null,
      street_address || null,city || null,state_province || null,postal_code || null,
      country || 'Philippines',Object.keys(infoObj).length ? JSON.stringify(infoObj) : null,position || null];
    const [result] = await db.promise().query(sql, params);
    logAction(req.user.id,'CREATE_EMPLOYEE','user',result.insertId,req);
    return res.status(201).json({success:true,message:'Employee record created. Account not provisioned.',employeeId:employee_id, id:result.insertId});
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({success:false,message:'Employee ID or email already exists.'});
    console.error('Employee creation error:',err);
    return res.status(500).json({success:false,message:'Failed to create employee record.'});
  }
});

app.put('/api/employees/:id', authenticateToken, uploadResume.single('resume_file'), async(req, res) => {
  const employeeId = req.params.id;

    const isHR = req.user.role === 'hr_admin';
  const isSelf = req.user.id.toString() === employeeId.toString();
  const isPrivileged = isHR;
  if (!isHR && !isSelf) {
    return res.status(403).json({success:false,message:'Only HR may edit employee information.'});
  }
  
  if (req.user.role === 'admin') {
    return res.status(403).json({success:false,message:'Employee Information is read-only for System Admins.'});
  }

  
  const data = req.body ? { ...req.body } : {};
  const updates = { ...data };

  const normalizeRole = (roleStr) => {
    if (!roleStr) return roleStr;
    const clean = roleStr.toString().trim().toLowerCase();
    const roleMap = {
      'system admin': 'admin',
      'system_admin': 'admin',
      'administrator': 'admin',
      'admin': 'admin',
      'hr admin': 'hr_admin',
      'hr_admin': 'hr_admin',
      'hr administrator': 'hr_admin',
      'security guard': 'security',
      'security': 'security',
      'campus security': 'security',
      'employee': 'employee',
      'staff': 'employee',
      'faculty': 'employee'
    };
    return roleMap[clean] || clean;
  };

    try {
    const [oldRecord] = await db.promise().query("SELECT * FROM users WHERE id = ?", [employeeId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
    const oldData = oldRecord[0];

    if (oldData.role === 'admin') {
      
      const isDemoting = updates.role !== undefined && updates.role !== 'admin';
      const isDeactivating = updates.status !== undefined && updates.status !== 'active';

      if (isDemoting || isDeactivating) {
        const [adminCount] = await db.promise().query(
          "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'active' AND id != ?",
          [employeeId]
        );
        if (adminCount[0].count === 0) {
          return res.status(403).json({
            success: false,
            message: 'Action denied: This is the last active System Administrator. You cannot demote or deactivate this account.'
          });
        }
      }
    }



if (
  isHR &&
  (
    updates.employment_type !== undefined ||
    updates.contract_type !== undefined
  )
) {
  const type =
    updates.employment_type ??
    oldData.employment_type;

  const contract =
    updates.contract_type ??
    oldData.contract_type;

  const allowedEmployment = {
    'Full-time': [
      'Regular',
      'Probationary',
      'Project-based'
    ],
    'Part-time': [
      'Part-time'
    ],
    'Consultant': [
      'On-call Simulationist',
      'Offsite Consultant'
    ]
  };

  if (
    !(allowedEmployment[type] || []).includes(contract)
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Employment type and contract classification do not match.'
    });
  }
}


    if (updates.role !== undefined) updates.role = normalizeRole(updates.role);
    if (updates.system_role !== undefined) updates.system_role = normalizeRole(updates.system_role);

    // Only the dedicated Role Management endpoint can reassign roles.
    // This prevents department switching through employee profile updates.
    if (isPrivileged && (
      (updates.role !== undefined && updates.role !== oldData.role) ||
      (updates.system_role !== undefined && updates.system_role !== oldData.role)
    )) {
      return res.status(403).json({ success: false,
        message: 'Use Role Management to change account roles.' });
    }
    delete updates.role;
    delete updates.system_role;
    if (isPrivileged && String(req.user.id) === String(employeeId) &&
        updates.status !== undefined && updates.status !== oldData.status) {
      return res.status(403).json({ success: false, message: 'Cannot change your own account status.' });
    }

    
    // ROLE-BASED ACCESS CONTROL (RBAC) VALIDATION
    
    
    if (!isPrivileged) {
      
      delete updates.role;
      delete updates.system_role;
      delete updates.status;
      delete updates.monthly_salary;
      delete updates.work_days_per_month;
      delete updates.payroll_access;
      
      delete updates.payroll_pin;
      
      const selfFields = new Set(['first_name','last_name','middle_initial','full_name',
        'phone','phone_number','street','street_address','city','state','state_province',
        'postal_code','country']);
      for (const key of Object.keys(updates)) if (!selfFields.has(key)) delete updates[key];

    } else if (req.user.role === 'hr_admin') {
      
      if (updates.status !== undefined && updates.status !== oldData.status) {
        return res.status(403).json({success:false,message:'Use Account Access to change login status.'});
      }
      delete updates.status;
      delete updates.role;
      delete updates.system_role;
      delete updates.account_expiry;
      delete updates.account_expiration_date;
      delete updates.employment_status; 

    } else if (req.user.role === 'admin') {
      
      if (oldData.role === 'instructor') {
        return res.status(403).json({
          success: false,
          message: 'Instructors are managed by HR. Admins cannot edit Instructor accounts.'
        });
      }

      // Account administrators may change staff access information, not HR payroll or personal records.
      const adminAllowedFields = new Set(['email','status','account_expiry','account_expiration_date',
        'first_name','last_name','middle_initial','full_name','phone','phone_number']);
      for (const key of Object.keys(updates)) {
        if (!adminAllowedFields.has(key)) delete updates[key];
      }

      // Admin can only assign Staff roles
      if (updates.role !== undefined) {
        const allowedAdminRoles = ['admin', 'hr_admin', 'security'];
        if (!allowedAdminRoles.includes(updates.role)) {
          return res.status(403).json({
            success: false,
            message: 'Admins can only assign Staff roles (System Admin, HR Administrator, Security).'
          });
        }
      }
    }


if (isHR) {
  const salary =
    updates.monthly_salary !== undefined
      ? Number(updates.monthly_salary)
      : Number(oldData.monthly_salary);

  const days =
    updates.work_days_per_month !== undefined
      ? Number(updates.work_days_per_month)
      : Number(oldData.work_days_per_month);

  if (
    !Number.isFinite(salary) ||
    salary < 0 ||
    salary > 99999999.99 ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 31
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid salary or working days.'
    });
  }
}


   
    if (typeof updates.email === 'string' && updates.email.trim() !== '') {
      const incoming = normalizeEmail(updates.email);
      const existing = normalizeEmail(oldData.email);

      if (incoming !== existing) {
        
        // HR manages personnel information for both Staff and Instructors.
        // Existing email validation below remains enforced.
        const emailCheck = await validateEmailForAccount(incoming, { checkDns: true });
        if (!emailCheck.valid) {
          return res.status(400).json({ success: false, message: emailCheck.reason });
        }
      }
    }

    if (updates.additional_info !== undefined) {
      try {
        let infoObj = JSON.parse(updates.additional_info);
        if (req.file) {
          infoObj.resume_file = `/uploads/resumes/${req.file.filename}`;
        } else {
          if (oldData.additional_info) {
            const oldInfo = JSON.parse(oldData.additional_info);
            infoObj.resume_file = oldInfo.resume_file || '';
          }
        }

if (infoObj.compensation_basis !== undefined) {
  const basis = infoObj.compensation_basis;
  const hourlyRate = Number(infoObj.hourly_rate);

  if (
    !['monthly', 'hourly'].includes(basis) ||
    (
      basis === 'hourly' &&
      (
        !Number.isFinite(hourlyRate) ||
        hourlyRate <= 0 ||
        hourlyRate > 99999999.99
      )
    )
  ) {
    return res.status(400).json({
      success: false,
      message:
        'Invalid compensation basis or hourly rate.'
    });
  }
}

        updates.additional_info = JSON.stringify(infoObj);
      } catch(e) {
        console.error("Failed to parse additional_info:", e);
      }
    }
    delete updates.payroll_pin;

    const fieldMapping = {
      full_name: 'full_name',
      first_name: 'first_name',
      last_name: 'last_name',
      email: 'email',
      phone: 'phone_number',
      phone_number: 'phone_number',
      position_level: 'position_level',
      contract_type: 'contract_type',
      employment_type: 'employment_type',
      status: 'status',
      role: 'role',
      system_role: 'role',
      date_of_joining: 'date_of_joining',
      monthly_salary: 'monthly_salary',
      work_days_per_month: 'work_days_per_month',
      payroll_access: 'payroll_access',
      
      date_of_birth: 'date_of_birth',
      gender: 'gender',
      emergency_contact_name: 'emergency_contact_name',
      emergency_contact_phone: 'emergency_contact_phone',
      street: 'street_address',
      street_address: 'street_address',
      city: 'city',
      state: 'state_province',
      state_province: 'state_province',
      postal_code: 'postal_code',
      country: 'country',
      additional_info: 'additional_info',
      middle_initial: 'middle_initial',
      account_expiry: 'account_expiration_date',
      account_expiration_date: 'account_expiration_date',
      position: 'position',
    };

    const numColumns = ['monthly_salary', 'work_days_per_month'];

    const setClauses = [];
    const values = [];
    const handledColumns = new Set();

    for (const [frontField, dbField] of Object.entries(fieldMapping)) {
      if (updates[frontField] !== undefined && !handledColumns.has(dbField)) {
        handledColumns.add(dbField);
        let val = updates[frontField];

       
        if (val === '') {
          if (numColumns.includes(dbField)) {
            val = 0;
          } else {
            val = null;
          }
        }

        setClauses.push(`${dbField} = ?`);
        values.push(val);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields provided to update.' });
    }

    values.push(employeeId);
    const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;

    await db.promise().query(sql, values);

    if (typeof logAction === 'function') {
      logAction(req.user.id, 'UPDATE_EMPLOYEE', 'user', employeeId, req, oldData, updates);
    }

    return res.json({ success: true, message: 'Employee profile updated successfully.' });

  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Email is already in use by another account.' });
    }
    console.error("Update Employee Error:", error.message);
    return res.status(500).json({ success: false, message: `Database error during update: ${error.message}` });
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

app.get('/api/employees/:id', authenticateToken, verifyOwnership, (req, res) => {
  db.query(
    
    "SELECT id, employee_id, full_name, email, role, phone_number, position_level, position, status, profile_picture, password_last_changed FROM users WHERE id = ?", 
    [req.params.id], 
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error loading profile.' });
      if (results.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
      res.json(results[0]);
    }
  );
});



app.put('/api/employees/:employeeId/toggle-status', authenticateToken, (req, res) => {
  return res.status(410).json({success:false,message:'Legacy account-status toggle retired. Use Account Access.'});
});


const c14Types = new Set(['CORRECTION_PENDING','APPEAL_PENDING','CORRECTION_DECISION','APPEAL_DECISION','MISSING_CLOCK_OUT']);
async function c14Insert(userId, eventKey, type, title, message, targetType = null, targetId = null, pushNow = false) {
  if (!c14Types.has(type)) return;
  const [write] = await db.promise().query(
    `INSERT IGNORE INTO attendance_notifications
     (recipient_id,event_key,event_type,title,message,target_type,target_id)
     VALUES (?,?,?,?,?,?,?)`,
    [userId, eventKey, type, title, message, targetType, targetId]
  );
  // Push is best-effort; durable inbox delivery does NOT depend on Expo.
  if (write.affectedRows === 1 && pushNow) {
    try {
      const [[recipient]] = await db.promise().query(
        `SELECT expo_push_token FROM users WHERE id = ? AND status = 'active' LIMIT 1`, [userId]);
      if (recipient?.expo_push_token && Expo.isExpoPushToken(recipient.expo_push_token)) {
        await expo.sendPushNotificationsAsync([{
          to: recipient.expo_push_token, sound: 'default', title, body: message,
          data: { type: 'attendance_notification', eventKey }
        }]);
      }
    } catch (err) { console.warn('C14 push deferred; inbox retained:', err.message); }
  }
}

// Reconstruct recent notifications from official records, including when
// a server crash occurred between request commit and notification delivery.
async function c14ReconcileForUser(user) {
  const id = Number(user.id);
  if (!Number.isSafeInteger(id) || id < 1) return;
  if (['admin','hr_admin'].includes(user.role)) {
    const [corrections] = await db.promise().query(
      `SELECT c.id, u.full_name FROM attendance_corrections c
       JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending' AND c.created_at >= NOW() - INTERVAL 14 DAY
       ORDER BY c.id DESC LIMIT 60`);
    const [appeals] = await db.promise().query(
      `SELECT a.id, u.full_name FROM attendance_appeals a
       JOIN users u ON u.employee_id = a.user_id
       WHERE a.status = 'pending' AND a.submitted_at >= NOW() - INTERVAL 14 DAY
       ORDER BY a.id DESC LIMIT 60`);
    for (const r of corrections) await c14Insert(id, `correction:pending:${r.id}`, 'CORRECTION_PENDING',
      'Attendance correction pending', `${r.full_name} submitted an attendance correction.`, 'correction', r.id);
    for (const r of appeals) await c14Insert(id, `appeal:pending:${r.id}`, 'APPEAL_PENDING',
      'Attendance appeal pending', `${r.full_name} submitted an attendance appeal.`, 'appeal', r.id);
    // Hide stale HR pending notifications after an official decision.
    await db.promise().query(`
      UPDATE attendance_notifications n
      JOIN attendance_corrections c ON c.id = n.target_id
      SET n.read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP)
      WHERE n.recipient_id = ? AND n.event_type = 'CORRECTION_PENDING'
        AND c.status <> 'pending' AND n.read_at IS NULL`, [id]);
    await db.promise().query(`
      UPDATE attendance_notifications n
      JOIN attendance_appeals a ON a.id = n.target_id
      SET n.read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP)
      WHERE n.recipient_id = ? AND n.event_type = 'APPEAL_PENDING'
        AND a.status <> 'pending' AND n.read_at IS NULL`, [id]);
    return;
  }
  const [[owner]] = await db.promise().query(
    `SELECT id,employee_id FROM users WHERE id = ? AND status = 'active' LIMIT 1`, [id]);
  if (!owner || user.role !== 'instructor') return;
  const [corrections] = await db.promise().query(
    `SELECT id,status FROM attendance_corrections
     WHERE user_id = ? AND status IN ('approved','rejected')
       AND reviewed_at >= NOW() - INTERVAL 30 DAY ORDER BY id DESC LIMIT 60`, [id]);
  const [appeals] = await db.promise().query(
    `SELECT id,status FROM attendance_appeals
     WHERE user_id = ? AND status IN ('approved','rejected')
       AND reviewed_at >= NOW() - INTERVAL 30 DAY ORDER BY id DESC LIMIT 60`, [owner.employee_id]);
  for (const r of corrections) await c14Insert(id, `correction:${r.status}:${r.id}`, 'CORRECTION_DECISION',
    'Attendance correction update', `Your correction request was ${r.status}.`, 'correction', r.id);
  for (const r of appeals) await c14Insert(id, `appeal:${r.status}:${r.id}`, 'APPEAL_DECISION',
    'Attendance appeal update', `Your attendance appeal was ${r.status}.`, 'appeal', r.id);
  // Only incomplete attendance where Clock In is known, shift ended, no
  // pending request. Never call a routine absence a missing Clock Out.
  const [missing] = await db.promise().query(
    `SELECT s.id, DATE_FORMAT(s.date,'%Y-%m-%d') AS shift_date
     FROM schedules s JOIN attendance a ON a.schedule_id = s.id
     WHERE s.user_id = ? AND a.time_in IS NOT NULL AND a.time_out IS NULL
       AND DATE(s.date) BETWEEN DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR) - INTERVAL 3 DAY
                            AND DATE(UTC_TIMESTAMP() + INTERVAL 8 HOUR)
       
AND (
  TIMESTAMP(DATE(s.date), s.end_time)
  + INTERVAL (s.end_time <= s.start_time) DAY
  + INTERVAL 15 MINUTE
) < (UTC_TIMESTAMP() + INTERVAL 8 HOUR)

       AND NOT EXISTS (SELECT 1 FROM attendance_corrections c
         WHERE c.schedule_id = s.id AND c.status = 'pending')
       AND NOT EXISTS (SELECT 1 FROM attendance_appeals ap
         WHERE ap.schedule_id = s.id AND ap.status = 'pending')
     ORDER BY s.id DESC LIMIT 30`, [owner.employee_id]);
  for (const r of missing) await c14Insert(id, `missing-clock-out:${r.id}`, 'MISSING_CLOCK_OUT',
    'Missing Clock Out', `No Clock Out was recorded for the shift on ${r.shift_date}. Check Attendance History.`,
    'schedule', r.id);
}


// Non-blocking notifications after authoritative transaction commits.
// A missing C14 migration cannot cause a previously successful HR action
// to fail. The polling reconciliation also covers missed event inserts.
async function c14NotifyHRPending(kind, requestId, employeeName) {
  const [reviewers] = await db.promise().query(
    `SELECT id FROM users WHERE role IN ('admin','hr_admin') AND status = 'active'`);
  const type = kind === 'correction' ? 'CORRECTION_PENDING' : 'APPEAL_PENDING';
  for (const reviewer of reviewers) await c14Insert(reviewer.id,
    `${kind}:pending:${requestId}`, type, `Attendance ${kind} pending`,
    `${employeeName} submitted an attendance ${kind}.`, kind, requestId, true);
}
async function c14NotifyInstructorDecision(internalId, kind, requestId, status) {
  await c14Insert(internalId, `${kind}:${status}:${requestId}`,
    kind === 'correction' ? 'CORRECTION_DECISION' : 'APPEAL_DECISION',
    `Attendance ${kind} update`, `Your ${kind} request was ${status}.`, kind, requestId, true);
}
// Interval ensures delivery is attempted without requiring an open client.
// Only a bounded number of active accounts are evaluated per cycle.
const c14Dispatcher = setInterval(async () => {
  try {
    const [users] = await db.promise().query(
      `SELECT id,role FROM users WHERE status = 'active'
       AND role IN ('admin','hr_admin','instructor') ORDER BY id LIMIT 200`);
    for (const u of users) {
      try { await c14ReconcileForUser(u); }
      catch (err) { console.warn('C14 dispatcher skip:', err.message); }
    }
  } catch (err) { console.warn('C14 dispatcher unavailable:',err.message); }
}, 5 * 60 * 1000);
c14Dispatcher.unref?.();

// ================================================================
// C15.6: Conservative notification retention / background cleanup.
// This only purges OLD, ALREADY-READ entries from the auxiliary
// attendance_notifications table; it never touches official records.
// Retention is based on BOTH creation and read dates:
//   - created at least 180 days ago by default, AND
//   - marked read at least 30 days ago by default.
// Unread notifications are kept without an automatic expiry.
// Limits and interval are bounded to prevent a large cleanup query.
// No new table/column/index is required by this implementation.
// ================================================================
const c15RetentionInt = (name, fallback, min, max) => {
  const raw = process.env[name];
  if (raw == null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    console.warn(`C15 retention: invalid ${name}; using ${fallback}.`);
    return fallback;
  }
  return n;
};
const c15NotificationRetentionDays = c15RetentionInt('C15_NOTIFICATION_RETENTION_DAYS', 180, 90, 3650);
const c15ReadGraceDays = c15RetentionInt('C15_NOTIFICATION_READ_GRACE_DAYS', 30, 7, 3650);
const c15RetentionBatchSize = 250;
const c15RetentionMaxBatches = 4; // At most 1,000 deletions per daily run.
let c15RetentionRunning = false;

async function c15CleanupOldReadNotifications() {
  if (c15RetentionRunning) return;
  c15RetentionRunning = true;
  try {
    let deleted = 0;
    for (let batch = 0; batch < c15RetentionMaxBatches; batch++) {
      const [result] = await db.promise().query(
        `DELETE FROM attendance_notifications
         WHERE read_at IS NOT NULL
           AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)
           AND read_at < DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY id ASC LIMIT ?`,
        [c15NotificationRetentionDays, c15ReadGraceDays, c15RetentionBatchSize]
      );
      const affected = Number(result.affectedRows || 0);
      deleted += affected;
      if (affected < c15RetentionBatchSize) break;
    }
    if (deleted > 0) console.info(`C15 retention: removed ${deleted} expired read attendance notifications.`);
  } catch (err) {
    // Missing table / database outage must never affect attendance requests.
    console.warn('C15 notification retention deferred:', err.message);
  } finally {
    c15RetentionRunning = false;
  }
}

// Startup grace period avoids cleanup while the app is initializing.
// The interval is not a delivery guarantee and runs per server process;
// deletions remain bounded and safe under multiple server instances.
const c15RetentionStart = setTimeout(() => {
  void c15CleanupOldReadNotifications();
  const dailyTimer = setInterval(() => {
    void c15CleanupOldReadNotifications();
  }, 24 * 60 * 60 * 1000);
  dailyTimer.unref?.();
}, 60 * 60 * 1000);
c15RetentionStart.unref?.();

app.get('/api/attendance/notifications', authenticateToken, async (req, res) => {
  try {
    // Reconciliation is best-effort. Existing inbox remains readable if
    // a single legacy record cannot be resolved.
    try { await c14ReconcileForUser(req.user); }
    catch (err) { console.warn('C14 reconcile deferred:', err.message); }
    const [rows] = await db.promise().query(
      `SELECT id,event_type,title,message,target_type,target_id,created_at,read_at
       FROM attendance_notifications WHERE recipient_id = ?
       ORDER BY id DESC LIMIT 100`, [req.user.id]);
    const [[count]] = await db.promise().query(
      `SELECT COUNT(*) AS total FROM attendance_notifications
       WHERE recipient_id = ? AND read_at IS NULL`, [req.user.id]);
    res.json({ success: true, data: rows, unread: count.total });
  } catch (err) {
    console.error('C14 notifications error:', err);
    res.status(503).json({ success: false, code: 'C14_NOTIFICATIONS_UNAVAILABLE', message: 'Attendance notifications are unavailable. Apply the C14 database migration and retry.' });
  }
});

app.put('/api/attendance/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1)
      return res.status(400).json({ success: false, message: 'Invalid notification ID.' });
    const [result] = await db.promise().query(
      `UPDATE attendance_notifications SET read_at = COALESCE(read_at,CURRENT_TIMESTAMP)
       WHERE id = ? AND recipient_id = ?`, [req.params.id,req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true });
  } catch (err) {
    console.error('C14 mark read:', err);
    res.status(503).json({ success: false, message: 'Unable to mark notification as read.' });
  }
});

// ===============================================================
// C12: Attendance recovery / reconciliation (READ ONLY).
// Uses the same schedule_id as official attendance and HR requests.
// No automatic clock-out, no writes, no synthetic attendance times.
// ===============================================================
const c12PHDateKey = (d = new Date()) => new Date(d.getTime() + 8 * 3600000).toISOString().slice(0, 10);
const c12ValidDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;

async function c12RecoveryRows(req, res, employeeId = null, transform = null) {
  const today = c12PHDateKey();
  const from = req.query.from || today;
  const to = req.query.to || today;
  if (!c12ValidDate(from) || !c12ValidDate(to) || from > to ||
      (Date.parse(to) - Date.parse(from)) / 86400000 > 31) {
    return res.status(400).json({ success: false, code: 'C12_INVALID_DATE_RANGE', message: 'Choose a valid date range of at most 32 calendar days.' });
  }
  try {
    const params = [from, to];
    let ownerFilter = '';
    if (employeeId !== null) {
      ownerFilter = ' AND u.employee_id = ?';
      params.push(String(employeeId));
    }
    const [rows] = await db.promise().query(`
      SELECT s.id AS schedule_id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date,
        s.start_time, s.end_time, u.employee_id, u.full_name,
        a.id AS attendance_id, a.time_in, a.time_out, a.status AS attendance_status,
        a.total_hours,
        c.id AS correction_id, c.status AS correction_status, c.reason AS correction_reason,
        ap.id AS appeal_id, ap.status AS appeal_status,
        
CASE
  WHEN (
    TIMESTAMP(DATE(s.date), s.end_time)
    + INTERVAL (s.end_time <= s.start_time) DAY
    + INTERVAL 15 MINUTE
  ) < (UTC_TIMESTAMP() + INTERVAL 8 HOUR)
  THEN 1
  ELSE 0
END AS shift_ended

      FROM schedules s
      JOIN users u ON u.employee_id = s.user_id AND u.role = 'instructor' AND u.status IN ('active', 'deactivated')
      LEFT JOIN attendance a ON a.schedule_id = s.id
      LEFT JOIN attendance_corrections c ON c.id = (
        SELECT MAX(c2.id) FROM attendance_corrections c2 WHERE c2.schedule_id = s.id
      )
      LEFT JOIN attendance_appeals ap ON ap.id = (
        SELECT MAX(ap2.id) FROM attendance_appeals ap2 WHERE ap2.schedule_id = s.id
      )
      WHERE DATE(s.date) BETWEEN ? AND ? ${ownerFilter}
      ORDER BY s.date DESC, s.start_time DESC, s.id DESC LIMIT 500
    `, params);
    const data = rows.map(row => {
      const hasIn = row.time_in !== null && row.time_in !== '--:--';
      const hasOut = row.time_out !== null && row.time_out !== '--:--';
      const review = String(row.correction_status || '').toLowerCase();
      const appeal = String(row.appeal_status || '').toLowerCase();
      const offline = String(row.correction_reason || '').includes('[OFFLINE_SYNC:');
      const onLeave = String(row.attendance_status || '').toLowerCase().includes('leave');
      const ended = Number(row.shift_ended) === 1;
      let status = 'SCHEDULED';
      if (onLeave) status = 'ON_LEAVE';
      else if (review === 'pending' || appeal === 'pending') status = offline && review === 'pending' ? 'OFFLINE_PENDING_REVIEW' : 'PENDING_HR_REVIEW';
      else if (hasIn && hasOut) status = 'COMPLETED';
      else if (hasIn && ended) status = 'MISSING_CLOCK_OUT';
      else if (hasIn) status = 'IN_PROGRESS';
      else if (ended) status = 'MISSED_SCHEDULE';
      return {
        schedule_id: row.schedule_id, date: row.date, employee_id: row.employee_id,
        full_name: row.full_name, start_time: row.start_time, end_time: row.end_time,
        attendance_id: row.attendance_id, time_in: row.time_in, time_out: row.time_out,
        attendance_status: row.attendance_status, total_hours: row.total_hours,
        correction_id: row.correction_id, correction_status: review || null,
        appeal_id: row.appeal_id, appeal_status: appeal || null,
        status, needs_action: status === 'MISSING_CLOCK_OUT',
        offline_submitted_for_review: offline && review === 'pending',
        reviewed: ['approved', 'rejected', 'cancelled'].includes(review),
        // C13: Recovery state is derived from official records; no automatic edits.
        recovery_state: ['PENDING_HR_REVIEW', 'OFFLINE_PENDING_REVIEW'].includes(status)
          ? 'AWAITING_HR'
          : status === 'MISSING_CLOCK_OUT' ? 'NEEDS_CORRECTION'
          : status === 'COMPLETED' || status === 'ON_LEAVE' ? 'RESOLVED'
          : status === 'MISSED_SCHEDULE' ? 'NEEDS_REVIEW'
          : status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'NO_ACTION',
        recovery_guidance: ['PENDING_HR_REVIEW', 'OFFLINE_PENDING_REVIEW'].includes(status)
          ? 'Your request has reached the server and is awaiting HR review. Do not submit duplicates.'
          : status === 'MISSING_CLOCK_OUT'
          ? 'Your shift ended without a Clock Out. Open attendance correction to request HR review; do not invent a time.'
          : status === 'MISSED_SCHEDULE'
          ? 'No official attendance was recorded for this completed schedule. Contact HR or use the existing appeal process.'
          : status === 'COMPLETED' ? 'Attendance is recorded. Review completed correction decisions in your history.'
          : status === 'ON_LEAVE' ? 'Recorded as on leave.'
          : status === 'IN_PROGRESS' ? 'Your shift has not ended yet.'
          : 'No recovery action needed.',
        recovery_request_type: review === 'pending' ? 'correction' : appeal === 'pending' ? 'appeal' : null,
        recovery_request_id: review === 'pending' ? row.correction_id : appeal === 'pending' ? row.appeal_id : null
      };
    });
    const payload = { success: true, data, truncated: rows.length === 500, from, to };
    return res.json(transform ? transform(payload) : payload);
  } catch (err) {
    console.error('C12 recovery query failed:', err);
    return res.status(500).json({ success: false, code: 'C12_RECOVERY_UNAVAILABLE', message: 'Unable to load attendance recovery status.' });
  }
}

app.get('/api/attendance/recovery/user/:employeeId', authenticateToken, verifyOwnership,
  (req, res) => c12RecoveryRows(req, res, req.params.employeeId));
app.get('/api/attendance/recovery/overview', authenticateToken, allowRoles('admin', 'hr_admin'),
  (req, res) => c12RecoveryRows(req, res));

// C13.2: Read-only HR queue, reusing C12 filters and authorization.
app.get('/api/attendance/recovery/queue', authenticateToken, allowRoles('admin', 'hr_admin'),
  (req, res) => c12RecoveryRows(req, res, null, payload => {
    const relevant = payload.data.filter(row =>
      ['NEEDS_CORRECTION', 'NEEDS_REVIEW', 'AWAITING_HR', 'RESOLVED'].includes(row.recovery_state));
    return { ...payload, data: relevant, counts: {
      missing_clock_out: relevant.filter(r => r.recovery_state === 'NEEDS_CORRECTION').length,
      pending_hr: relevant.filter(r => r.recovery_state === 'AWAITING_HR').length,
      resolved: relevant.filter(r => r.recovery_state === 'RESOLVED').length
    }};
  }));


app.get('/api/attendance-report', authenticateToken, (req, res) => {
  if (!['admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const { date, month } = req.query;
  let dateCondition;
  let queryParam;

  if (month !== undefined) {
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ success: false, message: 'Invalid month.' });
    }

    dateCondition = "DATE_FORMAT(s.date, '%Y-%m') = ?";
    queryParam = month;
  } else {
    if (!isValidISOCalendarDate(date)) {
      return res.status(400).json({ success: false, message: 'Invalid date.' });
    }

    dateCondition = 'DATE(s.date) = DATE(?)';
    queryParam = date;
  }

  const sql = `
    SELECT
      u.id AS user_db_id,
      u.full_name,
      u.employee_id,
      lv.duration AS leave_duration,

      CASE
        WHEN lv.duration = 'Whole Day' THEN 'On Leave'

        WHEN EXISTS (
          SELECT 1
          FROM attendance_corrections ac
          WHERE ac.schedule_id = s.id
            AND ac.status = 'pending'
        ) THEN 'Pending'

        WHEN EXISTS (
          SELECT 1
          FROM attendance_appeals ap
          WHERE ap.schedule_id = s.id
            AND ap.status = 'pending'
        ) THEN 'Pending'

        WHEN a.time_out IS NOT NULL
          AND a.time_out <> '--:--' THEN
          CASE
            WHEN LOWER(TRIM(a.status)) = 'late'
              THEN 'Late'

            WHEN LOWER(TRIM(a.status)) = 'present'
              THEN 'Present'

            WHEN TIMESTAMP(DATE(s.date), a.time_in)
                   + INTERVAL (
                     s.end_time <= s.start_time
                     AND a.time_in < s.start_time
                   ) DAY
                 > TIMESTAMP(DATE(s.date), s.start_time)
                   + INTERVAL 30 MINUTE
              THEN 'Late'

            ELSE 'Present'
          END

        WHEN a.time_in IS NOT NULL
          AND (a.time_out IS NULL OR a.time_out = '--:--')
          AND TIMESTAMP(DATE(s.date), s.end_time)
              + INTERVAL (s.end_time <= s.start_time) DAY < NOW()
          THEN 'Missing Clock-Out'

        WHEN a.time_in IS NOT NULL
          AND (a.time_out IS NULL OR a.time_out = '--:--')
          THEN 'In Progress'

        WHEN lv.duration IN ('1st Half', '2nd Half')
          AND a.time_in IS NULL
          THEN 'Partial Leave'

        WHEN a.time_in IS NULL
          AND TIMESTAMP(DATE(s.date), s.end_time)
              + INTERVAL (s.end_time <= s.start_time) DAY < NOW()
          THEN 'Absent'

        ELSE COALESCE(a.status, 'Scheduled')
      END AS status,

      COALESCE(a.time_in, '--:--') AS time_in,

      COALESCE(
        NULLIF(NULLIF(a.time_out, '--:--'), '00:00:00'),
        '--:--'
      ) AS time_out,

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

      CASE
        WHEN a.time_in IS NULL
          OR a.time_out IS NULL
          OR a.time_out = '--:--'
          THEN 0

        ELSE GREATEST(0, ROUND(
          MOD(
            TIME_TO_SEC(
              CASE
                WHEN MOD(
                  TIME_TO_SEC(a.time_out)
                  - TIME_TO_SEC(s.end_time)
                  + 43200,
                  86400
                ) - 43200 BETWEEN -300 AND 900
                  THEN s.end_time
                ELSE a.time_out
              END
            ) - TIME_TO_SEC(a.time_in) + 86400,
            86400
          ) / 3600,
          2
        ))
      END AS total_hours

    FROM users u

    INNER JOIN schedules s
      ON (u.employee_id = s.user_id OR u.id = s.user_id)

    LEFT JOIN attendance a
      ON s.id = a.schedule_id
      AND (a.user_id = u.employee_id OR a.user_id = u.id)

    LEFT JOIN leave_requests lv
      ON (lv.user_id = u.employee_id OR lv.user_id = u.id)
      AND DATE(lv.request_date) = DATE(s.date)
      AND lv.status = 'Approved'

    WHERE LOWER(u.role) = 'instructor'
      AND u.status IN ('active', 'deactivated')
      AND ${dateCondition}

    ORDER BY u.full_name ASC, s.start_time ASC
  `;

  db.query(sql, [queryParam], (err, result) => {
    if (err) {
      console.error('Attendance report error:', err);
      return res.status(500).json({
        success: false,
        message: 'Database query failed.'
      });
    }

    return res.json(result || []);
  });
});

app.delete('/api/employees/:id', authenticateToken, async (req, res) => {
  
  return res.status(410).json({success:false,message:'Employee deletion disabled. Use employment separation.'});
  

  const employeeId = req.params.id;

  try {
    
    const [userRows] = await db.promise().query("SELECT id, employee_id, role, status FROM users WHERE id = ?", [employeeId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'Employee not found.' });
    if (String(req.user.id) === String(employeeId)) {
      return res.status(403).json({ success: false, message: 'Cannot permanently delete your own account.' });
    }
    if (userRows[0].role === 'instructor') {
      return res.status(403).json({ success: false, message: 'Instructor accounts are managed by HR and cannot be permanently deleted here.' });
    }

    if (userRows[0].role === 'admin') {
      const [adminCount] = await db.promise().query(
        "SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'active' AND id != ?",
        [employeeId]
      );
      if (adminCount[0].count === 0) {
        return res.status(403).json({ 
          success: false, 
          message: 'Action denied: You cannot permanently delete the last active System Administrator.' 
        });
      }
    }
    
    if (userRows[0].status !== 'deleted') {
      return res.status(400).json({ success: false, message: 'Employee must be moved to Deleted status before permanent deletion.' });
    }

    const empIdString = userRows[0].employee_id;


    await db.promise().query("DELETE FROM attendance WHERE user_id = ?", [empIdString]);
    await db.promise().query("DELETE FROM schedules WHERE user_id = ?", [empIdString]);
    await db.promise().query("DELETE FROM leave_requests WHERE user_id = ? OR user_id = ?", [empIdString, employeeId]);
    await db.promise().query("DELETE FROM payroll WHERE user_id = ?", [employeeId]);
    
    
   
    await db.promise().query("DELETE FROM users WHERE id = ?", [employeeId]);

    logAction(req.user.id, 'PERMANENT_DELETE_EMPLOYEE', 'user', employeeId, req);
    res.json({ success: true, message: 'Employee permanently deleted from the system.' });
  } catch (err) {
    console.error("Permanent Delete Error:", err);
    res.status(500).json({ success: false, message: 'Failed to permanently delete employee. They may have dependent records.' });
  }
});

app.get('/api/attendance-report-user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const sql = `
    SELECT a.*, 
           DATE_FORMAT(a.date, '%Y-%m-%d') as date, 
           COALESCE(a.total_hours, 0) AS total_hours,
           a.reviewed_at, a.updated_at, u.full_name, u.employee_id,
           COALESCE(
             (SELECT status FROM attendance_corrections c 
              WHERE c.schedule_id = a.schedule_id 
              ORDER BY c.id DESC LIMIT 1),
             a.correction_status
           ) as correction_status,
           -- ✅ FIX: Override the main status if the correction is cancelled/rejected
           CASE
             WHEN COALESCE(
               (SELECT status FROM attendance_corrections c 
                WHERE c.schedule_id = a.schedule_id 
                ORDER BY c.id DESC LIMIT 1),
               a.correction_status
             ) IN ('cancelled', 'rejected') THEN
               CASE
                 WHEN a.time_in IS NOT NULL AND (a.time_out IS NULL OR a.time_out = '--:--') THEN 'missing clock-out'
                 WHEN a.time_in IS NULL THEN 'missed schedule'
                 ELSE COALESCE(a.status, 'present')
               END
             ELSE a.status
           END as status
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

app.get('/api/appointments/:id/visitors', authenticateToken, allowRoles('admin','security'), (req, res) => {
  const { id } = req.params;
  db.query("SELECT * FROM appointment_visitors WHERE appointment_id = ?", [id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load companion visitors.' });
    res.json(results || []);
  });
});

app.get('/api/ble-tags', authenticateToken, allowRoles('admin','security'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const sql = `
    SELECT 
      t.id, 
      t.ble_id, 
      t.label, 
      t.mac_address,
      t.battery_level,
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
    if (err) return res.status(500).json({ success: false, message: 'Failed to fetch BLE tags.' });
    res.json(results || []);
  });
});

app.post('/api/ble-tags', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  const { ble_id, label, mac_address } = req.body;
  if (!ble_id || !mac_address) {
    return res.status(400).json({ success: false, message: "BLE ID and MAC address are required." });
  }
  
  
  if (ble_id.trim().length > 50 || (label && label.trim().length > 100)) {
    return res.status(400).json({ success: false, message: "BLE ID (max 50) or Label (max 100) is too long." });
  }

  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!macRegex.test(mac_address.trim())) {
    return res.status(400).json({ success: false, message: "Invalid MAC address format. Example: 00:1A:2B:3C:4D:5E" });
  }

  try {
    const [existing] = await db.promise().query(
      "SELECT id FROM ble_tags WHERE ble_id = ? OR UPPER(mac_address) = UPPER(?)", 
      [ble_id.trim(), mac_address.trim()]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "BLE ID or MAC address already exists." });
    }

    const [result] = await db.promise().query(
      "INSERT INTO ble_tags (ble_id, label, mac_address) VALUES (?, ?, ?)",
      [ble_id.trim(), label ? label.trim() : '', mac_address.trim().toUpperCase()]
    );

    logAction(req.user.id, 'CREATE_BLE_TAG', 'ble_tag', result.insertId, req);
    res.status(201).json({ success: true, message: "BLE Tag added successfully.", id: result.insertId });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/ble-tags/:id', authenticateToken, async (req, res) => {
  if (!['admin', 'security'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const tagId = Number(req.params.id);
  const { ble_id, label, mac_address } = req.body || {};
  if (!Number.isSafeInteger(tagId) || tagId <= 0 || typeof ble_id !== 'string' || !ble_id.trim() ||
      typeof mac_address !== 'string' || !mac_address.trim()) {
    return res.status(400).json({ success: false, message: 'Valid tag ID, BLE ID and MAC address are required.' });
  }
  if (ble_id.trim().length > 50 || (label && (typeof label !== 'string' || label.trim().length > 100))) {
    return res.status(400).json({ success: false, message: 'BLE ID (max 50) or Label (max 100) is too long.' });
  }
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!macRegex.test(mac_address.trim())) {
    return res.status(400).json({ success: false, message: 'Invalid MAC address format.' });
  }
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    const [existingTag] = await connection.query('SELECT ble_id FROM ble_tags WHERE id = ? FOR UPDATE', [tagId]);
    if (!existingTag.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'BLE tag not found.' });
    }
    const [inUse] = await connection.query(
      'SELECT id FROM visitor_requests WHERE ble_id = ? AND arrived = 1 AND returned = 0 AND no_show = 0 LIMIT 1',
      [existingTag[0].ble_id]
    );
    if (inUse.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Cannot edit a BLE tag assigned to an active visitor. Check out the visitor first.' });
    }
    const [duplicates] = await connection.query(
      'SELECT id FROM ble_tags WHERE (ble_id = ? OR UPPER(mac_address) = UPPER(?)) AND id != ? LIMIT 1',
      [ble_id.trim(), mac_address.trim(), tagId]
    );
    if (duplicates.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'A different tag with this BLE ID or MAC address already exists.' });
    }
    await connection.query('UPDATE ble_tags SET ble_id = ?, label = ?, mac_address = ? WHERE id = ?',
      [ble_id.trim(), typeof label === 'string' ? label.trim() : '', mac_address.trim().toUpperCase(), tagId]);
    await connection.commit();
    logAction(req.user.id, 'UPDATE_BLE_TAG', 'ble_tag', tagId, req);
    return res.json({ success: true, message: 'BLE Tag updated successfully.' });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'BLE ID already exists.' });
    console.error('BLE update error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update BLE tag.' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/api/ble-tags/:id', authenticateToken, async (req, res) => {
  if (!['admin', 'security'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const tagId = Number(req.params.id);
  if (!Number.isSafeInteger(tagId) || tagId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid BLE tag ID.' });
  }
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    const [tags] = await connection.query('SELECT ble_id FROM ble_tags WHERE id = ? FOR UPDATE', [tagId]);
    if (!tags.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Tag not found.' });
    }
    const [inUse] = await connection.query(
      'SELECT id, first_name, last_name FROM visitor_requests WHERE ble_id = ? AND arrived = 1 AND returned = 0 AND no_show = 0 LIMIT 1',
      [tags[0].ble_id]
    );
    if (inUse.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: `Cannot delete tag: Currently in use by visitor ${inUse[0].first_name} ${inUse[0].last_name}.` });
    }
    await connection.query('DELETE FROM ble_tags WHERE id = ?', [tagId]);
    await connection.commit();
    logAction(req.user.id, 'DELETE_BLE_TAG', 'ble_tag', tagId, req);
    return res.json({ success: true, message: 'BLE Tag deleted successfully.' });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('BLE tag delete error:', err);
    return res.status(500).json({ success: false, message: 'Unable to delete BLE tag.' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/api/ble-tags/in-use', authenticateToken, allowRoles('admin','security'), (req, res) => {
  db.query(
    "SELECT DISTINCT ble_id FROM visitor_requests WHERE arrived = 1 AND returned = 0 AND no_show = 0 AND ble_id IS NOT NULL",
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: 'Failed to fetch active tags.' });
      res.json(results.map(r => r.ble_id) || []);
    }
  );
});

app.put('/api/visitor-requests/:id/return', authenticateToken, requireAction('visitors:return'), async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid visitor request ID.' });
  }
  let connection;
  let bleId;
  let visitorName;
  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    // Read the current tag to acquire inventory and visit locks in the same order as check-in.
    const [initial] = await connection.query('SELECT ble_id FROM visitor_requests WHERE id = ?', [requestId]);
    if (!initial.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Visitor request not found.' });
    }
    if (initial[0].ble_id) {
      await connection.query('SELECT id FROM ble_tags WHERE ble_id = ? FOR UPDATE', [initial[0].ble_id]);
    }
    const [rows] = await connection.query(
      'SELECT id, first_name, last_name, ble_id, arrived, returned FROM visitor_requests WHERE id = ? FOR UPDATE',
      [requestId]
    );
    const visitor = rows[0];
    if (Number(visitor.arrived) !== 1) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Visitor has not checked in yet.' });
    }
    if (Number(visitor.returned) === 1) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Visitor has already returned their BLE tag.' });
    }
    if (visitor.ble_id !== initial[0].ble_id) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Visitor BLE tag changed. Refresh and try again.' });
    }
    bleId = visitor.ble_id;
    visitorName = `${visitor.first_name} ${visitor.last_name || ''}`.trim();
    const [update] = await connection.query(
      `UPDATE visitor_requests SET returned = 1, returned_at = NOW(), used_ble_id = ?, ble_id = NULL
       WHERE id = ? AND arrived = 1 AND returned = 0`,
      [bleId, requestId]
    );
    if (update.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Visit has already been checked out.' });
    }
    await connection.commit();
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('Visitor check-out error:', err);
    return res.status(500).json({ success: false, message: 'Unable to complete visitor check-out.' });
  } finally {
    if (connection) connection.release();
  }
  // Update live tracking only after the database transaction is committed.
  if (bleId) {
    // Do not erase tracking for a newer visit that reused the tag after this checkout committed.
    if (!liveVisitors[bleId] || !liveVisitors[bleId].visitorRequestId || liveVisitors[bleId].visitorRequestId === requestId) {
      delete visitorDestinations[bleId];
      delete liveVisitors[bleId];
      delete lastKnownVisitorsData[bleId];
      bleRoomCandidates.delete(bleId);
    }
    logVisitorHistory(
  bleId,
  visitorName,
  bleId,
  null,
  'Exit / Returned',
  'checkout',
  null,
  null
);

broadcastToTrackingClients({
  type: 'visitor_checkout',
  bleId,
  visitorRequestId: requestId
});
  }
  logAction(req.user.id, 'VISITOR_RETURN', 'visitor_request', requestId, req);
  return res.json({ success: true, message: 'BLE tag successfully returned.' });
});

app.get('/api/scanners', authenticateToken, allowRoles('admin','security'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  db.query("SELECT * FROM scanners ORDER BY assigned_floor ASC, assigned_room ASC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load scanners.' });
    res.json(results || []);
  });
});


app.post('/api/scanners', authenticateToken, async (req, res) => {
  // 1. Verify role permissions
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden.'
    });
  }

  const { scanner_id, assigned_room, assigned_floor } = req.body;
  if (
    typeof scanner_id !== 'string' ||
    typeof assigned_room !== 'string' ||
    typeof assigned_floor !== 'string' ||
    scanner_id.trim().length === 0 ||
    scanner_id.trim().length > 50 ||
    assigned_room.trim().length === 0 ||
    assigned_room.trim().length > 100 ||
    !['3', '5'].includes(assigned_floor.trim()) ||
    !(ALLOWED_ROOMS[assigned_floor.trim()] || [])
      .includes(assigned_room.trim()) ||
    !getRoomCoords(assigned_floor, assigned_room)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid scanner ID, floor, or mapped room.'
    });
  }

  try {
    // 3. Check whether scanner is already registered
    const [existing] = await db.promise().query(
      "SELECT id FROM scanners WHERE scanner_id = ?",
      [scanner_id.trim()]
    );

    // 4. Update scanner mapping if already registered
    if (existing.length > 0) {
      await db.promise().query(
        "UPDATE scanners SET assigned_room = ?, assigned_floor = ? WHERE scanner_id = ?",
        [assigned_room.trim(), assigned_floor.trim(), scanner_id.trim()]
      );

      logAction(req.user.id, 'UPDATE_SCANNER', 'scanner', existing[0].id, req);

      return res.json({
        success: true,
        message: "Scanner room mapping updated successfully."
      });
    }

    // 5. Register a new scanner
    const [result] = await db.promise().query(
      "INSERT INTO scanners (scanner_id, assigned_room, assigned_floor) VALUES (?, ?, ?)",
      [scanner_id.trim(), assigned_room.trim(), assigned_floor.trim()]
    );

    logAction(req.user.id, 'CREATE_SCANNER', 'scanner', result.insertId, req);

    return res.status(201).json({
      success: true,
      message: "Scanner registered successfully.",
      id: result.insertId
    });

  } catch (err) {
    console.error('Scanner registration error:', err);

    return res.status(500).json({
      success: false,
      message: 'Unable to register or update scanner.'
    });
  }
});


app.put('/api/scanners/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const { id } = req.params;
  const { scanner_id, assigned_room, assigned_floor } = req.body;

  if (!scanner_id || !assigned_room || !assigned_floor) {
    return res.status(400).json({ success: false, message: "Scanner ID, assigned room, and floor are required." });
  }


  // V01: Validate scanner mapping before updating it.
  if (
    typeof scanner_id !== 'string' ||
    typeof assigned_room !== 'string' ||
    typeof assigned_floor !== 'string' ||
    !['3', '5'].includes(assigned_floor.trim()) ||
    scanner_id.trim().length === 0 ||
    scanner_id.trim().length > 50 ||
    assigned_room.trim().length === 0 ||
    assigned_room.trim().length > 100 ||
    !(ALLOWED_ROOMS[assigned_floor.trim()] || [])
      .includes(assigned_room.trim()) ||
    !getRoomCoords(assigned_floor, assigned_room)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid scanner ID, floor, or mapped room.'
    });
  }


  try {
    // Check if the new scanner_id is already taken by a DIFFERENT scanner
    const [existing] = await db.promise().query(
      "SELECT id FROM scanners WHERE scanner_id = ? AND id != ?",
      [scanner_id.trim(), id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Another scanner already uses this ID." });
    }

    await db.promise().query(
      "UPDATE scanners SET scanner_id = ?, assigned_room = ?, assigned_floor = ? WHERE id = ?",
      [scanner_id.trim(), assigned_room.trim(), assigned_floor.trim(), id]
    );

    logAction(req.user.id, 'UPDATE_SCANNER', 'scanner', id, req);
    res.json({ success: true, message: "Scanner updated successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/scanners/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const { id } = req.params;
  db.query("DELETE FROM scanners WHERE id = ?", [id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "Database error." });
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Scanner not found." });
    logAction(req.user.id, 'DELETE_SCANNER', 'scanner', id, req);
    res.json({ success: true, message: "Scanner removed successfully." });
  });
});

// ============================================
// 8. VISITORS, SCANNERS & BLE TAGS (Secured & Validated)
// ============================================

// R04: HCT Academy appointment times use Philippine local date and time.
function validateVisitSchedule(date, time) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Select a valid appointment date (YYYY-MM-DD).';
  }
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return 'The selected appointment date does not exist.';
  }
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(time)) {
    return 'Select a valid appointment time (HH:MM).';
  }
  const today = getPHTime();
  if (date < today.date || (date === today.date && time.slice(0, 5) <= today.time.slice(0, 5))) {
    return 'Appointment date and time must be in the future (Philippine time).';
  }
  const minutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const weekday = parsed.getUTCDay();
  if (weekday === 0) return 'Appointments are not available on Sundays.';
  if (minutes < 480 || (weekday === 6 ? minutes >= 720 : minutes >= 1020)) {
    return weekday === 6
      ? 'Saturday appointments must be between 8:00 AM and 11:59 AM.'
      : 'Weekday appointments must be between 8:00 AM and 4:59 PM.';
  }
  return null;
}

// All appointment writes lock the requested slot to avoid concurrent booking/approval conflicts.
async function lockAppointmentSlot(connection, date, time) {
  const key = 'uv_visit_' + crypto.createHash('sha256').update(date + '|' + time.slice(0, 5)).digest('hex').slice(0, 32);
  const [[lock]] = await connection.query('SELECT GET_LOCK(?, 5) AS acquired', [key]);
  if (lock.acquired !== 1) { const e = new Error('Appointment slot is temporarily busy. Please retry.'); e.status = 409; throw e; }
  return key;
}

async function releaseAppointmentSlot(connection, lockKey) {
  if (connection && lockKey) {
    try { await connection.query('SELECT RELEASE_LOCK(?)', [lockKey]); }
    catch (err) { console.error('Appointment lock release failed:', err); }
  }
}

// No visitor identity or personal information is exposed to the public calendar.
app.get('/api/appointments/booked-slots', async (req, res) => {
  const date = req.query.date;
  if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return res.status(400).json({ success: false, message: 'Invalid date filter.' });
  }
  try {
    const [rows] = await db.promise().query(
      `SELECT DATE_FORMAT(visit_date, '%Y-%m-%d') AS visit_date,
              TIME_FORMAT(visit_time, '%H:%i') AS visit_time
       FROM visitor_requests WHERE status = 'APPROVED'
         AND visit_date >= ? AND (? IS NULL OR visit_date = ?)`,
      [getPHTime().date, date || null, date || null]
    );
    res.json(rows);
  } catch (error) {
    console.error('Public slots fetch error:', error);
    res.status(500).json({ success: false, message: 'Unable to load booked time slots.' });
  }
});

app.post('/api/appointments/book', async (req, res) => {
const {
  firstName,
  lastName,
  email,
  phone,
  date,
  time,
  reason,
  reason_type,
  custom_reason,
  additionalVisitors
} = req.body || {};
  const fields = [firstName, lastName, email, date, time, reason];
  if (fields.some(value => typeof value !== 'string' || !value.trim())) {
    return res.status(400).json({ success: false, message: 'Complete all required appointment fields, including first and last name.' });
  }
  const clean = {
    firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim().toLowerCase(),
    phone: typeof phone === 'string' ? phone.trim() : '', reason: reason.trim(),
    date, time: time.slice(0, 5)
  };


  // Validate the selected or custom purpose of visit.
  // Legacy callers without reason_type retain existing behavior.
  if (
    reason_type != null &&
    !['predefined', 'other'].includes(reason_type)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid visit reason type.'
    });
  }

  if (reason_type === 'other') {
    if (typeof custom_reason !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Please specify your reason for visiting.'
      });
    }

    const customReason = custom_reason.trim().replace(/\s+/g, ' ');

    if (customReason.length < 5 || customReason.length > 200) {
      return res.status(400).json({
        success: false,
        message: 'Custom visit reason must contain 5–200 characters.'
      });
    }

    const expectedReason = `Other: ${customReason}`;

    if (clean.reason !== expectedReason) {
      return res.status(400).json({
        success: false,
        message: 'The submitted custom visit reason is inconsistent.'
      });
    }
  }

  if (
    reason_type === 'predefined' &&
    custom_reason != null &&
    custom_reason !== ''
  ) {
    return res.status(400).json({
      success: false,
      message: 'Custom reason is only allowed when Other is selected.'
    });
  }

  if (clean.firstName.length > 100 || clean.lastName.length > 100 || clean.reason.length > 500 || clean.email.length > 255) {
    return res.status(400).json({ success: false, message: 'Appointment details exceed the allowed length.' });
  }
  if (phone != null && (typeof phone !== 'string' || (clean.phone && !/^[0-9+\-\s()]{7,20}$/.test(clean.phone)))) {
    return res.status(400).json({ success: false, message: 'Please enter a valid phone number.' });
  }
  const scheduleError = validateVisitSchedule(date, time);
  if (scheduleError) return res.status(400).json({ success: false, message: scheduleError });
  if (additionalVisitors != null && !Array.isArray(additionalVisitors)) {
    return res.status(400).json({ success: false, message: 'Companion list must be an array.' });
  }
  if ((additionalVisitors || []).length > 50) {
    return res.status(400).json({ success: false, message: 'Maximum of 50 companions per request.' });
  }
  const companions = [];
  const names = new Set([`${clean.firstName} ${clean.lastName}`.toLowerCase().replace(/\s+/g, ' ')]);
  for (const v of additionalVisitors || []) {
    if (!v || typeof v.name !== 'string' || !v.name.trim() || v.name.trim().length > 100) {
      return res.status(400).json({ success: false, message: 'Each companion requires a name of 1–100 characters.' });
    }
    const name = v.name.trim().replace(/\s+/g, ' ');
    const normalized = name.toLowerCase();
    if (names.has(normalized)) return res.status(409).json({ success: false, message: 'Duplicate visitor names are not allowed in one appointment.' });
    names.add(normalized);
    companions.push(name);
  }
  let connection, lockKey, appointmentId;
  try {
    const emailCheck = await validateEmailForAccount(clean.email, { checkDns: true });
    if (!emailCheck.valid) return res.status(400).json({ success: false, message: emailCheck.reason });

    if (reason_type === 'predefined') {
      const [validReasons] = await db.promise().query(
        `SELECT id
         FROM visit_reasons
         WHERE TRIM(reason_text) = ?
         LIMIT 1`,
        [clean.reason]
      );

      if (validReasons.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please select a valid visit reason.'
        });
      }
    }
    connection = await db.promise().getConnection();
    lockKey = await lockAppointmentSlot(connection, clean.date, clean.time);
    await connection.beginTransaction();
    const [reserved] = await connection.query(
      `SELECT id FROM visitor_requests WHERE visit_date = ? AND visit_time = ?
       AND status = 'APPROVED' LIMIT 1`, [clean.date, clean.time]
    );
    if (reserved.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'This time slot is already approved for another visit. Please choose another time.' });
    }
    const [duplicates] = await connection.query(
      `SELECT id FROM visitor_requests WHERE email = ? AND visit_date = ? AND visit_time = ?
       AND status IN ('PENDING', 'APPROVED', 'RESCHEDULED') LIMIT 1`, [clean.email, clean.date, clean.time]
    );
    if (duplicates.length) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'You already have a request for this date and time.' });
    }
    const [insert] = await connection.query(
      `INSERT INTO visitor_requests
       (first_name, last_name, email, phone, visit_date, visit_time, reason, ble_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'PENDING')`,
      [clean.firstName, clean.lastName, clean.email, clean.phone || null, clean.date, clean.time, clean.reason]
    );
    appointmentId = insert.insertId;
    if (companions.length) {
      await connection.query('INSERT INTO appointment_visitors (appointment_id, visitor_name, ble_id) VALUES ?',
        [companions.map(name => [appointmentId, name, null])]);
    }
    await connection.commit();
  } catch (error) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('Appointment booking error:', error);
    return res.status(error.status || 500).json({ success: false, message: error.status ? error.message : 'Unable to save appointment. Please try again.' });
  } finally {
    await releaseAppointmentSlot(connection, lockKey);
    if (connection) connection.release();
  }
  res.json({ success: true, message: 'Appointment request submitted successfully. Check your email for details.', appointmentId });
  const companionText = companions.length ? `\nAdditional Visitors:\n${companions.map((name, i) => `  ${i + 1}. ${name}`).join('\n')}\n` : '';
  const body = `Dear ${clean.firstName} ${clean.lastName},\n\nYour visit request has been received and is pending approval.\n\nDate: ${clean.date}\nTime: ${clean.time}\nReason: ${clean.reason}\n${companionText}\nBLE tags will be assigned at authorized check-in, after approval.\n\nThank you,\nHCT Academy`;
  resend.emails.send({ from: 'UniVITA Academy <no-reply@univitahct.tech>', to: [clean.email], subject: 'Visit Request Received - HCT Academy', text: body })
    .catch(error => console.error('Background appointment email error:', error));
});

app.put('/api/appointments/:id/status', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  const requestId = Number(req.params.id);
  const { status, adminNotes } = req.body || {};
  const notes = typeof adminNotes === 'string' ? adminNotes.trim() : '';
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  }
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid appointment status.' });
  }
  if (adminNotes != null && typeof adminNotes !== 'string') {
    return res.status(400).json({ success: false, message: 'Admin notes must be text.' });
  }
  if (notes.length > 500) {
    return res.status(400).json({ success: false, message: 'Admin notes must be 500 characters or less.' });
  }
  if (status === 'REJECTED' && !notes) {
    return res.status(400).json({ success: false, message: 'A reason is required when rejecting a request.' });
  }

  let connection;
  let request;
  let lockKey;
  try {
    connection = await db.promise().getConnection();
    if (status === 'APPROVED') {
      const [dateRows] = await connection.query('SELECT visit_date, visit_time FROM visitor_requests WHERE id = ?', [requestId]);
      if (!dateRows.length) return res.status(404).json({ success: false, message: 'Appointment request not found.' });
      lockKey = await lockAppointmentSlot(connection, String(dateRows[0].visit_date).slice(0, 10), String(dateRows[0].visit_time).slice(0, 5));
    }
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM visitor_requests WHERE id = ? FOR UPDATE', [requestId]);
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Appointment request not found.' });
    }
    request = rows[0];
    if (status === 'APPROVED') {
      const expectedSlotKey = 'uv_visit_' + crypto.createHash('sha256').update(
        String(request.visit_date).slice(0, 10) + '|' + String(request.visit_time).slice(0, 5)
      ).digest('hex').slice(0, 32);
      if (lockKey !== expectedSlotKey) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'Appointment schedule changed. Refresh and approve again.' });
      }
    }
    if (request.status !== 'PENDING' || Number(request.arrived) === 1 || Number(request.no_show) === 1) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Only pending, unvisited appointments can be approved or rejected.' });
    }
    if (status === 'APPROVED') {
      const scheduleError = validateVisitSchedule(String(request.visit_date).slice(0, 10), String(request.visit_time).slice(0, 5));
      if (scheduleError) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: `Cannot approve appointment: ${scheduleError}` });
      }
      const [conflicts] = await connection.query(
        `SELECT id FROM visitor_requests
         WHERE visit_date = ? AND visit_time = ? AND status = 'APPROVED' AND id != ? LIMIT 1`,
        [request.visit_date, request.visit_time, requestId]
      );
      if (conflicts.length) {
        await connection.rollback();
        return res.status(409).json({ success: false, message: 'This time slot has already been approved for another visit.' });
      }
    }
    const [update] = await connection.query(
      `UPDATE visitor_requests SET status = ?, admin_notes = ?, processed_by = ?, processed_at = NOW()
       WHERE id = ? AND status = 'PENDING' AND arrived = 0 AND no_show = 0`,
      [status, notes || null, req.user.id, requestId]
    );
    if (update.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Appointment status changed. Refresh and try again.' });
    }
    await connection.commit();
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('Appointment decision error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update appointment status.' });
  } finally {
    await releaseAppointmentSlot(connection, lockKey);
    if (connection) connection.release();
  }

  logAction(req.user.id, status === 'APPROVED' ? 'APPROVE_APPOINTMENT' : 'REJECT_APPOINTMENT', 'visitor_request', requestId, req);
  try {
    const [companions] = await db.promise().query('SELECT * FROM appointment_visitors WHERE appointment_id = ?', [requestId]);
    let emailBody = `Dear ${request.first_name} ${request.last_name},\n\n`;
    emailBody += status === 'APPROVED'
      ? 'Your visit request has been APPROVED.\n\nWe look forward to welcoming you to HCT Academy.\n\n'
      : `We regret to inform you that your visit request has been DECLINED.\n\nReason: ${notes}\n\n`;
    emailBody += `Details:\nDate: ${request.visit_date}\nTime: ${request.visit_time}\nReason: ${request.reason}\n`;
    if (request.phone) emailBody += `Phone: ${request.phone}\n`;
    if (companions.length) {
      emailBody += '\nAdditional Visitors:\n';
      companions.forEach((v, index) => { emailBody += `  ${index + 1}. ${v.visitor_name}\n`; });
    }
    emailBody += '\nBLE tags for tracking will be assigned upon arrival by our security guard.\n\nBest regards,\nHCT Academy';
    const subject = status === 'APPROVED' ? 'Visit Request Approved - HCT Academy' : 'Visit Request Status Update - HCT Academy';
    transporter.sendMail({ from: process.env.MAIL_USER, to: request.email, subject, text: emailBody }, (error) => {
      if (error) console.error('Appointment decision email error:', error);
    });
  } catch (err) {
    console.error('Appointment email preparation error:', err);
  }
  return res.json({ success: true, message: `Appointment ${status} successfully. Email notification queued.` });
});

app.put('/api/appointments/:id', authenticateToken, requireAction('visitors:approve'), async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only Administrators can reschedule appointments.' });
  }
  const id = Number(req.params.id);
  const { visit_date, visit_time, admin_notes } = req.body || {};
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'Invalid appointment ID.' });
  const scheduleError = validateVisitSchedule(visit_date, visit_time);
  if (scheduleError) return res.status(400).json({ success: false, message: scheduleError });
  if (admin_notes != null && (typeof admin_notes !== 'string' || admin_notes.length > 500)) {
    return res.status(400).json({ success: false, message: 'Reschedule reason must be text of 500 characters or less.' });
  }
  let connection, lockKey, previous;
  try {
    connection = await db.promise().getConnection();
    lockKey = await lockAppointmentSlot(connection, visit_date, visit_time);
    await connection.beginTransaction();
    const [rows] = await connection.query('SELECT * FROM visitor_requests WHERE id = ? FOR UPDATE', [id]);
    if (!rows.length) { await connection.rollback(); return res.status(404).json({ success: false, message: 'Appointment not found.' }); }
    previous = rows[0];
    if (!['PENDING', 'APPROVED', 'RESCHEDULED'].includes(previous.status) || previous.arrived || previous.returned || previous.no_show) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Only active, unvisited appointment requests can be rescheduled.' });
    }
    if (String(previous.visit_date).slice(0, 10) === visit_date && String(previous.visit_time).slice(0, 5) === visit_time.slice(0, 5)) {
      await connection.rollback();
      return res.status(409).json({ success: false, message: 'Choose a different date or time to reschedule.' });
    }
    const [conflicts] = await connection.query(
      `SELECT id FROM visitor_requests WHERE visit_date = ? AND visit_time = ? AND status = 'APPROVED' AND id != ? LIMIT 1`,
      [visit_date, visit_time, id]);
    if (conflicts.length) { await connection.rollback(); return res.status(409).json({ success: false, message: 'This time slot has already been approved for another visit.' }); }
    const [duplicates] = await connection.query(
      `SELECT id FROM visitor_requests WHERE email = ? AND visit_date = ? AND visit_time = ? AND status IN ('PENDING','APPROVED','RESCHEDULED') AND id != ? LIMIT 1`,
      [previous.email, visit_date, visit_time, id]);
    if (duplicates.length) { await connection.rollback(); return res.status(409).json({ success: false, message: 'This visitor already has a request for the selected time.' }); }
    await connection.query('UPDATE visitor_requests SET visit_date = ?, visit_time = ?, admin_notes = ? WHERE id = ?',
      [visit_date, visit_time.slice(0, 5), admin_notes?.trim() || null, id]);
    await connection.commit();
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('Reschedule failed:', err);
    return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : 'Failed to update appointment schedule.' });
  } finally {
    await releaseAppointmentSlot(connection, lockKey);
    if (connection) connection.release();
  }
  logAction(req.user.id, 'RESCHEDULE_APPOINTMENT', 'visitor_request', id, req);
  const emailBody = `Dear ${previous.first_name} ${previous.last_name},\n\nYour campus visit schedule has been updated.\n\nDate: ${visit_date}\nTime: ${visit_time}\n${admin_notes ? `Reason: ${admin_notes}\n` : ''}\nHCT Academy`;
  transporter.sendMail({ from: process.env.MAIL_USER, to: previous.email, subject: 'Appointment Schedule Updated - HCT Academy', text: emailBody },
    error => { if (error) console.error('Reschedule email error:', error); });
  return res.json({ success: true, message: 'Appointment successfully rescheduled.' });
});

app.get('/api/appointments/pending', authenticateToken, allowRoles('admin','security'), (req, res) => {
  db.query("SELECT * FROM visitor_requests WHERE status = 'PENDING'", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch pending requests." });
    res.json(results || []);
  });
});

app.get('/api/appointments/history', authenticateToken, allowRoles('admin','security'), (req, res) => {
  db.query("SELECT * FROM visitor_requests WHERE status != 'PENDING' ORDER BY visit_date DESC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Failed to fetch history." });
    res.json(results || []);
  });
});

app.get('/api/dashboard/summary', authenticateToken, allowRoles('admin','hr_admin','security'), async (req, res) => {
  try {
    const [leaves, visitors, employees] = await Promise.all([
      db.promise().query("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'Pending'"),
      db.promise().query("SELECT COUNT(*) as count FROM attendance WHERE date = CURDATE()"),
      db.promise().query("SELECT COUNT(*) as count FROM events WHERE date = CURDATE()")
    ]);
    res.json({ pendingLeaves: leaves[0][0].count, presentToday: visitors[0][0].count, eventsToday: employees[0][0].count });
  } catch (err) { res.status(500).send(err); }
});



setInterval(async () => {
  try {
    const [rows] = await db.promise().query(
      "SELECT config_value FROM system_settings WHERE config_key = 'loiter_threshold_minutes'"
    );

    
const configuredMinutes = rows.length > 0
  ? Number(rows[0].config_value)
  : UV_CONFIG_DEFAULT_LOITER_MINUTES;

const thresholdMinutes =
  Number.isSafeInteger(configuredMinutes) &&
  configuredMinutes >= 1 &&
  configuredMinutes <= 180
    ? configuredMinutes
    : UV_CONFIG_DEFAULT_LOITER_MINUTES;


    const LOITER_THRESHOLD_MS = thresholdMinutes * 60 * 1000;
    const SIGNAL_FRESHNESS_MS = 45000;
    const now = Date.now();

    for (const bleId of Object.keys(liveVisitors)) {
      const visitor = liveVisitors[bleId];

      if (
        !visitor ||
        !visitor.isDetected ||
        visitor.isDisconnected ||
        visitor.trackingStatus !== 'active' ||
        !Number.isFinite(visitor.lastSeen) ||
        now - visitor.lastSeen > SIGNAL_FRESHNESS_MS ||
        !Number.isFinite(visitor.roomEnteredAt)
      ) {
        continue;
      }

      const inWrongRoom =
        Boolean(visitor.destination) &&
        visitor.destination !== 'Unknown' &&
        visitor.destination !== 'Not Assigned' &&
        visitor.currentRoom !== 'Unknown' &&
        visitor.currentRoom !== 'Waiting for Scanner...' &&
        visitor.currentRoom !== visitor.destination;

      const stayDurationMs = now - visitor.roomEnteredAt;

      if (
        inWrongRoom &&
        stayDurationMs >= LOITER_THRESHOLD_MS &&
        !visitor.loiterAlertSent
      ) {
        visitor.loiterAlertSent = true;

        logVisitorHistory(
          visitor.id,
          visitor.name,
          visitor.bleId,
          visitor.floor,
          visitor.currentRoom,
          'loitering',
          visitor.x,
          visitor.y
        );

        console.log(
          `[VISITOR TRACKING] Unexpected room stay flagged for review: ${visitor.name}`
        );
      }
    }
  } catch (err) {
    console.error('Loitering Watchdog Error:', err);
  }
}, 10000);

setInterval(async () => {
  try {
    const [deadScanners] = await db.promise().query(`
      SELECT scanner_id, assigned_room FROM scanners 
      WHERE last_ping < NOW() - INTERVAL 5 MINUTE AND status = 'ONLINE'
    `);

    for (const scanner of deadScanners) {
      
      await db.promise().query("UPDATE scanners SET status = 'OFFLINE' WHERE scanner_id = ?", [scanner.scanner_id]);
      
      
      console.log(`[SYSTEM ALERT] Scanner ${scanner.scanner_id} went offline! Updated status in database.`);
    }
  } catch (err) {
    console.error("Scanner Watchdog Error:", err);
  }
}, 60000);


// UNIFIED VISITOR TRACKING WATCHDOG (Single Timer)


let liveVisitors = {};
let lastKnownVisitorsData = {};

// V02: Signal loss applies only after a real BLE detection.
setInterval(async () => {
  const now = Date.now();
  const INACTIVITY_THRESHOLD_MS = 45000;

  let validBleIds = null;

  try {
    const [activeRows] = await db.promise().query(`
      SELECT ble_id
      FROM visitor_requests
      WHERE arrived = 1
        AND returned = 0
        AND no_show = 0
        AND ble_id IS NOT NULL
    `);

    validBleIds = new Set(
      activeRows.map(row => String(row.ble_id).trim())
    );

  } catch (err) {
    console.error(
      'Active-tag lookup failed:',
      err.message
    );

    // Preserve existing live tracking state.
    return;
  }

  for (const bleId of Object.keys(liveVisitors)) {
    if (!validBleIds.has(bleId)) {
      delete liveVisitors[bleId];
      delete lastKnownVisitorsData[bleId];
      bleRoomCandidates.delete(bleId);
      continue;
    }

    const visitor = liveVisitors[bleId];

    // Waiting for the first scan is not signal loss.
    if (!visitor?.isDetected) continue;

    if (
      !visitor.isDisconnected &&
      now - Number(visitor.lastSeen || 0) >
        INACTIVITY_THRESHOLD_MS
    ) {
      visitor.isDisconnected = true;
      visitor.trackingStatus = 'signal_lost';
      visitor.disconnectedAt = now;

      logVisitorHistory(
        bleId,
        visitor.name,
        bleId,
        visitor.floor,
        visitor.currentRoom,
        'signal_lost',
        visitor.x,
        visitor.y
      );

      broadcastToTrackingClients({
        type: 'location_update',
        visitor: { ...visitor }
      });
    }

    lastKnownVisitorsData[bleId] = { ...visitor };
  }
}, 10000);


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


/* ============================================================
   V01 — UNIFIED BLE SCANNER INGESTION

   Both /api/ble-data and /api/scan use the same validation.
   A room change requires two consistent detections within
   a 12-second confirmation window.
   ============================================================ */

const BLE_ROOM_CONFIRMATIONS = 2;
const BLE_ROOM_CONFIRM_WINDOW_MS = 12000;

const bleRoomCandidates = new Map();
const bleTagScanQueues = new Map();


// 1. VALIDATE INCOMING SCANNER PAYLOAD
const normalizeBleScanInput = (body, legacy = false) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const scannerId = body.scannerId;
  const tagMac = legacy ? body.beaconId : body.tagMac;

  if (
    typeof scannerId !== 'string' ||
    typeof tagMac !== 'string'
  ) {
    return null;
  }

  const scanner = scannerId.trim();
  const mac = tagMac.trim();

  if (
    !scanner ||
    scanner.length > 50 ||
    !mac ||
    mac.length > 50 ||
    !/^[a-zA-Z0-9:\-]+$/.test(mac)
  ) {
    return null;
  }

  const optionalNumber = (value, minimum, maximum) => {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      return null;
    }

    const number = Number(value);

    if (
      !Number.isFinite(number) ||
      number < minimum ||
      number > maximum
    ) {
      throw new Error('INVALID_TELEMETRY');
    }

    return number;
  };

  try {
    return {
      scannerId: scanner,
      tagMac: mac,
      rssi: optionalNumber(body.rssi, -127, 0),
      vbatt: optionalNumber(body.vbatt, 1800, 3600)
    };
  } catch (_) {
    return null;
  }
};

// 2. PROCESS VALIDATED BLE DETECTION
async function processValidatedBleScan(scan) {

  // 1. VERIFY REGISTERED SCANNER
  const [scanners] = await db.promise().query(
    `SELECT scanner_id, assigned_floor, assigned_room
     FROM scanners
     WHERE scanner_id = ?
     LIMIT 1`,
    [scan.scannerId]
  );

  if (!scanners.length) {
    return {
      status: 404,
      body: {
        success: false,
        message: 'Scanner is not registered.'
      }
    };
  }

  const floor = String(scanners[0].assigned_floor).trim();
  const room = String(scanners[0].assigned_room).trim();

  const coords = (ALLOWED_ROOMS[floor] || []).includes(room)
    ? getRoomCoords(floor, room)
    : null;

  if (
    !coords ||
    !Number.isFinite(coords.x) ||
    !Number.isFinite(coords.y)
  ) {
    console.warn(
      'Scanner has invalid floor or room mapping:',
      scan.scannerId
    );

    return {
      status: 422,
      body: {
        success: false,
        message:
          'Scanner room is not mapped. Contact administrator.'
      }
    };
  }

  // 2. UPDATE SCANNER HEARTBEAT

  await db.promise().query(
    `UPDATE scanners
     SET last_ping = ?, status = 'ONLINE'
     WHERE scanner_id = ?`,
    [getPHDateTime(), scan.scannerId]
  );

  if (scan.vbatt !== null) {
    await db.promise().query(
      `UPDATE ble_tags
       SET battery_level = ?
       WHERE UPPER(mac_address) = UPPER(?)`,
      [scan.vbatt, scan.tagMac]
    );
  }

  // 3. VERIFY ACTIVE CHECKED-IN VISITOR

  const [visits] = await db.promise().query(
    `SELECT
       vr.id,
       vr.first_name,
       vr.last_name,
       bt.ble_id,
       vr.destination
     FROM visitor_requests vr
     INNER JOIN ble_tags bt ON (
       UPPER(vr.ble_id) = UPPER(bt.ble_id)
       OR UPPER(vr.used_ble_id) = UPPER(bt.ble_id)
       OR UPPER(vr.ble_id) = UPPER(bt.mac_address)
     )
     WHERE UPPER(bt.mac_address) = UPPER(?)
       AND vr.arrived = 1
       AND vr.returned = 0
       AND vr.no_show = 0
     ORDER BY vr.id DESC
     LIMIT 1`,
    [scan.tagMac]
  );

  if (!visits.length) {
    return {
      status: 200,
      body: {
        success: false,
        message: 'Tag not checked in or inactive.'
      }
    };
  }

  const visit = visits[0];

  const bleId = String(visit.ble_id).trim();

  const name =
    `${visit.first_name} ${visit.last_name || ''}`.trim();

  const destination = visit.destination || 'Not Assigned';

  const previous = liveVisitors[bleId];

  const sameVisit =
    previous &&
    Number(previous.visitorRequestId) === Number(visit.id);

  const old = sameVisit ? previous : null;

  const now = Date.now();

  const wasDisconnected = Boolean(
    old?.isDetected &&
    (
      old.isDisconnected ||
      old.trackingStatus === 'signal_lost'
    )
  );

  const isFirstDetection = !old || !old.isDetected;

  const locationChanged = Boolean(
    old &&
    old.isDetected &&
    (
      old.floor !== floor ||
      old.currentRoom !== room
    )
  );


  // 4. V01: CONFIRM ROOM CHANGES

  const candidateKey = bleId;

  if (locationChanged) {
    const candidate = bleRoomCandidates.get(candidateKey);

    const matches = Boolean(
      candidate &&
      Number(candidate.visitId) === Number(visit.id) &&
      candidate.floor === floor &&
      candidate.room === room &&
      now - candidate.firstAt <=
        BLE_ROOM_CONFIRM_WINDOW_MS
    );

    const next = matches
      ? {
          ...candidate,
          count: candidate.count + 1
        }
      : {
          visitId: visit.id,
          floor,
          room,
          count: 1,
          firstAt: now
        };

    if (next.count < BLE_ROOM_CONFIRMATIONS) {

      await db.promise().query(
        `UPDATE visitor_live_positions
         SET last_seen = NOW()
         WHERE ble_id = ?`,
        [bleId]
      );

      bleRoomCandidates.set(candidateKey, next);

      const updatedVisitor = {
        ...old,

        // Keep last confirmed room and coordinates.
        floor: old.floor,
        currentRoom: old.currentRoom,
        x: old.x,
        y: old.y,

        destination,
        lastSeen: now,
        rssi: scan.rssi,

        isDetected: true,
        isDisconnected: false,
        isPendingDetection: false,

        disconnectedAt: null,
        trackingStatus: 'active',

        // Reset loitering timing after a signal recovery.
        roomEnteredAt: wasDisconnected
          ? now
          : (old.roomEnteredAt || now),

        loiterAlertSent: wasDisconnected
          ? false
          : (old.loiterAlertSent || false)
      };

      liveVisitors[bleId] = updatedVisitor;
      visitorDestinations[bleId] = destination;

   
      if (wasDisconnected) {
        logVisitorHistory(
          bleId,
          name,
          bleId,
          old.floor,
          old.currentRoom,
          'signal_restored',
          old.x,
          old.y
        );
      }

      broadcastToTrackingClients({
        type: 'location_update',
        visitor: updatedVisitor
      });

      return {
        status: 200,
        body: {
          success: true,
          pendingLocationConfirmation: true,
          currentRoom: old.currentRoom,
          destination,
          trackingStatus: 'active',
          signalRestored: wasDisconnected,
          message:
            'Detection accepted; waiting for room confirmation.'
        }
      };
    }
  }

  bleRoomCandidates.delete(candidateKey);

  const changed = locationChanged;

  // 5. PREPARE CONFIRMED POSITION
  
  const roomEnteredAt =
    changed || isFirstDetection || wasDisconnected
      ? now
      : (old.roomEnteredAt || now);

  const data = {
    id: bleId,
    visitorRequestId: visit.id,
    name,
    bleId,

    floor,
    currentRoom: room,
    destination,

    x: coords.x,
    y: coords.y,

    lastSeen: now,
    roomEnteredAt,

    loiterAlertSent:
      changed || isFirstDetection || wasDisconnected
        ? false
        : (old.loiterAlertSent || false),

    isDetected: true,
    isDisconnected: false,
    isPendingDetection: false,

    disconnectedAt: null,
    trackingStatus: 'active',

    rssi: scan.rssi
  };

  // 6. SAVE CONFIRMED POSITION

  await db.promise().query(
    `INSERT INTO visitor_live_positions
       (
         ble_id,
         x,
         y,
         floor,
         current_room,
         destination,
         last_seen
       )
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       x = VALUES(x),
       y = VALUES(y),
       floor = VALUES(floor),
       current_room = VALUES(current_room),
       destination = VALUES(destination),
       last_seen = NOW()`,
    [
      bleId,
      data.x,
      data.y,
      floor,
      room,
      destination
    ]
  );


  // 7. UPDATE LIVE TRACKING MEMORY
 
  liveVisitors[bleId] = data;
  visitorDestinations[bleId] = destination;

  // 8. RECORD CONNECTION AND RESTORATION EVENTS
 
  if (isFirstDetection) {

    // First actual BLE observation for the active visit.
    logVisitorHistory(
      bleId,
      name,
      bleId,
      floor,
      room,
      'connect',
      coords.x,
      coords.y
    );

  } else if (wasDisconnected) {

    // The tag has been detected after a recorded loss.
    logVisitorHistory(
      bleId,
      name,
      bleId,
      floor,
      room,
      'signal_restored',
      coords.x,
      coords.y
    );
  }

  // 9. RECORD CONFIRMED MOVEMENT
 
  if (changed) {
    logVisitorHistory(
      bleId,
      name,
      bleId,
      floor,
      room,
      'move',
      coords.x,
      coords.y
    );
  }


  // 10. BROADCAST ACTIVE TRACKING STATE

  broadcastToTrackingClients({
    type: 'location_update',
    visitor: data
  });

  return {
    status: 200,
    body: {
      success: true,
      currentRoom: room,
      destination,
      trackingStatus: 'active',
      signalRestored: wasDisconnected,
      pendingLocationConfirmation: false
    }
  };
}


// SHARED ROUTE HANDLER

async function unifiedBleScanHandler(req, res, legacy = false) {

  const key = req.headers['x-api-key'];

  // 1. Verify hardware API key.
  if (
    !process.env.HARDWARE_API_KEY ||
    key !== process.env.HARDWARE_API_KEY
  ) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized hardware access.'
    });
  }

  // 2. Normalize legacy and current ESP32 payloads.
  const scan = normalizeBleScanInput(req.body, legacy);

  if (!scan) {
    return res.status(400).json({
      success: false,
      message: 'Invalid scanner ID, tag MAC, or telemetry.'
    });
  }

  // 3. Process observations sequentially per BLE tag.
  const queueKey = scan.tagMac.toUpperCase();

  const prior =
    bleTagScanQueues.get(queueKey) || Promise.resolve();

  const running = prior
    .catch(() => {})
    .then(() => processValidatedBleScan(scan));

  bleTagScanQueues.set(queueKey, running);

  try {
    const result = await running;

    return res.status(result.status).json(result.body);

  } catch (error) {
    console.error(
      'Scanner ingestion error:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Unable to process BLE detection.'
    });

  } finally {
    if (bleTagScanQueues.get(queueKey) === running) {
      bleTagScanQueues.delete(queueKey);
    }
  }
}


app.post('/api/ble-data', (req, res) =>
  unifiedBleScanHandler(req, res, true)
);

app.post('/api/scan', (req, res) =>
  unifiedBleScanHandler(req, res, false)
);


// LIVE POSITIONS & VISIT REASONS (Secured & Validated)


app.get('/api/positions', authenticateToken, allowRoles('security'), async (req, res) => {
  try {
    const [activeVisitors] = await db.promise().query(`
      SELECT
        vr.id,
        vr.first_name,
        vr.last_name,
        vr.ble_id,
        vr.destination,
        vr.arrived_at
      FROM visitor_requests vr
      WHERE vr.arrived = 1
        AND vr.returned = 0
        AND vr.no_show = 0
        AND vr.ble_id IS NOT NULL
    `);

    const [dbPositions] = await db.promise().query(
      'SELECT * FROM visitor_live_positions'
    );

    const dbPosMap = new Map(
      dbPositions.map(position => [
        String(position.ble_id).trim(),
        position
      ])
    );

    const now = Date.now();
    const SIGNAL_FRESHNESS_MS = 45000;
    const result = [];

    for (const visitor of activeVisitors) {
      const bleId = String(visitor.ble_id).trim();
      const live = liveVisitors[bleId];
      const dbPos = dbPosMap.get(bleId);

      const fullName =
        `${visitor.first_name} ${visitor.last_name || ''}`.trim();

      const sameVisit = Boolean(
        live &&
        Number(live.visitorRequestId) === Number(visitor.id)
      );

      const currentLive = sameVisit ? live : null;

      const hasLiveDetection = Boolean(
        currentLive?.isDetected &&
        Number.isFinite(currentLive.lastSeen)
      );

      if (hasLiveDetection) {
        const stale =
          now - currentLive.lastSeen > SIGNAL_FRESHNESS_MS;

        const signalLost =
          currentLive.isDisconnected ||
          currentLive.trackingStatus === 'signal_lost' ||
          stale;

        result.push({
          ...currentLive,
          visitorRequestId: visitor.id,
          name: fullName,
          destination: visitor.destination,
          isDetected: true,
          isDisconnected: Boolean(signalLost),
          isPendingDetection: false,
          trackingStatus: signalLost ? 'signal_lost' : 'active',
          disconnectedAt: signalLost
            ? (currentLive.disconnectedAt || null)
            : null
        });

        continue;
      }

      if (currentLive && !currentLive.isDetected) {
        result.push({
          ...currentLive,
          visitorRequestId: visitor.id,
          name: fullName,
          destination: visitor.destination,
          floor: currentLive.floor || null,
          x: null,
          y: null,
          lastSeen: null,
          isDetected: false,
          isDisconnected: false,
          isPendingDetection: true,
          trackingStatus: 'awaiting_detection'
        });

        continue;
      }

      const checkInTime = visitor.arrived_at
        ? new Date(visitor.arrived_at).getTime()
        : NaN;

      const positionTime = dbPos?.last_seen
        ? new Date(dbPos.last_seen).getTime()
        : NaN;

      const coords = dbPos
        ? getRoomCoords(dbPos.floor, dbPos.current_room)
        : null;

      const validCachedPosition = Boolean(
        dbPos &&
        Number.isFinite(checkInTime) &&
        Number.isFinite(positionTime) &&
        positionTime >= checkInTime &&
        coords &&
        Number.isFinite(Number(dbPos.x)) &&
        Number.isFinite(Number(dbPos.y))
      );

      if (validCachedPosition) {
        result.push({
          id: bleId,
          visitorRequestId: visitor.id,
          name: fullName,
          bleId,
          floor: dbPos.floor,
          currentRoom: dbPos.current_room,
          destination: visitor.destination,
          x: Number(dbPos.x),
          y: Number(dbPos.y),
          lastSeen: positionTime,
          isDetected: true,
          isDisconnected: true,
          isPendingDetection: false,
          disconnectedAt: null,
          trackingStatus: 'last_known'
        });

        continue;
      }

      result.push({
        id: bleId,
        visitorRequestId: visitor.id,
        name: fullName,
        bleId,
        floor: null,
        currentRoom: 'Waiting for Scanner...',
        destination: visitor.destination,
        x: null,
        y: null,
        lastSeen: null,
        roomEnteredAt: null,
        isDetected: false,
        isDisconnected: false,
        isPendingDetection: true,
        disconnectedAt: null,
        trackingStatus: 'awaiting_detection'
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);

  } catch (err) {
    console.error('Fetch positions error:', err);

    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve current visitor positions.'
    });
  }
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

app.post('/api/visit-reasons', authenticateToken, requireAction('system:visit-reasons'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  
  const { reason_text } = req.body;
  if (!reason_text || !reason_text.trim()) {
    return res.status(400).json({ success: false, message: "Reason text is required." });
  }
  
 
  if (reason_text.trim().length > 100) {
    return res.status(400).json({ success: false, message: "Reason text must be 100 characters or fewer." });
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

app.put('/api/visit-reasons/:id', authenticateToken, requireAction('system:visit-reasons'), (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin access required.' });
  }
  
  const { id } = req.params;
  const { reason_text } = req.body;
  if (!reason_text || !reason_text.trim()) {
    return res.status(400).json({ success: false, message: "Reason text is required." });
  }
  
  
  if (reason_text.trim().length > 100) {
    return res.status(400).json({ success: false, message: "Reason text must be 100 characters or fewer." });
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

app.delete('/api/visit-reasons/:id', authenticateToken, requireAction('system:visit-reasons'), (req, res) => {
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


db.query("SHOW COLUMNS FROM emergency_alerts LIKE 'created_by'", (err, result) => {
  if (!err && result.length === 0) {
    db.query("ALTER TABLE emergency_alerts ADD COLUMN created_by INT", (alterErr) => {
      if (alterErr) console.error("Failed to add created_by column:", alterErr);
      else console.log("Added 'created_by' column to emergency_alerts.");
    });
  }
});

app.post('/api/emergency-alerts', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }

  const { title, message, severity, target_roles } = req.body;

  // 1. Presence
  if (!title || !message || !severity) {
    return res.status(400).json({ success: false, message: 'Alert title, message, and severity level are required.' });
  }

  // E3 — length caps
  const cleanTitle = String(title).trim();
  const cleanMessage = String(message).trim();
  if (cleanTitle.length < 3) {
    return res.status(400).json({ success: false, message: 'Alert title must be at least 3 characters.' });
  }
  if (cleanTitle.length > 200) {
    return res.status(400).json({ success: false, message: 'Alert title must be 200 characters or fewer.' });
  }
  if (cleanMessage.length < 10) {
    return res.status(400).json({ success: false, message: 'Alert message must be at least 10 characters.' });
  }
  if (cleanMessage.length > 2000) {
    return res.status(400).json({ success: false, message: 'Alert message must be 2,000 characters or fewer.' });
  }

  if (!['info', 'warning', 'critical'].includes(severity)) {
    return res.status(400).json({ success: false, message: 'Invalid severity level. Must be info, warning, or critical.' });
  }

  // E1 — require at least one target role
  if (!Array.isArray(target_roles) || target_roles.length === 0) {
    return res.status(400).json({ success: false, message: 'Select at least one target role for the alert.' });
  }

  const safeRoles = target_roles.map(role => {
    const r = String(role).toLowerCase().trim();
    if (r.includes('security')) return 'security';
    if (r.includes('admin') && !r.includes('hr')) return 'admin';
    if (r.includes('hr')) return 'hr_admin';
    if (r.includes('instructor') || r.includes('faculty')) return 'instructor';
    return null;
  }).filter(Boolean); // drop unrecognized roles

  const uniqueRoles = [...new Set(safeRoles)];
  if (uniqueRoles.length === 0) {
    return res.status(400).json({ success: false, message: 'None of the provided roles are valid.' });
  }
  const targetRolesJson = JSON.stringify(uniqueRoles);

  try {
    // ✅ FIX: Save created_by to track the sender
    const [result] = await db.promise().query(
      "INSERT INTO emergency_alerts (title, message, severity, target_roles, created_by) VALUES (?, ?, ?, ?, ?)",
      [cleanTitle, cleanMessage, severity, targetRolesJson, req.user.id]
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

      const messages = [];
      for (const user of users) {
        if (user.expo_push_token && Expo.isExpoPushToken(user.expo_push_token)) {
          messages.push({
            to: user.expo_push_token,
            sound: 'default',
            title: cleanTitle,
            body: cleanMessage,
            data: { alertId, severity },
          });
        }
      }
      for (const chunk of expo.chunkPushNotifications(messages)) {
        try { await expo.sendPushNotificationsAsync(chunk); }
        catch (error) { console.error("Error sending push chunk:", error); }
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
// PROGRAM & COURSE MANAGEMENT
// ============================================

// 1. Get all programs
app.get('/api/programs', authenticateToken, (req, res) => {
  db.query("SELECT * FROM programs ORDER BY program_name ASC", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load programs.' });
    res.json(results || []);
  });
});

// 2. Create a new program
app.post('/api/programs', authenticateToken, requireAction('programs:write'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const { program_name, badge, subtitle, description } = req.body;
  if (!program_name || !program_name.trim()) {
    return res.status(400).json({ success: false, message: 'Program name is required.' });
  }
  
  db.query(
    "INSERT INTO programs (program_name, badge, subtitle, description) VALUES (?, ?, ?, ?)",
    [program_name.trim(), badge || null, subtitle || null, description || null],
    (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Program name already exists.' });
        return res.status(500).json({ success: false, message: 'Failed to create program.' });
      }
      logAction(req.user.id, 'CREATE_PROGRAM', 'program', result.insertId, req);
      res.status(201).json({ success: true, message: 'Program created successfully.', id: result.insertId });
    }
  );
});

// 3. Update an existing program
app.put('/api/programs/:id', authenticateToken, requireAction('programs:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const { program_name, badge, subtitle, description, status } = req.body;
  const programId = req.params.id;

  if (!program_name || !program_name.trim()) {
    return res.status(400).json({ success: false, message: 'Program name is required.' });
  }

  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM programs WHERE id = ?", [programId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: 'Program not found.' });

    db.query(
      "UPDATE programs SET program_name=?, badge=?, subtitle=?, description=?, status=? WHERE id=?",
      [program_name.trim(), badge || null, subtitle || null, description || null, status || 'active', programId],
      (err, result) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Another program with this name exists.' });
          return res.status(500).json({ success: false, message: 'Failed to update program.' });
        }
        logAction(req.user.id, 'UPDATE_PROGRAM', 'program', programId, req, oldRecord[0], req.body);
        res.json({ success: true, message: 'Program updated successfully.' });
      }
    );
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// 4. Delete a program
app.delete('/api/programs/:id', authenticateToken, requireAction('programs:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  const programId = req.params.id;

  try {
    // Prevent deletion if courses are linked to it
    const [courses] = await db.promise().query("SELECT id FROM courses WHERE program_id = ? LIMIT 1", [programId]);
    if (courses.length > 0) {
      return res.status(400).json({ success: false, message: 'Cannot delete program. It still has courses assigned to it.' });
    }

    await db.promise().query("DELETE FROM programs WHERE id = ?", [programId]);
    logAction(req.user.id, 'DELETE_PROGRAM', 'program', programId, req);
    res.json({ success: true, message: 'Program deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete program.' });
  }
});


// --- COURSES CRUD (Updated to include Program ID) ---

// 1. Get all courses (Now includes the Program Name via JOIN)
app.get('/api/courses', authenticateToken, (req, res) => {
  const sql = `
    SELECT c.id, c.name, c.program_id, p.program_name 
    FROM courses c
    LEFT JOIN programs p ON c.program_id = p.id
    ORDER BY c.name ASC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ success: false, message: 'Failed to load courses.' });
    res.json(results || []);
  });
});

// 2. Create a new course (Now requires program_id)
app.post('/api/courses', authenticateToken, requireAction('courses:write'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  
  const { name, program_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Course name is required.' });
  if (!program_id) return res.status(400).json({ success: false, message: 'Program ID is required.' });
  
  db.query("INSERT INTO courses (name, program_id) VALUES (?, ?)", [name.trim(), program_id], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'A course with this name already exists.' });
      return res.status(500).json({ success: false, message: 'Failed to create course.' });
    }
    logAction(req.user.id, 'CREATE_COURSE', 'course', result.insertId, req);
    res.status(201).json({ success: true, message: 'Course created successfully.', id: result.insertId });
  });
});

// 3. Update a course
app.put('/api/courses/:id', authenticateToken, requireAction('courses:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  
  const { name, program_id } = req.body;
  const courseId = req.params.id;
  
  if (!name || !name.trim()) return res.status(400).json({ success: false, message: 'Course name is required.' });
  if (!program_id) return res.status(400).json({ success: false, message: 'Program ID is required.' });
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: 'Course not found.' });
    
    db.query("UPDATE courses SET name = ?, program_id = ? WHERE id = ?", [name.trim(), program_id, courseId], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Another course with this name already exists.' });
        return res.status(500).json({ success: false, message: 'Failed to update course.' });
      }
      logAction(req.user.id, 'UPDATE_COURSE', 'course', courseId, req, oldRecord[0], { name: name.trim(), program_id });
      res.json({ success: true, message: 'Course updated successfully.' });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error while updating course.' });
  }
});

// 4. Delete a course
app.delete('/api/courses/:id', authenticateToken, requireAction('courses:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  
  const courseId = req.params.id;
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM courses WHERE id = ?", [courseId]);
    if (oldRecord.length === 0) return res.status(404).json({ success: false, message: 'Course not found.' });
    
    db.query("SELECT id FROM schedules WHERE course = ? LIMIT 1", [oldRecord[0].name], (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error.' });
      if (rows.length > 0) return res.status(400).json({ success: false, message: 'Cannot delete course as it is assigned to existing schedules.' });
      
      db.query("DELETE FROM courses WHERE id = ?", [courseId], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: 'Failed to delete course.' });
        logAction(req.user.id, 'DELETE_COURSE', 'course', courseId, req, oldRecord[0], null);
        res.json({ success: true, message: 'Course deleted successfully.' });
      });
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error while deleting course.' });
  }
});

app.get('/api/emergency-alerts/active', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

  try {
    const [userRows] = await db.promise().query("SELECT role FROM users WHERE id = ?", [userId]);
    if (userRows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    const userRole = userRows[0].role.toLowerCase().trim();

    const [activeAlerts] = await db.promise().query(`
      SELECT 
        ea.id, 
        ea.title, 
        ea.message, 
        ea.severity, 
        ea.sent_at, 
        ea.target_roles, 
        ea.is_active, 
        ea.expires_at,
        ea.created_by, -- ✅ Fetch sender ID
        ar.read_at
      FROM emergency_alerts ea
      LEFT JOIN alert_receipts ar ON ea.id = ar.alert_id AND ar.user_id = ?
      WHERE ea.is_active = 1 AND (ea.expires_at IS NULL OR ea.expires_at > NOW())
      ORDER BY ea.sent_at DESC
    `, [userId]);

    const validAlerts = [];
    const receiptsToInsert = [];

    for (const alert of activeAlerts) {
      //  Skip the alert if the current user is the sender
      if (alert.created_by === userId) {
        continue;
      }

      let targetRoles = [];
      
      
      if (typeof alert.target_roles === 'string') {
        try { targetRoles = JSON.parse(alert.target_roles); } catch(e) { targetRoles = []; }
      } else if (Array.isArray(alert.target_roles)) {
        targetRoles = alert.target_roles;
      }

      // Check if the current user's role is in the target list
      const isTargeted = targetRoles.length === 0 || targetRoles.map(r => r.toLowerCase().trim()).includes(userRole);

      if (isTargeted) {
        receiptsToInsert.push([alert.id, userId]);
        validAlerts.push({
          id: alert.id,
          title: alert.title,
          message: alert.message,
          severity: alert.severity,
          sent_at: alert.sent_at,
          read_at: alert.read_at || null
        });
      }
    }

        if (receiptsToInsert.length > 0) {
      
      receiptsToInsert.sort((a, b) => a[0] - b[0]);

      try {
        await db.promise().query(
          `INSERT IGNORE INTO alert_receipts (alert_id, user_id) VALUES ?`,
          [receiptsToInsert]
        );
      } catch (insertErr) {
        
        if (insertErr.code === 'ER_LOCK_DEADLOCK') {
          console.warn(`Deadlock ignored on alert_receipts for user ${userId}. Will retry on next fetch.`);
        } else {
          throw insertErr; 
        }
      }
    }

    res.json(validAlerts);
  } catch (err) {
    console.error("Fetch alerts error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});


app.get('/api/emergency-alerts/history', authenticateToken, async (req, res) => {
  const userId = Number(req.user.id);

  try {
    // Retrieve only alerts delivered to this authenticated user.
    // Include expired, inactive, read, and unread alerts.
    const [history] = await db.promise().query(
      `SELECT
         ea.id,
         ea.title,
         ea.message,
         ea.severity,
         ea.sent_at,
         ea.is_active,
         ea.expires_at,
         ar.read_at
       FROM alert_receipts ar
       INNER JOIN emergency_alerts ea
         ON ea.id = ar.alert_id
       WHERE ar.user_id = ?
       ORDER BY ea.sent_at DESC, ea.id DESC`,
      [userId]
    );

    return res.json(history);
  } catch (error) {
    console.error('Emergency alert history error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to retrieve emergency alert history.'
    });
  }
});


app.post('/api/emergency-alerts/:id/read', authenticateToken, async (req, res) => {
  const alertId = Number(req.params.id);
  const userId = Number(req.user.id);

  if (!Number.isSafeInteger(alertId) || alertId <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid alert ID.'
    });
  }

  try {
    const [result] = await db.promise().query(
      `UPDATE alert_receipts
       SET read_at = COALESCE(read_at, NOW())
       WHERE alert_id = ?
         AND user_id = ?`,
      [alertId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found for this account.'
      });
    }

    return res.json({
      success: true,
      message: 'Alert acknowledged successfully.'
    });
  } catch (error) {
    console.error('Alert acknowledgment error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to acknowledge alert.'
    });
  }
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
       location_type, location, salary_min, salary_max, requires_prc, created_at
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

app.post('/api/jobs/apply', uploadApplication, async (req, res) => {
  const { job_id, full_name, email, phone, cover_letter, prc_license_no } = req.body;
  const resumeFile = req.files?.resume?.[0];
  const torFile    = req.files?.tor?.[0];

  const cleanup = () => {
    [resumeFile, torFile].forEach((f) => {
      if (f && fs.existsSync(f.path)) {
        try { fs.unlinkSync(f.path); } catch (_) {}
      }
    });
  };

  if (!job_id || !full_name || !email) {
    cleanup();
    return res.status(400).json({ success: false, message: 'Job ID, full name, and email are required fields.' });
  }

  if (!resumeFile) {
    cleanup();
    return res.status(400).json({ success: false, message: 'A resume is required to apply.' });
  }

  const emailCheck = await validateEmailForAccount(email, { checkDns: true });
  if (!emailCheck.valid) {
    cleanup();
    return res.status(400).json({ success: false, message: emailCheck.reason });
  }


  const jobId = Number(job_id);

  if (!Number.isSafeInteger(jobId) || jobId <= 0) {
    cleanup();
    return res.status(400).json({
      success: false,
      message: 'Invalid job posting.'
    });
  }

  try {
    const [jobs] = await db.promise().query(
      `SELECT id, status, requires_prc
       FROM job_postings
       WHERE id = ?
       LIMIT 1`,
      [jobId]
    );

    if (!jobs.length || jobs[0].status !== 'open') {
      cleanup();
      return res.status(409).json({
        success: false,
        message: 'This job posting is no longer accepting applications.'
      });
    }

    if (
      Number(jobs[0].requires_prc) === 1 &&
      !String(prc_license_no || '').trim()
    ) {
      cleanup();
      return res.status(400).json({
        success: false,
        message: 'PRC license number is required for this position.'
      });
    }

  } catch (err) {
    cleanup();
    console.error('Job eligibility check error:', err);

    return res.status(500).json({
      success: false,
      message: 'Unable to verify the job posting.'
    });
  }


  const resumePath = `/uploads/resumes/${resumeFile.filename}`;
  const torPath    = torFile ? `/uploads/resumes/${torFile.filename}` : null;

  db.query(
    `INSERT INTO job_applicants
       (job_id, full_name, email, phone, cover_letter, prc_license_no, resume_path, tor_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      job_id,
      full_name.trim(),
      email.trim().toLowerCase(),
      phone || null,
      cover_letter || null,
      prc_license_no ? String(prc_license_no).trim() : null,
      resumePath,
      torPath
    ],
    (err) => {
      if (err) {
        cleanup();
        console.error("Job application error:", err);
        return res.status(500).json({ success: false, message: 'Failed to submit job application.' });
      }
      res.json({ success: true, message: 'Application submitted successfully!' });
    }
  );
});

app.get('/api/jobs', authenticateToken, allowRoles('admin','hr_admin'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }
  db.query(
    `SELECT jp.id, jp.title, jp.department, jp.description, jp.requirements, jp.employment_type,
       jp.location_type, jp.location, jp.salary_min, jp.salary_max, jp.status,
       jp.requires_prc, jp.posted_by, jp.created_at,
       (SELECT COUNT(*)
 FROM job_applicants ja
 WHERE ja.job_id = jp.id) AS applicant_count
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


const validateJobPosting = (body = {}) => {
  const {
    title,
    department,
    description,
    requirements,
    employment_type,
    location_type,
    location,
    salary_min,
    salary_max,
    status,
    requires_prc
  } = body;

  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const cleanDescription =
    typeof description === 'string' ? description.trim() : '';

  if (!cleanTitle || !cleanDescription) {
    return {
      error: 'Job title and description are required.'
    };
  }

  // DECIMAL(10,2): nonnegative, up to 8 digits before
  // the decimal point, and up to 2 decimal places.
  const validSalary = (value) => {
    if (typeof value !== 'string' && typeof value !== 'number') {
      return false;
    }

    const text = String(value).trim();

    return (
      /^\d{1,8}(?:\.\d{1,2})?$/.test(text) &&
      Number.isFinite(Number(text))
    );
  };

  if (!validSalary(salary_min)) {
    return {
      error:
        'Minimum salary must be a valid non-negative amount with up to two decimal places.'
    };
  }

  if (!validSalary(salary_max)) {
    return {
      error:
        'Maximum salary must be a valid non-negative amount with up to two decimal places.'
    };
  }

  const minSalary = Number(salary_min);
  const maxSalary = Number(salary_max);

  if (maxSalary < minSalary) {
    return {
      error:
        'Maximum salary must be greater than or equal to minimum salary.'
    };
  }

  const allowedEmploymentTypes = [
    'Full-time',
    'Part-time',
    'Contract',
    'Internship'
  ];

  const allowedLocationTypes = [
    'On-site',
    'Remote',
    'Hybrid'
  ];

  const cleanEmploymentType = employment_type || 'Full-time';
  const cleanLocationType = location_type || 'On-site';
  const cleanStatus = status || 'open';

  if (!allowedEmploymentTypes.includes(cleanEmploymentType)) {
    return {
      error: 'Invalid employment type.'
    };
  }

  if (!allowedLocationTypes.includes(cleanLocationType)) {
    return {
      error: 'Invalid location type.'
    };
  }

  if (!['open', 'closed'].includes(cleanStatus)) {
    return {
      error: 'Invalid job posting status.'
    };
  }

  if (
    ![true, false, 0, 1, '0', '1', null, undefined]
      .includes(requires_prc)
  ) {
    return {
      error: 'Invalid PRC license requirement.'
    };
  }

  const optionalText = (value) => {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    return typeof value === 'string'
      ? value.trim() || null
      : null;
  };

  return {
    data: {
      title: cleanTitle,
      department: optionalText(department),
      description: cleanDescription,
      requirements: optionalText(requirements),
      employment_type: cleanEmploymentType,
      location_type: cleanLocationType,
      location: optionalText(location),
      salary_min: minSalary,
      salary_max: maxSalary,
      status: cleanStatus,
      requires_prc:
        requires_prc === true ||
        requires_prc === 1 ||
        requires_prc === '1'
          ? 1
          : 0
    }
  };
};

app.post(
  '/api/jobs',
  authenticateToken,
  requireAction('jobs:create'),
  async (req, res) => {
    if (!['admin', 'hr_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create job postings.'
      });
    }

    const validation = validateJobPosting(req.body);

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }

    const job = validation.data;

    try {
      const [result] = await db.promise().query(
        `INSERT INTO job_postings (
          title,
          department,
          description,
          requirements,
          employment_type,
          location_type,
          location,
          salary_min,
          salary_max,
          status,
          requires_prc,
          posted_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          job.title,
          job.department,
          job.description,
          job.requirements,
          job.employment_type,
          job.location_type,
          job.location,
          job.salary_min,
          job.salary_max,
          job.status,
          job.requires_prc,
          req.user.id
        ]
      );

      logAction(
        req.user.id,
        'CREATE_JOB',
        'job_posting',
        result.insertId,
        req
      );

      return res.status(201).json({
        success: true,
        message:
          job.status === 'open'
            ? 'Job posting published successfully.'
            : 'Job posting created with Closed status.',
        id: result.insertId
      });

    } catch (err) {
      console.error('Create job error:', err);

      return res.status(500).json({
        success: false,
        message: 'Failed to create job posting.'
      });
    }
  }
);


app.put(
  '/api/jobs/:id',
  authenticateToken,
  requireAction('jobs:edit'),
  async (req, res) => {
    if (!['admin', 'hr_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to modify job postings.'
      });
    }

    const jobId = Number(req.params.id);

    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job posting ID.'
      });
    }

    const validation = validateJobPosting(req.body);

    if (validation.error) {
      return res.status(400).json({
        success: false,
        message: validation.error
      });
    }

    const job = validation.data;

    try {
      const [oldRecords] = await db.promise().query(
        'SELECT * FROM job_postings WHERE id = ? LIMIT 1',
        [jobId]
      );

      if (oldRecords.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Job posting not found.'
        });
      }

      const oldData = oldRecords[0];

      const [result] = await db.promise().query(
        `UPDATE job_postings
         SET
           title = ?,
           department = ?,
           description = ?,
           requirements = ?,
           employment_type = ?,
           location_type = ?,
           location = ?,
           salary_min = ?,
           salary_max = ?,
           status = ?,
           requires_prc = ?
         WHERE id = ?`,
        [
          job.title,
          job.department,
          job.description,
          job.requirements,
          job.employment_type,
          job.location_type,
          job.location,
          job.salary_min,
          job.salary_max,
          job.status,
          job.requires_prc,
          jobId
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: 'Job posting no longer exists.'
        });
      }

      logAction(
        req.user.id,
        'UPDATE_JOB',
        'job_posting',
        jobId,
        req,
        oldData,
        job
      );

      return res.json({
        success: true,
        message: 'Job posting updated successfully.'
      });

    } catch (err) {
      console.error('Update job error:', err);

      return res.status(500).json({
        success: false,
        message: 'Server error while updating job posting.'
      });
    }
  }
);


app.put('/api/applicants/:id/onboarding', authenticateToken, requireAction('applicants:update'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }

  const applicantId = req.params.id;
  const { nbi_verified, csc_form_verified, medical_verified } = req.body;

  const toBool = (v) => (v === true || v === 1 || v === '1' || v === 'true') ? 1 : 0;
  const payload = {
    nbi_verified:      toBool(nbi_verified),
    csc_form_verified: toBool(csc_form_verified),
    medical_verified:  toBool(medical_verified)
  };

  try {
    const [existing] = await db.promise().query(
      "SELECT id, status FROM job_applicants WHERE id = ?",
      [applicantId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Applicant not found.' });
    }
    if (existing[0].status !== 'hired') {
      return res.status(400).json({
        success: false,
        message: 'Onboarding checklist can only be updated once the applicant is marked as Hired.'
      });
    }

    await db.promise().query(
      `UPDATE job_applicants
          SET nbi_verified = ?, csc_form_verified = ?, medical_verified = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [payload.nbi_verified, payload.csc_form_verified, payload.medical_verified, applicantId]
    );

    logAction(
      req.user.id, 'UPDATE_APPLICANT_ONBOARDING', 'job_applicant', applicantId,
      req, null, payload
    );

    res.json({ success: true, message: 'Onboarding checklist updated.', ...payload });
  } catch (err) {
    console.error("Onboarding update error:", err);
    res.status(500).json({ success: false, message: 'Server error while updating onboarding checklist.' });
  }
});


app.delete(
  '/api/jobs/:id',
  authenticateToken,
  requireAction('jobs:delete'),
  (req, res) => {
    return res.status(409).json({
      success: false,
      message: 'Permanent deletion is disabled to preserve recruitment history. Close the job posting instead.'
    });
  }
);


app.get('/api/jobs/:id', authenticateToken, allowRoles('admin','hr_admin'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  db.query(
    `SELECT id, title, department, description, requirements, employment_type,
       location_type, location, salary_min, salary_max, status,
       requires_prc, posted_by, created_at
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


app.get(
  '/api/recruitment/interviews/applicant/:id',
  authenticateToken,
  allowRoles('admin', 'hr_admin'),
  async (req, res) => {
    const applicantId = Number(req.params.id);

    if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid applicant ID.'
      });
    }

    try {
      const [rows] = await db.promise().query(
        `SELECT id, applicant_id,
                DATE_FORMAT(interview_date, '%Y-%m-%d')
                  AS interview_date,
                TIME_FORMAT(interview_time, '%H:%i:%s')
                  AS interview_time,
                notes, status, outcome,
                assessment_notes, created_at
         FROM recruitment_interviews
         WHERE applicant_id = ?
         LIMIT 1`,
        [applicantId]
      );

      return res.json({
        success: true,
        interview: rows[0] || null
      });
    } catch (err) {
      console.error('Retrieve interview error:', err);
      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve interview.'
      });
    }
  }
);

app.post(
  '/api/recruitment/interviews',
  authenticateToken,
  requireAction('applicants:update'),
  async (req, res) => {
    const applicantId = Number(req.body.applicant_id);
    const { date, time } = req.body;
    const notes = String(req.body.notes || '').trim();

    if (
      !Number.isSafeInteger(applicantId) ||
      applicantId <= 0 ||
      typeof date !== 'string' ||
      typeof time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(time)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Valid applicant, date, and time are required.'
      });
    }

    const scheduledAt = new Date(`${date}T${time}:00+08:00`);

    if (
      !Number.isFinite(scheduledAt.getTime()) ||
      scheduledAt.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: 'Choose a valid future interview schedule.'
      });
    }

    if (notes.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Interview notes must not exceed 500 characters.'
      });
    }

    try {
      const [applicants] = await db.promise().query(
        `SELECT id, status
         FROM job_applicants
         WHERE id = ?`,
        [applicantId]
      );

      if (!applicants.length) {
        return res.status(404).json({
          success: false,
          message: 'Applicant not found.'
        });
      }

      if (applicants[0].status !== 'shortlisted') {
        return res.status(409).json({
          success: false,
          message: 'Only shortlisted applicants may be scheduled.'
        });
      }

      const [result] = await db.promise().query(
        `INSERT INTO recruitment_interviews
           (applicant_id, interview_date,
            interview_time, notes, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [applicantId, date, time, notes || null, req.user.id]
      );

      logAction(
        req.user.id,
        'SCHEDULE_RECRUITMENT_INTERVIEW',
        'recruitment_interview',
        result.insertId,
        req
      );

      return res.status(201).json({
        success: true,
        id: result.insertId,
        message: 'Interview scheduled successfully.'
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'An interview already exists for this applicant.'
        });
      }

      console.error('Schedule interview error:', err);
      return res.status(500).json({
        success: false,
        message: 'Unable to schedule interview.'
      });
    }
  }
);

app.put(
  '/api/recruitment/interviews/:id/outcome',
  authenticateToken,
  requireAction('applicants:update'),
  async (req, res) => {
    const interviewId = Number(req.params.id);
    const { outcome } = req.body;
    const notes = String(req.body.notes || '').trim();

    if (!Number.isSafeInteger(interviewId) || interviewId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid interview ID.'
      });
    }

    if (!['passed', 'failed'].includes(outcome)) {
      return res.status(400).json({
        success: false,
        message: 'Select a valid interview outcome.'
      });
    }

    if (notes.length < 5 || notes.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Assessment must contain 5–2,000 characters.'
      });
    }

    try {
      const [result] = await db.promise().query(
        `UPDATE recruitment_interviews
         SET status = 'completed',
             outcome = ?,
             assessment_notes = ?,
             assessed_by = ?
         WHERE id = ?
           AND status = 'scheduled'
           AND TIMESTAMP(interview_date, interview_time)
               <= CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')
           AND EXISTS (
             SELECT 1
             FROM job_applicants
             WHERE id = recruitment_interviews.applicant_id
               AND status = 'shortlisted'
           )`,
        [outcome, notes, req.user.id, interviewId]
      );

      if (result.affectedRows === 0) {
        return res.status(409).json({
          success: false,
          message: 'Interview cannot be assessed. Check its schedule and status.'
        });
      }

      logAction(
        req.user.id,
        'RECORD_INTERVIEW_OUTCOME',
        'recruitment_interview',
        interviewId,
        req
      );

      return res.json({
        success: true,
        message: 'Interview assessment recorded.'
      });
    } catch (err) {
      console.error('Interview assessment error:', err);
      return res.status(500).json({
        success: false,
        message: 'Unable to record interview assessment.'
      });
    }
  }
);


app.get('/api/jobs/:id/applicants', authenticateToken, allowRoles('admin','hr_admin'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  db.query(
    `SELECT id, job_id, full_name, email, phone, cover_letter, prc_license_no,
            resume_path, tor_path,
            nbi_verified, csc_form_verified, medical_verified,
            status, applied_at, score
       FROM job_applicants
      WHERE job_id = ?
      ORDER BY applied_at DESC`,
    [req.params.id],
    (err, results) => {
      if (err) {
        console.error("Applicants fetch error:", err);
        return res.status(500).json({ success: false, message: 'Failed to load job applicants.' });
      }
      res.json(results || []);
    }
  );
});


app.put(
  '/api/applicants/:id',
  authenticateToken,
  requireAction('applicants:update'),
  async (req, res) => {
    const applicantId = Number(req.params.id);
    const { status } = req.body;
    const reason = String(req.body.decision_reason || '').trim();

    const transitions = {
      new: ['reviewed', 'rejected'],
      reviewed: ['shortlisted', 'rejected'],
      shortlisted: ['hired', 'rejected'],
      rejected: [],
      hired: []
    };

    if (!Number.isSafeInteger(applicantId) || applicantId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid applicant ID.'
      });
    }

    if (!['reviewed', 'shortlisted', 'rejected', 'hired'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid candidate status.'
      });
    }

    if (
      reason.length > 500 ||
      (status === 'rejected' && reason.length < 5)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Rejection requires a reason of 5–500 characters.'
      });
    }

    let connection;

    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.query(
        `SELECT id, status
         FROM job_applicants
         WHERE id = ?
         FOR UPDATE`,
        [applicantId]
      );

      if (!rows.length) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: 'Applicant not found.'
        });
      }

      const currentStatus = rows[0].status;

      if (!transitions[currentStatus]?.includes(status)) {
        await connection.rollback();

        return res.status(409).json({
          success: false,
          message: `Cannot change applicant from ${currentStatus} to ${status}.`
        });
      }

      if (status === 'hired') {
        const [interviews] = await connection.query(
          `SELECT id
           FROM recruitment_interviews
           WHERE applicant_id = ?
             AND status = 'completed'
             AND outcome = 'passed'
           LIMIT 1`,
          [applicantId]
        );

        if (!interviews.length) {
          await connection.rollback();

          return res.status(409).json({
            success: false,
            message: 'A passed interview is required before hiring.'
          });
        }
      }

      await connection.query(
        `UPDATE job_applicants
         SET status = ?,
             decision_reason = ?,
             decision_by = ?,
             decision_at = NOW()
         WHERE id = ?`,
        [status, reason || null, req.user.id, applicantId]
      );

      await connection.commit();

      logAction(
        req.user.id,
        'UPDATE_APPLICANT_STATUS',
        'job_applicant',
        applicantId,
        req,
        { status: currentStatus },
        { status, decision_reason: reason || null }
      );

      return res.json({
        success: true,
        message: 'Applicant status updated successfully.'
      });
    } catch (err) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (_) {}
      }

      console.error('Applicant status update error:', err);

      return res.status(500).json({
        success: false,
        message: 'Unable to update applicant status.'
      });
    } finally {
      if (connection) connection.release();
    }
  }
);




// ============================================
// 11. CHAT & WEBSOCKETS
// ============================================

const authorizeChatRoom = (roomId, user, callback) => {
  db.query("SELECT id, name, type FROM chat_rooms WHERE id = ?", [roomId], (err, rows) => {
    if (err) return callback(err);
    if (rows.length === 0) return callback(null, false, 404);

    const room = rows[0];
    if (room.type === 'direct') {
      const participants = room.name.split('_').slice(1).map(Number);
      return callback(null, participants.includes(Number(user.id)), 403, room);
    }

    

    db.query(
      "SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ? LIMIT 1",
      [roomId, user.id],
      (memberErr, members) => {
        if (memberErr) return callback(memberErr);
        callback(null, members.length > 0, 403, room);
      }
    );
  });
};

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
    WHERE (
  r.type = 'direct'
  AND (
    r.name REGEXP CONCAT('^dm_', ?, '_[0-9]+$')
    OR r.name REGEXP CONCAT('^dm_[0-9]+_', ?, '$')
  )
)
OR (
  r.type = 'group'
  AND EXISTS (
    SELECT 1
    FROM chat_room_members rm
    WHERE rm.room_id = r.id
      AND rm.user_id = ?
  )
)
ORDER BY r.created_at DESC
  `;

  db.query(sql, [userId, userId, userId, userId], (err, rooms) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rooms);
  });
});

app.get('/api/chat/history/:roomId', authenticateToken, (req, res) => {
  const roomId = Number(req.params.roomId);
  const requestedLimit = Number(req.query.limit) || 50;
  if (!Number.isSafeInteger(roomId) || roomId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid chat room.' });
  }
  const limit = Math.min(Math.max(Math.trunc(requestedLimit), 1), 100);

  authorizeChatRoom(roomId, req.user, (accessErr, allowed, status) => {
    if (accessErr) return res.status(500).json({ success: false, message: 'Could not verify chat room access.' });
    if (!allowed) return res.status(status).json({ success: false, message: status === 404 ? 'Chat room not found.' : 'You are not a member of this conversation.' });

    db.query("SELECT cm.*, u.full_name, u.employee_id FROM chat_messages cm JOIN users u ON cm.user_id = u.id WHERE cm.room_id = ? ORDER BY cm.sent_at DESC LIMIT ?", [roomId, limit], (err, messages) => {
      if (err) return res.status(500).json({ success: false, message: 'Could not load chat history.' });
      res.json(messages.reverse());
    });
  });
});

app.post('/api/chat/dm-room', authenticateToken, (req, res) => {
  const partnerId = Number(req.body?.partnerUserId);
  const userId = req.user.id;
  if (!Number.isSafeInteger(partnerId) || partnerId < 1 || partnerId === Number(userId)) {
    return res.status(400).json({ success: false, error: 'Choose a valid colleague to start a conversation.' });
  }
  const ids = [userId, partnerId].sort((a,b)=>a-b);
  const roomName = `dm_${ids[0]}_${ids[1]}`;
  db.query("SELECT id FROM users WHERE id IN (?, ?) AND status = 'active'", ids, (userErr, users) => {
    if (userErr) return res.status(500).json({ success: false, error: 'Could not verify the selected colleague.' });
    if (users.length !== 2) return res.status(404).json({ success: false, error: 'Selected colleague was not found or is inactive.' });

    db.query("INSERT INTO chat_rooms (name, type) VALUES (?, 'direct') ON DUPLICATE KEY UPDATE name=name", [roomName], (err) => {
      if (err) return res.status(500).json({ success: false, error: 'Could not create the conversation.' });
      db.query("SELECT id FROM chat_rooms WHERE name = ?", [roomName], (err, rows) => {
        if (err || rows.length === 0) return res.status(500).json({ success: false, error: 'Could not open the conversation.' });
        res.json({ roomId: rows[0].id, roomName });
      });
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
      db.query(
  "DELETE FROM user_chat_read WHERE room_id = ?",
  [roomId],
  (readErr) => {
    if (readErr) {
      return res.status(500).json({
        success: false,
        error: 'Could not remove read markers.'
      });
    }

    db.query(
      "DELETE FROM chat_messages WHERE room_id = ?",
      [roomId],
      (deleteErr) => {
        if (deleteErr) {
          return res.status(500).json({
            success: false,
            error: 'Could not delete message history.'
          });
        }

        db.query(
          "DELETE FROM chat_rooms WHERE id = ?",
          [roomId],
          (roomErr) => {
            if (roomErr) {
              return res.status(500).json({
                success: false,
                error: 'Could not delete conversation.'
              });
            }

            return res.json({ success: true });
          }
        );
      }
    );
  }
);
    } else if (room.type === 'group') {
  return res.status(403).json({
    success: false,
    error: 'Use Leave group to exit. Group history cannot be deleted by members.'
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
  const roomId = Number(req.params.roomId);
  if (!Number.isSafeInteger(roomId) || roomId < 1) {
    return res.status(400).json({ success: false, message: 'Invalid chat room.' });
  }

  authorizeChatRoom(roomId, req.user, (accessErr, allowed, status) => {
    if (accessErr) return res.status(500).json({ success: false, message: 'Could not verify chat room access.' });
    if (!allowed) return res.status(status).json({ success: false, message: status === 404 ? 'Chat room not found.' : 'You are not a member of this conversation.' });

    db.query("INSERT INTO user_chat_read (user_id, room_id, last_read_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_read_at = NOW()", [userId, roomId], (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Could not update read status.' });
      res.json({ success: true });
    });
  });
});

app.get('/api/chat/unread-counts', authenticateToken, (req, res) => {
  const userId = Number(req.user.id);

  const query = `
    SELECT
      r.id AS room_id,
      COUNT(cm.id) AS unread
    FROM chat_rooms r
    JOIN chat_room_members rm
      ON rm.room_id = r.id
      AND rm.user_id = ?
    LEFT JOIN user_chat_read rd
      ON rd.room_id = r.id
      AND rd.user_id = ?
    LEFT JOIN chat_messages cm
      ON cm.room_id = r.id
      AND cm.user_id <> ?
      AND cm.sent_at > COALESCE(
        rd.last_read_at,
        '1970-01-01'
      )
    WHERE r.type = 'group'
    GROUP BY r.id

    UNION ALL

    SELECT
      r.id AS room_id,
      COUNT(cm.id) AS unread
    FROM chat_rooms r
    LEFT JOIN user_chat_read rd
      ON rd.room_id = r.id
      AND rd.user_id = ?
    LEFT JOIN chat_messages cm
      ON cm.room_id = r.id
      AND cm.user_id <> ?
      AND cm.sent_at > COALESCE(
        rd.last_read_at,
        '1970-01-01'
      )
    WHERE r.type = 'direct'
      AND (
        r.name REGEXP CONCAT('^dm_', ?, '_[0-9]+$')
        OR r.name REGEXP CONCAT('^dm_[0-9]+_', ?, '$')
      )
    GROUP BY r.id
  `;

  db.query(
    query,
    [
      userId,
      userId,
      userId,
      userId,
      userId,
      userId,
      userId
    ],
    (err, results) => {
      if (err) {
        console.error('Unread count failed:', err);

        return res.status(500).json({
          success: false,
          message: 'Unable to load unread counts.'
        });
      }

      return res.json(results);
    }
  );
});

app.post('/api/chat/group-room', authenticateToken, async (req, res) => {
  const { name, memberIds } = req.body || {};
  const groupName = typeof name === 'string' ? name.trim() : '';
  if (groupName.length < 2 || groupName.length > 50) {
    return res.status(400).json({ success: false, error: 'Group name must be between 2 and 50 characters.' });
  }
  if (!Array.isArray(memberIds)) {
    return res.status(400).json({ success: false, error: 'Choose at least one colleague for the group.' });
  }

  const creatorId = Number(req.user.id);
  const selectedIds = [...new Set(memberIds.map(Number))];
  if (selectedIds.some(id => !Number.isSafeInteger(id) || id < 1 || id === creatorId)) {
    return res.status(400).json({ success: false, error: 'One or more selected members are invalid.' });
  }
  if (selectedIds.length < 1) {
    return res.status(400).json({ success: false, error: 'Choose at least one colleague for the group.' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const [existingRooms] = await connection.query("SELECT id FROM chat_rooms WHERE name = ?", [groupName]);
    if (existingRooms.length > 0) {
      await connection.rollback();
      return res.status(409).json({ success: false, error: 'A conversation already uses this group name. Choose another name.' });
    }

    const [users] = await connection.query(
      "SELECT id FROM users WHERE id IN (?) AND status = 'active'",
      [selectedIds]
    );
    if (users.length !== selectedIds.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: 'One or more selected members are unavailable. Refresh and try again.' });
    }

    const allMemberIds = [...selectedIds, creatorId];
    const [roomResult] = await connection.query(
      "INSERT INTO chat_rooms (name, type) VALUES (?, 'group')",
      [groupName]
    );
    const roomId = roomResult.insertId;
    await connection.query(
      "INSERT INTO chat_room_members (room_id, user_id) VALUES ?",
      [allMemberIds.map(id => [roomId, id])]
    );
    await connection.query(
      "INSERT INTO user_chat_read (user_id, room_id) VALUES ?",
      [allMemberIds.map(id => [id, roomId])]
    );
    await connection.commit();
    return res.json({ success: true, roomId });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error('Could not roll back group creation:', rollbackErr.message);
      }
    }
    console.error('Chat group creation failed:', err.message);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, error: 'A conversation already uses this group name. Choose another name.' });
    }
    return res.status(500).json({ success: false, error: 'Could not create the group. Please try again.' });
  } finally {
    if (connection) connection.release();
  }
});


// ============================================
// 12. MONTHLY ATTENDANCE, PAYROLL & REPORTS
// ============================================

app.get('/api/attendance-monthly', authenticateToken, allowRoles('admin','hr_admin'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR access required.' });
  }

  const period = parseReportPeriod(req.query.month, req.query.year);
  if (period.error) {
    return res.status(400).json({ success: false, message: period.error });
  }
  const { month, year } = period;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  
  const { program_id, course } = req.query;
  let filterSql = "";
  let queryParams = [
  startDate, endDate, 
  startDate, endDate, 
  startDate, endDate  
];

  if (course) {
    filterSql += " AND s.course = ?";
    queryParams.push(course);
  } else if (program_id) {
    filterSql += " AND c.program_id = ?";
    queryParams.push(program_id);
  }

  
const sql = `
  SELECT
    u.employee_id,
    u.full_name,

    COALESCE(SUM(
      CASE
        
WHEN a.time_in IS NOT NULL
 AND a.time_out IS NOT NULL
 AND s.start_time IS NOT NULL
 AND s.end_time IS NOT NULL
 AND a.time_in <> a.time_out
 AND LOWER(TRIM(COALESCE(a.status, ''))) NOT IN (
   'on leave',
   'absent',
   'system auto-clock out'
 )

        THEN GREATEST(
          0,
          TIMESTAMPDIFF(
            MINUTE,
            GREATEST(
              TIMESTAMP(DATE(s.date), s.start_time),
              TIMESTAMP(DATE(a.date), a.time_in)
                + INTERVAL (
                  s.end_time <= s.start_time
                  AND a.time_in < s.start_time
                ) DAY
            ),
            LEAST(
              TIMESTAMP(DATE(s.date), s.end_time)
                + INTERVAL (s.end_time <= s.start_time) DAY,
              TIMESTAMP(DATE(a.date), a.time_out)
                + INTERVAL (
                  a.time_out < a.time_in
                  OR (
                    s.end_time <= s.start_time
                    AND a.time_out < s.start_time
                  )
                ) DAY
            )
          )
        ) / 60
        ELSE 0
      END
    ), 0) AS regular_hours,

    
COALESCE((
  SELECT ROUND(
    SUM(
      (TIME_TO_SEC(o.end_time) - TIME_TO_SEC(o.start_time))
      / 3600
    ),
    2
  )
  FROM overtime_requests o
  WHERE (o.user_id = u.id OR o.user_id = u.employee_id)
    AND LOWER(TRIM(o.status)) = 'approved'
    AND DATE(o.date) BETWEEN ? AND ?
    AND o.start_time IS NOT NULL
    AND o.end_time IS NOT NULL
    AND TIME_TO_SEC(o.end_time) > TIME_TO_SEC(o.start_time)
    AND TIME_TO_SEC(o.end_time) - TIME_TO_SEC(o.start_time)
        BETWEEN 1800 AND 43200
    AND TIMESTAMP(DATE(o.date), o.end_time) <= NOW()
), 0) AS overtime_hours,


    
COALESCE((
  SELECT SUM(
    CASE
      WHEN lr.duration IN ('1st Half', '2nd Half')
        THEN 0.5
      ELSE 1
    END
  )
  FROM leave_requests lr
  WHERE (lr.user_id = u.id OR lr.user_id = u.employee_id)
    AND lr.status = 'Approved'
    AND DATE(lr.request_date) BETWEEN ? AND ?
), 0) AS leave_days,


    COALESCE(SUM(
      CASE
        WHEN a.time_in IS NOT NULL
         AND s.start_time IS NOT NULL
         AND TIME_TO_SEC(
           TIMEDIFF(a.time_in, s.start_time)
         ) > 1800
        THEN TIME_TO_SEC(
          TIMEDIFF(a.time_in, s.start_time)
        ) / 60
        ELSE 0
      END
    ), 0) AS late_minutes

  FROM users u

  
LEFT JOIN attendance a
  ON u.employee_id = a.user_id
 AND a.date BETWEEN ? AND ?


  LEFT JOIN schedules s
    ON a.schedule_id = s.id

  LEFT JOIN courses c
    ON s.course = c.name

  WHERE u.role = 'instructor'
    AND u.status = 'active'
    ${filterSql}

  GROUP BY u.id
`;


  db.query(sql, queryParams, (err, results) => {
    if (err) {
      console.error("Attendance monthly error:", err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results);
  });
});


app.get(
  '/api/payroll/history',
  authenticateToken,
  allowRoles('hr_admin'),
  (req, res) => {
    if (req.user.role !== 'hr_admin') {
      return res.status(403).json({
        success: false,
        message: 'HR access required for payroll history.'
      });
    }

    const sql = `
      SELECT
        p.id,
        p.user_id,
        p.month_year,
        p.period_start,
        p.period_end,
        p.gross_pay,
        p.net_pay,
        p.tax_deduction,
        p.sss_deduction,
        p.philhealth_deduction,
        p.pagibig_deduction,
        p.mbf_deduction,
        p.loan_deduction,
        p.other_deduction,
        p.bonus,
        p.status,
        p.salary_rate,
        p.total_hours,
        p.overtime_hours,
        p.overtime_pay,
        p.transport_allowance,
        p.meal_allowance,
        p.housing_allowance,
        p.late_deduction,
        p.total_earnings,
        u.full_name,
        u.employee_id
      FROM payroll p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.id DESC
    `;

    db.query(sql, (err, results) => {
      if (err) {
        console.error('Payroll history error:', err);
        return res.status(500).json({
          success: false,
          message: 'Failed to retrieve payroll history.'
        });
      }

      res.json(results || []);
    });
  }
);


app.get('/api/school-locations', authenticateToken, (req, res) => {
  db.query("SELECT id, name, latitude, longitude, radius FROM school_locations ORDER BY name", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json(results || []);
  });
});

app.post('/api/school-locations', authenticateToken, requireAction('locations:write'), (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, latitude, longitude, radius } = req.body;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Location name required' });
  }
  
  if (name.trim().length > 150) {
    return res.status(400).json({ error: 'Location name must be 150 characters or fewer' });
  }
  
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Valid latitude and longitude required' });
  }
  if (latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
  }
  if (longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
  }
  
  const defaultRadius = systemConfigCache.geofence_default_radius || 200; 
  const locRadius = radius && Number.isFinite(radius) && radius > 0 ? Math.round(radius) : defaultRadius;
  if (locRadius < 50 || locRadius > 5000) {
    return res.status(400).json({ error: 'Radius must be between 50 and 5000 meters' });
  }
  
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

app.put('/api/school-locations/:id', authenticateToken, requireAction('locations:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, latitude, longitude, radius } = req.body;
  const locationId = req.params.id;
  
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Location name required' });
  }
  // ✅ NEW
  if (name.trim().length > 150) {
    return res.status(400).json({ error: 'Location name must be 150 characters or fewer' });
  }
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
      !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: 'Valid latitude and longitude required' });
  }
  if (latitude < -90 || latitude > 90) {
    return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
  }
  if (longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
  }
  const locRadius = radius && Number.isFinite(radius) && radius > 0 ? Math.round(radius) : 200;
  if (locRadius < 50 || locRadius > 5000) {
    return res.status(400).json({ error: 'Radius must be between 50 and 5000 meters' });
  }
  
  // ✅ FIX L1: wrap async in try/catch
  try {
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
  } catch (err) {
    console.error("Update location server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error while updating location.' });
    }
  }
});

app.delete('/api/school-locations/:id', authenticateToken, requireAction('locations:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const locationId = req.params.id;
  
  
  try {
    const [oldRecord] = await db.promise().query("SELECT * FROM school_locations WHERE id = ?", [locationId]);
    if (oldRecord.length === 0) return res.status(404).json({ error: 'Location not found' });
    const oldData = oldRecord[0];
    
    
    db.query("SELECT id FROM schedules WHERE place = ? LIMIT 1", [oldData.name], (err, rows) => {
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
  } catch (err) {
    console.error("Delete location server error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error while deleting location.' });
    }
  }
});



app.get('/api/reports/compliance/attendance-compliance', authenticateToken, allowRoles('hr_admin'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR authorization required.' });
  }

  const period = parseReportPeriod(req.query.month, req.query.year);
  if (period.error) {
    return res.status(400).json({ success: false, message: period.error });
  }
  const { month, year } = period;

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { program_id, course } = req.query;
  let filterSql = "";
  
  
  let queryParams = [startDate, endDate, startDate, endDate, startDate, endDate];

  if (course) {
    filterSql += " AND s.course = ?";
    queryParams.push(course);
  } else if (program_id) {
    filterSql += " AND c.program_id = ?";
    queryParams.push(program_id);
  }

  try {
    const [rows] = await db.promise().query(`
      SELECT 
        u.employee_id,
        u.full_name,
        COALESCE(u.position_level, 'Simulationist') AS position_level,
        COUNT(DISTINCT s.id) AS scheduled_shifts,
        COALESCE(SUM(TIMESTAMPDIFF(MINUTE, s.start_time, s.end_time) / 60), 0) AS scheduled_hours,
        COUNT(DISTINCT CASE 
          WHEN a.status IN ('present', 'late', 'completed') OR (a.time_in IS NOT NULL AND a.time_out IS NOT NULL) 
          THEN s.id 
        END) AS present_shifts,
        COALESCE(SUM(
          CASE 
            WHEN a.time_in IS NOT NULL AND a.time_out IS NOT NULL AND a.time_out != '--:--'
            THEN TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60
            ELSE 0
          END
        ), 0) AS rendered_hours,
        COALESCE(SUM(
          CASE 
            WHEN a.time_out IS NOT NULL AND a.time_out != '--:--' AND a.time_out < s.end_time
            THEN TIMESTAMPDIFF(MINUTE, a.time_out, s.end_time)
            ELSE 0
          END
        ), 0) AS undertime_minutes,
        COALESCE(SUM(
          CASE 
            WHEN a.status = 'late' OR (a.time_in IS NOT NULL AND s.start_time IS NOT NULL AND a.time_in > ADDTIME(s.start_time, '00:15:00')) 
            THEN 1 
            ELSE 0 
          END
        ), 0) AS late_count,
        COALESCE(SUM(
          CASE 
            WHEN a.time_in IS NOT NULL AND s.start_time IS NOT NULL AND a.time_in > s.start_time
            THEN TIMESTAMPDIFF(MINUTE, s.start_time, a.time_in)
            ELSE 0
          END
        ), 0) AS total_late_minutes,
        (
          SELECT COUNT(DISTINCT lr.request_date) 
          FROM leave_requests lr 
          WHERE (lr.user_id = u.employee_id OR lr.user_id = u.id) 
            AND lr.status = 'Approved' 
            AND lr.request_date BETWEEN ? AND ?
        ) AS leave_days,
        (
          SELECT COALESCE(SUM(TIMESTAMPDIFF(MINUTE, o.start_time, o.end_time) / 60), 0)
          FROM overtime_requests o
          WHERE (o.user_id = u.id OR o.user_id = u.employee_id)
            AND o.status = 'approved'
            AND o.date BETWEEN ? AND ?
        ) AS overtime_hours
      FROM users u
      LEFT JOIN schedules s ON (u.employee_id = s.user_id OR u.id = s.user_id) AND s.date BETWEEN ? AND ?
      LEFT JOIN attendance a ON s.id = a.schedule_id
      LEFT JOIN courses c ON s.course = c.name   -- 🚨 NEW JOIN
      WHERE LOWER(u.role) = 'instructor' AND u.status = 'active' ${filterSql} -- 🚨 NEW FILTER
      GROUP BY u.id
      ORDER BY u.full_name ASC
    `, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active instructors found for the selected period.' });
    }

    const reportData = rows.map(row => {
      const scheduledShifts = Number(row.scheduled_shifts) || 0;
      const presentShifts = Number(row.present_shifts) || 0;
      const lateCount = Number(row.late_count) || 0;
      const leaveDays = Number(row.leave_days) || 0;
      
      const expectedShifts = Math.max(0, scheduledShifts - leaveDays);
      const unexcused = Math.max(0, expectedShifts - presentShifts);
      
      const schedHours = Number(row.scheduled_hours) || 0;
      const actHours = Number(row.rendered_hours) || 0;
      const otHours = Number(row.overtime_hours) || 0;
      
      // ✅ Equivalent Days (Total Hours / 8)
      const equivalentDays = (actHours / 8).toFixed(2);

      let attendanceRateText = 'N/A';
      let auditStatus = 'NO SCHEDULE';
      let rateNumber = null;

      if (scheduledShifts === 0) {
        attendanceRateText = 'N/A';
        auditStatus = 'NO SCHEDULE';
      } else if (expectedShifts === 0 && leaveDays > 0) {
        attendanceRateText = '100.0%';
        auditStatus = 'EXCUSED LEAVE';
        rateNumber = 100;
      } else if (expectedShifts > 0) {
        const calculatedRate = Math.min(100, (presentShifts / expectedShifts) * 100);
        rateNumber = calculatedRate;
        attendanceRateText = `${calculatedRate.toFixed(1)}%`;
        if (calculatedRate >= 95) auditStatus = 'EXCELLENT';
        else if (calculatedRate >= 80) auditStatus = 'COMPLIANT';
        else auditStatus = 'DEFICIENT';
      }

      return {
        employee_id: row.employee_id || '—',
        full_name: row.full_name || 'Unknown',
        position: (row.position_level || 'Simulationist').substring(0, 22),
        scheduled_shifts: scheduledShifts,
        present_shifts: presentShifts,
        late_count: lateCount,
        total_late_mins: Math.round(row.total_late_minutes || 0),
        total_undertime_mins: Math.round(row.undertime_minutes || 0),
        leave_days: leaveDays,
        unexcused_absences: unexcused,
        scheduled_hours: schedHours.toFixed(1),
        rendered_hours: actHours.toFixed(1),
        equivalent_days: equivalentDays,
        overtime_hours: otHours.toFixed(1),
        attendance_rate: attendanceRateText,
        rate_number: rateNumber,
        audit_status: auditStatus
      };
    });

    // Frontend-owned printable compliance report (R08 layout update).
    // Preserve the original PDF response for existing consumers; format=json
    // returns only authorized report data, not a rendered document.
    if (req.query.format === 'json') {
      return res.json({
        success: true,
        report_type: 'internal_attendance_compliance',
        period: { month, year, start_date: startDate, end_date: endDate },
        filters: { program_id: program_id || '', course: course || '' },
        generated_at: new Date().toISOString(),
        records: reportData
      });
    }

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=HCT_Attendance_Report_${year}_${String(month).padStart(2,'0')}.pdf`);
    doc.pipe(res);

    const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' });
    const phtNow = getPHDateTime();
    const reportRefId = `DTR-AUD-${year}${String(month).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;

    // ✅ WATERMARK
    doc.save();
    doc.opacity(0.08);
    doc.rotate(45, { origin: [400, 300] });
    doc.fontSize(60).font('Helvetica-Bold').fillColor('#000000').text('CONFIDENTIAL', 100, 250, { align: 'center', width: 600 });
    doc.restore();

    // 1. INSTITUTIONAL LETTERHEAD & TITLE
    doc.fontSize(15).font('Helvetica-Bold').fillColor('#0F172A').text('HCT ACADEMY - HEALTHCARE TRAINING CENTER', 36, 34);
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#00897B').text('MONTHLY ATTENDANCE & TIMEKEEPING REPORT', 36, 51);
    doc.fontSize(7.5).font('Helvetica').fillColor('#64748B').text('HCT Academy 611 Shaw Blvd 1550, Pasig, Metro Manila', 36, 62);

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#0F172A').text(`REPORT ID: ${reportRefId}`, 580, 34, { align: 'right' });
    doc.fontSize(7).font('Helvetica').fillColor('#475569').text(`Reporting Period: ${monthName} 1–${lastDay}, ${year}`, 580, 44, { align: 'right' });
    doc.text(`Department: Simulation & Clinical Faculty`, 580, 54, { align: 'right' });
    doc.text(`Source Module: UniVITA ISMS Timekeeping & Geofence DTR Engine`, 580, 64, { align: 'right' });
    doc.text(`Generated (PHT): ${phtNow}`, 580, 74, { align: 'right' });

    doc.moveTo(36, 86).lineTo(805, 86).lineWidth(1).stroke('#CBD5E1');

    // 2. EXECUTIVE SUMMARY TILES
    const totalInstructors = reportData.length;
    const sumSchedShifts = reportData.reduce((acc, r) => acc + r.scheduled_shifts, 0);
    const sumPresentShifts = reportData.reduce((acc, r) => acc + r.present_shifts, 0);
    const sumLeaves = reportData.reduce((acc, r) => acc + r.leave_days, 0);
    const sumExpectedShifts = Math.max(0, sumSchedShifts - sumLeaves);
    const sumLates = reportData.reduce((acc, r) => acc + r.late_count, 0);
    const sumAbsences = reportData.reduce((acc, r) => acc + r.unexcused_absences, 0);
    const sumSchedHours = reportData.reduce((acc, r) => acc + parseFloat(r.scheduled_hours), 0);
    const sumRenderedHours = reportData.reduce((acc, r) => acc + parseFloat(r.rendered_hours), 0);
    
    const overallAttendanceRate = sumExpectedShifts > 0 
      ? ((sumPresentShifts / sumExpectedShifts) * 100).toFixed(1) 
      : 'N/A';

    const tileWidth = 183;
    const tileHeight = 40;
    const tileY = 94;

    doc.rect(36, tileY, tileWidth, tileHeight).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('AUDITED FACULTY HEADCOUNT', 46, tileY + 6);
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(13).text(`${totalInstructors} Instructors`, 46, tileY + 18);

    doc.rect(231, tileY, tileWidth, tileHeight).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('INSTRUCTION HOURS (SCHED VS RENDERED)', 241, tileY + 6);
    doc.fillColor('#00897B').font('Helvetica-Bold').fontSize(12).text(`${sumRenderedHours.toFixed(1)} / ${sumSchedHours.toFixed(1)} hrs`, 241, tileY + 18);

    doc.rect(426, tileY, tileWidth, tileHeight).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('RECORDED INCIDENTS (MONTHLY)', 436, tileY + 6);
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text(`${sumLates} Lates | ${sumLeaves} Leaves | ${sumAbsences} Unexcused`, 436, tileY + 19);

    const slaColor = overallAttendanceRate !== 'N/A' && parseFloat(overallAttendanceRate) >= 85 ? '#059669' : '#DC2626';
    doc.rect(621, tileY, tileWidth, tileHeight).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(6.5).text('DEPARTMENTAL ATTENDANCE RATE', 631, tileY + 6);
    doc.fillColor(slaColor).font('Helvetica-Bold').fontSize(13).text(`${overallAttendanceRate}%`, 631, tileY + 18);

    // 3. METHODOLOGY & DTR REFERENCE BOX
    const methY = 140;
    doc.rect(36, methY, 769, 28).fillAndStroke('#F1F5F9', '#CBD5E1');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7).text('AUDIT METHODOLOGY & DTR SOURCE RECORD REFERENCE:', 44, methY + 5);
    doc.font('Helvetica').fontSize(6.5).fillColor('#334155').text(
      '• Formula: Attendance Rate = [Present Shifts ÷ (Scheduled Shifts − Approved Leave)] × 100. Approved leaves are excused and excluded from expected attendance denominator.\n' +
      '• Statutory DTR Reference: Compiled from Daily Time Record (DTR) logs, biometrics, and geofenced mobile clock-in/out records pursuant to DOLE Labor Standards & Section 2, Rule X of the Omnibus Rules Implementing the Labor Code.',
      44, methY + 13, { width: 753, lineGap: 1.5 }
    );

    // 4. TABLE STRUCTURE
    const tableTop = 176;
    const colWidths = [42, 115, 75, 38, 38, 38, 38, 42, 45, 45, 40, 45, 45, 48, 60]; // Adjusted widths
    const headers = [
      'EMP ID', 'INSTRUCTOR NAME', 'POSITION / TITLE', 'SCHED', 'PRES', 'LATE', 
      'UT', 'LEAVE', 'UNEXC ABS', 'SCHED HRS', 'REND HRS', 'EQV DAYS', 'OT HRS', 'ATT RATE', 'STATUS'
    ];
    const rowHeight = 18;
    let currentY = tableTop;

    const drawTableHeader = (y) => {
      doc.rect(36, y, 769, rowHeight).fillAndStroke('#0F172A', '#0F172A');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6);
      
      let x = 36;
      headers.forEach((h, i) => {
        const align = (i === 1 || i === 2) ? 'left' : 'center';
        const offset = (i === 1 || i === 2) ? 4 : 0;
        doc.text(h, x + offset, y + 5.5, { width: colWidths[i] - (offset * 2), align });
        x += colWidths[i];
      });
    };

    drawTableHeader(currentY);
    currentY += rowHeight;

    // 5. EMPLOYEE DATA ROWS
    reportData.forEach((emp, index) => {
      if (currentY > 480) {
        doc.addPage();
        currentY = 36;
        drawTableHeader(currentY);
        currentY += rowHeight;
      }

      const isEven = index % 2 === 0;
      doc.rect(36, currentY, 769, rowHeight).fillAndStroke(isEven ? '#FFFFFF' : '#F8FAFC', '#E2E8F0');
      doc.fontSize(6.5).font('Helvetica');

      let x = 36;
      const values = [
        emp.employee_id,
        emp.full_name,
        emp.position,
        emp.scheduled_shifts.toString(),
        emp.present_shifts.toString(),
        emp.late_count.toString(),
        emp.total_undertime_mins.toString(),
        emp.leave_days.toString(),
        emp.unexcused_absences.toString(),
        `${emp.scheduled_hours}h`,
        `${emp.rendered_hours}h`,
        emp.equivalent_days,
        `${emp.overtime_hours}h`,
        emp.attendance_rate,
        emp.audit_status
      ];

      values.forEach((val, i) => {
        const align = (i === 1 || i === 2) ? 'left' : 'center';
        const offset = (i === 1 || i === 2) ? 4 : 0;
        
        doc.fillColor('#0F172A');
        if (i === 0) {
          doc.font('Helvetica-Bold');
        } else if (i === 5 && emp.late_count > 0) {
          doc.fillColor('#B45309').font('Helvetica-Bold');
        } else if (i === 6 && emp.total_undertime_mins > 0) {
          doc.fillColor('#B45309').font('Helvetica-Bold');
        } else if (i === 8 && emp.unexcused_absences > 0) {
          doc.fillColor('#DC2626').font('Helvetica-Bold');
        } else if (i === 13) {
          doc.font('Helvetica-Bold');
          if (emp.attendance_rate === 'N/A') doc.fillColor('#64748B');
          else if (emp.rate_number >= 95) doc.fillColor('#059669');
          else if (emp.rate_number < 80) doc.fillColor('#DC2626');
          else doc.fillColor('#0F172A');
        } else if (i === 14) {
          doc.font('Helvetica-Bold');
          if (emp.audit_status === 'NO SCHEDULE') doc.fillColor('#64748B');
          else if (emp.audit_status === 'EXCELLENT' || emp.audit_status === 'EXCUSED LEAVE') doc.fillColor('#059669');
          else if (emp.audit_status === 'DEFICIENT') doc.fillColor('#DC2626');
          else doc.fillColor('#2563EB');
        } else {
          doc.font('Helvetica');
        }

        doc.text(val, x + offset, currentY + 5, { width: colWidths[i] - (offset * 2), align });
        x += colWidths[i];
      });

      currentY += rowHeight;
    });

    // 6. TRIPARTITE SIGN-OFF BLOCK
    if (currentY > 440) { doc.addPage(); currentY = 40; }

    currentY += 12;
    const signColWidth = 230;

    doc.moveTo(36, currentY + 22).lineTo(36 + signColWidth, currentY + 22).lineWidth(0.8).stroke('#0F172A');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text('PREPARED BY: HR COMPLIANCE OFFICER', 36, currentY + 26);
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748B').text('Records & Timekeeping Specialist | Date: ____________', 36, currentY + 36);

    doc.moveTo(305, currentY + 22).lineTo(305 + signColWidth, currentY + 22).stroke('#0F172A');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text('REVIEWED BY: DEAN / SIMULATION HEAD', 305, currentY + 26);
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748B').text('Academic & Clinical Faculty Division | Date: ____________', 305, currentY + 36);

    doc.moveTo(575, currentY + 22).lineTo(575 + signColWidth, currentY + 22).stroke('#0F172A');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text('APPROVED BY: EXECUTIVE VICE PRESIDENT', 575, currentY + 26);
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748B').text('HCT Academy Executive Directorate | Date: ____________', 575, currentY + 36);

    // ✅ EMPLOYEE ACKNOWLEDGMENT BLOCK
    currentY += 60;
    doc.moveTo(36, currentY + 22).lineTo(36 + signColWidth, currentY + 22).lineWidth(0.8).stroke('#0F172A');
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(7.5).text('EMPLOYEE ACKNOWLEDGMENT (SIGNATURE OVER PRINTED NAME)', 36, currentY + 26);
    doc.font('Helvetica').fontSize(6.5).fillColor('#64748B').text('Faculty Member Signature | Date: ____________', 36, currentY + 36);

    // 7. NATIONAL PRIVACY COMMISSION (NPC) COMPLIANT NOTICE
    const footerY = 554;
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569');
    doc.text('CONFIDENTIAL - AUTHORIZED HR AND MANAGEMENT USE ONLY', 36, footerY, { align: 'center', width: 769 });
    doc.fontSize(6).font('Helvetica').fillColor('#64748B');
    doc.text(
      'Contains employee attendance information. Handle, retain, and disclose strictly according to HCT Academy\'s privacy and records-management policies and the Philippine Data Privacy Act of 2012 (RA 10173).',
      36, footerY + 8, { align: 'center', width: 769 }
    );

    doc.end();
  } catch (err) {
    console.error('Compliance PDF generation error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Server failed to generate the attendance report.' });
    }
  }
});



app.post(
  '/api/payroll/unlock',
  authenticateToken,
  requireAction('payroll:unlock'),
  async (req, res) => {
    try {
      const { email, pin } = req.body || {};

      if (typeof email !== 'string' ||
          typeof pin !== 'string' ||
          !PAYROLL_PIN_PATTERN.test(pin)) {
        return res.status(400).json({
          success: false,
          message: 'Enter a valid email and 4 to 6 digit PIN.'
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // The PIN must belong to the authenticated account.
      const [users] = await db.promise().query(
        `SELECT id, email, role, status, payroll_pin
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [req.user.id]
      );

      const account = users[0];

      if (!account ||
          account.status !== 'active' ||
          account.role !== 'hr_admin' ||
          String(account.email).toLowerCase() !== normalizedEmail) {
        return res.status(403).json({
          success: false,
          message: 'Payroll access is not permitted for this account.'
        });
      }

      const attemptKey = String(account.id);

      if (!checkPinRateLimit(attemptKey)) {
        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please wait 15 minutes.'
        });
      }

      if (!account.payroll_pin) {
        return res.status(403).json({
          success: false,
          message: 'No payroll PIN is configured. Set your PIN in Settings first.'
        });
      }

      // Known legacy default is not accepted for unlocking.
      if (account.payroll_pin === '1234') {
        return res.status(403).json({
          success: false,
          message: 'Your default PIN must be changed in Settings before accessing payroll.'
        });
      }

      const validPin = await verifyStoredPayrollPin(
        account.id,
        account.payroll_pin,
        pin
      );

      if (!validPin) {
        recordFailedPinAttempt(attemptKey);

        return res.status(400).json({
          success: false,
          message: 'Incorrect security PIN.'
        });
      }

      // Also reject accounts whose old default PIN was
      // previously migrated into a bcrypt hash.
      if (pin === '1234') {
        return res.status(403).json({
          success: false,
          message: 'Change the default PIN in Settings before accessing payroll.'
        });
      }

      clearPinAttempts(attemptKey);

      const payrollToken = jwt.sign(
        {
          id: account.id,
          email: account.email,
          role: account.role,
          purpose: 'payroll-access'
        },
        PAYROLL_JWT_SECRET,
        { expiresIn: '15m' }
      );

      db.query(
        `INSERT INTO payroll_access_logs (user_id, email)
         VALUES (?, ?)`,
        [account.id, account.email],
        (logError) => {
          if (logError) {
            console.error('Payroll access audit error:', logError.message);
          }
        }
      );

      return res.json({
        success: true,
        message: 'Payroll access granted.',
        token: payrollToken,
        expiresIn: 900
      });

    } catch (error) {
      console.error('Payroll unlock error:', error.message);

      return res.status(500).json({
        success: false,
        message: 'Unable to verify payroll access.'
      });
    }
  }
);



app.put(
  '/api/users/update-pin',
  authenticateToken,
  requireAction('payroll:unlock'),
  async (req, res) => {
    try {
      const { currentPin, newPin } = req.body || {};

      if (typeof currentPin !== 'string' ||
          typeof newPin !== 'string' ||
          !currentPin ||
          !PAYROLL_PIN_PATTERN.test(newPin)) {
        return res.status(400).json({
          success: false,
          message: 'Enter your current credential and a valid new PIN of 4 to 6 digits.'
        });
      }

      if (newPin === '1234') {
        return res.status(400).json({
          success: false,
          message: 'The default PIN 1234 cannot be used.'
        });
      }

      const [users] = await db.promise().query(
        `SELECT id, email, role, status, password, payroll_pin
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [req.user.id]
      );

      const account = users[0];

      if (!account ||
          account.status !== 'active' ||
          account.role !== 'hr_admin') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to change a payroll PIN.'
        });
      }

      const attemptKey = String(account.id);

      if (!checkPinRateLimit(attemptKey)) {
        return res.status(429).json({
          success: false,
          message: 'Too many attempts. Please wait 15 minutes.'
        });
      }

      let credentialValid = false;

      if (account.payroll_pin) {
        // Normal PIN change.
        credentialValid = await verifyStoredPayrollPin(
          account.id,
          account.payroll_pin,
          currentPin
        );
      } else {
        // First-time PIN setup:
        // verify the user's account password.
        credentialValid = Boolean(
          account.password &&
          await bcrypt.compare(currentPin, account.password)
        );
      }

      if (!credentialValid) {
        recordFailedPinAttempt(attemptKey);

        return res.status(401).json({
          success: false,
          message: 'Current PIN or account password is incorrect.'
        });
      }

      if (account.payroll_pin &&
          await verifyStoredPayrollPin(
            account.id,
            account.payroll_pin,
            newPin
          )) {
        return res.status(400).json({
          success: false,
          message: 'Your new PIN must be different from your current PIN.'
        });
      }

      const hashedPin = await bcrypt.hash(newPin, 12);

      await db.promise().query(
        `UPDATE users
         SET payroll_pin = ?
         WHERE id = ?`,
        [hashedPin, account.id]
      );

      clearPinAttempts(attemptKey);

      return res.json({
        success: true,
        message: 'Payroll security PIN updated successfully.'
      });

    } catch (error) {
      console.error('Payroll PIN update error:', error.message);

      return res.status(500).json({
        success: false,
        message: 'Unable to update payroll security PIN.'
      });
    }
  }
);

// 12. PAYROLL (Secured & Validated)

const R01_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const r01Money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function r01PeriodFromLabel(label) {
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (20\d{2})$/.exec(String(label || ''));
  if (!match) return null;
  const month = R01_MONTHS.indexOf(match[1]) + 1;
  const year = Number(match[2]);
  const now = new Date();
  if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)) return null;
  return { month, year, monthYear: `${R01_MONTHS[month - 1]} ${year}` };
}

function r01ParseAdjustment(value, name) {
  if (value === undefined || value === null || value === '') return 0;
  if ((typeof value !== 'string' && typeof value !== 'number') ||
      String(value).trim() === '' || !/^\d+(?:\.\d{1,2})?$/.test(String(value)) ||
      !Number.isFinite(Number(value)) || Number(value) > 1000000) {
    const error = new Error(`${name} must be a non-negative amount with up to two decimal places (maximum ₱1,000,000).`);
    error.httpStatus = 400;
    throw error;
  }
  return r01Money(value);
}

async function r01LoadPayrollSource(connection, userId, month, year) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  const [employees] = await connection.query(
    `SELECT id, employee_id, full_name, monthly_salary, work_days_per_month
     FROM users WHERE id = ? AND role = 'instructor' AND status = 'active'`, [userId]);
  if (!employees.length) {
    const error = new Error('Active instructor not found.');
    error.httpStatus = 404;
    throw error;
  }
  const emp = employees[0];
  

const [attendance] = await connection.query(
  `SELECT
    COALESCE(SUM(
      CASE
        WHEN a.time_in IS NOT NULL
         AND a.time_out IS NOT NULL
         AND s.start_time IS NOT NULL
         AND s.end_time IS NOT NULL
         AND a.time_in <> a.time_out
        THEN GREATEST(
          0,
          TIMESTAMPDIFF(
            MINUTE,
            GREATEST(
              TIMESTAMP(DATE(s.date), s.start_time),
              TIMESTAMP(DATE(a.date), a.time_in)
                + INTERVAL (
                  s.end_time <= s.start_time
                  AND a.time_in < s.start_time
                ) DAY
            ),
            LEAST(
              TIMESTAMP(DATE(s.date), s.end_time)
                + INTERVAL (s.end_time <= s.start_time) DAY,
              TIMESTAMP(DATE(a.date), a.time_out)
                + INTERVAL (
                  a.time_out < a.time_in
                  OR (
                    s.end_time <= s.start_time
                    AND a.time_out < s.start_time
                  )
                ) DAY
            )
          )
        ) / 60
        ELSE 0
      END
    ), 0) AS regular_hours,

    COALESCE(SUM(
      CASE
        WHEN a.time_in IS NOT NULL
         AND s.start_time IS NOT NULL
         AND TIME_TO_SEC(
           TIMEDIFF(a.time_in, s.start_time)
         ) > 1800
        THEN TIME_TO_SEC(
          TIMEDIFF(a.time_in, s.start_time)
        ) / 60
        ELSE 0
      END
    ), 0) AS late_minutes

  FROM attendance a

  LEFT JOIN schedules s
    ON s.id = a.schedule_id

  WHERE a.user_id = ?
    AND a.date BETWEEN ? AND ?
    AND LOWER(TRIM(a.status)) NOT IN (
      'on leave',
      'absent',
      'system auto-clock out'
    )`,
  [emp.employee_id, start, end]
);

const [overtime] = await connection.query(
  `SELECT
     COALESCE(
       SUM(
         GREATEST(
           0,
           TIMESTAMPDIFF(
             MINUTE,
             start_time,
             end_time
           )
         ) / 60
       ), 0
     ) AS overtime_hours
   FROM overtime_requests
   WHERE user_id = ?
     AND date BETWEEN ? AND ?
     AND LOWER(TRIM(status)) = 'approved'
     AND COALESCE(
       NULLIF(TRIM(overtime_type), ''),
       'Regular Overtime'
     ) = 'Regular Overtime'`,
  [
    emp.id,
    start,
    end
  ]
);


  const [leaves] = await connection.query(
    `SELECT COUNT(*) AS paid_leave_days FROM (
       SELECT DISTINCT DATE(l.request_date) AS leave_date
       FROM leave_requests l
       WHERE (l.employee_id = ? OR l.user_id = ? OR l.user_id = ?)
         AND DATE(l.request_date) BETWEEN ? AND ?
         AND LOWER(TRIM(l.status)) = 'approved' AND l.is_paid = 1
         AND l.request_date IS NOT NULL
         AND LOWER(COALESCE(l.duration, 'Whole Day')) = 'whole day'
         AND NOT EXISTS (SELECT 1 FROM attendance a
                         WHERE a.user_id = ? AND a.date = DATE(l.request_date)
                           AND a.time_in IS NOT NULL AND a.time_out IS NOT NULL
                           AND LOWER(TRIM(a.status)) NOT IN ('absent', 'on leave', 'system auto-clock out'))
     ) approved_paid_leave_dates`,
    [emp.employee_id, String(emp.id), emp.employee_id, start, end, emp.employee_id]);
  return {
    ...emp,
    regularHours: Number(attendance[0]?.regular_hours || 0),
    lateMinutes: Number(attendance[0]?.late_minutes || 0),
    overtimeHours: Number(overtime[0]?.overtime_hours || 0),
    paidLeaveDays: Number(leaves[0]?.paid_leave_days || 0),
    payrollYear: year, payrollMonth: month
  };
}

function r01Calculate(source, adjustments = {}) {
  const monthlySalary = Number(source.monthly_salary);
  const workDays = Number(source.work_days_per_month);
  if (!Number.isFinite(monthlySalary) || monthlySalary < 0 || !Number.isInteger(workDays) || workDays <= 0) {
    const error = new Error('Instructor salary or work days are invalid. Correct the employee profile before finalizing.');
    error.httpStatus = 422;
    throw error;
  }
  for (const field of ['regularHours','overtimeHours','lateMinutes','paidLeaveDays']) {
    if (!Number.isFinite(source[field]) || source[field] < 0) {
      const error = new Error(`Invalid ${field} in payroll source records.`);
      error.httpStatus = 422;
      throw error;
    }
  }
  

const hourlyRate = monthlySalary / workDays / 8;
const paidLeaveHours = source.paidLeaveDays * 8;

const baseEarnings =
  (source.regularHours + paidLeaveHours) * hourlyRate;

const overtimePay =
  source.overtimeHours * hourlyRate * 1.25;

const lateDeduction = 0;


  const transport = adjustments.transport || 0;
  const meal = adjustments.meal || 0;
  const housing = adjustments.housing || 0;
  const bonus = adjustments.bonus || 0;
  const loans = adjustments.loans || 0;
  const other = adjustments.other || 0;
  const grossPay = baseEarnings + overtimePay + transport + meal + housing + bonus;
  const statutoryBase = Math.max(0, (monthlySalary > 0 ? monthlySalary : baseEarnings) - lateDeduction);
  const sss = calcPHSSS(statutoryBase, source.payrollYear);
  const philhealth = calcPHPhilHealth(statutoryBase);
  const pagibig = calcPHPagIbig(statutoryBase, source.payrollYear, source.payrollMonth);
  const taxable = Math.max(0, grossPay - lateDeduction - sss - philhealth - pagibig);
  // BIR Annex E (2023 onwards), monthly withholding table.
  // Bracket bases are prescribed rounded monthly amounts.
  const bracket = [
    { min: 0, max: 20833, rate: 0, base: 0 },
    { min: 20833, max: 33332, rate: .15, base: 0 },
    { min: 33332, max: 66666, rate: .20, base: 1875 },
    { min: 66666, max: 166666, rate: .25, base: 8541.80 },
    { min: 166666, max: 666666, rate: .30, base: 33541.80 },
    { min: 666666, max: Infinity, rate: .35, base: 183541.80 }
  ].find(b => taxable > b.min && taxable <= b.max);
  const tax = bracket ? bracket.base + (taxable - bracket.min) * bracket.rate : 0;
  const netPay = Math.max(0, grossPay - lateDeduction - sss - philhealth - pagibig - tax - loans - other);
  return {
    salary_rate: r01Money(hourlyRate), total_hours: r01Money(source.regularHours + paidLeaveHours),
    overtime_hours: r01Money(source.overtimeHours), overtime_pay: r01Money(overtimePay),
    transport_allowance: transport, meal_allowance: meal, housing_allowance: housing,
    sss_deduction: r01Money(sss), philhealth_deduction: r01Money(philhealth),
    pagibig_deduction: r01Money(pagibig), loan_deduction: loans, other_deduction: other,
    late_deduction: r01Money(lateDeduction), gross_pay: r01Money(grossPay),
    tax_deduction: r01Money(tax), net_pay: r01Money(netPay), total_earnings: r01Money(netPay)
  };
}

const R01_PAYROLL_COLUMNS = [
  'user_id','month_year','salary_rate','total_hours','overtime_hours','overtime_pay',
  'transport_allowance','meal_allowance','housing_allowance','sss_deduction',
  'philhealth_deduction','pagibig_deduction','loan_deduction','other_deduction',
  'late_deduction','gross_pay','tax_deduction','net_pay','total_earnings','status'
];
async function r01InsertPayroll(connection, userId, monthYear, values) {
  const data = { user_id: userId, month_year: monthYear, ...values, status: 'pending' };
  const params = R01_PAYROLL_COLUMNS.map(k => data[k]);
  const [result] = await connection.query(
    `INSERT INTO payroll (${R01_PAYROLL_COLUMNS.join(', ')}) VALUES (${params.map(() => '?').join(', ')})`, params);
  return result.insertId;
}

function r01Error(res, err, context) {
  if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, message: 'Payroll for this employee and period was already finalized.' });
  if (err && err.httpStatus) return res.status(err.httpStatus).json({ success: false, message: err.message });
  console.error(context, err);
  return res.status(500).json({ success: false, message: 'Unable to finalize payroll. Please try again or contact the administrator.' });
}

const UV_MONTHS = [
  'January', 'February', 'March', 'April',
  'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'
];

const uvRound = value =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const uvPayrollError = (message, status = 422) => {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
};

const uvLocalToday = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const get = type =>
    parts.find(part => part.type === type)?.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
};

function uvCutoff(label) {
  const pattern =
    /^(January|February|March|April|May|June|July|August|September|October|November|December) (20\d{2}) \| (26-10|11-25)$/;

  const match = pattern.exec(String(label || ''));

  if (!match) return null;

  const month = UV_MONTHS.indexOf(match[1]) + 1;
  const year = Number(match[2]);
  const code = match[3];

  const pad = number => String(number).padStart(2, '0');

  const previousMonth = new Date(
    Date.UTC(year, month - 2, 26)
  );

  const start = code === '26-10'
    ? `${previousMonth.getUTCFullYear()}-${pad(
        previousMonth.getUTCMonth() + 1
      )}-26`
    : `${year}-${pad(month)}-11`;

  const end = `${year}-${pad(month)}-${
    code === '26-10' ? '10' : '25'
  }`;

  return {
    label,
    start,
    end,
    month,
    year,
    code
  };
}

function uvAdjustment(value, name) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 0;
  }

  if (
    !/^\d+(?:\.\d{1,2})?$/.test(String(value)) ||
    Number(value) > 1000000
  ) {
    throw uvPayrollError(
      `${name} must be a non-negative amount up to ` +
      `₱1,000,000 with at most two decimal places.`,
      400
    );
  }

  return uvRound(value);
}

function uvAdjustments(body) {
  const fields = [
    'transport_allowance',
    'meal_allowance',
    'housing_allowance',
    'bonus',
    'mbf_deduction',
    'loan_deduction',
    'other_deduction'
  ];

  return Object.fromEntries(
    fields.map(field => [
      field,
      uvAdjustment(body?.[field], field)
    ])
  );
}

async function uvCutoffSource(connection, userId, period) {
  const [employees] = await connection.query(
    `SELECT
       id,
       employee_id,
       full_name,
       monthly_salary,
       work_days_per_month,
       employment_type,
       contract_type,
       employment_status,
       additional_info
     FROM users
     WHERE id = ?
       AND role = 'instructor'
       AND status = 'active'`,
    [userId]
  );

  if (!employees.length) {
    throw uvPayrollError(
      'Active instructor not found.',
      404
    );
  }

  const employee = employees[0];

  if (
    employee.employment_status &&
    employee.employment_status !== 'active'
  ) {
    throw uvPayrollError(
      'Separated employee cannot be finalized ' +
      'for an active payroll run.'
    );
  }

  let info = {};

  try {
    info = typeof employee.additional_info === 'string'
      ? JSON.parse(employee.additional_info || '{}')
      : (employee.additional_info || {});
  } catch {
    throw uvPayrollError(
      'Invalid compensation metadata in employee profile.'
    );
  }

  
const [attendance] = await connection.query(
  `SELECT
    COALESCE(SUM(
      CASE
        WHEN a.time_in IS NOT NULL
         AND a.time_out IS NOT NULL
         AND s.start_time IS NOT NULL
         AND s.end_time IS NOT NULL
         AND a.time_in <> a.time_out
        THEN GREATEST(
          0,
          TIMESTAMPDIFF(
            MINUTE,
            GREATEST(
              TIMESTAMP(DATE(s.date), s.start_time),
              TIMESTAMP(DATE(a.date), a.time_in)
                + INTERVAL (
                  s.end_time <= s.start_time
                  AND a.time_in < s.start_time
                ) DAY
            ),
            LEAST(
              TIMESTAMP(DATE(s.date), s.end_time)
                + INTERVAL (s.end_time <= s.start_time) DAY,
              TIMESTAMP(DATE(a.date), a.time_out)
                + INTERVAL (
                  a.time_out < a.time_in
                  OR (
                    s.end_time <= s.start_time
                    AND a.time_out < s.start_time
                  )
                ) DAY
            )
          )
        ) / 60
        ELSE 0
      END
    ), 0) AS regular_hours,

    COALESCE(SUM(
      CASE
        WHEN a.time_in IS NOT NULL
         AND s.start_time IS NOT NULL
         AND TIME_TO_SEC(
           TIMEDIFF(a.time_in, s.start_time)
         ) > 1800
        THEN TIME_TO_SEC(
          TIMEDIFF(a.time_in, s.start_time)
        ) / 60
        ELSE 0
      END
    ), 0) AS late_minutes

  FROM attendance a

  LEFT JOIN schedules s
    ON s.id = a.schedule_id

  WHERE a.user_id = ?
    AND a.date BETWEEN ? AND ?
    AND LOWER(TRIM(a.status)) NOT IN (
      'on leave',
      'absent',
      'system auto-clock out'
    )`,
  [
    employee.employee_id,
    period.start,
    period.end
  ]
);

const [overtime] = await connection.query(
  `SELECT
     COALESCE(
       SUM(
         GREATEST(
           0,
           TIMESTAMPDIFF(
             MINUTE,
             start_time,
             end_time
           )
         ) / 60
       ), 0
     ) AS overtime_hours
   FROM overtime_requests
   WHERE user_id = ?
     AND date BETWEEN ? AND ?
     AND LOWER(TRIM(status)) = 'approved'
     AND COALESCE(
       NULLIF(TRIM(overtime_type), ''),
       'Regular Overtime'
     ) = 'Regular Overtime'`,
  [
    employee.id,
    period.start,
    period.end
  ]
);


  const [leave] = await connection.query(
    `SELECT COUNT(*) AS paid_leave_days
     FROM (
       SELECT DISTINCT DATE(l.request_date) AS day
       FROM leave_requests l
       WHERE (
         l.employee_id = ?
         OR l.user_id = ?
         OR l.user_id = ?
       )
       AND DATE(l.request_date) BETWEEN ? AND ?
       AND LOWER(TRIM(l.status)) = 'approved'
       AND l.is_paid = 1
       AND LOWER(
         COALESCE(l.duration, 'Whole Day')
       ) = 'whole day'
       AND NOT EXISTS (
         SELECT 1
         FROM attendance a
         WHERE a.user_id = ?
           AND a.date = DATE(l.request_date)
           AND a.time_in IS NOT NULL
           AND a.time_out IS NOT NULL
           AND LOWER(TRIM(a.status)) NOT IN (
             'absent',
             'on leave',
             'system auto-clock out'
           )
       )
     ) AS unique_leave_days`,
    [
      employee.employee_id,
      String(employee.id),
      employee.employee_id,
      period.start,
      period.end,
      employee.employee_id
    ]
  );

  return {
    ...employee,
    info,
    period,
    regularHours:
      Number(attendance[0]?.regular_hours || 0),
    lateMinutes:
      Number(attendance[0]?.late_minutes || 0),
    overtimeHours:
      Number(overtime[0]?.overtime_hours || 0),
    paidLeaveDays:
      Number(leave[0]?.paid_leave_days || 0)
  };
}

function uvCutoffCalculate(source, adjustments) {
  /*
   * An explicit configuration is required.
   * EQUAL_SPLIT must not be enabled without
   * written HR approval and calculation testing.
   */
  const policy =
    process.env.PAYROLL_CUTOFF_DEDUCTION_POLICY;

  if (policy !== 'EQUAL_SPLIT') {
    throw uvPayrollError(
      'HR must confirm the statutory deduction ' +
      'and withholding-tax allocation policy.',
      409
    );
  }

  const salary = Number(source.monthly_salary);
  const workDays = Number(source.work_days_per_month);

  if (
    !Number.isFinite(salary) ||
    salary < 0 ||
    !Number.isInteger(workDays) ||
    workDays < 1 ||
    workDays > 31
  ) {
    throw uvPayrollError(
      'Invalid salary or workdays on employee profile.'
    );
  }

  const basis =
    source.info?.compensation_basis === 'hourly'
      ? 'hourly'
      : 'monthly';

  const hourlyRate = basis === 'hourly'
    ? Number(source.info?.hourly_rate)
    : salary / workDays / 8;

  if (
    !Number.isFinite(hourlyRate) ||
    hourlyRate <= 0
  ) {
    throw uvPayrollError(
      'Hourly compensation rate is missing or invalid.'
    );
  }

  const type = String(
    source.employment_type || ''
  ).toLowerCase();

  const contract = String(
    source.contract_type || ''
  ).toLowerCase();

  const allowanceEligible =
    contract === 'regular' ||
    type === 'part-time';

  if (
    !allowanceEligible &&
    [
      'transport_allowance',
      'meal_allowance',
      'housing_allowance'
    ].some(field => adjustments[field] > 0)
  ) {
    throw uvPayrollError(
      'This employment classification does not permit allowances.'
    );
  }

  const paidLeaveHours = basis === 'monthly'
    ? source.paidLeaveDays * 8
    : 0;

  const baseEarnings =
    (source.regularHours + paidLeaveHours) *
    hourlyRate;

  const overtimePay =
    source.overtimeHours * hourlyRate * 1.25;

  /*
   * Actual recorded hours are used as the base.
   * Late minutes are not deducted again,
   * to avoid double-reducing compensation.
   */
  const lateDeduction = 0;

  const grossPay =
    baseEarnings +
    overtimePay +
    adjustments.transport_allowance +
    adjustments.meal_allowance +
    adjustments.housing_allowance +
    adjustments.bonus;

  /*
   * These helpers already exist in server.js.
   * Do not define duplicate versions:
   * calcPHSSS
   * calcPHPhilHealth
   * calcPHPagIbig
   */
  const fullSSS = calcPHSSS(
    salary,
    source.period.year
  );

  const fullPhilHealth = calcPHPhilHealth(salary);

  const fullPagIbig = calcPHPagIbig(
    salary,
    source.period.year,
    source.period.month
  );

  const sss = uvRound(fullSSS / 2);
  const philhealth = uvRound(fullPhilHealth / 2);
  const pagibig = uvRound(fullPagIbig / 2);

  const monthlyTaxable = Math.max(
    0,
    salary -
      fullSSS -
      fullPhilHealth -
      fullPagIbig
  );

  const brackets = [
    { min: 0, max: 20833, rate: 0, base: 0 },
    { min: 20833, max: 33332, rate: 0.15, base: 0 },
    { min: 33332, max: 66666, rate: 0.20, base: 1875 },
    { min: 66666, max: 166666, rate: 0.25, base: 8541.80 },
    { min: 166666, max: 666666, rate: 0.30, base: 33541.80 },
    { min: 666666, max: Infinity, rate: 0.35, base: 183541.80 }
  ];

  const bracket = brackets.find(
    item =>
      monthlyTaxable > item.min &&
      monthlyTaxable <= item.max
  );

  const tax = uvRound(
    (
      bracket
        ? bracket.base +
          (monthlyTaxable - bracket.min) *
          bracket.rate
        : 0
    ) / 2
  );

  const totalDeductions = uvRound(
    sss +
    philhealth +
    pagibig +
    tax +
    adjustments.mbf_deduction +
    adjustments.loan_deduction +
    adjustments.other_deduction +
    lateDeduction
  );

  if (totalDeductions > grossPay) {
    throw uvPayrollError(
      'Deductions exceed gross pay. Review the payroll record.'
    );
  }

  return {
    salary_rate: uvRound(hourlyRate),
    total_hours: uvRound(
      source.regularHours + paidLeaveHours
    ),
    overtime_hours: uvRound(source.overtimeHours),
    overtime_pay: uvRound(overtimePay),
    ...adjustments,
    sss_deduction: sss,
    philhealth_deduction: philhealth,
    pagibig_deduction: pagibig,
    tax_deduction: tax,
    late_deduction: lateDeduction,
    gross_pay: uvRound(grossPay),
    net_pay: uvRound(
      grossPay - totalDeductions
    ),
    total_earnings: uvRound(
      grossPay - totalDeductions
    )
  };
}


const UV_PAYROLL_COLUMNS = [
  'user_id',
  'month_year',
  'period_start',
  'period_end',
  'salary_rate',
  'total_hours',
  'overtime_hours',
  'overtime_pay',
  'transport_allowance',
  'meal_allowance',
  'housing_allowance',
  'bonus',
  'sss_deduction',
  'philhealth_deduction',
  'pagibig_deduction',
  'mbf_deduction',
  'loan_deduction',
  'other_deduction',
  'late_deduction',
  'gross_pay',
  'tax_deduction',
  'net_pay',
  'total_earnings',
  'status'
];

async function uvInsertCutoff(
  connection,
  userId,
  period,
  calculated
) {
  const data = {
    user_id: userId,
    month_year: period.label,
    period_start: period.start,
    period_end: period.end,
    ...calculated,
    status: 'pending'
  };

  const placeholders =
    UV_PAYROLL_COLUMNS.map(() => '?').join(',');

  const sql = `
    INSERT INTO payroll
    (${UV_PAYROLL_COLUMNS.join(',')})
    VALUES (${placeholders})
  `;

  const values = UV_PAYROLL_COLUMNS.map(
    column => data[column]
  );

  const [result] = await connection.query(sql, values);

  return result.insertId;
}

async function uvCutoffHandler(
  req,
  res,
  finalize = false
) {
  if (req.user.role !== 'hr_admin') {
    return res.status(403).json({
      success: false,
      message: 'HR access required.'
    });
  }

  try {
    const period = uvCutoff(req.body?.month_year);
    const userId = Number(req.body?.user_id);

    if (
      !period ||
      !Number.isSafeInteger(userId) ||
      userId < 1
    ) {
      throw uvPayrollError(
        'Invalid cutoff label or instructor.',
        400
      );
    }

    const adjustments = uvAdjustments(req.body);

    const source = await uvCutoffSource(
      db.promise(),
      userId,
      period
    );

    const calculated = uvCutoffCalculate(
      source,
      adjustments
    );

    if (
      finalize &&
      period.end > uvLocalToday()
    ) {
      throw uvPayrollError(
        'Cutoff is still open. Finalization is not permitted.',
        400
      );
    }

    if (finalize) {
      const payrollId = await uvInsertCutoff(
        db.promise(),
        userId,
        period,
        calculated
      );

      logAction(
        req.user.id,
        'FINALIZE_CUTOFF_PAYROLL',
        'payroll',
        payrollId,
        req
      );

      return res.json({
        success: true,
        payroll_id: payrollId,
        calculated
      });
    }

    return res.json({
      success: true,
      calculated,
      source: {
        regular_hours: uvRound(source.regularHours),
        paid_leave_days: source.paidLeaveDays,
        overtime_hours: uvRound(source.overtimeHours),
        late_minutes: uvRound(source.lateMinutes)
      }
    });
  } catch (error) {
    return r01Error(
      res,
      error,
      'Cutoff payroll error:'
    );
  }
}


// Authoritative preview for HR confirmation, not a separate payroll record.
app.post('/api/payroll/preview', verifyPayrollAccess, requireAction('payroll:finalize'), async (req, res) => {
  if (
    String(req.body?.month_year || '').includes(' | ')
  ) {
    return uvCutoffHandler(req, res, false);
  }
  
  if (!['admin','hr_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Forbidden.' });
  const userId = Number(req.body.user_id);
  const period = r01PeriodFromLabel(req.body.month_year);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !period) {
    return res.status(400).json({ success: false, message: 'A valid instructor and non-future payroll period are required.' });
  }
  try {
    const adjustments = {};
    for (const [key, field] of Object.entries({
      transport: 'transport_allowance', meal: 'meal_allowance', housing: 'housing_allowance',
      bonus: 'bonus', loans: 'loan_deduction', other: 'other_deduction'
    })) adjustments[key] = r01ParseAdjustment(req.body[field], field);
    const source = await r01LoadPayrollSource(db.promise(), userId, period.month, period.year);
    const calculated = r01Calculate(source, adjustments);
    return res.json({ success: true, calculated, source: {
      employee: source.full_name, regular_hours: r01Money(source.regularHours),
      paid_leave_days: source.paidLeaveDays, overtime_hours: r01Money(source.overtimeHours),
      late_minutes: r01Money(source.lateMinutes)
    } });
  } catch (error) { return r01Error(res, error, 'Payroll preview error:'); }
});

// Existing endpoint, request URL, and successful response keys are preserved.
// Legacy submitted totals and deduction overrides are not trusted as calculations.
app.post('/api/payroll/finalize', verifyPayrollAccess, requireAction('payroll:finalize'), async (req, res) => {
  if (
  String(req.body?.month_year || '').includes(' | ')
) {
  return uvCutoffHandler(req, res, true);
}
  
  if (!['admin','hr_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Forbidden.' });
  const userId = Number(req.body.user_id);
  const period = r01PeriodFromLabel(req.body.month_year);
  if (!Number.isSafeInteger(userId) || userId <= 0 || !period) {
    return res.status(400).json({ success: false, message: 'A valid instructor and non-future payroll period are required.' });
  }
  try {
    const adjustmentNames = {
      transport: 'transport_allowance', meal: 'meal_allowance', housing: 'housing_allowance',
      bonus: 'bonus', loans: 'loan_deduction', other: 'other_deduction'
    };
    const adjustments = {};
    for (const [key, field] of Object.entries(adjustmentNames)) {
      adjustments[key] = r01ParseAdjustment(req.body[field], field);
    }
    const source = await r01LoadPayrollSource(db.promise(), userId, period.month, period.year);
    const calc = r01Calculate(source, adjustments);
    // InnoDB UNIQUE(user_id, month_year) guarantees exactly one record under concurrency.
    const id = await r01InsertPayroll(db.promise(), userId, period.monthYear, calc);
    logAction(req.user.id, 'FINALIZE_PAYROLL', 'payroll', id, req);
    return res.json({ success: true, message: 'Payroll finalized and awaiting payment confirmation.', payroll_id: id, calculated: calc });
  } catch (error) {
    return r01Error(res, error, 'Payroll finalization error:');
  }
});

// R02 statutory deductions: employee shares, with effective-date-aware caps.
// Official references: SSS 2025 contribution schedule, PhilHealth 2026 5%
// premium, Pag-IBIG Circular 460, BIR Annex E (2023 onward).
const calcPHSSS = (salary, year = 2026) => {
  if (salary <= 0) return 0;
  const minMSC = year >= 2025 ? 5000 : 4000;
  const maxMSC = year >= 2025 ? 35000 : 30000;
  const rate = year >= 2025 ? 0.05 : 0.045;
  // SSS bracket midpoint is 250 + multiples of 500.
  const msc = salary < minMSC + 250 ? minMSC :
    Math.min(maxMSC, minMSC + Math.floor((salary - (minMSC - 250)) / 500) * 500);
  return r01Money(msc * rate);
};
const calcPHPhilHealth = (salary) => {
  if (salary <= 0) return 0;
  return r01Money(Math.min(100000, Math.max(10000, salary)) * 0.05 / 2);
};
const calcPHPagIbig = (salary, year = 2026, month = 1) => {
  if (salary <= 0) return 0;
  const cap = year > 2024 || (year === 2024 && month >= 2) ? 10000 : 5000;
  return r01Money(Math.min(cap, salary) * (salary <= 1500 ? .01 : .02));
};

// R02: Payroll is prepared/finalized when inserted ('pending'). The employee
// has NOT necessarily been paid. Only an authorized HR user may confirm
// disbursement, and the one-way transition is guarded by an atomic UPDATE.
app.post('/api/payroll/:id/mark-paid', verifyPayrollAccess, requireAction('payroll:finalize'), async (req, res) => {
  if (req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Only HR personnel may confirm payroll payment.' });
  }
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, message: 'A valid payroll record is required.' });
  }
  if (req.body?.confirm_paid !== true) {
    return res.status(400).json({ success: false, message: 'Confirm that the payment was actually disbursed before marking it paid.' });
  }
  try {
    const [result] = await db.promise().query(
      `UPDATE payroll SET status = 'paid' WHERE id = ? AND status = 'pending' AND user_id IS NOT NULL`, [id]);
    if (result.affectedRows !== 1) {
      return res.status(409).json({ success: false, message: 'This payroll record is already paid or cannot be confirmed.' });
    }
    logAction(req.user.id, 'CONFIRM_PAYROLL_PAID', 'payroll', id, req);
    return res.json({ success: true, payroll_id: id, status: 'paid', message: 'Payment confirmation saved.' });
  } catch (error) {
    console.error('Payroll payment confirmation error:', error);
    return res.status(500).json({ success: false, message: 'Unable to confirm payment.' });
  }
});


app.post(
  '/api/payroll/run-cutoff',
  verifyPayrollAccess,
  requireAction('payroll:run'),
  async (req, res) => {
    if (req.user.role !== 'hr_admin') {
      return res.status(403).json({
        success: false,
        message: 'HR access required.'
      });
    }

    if (
      process.env
        .PAYROLL_BATCH_ZERO_ADJUSTMENTS_APPROVED !== 'true'
    ) {
      return res.status(409).json({
        success: false,
        message:
          'Batch payroll is disabled until HR approves ' +
          'zero-adjustment batch processing. ' +
          'Use individual payroll review instead.'
      });
    }

    let connection;

    try {
      const period = uvCutoff(
        req.body?.month_year
      );

      if (!period) {
        throw uvPayrollError(
          'Invalid cutoff label.',
          400
        );
      }

      if (period.end > uvLocalToday()) {
        throw uvPayrollError(
          'Cutoff is still open.',
          400
        );
      }

      connection =
        await db.promise().getConnection();

      await connection.beginTransaction();

      const [employees] = await connection.query(
        `SELECT id
         FROM users
         WHERE role = 'instructor'
           AND status = 'active'
           AND employment_status = 'active'
         ORDER BY id`
      );

      let processed = 0;
      let skipped = 0;
      const savedIds = [];

      for (const employee of employees) {
        try {
          const source = await uvCutoffSource(
            connection,
            employee.id,
            period
          );

          const calculated = uvCutoffCalculate(
            source,
            uvAdjustments({})
          );

          const payrollId = await uvInsertCutoff(
            connection,
            employee.id,
            period,
            calculated
          );

          savedIds.push(payrollId);
          processed++;
        } catch (error) {
          if (error.code === 'ER_DUP_ENTRY') {
            skipped++;
            continue;
          }

          throw error;
        }
      }

      await connection.commit();

      for (const id of savedIds) {
        logAction(
          req.user.id,
          'FINALIZE_CUTOFF_PAYROLL',
          'payroll',
          id,
          req
        );
      }

      return res.json({
        success: true,
        processed,
        skipped
      });
    } catch (error) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error(
            'Cutoff rollback error:',
            rollbackError
          );
        }
      }

      return r01Error(
        res,
        error,
        'Cutoff batch error:'
      );
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);


app.post('/api/payroll/run-monthly', verifyPayrollAccess, requireAction('payroll:run'), async (req, res) => {
  if (!['admin','hr_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Forbidden.' });
  const period = parseReportPeriod(req.body.month, req.body.year);
  if (period.error) return res.status(400).json({ success: false, message: period.error });
  const { month, year } = period;
  const monthYear = `${R01_MONTHS[month - 1]} ${year}`;
  try {
    const [employees] = await db.promise().query(
      `SELECT id, full_name FROM users WHERE role = 'instructor' AND status = 'active' ORDER BY id`);
    if (!employees.length) return res.status(400).json({ success: false, message: 'No active instructors found to process.' });
    const processed = [];
    const skipped = [];
    for (const emp of employees) {
      try {
        const source = await r01LoadPayrollSource(db.promise(), emp.id, month, year);
        const values = r01Calculate(source);
        const id = await r01InsertPayroll(db.promise(), emp.id, monthYear, values);
        processed.push({ employee: emp.full_name, totalHours: source.regularHours, netPay: values.net_pay.toFixed(2) });
        logAction(req.user.id, 'FINALIZE_PAYROLL', 'payroll', id, req);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          skipped.push({ employee: emp.full_name, reason: 'Already finalized' });
          continue;
        }
        throw error;
      }
    }
    logAction(req.user.id, 'RUN_MONTHLY_PAYROLL', 'payroll', null, req);
    return res.json({ success: true,
      message: `Monthly payroll finalized. Awaiting payment confirmation. (${processed.length} processed, ${skipped.length} skipped)`,
      processed: processed.length, skipped: skipped.length, details: { processed, skipped } });
  } catch (error) {
    return r01Error(res, error, 'Monthly payroll error:');
  }
});

app.put('/api/payroll/update-employee-salary/:employeeId', authenticateToken, requireAction('payroll:update-salary'), (req, res) => {
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
app.get('/api/payroll/access-logs', verifyPayrollAccess, allowRoles('hr_admin'),  (req, res) => {
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

app.get('/api/audit-logs', authenticateToken, allowRoles('admin'), (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const sql = `
    SELECT 
      al.id,
      al.user_id,
      al.action,
      al.target_type,
      al.target_id,
      al.old_value,
      al.new_value,
      al.ip_address,
      al.user_agent,
      DATE_FORMAT(al.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      u.email AS user_email,
      u.full_name AS user_name,
      u.role AS user_role
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.id DESC
    LIMIT 2000
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results || []);
  });
});

app.put('/api/users/:id/role', authenticateToken, requireAction('roles:assign'), async (req,res) => {
  const {role}=req.body||{};
  const userId=req.params.id;
  if (String(req.user.id)===String(userId)) return res.status(403).json({success:false,message:'You cannot change your own role.'});
  if (!['admin','hr_admin','security','instructor'].includes(role)) return res.status(400).json({success:false,message:'Invalid role assignment.'});
  try {
    const [rows]=await db.promise().query('SELECT id,role,status,password,employment_status FROM users WHERE id=? LIMIT 1',[userId]);
    if(!rows.length) return res.status(404).json({success:false,message:'Account not found.'});
    const target=rows[0];
    if (target.employment_status!=='active'||!target.password||!['active','pending_role'].includes(target.status)) {
      return res.status(409).json({success:false,message:'Role assignment requires active employment and provisioned credentials.'});
    }
    if (target.status==='pending_role'&&target.role!==null) return res.status(409).json({success:false,message:'Invalid pending role state.'});
    if (target.role===role&&target.status==='active') return res.json({success:true,message:'Role already assigned.'});
    if (target.role==='admin'&&role!=='admin') {
      const [[count]]=await db.promise().query("SELECT COUNT(*) AS total FROM users WHERE role='admin' AND status='active' AND employment_status='active' AND id<>?",[target.id]);
      if (!count.total) return res.status(403).json({success:false,message:'Cannot demote the last active System Administrator.'});
    }
    const [result]=await db.promise().query(
      "UPDATE users SET role=?,status=CASE WHEN status='pending_role' THEN 'active' ELSE status END WHERE id=? AND status=? AND (role <=> ?)",
      [role,target.id,target.status,target.role]);
    if(result.affectedRows!==1) return res.status(409).json({success:false,message:'Role changed concurrently. Reload and retry.'});
    logAction(req.user.id,'UPDATE_USER_ROLE','user',target.id,req,{role:target.role},{role});
    return res.json({success:true,message:'Role assigned successfully.',role});
  }catch(err){console.error('Role update:',err);return res.status(500).json({success:false,message:'Role update failed.'});}
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


const UV_CONFIG_DEFAULT_LOITER_MINUTES = 30;

const uvConfigInteger = (value, min, max) =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;

app.get(
  '/api/system-config',
  authenticateToken,
  allowRoles('admin'),
  async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'System Administrator access required.'
      });
    }

    try {
      
const [configRows] = await db.promise().query(
  `SELECT password_expiry_days,
          otp_expiry_minutes,
          geofence_default_radius,
          max_login_attempts
   FROM system_config
   WHERE id = 1
   LIMIT 1`
);

if (configRows.length !== 1) {
  return res.status(503).json({
    success: false,
    message: 'System configuration is not initialized.'
  });
}

const config = configRows[0];

const [settings] = await db.promise().query(
  `SELECT config_value
   FROM system_settings
   WHERE config_key = 'loiter_threshold_minutes'
   LIMIT 1`
);

      const loiter = settings.length
        ? Number(settings[0].config_value)
        : UV_CONFIG_DEFAULT_LOITER_MINUTES;

      return res.json({
        ...config,
        loiter_threshold_minutes: loiter
      });
    } catch (error) {
      console.error('System configuration retrieval failed:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve system configuration.'
      });
    }
  }
);

app.put(
  '/api/system-config',
  authenticateToken,
  requireAction('system:config'),
  async (req, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'System Administrator access required.'
      });
    }

    const {
      password_expiry_days,
      otp_expiry_minutes,
      geofence_default_radius,
      max_login_attempts,
      loiter_threshold_minutes
    } = req.body || {};

    const fields = [
      ['Password expiry', password_expiry_days, 0, 1095],
      ['OTP expiry', otp_expiry_minutes, 1, 15],
      ['Default geofence radius', geofence_default_radius, 50, 2000],
      ['Maximum login attempts', max_login_attempts, 1, 10],
      ['Loitering threshold', loiter_threshold_minutes, 1, 180]
    ];

    for (const [label, value, min, max] of fields) {
      if (!uvConfigInteger(value, min, max)) {
        return res.status(400).json({
          success: false,
          message: `${label} must be a whole number from ${min} to ${max}.`
        });
      }
    }

    let connection;
    let transactionStarted = false;

    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      const [oldRows] = await connection.query(
        `SELECT password_expiry_days,
                otp_expiry_minutes,
                geofence_default_radius,
                max_login_attempts
         FROM system_config
         WHERE id = 1
         FOR UPDATE`
      );

      if (oldRows.length !== 1) {
        const error = new Error(
          'System configuration is not initialized.'
        );
        error.httpStatus = 409;
        throw error;
      }

      const [oldLoiterRows] = await connection.query(
        `SELECT config_value
         FROM system_settings
         WHERE config_key = 'loiter_threshold_minutes'
         FOR UPDATE`
      );

      const previousValues = {
        ...oldRows[0],
        loiter_threshold_minutes: oldLoiterRows.length
          ? Number(oldLoiterRows[0].config_value)
          : UV_CONFIG_DEFAULT_LOITER_MINUTES
      };

      const [updated] = await connection.query(
        `UPDATE system_config
         SET password_expiry_days = ?,
             otp_expiry_minutes = ?,
             geofence_default_radius = ?,
             max_login_attempts = ?
         WHERE id = 1`,
        [
          password_expiry_days,
          otp_expiry_minutes,
          geofence_default_radius,
          max_login_attempts
        ]
      );

      if (updated.affectedRows !== 1) {
        const error = new Error(
          'The system configuration could not be updated.'
        );
        error.httpStatus = 409;
        throw error;
      }

      await connection.query(
        `INSERT INTO system_settings
           (config_key, config_value)
         VALUES ('loiter_threshold_minutes', ?)
         ON DUPLICATE KEY UPDATE
           config_value = VALUES(config_value)`,
        [loiter_threshold_minutes]
      );

      await connection.commit();
      transactionStarted = false;

      const savedValues = {
        password_expiry_days,
        otp_expiry_minutes,
        geofence_default_radius,
        max_login_attempts,
        loiter_threshold_minutes
      };

      systemConfigCache = {
        password_expiry_days,
        otp_expiry_minutes,
        geofence_default_radius,
        max_login_attempts
      };

      logAction(
        req.user.id,
        'UPDATE_SYSTEM_CONFIG',
        'system_config',
        1,
        req,
        previousValues,
        savedValues
      );

      return res.json({
        success: true,
        message: 'System configuration saved successfully.',
        config: savedValues
      });
    } catch (error) {
      if (transactionStarted && connection) {
        await connection.rollback().catch(console.error);
      }

      console.error('System configuration update failed:', error);

      return res.status(error.httpStatus || 500).json({
        success: false,
        message: error.httpStatus
          ? error.message
          : 'Unable to save system configuration.'
      });
    } finally {
      if (connection) connection.release();
    }
  }
);


app.get('/api/visitor-requests', authenticateToken, allowRoles('admin','security'), (req, res) => {
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


app.put('/api/visitor-requests/:id/arrive', authenticateToken, requireAction('visitors:checkin'), async (req, res) => {
  const requestId = Number(req.params.id);
  const { floor, destination, ble_id } = req.body || {};

  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid visitor request ID.' });
  }

  if (
    typeof destination !== 'string' ||
    !destination.trim() ||
    typeof ble_id !== 'string' ||
    !ble_id.trim() ||
    floor == null
  ) {
    return res.status(400).json({
      success: false,
      message: 'Floor, destination room, and BLE tag are required.'
    });
  }

  const cleanFloor = String(floor).trim();
  const cleanRoom = destination.trim();
  const cleanBleId = ble_id.trim();

  if (!(ALLOWED_ROOMS[cleanFloor] || []).includes(cleanRoom)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid destination room for the selected floor.'
    });
  }

  let connection;
  let visitorName;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const [tagRows] = await connection.query(
      'SELECT id FROM ble_tags WHERE ble_id = ? FOR UPDATE',
      [cleanBleId]
    );

    if (!tagRows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: `BLE Tag '${cleanBleId}' is not registered in the inventory.`
      });
    }

    const [reqRows] = await connection.query(
      `SELECT id, first_name, last_name, status, arrived, returned, no_show
       FROM visitor_requests
       WHERE id = ?
       FOR UPDATE`,
      [requestId]
    );

    if (!reqRows.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: 'Visitor request not found.'
      });
    }

    const visitor = reqRows[0];

    if (visitor.status !== 'APPROVED') {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Cannot check in. Appointment status is '${visitor.status}'.`
      });
    }

    if (Number(visitor.no_show) === 1) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'This appointment was marked No Show and cannot be checked in.'
      });
    }

    if (Number(visitor.returned) === 1) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'This visit was already completed. A new appointment is required.'
      });
    }

    if (Number(visitor.arrived) === 1) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Visitor is already checked in.'
      });
    }

    const [activeWithTag] = await connection.query(
      `SELECT id, first_name, last_name
       FROM visitor_requests
       WHERE ble_id = ?
         AND arrived = 1
         AND returned = 0
         AND no_show = 0
       LIMIT 1`,
      [cleanBleId]
    );

    if (activeWithTag.length) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: `Tag '${cleanBleId}' is currently in use by ${activeWithTag[0].first_name} ${activeWithTag[0].last_name}.`
      });
    }

    const [updated] = await connection.query(
      `UPDATE visitor_requests
       SET arrived = 1,
           arrived_at = NOW(),
           destination = ?,
           ble_id = ?,
           returned = 0,
           no_show = 0
       WHERE id = ?
         AND status = 'APPROVED'
         AND arrived = 0
         AND returned = 0
         AND no_show = 0`,
      [cleanRoom, cleanBleId, requestId]
    );

    if (updated.affectedRows !== 1) {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: 'Visitor check-in state changed. Refresh and try again.'
      });
    }

    visitorName = `${visitor.first_name} ${visitor.last_name || ''}`.trim();

    await connection.commit();

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (_) {}
    }

    console.error('Check-in error:', err);

    return res.status(500).json({
      success: false,
      message: 'Unable to complete visitor check-in.'
    });

  } finally {
    if (connection) connection.release();
  }

  logAction(req.user.id, 'VISITOR_ARRIVE', 'visitor_request', requestId, req);

  bleRoomCandidates.delete(cleanBleId);
  delete lastKnownVisitorsData[cleanBleId];
  delete visitorDestinations[cleanBleId];

  liveVisitors[cleanBleId] = {
    id: cleanBleId,
    visitorRequestId: requestId,
    name: visitorName,
    bleId: cleanBleId,
    floor: cleanFloor,
    currentRoom: 'Waiting for Scanner...',
    destination: cleanRoom,
    x: null,
    y: null,
    lastSeen: null,
    roomEnteredAt: null,
    loiterAlertSent: false,
    isDetected: false,
    isDisconnected: false,
    isPendingDetection: true,
    disconnectedAt: null,
    trackingStatus: 'awaiting_detection'
  };

  visitorDestinations[cleanBleId] = cleanRoom;

  broadcastToTrackingClients({
    type: 'location_update',
    visitor: liveVisitors[cleanBleId]
  });

  return res.json({
    success: true,
    message: 'Visitor checked in successfully. Awaiting first BLE scanner detection.',
    trackingStatus: 'awaiting_detection'
  });
});


app.put('/api/visitor-requests/:id/no-show', authenticateToken, allowRoles('security'), async (req, res) => {
  const requestId = Number(req.params.id);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid visitor request ID.' });
  }
  try {
    // Guard against simultaneous check-in and No Show requests; no active visit may be erased.
    const [result] = await db.promise().query(
      `UPDATE visitor_requests SET no_show = 1, no_show_at = NOW(), ble_id = NULL
       WHERE id = ? AND status = 'APPROVED' AND arrived = 0 AND returned = 0 AND no_show = 0`,
      [requestId]
    );
    if (result.affectedRows !== 1) {
      const [rows] = await db.promise().query('SELECT id FROM visitor_requests WHERE id = ?', [requestId]);
      return res.status(rows.length ? 409 : 404).json({ success: false, message: rows.length
        ? 'Cannot mark No Show: appointment is not approved, was already checked in, completed, or marked No Show.'
        : 'Visitor request not found.' });
    }
    logAction(req.user.id, 'VISITOR_NO_SHOW', 'visitor_request', requestId, req);
    return res.json({ success: true, message: 'Visitor marked as No Show.' });
  } catch (err) {
    console.error('Visitor No Show error:', err);
    return res.status(500).json({ success: false, message: 'Unable to update visitor No Show status.' });
  }
});

app.put('/api/visitor-requests/:id/destination', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'security') {
    return res.status(403).json({
      success: false,
      message: 'Only Admin or Security can re-route a visitor destination.'
    });
  }

  const { id } = req.params;
  const { destination, ble_id } = req.body;

  if (!destination || !destination.trim()) {
    return res.status(400).json({ success: false, message: "Destination room is required." });
  }

  const cleanRoom = destination.trim();

  const allKnownRooms = new Set([
    ...(ALLOWED_ROOMS['3'] || []),
    ...(ALLOWED_ROOMS['5'] || []),
  ]);

  if (!allKnownRooms.has(cleanRoom)) {
    return res.status(400).json({
      success: false,
      message: `Unknown destination room: "${cleanRoom}". Please pick one of the registered rooms.`
    });
  }

  try {
    const [rows] = await db.promise().query(
      "SELECT id, ble_id FROM visitor_requests WHERE id = ? OR ble_id = ?",
      [id, id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Visitor not found." });
    const vis = rows[0];
    const targetBle = ble_id || vis.ble_id;

    await db.promise().query(
      "UPDATE visitor_requests SET destination = ? WHERE id = ?",
      [cleanRoom, vis.id]
    );

    
    if (targetBle) {
      visitorDestinations[targetBle] = cleanRoom;
      if (liveVisitors[targetBle]) {
        liveVisitors[targetBle].destination = cleanRoom;
      }
    }

    logAction(req.user.id, 'UPDATE_VISITOR_DESTINATION', 'visitor_request', vis.id, req);
    res.json({ success: true, message: "Visitor destination re-routed successfully." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const GPS_STALE_SECONDS = 180;  
const GPS_ALERT_COOLDOWN_SECONDS = 300; 

app.post(
  '/api/instructor/location-permission',
  authenticateToken,
  async (req, res) => {
    if (req.user.role !== 'instructor') {
      return res.status(403).json({
        success: false,
        message: 'Instructor access required.'
      });
    }

    
const { state, reason, observed_at } = req.body || {};

const observedMs =
  typeof observed_at === 'string'
    ? Date.parse(observed_at)
    : NaN;

const reportAgeMs = Date.now() - observedMs;

// Require a recent device observation.
// Allow up to 30 seconds of device clock difference
// and up to 10 minutes of network delay.
if (
  !Number.isFinite(observedMs) ||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
    observed_at || ''
  )
) {
  return res.status(400).json({
    success: false,
    message: 'A valid location observation timestamp is required.'
  });
}

if (reportAgeMs < -30000 || reportAgeMs > 600000) {
  return res.json({
    success: true,
    ignored: true,
    reason: 'expired_observation',
    message: 'Outdated location report ignored.'
  });
}

const observedAtPH = getPHTimeFromDate(new Date(observedMs));


    const validReasons = [
      'permission_denied',
      'services_disabled'
    ];

    if (
      state !== 'disabled' ||
      !validReasons.includes(reason)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location permission report.'
      });
    }

    const { date: today } = getPHTime();
    const phNow = getPHDateTime();

    let connection;
    let transactionStarted = false;
    let employeeId;
    let fullName;
    let scheduleId;
    let schedulePlace;
    let changed = false;

    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      
const [users] = await connection.query(
  `SELECT id, employee_id, full_name
   FROM users
   WHERE id = ?
     AND role = 'instructor'
     AND status = 'active'
     AND employment_status = 'active'
   LIMIT 1
   FOR UPDATE`,
  [req.user.id]
);


      if (users.length !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(403).json({
          success: false,
          message: 'Active instructor account required.'
        });
      }

      employeeId = users[0].employee_id;
      fullName = users[0].full_name;

      
const [shifts] = await connection.query(
  `SELECT
      s.id,
      s.place
   FROM schedules s
   INNER JOIN attendance a
     ON a.schedule_id = s.id
    AND DATE(a.date) = DATE(s.date)
   WHERE (s.user_id = ? OR s.user_id = ?)
     AND (a.user_id = ? OR a.user_id = ?)
     AND a.time_in IS NOT NULL
     AND a.time_out IS NULL
     AND DATE(s.date) BETWEEN DATE_SUB(DATE(?), INTERVAL 1 DAY)
                          AND DATE(?)
   ORDER BY s.date DESC, s.start_time DESC, s.id DESC
   LIMIT 1`,
  [
    employeeId,
    req.user.id,
    employeeId,
    req.user.id,
    today,
    today
  ]
);

      if (!shifts.length) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message:
            'No active clocked-in shift was found for location monitoring.'
        });
      }

      scheduleId = shifts[0].id;
      schedulePlace = shifts[0].place;

const [newerGpsRows] = await connection.query(
  `SELECT id
   FROM instructor_location_tracking
   WHERE employee_id = ?
     AND schedule_id = ?
     AND location_enabled = 1
     AND NOT (
       latitude = 0
       AND longitude = 0
     )
     AND ping_time >= ?
   ORDER BY id DESC
   LIMIT 1`,
  [
    employeeId,
    scheduleId,
    observedAtPH
  ]
);

if (newerGpsRows.length > 0) {
  await connection.rollback();
  transactionStarted = false;

  return res.json({
    success: true,
    ignored: true,
    reason: 'newer_gps_recorded',
    message:
      'An equal or newer valid GPS observation already exists. ' +
      'The outdated location-disabled report was ignored.'
  });
}


      // Check the last recorded state for this specific shift.
      const [previousRows] = await connection.query(
        `SELECT id, location_enabled, location_name
         FROM instructor_location_tracking
         WHERE employee_id = ?
           AND schedule_id = ?
         ORDER BY id DESC
         LIMIT 1
         FOR UPDATE`,
        [employeeId, scheduleId]
      );

      const previous = previousRows[0];

      changed = !(
        previous &&
        Number(previous.location_enabled) === 0 &&
        previous.location_name === 'Location Disabled'
      );

      if (changed) {
        await connection.query(
          `INSERT INTO instructor_location_tracking
           (
             employee_id,
             schedule_id,
             latitude,
             longitude,
             location_name,
             is_inside_campus,
             location_enabled,
             ping_time
           )
           VALUES (?, ?, 0, 0, ?, 0, 0, ?)`,
          [
            employeeId,
            scheduleId,
            'Location Disabled',
            phNow
          ]
        );
      }

      await connection.query(
        `UPDATE users
         SET location_tracking_enabled = 0
         WHERE id = ?`,
        [req.user.id]
      );

      await connection.commit();
      transactionStarted = false;

      if (changed) {
  const message = reason === 'permission_denied'
    ? 'Location permission disabled (reported by device)'
    : 'Location services disabled (reported by device)';

  try {
    await insertAndBroadcastAlert(message, {
      employeeId,
      fullName,
      scheduleId,
      locationName: schedulePlace || 'Unavailable',
      latitude: null,
      longitude: null
    });
  } catch (notificationError) {
    console.error(
      'Post-commit location notification failed:',
      notificationError
    );
  }
}

      // Broadcasting is secondary to the saved state.
      try {
        await broadcastInstructorStatus(employeeId);
      } catch (broadcastError) {
        console.error(
          'Location-status broadcast failed:',
          broadcastError
        );
      }

      return res.json({
        success: true,
        gps_status: 'Location Disabled',
        reason,
        changed
      });

    } catch (error) {
      if (transactionStarted && connection) {
        await connection.rollback().catch(console.error);
      }

      console.error(
        'Location-permission reporting failed:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Unable to record location permission state.'
      });

    } finally {
      if (connection) connection.release();
    }
  }
);

app.post('/api/instructor/location', authenticateToken, async (req, res) => {
  if (req.user.role !== 'instructor') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const {
    latitude,
    longitude,
    location_enabled,
    gps_accuracy,
    gps_timestamp
  } = req.body || {};

  const userId = req.user.id;

  const isLocEnabled = (
    location_enabled === true ||
    location_enabled === 'true' ||
    location_enabled === 1 ||
    location_enabled === '1'
  );

  const phNow = getPHDateTime();
  const { date: today, time: currentTime } = getPHTime();

  // Validate GPS values without accepting partially numeric strings.
  const parsedLat = Number(latitude);
  const parsedLon = Number(longitude);

  const hasCoordinates =
    latitude !== undefined &&
    latitude !== null &&
    longitude !== undefined &&
    longitude !== null &&
    String(latitude).trim() !== '' &&
    String(longitude).trim() !== '';

  const coordinatesValid =
    hasCoordinates &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLon) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLon >= -180 &&
    parsedLon <= 180 &&
    !(parsedLat === 0 && parsedLon === 0);

  try {
    // =====================================================
    // 1. VALIDATE AUTHENTICATED INSTRUCTOR
    // =====================================================
    const [userRows] = await db.promise().query(
      `SELECT id, employee_id, full_name,
              location_tracking_enabled
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    const employeeId = userRows[0].employee_id;
    const fullName = userRows[0].full_name;

    // =====================================================
    // 2. FIND THE CURRENT SCHEDULE
    // =====================================================
    const [scheduleRows] = await db.promise().query(
      `SELECT
         s.id,
         s.place,
         s.start_time,
         s.end_time,
         a.time_in,
         a.time_out
       FROM schedules s
       LEFT JOIN attendance a
         ON s.id = a.schedule_id
         AND a.date = s.date
       WHERE (s.user_id = ? OR s.user_id = ?)
         AND s.date = ?
         AND (
           (? BETWEEN SUBTIME(s.start_time, '00:30:00')
                         AND s.end_time)
           OR (
             a.time_in IS NOT NULL
             AND a.time_out IS NULL
           )
         )
       ORDER BY
         CASE
           WHEN a.time_in IS NOT NULL
            AND a.time_out IS NULL
           THEN 0
           ELSE 1
         END,
         s.start_time ASC
       LIMIT 1`,
      [employeeId, userId, today, currentTime]
    );

    const currentSchedule = scheduleRows[0];

    if (!currentSchedule) {
      return res.json({
        success: false,
        message: 'No active shift today'
      });
    }

    // =====================================================
    // 3. CHECK SHIFT END
    // =====================================================
    if (currentTime > currentSchedule.end_time) {
      await db.promise().query(
        `UPDATE users
         SET location_tracking_enabled = 0
         WHERE employee_id = ? OR id = ?`,
        [employeeId, userId]
      );

      gpsStates.delete(employeeId);
      campusStates.delete(employeeId);

      await broadcastInstructorStatus(employeeId);

      return res.json({
        success: false,
        message: 'Shift has ended. Location tracking closed.'
      });
    }

    const isOnDuty =
      currentSchedule.time_in != null &&
      currentSchedule.time_out == null;

    // =====================================================
    // 4. VALIDATE GPS COORDINATES AND MEASUREMENT QUALITY
    // =====================================================
    if (isLocEnabled) {
      if (!coordinatesValid) {
        return res.status(422).json({
          success: false,
          code: 'INVALID_COORDINATES',
          message: 'Valid GPS coordinates are required.'
        });
      }

      const hasAccuracy =
        gps_accuracy !== undefined &&
        gps_accuracy !== null;

      const hasTimestamp =
        gps_timestamp !== undefined &&
        gps_timestamp !== null;

      // Preserve compatibility with older mobile APKs
      // that do not send either GPS quality field.
      if (hasAccuracy !== hasTimestamp) {
        return res.status(422).json({
          success: false,
          code: 'INCOMPLETE_GPS_QUALITY',
          message:
            'GPS accuracy and measurement timestamp must be provided together.'
        });
      }

      if (hasAccuracy && hasTimestamp) {
        const accuracy = Number(gps_accuracy);
        const measuredAt = Date.parse(gps_timestamp);
        const ageMs = Date.now() - measuredAt;

        const accuracyValid =
          String(gps_accuracy).trim() !== '' &&
          Number.isFinite(accuracy) &&
          accuracy >= 0 &&
          accuracy <= 100;

        const timestampValid =
          typeof gps_timestamp === 'string' &&
          gps_timestamp.trim() !== '' &&
          Number.isFinite(measuredAt) &&
          ageMs >= -10000 &&
          ageMs <= 60000;

        if (!accuracyValid || !timestampValid) {
          return res.status(422).json({
            success: false,
            code: 'LOW_QUALITY_GPS',
            message:
              'GPS location is inaccurate or outdated. Please retry.'
          });
        }
      }
    }

    // =====================================================
    // 5. VALIDATE ASSIGNED CAMPUS GEOFENCE
    // =====================================================
    let isInside = false;
    let resolvedLocationName = 'GPS Disabled';

    if (isLocEnabled) {
      const [locRows] = await db.promise().query(
        `SELECT latitude, longitude, radius
         FROM school_locations
         WHERE name = ?
         LIMIT 1`,
        [currentSchedule.place]
      );

      if (locRows.length === 0) {
        return res.status(409).json({
          success: false,
          code: 'GEOFENCE_NOT_CONFIGURED',
          message:
            'The assigned campus geofence is not configured. Contact HR.'
        });
      }

      const campus = locRows[0];

      const campusLat = Number(campus.latitude);
      const campusLon = Number(campus.longitude);
      const campusRadius = Number(campus.radius);

      const campusValid =
        Number.isFinite(campusLat) &&
        Number.isFinite(campusLon) &&
        campusLat >= -90 &&
        campusLat <= 90 &&
        campusLon >= -180 &&
        campusLon <= 180 &&
        Number.isFinite(campusRadius) &&
        campusRadius > 0;

      if (!campusValid) {
        return res.status(409).json({
          success: false,
          code: 'INVALID_GEOFENCE',
          message:
            'The assigned campus has invalid geofence settings. Contact HR.'
        });
      }

      const distance = getDistanceFromLatLonInMeters(
        parsedLat,
        parsedLon,
        campusLat,
        campusLon
      );

      if (!Number.isFinite(distance)) {
        return res.status(422).json({
          success: false,
          code: 'INVALID_DISTANCE',
          message: 'Unable to validate the GPS position.'
        });
      }

      isInside = distance <= campusRadius;

      resolvedLocationName = isInside
        ? currentSchedule.place
        : 'Outside Campus Perimeter';

    } else {
  isInside = false;

  const [latestState] = await db.promise().query(
    `SELECT location_name, location_enabled
     FROM instructor_location_tracking
     WHERE employee_id = ?
       AND schedule_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [employeeId, currentSchedule.id]
  );

  const explicitlyDisabled =
    latestState[0]?.location_name === 'Location Disabled' &&
    Number(latestState[0]?.location_enabled) === 0;

  resolvedLocationName = explicitlyDisabled
    ? 'Location Disabled'
    : 'GPS Disabled';
}

    const [lastRec] = await db.promise().query(
  `SELECT
     schedule_id,
     location_enabled,
     is_inside_campus,
     location_name,
     ping_time
   FROM instructor_location_tracking
   WHERE employee_id = ?
     AND schedule_id = ?
   ORDER BY id DESC
   LIMIT 1`,
  [employeeId, currentSchedule.id]
);

    const previous = lastRec[0] || null;


const locationPermissionWasDisabled =
  previous?.location_name === 'Location Disabled' &&
  Number(previous?.location_enabled) === 0;


    const lastGpsState = previous
      ? Number(previous.location_enabled) === 1 ? 1 : 0
      : null;

    const [lastCampusRec] = await db.promise().query(
      `SELECT is_inside_campus
       FROM instructor_location_tracking
       WHERE employee_id = ?
         AND schedule_id = ?
         AND location_enabled = 1
       ORDER BY id DESC
       LIMIT 1`,
      [employeeId, currentSchedule.id]
    );

    const lastInsideState = lastCampusRec.length
      ? Number(lastCampusRec[0].is_inside_campus) === 1 ? 1 : 0
      : null;

    let signalWasLost = false;

    
    const previousPingAt = previous?.ping_time;

    const previousPingMs =
      previousPingAt instanceof Date
        ? previousPingAt.getTime()
        : previousPingAt
          ? parsePHTMillis(previousPingAt)
          : NaN;


    if (
      isOnDuty &&
      isLocEnabled &&
      Number.isFinite(previousPingMs) &&
      Date.now() - previousPingMs > GPS_STALE_SECONDS * 1000
    ) {
      const [lossAlerts] = await db.promise().query(
        `SELECT id
         FROM location_alerts
         WHERE employee_id = ?
           AND schedule_id = ?
           AND alert_message = 'Location signal lost'
           AND created_at >= ?
         ORDER BY id DESC
         LIMIT 1`,
        [
          employeeId,
          currentSchedule.id,
          previousPingAt
        ]
      );

      signalWasLost = lossAlerts.length > 0;
    }


const storedLat = isLocEnabled ? parsedLat : 0;
const storedLon = isLocEnabled ? parsedLon : 0;


const locationConnection =
  await db.promise().getConnection();

let locationTransactionStarted = false;

try {
  await locationConnection.beginTransaction();
  locationTransactionStarted = true;

  const [lockedUsers] = await locationConnection.query(
    `SELECT id
     FROM users
     WHERE id = ?
       AND role = 'instructor'
       AND status = 'active'
       AND employment_status = 'active'
     FOR UPDATE`,
    [userId]
  );

  if (lockedUsers.length !== 1) {
    throw new Error(
      'Instructor account became unavailable.'
    );
  }

  await locationConnection.query(
    `INSERT INTO instructor_location_tracking
     (
       employee_id,
       schedule_id,
       latitude,
       longitude,
       location_name,
       is_inside_campus,
       location_enabled,
       ping_time
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      employeeId,
      currentSchedule.id,
      storedLat,
      storedLon,
      resolvedLocationName,
      isInside ? 1 : 0,
      isLocEnabled ? 1 : 0,
      phNow
    ]
  );

  await locationConnection.query(
    `UPDATE users
     SET last_location_ping = ?,
         location_tracking_enabled = ?
     WHERE id = ?`,
    [
      phNow,
      isLocEnabled ? 1 : 0,
      userId
    ]
  );

  await locationConnection.commit();
  locationTransactionStarted = false;

} catch (locationWriteError) {
  if (locationTransactionStarted) {
    await locationConnection.rollback().catch(
      rollbackError => {
        console.error(
          'Location transaction rollback failed:',
          rollbackError
        );
      }
    );
  }

  throw locationWriteError;

} finally {
  locationConnection.release();
}

    if (isOnDuty) {
      const nowMs = Date.now();
      const currentGps = isLocEnabled ? 1 : 0;
      const currentInside = isInside ? 1 : 0;

      const alertContext = {
        employeeId,
        fullName,
        scheduleId: currentSchedule.id,
        locationName: resolvedLocationName,
        latitude: isLocEnabled ? parsedLat : null,
        longitude: isLocEnabled ? parsedLon : null
      };

      const advanceTransition = async (
        stateMap,
        currentValue,
        previousValue,
        messageForState,
        enabledForDetection = true
      ) => {
        const existing = stateMap.get(employeeId);

        let state;

        if (
          !existing ||
          existing.scheduleId !== currentSchedule.id
        ) {
          state = {
            scheduleId: currentSchedule.id,
            stable: previousValue !== null
              ? previousValue
              : currentValue,
            pending: null,
            pendingSince: 0
          };
        } else {
          state = existing;
        }

        if (!enabledForDetection) {
          state.pending = null;
          state.pendingSince = 0;
          stateMap.set(employeeId, state);
          return;
        }

        if (state.stable === currentValue) {
          state.pending = null;
          state.pendingSince = 0;

        } else if (state.pending !== currentValue) {
          state.pending = currentValue;
          state.pendingSince = nowMs;

        } else if (
          nowMs - state.pendingSince >= GPS_GRACE_MS
        ) {
          const transitionAt = new Date(state.pendingSince);

          state.stable = currentValue;
          state.pending = null;
          state.pendingSince = 0;

          await insertAndBroadcastAlert(
            messageForState(currentValue),
            alertContext,
            transitionAt
          );
        }

        stateMap.set(employeeId, state);
      };

      // -----------------------------------------
      // 9A. GPS ON / OFF transitions
      // -----------------------------------------
      await advanceTransition(
        gpsStates,
        currentGps,
        lastGpsState,
        value => value === 1
          ? 'GPS turned ON'
          : 'GPS turned OFF'
      );

      // -----------------------------------------
      // 9B. Campus entry / exit transitions
      // -----------------------------------------
      if (isLocEnabled) {
        await advanceTransition(
          campusStates,
          currentInside,
          lastInsideState,
          value => value === 1
            ? 'Entered campus perimeter'
            : 'Went outside campus perimeter'
        );
      } else {
        // Do not generate a campus-exit event just
        // because GPS has been disabled.
        const campusState = campusStates.get(employeeId);

        if (campusState) {
          campusState.pending = null;
          campusState.pendingSince = 0;
          campusStates.set(employeeId, campusState);
        }
      }

    } else {
      gpsStates.delete(employeeId);
      campusStates.delete(employeeId);
    }

if (
  isOnDuty &&
  isLocEnabled &&
  locationPermissionWasDisabled
) {
  await insertAndBroadcastAlert(
    'Location permission restored (reported by device)',
    {
      employeeId,
      fullName,
      scheduleId: currentSchedule.id,
      locationName: resolvedLocationName,
      latitude: parsedLat,
      longitude: parsedLon
    }
  );
}

    if (signalWasLost && isLocEnabled) {
      await insertAndBroadcastAlert(
        'Location signal restored',
        {
          employeeId,
          fullName,
          scheduleId: currentSchedule.id,
          locationName: resolvedLocationName,
          latitude: parsedLat,
          longitude: parsedLon
        }
      );
    }

    await broadcastInstructorStatus(employeeId);

    return res.json({
      success: true,
      isInside,
      inShift: true,
      location_name: resolvedLocationName,
      gps_status: isLocEnabled ? 'GPS ON' : 'GPS OFF'
    });

    
  } catch (err) {
    console.error('Location update error:', err);

    return res.status(500).json({
      success: false,
      error: 'Failed to process instructor location update.'
    });
  }
});


app.get('/api/location-tracking/suspicious', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const targetDate = req.query.date || getPHTime().date;

  try {
    const [rows] = await db.promise().query(
      `SELECT
         al.id,
         al.user_id,
         u.employee_id,
         u.full_name,
         al.new_value,
         DATE_FORMAT(al.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM audit_logs al
       JOIN users u ON u.id = al.user_id
       WHERE al.action = 'SUSPICIOUS_LOCATION'
         AND DATE(al.created_at) = ?
       ORDER BY al.id DESC
       LIMIT 500`,
      [targetDate]
    );

    const formatted = rows.map((r) => {
      let parsed = {};
      try {
        parsed = typeof r.new_value === 'string'
          ? JSON.parse(r.new_value)
          : (r.new_value || {});
      } catch (e) {
        parsed = {};
      }
      return {
        id: r.id,
        user_id: r.user_id,
        employee_id: r.employee_id,
        full_name: r.full_name,
        event: parsed.event || 'unknown',
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        lat: parsed.lat ?? null,
        lon: parsed.lon ?? null,
        created_at: r.created_at,
      };
    });

    res.json(formatted);
  } catch (err) {
    console.error('Suspicious locations fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/location-tracking/status', authenticateToken, async (req, res) => {
  if (!['admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const selectedDate = req.query.date || getPHTime().date;
  if (!isValidISOCalendarDate(selectedDate)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid tracking date.'
    });
  }

  const phNow = getPHDateTime();

  try {
    const [rows] = await db.promise().query(`
      SELECT
        u.employee_id, u.full_name, u.location_tracking_enabled,
        s.id AS schedule_id, s.place AS schedule_place,
        s.course AS schedule_course, s.start_time, s.end_time,
        a.time_in, a.time_out,

        COALESCE(a.status,
          CASE
            WHEN CONCAT(s.date, ' ', s.end_time) < ?
              AND a.time_in IS NULL THEN 'Missed Schedule'
            WHEN CONCAT(s.date, ' ', s.start_time) <= ?
              AND CONCAT(s.date, ' ', s.end_time) >= ?
              AND a.time_in IS NULL THEN 'Not Clocked In'
            ELSE 'Scheduled'
          END
        ) AS attendance_status,

        CASE
          WHEN a.time_in IS NULL OR a.time_out IS NOT NULL
            THEN 'Unavailable'
          
WHEN ilt.ping_time IS NULL
  THEN 'Unavailable'
WHEN ilt.location_enabled = 0
     AND ilt.location_name = 'Location Disabled'
  THEN 'Location Disabled'
WHEN ilt.location_enabled = 0
  THEN 'GPS Disabled'
WHEN u.location_tracking_enabled = 0
  THEN 'Unavailable'

          WHEN TIMESTAMPDIFF(SECOND, ilt.ping_time, ?) > ?
            THEN 'Signal Lost'
          ELSE COALESCE(ilt.location_name, 'Unavailable')
        END AS last_position_name,

        CASE
          WHEN a.time_in IS NULL OR a.time_out IS NOT NULL THEN NULL
          WHEN ilt.ping_time IS NULL OR ilt.location_enabled = 0 THEN NULL
          WHEN u.location_tracking_enabled = 0 THEN NULL
          WHEN TIMESTAMPDIFF(SECOND, ilt.ping_time, ?) > ? THEN NULL
          ELSE ilt.is_inside_campus
        END AS last_is_inside,

        ilt.ping_time AS last_ping_time,

        CASE
          WHEN a.time_in IS NULL OR a.time_out IS NOT NULL
            OR CONCAT(s.date, ' ', s.end_time) < ? THEN 'GPS OFF'
          
WHEN ilt.ping_time IS NULL THEN 'Unavailable'
WHEN ilt.location_enabled = 0
     AND ilt.location_name = 'Location Disabled'
  THEN 'Location Disabled'
WHEN ilt.location_enabled = 0
  THEN 'GPS Disabled'
WHEN u.location_tracking_enabled = 0
  THEN 'Unavailable'

          WHEN TIMESTAMPDIFF(SECOND, ilt.ping_time, ?) > ?
            THEN 'Signal Lost'
          ELSE 'GPS ON'
        END AS gps_status,

        COALESCE(
          a.time_in,
          (SELECT DATE_FORMAT(MIN(ping_time), '%H:%i:%s')
           FROM instructor_location_tracking
           WHERE employee_id = u.employee_id
             AND schedule_id = s.id
             AND is_inside_campus = 1
             AND ping_time >= CONCAT(s.date, ' ', s.start_time) - INTERVAL 1 HOUR)
        ) AS campus_entry_time,

        COALESCE(a.time_out, ${GEO_EXIT_SUBQUERY}) AS campus_exit_time

      FROM users u
      INNER JOIN schedules s
        ON (u.employee_id = s.user_id OR u.id = s.user_id)
      LEFT JOIN attendance a
        ON s.id = a.schedule_id AND a.date = s.date
      LEFT JOIN instructor_location_tracking ilt
        ON ilt.id = (
          SELECT MAX(t.id)
          FROM instructor_location_tracking t
          WHERE t.employee_id = u.employee_id
            AND t.schedule_id = s.id
        )
      WHERE u.role = 'instructor'
        AND u.status = 'active'
        AND s.date = ?
      ORDER BY s.start_time ASC
    `, [
      phNow, phNow, phNow,               
      phNow, GPS_STALE_SECONDS,          
      phNow, GPS_STALE_SECONDS,          
      phNow, phNow, GPS_STALE_SECONDS,   
      selectedDate                      
    ]);

    return res.json(rows);
  } catch (err) {
    console.error('Location tracking status error:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load location tracking status.'
    });
  }
});



app.get('/api/location-tracking/instructor-timeline/:employeeId', authenticateToken, async (req, res) => {
  if (!['admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { employeeId } = req.params;
  const targetDate = req.query.date || getPHTime().date;
  const rawScheduleId = req.query.schedule_id;
  const scheduleId = rawScheduleId == null || rawScheduleId === ''
    ? null
    : Number(rawScheduleId);

  if (!isValidISOCalendarDate(targetDate)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid timeline date.'
    });
  }

  if (
    scheduleId !== null &&
    (!Number.isSafeInteger(scheduleId) || scheduleId < 1)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid schedule ID.'
    });
  }

  try {
    // Associate telemetry with the assigned schedule date,
    // not simply the calendar date when a ping arrived.
    const [rows] = await db.promise().query(`
      SELECT
        t.id, t.schedule_id, t.ping_time,
        t.location_enabled, t.is_inside_campus,
        t.location_name, t.latitude, t.longitude
      FROM instructor_location_tracking t
      INNER JOIN schedules s ON s.id = t.schedule_id
      WHERE t.employee_id = ?
        AND s.date = ?
        AND (? IS NULL OR s.id = ?)
      ORDER BY t.id ASC
      LIMIT 5000
    `, [employeeId, targetDate, scheduleId, scheduleId]);

    const [alerts] = await db.promise().query(`
      SELECT
        la.id, la.schedule_id, la.alert_message,
        DATE_FORMAT(la.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM location_alerts la
      INNER JOIN schedules s ON s.id = la.schedule_id
      WHERE la.employee_id = ?
        AND s.date = ?
        AND (? IS NULL OR la.schedule_id = ?)
      ORDER BY la.id ASC
      LIMIT 5000
    `, [employeeId, targetDate, scheduleId, scheduleId]);

    const [schedules] = await db.promise().query(`
      SELECT s.id, s.start_time, s.end_time
      FROM schedules s
      INNER JOIN users u
        ON (s.user_id = u.employee_id OR s.user_id = u.id)
      WHERE u.employee_id = ?
        AND s.date = ?
        AND (? IS NULL OR s.id = ?)
      ORDER BY s.start_time ASC
      LIMIT 1
    `, [employeeId, targetDate, scheduleId, scheduleId]);

    return res.json({
      timeline: rows,
      alerts: alerts.map(alert => ({
        ...alert,
        ...classifyLocationAlert(alert.alert_message)
      })),
      start_time: schedules[0]?.start_time ?? null,
      end_time: schedules[0]?.end_time ?? null
    });
  } catch (err) {
    console.error('Location timeline error:', err);
    return res.status(500).json({
      success: false,
      message: 'Unable to load location timeline.'
    });
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
        s.place AS location_name,
        DATE_FORMAT(la.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM location_alerts la
      JOIN users u ON (la.employee_id = u.employee_id OR la.employee_id = u.id)
      LEFT JOIN schedules s ON s.id = la.schedule_id
      WHERE DATE(la.created_at) = ? OR DATE(CONVERT_TZ(la.created_at, '+00:00', '+08:00')) = ?
      ORDER BY la.id DESC
    `;

    const [rows] = await db.promise().query(sql, [targetDate, targetDate]);
    
const classifiedAlerts = rows.map((alert) => {
  const classification = classifyLocationAlert(
    alert.alert_message
  );

  return {
    ...alert,
    category: classification.category,
    severity: classification.severity
  };
});

res.json(classifiedAlerts);

  } catch (err) {
    console.error("Alert fetch error:", err);
    res.status(500).json({ error: err.message });
  }
});

const broadcastToTrackingClients = (data) => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.user && 
        ['admin', 'hr_admin', 'security'].includes(client.user.role)) {
      client.send(JSON.stringify(data));
    }
  });
};


const classifyLocationAlert = (message) => {
  const value = String(message || '').trim().toLowerCase();

  switch (value) {
    case 'gps turned on':
    case 'location signal restored':
      case 'location permission restored (reported by device)':
  return {
    category: 'GPS Status',
    severity: 'information'
  };

case 'gps turned off':
case 'location signal lost':
case 'location permission disabled (reported by device)':
case 'location services disabled (reported by device)':
  return {
    category: 'GPS Status',
    severity: 'warning'
  };

    case 'entered campus perimeter':
    case 'entered campus':
      return { category: 'Geofence', severity: 'information' };

    case 'went outside campus perimeter':
      return { category: 'Geofence', severity: 'warning' };

    default:
      if (
        value.includes('suspicious') ||
        value.includes('impossible travel') ||
        value.includes('mock location')
      ) {
        return {
          category: 'Suspicious Activity',
          severity: 'requires_review'
        };
      }

      return { category: 'Other', severity: 'information' };
  }
};


async function insertAndBroadcastAlert(
  alertMsg,
  context,
  eventDate = null
) {
  try {
    const alertTime = eventDate
      ? getPHTimeFromDate(eventDate)
      : getPHDateTime();

    const classification = classifyLocationAlert(alertMsg);

    const lat =
      context.latitude !== undefined &&
      context.latitude !== null &&
      Number.isFinite(Number(context.latitude)) &&
      Number(context.latitude) >= -90 &&
      Number(context.latitude) <= 90
        ? Number(context.latitude)
        : null;

    const lon =
      context.longitude !== undefined &&
      context.longitude !== null &&
      Number.isFinite(Number(context.longitude)) &&
      Number(context.longitude) >= -180 &&
      Number(context.longitude) <= 180
        ? Number(context.longitude)
        : null;

    const [result] = await db.promise().query(
      `INSERT INTO location_alerts
       (
         employee_id,
         schedule_id,
         alert_message,
         latitude,
         longitude,
         created_at
       )
       SELECT ?, ?, ?, ?, ?, ?
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1
         FROM location_alerts
         WHERE employee_id = ?
           AND alert_message = ?
           AND created_at > DATE_SUB(
             STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s'),
             INTERVAL ? SECOND
           )
       )`,
      [
        context.employeeId,
        context.scheduleId ?? null,
        alertMsg,
        lat,
        lon,
        alertTime,
        context.employeeId,
        alertMsg,
        alertTime,
        GPS_ALERT_COOLDOWN_SECONDS
      ]
    );

    if (result.affectedRows === 0) {
      return;
    }

    const alert = {
      id: result.insertId,
      employee_id: context.employeeId,
      full_name: context.fullName,
      alert_message: alertMsg,
      category: classification.category,
      severity: classification.severity,
      location_name: context.locationName || 'Unavailable',
      created_at: alertTime
    };

    broadcastToAdminAndHR({
      type: 'new_alert',
      alert
    });

  } catch (err) {
    console.error(
      'Failed to insert or broadcast location alert:',
      err
    );
  }
}




// LOCATION SIGNAL WATCHDOG
// Missing telemetry is NOT proof that GPS was disabled.


setInterval(async () => {
  try {
    const phNow = getPHDateTime();
    const { date: today, time: currentTime } = getPHTime();

    const [offlineInstructors] = await db.promise().query(
      `SELECT
         u.id,
         u.employee_id,
         u.full_name,
         u.last_location_ping,
         s.id AS schedule_id,
         s.place
       FROM users u
       INNER JOIN schedules s
         ON (
           u.employee_id = s.user_id
           OR u.id = s.user_id
         )
         AND s.date = ?
       INNER JOIN attendance a
         ON a.schedule_id = s.id
         AND a.date = s.date
       WHERE u.role = 'instructor'
         AND u.status = 'active'
         AND u.location_tracking_enabled = 1
         AND a.time_in IS NOT NULL
         AND a.time_out IS NULL
         AND u.last_location_ping IS NOT NULL
         AND s.end_time >= ?
         AND TIMESTAMPDIFF(
           SECOND,
           u.last_location_ping,
           ?
         ) > ?`,
      [
        today,
        currentTime,
        phNow,
        GPS_STALE_SECONDS
      ]
    );

    for (const instructor of offlineInstructors) {
      // Create at most one signal-loss event for
      // the uninterrupted outage after the last ping.
      const [existing] = await db.promise().query(
        `SELECT id
         FROM location_alerts
         WHERE employee_id = ?
           AND alert_message = 'Location signal lost'
           AND created_at >= ?
         LIMIT 1`,
        [
          instructor.employee_id,
          instructor.last_location_ping
        ]
      );

      if (existing.length > 0) {
        continue;
      }

      await insertAndBroadcastAlert(
        'Location signal lost',
        {
          employeeId: instructor.employee_id,
          fullName: instructor.full_name,
          scheduleId: instructor.schedule_id,
          locationName: instructor.place || 'Unavailable',
          latitude: null,
          longitude: null
        }
      );

      await broadcastInstructorStatus(
        instructor.employee_id
      );
    }
  } catch (error) {
    console.error(
      'Location signal watchdog error:',
      error
    );
  }
}, 20000);



const REPORT_EVIDENCE_TYPES = Object.freeze([
  'instructor',
  'visitor',
  'activity'
]);

const REPORT_VISITOR_INCIDENT_PATTERN =
  /incident|emergency|evacuat|missing|lost|distress|sos|alert|panic/i;

// 1. CHECK REPORT ACCESS


const canReadTrackingEvidence = (role, type) => {
  if (type === 'instructor') {
    return ACTION_ROLES['reports:instructor:view'].includes(role);
  }

  if (type === 'visitor' || type === 'activity') {
    return ACTION_ROLES['reports:visitor:view'].includes(role);
  }

  return false;
};

const evidenceText = (value, fallback = '—') =>
  value === null || value === undefined || value === ''
    ? fallback
    : String(value);


// 2. RETRIEVE REPORT EVIDENCE

const buildTrackingEvidence = async (type, day) => {

  
  if (type === 'instructor') {

    const [alerts] = await db.promise().query(
      `SELECT
         la.id,
         la.employee_id,
         u.full_name,
         s.place AS location_name,
         la.alert_message,
         DATE_FORMAT(
           la.created_at, '%Y-%m-%d %H:%i:%s'
         ) AS created_at
       FROM location_alerts la
       JOIN users u
         ON u.employee_id = la.employee_id
       LEFT JOIN schedules s
         ON s.id = la.schedule_id
       WHERE DATE(la.created_at) = ?
       ORDER BY la.id DESC
       LIMIT 500`,
      [day]
    );

    const [flags] = await db.promise().query(
      `SELECT
         al.id,
         u.employee_id,
         u.full_name,
         al.new_value,
         DATE_FORMAT(
           al.created_at, '%Y-%m-%d %H:%i:%s'
         ) AS created_at
       FROM audit_logs al
       JOIN users u
         ON u.id = al.user_id
       WHERE al.action = 'SUSPICIOUS_LOCATION'
         AND DATE(al.created_at) = ?
       ORDER BY al.id DESC
       LIMIT 500`,
      [day]
    );

    const ordinary = alerts.map(row => {
      const classification = classifyLocationAlert(
        row.alert_message
      );

      return {
        key: `gps-${row.id}`,
        id: row.id,
        subject: evidenceText(
          row.full_name || row.employee_id
        ),
        reference: evidenceText(row.employee_id),
        date: row.created_at,
        category: classification.category,
        severity: classification.severity,
        description: evidenceText(row.alert_message),
        location: evidenceText(row.location_name),
        origin: 'GPS monitoring alert',
        verified: false
      };
    });

    const suspicious = flags.map(row => {
      let payload = {};

      try {
        payload = typeof row.new_value === 'string'
          ? JSON.parse(row.new_value)
          : (row.new_value || {});
      } catch (_) {
        payload = {};
      }

      const flagDescriptions = Array.isArray(payload.flags)
        ? payload.flags.map(flag =>
            `${evidenceText(flag.reason, 'Flag')}${
              flag.detail ? ` — ${flag.detail}` : ''
            }`
          )
        : [];

      return {
        key: `flag-${row.id}`,
        id: row.id,
        subject: evidenceText(
          row.full_name || row.employee_id
        ),
        reference: evidenceText(row.employee_id),
        date: row.created_at,
        category: 'Suspicious Activity',
        severity: 'requires_review',
        description:
          flagDescriptions.join('; ') ||
          'Automated location anomaly flagged for review',
        location:
          payload.lat != null && payload.lon != null
            ? `${payload.lat}, ${payload.lon}`
            : 'Unavailable',
        origin: 'System audit flag',
        verified: false
      };
    });

    return [...ordinary, ...suspicious];
  }

  // VISITOR BLE TRACKING REPORTS
  const [rows] = await db.promise().query(
    `SELECT
       id,
       visitor_name,
       ble_id,
       floor,
       current_room,
       event_type,
       DATE_FORMAT(
         created_at, '%Y-%m-%d %H:%i:%s'
       ) AS created_at
     FROM visitor_history
     WHERE DATE(created_at) = ?
     ORDER BY id DESC
     LIMIT 500`,
    [day]
  );

  const records = rows.map(row => ({
    key: `visitor-${row.id}`,
    id: row.id,
    subject: evidenceText(row.visitor_name),
    reference: evidenceText(
      row.ble_id,
      'No tag specified'
    ),
    date: row.created_at,
    category: 'Visitor BLE Tracking',

    severity: REPORT_VISITOR_INCIDENT_PATTERN.test(
      String(row.event_type || '')
    )
      ? 'requires_review'
      : 'information',

    description: evidenceText(
      row.event_type,
      'Tracking observation'
    ),

    location:
      [
        row.floor != null && `Floor ${row.floor}`,
        row.current_room
      ].filter(Boolean).join(' / ') || 'Unavailable',

    origin: 'Visitor tracking history',
    verified: false
  }));

  // Only explicitly incident-related visitor records.
  if (type === 'visitor') {
    return records.filter(
      record => record.severity === 'requires_review'
    );
  }

  // Full visitor tracking activity report.
  return records;
};


// 3. VALIDATE REPORT TYPE, DATE AND USER ROLE

const validateEvidenceQuery = (req, res) => {

  const type = String(
    req.method === 'POST'
      ? req.body?.type || ''
      : req.query.type || ''
  );

  const day = String(
    req.method === 'POST'
      ? req.body?.date || ''
      : req.query.date || ''
  );

  if (
    !REPORT_EVIDENCE_TYPES.includes(type) ||
    !isValidISOCalendarDate(day) ||
    day > getPHTime().date
  ) {
    res.status(400).json({
      success: false,
      message: 'Invalid report type or event date.'
    });
    return null;
  }

  if (!canReadTrackingEvidence(req.user.role, type)) {
    res.status(403).json({
      success: false,
      message:
        'Forbidden: this report category is outside your role.'
    });
    return null;
  }

  return { type, day };
};


// 4. GET — REPORT EVIDENCE

app.get(
  '/api/reports/tracking-evidence',
  authenticateToken,
  allowRoles('admin', 'hr_admin', 'security'),
  async (req, res) => {

    const selection = validateEvidenceQuery(req, res);
    if (!selection) return;

    try {
      const records = await buildTrackingEvidence(
        selection.type,
        selection.day
      );

      res.setHeader('Cache-Control', 'no-store');

      return res.json({
        success: true,
        records
      });

    } catch (error) {
      console.error(
        'Tracking evidence report lookup error:',
        error
      );

      return res.status(500).json({
        success: false,
        message: 'Could not load tracking evidence.'
      });
    }
  }
);


app.post(
  '/api/reports/tracking-evidence/print-request',
  authenticateToken,
  allowRoles('admin', 'hr_admin', 'security'),
  async (req, res) => {

    const selection = validateEvidenceQuery(req, res);
    if (!selection) return;

    const recordKey = req.body?.key;

    if (
      typeof recordKey !== 'string' ||
      !/^(gps|flag|visitor)-[1-9]\d{0,15}$/.test(recordKey)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report evidence identifier.'
      });
    }

    const allowedPrefix =
      selection.type === 'instructor'
        ? /^(gps|flag)-/
        : /^visitor-/;

    if (!allowedPrefix.test(recordKey)) {
      return res.status(400).json({
        success: false,
        message: 'Record does not belong to report category.'
      });
    }

    try {
      // Verify the evidence still exists.
      const records = await buildTrackingEvidence(
        selection.type,
        selection.day
      );

      const record = records.find(
        item => item.key === recordKey
      );

      if (!record) {
        return res.status(404).json({
          success: false,
          message: 'No matching report evidence record found.'
        });
      }

      const ip = String(
        req.ip || req.socket?.remoteAddress || ''
      ).slice(0, 45) || null;

      const userAgent = String(
        req.get('user-agent') || ''
      ).slice(0, 1000) || null;

      // Log the request BEFORE authorizing printing.
      const [inserted] = await db.promise().query(
        `INSERT INTO audit_logs
          (
            user_id,
            action,
            target_type,
            target_id,
            old_value,
            new_value,
            ip_address,
            user_agent,
            created_at
          )
         VALUES (
           ?,
           'REPORT_PRINT_REQUESTED',
           'tracking_evidence',
           ?,
           NULL,
           ?,
           ?,
           ?,
           ?
         )`,
        [
          req.user.id,
          recordKey,
          JSON.stringify({
            type: selection.type,
            date: selection.day,
            source: record.origin,
            subject_reference: record.reference
          }),
          ip,
          userAgent,
          getPHDateTime()
        ]
      );

      res.setHeader('Cache-Control', 'no-store');

      return res.json({
        success: true,
        record,
        audit_id: inserted.insertId
      });

    } catch (error) {
      console.error(
        'Tracking evidence print request error:',
        error
      );

      return res.status(500).json({
        success: false,
        message:
          'Report print request could not be authorized or audited.'
      });
    }
  }
);


const VISITOR_REVIEW_EVENTS = ['signal_lost', 'loitering'];

const VISITOR_REVIEW_STATUSES = [
  'under_review',
  'dismissed',
  'confirmed_incident'
];

app.get(
  '/api/visitor-event-reviews',
  authenticateToken,
  allowRoles('admin', 'security'),
  async (req, res) => {
    try {
      const [events] = await db.promise().query(
        `SELECT
           id,
           visitor_name,
           ble_id,
           floor,
           current_room,
           event_type,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS timestamp
         FROM visitor_history
         WHERE event_type IN (?, ?)
         ORDER BY id DESC
         LIMIT 300`,
        VISITOR_REVIEW_EVENTS
      );

      if (!events.length) {
        res.setHeader('Cache-Control', 'no-store');
        return res.json([]);
      }

      const ids = events.map(event => String(event.id));
      const placeholders = ids.map(() => '?').join(',');

      const [decisions] = await db.promise().query(
        `SELECT
           al.id AS audit_id,
           al.target_id,
           al.new_value,
           DATE_FORMAT(al.created_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
           u.full_name AS reviewed_by_name
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.action = 'REVIEW_VISITOR_EVENT'
           AND al.target_type = 'visitor_history'
           AND al.target_id IN (${placeholders})
         ORDER BY al.id DESC`,
        ids
      );

      const latest = new Map();

      for (const row of decisions) {
        const key = String(row.target_id);

        if (latest.has(key)) continue;

        let review = row.new_value;

        if (typeof review === 'string') {
          try {
            review = JSON.parse(review);
          } catch (_) {
            review = null;
          }
        }

        if (!review || typeof review !== 'object') continue;

        latest.set(key, {
          status: review.status,
          notes: review.notes || '',
          reviewedAt: row.reviewed_at,
          reviewedBy: row.reviewed_by_name || 'Authorized user',
          auditId: row.audit_id
        });
      }

      res.setHeader('Cache-Control', 'no-store');

      return res.json(
        events.map(event => ({
          ...event,
          review: latest.get(String(event.id)) || {
            status: 'pending_review',
            notes: '',
            reviewedAt: null,
            reviewedBy: null,
            auditId: null
          }
        }))
      );

    } catch (error) {
      console.error('Visitor review queue error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to load visitor reviews.'
      });
    }
  }
);


app.put(
  '/api/visitor-event-reviews/:id',
  authenticateToken,
  allowRoles('admin', 'security'),
  async (req, res) => {
    const eventId = Number(req.params.id);
    const { status, notes } = req.body || {};

    if (
      !Number.isSafeInteger(eventId) ||
      eventId <= 0 ||
      !VISITOR_REVIEW_STATUSES.includes(status) ||
      typeof notes !== 'string' ||
      notes.trim().length < 10 ||
      notes.trim().length > 1000
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Valid event ID, review status, and notes (10–1000 characters) are required.'
      });
    }

    let connection;
    let started = false;

    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();
      started = true;

      const [events] = await connection.query(
        `SELECT
           id,
           event_type,
           visitor_name,
           ble_id,
           floor,
           current_room,
           created_at
         FROM visitor_history
         WHERE id = ?
         FOR UPDATE`,
        [eventId]
      );

      if (
        !events.length ||
        !VISITOR_REVIEW_EVENTS.includes(events[0].event_type)
      ) {
        await connection.rollback();
        started = false;

        return res.status(404).json({
          success: false,
          message: 'Reviewable event not found.'
        });
      }

      const [priorRows] = await connection.query(
        `SELECT new_value
         FROM audit_logs
         WHERE action = 'REVIEW_VISITOR_EVENT'
           AND target_type = 'visitor_history'
           AND target_id = ?
         ORDER BY id DESC
         LIMIT 1`,
        [String(eventId)]
      );

      let oldValue = {
        status: 'pending_review',
        notes: ''
      };

      if (priorRows.length) {
        const value = priorRows[0].new_value;

        try {
          oldValue = typeof value === 'string'
            ? JSON.parse(value)
            : value;
        } catch (_) {
          oldValue = {
            status: 'pending_review',
            notes: ''
          };
        }
      }

      const newValue = {
        status,
        notes: notes.trim(),
        observation_type: events[0].event_type,
        visitor_name: events[0].visitor_name,
        ble_id: events[0].ble_id
      };

      const rawIp =
        req.headers['x-forwarded-for'] ||
        req.socket?.remoteAddress ||
        null;

      const ip = rawIp
        ? String(rawIp).split(',')[0].trim()
        : null;

      const [saved] = await connection.query(
        `INSERT INTO audit_logs
          (
            user_id,
            action,
            target_type,
            target_id,
            old_value,
            new_value,
            ip_address,
            user_agent,
            created_at
          )
         VALUES (
           ?,
           'REVIEW_VISITOR_EVENT',
           'visitor_history',
           ?, ?, ?, ?, ?, ?
         )`,
        [
          req.user.id,
          String(eventId),
          JSON.stringify(oldValue),
          JSON.stringify(newValue),
          ip,
          req.headers['user-agent'] || null,
          getPHDateTime()
        ]
      );

      await connection.commit();
      started = false;

      return res.json({
        success: true,
        auditId: saved.insertId,
        status,
        message: 'Review decision recorded in audit logs.'
      });

    } catch (error) {
      if (connection && started) {
        await connection.rollback().catch(() => {});
      }

      console.error('Visitor review decision error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to save review decision.'
      });

    } finally {
      if (connection) connection.release();
    }
  }
);



const VISITOR_REPORT_EVENTS = ['signal_lost', 'loitering'];

const VISITOR_REPORT_STATUSES = [
  'all',
  'pending_review',
  'under_review',
  'dismissed',
  'confirmed_incident'
];

const parseVisitorReview = value => {
  try {
    const parsed = typeof value === 'string'
      ? JSON.parse(value)
      : value;

    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
        ? parsed
        : {};
  } catch (_) {
    return {};
  }
};

app.get(
  '/api/visitor-incident-reports',
  authenticateToken,
  allowRoles('admin', 'security'),
  async (req, res) => {
    const { startDate, endDate, status = 'all' } = req.query;

    if (
      !VISITOR_REPORT_STATUSES.includes(status) ||
      (startDate != null && !isValidISOCalendarDate(startDate)) ||
      (endDate != null && !isValidISOCalendarDate(endDate)) ||
      (startDate && endDate && startDate > endDate)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range or review status.'
      });
    }

    if (
      startDate &&
      endDate &&
      (
        Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)
      ) > 366 * 86400000
    ) {
      return res.status(400).json({
        success: false,
        message: 'Date range cannot exceed 366 days.'
      });
    }

    try {
      const conditions = ['vh.event_type IN (?, ?)'];
      const params = [...VISITOR_REPORT_EVENTS];

      if (startDate) {
        conditions.push('vh.created_at >= ?');
        params.push(`${startDate} 00:00:00`);
      }

      if (endDate) {
        conditions.push(
          'vh.created_at < DATE_ADD(?, INTERVAL 1 DAY)'
        );
        params.push(`${endDate} 00:00:00`);
      }

      const [rows] = await db.promise().query(
        `SELECT
           vh.id,
           vh.visitor_name,
           vh.ble_id,
           vh.floor,
           vh.current_room,
           vh.event_type,
           DATE_FORMAT(
             vh.created_at,
             '%Y-%m-%d %H:%i:%s'
           ) AS observed_at,
           al.id AS audit_id,
           al.new_value,
           DATE_FORMAT(
             al.created_at,
             '%Y-%m-%d %H:%i:%s'
           ) AS reviewed_at,
           u.full_name AS reviewed_by
         FROM visitor_history vh
         LEFT JOIN audit_logs al ON al.id = (
           SELECT MAX(a.id)
           FROM audit_logs a
           WHERE a.action = 'REVIEW_VISITOR_EVENT'
             AND a.target_type = 'visitor_history'
             
AND a.target_id COLLATE utf8mb4_0900_ai_ci =
    CAST(vh.id AS CHAR CHARACTER SET utf8mb4)
    COLLATE utf8mb4_0900_ai_ci
         )
         LEFT JOIN users u ON u.id = al.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY vh.created_at DESC, vh.id DESC
         LIMIT 1001`,
        params
      );

      const capped = rows.length > 1000;

      const records = rows.slice(0, 1000).map(row => {
        const review = parseVisitorReview(row.new_value);

        const reviewStatus =
          row.audit_id != null &&
          VISITOR_REPORT_STATUSES.includes(review.status) &&
          review.status !== 'all'
            ? review.status
            : 'pending_review';

        return {
          eventId: row.id,
          visitorName: row.visitor_name,
          bleId: row.ble_id,
          floor: row.floor,
          room: row.current_room,
          eventType: row.event_type,
          observedAt: row.observed_at,
          reviewStatus,
          reviewNotes:
            row.audit_id == null
              ? ''
              : String(review.notes || ''),
          reviewedBy: row.reviewed_by || null,
          reviewedAt: row.reviewed_at || null,
          auditId: row.audit_id || null
        };
      }).filter(row =>
        status === 'all' || row.reviewStatus === status
      );

      res.setHeader('Cache-Control', 'no-store');

      return res.json({
        success: true,
        records,
        limit: 1000,
        capped
      });

    } catch (error) {
      console.error('Visitor incident report error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve visitor incident report.'
      });
    }
  }
);

app.get(
  '/api/visitor-incident-reports/:id/evidence',
  authenticateToken,
  allowRoles('admin', 'security'),
  async (req, res) => {
    const eventId = Number(req.params.id);

    if (
      !Number.isSafeInteger(eventId) ||
      eventId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid event ID.'
      });
    }

    try {
      const [events] = await db.promise().query(
        `SELECT
           id,
           visitor_id,
           visitor_name,
           ble_id,
           floor,
           current_room,
           event_type,
           x,
           y,
           DATE_FORMAT(
             created_at,
             '%Y-%m-%d %H:%i:%s'
           ) AS observed_at
         FROM visitor_history
         WHERE id = ?
           AND event_type IN (?, ?)
         LIMIT 1`,
        [eventId, ...VISITOR_REPORT_EVENTS]
      );

      if (!events.length) {
        return res.status(404).json({
          success: false,
          message: 'Reviewable observation not found.'
        });
      }

      const [reviews] = await db.promise().query(
        `SELECT
           al.id,
           al.user_id,
           al.old_value,
           al.new_value,
           DATE_FORMAT(
             al.created_at,
             '%Y-%m-%d %H:%i:%s'
           ) AS reviewed_at,
           u.full_name AS reviewer
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al.user_id
         WHERE al.action = 'REVIEW_VISITOR_EVENT'
           AND al.target_type = 'visitor_history'
           AND al.target_id = ?
         ORDER BY al.id ASC`,
        [String(eventId)]
      );

      res.setHeader('Cache-Control', 'no-store');

      return res.json({
        success: true,
        observation: events[0],
        reviewHistory: reviews.map(row => ({
          auditId: row.id,
          reviewer: row.reviewer || 'Former user',
          reviewerId: row.user_id,
          reviewedAt: row.reviewed_at,
          previousDecision: parseVisitorReview(
            row.old_value
          ),
          decision: parseVisitorReview(
            row.new_value
          )
        }))
      });

    } catch (error) {
      console.error('Visitor event evidence error:', error);

      return res.status(500).json({
        success: false,
        message: 'Unable to retrieve event evidence.'
      });
    }
  }
);


app.get('/api/visitor-history', authenticateToken, allowRoles('admin','security'), (req, res) => {
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

app.get('/api/visitor-requests/history', authenticateToken, allowRoles('admin','security'), (req, res) => {
  if (req.user.role !== 'security' && req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start and end dates required' });
  }
  
  
  if (startDate > endDate) {
    return res.status(400).json({ error: 'Start date cannot be after the end date.' });
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
// OVERTIME REQUESTS (Secured, Validated & Timezone-Synchronized)
// ============================================

const ALLOWED_OT_SCENARIOS = ['early_ot', 'normal_ot'];
const ALLOWED_OT_TYPES     = ['Regular Overtime', 'Compensatory Time Off (CTO)'];
const MIN_OT_MINUTES       = 30;
const MAX_OT_MINUTES       = 12 * 60; // 12 hours
const OT_BACKDATE_LIMIT_DAYS = 7;     // allow filing for shifts up to 7 days past

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const toMinutes = (hhmm) => {
  if (!HHMM_REGEX.test(hhmm)) return null;
  const [h, m] = hhmm.substring(0, 5).split(':').map(Number);
  return h * 60 + m;
};

app.post('/api/overtime-requests', authenticateToken, uploadOvertimeFiles, async (req, res) => {
  const { date, start_time, end_time, reason, scenario_type, overtime_type, schedule_id } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  // ---- 1. Field presence ----
  if (!date || !start_time || !end_time || !reason || !scenario_type) {
    return res.status(400).json({ success: false, message: 'All overtime fields are required.' });
  }

  const overtimeProof =
    req.files?.attachment?.[0] ||
    req.files?.image?.[0] ||
    req.file ||
    null;

  if (!overtimeProof) {
    return res.status(400).json({
      success: false,
      message:
        'A supporting attachment is required for overtime requests. ' +
        'Upload an image, PDF, or document before submitting.'
    });
  }

  const cleanReason = String(reason).trim();
  if (cleanReason.length < 5) {
    return res.status(400).json({ success: false, message: 'Please provide a more detailed reason for overtime (minimum 5 characters).' });
  }
  if (cleanReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Reason is too long (max 500 characters).' });
  }

  // ---- 2. Date format ----
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ success: false, message: 'Invalid date format. Expected YYYY-MM-DD.' });
  }
  if (!isValidISOCalendarDate(date)) {
    return res.status(400).json({ success: false, message: 'Invalid calendar date.' });
  }
  const dateObjCheck = new Date(`${date}T00:00:00`);
  if (isNaN(dateObjCheck.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid calendar date.' });
  }

  // ---- 3. Time format & ordering ----
  const startMin = toMinutes(start_time);
  const endMin   = toMinutes(end_time);
  if (startMin === null) return res.status(400).json({ success: false, message: 'Invalid start time format. Expected HH:mm.' });
  if (endMin === null)   return res.status(400).json({ success: false, message: 'Invalid end time format. Expected HH:mm.' });
  if (startMin >= endMin) return res.status(400).json({ success: false, message: 'Overtime end time must be strictly after the start time.' });

  const durationMin = endMin - startMin;
  if (durationMin < MIN_OT_MINUTES) {
    return res.status(400).json({ success: false, message: `Minimum overtime duration is ${MIN_OT_MINUTES} minutes.` });
  }
  if (durationMin > MAX_OT_MINUTES) {
    return res.status(400).json({ success: false, message: `Maximum overtime duration is ${MAX_OT_MINUTES / 60} hours per request.` });
  }

  // ✅ CTO 1-hour rule
  if (overtime_type === 'Compensatory Time Off (CTO)' && durationMin < 60) {
    return res.status(400).json({ success: false, message: 'CTO conversion requires at least 1 hour (60 minutes) of overtime.' });
  }

  const normalizedStart = String(start_time).trim().length === 5
    ? `${String(start_time).trim()}:00`
    : String(start_time).trim();
  const normalizedEnd = String(end_time).trim().length === 5
    ? `${String(end_time).trim()}:00`
    : String(end_time).trim();

  // ---- 4. Scenario & type whitelist ----
  if (!ALLOWED_OT_SCENARIOS.includes(scenario_type)) {
    return res.status(400).json({ success: false, message: 'Invalid overtime scenario type.' });
  }
  if (overtime_type && !ALLOWED_OT_TYPES.includes(overtime_type)) {
    return res.status(400).json({ success: false, message: 'Invalid overtime type.' });
  }

  const { date: today } = getPHTime();
  const todayObj = new Date(`${today}T00:00:00`);
  const daysDiff = Math.round(
    (dateObjCheck - todayObj) / (1000 * 60 * 60 * 24)
  );

  if (daysDiff < -OT_BACKDATE_LIMIT_DAYS) {
    return res.status(400).json({
      success: false,
      message:
        `Overtime can only be filed up to ` +
        `${OT_BACKDATE_LIMIT_DAYS} days in the past.`
    });
  }

  try {
    // ---- 6. Resolve user ----
    const [userRows] = await db.promise().query(
      "SELECT employee_id FROM users WHERE id = ? AND status = 'active'",
      [userId]
    );
    if (userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found or inactive.' });
    }
    const employeeId = userRows[0].employee_id;

    // ✅ FIX — Leave guard runs AFTER employeeId is defined (inside try)
    const [leaveRows] = await db.promise().query(
      `SELECT id FROM leave_requests
        WHERE (user_id = ? OR user_id = ?)
          AND request_date = ?
          AND status = 'Approved'`,
      [employeeId, userId, date]
    );
    if (leaveRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You are on an approved leave on this date. Overtime cannot be filed.'
      });
    }

    // ---- 7. Resolve / validate schedule ----
    let targetScheduleId = schedule_id;
    let shiftStartStr = null;
    let shiftEndStr   = null;
    let shiftStartMin = null;
    let shiftEndMin   = null;

    if (!targetScheduleId || targetScheduleId === 'undefined' || targetScheduleId === 'null') {

      
const [schedRows] = await db.promise().query(
  `SELECT id, start_time, end_time
   FROM schedules
   WHERE (user_id = ? OR user_id = ?)
     AND DATE(date) = DATE(?)
   ORDER BY start_time ASC
   LIMIT 2`,
  [employeeId, userId, date]
);

if (schedRows.length > 1) {
  return res.status(409).json({
    success: false,
    message:
      'Multiple schedules exist on this date. ' +
      'Please select the specific shift for overtime.'
  });
}

      if (schedRows.length > 0) {
        targetScheduleId = schedRows[0].id;
        shiftStartStr = schedRows[0].start_time;
        shiftEndStr   = schedRows[0].end_time;
        shiftStartMin = toMinutes(shiftStartStr);
        shiftEndMin   = toMinutes(shiftEndStr);
      }
    } else {
      const [schedVerify] = await db.promise().query(
        "SELECT id, start_time, end_time FROM schedules WHERE id = ? AND (user_id = ? OR user_id = ?) AND date = ?",
        [targetScheduleId, employeeId, userId, date]
      );
      if (schedVerify.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid schedule selected for this date.' });
      }
      shiftStartStr = schedVerify[0].start_time;
      shiftEndStr   = schedVerify[0].end_time;
      shiftStartMin = toMinutes(shiftStartStr);
      shiftEndMin   = toMinutes(shiftEndStr);
    }

    // These scenarios must map to an actual scheduled shift
    if (!targetScheduleId) {
      return res.status(400).json({
        success: false,
        message: 'No scheduled shift found on this date. Overtime requires an existing schedule.'
      });
    }

    // ---- 7b. Shift boundary validation ----
    if (shiftStartMin !== null && shiftEndMin !== null) {
      if (scenario_type === 'early_ot') {
        // Early OT must finish at or before shift start
        if (endMin > shiftStartMin) {
          return res.status(400).json({
            success: false,
            message: `Early OT must end at or before shift start (${formatTo12Hour(shiftStartStr)}).`
          });
        }
      } else if (scenario_type === 'normal_ot') {
        // Normal OT must begin at or after shift end
        if (startMin < shiftEndMin) {
          return res.status(400).json({
            success: false,
            message: `Overtime must start at or after shift end (${formatTo12Hour(shiftEndStr)}).`
          });
        }
      }
    }

        
    const MAX_PENDING_OT = 10;
    const connection = await db.promise().getConnection();

    try {
      await connection.beginTransaction();

      
      await connection.query(`SELECT id FROM users WHERE id = ? FOR UPDATE`, [userId]);

      
      const [pendingRows] = await connection.query(
        `SELECT COUNT(*) AS c FROM overtime_requests
          WHERE (user_id = ? OR user_id = ?) AND status = 'pending'`,
        [employeeId, userId]
      );
      if (pendingRows[0].c >= MAX_PENDING_OT) {
        await connection.rollback();
        return res.status(429).json({
          success: false,
          message: `You already have ${MAX_PENDING_OT} pending overtime requests. Please wait for HR to review them.`
        });
      }

      
      const [overlap] = await connection.query(
        `SELECT id, start_time, end_time, status
           FROM overtime_requests
          WHERE (user_id = ? OR user_id = ?)
            AND date = ?
            AND status IN ('pending','approved')
            AND NOT (end_time <= ? OR start_time >= ?)`,
        [employeeId, userId, date, normalizedStart, normalizedEnd]
      );
      if (overlap.length > 0) {
        await connection.rollback();
        const conflict = overlap[0];
        return res.status(409).json({
          success: false,
          message: `You already have a ${conflict.status} overtime request from ${formatTo12Hour(conflict.start_time)} to ${formatTo12Hour(conflict.end_time)} on ${date}.`
        });
      }

      
      
const attachment =
  `/uploads/leave_images/${overtimeProof.filename}`;


      
      const [result] = await connection.query(
        `INSERT INTO overtime_requests
          (user_id, date, schedule_id, start_time, end_time, reason, attachment,
           scenario_type, overtime_type, attendance_id, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending', ?)`,
        [
          userId, date, targetScheduleId, normalizedStart, normalizedEnd,
          cleanReason, attachment, scenario_type,
          overtime_type || 'Regular Overtime', phNow
        ]
      );

      await connection.commit();

      logAction(userId, 'SUBMIT_OVERTIME', 'overtime_request', result.insertId, req);
      return res.json({ success: true, message: 'Overtime request submitted successfully.', requestId: result.insertId });
    } catch (txErr) {
      await connection.rollback();
      throw txErr; 
    } finally {
      connection.release();  
    }
  } catch (err) {
    console.error("Overtime Submit Error:", err);
    res.status(500).json({ success: false, message: 'Server connection failed while submitting request.' });
  }
});

// 2. Get User's Overtime Requests (Formatted with Philippine Time Strings & Dual Identifiers)
app.get('/api/overtime-requests', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = `
    SELECT 
      id, user_id, schedule_id, start_time, end_time, reason, attachment, scenario_type, attendance_id, status, admin_remarks, overtime_type,
      DATE_FORMAT(date, '%Y-%m-%d') AS date,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at
    FROM overtime_requests 
    WHERE (user_id = ? OR user_id = (SELECT employee_id FROM users WHERE id = ?))
    ORDER BY date DESC, id DESC
  `;

  db.query(sql, [userId, userId], (err, rows) => {
    if (err) {
      console.error("Failed to load overtime history:", err);
      return res.status(500).json({ success: false, message: 'Failed to load overtime history.' });
    }
    res.json(rows || []);
  });
});

app.get('/api/overtime-requests/user/:employeeId', authenticateToken, verifyOwnership, (req, res) => {
  const { employeeId } = req.params;

  
  const sql = `
    SELECT 
      o.id, o.user_id, o.schedule_id, o.start_time, o.end_time, o.reason, o.attachment, o.scenario_type, o.attendance_id, o.status, o.admin_remarks, o.overtime_type,
      DATE_FORMAT(o.date, '%Y-%m-%d') AS date,
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
      DATE_FORMAT(o.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at
    FROM overtime_requests o
    JOIN users u ON (o.user_id = u.id OR o.user_id = u.employee_id)
    WHERE (u.employee_id = ? OR u.id = ?)
    ORDER BY o.date DESC, o.id DESC
  `;

  db.query(sql, [employeeId, employeeId], (err, rows) => {
    if (err) {
      console.error("Failed to load user overtime history:", err);
      return res.status(500).json({ success: false, message: 'Failed to load overtime history.' });
    }
    res.json(rows || []);
  });
});

// 3. Get Pending Overtime Requests for Admin & HR Review
app.get('/api/overtime-requests/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }

  const sql = `
    SELECT 
      o.*, 
      DATE_FORMAT(o.date, '%Y-%m-%d') AS date,
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      DATE_FORMAT(o.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      u.full_name, u.employee_id 
    FROM overtime_requests o
    JOIN users u ON (o.user_id = u.id OR o.user_id = u.employee_id)
    WHERE o.status = 'pending'
    ORDER BY o.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Failed to load pending overtime requests:", err);
      return res.status(500).json({ success: false, message: 'Failed to load pending requests.' });
    }
    res.json(rows || []);
  });
});


app.put(
  '/api/overtime-requests/:id/status',
  authenticateToken,
  requireAction('overtime:approve'),
  async (req, res) => {
    if (!['admin', 'hr_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not have permission.'
      });
    }

    const id = Number(req.params.id);
    
const {
  status,
  admin_remarks,
  evidence_verified
} = req.body || {};

    const phNow = getPHDateTime();

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid overtime request ID.'
      });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update.'
      });
    }

    const cleanAdminRemarks = admin_remarks == null
      ? null
      : String(admin_remarks).trim() || null;

    if (cleanAdminRemarks && cleanAdminRemarks.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Admin remarks must not exceed 500 characters.'
      });
    }

    if (
      status === 'rejected' &&
      (!cleanAdminRemarks || cleanAdminRemarks.length < 5)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Provide a rejection reason of 5–500 characters.'
      });
    }


if (status === 'approved' && evidence_verified !== true) {
  return res.status(400).json({
    success: false,
    message:
      'HR must confirm verification of the completed ' +
      'overtime evidence before approval.'
  });
}


    let connection;
    let transactionStarted = false;

    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();
      transactionStarted = true;

      
const [rows] = await connection.query(
  `SELECT
     o.*,
     u.employee_id,
     u.id AS internal_user_id,
     DATE_FORMAT(o.date, '%Y-%m-%d') AS overtime_work_date
   FROM overtime_requests o
   JOIN users u
     ON (o.user_id = u.id OR o.user_id = u.employee_id)
   WHERE o.id = ?
     AND o.status = 'pending'
   FOR UPDATE`,
  [id]
);


      if (rows.length !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(rows.length === 0 ? 404 : 409).json({
          success: false,
          message: rows.length === 0
            ? 'Overtime request not found or already reviewed.'
            : 'Overtime request ownership is ambiguous.'
        });
      }

      const reqData = rows[0];

      if (String(reqData.internal_user_id) === String(req.user.id)) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(403).json({
          success: false,
          message: 'You cannot review your own overtime request.'
        });
      }

      
if (status === 'approved') {
  // UniVITA's current overtime request form supports
  // same-day intervals. Compare against Philippine time.
  const overtimeEndClock =
    String(reqData.end_time || '').slice(0, 8);

  const overtimeEnd = `${reqData.overtime_work_date} ${
    overtimeEndClock.length === 5
      ? `${overtimeEndClock}:00`
      : overtimeEndClock
  }`;

  if (
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(overtimeEnd) ||
    overtimeEnd > phNow
  ) {
    await connection.rollback();
    transactionStarted = false;

    return res.status(409).json({
      success: false,
      message:
        'Overtime has not ended. Keep this request Pending ' +
        'until the stated interval is completed.'
    });
  }

  const reqOtType =
    reqData.overtime_type || 'Regular Overtime';


        if (!ALLOWED_OT_SCENARIOS.includes(reqData.scenario_type)) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message: 'Invalid overtime timing. Reject and request resubmission.'
          });
        }

        if (!ALLOWED_OT_TYPES.includes(reqOtType)) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message: 'Invalid overtime type.'
          });
        }

        
const workDate = reqData.overtime_work_date;


        const [schedules] = await connection.query(
          `SELECT id, start_time, end_time
           FROM schedules
           WHERE id = ?
             AND (user_id = ? OR user_id = ?)
             AND DATE(date) = DATE(?)
           LIMIT 1`,
          [
            reqData.schedule_id,
            reqData.employee_id,
            reqData.internal_user_id,
            workDate
          ]
        );

        if (schedules.length !== 1) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message:
              'The overtime request must match an assigned schedule.'
          });
        }

        const shift = schedules[0];
        const startMin = toMinutes(String(reqData.start_time || ''));
        const endMin = toMinutes(String(reqData.end_time || ''));
        const shiftStart = toMinutes(String(shift.start_time || ''));
        const shiftEnd = toMinutes(String(shift.end_time || ''));

        if (
          startMin === null ||
          endMin === null ||
          shiftStart === null ||
          shiftEnd === null ||
          startMin >= endMin ||
          shiftStart >= shiftEnd
        ) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message: 'Invalid overtime or schedule time range.'
          });
        }

        const durationMin = endMin - startMin;

        if (
          durationMin < MIN_OT_MINUTES ||
          durationMin > MAX_OT_MINUTES
        ) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message:
              `Overtime duration must be between ` +
              `${MIN_OT_MINUTES} and ${MAX_OT_MINUTES} minutes.`
          });
        }

        if (
          reqOtType === 'Compensatory Time Off (CTO)' &&
          durationMin < 60
        ) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message: 'CTO requires at least one hour of overtime.'
          });
        }

        if (
          reqData.scenario_type === 'early_ot' &&
          endMin > shiftStart
        ) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message:
              'Early overtime must end at or before shift start.'
          });
        }

        if (
          reqData.scenario_type === 'normal_ot' &&
          startMin < shiftEnd
        ) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(400).json({
            success: false,
            message:
              'Normal overtime must start at or after shift end.'
          });
        }

        const [overlap] = await connection.query(
          `SELECT id, status
           FROM overtime_requests
           WHERE (user_id = ? OR user_id = ?)
             AND DATE(date) = DATE(?)
             AND status IN ('pending', 'approved')
             AND id <> ?
             AND NOT (end_time <= ? OR start_time >= ?)
           LIMIT 1`,
          [
            reqData.employee_id,
            reqData.internal_user_id,
            workDate,
            id,
            reqData.start_time,
            reqData.end_time
          ]
        );

        if (overlap.length) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message:
              `Overtime overlaps another ${overlap[0].status} request.`
          });
        }

        const [evidence] = await connection.query(
          `SELECT id
           FROM attendance
           WHERE (user_id = ? OR user_id = ?)
             AND schedule_id = ?
             AND DATE(date) = DATE(?)
             AND time_in IS NOT NULL
             AND time_out IS NOT NULL
           LIMIT 1`,
          [
            reqData.employee_id,
            reqData.internal_user_id,
            reqData.schedule_id,
            workDate
          ]
        );

        if (!evidence.length && !reqData.attachment) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message:
              'Completed attendance or supporting evidence is required. ' +
              'HR must verify the actual overtime interval.'
          });
        }

        if (
          reqOtType === 'Regular Overtime' &&
          await uvIsPayrollSnapshotLocked(
            connection,
            reqData.internal_user_id,
            workDate
          )
        ) {
          await connection.rollback();
          transactionStarted = false;

          return res.status(409).json({
            success: false,
            message:
              'Payroll already exists for this period. ' +
              'Use an authorized payroll adjustment.'
          });
        }

        if (reqOtType === 'Compensatory Time Off (CTO)') {
          const [typeRows] = await connection.query(
            `SELECT id
             FROM leave_types
             WHERE name = 'Compensatory Paid Off'
                OR name LIKE '%Compensatory%'
             LIMIT 1`
          );

          if (!typeRows.length) {
            await connection.rollback();
            transactionStarted = false;

            return res.status(409).json({
              success: false,
              message:
                'Compensatory leave type is not configured. ' +
                'HR must configure it before CTO approval.'
            });
          }

          const overtimeHours = durationMin / 60;
          const earnedDays = overtimeHours / 8;

          const [dateRows] = await connection.query(
            `SELECT YEAR(DATE(?)) AS leave_year`,
            [workDate]
          );

          const leaveYear = Number(dateRows[0]?.leave_year);
          const leaveTypeId = typeRows[0].id;

          await connection.query(
            `INSERT IGNORE INTO employee_leave_balances
               (user_id, leave_type_id, remaining_days, year, last_updated)
             VALUES (?, ?, 0, ?, CURDATE())`,
            [reqData.internal_user_id, leaveTypeId, leaveYear]
          );

          const [creditResult] = await connection.query(
            `UPDATE employee_leave_balances
             SET remaining_days = remaining_days + ?,
                 last_updated = CURDATE()
             WHERE user_id = ?
               AND leave_type_id = ?
               AND year = ?`,
            [
              earnedDays,
              reqData.internal_user_id,
              leaveTypeId,
              leaveYear
            ]
          );

          if (creditResult.affectedRows !== 1) {
            throw new Error('Unable to credit CTO leave balance.');
          }

          await connection.query(
            `INSERT INTO cto_credits
               (user_id, employee_id, credit_hours,
                adjustment_days, reason, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              reqData.internal_user_id,
              reqData.employee_id,
              overtimeHours,
              earnedDays,
              `Approved Overtime: ${reqData.reason || 'No reason provided'}`,
              phNow
            ]
          );
        }
      }

      const [reviewResult] = await connection.query(
        `UPDATE overtime_requests
         SET status = ?,
             admin_remarks = ?,
             reviewed_at = ?,
             reviewed_by = ?
         WHERE id = ?
           AND status = 'pending'`,
        [
          status,
          cleanAdminRemarks,
          phNow,
          req.user.id,
          id
        ]
      );

      if (reviewResult.affectedRows !== 1) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(409).json({
          success: false,
          message: 'This overtime request has already been reviewed.'
        });
      }

      await connection.commit();
      transactionStarted = false;

      logAction(
        req.user.id,
        status === 'approved'
          ? 'APPROVE_OVERTIME'
          : 'REJECT_OVERTIME',
        'overtime_request',
        id,
        req
      );

      return res.json({
        success: true,
        message: `Overtime successfully ${status}.`
      });

    } catch (error) {
      if (connection && transactionStarted) {
        await connection.rollback().catch(console.error);
      }

      console.error('Overtime status update error:', error);

      return res.status(500).json({
        success: false,
        message: 'Server error while reviewing overtime.'
      });

    } finally {
      if (connection) connection.release();
    }
  }
);


// Payroll Calculations Helpers
function calculateHours(start, end) {
  return c10AttendanceHours(start, end) ?? 0;
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

  const sql = `
    SELECT 
      o.*, 
      DATE_FORMAT(o.date, '%Y-%m-%d') AS date,
      DATE_FORMAT(o.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
      DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      u.full_name, u.employee_id
    FROM overtime_requests o
    JOIN users u ON (o.user_id = u.id OR o.user_id = u.employee_id)
    ORDER BY o.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Failed to load all overtime requests:", err);
      return res.status(500).json({ success: false, message: 'Failed to load overtime data.' });
    }
    res.json(rows || []);
  });
});

app.get('/api/attendance/corrections/pending', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission.' });
  }

  const sql = `
    SELECT c.id, 
           c.schedule_id,
           c.requested_clock_in, 
           c.requested_clock_out, 
           c.reason, 
           c.selfie_url, 
           c.status, 
           c.admin_remarks,
           DATE_FORMAT(c.attendance_date, '%Y-%m-%d') AS attendance_date, 
           DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS submitted_at,
           DATE_FORMAT(c.reviewed_at, '%Y-%m-%d %H:%i:%s') AS reviewed_at,
           u.full_name, 
           u.employee_id
    FROM attendance_corrections c
    JOIN users u ON (c.user_id = u.id OR c.user_id = u.employee_id)  
    WHERE c.status = 'pending'
    ORDER BY c.id DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Pending corrections error:", err);
      return res.status(500).json({ success: false, message: 'Failed to load attendance corrections.' });
    }
    res.json(rows || []);
  });
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


app.put('/api/leave-requests/batch-status', authenticateToken, requireAction('leaves:batch'), async (req, res) => {
  if (!['admin', 'hr_admin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden.'
    });
  }

  const { ids, status, admin_remarks } = req.body || {};
  const remarks = admin_remarks == null
    ? null
    : String(admin_remarks).trim() || null;

  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 30 ||
    ids.some(id => !Number.isSafeInteger(Number(id)) || Number(id) <= 0) ||
    new Set(ids.map(Number)).size !== ids.length ||
    !['Approved', 'Rejected'].includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid batch request IDs or status.'
    });
  }

  if (
    (remarks && remarks.length > 500) ||
    (status === 'Rejected' && (!remarks || remarks.length < 5))
  ) {
    return res.status(400).json({
      success: false,
      message: 'Rejection requires 5–500 characters; other remarks are limited to 500.'
    });
  }

  let connection;
  let started = false;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();
    started = true;

    const orderedIds = ids.map(Number).sort((a, b) => a - b);
    const leaves = [];

    for (const id of orderedIds) {
      const [rows] = await connection.query(
        `SELECT *,
                DATE_FORMAT(request_date, '%Y-%m-%d') AS date_key
         FROM leave_requests
         WHERE id = ?
         FOR UPDATE`,
        [id]
      );

      if (
        rows.length !== 1 ||
        String(rows[0].status).toLowerCase() !== 'pending'
      ) {
        throw uvLeaveApprovalConflict(
          `Leave ${id} was not found or is no longer pending.`
        );
      }

      leaves.push(rows[0]);
    }

    for (const leave of leaves) {
      if (status === 'Approved') {
        await uvApplyApprovedLeave(
          connection,
          leave,
          req.user.id
        );
      }

      const [updated] = await connection.query(
        `UPDATE leave_requests
         SET status = ?,
             admin_remarks = ?,
             reviewed_at = ?
         WHERE id = ?
           AND status = 'Pending'`,
        [
          status,
          remarks,
          getPHDateTime(),
          leave.id
        ]
      );

      if (updated.affectedRows !== 1) {
        throw uvLeaveApprovalConflict(
          `Leave ${leave.id} changed during review.`
        );
      }
    }

    await connection.commit();
    started = false;

    logAction(
      req.user.id,
      `BATCH_${status.toUpperCase()}_LEAVE`,
      'leave_request',
      ids.join(','),
      req
    );

    return res.json({
      success: true,
      message: `${leaves.length} leave request(s) ${status.toLowerCase()}.`
    });
  } catch (error) {
    if (started && connection) {
      await connection.rollback().catch(() => {});
    }

    if (!error.httpStatus) {
      console.error('Batch leave review error:', error);
    }

    return res.status(error.httpStatus || 500).json({
      success: false,
      message: error.httpStatus
        ? error.message
        : 'Batch leave review failed; no changes were saved.'
    });
  } finally {
    if (connection) connection.release();
  }
});


// ============================================
// USER CANCELLATION ENDPOINTS
// ============================================

app.put('/api/leave-requests/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  const cancelReason = reason ? String(reason).trim() : '';
  if (cancelReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Cancellation reason is too long (maximum 500 characters).' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query(
      "SELECT id, status FROM leave_requests WHERE id = ? AND (user_id = ? OR user_id = (SELECT employee_id FROM users WHERE id = ?)) FOR UPDATE",
      [id, userId, userId]
    );
    
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Request not found or unauthorized." });
    }
    if (rows[0].status.toLowerCase() !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Only pending requests can be cancelled." });
    }

    const cancelRemark = cancelReason ? `[Cancelled by User] Reason: ${cancelReason}` : '[Cancelled by User]';
    
    await connection.query(
      "UPDATE leave_requests SET status = 'cancelled', admin_remarks = ?, reviewed_at = ? WHERE id = ?",
      [cancelRemark, phNow, id]
    );
    
    await connection.commit();
    logAction(userId, 'CANCEL_LEAVE', 'leave_request', id, req);
    res.json({ success: true, message: "Request cancelled successfully." });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: "Server error." });
  } finally {
    connection.release();
  }
});

app.put('/api/leave-requests/batch-cancel', authenticateToken, async (req, res) => {
  const { ids, reason } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'No request IDs provided for cancellation.' });
  }

  const cancelReason = reason ? String(reason).trim() : '';
  if (cancelReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Cancellation reason is too long (maximum 500 characters).' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  let cancelledCount = 0;
  let skippedCount = 0;

  try {
    // Resolve user's employee_id to match the DB schema
    const [userRows] = await connection.query("SELECT employee_id FROM users WHERE id = ?", [userId]);
    const employeeId = userRows.length > 0 ? userRows[0].employee_id : null;

    const cancelRemark = cancelReason ? `[Cancelled by User] Reason: ${cancelReason}` : '[Cancelled by User]';

    for (const id of ids) {
      // Lock each row to prevent race conditions with Admin approvals
      const [rows] = await connection.query(
        "SELECT id, status FROM leave_requests WHERE id = ? AND (user_id = ? OR user_id = ?) FOR UPDATE",
        [id, userId, employeeId]
      );

      // If not found, or HR already approved/rejected it, skip it
      if (rows.length === 0 || rows[0].status.toLowerCase() !== 'pending') {
        skippedCount++;
        continue;
      }

      await connection.query(
        "UPDATE leave_requests SET status = 'cancelled', admin_remarks = ?, reviewed_at = ? WHERE id = ?",
        [cancelRemark, phNow, id]
      );
      cancelledCount++;
    }

    await connection.commit();
    
    if (cancelledCount > 0) {
      logAction(userId, 'BATCH_CANCEL_LEAVE', 'leave_request', `IDs: ${ids.join(',')}`, req);
    }

    if (cancelledCount === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'None of the requests could be cancelled. They may have already been processed by HR.' 
      });
    }

    const msg = skippedCount > 0
      ? `Successfully cancelled ${cancelledCount} day(s). However, ${skippedCount} day(s) could not be cancelled (likely already approved/rejected by HR).`
      : `All ${cancelledCount} day(s) cancelled successfully.`;

    res.json({ success: true, message: msg });

  } catch (err) {
    await connection.rollback();
    console.error("Batch cancel error:", err);
    res.status(500).json({ success: false, message: "Server error during cancellation." });
  } finally {
    connection.release();
  }
});

app.put('/api/overtime-requests/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  const cancelReason = reason ? String(reason).trim() : '';
  if (cancelReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Cancellation reason is too long (maximum 500 characters).' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [rows] = await connection.query(
      "SELECT id, status FROM overtime_requests WHERE id = ? AND (user_id = ? OR user_id = (SELECT employee_id FROM users WHERE id = ?)) FOR UPDATE",
      [id, userId, userId]
    );
    
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Request not found or unauthorized." });
    }
    if (rows[0].status.toLowerCase() !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Only pending requests can be cancelled." });
    }

    const cancelRemark = cancelReason ? `[Cancelled by User] Reason: ${cancelReason}` : '[Cancelled by User]';
    
    await connection.query(
      "UPDATE overtime_requests SET status = 'cancelled', admin_remarks = ?, reviewed_at = ? WHERE id = ?",
      [cancelRemark, phNow, id]
    );
    
    await connection.commit();
    logAction(userId, 'CANCEL_OVERTIME', 'overtime_request', id, req);
    res.json({ success: true, message: "Request cancelled successfully." });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: "Server error." });
  } finally {
    connection.release();
  }
});



app.put('/api/attendance-appeals/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  const cancelReason = reason ? String(reason).trim() : '';
  if (cancelReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Cancellation reason is too long (maximum 500 characters).' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [userRows] = await connection.query(
      "SELECT id, employee_id FROM users WHERE id = ?",
      [userId]
    );
    
    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized user." });
    }

    const internalId = userRows[0].id;
    const empId = userRows[0].employee_id;

    const [rows] = await connection.query(
      "SELECT id, status FROM attendance_appeals WHERE id = ? AND (user_id = ? OR user_id = ?) FOR UPDATE",
      [id, internalId, empId]
    );
    
    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Request not found or unauthorized." });
    }
    if (String(rows[0].status).toLowerCase() !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Only pending requests can be cancelled." });
    }

    const cancelRemark = cancelReason ? `[Cancelled by User] Reason: ${cancelReason}` : '[Cancelled by User]';
    
    await connection.query(
      "UPDATE attendance_appeals SET status = 'cancelled', admin_remarks = ?, reviewed_at = ? WHERE id = ?",
      [cancelRemark, phNow, id]
    );
    
    await connection.commit();
    logAction(userId, 'CANCEL_APPEAL', 'attendance_appeal', id, req);
    res.json({ success: true, message: "Request cancelled successfully." });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ success: false, message: err.message || "Server error." });
  } finally {
    connection.release();
  }
});

app.put('/api/attendance/corrections/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const phNow = getPHDateTime();

  const cancelReason = reason ? String(reason).trim() : '';
  if (cancelReason.length > 500) {
    return res.status(400).json({ success: false, message: 'Cancellation reason is too long (maximum 500 characters).' });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    const [userRows] = await connection.query(
      "SELECT id, employee_id FROM users WHERE id = ?",
      [userId]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(403).json({ success: false, message: "Unauthorized user." });
    }

    const internalId = userRows[0].id;
    const empId = userRows[0].employee_id;

    
    const [rows] = await connection.query(
      "SELECT id, status, schedule_id, attendance_date FROM attendance_corrections WHERE id = ? AND (user_id = ? OR user_id = ?) FOR UPDATE",
      [id, internalId, empId]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: "Request not found or unauthorized." });
    }

    if (String(rows[0].status).toLowerCase() !== 'pending') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: "Only pending requests can be cancelled." });
    }

    const cancelRemark = cancelReason ? `[Cancelled by User] Reason: ${cancelReason}` : '[Cancelled by User]';

    await connection.query(
      "UPDATE attendance_corrections SET status = 'cancelled', admin_remarks = ?, reviewed_at = ? WHERE id = ?",
      [cancelRemark, phNow, id]
    );

    
    
if (rows[0].schedule_id) {
  await uvSyncCorrectionPending(
    connection,
    internalId,
    empId,
    rows[0].schedule_id,
    rows[0].attendance_date
  );
}


    await connection.commit();
    logAction(userId, 'CANCEL_CORRECTION', 'attendance_correction', id, req);
    res.json({ success: true, message: "Request cancelled successfully." });
  } catch (err) {
    await connection.rollback();
    console.error("Cancel Correction DB Error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error." });
  } finally {
    connection.release();
  }
});


// 1. Multer setup for Facility Image Uploads
const facilityDir = path.join(uploadsPath, 'facilities');
if (!fs.existsSync(facilityDir)) fs.mkdirSync(facilityDir, { recursive: true });

const uploadFacility = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, facilityDir),
    filename: (req, file, cb) => {
      const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, `facility_${unique}${path.extname(file.originalname)}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// 2. PUBLIC ENDPOINT: Fetch all landing page content
app.get('/api/public/landing-content', async (req, res) => {
  try {
    const [rows] = await db.promise().query("SELECT content_key, content_value FROM landing_content");
    const formatted = {};
    rows.forEach(r => {
      formatted[r.content_key] = typeof r.content_value === 'string' ? JSON.parse(r.content_value) : r.content_value;
    });
    res.json(formatted);
  } catch (err) {
    console.error("Failed to fetch landing content:", err);
    res.status(500).json({ error: "Could not load content" });
  }
});

app.put('/api/admin/landing-content/:key', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { key } = req.params;
  const { data } = req.body;

  
  const ALLOWED_KEYS = ['contact_details', 'courses_catalog', 'facilities_gallery'];
  if (!ALLOWED_KEYS.includes(key)) {
    return res.status(400).json({ error: 'Invalid content key provided.' });
  }

  try {
    await db.promise().query(
      "INSERT INTO landing_content (content_key, content_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE content_value = ?",
      [key, JSON.stringify(data), JSON.stringify(data)]
    );
    logAction(req.user.id, 'UPDATE_LANDING_CONTENT', 'landing_content', key, req);
    res.json({ success: true, message: 'Landing content updated successfully' });
  } catch (err) {
    console.error("Update landing content error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ADMIN ENDPOINT: Bulk Upload Facility Images (Supports 1 or multiple files)
app.post('/api/admin/landing/facilities/upload', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  uploadFacility.array('images', 20)(req, res, (err) => {
    if (err) {
      console.error("Facility upload error:", err);
      return res.status(400).json({ error: err.message });
    }

    const files = req.files || (req.file ? [req.file] : []);
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const urls = files.map(file => `/uploads/facilities/${file.filename}`);
    res.json({ success: true, urls, url: urls[0] });
  });
});


// Get system settings
app.get('/api/settings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  try {
    const [rows] = await db.promise().query("SELECT config_key, config_value FROM system_settings");
    const settings = {};
    rows.forEach(r => settings[r.config_key] = r.config_value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch settings.' });
  }
});


app.put('/api/settings', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'System Administrator access required.'
    });
  }

  const { loiter_threshold_minutes } = req.body || {};

  if (!uvConfigInteger(loiter_threshold_minutes, 1, 180)) {
    return res.status(400).json({
      success: false,
      message: 'Loitering threshold must be a whole number from 1 to 180.'
    });
  }

  try {
    await db.promise().query(
      `INSERT INTO system_settings
         (config_key, config_value)
       VALUES ('loiter_threshold_minutes', ?)
       ON DUPLICATE KEY UPDATE
         config_value = VALUES(config_value)`,
      [loiter_threshold_minutes]
    );

    logAction(
      req.user.id,
      'UPDATE_SETTINGS',
      'system_settings',
      null,
      req,
      null,
      { loiter_threshold_minutes }
    );

    return res.json({
      success: true,
      message: 'Visitor monitoring threshold updated.'
    });
  } catch (error) {
    console.error('System settings update failed:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to update visitor monitoring settings.'
    });
  }
});


app.get('/api/activity/recent', authenticateToken, async (req, res) => {
  if (!['admin', 'hr_admin', 'security'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden. You do not have permission to view recent activity.'
    });
  }

 
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.max(1, parseInt(req.query.limit) || 20);

  const sources = [];

  const loadSource = async (label, sql, params = []) => {
    try {
      const [rows] = await db.promise().query(sql, params);
      sources.push(...rows);
    } catch (err) {
      console.error(`Recent activity source "${label}" failed:`, err.message);
    }
  };

  try {
    await Promise.all([
      // Employee attendance
      loadSource('attendance', `
        SELECT
          CONCAT('attendance-', a.id) AS id,
          CASE
            WHEN a.time_out IS NOT NULL
              AND a.time_out <> '--:--'
              THEN 'CLOCK_OUT'
            WHEN a.time_in IS NOT NULL
              AND a.time_in <> '--:--'
              THEN 'CLOCK_IN'
            ELSE 'ATTENDANCE_UPDATED'
          END AS type,
          CASE
            WHEN a.time_out IS NOT NULL
              AND a.time_out <> '--:--'
              THEN 'Clock-out recorded'
            WHEN a.time_in IS NOT NULL
              AND a.time_in <> '--:--'
              THEN 'CLOCK-IN RECORDED'
            ELSE 'Attendance updated'
          END AS title,
          u.full_name AS actor,
          u.employee_id AS reference,
          a.status AS status,
          CONCAT(a.date, ' ',
            COALESCE(NULLIF(a.time_out, '--:--'), a.time_in, '00:00:00')
          ) AS occurred_at,
          'attendance' AS target
        FROM attendance a
        LEFT JOIN users u ON u.employee_id = a.user_id
        ORDER BY a.date DESC, a.time_in DESC
        LIMIT 100
      `),

      // Visitor appointment submissions and status changes
      loadSource('visitors', `
        SELECT
          CONCAT('visitor-', vr.id) AS id,
          CASE
            WHEN UPPER(COALESCE(vr.status, '')) = 'PENDING'
              THEN 'VISITOR_REQUEST'
            WHEN COALESCE(vr.arrived, 0) = 1
              THEN 'VISITOR_CHECK_IN'
            ELSE 'VISITOR_UPDATED'
          END AS type,
          CASE
            WHEN UPPER(COALESCE(vr.status, '')) = 'PENDING'
              THEN 'New visitor request submitted'
            WHEN COALESCE(vr.arrived, 0) = 1
              THEN 'Visitor checked in'
            ELSE CONCAT('Visitor request ', LOWER(COALESCE(vr.status, 'updated')))
          END AS title,
          TRIM(CONCAT(
            COALESCE(vr.first_name, ''),
            ' ',
            COALESCE(vr.last_name, '')
          )) AS actor,
          CAST(vr.id AS CHAR) AS reference,
          vr.status AS status,
          COALESCE(vr.arrived_at, vr.created_at, vr.visit_date) AS occurred_at,
          'manage-request' AS target
        FROM visitor_requests vr
        ORDER BY vr.id DESC
        LIMIT 100
      `),

      // Recruitment applications
      loadSource('applicants', `
        SELECT
          CONCAT('applicant-', ja.id) AS id,
          'NEW_APPLICANT' AS type,
          'New job application submitted' AS title,
          ja.full_name AS actor,
          jp.title AS reference,
          ja.status AS status,
          ja.applied_at AS occurred_at,
          'job-postings' AS target
        FROM job_applicants ja
        LEFT JOIN job_postings jp ON jp.id = ja.job_id
        ORDER BY ja.applied_at DESC
        LIMIT 100
      `),

      // Existing audit log covers many administrative actions.
      loadSource('audit_logs', `
        SELECT
          CONCAT('audit-', al.id) AS id,
          al.action AS type,
          REPLACE(
            REPLACE(al.action, '_', ' '),
            '-', ' '
          ) AS title,
          COALESCE(u.full_name, CONCAT('User #', al.user_id)) AS actor,
          CONCAT(
            COALESCE(al.target_type, 'system'),
            CASE
              WHEN al.target_id IS NOT NULL
                THEN CONCAT(' #', al.target_id)
              ELSE ''
            END
          ) AS reference,
          'Recorded' AS status,
          al.created_at AS occurred_at,
          al.target_type AS target
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.user_id
        ORDER BY al.created_at DESC
        LIMIT 200
      `)
    ]);

    // 2. Filter out items without usable timestamps and sort chronologically (newest first)
    const sortedActivities = sources
      .filter(item => item.occurred_at)
      .map(item => ({
        ...item,
        occurred_at: String(item.occurred_at)
      }))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));

    // 3. Calculate pagination values
    const totalLogs = sortedActivities.length;
    const totalPages = Math.ceil(totalLogs / limit) || 1;
    const offset = (page - 1) * limit;

    // 4. Slice the activities for the current page
    const paginatedActivities = sortedActivities.slice(offset, offset + limit);

    res.json({
      success: true,
      activities: paginatedActivities,
      pagination: {
        totalLogs,
        currentPage: page,
        totalPages,
        limit
      }
    });
  } catch (err) {
    console.error('Recent activity endpoint error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to load recent system activity.'
    });
  }
});

// ============================================
// MANUAL CTO CREDIT ENTRY (HR / Admin)
// ============================================
app.post('/api/leave-balances/manual-cto', authenticateToken, requireAction('cto:write'), async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR authorization required.' });
  }

  const { employee_id, credit_hours, reason, year } = req.body;
  const targetYear = parseInt(year, 10) || new Date().getFullYear();
  const hours = parseFloat(credit_hours);

  if (!employee_id || isNaN(hours) || hours <= 0 || !reason || !reason.trim()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Valid employee ID, positive credit hours, and detailed reason are required.' 
    });
  }

  // Convert hours to days (1 Day = 8 Hours)
  const creditDays = hours / 8;
  const phNow = getPHDateTime();

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    // 1. Resolve internal integer user ID
    const [userRows] = await connection.query(
      "SELECT id, full_name, employee_id FROM users WHERE employee_id = ? OR id = ?",
      [employee_id, employee_id]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const internalUserId = userRows[0].id;
    const resolvedEmpId = userRows[0].employee_id;
    const fullName = userRows[0].full_name;

    // 2. Resolve or create "Compensatory Paid Off" leave type ID
    let [typeRows] = await connection.query(
      `SELECT id FROM leave_types WHERE LOWER(name) LIKE '%compensatory%' OR name = 'CTO' LIMIT 1`
    );

    let leaveTypeId;
    if (typeRows.length > 0) {
      leaveTypeId = typeRows[0].id;
    } else {
      const [newType] = await connection.query(
        "INSERT INTO leave_types (name, annual_quota, is_active) VALUES ('Compensatory Paid Off', 0, 1)"
      );
      leaveTypeId = newType.insertId;
    }

    // 3. Ensure balance record exists
    await connection.query(
      `INSERT IGNORE INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated)
       VALUES (?, ?, 0, ?, CURDATE())`,
      [internalUserId, leaveTypeId, targetYear]
    );

    // 4. Increment balance (Source of Truth)
    await connection.query(
      `UPDATE employee_leave_balances 
       SET remaining_days = remaining_days + ?, last_updated = CURDATE() 
       WHERE user_id = ? AND leave_type_id = ? AND year = ?`,
      [creditDays, internalUserId, leaveTypeId, targetYear]
    );

    // 🔴 5. ADD RECORD TO CTO CREDITS LEDGER (Fixes the sync issue)
    await connection.query(
      `INSERT INTO cto_credits (user_id, employee_id, credit_hours, adjustment_days, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [internalUserId, resolvedEmpId, hours, creditDays, reason.trim(), phNow]
    );

    await connection.commit();

    // 6. Record audit log
    logAction(
      req.user.id, 
      'MANUAL_CTO_CREDIT', 
      'employee_leave_balances', 
      internalUserId, 
      req, 
      null, 
      { employee_id: resolvedEmpId, credit_hours: hours, credit_days: creditDays, reason: reason.trim(), year: targetYear }
    );

    res.json({
      success: true,
      message: `Successfully credited ${hours} hrs (${creditDays.toFixed(2)} days) CTO to ${fullName}.`
    });

  } catch (err) {
    await connection.rollback();
    console.error("Manual CTO Credit Error:", err);
    res.status(500).json({ success: false, message: 'Server error while processing CTO credit entry.' });
  } finally {
    connection.release();
  }
});


app.get('/api/cto-credits/:userId', authenticateToken, verifyOwnership, async (req, res) => {
  const { userId } = req.params;
  const year = parseInt(req.query.year, 10) || new Date().getFullYear();

  try {
    // Resolve both internal integer user_id and string employee_id
    const [userRows] = await db.promise().query(
      "SELECT id, employee_id FROM users WHERE id = ? OR employee_id = ?",
      [userId, userId]
    );

    if (userRows.length === 0) {
      return res.json({
        summary: { total_hours: 0, total_days: 0, used_days: 0, available_days: 0 },
        logs: []
      });
    }

    const internalUserId = userRows[0].id;
    const stringEmpId = userRows[0].employee_id;

    // Auto-create cto_credits table if it doesn't exist
    await db.promise().query(`
      CREATE TABLE IF NOT EXISTS cto_credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        credit_hours DECIMAL(10,2) DEFAULT 0.00,
        adjustment_days DECIMAL(10,3) DEFAULT 0.000,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1. Fetch the ACTUAL remaining balance from the source of truth
    const [balanceRows] = await db.promise().query(
      `SELECT remaining_days FROM employee_leave_balances 
       WHERE user_id = ? AND leave_type_id = (SELECT id FROM leave_types WHERE name = 'Compensatory Paid Off' LIMIT 1) AND year = ?`,
      [internalUserId, year]
    );
    const actualRemainingDays = balanceRows.length > 0 ? parseFloat(balanceRows[0].remaining_days) : 0;

    // 2. Fetch ledger logs matching either internal id or string employee_id
    const [logs] = await db.promise().query(
      `SELECT id, user_id, employee_id, credit_hours, adjustment_days AS days, reason AS description, 
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at 
       FROM cto_credits 
       WHERE (user_id = ? OR employee_id = ? OR user_id = ?) AND YEAR(created_at) = ? 
       ORDER BY created_at DESC`,
      [internalUserId, stringEmpId, stringEmpId, year]
    );

    // 3. Calculate totals purely for the ledger history UI
    let totalHours = 0;
    let totalDays = 0;
    let usedDays = 0;

    logs.forEach(log => {
      const days = parseFloat(log.days || 0);
      const hours = parseFloat(log.credit_hours || 0);
      if (days > 0) {
        totalDays += days;
        totalHours += hours;
      } else {
        usedDays += Math.abs(days);
      }
    });

    res.json({
      summary: {
        total_hours: totalHours,
        total_days: totalDays,
        used_days: usedDays,
        // 🔴 FIX: Use the true balance from the DB, not just the math from the logs
        available_days: actualRemainingDays < 0 ? 0 : actualRemainingDays 
      },
      logs
    });
  } catch (err) {
    console.error("Error fetching CTO credits:", err);
    res.status(500).json({ success: false, message: "Failed to retrieve CTO credits ledger." });
  }
});

// 2. POST Manual CTO Credit / Debit Adjustment
app.post('/api/cto-credits/:userId/adjust', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'hr_admin') {
    return res.status(403).json({ success: false, message: 'Forbidden. Admin or HR authorization required.' });
  }

  const { userId } = req.params;
  const { adjustment_days, credit_hours, reason, year } = req.body;
  const targetYear = parseInt(year, 10) || new Date().getFullYear();
  const days = parseFloat(adjustment_days);
  const hours = parseFloat(credit_hours);

  if (isNaN(days) || !reason || !reason.trim()) {
    return res.status(400).json({ 
      success: false, 
      message: 'Valid adjustment days and detailed reason are required.' 
    });
  }

  const connection = await db.promise().getConnection();
  await connection.beginTransaction();

  try {
    // Resolve employee user record
    const [userRows] = await connection.query(
      "SELECT id, employee_id, full_name FROM users WHERE id = ? OR employee_id = ?",
      [userId, userId]
    );

    if (userRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    const internalUserId = userRows[0].id;
    const stringEmpId = userRows[0].employee_id;

    // Ensure cto_credits table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS cto_credits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        credit_hours DECIMAL(10,2) DEFAULT 0.00,
        adjustment_days DECIMAL(10,3) DEFAULT 0.000,
        reason TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 1. Insert transaction log into cto_credits
    await connection.query(
      `INSERT INTO cto_credits (user_id, employee_id, credit_hours, adjustment_days, reason, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [internalUserId, stringEmpId, hours || (days * 8), days, reason.trim()]
    );

    // 2. Resolve or create "Compensatory Paid Off" leave type
    let [typeRows] = await connection.query(
      `SELECT id FROM leave_types WHERE LOWER(name) LIKE '%compensatory%' OR name = 'CTO' LIMIT 1`
    );

    let leaveTypeId;
    if (typeRows.length > 0) {
      leaveTypeId = typeRows[0].id;
    } else {
      const [newType] = await connection.query(
        "INSERT INTO leave_types (name, annual_quota, is_active) VALUES ('Compensatory Paid Off', 0, 1)"
      );
      leaveTypeId = newType.insertId;
    }

    // 3. Update main employee_leave_balances record
    await connection.query(
      `INSERT INTO employee_leave_balances (user_id, leave_type_id, remaining_days, year, last_updated)
       VALUES (?, ?, ?, ?, CURDATE())
       ON DUPLICATE KEY UPDATE remaining_days = remaining_days + VALUES(remaining_days), last_updated = CURDATE()`,
      [internalUserId, leaveTypeId, days, targetYear]
    );

    await connection.commit();

    logAction(req.user.id, 'ADJUST_CTO_CREDIT', 'cto_credits', internalUserId, req, null, {
      employee_id: stringEmpId,
      adjustment_days: days,
      credit_hours: hours,
      reason: reason.trim(),
      year: targetYear
    });

    res.json({
      success: true,
      message: `CTO adjustment of ${days > 0 ? '+' : ''}${days} day(s) successfully recorded.`
    });

  } catch (err) {
    await connection.rollback();
    console.error("CTO Adjustment Error:", err);
    res.status(500).json({ success: false, message: 'Server error while processing CTO adjustment.' });
  } finally {
    connection.release();
  }
});

const createLivePositionsTable = `
  CREATE TABLE IF NOT EXISTS visitor_live_positions (
    ble_id VARCHAR(50) PRIMARY KEY,
    x DECIMAL(10,2),
    y DECIMAL(10,2),
    floor VARCHAR(10),
    current_room VARCHAR(100),
    destination VARCHAR(100),
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`;
db.query(createLivePositionsTable, (err) => {
  if (err) console.error('Failed to create visitor_live_positions table:', err);
});


// ============================================
// WEBSOCKET SERVER & SERVER INITIALIZATION
// ============================================


app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error("Middleware Error:", err.message);
  return res.status(400).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`UniVITA Backend running on http://0.0.0.0:${PORT}`);
});

const wss = new WebSocket.Server({ server, maxPayload: 16 * 1024 });



wss.on('connection', (ws, req) => {
  const params = url.parse(req.url, true).query;
  const token = params.token;
  
  if (!token) {
    return ws.close(4001, 'Authentication token missing');
  }
  
  try {
    
const decoded = jwt.verify(token, JWT_SECRET);

if (
  decoded.purpose !== 'session' ||
  !decoded.id ||
  !['admin', 'hr_admin', 'security', 'instructor'].includes(decoded.role)
) {
  return ws.close(4003, 'Authenticated session required');
}

const userId = decoded.id;

    
    db.query(
  `SELECT
    id,
    email,
    role,
    full_name,
    employee_id
   FROM users
   WHERE id = ?
     AND status = 'active'
     AND employment_status = 'active'`,
  [userId],
  (err, rows) => {
    if (
      err ||
      rows.length === 0 ||
      rows[0].role !== decoded.role
    ) {
      return ws.close(4001, 'User not found or inactive');
    }

    const user = rows[0];

    ws.user = user;

   
    if (!wsClients.has(user.id)) {
      wsClients.set(user.id, new Set());
    }

    wsClients.get(user.id).add(ws);
      ws.on('error', socketErr => console.error('Chat websocket error:', socketErr.message));
      
      ws.on('message', (data) => {
        let msgData;
        try {
          msgData = JSON.parse(data.toString());
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid chat message format.' }));
          return;
        }
        if (!msgData || typeof msgData !== 'object' || Array.isArray(msgData)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid chat message format.' }));
          return;
        }
        
        if (msgData.type === 'message') {
          const roomId = Number(msgData.roomId);
          const content = typeof msgData.content === 'string' ? msgData.content.trim() : '';
          if (!Number.isSafeInteger(roomId) || roomId < 1) {
            ws.send(JSON.stringify({ type: 'error', message: 'Choose a valid conversation.' }));
            return;
          }
          if (!content) {
            ws.send(JSON.stringify({ type: 'error', message: 'Type a message before sending.' }));
            return;
          }
          if (content.length > 2000) {
            ws.send(JSON.stringify({ type: 'error', message: 'Messages can be up to 2,000 characters.' }));
            return;
          }

          authorizeChatRoom(roomId, user, (accessErr, allowed, status, room) => {
            if (accessErr) {
              ws.send(JSON.stringify({ type: 'error', message: 'Could not verify conversation access. Please try again.' }));
              return;
            }
            if (!allowed) {
              ws.send(JSON.stringify({ type: 'error', message: status === 404 ? 'Conversation not found.' : 'You are not a member of this conversation.' }));
              return;
            }

            db.query("INSERT INTO chat_messages (room_id, user_id, message) VALUES (?, ?, ?)", [roomId, user.id, content], (err, result) => {
              if (err) {
                ws.send(JSON.stringify({ type: 'error', message: 'Message could not be sent. Please try again.' }));
                return;
              }

              const messageObj = {
  id: result.insertId,
  room_id: roomId,
  user_id: user.id,
  full_name: user.full_name,
  employee_id: user.employee_id,
  message: content,
  sent_at: new Date().toISOString()
};
              const broadcast = (recipientIds) => {
  recipientIds.forEach(recipientId => {
    const sockets = wsClients.get(Number(recipientId));

    sockets?.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'new_message',
          message: messageObj
        }));
      }
    });
  });
};

              
if (room.type === 'direct') {
  // Send only to the two direct-message participants.
  const match = /^dm_(\d+)_(\d+)$/.exec(room.name);

  if (!match) {
    console.error('Invalid direct-message room name:', room.name);
    return;
  }

  const recipientIds = [
    Number(match[1]),
    Number(match[2])
  ];

  broadcast(recipientIds);

} else if (room.type === 'group') {
  
  db.query(
    "SELECT user_id FROM chat_room_members WHERE room_id = ?",
    [roomId],
    (memberErr, members) => {
      if (memberErr) {
        console.error(
          'Could not retrieve group recipients:',
          memberErr.message
        );
        return;
      }

      const recipientIds = [
        ...new Set(members.map(member => Number(member.user_id)))
      ];

      broadcast(recipientIds);
    }
  );
}

            });
          });
        }
      });
      
      ws.on('close', () => {
  const sockets = wsClients.get(user.id);

  if (!sockets) return;

 
  sockets.delete(ws);

  
  if (sockets.size === 0) {
    wsClients.delete(user.id);
  }
});
    });
  } catch (err) {
    ws.close(4001, 'Invalid token');
  }
});
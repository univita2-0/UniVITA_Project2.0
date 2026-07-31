const { authenticateToken, checkRole } = require('./middleware/auth');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const pool = require('./database');

// Routes
const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const alertRoutes = require('./routes/alertRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Security & middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(morgan('combined', { stream: logger.stream }));
app.use('/uploads', express.static('uploads'));

// Rate limiting
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, message: { error: 'Too many requests' } });
const unreadLimiter = rateLimit({ windowMs: 10 * 1000, max: 10 });
app.use('/api/', (req, res, next) => {
  if (req.path === '/chat/unread-counts') return unreadLimiter(req, res, next);
  globalLimiter(req, res, next);
});

// Modular routes
app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/leave', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/visitors', visitorRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ============================================
// MISSING ENDPOINTS (from old server.js)
// ============================================

// 1. Attendance report (daily)
app.get('/api/attendance-report', authenticateToken, async (req, res) => {
  const { date } = req.query;
  const sql = `
    SELECT u.id, u.full_name, u.employee_id, a.status, a.time_in, a.time_out, a.location,
           s.start_time AS scheduled_start, s.end_time AS scheduled_end,
           DATE_FORMAT(COALESCE(a.date, s.date, ?), '%Y-%m-%d') AS attendance_date,
           COALESCE(ROUND(TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60, 2), 0) AS total_hours,
           COALESCE(ROUND((TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60) * (u.monthly_salary / u.work_days_per_month / 8), 2), 0) AS gross_pay,
           COALESCE(ROUND(((TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60) * (u.monthly_salary / u.work_days_per_month / 8)) * 0.10, 2), 0) AS tax_deduction,
           COALESCE(ROUND(((TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60) * (u.monthly_salary / u.work_days_per_month / 8)) * 0.90, 2), 0) AS net_pay
    FROM users u
    LEFT JOIN schedules s ON u.employee_id = s.user_id AND DATE(s.date) = DATE(?)
    LEFT JOIN attendance a ON u.employee_id = a.user_id AND DATE(a.date) = DATE(?)
    WHERE LOWER(u.role) = 'instructor' AND u.status = 'active'
    ORDER BY u.full_name ASC
  `;
  try {
    const [rows] = await pool.query(sql, [date, date, date]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Attendance report for single user
app.get('/api/attendance-report-user/:employeeId', authenticateToken, async (req, res) => {
  const { employeeId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT *, DATE_FORMAT(date, '%Y-%m-%d') as date, ROUND(TIMESTAMPDIFF(MINUTE, time_in, time_out) / 60, 2) as total_hours
       FROM attendance WHERE user_id = ? ORDER BY date DESC`,
      [employeeId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Monthly attendance summary
app.get('/api/attendance-monthly', authenticateToken, async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required' });
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  try {
    const [rows] = await pool.query(`
      SELECT u.employee_id, u.full_name,
        COALESCE(SUM(TIMESTAMPDIFF(MINUTE, a.time_in, a.time_out) / 60), 0) as regular_hours,
        0 as overtime_hours,
        COALESCE(SUM(CASE WHEN a.status = 'on leave' THEN 1 ELSE 0 END), 0) as leave_days
      FROM users u
      LEFT JOIN attendance a ON u.employee_id = a.user_id 
        AND a.date BETWEEN ? AND ? AND a.status != 'on leave'
      WHERE u.role = 'instructor' AND u.status = 'active'
      GROUP BY u.id
    `, [startDate, endDate]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Events (calendar)
app.get('/api/events', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, title, DATE_FORMAT(date, '%Y-%m-%d') as date, place, start_time, end_time, type, description, 'None' as status FROM events
      UNION ALL
      SELECT lr.id, CONCAT(u.full_name, ' (', lr.type, ')') as title, DATE_FORMAT(lr.request_date, '%Y-%m-%d') as date,
             'Leave' as place, '08:00:00' as start_time, '17:00:00' as end_time,
             lr.type as type, lr.reason as description, lr.status
      FROM leave_requests lr JOIN users u ON lr.user_id = u.employee_id
      WHERE lr.is_hidden = 0
      ORDER BY date ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Create event
app.post('/api/events', authenticateToken, async (req, res) => {
  const { title, date, place, start_time, end_time, type, description } = req.body;
  try {
    await pool.query(
      `INSERT INTO events (title, date, place, start_time, end_time, type, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title, date, place, start_time || null, end_time || null, type, description || null]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update event
app.put('/api/events/:id', authenticateToken, async (req, res) => {
  const { title, date, place, start_time, end_time, type, description } = req.body;
  try {
    await pool.query(
      `UPDATE events SET title=?, date=?, place=?, start_time=?, end_time=?, type=?, description=?
       WHERE id=?`,
      [title, date, place, start_time, end_time, type, description, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete event
app.delete('/api/events/:id', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Emergency alerts: list all (admin/hr)
app.get('/api/emergency-alerts', authenticateToken, checkRole(['admin', 'hr_admin']), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM emergency_alerts ORDER BY sent_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Emergency alerts: active for user
app.get('/api/emergency-alerts/active', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.title, a.message, a.severity, a.sent_at, ar.read_at
      FROM alert_receipts ar
      JOIN emergency_alerts a ON ar.alert_id = a.id
      WHERE ar.user_id = ? AND a.is_active = 1 AND (a.expires_at IS NULL OR a.expires_at > NOW())
      ORDER BY a.sent_at DESC
    `, [userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Mark alert as read
app.post('/api/emergency-alerts/:id/read', authenticateToken, async (req, res) => {
  const alertId = req.params.id;
  const userId = req.user.id;
  try {
    await pool.query(
      'UPDATE alert_receipts SET read_at = NOW() WHERE alert_id = ? AND user_id = ?',
      [alertId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Attendance appeals: pending
app.get('/api/attendance-appeals/pending', authenticateToken, checkRole(['admin', 'hr_admin']), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, u.full_name, u.employee_id
      FROM attendance_appeals a
      JOIN users u ON a.user_id = u.employee_id
      WHERE a.status = 'pending'
      ORDER BY a.submitted_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Attendance appeals: history
app.get('/api/attendance-appeals/history', authenticateToken, checkRole(['admin', 'hr_admin']), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, u.full_name, u.employee_id
      FROM attendance_appeals a
      JOIN users u ON a.user_id = u.employee_id
      WHERE a.status IN ('approved', 'rejected')
      ORDER BY a.submitted_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Update appeal status
app.put('/api/attendance-appeals/:id/status', authenticateToken, checkRole(['admin', 'hr_admin']), async (req, res) => {
  const { id } = req.params;
  const { status, admin_remarks } = req.body;
  try {
    await pool.query('UPDATE attendance_appeals SET status = ?, admin_remarks = ? WHERE id = ?', [status, admin_remarks || null, id]);
    // Also update attendance if approved (similar to old logic)
    if (status === 'approved') {
      const [appeal] = await pool.query('SELECT user_id, date FROM attendance_appeals WHERE id = ?', [id]);
      if (appeal) {
        const [schedule] = await pool.query('SELECT start_time, end_time FROM schedules WHERE user_id = ? AND date = ?', [appeal.user_id, appeal.date]);
        let start_time = schedule?.start_time || null;
        let end_time = schedule?.end_time || null;
        let total_hours = 0;
        if (start_time && end_time) {
          total_hours = (new Date(`1970-01-01T${end_time}`) - new Date(`1970-01-01T${start_time}`)) / 3600000;
        }
        await pool.query(
          `INSERT INTO attendance (user_id, date, time_in, time_out, status, location, total_hours)
           VALUES (?, ?, ?, ?, 'Present', 'Appeal Approved', ?)
           ON DUPLICATE KEY UPDATE time_in=VALUES(time_in), time_out=VALUES(time_out), status='Present', total_hours=VALUES(total_hours)`,
          [appeal.user_id, appeal.date, start_time, end_time, total_hours]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Payroll unlock (PIN check)
app.post('/api/payroll/unlock', authenticateToken, async (req, res) => {
  const { pin } = req.body;
  const userId = req.user.id;
  try {
    const [user] = await pool.query('SELECT payroll_pin FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.payroll_pin === pin) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Invalid PIN' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Dashboard summary
app.get('/api/dashboard/summary', authenticateToken, async (req, res) => {
  try {
    const [leaves] = await pool.query("SELECT COUNT(*) as count FROM leave_requests WHERE status = 'Pending'");
    const [present] = await pool.query("SELECT COUNT(*) as count FROM attendance WHERE date = CURDATE()");
    const [events] = await pool.query("SELECT COUNT(*) as count FROM events WHERE date = CURDATE()");
    res.json({ pendingLeaves: leaves[0]?.count || 0, presentToday: present[0]?.count || 0, eventsToday: events[0]?.count || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Public job listings
app.get('/api/jobs', async (req, res) => {
  try {
    const [jobs] = await pool.query(
      `SELECT id, title, department, description, employment_type, created_at
       FROM job_postings WHERE status = 'open' ORDER BY created_at DESC`
    );
    res.json(jobs || []);
  } catch (err) {
    res.json([]);
  }
});

// 17. School locations and courses
app.get('/api/school-locations', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM school_locations');
  res.json(rows);
});
app.get('/api/courses', async (req, res) => {
  const [rows] = await pool.query('SELECT id, name FROM courses');
  res.json(rows);
});

// Backward compatibility redirects
app.get('/api/ble-tags', (req, res) => res.redirect('/api/visitors/ble-tags'));
app.get('/api/public/jobs', (req, res) => res.redirect('/api/jobs'));
app.get('/api/leave-requests/all', (req, res) => res.redirect('/api/leave/all'));
app.get('/api/leave-types', (req, res) => res.redirect('/api/leave/types'));

// Error handler
app.use(errorHandler);

module.exports = app;
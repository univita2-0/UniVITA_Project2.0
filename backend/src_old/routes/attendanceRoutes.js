const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { clockIn, clockOut, getUserAttendance } = require('../controllers/attendanceController');
const { uploadSelfie } = require('../middleware/upload');   // ← correct import
const { validateClockIn, validateClockOut } = require('../validators/validators');

const router = express.Router();

router.post('/clock-in', authenticateToken, uploadSelfie.single('selfie'), validateClockIn, clockIn);
router.post('/clock-out', authenticateToken, uploadSelfie.single('selfie'), validateClockOut, clockOut);
router.get('/user/:employeeId', authenticateToken, getUserAttendance);

module.exports = router;
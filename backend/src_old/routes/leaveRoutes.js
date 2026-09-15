const express = require('express');
const { authenticateToken, checkRole } = require('../middleware/auth');
const leaveController = require('../controllers/leaveController');
const { validateLeaveRequest, validateLeaveStatus } = require('../validators/validators');
const { uploadLeave } = require('../middleware/upload');

const router = express.Router();

// Employee (instructor) routes
router.post('/', authenticateToken, uploadLeave.single('image'), validateLeaveRequest, leaveController.createLeaveRequest);
router.get('/my', authenticateToken, leaveController.getMyLeaveRequests);
router.get('/balance/:userId', authenticateToken, leaveController.getLeaveBalance);

// Admin/HR routes
router.get('/all', authenticateToken, checkRole(['admin', 'hr_admin']), leaveController.getAllLeaveRequests);
router.put('/:id/status', authenticateToken, checkRole(['admin', 'hr_admin']), validateLeaveStatus, leaveController.updateLeaveStatus);
router.put('/:id/dismiss', authenticateToken, checkRole(['admin', 'hr_admin']), leaveController.dismissLeaveRequest);
router.get('/types', authenticateToken, leaveController.getLeaveTypes); // public to authenticated
router.put('/balance/:userId', authenticateToken, checkRole(['admin', 'hr_admin']), leaveController.updateLeaveBalance);

module.exports = router;
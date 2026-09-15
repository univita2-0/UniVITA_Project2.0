const express = require('express');
const { authenticateToken, checkRole } = require('../middleware/auth');
const scheduleController = require('../controllers/scheduleController');
const { validateSchedule, validateScheduleRequest } = require('../validators/validators');

const router = express.Router();

// Get schedule for a specific employee (instructor can see own)
router.get('/user/:employeeId', authenticateToken, scheduleController.getUserSchedules);

// Instructor requests (schedule change)
router.post('/requests', authenticateToken, validateScheduleRequest, scheduleController.createScheduleRequest);
router.get('/requests/my', authenticateToken, scheduleController.getMyRequests);

// Admin/HR routes
router.use(authenticateToken, checkRole(['admin', 'hr_admin']));
router.post('/', validateSchedule, scheduleController.createSchedule);
router.put('/:id', validateSchedule, scheduleController.updateSchedule);
router.delete('/:id', scheduleController.deleteSchedule);
router.get('/requests/pending', scheduleController.getPendingRequests);
router.put('/requests/:id/status', scheduleController.updateRequestStatus);

module.exports = router;
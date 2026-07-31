const express = require('express');
const { authenticateToken, checkRole } = require('../middleware/auth');
const alertController = require('../controllers/alertController');
const { validateAlert } = require('../validators/validators');

const router = express.Router();

// User routes (authenticated)
router.get('/active', authenticateToken, alertController.getActiveAlerts);
router.post('/:id/read', authenticateToken, alertController.markAsRead);

// Admin/HR routes
router.post('/', authenticateToken, checkRole(['admin', 'hr_admin']), validateAlert, alertController.createAlert);
router.get('/all', authenticateToken, checkRole(['admin', 'hr_admin']), alertController.getAllAlerts);

module.exports = router;
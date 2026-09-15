const express = require('express');
const { authenticateToken, checkRole } = require('../middleware/auth');
const { generatePayroll, getPayrollHistory } = require('../controllers/payrollController');

const router = express.Router();

router.post('/generate', authenticateToken, checkRole(['admin', 'hr_admin']), generatePayroll);
router.get('/history', authenticateToken, checkRole(['admin', 'hr_admin']), getPayrollHistory);

module.exports = router;
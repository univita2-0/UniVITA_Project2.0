const express = require('express');
const { authenticateToken, checkRole } = require('../middleware/auth');
const employeeController = require('../controllers/employeeController');
const { validateEmployee, validateEmployeeUpdate } = require('../validators/validators');

const router = express.Router();

// All employee routes require admin or HR role
router.use(authenticateToken, checkRole(['admin', 'hr_admin']));

router.get('/', employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', validateEmployee, employeeController.createEmployee);
router.put('/:id', validateEmployeeUpdate, employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);
router.put('/:employeeId/toggle-status', employeeController.toggleStatus);

module.exports = router;
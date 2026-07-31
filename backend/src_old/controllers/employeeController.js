const pool = require('../database');
const bcrypt = require('bcrypt');

exports.getAllEmployees = async (req, res) => {
  try {
    const [employees] = await pool.query(
      `SELECT id, employee_id, full_name, email, role, status, 
              employment_type, position_level, contract_type, 
              monthly_salary, work_days_per_month, payroll_access 
       FROM users 
       ORDER BY full_name`
    );
    console.log(`✅ Fetched ${employees.length} employees`);
    res.json(employees);
  } catch (err) {
    console.error('❌ Error fetching employees:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

exports.getEmployeeById = async (req, res) => {
  const { id } = req.params;
  try {
    const [employee] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    delete employee.password;
    res.json(employee);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.createEmployee = async (req, res) => {
  const { employee_id, full_name, email, password, role, employment_type, position_level, contract_type, monthly_salary, work_days_per_month, payroll_access, payroll_pin } = req.body;
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE employee_id = ? OR email = ?', [employee_id, email]);
    if (existing) return res.status(400).json({ error: 'Employee ID or email already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (employee_id, full_name, email, password, role, status, employment_type, position_level, contract_type, monthly_salary, work_days_per_month, payroll_access, payroll_pin)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`,
      [employee_id, full_name, email, hashedPassword, role, employment_type || 'Full-time', position_level || 'Entry Level Simulationist', contract_type || 'Regular', monthly_salary || 30000, work_days_per_month || 22, payroll_access || 0, payroll_pin || '1234']
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.updateEmployee = async (req, res) => {
  const { id } = req.params;
  const updates = [];
  const values = [];
  const allowed = ['full_name', 'role', 'employment_type', 'position_level', 'contract_type', 'monthly_salary', 'work_days_per_month', 'payroll_access', 'payroll_pin'];
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(id);
  try {
    await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  const { id } = req.params;
  try {
    const [user] = await pool.query('SELECT role FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'instructor') return res.status(400).json({ error: 'Only instructors can be deleted' });
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.toggleStatus = async (req, res) => {
  const { employeeId } = req.params;
  try {
    const [user] = await pool.query('SELECT status FROM users WHERE employee_id = ?', [employeeId]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newStatus = user.status === 'active' ? 'deactivated' : 'active';
    await pool.query('UPDATE users SET status = ? WHERE employee_id = ?', [newStatus, employeeId]);
    res.json({ success: true, newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};
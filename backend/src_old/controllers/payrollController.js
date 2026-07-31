const pool = require('../database');
const { calculatePayroll } = require('../services/payrollService');

exports.generatePayroll = async (req, res) => {
  const { month, year } = req.body;
  if (!month || !year) return res.status(400).json({ error: 'Month and year required' });

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const instructors = await pool.query(
    'SELECT id, employee_id, monthly_salary, work_days_per_month FROM users WHERE role = "instructor" AND status = "active"'
  );

  for (const instructor of instructors) {
    const attendance = await pool.query(
      `SELECT time_in, time_out, status FROM attendance 
       WHERE user_id = ? AND date BETWEEN ? AND ? AND status != 'on leave'`,
      [instructor.employee_id, startDate, endDate]
    );

    let totalMinutes = 0;
    for (const a of attendance) {
      if (a.time_in && a.time_out) {
        const minutes = (new Date(`1970-01-01T${a.time_out}`) - new Date(`1970-01-01T${a.time_in}`)) / 60000;
        totalMinutes += Math.max(0, minutes);
      }
    }
    const totalHours = totalMinutes / 60;
    const payrollData = calculatePayroll(instructor.monthly_salary, instructor.work_days_per_month, totalHours);

    const [existing] = await pool.query('SELECT id FROM payroll WHERE user_id = ? AND month_year = ?', [instructor.id, `${month}/${year}`]);
    if (existing) {
      await pool.query(
        `UPDATE payroll SET total_hours = ?, gross_pay = ?, tax_deduction = ?, sss_deduction = ?, philhealth_deduction = ?, pagibig_deduction = ?, net_pay = ?, status = 'pending' WHERE id = ?`,
        [totalHours, payrollData.grossPay, payrollData.tax, payrollData.sss, payrollData.philhealth, payrollData.pagibig, payrollData.netPay, existing.id]
      );
    } else {
      await pool.query(
        `INSERT INTO payroll (user_id, month_year, total_hours, gross_pay, tax_deduction, sss_deduction, philhealth_deduction, pagibig_deduction, net_pay, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [instructor.id, `${month}/${year}`, totalHours, payrollData.grossPay, payrollData.tax, payrollData.sss, payrollData.philhealth, payrollData.pagibig, payrollData.netPay]
      );
    }
  }
  res.json({ success: true });
};

exports.getPayrollHistory = async (req, res) => {
  const payroll = await pool.query(
    `SELECT p.*, u.full_name, u.employee_id FROM payroll p 
     JOIN users u ON p.user_id = u.id ORDER BY p.id DESC`
  );
  res.json(payroll);
};
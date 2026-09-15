// Philippine tax brackets (simplified for capstone, adjust as needed)
function calculateTax(grossMonthly) {
  if (grossMonthly <= 20833) return 0;
  if (grossMonthly <= 33333) return (grossMonthly - 20833) * 0.15;
  if (grossMonthly <= 66667) return 1875 + (grossMonthly - 33333) * 0.20;
  if (grossMonthly <= 166667) return 8542 + (grossMonthly - 66667) * 0.25;
  if (grossMonthly <= 666667) return 33542 + (grossMonthly - 166667) * 0.30;
  return 183542 + (grossMonthly - 666667) * 0.35;
}

function calculatePayroll(monthlySalary, workDaysPerMonth, totalHoursWorked) {
  const dailyRate = monthlySalary / workDaysPerMonth;
  const hourlyRate = dailyRate / 8;
  const grossPay = totalHoursWorked * hourlyRate;

  // Simulate monthly gross for tax (pro‑rated)
  const projectedMonthly = (grossPay / totalHoursWorked) * (workDaysPerMonth * 8) || 0;
  const tax = calculateTax(projectedMonthly) * (totalHoursWorked / (workDaysPerMonth * 8));

  // Government contributions (fixed approximations)
  const sss = Math.min(grossPay * 0.045, 900);
  const philhealth = grossPay * 0.03;
  const pagibig = Math.min(grossPay * 0.02, 100);

  const netPay = grossPay - tax - sss - philhealth - pagibig;
  return { grossPay, tax, sss, philhealth, pagibig, netPay };
}

module.exports = { calculatePayroll };
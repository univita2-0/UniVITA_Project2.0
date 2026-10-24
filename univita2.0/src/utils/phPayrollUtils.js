// src/utils/phPayrollUtils.js

// Philippine TRAIN Law Monthly Tax Brackets (2024/2025)
export const computeMonthlyTax = (taxableIncome) => {
  const taxTable = [
    { min: 0, max: 20833, rate: 0, base: 0 },
    { min: 20833, max: 33332, rate: 0.15, base: 0 },
    { min: 33332, max: 66666, rate: 0.20, base: 1875 }, 
    { min: 66666, max: 166666, rate: 0.25, base: 8541.67 }, 
    { min: 166666, max: 666666, rate: 0.30, base: 33541.67 },
    { min: 666666, max: Infinity, rate: 0.35, base: 183541.67 }, 
  ];
  for (let bracket of taxTable) {
    if (taxableIncome > bracket.min && taxableIncome <= bracket.max) {
      return bracket.base + (taxableIncome - bracket.min) * bracket.rate;
    }
  }
  return 0;
};

// SSS Employee Share (4.5%) based on Monthly Salary Credit (MSC) Stepped Table
export const computeSSS = (monthlySalary) => {
  if (monthlySalary <= 0) return 0;
  const mscTable = [
    { min: 0, max: 4249.99, msc: 4000 }, { min: 4250, max: 4749.99, msc: 4500 },
    { min: 4750, max: 5249.99, msc: 5000 }, { min: 5250, max: 5749.99, msc: 5500 },
    { min: 5750, max: 6249.99, msc: 6000 }, { min: 6250, max: 6749.99, msc: 6500 },
    { min: 6750, max: 7249.99, msc: 7000 }, { min: 7250, max: 7749.99, msc: 7500 },
    { min: 7750, max: 8249.99, msc: 8000 }, { min: 8250, max: 8749.99, msc: 8500 },
    { min: 8750, max: 9249.99, msc: 9000 }, { min: 9250, max: 9749.99, msc: 9500 },
    { min: 9750, max: 10249.99, msc: 10000 }, { min: 10250, max: 10749.99, msc: 10500 },
    { min: 10750, max: 11249.99, msc: 11000 }, { min: 11250, max: 11749.99, msc: 11500 },
    { min: 11750, max: 12249.99, msc: 12000 }, { min: 12250, max: 12749.99, msc: 12500 },
    { min: 12750, max: 13249.99, msc: 13000 }, { min: 13250, max: 13749.99, msc: 13500 },
    { min: 13750, max: 14249.99, msc: 14000 }, { min: 14250, max: 14749.99, msc: 14500 },
    { min: 14750, max: 15249.99, msc: 15000 }, { min: 15250, max: 15749.99, msc: 15500 },
    { min: 15750, max: 16249.99, msc: 16000 }, { min: 16250, max: 16749.99, msc: 16500 },
    { min: 16750, max: 17249.99, msc: 17000 }, { min: 17250, max: 17749.99, msc: 17500 },
    { min: 17750, max: 18249.99, msc: 18000 }, { min: 18250, max: 18749.99, msc: 18500 },
    { min: 18750, max: 19249.99, msc: 19000 }, { min: 19250, max: 19749.99, msc: 19500 },
    { min: 19750, max: 20249.99, msc: 20000 }, { min: 20250, max: 20749.99, msc: 20500 },
    { min: 20750, max: 21249.99, msc: 21000 }, { min: 21250, max: 21749.99, msc: 21500 },
    { min: 21750, max: 22249.99, msc: 22000 }, { min: 22250, max: 22749.99, msc: 22500 },
    { min: 22750, max: 23249.99, msc: 23000 }, { min: 23250, max: 23749.99, msc: 23500 },
    { min: 23750, max: 24249.99, msc: 24000 }, { min: 24250, max: 24749.99, msc: 24500 },
    { min: 24750, max: 25249.99, msc: 25000 }, { min: 25250, max: 25749.99, msc: 25500 },
    { min: 25750, max: 26249.99, msc: 26000 }, { min: 26250, max: 26749.99, msc: 26500 },
    { min: 26750, max: 27249.99, msc: 27000 }, { min: 27250, max: 27749.99, msc: 27500 },
    { min: 27750, max: 28249.99, msc: 28000 }, { min: 28250, max: 28749.99, msc: 28500 },
    { min: 28750, max: 29249.99, msc: 29000 }, { min: 29250, max: 29749.99, msc: 29500 },
    { min: 29750, max: 30249.99, msc: 30000 }, { min: 30250, max: 30749.99, msc: 30500 },
    { min: 30750, max: 31249.99, msc: 31000 }, { min: 31250, max: 31749.99, msc: 31500 },
    { min: 31750, max: 32249.99, msc: 32000 }, { min: 32250, max: 32749.99, msc: 32500 },
    { min: 32750, max: 33249.99, msc: 33000 }, { min: 33250, max: 33749.99, msc: 33500 },
    { min: 33750, max: 34249.99, msc: 34000 }, { min: 34250, max: 34749.99, msc: 34500 },
    { min: 34750, max: Infinity, msc: 35000 }
  ];

  let msc = 5000;
  if (monthlySalary < 5000) msc = 5000;
  else if (monthlySalary >= 34750) msc = 35000;
  else {
    const bracket = mscTable.find(b => monthlySalary >= b.min && monthlySalary <= b.max);
    if (bracket) msc = bracket.msc;
  }
  return msc * 0.045; // 4.5% employee share
};

// PhilHealth Employee Share (2.5%) with 10k Floor and 100k Ceiling
export const computePhilHealth = (monthlySalary) => {
  if (monthlySalary <= 0) return 0;
  let base = monthlySalary;
  if (base < 10000) base = 10000;
  if (base > 100000) base = 100000;
  return (base * 0.05) / 2; // 5% total, split into employee share
};

// Pag-IBIG Employee Share (2%) capped at 5,000 Max Fund Salary (Max 100)
export const computePagIbig = (monthlySalary) => {
  if (monthlySalary <= 0) return 0;
  let base = monthlySalary;
  if (base > 5000) base = 5000;
  return base * 0.02; // 2% employee share, max 100
};
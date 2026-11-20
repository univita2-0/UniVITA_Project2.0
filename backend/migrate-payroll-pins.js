
require('dotenv').config();

const db = require('./db');
const bcrypt = require('bcrypt');

async function migratePayrollPins() {
  try {
    const [users] = await db.promise().query(
      'SELECT id, payroll_pin FROM users WHERE payroll_pin IS NOT NULL'
    );

    let migrated = 0;
    let reset = 0;
    let skipped = 0;

    for (const user of users) {
      const pin = user.payroll_pin;

      if (/^\$2[aby]\$\d{2}\$/.test(pin)) {
        skipped++;
        continue;
      }

      if (pin === '1234' || !/^\d{4,6}$/.test(pin)) {
        const [result] = await db.promise().query(
          'UPDATE users SET payroll_pin = NULL WHERE id = ? AND payroll_pin = ?',
          [user.id, pin]
        );
        reset += result.affectedRows;
        continue;
      }

      const hashedPin = await bcrypt.hash(pin, 12);

      const [result] = await db.promise().query(
        'UPDATE users SET payroll_pin = ? WHERE id = ? AND payroll_pin = ?',
        [hashedPin, user.id, pin]
      );

      migrated += result.affectedRows;
    }

    console.log('Payroll PIN migration completed.');
    console.log('PINs hashed:', migrated);
    console.log('Default/invalid PINs reset:', reset);
    console.log('Already hashed PINs:', skipped);
  } catch (error) {
    console.error('Payroll PIN migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (typeof db.end === 'function') {
      await new Promise(resolve => db.end(resolve));
    }
  }
}

migratePayrollPins();

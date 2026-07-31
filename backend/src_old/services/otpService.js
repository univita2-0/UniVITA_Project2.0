const pool = require('../database');
const { getPHTime } = require('../utils/timezone');

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const storeOTP = async (email, otp, expiryMinutes = 5) => {
  const expiresAt = getPHTime().datetime;
  expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);
  await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);
  await pool.query('INSERT INTO password_resets (email, otp, expires_at) VALUES (?, ?, ?)', [email, otp, expiresAt]);
};

const verifyOTP = async (email, otp) => {
  const [record] = await pool.query('SELECT * FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW()', [email, otp]);
  if (!record) return false;
  await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);
  return true;
};

module.exports = { generateOTP, storeOTP, verifyOTP };
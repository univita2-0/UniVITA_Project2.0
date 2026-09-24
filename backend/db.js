const mysql = require('mysql2');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '66.33.22.220',
  port: Number(process.env.DB_PORT) || 16509,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'railway',
  timezone: '+08:00',
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000 
});

module.exports = pool;
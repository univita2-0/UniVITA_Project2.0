// fix-selfies.js – run once to fix existing selfies
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  // Get all attendance records that have a selfie path (clock_in or clock_out)
  const [rows] = await connection.query(`
    SELECT id, clock_in_selfie, clock_out_selfie 
    FROM attendance 
    WHERE clock_in_selfie IS NOT NULL OR clock_out_selfie IS NOT NULL
  `);

  let updated = 0;

  for (const row of rows) {
    const processSelfie = async (colName, dbPath) => {
      if (!dbPath) return;
      // Extract the filename (e.g., '7d9a5ea6a735...')
      const filename = path.basename(dbPath);
      if (filename.includes('.')) return; // already has extension, skip

      const oldFullPath = path.join(__dirname, 'uploads', 'selfies', filename);
      if (!fs.existsSync(oldFullPath)) {
        console.log(`File not found: ${oldFullPath}`);
        return;
      }

      const newFullPath = oldFullPath + '.jpg';
      fs.renameSync(oldFullPath, newFullPath);

      const newDbPath = `/uploads/selfies/${filename}.jpg`;
      await connection.query(`UPDATE attendance SET ${colName} = ? WHERE id = ?`, [newDbPath, row.id]);
      console.log(`Renamed: ${filename} -> ${filename}.jpg`);
      updated++;
    };

    await processSelfie('clock_in_selfie', row.clock_in_selfie);
    await processSelfie('clock_out_selfie', row.clock_out_selfie);
  }

  console.log(`Done. ${updated} selfie paths updated.`);
  await connection.end();
})();
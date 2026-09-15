const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../database');

const router = express.Router();

// Get all chat rooms for the current user
router.get('/rooms', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const sql = `
    SELECT r.id, r.name, r.type,
      CASE WHEN r.type = 'direct' THEN (
        SELECT u.full_name FROM users u
        WHERE u.id = CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(r.name, '_', -1), '_', 1) AS UNSIGNED)
      ) END as display_name
    FROM chat_rooms r
    WHERE (r.type = 'direct' AND (r.name LIKE CONCAT('dm_%\\_', ?) OR r.name LIKE CONCAT('dm\\_', ?, '\\_%')))
       OR (r.type = 'group' AND EXISTS (SELECT 1 FROM chat_room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?))
    ORDER BY r.created_at DESC
  `;
  try {
    const [rooms] = await pool.query(sql, [userId, userId, userId]);
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get message history for a room
router.get('/history/:roomId', authenticateToken, async (req, res) => {
  const { roomId } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  try {
    const [messages] = await pool.query(
      `SELECT cm.*, u.full_name, u.employee_id
       FROM chat_messages cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.room_id = ?
       ORDER BY cm.sent_at DESC
       LIMIT ?`,
      [roomId, limit]
    );
    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get unread message counts for all rooms
router.get('/unread-counts', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const sql = `
    SELECT r.id AS room_id,
      (SELECT COUNT(*) FROM chat_messages cm
       WHERE cm.room_id = r.id
         AND cm.sent_at > COALESCE((SELECT last_read_at FROM user_chat_read WHERE user_id = ? AND room_id = r.id), '1970-01-01')
      ) AS unread
    FROM chat_rooms r
    WHERE EXISTS (SELECT 1 FROM chat_room_members rm WHERE rm.room_id = r.id AND rm.user_id = ?)
       OR (r.type = 'direct' AND (r.name LIKE CONCAT('dm_%\\_', ?) OR r.name LIKE CONCAT('dm\\_', ?, '\\_%')))
  `;
  try {
    const [results] = await pool.query(sql, [userId, userId, userId, userId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark a room as read up to now
router.post('/read/:roomId', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { roomId } = req.params;
  try {
    await pool.query(
      `INSERT INTO user_chat_read (user_id, room_id, last_read_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_read_at = NOW()`,
      [userId, roomId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or get a direct message room
router.post('/dm-room', authenticateToken, async (req, res) => {
  const partnerId = req.body.partnerUserId;
  const userId = req.user.id;
  const ids = [userId, partnerId].sort((a, b) => a - b);
  const roomName = `dm_${ids[0]}_${ids[1]}`;
  try {
    await pool.query(
      `INSERT INTO chat_rooms (name, type) VALUES (?, 'direct') ON DUPLICATE KEY UPDATE name = name`,
      [roomName]
    );
    const [rows] = await pool.query(`SELECT id FROM chat_rooms WHERE name = ?`, [roomName]);
    res.json({ roomId: rows[0].id, roomName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a group room
router.post('/group-room', authenticateToken, async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name || !Array.isArray(memberIds) || memberIds.length < 2) {
    return res.status(400).json({ error: 'Group name and at least 2 members required' });
  }
  const creatorId = req.user.id;
  if (!memberIds.includes(creatorId)) memberIds.push(creatorId);
  try {
    const [result] = await pool.query(`INSERT INTO chat_rooms (name, type) VALUES (?, 'group')`, [name]);
    const roomId = result.insertId;
    const values = memberIds.map(id => [roomId, id]);
    await pool.query(`INSERT INTO chat_room_members (room_id, user_id) VALUES ?`, [values]);
    await pool.query(`INSERT INTO user_chat_read (user_id, room_id) VALUES ?`, [values]);
    res.json({ success: true, roomId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a room (only if user is participant)
router.delete('/rooms/:roomId', authenticateToken, async (req, res) => {
  // Implementation similar to your existing server.js – but we'll keep it simple for now
  // To avoid complexity, you can keep the WebSocket delete logic; but for HTTP we implement a simple version.
  const { roomId } = req.params;
  const userId = req.user.id;
  // Check membership
  const [member] = await pool.query(
    `SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?`,
    [roomId, userId]
  );
  if (!member.length) return res.status(403).json({ error: 'Not a member' });
  // Delete all messages, members, read status, then room
  await pool.query(`DELETE FROM chat_messages WHERE room_id = ?`, [roomId]);
  await pool.query(`DELETE FROM user_chat_read WHERE room_id = ?`, [roomId]);
  await pool.query(`DELETE FROM chat_room_members WHERE room_id = ?`, [roomId]);
  await pool.query(`DELETE FROM chat_rooms WHERE id = ?`, [roomId]);
  res.json({ success: true });
});

module.exports = router;
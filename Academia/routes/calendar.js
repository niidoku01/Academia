const express = require('express');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { month, year, status: statusFilter } = req.query;
    let query = 'SELECT ce.*, c.code as course_code, u.full_name as created_by_name FROM calendar_events ce LEFT JOIN courses c ON c.id = ce.course_id JOIN users u ON u.id = ce.created_by WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += " AND ce.status = 'approved' AND (ce.school = ? OR ce.school IS NULL)";
      params.push(req.user.school);
    } else if (req.user.role === 'lecturer') {
      query += ' AND ce.created_by = ?';
      params.push(req.user.id);
      if (statusFilter) { query += ' AND ce.status = ?'; params.push(statusFilter); }
    }
    // admin uses /api/admin/events

    if (month && year) {
      query += " AND strftime('%m', ce.event_date) = ? AND strftime('%Y', ce.event_date) = ?";
      params.push(String(month).padStart(2, '0'), String(year));
    }

    query += ' ORDER BY ce.event_date ASC';
    const events = await db.prepare(query).all(...params);
    res.json(events);
  } catch (err) {
    handleDbError(res, err, 'Unable to load calendar events');
  }
});

router.post('/', authorizeRoles('lecturer', 'admin'), async (req, res) => {
  try {
    const { title, description, event_date, end_date, event_type, course_id, school } = req.body;
    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const safeEventType = normalizeText(event_type);
    const safeSchool = sanitizeText(school) || req.user.school;
    const eventDate = normalizeText(event_date);
    const endDate = normalizeText(end_date);
    const courseId = course_id ? Number(course_id) : null;
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    if (!safeTitle || !eventDate || !safeEventType) return res.status(400).json({ error: 'Title, date, and event type are required.' });
    if (!['exam', 'assignment', 'lecture', 'deadline', 'event', 'holiday'].includes(safeEventType)) return res.status(400).json({ error: 'Invalid event type.' });
    if (courseId !== null && (!Number.isInteger(courseId) || courseId <= 0)) return res.status(400).json({ error: 'Invalid course reference.' });

    const result = await db.prepare(
      'INSERT INTO calendar_events (title, description, event_date, end_date, event_type, course_id, school, created_by, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(safeTitle, safeDescription, eventDate, endDate || null, safeEventType, courseId, safeSchool, req.user.id, status);

    logAudit('create_calendar_event', { title: safeTitle, eventType: safeEventType }, req.user.id);
    res.json({ message: status === 'pending' ? 'Event submitted (pending approval)' : 'Event created', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create event');
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: 'Invalid event id.' });
    await db.prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);
    logAudit('delete_calendar_event', { eventId }, req.user.id);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete event');
  }
});

module.exports = router;

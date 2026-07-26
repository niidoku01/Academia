const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  validateCourseLevel,
  validateSemester,
  validateCategory,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});

const allowedMimes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4'
];

function fileFilter(req, file, cb) {
  if (allowedMimes.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('Unsupported file type'), false);
}

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 }, fileFilter });

router.get('/', async (req, res) => {
  try {
    const { level, semester, school, search } = req.query;
    let query = 'SELECT c.*, u.full_name as lecturer_name FROM courses c LEFT JOIN users u ON u.id = c.lecturer_id WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += " AND c.status = 'published'";
      const student = await db.prepare('SELECT school, level FROM users WHERE id = ?').get(req.user.id);
      if (student) {
        if (student.school) { query += ' AND (c.school = ? OR c.school IS NULL)'; params.push(student.school); }
        if (student.level) { query += ' AND c.level = ?'; params.push(student.level); }
      }
    } else if (req.user.role === 'lecturer') {
      query += ' AND c.lecturer_id = ?';
      params.push(req.user.id);
    }
    // admin sees all via /api/admin/courses

    if (level) { query += ' AND c.level = ?'; params.push(level); }
    if (semester) { query += ' AND c.semester = ?'; params.push(semester); }
    if (school) { query += ' AND c.school = ?'; params.push(school); }
    if (search) { query += ' AND (c.code LIKE ? OR c.title LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const courses = await db.prepare(query).all(...params);

    if (req.user.role === 'student') {
      const enrollments = await db.prepare('SELECT course_id FROM enrollments WHERE student_id = ?').all(req.user.id);
      const enrolledIds = new Set(enrollments.map(e => e.course_id));
      courses.forEach(c => { c.enrolled = enrolledIds.has(c.id); });
    }

    res.json(courses);
  } catch (err) {
    handleDbError(res, err, 'Unable to load courses');
  }
});

router.get('/:id/materials', async (req, res) => {
  try {
    const materials = await db.prepare(`
      SELECT m.*, u.full_name as uploaded_by_name
      FROM materials m JOIN users u ON u.id = m.uploaded_by
      WHERE m.course_id = ? ORDER BY m.created_at DESC
    `).all(req.params.id);
    res.json(materials);
  } catch (err) {
    handleDbError(res, err, 'Unable to browse materials');
  }
});

router.get('/my-materials', authorizeRoles('student'), async (req, res) => {
  try {
    const materials = await db.prepare(`
      SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as uploaded_by_name
      FROM materials m
      JOIN courses c ON c.id = m.course_id
      JOIN users u ON u.id = m.uploaded_by
      JOIN enrollments e ON e.course_id = m.course_id AND e.student_id = ?
      ORDER BY m.created_at DESC
    `).all(req.user.id);
    res.json(materials);
  } catch (err) {
    handleDbError(res, err, 'Unable to load materials');
  }
});

router.get('/browse', async (req, res) => {
  try {
    const { level, semester, category, search } = req.query;
    let query = 'SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as uploaded_by_name FROM materials m JOIN courses c ON c.id = m.course_id JOIN users u ON u.id = m.uploaded_by WHERE 1=1';
    const params = [];

    if (req.user.role === 'student') {
      query += ' AND c.school = ?';
      params.push(req.user.school);
      const studentLevel = await db.prepare('SELECT level FROM users WHERE id = ?').get(req.user.id);
      if (studentLevel && studentLevel.level) {
        query += ' AND c.level = ?';
        params.push(studentLevel.level);
      }
    }

    if (level) { query += ' AND c.level = ?'; params.push(level); }
    if (semester) { query += ' AND c.semester = ?'; params.push(semester); }
    if (category) { query += ' AND m.category = ?'; params.push(category); }
    if (search) { query += ' AND (m.title LIKE ? OR c.code LIKE ? OR c.title LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    query += ' ORDER BY m.created_at DESC';
    const materials = await db.prepare(query).all(...params);
    res.json(materials);
  } catch (err) {
    handleDbError(res, err, 'Unable to browse materials');
  }
});

router.post('/', authorizeRoles('lecturer'), upload.single('file'), async (req, res) => {
  try {
    const { course_id, title, description, level, semester, academic_year, category } = req.body;
    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const safeLevel = normalizeText(level);
    const safeSemester = normalizeText(semester);
    const safeAcademicYear = normalizeText(academic_year) || '2025/2026';
    const safeCategory = normalizeText(category) || 'other';
    const courseId = Number(course_id);
    const filePath = req.file ? `/api/files/${req.file.filename}` : null;
    const fileType = req.file ? req.file.mimetype : null;

    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course reference.' });
    if (!safeTitle) return res.status(400).json({ error: 'Material title is required.' });
    if (!validateCourseLevel(safeLevel)) return res.status(400).json({ error: 'Invalid course level.' });
    if (!validateSemester(safeSemester)) return res.status(400).json({ error: 'Invalid semester.' });
    if (!validateCategory(safeCategory)) return res.status(400).json({ error: 'Invalid material category.' });

    const result = await db.prepare(
      'INSERT INTO materials (course_id, title, description, file_path, file_type, uploaded_by, level, semester, academic_year, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(courseId, safeTitle, safeDescription, filePath, fileType, req.user.id, safeLevel, safeSemester, safeAcademicYear, safeCategory);

    logAudit('upload_material', { courseId, title: safeTitle }, req.user.id);
    res.json({ message: 'Material uploaded successfully', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to upload material');
  }
});

router.post('/enroll', authorizeRoles('student'), async (req, res) => {
  try {
    const { course_id } = req.body;
    const courseId = Number(course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course selection.' });
    const course = await db.prepare("SELECT id, status FROM courses WHERE id = ?").get(courseId);
    if (!course || course.status !== 'published') {
      return res.status(400).json({ error: 'Course is not available for registration.' });
    }
    await db.prepare('INSERT OR IGNORE INTO enrollments (student_id, course_id) VALUES (?, ?)').run(req.user.id, courseId);
    logAudit('enroll_course', { courseId }, req.user.id);
    res.json({ message: 'Registered successfully' });
  } catch (err) {
    handleDbError(res, err, 'Unable to register for course');
  }
});

router.post('/unenroll', authorizeRoles('student'), async (req, res) => {
  try {
    const { course_id } = req.body;
    const courseId = Number(course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course selection.' });
    await db.prepare('DELETE FROM enrollments WHERE student_id = ? AND course_id = ?').run(req.user.id, courseId);
    logAudit('unenroll_course', { courseId }, req.user.id);
    res.json({ message: 'Dropped successfully' });
  } catch (err) {
    handleDbError(res, err, 'Unable to drop course');
  }
});

router.get('/enrolled', authorizeRoles('student'), async (req, res) => {
  try {
    const courses = await db.prepare(`
      SELECT c.*, u.full_name as lecturer_name FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      LEFT JOIN users u ON u.id = c.lecturer_id
      WHERE e.student_id = ?
    `).all(req.user.id);
    res.json(courses);
  } catch (err) {
    handleDbError(res, err, 'Unable to load enrolled courses');
  }
});

module.exports = router;

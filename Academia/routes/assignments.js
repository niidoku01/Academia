const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, 'sub-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});

const allowedMimes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif'
];
function fileFilter(req, file, cb) {
  if (allowedMimes.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('Unsupported file type'), false);
}

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter });

router.get('/', async (req, res) => {
  try {
    let query, params = [];

    if (req.user.role === 'student') {
      query = `
        SELECT a.*, c.code as course_code, c.title as course_title,
        (SELECT id FROM submissions WHERE assignment_id = a.id AND student_id = ?) as submitted,
        (SELECT grade FROM submissions WHERE assignment_id = a.id AND student_id = ?) as my_grade
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        JOIN enrollments e ON e.course_id = a.course_id AND e.student_id = ?
        ORDER BY a.due_date ASC
      `;
      params = [req.user.id, req.user.id, req.user.id];
    } else if (req.user.role === 'lecturer') {
      query = `
        SELECT a.*, c.code as course_code, c.title as course_title,
        (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id) as submission_count,
        (SELECT COUNT(*) FROM submissions WHERE assignment_id = a.id AND grade IS NOT NULL) as graded_count
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        WHERE a.created_by = ?
        ORDER BY a.created_at DESC
      `;
      params = [req.user.id];
    } else {
      query = `
        SELECT a.*, c.code as course_code, c.title as course_title,
        u.full_name as created_by_name
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        JOIN users u ON u.id = a.created_by
        ORDER BY a.created_at DESC
      `;
    }

    const assignments = await db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err) {
    handleDbError(res, err, 'Unable to load assignments');
  }
});

router.get('/midsems', async (req, res) => {
  try {
    let query, params = [];

    if (req.user.role === 'student') {
      query = `
        SELECT m.*, c.code as course_code, c.title as course_title
        FROM midsem_exams m
        JOIN courses c ON c.id = m.course_id
        JOIN enrollments e ON e.course_id = m.course_id AND e.student_id = ?
        ORDER BY m.exam_date ASC
      `;
      params = [req.user.id];
    } else if (req.user.role === 'lecturer') {
      query = `
        SELECT m.*, c.code as course_code, c.title as course_title
        FROM midsem_exams m
        JOIN courses c ON c.id = m.course_id
        WHERE m.created_by = ?
        ORDER BY m.created_at DESC
      `;
      params = [req.user.id];
    } else {
      query = `
        SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as created_by_name
        FROM midsem_exams m
        JOIN courses c ON c.id = m.course_id
        JOIN users u ON u.id = m.created_by
        ORDER BY m.exam_date ASC
      `;
    }

    const exams = await db.prepare(query).all(...params);
    res.json(exams);
  } catch (err) {
    handleDbError(res, err, 'Unable to load exams');
  }
});

router.post('/', authorizeRoles('lecturer'), upload.single('attachment'), async (req, res) => {
  try {
    const { course_id, title, description, due_date, total_marks } = req.body;
    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const courseId = Number(course_id);
    const dueDate = normalizeText(due_date);
    const totalMarks = Number(total_marks || 100);
    const filePath = req.file ? `/api/files/${req.file.filename}` : null;

    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course selection.' });
    if (!safeTitle || !dueDate) return res.status(400).json({ error: 'Assignment title and due date are required.' });
    if (!Number.isInteger(totalMarks) || totalMarks <= 0) return res.status(400).json({ error: 'Total marks must be a positive number.' });

    const result = await db.prepare(
      'INSERT INTO assignments (course_id, title, description, due_date, total_marks, attachment_path, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(courseId, safeTitle, safeDescription, dueDate, totalMarks, filePath, req.user.id);

    logAudit('create_assignment', { courseId, title: safeTitle }, req.user.id);
    res.json({ message: 'Assignment created', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create assignment');
  }
});

router.post('/midsem', authorizeRoles('lecturer'), async (req, res) => {
  try {
    const { course_id, title, description, exam_date, duration_minutes, total_marks, venue, instructions } = req.body;
    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const safeVenue = sanitizeText(venue);
    const safeInstructions = sanitizeText(instructions);
    const courseId = Number(course_id);
    const examDate = normalizeText(exam_date);
    const durationMinutes = Number(duration_minutes || 60);
    const totalMarks = Number(total_marks || 50);

    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course selection.' });
    if (!safeTitle || !examDate) return res.status(400).json({ error: 'Exam title and date are required.' });
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return res.status(400).json({ error: 'Duration must be a positive number.' });
    if (!Number.isInteger(totalMarks) || totalMarks <= 0) return res.status(400).json({ error: 'Total marks must be a positive number.' });

    const result = await db.prepare(
      'INSERT INTO midsem_exams (course_id, title, description, exam_date, duration_minutes, total_marks, venue, instructions, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(courseId, safeTitle, safeDescription, examDate, durationMinutes, totalMarks, safeVenue, safeInstructions, req.user.id);

    logAudit('create_midsem', { courseId, title: safeTitle }, req.user.id);
    res.json({ message: 'Mid-sem exam created', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create exam');
  }
});

router.post('/submit/:assignmentId', authorizeRoles('student'), upload.single('file'), async (req, res) => {
  try {
    const assignmentId = Number(req.params.assignmentId);
    const filePath = req.file ? `/api/files/${req.file.filename}` : null;
    const { notes } = req.body;
    const safeNotes = sanitizeText(notes);

    if (!Number.isInteger(assignmentId) || assignmentId <= 0) return res.status(400).json({ error: 'Invalid assignment reference.' });

    const existing = await db.prepare('SELECT id FROM submissions WHERE assignment_id = ? AND student_id = ?').get(assignmentId, req.user.id);
    if (existing) return res.status(400).json({ error: 'Already submitted.' });

    await db.prepare(
      'INSERT INTO submissions (assignment_id, student_id, file_path, notes) VALUES (?, ?, ?, ?)'
    ).run(assignmentId, req.user.id, filePath, safeNotes);

    logAudit('submit_assignment', { assignmentId }, req.user.id);
    res.json({ message: 'Assignment submitted successfully' });
  } catch (err) {
    handleDbError(res, err, 'Unable to submit assignment');
  }
});

router.get('/submissions/:assignmentId', authorizeRoles('lecturer'), async (req, res) => {
  try {
    const submissions = await db.prepare(`
      SELECT s.*, u.full_name, u.matric_number, u.email
      FROM submissions s JOIN users u ON u.id = s.student_id
      WHERE s.assignment_id = ?
    `).all(req.params.assignmentId);
    res.json(submissions);
  } catch (err) {
    handleDbError(res, err, 'Unable to load submissions');
  }
});

router.put('/grade/:submissionId', authorizeRoles('lecturer'), async (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const { grade, feedback } = req.body;
    const numericGrade = Number(grade);
    const safeFeedback = sanitizeText(feedback);

    if (!Number.isInteger(submissionId) || submissionId <= 0) return res.status(400).json({ error: 'Invalid submission reference.' });
    if (!Number.isInteger(numericGrade) || numericGrade < 0 || numericGrade > 100) return res.status(400).json({ error: 'Grade must be between 0 and 100.' });

    await db.prepare('UPDATE submissions SET grade = ?, feedback = ? WHERE id = ?').run(numericGrade, safeFeedback, submissionId);
    logAudit('grade_submission', { submissionId, grade: numericGrade }, req.user.id);
    res.json({ message: 'Graded successfully' });
  } catch (err) {
    handleDbError(res, err, 'Unable to grade submission');
  }
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  validateEmail,
  validatePassword,
  validateRole,
  validateCourseLevel,
  validateSemester,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, 'course-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

router.get('/users', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    let users;
    if (req.user.role === 'school_admin') {
      users = await db.prepare('SELECT id, full_name, email, role, school, department, level, matric_number, created_at FROM users WHERE school = $1 ORDER BY created_at DESC').all(req.user.school);
    } else {
      users = await db.prepare('SELECT id, full_name, email, role, school, department, level, matric_number, created_at FROM users ORDER BY school, role, full_name').all();
    }
    res.json(users);
  } catch (err) {
    handleDbError(res, err, 'Unable to load users');
  }
});

router.post('/users', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { full_name, email, password, role, school, department, level, matric_number } = req.body;
    const safeFullName = sanitizeText(full_name);
    const safeEmail = normalizeText(email).toLowerCase();
    const safeRole = normalizeText(role);
    const safeSchool = req.user.role === 'school_admin' ? req.user.school : sanitizeText(school);

    if (!safeFullName || !safeEmail || !password || !safeRole || !safeSchool) {
      return res.status(400).json({ error: 'All required user fields must be provided.' });
    }
    if (!validateEmail(safeEmail)) return res.status(400).json({ error: 'Please provide a valid email address.' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.' });
    if (!validateRole(safeRole)) return res.status(400).json({ error: 'Invalid role selected.' });
    if (req.user.role === 'school_admin' && (safeRole === 'admin' || safeRole === 'school_admin')) {
      return res.status(403).json({ error: 'School admins cannot create admin or school admin accounts.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await db.prepare(
      'INSERT INTO users (full_name, email, password, role, school, department, level, matric_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
    ).run(safeFullName, safeEmail, hashedPassword, safeRole, safeSchool, sanitizeText(department) || null, normalizeText(level) || null, sanitizeText(matric_number) || null);
    logAudit('admin_create_user', { email: safeEmail, role: safeRole }, req.user.id);
    res.json({ message: 'User created', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create user');
  }
});

router.delete('/users/:id', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Invalid user id.' });
    const target = await db.prepare('SELECT role, school FROM users WHERE id = $1').get(userId);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (target.role === 'admin') return res.status(400).json({ error: 'Cannot delete admin users.' });
    if (req.user.role === 'school_admin' && target.school !== req.user.school) {
      return res.status(403).json({ error: 'You can only delete users in your school.' });
    }

    await db.prepare('DELETE FROM submissions WHERE student_id = $1').run(userId);
    await db.prepare('DELETE FROM enrollments WHERE student_id = $1').run(userId);
    await db.prepare('DELETE FROM assignments WHERE created_by = $1').run(userId);
    await db.prepare('DELETE FROM midsem_exams WHERE created_by = $1').run(userId);
    await db.prepare('DELETE FROM materials WHERE uploaded_by = $1').run(userId);
    await db.prepare('DELETE FROM news WHERE published_by = $1').run(userId);
    await db.prepare('DELETE FROM calendar_events WHERE created_by = $1').run(userId);
    await db.prepare('DELETE FROM lecturer_profiles WHERE user_id = $1').run(userId);
    await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = $1').run(userId);
    await db.prepare('DELETE FROM mfa_tokens WHERE user_id = $1').run(userId);
    await db.prepare('DELETE FROM users WHERE id = $1').run(userId);

    logAudit('admin_delete_user', { targetUserId: userId }, req.user.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete user');
  }
});

router.get('/courses', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const { status, semester, academic_year, school } = req.query;
    let query = `SELECT c.*, u.full_name as lecturer_name,
      (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrolled_count
      FROM courses c LEFT JOIN users u ON u.id = c.lecturer_id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (req.user.role === 'school_admin') {
      query += ` AND c.school = $${idx++}`;
      params.push(req.user.school);
    } else if (school) {
      query += ` AND c.school = $${idx++}`;
      params.push(school);
    }
    if (status) { query += ` AND c.status = $${idx++}`; params.push(status); }
    if (semester) { query += ` AND c.semester = $${idx++}`; params.push(semester); }
    if (academic_year) { query += ` AND c.academic_year = $${idx++}`; params.push(academic_year); }
    query += ' ORDER BY c.status, c.level, c.code';
    const courses = await db.prepare(query).all(...params);
    res.json(courses);
  } catch (err) {
    handleDbError(res, err, 'Unable to load courses');
  }
});

router.post('/courses', authorizeRoles('lecturer', 'school_admin'), async (req, res) => {
  try {
    const { code, title, description, level, school, department, semester, academic_year, lecturer_id } = req.body;
    const safeCode = normalizeText(code).toUpperCase();
    const safeTitle = sanitizeText(title);
    const safeDescription = sanitizeText(description);
    const safeLevel = normalizeText(level);
    const safeSchool = req.user.role === 'school_admin' ? req.user.school : sanitizeText(school);
    const safeDepartment = sanitizeText(department);
    const safeSemester = normalizeText(semester);
    const safeAcademicYear = normalizeText(academic_year) || '2025/2026';
    const lid = (req.user.role === 'admin' || req.user.role === 'school_admin') ? (Number(lecturer_id) || null) : req.user.id;
    const status = (req.user.role === 'admin' || req.user.role === 'school_admin') ? 'published' : 'draft';

    if (!safeCode || !safeTitle || !safeLevel || !safeSchool || !safeSemester) {
      return res.status(400).json({ error: 'Course code, title, level, school, and semester are required.' });
    }
    if (!validateCourseLevel(safeLevel)) return res.status(400).json({ error: 'Invalid course level.' });
    if (!validateSemester(safeSemester)) return res.status(400).json({ error: 'Invalid semester.' });

    const result = await db.prepare(
      'INSERT INTO courses (code, title, description, level, school, department, semester, academic_year, status, lecturer_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
    ).run(safeCode, safeTitle, safeDescription, safeLevel, safeSchool, safeDepartment || null, safeSemester, safeAcademicYear, status, lid);

    logAudit('admin_create_course', { id: result.lastInsertRowid, code: safeCode }, req.user.id);
    res.json({ message: req.user.role === 'admin' ? 'Course created and published' : 'Course created (pending approval)', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to create course');
  }
});

router.put('/courses/:id/publish', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    if (req.user.role === 'school_admin') {
      const course = await db.prepare('SELECT school FROM courses WHERE id = $1').get(courseId);
      if (!course) return res.status(404).json({ error: 'Course not found.' });
      if (course.school !== req.user.school) return res.status(403).json({ error: 'You can only publish courses in your school.' });
    }
    await db.prepare("UPDATE courses SET status = 'published' WHERE id = $1").run(courseId);
    logAudit('admin_publish_course', { courseId }, req.user.id);
    res.json({ message: 'Course published' });
  } catch (err) {
    handleDbError(res, err, 'Unable to publish course');
  }
});

router.put('/courses/:id/unpublish', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    if (req.user.role === 'school_admin') {
      const course = await db.prepare('SELECT school FROM courses WHERE id = $1').get(courseId);
      if (!course) return res.status(404).json({ error: 'Course not found.' });
      if (course.school !== req.user.school) return res.status(403).json({ error: 'You can only unpublish courses in your school.' });
    }
    await db.prepare("UPDATE courses SET status = 'draft' WHERE id = $1").run(courseId);
    logAudit('admin_unpublish_course', { courseId }, req.user.id);
    res.json({ message: 'Course unpublished' });
  } catch (err) {
    handleDbError(res, err, 'Unable to unpublish course');
  }
});

function deleteCourseById(courseId, userId, role, userSchool) {
  return new Promise(async (resolve, reject) => {
    try {
      if (role === 'school_admin') {
        const course = await db.prepare('SELECT school FROM courses WHERE id = $1').get(courseId);
        if (!course) return reject(new Error('Course not found'));
        if (course.school !== userSchool) return reject(new Error('You can only delete courses in your school.'));
      }
      await db.prepare('DELETE FROM submissions WHERE assignment_id IN (SELECT id FROM assignments WHERE course_id = $1)').run(courseId);
      await db.prepare('DELETE FROM assignments WHERE course_id = $1').run(courseId);
      await db.prepare('DELETE FROM enrollments WHERE course_id = $1').run(courseId);
      await db.prepare('DELETE FROM materials WHERE course_id = $1').run(courseId);
      await db.prepare('DELETE FROM midsem_exams WHERE course_id = $1').run(courseId);
      await db.prepare("UPDATE calendar_events SET course_id = NULL WHERE course_id = $1").run(courseId);
      await db.prepare('DELETE FROM courses WHERE id = $1').run(courseId);
      logAudit('admin_delete_course', { courseId }, userId);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

router.put('/courses/:id/delete', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    await deleteCourseById(courseId, req.user.id, req.user.role, req.user.school);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    if (err.message && (err.message.includes('not found') || err.message.includes('only delete'))) {
      return res.status(403).json({ error: err.message });
    }
    handleDbError(res, err, 'Unable to delete course');
  }
});

router.delete('/courses/:id', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) return res.status(400).json({ error: 'Invalid course id.' });
    await deleteCourseById(courseId, req.user.id, req.user.role, req.user.school);
    res.json({ message: 'Course deleted' });
  } catch (err) {
    if (err.message && (err.message.includes('not found') || err.message.includes('only delete'))) {
      return res.status(403).json({ error: err.message });
    }
    handleDbError(res, err, 'Unable to delete course');
  }
});

router.get('/news', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT n.*, u.full_name as author FROM news n JOIN users u ON u.id = n.published_by WHERE 1=1';
    const params = [];
    let idx = 1;
    if (req.user.role === 'school_admin') { query += ` AND (n.school = $${idx} OR n.school IS NULL)`; params.push(req.user.school); idx++; }
    if (status) { query += ` AND n.status = $${idx}`; params.push(status); idx++; }
    query += ' ORDER BY n.created_at DESC';
    const news = await db.prepare(query).all(...params);
    res.json(news);
  } catch (err) {
    handleDbError(res, err, 'Unable to load news');
  }
});

router.put('/news/:id/approve', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!Number.isInteger(newsId) || newsId <= 0) return res.status(400).json({ error: 'Invalid news id.' });
    await db.prepare("UPDATE news SET status = 'approved' WHERE id = $1").run(newsId);
    logAudit('admin_approve_news', { newsId }, req.user.id);
    res.json({ message: 'News approved' });
  } catch (err) {
    handleDbError(res, err, 'Unable to approve news');
  }
});

router.put('/news/:id/reject', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!Number.isInteger(newsId) || newsId <= 0) return res.status(400).json({ error: 'Invalid news id.' });
    await db.prepare("UPDATE news SET status = 'rejected' WHERE id = $1").run(newsId);
    logAudit('admin_reject_news', { newsId }, req.user.id);
    res.json({ message: 'News rejected' });
  } catch (err) {
    handleDbError(res, err, 'Unable to reject news');
  }
});

router.get('/events', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT ce.*, c.code as course_code, u.full_name as created_by_name FROM calendar_events ce LEFT JOIN courses c ON c.id = ce.course_id JOIN users u ON u.id = ce.created_by WHERE 1=1';
    const params = [];
    let idx = 1;
    if (req.user.role === 'school_admin') { query += ` AND (ce.school = $${idx} OR ce.school IS NULL)`; params.push(req.user.school); idx++; }
    if (status) { query += ` AND ce.status = $${idx}`; params.push(status); idx++; }
    query += ' ORDER BY ce.event_date DESC';
    const events = await db.prepare(query).all(...params);
    res.json(events);
  } catch (err) {
    handleDbError(res, err, 'Unable to load events');
  }
});

router.put('/events/:id/approve', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: 'Invalid event id.' });
    await db.prepare("UPDATE calendar_events SET status = 'approved' WHERE id = $1").run(eventId);
    logAudit('admin_approve_event', { eventId }, req.user.id);
    res.json({ message: 'Event approved' });
  } catch (err) {
    handleDbError(res, err, 'Unable to approve event');
  }
});

router.put('/events/:id/reject', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const eventId = Number(req.params.id);
    if (!Number.isInteger(eventId) || eventId <= 0) return res.status(400).json({ error: 'Invalid event id.' });
    await db.prepare("UPDATE calendar_events SET status = 'rejected' WHERE id = $1").run(eventId);
    logAudit('admin_reject_event', { eventId }, req.user.id);
    res.json({ message: 'Event rejected' });
  } catch (err) {
    handleDbError(res, err, 'Unable to reject event');
  }
});

router.get('/stats', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const schoolFilter = req.user.role === 'school_admin';
    const params = schoolFilter ? [req.user.school] : [];
    const idx = (n) => `$${n}`;

    const students = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'student'${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);
    const lecturers = await db.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'lecturer'${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);
    const totalCourses = await db.prepare(`SELECT COUNT(*) as count FROM courses WHERE 1=1${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);
    const draftCourses = await db.prepare(`SELECT COUNT(*) as count FROM courses WHERE status = 'draft'${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);
    const publishedCourses = await db.prepare(`SELECT COUNT(*) as count FROM courses WHERE status = 'published'${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);
    const pendingNews = await db.prepare(`SELECT COUNT(*) as count FROM news WHERE status = 'pending'${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);
    const pendingEvents = await db.prepare(`SELECT COUNT(*) as count FROM calendar_events WHERE status = 'pending'${schoolFilter ? ` AND school = ${idx(1)}` : ''}`).get(...params);

    res.json({
      total_students: students.count,
      total_lecturers: lecturers.count,
      total_courses: totalCourses.count,
      draft_courses: draftCourses.count,
      published_courses: publishedCourses.count,
      pending_news: pendingNews.count,
      pending_events: pendingEvents.count
    });
  } catch (err) {
    handleDbError(res, err, 'Unable to load admin statistics');
  }
});

router.get('/courses-by-programme', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const { school, department } = req.query;
    let query = `SELECT c.*, u.full_name as lecturer_name,
        (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrolled_count
      FROM courses c
      LEFT JOIN users u ON u.id = c.lecturer_id WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (req.user.role === 'school_admin') {
      query += ` AND c.school = $${idx++}`;
      params.push(req.user.school);
    } else if (school) {
      query += ` AND c.school = $${idx++}`;
      params.push(school);
    }
    if (department) { query += ` AND c.department = $${idx++}`; params.push(department); }
    query += ' ORDER BY c.school, c.department, c.level, c.code';
    const courses = await db.prepare(query).all(...params);

    const programmes = {};
    for (const course of courses) {
      const sch = course.school || 'Unassigned';
      const dept = course.department || 'General';
      if (!programmes[sch]) programmes[sch] = {};
      if (!programmes[sch][dept]) programmes[sch][dept] = [];
      programmes[sch][dept].push(course);
    }
    res.json(programmes);
  } catch (err) {
    handleDbError(res, err, 'Unable to load courses by programme');
  }
});

router.get('/lecturer-portraits', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const { school, search } = req.query;
    const params = [];
    let idx = 1;

    let lectWhere = "u.role = 'lecturer'";
    let adminWhere = "u.role = 'school_admin'";

    if (req.user.role === 'school_admin') {
      adminWhere = "u.role IN ('admin', 'school_admin')";
      lectWhere += ` AND u.school = $${idx}`;
      adminWhere += ` AND (u.school = $${idx} OR u.school = 'All')`;
      params.push(req.user.school);
      idx++;
    } else if (school) {
      lectWhere += ` AND u.school = $${idx}`;
      adminWhere += ` AND u.school = $${idx}`;
      params.push(school);
      idx++;
    }

    if (search) {
      const searchPattern = `%${search}%`;
      lectWhere += ` AND (u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.department ILIKE $${idx})`;
      adminWhere += ` AND (u.full_name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.department ILIKE $${idx})`;
      params.push(searchPattern);
      idx++;
    }

    const lectQuery = `SELECT u.id, u.full_name, u.email, u.department, u.school, u.role,
        lp.bio, lp.office_location, lp.phone, lp.office_hours,
        lp.specialization, lp.qualification, lp.photo_path
      FROM users u LEFT JOIN lecturer_profiles lp ON lp.user_id = u.id
      WHERE ${lectWhere}
      ORDER BY u.school, u.full_name`;

    const adminQuery = `SELECT u.id, u.full_name, u.email, u.department, u.school, u.role,
        ap.position, ap.bio, ap.phone, ap.photo_path
      FROM users u LEFT JOIN admin_profiles ap ON ap.user_id = u.id
      WHERE ${adminWhere}
      ORDER BY u.school, u.full_name`;

    const lecturers = await db.prepare(lectQuery).all(...params);
    const admins = await db.prepare(adminQuery).all(...params);

    res.json({ lecturers, admins });
  } catch (err) {
    handleDbError(res, err, 'Unable to load staff database');
  }
});

module.exports = router;

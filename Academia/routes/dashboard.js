const express = require('express');
const db = require('../models/database');
const { handleDbError } = require('../utils/security');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const school = req.user.school;

    const stats = {};

    if (role === 'student') {
      const studentLevel = await db.prepare('SELECT level, department, matric_number FROM users WHERE id = ?').get(userId);
      stats.level = studentLevel ? studentLevel.level : null;
      stats.department = studentLevel ? studentLevel.department : null;
      stats.matric_number = studentLevel ? studentLevel.matric_number : null;

      const enrollments = await db.prepare('SELECT COUNT(*) as count FROM enrollments WHERE student_id = ?').get(userId);
      stats.enrolled_courses = enrollments.count;

      const pendingAssignments = await db.prepare(`
        SELECT COUNT(*) as count FROM assignments a
        JOIN enrollments e ON e.course_id = a.course_id
        WHERE e.student_id = ? AND a.due_date > datetime('now')
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = a.id AND student_id = ?)
      `).get(userId, userId);
      stats.pending_assignments = pendingAssignments.count;

      const completedSubmissions = await db.prepare(`
        SELECT COUNT(*) as count FROM submissions WHERE student_id = ?
      `).get(userId);
      stats.completed_submissions = completedSubmissions.count;

      const gradedSubmissions = await db.prepare(`
        SELECT COUNT(*) as count FROM submissions WHERE student_id = ? AND grade IS NOT NULL
      `).get(userId);
      stats.graded_count = gradedSubmissions.count;

      const avgGrade = await db.prepare(`
        SELECT AVG(CAST(s.grade AS FLOAT) / CAST(a.total_marks AS FLOAT) * 100) as avg
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE s.student_id = ? AND s.grade IS NOT NULL
      `).get(userId);
      stats.average_grade = avgGrade.avg ? Math.round(avgGrade.avg) : null;

      const upcomingExams = await db.prepare(`
        SELECT COUNT(*) as count FROM midsem_exams m
        JOIN enrollments e ON e.course_id = m.course_id
        WHERE e.student_id = ? AND m.exam_date > datetime('now')
      `).get(userId);
      stats.upcoming_exams = upcomingExams.count;

      const totalMaterials = await db.prepare(`
        SELECT COUNT(*) as count FROM materials m
        JOIN courses c ON c.id = m.course_id
        JOIN enrollments e ON e.course_id = c.id
        WHERE e.student_id = ?
      `).get(userId);
      stats.course_materials = totalMaterials.count;

      if (stats.level) {
        const levelMaterials = await db.prepare(`
          SELECT COUNT(*) as count FROM materials m
          JOIN courses c ON c.id = m.course_id
          WHERE c.level = ? AND c.school = ?
        `).get(stats.level, school);
        stats.level_materials = levelMaterials.count;
      }

      const studentCourses = await db.prepare(`
        SELECT c.id, c.code, c.title, c.level, c.semester, u.full_name as lecturer_name
        FROM courses c
        JOIN enrollments e ON e.course_id = c.id
        LEFT JOIN users u ON u.id = c.lecturer_id
        WHERE e.student_id = ?
        ORDER BY c.level, c.code
      `).all(userId);
      stats.my_courses = studentCourses;

      stats.recent_submissions = await db.prepare(`
        SELECT s.*, a.title as assignment_title, a.total_marks, c.code as course_code, c.title as course_title
        FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN courses c ON c.id = a.course_id
        WHERE s.student_id = ?
        ORDER BY s.submitted_at DESC LIMIT 5
      `).all(userId);

      stats.upcoming_deadlines = await db.prepare(`
        SELECT a.id, a.title, a.due_date, a.total_marks, c.code as course_code, c.title as course_title
        FROM assignments a
        JOIN courses c ON c.id = a.course_id
        JOIN enrollments e ON e.course_id = a.course_id
        WHERE e.student_id = ? AND a.due_date > datetime('now')
        AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = a.id AND student_id = ?)
        ORDER BY a.due_date ASC LIMIT 5
      `).all(userId, userId);

      stats.recent_materials = await db.prepare(`
        SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as uploader
        FROM materials m
        JOIN courses c ON c.id = m.course_id
        JOIN enrollments e ON e.course_id = c.id
        LEFT JOIN users u ON u.id = m.uploaded_by
        WHERE e.student_id = ?
        ORDER BY m.created_at DESC LIMIT 5
      `).all(userId);

    } else if (role === 'lecturer') {
      const courses = await db.prepare('SELECT COUNT(*) as count FROM courses WHERE lecturer_id = ?').get(userId);
      stats.assigned_courses = courses.count;

      const totalStudents = await db.prepare(`
        SELECT COUNT(DISTINCT e.student_id) as count FROM enrollments e
        JOIN courses c ON c.id = e.course_id WHERE c.lecturer_id = ?
      `).get(userId);
      stats.total_students = totalStudents.count;

      const pendingSubmissions = await db.prepare(`
        SELECT COUNT(*) as count FROM submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE a.created_by = ? AND s.grade IS NULL
      `).get(userId);
      stats.pending_grading = pendingSubmissions.count;
    } else if (role === 'school_admin') {
      const userSchool = school;
      const totalStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND school = ?").get(userSchool);
      const totalLecturers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer' AND school = ?").get(userSchool);
      const totalCourses = db.prepare("SELECT COUNT(*) as count FROM courses WHERE school = ?").get(userSchool);
      const totalMaterials = db.prepare("SELECT COUNT(*) as count FROM materials m JOIN courses c ON c.id = m.course_id WHERE c.school = ?").get(userSchool);
      const pendingNews = db.prepare("SELECT COUNT(*) as count FROM news WHERE school = ? AND status = 'pending'").get(userSchool);
      const pendingEvents = db.prepare("SELECT COUNT(*) as count FROM calendar_events WHERE school = ? AND status = 'pending'").get(userSchool);
      stats.total_students = totalStudents.count;
      stats.total_lecturers = totalLecturers.count;
      stats.total_courses = totalCourses.count;
      stats.total_materials = totalMaterials.count;
      stats.pending_news = pendingNews.count;
      stats.pending_events = pendingEvents.count;
    } else {
      const totalStudents = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get();
      const totalLecturers = await db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer'").get();
      const totalCourses = await db.prepare('SELECT COUNT(*) as count FROM courses').get();
      const totalMaterials = await db.prepare('SELECT COUNT(*) as count FROM materials').get();
      stats.total_students = totalStudents.count;
      stats.total_lecturers = totalLecturers.count;
      stats.total_courses = totalCourses.count;
      stats.total_materials = totalMaterials.count;
    }

    const recentNews = await db.prepare(`
      SELECT n.*, u.full_name as author FROM news n
      JOIN users u ON u.id = n.published_by
      WHERE (n.school = ? OR n.school IS NULL) AND n.status = 'approved'
      ORDER BY n.created_at DESC LIMIT 5
    `).all(school === 'All' ? null : school);

    const upcomingEvents = await db.prepare(`
      SELECT * FROM calendar_events
      WHERE (school = ? OR school IS NULL) AND event_date >= datetime('now') AND status = 'approved'
      ORDER BY event_date ASC LIMIT 10
    `).all(school === 'All' ? null : school);

    res.json({ stats, recentNews, upcomingEvents });
  } catch (err) {
    handleDbError(res, err, 'Unable to load dashboard data');
  }
});

module.exports = router;

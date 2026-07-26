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
      const [
        studentLevel,
        enrollments,
        pendingAssignments,
        completedSubmissions,
        gradedSubmissions,
        avgGrade,
        upcomingExams,
        totalMaterials,
        studentCourses,
        recentSubmissions,
        upcomingDeadlines,
        recentMaterials
      ] = await Promise.all([
        db.prepare('SELECT level, department, matric_number FROM users WHERE id = $1').get(userId),
        db.prepare('SELECT COUNT(*) as count FROM enrollments WHERE student_id = $1').get(userId),
        db.prepare(`
          SELECT COUNT(*) as count FROM assignments a
          JOIN enrollments e ON e.course_id = a.course_id
          WHERE e.student_id = $1 AND a.due_date > NOW()
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = a.id AND student_id = $1)
        `).get(userId),
        db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE student_id = $1`).get(userId),
        db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE student_id = $1 AND grade IS NOT NULL`).get(userId),
        db.prepare(`
          SELECT AVG(CAST(s.grade AS FLOAT) / CAST(a.total_marks AS FLOAT) * 100) as avg
          FROM submissions s JOIN assignments a ON a.id = s.assignment_id
          WHERE s.student_id = $1 AND s.grade IS NOT NULL
        `).get(userId),
        db.prepare(`
          SELECT COUNT(*) as count FROM midsem_exams m
          JOIN enrollments e ON e.course_id = m.course_id
          WHERE e.student_id = $1 AND m.exam_date > NOW()
        `).get(userId),
        db.prepare(`
          SELECT COUNT(*) as count FROM materials m
          JOIN courses c ON c.id = m.course_id
          JOIN enrollments e ON e.course_id = c.id
          WHERE e.student_id = $1
        `).get(userId),
        db.prepare(`
          SELECT c.id, c.code, c.title, c.level, c.semester, u.full_name as lecturer_name
          FROM courses c
          JOIN enrollments e ON e.course_id = c.id
          LEFT JOIN users u ON u.id = c.lecturer_id
          WHERE e.student_id = $1
          ORDER BY c.level, c.code
        `).all(userId),
        db.prepare(`
          SELECT s.*, a.title as assignment_title, a.total_marks, c.code as course_code, c.title as course_title
          FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
          JOIN courses c ON c.id = a.course_id
          WHERE s.student_id = $1
          ORDER BY s.submitted_at DESC LIMIT 5
        `).all(userId),
        db.prepare(`
          SELECT a.id, a.title, a.due_date, a.total_marks, c.code as course_code, c.title as course_title
          FROM assignments a
          JOIN courses c ON c.id = a.course_id
          JOIN enrollments e ON e.course_id = a.course_id
          WHERE e.student_id = $1 AND a.due_date > NOW()
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = a.id AND student_id = $1)
          ORDER BY a.due_date ASC LIMIT 5
        `).all(userId, userId),
        db.prepare(`
          SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as uploader
          FROM materials m
          JOIN courses c ON c.id = m.course_id
          JOIN enrollments e ON e.course_id = c.id
          LEFT JOIN users u ON u.id = m.uploaded_by
          WHERE e.student_id = $1
          ORDER BY m.created_at DESC LIMIT 5
        `).all(userId)
      ]);

      stats.level = studentLevel ? studentLevel.level : null;
      stats.department = studentLevel ? studentLevel.department : null;
      stats.matric_number = studentLevel ? studentLevel.matric_number : null;
      stats.enrolled_courses = enrollments.count;
      stats.pending_assignments = pendingAssignments.count;
      stats.completed_submissions = completedSubmissions.count;
      stats.graded_count = gradedSubmissions.count;
      stats.average_grade = avgGrade.avg ? Math.round(avgGrade.avg) : null;
      stats.upcoming_exams = upcomingExams.count;
      stats.course_materials = totalMaterials.count;
      stats.my_courses = studentCourses;
      stats.recent_submissions = recentSubmissions;
      stats.upcoming_deadlines = upcomingDeadlines;
      stats.recent_materials = recentMaterials;

      if (stats.level) {
        const levelMaterials = await db.prepare(`
          SELECT COUNT(*) as count FROM materials m
          JOIN courses c ON c.id = m.course_id
          WHERE c.level = $1 AND c.school = $2
        `).get(stats.level, school);
        stats.level_materials = levelMaterials.count;
      }

    } else if (role === 'lecturer') {
      const [courses, totalStudents, pendingSubmissions] = await Promise.all([
        db.prepare('SELECT COUNT(*) as count FROM courses WHERE lecturer_id = $1').get(userId),
        db.prepare(`
          SELECT COUNT(DISTINCT e.student_id) as count FROM enrollments e
          JOIN courses c ON c.id = e.course_id WHERE c.lecturer_id = $1
        `).get(userId),
        db.prepare(`
          SELECT COUNT(*) as count FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
          WHERE a.created_by = $1 AND s.grade IS NULL
        `).get(userId)
      ]);
      stats.assigned_courses = courses.count;
      stats.total_students = totalStudents.count;
      stats.pending_grading = pendingSubmissions.count;

    } else if (role === 'school_admin') {
      const [totalStudents, totalLecturers, totalCourses, totalMaterials, pendingNews, pendingEvents] = await Promise.all([
        db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND school = $1").get(school),
        db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer' AND school = $1").get(school),
        db.prepare("SELECT COUNT(*) as count FROM courses WHERE school = $1").get(school),
        db.prepare("SELECT COUNT(*) as count FROM materials m JOIN courses c ON c.id = m.course_id WHERE c.school = $1").get(school),
        db.prepare("SELECT COUNT(*) as count FROM news WHERE school = $1 AND status = 'pending'").get(school),
        db.prepare("SELECT COUNT(*) as count FROM calendar_events WHERE school = $1 AND status = 'pending'").get(school)
      ]);
      stats.total_students = totalStudents.count;
      stats.total_lecturers = totalLecturers.count;
      stats.total_courses = totalCourses.count;
      stats.total_materials = totalMaterials.count;
      stats.pending_news = pendingNews.count;
      stats.pending_events = pendingEvents.count;

    } else {
      const [totalStudents, totalLecturers, totalCourses, totalMaterials] = await Promise.all([
        db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get(),
        db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer'").get(),
        db.prepare('SELECT COUNT(*) as count FROM courses').get(),
        db.prepare('SELECT COUNT(*) as count FROM materials').get()
      ]);
      stats.total_students = totalStudents.count;
      stats.total_lecturers = totalLecturers.count;
      stats.total_courses = totalCourses.count;
      stats.total_materials = totalMaterials.count;
    }

    const schoolParam = school === 'All' ? null : school;
    const [recentNews, upcomingEvents] = await Promise.all([
      db.prepare(`
        SELECT n.*, u.full_name as author FROM news n
        JOIN users u ON u.id = n.published_by
        WHERE (n.school = $1 OR n.school IS NULL) AND n.status = 'approved'
        ORDER BY n.created_at DESC LIMIT 5
      `).all(schoolParam),
      db.prepare(`
        SELECT * FROM calendar_events
        WHERE (school = $1 OR school IS NULL) AND event_date >= NOW() AND status = 'approved'
        ORDER BY event_date ASC LIMIT 10
      `).all(schoolParam)
    ]);

    res.json({ stats, recentNews, upcomingEvents });
  } catch (err) {
    handleDbError(res, err, 'Unable to load dashboard data');
  }
});

module.exports = router;

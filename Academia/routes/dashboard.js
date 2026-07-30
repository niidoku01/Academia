const express = require('express');
const db = require('../models/database');
const { handleDbError } = require('../utils/security');

const router = express.Router();

router.get('/', async (req, res) => {
  const client = await db.getClient();
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
        client.query('SELECT level, department, matric_number FROM users WHERE id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM enrollments WHERE student_id = $1', [userId]),
        client.query(`
          SELECT COUNT(*) as count FROM assignments a
          JOIN enrollments e ON e.course_id = a.course_id
          WHERE e.student_id = $1 AND a.due_date > NOW()
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = a.id AND student_id = $1)
        `, [userId]),
        client.query('SELECT COUNT(*) as count FROM submissions WHERE student_id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM submissions WHERE student_id = $1 AND grade IS NOT NULL', [userId]),
        client.query(`
          SELECT AVG(CAST(s.grade AS FLOAT) / CAST(a.total_marks AS FLOAT) * 100) as avg
          FROM submissions s JOIN assignments a ON a.id = s.assignment_id
          WHERE s.student_id = $1 AND s.grade IS NOT NULL
        `, [userId]),
        client.query(`
          SELECT COUNT(*) as count FROM midsem_exams m
          JOIN enrollments e ON e.course_id = m.course_id
          WHERE e.student_id = $1 AND m.exam_date > NOW()
        `, [userId]),
        client.query(`
          SELECT COUNT(*) as count FROM materials m
          JOIN courses c ON c.id = m.course_id
          JOIN enrollments e ON e.course_id = c.id
          WHERE e.student_id = $1
        `, [userId]),
        client.query(`
          SELECT c.id, c.code, c.title, c.level, c.semester, u.full_name as lecturer_name
          FROM courses c
          JOIN enrollments e ON e.course_id = c.id
          LEFT JOIN users u ON u.id = c.lecturer_id
          WHERE e.student_id = $1
          ORDER BY c.level, c.code
        `, [userId]),
        client.query(`
          SELECT s.*, a.title as assignment_title, a.total_marks, c.code as course_code, c.title as course_title
          FROM submissions s
          JOIN assignments a ON a.id = s.assignment_id
          JOIN courses c ON c.id = a.course_id
          WHERE s.student_id = $1
          ORDER BY s.submitted_at DESC LIMIT 5
        `, [userId]),
        client.query(`
          SELECT a.id, a.title, a.due_date, a.total_marks, c.code as course_code, c.title as course_title
          FROM assignments a
          JOIN courses c ON c.id = a.course_id
          JOIN enrollments e ON e.course_id = a.course_id
          WHERE e.student_id = $1 AND a.due_date > NOW()
          AND NOT EXISTS (SELECT 1 FROM submissions WHERE assignment_id = a.id AND student_id = $1)
          ORDER BY a.due_date ASC LIMIT 5
        `, [userId]),
        client.query(`
          SELECT m.*, c.code as course_code, c.title as course_title, u.full_name as uploader
          FROM materials m
          JOIN courses c ON c.id = m.course_id
          JOIN enrollments e ON e.course_id = c.id
          LEFT JOIN users u ON u.id = m.uploaded_by
          WHERE e.student_id = $1
          ORDER BY m.created_at DESC LIMIT 5
        `, [userId])
      ]);

      stats.level = studentLevel.rows[0] ? studentLevel.rows[0].level : null;
      stats.department = studentLevel.rows[0] ? studentLevel.rows[0].department : null;
      stats.matric_number = studentLevel.rows[0] ? studentLevel.rows[0].matric_number : null;
      stats.enrolled_courses = Number(enrollments.rows[0].count);
      stats.pending_assignments = Number(pendingAssignments.rows[0].count);
      stats.completed_submissions = Number(completedSubmissions.rows[0].count);
      stats.graded_count = Number(gradedSubmissions.rows[0].count);
      stats.average_grade = avgGrade.rows[0].avg ? Math.round(Number(avgGrade.rows[0].avg)) : null;
      stats.upcoming_exams = Number(upcomingExams.rows[0].count);
      stats.course_materials = Number(totalMaterials.rows[0].count);
      stats.my_courses = studentCourses.rows;
      stats.recent_submissions = recentSubmissions.rows;
      stats.upcoming_deadlines = upcomingDeadlines.rows;
      stats.recent_materials = recentMaterials.rows;

      if (stats.level) {
        const levelMaterials = await client.query(
          'SELECT COUNT(*) as count FROM materials m JOIN courses c ON c.id = m.course_id WHERE c.level = $1 AND c.school = $2',
          [stats.level, school]
        );
        stats.level_materials = Number(levelMaterials.rows[0].count);
      }

    } else if (role === 'lecturer') {
      const [courses, totalStudents, pendingSubmissions] = await Promise.all([
        client.query('SELECT COUNT(*) as count FROM courses WHERE lecturer_id = $1', [userId]),
        client.query('SELECT COUNT(DISTINCT e.student_id) as count FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.lecturer_id = $1', [userId]),
        client.query('SELECT COUNT(*) as count FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.created_by = $1 AND s.grade IS NULL', [userId])
      ]);
      stats.assigned_courses = Number(courses.rows[0].count);
      stats.total_students = Number(totalStudents.rows[0].count);
      stats.pending_grading = Number(pendingSubmissions.rows[0].count);

    } else if (role === 'school_admin') {
      const [s1, s2, s5, s6] = await Promise.all([
        client.query("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND school = $1", [school]),
        client.query("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer' AND school = $1", [school]),
        client.query("SELECT COUNT(*) as count FROM news WHERE school = $1 AND status = 'pending'", [school]),
        client.query("SELECT COUNT(*) as count FROM calendar_events WHERE school = $1 AND status = 'pending'", [school])
      ]);
      stats.total_students = Number(s1.rows[0].count);
      stats.total_lecturers = Number(s2.rows[0].count);
      stats.pending_news = Number(s5.rows[0].count);
      stats.pending_events = Number(s6.rows[0].count);

    } else {
      const [s1, s2] = await Promise.all([
        client.query("SELECT COUNT(*) as count FROM users WHERE role = 'student'"),
        client.query("SELECT COUNT(*) as count FROM users WHERE role = 'lecturer'")
      ]);
      stats.total_students = Number(s1.rows[0].count);
      stats.total_lecturers = Number(s2.rows[0].count);
    }

    const schoolParam = school === 'All' ? null : school;
    const [recentNews, upcomingEvents] = await Promise.all([
      client.query(`
        SELECT n.*, u.full_name as author FROM news n
        JOIN users u ON u.id = n.published_by
        WHERE (n.school = $1 OR n.school IS NULL) AND n.status = 'approved'
        ORDER BY n.created_at DESC LIMIT 5
      `, [schoolParam]),
      client.query(`
        SELECT * FROM calendar_events
        WHERE (school = $1 OR school IS NULL) AND event_date >= NOW() AND status = 'approved'
        ORDER BY event_date ASC LIMIT 10
      `, [schoolParam])
    ]);

    res.json({ stats, recentNews: recentNews.rows, upcomingEvents: upcomingEvents.rows });
  } catch (err) {
    handleDbError(res, err, 'Unable to load dashboard data');
  } finally {
    client.release();
  }
});

module.exports = router;

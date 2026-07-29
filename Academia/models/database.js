const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim() || undefined,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('sslmode=disable') ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const result = await pool.query(sql, args);
        return result.rows[0] || undefined;
      },
      async all(...args) {
        const result = await pool.query(sql, args);
        return result.rows;
      },
      async run(...args) {
        const trimmed = sql.trim().toUpperCase();
        const isInsert = trimmed.startsWith('INSERT');
        const query = isInsert && !trimmed.includes('RETURNING')
          ? sql.replace(/;$/, '') + ' RETURNING id'
          : sql;
        const result = await pool.query(query, args);
        return {
          lastInsertRowid: isInsert && result.rows.length > 0
            ? Number(result.rows[0].id || 0)
            : 0,
          changes: result.rowCount || 0
        };
      }
    };
  },
  async exec(sql) {
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
  },
  async getClient() {
    const client = await pool.connect();
    return {
      query: (sql, args) => client.query(sql, args),
      release: () => client.release()
    };
  },
  async end() {
    await pool.end();
  }
};

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'lecturer', 'admin', 'school_admin')),
      school TEXT NOT NULL,
      department TEXT,
      level TEXT,
      matric_number TEXT,
      identity_code TEXT UNIQUE,
      mfa_enabled INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS mfa_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_token TEXT UNIQUE NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      level TEXT NOT NULL CHECK(level IN ('L100','L200','L300','L400')),
      school TEXT NOT NULL,
      department TEXT,
      semester TEXT NOT NULL CHECK(semester IN ('first', 'second')),
      academic_year TEXT DEFAULT '2025/2026',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      lecturer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      enrolled_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      file_type TEXT,
      uploaded_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      level TEXT,
      semester TEXT,
      academic_year TEXT,
      category TEXT CHECK(category IN ('lecture_note','textbook','past_question','video','slide','other')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id SERIAL PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      due_date TIMESTAMPTZ NOT NULL,
      total_marks INTEGER DEFAULT 100,
      attachment_path TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id SERIAL PRIMARY KEY,
      assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      file_path TEXT,
      notes TEXT,
      grade INTEGER,
      feedback TEXT,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS midsem_exams (
      id SERIAL PRIMARY KEY,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      exam_date TIMESTAMPTZ NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      total_marks INTEGER DEFAULT 50,
      venue TEXT,
      instructions TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      event_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ,
      event_type TEXT CHECK(event_type IN ('exam','assignment','lecture','deadline','event','holiday')),
      course_id INTEGER REFERENCES courses(id) ON DELETE SET NULL,
      school TEXT,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id SERIAL PRIMARY KEY,
      identifier TEXT NOT NULL,
      ip_address TEXT,
      success INTEGER DEFAULT 0,
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS news (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT CHECK(category IN ('announcement','event','update','urgent')),
      school TEXT,
      image_path TEXT,
      published_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
      is_pinned INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      position TEXT,
      bio TEXT,
      phone TEXT,
      photo_path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lecturer_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT,
      office_location TEXT,
      phone TEXT,
      office_hours TEXT,
      specialization TEXT,
      qualification TEXT,
      photo_path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_identity_code ON users(identity_code);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_school_role ON users(school, role);
    CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments(student_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments(course_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_created_by ON assignments(created_by);
    CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments(due_date);
    CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
    CREATE INDEX IF NOT EXISTS idx_materials_course ON materials(course_id);
    CREATE INDEX IF NOT EXISTS idx_materials_uploaded_by ON materials(uploaded_by);
    CREATE INDEX IF NOT EXISTS idx_midsem_course ON midsem_exams(course_id);
    CREATE INDEX IF NOT EXISTS idx_calendar_event_date ON calendar_events(event_date);
    CREATE INDEX IF NOT EXISTS idx_calendar_status ON calendar_events(status);
    CREATE INDEX IF NOT EXISTS idx_calendar_school ON calendar_events(school);
    CREATE INDEX IF NOT EXISTS idx_news_status ON news(status);
    CREATE INDEX IF NOT EXISTS idx_news_school ON news(school);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempted_at);
  `);

  const existingAdmin = await db.prepare('SELECT id FROM users WHERE role = $1').get('admin');
  if (!existingAdmin) {
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@1234';
    const hashedPassword = bcrypt.hashSync(defaultAdminPassword, 10);
    await db.prepare('INSERT INTO users (full_name, email, password, role, school, department) VALUES ($1, $2, $3, $4, $5, $6)')
      .run('System Admin', 'admin@academia.edu', hashedPassword, 'admin', 'All', 'Administration');
    console.log('Default admin created.');
  }

  try { await pool.query("UPDATE users SET mfa_enabled = 0 WHERE mfa_enabled IS NULL"); } catch(e) {}
  try { await pool.query("UPDATE users SET identity_code = NULL WHERE identity_code = ''"); } catch(e) {}

  try {
    const usersWithoutCode = await db.prepare('SELECT id, role FROM users WHERE identity_code IS NULL OR identity_code = $1').all('');
    for (const user of usersWithoutCode) {
      const prefix = user.role === 'student' ? 'STU' : 'STA';
      const code = prefix + '-' + String(user.id).padStart(5, '0');
      await db.prepare('UPDATE users SET identity_code = $1 WHERE id = $2').run(code, user.id);
    }
  } catch(e) {}
}

module.exports = db;
module.exports.initDatabase = initDatabase;

const { createClient } = require('@libsql/client');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbUrl = (process.env.TURSO_DATABASE_URL || '').trim()
  || (process.env.VERCEL ? 'file:/tmp/academia.db' : 'file:' + path.join(__dirname, '..', 'academia.db'));

const client = createClient({
  url: dbUrl,
  authToken: (process.env.TURSO_AUTH_TOKEN || '').trim() || undefined
});

const db = {
  prepare(sql) {
    return {
      async get(...args) {
        const result = await client.execute({ sql, args });
        return result.rows[0] || undefined;
      },
      async all(...args) {
        const result = await client.execute({ sql, args });
        return result.rows;
      },
      async run(...args) {
        const result = await client.execute({ sql, args });
        return {
          lastInsertRowid: Number(result.lastInsertRowid || 0),
          changes: Number(result.rowsAffected || 0)
        };
      }
    };
  },
  async exec(sql) {
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      await client.execute(stmt);
    }
  },
  async pragma(str) {
    await client.execute('PRAGMA ' + str);
  }
};

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS mfa_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      challenge_token TEXT UNIQUE NOT NULL,
      otp_code TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      level TEXT NOT NULL CHECK(level IN ('L100','L200','L300','L400')),
      school TEXT NOT NULL,
      department TEXT,
      semester TEXT NOT NULL CHECK(semester IN ('first', 'second')),
      academic_year TEXT DEFAULT '2025/2026',
      status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
      lecturer_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lecturer_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(student_id, course_id)
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      file_type TEXT,
      uploaded_by INTEGER NOT NULL,
      level TEXT,
      semester TEXT,
      academic_year TEXT,
      category TEXT CHECK(category IN ('lecture_note','textbook','past_question','video','slide','other')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date DATETIME NOT NULL,
      total_marks INTEGER DEFAULT 100,
      attachment_path TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assignment_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      file_path TEXT,
      notes TEXT,
      grade INTEGER,
      feedback TEXT,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS midsem_exams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      exam_date DATETIME NOT NULL,
      duration_minutes INTEGER DEFAULT 60,
      total_marks INTEGER DEFAULT 50,
      venue TEXT,
      instructions TEXT,
      created_by INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date DATETIME NOT NULL,
      end_date DATETIME,
      event_type TEXT CHECK(event_type IN ('exam','assignment','lecture','deadline','event','holiday')),
      course_id INTEGER,
      school TEXT,
      created_by INTEGER NOT NULL,
      status TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier TEXT NOT NULL,
      ip_address TEXT,
      success INTEGER DEFAULT 0,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT CHECK(category IN ('announcement','event','update','urgent')),
      school TEXT,
      image_path TEXT,
      published_by INTEGER NOT NULL,
      status TEXT DEFAULT 'approved' CHECK(status IN ('pending','approved','rejected')),
      is_pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      position TEXT,
      bio TEXT,
      phone TEXT,
      photo_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lecturer_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      bio TEXT,
      office_location TEXT,
      phone TEXT,
      office_hours TEXT,
      specialization TEXT,
      qualification TEXT,
      photo_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_identity_code ON users(identity_code);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier ON login_attempts(identifier, attempted_at);
  `);

  const existingAdmin = await db.prepare('SELECT id FROM users WHERE role = ?').get('admin');
  if (!existingAdmin) {
    const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || ('Admin-' + crypto.randomBytes(8).toString('hex'));
    const hashedPassword = bcrypt.hashSync(defaultAdminPassword, 12);
    await db.prepare('INSERT INTO users (full_name, email, password, role, school, department) VALUES (?, ?, ?, ?, ?, ?)')
      .run('System Admin', 'admin@academia.edu', hashedPassword, 'admin', 'All', 'Administration');
    console.log('Default admin created. Set DEFAULT_ADMIN_PASSWORD env var to control the initial password.');
  }

  try { await client.execute("UPDATE users SET mfa_enabled = 0 WHERE mfa_enabled IS NULL OR mfa_enabled = 1"); } catch(e) {}
  try { await client.execute("UPDATE users SET identity_code = NULL WHERE identity_code = ''"); } catch(e) {}

  try {
    const usersWithoutCode = await db.prepare('SELECT id, role FROM users WHERE identity_code IS NULL OR identity_code = ?').all('');
    for (const user of usersWithoutCode) {
      const prefix = user.role === 'student' ? 'STU' : 'STA';
      const code = prefix + '-' + String(user.id).padStart(5, '0');
      await db.prepare('UPDATE users SET identity_code = ? WHERE id = ?').run(code, user.id);
    }
  } catch(e) {}
}

module.exports = db;
module.exports.initDatabase = initDatabase;

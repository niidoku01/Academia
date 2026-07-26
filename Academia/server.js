require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const helmet = require('helmet');
const db = require('./models/database');

if (!process.env.JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: JWT_SECRET must be set in production. Please add it to your environment.');
    process.exit(1);
  }
  const crypto = require('crypto');
  process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64url');
  console.warn('Warning: JWT_SECRET is not set. Generated a random dev secret (sessions will not persist across restarts).');
}
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const coursesRoutes = require('./routes/courses');
const assignmentsRoutes = require('./routes/assignments');
const calendarRoutes = require('./routes/calendar');
const newsRoutes = require('./routes/news');
const adminRoutes = require('./routes/admin');
const { authenticateToken, authorizeRoles } = require('./middleware/auth');
const jwt = require('jsonwebtoken');
const { logAudit } = require('./utils/security');

const app = express();
const PORT = process.env.PORT || 3000;

const fs = require('fs');
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const writableBaseDir = isServerless ? '/tmp' : __dirname;
const UPLOAD_DIR = path.join(writableBaseDir, 'uploads');
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) {}

function pageAuth(req, res, next) {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.redirect('/');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    res.redirect('/');
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.redirect('/dashboard');
    next();
  };
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"]
    }
  }
}));

// Redirect HTTP to HTTPS in production (honour proxy header if behind a proxy)
if (process.env.NODE_ENV === 'production') {
  app.enable('trust proxy');
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
    if (proto === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', authenticateToken, dashboardRoutes);
app.use('/api/courses', authenticateToken, coursesRoutes);
app.use('/api/assignments', authenticateToken, assignmentsRoutes);
app.use('/api/calendar', authenticateToken, calendarRoutes);
app.use('/api/news', authenticateToken, newsRoutes);
app.use('/api/admin', authenticateToken, adminRoutes);

const filesRoutes = require('./routes/files');
const profilesRoutes = require('./routes/profiles');
app.use('/api/files', authenticateToken, filesRoutes);
app.use('/api/profiles', authenticateToken, profilesRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.get('/dashboard', pageAuth, (req, res) => {
  logAudit('view_dashboard', { userId: req.user?.id }, req.user?.id || null);
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/courses', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courses.html'));
});

app.get('/assignments', pageAuth, (req, res, next) => {
  if (req.user.role === 'admin' || req.user.role === 'school_admin') return res.redirect('/admin');
  next();
}, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'assignments.html'));
});

app.get('/calendar', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'calendar.html'));
});

app.get('/news', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'news.html'));
});

app.get('/admin', pageAuth, requireRole('admin', 'school_admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/lecturers', pageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lecturers.html'));
});

app.get('/profile', pageAuth, requireRole('lecturer'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/admin-profile', pageAuth, requireRole('admin', 'school_admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-profile.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  logAudit('server_error', { path: req.originalUrl }, req.user?.id || null);
  res.status(err.statusCode || 500).json({ error: 'An unexpected error occurred.' });
});

// Listen only when run directly (not imported by Vercel)
if (require.main === module) {
  db.initDatabase()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Academia server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = app;

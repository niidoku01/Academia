const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const db = require('../models/database');
const { authenticateToken } = require('../middleware/auth');
const {
  sanitizeText,
  validateEmail,
  validatePassword,
  validateRole,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const RESET_EXPIRY_HOURS = 1;
const MFA_EXPIRY_MINUTES = 5;

async function recordAttempt(identifier, ip, success) {
  await db.prepare('INSERT INTO login_attempts (identifier, ip_address, success) VALUES ($1, $2, $3)').run(identifier, ip, success ? 1 : 0);
  if (success) {
    await db.prepare('DELETE FROM login_attempts WHERE identifier = $1 AND success = 0').run(identifier);
  }
}

async function getFailedAttempts(identifier) {
  const row = await db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE identifier = $1 AND success = 0 AND attempted_at > NOW() - INTERVAL '${LOCKOUT_MINUTES} minutes'
  `).get(identifier);
  return row.count;
}

async function isLockedOut(identifier) {
  return (await getFailedAttempts(identifier)) >= MAX_ATTEMPTS;
}

async function getLockoutRemaining(identifier) {
  const row = await db.prepare(`
    SELECT MAX(attempted_at) as last_attempt FROM login_attempts
    WHERE identifier = $1 AND success = 0
  `).get(identifier);
  if (!row.last_attempt) return 0;
  const lastAttempt = new Date(row.last_attempt);
  const unlockTime = new Date(lastAttempt.getTime() + LOCKOUT_MINUTES * 60000);
  const remaining = Math.ceil((unlockTime - new Date()) / 60000);
  return remaining > 0 ? remaining : 0;
}

function generateIdentityCode(role, id) {
  const prefix = role === 'student' ? 'STU' : 'STA';
  return `${prefix}-${String(id).padStart(5, '0')}`;
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getBaseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

function buildTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendEmail(to, subject, html) {
  const transporter = buildTransport();
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[email-preview] ${subject} -> ${to}`);
    }
    return true;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@academia.local',
    to,
    subject,
    html
  });

  return true;
}

function shouldForcePasswordChange(user) {
  if (!user || !user.password) return false;
  const defaultPasswords = (process.env.DEFAULT_PASSWORDS || '').split(',').filter(Boolean);
  return defaultPasswords.some((pw) => bcrypt.compareSync(pw, user.password));
}

function buildAuthPayload(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    school: user.school,
    department: user.department,
    level: user.level,
    matric_number: user.matric_number,
    identity_code: user.identity_code,
    forcePasswordChange: shouldForcePasswordChange(user)
  };
}

router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password, role, school, department, level, matric_number } = req.body;

    const safeFullName = sanitizeText(full_name);
    const safeEmail = normalizeText(email).toLowerCase();
    const safeRole = normalizeText(role);
    const safeSchool = sanitizeText(school);
    const safeDepartment = sanitizeText(department);
    const safeLevel = normalizeText(level);
    const safeMatric = sanitizeText(matric_number);

    if (!safeFullName || !safeEmail || !password || !safeRole || !safeSchool) {
      return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    if (!validateEmail(safeEmail)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.' });
    }

    if (!validateRole(safeRole)) {
      return res.status(400).json({ error: 'Invalid role selected.' });
    }

    if (safeRole === 'student' && !safeMatric) {
      return res.status(400).json({ error: 'Matric number is required for students.' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE email = $1').get(safeEmail);
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    if (safeRole === 'student' && safeMatric) {
      const existingMatric = await db.prepare('SELECT id FROM users WHERE matric_number = $1').get(safeMatric);
      if (existingMatric) return res.status(400).json({ error: 'Matric number already registered.' });
    }

    const hashedPassword = bcrypt.hashSync(password, 12);
    const result = await db.prepare(
      'INSERT INTO users (full_name, email, password, role, school, department, level, matric_number, identity_code, mfa_enabled) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)'
    ).run(safeFullName, safeEmail, hashedPassword, safeRole, safeSchool, safeDepartment || null, safeLevel || null, safeMatric || null, null, safeRole === 'student' ? 0 : 1);

    const identityCode = generateIdentityCode(safeRole, Number(result.lastInsertRowid));
    await db.prepare('UPDATE users SET identity_code = $1 WHERE id = $2').run(identityCode, result.lastInsertRowid);

    const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(result.lastInsertRowid);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name, school: user.school },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logAudit('register', { role: safeRole, email: safeEmail }, result.lastInsertRowid);

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'lax' });
    res.json({ message: 'Registration successful', token, user: buildAuthPayload(user) });
  } catch (err) {
    handleDbError(res, err, 'Registration failed');
  }
});

router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const lookup = normalizeText(identifier).toLowerCase();

    if (!lookup || !password) {
      return res.status(400).json({ error: 'Please enter your credentials.' });
    }

    const ip = req.ip || req.connection.remoteAddress;

    if (await isLockedOut(lookup)) {
      const remaining = await getLockoutRemaining(lookup);
      return res.status(429).json({
        error: `Account temporarily locked due to too many failed attempts. Try again in ${remaining} minute${remaining !== 1 ? 's' : ''}.`,
        locked: true,
        remaining
      });
    }

    let user = await db.prepare(`
      SELECT * FROM users
      WHERE email = $1 OR matric_number = $1 OR identity_code = $1
    `).get(lookup);

    if (!user) {
      await recordAttempt(lookup, ip, false);
      const remaining = MAX_ATTEMPTS - (await getFailedAttempts(lookup));
      return res.status(401).json({
        error: 'Invalid credentials. ' + (remaining > 0 ? `${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : 'Account locked.'),
        remaining
      });
    }

    const expectedPrefix = user.role === 'student' ? 'STU' : 'STA';
    if (user.identity_code && !user.identity_code.startsWith(expectedPrefix)) {
      await recordAttempt(lookup, ip, false);
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      await recordAttempt(lookup, ip, false);
      const remaining = MAX_ATTEMPTS - (await getFailedAttempts(lookup));
      return res.status(401).json({
        error: 'Invalid credentials. ' + (remaining > 0 ? `${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : 'Account locked.'),
        remaining
      });
    }

    await recordAttempt(lookup, ip, true);

    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const requiresMfa = Number(user.mfa_enabled) === 1 && ['lecturer', 'admin'].includes(user.role) && smtpConfigured;

    if (requiresMfa) {
      const otpCode = String(crypto.randomInt(100000, 999999));
      const challengeToken = crypto.randomBytes(20).toString('hex');
      const expiresAt = new Date(Date.now() + MFA_EXPIRY_MINUTES * 60000).toISOString();

      await db.prepare('INSERT INTO mfa_tokens (user_id, challenge_token, otp_code, expires_at) VALUES ($1, $2, $3, $4)')
        .run(user.id, challengeToken, otpCode, expiresAt);

      await sendEmail(
        user.email,
        'Academia staff MFA verification code',
        `<div style="font-family:Arial,sans-serif;line-height:1.6;padding:24px"><h2>Academia Staff Verification</h2><p>Your one-time verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otpCode}</p><p>This code expires in ${MFA_EXPIRY_MINUTES} minutes.</p></div>`
      );

      logAudit('mfa_challenge_sent', { email: user.email, role: user.role }, user.id);

      return res.status(202).json({
        message: 'Staff login requires MFA verification.',
        mfaRequired: true,
        challengeToken,
        user: buildAuthPayload(user)
      });
    }

    const authUser = buildAuthPayload(user);
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name, school: user.school },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logAudit('login', { email: user.email, role: user.role }, user.id);

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'lax' });
    res.json({
      message: 'Login successful',
      token,
      user: authUser,
      forcePasswordChange: authUser.forcePasswordChange
    });
  } catch (err) {
    handleDbError(res, err, 'Login failed');
  }
});

router.post('/verify-mfa', async (req, res) => {
  try {
    const { challengeToken, otpCode } = req.body;
    if (!challengeToken || !otpCode) {
      return res.status(400).json({ error: 'Verification data is incomplete.' });
    }

    const mfaRow = await db.prepare('SELECT * FROM mfa_tokens WHERE challenge_token = $1 AND used = 0').get(challengeToken);
    if (!mfaRow) return res.status(400).json({ error: 'Invalid or expired MFA challenge.' });

    const expiresAt = new Date(mfaRow.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired MFA challenge.' });
    }

    if (String(mfaRow.otp_code) !== String(otpCode).trim()) {
      return res.status(400).json({ error: 'Incorrect verification code.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(mfaRow.user_id);
    if (!user) return res.status(400).json({ error: 'User not found.' });

    await db.prepare('UPDATE mfa_tokens SET used = 1 WHERE id = $1').run(mfaRow.id);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, full_name: user.full_name, school: user.school },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    logAudit('mfa_verified', { email: user.email, role: user.role }, user.id);

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 86400000, sameSite: 'lax' });
    res.json({ message: 'Login successful', token, user: buildAuthPayload(user) });
  } catch (err) {
    handleDbError(res, err, 'MFA verification failed');
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeText(req.body.email || '').toLowerCase();
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE email = $1').get(email);
    if (!user) {
      return res.json({ message: 'If that email exists in the system, a password reset link has been sent.' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + RESET_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();

    await db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)')
      .run(user.id, token, expiresAt);

    await sendEmail(
      user.email,
      'Academia password reset request',
      `<div style="font-family:Arial,sans-serif;line-height:1.6;padding:24px"><h2>Password reset</h2><p>Use the link below to reset your password.</p><p><a href="${getBaseUrl()}/reset-password?token=${token}">Reset password</a></p><p>This link expires in 1 hour.</p></div>`
    );

    logAudit('password_reset_requested', { email: user.email }, user.id);
    res.json({ message: 'If that email exists in the system, a password reset link has been sent.' });
  } catch (err) {
    handleDbError(res, err, 'Unable to process password reset request');
  }
});

router.get('/validate-reset-token', async (req, res) => {
  const token = normalizeText(req.query.token || '');
  if (!token) return res.status(400).json({ error: 'Reset token missing.' });

  const row = await db.prepare('SELECT * FROM password_reset_tokens WHERE token = $1 AND used = 0').get(token);
  if (!row) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    return res.status(400).json({ error: 'This reset link has expired.' });
  }

  res.json({ valid: true });
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    const resetToken = normalizeText(token || '');
    const newPassword = normalizeText(password || '');

    if (!resetToken || !newPassword) {
      return res.status(400).json({ error: 'Reset token and new password are required.' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.' });
    }

    const row = await db.prepare('SELECT * FROM password_reset_tokens WHERE token = $1 AND used = 0').get(resetToken);
    if (!row) return res.status(400).json({ error: 'This reset link is invalid or has already been used.' });

    const expiresAt = new Date(row.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired.' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(row.user_id);
    if (!user) return res.status(400).json({ error: 'User not found.' });

    const hashedPassword = bcrypt.hashSync(newPassword, 12);
    await db.prepare('UPDATE users SET password = $1 WHERE id = $2').run(hashedPassword, user.id);
    await db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = $1').run(resetToken);

    logAudit('password_reset_completed', { email: user.email }, user.id);
    res.json({ message: 'Password reset successful. You can now sign in with your new password.' });
  } catch (err) {
    handleDbError(res, err, 'Unable to reset password');
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userRow = await db.prepare('SELECT * FROM users WHERE id = $1').get(req.user.id);

    if (!userRow) return res.status(404).json({ error: 'User not found.' });
    if (!bcrypt.compareSync(currentPassword || '', userRow.password)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    if (!validatePassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword, 12);
    await db.prepare('UPDATE users SET password = $1 WHERE id = $2').run(hashedPassword, req.user.id);
    logAudit('password_changed', { email: userRow.email }, req.user.id);
    res.json({ message: 'Password changed successfully. You can now enable MFA from this modal.' });
  } catch (err) {
    handleDbError(res, err, 'Unable to change password');
  }
});

router.post('/update-school', authenticateToken, (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admins can change school.' });
    const { school } = req.body;
    const safeSchool = sanitizeText(school);
    if (!safeSchool) return res.status(400).json({ error: 'School is required.' });

    db.prepare('UPDATE users SET school = $1 WHERE id = $2').run(safeSchool, req.user.id);
    logAudit('update_school', { school: safeSchool }, req.user.id);
    res.json({ message: 'School updated', school: safeSchool });
  } catch (err) {
    handleDbError(res, err, 'Unable to update school');
  }
});

router.post('/request-mfa-setup', authenticateToken, async (req, res) => {
  try {
    const user = await db.prepare('SELECT * FROM users WHERE id = $1').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const otpCode = String(crypto.randomInt(100000, 999999));
    const challengeToken = crypto.randomBytes(20).toString('hex');
    const expiresAt = new Date(Date.now() + MFA_EXPIRY_MINUTES * 60000).toISOString();

    await db.prepare('INSERT INTO mfa_tokens (user_id, challenge_token, otp_code, expires_at) VALUES ($1, $2, $3, $4)')
      .run(user.id, challengeToken, otpCode, expiresAt);

    await sendEmail(
      user.email,
      'Academia MFA setup code',
      `<div style="font-family:Arial,sans-serif;line-height:1.6;padding:24px"><h2>Academia MFA Setup</h2><p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${otpCode}</p><p>This code expires in ${MFA_EXPIRY_MINUTES} minutes.</p></div>`
    );

    logAudit('mfa_setup_requested', { email: user.email, role: user.role }, user.id);
    res.json({
      message: 'A one-time MFA setup code has been sent to your email. In preview mode, the code is also printed in the server console.',
      challengeToken
    });
  } catch (err) {
    handleDbError(res, err, 'Unable to set up MFA');
  }
});

router.post('/confirm-mfa-setup', authenticateToken, async (req, res) => {
  try {
    const { challengeToken, otpCode } = req.body;
    if (!challengeToken || !otpCode) {
      return res.status(400).json({ error: 'Verification data is incomplete.' });
    }

    const mfaRow = await db.prepare('SELECT * FROM mfa_tokens WHERE challenge_token = $1 AND used = 0').get(challengeToken);
    if (!mfaRow) return res.status(400).json({ error: 'Invalid or expired MFA challenge.' });

    const expiresAt = new Date(mfaRow.expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired MFA challenge.' });
    }

    if (String(mfaRow.otp_code) !== String(otpCode).trim()) {
      return res.status(400).json({ error: 'Incorrect verification code.' });
    }

    await db.prepare('UPDATE mfa_tokens SET used = 1 WHERE id = $1').run(mfaRow.id);
    await db.prepare('UPDATE users SET mfa_enabled = 1 WHERE id = $1').run(req.user.id);

    logAudit('mfa_setup_completed', { email: req.user.email, role: req.user.role }, req.user.id);
    res.json({ message: 'MFA has been enabled successfully for your account.' });
  } catch (err) {
    handleDbError(res, err, 'Unable to complete MFA setup');
  }
});

router.post('/logout', (req, res) => {
  try {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        logAudit('logout', { userId: decoded.id }, decoded.id);
      } catch {}
    }
    res.clearCookie('token');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    handleDbError(res, err, 'Logout failed');
  }
});

router.get('/me', async (req, res) => {
  const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.prepare('SELECT id, full_name, email, role, school, department, level, matric_number, identity_code FROM users WHERE id = $1').get(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

module.exports = router;

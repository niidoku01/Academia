const fs = require('fs');
const path = require('path');

function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '').trim();
}

function validateEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validatePassword(value) {
  return typeof value === 'string'
    && value.length >= 8
    && /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /[0-9]/.test(value)
    && /[!@#$%^&*(),.?":{}|<>]/.test(value);
}

function validateRole(value) {
  return ['student', 'lecturer', 'admin', 'school_admin'].includes(value);
}

function validateCourseLevel(value) {
  return ['L100', 'L200', 'L300', 'L400'].includes(value);
}

function validateSemester(value) {
  return ['first', 'second'].includes(value);
}

function validateCategory(value) {
  return ['lecture_note', 'textbook', 'past_question', 'video', 'slide', 'other'].includes(value);
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function logAudit(event, details, userId = null) {
  try {
    const logDir = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      userId,
      details
    });
    fs.appendFileSync(path.join(logDir, 'audit.log'), entry + '\n');
  } catch (error) {
    // Fail closed for logging; do not break the request
  }
}

function createError(message, status = 500) {
  const error = new Error(message);
  error.statusCode = status;
  return error;
}

function handleDbError(res, error, fallbackMessage = 'Request failed') {
  logAudit('database_error', { message: error.message });
  return res.status(500).json({ error: fallbackMessage });
}

module.exports = {
  sanitizeText,
  validateEmail,
  validatePassword,
  validateRole,
  validateCourseLevel,
  validateSemester,
  validateCategory,
  normalizeText,
  logAudit,
  createError,
  handleDbError
};

const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const { sanitizeText, normalizeText, logAudit, handleDbError } = require('../utils/security');

const router = express.Router();

const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, 'portrait-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const imageMimes = ['image/jpeg', 'image/png', 'image/gif'];
function imageFilter(req, file, cb) {
  if (imageMimes.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('Only JPEG, PNG, GIF images allowed'), false);
}
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

router.get('/lecturers', async (req, res) => {
  try {
    const { school, department, search } = req.query;
    let query = `
      SELECT u.id, u.full_name, u.email, u.department, u.school,
        lp.bio, lp.office_location, lp.phone, lp.office_hours,
        lp.specialization, lp.qualification, lp.photo_path
      FROM users u
      LEFT JOIN lecturer_profiles lp ON lp.user_id = u.id
      WHERE u.role = 'lecturer'
    `;
    const params = [];
    let idx = 1;

    if (school) { query += ` AND u.school = $${idx}`; params.push(school); idx++; }
    if (department) { query += ` AND u.department = $${idx}`; params.push(department); idx++; }
    if (search) { query += ` AND (u.full_name LIKE $${idx} OR u.department LIKE $${idx} OR lp.specialization LIKE $${idx})`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); idx += 3; }

    query += ' ORDER BY u.full_name';
    const lecturers = await db.prepare(query).all(...params);
    res.json(lecturers);
  } catch (err) {
    handleDbError(res, err, 'Unable to load lecturers');
  }
});

router.get('/lecturers/:userId', async (req, res) => {
  try {
    const lecturer = await db.prepare(`
      SELECT u.id, u.full_name, u.email, u.department, u.school,
        lp.bio, lp.office_location, lp.phone, lp.office_hours,
        lp.specialization, lp.qualification, lp.photo_path
      FROM users u
      LEFT JOIN lecturer_profiles lp ON lp.user_id = u.id
      WHERE u.id = $1 AND u.role = 'lecturer'
    `).get(req.params.userId);

    if (!lecturer) return res.status(404).json({ error: 'Lecturer not found' });
    res.json(lecturer);
  } catch (err) {
    handleDbError(res, err, 'Unable to load lecturer profile');
  }
});

router.get('/my-profile', authorizeRoles('lecturer', 'admin'), async (req, res) => {
  try {
    const profile = await db.prepare('SELECT * FROM lecturer_profiles WHERE user_id = $1').get(req.user.id);
    res.json(profile || {});
  } catch (err) {
    handleDbError(res, err, 'Unable to load profile');
  }
});

router.post('/my-profile', authorizeRoles('lecturer'), upload.single('photo'), async (req, res) => {
  try {
    const { bio, office_location, phone, office_hours, specialization, qualification } = req.body;
    const safeBio = sanitizeText(bio);
    const safeOffice = sanitizeText(office_location);
    const safePhone = normalizeText(phone);
    const safeHours = sanitizeText(office_hours);
    const safeSpec = sanitizeText(specialization);
    const safeQual = sanitizeText(qualification);
    const photoPath = req.file ? `/api/files/${req.file.filename}` : null;

    const existing = await db.prepare('SELECT id FROM lecturer_profiles WHERE user_id = $1').get(req.user.id);

    if (existing) {
      const updates = [];
      const params = [];
      let idx = 1;
      updates.push(`bio = $${idx++}`); params.push(safeBio);
      updates.push(`office_location = $${idx++}`); params.push(safeOffice);
      updates.push(`phone = $${idx++}`); params.push(safePhone);
      updates.push(`office_hours = $${idx++}`); params.push(safeHours);
      updates.push(`specialization = $${idx++}`); params.push(safeSpec);
      updates.push(`qualification = $${idx++}`); params.push(safeQual);
      if (photoPath) { updates.push(`photo_path = $${idx++}`); params.push(photoPath); }
      updates.push("updated_at = NOW()");
      params.push(req.user.id);
      await db.prepare(`UPDATE lecturer_profiles SET ${updates.join(', ')} WHERE user_id = $${idx}`).run(...params);
    } else {
      await db.prepare(
        'INSERT INTO lecturer_profiles (user_id, bio, office_location, phone, office_hours, specialization, qualification, photo_path) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
      ).run(req.user.id, safeBio, safeOffice, safePhone, safeHours, safeSpec, safeQual, photoPath);
    }

    logAudit('update_lecturer_profile', { userId: req.user.id }, req.user.id);
    res.json({ message: 'Profile saved successfully' });
  } catch (err) {
    handleDbError(res, err, 'Unable to save profile');
  }
});

router.get('/admin-profile', authorizeRoles('admin', 'school_admin'), async (req, res) => {
  try {
    const profile = await db.prepare(`
      SELECT u.id, u.full_name, u.email, u.school, u.department,
        ap.position, ap.bio, ap.phone, ap.photo_path
      FROM users u
      LEFT JOIN admin_profiles ap ON ap.user_id = u.id
      WHERE u.id = $1
    `).get(req.user.id);
    res.json(profile || {});
  } catch (err) {
    handleDbError(res, err, 'Unable to load admin profile');
  }
});

router.post('/admin-profile', authorizeRoles('admin', 'school_admin'), upload.single('photo'), async (req, res) => {
  try {
    const { position, bio, phone } = req.body;
    const safePosition = sanitizeText(position);
    const safeBio = sanitizeText(bio);
    const safePhone = normalizeText(phone);
    const photoPath = req.file ? `/api/files/${req.file.filename}` : null;

    const existing = await db.prepare('SELECT id FROM admin_profiles WHERE user_id = $1').get(req.user.id);

    if (existing) {
      const updates = [];
      const params = [];
      let idx = 1;
      updates.push(`position = $${idx++}`); params.push(safePosition);
      updates.push(`bio = $${idx++}`); params.push(safeBio);
      updates.push(`phone = $${idx++}`); params.push(safePhone);
      if (photoPath) { updates.push(`photo_path = $${idx++}`); params.push(photoPath); }
      updates.push("updated_at = NOW()");
      params.push(req.user.id);
      await db.prepare(`UPDATE admin_profiles SET ${updates.join(', ')} WHERE user_id = $${idx}`).run(...params);
    } else {
      await db.prepare(
        'INSERT INTO admin_profiles (user_id, position, bio, phone, photo_path) VALUES ($1, $2, $3, $4, $5)'
      ).run(req.user.id, safePosition, safeBio, safePhone, photoPath);
    }

    logAudit('update_admin_profile', { userId: req.user.id }, req.user.id);
    res.json({ message: 'Admin profile saved successfully' });
  } catch (err) {
    handleDbError(res, err, 'Unable to save admin profile');
  }
});

module.exports = router;

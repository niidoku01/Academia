const express = require('express');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const db = require('../models/database');
const { authorizeRoles } = require('../middleware/auth');
const {
  sanitizeText,
  normalizeText,
  logAudit,
  handleDbError
} = require('../utils/security');

const router = express.Router();

const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, 'news-' + Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});

const imageMimes = ['image/jpeg', 'image/png', 'image/gif'];
function imageFilter(req, file, cb) {
  if (imageMimes.includes(file.mimetype)) return cb(null, true);
  return cb(new Error('Unsupported image type'), false);
}

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

router.get('/', async (req, res) => {
  try {
    const { category, search, status: statusFilter } = req.query;
    let query = 'SELECT n.*, u.full_name as author FROM news n JOIN users u ON u.id = n.published_by WHERE 1=1';
    const params = [];
    let idx = 1;

    if (req.user.role === 'student') {
      query += ` AND n.status = 'approved' AND (n.school = $${idx} OR n.school IS NULL)`;
      params.push(req.user.school);
      idx++;
    } else if (req.user.role === 'lecturer') {
      query += ` AND n.published_by = $${idx}`;
      params.push(req.user.id);
      idx++;
      if (statusFilter) { query += ` AND n.status = $${idx}`; params.push(statusFilter); idx++; }
    }

    if (category) { query += ` AND n.category = $${idx}`; params.push(category); idx++; }
    if (search) { query += ` AND (n.title LIKE $${idx} OR n.content LIKE $${idx})`; params.push(`%${search}%`, `%${search}%`); idx += 2; }

    query += ' ORDER BY n.is_pinned DESC, n.created_at DESC';
    const news = await db.prepare(query).all(...params);
    res.json(news);
  } catch (err) {
    handleDbError(res, err, 'Unable to load news');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const article = await db.prepare(`
      SELECT n.*, u.full_name as author FROM news n
      JOIN users u ON u.id = n.published_by WHERE n.id = $1
    `).get(req.params.id);
    if (!article) return res.status(404).json({ error: 'Article not found' });
    res.json(article);
  } catch (err) {
    handleDbError(res, err, 'Unable to load article');
  }
});

router.post('/', authorizeRoles('lecturer', 'admin'), upload.single('image'), async (req, res) => {
  try {
    const { title, content, category, school, is_pinned } = req.body;
    const safeTitle = sanitizeText(title);
    const safeContent = sanitizeText(content);
    const safeCategory = normalizeText(category) || 'announcement';
    const safeSchool = sanitizeText(school) || null;
    const imagePath = req.file ? `/api/files/${req.file.filename}` : null;
    const status = req.user.role === 'admin' ? 'approved' : 'pending';

    if (!safeTitle || !safeContent) return res.status(400).json({ error: 'News title and content are required.' });
    if (!['announcement', 'event', 'update', 'urgent'].includes(safeCategory)) return res.status(400).json({ error: 'Invalid news category.' });

    const result = await db.prepare(
      'INSERT INTO news (title, content, category, school, image_path, published_by, status, is_pinned) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)'
    ).run(safeTitle, safeContent, safeCategory, safeSchool, imagePath, req.user.id, status, is_pinned ? 1 : 0);

    logAudit('create_news', { title: safeTitle, category: safeCategory }, req.user.id);
    res.json({ message: status === 'pending' ? 'News submitted (pending approval)' : 'News published', id: result.lastInsertRowid });
  } catch (err) {
    handleDbError(res, err, 'Unable to publish news');
  }
});

router.delete('/:id', authorizeRoles('admin'), async (req, res) => {
  try {
    const newsId = Number(req.params.id);
    if (!Number.isInteger(newsId) || newsId <= 0) return res.status(400).json({ error: 'Invalid article id.' });
    await db.prepare('DELETE FROM news WHERE id = $1').run(newsId);
    logAudit('delete_news', { newsId }, req.user.id);
    res.json({ message: 'Article deleted' });
  } catch (err) {
    handleDbError(res, err, 'Unable to delete article');
  }
});

module.exports = router;

const express = require('express');
const path = require('path');
const fs = require('fs');
const { logAudit } = require('../utils/security');

const router = express.Router();
const UPLOAD_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

router.get('/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    logAudit('download_file', { filename }, req.user?.id || null);
    return res.sendFile(filePath);
  } catch (err) {
    return res.status(500).json({ error: 'Unable to retrieve file' });
  }
});

module.exports = router;

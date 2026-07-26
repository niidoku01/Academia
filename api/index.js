let app;

try {
  app = require('../Academia/server');
  const db = require('../Academia/models/database');
  db.initDatabase().catch((err) => {
    console.error('Failed to initialize database:', err);
  });
} catch (err) {
  console.error('Failed to load application:', err);
}

module.exports = async (req, res) => {
  if (!app) {
    return res.status(500).json({ error: 'Application failed to start' });
  }
  return app(req, res);
};

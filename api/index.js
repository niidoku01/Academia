let app;
let ready = false;

async function init() {
  try {
    app = require('../Academia/server');
    const db = require('../Academia/models/database');
    await db.initDatabase();
    ready = true;
    console.log('Application initialized successfully');
  } catch (err) {
    console.error('Failed to initialize application:', err);
  }
}

const initPromise = init();

module.exports = async (req, res) => {
  await initPromise;
  if (!app || !ready) {
    return res.status(500).json({ error: 'Application failed to start. Check server logs.' });
  }
  return app(req, res);
};

const app = require('../Academia/server');
const db = require('../Academia/models/database');

const ready = db.initDatabase().catch((err) => {
  console.error('Failed to initialize database:', err);
});

module.exports = async (req, res) => {
  await ready;
  return app(req, res);
};

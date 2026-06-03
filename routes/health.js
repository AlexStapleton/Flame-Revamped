const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const LOG_PATH = '/app/log/access.log';
const CONFIG_PATH = '/app/data/config.json';
const DB_PATH = '/app/data/db.sqlite';

router.get('/', async (req, res) => {
  const debug = req.query.debug === 'true';
  const errors = [];
  let status = 'healthy';

  // 1. Check config.json exists
  if (!fs.existsSync(CONFIG_PATH)) {
    errors.push('Missing config.json');
  }

  // 2. Check database exists
  if (!fs.existsSync(DB_PATH)) {
    errors.push('Missing SQLite DB');
  }

  // 3. Optional: scan access.log for recent errors if it has been
  //    bind-mounted in (e.g. for fail2ban). Missing log is not an error.
  let recentErrors = [];
  if (fs.existsSync(LOG_PATH)) {
    const lines = fs.readFileSync(LOG_PATH, 'utf-8').split('\n').reverse().slice(0, 100);
    recentErrors = lines.filter((line) => line.includes('ERROR') || line.includes('Failed'));
    if (recentErrors.length >= 5) {
      errors.push(`${recentErrors.length} recent error lines found`);
    }
  }

  if (errors.length > 0) {
    status = 'unhealthy';
  }

  const httpStatus = status === 'healthy' ? 200 : 503;
  const body = { status, errors };
  if (debug && recentErrors.length > 0) {
    body.recentErrorLines = recentErrors;
  }
  return res.status(httpStatus).json(body);
});

module.exports = router;

const express = require('express');
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../db');

const router = express.Router();

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'config.json');
const DB_TIMEOUT_MS = 2000;

// Resolves when the check passes, rejects when it fails.
const defaultCheckConfig = () => fs.promises.access(CONFIG_PATH, fs.constants.F_OK);
const defaultCheckDb = () => sequelize.query('SELECT 1');

// Rejects if `promise` does not settle within `ms`. The timer is always cleared
// so it never keeps the event loop alive.
const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

const createHealthHandler = ({
  checkConfig = defaultCheckConfig,
  checkDb = defaultCheckDb,
  timeoutMs = DB_TIMEOUT_MS,
} = {}) =>
  async function health(req, res) {
    const errors = [];

    const [configResult, dbResult] = await Promise.allSettled([
      Promise.resolve().then(() => checkConfig()),
      withTimeout(Promise.resolve().then(() => checkDb()), timeoutMs),
    ]);

    if (configResult.status === 'rejected') {
      errors.push('Missing config.json');
    }
    if (dbResult.status === 'rejected') {
      errors.push('Database unreachable');
    }

    const healthy = errors.length === 0;
    res.set('Cache-Control', 'no-store');
    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'healthy' : 'unhealthy',
      errors,
    });
  };

router.get('/', createHealthHandler());

router.createHealthHandler = createHealthHandler;

module.exports = router;

const fs = require('fs');
const { join } = require('path');
const express = require('express');
const morgan = require('morgan');
const { errorHandler } = require('./middleware');
const healthRoutes = require('./routes/health');
const changelog = require('./routes/changelog');
const version = require('./routes/version');
const api = express();

// Trust the configured number of reverse-proxy hops so rate limiting and access
// logs see the real client IP. Defaults to off (safe when directly exposed);
// set TRUST_PROXY=1 (or the hop count) when running behind a reverse proxy.
api.set('trust proxy', Number(process.env.TRUST_PROXY) || false);

// Access logging — enables fail2ban and the /health log scan. Resolves to
// /app/log/access.log inside the container. Health checks are skipped to avoid
// flooding the log.
const logDir = join(process.cwd(), 'log');
fs.mkdirSync(logDir, { recursive: true });
const accessLogStream = fs.createWriteStream(join(logDir, 'access.log'), {
  flags: 'a',
});
api.use(
  morgan('combined', {
    stream: accessLogStream,
    skip: (req) => req.url === '/health',
  })
);

// Register health route BEFORE static content handler
api.use('/health', healthRoutes);

// Static files
api.use(express.static(join(__dirname, 'public')));
api.use('/uploads', express.static(join(__dirname, 'data/uploads')));

// Body parser
api.use(express.json());

// Link controllers with routes
api.use('/api/apps', require('./routes/apps'));
api.use('/api/config', require('./routes/config'));
api.use('/api/weather', require('./routes/weather'));
api.use('/api/categories', require('./routes/category'));
api.use('/api/bookmarks', require('./routes/bookmark'));
api.use('/api/queries', require('./routes/queries'));
api.use('/api/auth', require('./routes/auth'));
api.use('/api/themes', require('./routes/themes'));
api.use('/api/changelog', changelog);
api.use('/app/changelog', changelog);
api.use('/api/version', version);

api.get(/^\/(?!api)/, (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Custom error handler
api.use(errorHandler);

module.exports = api;

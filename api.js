const fs = require('fs');
const { join } = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const expressStaticGzip = require('express-static-gzip');
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

// Security headers (clickjacking protection, nosniff, HSTS, etc.). CSP is left
// off because Flame loads app/bookmark icons from arbitrary user-supplied URLs
// and supports custom CSS/themes — a strict CSP would break those. COEP is off
// to avoid blocking those cross-origin icons.
api.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip/deflate text responses (JSON API, JS/CSS bundles, icon payloads). Big win
// on first load since the client bundle and @mdi icon data are sizable.
api.use(compression());

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

// Static files. Vite emits content-hashed filenames under /assets, so those are
// safe to cache aggressively. Everything else (index.html, the user-editable
// flame.css, customQueries.json) must stay fresh so edits show up immediately.
//
// express-static-gzip serves the build's precompressed .br/.gz siblings (emitted
// by vite-plugin-compression) when the client accepts them — brotli preferred —
// so the bundle/icon payloads aren't re-gzipped on every request. When no
// precompressed variant or matching Accept-Encoding exists it falls back to the
// raw file, which the compression() middleware above still gzips on the fly.
api.use(
  expressStaticGzip(join(__dirname, 'public'), {
    enableBrotli: true,
    orderPreference: ['br', 'gz'],
    serveStatic: {
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    },
  })
);
// Uploaded icons are user-supplied. Forbid MIME sniffing and sandbox them so a
// malicious upload (e.g. an SVG/HTML file) can't execute script if navigated to
// directly.
api.use(
  '/uploads',
  express.static(join(__dirname, 'data/uploads'), {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
      );
    },
  })
);

// Body parser
api.use(express.json({ limit: '10mb' }));

// Link controllers with routes
api.use('/api/apps', require('./routes/apps'));
api.use('/api/config', require('./routes/config'));
api.use('/api/weather', require('./routes/weather'));
api.use('/api/categories', require('./routes/category'));
api.use('/api/bookmarks', require('./routes/bookmark'));
api.use('/api/queries', require('./routes/queries'));
api.use('/api/auth', require('./routes/auth'));
api.use('/api/themes', require('./routes/themes'));
api.use('/api/backup', require('./routes/backup'));
api.use('/api/changelog', changelog);
api.use('/app/changelog', changelog);
api.use('/api/version', version);

api.get(/^\/(?!api)/, (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Custom error handler
api.use(errorHandler);

module.exports = api;

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

// Content-Security-Policy: defence-in-depth against XSS. Scripts, frames and
// objects are locked down, while images, styles, fonts and network requests stay
// open because Flame loads app/bookmark icons from arbitrary user-supplied URLs
// (http and https, incl. LAN hosts), fetches external SVG icons, checks GitHub
// for updates, and supports custom CSS that may @import remote fonts. Set
// CSP=off to disable it if a custom setup breaks. Search-bar navigation uses
// location/window.open (not <form>), so form-action stays 'self'.
const cspDisabled = String(process.env.CSP || '').toLowerCase() === 'off';
if (cspDisabled) {
  console.warn(
    'WARNING: CSP=off - Content-Security-Policy is DISABLED. This removes a layer of XSS protection.'
  );
}
const cspDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  objectSrc: ["'none'"],
  frameSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'self'"],
  imgSrc: ['*', 'data:', 'blob:'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
  fontSrc: ["'self'", 'data:', 'https:'],
  connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
  workerSrc: ["'self'", 'blob:'],
  manifestSrc: ["'self'"],
};

// Other security headers (clickjacking protection, nosniff, HSTS, etc.). COEP is
// off to avoid blocking cross-origin icons.
api.use(
  helmet({
    contentSecurityPolicy: cspDisabled
      ? false
      : { useDefaults: false, directives: cspDirectives },
    crossOriginEmbedderPolicy: false,
  })
);

// Gzip/deflate text responses (JSON API, JS/CSS bundles, icon payloads). Big win
// on first load since the client bundle and @mdi icon data are sizable.
api.use(compression());

// Access logging — enables fail2ban. Resolves to
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

// Body parsers. Only backup import needs a large body, so it gets a 10 MB
// parser mounted first. body-parser skips requests already parsed (req._body),
// so the global parser below does not re-check import bodies against 100 kb.
// Every other route, including unauthenticated ones, is capped at 100 kb.
api.use('/api/backup/import', express.json({ limit: '10mb' }));
api.use(express.json({ limit: '100kb' }));

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
api.use('/api/icons', require('./routes/icons'));

api.get(/^\/(?!api)/, (req, res) => {
  res.sendFile(join(__dirname, 'public/index.html'));
});

// Custom error handler
api.use(errorHandler);

module.exports = api;

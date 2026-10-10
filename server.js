require('dotenv').config();
const http = require('http');

// Secret stuff 
const { initializeSecret } = require('./utils/secret');
initializeSecret();

// Database
const { connectDB } = require('./db');
const associateModels = require('./models/associateModels');

// Server
const api = require('./api');
const jobs = require('./utils/jobs');
const Socket = require('./Socket');
const Sockets = require('./Sockets');

// Utils
const initApp = require('./utils/init');
const normalizeTheme = require('./utils/init/normalizeTheme');
const Logger = require('./utils/Logger');
const logger = new Logger();

(async () => {
  const PORT = process.env.PORT || 5005;

  // Password hardening: refuse to start with no password, warn on the default.
  const password = process.env.PASSWORD;
  if (!password) {
    logger.log(
      'FATAL: PASSWORD environment variable is not set. Refusing to start.',
      'ERROR'
    );
    process.exit(1);
  }
  if (password === 'flame_password') {
    logger.log(
      '============================================================',
      'WARNING'
    );
    logger.log(
      'SECURITY WARNING: Flame is using the default password "flame_password".',
      'WARNING'
    );
    logger.log(
      'Set a strong, unique PASSWORD before exposing Flame to any network.',
      'WARNING'
    );
    logger.log(
      '============================================================',
      'WARNING'
    );
  }

  // Init app
  await initApp();
  await connectDB();
  // On a fresh install, migration 01_new-config rewrites config.json from
  // initialConfig.json after initApp has normalized it, putting the theme
  // name ("tron") back. The client expects "primary;accent;background", so
  // without this second pass new visitors get an unstyled page until the
  // next restart. A no-op once the theme is already normalized.
  await normalizeTheme();
  await associateModels();
  await jobs();

  // Create server for Express API and WebSockets
  const server = http.createServer();
  server.on('request', api);

  // Register weatherSocket
  const weatherSocket = new Socket(server);
  Sockets.registerSocket('weather', weatherSocket);

  server.listen(PORT, () => {
    logger.log(
      `Server is running on port ${PORT} in ${process.env.NODE_ENV} mode`
    );
  });
})();

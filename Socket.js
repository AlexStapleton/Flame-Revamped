const WebSocket = require('ws');
const Logger = require('./utils/Logger');
const verifyToken = require('./utils/verifyToken');
const logger = new Logger();

// Close codes in the private 4000-4999 range. The client stops reconnecting
// on AUTH_FAILED, because retrying with the same token can't succeed.
const CLOSE_AUTH_FAILED = 4401;
const CLOSE_AUTH_TIMEOUT = 4408;

// How long a new connection has to send its token before it is dropped.
const AUTH_TIMEOUT_MS = 10000;

// True if `token` is a currently valid login token. verifyToken also rejects
// tokens issued before a password change. Never throws.
const isValidToken = (token) => {
  if (typeof token !== 'string' || !token) return false;
  try {
    verifyToken(token);
    return true;
  } catch {
    return false;
  }
};

// Parse a client's auth message: {"type":"auth","token":"..."}. Pure.
const readAuthMessage = (data) => {
  try {
    const msg = JSON.parse(String(data));
    return msg && msg.type === 'auth' && typeof msg.token === 'string'
      ? msg.token
      : null;
  } catch {
    return null;
  }
};

class Socket {
  constructor(server, { authTimeoutMs = AUTH_TIMEOUT_MS } = {}) {
    // Only /socket is served. Clients send one small auth message and nothing
    // else, so cap inbound frames at 1 KiB (ws default is 100 MiB) to stop
    // unauthenticated clients from forcing large allocations. Oversized frames
    // close with 1009.
    this.webSocketServer = new WebSocket.Server({
      server,
      path: '/socket',
      maxPayload: 1024,
    });

    this.webSocketServer.on('listening', () => {
      logger.log('Socket: listen');
    });

    this.webSocketServer.on('connection', (webSocketClient) => {
      // Weather is only for logged-in users. The browser can't set headers on
      // a WebSocket, and a token in the URL would end up in access.log, so the
      // client sends its token as the first message instead. Until then it
      // receives nothing; without a valid token it is disconnected.
      webSocketClient.token = null;
      const authTimer = setTimeout(() => {
        if (!webSocketClient.token) {
          webSocketClient.close(CLOSE_AUTH_TIMEOUT, 'Authentication required');
        }
      }, authTimeoutMs);

      webSocketClient.on('message', (data) => {
        if (webSocketClient.token) return; // already authenticated; ignore
        const token = readAuthMessage(data);
        clearTimeout(authTimer);
        if (isValidToken(token)) {
          webSocketClient.token = token;
        } else {
          webSocketClient.close(CLOSE_AUTH_FAILED, 'Invalid token');
        }
      });

      webSocketClient.on('close', () => clearTimeout(authTimer));

      // Track liveness for the heartbeat below so dead connections get reaped.
      webSocketClient.isAlive = true;
      webSocketClient.on('pong', () => {
        webSocketClient.isAlive = true;
      });
      // Without an 'error' listener, an oversized or malformed frame (ws emits
      // 'error' with code 1009/1002) would throw and crash the whole server.
      webSocketClient.on('error', (err) => {
        logger.log(`Socket client error: ${err.message}`, 'WARN');
      });
    });

    // Ping every 30s; terminate clients that didn't answer the previous ping.
    // This keeps the client set from filling up with half-open connections.
    this.heartbeat = setInterval(() => {
      this.webSocketServer.clients.forEach((client) => {
        if (client.isAlive === false) {
          return client.terminate();
        }
        client.isAlive = false;
        try {
          client.ping();
        } catch {
          client.terminate();
        }
      });
    }, 30000);

    this.webSocketServer.on('close', () => {
      clearInterval(this.heartbeat);
    });
  }

  // Broadcast to authenticated clients only. Each token is checked again, so
  // a client whose token expired, or was issued before a password change,
  // stops receiving updates and is disconnected.
  send(msg) {
    this.webSocketServer.clients.forEach((client) => {
      // Skip clients that aren't open or haven't authenticated, and isolate a
      // failing send so it can't abort the broadcast to the remaining clients.
      if (client.readyState !== WebSocket.OPEN || !client.token) return;
      if (!isValidToken(client.token)) {
        client.close(CLOSE_AUTH_FAILED, 'Invalid token');
        return;
      }
      try {
        client.send(msg);
      } catch (err) {
        logger.log(`Socket send failed: ${err.message}`, 'ERROR');
      }
    });
  }
}

Socket.CLOSE_AUTH_FAILED = CLOSE_AUTH_FAILED;
Socket.CLOSE_AUTH_TIMEOUT = CLOSE_AUTH_TIMEOUT;
Socket.readAuthMessage = readAuthMessage;
module.exports = Socket;

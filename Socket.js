const WebSocket = require('ws');
const Logger = require('./utils/Logger');
const logger = new Logger();

class Socket {
  constructor(server) {
    // Only /socket is served, and the server never reads client messages, so
    // cap inbound frames at 1 KiB (ws default is 100 MiB) to stop unauthenticated
    // clients from forcing large allocations. Oversized frames close with 1009.
    this.webSocketServer = new WebSocket.Server({
      server,
      path: '/socket',
      maxPayload: 1024,
    });

    this.webSocketServer.on('listening', () => {
      logger.log('Socket: listen');
    });

    this.webSocketServer.on('connection', (webSocketClient) => {
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

  send(msg) {
    this.webSocketServer.clients.forEach((client) => {
      // Skip clients that aren't open, and isolate a failing send so it can't
      // abort the broadcast to the remaining clients.
      if (client.readyState !== WebSocket.OPEN) return;
      try {
        client.send(msg);
      } catch (err) {
        logger.log(`Socket send failed: ${err.message}`, 'ERROR');
      }
    });
  }
}

module.exports = Socket;

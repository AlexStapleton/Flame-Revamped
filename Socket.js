const WebSocket = require('ws');
const Logger = require('./utils/Logger');
const logger = new Logger();

class Socket {
  constructor(server) {
    this.webSocketServer = new WebSocket.Server({ server });

    this.webSocketServer.on('listening', () => {
      logger.log('Socket: listen');
    });

    this.webSocketServer.on('connection', (webSocketClient) => {
      // Track liveness for the heartbeat below so dead connections get reaped.
      webSocketClient.isAlive = true;
      webSocketClient.on('pong', () => {
        webSocketClient.isAlive = true;
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

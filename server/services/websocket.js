import { WebSocketServer } from 'ws';

let wss;
const clients = new Set();

export const initWebSocket = (server) => {
  wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    // Enable seamless HTTP to WS upgrade on the main server port or custom path
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    console.log('[WebSocket] Client connected to App Factory stream.');
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      console.log('[WebSocket] Client disconnected.');
    });

    ws.on('error', (err) => {
      console.error('[WebSocket] Error:', err);
      clients.delete(ws);
    });
  });

  console.log('[WebSocket] Real-time server stream ready.');
  return wss;
};

export const broadcast = (data) => {
  const payload = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      try {
        client.send(payload);
      } catch (err) {
        console.error('[WebSocket] Failed to send broadcast message:', err);
        clients.delete(client);
      }
    }
  }
};

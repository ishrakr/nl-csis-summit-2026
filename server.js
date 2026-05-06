const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.join(publicDir, path.normalize(safePath).replace(/^([.]{2}[\/\\])+/, ''));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }

  sendFile(res, filePath);
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Set();

function broadcastCount() {
  const payload = JSON.stringify({
    type: 'count',
    count: clients.size,
  });

  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (socket) => {
  clients.add(socket);
  broadcastCount();

  socket.on('message', (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      return;
    }

    if (message.type !== 'emoji' || typeof message.emoji !== 'string') {
      return;
    }

    const payload = JSON.stringify({
      type: 'emoji',
      emoji: message.emoji,
      id: Date.now() + Math.random(),
    });

    for (const client of clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  });

  socket.on('close', () => {
    clients.delete(socket);
    broadcastCount();
  });
});

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, `http://${req.headers.host}`).pathname !== '/ws') {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

server.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});

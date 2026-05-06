const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
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

function normalizeUrl(value) {
  const trimmed = value.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getAppUrl(req) {
  const configuredUrl = process.env.SERVICE_FQDN_APP;

  if (configuredUrl && configuredUrl.trim() && !configuredUrl.includes('SERVICE_FQDN_APP')) {
    return normalizeUrl(configuredUrl);
  }

  const forwardedHost = req.headers['x-forwarded-host'];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    || req.headers.host
    || `localhost:${port}`;
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protoHeader = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || '';
  const cleanHost = host.split(',')[0].trim();
  const isLocalHost = cleanHost.startsWith('localhost') || cleanHost.startsWith('127.') || cleanHost === '[::1]';
  const proto = protoHeader.split(',')[0].trim() || (isLocalHost ? 'http' : 'https');

  return `${proto}://${cleanHost}`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendIndex(req, res, filePath) {
  fs.readFile(filePath, 'utf8', (err, template) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const appUrl = escapeHtml(getAppUrl(req));

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(template.replace(/__APP_URL__/g, appUrl));
  });
}

function sendQrCode(req, res) {
  QRCode.toString(getAppUrl(req), {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: 2,
  }, (err, svg) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('QR code generation failed');
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
    });
    res.end(svg);
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

  if (safePath === '/index.html') {
    sendIndex(req, res, filePath);
    return;
  }

  if (requestPath === '/qrcode.svg') {
    sendQrCode(req, res);
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

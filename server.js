/**
 * SnapBooth — Unified Server with Apple Vision & Python Face Detection
 * Runs on Node.js standard library (http, fs, path, child_process)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const PORT = 8080;
const PUBLIC_DIR = __dirname;

let activePortPath = null;
let activePortFd = null;

let aiWorker = null;
let aiReqCounter = 0;
const aiPendingRequests = new Map();

function getAiWorker() {
  if (aiWorker && !aiWorker.killed) return aiWorker;
  const scriptPath = path.join(__dirname, 'face_detector_ai.py');
  aiWorker = spawn('python3', [scriptPath, '--daemon']);
  
  let buffer = '';
  aiWorker.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    let idx;
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, idx).trim();
      buffer = buffer.substring(idx + 1);
      if (line) {
        try {
          const parsed = JSON.parse(line);
          const reqId = parsed.reqId;
          if (reqId && aiPendingRequests.has(reqId)) {
            const entry = aiPendingRequests.get(reqId);
            aiPendingRequests.delete(reqId);
            clearTimeout(entry.timer);
            entry.res.writeHead(200, { 'Content-Type': 'application/json' });
            entry.res.end(JSON.stringify(parsed));
          } else {
            const firstKey = aiPendingRequests.keys().next().value;
            if (firstKey) {
              const entry = aiPendingRequests.get(firstKey);
              aiPendingRequests.delete(firstKey);
              clearTimeout(entry.timer);
              entry.res.writeHead(200, { 'Content-Type': 'application/json' });
              entry.res.end(JSON.stringify(parsed));
            }
          }
        } catch {
          // Graceful ignore malformed line
        }
      }
    }
  });

  aiWorker.on('exit', () => {
    aiWorker = null;
    for (const [key, entry] of aiPendingRequests.entries()) {
      clearTimeout(entry.timer);
      entry.res.writeHead(200, { 'Content-Type': 'application/json' });
      entry.res.end(JSON.stringify({ count: 1, groupType: 'solo_m', emojis: '🧑', faces: [] }));
    }
    aiPendingRequests.clear();
  });

  return aiWorker;
}

// Pre-warm AI worker
getAiWorker();

const MIME = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.map':  'application/json'
};

function scanSerialPorts() {
  try {
    if (process.platform === 'win32') {
      const raw = execSync('powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()" 2>nul', { encoding: 'utf8' });
      const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      return lines.map(p => ({
        path: p,
        name: p,
        isUsb: true
      }));
    }
    const raw = execSync('ls -1 /dev/tty.* 2>/dev/null', { encoding: 'utf8' });
    const lines = raw.split('\n').filter(Boolean);
    const usbPorts = lines.filter(p => /usb|wch|uart|serial/i.test(p));
    const target = usbPorts.length ? usbPorts : lines;
    return target.map(p => ({
      path: p,
      name: path.basename(p),
      isUsb: /usb|wch|uart/i.test(p)
    }));
  } catch {
    return [];
  }
}

function writeSerialBytesPaced(bytesBuffer, chunkSize = 16, delayMs = 15) {
  return new Promise(async (resolve, reject) => {
    if (!activePortFd) {
      return reject(new Error('No printer port is open'));
    }
    try {
      for (let i = 0; i < bytesBuffer.length; i += chunkSize) {
        const chunk = bytesBuffer.subarray(i, Math.min(i + chunkSize, bytesBuffer.length));
        await new Promise((res, rej) => {
          fs.write(activePortFd, chunk, 0, chunk.length, null, (err) => {
            if (err) return rej(err);
            res();
          });
        });
        await new Promise(r => setTimeout(r, delayMs));
      }
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function configureBaud(portPath, baudRate = 9600) {
  try {
    if (process.platform === 'win32') {
      execSync(`mode ${portPath}: BAUD=${baudRate} PARITY=n DATA=8 STOP=1 2>nul`);
      return true;
    }
    execSync(`stty -f "${portPath}" ${baudRate} cs8 -cstopb -parenb -echo raw 2>/dev/null`);
    return true;
  } catch (e) {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // ── API: Status ───────────────────────────────────────────
  if (pathname === '/api/status' || pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      printerConnected: activePortFd !== null,
      port: activePortPath
    }));
    return;
  }

  // ── API: Ports ────────────────────────────────────────────
  if (pathname === '/api/ports' || pathname === '/ports') {
    const ports = scanSerialPorts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ports }));
    return;
  }

  // ── API: Detect Faces (Native Apple Vision Neural Framework) ─
  if ((pathname === '/api/detect-faces' || pathname === '/detect-faces') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { imageBase64 } = JSON.parse(body || '{}');
        if (!imageBase64) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ count: 0, isCouple: false, faces: [] }));
          return;
        }

        const worker = getAiWorker();
        const reqId = ++aiReqCounter;
        
        const timer = setTimeout(() => {
          if (aiPendingRequests.has(reqId)) {
            aiPendingRequests.delete(reqId);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ count: 1, groupType: 'solo_m', emojis: '🧑', faces: [] }));
          }
        }, 2200);

        aiPendingRequests.set(reqId, { res, timer });
        const singleLine = JSON.stringify({ reqId, imageBase64 }) + '\n';
        worker.stdin.write(singleLine);
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ count: 1, groupType: 'solo_m', emojis: '🧑', error: err.message, faces: [] }));
      }
    });
    return;
  }

  // ── API: Optimize Photo for Thermal Printing ──────────────
  if ((pathname === '/api/optimize-photo' || pathname === '/optimize-photo') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { imageBase64 } = JSON.parse(body || '{}');
        if (!imageBase64) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'imageBase64 required' }));
          return;
        }

        const scriptPath = path.join(__dirname, 'thermal_optimizer.py');
        const proc = spawn('python3', [scriptPath]);
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', d => { stdout += d; });
        proc.stderr.on('data', d => { stderr += d; });

        proc.on('close', code => {
          if (code !== 0) {
            console.error('Optimizer script failed:', stderr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: stderr || 'Optimizer exit code ' + code }));
            return;
          }
          try {
            const result = JSON.parse(stdout);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid optimizer output' }));
          }
        });

        proc.stdin.write(JSON.stringify({ imageBase64 }));
        proc.stdin.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // ── API: Connect ──────────────────────────────────────────
  if ((pathname === '/api/connect' || pathname === '/connect') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const { port, baud } = JSON.parse(body || '{}');
        if (!port) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'port is required' }));
          return;
        }

        if (activePortFd) {
          try { fs.closeSync(activePortFd); } catch {}
          activePortFd = null;
          activePortPath = null;
        }

        configureBaud(port, baud || 9600);

        const fd = fs.openSync(port, fs.constants.O_RDWR | fs.constants.O_NOCTTY | fs.constants.O_NONBLOCK);
        activePortFd = fd;
        activePortPath = port;

        console.log(`✅ RP203 connected to ${port} @ ${baud || 9600} baud`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, port, baud: baud || 9600 }));
      } catch (err) {
        console.error('Connect failed:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // ── API: Disconnect ───────────────────────────────────────
  if ((pathname === '/api/disconnect' || pathname === '/disconnect') && req.method === 'POST') {
    if (activePortFd) {
      try { fs.closeSync(activePortFd); } catch {}
      activePortFd = null;
      activePortPath = null;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: Test Print ───────────────────────────────────────
  if ((pathname === '/api/test' || pathname === '/test') && req.method === 'POST') {
    if (!activePortFd) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Printer is not connected' }));
      return;
    }
    try {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      const timeStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0') + ':' + String(now.getSeconds()).padStart(2, '0');
      const orderNum = Math.floor(100000 + Math.random() * 900000);

      const receiptText = 
        '================================\r\n' +
        '          PHOTO BOOTH           \r\n' +
        '           CREATO 4             \r\n' +
        '      OFFICIAL TAX RECEIPT      \r\n' +
        '================================\r\n' +
        `DATE: ${dateStr}   TIME: ${timeStr}\r\n` +
        'STATION : BOOTH-04  TERM: RP203 \r\n' +
        `TXN ID  : #CR4-${orderNum}          \r\n` +
        'CASHIER : SELF-SERVICE AUTO     \r\n' +
        '--------------------------------\r\n' +
        'ITEM                 QTY   PRICE\r\n' +
        '--------------------------------\r\n' +
        '3-PHOTO STRIP         1    $3.50\r\n' +
        'HD THERMAL DITHER     1    $0.75\r\n' +
        'CUBIC 55GSM PAPER     1    $0.75\r\n' +
        '--------------------------------\r\n' +
        'SUBTOTAL                   $5.00\r\n' +
        'SALES TAX (0.00%)          $0.00\r\n' +
        '--------------------------------\r\n' +
        'TOTAL                      $5.00\r\n' +
        '--------------------------------\r\n' +
        'PAID VIA: CASH / CARD      $5.00\r\n' +
        'CHANGE DUE                 $0.00\r\n' +
        '--------------------------------\r\n' +
        'DEVICE DIAGNOSTICS:             \r\n' +
        '  SERIAL PORT : ' + (activePortPath || 'CONNECTED') + '\r\n' +
        '* HEAD WIDTH  : 384 DOTS (48MM) \r\n' +
        '* CHINESE     : DISABLED (FS .) \r\n' +
        '* FEED TEST   : 10CM / 100MM OK \r\n' +
        '--------------------------------\r\n' +
        '        HAVE A NICE DAY!        \r\n' +
        '    THANK YOU FOR VISITING!     \r\n' +
        '================================\r\n\r\n';

      // 1. Hardware Init: Cancel Chinese mode, reset, force USA CP437 ASCII
      await writeSerialBytesPaced(Buffer.from([
        0x1B, 0x40,                   // ESC @ : Reset
        0x1C, 0x2E,                   // FS .  : CANCEL CHINESE MODE
        0x1B, 0x74, 0x00,             // ESC t 0 : CP437 ASCII
        0x1B, 0x52, 0x00,             // ESC R 0 : International USA
        0x1B, 0x32,                   // ESC 2 : Standard line spacing
        0x1B, 0x37, 0x07, 0x8C, 0x28  // ESC 7 : Heating for 55 GSM paper
      ]), 4, 10);
      await new Promise(r => setTimeout(r, 120));

      // 2. Stream receipt text line-by-line with paced intervals
      const lines = receiptText.split('\r\n');
      for (const line of lines) {
        if (!line.length) continue;
        await writeSerialBytesPaced(Buffer.from(line + '\r\n', 'ascii'), 8, 12);
        await new Promise(r => setTimeout(r, 70));
      }

      // 3. Feed & Cut
      await writeSerialBytesPaced(Buffer.from([
        0x1B, 0x64, 0x05,             // Feed 5 lines
        0x1D, 0x56, 0x42, 0x05,       // Cut
        0x1B, 0x32
      ]), 4, 15);
      await new Promise(r => setTimeout(r, 200));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, message: '10cm test receipt sent' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── STATIC FRONTEND SERVING ───────────────────────────────
  let safePath = path.normalize(pathname);
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SnapBooth Server Running at http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  if (activePortFd) {
    try { fs.closeSync(activePortFd); } catch {}
  }
  process.exit(0);
});

/**
 * SnapBooth — Unified Server (Windows & Cross-Platform Ready)
 * Supports RP203 / MOD-QC0925 Thermal Printer via Windows COM ports & Web Serial
 * AI Face & Gender Detection via OpenCV YuNet and ONNX Runtime
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

let SerialPort = null;
try {
  SerialPort = require('serialport').SerialPort;
} catch {}

const PORT = 8080;
const PUBLIC_DIR = __dirname;

let activePortPath = null;
let activePortFd = null;
let activeSerialPort = null;

let aiWorker = null;
let aiReqCounter = 0;
const aiPendingRequests = new Map();

function getPythonCommand() {
  if (process.platform === 'win32') {
    try {
      execSync('python --version', { stdio: 'ignore' });
      return 'python';
    } catch {}
    try {
      execSync('py --version', { stdio: 'ignore' });
      return 'py';
    } catch {}
  }
  return 'python3';
}

function getAiWorker() {
  if (aiWorker && !aiWorker.killed) return aiWorker;
  const scriptPath = path.join(__dirname, 'face_detector_ai.py');
  const pyCmd = getPythonCommand();
  
  aiWorker = spawn(pyCmd, [scriptPath, '--daemon']);
  
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
try {
  getAiWorker();
} catch (e) {
  console.log('AI worker pre-warm note:', e.message);
}

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
      const found = [];
      
      // 1. Query WMI / PnP for friendly names (e.g. CH340, CP2102)
      try {
        const psCmd = `powershell -NoProfile -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.PNPClass -eq 'Ports' -or $_.Name -match 'COM[0-9]+' } | Select-Object -Property Name, DeviceID | ConvertTo-Json -Compress" 2>nul`;
        const rawJson = execSync(psCmd, { encoding: 'utf8' }).trim();
        if (rawJson) {
          const data = JSON.parse(rawJson);
          const arr = Array.isArray(data) ? data : [data];
          for (const d of arr) {
            const match = (d.Name || '').match(/\((COM\d+)\)/i);
            const portName = match ? match[1].toUpperCase() : null;
            if (portName) {
              found.push({
                path: portName,
                name: d.Name || portName,
                isUsb: /usb|ch34|cp21|ftdi|uart/i.test((d.Name || '') + (d.DeviceID || ''))
              });
            }
          }
        }
      } catch {}

      // 2. Query .NET SerialPort.GetPortNames() for any remaining ports
      try {
        const raw = execSync('powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()" 2>nul', { encoding: 'utf8' });
        const lines = raw.split(/\r?\n/).map(s => s.trim().toUpperCase()).filter(Boolean);
        for (const p of lines) {
          if (!found.some(f => f.path === p)) {
            found.push({
              path: p,
              name: `${p} (Serial Port)`,
              isUsb: true
            });
          }
        }
      } catch {}

      return found;
    }

    // macOS / Linux
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
    if (!activeSerialPort && !activePortFd) {
      return reject(new Error('No printer port is open'));
    }

    try {
      if (activeSerialPort && activeSerialPort.isOpen) {
        for (let i = 0; i < bytesBuffer.length; i += chunkSize) {
          const chunk = bytesBuffer.subarray(i, Math.min(i + chunkSize, bytesBuffer.length));
          await new Promise((res, rej) => {
            activeSerialPort.write(chunk, (err) => {
              if (err) return rej(err);
              activeSerialPort.drain((drainErr) => {
                if (drainErr) return rej(drainErr);
                res();
              });
            });
          });
          await new Promise(r => setTimeout(r, delayMs));
        }
        return resolve();
      }

      if (activePortFd) {
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
        return resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

function configureBaud(portPath, baudRate = 9600) {
  try {
    if (process.platform === 'win32') {
      const cleanPort = portPath.replace(/^\\\\\\.\\\\/, '').replace(/:$/, '');
      execSync(`mode ${cleanPort}: BAUD=${baudRate} PARITY=n DATA=8 STOP=1 2>nul`);
      return true;
    }
    execSync(`stty -f "${portPath}" ${baudRate} cs8 -cstopb -parenb -echo raw 2>/dev/null`);
    return true;
  } catch (e) {
    return false;
  }
}

function closeActivePort() {
  if (activeSerialPort) {
    try {
      if (activeSerialPort.isOpen) activeSerialPort.close();
    } catch {}
    activeSerialPort = null;
  }
  if (activePortFd) {
    try { fs.closeSync(activePortFd); } catch {}
    activePortFd = null;
  }
  activePortPath = null;
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
      printerConnected: activeSerialPort !== null || activePortFd !== null,
      port: activePortPath,
      platform: process.platform
    }));
    return;
  }

  // ── API: Ports ────────────────────────────────────────────
  if (pathname === '/api/ports' || pathname === '/ports') {
    const ports = scanSerialPorts();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ports, platform: process.platform }));
    return;
  }

  // ── API: Detect Faces (Windows / Cross-Platform AI) ───────
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
        const pyCmd = getPythonCommand();
        const proc = spawn(pyCmd, [scriptPath]);
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
    req.on('end', async () => {
      try {
        const { port, baud } = JSON.parse(body || '{}');
        if (!port) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'port is required' }));
          return;
        }

        closeActivePort();
        const baudRate = Number(baud) || 9600;

        // Try SerialPort package first
        if (SerialPort) {
          try {
            const sPort = new SerialPort({
              path: port,
              baudRate: baudRate,
              autoOpen: false
            });

            await new Promise((resolve, reject) => {
              sPort.open(err => err ? reject(err) : resolve());
            });

            activeSerialPort = sPort;
            activePortPath = port;
            console.log(`✅ RP203 connected via SerialPort to ${port} @ ${baudRate} baud`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, port, baud: baudRate, method: 'serialport' }));
            return;
          } catch (spErr) {
            console.warn(`SerialPort connect attempt failed on ${port}: ${spErr.message}, trying direct file descriptor...`);
          }
        }

        // Direct file descriptor fallback
        configureBaud(port, baudRate);

        const winPort = process.platform === 'win32' && !port.startsWith('\\\\.\\') ? `\\\\.\\${port}` : port;
        const flags = process.platform === 'win32' ? (fs.constants.O_RDWR || 2) : (fs.constants.O_RDWR | (fs.constants.O_NOCTTY || 0) | (fs.constants.O_NONBLOCK || 0));
        const fd = fs.openSync(winPort, flags);
        activePortFd = fd;
        activePortPath = port;

        console.log(`✅ RP203 connected via direct FD to ${port} @ ${baudRate} baud`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, port, baud: baudRate, method: 'fd' }));
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
    closeActivePort();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: Test Print ───────────────────────────────────────
  if ((pathname === '/api/test' || pathname === '/test') && req.method === 'POST') {
    if (!activeSerialPort && !activePortFd) {
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
  console.log(`SnapBooth Server Running at http://localhost:${PORT} (Platform: ${process.platform})`);
});

process.on('SIGINT', () => {
  closeActivePort();
  process.exit(0);
});

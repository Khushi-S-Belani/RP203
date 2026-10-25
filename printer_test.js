#!/usr/bin/env node
/**
 * RP203 Direct Serial Test — Node.js
 * Bypasses browser. Tests Chinese cancel, text, and feed.
 * Usage: node printer_test.js [test]
 *   tests: english | chinese | feed | image | selftest
 */

const { SerialPort } = require('serialport');

const TEST = process.argv[2] || 'english';

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function resolvePort() {
  if (process.argv[3]) return process.argv[3];
  if (process.env.PORT) return process.env.PORT;
  try {
    const list = await SerialPort.list();
    if (list && list.length > 0) {
      if (process.platform === 'win32') {
        const com = list.find(p => p.path.toUpperCase().startsWith('COM'));
        if (com) return com.path;
      } else {
        const usb = list.find(p => /usb|wch|uart|serial/i.test(p.path));
        if (usb) return usb.path;
      }
      return list[0].path;
    }
  } catch {}
  return process.platform === 'win32' ? 'COM3' : '/dev/cu.usbserial-0001';
}

async function main() {
  const PORT = await resolvePort();
  const BAUD = 9600;

  console.log(`\n🖨️  RP203 Direct Test @ ${PORT} ${BAUD} baud`);
  console.log(`📋 Running test: "${TEST}" (Platform: ${process.platform})\n`);

  const port = new SerialPort({ path: PORT, baudRate: BAUD, autoOpen: false });

  await new Promise((resolve, reject) => {
    port.open(err => err ? reject(err) : resolve());
  });
  console.log('✅ Port opened');

  const write = (data) => new Promise((resolve, reject) => {
    port.write(data, err => err ? reject(err) : resolve());
  });
  const drain = () => new Promise((resolve, reject) => {
    port.drain(err => err ? reject(err) : resolve());
  });

  // ─────────────────────────────────────────────────────────────
  // ONE-TIME RESET with LONG WAIT (500ms) — then cancel Chinese
  // ─────────────────────────────────────────────────────────────
  console.log('⚙️  Sending ESC @ reset...');
  await write(Buffer.from([0x1B, 0x40]));  // ESC @ Reset
  await wait(500);                           // FULL boot time
  console.log('✅ Reset complete (waited 500ms)');

  // Cancel Chinese mode × 3
  console.log('🔤 Cancelling Chinese/GBK mode...');
  await write(Buffer.from([0x1C, 0x2E])); await wait(50);
  await write(Buffer.from([0x1C, 0x2E])); await wait(50);
  await write(Buffer.from([0x1C, 0x2E])); await wait(50);

  // Set charset CP437 USA
  await write(Buffer.from([
    0x1B, 0x74, 0x00,  // ESC t 0 : CP437
    0x1B, 0x52, 0x00,  // ESC R 0 : USA
    0x1B, 0x4D, 0x00,  // ESC M 0 : Font A
    0x1B, 0x32,        // ESC 2 : standard spacing
  ]));
  await wait(60);
  console.log('✅ Charset set to CP437 USA\n');

  // ─────────────────────────────────────────────────────────────
  switch (TEST) {

    case 'english': {
      console.log('📄 Printing English text test...');
      const lines = [
        '================================',
        '     RP203 ENGLISH TEXT TEST    ',
        '================================',
        'IF YOU SEE THIS IN ENGLISH:     ',
        'PRINTER IS WORKING CORRECTLY!   ',
        '--------------------------------',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ      ',
        '0123456789 !@#$%^&*()           ',
        '--------------------------------',
        'Chinese mode: DISABLED          ',
        'Charset: CP437 USA              ',
        '================================',
        '        HAVE A NICE DAY         ',
        '  PRINCE TAGADIYA • CREATO4 LAB ',
        '================================',
      ];
      for (const line of lines) {
        await write(Buffer.from(line + '\r\n', 'ascii'));
        await wait(50);
      }
      // Feed and cut
      await write(Buffer.from([0x1B, 0x64, 0x05, 0x1D, 0x56, 0x42, 0x05]));
      console.log('✅ English text sent!');
      break;
    }

    case 'feed': {
      console.log('📜 Feeding blank paper...');
      await write(Buffer.from([0x1B, 0x64, 0x08]));  // ESC d 8 = feed 8 lines
      await wait(500);
      console.log('✅ Paper fed!');
      break;
    }

    case 'selftest': {
      console.log('⚙️  Sending DC2 T hardware self-test...');
      await write(Buffer.from([0x12, 0x54]));  // DC2 T = factory self test
      await wait(3000);
      console.log('✅ Self-test sent! Printer should print its firmware info.');
      break;
    }

    case 'image': {
      console.log('🖼️  Printing simple raster test pattern...');
      const WIDTH_BYTES = 48;  // 384 dots / 8
      const HEIGHT = 64;

      // Header: checkerboard pattern
      const rasterData = [];
      rasterData.push(0x1B, 0x33, 0x00);  // ESC 3 0: zero line spacing

      for (let startY = 0; startY < HEIGHT; startY += 8) {
        const rows = Math.min(8, HEIGHT - startY);
        // GS v 0 command
        rasterData.push(0x1D, 0x76, 0x30, 0x00);
        rasterData.push(WIDTH_BYTES & 0xFF, (WIDTH_BYTES >> 8) & 0xFF);
        rasterData.push(rows & 0xFF, (rows >> 8) & 0xFF);
        for (let y = 0; y < rows; y++) {
          const pat = ((startY + y) % 4 < 2) ? 0xFF : 0x00;
          for (let x = 0; x < WIDTH_BYTES; x++) {
            rasterData.push((x % 2 === 0) ? pat : ~pat & 0xFF);
          }
        }
      }
      rasterData.push(0x1B, 0x32, 0x1B, 0x64, 0x04);

      // Send in 32-byte chunks
      const buf = Buffer.from(rasterData);
      for (let i = 0; i < buf.length; i += 32) {
        await write(buf.subarray(i, Math.min(i + 32, buf.length)));
        await wait(25);
      }
      console.log('✅ Raster test pattern sent!');
      break;
    }

    default:
      console.log('❌ Unknown test. Use: english | feed | image | selftest');
  }

  await drain();
  await wait(500);
  port.close();
  console.log('\n✅ Done. Port closed.');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error('\n💡 Tips:');
  console.error('  - Make sure printer is ON and connected via USB-TTL');
  console.error('  - Make sure Chrome/browser is NOT holding the port open (disconnect in app first)');
  if (process.platform === 'win32') {
    console.error('  - Windows: Check Device Manager under "Ports (COM & LPT)"');
    console.error('  - If CH340 driver is missing, run: install_drivers.bat');
    console.error('  - Specify port manually: node printer_test.js [english|feed|image|selftest] [COM_PORT]');
  } else {
    console.error('  - Run: ls /dev/cu.usb* to find your port');
  }
  process.exit(1);
});

#!/usr/bin/env node
/**
 * RP203 ADVANCED CALIBRATION & DIAGNOSTIC UTILITY
 * 
 * Supports both 5V 3A and 12V 1A power adapters with calibrated thermal parameters
 * to prevent brownout crashes, Chinese fallback, and line shifts.
 * 
 * Usage:
 *   node printer_calibrate.js [5v | 12v | heat | width | full]
 * 
 * Examples:
 *   node printer_calibrate.js 5v     (Calibrated for 5V 3A adapter - RECOMMENDED)
 *   node printer_calibrate.js 12v    (Throttled for 12V 1A adapter - prevents brownout)
 *   node printer_calibrate.js heat   (Heat ladder test to find perfect darkness)
 *   node printer_calibrate.js width  (Column width & margin ruler)
 */

const { SerialPort } = require('serialport');

const BAUD = 9600;
const MODE = (process.argv[2] || '5v').toLowerCase();

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

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Power supply specific profiles for ESC 7 n1 n2 n3:
// n1 = max heating dots (blocks of 8). Lower = lower peak current.
// n2 = heating time (units of 10µs). Controls darkness.
// n3 = heating interval (units of 10µs). Cooldown time between dot firings.
const PROFILES = {
  '5v': {
    name: '5V 3A Power Profile (Recommended)',
    n1: 0x04, // 32 dots max per firing pulse -> ~1.0A to 1.5A peak
    n2: 0x8C, // 1400µs heating time (needed at 5V for crisp black)
    n3: 0x28, // 400µs interval
    lineWait: 60,
  },
  '12v': {
    name: '12V 1A Throttled Profile (Anti-Brownout)',
    n1: 0x02, // 16 dots max per firing pulse -> prevents 12V 1A voltage collapse!
    n2: 0x4B, // 750µs heating time (at 12V, less time is needed)
    n3: 0x3C, // 600µs cooldown (gives power supply capacitor time to recharge)
    lineWait: 80,
  }
};

async function main() {
  const PORT = await resolvePort();
  console.log(`\n======================================================`);
  console.log(`🖨️  RP203 CALIBRATION & HARDWARE DIAGNOSTICS`);
  console.log(`   Port: ${PORT} @ ${BAUD} baud (Platform: ${process.platform})`);
  console.log(`   Mode: "${MODE}"`);
  console.log(`======================================================\n`);

  const activeProfile = PROFILES[MODE === '12v' ? '12v' : '5v'];
  console.log(`⚙️  Applying Profile: ${activeProfile.name}`);
  console.log(`   Heating Dots (n1): ${activeProfile.n1 * 8} dots/pulse`);
  console.log(`   Heating Time (n2): ${activeProfile.n2 * 10} µs`);
  console.log(`   Heating Interval (n3): ${activeProfile.n3 * 10} µs\n`);

  const port = new SerialPort({ path: PORT, baudRate: BAUD, autoOpen: false });

  await new Promise((res, rej) => {
    port.open(e => e ? rej(e) : res());
  });
  console.log('✅ Serial port opened successfully');

  // Assert DTR / RTS
  try {
    await new Promise((res) => port.set({ dtr: true, rts: true }, () => res()));
    console.log('⚡ DTR / RTS asserted HIGH');
  } catch {}

  const write = (data) => new Promise((res, rej) => port.write(data, e => e ? rej(e) : res()));
  const drain = () => new Promise((res, rej) => port.drain(e => e ? rej(e) : res()));

  const sendPaced = async (buffer, chunkSize = 32, delayMs = 15) => {
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const slice = buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
      await write(slice);
      await wait(delayMs);
    }
  };

  const line = async (txt = '') => {
    await write(Buffer.from(txt + '\r\n', 'ascii'));
    await wait(activeProfile.lineWait);
  };

  // ─────────────────────────────────────────────────────────────
  // 1. HARDWARE INIT & PURGE CHINESE MODE
  // ─────────────────────────────────────────────────────────────
  console.log('🔄 Initializing RP203 controller...');
  // Hardware Reset
  await write(Buffer.from([0x1B, 0x40]));
  await wait(550); // Crucial: wait full 550ms for RP203 microcontroller reboot!

  // Quadruple FS . to unconditionally kill GBK / Chinese mode
  for (let k = 0; k < 4; k++) {
    await write(Buffer.from([0x1C, 0x2E]));
    await wait(35);
  }

  // Set ASCII CP437, Standard USA charset, Font A, Standard spacing, Left align
  await write(Buffer.from([
    0x1B, 0x74, 0x00, // ESC t 0 (CP437 USA)
    0x1B, 0x52, 0x00, // ESC R 0 (USA)
    0x1B, 0x4D, 0x00, // ESC M 0 (Font A 12x24)
    0x1B, 0x32,       // ESC 2 (Default line spacing)
    0x1B, 0x61, 0x00, // ESC a 0 (Left align)
    0x1B, 0x37, activeProfile.n1, activeProfile.n2, activeProfile.n3 // Calibrated Heat
  ]));
  await wait(100);
  console.log('✅ Controller configured in English CP437 mode');

  // ─────────────────────────────────────────────────────────────
  // CALIBRATION SECTIONS
  // ─────────────────────────────────────────────────────────────

  if (MODE === 'heat') {
    // ── HEAT LADDER TEST ──
    console.log('🔥 Printing Heat Calibration Ladder...');
    await line('================================');
    await line('     RP203 HEAT LADDER TEST     ');
    await line('================================');
    await line('Look for the darkest block with');
    await line('clean edges and no skipped lines');
    await line('');

    const heatLevels = [
      { name: 'LEVEL 1: 600us (Very Light)', n2: 60 },
      { name: 'LEVEL 2: 900us (Light/Medium)', n2: 90 },
      { name: 'LEVEL 3: 1200us (Standard/Crisp)', n2: 120 },
      { name: 'LEVEL 4: 1500us (Dark Black)', n2: 150 },
      { name: 'LEVEL 5: 1800us (Maximum Heat)', n2: 180 },
    ];

    for (const h of heatLevels) {
      // Set heating time
      await write(Buffer.from([0x1B, 0x37, activeProfile.n1, h.n2, activeProfile.n3]));
      await wait(50);

      await line(h.name);
      await line('THE QUICK BROWN FOX JUMPS OVER 123');
      // Inverted text (burns black background)
      await write(Buffer.from([0x1D, 0x42, 0x01])); // GS B 1 (Reverse print ON)
      await line('  BLACK STRIP TEST BLOCK (REVERSE)  ');
      await write(Buffer.from([0x1D, 0x42, 0x00])); // GS B 0 (Reverse print OFF)
      await line('');
    }

  } else if (MODE === 'width') {
    // ── COLUMN WIDTH & ALIGNMENT RULER ──
    console.log('📏 Printing Column Width Ruler...');
    await line('================================');
    await line('    COLUMN WIDTH & MARGIN TEST  ');
    await line('================================');
    await line('Count characters before wrapping:');
    await line('');

    // Tens indicator
    await line('         1         2         3         4');
    await line('123456789012345678901234567890123456789012345678');
    await line('------------------------------------------------');
    await line('32 CHAR MARK ->                | (Font A std)');
    await line('42 CHAR MARK ->                          | (Font B)');
    await line('48 CHAR MARK ->                                |');
    await line('');

    // Alignment test
    await write(Buffer.from([0x1B, 0x61, 0x00])); // Left
    await line('|LEFT-ALIGNED TEXT');
    await write(Buffer.from([0x1B, 0x61, 0x01])); // Center
    await line('== CENTERED TEXT ==');
    await write(Buffer.from([0x1B, 0x61, 0x02])); // Right
    await line('RIGHT-ALIGNED TEXT|');
    await write(Buffer.from([0x1B, 0x61, 0x00])); // Back to left
    await line('');

  } else {
    // ── FULL STANDARD CALIBRATION (5v or 12v profile) ──
    console.log('📋 Printing Full Diagnostic Test Strip...');
    await line('================================');
    await line('   RP203 CALIBRATION STRIP      ');
    await line(`   Mode: ${activeProfile.name.slice(0, 24)}`);
    await line('================================');
    await line('');

    // Section 1: Power Diagnostics
    await line('-- POWER & STATUS --');
    await line(`Config: Dots=${activeProfile.n1*8} Heat=${activeProfile.n2*10}us`);
    await line('If text is faded -> need more heat');
    await line('If printer stalls -> power supply weak');
    await line('');

    // Section 2: Character Ruler
    await line('-- COLUMN WIDTH RULER --');
    await line('         1         2         3         4');
    await line('123456789012345678901234567890123456789012345678');
    await line('32 CHAR: [12345678901234567890123456789012]');
    await line('42 CHAR: [123456789012345678901234567890123456789012]');
    await line('');

    // Section 3: Font Styles
    await line('-- FONT TEST --');
    await line('Font A (Standard 12x24): ABCabc123');
    await write(Buffer.from([0x1B, 0x4D, 0x01])); // Font B
    await line('Font B (Compressed 9x17): ABCabc123');
    await write(Buffer.from([0x1B, 0x4D, 0x00])); // Restore Font A

    await write(Buffer.from([0x1B, 0x21, 0x20])); // Double width
    await line('Double Width');
    await write(Buffer.from([0x1B, 0x21, 0x10])); // Double height
    await line('Double Height');
    await write(Buffer.from([0x1B, 0x21, 0x30])); // Double both
    await line('BIG FONT');
    await write(Buffer.from([0x1B, 0x21, 0x00])); // Normal
    await line('');

    // Section 4: Safe Low-Current Raster Test
    console.log('🔲 Printing Safe Raster Test Pattern...');
    await line('-- RASTER GRAPHICS (SAFE CURRENT) --');
    
    // Width = 48 bytes (384 dots)
    const W = 48;
    const rasterRows = 16;
    const raster = [];
    raster.push(0x1B, 0x33, 0x00); // 0 line spacing

    // 16 rows of alternating diagonal dither (keeps peak current low)
    raster.push(0x1D, 0x76, 0x30, 0x00);
    raster.push(W & 0xFF, (W >> 8) & 0xFF);
    raster.push(rasterRows & 0xFF, (rasterRows >> 8) & 0xFF);

    for (let y = 0; y < rasterRows; y++) {
      for (let x = 0; x < W; x++) {
        // Safe 50% checkerboard dither - won't trip 1A or 3A supply!
        raster.push((y % 2 === 0) ? 0xAA : 0x55);
      }
    }
    raster.push(0x1B, 0x32); // Restore default spacing

    await sendPaced(Buffer.from(raster), 32, 20);
    await wait(100);

    await line('');
    await line('^ Raster pattern should be clean');
    await line('  50% gray without missing rows.');
    await line('');

    // Section 5: Alignment & Final Status
    await write(Buffer.from([0x1B, 0x61, 0x01])); // Center
    await line('*** CALIBRATION SUCCESS ***');
    await line('RP203 READY FOR PHOTO BOOTH');
    await write(Buffer.from([0x1B, 0x61, 0x00])); // Left
  }

  // Feed and cut
  console.log('📜 Feeding paper and cutting...');
  await write(Buffer.from([0x1B, 0x64, 0x05, 0x1D, 0x56, 0x42, 0x05]));
  await drain();
  await wait(600);

  port.close();
  console.log('\n======================================================');
  console.log('✅ Calibration print finished!');
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('\n❌ Calibration Error:', err.message);
  if (err.message.includes('Resource busy') || err.message.includes('busy')) {
    console.error('💡 The serial port is currently in use by another program.');
    console.error('   Please disconnect the printer in Chrome or close the tab, then retry.');
  }
  process.exit(1);
});

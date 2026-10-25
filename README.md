# 📸 SnapBooth — RP203 Thermal Photo Booth (Windows Ready)

[![Web Serial API](https://img.shields.io/badge/Web%20Serial-Ready-success?style=for-the-badge&logo=googlechrome)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![Hardware](https://img.shields.io/badge/Printer-RP203%20Thermal-orange?style=for-the-badge)](https://github.com/Khushi-S-Belani/RP203)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-blue?style=for-the-badge&logo=windows)](https://github.com/Khushi-S-Belani/RP203)

An authentic, ultra-smooth **photo booth and thermal printing kiosk** designed for the **RP203 (MOD-QC0925 / 58mm thermal printer)**. Connects directly to your thermal printer via **Windows COM Serial Ports** & **Web Serial API** at **9600 baud** with 1-click Windows driver setup.

📖 **For exhaustive technical documentation, hardware pinouts, and architectural specifications, see [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md).**

---

## ✨ Key Features

- **👥 Robust Automatic Person Detection:** Instant dual-engine face and group detection (OpenCV Deep YuNet + ONNX ViT gender classification with browser spatial fallback) that automatically classifies **1 Person (Solo)**, **Couple / Love (`👨 👩` / `♥`)**, **Trio**, or **Squad** with temporal smoothing and live UI indicators.
- **🖨️ Authentic Live Thermal Print Preview:** Real-time 1:1 progressive print simulation in the UI as paper emerges line-by-line from the thermal slot, showing exact Floyd-Steinberg monochrome dithering.
- **✏️ Custom Captions with Character Limit:** Interactive caption editor with strict **28-character limiters** to fit 32-column 58mm thermal paper without line wrapping.
- **🕒 Saved Photo Strips Archive & Reprint:** Automatic local history saving previous prints with instant re-print, file load, and image export. Also supports loading any external photo to dither and print.
- **⚡ Calibrated Anti-Brownout Thermal Timing:** Default heating set to safe 32-dot pulses (`0x04`) and 25ms paced chunks to prevent resets on 5V 3A and 12V adapters.

---

## 🚀 Windows Quick Start (100% Plug & Play)

### 1. Driver Installation (WCH CH340 / CH341)
If your USB-to-TTL adapter or printer does not yet appear in Device Manager:
- Double-click **`install_drivers.bat`**
- In the installer window, click **INSTALL**
- Unplug and replug your printer's USB cable (Windows will assign it `COM3`, `COM4`, etc.)

### 2. Launch the Booth
1. Double-click **`start.bat`** (or run `npm start`).
2. The script will automatically scan your COM ports and launch Chrome/Edge to `http://localhost:8080`.
3. Click **"🖨️ Printer Settings" → "Connect Printer"**, select your COM port, and you're ready to snap & print!

---

## 🍎 macOS Setup (Alternative)
1. Open Terminal and run:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
2. If using a CH340 adapter for the first time:
   ```bash
   npm run install-driver:mac
   ```

---

## ⚡ Hardware Wiring & Power Specifications

| Pin | Connect To | Specification & Purpose |
|---|---|---|
| **VCC** (Power) | **5V 3A Power Supply** | ⚠️ Thermal heads draw **2A–3A peak current** during heating. A 12V 1A adapter will collapse under load; **5V 3A** or **9V/12V 2A+** is recommended. |
| **GND** | **GND** | Connect common ground between power adapter, printer, and USB adapter. |
| **TX** | **USB Adapter RX** | Cross-connected |
| **RX** | **USB Adapter TX** | Cross-connected |

**Default Baud Rate:** `9600`  
**Paper Width:** `58mm` (384 dots printable width / 48 bytes per line)

---

## 🛠️ Testing & Calibration Scripts

Run direct terminal diagnostics to verify hardware and COM port communication independently:
```bash
# Print diagnostic heat ladder & test strips
npm run calibrate-printer         # Calibrated for 5V 3A adapter (auto-detects COM port)
node printer_calibrate.js 12v COM3 # Throttled low-duty for 12V 1A adapter

# Quick receipt & alignment test
npm run test-printer              # Auto-detects COM port
node printer_test.js english COM3 # Explicit COM port test
```

---

## 📜 License
MIT License. Built for photobooth kiosks, makers, and thermal hardware hackers.

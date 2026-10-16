# 📸 SnapBooth — RP203 Thermal Photo Booth (Windows & Mac Ready)

[![GitHub Pages](https://img.shields.io/badge/Demo-GitHub%20Pages-blue?style=for-the-badge&logo=github)](https://prince-tagadiya.github.io/RP203/)
[![Web Serial API](https://img.shields.io/badge/Web%20Serial-Ready-success?style=for-the-badge&logo=googlechrome)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
[![Hardware](https://img.shields.io/badge/Printer-RP203%20Thermal-orange?style=for-the-badge)](https://github.com/Prince-Tagadiya/RP203)

An authentic, ultra-smooth **photo booth and thermal printing kiosk** designed for the **RP203 (MOD-QC0925 / 58mm thermal printer)**. Connects directly to your thermal printer via **Web Serial API** at **9600 baud** with zero drivers needed on Chrome & Edge.

---

## ✨ Key Features

- **🖨️ Authentic Live Thermal Print Preview:** Real-time 1:1 progressive print simulation in the UI as paper emerges line-by-line from the thermal slot, showing exact Floyd-Steinberg monochrome dithering with an active thermal laser head indicator.
- **💑 Multi-Person & Couple Pose Guides:**
  - **Love / Couple Mode (`👨 👩` / `🤗 🫶 💖`):** Guides you through **Pose 1: Hug Tight**, **Pose 2: Heart Hands**, and **Pose 3: Cheek-to-Cheek**. Each photo gets its own distinct cute badge!
  - **Yaari / Bros Mode (`👨 👨` / `👊 🤝 ★`):** Fist bump, handshake, and swagger pose.
  - **Besties Mode (`👩 👩` / `✨ 👯‍♀️ 💖`):** Cute peace signs, bestie hugs, and sparkles.
- **✏️ Custom Captions with Character Limit:**
  - Interactive caption editor with strict **28-character counters** to fit 32-column 58mm thermal paper without ugly line breaks.
  - 🎲 One-tap random caption shuffler matching your selected group theme.
- **🕒 Recent Prints History:** Automatically records the **Last 3 Prints** with instant preview, reprint, and image download.
- **🛑 Camera Toggle:** Turn camera on/off anytime with 1 tap or switch to file upload mode.
- **⚡ Calibrated Anti-Brownout Thermal Timing:** Default heating set to safe 32-dot pulses (`0x04`) and 25ms paced chunks to prevent resets on 5V 3A and 12V adapters.

---

## 🚀 Plug & Play Quick Start

### 🪟 Windows (10 / 11) — 100% Plug & Play
1. Plug your USB-to-TTL adapter into any USB port (Windows assigns it `COM3`, `COM4`, etc.).
2. Double-click **`start.bat`**.
3. In Chrome or Edge, click **"🖨️ Printer Settings" → "Connect Printer"**, pick your COM port, and you're ready to print!

### 🍎 macOS
1. Open Terminal and run:
   ```bash
   chmod +x start.sh
   ./start.sh
   ```
2. If using a CH340 adapter for the first time:
   ```bash
   brew install --cask wch-ch34x-usb-serial-driver
   ```
   Allow in **System Settings > Privacy & Security** and restart your Mac.

### 🌐 GitHub Pages (Run Directly in Browser)
No Node.js or installation needed! Open in **Google Chrome** or **Microsoft Edge**:
👉 **[https://prince-tagadiya.github.io/RP203/](https://prince-tagadiya.github.io/RP203/)**

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

Run direct terminal diagnostics if you want to test the hardware independently:
```bash
# Print diagnostic heat ladder & test strips
node printer_calibrate.js 5v     # Calibrated for 5V 3A adapter
node printer_calibrate.js 12v    # Calibrated low-duty for 12V 1A adapter

# Quick receipt & alignment test
node printer_test.js
```

---

## 📜 License
MIT License. Built with love for makers, photobooth enthusiasts, and thermal hardware hackers.

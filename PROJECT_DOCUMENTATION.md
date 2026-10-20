# 📸 SnapBooth — Comprehensive Project Documentation & Technical Reference

> **Author:** Prince Tagadiya • The Creato4 Lab  
> **Official Page / Instagram:** [@creato4.lab](https://www.instagram.com/creato4.lab/)  
> **Repository:** [Prince-Tagadiya/RP203](https://github.com/Prince-Tagadiya/RP203)  
> **Live Web Application:** [https://prince-tagadiya.github.io/RP203/](https://prince-tagadiya.github.io/RP203/)  
> **Hardware Target:** RP203 / MOD-QC0925 / 58mm Thermal Receipt Printer Mechanism  

---

## 📑 Table of Contents

1. [Executive Summary & Purpose](#1-executive-summary--purpose)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Hardware & Electrical Engineering](#3-hardware--electrical-engineering)
   - 3.1 Printer Mechanism (RP203 / MOD-QC0925)
   - 3.2 Electrical Pinouts & Wiring Table
   - 3.3 Power Supply & Anti-Brownout Requirements
   - 3.4 USB-to-TTL Serial Adapters
4. [Software Components & Repository Breakdown](#4-software-components--repository-breakdown)
5. [Automatic Person Detection & Group Theming Engine](#5-automatic-person-detection--group-theming-engine)
   - 5.1 Dual-Engine Architecture (Local Server + Client Browser)
   - 5.2 Apple Vision Neural Framework & ONNX ViT Model
   - 5.3 Client-Side Canvas Spatial-Temporal Energy Analyzer
   - 5.4 Temporal Consensus Voting Filter (Zero Jitter)
   - 5.5 Visual Indicators & Manual Override Controls
6. [Thermal Photo Processing & Strip Generation](#6-thermal-photo-processing--strip-generation)
   - 6.1 3-Shot Photo Booth Session Flow
   - 6.2 Image Dithering (Floyd-Steinberg Algorithm)
   - 6.3 Canvas Strip Composition (384px Width Architecture)
   - 6.4 QR Code Generator & Maker Signature
7. [Thermal Printer Communication & ESC/POS Driver](#7-thermal-printer-communication--escpos-driver)
   - 7.1 Web Serial API Implementation (Direct Browser to Hardware)
   - 7.2 ESC/POS Command Reference
   - 7.3 Thermal Head Pacing & Anti-Brownout Timings
   - 7.4 Local Node.js Proxy Server Driver
8. [Saved Strip Management & Reprint System](#8-saved-strip-management--reprint-system)
9. [Setup & Execution Guide](#9-setup--execution-guide)
   - 9.1 Browser Only (GitHub Pages / Offline Standalone)
   - 9.2 Local Server Setup (macOS & Windows)
10. [Calibration & Diagnostic Tools](#10-calibration--diagnostic-tools)
11. [Troubleshooting & FAQs](#11-troubleshooting--faqs)
12. [License & Credits](#12-license--credits)

---

## 1. Executive Summary & Purpose

**SnapBooth** is a production-grade, zero-dependency photo booth and direct thermal printing system tailored for the **RP203 58mm thermal printer mechanism**.

Traditional photobooth software relies on bulky desktop drivers, proprietary software, and expensive photo paper printers. **SnapBooth** transforms an accessible, low-cost thermal receipt printer into a nostalgic, high-contrast, instant-print photobooth kiosk that runs directly inside modern web browsers (Chrome, Edge, Opera) via the **Web Serial API**, with zero driver installation required.

### Core Philosophy & Design Principles:
- **Plug & Play:** Connect USB-TTL, open the web app, select port, and print.
- **No AI Slop / Clean Tactile UI:** Replaced tacky skeleton overlays and tacky AR emoji stamps with an elegant, modern, high-contrast user interface that lets the photos speak for themselves.
- **Dual-Engine Detection:** Seamless automatic person counting and theme classification whether connected to a full local Python/Apple Vision server or hosted as a static web app on GitHub Pages.
- **Hardware Protection:** Built-in current limiting, heat pulse calibration, and transmission pacing to eliminate thermal printer brownouts and micro-controller resets.

---

## 2. High-Level Architecture

```mermaid
graph TD
    User([User / Camera]) --> Frontend[SnapBooth Frontend (HTML5 / Vanilla JS / Canvas)]
    
    subgraph Browser Engine
        Frontend --> CamModule[Webcam Capture & 3-Shot Sequence]
        Frontend --> DitherEngine[Floyd-Steinberg Monochrome Ditherer]
        Frontend --> StripCanvas[384px Thermal Canvas Renderer]
        Frontend --> HistoryStore[LocalStorage Strip Archive]
        Frontend --> ClientVision[Client-Side Spatial Presence Analyzer]
    end

    subgraph Dual-Engine Person Detection
        ClientVision --> DetectionConsensus[Temporal Consensus Voting (3 Samples)]
        Frontend -.->|POST /api/detect-faces| BackendVision[Local Server: Apple Vision + ViT ONNX]
        BackendVision --> DetectionConsensus
        DetectionConsensus --> UIIndicators[Header Pill + Cam Chip + Themed Captions]
    end

    subgraph Printing Subsystem
        StripCanvas --> ESCCoder[ESC/POS Raster Bit Image Converter]
        ESCCoder --> TransportRouter{Connection Mode}
        TransportRouter -->|Web Serial API (9600 baud)| HardwarePrinter[RP203 Thermal Printer]
        TransportRouter -->|POST /api/print| NodeProxy[Local Node.js Server]
        NodeProxy --> HardwarePrinter
    end
```

---

## 3. Hardware & Electrical Engineering

### 3.1 Printer Mechanism (RP203 / MOD-QC0925)
- **Print Method:** Direct Thermal Line Printing
- **Effective Resolution:** 203 DPI (8 dots/mm)
- **Total Print Width:** 48 mm (384 dots per line)
- **Paper Roll Width:** 57.5 mm ± 0.5 mm (Standard 58mm thermal paper)
- **Paper Roll Outer Diameter:** Max 40 mm
- **Default Communication Interface:** TTL Serial (UART)
- **Default Baud Rate:** 9600 bps (8 data bits, 1 stop bit, no parity)

### 3.2 Electrical Pinouts & Wiring Table

The RP203 mechanism typically connects via a 5-pin or 4-pin JST connector:

| Pin Name | Wire Color (Typical) | Connects To | Description |
|:---|:---|:---|:---|
| **VCC** (Power) | Red | Power Supply Positive (+5V or +9V–12V) | Main heating and motor supply. **Do not power from USB 5V!** |
| **GND** (Ground) | Black | Common Ground (PSU GND & USB GND) | Essential for reference voltage signal integrity. |
| **TX** (Transmit) | Yellow / Blue | USB-TTL Adapter **RXD** | Printer status & diagnostics output. |
| **RX** (Receive) | White / Green | USB-TTL Adapter **TXD** | Printer ESC/POS data input. |
| **DTR / RTS** | Green (Optional) | USB-TTL Adapter **CTS** (or leave floating) | Flow control (handled in software via chunk pacing). |

> [!CAUTION]
> **COMMON GROUND IS MANDATORY:** Connect the Ground (`GND`) of the external power supply directly to the `GND` pin of the USB-to-TTL adapter. A missing common ground creates floating voltage levels and corrupts serial communication.

### 3.3 Power Supply & Anti-Brownout Requirements
- **Idle Current:** ~50 mA to 100 mA
- **Peak Current (Heating Dots):** **2.5 A to 3.2 A** per line pulse!
- **Recommended Power Adapters:**
  - **Option 1 (Fast & Safe):** 5V DC regulated @ **3.0A to 4.0A**
  - **Option 2 (High Speed):** 9V or 12V DC regulated @ **2.0A+**
- **Why Standard 12V 1A Adapters Fail:**
  When printing dense photographic dither lines, all thermal elements heat simultaneously. A 12V 1A supply will voltage-sag below 4.5V, causing the printer's onboard microcontroller to brown-out and reset mid-strip, printing garbage characters or blank paper. SnapBooth's software includes thermal pulse splitting (`0x04` = 32 dots) to prevent this collapse.

### 3.4 USB-to-TTL Serial Adapters
SnapBooth supports all standard USB-to-UART bridge ICs:
- **WCH CH340 / CH340G / CH341** (Widely used, highly reliable)
- **Silicon Labs CP2102 / CP2104**
- **FTDI FT232RL**
- **Prolific PL2303**

---

## 4. Software Components & Repository Breakdown

| File | Purpose | Key Responsibilities |
|:---|:---|:---|
| `index.html` | Application UI Layout | Header status badges, camera viewport, countdown overlay, photo strip live preview canvas, saved history drawer, printer settings modal, custom caption editor. |
| `style.css` | Design System & Styling | Clean tactile design, responsive flex/grid layouts, themed pills (`theme-love`, `theme-yaari`, `theme-bestie`, etc.), thermal paper slot animation. |
| `app.js` | Core Client Controller | Web Serial driver, camera controls, 3-shot workflow, client-side vision analyzer, Floyd-Steinberg dithering, ESC/POS generator, LocalStorage strip archive. |
| `server.js` | Local Node.js Proxy Server | OS-level serial port auto-discovery, warm AI Vision subprocess manager, direct serial file descriptor writing with pacing, static asset web server. |
| `face_detector_ai.py` | Python AI Vision Daemon | Persistent stdin/stdout daemon with ViT ONNX Gender model and native Apple Vision bridge. Uses `reqId` matching to eliminate queue desync. |
| `face_detector.swift` | Native Apple Vision Detector | Hardware-accelerated Swift program using Apple Neural Engine (`VNDetectFaceRectanglesRequest` + `VNDetectFaceLandmarksRequest`). |
| `face_detector` | Compiled Native Binary | Standalone native macOS ARM64 binary compiled from `face_detector.swift`. |
| `gender_model.onnx` | ViT Neural Network Model | Compact Vision Transformer ONNX model trained for binary facial feature classification. |
| `thermal_optimizer.py` | Standalone Image Optimizer | Python utility for adaptive contrast normalization, unsharp masking, and thermal paper pre-processing. |
| `printer_calibrate.js` | Diagnostic Terminal Utility | Command-line tool to print heat ladders, density tests, and verify baud rate integrity. |
| `printer_test.js` | Quick Print Verification | Standalone terminal script to output test receipts and verify alignment. |
| `start.bat` | Windows One-Click Launcher | Launches Node.js server and opens Google Chrome on Windows kiosks. |
| `start.sh` | macOS One-Click Launcher | Configures execution permissions, starts the local server, and launches Chrome on macOS. |

---

## 5. Automatic Person Detection & Group Theming Engine

SnapBooth automatically detects the number of persons in the photobooth and tailors the experience (strip titles, subtitles, color accents, and emojis).

```
   [0 or 1 Person]  -->  🧑 Solo Mode      ("1 Person (Solo)" / Indigo)
   [2 People]       -->  👨 👩 Couple / Love ("2 People (Couple)" / Rose ♥)
                         👨 👨 Bros / Yaari   ("2 Bros (Yaari)" / Blue ★)
                         👩 👩 Besties        ("2 Besties" / Pink ✨)
   [3 People]       -->  🧑 🧑 🧑 Trio Group  ("3 People (Trio)" / Emerald)
   [4+ People]      -->  🧑 🧑 🧑 🧑 Squad    ("4+ People (Squad)" / Violet)
```

### 5.1 Dual-Engine Architecture
1. **Local Server Mode (`http://localhost:8080/`):**
   - Automatically posts 320x240 compressed frames to `/api/detect-faces` every 600ms.
   - The local backend runs native Apple Vision + ONNX ViT inference in sub-250ms warm time.
   - Preserves request IDs (`reqId`) across IPC boundaries to prevent asynchronous desynchronization.
2. **Client-Side Mode (GitHub Pages / Standalone Offline):**
   - If `/api/detect-faces` fails or is unreachable (such as on GitHub Pages), the app seamlessly switches to `detectFacesClientSide()`.
   - Utilizes native `window.FaceDetector` API if available, paired with spatial-energy canvas analysis.

### 5.2 Client-Side Spatial Presence Analyzer
The browser-native detector operates directly on canvas pixel data in ~2ms without external dependencies:
- Downscales the video frame to a 120x90 analysis buffer with `{ willReadFrequently: true }`.
- Converts pixels to YCbCr and RGB color spaces to detect skin tone and hair contrast across varying ethnicities and lighting.
- Analyzes horizontal column presence across left, center, and right quadrants.
- When both left and right quadrants exhibit distinct foreground clusters, it confidently classifies the group as **2 People (Couple)**.

### 5.3 Temporal Consensus Voting Filter (Zero Jitter)
To prevent rapid mode switching caused by head movement, blinking, or temporary occlusion:
- Detection samples are stored in a 3-frame sliding buffer.
- A state transition only occurs if a mode receives **at least 2 consensus votes**.
- Eliminates camera flicker, mode jumping, and distracting theme flickering.

### 5.4 Visual Indicators & Manual Override
- **Header Badge (`#person-detection-pill`):** Dead-center in the navigation bar. Displays the live mode with an active LED pulse.
- **Camera Viewport Chip (`#camera-detection-chip`):** Translucent glass pill in the live video preview.
- **Interactive Mode Cycling:** Clicking the header pill at any time manually locks the mode (`Couple`, `Besties`, `Bros`, `Solo`, `Trio`, `Squad`) or resets back to `Auto`.

---

## 6. Thermal Photo Processing & Strip Generation

```
+------------------------------------------+
|               PHOTO BOOTH                |
|          SMILE & LAUGH / LOVE BIRDS      |
|              OCT 20, 2026 • 15:30        |
|==========================================|
|                                          |
|                [PHOTO 1]                 |
|                                          |
|------------------------------------------|
|                                          |
|                [PHOTO 2]                 |
|                                          |
|------------------------------------------|
|                                          |
|                [PHOTO 3]                 |
|                                          |
|==========================================|
|         PRINCE TAGADIYA ★ CREATO4        |
|           SCAN TO FOLLOW INSTAGRAM       |
|                 [ QR CODE ]              |
|            instagram.com/creato4.lab     |
+------------------------------------------+
```

### 6.1 3-Shot Photo Booth Session Flow
1. User clicks **"📸 Take 3 Photos"**.
2. Live status banner announces **"Get ready for Photo 1 of 3..."**.
3. Large 3-second animated countdown appears directly over the camera feed.
4. Camera flashes white (`#flash-overlay`), captures full-resolution frame, and inserts into Slot 1.
5. Repeats automatically for Photo 2 and Photo 3 with brief 700ms pauses between shots.
6. Automatically renders the final thermal strip preview with dithering and makes **"Print Photo Strip"** active.

### 6.2 Floyd-Steinberg Dithering Algorithm
Thermal printers cannot print grayscale; every dot is strictly **black** or **white**. Simple thresholding results in severe posterization and loss of facial detail.

SnapBooth uses 2D Floyd-Steinberg error diffusion dithering:
$$\text{Error} = \text{OldPixel} - \text{NewPixel}$$
The residual quantization error is distributed to neighboring pixels:
- **Right $(x+1, y)$:** $+ \frac{7}{16} \times \text{Error}$
- **Bottom-Left $(x-1, y+1)$:** $+ \frac{3}{16} \times \text{Error}$
- **Bottom $(x, y+1)$:** $+ \frac{5}{16} \times \text{Error}$
- **Bottom-Right $(x+1, y+1)$:** $+ \frac{1}{16} \times \text{Error}$

Before dithering, an adaptive luminance curve with unsharp contrast enhancement is applied to highlight eyes, smiles, and contours.

### 6.3 Canvas Strip Composition Architecture
- **Canvas Width:** Fixed at **384 pixels** (exact 48-byte physical dot count of RP203 58mm heads).
- **Header Section:** Dynamic booth title, date stamp, and session time.
- **Photo Slots (x3):** 360x240 aspect ratio per photo, centered with elegant 12px outer borders.
- **Divider Rules:** Solid 2px black separation bars.
- **Footer Section:**
  - Maker signature: `PRINCE TAGADIYA ★ THE CREATO4 LAB`.
  - Clean centered QR code: Linking directly to [https://www.instagram.com/creato4.lab/](https://www.instagram.com/creato4.lab/).
  - Handle label: `instagram.com/creato4.lab`.

---

## 7. Thermal Printer Communication & ESC/POS Driver

### 7.1 Web Serial API Implementation
SnapBooth communicates directly with the RP203 over standard serial ports from the browser:
```javascript
// Request USB-to-TTL Serial Port
const port = await navigator.serial.requestPort();
await port.open({
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
  flowControl: 'none'
});
const writer = port.writable.getWriter();
```

### 7.2 ESC/POS Command Reference
The printer protocol uses standard ESC/POS control sequences:

| Command | Hex Bytes | Description |
|:---|:---|:---|
| `ESC @` | `1B 40` | Initialize printer hardware and clear print buffer. |
| `ESC 7` | `1B 37 n1 n2 n3` | Set heating parameters (pulse dots, heating time, interval). |
| `GS v 0` | `1D 76 30 m xL xH yL yH` | Print raster bit image. |
| `ESC d` | `1B 64 n` | Print and feed paper $n$ lines. |

#### Raster Bit Image Encoding:
Every row of 384 pixels is packed into 48 bytes ($384 / 8 = 48$). A set bit (`1`) turns on the thermal heating element (black dot), and a clear bit (`0`) leaves paper white.

### 7.3 Thermal Head Pacing & Anti-Brownout Timings
To prevent power supply voltage drops:
1. **Heat Parameters:** Configured via `ESC 7` with `n1 = 0x04` (max 32 simultaneous heating dots).
2. **Chunk Pacing:** Raster image bytes are split into 64-byte packets with a **20ms–25ms delay** between chunks. This allows power supply filtering capacitors to recover between heating cycles.

---

## 8. Saved Strip Management & Reprint System

SnapBooth features a built-in historical archiving engine:
- **Automatic Storage:** Every completed 3-shot session is compressed and archived into browser `localStorage` as a timestamped data URL.
- **Instant Retrieval:** Saved strips display in the **"Saved Photo Strips"** carousel at the bottom of the page.
- **Actions:**
  - **Print Now:** Immediately prints the archived strip to the thermal printer.
  - **Load:** Loads the archived strip into the main preview canvas for inspection.
  - **Save:** Downloads high-resolution JPEG to local disk.
  - **Open Saved Image:** Upload any external image or previously exported photo strip to dither and print directly.

---

## 9. Setup & Execution Guide

### 9.1 Browser Only (GitHub Pages / Offline Standalone)
No Node.js or software installation required!
1. Connect your RP203 printer via USB-to-TTL adapter.
2. Open **Google Chrome** or **Microsoft Edge**.
3. Navigate to: **[https://prince-tagadiya.github.io/RP203/](https://prince-tagadiya.github.io/RP203/)**
4. Click **"🖨️ Printer"** in the top navigation bar.
5. Click **"Connect Printer (Web Serial)"** and choose your adapter port (e.g. `USB-Serial`, `CP2102`, or `COM3`).
6. Allow camera permissions and start capturing!

### 9.2 Local Server Setup (macOS & Windows)

#### Prerequisites:
- [Node.js](https://nodejs.org/) (v16.0 or higher)
- [Python 3.9+](https://www.python.org/) with `Pillow`, `numpy`, and `onnxruntime` (optional for local ViT inference):
  ```bash
  pip3 install Pillow numpy onnxruntime
  ```

#### Starting on macOS:
```bash
# Clone the repository
git clone https://github.com/Prince-Tagadiya/RP203.git
cd RP203

# Make start script executable and launch
chmod +x start.sh
./start.sh
```

#### Starting on Windows:
```cmd
REM Double click start.bat or run via Command Prompt:
start.bat
```

The server launches at **`http://localhost:8080/`**.

---

## 10. Calibration & Diagnostic Tools

Built-in terminal scripts are included for hardware maintenance:

```bash
# 1. Print density and heat ladder test
node printer_calibrate.js 5v     # For 5V 3A power adapters
node printer_calibrate.js 12v    # Low-duty cycle for 12V adapters

# 2. Alignment & receipt speed verification
node printer_test.js
```

---

## 11. Troubleshooting & FAQs

### Q1: The web app says "Printer Disconnected".
- **Fix:** Ensure you are using **Google Chrome**, **Microsoft Edge**, or **Opera** (Safari and Firefox do not support the Web Serial API). Click **"🖨️ Printer" → "Connect Printer"** and select the USB serial device.

### Q2: The printer motor feeds paper, but the paper comes out completely blank!
- **Fix:** Thermal paper is single-sided. You have inserted the paper roll upside down. Open the printer cover, flip the paper roll so the sensitive coating faces the thermal heating head, and close the latch.

### Q3: Printer prints a few lines and then stops or resets.
- **Fix:** Your power adapter cannot supply the required 2.5A peak current. Connect a dedicated **5V 3A** power supply. In the printer settings modal, reduce **Heat Energy** slider to `12` or `10`.

### Q4: Camera shows a black box or doesn't start.
- **Fix:** Ensure browser permissions for camera access are granted. If another application (Zoom, OBS, FaceTime) is locking the webcam, close it and tap the green **"Camera Active"** toggle button.

### Q5: How do I print on thermal paper without local server running?
- **Fix:** You can run SnapBooth 100% offline or on GitHub Pages. The built-in client-side canvas engine automatically handles dithering, composition, and serial communication entirely within the browser.

---

## 12. License & Credits

- **Creator & Lead Developer:** Prince Tagadiya
- **Lab / Studio:** The Creato4 Lab
- **Instagram:** [@creato4.lab](https://www.instagram.com/creato4.lab/)
- **License:** Open Source under the [MIT License](https://opensource.org/licenses/MIT).

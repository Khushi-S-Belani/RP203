/* ============================================================
   SnapBooth — Clean & Simple Photo Booth
   Features:
   - 2-Person Face Detection with Automatic Love Emojis & Theme
   - Big tactile buttons, non-AI intuitive UI
   - Direct Web Serial API & Local Server printing to RP203
   ============================================================ */

const state = {
  mode: 'camera',
  filter: 'none',
  stickers: [],
  shots: [null, null, null],
  currentShot: 0,
  // Group / Person Detection
  groupType: 'solo_m',
  groupEmojis: '🧑',
  groupTheme: 'indigo',
  groupLabel: '1 Person (Solo)',
  manualGroupOverride: null,
  detectedCount: 1,

  // Printer
  printerPort: null,
  printerWriter: null,
  baudRate: 9600,
  heatEnergy: 15,
  isPrintCancelled: false,
  currentCaption: null,

  // Custom Saved Image / Strip
  customLoadedCanvas: null,
  customLoadedTitle: null
};
window.PhotoboothAppState = state;
// ── DOM References ──────────────────────────────────────────
const video             = document.getElementById('video');
const stickerCanvas     = document.getElementById('sticker-canvas');
const countdownOverlay  = document.getElementById('countdown-overlay');
const filterLabel       = document.getElementById('filter-label');
const hiddenCanvas      = document.getElementById('hidden-canvas');
// These elements may not exist in all layouts — kept for compatibility
const loveBanner        = document.getElementById('love-banner');
const btnToggleCouple   = document.getElementById('btn-toggle-couple');
const coupleIcon        = document.getElementById('couple-icon');
const coupleLabel       = document.getElementById('couple-label');
const btnShoot          = document.getElementById('btn-shoot');
const btnPrint          = document.getElementById('btn-print');
const btnDownload       = document.getElementById('btn-download');
const feedbackStatus    = document.getElementById('feedback-status');
const quickDot          = document.getElementById('quick-dot');
const quickText         = document.getElementById('quick-text');
const modalDot          = document.getElementById('modal-dot');
const modalStatusText   = document.getElementById('modal-status-text');
const btnModalConnect   = document.getElementById('btn-modal-connect');
const baudInput         = document.getElementById('baud-input');
const heatSlider        = document.getElementById('heat-slider');
const heatValLabel      = document.getElementById('heat-val-label');
const uploadBox         = document.getElementById('upload-box');
const viewportBox       = document.getElementById('viewport-box');
const fileInput         = document.getElementById('file-input');

const THEMED_CAPTIONS = {
  love: [
    { title: '♥ PHOTO BOOTH ♥', subtitle: 'HUG & LOVE FOREVER', footerLine1: '♥ YOU ARE MY FAVORITE ♥' },
    { title: '♥ LOVE BIRDS ♥', subtitle: 'SWEET TOGETHER', footerLine1: '♥ BETTER TOGETHER FOREVER ♥' },
    { title: '♥ TWO HEARTS ♥', subtitle: 'HUGS & KISSES', footerLine1: '♥ ALWAYS & FOREVER ♥' },
    { title: 'PHOTO BOOTH', subtitle: 'CRAZY IN LOVE', footerLine1: '♥ FOREVER & ALWAYS ♥' }
  ],
  yaari: [
    { title: '★ YAARI FOREVER ★', subtitle: 'BROS FOR LIFE', footerLine1: '★ BRO CODE UNLIMITED ★' },
    { title: '★ LEGENDARY DUO ★', subtitle: 'DOUBLE TROUBLE', footerLine1: '★ PARTNERS IN CRIME ★' },
    { title: '★ BROS CLUB ★', subtitle: 'REAL YAARI', footerLine1: '★ UNBREAKABLE BOND ★' }
  ],
  bestie: [
    { title: '✨ BESTIES CLUB ✨', subtitle: 'PURE HAPPINESS', footerLine1: '✨ CUTE & CRAZY ALWAYS ✨' },
    { title: '✨ DOUBLE CUTE ✨', subtitle: 'MAKING MEMORIES', footerLine1: '✨ SHINE TOGETHER ALWAYS ✨' },
    { title: '✨ SWEET BESTIES ✨', subtitle: 'GIRL POWER', footerLine1: '✨ FOREVER & ALWAYS ✨' }
  ],
  trio: [
    { title: '★ THE TRIO ★', subtitle: 'THREE IS A PARTY', footerLine1: '★ UNSTOPPABLE THREE ★' },
    { title: '★ CREW VIBES ★', subtitle: 'GOLDEN MEMORIES', footerLine1: '★ BEST FRIENDS FOREVER ★' }
  ],
  squad: [
    { title: '★ SQUAD GOALS ★', subtitle: 'THE WHOLE CREW', footerLine1: '★ ICONIC MOMENTS ★' },
    { title: '★ CREATO CREW ★', subtitle: 'MAKING HISTORY', footerLine1: '★ BEST CREW EVER ★' }
  ],
  default: [
    { title: 'PHOTO BOOTH', subtitle: 'GOOD VIBES ONLY', footerLine1: 'HAVE A NICE DAY' },
    { title: 'SNAP BOOTH', subtitle: 'MAKING MEMORIES', footerLine1: 'CHERISH THE MOMENTS' },
    { title: 'CREATO 4', subtitle: 'BEST CREW EVER', footerLine1: 'LITTLE MOMENTS, BIG MEMORIES' },
    { title: 'PHOTO BOOTH', subtitle: 'SMILE & LAUGH', footerLine1: 'FOREVER YOUNG' },
    { title: 'SMILE CLUB', subtitle: 'PURE HAPPINESS', footerLine1: 'KEEP SMILING ALWAYS' },
    { title: 'PHOTO BOOTH', subtitle: 'SWEET VIBES ONLY', footerLine1: 'LOVE & LAUGHTER ALWAYS' }
  ]
};

const RANDOM_CAPTIONS = THEMED_CAPTIONS.default;

function pickRandomCaption() {
  const currentTheme = state.groupTheme || 'default';
  const pool = THEMED_CAPTIONS[currentTheme] || THEMED_CAPTIONS.default;
  const idx = Math.floor(Math.random() * pool.length);
  state.currentCaption = { ...pool[idx] };
  syncCaptionDisplay();
}

function shuffleRandomCaption() {
  const currentTheme = state.groupTheme || 'default';
  const pool = THEMED_CAPTIONS[currentTheme] || THEMED_CAPTIONS.default;
  let nextIdx;
  do {
    nextIdx = Math.floor(Math.random() * pool.length);
  } while (pool.length > 1 && pool[nextIdx].subtitle === state.currentCaption?.subtitle);
  state.currentCaption = { ...pool[nextIdx] };
  syncCaptionDisplay();
  setFeedback(`🎲 Caption: "${state.currentCaption.subtitle}"`);
}

function syncCaptionDisplay() {
  if (!state.currentCaption) return;
  const topEl = document.getElementById('strip-top-title');
  const subEl = document.getElementById('strip-creato-title');
  const footEl = document.getElementById('strip-footer-text');
  if (topEl) topEl.textContent = state.currentCaption.title;
  if (subEl) subEl.textContent = state.currentCaption.subtitle;
  if (footEl) footEl.textContent = state.currentCaption.footerLine1;
}

// ── PERSON DETECTION CYCLING & MODES ────────────────────────
const GROUP_CYCLE = [
  { type: 'auto',      emojis: '✨',        label: 'Auto Detection',      theme: 'indigo' },
  { type: 'couple_mf', emojis: '👨 👩',      label: '2 People (Couple)',   theme: 'love' },
  { type: 'couple_ff', emojis: '👩 👩',      label: '2 People (Besties)',  theme: 'bestie' },
  { type: 'couple_mm', emojis: '👨 👨',      label: '2 People (Bros)',     theme: 'yaari' },
  { type: 'solo_m',    emojis: '👨',         label: '1 Person (Solo)',     theme: 'indigo' },
  { type: 'solo_f',    emojis: '👩',         label: '1 Person (Solo)',     theme: 'bestie' },
  { type: 'trio',      emojis: '🧑 🧑 🧑',    label: '3 People (Trio)',     theme: 'trio' },
  { type: 'squad',     emojis: '🧑 🧑 🧑 🧑', label: '4+ People (Squad)',   theme: 'squad' }
];

function cycleGroupMode() {
  const currentKey = state.manualGroupOverride || 'auto';
  const currentIdx = GROUP_CYCLE.findIndex(g => g.type === currentKey);
  const next = GROUP_CYCLE[(currentIdx + 1) % GROUP_CYCLE.length];

  if (next.type === 'auto') {
    state.manualGroupOverride = null;
    detectionHistory = [];
    setFeedback('✨ Auto Person Detection active');
    updateDetectionUI('auto', '✨', 'Auto: Detecting...');
  } else {
    state.manualGroupOverride = next.type;
    applyGroupState(next.type, next.emojis, next.theme, next.label, true);
    setFeedback(`Mode locked: ${next.label}`);
  }
}

function updateDetectionUI(type, emojis, label) {
  const pill = document.getElementById('person-detection-pill');
  const icon = document.getElementById('detection-icon');
  const txt = document.getElementById('detection-label');
  const camChipTxt = document.getElementById('cam-chip-text');

  if (icon) icon.textContent = emojis;
  if (txt) txt.textContent = label;
  if (camChipTxt) camChipTxt.textContent = label;

  if (pill) {
    pill.className = 'person-detection-pill' + (type === 'auto' ? '' : ' theme-' + state.groupTheme);
  }
}

function applyGroupState(type, emojis, theme, label, isManual = false) {
  const wasTheme = state.groupTheme;
  state.groupType = type;
  state.groupEmojis = emojis;
  state.groupTheme = theme;
  state.groupLabel = label;

  updateDetectionUI(type, emojis, label);

  // Automatically update captions if theme changed and user didn't write custom captions
  if (wasTheme !== theme && !state.customCaptionUserDefined) {
    pickRandomCaption();
  }
}

// ── CUSTOM CAPTION MODAL CONTROLS ───────────────────────────
function openCaptionModal() {
  const modal = document.getElementById('caption-modal');
  if (!modal) return;
  const current = state.currentCaption || RANDOM_CAPTIONS[0];
  const titleInput = document.getElementById('custom-caption-title');
  const subInput = document.getElementById('custom-caption-sub');
  const footerInput = document.getElementById('custom-caption-footer');

  if (titleInput) titleInput.value = current.title;
  if (subInput) subInput.value = current.subtitle;
  if (footerInput) footerInput.value = current.footerLine1;

  updateCharCount('title');
  updateCharCount('sub');
  updateCharCount('footer');

  modal.style.display = 'flex';
}

function closeCaptionModal() {
  const modal = document.getElementById('caption-modal');
  if (modal) modal.style.display = 'none';
}

function updateCharCount(field) {
  const map = {
    title: { input: 'custom-caption-title', counter: 'count-title' },
    sub: { input: 'custom-caption-sub', counter: 'count-sub' },
    footer: { input: 'custom-caption-footer', counter: 'count-footer' }
  };
  const item = map[field];
  if (!item) return;
  const el = document.getElementById(item.input);
  const countEl = document.getElementById(item.counter);
  if (el && countEl) {
    const len = el.value.length;
    countEl.textContent = `${len} / 28`;
    countEl.classList.toggle('limit-near', len >= 24);
  }
}

function applyCustomCaption() {
  const titleInput = document.getElementById('custom-caption-title');
  const subInput = document.getElementById('custom-caption-sub');
  const footerInput = document.getElementById('custom-caption-footer');

  const title = (titleInput?.value || 'PHOTO BOOTH').trim().slice(0, 28);
  const subtitle = (subInput?.value || 'GOOD VIBES ONLY').trim().slice(0, 28);
  const footer = (footerInput?.value || 'HAVE A NICE DAY').trim().slice(0, 28);

  state.currentCaption = {
    title: title || 'PHOTO BOOTH',
    subtitle: subtitle || 'MEMORIES',
    footerLine1: footer || 'HAVE A NICE DAY',
    footerLine2: ''
  };

  state.customCaptionUserDefined = true;
  syncCaptionDisplay();
  closeCaptionModal();
  setFeedback(`Custom caption saved: "${state.currentCaption.subtitle}"`);
}

window.addEventListener('DOMContentLoaded', () => {
  updateCurrentDate();
  pickRandomCaption();
  renderHistoryUI();
  startCamera();
  initStickerEvents();
  initUploadEvents();
  checkAuthorizedPorts();
  startPersonDetectionLoop();

  if (baudInput) {
    baudInput.addEventListener('change', e => { state.baudRate = parseInt(e.target.value); });
  }
  if (heatSlider) {
    heatSlider.value = state.heatEnergy;
    if (heatValLabel) heatValLabel.textContent = state.heatEnergy;
    heatSlider.addEventListener('input', e => {
      state.heatEnergy = parseInt(e.target.value);
      if (heatValLabel) heatValLabel.textContent = e.target.value;
    });
  }
});

async function checkAuthorizedPorts() {
  if ('serial' in navigator) {
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0 && !state.printerPort) {
        console.log('🔌 Auto-connecting to previously authorized USB-TTL port @ 9600 baud...');
        await connectPrinterWebSerial(ports[0]);
      }
    } catch (e) {
      console.warn('Auto-reconnect note:', e);
    }
  }
}

function updateCurrentDate() {
  const now = new Date();
  const dStr = now.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).toUpperCase();
  document.getElementById('strip-date-display').textContent = dStr;
}

// ── Camera Feed with Explicit ON/OFF Toggle ──────────────────
let isCameraActive = false;

async function startCamera() {
  try {
    if (video.srcObject) {
      stopCamera();
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });
    video.srcObject = stream;
    isCameraActive = true;
    updateCameraToggleButton(true);
    const camOffOverlay = document.getElementById('camera-off-overlay');
    if (camOffOverlay) camOffOverlay.style.display = 'none';

    video.onloadedmetadata = () => {
      resizeStickerCanvas();
    };
    window.addEventListener('resize', () => {
      resizeStickerCanvas();
    });
  } catch (err) {
    console.warn('Camera error:', err);
    isCameraActive = false;
    updateCameraToggleButton(false);
    switchMode('upload');
    setFeedback('Camera unavailable. Switched to Upload mode.');
  }
}

function stopCamera() {
  if (video && video.srcObject) {
    const tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
    video.srcObject = null;
  }
  isCameraActive = false;
  updateCameraToggleButton(false);
  const camOffOverlay = document.getElementById('camera-off-overlay');
  if (camOffOverlay && state.mode === 'camera') {
    camOffOverlay.style.display = 'flex';
  }
}

function toggleCameraPower() {
  if (isCameraActive) {
    stopCamera();
    setFeedback('Camera turned off.');
  } else {
    switchMode('camera');
    startCamera();
    setFeedback('Camera active.');
  }
}

function updateCameraToggleButton(active) {
  const btn = document.getElementById('btn-cam-toggle');
  const txt = document.getElementById('cam-toggle-text');
  if (!btn) return;
  if (active) {
    if (txt) txt.textContent = 'Camera Active';
    btn.classList.add('cam-active');
    btn.classList.remove('cam-off');
  } else {
    if (txt) txt.textContent = 'Camera Off';
    btn.classList.remove('cam-active');
    btn.classList.add('cam-off');
  }
}

function resizeStickerCanvas() {
  if (stickerCanvas && viewportBox) {
    stickerCanvas.width  = viewportBox.offsetWidth;
    stickerCanvas.height = viewportBox.offsetHeight;
    drawStickers();
  }
}

// ── Mode Toggle (Webcam vs Upload) ──────────────────────────
function switchMode(m) {
  state.mode = m;
  document.getElementById('tab-webcam').classList.toggle('active', m === 'camera');
  document.getElementById('tab-upload').classList.toggle('active', m === 'upload');
  viewportBox.style.display = m === 'camera' ? 'block' : 'none';
  uploadBox.style.display   = m === 'upload'  ? 'flex'  : 'none';

  if (m === 'upload') {
    // Automatically turn off camera when upload mode is selected
    stopCamera();
    setFeedback('📁 Upload mode: Camera turned off.');
  } else if (m === 'camera') {
    const camOffOverlay = document.getElementById('camera-off-overlay');
    if (camOffOverlay) camOffOverlay.style.display = 'none';
    startCamera();
  }
}

function initUploadEvents() {
  uploadBox.addEventListener('dragover', e => {
    e.preventDefault();
    uploadBox.style.borderColor = '#ff3366';
  });
  uploadBox.addEventListener('dragleave', () => {
    uploadBox.style.borderColor = '#cbd5e1';
  });
  uploadBox.addEventListener('drop', e => {
    e.preventDefault();
    uploadBox.style.borderColor = '#cbd5e1';
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', () => handleFiles(fileInput.files));
}

function handleFiles(files) {
  // Turn off camera when photos are uploaded
  stopCamera();

  const images = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, 3);
  if (images.length === 0) return;
  state.shots = [null, null, null];

  images.forEach((file, idx) => {
    const reader = new FileReader();
    reader.onload = ev => {
      state.shots[idx] = ev.target.result;
      updateStripFrame(idx, ev.target.result);
      optimizePhotoWithBackend(ev.target.result, idx);
      if (idx === images.length - 1) {
        btnPrint.disabled = false;
        btnDownload.disabled = false;
        setFeedback(`✅ ${images.length} photos ready! Camera turned off to save power.`);
      }
    };
    reader.readAsDataURL(file);
  });
}

// ── Filter Selection ────────────────────────────────────────
const filterStyles = {
  none:         '',
  grayscale:    'grayscale(100%) contrast(125%)',
  vintage:      'sepia(60%) contrast(90%) brightness(95%)',
  warm:         'sepia(30%) saturate(140%) hue-rotate(-10deg)',
  soft:         'brightness(108%) contrast(95%) saturate(120%)',
  highcontrast: 'contrast(180%) grayscale(80%)'
};

const filterNames = {
  none: 'Normal', grayscale: '🖤 B&W Thermal', vintage: '🎞️ Vintage',
  warm: '☀️ Warm', soft: '🌸 Soft Pink', highcontrast: '⚡ Sharp'
};

function selectFilter(f, btn) {
  state.filter = f;
  video.style.filter = filterStyles[f] || '';
  filterLabel.textContent = filterNames[f] || f;
  document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ── Stickers ────────────────────────────────────────────────
let activeSticker = null;
let dragX = 0, dragY = 0;

function putSticker(emoji) {
  state.stickers.push({
    emoji,
    x: 0.35 + Math.random() * 0.3,
    y: 0.35 + Math.random() * 0.3
  });
  drawStickers();
}

function clearAllStickers() {
  state.stickers = [];
  drawStickers();
}

function drawStickers() {
  const ctx = stickerCanvas.getContext('2d');
  ctx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);
  const w = stickerCanvas.width, h = stickerCanvas.height;
  state.stickers.forEach(s => {
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s.emoji, s.x * w, s.y * h);
  });
}

function initStickerEvents() {
  stickerCanvas.addEventListener('mousedown', e => {
    const rect = stickerCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top)  / rect.height;
    const hit = [...state.stickers].reverse().find(s => Math.abs(s.x - mx) < 0.1 && Math.abs(s.y - my) < 0.1);
    if (hit) {
      activeSticker = hit;
      dragX = mx - hit.x;
      dragY = my - hit.y;
    }
  });
  window.addEventListener('mousemove', e => {
    if (!activeSticker) return;
    const rect = stickerCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top)  / rect.height;
    activeSticker.x = Math.max(0.05, Math.min(0.95, mx - dragX));
    activeSticker.y = Math.max(0.05, Math.min(0.95, my - dragY));
    drawStickers();
  });
  window.addEventListener('mouseup', () => { activeSticker = null; });
}

// ══════════════════════════════════════════════════════════════
// ROBUST DUAL-ENGINE PERSON DETECTION WITH TEMPORAL SMOOTHING
// Works on both Local Server (Python ViT) and GitHub Pages (Client API)
// ══════════════════════════════════════════════════════════════
let detectionHistory = []; // sliding window for stable consensus
let isDetecting = false;
let backendFails = 0;
let nativeFaceDetector = null;

if ('FaceDetector' in window) {
  try {
    nativeFaceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
  } catch {}
}

async function startPersonDetectionLoop() {
  setInterval(async () => {
    if (state.mode !== 'camera' || !video || video.readyState < 2 || isDetecting) return;
    if (state.manualGroupOverride) return; // User manually locked a mode

    isDetecting = true;
    try {
      let result = null;

      // 1. Try local backend server if available
      if (backendFails < 3) {
        try {
          hiddenCanvas.width = 320;
          hiddenCanvas.height = 240;
          const ctx = hiddenCanvas.getContext('2d');
          ctx.drawImage(video, 0, 0, 320, 240);
          const b64 = hiddenCanvas.toDataURL('image/jpeg', 0.8);

          const res = await fetch('/api/detect-faces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: b64 }),
            signal: AbortSignal.timeout(1000)
          });

          if (res.ok) {
            result = await res.json();
            backendFails = 0; // Server is alive and responsive
          } else {
            backendFails++;
          }
        } catch {
          backendFails++;
        }
      }

      // 2. Client-side fallback engine (100% works on GitHub Pages & offline)
      if (!result) {
        result = await detectFacesClientSide();
      }

      if (result) {
        processDetectionResult(result);
      }
    } catch {
      // Graceful
    } finally {
      isDetecting = false;
    }
  }, 800);
}

// Client-side detection engine
async function detectFacesClientSide() {
  if (nativeFaceDetector && video.videoWidth > 0) {
    try {
      const faces = await nativeFaceDetector.detect(video);
      const count = faces ? faces.length : 0;
      return formatGroupCount(count);
    } catch {}
  }
  return analyzeVideoPresence();
}

function formatGroupCount(count) {
  if (count <= 0) {
    return { count: 0, groupType: 'solo_m', emojis: '🧑', themeColor: 'indigo', label: '1 Person (Solo)' };
  } else if (count === 1) {
    return { count: 1, groupType: 'solo_m', emojis: '🧑', themeColor: 'indigo', label: '1 Person (Solo)' };
  } else if (count === 2) {
    return { count: 2, groupType: 'couple_mf', emojis: '👨 👩', themeColor: 'love', label: '2 People (Couple)' };
  } else if (count === 3) {
    return { count: 3, groupType: 'trio', emojis: '🧑 🧑 🧑', themeColor: 'trio', label: '3 People (Trio)' };
  } else {
    return { count: count, groupType: 'squad', emojis: '🧑 🧑 🧑 🧑', themeColor: 'squad', label: `${count} People (Squad)` };
  }
}

// Fallback presence & facial region analysis
function analyzeVideoPresence() {
  try {
    hiddenCanvas.width = 80;
    hiddenCanvas.height = 60;
    const ctx = hiddenCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 80, 60);
    const imgData = ctx.getImageData(0, 0, 80, 60).data;

    let skinLeft = 0;
    let skinRight = 0;

    for (let y = 10; y < 50; y++) {
      for (let x = 10; x < 70; x++) {
        const idx = (y * 80 + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];

        const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

        if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173 && yVal > 40) {
          if (x < 40) skinLeft++;
          else skinRight++;
        }
      }
    }

    if (skinLeft > 70 && skinRight > 70) {
      return { count: 2, groupType: 'couple_mf', emojis: '👨 👩', themeColor: 'love', label: '2 People (Couple)' };
    }
    return { count: 1, groupType: 'solo_m', emojis: '🧑', themeColor: 'indigo', label: '1 Person (Solo)' };
  } catch {
    return { count: 1, groupType: 'solo_m', emojis: '🧑', themeColor: 'indigo', label: '1 Person (Solo)' };
  }
}

// ── TEMPORAL STABILITY FILTER (PREVENTS FLICKERING & JITTER) ──
function processDetectionResult(result) {
  if (state.manualGroupOverride) return;

  const type = result.groupType || 'solo_m';
  const emojis = result.emojis || '🧑';
  const theme = result.themeColor || 'indigo';
  const label = result.label || (result.count === 2 ? '2 People (Couple)' : result.count >= 3 ? `${result.count} People (Squad)` : '1 Person (Solo)');

  detectionHistory.push({ type, emojis, theme, label });
  if (detectionHistory.length > 4) {
    detectionHistory.shift();
  }

  // Count votes in recent history
  const counts = {};
  detectionHistory.forEach(item => {
    counts[item.type] = (counts[item.type] || 0) + 1;
  });

  let dominantType = type;
  let maxVotes = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > maxVotes) {
      maxVotes = v;
      dominantType = k;
    }
  }

  // Require consensus of at least 2 consecutive votes to switch state
  if (maxVotes >= 2 && state.groupType !== dominantType) {
    const dominantItem = detectionHistory.find(d => d.type === dominantType);
    if (dominantItem) {
      applyGroupState(dominantItem.type, dominantItem.emojis, dominantItem.theme, dominantItem.label);
    }
  } else if (state.groupType === dominantType) {
    const dominantItem = detectionHistory.find(d => d.type === dominantType);
    if (dominantItem) {
      updateDetectionUI(dominantItem.type, dominantItem.emojis, dominantItem.label);
    }
  }
}

// ── PHOTO BOOTH 3-SHOT SHOOTING ────────────────────────────
async function startPhotoSession() {
  if (state.isShooting) return;
  if (state.mode === 'upload') {
    setFeedback('Switch to Live Camera mode to take photos.');
    return;
  }

  state.isShooting = true;
  state.shots = [null, null, null];
  state.currentShot = 0;
  clearCustomLoadedImage();
  btnShoot.disabled = true;
  btnPrint.disabled = true;
  btnDownload.disabled = true;

  const shotSteps = document.getElementById('shot-steps');
  if (shotSteps) shotSteps.style.display = 'flex';
  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`shot-dot-${i}`);
    if (dot) dot.className = 'shot-dot';
    clearStripFrame(i);
  }

  for (let i = 0; i < 3; i++) {
    const dot = document.getElementById(`shot-dot-${i}`);
    if (dot) dot.classList.add('active');

    setFeedback(`Get ready for Photo ${i + 1} of 3...`);
    await runCountdown();

    const photo = captureFrame();
    state.shots[i] = photo;
    updateStripFrame(i, photo);

    // Thermal photo optimization in background
    optimizePhotoWithBackend(photo, i);

    if (dot) {
      dot.classList.remove('active');
      dot.classList.add('done');
    }
    state.currentShot++;

    if (i < 2) await wait(700);
  }

  state.isShooting = false;
  btnShoot.disabled = false;
  btnPrint.disabled = false;
  btnDownload.disabled = false;
  setFeedback('3 Photos ready! Click "Print Photo Strip" to print.');
}

async function runCountdown() {
  const secs = 3;
  for (let t = secs; t > 0; t--) {
    if (countdownOverlay) {
      countdownOverlay.textContent = t;
      countdownOverlay.style.display = 'flex';
    }
    beep(500, 70);
    await wait(1000);
  }
  if (countdownOverlay) {
    countdownOverlay.style.display = 'none';
    countdownOverlay.textContent = '';
  }
  triggerFlash();
  beep(880, 180);
}

function triggerFlash() {
  const f = document.getElementById('flash-overlay');
  if (!f) return;
  f.classList.add('flash');
  setTimeout(() => f.classList.remove('flash'), 120);
}

function captureFrame() {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  hiddenCanvas.width = w;
  hiddenCanvas.height = h;
  const ctx = hiddenCanvas.getContext('2d');

  // Mirror view
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  // Apply visual filter if any
  applyFilterToCanvas(ctx, w, h, state.filter);

  return hiddenCanvas.toDataURL('image/jpeg', 0.94);
}

// Clean helpers for strip rendering
function getPhotoStampEmoji() { return ''; }
function getPhotoStampLabel() { return ''; }

function applyFilterToCanvas(ctx, w, h, filter) {
  if (filter === 'none') return;
  const idata = ctx.getImageData(0, 0, w, h);
  const d = idata.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i+1], b = d[i+2];

    if (filter === 'grayscale') {
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;
      d[i] = d[i+1] = d[i+2] = gray;
    } else if (filter === 'vintage') {
      d[i]   = Math.min(255, (r * 0.393) + (g * 0.769) + (b * 0.189));
      d[i+1] = Math.min(255, (r * 0.349) + (g * 0.686) + (b * 0.168));
      d[i+2] = Math.min(255, (r * 0.272) + (g * 0.534) + (b * 0.131));
    } else if (filter === 'warm') {
      d[i]   = Math.min(255, r * 1.15);
      d[i+2] = Math.max(0, b * 0.85);
    } else if (filter === 'soft') {
      d[i]   = Math.min(255, r * 1.08 + 15);
      d[i+1] = Math.min(255, g * 1.02 + 10);
      d[i+2] = Math.min(255, b * 1.05 + 15);
    } else if (filter === 'highcontrast') {
      const c = 1.7;
      d[i]   = Math.max(0, Math.min(255, ((r - 128) * c) + 128));
      d[i+1] = Math.max(0, Math.min(255, ((g - 128) * c) + 128));
      d[i+2] = Math.max(0, Math.min(255, ((b - 128) * c) + 128));
    }
  }
  ctx.putImageData(idata, 0, 0);
}

// ── Strip Frame UI ──────────────────────────────────────────
function updateStripFrame(idx, dataUrl) {
  const frame = document.getElementById(`frame-${idx}`);
  if (!frame) return;
  frame.innerHTML = `<img src="${dataUrl}" alt="Photo ${idx+1}" />`;
}

function clearStripFrame(idx) {
  const frame = document.getElementById(`frame-${idx}`);
  if (!frame) return;
  frame.innerHTML = `<span class="frame-placeholder">Photo ${idx+1}</span>`;
}

function resetAll() {
  state.shots = [null, null, null];
  state.stickers = [];
  drawStickers();
  state.customCaptionUserDefined = false;
  pickRandomCaption();
  for (let i = 0; i < 3; i++) clearStripFrame(i);
  clearCustomLoadedImage();
  const shotSteps = document.getElementById('shot-steps');
  if (shotSteps) shotSteps.style.display = 'none';
  btnPrint.disabled = true;
  btnDownload.disabled = true;
  setFeedback('Ready! Click "Take 3 Photos" to start.');
}

// ── INSTAGRAM QR CODE EMBEDDING (@creato4.lab) ──────────────
// Pure monochrome 1-bit QR code for https://www.instagram.com/creato4.lab/
const INSTAGRAM_QR_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACXljzdAAAABlBMVEX///8AAABVwtN+AAAACXBIWXMAAA7EAAAOxAGVKw4bAAABjUlEQVRYhdWYwZGDMAxF5eHAkRJcCqXZpVEKJXDkwETRk8zsUkGEDhmilwOyv77liHqILPvaZToX1TJSvyeXWLRyLbt9WmKXEqncZFbdGs9rJ1e1jFR+YpXsK7mj9vcQmQ4WfrJteAcJ7ehRLWv1oKOHqlKSaEoUv/aP9enenh2ck4yw9d/sVyeFPCMl4dW3prYLm31D8V6VGWRm4ubdlV1QVzwR8v85seWtW/sIfq0oOj5Z68yE6DxRz+lq+duFrARRWD2T0o0y29loseiQS1bCksepSMxUh/8NT8xKfG5C5NXPF8sVPaPS3ATPu0z37ny1e5+incTEPY/z0EghF4azSWrCwEQ97MWH4piv+XFuwhdyuKHFbj2LTUpuwoAnkPDE6vWgnRTEV3kJ5zv83RnzUpOIwiEufsq04X+pSQwe5XY+nmNjUpMx6N/z6EKJther5iZxO/znfDqG0xcQWlOZn3WMz/oG4v96+I1F4p7VcxPXDtMT/x/IuCgwqWYmd58yqeoV9yx9dHBC8gWiefX8zL2j1wAAAABJRU5ErkJggg==';

let cachedQrImage = null;
function getInstagramQrImage() {
  if (cachedQrImage) return Promise.resolve(cachedQrImage);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      cachedQrImage = img;
      resolve(img);
    };
    img.onerror = () => {
      img.src = 'instagram_qr.png';
      img.onload = () => { cachedQrImage = img; resolve(img); };
      img.onerror = () => resolve(null);
    };
    img.src = INSTAGRAM_QR_DATA_URL;
  });
}

// ── RENDER STRIP FOR PRINTING & DOWNLOAD ────────────────────
async function renderStripCanvas() {
  const stripW = 384;      // 58mm RP203 standard width (48 bytes per row)
  const padX = 10;
  const photoW = stripW - (padX * 2); // 364 dots
  const photoH = 260;     // 260 dots (sharp 1.4:1 ratio)
  const headerH = 82;     // Space for PHOTO BOOTH + CREATO 4 + Date + Line
  const photoGap = 12;    // Clean gap between photos
  const footerH = 224;    // Space for Line + Caption + Prince Tagadiya • The Creato4 Lab + Instagram QR + URL

  const totalH = headerH + (3 * photoH) + (2 * photoGap) + footerH;

  const canvas = document.createElement('canvas');
  canvas.width  = stripW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d');

  // Solid white paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, stripW, totalH);

  // 1. TOP HEADER: SYNCHRONIZED WITH PREVIEW
  const cap = state.currentCaption || RANDOM_CAPTIONS[0];
  const headerTitle = cap.title;
  const headerSubtitle = cap.subtitle;
  const footerLine1 = cap.footerLine1;
  const stampEmoji = (state.groupTheme === 'love') ? '♥' : (state.groupTheme === 'bestie') ? '✨' : (state.groupTheme === 'yaari' || state.groupTheme === 'squad') ? '★' : '';

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(headerTitle, stripW / 2, 28);

  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(headerSubtitle, stripW / 2, 49);

  // Date line
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).toUpperCase() + ' • ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  ctx.font = '10px monospace';
  ctx.fillText(stampEmoji ? `${stampEmoji} ${dateStr} ${stampEmoji}` : dateStr, stripW / 2, 66);

  // Divider line
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(padX, 74);
  ctx.lineTo(stripW - padX, 74);
  ctx.stroke();

  // 2. THREE PROPERLY PROCESSED THERMAL PHOTOS
  let currentY = headerH;
  for (let i = 0; i < 3; i++) {
    if (state.shots[i]) {
      await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          // Center-crop to fit 364 x 260 without squishing or distortion
          const imgRatio = img.width / img.height;
          const targetRatio = photoW / photoH;
          let sx, sy, sw, sh;
          if (imgRatio > targetRatio) {
            sh = img.height;
            sw = sh * targetRatio;
            sx = (img.width - sw) / 2;
            sy = 0;
          } else {
            sw = img.width;
            sh = sw / targetRatio;
            sx = 0;
            sy = (img.height - sh) / 2;
          }

          const off = document.createElement('canvas');
          off.width = photoW;
          off.height = photoH;
          const offCtx = off.getContext('2d');
          offCtx.drawImage(img, sx, sy, sw, sh, 0, 0, photoW, photoH);

          // Enhance photo contrast and dynamic range for thermal paper
          enhanceThermalPhoto(offCtx, photoW, photoH);

          ctx.drawImage(off, padX, currentY);
          resolve();
        };
        img.src = state.shots[i];
      });
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(padX, currentY, photoW, photoH);
      ctx.fillStyle = '#999999';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`[ PHOTO ${i + 1} ]`, stripW / 2, currentY + (photoH / 2));
    }

    // Outer frame stroke (crisp solid black border)
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.strokeRect(padX, currentY, photoW, photoH);

    currentY += photoH + photoGap;
  }

  // 3. BOTTOM FOOTER: CAPTION + PERMANENT MAKER BRANDING + INSTAGRAM QR CODE
  const footerDividerY = currentY - photoGap + 8;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(padX, footerDividerY);
  ctx.lineTo(stripW - padX, footerDividerY);
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';

  // Primary caption line (e.g., HAVE A NICE DAY or custom caption)
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(footerLine1, stripW / 2, footerDividerY + 23);

  // Permanent Signature Branding requested by user (always printed on paper)
  ctx.font = 'bold 11px monospace';
  ctx.fillText('PRINCE TAGADIYA  ★  THE CREATO4 LAB', stripW / 2, footerDividerY + 44);

  // Divider line before QR code
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX + 24, footerDividerY + 54);
  ctx.lineTo(stripW - padX - 24, footerDividerY + 54);
  ctx.stroke();

  // Draw Instagram QR Code (pure crisp monochrome dots)
  const qrImg = await getInstagramQrImage();
  const qrSize = 108; // 108x108 dots is sharp & perfectly scannable on 58mm thermal paper
  const qrX = Math.round((stripW - qrSize) / 2);
  const qrY = footerDividerY + 62;

  if (qrImg) {
    // White background card behind QR code with clean border
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
  }

  // QR Captions
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('📷 SCAN TO FOLLOW @creato4.lab', stripW / 2, qrY + qrSize + 16);

  ctx.font = '9px monospace';
  ctx.fillText('instagram.com/creato4.lab', stripW / 2, qrY + qrSize + 28);

  return canvas;
}

// ── BACKEND THERMAL PHOTO OPTIMIZATION CLIENT ──────────────
async function optimizePhotoWithBackend(dataUrl, idx) {
  try {
    const res = await fetch('/api/optimize-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: dataUrl })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.ok && data.optimizedBase64) {
      state.shots[idx] = data.optimizedBase64;
      updateStripFrame(idx, data.optimizedBase64);
      console.log(`✅ Photo ${idx + 1} optimized via backend thermal face engine!`);
    }
  } catch (err) {
    console.warn('Backend optimizer offline, client thermal enhancer active:', err);
  }
}

// ── ADVANCED THERMAL PHOTO ENHANCER (ADAPTIVE TONE & SHARPENING) ──
function enhanceThermalPhoto(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const len = w * h;

  // 1. Convert to luminance & analyze histogram min/max
  const luma = new Float32Array(len);
  let sumLuma = 0;
  for (let i = 0; i < len; i++) {
    const idx = i * 4;
    const val = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
    luma[i] = val;
    sumLuma += val;
  }
  const avgLuma = sumLuma / len;

  // Auto-adapt gamma depending on ambient lighting
  // Dark room: aggressive shadow lift so face details emerge. Overexposed: pull down midtones.
  const gamma = avgLuma < 100 ? 0.72 : (avgLuma > 165 ? 1.15 : 0.82);

  // 2. Contrast stretching (2nd to 98th percentile)
  let minVal = 255, maxVal = 0;
  for (let i = 0; i < len; i += 4) {
    if (luma[i] < minVal) minVal = luma[i];
    if (luma[i] > maxVal) maxVal = luma[i];
  }
  const range = Math.max(20, maxVal - minVal);

  const processed = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let norm = (luma[i] - minVal) / range;
    norm = Math.max(0, Math.min(1, norm));
    // Apply tone curve
    processed[i] = Math.pow(norm, gamma) * 255.0;
  }

  // 3. Unsharp mask (High-pass micro-contrast for eyes, lips, hair)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const center = processed[idx];
      const neighbors = (
        processed[(y-1)*w + x] +
        processed[(y+1)*w + x] +
        processed[y*w + (x-1)] +
        processed[y*w + (x+1)]
      ) * 0.25;
      const edge = center - neighbors;
      // Add edge detail back with 1.4x factor
      let finalVal = center + (edge * 1.4);
      finalVal = Math.max(0, Math.min(255, finalVal));
      const pIdx = idx * 4;
      data[pIdx] = data[pIdx+1] = data[pIdx+2] = Math.round(finalVal);
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// ── SERPENTINE FLOYD-STEINBERG DITHERING (PREVENTS WORM ARTIFACTS) ──
function ditherFloydSteinberg(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const gray = [];
  for (let y = 0; y < height; y++) {
    gray[y] = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      gray[y][x] = 0.299 * data[idx] + 0.587 * data[idx+1] + 0.114 * data[idx+2];
    }
  }

  const bits = [];
  for (let y = 0; y < height; y++) {
    bits[y] = new Uint8Array(width);
    const leftToRight = (y % 2 === 0);

    if (leftToRight) {
      for (let x = 0; x < width; x++) {
        const oldVal = gray[y][x];
        const newVal = oldVal < 128 ? 0 : 255;
        bits[y][x] = newVal === 0 ? 1 : 0; // 1 = black dot, 0 = white paper
        const err = oldVal - newVal;

        if (x + 1 < width)                 gray[y][x+1]     += err * (7/16);
        if (x - 1 >= 0 && y + 1 < height)  gray[y+1][x-1]   += err * (3/16);
        if (y + 1 < height)                gray[y+1][x]     += err * (5/16);
        if (x + 1 < width && y + 1 < height) gray[y+1][x+1] += err * (1/16);
      }
    } else {
      // Serpentine right-to-left scan prevents diagonal streaks
      for (let x = width - 1; x >= 0; x--) {
        const oldVal = gray[y][x];
        const newVal = oldVal < 128 ? 0 : 255;
        bits[y][x] = newVal === 0 ? 1 : 0;
        const err = oldVal - newVal;

        if (x - 1 >= 0)                    gray[y][x-1]     += err * (7/16);
        if (x + 1 < width && y + 1 < height) gray[y+1][x+1] += err * (3/16);
        if (y + 1 < height)                gray[y+1][x]     += err * (5/16);
        if (x - 1 >= 0 && y + 1 < height)  gray[y+1][x-1]   += err * (1/16);
      }
    }
  }

  return { width, height, bits };
}

function buildEscPosBytes(dithered, heatLevel = 9) {
  const { width, height, bits } = dithered;
  const bytesPerRow = Math.ceil(width / 8);
  const bytes = [];

  // FS .: Ensure Chinese mode is off
  bytes.push(0x1C, 0x2E);

  // ESC 7: Set RP203 heating parameters tuned for 57mm thermal paper
  // n1 = 0x04 (32 dots max per pulse) - safe for both 5V 3A and 12V adapters!
  const heatingTime = Math.min(200, 70 + (heatLevel * 10));
  const heatingInterval = 0x28;
  bytes.push(0x1B, 0x37, 0x04, heatingTime, heatingInterval);

  // ESC 3 0: Set line spacing to 0
  bytes.push(0x1B, 0x33, 0x00);

  // Slice image into safe bands of 16 rows so the RP203 RAM FIFO never overflows
  const SLICE_H = 16;
  for (let startY = 0; startY < height; startY += SLICE_H) {
    const curSliceH = Math.min(SLICE_H, height - startY);

    // GS v 0 0 xL xH yL yH
    bytes.push(0x1D, 0x76, 0x30, 0x00);
    bytes.push(bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF);
    bytes.push(curSliceH & 0xFF, (curSliceH >> 8) & 0xFF);

    for (let dy = 0; dy < curSliceH; dy++) {
      const y = startY + dy;
      for (let bx = 0; bx < bytesPerRow; bx++) {
        let b = 0;
        for (let bit = 0; bit < 8; bit++) {
          const px = bx * 8 + bit;
          if (px < width && bits[y] && bits[y][px] === 1) {
            b |= (0x80 >> bit);
          }
        }
        bytes.push(b);
      }
    }
  }

  // Restore standard line spacing
  bytes.push(0x1B, 0x32);
  bytes.push(0x1B, 0x64, 0x06); // Feed 6 lines
  bytes.push(0x1D, 0x56, 0x42, 0x05); // Cut

  return new Uint8Array(bytes);
}

// ══════════════════════════════════════════════════════════════════════════════
// ULTRA-RELIABLE PACED SERIAL TRANSMISSION ENGINE (RP203 / MOD-QC0925 @ 9600)
// Prevents UART buffer overflow, eliminates GBK Chinese glyph parsing, and
// ensures 100% complete printing of receipts & 3-photo strips without stalls.
// ══════════════════════════════════════════════════════════════════════════════

let activeWriter = null;

async function acquireSafeWriter() {
  if (!state.printerPort) {
    await connectPrinterWebSerial();
    if (!state.printerPort) throw new Error('PRINTER_DISCONNECTED');
  }
  // Reuse existing writer (prevents locked stream errors)
  if (state.printerWriter) return state.printerWriter;
  if (activeWriter) return activeWriter;
  try {
    state.printerWriter = state.printerPort.writable.getWriter();
    activeWriter = state.printerWriter;
    return state.printerWriter;
  } catch (err) {
    await wait(60);
    state.printerWriter = state.printerPort.writable.getWriter();
    activeWriter = state.printerWriter;
    return state.printerWriter;
  }
}

function releaseSafeWriter() {
  // Writer kept alive on state.printerWriter for reuse across button clicks
}

// Cancel Chinese/GBK mode — NO reset (reset is what re-enables Chinese on RP203!)
// ESC @ is ONLY sent ONCE at connection time with a 500ms wait.
async function sendHardwareInit(writer) {
  // Send FS . three times in a row — forces exit from GBK/Chinese mode
  await writer.write(new Uint8Array([0x1C, 0x2E])); await wait(40);
  await writer.write(new Uint8Array([0x1C, 0x2E])); await wait(40);
  await writer.write(new Uint8Array([0x1C, 0x2E])); await wait(40);

  // Set charset and font
  await writer.write(new Uint8Array([
    0x1B, 0x74, 0x00, // ESC t 0 : CP437 USA/ASCII code page
    0x1B, 0x52, 0x00, // ESC R 0 : International charset USA
    0x1B, 0x4D, 0x00, // ESC M 0 : Font A
    0x1B, 0x32,       // ESC 2 : Standard line spacing
    0x1B, 0x37, 0x04, 0x8C, 0x28 // ESC 7 : Calibrated 32-dot heat to prevent voltage sag
  ]));
  await wait(60);
}

// 2. Write paced bytes: sends in small chunks with inter-chunk delay
async function writePacedBytes(writer, dataArray, chunkSize = 32, delayMs = 12) {
  const arr = (dataArray instanceof Uint8Array) ? dataArray : new Uint8Array(dataArray);
  for (let i = 0; i < arr.length; i += chunkSize) {
    const chunk = arr.subarray(i, Math.min(i + chunkSize, arr.length));
    await writer.write(chunk);
    await wait(delayMs);
  }
}

// 3. Print paced line for receipts: sends clean line then brief wait
async function printPacedLine(writer, textLine) {
  const fullLine = textLine + '\r\n';
  const bytes = new Uint8Array(fullLine.length);
  for (let i = 0; i < fullLine.length; i++) {
    bytes[i] = fullLine.charCodeAt(i) & 0xFF;
  }
  await writer.write(bytes);
  await wait(45);
}

// ── PRINTING ACTION (READY-MADE ESC/POS DRIVER — ELIMINATES CHINESE TEXT & BUFFER OVERFLOW) ──
function cancelPrinting() {
  state.isPrintCancelled = true;
  const btnCancel = document.getElementById('btn-cancel-print');
  if (btnCancel) {
    btnCancel.disabled = true;
    btnCancel.textContent = 'Stopping print...';
  }
  setFeedback('🛑 Cancelling print...', 'busy');
}

async function loadSampleStripForTesting() {
  const titles = ['📸 SMILE', '✌️ PEACE', '🫶 LOVE'];
  for (let i = 0; i < 3; i++) {
    const c = document.createElement('canvas');
    c.width = 364;
    c.height = 260;
    const ctx = c.getContext('2d');
    ctx.fillStyle = i === 0 ? '#1e293b' : i === 1 ? '#334155' : '#0f172a';
    ctx.fillRect(0, 0, 364, 260);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titles[i], 182, 115);
    ctx.font = '14px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`CREATO 4 • DEMO PHOTO ${i + 1}`, 182, 155);
    state.shots[i] = c.toDataURL('image/jpeg', 0.9);
    updateStripFrame(i, state.shots[i]);
  }
  btnPrint.disabled = false;
  btnDownload.disabled = false;
}

async function doPrint() {
  if (state.customLoadedCanvas) {
    if (!state.printerPort) {
      setFeedback('🔍 Select your USB-to-TTL adapter in the browser popup...');
      try {
        await connectPrinterWebSerial();
      } catch {}
      if (!state.printerPort) {
        setFeedback('❌ Printer not connected yet. Click "Printer Settings" to connect.', 'error');
        openPrinterModal();
        return;
      }
    }
    await printCanvasWithLiveKiosk(state.customLoadedCanvas, state.customLoadedTitle || 'Saved Photo');
    return;
  }

  // If user hasn't taken photos yet, automatically load demo photos so printing works immediately!
  if (!state.shots.some(s => s !== null)) {
    setFeedback('ℹ️ Loading demo photo strip for test print...', 'busy');
    await loadSampleStripForTesting();
  }

  if (!state.printerPort) {
    setFeedback('🔍 Select your USB-to-TTL adapter in the browser popup...');
    try {
      await connectPrinterWebSerial();
    } catch {}
    if (!state.printerPort) {
      setFeedback('❌ Printer not connected yet. Click "Printer Settings" to connect.', 'error');
      openPrinterModal();
      return;
    }
  }

  const canvas = await renderStripCanvas();

  // Automatically record to Prints history
  saveHistoryItem({
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    subtitle: state.currentCaption?.subtitle || 'CREATO 4',
    timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    timestamp: Date.now()
  });

  await printCanvasWithLiveKiosk(canvas, state.currentCaption?.subtitle || 'Photo Strip');
}

// ── CORE ESC/POS THERMAL PRINTING ENGINE WITH LIVE KIOSK ANIMATION ──
async function printCanvasWithLiveKiosk(canvas, jobTitle = 'Photo Strip') {
  if (!state.printerPort) {
    setFeedback('🔍 Select your USB-to-TTL adapter in the browser popup...');
    try {
      await connectPrinterWebSerial();
    } catch {}
    if (!state.printerPort) {
      setFeedback('❌ Printer not connected yet. Click "Printer Settings" to connect.', 'error');
      openPrinterModal();
      return;
    }
  }

  btnPrint.disabled = true;
  state.isPrintCancelled = false;
  setFeedback(`🖨️ Processing ${jobTitle} and preparing thermal strip...`, 'busy');

  const liveOverlay = document.getElementById('live-print-overlay');
  const liveCanvas = document.getElementById('live-print-canvas');
  const progressFill = document.getElementById('print-progress-fill');
  const pctText = document.getElementById('print-pct-text');
  const bytesText = document.getElementById('print-bytes-text');
  const paperChute = document.getElementById('printer-paper-chute');
  const btnCancel = document.getElementById('btn-cancel-print');

  let writer = null;
  try {
    // 1. Generate ESC/POS raster bytes using Floyd-Steinberg ditherer
    const ctx = canvas.getContext('2d');
    const dithered = ditherFloydSteinberg(ctx, canvas.width, canvas.height);
    const encodedBytes = buildEscPosBytes(dithered, state.heatEnergy);

    // Create 1:1 authentic monochrome thermal preview bitmap
    const ditherCanvas = document.createElement('canvas');
    ditherCanvas.width = canvas.width;
    ditherCanvas.height = canvas.height;
    const dCtx = ditherCanvas.getContext('2d');
    const dImgData = dCtx.createImageData(canvas.width, canvas.height);
    for (let p = 0; p < dithered.length; p++) {
      const val = dithered[p]; // 0 = black thermal dot, 255 = blank paper
      const idx = p * 4;
      dImgData.data[idx]     = val;
      dImgData.data[idx + 1] = val;
      dImgData.data[idx + 2] = val;
      dImgData.data[idx + 3] = 255;
    }
    dCtx.putImageData(dImgData, 0, 0);

    // Progressive live thermal print preview renderer
    function updateLiveThermalPreview(percent) {
      if (!liveCanvas) return;
      const lCtx = liveCanvas.getContext('2d');
      const w = liveCanvas.width;
      const h = liveCanvas.height;

      // Clean white thermal paper base
      lCtx.fillStyle = '#ffffff';
      lCtx.fillRect(0, 0, w, h);

      const printedLines = Math.min(h, Math.floor((percent / 100) * h));
      if (printedLines > 0) {
        // Draw real burned thermal dots
        lCtx.drawImage(ditherCanvas, 0, 0, w, printedLines, 0, 0, w, printedLines);

        // Draw active laser/thermal heating head pulse across the paper edge while actively printing
        if (percent > 0 && percent < 100) {
          lCtx.strokeStyle = '#f97316';
          lCtx.lineWidth = 2.5;
          lCtx.beginPath();
          lCtx.moveTo(0, printedLines);
          lCtx.lineTo(w, printedLines);
          lCtx.stroke();
        }
      }

      // Smoothly follow the active printing burn line in paper chute
      if (paperChute) {
        const scale = (liveCanvas.clientWidth || 310) / liveCanvas.width;
        const currentY = printedLines * scale;
        const targetScroll = Math.max(0, currentY - (paperChute.clientHeight / 2));
        paperChute.scrollTop = targetScroll;
      }
    }

    // Setup and display live print kiosk overlay
    if (liveOverlay) {
      liveOverlay.style.display = 'flex';
    }
    if (liveCanvas) {
      liveCanvas.width = canvas.width;
      liveCanvas.height = canvas.height;
      updateLiveThermalPreview(0);
    }
    if (paperChute) {
      paperChute.scrollTop = 0;
    }
    if (progressFill) progressFill.style.width = '0%';
    if (pctText) pctText.textContent = '0%';
    if (bytesText) bytesText.textContent = 'Heating thermal print head...';
    if (btnCancel) {
      btnCancel.disabled = false;
      btnCancel.textContent = '⛔ Cancel Print';
    }

    writer = await acquireSafeWriter();

    // 2. Hardware Reset & Force English Mode (No Chinese)
    await sendHardwareInit(writer);

    // 3. Heating parameter calibrated for paper (safe 32-dot firing)
    const heatingTime = Math.min(200, 70 + (state.heatEnergy * 10));
    await writer.write(new Uint8Array([0x1B, 0x37, 0x04, heatingTime, 0x28]));
    await wait(30);

    const totalBytes = encodedBytes.length;
    let bytesSent = 0;
    setFeedback(`🖨️ Printing ${jobTitle}...`, 'busy');

    // Stream in 32-byte chunks with 25ms delay — prevents RP203 FIFO overflow (causes dots/garbage)
    const CHUNK = 32;
    for (let i = 0; i < totalBytes; i += CHUNK) {
      if (state.isPrintCancelled) {
        throw new Error('PRINT_CANCELLED');
      }

      const chunk = encodedBytes.subarray(i, Math.min(i + CHUNK, totalBytes));
      await writer.write(chunk);
      bytesSent += chunk.length;
      await wait(25);

      const pct = Math.round((bytesSent / totalBytes) * 100);
      if (progressFill) progressFill.style.width = `${pct}%`;
      if (pctText) pctText.textContent = `${pct}%`;
      if (bytesText) bytesText.textContent = `${bytesSent} / ${totalBytes} bytes (${pct}%)`;
      setFeedback(`🖨️ Printing ${jobTitle}... ${pct}%`, 'busy');
      updateLiveThermalPreview(pct);
    }

    updateLiveThermalPreview(100);
    if (progressFill) progressFill.style.width = '100%';
    if (pctText) pctText.textContent = '100%';
    if (bytesText) bytesText.textContent = 'Print Complete!';
    if (btnCancel) {
      btnCancel.textContent = '🎉 Done / Close';
    }

    setFeedback(`🎉 "${jobTitle}" printed successfully! Collect your print from the RP203.`, 'success');
    await wait(2200);
    if (liveOverlay) liveOverlay.style.display = 'none';
  } catch (err) {
    if (err.message === 'PRINT_CANCELLED') {
      console.warn('Printing was cancelled by the user.');
      setFeedback('🛑 Print cancelled by user.', 'error');
      if (bytesText) bytesText.textContent = 'Stopped / Cancelled';
      try {
        if (writer) {
          await writer.write(new Uint8Array([0x1B, 0x64, 0x03])); // Feed 3 lines
        }
      } catch {}
      await wait(1200);
      if (liveOverlay) liveOverlay.style.display = 'none';
    } else {
      console.error('Print failed:', err);
      setFeedback('❌ Print error: ' + err.message, 'error');
      if (liveOverlay) liveOverlay.style.display = 'none';
    }
  } finally {
    releaseSafeWriter();
    btnPrint.disabled = false;
  }
}

// ── WEB SERIAL CONNECTION (Simple, 9600 baud, no flow control) ────────
async function connectPrinterWebSerial(preselectedPort = null) {
  if (!('serial' in navigator)) {
    alert('Please open this app in Google Chrome or Microsoft Edge (not Safari). Web Serial is required.');
    return;
  }

  // If already connected — toggle disconnect
  if (state.printerPort && !preselectedPort) {
    try {
      if (state.printerWriter) { try { state.printerWriter.releaseLock(); } catch {} state.printerWriter = null; }
      activeWriter = null;
      await state.printerPort.close();
    } catch {}
    state.printerPort = null;
    updatePrinterUI(false);
    setFeedback('🔌 Printer disconnected.');
    return;
  }

  try {
    let port = preselectedPort;
    if (!port) {
      setFeedback('🔍 Select your USB-TTL adapter from the popup...');
      port = await navigator.serial.requestPort();
    }

    // Simple open: 9600 baud, 8-N-1, no flow control
    try {
      await port.open({ baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none', flowControl: 'none' });
    } catch (e) {
      if (!e.message.includes('already open')) throw e;
    }

    state.printerPort = port;

    // Assert DTR (user has DTR pin wired to TTL adapter)
    try { await port.setSignals({ dataTerminalReady: true, requestToSend: true }); } catch {}

    // Get writer
    try {
      state.printerWriter = port.writable.getWriter();
      activeWriter = state.printerWriter;
    } catch {}

    // ONE-TIME reset at connect: ESC @ then wait 500ms for MCU to finish booting
    // Then cancel Chinese mode 3x AFTER the full boot completes
    setFeedback('🔄 Initialising printer (cancelling Chinese mode)...', 'busy');
    try {
      await state.printerWriter.write(new Uint8Array([0x1B, 0x40]));
      await wait(550);  // RP203 needs ~500ms to fully reset
      for (let k = 0; k < 3; k++) {
        await state.printerWriter.write(new Uint8Array([0x1C, 0x2E]));
        await wait(35);
      }
      await state.printerWriter.write(new Uint8Array([
        0x1B, 0x74, 0x00, // ESC t 0 : CP437 USA
        0x1B, 0x52, 0x00, // ESC R 0 : USA charset
        0x1B, 0x4D, 0x00, // ESC M 0 : Font A
        0x1B, 0x32,       // ESC 2 : Standard spacing
        0x1B, 0x37, 0x04, 0x8C, 0x28 // ESC 7 : Calibrated 32-dot heat (safe current)
      ]));
      await wait(80);
    } catch {}

    updatePrinterUI(true);
    setFeedback('✅ RP203 Connected — Chinese mode OFF. Ready to print!', 'success');
  } catch (err) {
    if (err.name !== 'NotFoundError') {
      setFeedback('❌ Connection failed: ' + err.message, 'error');
    }
  }
}

function updatePrinterUI(connected) {
  if (quickDot) quickDot.className = 'status-indicator-dot ' + (connected ? 'connected' : 'disconnected');
  if (quickText) quickText.textContent = connected ? 'RP203 Connected (9600)' : 'Printer Disconnected';
  if (modalDot) modalDot.className = 'status-indicator-dot ' + (connected ? 'connected' : 'disconnected');
  if (modalStatusText) modalStatusText.innerHTML = connected
    ? '<strong>✅ RP203 Connected @ 9600 Baud — Ready to Print!</strong>'
    : '<strong>Printer Disconnected</strong>';
  if (btnModalConnect) {
    btnModalConnect.textContent = connected ? '🔴 Disconnect Printer' : '🔌 Connect Printer (9600 Baud)';
    btnModalConnect.classList.toggle('connected', connected);
  }
}

// ── FEED BLANK PAPER ONLY (NO HEATING - TESTS MOTOR & COMMUNICATION) ──
async function feedPaperOnly() {
  setFeedback('📜 Feeding blank paper...', 'busy');
  let writer = null;
  try {
    writer = await acquireSafeWriter();
    await sendHardwareInit(writer);
    await writePacedBytes(writer, new Uint8Array([
      0x1B, 0x32,       // ESC 2 Restore standard 30-dot line spacing
      0x1B, 0x64, 0x06  // ESC d 6: Advance 6 lines of blank paper
    ]), 8, 15);
    await wait(200);
    setFeedback('✅ Paper feed sent! Motor is working properly.', 'success');
  } catch (err) {
    if (err.message === 'PRINTER_DISCONNECTED') {
      setFeedback('❌ Printer is Disconnected! Click the big "Select Printer & Connect" button above.', 'error');
    } else {
      setFeedback('❌ Feed failed: ' + err.message, 'error');
    }
  } finally {
    releaseSafeWriter();
  }
}

// ── FACTORY SELF-TEST PRINT (DC2 T — HARDWARE FIRMWARE DIAGNOSTIC) ──
async function runHardwareSelfTest() {
  setFeedback('⚙️ Requesting RP203 factory hardware self-test (DC2 T)...', 'busy');
  let writer = null;
  try {
    writer = await acquireSafeWriter();
    await sendHardwareInit(writer);
    // DC2 T (0x12 0x54) — triggers the printer MCU's internal factory self-test printout
    await writePacedBytes(writer, new Uint8Array([0x12, 0x54]), 2, 20);
    await wait(500);
    setFeedback('✅ Factory self-test sent (DC2 T)! RP203 should print its internal spec sheet.', 'success');
  } catch (err) {
    if (err.message === 'PRINTER_DISCONNECTED') {
      setFeedback('❌ Printer is Disconnected! Click the big "Select Printer & Connect" button above.', 'error');
    } else {
      setFeedback('❌ Self-test error: ' + err.message, 'error');
    }
  } finally {
    releaseSafeWriter();
  }
}

// ── TEST IMAGE GENERATOR (CAMERA ICON, HIGH CONTRAST BANNER, DITHER RAMP) ──
function generateTestImageCanvas() {
  const w = 384;
  const h = 180;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Solid white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  // Outer border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  // Top header banner (Inverted solid black bar with white text)
  ctx.fillStyle = '#000000';
  ctx.fillRect(7, 7, w - 14, 32);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★ RP203 THERMAL TEST ★', w / 2, 29);

  // Subtitle
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('PHOTO BOOTH CREATO 4', w / 2, 60);

  // Camera Outline Graphic
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  // Camera body
  ctx.strokeRect((w / 2) - 32, 68, 64, 38);
  // Lens outer
  ctx.beginPath();
  ctx.arc(w / 2, 87, 13, 0, Math.PI * 2);
  ctx.stroke();
  // Lens pupil
  ctx.beginPath();
  ctx.arc(w / 2, 87, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
  // Flash bump
  ctx.fillRect((w / 2) - 22, 64, 14, 4);

  // Grayscale & Dither Calibration Ramp (5 test density blocks)
  const blockW = 42;
  const blockH = 16;
  const startX = (w - (blockW * 5 + 16)) / 2;
  const rampY = 114;
  const grays = [0.2, 0.4, 0.6, 0.8, 1.0];
  for (let b = 0; b < 5; b++) {
    const val = Math.round(255 * (1 - grays[b]));
    ctx.fillStyle = `rgb(${val},${val},${val})`;
    ctx.fillRect(startX + (b * (blockW + 4)), rampY, blockW, blockH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(startX + (b * (blockW + 4)), rampY, blockW, blockH);
  }

  // Footer status
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('HEAD: 384 DOTS • 203 DPI • OK', w / 2, 150);

  // Dither date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  ctx.font = '10px monospace';
  ctx.fillText(dateStr + ' • 57MM CUBIC PAPER', w / 2, 166);

  return canvas;
}

function renderTestImagePreview() {
  const previewCanvas = document.getElementById('test-image-preview');
  if (!previewCanvas) return;
  const testCanvas = generateTestImageCanvas();
  previewCanvas.width = testCanvas.width;
  previewCanvas.height = testCanvas.height;
  const ctx = previewCanvas.getContext('2d');
  ctx.drawImage(testCanvas, 0, 0);
}

// ── TEST IMAGE PRINT ACTION (USING READY-MADE POS DRIVER) ──
async function runTestImagePrint() {
  setFeedback('🖼️ Printing graphic test image...', 'busy');
  let writer = null;
  try {
    writer = await acquireSafeWriter();

    // 1. Hardware Reset & Force English Mode (No Chinese)
    await sendHardwareInit(writer);

    // 2. Set heating parameter (safe 32-dot firing)
    const heatingTime = Math.min(200, 70 + (state.heatEnergy * 10));
    await writer.write(new Uint8Array([0x1B, 0x37, 0x04, heatingTime, 0x28]));
    await wait(40);

    // 3. Generate test image - use our own reliable ditherer
    const canvas = generateTestImageCanvas();
    const ctx = canvas.getContext('2d');
    const dithered = ditherFloydSteinberg(ctx, canvas.width, canvas.height);
    const encodedBytes = buildEscPosBytes(dithered, state.heatEnergy);

    setFeedback('🖼️ Sending test image...', 'busy');

    // 32-byte chunks, 25ms delay — prevents FIFO overflow and garbled dots
    const CHUNK = 32;
    for (let i = 0; i < encodedBytes.length; i += CHUNK) {
      const chunk = encodedBytes.subarray(i, Math.min(i + CHUNK, encodedBytes.length));
      await writer.write(chunk);
      await wait(25);

      const pct = Math.round((Math.min(i + CHUNK, encodedBytes.length) / encodedBytes.length) * 100);
      setFeedback(`🖼️ Test image... ${pct}%`, 'busy');
    }

    await wait(300);
    setFeedback('✅ Test image printed! Check camera icon & grayscale ramp on paper.', 'success');
  } catch (err) {
    if (err.message === 'PRINTER_DISCONNECTED') {
      setFeedback('❌ Printer is Disconnected! Click the big "Select Printer & Connect" button above.', 'error');
    } else {
      setFeedback('❌ Test image error: ' + err.message, 'error');
    }
  } finally {
    releaseSafeWriter();
  }
}

// ── TEST 10CM FAKE RECEIPT (CRISP CP437 ASCII + REALISTIC RETAIL LAYOUT) ──
async function runTestPrint() {
  setFeedback('🧾 Printing authentic 10cm test receipt...', 'busy');
  let writer = null;
  try {
    writer = await acquireSafeWriter();

    // 1. Hardware Reset & Cancel Chinese Character Mode
    await sendHardwareInit(writer);

    // 2. Build Authentic ~10cm Retail Receipt (Strict 32 chars/line - zero wrapping)
    const now = new Date();
    const dStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase();
    const tStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const orderNum = Math.floor(100000 + Math.random() * 900000);

    const padLine32 = (str) => {
      const s = String(str);
      return s.length >= 32 ? s.slice(0, 32) : s.padEnd(32);
    };

    const lines = [
      '================================',
      '          PHOTO BOOTH           ',
      '           CREATO 4             ',
      '      OFFICIAL TAX RECEIPT      ',
      '================================',
      padLine32(`DATE: ${dStr}       TIME: ${tStr}`),
      'STATION : BOOTH-04  TERM: RP203 ',
      padLine32(`TXN ID  : #CR4-${orderNum}`),
      'CASHIER : SELF-SERVICE AUTO     ',
      '--------------------------------',
      'ITEM                 QTY   PRICE',
      '--------------------------------',
      '3-PHOTO STRIP         1    $3.50',
      'HD THERMAL DITHER     1    $0.75',
      'CUBIC 55GSM PAPER     1    $0.75',
      '--------------------------------',
      'SUBTOTAL                   $5.00',
      'SALES TAX (0.00%)          $0.00',
      '--------------------------------',
      'TOTAL                      $5.00',
      '--------------------------------',
      'PAID VIA: CASH / CARD      $5.00',
      'CHANGE DUE                 $0.00',
      '--------------------------------',
      'DEVICE DIAGNOSTICS:             ',
      padLine32(`* SERIAL SPEED : ${state.baudRate} BPS`),
      '* HEAD WIDTH   : 384 DOTS (48MM)',
      '* CHINESE MODE : DISABLED (FS .)',
      '* FEED LENGTH  : 10CM / 100MM OK',
      '--------------------------------',
      '        HAVE A NICE DAY!        ',
      '  PRINCE TAGADIYA • CREATO4 LAB ',
      '    THANK YOU FOR VISITING!     ',
      '================================'
    ];

    // Print line by line with 45ms pacing so buffer never overflows
    for (let i = 0; i < lines.length; i++) {
      await printPacedLine(writer, lines[i]);
      const pct = Math.round(((i + 1) / lines.length) * 100);
      setFeedback(`🧾 Printing 10cm receipt... ${pct}%`, 'busy');
    }

    // 3. Feed blank paper & cut
    await writePacedBytes(writer, new Uint8Array([
      0x1B, 0x64, 0x05,       // ESC d 5: Feed 5 lines
      0x1D, 0x56, 0x42, 0x05, // Cut
      0x1B, 0x32              // Preserve standard line spacing
    ]), 8, 15);
    await wait(300);

    setFeedback('✅ 10cm test receipt printed! Verify clean English text on paper.', 'success');
  } catch (err) {
    if (err.message === 'PRINTER_DISCONNECTED') {
      setFeedback('❌ Printer is Disconnected! Click the big "Select Printer & Connect" button above.', 'error');
    } else {
      setFeedback('❌ Test failed: ' + err.message, 'error');
    }
  } finally {
    releaseSafeWriter();
  }
}

// ── CALIBRATION STRIP VIA WEB SERIAL (32-COL RULER + FONTS + SAFE RASTER) ──
async function runCalibrationWebSerial() {
  setFeedback('📐 Printing 32-column hardware calibration strip...', 'busy');
  let writer = null;
  try {
    writer = await acquireSafeWriter();

    // 1. Send hardware init & clear Chinese mode
    await sendHardwareInit(writer);

    const line = async (txt = '') => {
      const truncated = txt.length > 32 ? txt.slice(0, 32) : txt;
      await printPacedLine(writer, truncated);
    };

    await line('================================');
    await line('    RP203 CALIBRATION STRIP     ');
    await line('    WEB SERIAL 9600 BAUD OK     ');
    await line('================================');
    await line('');
    await line('-- POWER & STATUS --');
    await line('Config: Dots=32 Heat=1400us');
    await line('Status: 5V 3A Profile ACTIVE');
    await line('');
    await line('-- COLUMN WIDTH RULER (32) --');
    await line('         1         2         3  ');
    await line('12345678901234567890123456789012');
    await line('32 CHAR: [12345678901234567890]');
    await line('');
    await line('-- FONT TEST --');
    await line('Font A (Standard 12x24): ABC123');
    await writer.write(new Uint8Array([0x1B, 0x4D, 0x01])); // Font B
    await wait(40);
    await line('Font B (Compressed 9x17): ABC123');
    await writer.write(new Uint8Array([0x1B, 0x4D, 0x00])); // Restore Font A
    await wait(40);
    await writer.write(new Uint8Array([0x1B, 0x21, 0x20])); // Double width
    await line('Double Width');
    await writer.write(new Uint8Array([0x1B, 0x21, 0x10])); // Double height
    await line('Double Height');
    await writer.write(new Uint8Array([0x1B, 0x21, 0x30])); // Big
    await line('BIG FONT');
    await writer.write(new Uint8Array([0x1B, 0x21, 0x00])); // Normal
    await wait(40);
    await line('');
    await line('-- RASTER GRAPHICS (SAFE) --');

    // 48 bytes (384 dots) x 16 rows safe 50% checkerboard dither
    const W = 48;
    const rasterRows = 16;
    const raster = [0x1B, 0x33, 0x00, 0x1D, 0x76, 0x30, 0x00, W & 0xFF, (W >> 8) & 0xFF, rasterRows & 0xFF, (rasterRows >> 8) & 0xFF];
    for (let y = 0; y < rasterRows; y++) {
      for (let x = 0; x < W; x++) {
        raster.push((y % 2 === 0) ? 0xAA : 0x55);
      }
    }
    raster.push(0x1B, 0x32); // Restore default line spacing
    await writePacedBytes(writer, new Uint8Array(raster), 32, 20);
    await wait(100);

    await line('');
    await writer.write(new Uint8Array([0x1B, 0x61, 0x01])); // Center
    await wait(40);
    await line('*** CALIBRATION SUCCESS ***');
    await line('RP203 READY FOR PHOTO BOOTH');
    await writer.write(new Uint8Array([0x1B, 0x61, 0x00])); // Left
    await wait(40);

    // Feed blank lines & cut
    await writePacedBytes(writer, new Uint8Array([
      0x1B, 0x64, 0x06,       // ESC d 6 Feed 6 lines
      0x1D, 0x56, 0x42, 0x05  // Cut
    ]), 8, 15);
    await wait(300);

    setFeedback('✅ Calibration strip printed cleanly via Web Serial!', 'success');
  } catch (err) {
    if (err.message === 'PRINTER_DISCONNECTED') {
      setFeedback('❌ Printer is Disconnected! Click "Connect Printer" first.', 'error');
    } else {
      setFeedback('❌ Calibration error: ' + err.message, 'error');
    }
  } finally {
    releaseSafeWriter();
  }
}

// ── TEST BLACK BOX (THERMAL BURN TEST — USING GS v 0 RASTER) ──
async function runBlackBoxTest() {
  setFeedback('⬛ Testing thermal burn (Solid Black Box)...', 'busy');
  let writer = null;
  try {
    writer = await acquireSafeWriter();

    // 1. Reset, Cancel Chinese, Zero Line Spacing, Safe 32-dot heating
    await sendHardwareInit(writer);
    await writePacedBytes(writer, new Uint8Array([
      0x1B, 0x33, 0x00,             // ESC 3 0 Zero line spacing
      0x1B, 0x37, 0x04, 0x96, 0x28  // ESC 7: Heating dots 32, Heating time 150 (1.5ms)
    ]), 8, 10);
    await wait(40);

    // 2. Build and stream solid black bar in safe 8-row slices
    const widthBytes = 48; // 384 dots / 8
    const totalBarRows = 48;
    const SLICE = 8;

    for (let r = 0; r < totalBarRows; r += SLICE) {
      const sliceRows = Math.min(SLICE, totalBarRows - r);
      const barSlice = [];
      barSlice.push(0x1D, 0x76, 0x30, 0x00);
      barSlice.push(widthBytes & 0xFF, (widthBytes >> 8) & 0xFF);
      barSlice.push(sliceRows & 0xFF, (sliceRows >> 8) & 0xFF);

      for (let y = 0; y < sliceRows; y++) {
        for (let x = 0; x < widthBytes; x++) barSlice.push(0xFF);
      }
      await writePacedBytes(writer, new Uint8Array(barSlice), 16, 12);
      await wait(45);
    }

    // 3. Checkerboard slice (16 rows in two 8-row slices)
    for (let s = 0; s < 2; s++) {
      const checkerSlice = [];
      checkerSlice.push(0x1D, 0x76, 0x30, 0x00);
      checkerSlice.push(widthBytes & 0xFF, (widthBytes >> 8) & 0xFF);
      checkerSlice.push(8 & 0xFF, 0x00);
      for (let y = 0; y < 8; y++) {
        const p = ((s * 8 + y) % 2 === 0) ? 0xAA : 0x55;
        for (let x = 0; x < widthBytes; x++) checkerSlice.push(p);
      }
      await writePacedBytes(writer, new Uint8Array(checkerSlice), 16, 12);
      await wait(45);
    }

    // 4. Feed blank lines & restore spacing
    await writePacedBytes(writer, new Uint8Array([
      0x1B, 0x32,             // ESC 2
      0x1B, 0x64, 0x06,       // ESC d 6 Feed 6 lines
      0x1D, 0x56, 0x42, 0x05  // Cut
    ]), 8, 15);
    await wait(300);

    setFeedback('⬛ Black box sent! A solid black bar should print cleanly.', 'success');
  } catch (err) {
    if (err.message === 'PRINTER_DISCONNECTED') {
      setFeedback('❌ Printer is Disconnected! Click the big "Select Printer & Connect" button above.', 'error');
    } else {
      setFeedback('❌ Black box test error: ' + err.message, 'error');
    }
  } finally {
    releaseSafeWriter();
  }
}

// 1-Click Baud Rate Switcher & Reconnect
async function switchBaudRate(newBaud) {
  state.baudRate = parseInt(newBaud);
  baudInput.value = String(newBaud);

  if (state.printerPort) {
    setFeedback(`Switching to ${newBaud} baud...`);
    try {
      const existingPort = state.printerPort;
      await existingPort.close();
      state.printerPort = null;
      updatePrinterUI(false);
      await wait(300);
      await connectPrinterWebSerial(existingPort);
      setFeedback(`✅ Switched to ${newBaud} baud! Try Test Print now.`);
    } catch (e) {
      setFeedback(`Reconnecting at ${newBaud} baud: ` + e.message);
    }
  } else {
    setFeedback(`Baud set to ${newBaud}. Now click Connect.`);
  }
}

// ── AUTO BAUD TEST (Tests 9600, 19200, 38400 to find which prints clean English) ──
async function runAutoBaudSweep() {
  if (!state.printerPort) {
    setFeedback('❌ Please connect printer first!', 'error');
    return;
  }

  const testSpeeds = [9600, 19200, 38400, 115200];
  const port = state.printerPort;

  for (const speed of testSpeeds) {
    setFeedback(`⚡ Testing speed ${speed} baud...`, 'busy');
    try {
      if (state.printerPort) {
        try {
          if (activeWriter) { activeWriter.releaseLock(); activeWriter = null; }
          await port.close();
        } catch {}
      }
      await wait(250);
      await port.open({ baudRate: speed, dataBits: 8, stopBits: 1, parity: 'none' });
      state.baudRate = speed;
      baudInput.value = String(speed);
      updatePrinterUI(true);

      const writer = port.writable.getWriter();
      try {
        // Send reset, cancel Chinese mode, force CP437 ASCII
        await writer.write(new Uint8Array([0x1B, 0x40, 0x1C, 0x2E, 0x1B, 0x74, 0x00, 0x1B, 0x32]));
        await wait(60);

        const testMsg = `\r\n>>> SPEED: ${speed} BAUD TEST <<<\r\nIF YOU CAN READ THIS CLEARLY, USE ${speed}!\r\n--------------------------------\r\n`;
        const testBytes = new Uint8Array(testMsg.length);
        for (let j = 0; j < testMsg.length; j++) testBytes[j] = testMsg.charCodeAt(j) & 0xFF;
        await writer.write(testBytes);
        await wait(200);
      } finally {
        writer.releaseLock();
      }
      await wait(800);
    } catch (e) {
      console.warn(`Speed ${speed} failed:`, e);
    }
  }

  setFeedback('🏁 Sweep complete! Look at your paper: which speed printed clean English text? Select that baud rate.', 'success');
}

// ── SAVE JPG STRIP ──────────────────────────────────────────
async function saveStripJpg() {
  setFeedback('⏳ Generating strip image...');
  let canvas;
  if (state.customLoadedCanvas) {
    canvas = state.customLoadedCanvas;
  } else {
    canvas = await renderStripCanvas();
    // Record to history
    saveHistoryItem({
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      subtitle: state.currentCaption?.subtitle || 'CREATO 4',
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    });
  }

  const a = document.createElement('a');
  a.download = `photobooth-strip-${Date.now()}.jpg`;
  a.href = canvas.toDataURL('image/jpeg', 0.95);
  a.click();
  setFeedback('✅ Photo strip saved to your computer and recorded in History!');
}

// ── MODALS & HELPERS ────────────────────────────────────────
function openPrinterModal() {
  document.getElementById('printer-modal').style.display = 'flex';
  setTimeout(renderTestImagePreview, 50);
}
function closePrinterModal() {
  document.getElementById('printer-modal').style.display = 'none';
}
function openGuideModal() {
  document.getElementById('guide-modal').style.display = 'flex';
}
function closeGuideModal() {
  document.getElementById('guide-modal').style.display = 'none';
}
function closeModalOnOverlay(e, modalId) {
  if (e.target.id === modalId) {
    document.getElementById(modalId).style.display = 'none';
  }
}

function setFeedback(msg, type = 'info') {
  if (feedbackStatus) feedbackStatus.innerHTML = msg;
  const modalBanner = document.getElementById('modal-feedback-banner');
  if (modalBanner) {
    modalBanner.style.display = 'block';
    modalBanner.innerHTML = msg;
    modalBanner.className = 'modal-feedback-banner ' + type;
  }
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function beep(freq, duration) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (duration / 1000));
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (duration / 1000));
  } catch {}
}

// ── RECENT PRINTS HISTORY & SAVED IMAGES PRINT ENGINE ────────
const HISTORY_STORAGE_KEY = 'rp203_strip_history';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistoryItem(item) {
  try {
    let hist = getHistory();
    // Prevent duplicate entries saved within 2 seconds
    if (hist.length > 0 && Math.abs(hist[0].timestamp - item.timestamp) < 2000) {
      return;
    }
    hist.unshift(item);
    hist = hist.slice(0, 12); // Retain up to 12 photo strips for easy re-printing
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(hist));
    renderHistoryUI();
  } catch (e) {
    console.warn('Failed to save strip to history:', e);
  }
}

function clearHistory() {
  localStorage.removeItem(HISTORY_STORAGE_KEY);
  renderHistoryUI();
  setFeedback('🗑️ History cleared.');
}

function renderHistoryUI() {
  const container = document.getElementById('history-cards-row');
  if (!container) return;
  const hist = getHistory();

  if (hist.length === 0) {
    container.innerHTML = `
      <div class="history-empty-box">
        <span class="history-empty-icon">📸</span>
        <p>No saved strips yet. Take photos or open an old saved image to print!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = hist.map((item, idx) => `
    <div class="history-card" id="hist-card-${idx}">
      <div class="hist-thumb-wrap">
        <img src="${item.dataUrl}" alt="Photo Strip ${idx + 1}" class="hist-thumb-img" />
        <span class="hist-badge">#${idx + 1}</span>
      </div>
      <div class="hist-info">
        <div>
          <div class="hist-title">${escapeHtml(item.subtitle || 'Photo Strip')}</div>
          <div class="hist-time">🕒 ${escapeHtml(item.timeStr || 'Recently')}</div>
        </div>
        <div class="hist-actions">
          <button class="btn-hist-reprint" onclick="reprintFromHistory(${idx})" title="Directly print to RP203 thermal printer">🖨️ Print Now</button>
          <button class="btn-hist-load" onclick="loadHistoryItemToBooth(${idx})" title="Preview in Photo Booth">👁️ Load</button>
          <a class="btn-hist-download" href="${item.dataUrl}" download="strip_${item.timestamp || Date.now()}.jpg" title="Save this photo strip to disk">💾 Save</a>
        </div>
      </div>
    </div>
  `).join('');
}

// ── REPRINT DIRECTLY FROM SAVED HISTORY ─────────────────────
async function reprintFromHistory(idx) {
  const hist = getHistory();
  if (!hist[idx]) return;
  const item = hist[idx];
  setFeedback(`🖨️ Re-printing strip from history ("${item.subtitle}")...`, 'busy');

  const img = new Image();
  img.onload = async () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Use full live visual kiosk overlay and calibrated safe 32-dot printing
    await printCanvasWithLiveKiosk(c, item.subtitle || 'Saved Photo');
  };
  img.src = item.dataUrl;
}

// ── LOAD SAVED HISTORY ITEM TO BOOTH PREVIEW ────────────────
function loadHistoryItemToBooth(idx) {
  const hist = getHistory();
  if (!hist[idx]) return;
  const item = hist[idx];
  loadCustomSavedImage(item.dataUrl, item.subtitle || `History Strip #${idx + 1}`);
}

// ── FILE PICKER: OPEN ANY OLD SAVED IMAGE OR STRIP TO PRINT ─
function handleSavedStripFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').toUpperCase();
    loadCustomSavedImage(e.target.result, cleanTitle);
  };
  reader.readAsDataURL(file);
  event.target.value = ''; // Reset input so same file can be re-selected
}

// ── LOAD & PREPARE ANY CUSTOM SAVED IMAGE FOR PRINTING ─────
async function loadCustomSavedImage(dataUrl, title = 'SAVED PHOTO') {
  setFeedback('📂 Loading saved image to photo booth...', 'busy');
  const img = new Image();
  img.onload = () => {
    // Calibrated for standard RP203 384-dot wide continuous thermal roll
    const targetW = 384;
    const targetH = Math.max(120, Math.round(img.height * (targetW / img.width)));

    const c = document.createElement('canvas');
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext('2d');

    // Clean white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    state.customLoadedCanvas = c;
    state.customLoadedTitle = title;

    // Show preview on screen
    renderCustomLoadedPreview(dataUrl, title);

    // Save into history pool so user can reprint anytime
    saveHistoryItem({
      dataUrl: dataUrl,
      subtitle: title,
      timeStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timestamp: Date.now()
    });

    if (btnPrint) btnPrint.disabled = false;
    if (btnDownload) {
      btnDownload.disabled = false;
      btnDownload.onclick = saveStripJpg;
    }

    setFeedback(`✅ "${title}" loaded! Ready to print. Click "🖨️ Print Photo Strip" to print now.`, 'success');
  };
  img.onerror = () => {
    setFeedback('❌ Could not read the selected image file. Please choose a valid JPG or PNG.', 'error');
  };
  img.src = dataUrl;
}

// ── RENDER CUSTOM LOADED SAVED IMAGE PREVIEW IN THE STRIP ───
function renderCustomLoadedPreview(dataUrl, title) {
  const stripPreview = document.getElementById('strip-preview');
  if (!stripPreview) return;

  let customWrap = document.getElementById('custom-strip-preview-wrap');
  if (!customWrap) {
    customWrap = document.createElement('div');
    customWrap.id = 'custom-strip-preview-wrap';
    customWrap.className = 'custom-strip-preview-wrap';
    const footer = stripPreview.querySelector('.strip-bottom-footer');
    if (footer) {
      stripPreview.insertBefore(customWrap, footer);
    } else {
      stripPreview.appendChild(customWrap);
    }
  }

  // Hide 3 standard shot frames
  const frames = stripPreview.querySelectorAll('.strip-frame');
  frames.forEach(f => f.style.display = 'none');

  customWrap.style.display = 'block';
  customWrap.innerHTML = `
    <div class="custom-strip-badge">
      <span>📂 Saved Photo Loaded</span>
      <button class="btn-clear-custom" onclick="clearCustomLoadedImage()" title="Return to 3-photo booth mode">✕ Close</button>
    </div>
    <img src="${dataUrl}" alt="${escapeHtml(title)}" class="custom-strip-loaded-img" />
    <div style="font-size:11px; font-weight:700; color:#475569; text-align:center; padding: 4px 0;">${escapeHtml(title)}</div>
  `;
}

// ── CLEAR CUSTOM SAVED IMAGE & RETURN TO 3-PHOTO BOOTH ─────
function clearCustomLoadedImage() {
  state.customLoadedCanvas = null;
  state.customLoadedTitle = null;

  const customWrap = document.getElementById('custom-strip-preview-wrap');
  if (customWrap) customWrap.style.display = 'none';

  const stripPreview = document.getElementById('strip-preview');
  if (stripPreview) {
    const frames = stripPreview.querySelectorAll('.strip-frame');
    frames.forEach(f => f.style.display = 'block');
  }

  if (btnDownload) {
    btnDownload.onclick = saveStripJpg;
  }
}



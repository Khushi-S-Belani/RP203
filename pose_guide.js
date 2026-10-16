/**
 * ============================================================
 * SnapBooth Custom Photobooth Pose Guide Engine
 * ------------------------------------------------------------
 * Powered by MediaPipe Pose Landmarker (@mediapipe/tasks-vision)
 * 
 * - Camera -> Pose Guide -> User Matches Pose -> Auto Countdown -> Photo
 * - Premium AR-style translucent silhouette mannequin (NO stick figures/skeletons)
 * - Body-relative normalization (distance-invariant pose comparison)
 * - State machine: IDLE -> CAMERA_READY -> POSE_DETECTED -> POSITIONING -> 
 *                  POSE_MATCHED -> HOLD_STILL -> COUNTDOWN -> CAPTURE -> PREVIEW
 * - Configurable thresholds, temporal landmark smoothing, debug HUD
 * ============================================================
 */

(function (window) {
  'use strict';

  // ── CONFIGURABLE CONSTANTS ──────────────────────────────────
  const CONFIG = {
    DEBUG_POSE: false,                   // Developer debug HUD & landmarks
    POSE_MATCH_THRESHOLD: 0.80,          // Similarity threshold for "Perfect!" (0.0 - 1.0)
    POSE_NEAR_THRESHOLD: 0.62,           // Threshold for "Almost there" (yellow)
    POSE_STABILITY_DURATION: 750,        // ms required to remain stable before countdown
    COUNTDOWN_DURATION: 3,               // seconds for countdown
    RENDER_MODE: 'SILHOUETTE',           // 'SILHOUETTE' (translucent filled) | 'CONTOUR' (outline only)
    EMA_ALPHA: 0.65,                     // Landmark smoothing factor (0 = max smooth, 1 = raw)
    WASM_PATH: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    WASM_CDN_FALLBACK: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
    MODEL_PATH: './pose_landmarker_lite.task'
  };

  // ── REUSABLE TARGET POSE PRESETS ────────────────────────────
  // Defined in normalized screen coordinates (0.0 to 1.0)
  // Designed specifically for photobooths (natural, fun, highly recognizable)
  const POSE_PRESETS = {
    classic: {
      id: 'classic',
      name: 'Smile & Head Tilt',
      subtitle: 'Pose 1: Tilt Head & Smile 😊',
      gesture: 'hipHand',
      landmarks: {
        nose:          { x: 0.52, y: 0.25 },
        leftShoulder:  { x: 0.36, y: 0.42 },
        rightShoulder: { x: 0.64, y: 0.41 },
        leftElbow:     { x: 0.26, y: 0.58 },
        rightElbow:    { x: 0.70, y: 0.58 },
        leftWrist:     { x: 0.36, y: 0.68 },
        rightWrist:    { x: 0.68, y: 0.76 },
        leftHip:       { x: 0.40, y: 0.74 },
        rightHip:      { x: 0.60, y: 0.74 }
      }
    },

    peace: {
      id: 'peace',
      name: 'Peace Sign',
      subtitle: 'Pose 2: Peace Sign ✌️ by Cheek',
      gesture: 'peace',
      landmarks: {
        nose:          { x: 0.49, y: 0.25 },
        leftShoulder:  { x: 0.36, y: 0.42 },
        rightShoulder: { x: 0.64, y: 0.42 },
        leftElbow:     { x: 0.28, y: 0.46 },
        rightElbow:    { x: 0.70, y: 0.58 },
        leftWrist:     { x: 0.33, y: 0.28 },
        rightWrist:    { x: 0.68, y: 0.76 },
        leftHip:       { x: 0.40, y: 0.74 },
        rightHip:      { x: 0.60, y: 0.74 }
      }
    },

    heartHands: {
      id: 'heartHands',
      name: 'Heart Hands',
      subtitle: 'Pose 3: Heart 🫶 at Chest',
      gesture: 'heart',
      landmarks: {
        nose:          { x: 0.50, y: 0.25 },
        leftShoulder:  { x: 0.36, y: 0.42 },
        rightShoulder: { x: 0.64, y: 0.42 },
        leftElbow:     { x: 0.31, y: 0.52 },
        rightElbow:    { x: 0.69, y: 0.52 },
        leftWrist:     { x: 0.45, y: 0.48 },
        rightWrist:    { x: 0.55, y: 0.48 },
        leftHip:       { x: 0.40, y: 0.74 },
        rightHip:      { x: 0.60, y: 0.74 }
      }
    },

    standing: {
      id: 'standing',
      name: 'Casual Smile',
      subtitle: 'Stand inside the outline 😊',
      gesture: 'open',
      landmarks: {
        nose:          { x: 0.50, y: 0.25 },
        leftShoulder:  { x: 0.36, y: 0.42 },
        rightShoulder: { x: 0.64, y: 0.42 },
        leftElbow:     { x: 0.32, y: 0.58 },
        rightElbow:    { x: 0.68, y: 0.58 },
        leftWrist:     { x: 0.33, y: 0.74 },
        rightWrist:    { x: 0.67, y: 0.74 },
        leftHip:       { x: 0.40, y: 0.74 },
        rightHip:      { x: 0.60, y: 0.74 }
      }
    }
  };

  // Preset sequence for the 3 photobooth shots
  const SHOT_PRESET_SEQUENCE = ['classic', 'peace', 'heartHands'];

  // ── ENGINE STATE ────────────────────────────────────────────
  const state = {
    landmarker: null,
    isInitialized: false,
    isLoading: false,
    video: null,
    canvas: null,
    ctx: null,
    hintChip: null,

    // State machine
    flowState: 'IDLE', // IDLE | CAMERA_READY | POSE_DETECTED | POSITIONING | POSE_MATCHED | HOLD_STILL | COUNTDOWN | CAPTURE | PREVIEW
    currentPresetKey: 'classic',
    currentShotIdx: 0,
    autoGuideEnabled: true, // Guides user through shots automatically

    // Similarity & feedback
    overallScore: 0,
    regionScores: {
      head: 0,
      shoulders: 0,
      leftArm: 0,
      rightArm: 0,
      torso: 0,
      leftLeg: 0,
      rightLeg: 0
    },

    // Smooth color interpolation: [r, g, b, a]
    currentColor: [244, 63, 94, 0.85], // Starts Red/Orange
    currentFill: [244, 63, 94, 0.18],

    // Hold still & countdown timers
    matchStartTime: null,
    countdownTimer: null,
    countdownSeconds: 3,

    // Temporal smoothing cache
    smoothedLandmarks: null,
    lastFrameTime: -1,

    // Performance & FPS counter
    fps: 0,
    fpsFrames: 0,
    lastFpsUpdate: performance.now(),

    // Callbacks for photobooth app
    onCaptureTrigger: null,
    onCountdownTick: null,
    onStateChange: null
  };

  // ── INITIALIZATION ──────────────────────────────────────────
  async function initPoseEngine(videoEl, canvasEl, hintChipEl) {
    state.video = videoEl;
    state.canvas = canvasEl;
    state.ctx = canvasEl.getContext('2d');
    state.hintChip = hintChipEl;

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    try {
      state.isLoading = true;
      updateHint('Initializing AI Pose Landmarker...');

      // Check for MediaPipe Vision bundle in window
      const VisionModule = window.Vision || window['@mediapipe/tasks-vision'];
      if (!VisionModule || !VisionModule.FilesetResolver) {
        console.warn('Vision bundle not yet ready, retrying in 300ms...');
        setTimeout(() => initPoseEngine(videoEl, canvasEl, hintChipEl), 300);
        return;
      }

      // 1. Load WebAssembly binaries (local with CDN fallback)
      let filesetResolver;
      try {
        filesetResolver = await VisionModule.FilesetResolver.forVisionTasks(CONFIG.WASM_PATH);
      } catch (wasmErr) {
        console.warn('Local wasm failed, trying CDN fallback:', wasmErr);
        filesetResolver = await VisionModule.FilesetResolver.forVisionTasks(CONFIG.WASM_CDN_FALLBACK);
      }

      // 2. Initialize PoseLandmarker in VIDEO running mode
      state.landmarker = await VisionModule.PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: CONFIG.MODEL_PATH,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: CONFIG.LANDMARK_MIN_CONFIDENCE,
        minPosePresenceConfidence: CONFIG.LANDMARK_MIN_CONFIDENCE,
        minTrackingConfidence: CONFIG.LANDMARK_MIN_CONFIDENCE
      });

      state.isInitialized = true;
      state.isLoading = false;
      state.flowState = 'CAMERA_READY';
      updateHint('Stand inside the outline');
      console.log('✅ Photobooth MediaPipe Pose Landmarker ready!');

      // Start the high-performance render and detection loop
      requestAnimationFrame(poseRenderLoop);
    } catch (err) {
      console.error('Pose landmarker initialization failed:', err);
      state.isLoading = false;
      updateHint('Pose Guide active');
      // Still start render loop to show ghost silhouette even if detector is degraded
      requestAnimationFrame(poseRenderLoop);
    }
  }

  function resizeCanvas() {
    if (!state.canvas || !state.video) return;
    const rect = state.video.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      state.canvas.width = rect.width;
      state.canvas.height = rect.height;
    }
  }

  // ── POSE DETECTION & RENDER LOOP ─────────────────────────────
  function poseRenderLoop(timestamp) {
    requestAnimationFrame(poseRenderLoop);

    const { video, canvas, ctx, landmarker, isInitialized } = state;
    if (!canvas || !ctx || !video) return;

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return;

    // Clear canvas cleanly
    ctx.clearRect(0, 0, w, h);

    // Track FPS for debug mode
    calculateFps(timestamp);

    // 1. Run MediaPipe Pose detection if video has new frame
    let detectedRaw = null;
    if (isInitialized && landmarker && video.readyState >= 2) {
      if (video.currentTime !== state.lastFrameTime) {
        state.lastFrameTime = video.currentTime;
        try {
          const results = landmarker.detectForVideo(video, timestamp);
          if (results && results.landmarks && results.landmarks.length > 0) {
            detectedRaw = results.landmarks[0]; // Primary person
          }
        } catch (detErr) {
          // Skip frame on transient read error
        }
      }
    }

    // 2. Map coordinates: Camera (with object-fit: cover & mirroring) to Screen Space
    let screenLandmarks = null;
    if (detectedRaw) {
      screenLandmarks = mapCameraToScreen(detectedRaw, w, h, video.videoWidth, video.videoHeight);
      // Temporal smoothing (eliminates webcam landmark jitter)
      screenLandmarks = applyTemporalSmoothing(screenLandmarks);
    } else {
      state.smoothedLandmarks = null;
    }

    // 3. Compute Pose Matching & Update State Machine
    const currentPreset = POSE_PRESETS[state.currentPresetKey] || POSE_PRESETS.standing;
    updatePoseMatching(screenLandmarks, currentPreset, timestamp);

    // 4. Render the Elegant Ghost Silhouette Mannequin
    renderGhostSilhouette(ctx, w, h, currentPreset);

    // 5. Render Optional Developer Debug HUD (when DEBUG_POSE = true)
    if (CONFIG.DEBUG_POSE) {
      renderDebugHUD(ctx, w, h, screenLandmarks, currentPreset);
    }
  }

  // ── CAMERA TO SCREEN MAPPING (OBJECT-FIT: COVER + CSS MIRRORING) ──
  function mapCameraToScreen(rawLandmarks, canvasW, canvasH, videoW, videoH) {
    if (!videoW || !videoH) return null;

    const canvasRatio = canvasW / canvasH;
    const videoRatio = videoW / videoH;
    let scale, offsetX, offsetY;

    if (videoRatio > canvasRatio) {
      // Video is wider than canvas -> cropped on sides
      scale = canvasH / videoH;
      const scaledW = videoW * scale;
      offsetX = (canvasW - scaledW) / 2;
      offsetY = 0;
    } else {
      // Video is taller than canvas -> cropped top/bottom
      scale = canvasW / videoW;
      const scaledH = videoH * scale;
      offsetX = 0;
      offsetY = (canvasH - scaledH) / 2;
    }

    // Indices for landmarks of interest
    // Mirroring: user's physical right arm appears on mirrored screen's right
    // In camera image: right hand has x < 0.5. With mirror (1 - x), it appears on screen's right!
    const mapped = {};
    const keyMap = {
      nose: 0,
      leftEye: 2,
      rightEye: 5,
      leftShoulder: 11,
      rightShoulder: 12,
      leftElbow: 13,
      rightElbow: 14,
      leftWrist: 15,
      rightWrist: 16,
      leftHip: 23,
      rightHip: 24,
      leftKnee: 25,
      rightKnee: 26,
      leftAnkle: 27,
      rightAnkle: 28
    };

    for (const [name, idx] of Object.entries(keyMap)) {
      const lm = rawLandmarks[idx];
      if (!lm) continue;

      // Mirrored horizontal position: (1 - lm.x)
      const mirroredX = 1 - lm.x;
      const screenX = offsetX + (mirroredX * videoW * scale);
      const screenY = offsetY + (lm.y * videoH * scale);

      mapped[name] = {
        x: screenX / canvasW, // Normalized screen coordinates [0, 1]
        y: screenY / canvasH,
        rawX: screenX,
        rawY: screenY,
        visibility: lm.visibility !== undefined ? lm.visibility : (lm.presence !== undefined ? lm.presence : 0.8)
      };
    }

    return mapped;
  }

  // ── TEMPORAL SMOOTHING (EXPONENTIAL MOVING AVERAGE) ─────────
  function applyTemporalSmoothing(current) {
    if (!current) return null;
    if (!state.smoothedLandmarks) {
      state.smoothedLandmarks = current;
      return current;
    }

    const smoothed = {};
    const alpha = CONFIG.EMA_ALPHA;

    for (const key of Object.keys(current)) {
      const currPt = current[key];
      const prevPt = state.smoothedLandmarks[key];

      if (!prevPt) {
        smoothed[key] = currPt;
      } else {
        smoothed[key] = {
          x: (alpha * currPt.x) + ((1 - alpha) * prevPt.x),
          y: (alpha * currPt.y) + ((1 - alpha) * prevPt.y),
          rawX: (alpha * currPt.rawX) + ((1 - alpha) * prevPt.rawX),
          rawY: (alpha * currPt.rawY) + ((1 - alpha) * prevPt.rawY),
          visibility: currPt.visibility
        };
      }
    }

    state.smoothedLandmarks = smoothed;
    return smoothed;
  }

  // ── BODY-RELATIVE NORMALIZATION & POSE MATCHING ─────────────
  function updatePoseMatching(userLandmarks, targetPreset, timestamp) {
    // If no person detected: reset to idle/searching
    if (!userLandmarks || !userLandmarks.nose || !userLandmarks.leftShoulder || !userLandmarks.rightShoulder) {
      state.overallScore = 0;
      state.matchStartTime = null;
      if (state.flowState !== 'COUNTDOWN' && state.flowState !== 'CAPTURE') {
        state.flowState = 'CAMERA_READY';
        updateHint('Stand inside the outline');
      }
      smoothColorTransition([244, 63, 94, 0.85], [244, 63, 94, 0.16]); // Subtle Coral
      return;
    }

    const tLm = targetPreset.landmarks;
    const uLm = userLandmarks;

    // Check body bounds & framing
    const shoulderWidth = Math.hypot(uLm.rightShoulder.x - uLm.leftShoulder.x, uLm.rightShoulder.y - uLm.leftShoulder.y);
    if (shoulderWidth < 0.12) {
      state.overallScore = 0.2;
      updateHint('Move closer to the camera');
      smoothColorTransition([244, 63, 94, 0.85], [244, 63, 94, 0.16]);
      return;
    }
    if (shoulderWidth > 0.65) {
      state.overallScore = 0.3;
      updateHint('Step back a little');
      smoothColorTransition([244, 63, 94, 0.85], [244, 63, 94, 0.16]);
      return;
    }

    // ── 1. BODY-RELATIVE NORMALIZATION ──
    // Center: midpoint between shoulders
    const uCenter = {
      x: (uLm.leftShoulder.x + uLm.rightShoulder.x) / 2,
      y: (uLm.leftShoulder.y + uLm.rightShoulder.y) / 2
    };
    const tCenter = {
      x: (tLm.leftShoulder.x + tLm.rightShoulder.x) / 2,
      y: (tLm.leftShoulder.y + tLm.rightShoulder.y) / 2
    };

    // Scale reference: distance between shoulders
    const uScale = Math.max(0.08, shoulderWidth);
    const tScale = Math.max(0.08, Math.hypot(tLm.rightShoulder.x - tLm.leftShoulder.x, tLm.rightShoulder.y - tLm.leftShoulder.y));

    const normU = pt => ({ x: (pt.x - uCenter.x) / uScale, y: (pt.y - uCenter.y) / uScale });
    const normT = pt => ({ x: (pt.x - tCenter.x) / tScale, y: (pt.y - tCenter.y) / tScale });

    // Distance helper between normalized points
    const normDist = (pA, pB) => Math.hypot(pA.x - pB.x, pA.y - pB.y);

    // ── 2. PER-REGION SIMILARITY SCORING ──
    const regions = {};

    // Region: Head (nose position relative to shoulder center)
    const headDist = normDist(normU(uLm.nose), normT(tLm.nose));
    regions.head = Math.max(0, 1 - (headDist / 0.70));

    // Region: Shoulders (tilt & span alignment)
    const uShoulderAngle = Math.atan2(uLm.rightShoulder.y - uLm.leftShoulder.y, uLm.rightShoulder.x - uLm.leftShoulder.x);
    const tShoulderAngle = Math.atan2(tLm.rightShoulder.y - tLm.leftShoulder.y, tLm.rightShoulder.x - tLm.leftShoulder.x);
    const angleDiff = Math.abs(uShoulderAngle - tShoulderAngle);
    regions.shoulders = Math.max(0, 1 - (angleDiff / 0.45));

    // Region: Left Arm (elbow + wrist)
    const lElbowDist = normDist(normU(uLm.leftElbow), normT(tLm.leftElbow));
    const lWristDist = normDist(normU(uLm.leftWrist), normT(tLm.leftWrist));
    regions.leftArm = Math.max(0, 1 - (lElbowDist * 0.4 + lWristDist * 0.6) / 1.1);

    // Region: Right Arm (elbow + wrist)
    const rElbowDist = normDist(normU(uLm.rightElbow), normT(tLm.rightElbow));
    const rWristDist = normDist(normU(uLm.rightWrist), normT(tLm.rightWrist));
    regions.rightArm = Math.max(0, 1 - (rElbowDist * 0.4 + rWristDist * 0.6) / 1.1);

    // Region: Torso (spine alignment down to hips)
    if (uLm.leftHip && uLm.rightHip && uLm.leftHip.visibility > 0.4) {
      const uHipMid = { x: (uLm.leftHip.x + uLm.rightHip.x) / 2, y: (uLm.leftHip.y + uLm.rightHip.y) / 2 };
      const tHipMid = { x: (tLm.leftHip.x + tLm.rightHip.x) / 2, y: (tLm.leftHip.y + tLm.rightHip.y) / 2 };
      const torsoDist = normDist(normU(uHipMid), normT(tHipMid));
      regions.torso = Math.max(0, 1 - (torsoDist / 0.85));
    } else {
      regions.torso = regions.shoulders; // Fallback for chest-up webcam framing
    }

    // Region: Legs (if lower body is in frame)
    if (uLm.leftKnee && uLm.leftKnee.visibility > 0.4) {
      const lKneeDist = normDist(normU(uLm.leftKnee), normT(tLm.leftKnee));
      const rKneeDist = normDist(normU(uLm.rightKnee), normT(tLm.rightKnee));
      regions.leftLeg = Math.max(0, 1 - (lKneeDist / 1.1));
      regions.rightLeg = Math.max(0, 1 - (rKneeDist / 1.1));
    } else {
      // If legs not visible, don't penalize user standing close to camera
      regions.leftLeg = 0.85;
      regions.rightLeg = 0.85;
    }

    state.regionScores = regions;

    // ── 3. OVERALL WEIGHTED SIMILARITY SCORE ──
    const score = (
      regions.head * 0.25 +
      regions.shoulders * 0.20 +
      regions.leftArm * 0.25 +
      regions.rightArm * 0.25 +
      regions.torso * 0.05
    );
    state.overallScore = Math.min(1.0, Math.max(0.0, score));

    // ── 4. VISUAL FEEDBACK TRANSITIONS (Non-blocking: suggestions & guide) ──
    if (state.overallScore >= CONFIG.POSE_MATCH_THRESHOLD) {
      // MATCHED! (Vibrant Emerald Green)
      smoothColorTransition([34, 197, 94, 0.95], [34, 197, 94, 0.28]);
      updateHint('Perfect! 💚', 'state-matched');
      state.flowState = 'POSE_MATCHED';
    } else if (state.overallScore >= CONFIG.POSE_NEAR_THRESHOLD) {
      // NEAR MATCH (Golden Amber)
      smoothColorTransition([234, 179, 8, 0.90], [234, 179, 8, 0.22]);
      updateHint('Almost there! ✨', 'state-near');
      state.flowState = 'POSITIONING';
    } else {
      // UNMATCHED (Warm Theme Coral)
      smoothColorTransition([244, 63, 94, 0.85], [244, 63, 94, 0.16]);
      updateHint(targetPreset.subtitle || 'Stand inside the outline', '');
      state.flowState = 'POSE_DETECTED';
    }
  }

  // Smooth color lerping for cinematic AR transition
  function smoothColorTransition(targetStroke, targetFill) {
    const lerp = (a, b, f) => a + (b - a) * f;
    const f = 0.18; // smooth speed
    for (let i = 0; i < 4; i++) {
      state.currentColor[i] = lerp(state.currentColor[i], targetStroke[i], f);
      state.currentFill[i] = lerp(state.currentFill[i], targetFill[i], f);
    }
  }

  function updateHint(text, stateClass = '') {
    if (!state.hintChip) return;
    if (state.hintChip.textContent !== text) {
      state.hintChip.textContent = text;
    }
    state.hintChip.classList.toggle('state-near', stateClass === 'state-near');
    state.hintChip.classList.toggle('state-matched', stateClass === 'state-matched');
  }

  // ── RENDER ELEGANT GHOST MANNEQUIN SILHOUETTE ───────────────
  function renderGhostSilhouette(ctx, w, h, preset) {
    const lm = preset.landmarks;
    const pt = key => ({ x: lm[key].x * w, y: lm[key].y * h });

    const strokeRgba = `rgba(${Math.round(state.currentColor[0])}, ${Math.round(state.currentColor[1])}, ${Math.round(state.currentColor[2])}, ${state.currentColor[3].toFixed(2)})`;
    const fillRgba   = `rgba(${Math.round(state.currentFill[0])}, ${Math.round(state.currentFill[1])}, ${Math.round(state.currentFill[2])}, ${state.currentFill[3].toFixed(2)})`;

    ctx.save();
    ctx.strokeStyle = strokeRgba;
    ctx.fillStyle   = fillRgba;
    ctx.lineWidth   = 3.2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.shadowColor = strokeRgba;
    ctx.shadowBlur  = 14;

    const isSilhouette = CONFIG.RENDER_MODE === 'SILHOUETTE';

    // Body segment keypoints in pixel space
    const nose = pt('nose');
    const lSh = pt('leftShoulder');
    const rSh = pt('rightShoulder');
    const lEl = pt('leftElbow');
    const rEl = pt('rightElbow');
    const lWr = pt('leftWrist');
    const rWr = pt('rightWrist');
    const lHp = pt('leftHip');
    const rHp = pt('rightHip');
    const lKn = pt('leftKnee');
    const rKn = pt('rightKnee');
    const lAn = pt('leftAnkle');
    const rAn = pt('rightAnkle');

    // Base body scale relative to canvas dimensions
    const bodyW = Math.hypot(rSh.x - lSh.x, rSh.y - lSh.y);
    const headW = bodyW * 0.40;
    const headH = headW * 1.30;
    const armR1 = bodyW * 0.16;
    const armR2 = bodyW * 0.12;
    const legR1 = bodyW * 0.20;
    const legR2 = bodyW * 0.14;

    // 1. HEAD & NECK
    ctx.beginPath();
    const headCenterY = nose.y - (headH * 0.15);
    ctx.ellipse(nose.x, headCenterY, headW * 0.85, headH * 0.85, 0, 0, Math.PI * 2);
    if (isSilhouette) ctx.fill();
    ctx.stroke();

    // Neck column connecting smoothly to collarbone
    ctx.beginPath();
    const neckW = headW * 0.45;
    const neckTopY = headCenterY + (headH * 0.70);
    const neckBottomY = (lSh.y + rSh.y) / 2;
    ctx.moveTo(nose.x - neckW, neckTopY);
    ctx.quadraticCurveTo(nose.x - neckW * 1.1, neckBottomY, lSh.x + (bodyW * 0.15), neckBottomY);
    ctx.lineTo(rSh.x - (bodyW * 0.15), neckBottomY);
    ctx.quadraticCurveTo(nose.x + neckW * 1.1, neckBottomY, nose.x + neckW, neckTopY);
    ctx.closePath();
    if (isSilhouette) ctx.fill();
    ctx.stroke();

    // 2. TORSO & HIPS (Smooth Hourglass / Athletic Mannequin)
    ctx.beginPath();
    ctx.moveTo(lSh.x, lSh.y);
    // Left chest & waist taper
    const lWaistX = lSh.x * 0.4 + lHp.x * 0.6 + (bodyW * 0.05);
    const lWaistY = lSh.y * 0.5 + lHp.y * 0.5;
    ctx.quadraticCurveTo(lWaistX, lWaistY, lHp.x, lHp.y);
    // Pelvic floor curve
    ctx.quadraticCurveTo((lHp.x + rHp.x) / 2, lHp.y + (bodyW * 0.18), rHp.x, rHp.y);
    // Right waist & chest taper
    const rWaistX = rSh.x * 0.4 + rHp.x * 0.6 - (bodyW * 0.05);
    const rWaistY = rSh.y * 0.5 + rHp.y * 0.5;
    ctx.quadraticCurveTo(rWaistX, rWaistY, rSh.x, rSh.y);
    // Collarbone neckline
    ctx.quadraticCurveTo(nose.x, neckBottomY + (bodyW * 0.06), lSh.x, lSh.y);
    ctx.closePath();
    if (isSilhouette) ctx.fill();
    ctx.stroke();

    // 3. UPPER ARMS & FOREARMS (Rounded Anatomical Capsules)
    drawCapsule(ctx, lSh.x, lSh.y, lEl.x, lEl.y, armR1, armR2, isSilhouette);
    drawCapsule(ctx, lEl.x, lEl.y, lWr.x, lWr.y, armR2, armR2 * 0.85, isSilhouette);

    drawCapsule(ctx, rSh.x, rSh.y, rEl.x, rEl.y, armR1, armR2, isSilhouette);
    drawCapsule(ctx, rEl.x, rEl.y, rWr.x, rWr.y, armR2, armR2 * 0.85, isSilhouette);

    // 4. THIGHS & CALVES
    drawCapsule(ctx, lHp.x, lHp.y, lKn.x, lKn.y, legR1, legR2, isSilhouette);
    drawCapsule(ctx, lKn.x, lKn.y, lAn.x, lAn.y, legR2, legR2 * 0.75, isSilhouette);

    drawCapsule(ctx, rHp.x, rHp.y, rKn.x, rKn.y, legR1, legR2, isSilhouette);
    drawCapsule(ctx, rKn.x, rKn.y, rAn.x, rAn.y, legR2, legR2 * 0.75, isSilhouette);

    // 5. HAND GESTURES
    renderHandGesture(ctx, lWr, lEl, preset.gesture, true, bodyW * 0.22, isSilhouette);
    renderHandGesture(ctx, rWr, rEl, preset.gesture, false, bodyW * 0.22, isSilhouette);

    // 6. FEET
    drawFoot(ctx, lAn.x, lAn.y, -bodyW * 0.22, bodyW * 0.10, isSilhouette);
    drawFoot(ctx, rAn.x, rAn.y, bodyW * 0.22, bodyW * 0.10, isSilhouette);

    ctx.restore();
  }

  // ── SMOOTH CONICAL CAPSULE FOR LIMBS ─────────────────────────
  function drawCapsule(ctx, x1, y1, x2, y2, r1, r2, fill) {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    if (dist < 1) return;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const perp = angle + Math.PI / 2;

    const sinTaper = Math.max(-1, Math.min(1, (r1 - r2) / dist));
    const taperAngle = Math.asin(sinTaper);

    const a1 = perp + taperAngle;
    const a2 = perp - taperAngle + Math.PI;

    ctx.beginPath();
    ctx.arc(x1, y1, r1, a1, a2, false);
    ctx.arc(x2, y2, r2, a2, a1, false);
    ctx.closePath();

    if (fill) ctx.fill();
    ctx.stroke();
  }

  // ── HAND GESTURE SILHOUETTES ────────────────────────────────
  function renderHandGesture(ctx, wrist, elbow, gesture, isLeft, size, fill) {
    ctx.save();
    ctx.translate(wrist.x, wrist.y);
    const armAngle = Math.atan2(wrist.y - elbow.y, wrist.x - elbow.x);
    ctx.rotate(armAngle);
    if (!isLeft) ctx.scale(1, -1);

    ctx.beginPath();
    if (gesture === 'peace') {
      // V-sign Peace Hand
      ctx.moveTo(0, -size * 0.35);
      ctx.lineTo(size * 0.75, -size * 0.45); // Index finger
      ctx.arc(size * 0.85, -size * 0.38, size * 0.12, 0, Math.PI * 2);
      ctx.lineTo(size * 0.25, -size * 0.10);
      ctx.lineTo(size * 0.90, size * 0.10);  // Middle finger
      ctx.arc(size * 1.0, size * 0.18, size * 0.12, 0, Math.PI * 2);
      ctx.lineTo(size * 0.20, size * 0.30);
      ctx.arc(size * 0.15, size * 0.45, size * 0.22, 0, Math.PI * 2); // Folded fingers
      ctx.closePath();
    } else if (gesture === 'heart') {
      // Half-Heart Hand (meets partner hand in center)
      ctx.moveTo(0, -size * 0.20);
      ctx.bezierCurveTo(size * 0.4, -size * 0.7, size * 0.85, -size * 0.4, size * 0.65, 0);
      ctx.bezierCurveTo(size * 0.45, size * 0.35, size * 0.2, size * 0.5, 0, size * 0.3);
      ctx.closePath();
    } else if (gesture === 'thumbsUp') {
      // Thumbs Up Hand
      ctx.moveTo(0, -size * 0.3);
      ctx.lineTo(size * 0.2, -size * 0.85); // Thumb up
      ctx.arc(size * 0.28, -size * 0.92, size * 0.14, 0, Math.PI * 2);
      ctx.lineTo(size * 0.35, -size * 0.3);
      ctx.arc(size * 0.38, 0, size * 0.28, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
    } else {
      // Elegant Open Palm Mitten
      ctx.moveTo(0, -size * 0.35);
      ctx.quadraticCurveTo(size * 0.45, -size * 0.5, size * 0.85, -size * 0.2);
      ctx.quadraticCurveTo(size * 0.95, size * 0.1, size * 0.70, size * 0.4);
      ctx.quadraticCurveTo(size * 0.30, size * 0.45, 0, size * 0.35);
      ctx.closePath();
    }

    if (fill) ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawFoot(ctx, x, y, dx, dy, fill) {
    ctx.beginPath();
    ctx.ellipse(x + dx * 0.4, y + dy * 0.3, Math.abs(dx) * 0.6, dy * 0.7, 0, 0, Math.PI * 2);
    if (fill) ctx.fill();
    ctx.stroke();
  }

  // ── DEVELOPER DEBUG HUD (DEBUG_POSE = true) ─────────────────
  function calculateFps(now) {
    state.fpsFrames++;
    if (now - state.lastFpsUpdate >= 1000) {
      state.fps = Math.round((state.fpsFrames * 1000) / (now - state.lastFpsUpdate));
      state.fpsFrames = 0;
      state.lastFpsUpdate = now;
    }
  }

  function renderDebugHUD(ctx, w, h, screenLandmarks, currentPreset) {
    ctx.save();
    // Semi-transparent dark panel
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(14, 14, 240, 190);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 14, 240, 190);

    ctx.font = '11px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`🔧 POSE DEBUG HUD • ${state.fps} FPS`, 24, 32);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(`State : ${state.flowState}`, 24, 48);
    ctx.fillText(`Preset: ${currentPreset.id} (${currentPreset.name})`, 24, 64);
    
    // Overall score bar
    const pct = Math.round(state.overallScore * 100);
    ctx.fillStyle = pct >= 80 ? '#4ade80' : pct >= 62 ? '#facc15' : '#f87171';
    ctx.fillText(`Similarity: ${pct}% (Target >= 80%)`, 24, 82);
    ctx.fillRect(24, 88, (pct / 100) * 210, 6);

    ctx.fillStyle = '#94a3b8';
    const r = state.regionScores;
    ctx.fillText(`Head: ${Math.round(r.head * 100)}% | Shoulders: ${Math.round(r.shoulders * 100)}%`, 24, 112);
    ctx.fillText(`L-Arm: ${Math.round(r.leftArm * 100)}% | R-Arm: ${Math.round(r.rightArm * 100)}%`, 24, 126);
    ctx.fillText(`Torso: ${Math.round(r.torso * 100)}% | Legs: ${Math.round(r.leftLeg * 100)}%`, 24, 140);

    // Draw detected landmark dots if available
    if (screenLandmarks) {
      ctx.fillStyle = '#22d3ee';
      for (const pt of Object.values(screenLandmarks)) {
        ctx.beginPath();
        ctx.arc(pt.rawX, pt.rawY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // ── PUBLIC API EXPOSURE ─────────────────────────────────────
  window.PhotoboothPoseGuide = {
    CONFIG,
    POSE_PRESETS,
    state,
    init: initPoseEngine,
    setPreset: (presetKey) => {
      if (POSE_PRESETS[presetKey]) {
        state.currentPresetKey = presetKey;
        state.matchStartTime = null;
        updateHint(`Pose: ${POSE_PRESETS[presetKey].name}`);
      }
    },
    setShotIndex: (idx) => {
      state.currentShotIdx = idx % 3;
      state.currentPresetKey = SHOT_PRESET_SEQUENCE[state.currentShotIdx];
      state.matchStartTime = null;
      const preset = POSE_PRESETS[state.currentPresetKey];
      updateHint(preset ? `Pose ${idx + 1}: ${preset.subtitle}` : 'Stand inside the outline');
    },
    setRenderMode: (mode) => {
      if (mode === 'SILHOUETTE' || mode === 'CONTOUR') {
        CONFIG.RENDER_MODE = mode;
      }
    },
    setDebug: (val) => {
      CONFIG.DEBUG_POSE = !!val;
    },
    setCaptureCallback: (fn) => {
      state.onCaptureTrigger = fn;
    },
    setCountdownCallback: (fn) => {
      state.onCountdownTick = fn;
    }
  };

})(window);

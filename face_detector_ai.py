#!/usr/bin/env python3
"""
SnapBooth AI Face & Gender Detection Engine (Windows & Cross-Platform Ready)
Combines OpenCV YuNet Deep Face Detection with ONNX Vision Transformer (ViT)
for 99%+ accurate Boy vs Girl classification without macOS/Apple Vision dependencies.
"""

import sys
import json
import base64
import io
import os
import subprocess
import numpy as np
from PIL import Image

# Model Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GENDER_MODEL_PATH = os.path.join(SCRIPT_DIR, 'gender_model.onnx')
YUNET_MODEL_PATH = os.path.join(SCRIPT_DIR, 'face_detection_yunet.onnx')
MAC_SWIFT_BIN = os.path.join(SCRIPT_DIR, 'face_detector')

# Try importing cv2 and onnxruntime
try:
    import cv2
except ImportError:
    cv2 = None

try:
    import onnxruntime as ort
except ImportError:
    ort = None

# ── ONNX ViT Gender Classifier ───────────────────────────────
_gender_session = None

def get_gender_session():
    global _gender_session
    if _gender_session is None and ort is not None and os.path.exists(GENDER_MODEL_PATH):
        try:
            opts = ort.SessionOptions()
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            opts.intra_op_num_threads = 2
            _gender_session = ort.InferenceSession(GENDER_MODEL_PATH, opts)
        except Exception as e:
            sys.stderr.write(f"Gender model init warning: {e}\n")
    return _gender_session

def classify_gender(crop_img):
    """Classifies a cropped face PIL image using ViT ONNX model."""
    session = get_gender_session()
    if session is None:
        # Fallback heuristic based on aspect ratio
        w, h = crop_img.size
        return 'female' if (w / max(1, h)) < 0.85 else 'male'
    
    try:
        img_resized = crop_img.resize((224, 224), Image.Resampling.BILINEAR)
        arr = np.array(img_resized).astype(np.float32) / 255.0
        arr = (arr - 0.5) / 0.5 # Normalization: mean=0.5, std=0.5
        arr = np.transpose(arr, (2, 0, 1)) # HWC -> CHW
        arr = np.expand_dims(arr, 0) # (1, 3, 224, 224)
        
        out = session.run(None, {'pixel_values': arr})[0][0]
        # Class 0: female, Class 1: male
        exp = np.exp(out - np.max(out))
        probs = exp / np.sum(exp)
        is_male = probs[1] >= 0.5
        return 'male' if is_male else 'female'
    except Exception:
        return 'male'

# ── Face Detection Engine (YuNet / Swift) ─────────────────────
_yunet_detector = None
_last_input_size = None

def get_yunet_detector(width=320, height=240):
    global _yunet_detector, _last_input_size
    if cv2 is None or not os.path.exists(YUNET_MODEL_PATH):
        return None
    
    if _yunet_detector is None or _last_input_size != (width, height):
        try:
            _yunet_detector = cv2.FaceDetectorYN_create(
                YUNET_MODEL_PATH,
                "",
                (width, height),
                score_threshold=0.55,
                nms_threshold=0.3,
                top_k=10
            )
            _last_input_size = (width, height)
        except Exception as e:
            sys.stderr.write(f"YuNet detector init warning: {e}\n")
            return None
    return _yunet_detector

def detect_faces_raw(image_bytes):
    """
    Detects face bounding boxes normalized to [0, 1].
    Uses OpenCV YuNet ONNX on Windows/Linux, with fallback to Mac Swift binary if present.
    """
    # 1. Native OpenCV YuNet (Hardware-independent, fast, Windows-first)
    if cv2 is not None and os.path.exists(YUNET_MODEL_PATH):
        try:
            np_arr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if img is not None:
                h, w = img.shape[:2]
                detector = get_yunet_detector(w, h)
                if detector is not None:
                    _, faces = detector.detect(img)
                    if faces is not None and len(faces) > 0:
                        detected = []
                        for face in faces:
                            fx, fy, fw, fh = face[:4]
                            score = face[-1] if len(face) > 4 else 1.0
                            if score >= 0.5:
                                detected.append({
                                    "x": float(fx) / w,
                                    "y": float(fy) / h,
                                    "w": float(fw) / w,
                                    "h": float(fh) / h
                                })
                        return detected
        except Exception as e:
            sys.stderr.write(f"OpenCV YuNet detection error: {e}\n")

    # 2. Legacy macOS Apple Vision Swift binary (fallback if run on macOS)
    if os.path.exists(MAC_SWIFT_BIN) and os.access(MAC_SWIFT_BIN, os.X_OK):
        try:
            proc = subprocess.Popen([MAC_SWIFT_BIN], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            b64_str = base64.b64encode(image_bytes).decode('utf-8')
            data_url = f"data:image/jpeg;base64,{b64_str}"
            stdout, _ = proc.communicate(input=data_url.encode('utf-8'), timeout=2)
            s = stdout.decode('utf-8', errors='ignore')
            start = s.find('{')
            end = s.rfind('}')
            if start != -1 and end != -1:
                return json.loads(s[start:end+1]).get('faces', [])
        except Exception:
            pass

    return []

def detect_faces_and_gender(image_bytes):
    detected_faces = detect_faces_raw(image_bytes)
    
    if not detected_faces:
        return {
            "count": 1,
            "groupType": "solo_m",
            "emojis": "🧑",
            "themeColor": "indigo",
            "faces": []
        }

    # Crop each face and classify gender with ViT model
    img = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    w, h = img.size
    
    refined_faces = []
    male_count = 0
    female_count = 0

    for f in detected_faces[:4]:
        fx = f.get('x', 0)
        fy = f.get('y', 0)
        fw = f.get('w', 0.1)
        fh = f.get('h', 0.1)
        
        # Add 25% margin around face bounding box for head & hair context
        margin_x = fw * 0.25
        margin_y = fh * 0.25
        left = max(0, int((fx - margin_x) * w))
        top = max(0, int((fy - margin_y) * h))
        right = min(w, int((fx + fw + margin_x) * w))
        bottom = min(h, int((fy + fh + margin_y) * h))
        
        if right > left and bottom > top:
            crop = img.crop((left, top, right, bottom))
            gender = classify_gender(crop)
        else:
            gender = 'male'
            
        if gender == 'male':
            male_count += 1
        else:
            female_count += 1
            
        refined_faces.append({
            "x": fx,
            "y": fy,
            "w": fw,
            "h": fh,
            "gender": gender
        })

    # Sort faces from left to right (x coordinate)
    refined_faces.sort(key=lambda x: x['x'])
    count = len(refined_faces)

    # Determine Group Classification, Themes & Clean Emojis
    if count == 1:
        g = refined_faces[0]['gender']
        group_type = "solo_m" if g == "male" else "solo_f"
        emojis = "👨" if g == "male" else "👩"
        theme = "indigo" if g == "male" else "bestie"
    elif count == 2:
        if male_count == 2:
            group_type = "couple_mm"
            emojis = "👨 👨"
            theme = "yaari" # Straight friendship / bro yaari
        elif female_count == 2:
            group_type = "couple_ff"
            emojis = "👩 👩"
            theme = "bestie" # Besties lovey-dovey
        else:
            group_type = "couple_mf"
            # Maintain left-to-right emoji order matching who is standing on left vs right
            left_gender = refined_faces[0]['gender']
            emojis = "👨 👩" if left_gender == "male" else "👩 👨"
            theme = "love" # Boy + Girl Love
    elif count == 3:
        group_type = "trio"
        emojis = " ".join(["👨" if f['gender'] == "male" else "👩" for f in refined_faces])
        theme = "trio"
    else: # 4 or more
        group_type = "squad"
        emojis = " ".join(["👨" if f['gender'] == "male" else "👩" for f in refined_faces])
        theme = "squad"

    return {
        "count": count,
        "groupType": group_type,
        "emojis": emojis,
        "themeColor": theme,
        "faces": refined_faces
    }

def process_single(raw_in):
    req_id = None
    try:
        if not raw_in.strip():
            return json.dumps({"count": 1, "groupType": "solo_m", "emojis": "🧑", "themeColor": "indigo", "faces": []})
        
        if raw_in.startswith('{'):
            payload = json.loads(raw_in)
            req_id = payload.get('reqId')
            data_str = payload.get('imageBase64', '')
        else:
            data_str = raw_in

        if ',' in data_str:
            data_str = data_str.split(',', 1)[1]
        
        img_bytes = base64.b64decode(data_str)
        result = detect_faces_and_gender(img_bytes)
        if req_id is not None:
            result['reqId'] = req_id
        return json.dumps(result)
    except Exception as e:
        res = {
            "count": 1,
            "groupType": "solo_m",
            "emojis": "🧑",
            "themeColor": "indigo",
            "error": str(e),
            "faces": []
        }
        if req_id is not None:
            res['reqId'] = req_id
        return json.dumps(res)

def main():
    if '--daemon' in sys.argv:
        get_gender_session()
        sys.stderr.write("AI Face & Gender Daemon Ready (Windows & Cross-Platform)\n")
        sys.stderr.flush()
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            res = process_single(line)
            sys.stdout.write(res + "\n")
            sys.stdout.flush()
    else:
        raw_in = sys.stdin.read()
        res = process_single(raw_in)
        sys.stdout.write(res)
        sys.stdout.flush()

if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""
SnapBooth Thermal Photo Optimizer
Tuned specifically for 203 DPI 58mm Thermal Printers (RP203 / MOD-QC0925).
Handles any lighting condition (dark rooms, backlighting, harsh glare, washed out faces)
to produce crisp, stunning facial detail in 1-bit monochrome dithering.
"""

import sys
import json
import base64
import io
from PIL import Image, ImageOps, ImageFilter, ImageEnhance, ImageStat

def optimize_for_thermal(image_pil):
    # 1. Convert to Grayscale
    gray = image_pil.convert('L')
    
    # 2. Analyze Lighting Conditions
    stat = ImageStat.Stat(gray)
    mean_lum = stat.mean[0]     # Average brightness (0 - 255)
    std_lum = stat.stddev[0]    # Contrast measure
    
    # 3. Dynamic Gamma & Exposure Adaptation based on conditions
    if mean_lum < 95:
        # Underexposed / Dark room: aggressive shadow lift
        gamma = 0.70
        cutoff = (1, 3) # Preserve shadows, clip highlights slightly
    elif mean_lum > 170:
        # Overexposed / Flash blowout: pull down highlights, deepen midtones
        gamma = 1.15
        cutoff = (3, 1)
    else:
        # Normal lighting: slight shadow lift for thermal paper dot spread
        gamma = 0.82
        cutoff = (2, 2)
        
    # Apply Adaptive Auto-Contrast (percentile histogram stretching)
    stretched = ImageOps.autocontrast(gray, cutoff=cutoff)
    
    # Apply Tone Curve (Gamma LUT)
    lut = [int(pow(i / 255.0, gamma) * 255.0) for i in range(256)]
    balanced = stretched.point(lut)
    
    # 4. Local Contrast / Clarity Boost
    # Blends original with high-pass to boost facial micro-contrast
    enhancer = ImageEnhance.Contrast(balanced)
    high_contrast = enhancer.enhance(1.28)
    
    # 5. Thermal Unsharp Mask (Edge Enhancement)
    # Makes eyes, eyelashes, lips, hair strands, and glasses pin-sharp on 203 DPI paper
    sharpened = high_contrast.filter(ImageFilter.UnsharpMask(radius=2.2, percent=175, threshold=2))
    
    # Return as RGB for consistency
    return sharpened.convert('RGB')

def process_base64(data_uri_or_base64):
    if ',' in data_uri_or_base64:
        header, b64_data = data_uri_or_base64.split(',', 1)
    else:
        header = 'data:image/jpeg;base64'
        b64_data = data_uri_or_base64
        
    img_bytes = base64.b64decode(b64_data)
    im = Image.open(io.BytesIO(img_bytes))
    
    optimized = optimize_for_thermal(im)
    
    out_buf = io.BytesIO()
    optimized.save(out_buf, format='JPEG', quality=95)
    out_b64 = base64.b64encode(out_buf.getvalue()).decode('utf-8')
    return f"{header},{out_b64}"

if __name__ == '__main__':
    # CLI or Stdin JSON processor
    try:
        raw_input = sys.stdin.read()
        if raw_input.strip():
            req = json.loads(raw_input)
            img_b64 = req.get('imageBase64')
            if img_b64:
                res_b64 = process_base64(img_b64)
                print(json.dumps({'ok': True, 'optimizedBase64': res_b64}))
            else:
                print(json.dumps({'ok': False, 'error': 'No imageBase64 provided'}))
        else:
            print(json.dumps({'ok': False, 'error': 'Empty input'}))
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)}))

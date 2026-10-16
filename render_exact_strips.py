import os
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = '/Users/princetagadiya/Downloads/RP203/generated_strips'
os.makedirs(OUTPUT_DIR, exist_ok=True)

IMG_INDIVIDUAL = '/Users/princetagadiya/.gemini/antigravity-ide/brain/c677ec64-b868-4ccc-b7bb-2f9675fc6036/sample_individual_1792097271086.jpg'
IMG_COUPLE = '/Users/princetagadiya/.gemini/antigravity-ide/brain/c677ec64-b868-4ccc-b7bb-2f9675fc6036/sample_couple_1792097287947.jpg'

def get_font(size, bold=False):
    # Try finding system fonts or fall back to default
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except:
                pass
    return ImageFont.load_default()

def enhance_thermal_photo(im, target_w=364, target_h=260):
    # Center crop to target aspect ratio
    target_ratio = target_w / target_h
    w, h = im.size
    img_ratio = w / h
    if img_ratio > target_ratio:
        sh = h
        sw = int(sh * target_ratio)
        sx = (w - sw) // 2
        sy = 0
    else:
        sw = w
        sh = int(sw / target_ratio)
        sx = 0
        sy = (h - sh) // 2
    
    cropped = im.crop((sx, sy, sx + sw, sy + sh)).resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    # Contrast & dynamic range boost exactly matching enhanceThermalPhoto() in app.js
    rgb = cropped.convert('RGB')
    pixels = list(rgb.getdata())
    enhanced_pixels = []
    for r, g, b in pixels:
        gray = 0.299 * r + 0.587 * g + 0.114 * b
        # Boost midtones and push contrast to 1.35x
        gray = ((gray - 128) * 1.35) + 128 + 6
        gray = max(0, min(255, int(gray)))
        enhanced_pixels.append((gray, gray, gray))
    
    out_img = Image.new('RGB', (target_w, target_h))
    out_img.putdata(enhanced_pixels)
    return out_img

def render_strip(is_couple=False, sample_path=None):
    strip_w = 384
    pad_x = 10
    photo_w = strip_w - (pad_x * 2) # 364
    photo_h = 260
    header_h = 82
    photo_gap = 12
    footer_h = 68
    total_h = header_h + (3 * photo_h) + (2 * photo_gap) + footer_h
    
    canvas = Image.new('RGB', (strip_w, total_h), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    
    # 1. Header
    font_title = get_font(23, bold=True)
    font_sub = get_font(16, bold=True)
    font_date = get_font(11, bold=False)
    
    if is_couple:
        draw.text((strip_w // 2, 24), "♥ PHOTO BOOTH ♥", fill=(0, 0, 0), font=font_title, anchor="mm")
        draw.text((strip_w // 2, 48), "CREATO 4 • LOVE EDITION", fill=(0, 0, 0), font=font_sub, anchor="mm")
        draw.text((strip_w // 2, 65), "♥ OCT 16, 2026 • 02:15 ♥", fill=(0, 0, 0), font=font_date, anchor="mm")
    else:
        draw.text((strip_w // 2, 24), "PHOTO BOOTH", fill=(0, 0, 0), font=font_title, anchor="mm")
        draw.text((strip_w // 2, 48), "CREATO 4", fill=(0, 0, 0), font=font_sub, anchor="mm")
        draw.text((strip_w // 2, 65), "OCT 16, 2026 • 02:15", fill=(0, 0, 0), font=font_date, anchor="mm")
    
    # Divider line
    draw.line([(pad_x, 74), (strip_w - pad_x, 74)], fill=(0, 0, 0), width=2)
    
    # 2. Photos
    src_img = Image.open(sample_path)
    current_y = header_h
    font_heart = get_font(24, bold=True)
    
    for i in range(3):
        # Slightly vary crops or zoom for a realistic 3-shot strip
        if is_couple:
            # Crop 4 different quadrants from the grid
            crops = [
                (0, 0, src_img.width // 2, src_img.height // 2),
                (src_img.width // 2, 0, src_img.width, src_img.height // 2),
                (0, src_img.height // 2, src_img.width // 2, src_img.height)
            ]
            sub = src_img.crop(crops[i])
        else:
            # Vary zoom levels
            margin = i * 25
            sub = src_img.crop((margin, margin, src_img.width - margin, src_img.height - margin))
            
        enhanced = enhance_thermal_photo(sub, photo_w, photo_h)
        canvas.paste(enhanced, (pad_x, current_y))
        
        # Border
        draw.rectangle([(pad_x, current_y), (pad_x + photo_w - 1, current_y + photo_h - 1)], outline=(0, 0, 0), width=2)
        
        # Heart stamp for love mode
        if is_couple:
            draw.text((pad_x + photo_w - 20, current_y + 20), "♥", fill=(0, 0, 0), font=font_heart, anchor="mm")
            
        current_y += photo_h + photo_gap
    
    # 3. Footer
    footer_div_y = current_y - photo_gap + 8
    draw.line([(pad_x, footer_div_y), (strip_w - pad_x, footer_div_y)], fill=(0, 0, 0), width=2)
    
    font_footer = get_font(19, bold=True)
    font_footer_sub = get_font(13, bold=True)
    
    if is_couple:
        draw.text((strip_w // 2, footer_div_y + 22), "♥ YOU & ME FOREVER ♥", fill=(0, 0, 0), font=font_footer_sub, anchor="mm")
        draw.text((strip_w // 2, footer_div_y + 44), "HAVE A NICE DAY", fill=(0, 0, 0), font=font_footer, anchor="mm")
    else:
        draw.text((strip_w // 2, footer_div_y + 30), "HAVE A NICE DAY", fill=(0, 0, 0), font=font_footer, anchor="mm")
        
    return canvas

def dither_serpentine_floyd_steinberg(im):
    # Exactly replicating ditherFloydSteinberg from app.js
    w, h = im.size
    rgb = im.convert('RGB')
    raw_pixels = list(rgb.getdata())
    
    gray = []
    for y in range(h):
        row = []
        for x in range(w):
            idx = y * w + x
            r, g, b = raw_pixels[idx]
            row.append(0.299 * r + 0.587 * g + 0.114 * b)
        gray.append(row)
        
    thermal_out = Image.new('1', (w, h), 1) # 1 = white
    thermal_draw = ImageDraw.Draw(thermal_out)
    
    for y in range(h):
        left_to_right = (y % 2 == 0)
        if left_to_right:
            for x in range(w):
                old_val = gray[y][x]
                new_val = 0 if old_val < 128 else 255
                err = old_val - new_val
                if new_val == 0:
                    thermal_draw.point((x, y), 0) # Black dot burned by head
                
                if x + 1 < w:                 gray[y][x + 1]     += err * (7.0 / 16.0)
                if x - 1 >= 0 and y + 1 < h:  gray[y + 1][x - 1] += err * (3.0 / 16.0)
                if y + 1 < h:                 gray[y + 1][x]     += err * (5.0 / 16.0)
                if x + 1 < w and y + 1 < h:   gray[y + 1][x + 1] += err * (1.0 / 16.0)
        else:
            for x in range(w - 1, -1, -1):
                old_val = gray[y][x]
                new_val = 0 if old_val < 128 else 255
                err = old_val - new_val
                if new_val == 0:
                    thermal_draw.point((x, y), 0)
                    
                if x - 1 >= 0:                gray[y][x - 1]     += err * (7.0 / 16.0)
                if x + 1 < w and y + 1 < h:   gray[y + 1][x + 1] += err * (3.0 / 16.0)
                if y + 1 < h:                 gray[y + 1][x]     += err * (5.0 / 16.0)
                if x - 1 >= 0 and y + 1 < h:  gray[y + 1][x - 1] += err * (1.0 / 16.0)
                
    return thermal_out

print("Generating Normal Photo Booth Strip...")
norm_preview = render_strip(is_couple=False, sample_path=IMG_INDIVIDUAL)
norm_preview.save(os.path.join(OUTPUT_DIR, "strip_normal_preview.png"))

norm_thermal = dither_serpentine_floyd_steinberg(norm_preview)
norm_thermal.save(os.path.join(OUTPUT_DIR, "strip_normal_thermal_print.png"))
print("Saved Normal Strip!")

print("Generating Love Edition Photo Booth Strip...")
love_preview = render_strip(is_couple=True, sample_path=IMG_COUPLE)
love_preview.save(os.path.join(OUTPUT_DIR, "strip_love_preview.png"))

love_thermal = dither_serpentine_floyd_steinberg(love_preview)
love_thermal.save(os.path.join(OUTPUT_DIR, "strip_love_thermal_print.png"))
print("Saved Love Edition Strip!")
print("All strips generated in:", OUTPUT_DIR)

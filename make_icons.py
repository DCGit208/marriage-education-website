from PIL import Image, ImageDraw, ImageFont

def make_icon(size, path):
    img = Image.new('RGB', (size, size), '#00b894')
    draw = ImageDraw.Draw(img)
    font_size = int(size * 0.38)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', font_size)
    except Exception:
        try:
            font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
        except Exception:
            font = ImageFont.load_default()
    text = 'ME'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]
    draw.text((x, y), text, fill='white', font=font)
    img.save(path, 'PNG')
    print(f"Created {path} ({size}x{size})")

make_icon(180, 'public/apple-touch-icon.png')
make_icon(180, 'public/assets/icons/icon-180.png')
make_icon(192, 'public/assets/icons/icon-192.png')
make_icon(512, 'public/assets/icons/icon-512.png')
print("Done")

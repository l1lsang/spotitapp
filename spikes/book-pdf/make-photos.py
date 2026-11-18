"""Test photos for the spike: 1600px display-size JPEGs like the app stores.

Each has a numbered label, a 10% grid and a marked top-left corner, so crops and
rotations can be checked by eye in the rendered PDF. Noise keeps the file size
close to a real photo (about 300-500 KB at quality 85).
"""
import random
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

out = Path(__file__).parent / 'out' / 'photos'
out.mkdir(parents=True, exist_ok=True)
count = int(sys.argv[1]) if len(sys.argv) > 1 else 150
font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 120)
small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 40)
random.seed(7)
for n in range(count):
    portrait = n % 3 == 1
    w, h = (1200, 1600) if portrait else (1600, 1200)
    hue = (n * 47) % 360
    base = Image.new('HSV', (w, h))
    px = base.load()
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            v = 120 + int(100 * (x / w) * (1 - y / h)) + random.randint(-25, 25)
            c = ((hue + x * 40 // w) % 360 * 255 // 360, 140, max(0, min(255, v)))
            for dy in range(4):
                for dx in range(4):
                    px[x + dx, y + dy] = c
    img = base.convert('RGB').filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img)
    for i in range(1, 10):
        d.line([(w * i // 10, 0), (w * i // 10, h)], fill=(255, 255, 255), width=2)
        d.line([(0, h * i // 10), (w, h * i // 10)], fill=(255, 255, 255), width=2)
    d.rectangle([0, 0, w // 10, h // 10], fill=(220, 40, 40))
    d.text((w // 10 + 20, 20), 'TOP-LEFT', font=small, fill=(255, 255, 255))
    d.text((w // 2, h // 2), f'#{n:03d}', font=font, fill=(255, 255, 255), anchor='mm')
    d.text((w - 20, h - 20), f'{w}x{h}', font=small, fill=(255, 255, 255), anchor='rd')
    img.save(out / f'photo-{n:03d}.jpg', quality=85)
print(f'{count} photos in {out}')

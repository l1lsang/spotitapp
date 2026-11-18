"""Checks the spike's PDFs and draws comparison images into results/.

  pdfvenv/Scripts/python inspect_pdfs.py

- page boxes (MediaBox, TrimBox, BleedBox) in millimetres
- fonts: embedded and subset (a 6-letter "ABCDEF+" prefix)
- text: extracted text must equal what the book says (correct ToUnicode maps)
- lines: each page's text lines in pdf-lib vs Chromium, same break mode
- images: chosen pages side by side
"""
import json
import re
from collections import Counter
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
OUT = HERE / 'out'
RESULTS = HERE / 'results'
RESULTS.mkdir(exist_ok=True)
MM = 25.4 / 72
LABEL = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 22)
book = json.loads((OUT / 'sample-book.json').read_text(encoding='utf8'))
squash = lambda text: re.sub(r'\s+', '', text)

def boxes(page):
    to_mm = lambda r: [round(v * MM, 2) for v in (r.x0, r.y0, r.x1, r.y1)]
    return {'media': to_mm(page.mediabox), 'trim': to_mm(page.trimbox), 'bleed': to_mm(page.bleedbox)}

def fonts(doc, pages=range(0, 5)):
    found = {}
    for number in pages:
        for xref, ext, kind, base, _name, _enc in doc.get_page_fonts(number):
            found[base] = {'type': kind, 'embedded': ext != 'n/a', 'subset': bool(re.match(r'^[A-Z]{6}\+', base))}
    return found

def lines(page):
    out = []
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines', []):
            text = ''.join(span['text'] for span in line['spans']).strip()
            if text:
                out.append(text)
    return Counter(out)

def text_matches(doc):
    """Every text element's characters appear, in order, in its page's extracted text."""
    ok = bad = 0
    for number, page in enumerate(book['pages']):
        extracted = squash(doc[number].get_text())
        for element in page['elements']:
            if element['type'] != 'text':
                continue
            if squash(element['text']) in extracted:
                ok += 1
            else:
                bad += 1
    return ok, bad

report = {}
docs = {}
for name in ['pdflib-char', 'chromium-char', 'pdflib-keep-all', 'chromium-keep-all']:
    doc = pymupdf.open(OUT / f'{name}.pdf')
    docs[name] = doc
    ok, bad = text_matches(doc)
    report[name] = {'pages': doc.page_count, 'boxes': boxes(doc[0]), 'fonts': fonts(doc), 'textElementsFound': ok, 'textElementsMissing': bad}

for mode in ['char', 'keep-all']:
    a, b = docs[f'pdflib-{mode}'], docs[f'chromium-{mode}']
    same, different, examples = 0, 0, []
    for number in range(a.page_count):
        la, lb = lines(a[number]), lines(b[number])
        if la == lb:
            same += 1
        else:
            different += 1
            if len(examples) < 4:
                examples.append({'page': number + 1, 'onlyPdflib': list((la - lb).elements())[:3], 'onlyChromium': list((lb - la).elements())[:3]})
    report[f'lines-{mode}'] = {'pagesSame': same, 'pagesDifferent': different, 'examples': examples}

def render(doc, number, zoom=1.4):
    pix = doc[number].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
    image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    # Mark the trim box so cuts can be judged.
    draw = ImageDraw.Draw(image)
    trim = doc[number].trimbox
    draw.rectangle([trim.x0 * zoom, trim.y0 * zoom, trim.x1 * zoom, trim.y1 * zoom], outline=(255, 0, 255), width=1)
    return image

def side_by_side(pairs, file):
    tiles = []
    for label, image in pairs:
        canvas = Image.new('RGB', (image.width, image.height + 34), 'white')
        canvas.paste(image, (0, 34))
        ImageDraw.Draw(canvas).text((6, 4), label, font=LABEL, fill=(0, 0, 0))
        tiles.append(canvas)
    width = sum(tile.width for tile in tiles) + 12 * (len(tiles) - 1)
    sheet = Image.new('RGB', (width, max(tile.height for tile in tiles)), (230, 230, 230))
    x = 0
    for tile in tiles:
        sheet.paste(tile, (x, 0))
        x += tile.width + 12
    sheet.save(RESULTS / file, quality=82)

for number in [1, 2, 3, 4, 6]:
    side_by_side([(f'pdf-lib · {number + 1}쪽', render(docs['pdflib-char'], number)), (f'Chromium · {number + 1}쪽', render(docs['chromium-char'], number))], f'compare-page{number + 1}.jpg')
side_by_side([('pdf-lib · 글자 단위', render(docs['pdflib-char'], 3)), ('pdf-lib · 어절 단위(keep-all)', render(docs['pdflib-keep-all'], 3))], 'linebreak-page4.jpg')

(RESULTS / 'inspect.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
print(json.dumps(report, ensure_ascii=False, indent=2))

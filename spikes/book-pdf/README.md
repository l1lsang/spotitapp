# Book PDF renderer spike

Throwaway experiment for the print PDF. Findings and the decision are in
[`docs/book-pdf-spike.md`](../../docs/book-pdf-spike.md). Nothing here is used by the
app or by Functions. It has its own `package.json`, and ESLint skips `spikes/**`.

## Run it (Windows, local Chrome)

```bash
cd spikes/book-pdf
npm install
python -m venv ../../.verification.local/pdfvenv && ../../.verification.local/pdfvenv/Scripts/python -m pip install pymupdf pillow
PY=../../.verification.local/pdfvenv/Scripts/python
$PY make-photos.py 150                     # out/photos: 1600px test JPEGs (about 45 MB)
R="node --no-warnings --import ../../tests/register-types.mjs"
$R sample.mjs 200                          # out/sample-book.json, built with src/lib/book/layout.ts
$R render-pdflib.mjs char                  # approach A; also: keep-all, --no-subset, --fork
$R render-chromium.mjs char                # approach B; also: keep-all
node compare-lines.mjs                     # results/lines.json
$PY inspect_pdfs.py                        # results/inspect.json and the comparison images
```

`render-pdflib.mjs` reads the full Gowun Batang from `%LOCALAPPDATA%/Temp/fonts`. That is
where the original download went before the app's subset was made. Point `FONT_FILES` at
your own copy if it is elsewhere.

## Files

| File | What it does |
|---|---|
| `sample.mjs` | Builds a 200-page book. Five pages each test one thing: crop with rotation, full bleed, ruled paper, a dark page with a -90° photo. The rest is laid out with the app's auto-layout. |
| `render-pdflib.mjs` | Approach A. Draws with pdf-lib, using the matrices from `src/lib/book/pdfCoords.ts`. |
| `textLayout.mjs` | Line breaking (`char` or `keep-all`) and CSS-style baselines for approach A. |
| `fontkitAdapter.mjs` | Lets pdf-lib use upstream fontkit 2, because pdf-lib's own fork cannot read Pretendard. |
| `render-chromium.mjs` | Approach B. HTML/CSS printed by Chrome, then TrimBox and BleedBox are added. |
| `compare-lines.mjs`, `inspect_pdfs.py` | Check page boxes, fonts, extracted text and line breaks, and draw the side-by-side images. |
| `results/` | The measured numbers and the images quoted in the findings doc. |

# Print fonts

Faces the print renderer (`bookRenderCore.js`) embeds in book PDFs. They are the
same faces the app uses for book text. Gowun Batang here is the **full** font; the
app ships a subset of it (`assets/fonts/book/README.md`), and characters outside that
subset fall back to Pretendard in both places (`bookShared/glyphs.js`).

| File | Font | Source | License |
|---|---|---|---|
| `GowunBatang-Regular.ttf` | Gowun Batang 2.000, full | https://github.com/google/fonts/blob/539f6c4bb51e/ofl/gowunbatang/GowunBatang-Regular.ttf (sha256 `466c593e7147412e…`) | OFL 1.1 (`GowunBatang-OFL.txt`) |
| `NanumPenScript-Regular.ttf` | Nanum Pen 1.10, unmodified | same file as `assets/fonts/book/` | OFL 1.1 with Reserved Font Names (`NanumPenScript-OFL.txt`) |
| `Pretendard-Regular.otf` | Pretendard 1.3.9, unmodified | same file as `assets/fonts/` (orioncactus/pretendard v1.3.9) | OFL 1.1 with Reserved Font Name (`Pretendard-OFL.txt`) |

PDFs embed subsets of these faces, which OFL permits for documents.

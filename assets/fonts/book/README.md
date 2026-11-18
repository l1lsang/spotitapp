# Book Studio fonts

Faces for text that users place on book pages. They load only when the book editor opens.

| File | Font | Source | License |
|---|---|---|---|
| `GowunBatang-Regular.ttf` | Gowun Batang 2.000 | https://github.com/google/fonts/blob/539f6c4bb51e/ofl/gowunbatang/GowunBatang-Regular.ttf | OFL 1.1 (`GowunBatang-OFL.txt`), no Reserved Font Name |
| `NanumPenScript-Regular.ttf` | Nanum Pen 1.10 | https://github.com/google/fonts/blob/16680f8688ff/ofl/nanumpenscript/NanumPenScript-Regular.ttf | OFL 1.1 (`NanumPenScript-OFL.txt`), with Reserved Font Names |

- Gowun Batang is subset with fontTools to keep the app small: 8.4 MB down to 1.4 MB.
  - Kept: the 2,350 KS X 1001 Hangul syllables, compatibility jamo, Latin-1, general punctuation, arrows, CJK symbols, full-width forms and a few symbols (♥ ★ ♪).
  - Syllables outside that set fall back to the system font in the app.
  - The print renderer must use the full font.
- Nanum Pen is shipped unmodified. Its license reserves the Nanum names, and a modified (subset) file could not keep the name.

// Line breaking and line placement shared by the pdf-lib renderer and the comparison
// report. It follows what CSS and React Native do by default for Korean text:
// a line may break between any two Hangul syllables (mode 'char'), or, with
// `word-break: keep-all` (mode 'keep-all'), only at spaces.

const WIDE = /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/
// No line may start with these (closing punctuation) or end with the openers.
const NO_START = new Set([...'.,!?)]}」』」’”…:;%·、。，'])
const NO_END = new Set([...'([{「『‘“'])

/** Break opportunities: index i means a line may end after chars[i - 1]. */
function breakPoints(chars, mode) {
  const ok = new Array(chars.length + 1).fill(false)
  for (let i = 1; i < chars.length; i++) {
    const before = chars[i - 1]
    const after = chars[i]
    if (NO_START.has(after) || NO_END.has(before)) continue
    if (before === ' ' && after !== ' ') ok[i] = true
    else if (mode === 'char' && (WIDE.test(before) || WIDE.test(after)) && before !== ' ' && after !== ' ') ok[i] = true
  }
  ok[chars.length] = true
  return ok
}

/**
 * Greedy line filling, like browsers: trailing spaces hang past the edge and do not
 * count; a word longer than the line is broken by character.
 * Widths add up per character (no kerning between them): measuring every prefix of a
 * long paragraph with the font's shaper took 98% of the render time.
 */
export function breakLines(text, widthPt, measure, mode = 'char') {
  const cache = new Map()
  const charWidth = char => {
    if (!cache.has(char)) cache.set(char, measure(char))
    return cache.get(char)
  }
  const lines = []
  for (const paragraph of text.split(/\n/)) {
    const chars = [...paragraph]
    if (!chars.length) { lines.push(''); continue }
    const ok = breakPoints(chars, mode)
    const prefix = [0]
    for (const char of chars) prefix.push(prefix[prefix.length - 1] + charWidth(char))
    const width = (from, to) => {
      let end = to
      while (end > from && chars[end - 1] === ' ') end--
      return prefix[end] - prefix[from]
    }
    let start = 0
    while (start < chars.length) {
      let lastBreak = -1
      let end = start + 1
      for (; end <= chars.length; end++) {
        if (width(start, end) > widthPt + 0.01) break
        if (ok[end]) lastBreak = end
      }
      if (end > chars.length) { lines.push(chars.slice(start).join('').replace(/ +$/, '')); break }
      // Nothing fits up to a break: cut inside the word, keeping at least one character.
      const cut = lastBreak > start ? lastBreak : Math.max(start + 1, end - 1)
      lines.push(chars.slice(start, cut).join('').replace(/ +$/, ''))
      start = cut
      while (chars[start] === ' ') start++
    }
  }
  return lines
}

/** Baseline of each line from the box top, CSS style: half the leading above the glyphs. */
export function baselines(lineCount, sizePt, lineHeight, ascent, descent) {
  const line = sizePt * lineHeight
  const glyphs = (ascent - descent) * sizePt
  return Array.from({ length: lineCount }, (_, i) => i * line + (line - glyphs) / 2 + ascent * sizePt)
}

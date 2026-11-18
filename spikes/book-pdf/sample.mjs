// Builds the spike's sample book from the app's own layout code, so the renderers are
// fed exactly the data the editor saves. Writes out/sample-book.json.
//   node --import ../../tests/register-types.mjs sample.mjs [pageCount]
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { layoutBook, layoutTitlePage } from '../../src/lib/book/layout.ts'
import { createEmptyPage } from '../../src/lib/book/draft.ts'
import { getBookSpec } from '../../src/lib/book/specs.ts'

const spec = getBookSpec('a5-soft')
const target = Number(process.argv[2] ?? 200)
const dir = new URL('./out/photos/', import.meta.url)
const files = readdirSync(dir).filter(name => name.endsWith('.jpg')).sort()
let n = 0
const newId = () => `e${(n++).toString(36)}`
const photo = (index, photoIndex = 0) => {
  const name = files[index % files.length]
  const portrait = Number(name.slice(6, 9)) % 3 === 1
  return { postId: `post-${index}`, photoIndex, url: pathToFileURL(join(dir.pathname.slice(1), name)).href, pxWidth: portrait ? 1200 : 1600, pxHeight: portrait ? 1600 : 1200 }
}

const PARAGRAPHS = [
  '성북천을 따라 걷다가 다리 아래에서 잠깐 쉬었다. 물소리가 생각보다 커서 이어폰을 뺐다. 오후 4시쯤이었고, 그림자가 길어지기 시작했다.',
  '서점에서 산 책은 「The Remains of the Day」였다. 2,000원짜리 엽서 두 장도 같이 샀다. 하나는 엄마에게 보내고, 하나는 이 책에 붙일 생각이다.',
  '한강공원에 도착했을 때 바람이 세게 불었다. 자전거 대여소 앞에 줄이 길어서 그냥 걸었다. 여의나루역까지 3.2km, 걸음 수로는 4,812보.',
  '비가 그친 뒤의 골목은 냄새부터 달랐다. 젖은 아스팔트, 빵집 환풍구에서 나오는 버터 냄새, 그리고 어딘가에서 피우는 담배 냄새가 섞여 있었다.',
  '오늘은 기록할 게 별로 없다고 생각했는데, 막상 쓰려고 보니 점심에 먹은 칼국수 이야기만 세 줄이 됐다. 국물이 진했고 김치가 시었다.',
]
const words = count => Array.from({ length: count }, (_, i) => PARAGRAPHS[i % PARAGRAPHS.length]).join('\n')

const text = (value, box, style = {}) => ({
  id: newId(), type: 'text', text: value, font: 'pretendard', sizePt: 10, color: '#161F1B', align: 'left', lineHeight: 1.6,
  rotationDeg: 0, ...box, ...style,
})
const image = (ref, box, extra = {}) => ({ id: newId(), type: 'image', ref, crop: { x: 0, y: 0, w: 1, h: 1 }, rotationDeg: 0, ...box, ...extra })

// Pages that each exercise one thing the renderer must get right.
const showcase = [
  layoutTitlePage('우리가 걸었던 길', '2026년 가을, 성북천에서 한강까지', spec, newId),
  { ...createEmptyPage(newId(), { color: '#F4F5EE', pattern: 'grid' }), elements: [
    image(photo(0), { xMm: 70, yMm: 70, wMm: 96, hMm: 72 }, { rotationDeg: 8, crop: { x: 0.1, y: 0.1, w: 0.6, h: 0.6 } }),
    text('조금 더 걷고 싶은 날이었다.', { xMm: 80, yMm: 140, wMm: 100, hMm: 12 }, { font: 'nanum-pen', sizePt: 20, rotationDeg: -4, color: '#974426' }),
    text('사진: 위쪽 왼쪽 60%만 잘라 8° 돌림 · 글: 손글씨 20pt, -4°', { xMm: 74, yMm: 190, wMm: 132, hMm: 6 }, { sizePt: 8, color: '#6E7470' }),
  ] },
  { ...createEmptyPage(newId()), elements: [
    image(photo(1), { xMm: 74, yMm: 105, wMm: 154, hMm: 216 }, { crop: { x: 0.1, y: 0, w: 0.8, h: 1 } }),
    text('재단 여백까지 채운 사진', { xMm: 74, yMm: 180, wMm: 120, hMm: 10 }, { font: 'gowun-batang', sizePt: 18, align: 'center', color: '#FFFFFF' }),
  ] },
  { ...createEmptyPage(newId(), { color: '#FFFFFF', pattern: 'lined' }), elements: [
    text('비 온 뒤', { xMm: 74, yMm: 22, wMm: 132, hMm: 10 }, { font: 'gowun-batang', sizePt: 16 }),
    text('2026.10.21 · 혜화동', { xMm: 74, yMm: 31, wMm: 132, hMm: 5 }, { sizePt: 9, color: '#6E7470', align: 'right' }),
    text(words(4), { xMm: 74, yMm: 100, wMm: 132, hMm: 120 }, { font: 'gowun-batang', sizePt: 11 }),
  ] },
  { ...createEmptyPage(newId(), { color: '#2F3B4A' }), elements: [
    image(photo(2), { xMm: 41, yMm: 70, wMm: 58, hMm: 77 }),
    image(photo(3), { xMm: 107, yMm: 70, wMm: 58, hMm: 44 }, { rotationDeg: -90 }),
    text('밤에는 사진보다 글이 오래 남는다. 가로등 아래에서 쓴 메모를 옮겨 적는다.', { xMm: 74, yMm: 150, wMm: 120, hMm: 20 }, { color: '#FFFFFF', sizePt: 12 }),
    text('손글씨 · 가운데 정렬', { xMm: 74, yMm: 185, wMm: 120, hMm: 10 }, { font: 'nanum-pen', sizePt: 16, align: 'center', color: '#FFFFFF' }),
  ] },
]

const records = []
for (let i = 0; ; i++) {
  const photos = Array.from({ length: 1 + (i % 4) }, (_, k) => photo(4 + i * 3 + k, k))
  records.push({ postId: `post-${i}`, title: ['다리 아래에서', '서점 두 곳', '바람 부는 강변', '골목의 냄새', '칼국수'][i % 5], placeName: '성북천', dateKey: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, content: words(1 + (i % 6)), photos })
  const pages = layoutBook({ title: '', subtitle: '', records, pageCount: 0 }, spec, () => 'x').length - 1
  if (showcase.length + pages >= target) { records.pop(); break }
}
const body = layoutBook({ title: '', subtitle: '', records, pageCount: 0 }, spec, newId).slice(1)
const pages = [...showcase, ...body]
while (pages.length < target) pages.push(createEmptyPage(newId()))

const draft = {
  schemaVersion: 3, id: 'spike-book', title: '우리가 걸었던 길', subtitle: '', specId: 'a5-soft', coverStyle: 'minimal',
  coverPhoto: null, sourcePostIds: records.map(record => record.postId), updatedAt: new Date().toISOString(), pages,
}
writeFileSync(new URL('./out/sample-book.json', import.meta.url), JSON.stringify(draft))
const elements = pages.flatMap(page => page.elements)
console.log(`pages ${pages.length}, photos ${elements.filter(e => e.type === 'image').length}, texts ${elements.filter(e => e.type === 'text').length}, records ${records.length}`)

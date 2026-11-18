import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getPlaceCopyText } from '../src/lib/placeCopy.ts'

test('the place name comes first and the address follows on its own line', () => {
  assert.equal(getPlaceCopyText({ placeName: '서울시청', address: '서울 중구 세종대로 110' }), '서울시청\n서울 중구 세종대로 110')
})

test('a missing or repeated address leaves just the place name', () => {
  assert.equal(getPlaceCopyText({ placeName: '서울시청', address: '' }), '서울시청')
  assert.equal(getPlaceCopyText({ placeName: '서울시청', address: '  서울시청 ' }), '서울시청')
})

test('a pin without a place name copies its address', () => {
  assert.equal(getPlaceCopyText({ placeName: ' ', address: '서울 중구 세종대로 110' }), '서울 중구 세종대로 110')
})

test('extra spaces and line breaks are tidied, and an empty place copies nothing', () => {
  assert.equal(getPlaceCopyText({ placeName: '  서울\n시청 ', address: '서울  중구\t세종대로 110 ' }), '서울 시청\n서울 중구 세종대로 110')
  assert.equal(getPlaceCopyText({ placeName: '', address: '' }), '')
})

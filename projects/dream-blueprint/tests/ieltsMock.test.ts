import test from 'node:test'
import assert from 'node:assert/strict'
import { addMock, mockGoal, overallBand, readMocks } from '../src/lib/ieltsMock.ts'

// R037: a full IELTS mock is kept with its date, the four band scores, whether it was timed and whether it was a redo.
test('a full mock is saved with its date, four bands, timing and redo, newest first', () => {
  let notes: Record<string, string> = {}
  notes = addMock(notes, { day: '2030-11-02', listening: 6, reading: 6.5, writing: 5.5, speaking: 6, timed: true, redo: false })
  notes = addMock(notes, { day: '2030-12-07', listening: 6.5, reading: 7, timed: false, redo: true })
  const list = readMocks(notes)
  assert.equal(list.length, 2)
  assert.equal(list[0].day, '2030-12-07')
  const { at, id, ...first } = list[1] as typeof list[1] & { at?: number; id?: string }
  assert.deepEqual(first, { day: '2030-11-02', listening: 6, reading: 6.5, writing: 5.5, speaking: 6, timed: true, redo: false })
  assert.ok(Number.isSafeInteger(at) && typeof id === 'string' && id, '每一次模考有自己的編號和時間，兩台裝置合併不會重複或互蓋')
  // Impossible bands are dropped, not stored.
  notes = addMock(notes, { day: '2031-01-04', listening: 9.7, reading: 6.25, writing: 6, timed: true, redo: false })
  const { at: _at, id: _id, ...third } = readMocks(notes)[0] as ReturnType<typeof readMocks>[0] & { at?: number; id?: string }
  assert.deepEqual(third, { day: '2031-01-04', writing: 6, timed: true, redo: false })
  // A mock with no possible band at all is not a record.
  assert.equal(readMocks(addMock(notes, { day: '2031-02-01', listening: 9.7, timed: true, redo: false })).length, 3)
  // Broken saved data reads as no mocks.
  assert.deepEqual(readMocks({ 'ielts.mocks': '{oops' }), [])
})

test('the overall band follows the IELTS rounding and needs all four skills', () => {
  // 6 + 6.5 + 5.5 + 6 = 24 → 6.0
  assert.equal(overallBand({ listening: 6, reading: 6.5, writing: 5.5, speaking: 6 }), 6)
  // 6.5 + 6.5 + 5 + 7 = 25 → 6.25 → 6.5
  assert.equal(overallBand({ listening: 6.5, reading: 6.5, writing: 5, speaking: 7 }), 6.5)
  // 4 + 3.5 + 4 + 4 = 15.5 → 3.875 → 4.0
  assert.equal(overallBand({ listening: 4, reading: 3.5, writing: 4, speaking: 4 }), 4)
  // 6 + 6 + 6 + 6.5 = 24.5 → 6.125 → 6.0
  assert.equal(overallBand({ listening: 6, reading: 6, writing: 6, speaking: 6.5 }), 6)
  assert.equal(overallBand({ listening: 6, reading: 6 }), undefined)
})

test('month goals about IELTS listening or mocks get the mock tools', () => {
  assert.equal(mockGoal('B2→C1：第一次雅思整份模考，記下四科的分數'), true)
  assert.equal(mockGoal('雅思：聽力一週兩回；7000 單複習，加背學術字彙'), true)
  assert.equal(mockGoal('單元 20–24；每天 20 分鐘口說'), false)
})

// Two devices each saved a mock before they synced: both stay.
test('merging two devices keeps every mock from both', async () => {
  const { mergeNote } = await import('../src/lib/merge.ts')
  const phone = addMock({}, { day: '2030-11-02', listening: 6, timed: true, redo: false })['ielts.mocks']
  const laptop = addMock({}, { day: '2030-11-09', reading: 6.5, timed: false, redo: false })['ielts.mocks']
  const merged = readMocks({ 'ielts.mocks': mergeNote('ielts.mocks', phone, laptop) })
  assert.deepEqual(merged.map(m => m.day), ['2030-11-09', '2030-11-02'])
  // The same mock on both sides is kept once.
  assert.equal(readMocks({ 'ielts.mocks': mergeNote('ielts.mocks', phone, phone + ' ') }).length, 1)
})

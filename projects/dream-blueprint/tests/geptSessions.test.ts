import test from 'node:test'
import assert from 'node:assert/strict'
import { bookingNote, openSessions } from '../src/lib/geptSessions.ts'

test('全民英檢報名提醒照官網場次：初級 10/30 聽讀 9/1 截止、11/19 放榜；中級 11/6 場 9/14 截止，10 月下旬就說已截止（審核 R035）', () => {
  assert.deepEqual(openSessions('gept-a2', '2027-07-22').map(s => s.test[0]), ['2027-10-30'], '7/22 時初級說寫 9/11 場（7/19 截止）已經報不到')
  const a2 = bookingNote('gept-a2', '2027-07-22')
  assert.match(a2, /10\/30/)
  assert.match(a2, /9\/1/)
  assert.match(a2, /11\/19/)
  assert.deepEqual(openSessions('gept-b1', '2027-09-10').map(s => s.test[0]), ['2027-11-06', '2027-11-13'], '9/14 前還報得到 11/6 聽讀')
  const b1 = bookingNote('gept-b1', '2027-10-21')
  assert.match(b1, /截止/)
  assert.match(b1, /11\/6/)
  assert.match(b1, /9\/14/)
  assert.doesNotMatch(b1, /還能報名/)
})

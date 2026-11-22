import test from 'node:test'
import assert from 'node:assert/strict'
import {
  certStatus, courseProgress, firstLockedUnit, lrPass, officialLevel, saveAttempt, stepOfUnit, steps, swPass, unitGate, visaScreen,
} from '../src/lib/cefr.ts'
import { projectCalendar } from '../src/lib/projection.ts'
import { createInitialState, importBackup } from '../src/lib/store.ts'

test('程度階梯：A1→A2→B1→B2→C1→C2，主線 42 單元＋橋接單元分成前三段', () => {
  assert.deepEqual(steps.map(s => s.from + '→' + s.to), ['A1→A2', 'A2→B1', 'B1→B2', 'B2→C1', 'C1→C2'])
  assert.equal(stepOfUnit(1).to, 'A2'); assert.equal(stepOfUnit(16).to, 'A2')
  assert.equal(stepOfUnit(17).to, 'B1'); assert.equal(stepOfUnit(30).to, 'B1')
  assert.equal(stepOfUnit(31).to, 'B2'); assert.equal(stepOfUnit(42).to, 'B2')
  assert.equal(stepOfUnit(43).to, 'B2', '橋接單元在 B2 證照之前')
  assert.equal(stepOfUnit(48).to, 'B2')
  assert.deepEqual(steps[2].units, [31, 48])
  assert.equal(stepOfUnit(49).to, 'C1', '橋接之後是還在寫的 B2→C1')
  assert.deepEqual(courseProgress(3), { step: steps[0], done: 2, total: 16 })
  assert.ok(steps.at(-1)!.optional, 'C2 是選修，不排進五年')
})

test('全民英檢及格線：聽讀合計 160、單項 72；說寫初級寫 70 說 80，中級以上都 80', () => {
  assert.ok(lrPass([80, 80]))
  assert.ok(!lrPass([79, 80]), '合計 159')
  assert.ok(!lrPass([100, 70]), '閱讀 70 低於 72')
  assert.ok(swPass('gept-a2', [70, 80]))
  assert.ok(!swPass('gept-b1', [70, 80]), '中級寫作要 80')
  assert.ok(!swPass('gept-a2', [90, 79]))
})

test('升級關卡：報名後就能先讀下一段；沒過要再報名；兩半可以分開考過', () => {
  let notes: Record<string, string> = {}
  assert.equal(unitGate(notes, 16), null, 'A1→A2 這一段不用等')
  assert.equal(unitGate(notes, 17)?.to, 'A2', '單元 17 要等全民英檢初級')
  assert.equal(firstLockedUnit(notes, 3), 17)
  notes = saveAttempt(notes, 'A2', { id: 'a', exam: 'gept-a2', date: '2027-04-17', parts: 'both' })
  assert.equal(certStatus(notes, 'A2').state, 'waiting')
  assert.equal(unitGate(notes, 17), null, '報名了，等成績也能先讀')
  assert.equal(firstLockedUnit(notes, 3), 31, '下一個關卡在單元 31')
  notes = saveAttempt(notes, 'A2', { id: 'a', exam: 'gept-a2', date: '2027-04-17', parts: 'both', lr: [90, 85], sw: [65, 85] })
  assert.equal(certStatus(notes, 'A2').state, 'partial', '聽讀過、寫作 65 沒過')
  assert.equal(unitGate(notes, 20)?.to, 'A2', '沒過就要再報名才接著上')
  notes = saveAttempt(notes, 'A2', { id: 'b', exam: 'gept-a2', date: '2027-06-12', parts: 'sw' })
  assert.equal(unitGate(notes, 20), null)
  notes = saveAttempt(notes, 'A2', { id: 'b', exam: 'gept-a2', date: '2027-06-12', parts: 'sw', sw: [75, 82] })
  assert.deepEqual([certStatus(notes, 'A2').state, certStatus(notes, 'A2').passedOn], ['passed', '2027-06-12'])
  assert.equal(officialLevel(notes), 'A2')
  assert.equal(unitGate(notes, 31)?.to, 'B1')
})

test('其他證照、雅思和跳級：證照上寫到哪一級就算哪一級', () => {
  let notes = saveAttempt({}, 'B1', { id: 'm', exam: 'gept-b1', date: '2027-08-15', parts: 'both', lr: [88, 90], sw: [82, 80] })
  assert.equal(officialLevel(notes), 'B1', '沒考初級，直接考過中級也算 B1')
  assert.equal(unitGate(notes, 17), null)
  notes = saveAttempt({}, 'A2', { id: 'o', exam: 'other', date: '2027-05-01', passed: true, otherName: 'A2 Key', otherLevel: 'A2' })
  assert.equal(officialLevel(notes), 'A2')
  notes = saveAttempt({}, 'B2', { id: 'i', exam: 'ielts', date: '2030-05-01', band: { overall: 5.5, speaking: 6 } })
  assert.equal(certStatus(notes, 'B2').state, 'passed')
  notes = saveAttempt(notes, 'C1', { id: 'j', exam: 'ielts', date: '2031-10-01', band: { overall: 6.5, speaking: 7 } })
  assert.equal(certStatus(notes, 'C1').state, 'failed', 'C1 要總分 7')
  assert.deepEqual(visaScreen(notes), { date: '2031-10-01', until: '2033-10-01' }, '但已經到 VisaScreen 標準')
  assert.equal(visaScreen(saveAttempt({}, 'C1', { id: 'k', exam: 'ielts', date: '2031-10-01', band: { overall: 7, speaking: 6.5 } })), null, '口說要 7')
})

test('日曆：一段上完標出要報名哪張證照；還沒報名就停在下一段第一天', () => {
  const base = { today: '2027-04-12', from: '2027-04-12', to: '2027-04-30', cursor: 15 * 6 + 3, sessions: [], ranges: [], weekdays: [1, 2, 3, 4, 5, 6], restDays: [0] }
  const open = projectCalendar(base)
  const end = open.find(d => d.gate)!
  assert.deepEqual([end.unit, end.lessonDay, end.gate], [16, 6, 'A2'])
  assert.match(end.label, /報名全民英檢初級/)
  assert.equal(open.find(d => d.day > end.day && d.kind === 'lesson')?.unit, 17)
  const locked = projectCalendar({ ...base, lockedUnit: 17 })
  const after = locked.filter(d => d.day > end.day && d.kind !== 'rest')
  assert.ok(after.length && after.every(d => d.kind === 'review' && /升級關卡/.test(d.label)))
})

test('舊的預設（週二、四、六 30 分鐘）換成週一到六 1.5 小時；自己改過的不動', () => {
  const s = createInitialState('2026-11-01')
  assert.deepEqual([s.settings.regularDays, s.settings.restDays], [[1, 2, 3, 4, 5, 6], [0]])
  const old = { ...s, settings: { ...s.settings, regularDays: [2, 4, 6], restDays: [0, 5] }, notes: { 'migrate.study30': '1' },
    school: { ...s.school, study: s.school.study.map(x => ({ ...x, minutes: [0, 2, 30, 2, 30, 0, 30][x.weekday] })) } }
  const moved = importBackup(JSON.stringify(old))
  assert.deepEqual([moved.settings.regularDays, moved.settings.restDays], [[1, 2, 3, 4, 5, 6], [0]])
  assert.deepEqual(moved.school.study.map(x => x.minutes), [0, 90, 90, 90, 90, 90, 90])
  const mine = importBackup(JSON.stringify({ ...old, settings: { ...old.settings, regularDays: [1, 3, 5] } }))
  assert.deepEqual(mine.settings.regularDays, [1, 3, 5], '自己設的上課日不動')
})

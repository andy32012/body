import test from 'node:test'
import assert from 'node:assert/strict'
import {
  certStatus, courseProgress, firstLockedUnit, lrPass, officialLevel, saveAttempt, stepOfUnit, steps, swPass, unitGate, visaScreen,
} from '../src/lib/cefr.ts'
import { projectCalendar } from '../src/lib/projection.ts'
import { createInitialState, importBackup } from '../src/lib/store.ts'

test('程度階梯：A1→A2→B1→B2→C1→C2，主線 47 單元＋橋接單元分成前三段', () => {
  assert.deepEqual(steps.map(s => s.from + '→' + s.to), ['A1→A2', 'A2→B1', 'B1→B2', 'B2→C1', 'C1→C2'])
  assert.equal(stepOfUnit(1).to, 'A2'); assert.equal(stepOfUnit(28).to, 'A2')
  assert.equal(stepOfUnit(29).to, 'B1'); assert.equal(stepOfUnit(40).to, 'B1')
  assert.equal(stepOfUnit(41).to, 'B2'); assert.equal(stepOfUnit(47).to, 'B2')
  assert.equal(stepOfUnit(48).to, 'B2', '橋接單元在 B2 證照之前')
  assert.equal(stepOfUnit(53).to, 'B2')
  assert.deepEqual(steps[2].units, [41, 53])
  assert.equal(stepOfUnit(54).to, 'C1', '橋接之後是還在寫的 B2→C1')
  assert.deepEqual(courseProgress(3), { step: steps[0], done: 2, total: 28 })
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
  assert.equal(unitGate(notes, 28), null, 'A1→A2 這一段不用等')
  assert.equal(unitGate(notes, 29)?.to, 'A2', '單元 29 要等全民英檢初級')
  assert.equal(firstLockedUnit(notes, 3), 29)
  notes = saveAttempt(notes, 'A2', { id: 'a', exam: 'gept-a2', date: '2027-04-17', parts: 'both' })
  assert.equal(certStatus(notes, 'A2').state, 'waiting')
  assert.equal(unitGate(notes, 29), null, '報名了，等成績也能先讀')
  assert.equal(firstLockedUnit(notes, 3), 41, '下一個關卡在單元 41')
  notes = saveAttempt(notes, 'A2', { id: 'a', exam: 'gept-a2', date: '2027-04-17', parts: 'both', lr: [90, 85], sw: [65, 85] })
  assert.equal(certStatus(notes, 'A2').state, 'partial', '聽讀過、寫作 65 沒過')
  assert.equal(unitGate(notes, 32)?.to, 'A2', '沒過就要再報名才接著上')
  notes = saveAttempt(notes, 'A2', { id: 'b', exam: 'gept-a2', date: '2027-06-12', parts: 'sw' })
  assert.equal(unitGate(notes, 32), null)
  notes = saveAttempt(notes, 'A2', { id: 'b', exam: 'gept-a2', date: '2027-06-12', parts: 'sw', sw: [75, 82] })
  assert.deepEqual([certStatus(notes, 'A2').state, certStatus(notes, 'A2').passedOn], ['passed', '2027-06-12'])
  assert.equal(officialLevel(notes), 'A2')
  assert.equal(unitGate(notes, 41)?.to, 'B1')
})

test('其他證照、雅思和跳級：證照上寫到哪一級就算哪一級', () => {
  let notes = saveAttempt({}, 'B1', { id: 'm', exam: 'gept-b1', date: '2027-08-15', parts: 'both', lr: [88, 90], sw: [82, 80] })
  assert.equal(officialLevel(notes), 'B1', '沒考初級，直接考過中級也算 B1')
  assert.equal(unitGate(notes, 29), null)
  notes = saveAttempt({}, 'A2', { id: 'o', exam: 'other', date: '2027-05-01', passed: true, otherName: 'A2 Key', otherLevel: 'A2' })
  assert.equal(officialLevel(notes), 'A2')
  notes = saveAttempt({}, 'B2', { id: 'i', exam: 'ielts', date: '2030-05-01', band: { overall: 5.5, speaking: 6 } })
  assert.equal(certStatus(notes, 'B2').state, 'passed')
  notes = saveAttempt(notes, 'C1', { id: 'j', exam: 'ielts', date: '2031-10-01', band: { overall: 6.5, speaking: 7 } })
  assert.equal(certStatus(notes, 'C1').state, 'failed', 'C1 要總分 7')
  assert.deepEqual(visaScreen(notes), { date: '2031-10-01', until: '2033-10-01' }, '但已經到 VisaScreen 標準')
  assert.equal(visaScreen(saveAttempt({}, 'C1', { id: 'k', exam: 'ielts', date: '2031-10-01', band: { overall: 7, speaking: 6.5 } })), null, '口說要 7')
})

test('日曆：一段上完標出要報名哪張證照；已經上到下一段第一天還沒報名才停住', () => {
  const base = { today: '2027-04-12', from: '2027-04-12', to: '2027-04-30', cursor: 27 * 6 + 3, sessions: [], ranges: [], weekdays: [1, 2, 3, 4, 5, 6], restDays: [0] }
  const open = projectCalendar(base)
  const end = open.find(d => d.gate)!
  assert.deepEqual([end.unit, end.lessonDay, end.gate], [28, 6, 'A2'])
  assert.match(end.label, /報名全民英檢初級/)
  assert.equal(open.find(d => d.day > end.day && d.kind === 'lesson')?.unit, 29)
  // 關卡還在後面：和計畫一樣，當作上完就報名，不會先把後面都排成複習。
  const ahead = projectCalendar({ ...base, lockedUnit: 29 })
  assert.equal(ahead.find(d => d.day > end.day && d.kind === 'lesson')?.unit, 29)
  // 已經上到單元 29 還沒報名：停在升級關卡，直到報名。
  const atGate = projectCalendar({ ...base, cursor: 28 * 6, lockedUnit: 29 })
  const after = atGate.filter(d => d.kind !== 'rest')
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

test('全民英檢一日考不溯及既往：不會跟之前考過的聽讀合成一張通過；一日考沒過的那半，之後補考可以合併', () => {
  // Staged 聽讀 85/85 first; later a one-day test with 聽讀 60/60 and 說寫 90/90: no certificate (LTTC).
  let notes = saveAttempt({}, 'B1', { id: 'lr', exam: 'gept-b1', date: '2027-03-01', parts: 'lr', lr: [85, 85] })
  notes = saveAttempt(notes, 'B1', { id: 'day', exam: 'gept-b1', date: '2027-09-01', parts: 'both', lr: [60, 60], sw: [90, 90] })
  assert.notEqual(certStatus(notes, 'B1').state, 'passed', '一日考的說寫不能跟之前的聽讀合併')
  // One-day test passing both halves on its own: passed.
  assert.equal(certStatus(saveAttempt({}, 'B1', { id: 'd', exam: 'gept-b1', date: '2027-09-01', parts: 'both', lr: [88, 90], sw: [82, 80] }), 'B1').state, 'passed')
  // One-day 聽讀 passed, 說寫 missed; 說寫 taken again later: passed on the later date.
  let later = saveAttempt({}, 'B1', { id: 'd', exam: 'gept-b1', date: '2027-09-01', parts: 'both', lr: [88, 90], sw: [70, 80] })
  later = saveAttempt(later, 'B1', { id: 's', exam: 'gept-b1', date: '2027-12-01', parts: 'sw', sw: [85, 82] })
  assert.deepEqual([certStatus(later, 'B1').state, certStatus(later, 'B1').passedOn], ['passed', '2027-12-01'])
})

test('證照：沒登錄成績不說「證照上是 A1」；雅思超過兩年就不再打勾', async () => {
  const { certifiedLevel, visaCurrent } = await import('../src/lib/cefr.ts')
  assert.equal(certifiedLevel({}), null, '還沒有證照')
  assert.equal(certifiedLevel(saveAttempt({}, 'A2', { id: 'a', exam: 'gept-a2', date: '2027-04-17', parts: 'both' })), null, '只有報名也還沒有')
  assert.equal(certifiedLevel(saveAttempt({}, 'B1', { id: 'm', exam: 'gept-b1', date: '2027-08-15', parts: 'both', lr: [88, 90], sw: [82, 80] })), 'B1')
  const v = visaScreen(saveAttempt({}, 'C1', { id: 'j', exam: 'ielts', date: '2024-11-26', band: { overall: 6.5, speaking: 7 } }))!
  assert.equal(v.until, '2026-11-26')
  assert.equal(visaCurrent(v, '2026-11-25'), true, '期限前一天')
  assert.equal(visaCurrent(v, '2026-11-26'), true, '期限當天')
  assert.equal(visaCurrent(v, '2026-11-27'), false, '隔天就不算')
  assert.equal(visaScreen(saveAttempt({}, 'C1', { id: 'k', exam: 'ielts', date: '2024-02-29', band: { overall: 7, speaking: 7 } }))?.until, '2026-02-28', '閏年 2/29 算到 2/28')
  assert.equal(visaCurrent(null, '2026-11-26'), false)
})

test('字表 forms 裡列出的寫法也查得到原本那個字：Mr、acknowledgment（稽核 SV-10）', async () => {
  const { levelEntry } = await import('../src/lib/vocab.ts')
  assert.equal(levelEntry('Mr')?.en, levelEntry('Mr.')?.en)
  assert.ok(levelEntry('Mr'))
  assert.equal(levelEntry('acknowledgment')?.en, levelEntry('acknowledgement')?.en)
  assert.ok(levelEntry('acknowledgment'))
})

test('Mrs、Ms 沒有句點也查得到太太、女士，不會被當成 Mr 的複數', async () => {
  const { levelEntry } = await import('../src/lib/vocab.ts')
  const { lookupWord } = await import('../src/lib/story.ts')
  assert.equal(levelEntry('Mrs')?.en, 'Mrs.')
  assert.equal(levelEntry('Ms')?.en, 'Ms.')
  assert.equal(lookupWord('Mrs.', { words: [] })?.en, 'Mrs.')
  assert.equal(lookupWord('Mr.', { words: [] })?.en, 'Mr./Mister')
})

test('全民英檢兩階段要在兩年內：聽讀和說寫隔太久不算；一日考不能接以前的成績；只差一項可以只考那一項（稽核 CUR-03）', () => {
  const save = (list: Parameters<typeof saveAttempt>[2][]) => list.reduce((n, a) => saveAttempt(n, 'A2', a), {} as Record<string, string>)
  // 1. 聽讀 2020, 說寫 2026: more than two years apart.
  const far = save([{ id: 'a', exam: 'gept-a2', date: '2020-01-01', parts: 'lr', lr: [80, 80] }, { id: 'b', exam: 'gept-a2', date: '2026-01-01', parts: 'sw', sw: [80, 80] }])
  assert.notEqual(certStatus(far, 'A2').state, 'passed')
  // 2. A one-day test does not join a 聽讀 passed before it.
  const oneDay = save([{ id: 'a', exam: 'gept-a2', date: '2026-01-01', parts: 'lr', lr: [80, 80] }, { id: 'b', exam: 'gept-a2', date: '2026-06-01', parts: 'both', lr: [60, 60], sw: [80, 80] }])
  assert.notEqual(certStatus(oneDay, 'A2').state, 'passed')
  // 3. 寫作 passed, 口說 not: later only 口說, within the two years.
  const retake = save([
    { id: 'a', exam: 'gept-a2', date: '2025-01-01', parts: 'lr', lr: [80, 80] },
    { id: 'b', exam: 'gept-a2', date: '2025-05-01', parts: 'sw', sw: [80, 60] },
  ])
  const half = certStatus(retake, 'A2')
  assert.deepEqual([half.state, half.lr, half.w, half.s, half.until], ['partial', true, true, false, '2027-01-01'])
  const done = saveAttempt(retake, 'A2', { id: 'c', exam: 'gept-a2', date: '2026-01-01', parts: 's', speaking: 80 })
  assert.deepEqual([certStatus(done, 'A2').state, certStatus(done, 'A2').passedOn], ['passed', '2026-01-01'])
  // The same retake after the two years: not passed.
  const late = saveAttempt(retake, 'A2', { id: 'c', exam: 'gept-a2', date: '2027-03-01', parts: 's', speaking: 80 })
  assert.notEqual(certStatus(late, 'A2').state, 'passed')
  // A one-day test all passed; one whose 聽讀 failed counts once 聽讀 is passed later and the missing part is taken.
  assert.equal(certStatus(save([{ id: 'a', exam: 'gept-a2', date: '2026-01-01', parts: 'both', lr: [80, 80], sw: [80, 80] }]), 'A2').state, 'passed')
  const day = save([
    { id: 'a', exam: 'gept-a2', date: '2026-01-01', parts: 'both', lr: [60, 60], sw: [80, 60] },
    { id: 'b', exam: 'gept-a2', date: '2026-03-01', parts: 'lr', lr: [80, 80] },
  ])
  assert.deepEqual([certStatus(day, 'A2').state, certStatus(day, 'A2').w], ['partial', true])
  assert.equal(certStatus(saveAttempt(day, 'A2', { id: 'c', exam: 'gept-a2', date: '2026-07-01', parts: 's', speaking: 85 }), 'A2').state, 'passed')
  // A sitting waiting for scores (only 口說 booked) is waiting, not a zero.
  assert.equal(certStatus(saveAttempt(retake, 'A2', { id: 'c', exam: 'gept-a2', date: '2026-01-01', parts: 's' }), 'A2').state, 'waiting')
})

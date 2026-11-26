// The plan has one source (projection.ts → planDays). The month plan, the year plan and the level ladder must say the same.
import assert from 'node:assert/strict'
import test from 'node:test'
import plan from '../src/data/plan.json' with { type: 'json' }
import schedule from '../src/data/curriculumSchedule.json' with { type: 'json' }
import { planDays } from '../src/lib/projection.ts'
import { exams, firstLockedUnit, steps, unitGate } from '../src/lib/cefr.ts'
import { createInitialState } from '../src/lib/store.ts'
import { addDays } from '../src/lib/progress.ts'

const days = planDays()
function monthsBetween(from: string, to: string) {
  const out: string[] = []
  for (let y = +from.slice(0, 4), m = +from.slice(5); `${y}-${String(m).padStart(2, '0')}` <= to; m === 12 ? (y++, m = 1) : m++)
    out.push(`${y}-${String(m).padStart(2, '0')}`)
  return out
}
const unitsIn = (prefix: string) => days.filter(d => d.day.startsWith(prefix) && d.kind === 'lesson' && d.unit).map(d => d.unit!)
const written = (text: string) => [...text.matchAll(/每日課單元 (\d+)(?:–(\d+))?/g)].map(m => [+m[1], +(m[2] ?? m[1])])

test('月計畫一個月一筆，從計畫開始排到 2033 年 12 月，每個月都有英文', () => {
  assert.deepEqual(plan.months.map(m => m.month), monthsBetween('2026-11', '2033-12'))
  for (const m of plan.months) assert.ok(m.english.trim(), m.month)
})

test('月計畫和年度目標寫的每日課單元，就是照計畫逐日排出來的單元', () => {
  for (const m of plan.months) {
    const units = unitsIn(m.month)
    assert.deepEqual(written(m.english), units.length ? [[Math.min(...units), Math.max(...units)]] : [], m.month + '：' + m.english)
  }
  for (const y of plan.years) {
    const units = unitsIn(String(y.year))
    assert.deepEqual(written(y.english), units.length ? [[Math.min(...units), Math.max(...units)]] : [], y.year + '：' + y.english)
  }
})

test('生活主題寫在排到它的那幾個月', () => {
  for (const m of plan.months) {
    const planned = [...new Set(days.filter(d => d.day.startsWith(m.month) && d.topic).map(d => d.topic!.n))]
    const listed = /生活主題 ([\d、]+)/.exec(m.english)?.[1].split('、').map(Number) ?? []
    assert.deepEqual(listed, planned, m.month + '：' + m.english)
  }
})

test('一級的單元上完的那個月要報名那張證照；中高級看中高級題型的模擬成績報名，不等 7000 單看完（審核 R036）', () => {
  const gates = days.filter(d => d.gate)
  assert.deepEqual(gates.map(d => d.gate), ['A2', 'B1', 'B2'])
  for (const g of gates) {
    const step = steps.find(s => s.to === g.gate)!
    const month = plan.months.find(m => m.month === g.day.slice(0, 7))!
    if (step.bookWhen) assert.doesNotMatch(month.english, new RegExp('報名' + exams[step.exams[0]].name), month.month)
    else assert.match(month.english, new RegExp('報名' + exams[step.exams[0]].name), month.month)
    // The month after it goes on with the next level's lessons (the plan books on time).
    if (!step.bookWhen) assert.ok(unitsIn(addDays(g.day, 1).slice(0, 7)).includes(step.units![1] + 1), g.day)
  }
  const b2 = steps.find(s => s.to === 'B2')!
  const [, year, month] = /目標約 (\d{4}) 年 (\d+) 月/.exec(b2.bookWhen!)!
  const target = year + '-' + month.padStart(2, '0')
  assert.deepEqual(plan.months.filter(m => /報名全民英檢中高級/.test(m.english)).map(m => m.month), [target], '報名中高級的那個月就是目標月')
  assert.match(plan.years.find(y => y.year === +year)!.english, /報名全民英檢中高級/)
  // The words forecast says level 5 takes until the end of 2030 at the current pace: finishing them is no booking condition.
  assert.match(b2.bookWhen!, /不用等 7000 單/)
  assert.doesNotMatch(b2.bookWhen!, /^先不考：等 7000 單/)
  assert.doesNotMatch(JSON.stringify(plan), /第 6 級看完：報名/)
  assert.match(b2.wordsForecast!, /2030 年/)
})

test('全部單元上完以後沒有升級關卡擋著（沒有下一段的課要開），日曆寫「都上完了」', () => {
  assert.equal(unitGate({}, schedule.preparedThroughUnit + 1), null)
  assert.equal(firstLockedUnit({}, schedule.preparedThroughUnit + 1), null)
  assert.equal(unitGate({}, 29)?.to, 'A2', '單元 29 還是要先報名初級')
  assert.equal(unitGate({}, 41)?.to, 'B1', '單元 41 還是要先報名中級')
  const after = days.filter(d => d.day > days.find(x => x.gate === 'B2')!.day && d.kind !== 'rest' && d.period === 'semester')
  assert.ok(after.length && after.every(d => d.kind === 'future' && d.label.startsWith(schedule.preparedThroughUnit + ' 個單元都上完了')))
})

test('預設的考週、寒假、實習和國考期，就是計畫用的那幾段', () => {
  const planned = schedule.periods.map(p => p.type + ' ' + p.start + ' ' + p.end)
  for (const p of createInitialState('2026-11-24').settings.periods) assert.ok(planned.includes(p.type + ' ' + p.start + ' ' + p.end), JSON.stringify(p))
  assert.deepEqual([schedule.regularDays, schedule.restDays], [createInitialState('2026-11-24').settings.regularDays, createInitialState('2026-11-24').settings.restDays])
})

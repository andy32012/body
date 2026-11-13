import assert from 'node:assert/strict'
import test from 'node:test'
import { originalPlan, projectCalendar } from '../src/lib/projection.ts'
import schedule from '../src/data/curriculumSchedule.json' with {type:'json'}
import curriculum from '../src/data/curriculum.json' with {type:'json'}

const base = {
  today: '2026-11-13', from: '2026-11-13', to: '2027-02-20',
  cursor: 0, sessions: [],
  ranges: [
    {type:'exam' as const,start:'2026-11-13',end:'2026-11-23'},
    {type:'exam' as const,start:'2027-01-03',end:'2027-01-16'},
    {type:'vacation' as const,start:'2027-01-17',end:'2027-02-20'}
  ],
}
test('課表逐日對得上提供的 42 個日期與春節休息', () => {
  const days = projectCalendar(base)
  const lessons = days.filter(d => d.kind==='lesson')
  assert.equal(lessons.length,42)
  assert.ok(lessons.every(d => d.label === originalPlan(d.day)))
  assert.equal(days.find(d => d.day==='2027-02-08')?.kind,'rest')
})
test('實習後從原進度接續，沒有倒扣或累加', () => {
  const shifted = projectCalendar({...base,from:'2026-11-24',to:'2026-12-03',
    ranges:[...base.ranges,{type:'internship',start:'2026-11-24',end:'2026-11-29'}]})
  assert.equal(shifted.find(d=>d.kind==='lesson')?.day,'2026-12-01')
  assert.equal(shifted.find(d=>d.kind==='lesson')?.lessonDay,1)
})
test('先前四週的普通練習少會延長估計間隔，累爆不推進', () => {
  const projected = projectCalendar({...base,today:'2026-12-22',from:'2026-12-22',to:'2026-12-31',
    startedDay:'2026-11-24',cursor:4,
    sessions:['2026-11-24','2026-12-01','2026-12-08','2026-12-15'].map(day=>({day,energy:'normal'}))})
  assert.deepEqual(projected.filter(d=>d.kind==='lesson').map(d=>d.day),['2026-12-22','2026-12-29'])
})
test('下一個月保留推算過程，未加入課程無法超前排入', () => {
  const ready = projectCalendar({...base,from:'2027-02-20',to:'2027-02-23'})
  assert.equal(ready[0].unit,7)
  assert.equal(ready[0].lessonDay,6)
  assert.equal(ready.at(-1)?.kind,'future')
  assert.equal(ready.at(-1)?.unit,null)
})
test('全年實習與國考共 547 天，寒暑假維持每天 2 分鐘，沒有新課', () => {
  const ranges = [
    {type:'internship' as const,start:'2028-02-01',end:'2029-01-31'},
    {type:'exam' as const,start:'2029-02-01',end:'2029-07-31'},
    {type:'vacation' as const,start:'2028-07-01',end:'2028-08-31'},
  ]
  const calendar=projectCalendar({...base,cursor:3,today:'2028-02-01',from:'2028-02-01',to:'2029-07-31',ranges})
  assert.equal(calendar.length,547)
  assert.ok(calendar.every(d=>d.kind==='review' && !d.unit && d.label.includes('2 分鐘')))
  assert.equal(calendar.find(d=>d.day==='2028-07-01')?.period,'internship')
  assert.equal(calendar.find(d=>d.day==='2029-02-01')?.period,'exam')
  assert.ok(calendar.every(d=>d.original.includes('維持期') && d.original.includes('7000 單')))
  assert.deepEqual(curriculum.schedule,schedule)
})
test('移除個人維持期不會由原始月曆偷偷加回', () => {
  const day='2028-08-01'
  const [entry]=projectCalendar({...base,today:day,from:day,to:day,ranges:[]})
  assert.equal(entry.period,'semester')
  assert.equal(entry.kind,'lesson')
  assert.equal(entry.unit,1)
})

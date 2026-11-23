import assert from 'node:assert/strict'
import test from 'node:test'
import { originalPlan, planDays, projectCalendar } from '../src/lib/projection.ts'
import schedule from '../src/data/curriculumSchedule.json' with {type:'json'}
import curriculum from '../src/data/curriculum.json' with {type:'json'}
import topicData from '../src/data/topics.json' with {type:'json'}
import { calendarGaps, holidayBreak } from '../src/lib/dailyPlan.ts'

const base = {
  today: '2026-11-13', from: '2026-11-13', to: '2027-02-20',
  cursor: 0, sessions: [],
  ranges: [
    {type:'exam' as const,start:'2026-11-13',end:'2026-11-19'},
    {type:'exam' as const,start:'2027-01-03',end:'2027-01-16'},
    {type:'vacation' as const,start:'2027-01-17',end:'2027-02-20'}
  ],
}
test('預設週一到週六上課、週日休息；考週和過年只複習', () => {
  const days = projectCalendar(base)
  const lessons = days.filter(d => d.kind==='lesson')
  assert.equal(lessons[0].day,'2026-11-20','段考週結束後的星期五開始')
  assert.deepEqual([lessons[0].unit,lessons[0].lessonDay],[1,1])
  assert.ok(lessons.every(d => new Date(d.day+'T12:00:00Z').getUTCDay()!==0),'週日不排課')
  assert.ok(days.filter(d => d.day>='2027-01-03' && d.day<='2027-01-16').every(d => d.kind!=='lesson'),'期末考週不排新課')
  assert.equal(days.find(d => d.day==='2027-02-08')?.kind,'rest')
  // 沒有生活主題時，每個上課日都是一堂文法課：段考週後到寒假結束，週一到週六天天一堂。
  const open = days.filter(d => d.day>='2026-11-20' && new Date(d.day+'T12:00:00Z').getUTCDay()!==0
    && !(d.day>='2027-01-03' && d.day<='2027-01-16') && !holidayBreak(d.day) && !calendarGaps.has(d.day))
  assert.deepEqual(lessons.map(d=>d.day),open.map(d=>d.day))
})
test('照計畫每一堂都上，日曆和「原課表安排」一天一天都一樣', () => {
  const days = projectCalendar({...base,today:schedule.start,from:schedule.start,topics:topicData.map(t=>({n:t.n,title:t.title,after:t.after,done:{}}))})
  const plan = new Map(planDays().map(d => [d.day,d]))
  for (const d of days) {
    assert.equal(d.original,plan.get(d.day)!.label,d.day)
    assert.equal(d.label,d.original,d.day)
  }
  assert.ok(days.some(d=>d.topic),'生活主題也照計畫輪流排')
  assert.equal(originalPlan(schedule.start),'單元 1 第 1 天')
  assert.equal(originalPlan('2026-11-20'),'','第一堂課之前沒有安排')
})
test('實習後從原進度接續，沒有倒扣或累加', () => {
  // 段考週一路到實習前一天，中間沒有上課日。
  const ranges = [{type:'exam' as const,start:'2026-11-13',end:'2026-11-23'},{type:'internship' as const,start:'2026-11-24',end:'2026-11-29'}]
  const shifted = projectCalendar({...base,from:'2026-11-24',to:'2026-12-03',weekdays:[2,4,6],restDays:[0,5],ranges})
  assert.equal(shifted.find(d=>d.kind==='lesson')?.day,'2026-12-01')
  assert.equal(shifted.find(d=>d.kind==='lesson')?.lessonDay,1)
  const daily = projectCalendar({...base,from:'2026-11-24',to:'2026-12-03',ranges})
  assert.deepEqual([daily.find(d=>d.kind==='lesson')?.day,daily.find(d=>d.kind==='lesson')?.lessonDay],['2026-11-30',1],'預設週一就接著上')
})
test('先前四週的普通練習少會延長估計間隔，累爆不推進', () => {
  const projected = projectCalendar({...base,today:'2026-12-22',from:'2026-12-22',to:'2026-12-31',weekdays:[2,4,6],restDays:[0,5],
    startedDay:'2026-11-24',cursor:4,
    sessions:['2026-11-24','2026-12-01','2026-12-08','2026-12-15'].map(day=>({day,energy:'normal' as const}))})
  assert.deepEqual(projected.filter(d=>d.kind==='lesson').map(d=>d.day),['2026-12-22','2026-12-29'])
})
test('每個單元都有教材，單元 7 之後接著排單元 8；全部做完後不再排新課', () => {
  const ready = projectCalendar({...base,cursor:7*6-1,today:'2027-03-01',from:'2027-03-01',to:'2027-03-06',ranges:[]})
  assert.deepEqual([ready[0].unit,ready[0].lessonDay],[7,6])
  assert.deepEqual([ready[1].unit,ready[1].lessonDay],[8,1])
  const finished = projectCalendar({...base,cursor:curriculum.units.length*6,today:'2027-03-01',from:'2027-03-01',to:'2027-03-06',ranges:[]})
  assert.ok(finished.every(d=>d.kind!=='lesson'))
  assert.ok(finished.filter(d=>d.kind==='future').every(d=>d.label.startsWith('48 個單元都上完了')))
  assert.equal(curriculum.units.length,schedule.preparedThroughUnit)
  // 42 個主線單元之後接 B1→B2 橋接單元。
  const bridge = projectCalendar({...base,cursor:42*6,today:'2027-03-01',from:'2027-03-01',to:'2027-03-06',ranges:[]})
  assert.equal(bridge.find(d=>d.kind==='lesson')?.unit,43)
  assert.ok(curriculum.units.every(u=>u.days.length===6&&u.checkpoint.length===3&&u.backup.length===5))
})
test('全年實習與國考共 547 天：實習 20–30 分鐘、國考衝刺 15 分鐘護理英文，沒有新課', () => {
  const ranges = [
    {type:'internship' as const,start:'2028-02-01',end:'2029-01-31'},
    {type:'exam' as const,start:'2029-02-01',end:'2029-07-31'},
    {type:'vacation' as const,start:'2028-07-01',end:'2028-08-31'},
  ]
  const calendar=projectCalendar({...base,cursor:3,today:'2028-02-01',from:'2028-02-01',to:'2029-07-31',ranges})
  assert.equal(calendar.length,547)
  assert.ok(calendar.every(d=>d.kind==='review' && !d.unit && d.label.includes('忙的日子')))
  assert.match(calendar.find(d=>d.day==='2028-03-01')!.label, /20–30 分鐘.*忙的日子 10 分鐘/)
  assert.match(calendar.find(d=>d.day==='2029-03-01')!.label, /15 分鐘.*忙的日子 5 分鐘/)
  assert.equal(calendar.find(d=>d.day==='2028-07-01')?.period,'internship')
  assert.equal(calendar.find(d=>d.day==='2029-02-01')?.period,'exam')
  assert.ok(calendar.every(d=>d.original.includes('護理英文')),'原課表安排也是護理英文')
})
test('移除個人維持期不會由原始月曆偷偷加回', () => {
  const day='2028-08-01'
  const [entry]=projectCalendar({...base,today:day,from:day,to:day,ranges:[]})
  assert.equal(entry.period,'semester')
  assert.equal(entry.kind,'lesson')
  assert.equal(entry.unit,1)
})

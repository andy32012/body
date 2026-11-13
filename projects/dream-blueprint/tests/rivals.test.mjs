import test from 'node:test'
import assert from 'node:assert/strict'
import { raceBoard, rankWeek, rivalSummary, rivalLine, seasonHistory } from '../src/lib/rivals.ts'
import config from '../src/data/rivals.json' with { type: 'json' }
const seed={week:'2026-11-09', day:6, score:110, average:0, beginner:true, vacation:false}
const state=()=>({startedDay:'2026-11-09',settings:{rivalsEnabled:true,taunt:'gentle',periods:[]},sessions:[],reviewEvents:[]})
test('週內可重現；初期 110 分超過至少三位，學期與假期都有上限',()=>{
  for(const week of ['2026-11-09','2026-11-16','2026-11-23','2026-11-30']){
    const input={...seed,week}
    const board=rankWeek(input)
    assert.deepEqual(board,rankWeek(input))
    assert.ok(board.filter(r=>r.id!=='self'&&r.score<110).length>=3)
    for(const vacation of [true,false]){
      const rows=rankWeek({...input,vacation,average:10000,beginner:false})
      assert.ok(rows.filter(r=>r.id!=='self').every(r=>r.score<=(vacation?300:150)))
    }
  }
})
test('週一四點換週，新一週起跑為 0，同分並列',()=>{
  const data=state()
  data.sessions.push({day:'2026-11-15',energy:'normal',period:'semester'})
  const before=raceBoard(data,new Date(2026,10,16,3,59))
  const after=raceBoard(data,new Date(2026,10,16,4))
  assert.equal(before.rows.find(r=>r.id==='self').score,30)
  assert.ok(after.rows.every(r=>r.score===0 && r.rank===1))
})
test('同日取最高電量、晚複習加分以五張為上限',()=>{
  const s=state()
  s.sessions.push(...['normal','high','low'].map(energy=>({day:'2026-11-12',energy,period:'semester'})))
  s.reviewEvents=Array.from({length:8},(_,id)=>({id:String(id),day:'2026-11-12',gap:4,remembered:true,shownAnswer:false}))
  assert.equal(raceBoard(s,new Date(2026,10,12,12)).rows.find(r=>r.id==='self').score,60)
})
test('休戰週不納入賽季，關閉榜單時沒有首頁摘要',()=>{
  const s=state()
  s.settings.periods.push({type:'exam',start:'2026-11-12',end:'2026-11-19'})
  assert.match(rivalSummary(s,new Date(2026,10,15,12)),/休戰中/)
  s.sessions.push({day:'2026-11-13',energy:'high',period:'exam'})
  assert.deepEqual(raceBoard(s,new Date(2026,10,15,12)).rows,raceBoard(s,new Date(2026,10,12,12)).rows)
  const past=seasonHistory(s,new Date(2027,1,15,12))
  const fall=past.find(r=>r.id==='2026-fall')
  assert.equal(fall.weeks,10)
  s.settings.rivalsEnabled=false
  assert.equal(rivalSummary(s,new Date(2026,10,15,12)),'')
})
test('每種情況和強度至少八句，連抽不重複',()=>{
  for(const key of Object.keys(config.banter.normal)) {
    for(const strength of ['gentle','bold']){
      const lines=config.banter[strength==='gentle'?'normal':'sharp'][key]
      assert.ok(new Set(lines).size>=8)
      const first=rivalLine(strength,key,undefined,()=>0)
      assert.notEqual(rivalLine(strength,key,first,()=>0),first)
    }
  }
})

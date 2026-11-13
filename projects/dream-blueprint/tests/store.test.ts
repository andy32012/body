import test from 'node:test'
import assert from 'node:assert/strict'
import {createInitialState,exportBackup,importBackup,getSnapshot,restoreBackup,updateStore,STORAGE_KEY,replacePeriod} from '../src/lib/store'
import {activePeriod} from '../src/lib/progress'

test('已知考週自動排程，暑假確認與系辦回覆分開保存',()=>{
  const initial=createInitialState('2026-11-13')
  assert.equal(initial.settings.internshipSeason,'暑假')
  assert.equal(initial.settings.officeReply,'')
  assert.equal(initial.settings.examPromptSeen,true)
  assert.equal(activePeriod('2026-11-13',initial.settings.periods),'exam')
  assert.equal(activePeriod('2026-11-23',initial.settings.periods),'exam')
  assert.equal(activePeriod('2026-11-24',initial.settings.periods),'semester')
  const custom={type:'semester',start:'2026-11-15',end:'2026-11-17'}
  const legacy={...initial.settings,profileRevision:undefined,internshipSeason:undefined,officeReply:'系辦說暑假第二梯',officeAsked:true,examPromptSeen:false,periods:[custom]}
  const upgraded=importBackup(JSON.stringify({...initial,settings:legacy}))
  assert.equal(upgraded.settings.officeReply,legacy.officeReply)
  assert.equal(upgraded.settings.internshipSeason,'暑假')
  assert.equal(activePeriod('2026-11-16',upgraded.settings.periods),'semester')
  assert.equal(activePeriod('2026-11-18',upgraded.settings.periods),'exam')
  const declined=importBackup(JSON.stringify({...initial,settings:{...legacy,examPromptSeen:true}}))
  assert.deepEqual(declined.settings.periods,[custom])
  upgraded.settings.periods=[]
  upgraded.settings.internshipSeason=''
  assert.deepEqual(importBackup(exportBackup(upgraded)),upgraded)
})

test('新安裝的實習與國考維持期在當地換日後依起訖切換',()=>{
  const {periods}=createInitialState().settings
  for (const [date,type] of [['2028-01-31','semester'],['2028-02-01','internship'],
    ['2029-01-31','internship'],['2029-02-01','exam'],['2029-07-31','exam'],['2029-08-01','semester']]) {
    assert.equal(activePeriod(date,periods),type)
  }
})
test('舊版 v2 補上未安排的維持期，保留自選假期及使用者之後刪改的日期',()=>{
  const old=createInitialState('2027-01-01')
  old.curriculum.day=5
  const custom={type:'vacation' as const,start:'2028-12-01',end:'2029-02-02'}
  const raw={...old,settings:{...old.settings,periodDefaultsRevision:undefined,periods:[custom]}}
  const state=importBackup(JSON.stringify(raw))
  assert.equal(state.curriculum.day,5)
  assert.deepEqual(state.settings.periods,[{type:'internship',start:'2028-02-01',end:'2028-11-30'},custom,{type:'exam',start:'2029-02-03',end:'2029-07-31'}])
  state.settings.periods.splice(0,1)
  assert.deepEqual(importBackup(exportBackup(state)).settings.periods,state.settings.periods)
})
test('自訂短期一般學期可以精確蓋掉維持期中間一段',()=>{
  const next=replacePeriod([{type:'internship',start:'2028-02-01',end:'2029-01-31'}],{type:'semester',start:'2028-07-01',end:'2028-07-31'})
  assert.equal(activePeriod('2028-06-30',next),'internship')
  assert.equal(activePeriod('2028-07-15',next),'semester')
  assert.equal(activePeriod('2028-08-01',next),'internship')
})

test('完整還原課表、設定、複習及跨天進度', () => {
  const state = createInitialState('2026-11-13')
  state.settings.officeAsked = true
  state.settings.officeReply = '下學期洽系辦確認梯次'
  state.school.requirements[0].done = true
  state.sessions.push({id:'s1',day:'2026-11-13',energy:'normal',period:'semester',words:['nurse'],sentenceId:'u1d1',rating:'correct',spokenIds:['u1d1'],translations:[{sentenceId:'u1d1',grammar:['be 動詞'],rating:'correct',revealed:false}]})
  state.cards.push({id:'nurse',box:2,lastDay:'2026-11-13',due:'2026-11-15',mastered:false})
  state.reviewEvents.push({id:'nurse',gap:4,day:'2026-11-13',remembered:true,shownAnswer:false})
  state.curriculum.day=2
  state.knownWords.push('bed')
  state.customWords.push({en:'bed',zh:'床',level:1})
  state.checks['plan.2026.english']=true
  const restored=importBackup('\uFEFF'+exportBackup(state))
  assert.deepEqual(restored,state)
  assert.equal(createInitialState().school.requirements[0].done,false)
})
test('舊版進度補上新增欄位並保留練習位置', () => {
  const old={version:1,startedDay:'2026-11-13',sessions:[],curriculum:{unit:2,day:4},settings:{theme:'light'}}
  const restored=importBackup(JSON.stringify(old))
  assert.equal(restored.version,2)
  assert.equal(restored.settings.theme,'light')
  assert.equal(restored.curriculum.day,4)
  assert.equal(restored.curriculum.unit,2)
  assert.deepEqual(restored.cards,[])
})
test('拒絕損壞或版本不符的備份', () => {
  assert.throws(()=>importBackup('null'))
  assert.throws(()=>importBackup('{'))
  assert.throws(()=>importBackup('{"version":5}'))
  assert.throws(()=>importBackup('{"version":1}'))
  const state=createInitialState('2026-11-13')
  assert.throws(()=>importBackup(JSON.stringify({...state,startedDay:'2026-02-30'})))
  assert.throws(()=>importBackup(JSON.stringify({...state,sessions:[{id:'x'}]})))
  assert.throws(()=>importBackup(JSON.stringify({...state,settings:{...state.settings,periods:[{start:'2026-11-19',end:'2026-11-13',type:'exam'}]}})))
  assert.throws(()=>importBackup(JSON.stringify({...state,school:{...state.school,classes:[42]}})))
})
test('保留損壞原檔，還原後接續最新分頁進度，額滿時仍可匯出',async () => {
  let full=false
  const disk=new Map<string,string>([[STORAGE_KEY,'{']])
  const storage={
    getItem:(key:string)=>disk.get(key) ?? null,
    setItem:(key:string,value:string)=>{
      if (full) throw new Error('quota')
      disk.set(key,value)
    },
  }
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage})
  async function flushed() {
    if (globalThis.navigator?.locks) await navigator.locks.request(STORAGE_KEY,()=>undefined)
  }
  assert.match(getSnapshot().storageError ?? '',/原有進度/)
  updateStore(prev=>({...prev,knownWords:['my']}))
  await flushed()
  assert.equal(disk.get(STORAGE_KEY),'{')
  restoreBackup(exportBackup(createInitialState('2026-11-13')))
  await flushed()
  const other=importBackup(disk.get(STORAGE_KEY)!)
  other.knownWords=['hello']
  disk.set(STORAGE_KEY,exportBackup(other))
  updateStore(prev=>({...prev,knownWords:[...prev.knownWords,'world']}))
  await flushed()
  assert.deepEqual(importBackup(disk.get(STORAGE_KEY)!).knownWords,['hello','world'])
  full=true
  updateStore(prev=>({...prev,knownWords:[...prev.knownWords,'today']}))
  await flushed()
  const snapshot=getSnapshot()
  assert.match(snapshot.storageError ?? '',/未能儲存/)
  assert.deepEqual(importBackup(exportBackup(snapshot.state)).knownWords,['hello','world','today'])
  other.knownWords=['another-tab']
  disk.set(STORAGE_KEY,exportBackup(other))
  full=false
  updateStore(prev=>({...prev,knownWords:[...prev.knownWords,'evening']}))
  await flushed()
  assert.match(getSnapshot().storageError ?? '',/另一個分頁/)
  assert.deepEqual(importBackup(disk.get(STORAGE_KEY)!).knownWords,['another-tab'])
  assert.deepEqual(getSnapshot().state.knownWords,['hello','world','today','evening'])
})

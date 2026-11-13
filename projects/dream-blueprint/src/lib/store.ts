import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { addDays, dayKey, type PeriodRange } from './progress'
import { defaultSchool } from './school'

export type Page = 'today' | 'practice' | 'plan' | 'history' | 'rivals' | 'settings'
const str = z.string().max(50000)
const id = z.string().min(1).max(512)
const day = z.iso.date()
const weekday = z.number().int().min(0).max(6)
const natural = z.number().int().nonnegative()
const stringList = z.array(str)
const energy = z.enum(['low', 'normal', 'high'])
const period = z.enum(['semester', 'exam', 'internship', 'vacation'])
const rating = z.enum(['correct','minor','again'])
const customWord = z.object({ en: id, zh: str, level: z.number().int().min(1).max(6).optional() })
const interval = z.object({type:period,start:day,end:z.union([day,z.literal('')])})
  .refine(r => !r.end || r.end >= r.start)
const schoolSchema = z.object({
  verifiedOn:day,schoolName:str,program:str,className:str,studentStatus:str,term:str,
  requiredCredits:natural,acceptedCredits:natural,transferCourses:natural,currentCourses:natural,
  currentCredits:natural,weeklyPeriods:natural,graduation:str,firstStep:str,notes:stringList,
  classes:z.array(z.object({id,weekday,start:str,end:str,label:str})),
  study:z.array(z.object({weekday,minutes:natural,time:str})),
  events:z.array(z.object({id,day,label:str,kind:str})),
  requirements:z.array(z.object({id,group:str,label:str,done:z.boolean()})),
})
const sessions = z.array(z.object({
  id,day,energy,period,sentenceId:str,feedback:z.enum(['right','much','more']).optional(),
  words:stringList,rating:rating.optional(),advanced:z.boolean().optional(),
  translations:z.array(z.object({sentenceId:id,rating,grammar:stringList,revealed:z.boolean()})).optional(),
  spokenIds:stringList.optional(),
}))
const settingsSchema = z.object({
  theme:z.enum(['dark','light']),why:str,rivalsEnabled:z.boolean(),
  taunt:z.enum(['off','gentle','bold']),periods:z.array(interval),examPromptSeen:z.boolean(),
  showStreak:z.boolean(),speechRate:z.number().min(0.25).max(3),regularDays:z.array(weekday),
  restDays:z.array(weekday),officeAsked:z.boolean(),officeReply:str,
  periodDefaultsRevision:z.union([z.literal(0),z.literal(1)]).default(0),
  profileRevision:z.union([z.literal(0),z.literal(1)]).default(0),
  internshipSeason:str.default(''),
})
const safeKey = z.string().min(1).max(512).refine(s => !['__proto__','constructor','prototype'].includes(s))
const schema = z.object({
  version:z.literal(2),startedDay:day,settings:settingsSchema,school:schoolSchema,sessions,
  workload:z.object({extraWords:natural,lastAssessment:z.union([day,z.literal('')]),lastReduction:z.union([day,z.literal('')])}).default({extraWords:0,lastAssessment:'',lastReduction:''}),
  cards:z.array(z.object({id,box:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5)]),lastDay:day,due:day,mastered:z.boolean()})),
  reviewEvents:z.array(z.object({id,day,gap:natural,remembered:z.boolean(),shownAnswer:z.boolean()})),
  curriculum:z.object({unit:z.number().int().min(1).max(43),day:z.number().int().min(1).max(6),retry:natural,stableUnits:z.array(z.number().int().min(1).max(42))}),
  knownWords:stringList,learningWords:stringList,customWords:z.array(customWord),
  checks:z.record(safeKey,z.boolean()),notes:z.record(safeKey,str),flagged:stringList,
})
export type AppState = z.infer<typeof schema>
export type Session = AppState['sessions'][number]
export type SchoolData = AppState['school']
export type PageProps = {state:AppState, update:(updater:(prev:AppState)=>AppState)=>void, navigate:(page:Page)=>void}
export type {Energy, Period} from './progress'
export const STORAGE_KEY = 'dream-blueprint.v2'
const oldKey = 'dream-blueprint.v1'
const novemberExam:PeriodRange = {type:'exam',start:'2026-11-13',end:'2026-11-23'}

const plannedMaintenance:PeriodRange[] = [
  {type:'internship',start:'2028-02-01',end:'2029-01-31'},
  {type:'exam',start:'2029-02-01',end:'2029-07-31'},
]
function outside(range:PeriodRange,cut:PeriodRange):PeriodRange[] {
  if ((range.end && range.end < cut.start) || (cut.end && cut.end < range.start)) return [range]
  const parts:PeriodRange[] = []
  if (range.start < cut.start) parts.push({...range,end:addDays(cut.start,-1)})
  if (cut.end && (!range.end || cut.end < range.end)) parts.push({...range,start:addDays(cut.end,1)})
  return parts
}
export function replacePeriod(ranges:readonly PeriodRange[],chosen:PeriodRange):PeriodRange[] {
  return [...ranges.flatMap(r=>outside(r,chosen)),chosen].sort((a,b)=>a.start.localeCompare(b.start))
}
function fillPeriodGaps(ranges:PeriodRange[],planned:PeriodRange[]) {
  let additions=planned
  for (const existing of ranges) additions=additions.flatMap(proposed=>outside(proposed,existing))
  return [...ranges,...additions].sort((a,b)=>a.start.localeCompare(b.start))
}

export function createInitialState(startedDay=dayKey()):AppState {
  return {
    version:2,startedDay,
    workload:{extraWords:0,lastAssessment:'',lastReduction:''},
    settings:{
      theme:'dark',why:'',rivalsEnabled:true,taunt:'gentle',showStreak:false,speechRate:0.85,
      regularDays:[2,4,6],restDays:[0,5],officeAsked:false,officeReply:'',examPromptSeen:true,
      periodDefaultsRevision:1,profileRevision:1,internshipSeason:'暑假',
      periods:[{...novemberExam},{type:'exam',start:'2027-01-03',end:'2027-01-16'},{type:'vacation',start:'2027-01-17',end:'2027-02-20'},...plannedMaintenance.map(r=>({...r}))],
    },
    school:JSON.parse(JSON.stringify(defaultSchool)),sessions:[],cards:[],reviewEvents:[],
    curriculum:{unit:1,day:1,retry:0,stableUnits:[]},knownWords:[],learningWords:[],customWords:[],
    checks:{},notes:{},flagged:[],
  }
}
export function exportBackup(state:AppState):string {
  return JSON.stringify(schema.parse(state),null,2)
}
export function importBackup(raw:string):AppState {
  if (raw.length > 24_000_000) throw new Error('備份超過 24 MB，請確認選取的檔案。')
  let data
  try { data = JSON.parse(raw.replace(/^\uFEFF/,'')) } catch { throw new Error('檔案不是有效的 JSON，請選取夢想藍圖匯出的備份。') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('備份需要包含版本與進度。')
  if (data.version === 1) {
    // v1 has sessions and a course cursor, but no review history or separate mood settings.
    if (!Array.isArray(data.sessions) || !data.curriculum || typeof data.startedDay !== 'string')
      throw new Error('舊版備份缺少練習紀錄或課表位置。')
    const defaults = createInitialState(data.startedDay)
    data = {...defaults,...data,version:2,settings:{...defaults.settings,examPromptSeen:false,...data.settings,periodDefaultsRevision:0,profileRevision:0},
      curriculum:{...defaults.curriculum,...data.curriculum}}
  }
  if (data.version !== 2) throw new Error('備份版本不相容，請使用支援此版本的夢想藍圖。')
  const result = schema.safeParse(data)
  if (!result.success) {
    const path = result.error.issues[0]?.path.join('.') || '進度'
    throw new Error('備份資料不完整，請檢查欄位「'+path+'」。')
  }
  const state=result.data
  if (state.settings.periodDefaultsRevision === 0) {
    state.settings.periods=fillPeriodGaps(state.settings.periods,plannedMaintenance)
    state.settings.periodDefaultsRevision=1
  }
  if (state.settings.profileRevision === 0) {
    if (!state.settings.examPromptSeen) state.settings.periods=fillPeriodGaps(state.settings.periods,[novemberExam])
    state.settings.examPromptSeen=true
    state.settings.internshipSeason=state.settings.internshipSeason || '暑假'
    state.settings.profileRevision=1
  }
  return state
}

interface Snapshot {state:AppState,storageError:string|null}
let live:Snapshot | undefined
let rawLoaded:string|null = null
let dirty = false
let unreadable = false
const listeners = new Set<()=>void>()
const emit = () => listeners.forEach(fn=>fn())
export function getSnapshot():Snapshot {
  if (live) return live
  const initial = createInitialState()
  try {
    const current = localStorage.getItem(STORAGE_KEY)
    const raw = current ?? localStorage.getItem(oldKey)
    rawLoaded = raw
    if (raw === null) {
      const serialized = JSON.stringify(initial)
      localStorage.setItem(STORAGE_KEY,serialized)
      rawLoaded=serialized
      return live = {state:initial,storageError:null}
    }
    const state = importBackup(raw)
    const migrated = JSON.stringify(state)
    if (current !== migrated) {
      try { localStorage.setItem(STORAGE_KEY,migrated); rawLoaded=migrated }
      catch { return live = {state,storageError:'瀏覽器尚未儲存新版進度，請匯出備份。'} }
    }
    return live = {state,storageError:null}
  } catch {
    unreadable = rawLoaded !== null
    return live = {state:initial,storageError:unreadable
      ? '原有進度無法讀取，已保留原檔。請到設定匯入有效備份。'
      : '目前無法使用瀏覽器儲存空間，請在關閉前匯出備份。'}
  }
}
function refreshStorage() {
  if (dirty) return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === rawLoaded) return
    const next = raw === null ? createInitialState() : importBackup(raw)
    rawLoaded = raw
    unreadable = false
    live = {state:next,storageError:null}
  } catch {
    live = {state:getSnapshot().state,storageError:'另一個分頁的資料無法讀取，已保留目前進度。'}
    unreadable = true
  }
  emit()
}
function onStorage(event:StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY) refreshStorage()
}
function subscribe(fn:()=>void) {
  if (!listeners.size) window.addEventListener('storage',onStorage)
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
    if (!listeners.size) window.removeEventListener('storage',onStorage)
  }
}
function commit(updater:(prev:AppState)=>AppState,replace=false) {
  getSnapshot()
  refreshStorage()
  const prev = getSnapshot().state
  const state = updater(prev)
  if (prev === state && !dirty) return
  // A quota failure leaves newer changes in memory. A second tab may have
  // saved its own changes meanwhile; preserve both versions for recovery.
  if (dirty && !replace && !unreadable) {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== rawLoaded) {
        live={state,storageError:'另一個分頁已儲存不同進度。本分頁保留在記憶體，請先匯出備份，再選擇要還原的版本。'}
        emit()
        return
      }
    } catch { /* The write below reports a storage error and preserves memory. */ }
  }
  if (unreadable && !replace) {
    live = {state,storageError:'原有資料已保留，本次更動暫存在記憶體。請匯出備份，或從設定匯入有效備份。'}
    dirty=true
  } else {
    try {
      const raw=JSON.stringify(state)
      localStorage.setItem(STORAGE_KEY,raw)
      rawLoaded=raw
      dirty=false
      unreadable=false
      live={state,storageError:null}
    } catch {
      dirty=true
      live={state,storageError:'瀏覽器未能儲存本次更動。請在關閉前到設定匯出備份。'}
    }
  }
  emit()
}
function apply(updater:(prev:AppState)=>AppState,replace=false) {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    void navigator.locks.request(STORAGE_KEY,()=>commit(updater,replace))
  } else commit(updater,replace)
}
export function restoreBackup(raw:string) {
  const state=importBackup(raw)
  apply(()=>state,true)
}
export function updateStore(updater:(prev:AppState)=>AppState) { apply(updater) }
export function useAppStore() {
  const snapshot=useSyncExternalStore(subscribe,getSnapshot,getSnapshot)
  return {...snapshot,update:updateStore}
}

import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { addDays, dayKey, type PeriodRange } from './progress'
import { defaultSchool } from './school'
import contentUpdates from '../data/content-updates.json'
import { legacyLadder, migrateWritingProgress, writingMigrationKey } from './writing'
import { compactState } from './compact'
import { rescoreExams } from './examKeys'
import { cloudBase, cloudScope, driveConnected, localStamp, setCloudBase } from './drive'
import { nurseSkillKey } from './homographs'
import { skillKey } from './wordSkills'

export type Page = 'today' | 'practice' | 'plan' | 'history' | 'rivals' | 'settings'
const str = z.string().max(50000)
/** One note is one record that keeps growing (a unit's evidence with answers waiting for a check, a day's lesson, word
 *  records). It may be as big as the whole saved progress, which the browser keeps under about 5 MB, so every note the
 *  app could save also reads back (and a backup or a merge of two devices round-trips). */
export const NOTE_LIMIT = 5_000_000
const noteText = z.string().max(NOTE_LIMIT)
const id = z.string().min(1).max(512)
const day = z.iso.date()
const weekday = z.number().int().min(0).max(6)
const natural = z.number().int().nonnegative()
const safeKey = z.string().min(1).max(512).refine(s => !['__proto__','constructor','prototype'].includes(s))
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
  requirements:z.array(z.object({id,group:str,label:str,done:z.boolean(),modifiedAt:natural.optional()})),
  requirementsRemoved:z.record(safeKey,natural).optional(),
})
const sessions = z.array(z.object({
  id,day,energy,period,sentenceId:str,feedback:z.enum(['right','much','more']).optional(),
  words:stringList,rating:rating.optional(),advanced:z.boolean().optional(),
  translations:z.array(z.object({sentenceId:id,rating,grammar:stringList,revealed:z.boolean(),verified:z.boolean().optional()})).optional(),
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
const schema = z.object({
  version:z.literal(2),startedDay:day,settings:settingsSchema,school:schoolSchema,sessions,
  workload:z.object({extraWords:natural,lastAssessment:z.union([day,z.literal('')]),lastReduction:z.union([day,z.literal('')])}).default({extraWords:0,lastAssessment:'',lastReduction:''}),
  cards:z.array(z.object({id,box:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4),z.literal(5),z.literal(6),z.literal(7),z.literal(8),z.literal(9),z.literal(10)]),lastDay:day,due:day,mastered:z.boolean(),
    // FSRS memory state (stability in days, difficulty 1–10); cards from before FSRS have none until their next review.
    s:z.number().positive().max(100000).optional(),d:z.number().min(1).max(10).optional()})),
  reviewEvents:z.array(z.object({id,day,gap:natural,remembered:z.boolean(),shownAnswer:z.boolean()})),
  // Units come from the published course (42 + bridge units, more later); the cap only rejects nonsense.
  curriculum:z.object({unit:z.number().int().min(1).max(200),day:z.number().int().min(1).max(6),retry:natural,stableUnits:z.array(z.number().int().min(1).max(200))}),
  knownWords:stringList,learningWords:stringList,customWords:z.array(customWord),
  checks:z.record(safeKey,z.boolean()),notes:z.record(safeKey,noteText),flagged:stringList,
})
export type AppState = z.infer<typeof schema>
export type Session = AppState['sessions'][number]
export type SchoolData = AppState['school']
export type PageProps = {state:AppState, update:(updater:(prev:AppState)=>AppState)=>void|Promise<void>, navigate:(page:Page)=>void}
export type {Energy, Period} from './progress'
export const STORAGE_KEY = 'dream-blueprint.v2'
const oldKey = 'dream-blueprint.v1'
const novemberExam:PeriodRange = {type:'exam',start:'2026-11-13',end:'2026-11-19'}

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
      regularDays:[1,2,3,4,5,6],restDays:[0],officeAsked:false,officeReply:'',examPromptSeen:true,
      periodDefaultsRevision:1,profileRevision:1,internshipSeason:'暑假',
      periods:[{...novemberExam},{type:'exam',start:'2027-01-03',end:'2027-01-16'},{type:'vacation',start:'2027-01-17',end:'2027-02-20'},...plannedMaintenance.map(r=>({...r}))],
    },
    school:JSON.parse(JSON.stringify(defaultSchool)),sessions:[],cards:[],reviewEvents:[],
    curriculum:{unit:1,day:1,retry:0,stableUnits:[]},knownWords:[],learningWords:[],customWords:[],
    // A new start has nothing to reschedule, so every material update counts as already applied.
    checks:{},notes:{'migrate.study30':'1','migrate.daily90':'1','migrate.exam-keys-r038':'1',[writingMigrationKey]:'[]',...Object.fromEntries(contentUpdates.flatMap(u=>[['content.'+u.id,'0'],[contentNoticeKey(u.id),'0']]))},flagged:[],
  }
}
export function exportBackup(state:AppState, exportedAt?:Date):string {
  const backup = schema.parse(state)
  return JSON.stringify(exportedAt ? {...backup,exportedAt:exportedAt.toISOString()} : backup,null,2)
}
export function importBackup(raw:string):AppState {
  return readBackup(raw).state
}
export function readBackup(raw:string):{state:AppState; exportedAt?:number} {
  if (raw.length > 24_000_000) throw new Error('備份超過 24 MB，請確認選取的檔案。')
  let data
  try { data = JSON.parse(raw.replace(/^\uFEFF/,'')) } catch { throw new Error('檔案不是有效的 JSON，請選取夢想藍圖匯出的備份。') }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('備份需要包含版本與進度。')
  const exportedAt = typeof data.exportedAt === 'string' ? Date.parse(data.exportedAt) : NaN
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
  // Regular study days grew from 8 to 30 minutes (2026-11 plan revision).
  if (!state.notes['migrate.study30']) {
    state.school.study=state.school.study.map(s=>s.minutes===8?{...s,minutes:30}:s)
    state.notes={...state.notes,'migrate.study30':'1'}
  }
  // 2026-11 plan: 1.5 hours every day Monday to Saturday instead of 30 minutes three times a week. Only the old
  // defaults move; days or minutes changed by hand stay as they are.
  if (!state.notes['migrate.daily90']) {
    const same = (a:readonly number[],b:readonly number[]) => a.length===b.length && a.every((x,i)=>x===b[i])
    if (same([...state.settings.regularDays].sort(),[2,4,6]) && same([...state.settings.restDays].sort(),[0,5])) {
      state.settings.regularDays=[1,2,3,4,5,6]
      state.settings.restDays=[0]
    }
    const oldStudy=[0,2,30,2,30,0,30]
    if (state.school.study.length===7 && state.school.study.every(s=>s.minutes===oldStudy[s.weekday]))
      state.school.study=state.school.study.map(s=>({...s,minutes:s.weekday===0?0:90}))
    state.notes={...state.notes,'migrate.daily90':'1'}
  }
  state.notes=migrateWritingProgress(legacyLadder,state.notes)
  // Six answer keys of two 94 學測 passages were wrong: saved picks are scored again with the corrected keys, once.
  if (!state.notes['migrate.exam-keys-r038']) state.notes={...rescoreExams(state.notes),'migrate.exam-keys-r038':'1'}
  applyContentUpdates(state)
  // The 2026-11 midterms actually ended on 11/19; the old default ran to 11/23.
  for (const r of state.settings.periods) if (r.type==='exam'&&r.start==='2026-11-13'&&r.end==='2026-11-23') r.end='2026-11-19'
  // While Drive is connected, only the confirmed archive operation can remove old details.
  return {state:compactState(state,dayKey(),undefined,driveConnected()),
    exportedAt:Number.isFinite(exportedAt) ? exportedAt : undefined}
}

export const contentNoticeKey = (id:string) => 'content.notice.' + id

function savedRecord(raw:string|null|undefined):Record<string,unknown> {
  try {
    const record:unknown = JSON.parse(raw ?? '{}')
    return record && typeof record === 'object' && !Array.isArray(record) ? record as Record<string,unknown> : {}
  } catch { return {} }
}
function recordOnOrBefore(raw:string|undefined, date:string) {
  const record = savedRecord(raw)
  const best = record.best as {day?:unknown}|undefined
  return [record.day, best?.day].some(day => typeof day === 'string' && day <= date)
}

/** Reschedule affected cards once. Report completed readings, listening and nursing vocabulary separately,
 *  including on devices that previously recorded a correction with zero affected cards. */
export function applyContentUpdates(state:AppState, today=dayKey()) {
  const updates:readonly {id:string,date:string,words:string[],sentences:string[],passages?:string[],listening?:string[],nursingWords?:string[]}[] = contentUpdates
  for (const u of updates) {
    const key='content.'+u.id
    if (state.notes[key]===undefined) {
      const ids=new Set([...u.words.map(w=>'word:'+w),...u.sentences])
      let touched=0
      state.cards=state.cards.map(c=>{
        if (!ids.has(c.id)) return c
        touched++
        const due=c.lastDay>=today ? addDays(today,1) : c.due>today ? today : c.due
        return {...c,due,mastered:false}
      })
      state.notes={...state.notes,[key]:String(touched)}
    }
    const notice = contentNoticeKey(u.id)
    if (state.notes[notice]!==undefined) continue
    const readings = (u.passages ?? []).filter(id =>
      recordOnOrBefore(state.notes['read.'+id],u.date) || recordOnOrBefore(state.notes['exam.read.'+id],u.date))
    const dialogues = (u.listening ?? []).filter(id => recordOnOrBefore(state.notes['nurse.listen.'+id],u.date))
    const nursingWords = (u.nursingWords ?? []).filter(word =>
      Object.values(savedRecord(state.notes[skillKey(nurseSkillKey(word))])).some(day => typeof day === 'string' && day <= u.date))
    state.notes={...state.notes,[notice]:String(readings.length + dialogues.length + nursingWords.length)}
  }
  return state
}

interface Snapshot {state:AppState,storageError:string|null}
interface StoredProgress {current:string|null, legacy:string|null}
interface StoredCloud {scope:string, base:number}
let live:Snapshot | undefined
let loaded:StoredProgress|undefined
let modified = 0
let storedCloud:StoredCloud|null = null
let dirty = false
let unreadable = false
const listeners = new Set<()=>void>()
const emit = () => listeners.forEach(fn=>fn())
const unsaved = '瀏覽器未能儲存本次更動。請在關閉前到設定下載備份。'
export const MODIFIED_KEY = 'dream-blueprint.modified'

function readStored():StoredProgress {
  const current = localStorage.getItem(STORAGE_KEY)
  return {current, legacy:current === null ? localStorage.getItem(oldKey) : null}
}
const matchesStored = (a:StoredProgress|undefined,b:StoredProgress) => !!a && a.current===b.current && a.legacy===b.legacy
const validVersion = (value:unknown):value is number => typeof value==='number' && Number.isSafeInteger(value) && value>=0
function readLegacyModified() {
  try {
    const legacy = Number(localStorage.getItem(MODIFIED_KEY))
    return validVersion(legacy) ? legacy : 0
  } catch { return 0 }
}
function readTracking(raw:string|null) {
  const meta = savedRecord(raw)
  const cloud = meta.storageCloud as Partial<StoredCloud>|null|undefined
  storedCloud = cloud && typeof cloud.scope==='string' && validVersion(cloud.base) ? {scope:cloud.scope,base:cloud.base} : null
  modified = validVersion(meta.storageModified) ? meta.storageModified : readLegacyModified()
}
function currentCloudBase(scope:string|null) {
  if (scope===null) return 0
  if (storedCloud) return storedCloud.scope===scope ? storedCloud.base : 0
  const legacy = cloudBase()
  return validVersion(legacy) ? legacy : 0
}
export function getSnapshot():Snapshot {
  if (live) return live
  const initial = createInitialState()
  try {
    loaded = readStored()
    const raw = loaded.current ?? loaded.legacy
    // Migrations are read-only until the next successful save. Keeping the raw source also preserves v1
    // progress when v2 has never fit on this device.
    const state = raw === null ? initial : importBackup(raw)
    readTracking(loaded.current)
    return live = {state,storageError:null}
  } catch {
    unreadable = loaded !== undefined && (loaded.current !== null || loaded.legacy !== null)
    return live = {state:initial,storageError:unreadable
      ? '原有進度無法讀取，已保留原檔。請到設定匯入有效備份。'
      : '目前無法使用瀏覽器儲存空間，請在關閉前匯出備份。'}
  }
}
function refreshStorage() {
  if (dirty) return
  try {
    const stored = readStored()
    if (matchesStored(loaded,stored) && !unreadable && !live?.storageError) return
    const raw = stored.current ?? stored.legacy
    const next = raw === null ? createInitialState() : importBackup(raw)
    loaded = stored
    readTracking(stored.current)
    unreadable = false
    live = {state:next,storageError:null}
  } catch {
    live = {state:getSnapshot().state,storageError:'另一個分頁的資料無法讀取，已保留目前進度。'}
    unreadable = true
  }
  emit()
}
function onStorage(event:StorageEvent) {
  if (event.key === null || event.key === STORAGE_KEY || event.key === oldKey) refreshStorage()
}
function subscribe(fn:()=>void) {
  if (!listeners.size) window.addEventListener('storage',onStorage)
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
    if (!listeners.size) window.removeEventListener('storage',onStorage)
  }
}
function withStoreLock<T>(run:()=>T):Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(STORAGE_KEY,run)
  try { return Promise.resolve(run()) } catch (error) { return Promise.reject(error) }
}
function currentSnapshot() {
  getSnapshot()
  refreshStorage()
  return getSnapshot()
}
function persist(state:AppState, options:{stamp?:number, cloudBase?:number, replace?:boolean}={}) {
  if (unreadable && !options.replace)
    throw new Error('原有資料已保留。請先下載備份，或從設定匯入有效備份。')
  if (!options.replace) {
    let sameVersion = false
    try { sameVersion = matchesStored(loaded,readStored()) } catch { throw new Error(unsaved) }
    if (!sameVersion)
      throw new Error('另一個分頁已儲存不同進度。請先下載這台的備份，再選擇要還原的版本。')
  }

  // Progress, its timestamp and its cloud base share one write. A full disk cannot save only part.
  const scope = cloudScope()
  const base = currentCloudBase(scope)
  const stamp = options.stamp ?? localStamp(Date.now(),Math.max(modified,base))
  const cloud = scope===null ? null : {scope,base:options.cloudBase ?? base}
  if (!validVersion(stamp) || (cloud && !validVersion(cloud.base)))
    throw new Error('進度的版本讀取有誤，請重新開啟網站後再試。')
  const raw = JSON.stringify({...state,storageModified:stamp,...(cloud ? {storageCloud:cloud} : {})})
  try { localStorage.setItem(STORAGE_KEY,raw) } catch { throw new Error(unsaved) }
  try { localStorage.setItem(MODIFIED_KEY,String(stamp)) } catch { /* Compatibility with older pages. */ }
  if (options.cloudBase !== undefined) setCloudBase(options.cloudBase)
  loaded = {current:raw,legacy:null}
  modified = stamp
  storedCloud = cloud
  dirty = false
  unreadable = false
  live = {state,storageError:null}
  emit()
  return state
}

export function readStoreForCloud() {
  return withStoreLock(()=>{
    const snapshot = currentSnapshot()
    const scope = cloudScope()
    return {state:snapshot.state,modified,base:currentCloudBase(scope),scope,persisted:!dirty && !unreadable && !snapshot.storageError}
  })
}
/** An unsaved edit may fill browser storage. Allow archiving it if our version of the underlying save is still current. */
export function readStoreForArchive() {
  return withStoreLock(()=>{
    const {state,storageError} = currentSnapshot()
    if (unreadable || (!dirty && storageError) || !matchesStored(loaded,readStored())) return null
    return {state,storageFull:dirty}
  })
}
/** Acknowledging the server version must not change which browser snapshot counts as saved. */
export function recordCloudSave(version:number, sentModified:number, sentBase:number, sentScope?:string|null) {
  return withStoreLock(()=>{
    const snapshot = currentSnapshot()
    const scope = cloudScope()
    if (dirty || unreadable || snapshot.storageError || currentCloudBase(scope)!==sentBase || modified<sentModified ||
        (sentScope!==undefined && scope!==sentScope)) return false
    const stamp = modified===sentModified ? version : Math.max(modified,version+1)
    persist(snapshot.state,{stamp,cloudBase:version})
    return true
  })
}
export async function restoreBackup(raw:string, stamp?:number, options:{cloudBase?:number, expected?:AppState, scope?:string|null}={}) {
  const state = importBackup(raw)
  return withStoreLock(()=>{
    const {state:current} = currentSnapshot()
    if (options.scope!==undefined && options.scope!==cloudScope()) throw new Error('雲端連線已經切換，請再試一次。')
    if (options.expected && current!==options.expected)
      throw new Error('還原前有新的學習進度，請重新確認再還原。')
    if (options.expected && !matchesStored(loaded,readStored()))
      throw new Error('另一個分頁已有新進度。請先下載本分頁的備份，重新開啟後再還原。')
    return persist(state,{cloudBase:options.cloudBase,stamp,replace:true})
  })
}
/** A cloud pull may replace only the version it observed, after confirming it did not miss unsaved answers. */
export async function replaceIfUnchanged(raw:string, stamp:number, seen:number, seenBase?:number, seenScope?:string|null):Promise<boolean> {
  const state=importBackup(raw)
  return withStoreLock(()=>{
    const snapshot = currentSnapshot()
    const scope = cloudScope()
    if (dirty || unreadable || snapshot.storageError || modified!==seen || (seenBase!==undefined && currentCloudBase(scope)!==seenBase) ||
        (seenScope!==undefined && scope!==seenScope)) return false
    persist(state,{stamp,...(seenBase===undefined?{}:{cloudBase:stamp})})
    return true
  })
}
/** Timestamp of the saved progress. Changes held solely in memory leave it alone. */
export function localModified() {
  currentSnapshot()
  return modified
}
export function updateStore(updater:(prev:AppState)=>AppState) {
  return withStoreLock(()=>{
    const prev = currentSnapshot().state
    const state = updater(prev)
    if (prev===state && !dirty) return
    try { persist(state) } catch (error) {
      dirty = true
      live = {state,storageError:error instanceof Error ? error.message : unsaved}
      emit()
    }
  }).catch(()=>{
    live = {state:getSnapshot().state,storageError:'無法寫入本次更動，請再試一次。'}
    emit()
  })
}
/** Run once against the latest local progress and resolve only after a successful browser save. */
export function updateStoreNow(updater:(prev:AppState)=>AppState, stamp?:number):Promise<AppState> {
  return withStoreLock(()=>{
    const {state:prev,storageError}=currentSnapshot()
    const state=updater(prev)
    return prev===state && !dirty && !storageError && stamp===undefined ? prev : persist(state,{stamp})
  })
}
export function useAppStore() {
  const snapshot=useSyncExternalStore(subscribe,getSnapshot,getSnapshot)
  return {...snapshot,update:updateStore}
}

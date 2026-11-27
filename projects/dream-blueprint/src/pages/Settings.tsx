import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { BookA, BookOpen, Bot, CalendarDays, ChevronDown, Crosshair, DatabaseBackup, Flag, GraduationCap, KeyRound, Brain, ListChecks, Moon, Sun, Telescope, Trophy, type LucideIcon } from 'lucide-react'
import ScenePhoto from '../components/ScenePhoto'
import SchoolSettings from '../components/SchoolSettings'
import VocabScreen from '../components/VocabScreen'
import AIHandoff from '../components/AIHandoff'
import ClaudeConnect from '../components/ClaudeConnect'
import MemoryPanel from '../components/MemoryPanel'
import WeakPanel from '../components/WeakPanel'
import { topWeak } from '../lib/weakPoints'
import { useMemory } from '../lib/memory'
import { wordKey } from '../lib/vocab'
import quizBank from '../data/quiz.json'
import './settings.css'

type ImportedWord = { en: string; zh: string; level?: number }

/** Pick a separator for each pasted record, keeping punctuation inside a definition and quoted cells intact. */
function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let parts: string[] = [], dividers: string[] = [], field = '', quoted = false
  function finishRow() {
    parts.push(field)
    const spaceSeparated = /^[A-Za-z].*\s+[\u3400-\u9fff]/u.test(parts[0])
    const separator = dividers.includes('\t') ? '\t' : spaceSeparated ? null : dividers[0]
    const cells: string[] = []
    let value = parts[0]
    for (let i = 0; i < dividers.length; i++) {
      if (dividers[i] === separator) {
        cells.push(value.trim())
        value = parts[i + 1]
      } else value += dividers[i] + parts[i + 1]
    }
    cells.push(value.trim())
    if (cells.some(Boolean)) rows.push(cells)
    parts = []
    dividers = []
    field = ''
  }
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++ }
      else quoted = !quoted
    } else if (!quoted && [',', '\t', '，'].includes(char)) {
      parts.push(field)
      dividers.push(char)
      field = ''
    } else if (!quoted && (char === '\n' || char === '\r')) {
      finishRow()
      if (char === '\r' && text[index + 1] === '\n') index++
    } else field += char
  }
  if (quoted) throw new Error('有一格的引號尚未成對，請檢查單字表。')
  finishRow()
  return rows
}

export function parseVocabulary(input: string): ImportedWord[] {
  const rows = csvRows(input.replace(/^\uFEFF/, ''))
  const headers = rows[0]?.map(field => field.toLowerCase()) ?? []
  const enCol = headers.findIndex(s => ['英文','單字','word','en','english'].includes(s))
  const zhCol = headers.findIndex(s => ['中文','意思','翻譯','zh','chinese','meaning'].includes(s))
  const levelCol = headers.findIndex(s => ['級別','等級','level'].includes(s))
  const words = new Map<string, ImportedWord>()
  for (const cells of rows.slice(enCol < 0 ? 0 : 1)) {
    let en = cells[enCol < 0 ? 0 : enCol] ?? ''
    let zh = cells[enCol < 0 ? 1 : zhCol] ?? ''
    if (cells.length === 1) {
      const pair = en.match(/^(.+?)\s+([\u3400-\u9fff].*)$/u)
      if (pair) { en = pair[1]; zh = pair[2] }
    }
    en = en.trim()
    if (!en) continue
    if (en.length > 512 || zh.length > 50000) throw new Error('單列內容太長，請檢查單字是否已分行。')
    if (!/^[a-zA-Z]/.test(en) || /[\u3400-\u9fff]/u.test(en)) throw new Error('每一列請先放英文，再放中文。兩欄可用逗號或空格隔開。')
    const levelText = cells[enCol < 0 ? 2 : levelCol] ?? ''
    const level = levelText ? Number(levelText) : undefined
    if (level !== undefined && (!Number.isInteger(level) || level < 1 || level > 6)) throw new Error('級別請填 1 到 6，或留白。')
    words.set(en.toLowerCase(), { en, zh: zh.trim(), ...(level ? {level} : {}) })
  }
  if (!words.size) throw new Error('請貼上至少一個英文單字。')
  return [...words.values()]
}

function Panel({ title, hint, icon: Icon, children }: { title: string; hint?: string; icon: LucideIcon; children: ReactNode }) {
  return <details className="set-panel">
    <summary>
      <span className="set-symbol" aria-hidden="true"><Icon size={20} strokeWidth={1.7} /></span>
      <span className="set-name">{title}{hint && <small>{hint}</small>}</span>
      <ChevronDown className="set-caret" size={18} aria-hidden="true" />
    </summary>
    <div className="set-body">{children}</div>
  </details>
}

import { exportBackup, getSnapshot, readBackup, restoreBackup, replacePeriod, updateStoreNow, type AppState, type PageProps } from '../lib/store'
import { archiveFolderUrl, cloudArchive, driveConnected } from '../lib/drive'
import { dayKey, addDays, activePeriod } from '../lib/progress'
import { noteMoved } from '../lib/wordStates'
import { DAILY_CHOICES, DEFAULT_DAILY, countKey } from '../lib/dailyWords'

type SettingsData = AppState['settings']
type PeriodType = SettingsData['periods'][number]['type']
type TextDraft = { base: string; text: string }
class OfficeReplyChanged extends Error {
  constructor(readonly saved: string) { super('系辦回覆已在別處更新。') }
}
class DepartureReasonChanged extends Error {}
type BackupSelection = { name: string; id: number } & (
  { phase: 'reading' } | { phase: 'ready'; raw: string; exportedAt?: number; modifiedAt: number }
)
const backupTime = new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })
const periodNames: Record<PeriodType, string> = { semester: '一般學期', exam: '考週', internship: '實習', vacation: '寒暑假' }
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const sourceLinks = [
  ['紐約州教育廳｜境外護理學校畢業生', 'https://www.op.nysed.gov/professions/registered-professional-nursing/license-requirements/pathway-5'],
  ['美國衛生資源暨服務署｜外籍醫事人員英文門檻', 'https://www.hrsa.gov/office-global-health/foreign-healthcare-worker-requirements'],
  ['TruMerit｜醫事人員資格審查', 'https://www.trumerit.org/services/certification/visascreen-visa-credentials-assessment/'],
  ['NCLEX｜考試常見問題', 'https://www.nclex.com/faqs.htm'],
]

export default function Settings(props: PageProps) {
  const memoryCount = useMemory().notes.length
  const { state, update } = props
  const weakTop = topWeak(state.notes, dayKey(), 3)
  const s = state.settings
  const set = <K extends keyof SettingsData,>(key: K, value: SettingsData[K]) => update(prev => ({...prev, settings: {...prev.settings, [key]: value}}))
  const today = dayKey()
  const [officeDraft, setOfficeDraft] = useState<TextDraft | null>(null)
  const [officeConflict, setOfficeConflict] = useState<OfficeReplyChanged | null>(null)
  const [officeSaving, setOfficeSaving] = useState(false)
  const [whyDraft, setWhyDraft] = useState<TextDraft | null>(null)
  const [whySaving, setWhySaving] = useState(false)
  const whyConflict = whyDraft && whyDraft.base !== s.why && whyDraft.text.trim() !== s.why
  const [period, setPeriod] = useState<PeriodType>('exam')
  const [start, setStart] = useState(dayKey())
  const [end, setEnd] = useState(dayKey())
  const [text, setText] = useState('')
  const [wordFile, setWordFile] = useState<File | null>(null)
  const [wordMode, setWordMode] = useState<'learn' | 'known'>('learn')
  const [backup, setBackup] = useState<BackupSelection | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [result, setResult] = useState({area:'', msg:''})
  const announce = (area:string,msg:string) => setResult({area,msg})
  const clearStatus = (area:string) => setResult(current => current.area === area ? {area:'',msg:''} : current)
  const status = (area:string) => result.area === area && result.msg ? <p role="status" className="set-status">{result.msg}</p> : null
  const wordInput = useRef<HTMLInputElement>(null)
  const wordRead = useRef(0)
  const backupInput = useRef<HTMLInputElement>(null)
  const backupRead = useRef(0)
  const restorePending = useRef(false)

  useLayoutEffect(() => () => { wordRead.current++ }, [])

  async function saveWhy(approved = whyDraft?.base) {
    if (!whyDraft || whySaving || restorePending.current) return
    const why = whyDraft.text.trim()
    setWhySaving(true)
    try {
      await updateStoreNow(prev => {
        if (prev.settings.why === why) return prev
        if (prev.settings.why !== approved) throw new DepartureReasonChanged()
        return {...prev, settings: {...prev.settings, why}}
      })
      setWhyDraft(null)
      announce('why','已儲存出發的原因。')
    } catch (error) {
      if (!(error instanceof DepartureReasonChanged))
        announce('why',error instanceof Error ? error.message : '出發原因儲存失敗，請再試一次。')
    } finally { setWhySaving(false) }
  }

  async function saveOffice(approved = officeDraft?.base) {
    if (!officeDraft || officeSaving || restorePending.current) return
    const reply = officeDraft.text.trim()
    setOfficeSaving(true)
    try {
      await updateStoreNow(prev => {
        if (prev.settings.officeReply !== approved && prev.settings.officeReply !== reply)
          throw new OfficeReplyChanged(prev.settings.officeReply)
        return {...prev, settings: {...prev.settings, officeReply:reply, officeAsked:prev.settings.officeAsked || !!reply}}
      })
      setOfficeDraft(null)
      setOfficeConflict(null)
      announce('office','已儲存系辦回覆。')
    } catch (error) {
      if (error instanceof OfficeReplyChanged) setOfficeConflict(error)
      else announce('office',error instanceof Error ? error.message : '系辦回覆儲存失敗，請再試一次。')
    } finally { setOfficeSaving(false) }
  }

  async function confirmRestore() {
    if (backup?.phase !== 'ready' || backup.id !== backupRead.current || restorePending.current || officeSaving || whySaving) return
    restorePending.current = true
    setRestoring(true)
    try {
      await restoreBackup(backup.raw,undefined,{expected:getSnapshot().state})
      setWhyDraft(null)
      setOfficeDraft(null)
      setOfficeConflict(null)
      setBackup(null)
      announce('backup','進度和設定已還原。')
    } catch (error) {
      announce('backup',error instanceof Error ? error.message : '還原失敗，請確認瀏覽器可以儲存資料後再試。')
    } finally { restorePending.current = false; setRestoring(false) }
  }

  function savePeriod() {
    if (!start || !end || end < start) { announce('period', '請填入起訖日期，結束日要在開始日當天或之後。'); return }
    if (s.periods.some(p => p.start === start && p.end === end && p.type === period)) { announce('period', '這段期間已經排好了。'); return }
    update(prev=>({...prev,settings:{...prev.settings,periods:replacePeriod(prev.settings.periods,{type:period,start,end})}}))
    announce('period','已加入時期，當天會自動切換。')
  }
  function saveVocabulary() {
    if (wordFile) return
    try {
      const parsed = parseVocabulary(text)
      update(prev => {
        const dict = new Map(prev.customWords.map(w => [w.en.toLowerCase(), w]))
        for (const w of parsed) {
          const key = w.en.toLowerCase(), old = dict.get(key)
          dict.set(key, {...old, ...w, zh:w.zh || old?.zh || ''})
        }
        const inputKeys = new Set(parsed.map(w => wordKey(w.en)))
        const known = new Set(prev.knownWords.map(wordKey))
        const learning = new Set(prev.learningWords.map(wordKey))
        const [selected, other] = wordMode === 'known' ? [known, learning] : [learning, known]
        const moved: string[] = []
        for (const key of inputKeys) {
          if (other.delete(key)) moved.push(key)
          selected.add(key)
        }
        return {...prev, customWords:[...dict.values()], knownWords:[...known], learningWords:[...learning],
          notes:noteMoved(prev.notes, moved, wordMode === 'known' ? 'k' : 'l', dayKey())}
      })
      setText('')
      announce('words', '已匯入 ' + parsed.length + ' 個單字，重複的單字已合併。')
    } catch (e) { announce('words', (e as Error).message) }
  }
  function download() {
    const file = new Blob([exportBackup(state,new Date())], {type:'application/json'})
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = '夢想藍圖備份-' + dayKey() + '.json'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
    announce('backup','已建立備份，請收好下載的檔案。')
  }
  async function readWordFile(file: File | undefined) {
    if (!file) return
    const id = ++wordRead.current
    setWordFile(file)
    clearStatus('words')
    try {
      const contents = await file.text()
      if (id !== wordRead.current) return
      setText(contents)
      announce('words','已讀取檔案，可檢查內容再匯入。')
    } catch (e) {
      if (id === wordRead.current) announce('words', e instanceof Error ? e.message : '讀取檔案時遇到問題，請再選一次。')
    } finally {
      if (id === wordRead.current) setWordFile(null)
    }
  }

  function cancelWordRead() {
    wordRead.current++
    setWordFile(null)
    clearStatus('words')
  }

  function editWordText(value: string) {
    cancelWordRead()
    setText(value)
  }

  async function selectBackup(file: File | undefined) {
    if (!file || restorePending.current) return
    const id = ++backupRead.current
    setBackup({name:file.name,id,phase:'reading'})
    announce('backup','')
    try {
      const raw = await file.text()
      if (id !== backupRead.current) return
      const {exportedAt} = readBackup(raw)
      setBackup({name:file.name,id,phase:'ready',raw,exportedAt,modifiedAt:file.lastModified})
    } catch (e) {
      if (id !== backupRead.current) return
      setBackup(null)
      announce('backup',e instanceof Error ? e.message : '讀取檔案時遇到問題，請再選一次。')
    }
  }

  function cancelBackup() {
    if (restorePending.current) return
    backupRead.current++
    setBackup(null)
    announce('backup','已保留目前進度。')
  }
  return <section className="settings-page" aria-label="設定">
    <header className="set-hero">
      <div className="set-hero-copy">
        <h1 id="settings-heading" tabIndex={-1}>設定</h1>
        <div className="set-appearance" role="group" aria-label="外觀">
          <button type="button" aria-pressed={s.theme === 'dark'} onClick={()=>set('theme','dark')}><Moon size={16} aria-hidden="true" />深色</button>
          <button type="button" aria-pressed={s.theme === 'light'} onClick={()=>set('theme','light')}><Sun size={16} aria-hidden="true" />淺色</button>
        </div>
      </div>
      <div className="set-dial" aria-hidden="true"><ScenePhoto className="set-dial-photo" /></div>
    </header>
    <div className="set-groups">
    <section className="set-group" aria-labelledby="set-learning-heading">
      <h2 id="set-learning-heading">學習與學校</h2>
    <Panel title="我的學習節奏" icon={CalendarDays} hint={periodNames[activePeriod(today,s.periods)]+' · 練習日與朗讀速度'}>
      <div><h3>學期每週安排</h3><div className="set-week">{weekdays.map((day, i) =>
        <label key={day}>週{day}<select aria-label={'星期'+day+'練習安排'} value={s.regularDays.includes(i)?'normal':s.restDays.includes(i)?'rest':'low'} onChange={e=>{
          const choice=e.target.value
          update(prev=>({...prev,school:{...prev.school,study:prev.school.study.map(slot=>{
            if (slot.weekday!==i) return slot
            // Minutes still at a default (today's 90 / 15 / 0, or an older default) follow the new choice; minutes typed
            // by hand stay. The defaults match the day plan: 普通 1.5 hours, 累爆 15 minutes of review, 休息 0.
            const was=prev.settings.regularDays.includes(i)?[90,30,8]:prev.settings.restDays.includes(i)?[0]:[15,2]
            return was.includes(slot.minutes) ? {...slot,minutes:choice==='normal'?90:choice==='rest'?0:15} : slot
          })},settings:{...prev.settings,
            regularDays:[...prev.settings.regularDays.filter(n=>n!==i), ...(choice==='normal'?[i]:[])].sort(),
            restDays:[...prev.settings.restDays.filter(n=>n!==i), ...(choice==='rest'?[i]:[])].sort()
          }}))
        }}><option value="normal">普通</option><option value="low">累爆</option><option value="rest">休息</option></select></label>
      )}</div></div>
      <div><h3>時期安排</h3><p>藍圖暫排 2028 年 2 月到 2029 年 1 月維持實習節奏，接著到 7 月維持國考節奏。兩段期間都只複習舊內容。</p><p>系辦確認日期後，可新增實際時期覆蓋重疊日期。想在一段時間恢復新課，請選「一般學期」。</p>
        <div className="set-list">{s.periods.map((range, i)=><div key={range.type+'-'+range.start+'-'+range.end+'-'+i}><span><b>{periodNames[range.type]}</b><small>{range.start} 至 {range.end || '另訂'}</small></span>{(!range.end || range.end >= today) && <button type="button" onClick={()=>{
          const periods=s.periods.flatMap((p,j) => j!==i ? [p] : p.start<today ? [{...p,end:addDays(today,-1)}] : [])
          set('periods',periods)
        }} aria-label={(range.start<today?'結束':'移除')+range.start+periodNames[range.type]}>{range.start<today?'今天結束':'移除'}</button>}</div>)}</div>
        <label>新增時期<select value={period} onChange={e=>setPeriod(e.target.value as PeriodType)}>{(['semester','exam','internship','vacation'] as const).map(p=><option key={p} value={p}>{periodNames[p]}</option>)}</select></label>
        <div className="set-dates"><label>開始日期<input type="date" value={start} onChange={e=>setStart(e.target.value)} /></label><label>結束日期<input type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)} /></label></div>
        <button type="button" onClick={savePeriod}>加入時期</button>{status('period')}
      </div>
      <label>今日單字每天看幾個<select value={Number(state.notes[countKey]) || DEFAULT_DAILY} onChange={e=>update(prev=>({...prev,notes:{...prev.notes,[countKey]:e.target.value}}))}>{DAILY_CHOICES.map(n=><option key={n} value={n}>{n} 個{n===DEFAULT_DAILY?'（建議）':''}</option>)}</select></label>
      <label>英文朗讀速度<select value={s.speechRate} onChange={e=>set('speechRate',Number(e.target.value))}>{[...new Set([0.65,0.8,0.9,1,1.15,s.speechRate])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} 倍速</option>)}</select></label>
    </Panel>
    <Panel icon={Telescope} title="我的出發點" hint="記下出發的原因與實習安排">
      <label>為什麼出發<textarea rows={3} maxLength={50000} value={whyDraft?.text ?? s.why} readOnly={whySaving || restoring}
        onChange={e=>{
          const text = e.target.value
          setWhyDraft(text === s.why ? null : {base:whyDraft?.base ?? s.why,text})
          clearStatus('why')
        }} placeholder="用一到三句話，留給累了的自己。" /></label>
      {whyConflict ? <div className="set-restore">
        <p role="status">出發原因已在別處更新。上方是你正在編輯的文字，下方是目前已存的版本。</p>
        <label>目前已存的出發原因<textarea rows={3} readOnly value={s.why}/></label>
        <div className="set-actions">
          <button type="button" disabled={whySaving || restoring} onClick={()=>{setWhyDraft(null);clearStatus('why')}}>使用已存版本</button>
          <button type="button" disabled={whySaving || restoring} onClick={()=>void saveWhy(s.why)}>儲存我編輯的版本</button>
        </div>
      </div> : <button type="button" disabled={!whyDraft || whySaving || restoring} onClick={()=>void saveWhy()}>儲存出發的原因</button>}
      {status('why')}
      <label>已確認的基護實習時段<input aria-label="已確認的基護實習時段" value={s.internshipSeason} onChange={e=>set('internshipSeason',e.target.value)} /></label>
      <label>系辦補充（選填）<textarea rows={3} maxLength={50000} value={officeDraft?.text ?? s.officeReply}
        readOnly={officeSaving || restoring} placeholder="有確切梯次或報到日期時，可以記在這裡。"
        onChange={e=>{
          const text=e.target.value
          setOfficeDraft(text===s.officeReply ? null : {base:officeDraft?.base ?? s.officeReply,text})
          setOfficeConflict(null)
          announce('office','')
        }}/></label>
      {officeConflict && officeDraft ? <div className="set-restore">
        <p role="status">另一份系辦回覆已存入。上方是你正在編輯的內容，下方是儲存時讀到的版本。</p>
        <label>目前已存的系辦回覆<textarea rows={3} readOnly value={officeConflict.saved}/></label>
        <div className="set-actions">
          <button type="button" disabled={officeSaving || restoring} onClick={()=>{setOfficeDraft(null);setOfficeConflict(null)}}>使用已存版本</button>
          <button type="button" disabled={officeSaving || restoring} onClick={()=>void saveOffice(officeConflict.saved)}>儲存我編輯的版本</button>
        </div>
      </div> : <button type="button" disabled={!officeDraft || officeSaving || restoring} onClick={()=>void saveOffice()}>儲存系辦回覆</button>}
      {status('office')}
    </Panel>
    <Panel icon={KeyRound} title="連接 Claude" hint="用自己的 API 金鑰，讓 Claude 批改中翻英"><ClaudeConnect /></Panel>
    <Panel icon={Crosshair} title="我的弱點" hint={weakTop.length ? '最常錯：'+weakTop.map(w=>w.k).join('、') : '批改和口說找到的錯會記在這裡'}><WeakPanel /></Panel>
    <Panel icon={Brain} title="她記得的事" hint={'共 '+memoryCount+' 條'}><MemoryPanel /></Panel>
    <Panel icon={Bot} title="交給其他 AI" hint="複製進度和教法，讓別的 AI 接著教">
      <AIHandoff state={state} update={update} />
    </Panel>
    <Panel icon={GraduationCap} title="學校與課表" hint="課程、學分與讀書時段"><SchoolSettings regularDays={s.regularDays} school={state.school} onChange={edit=>update(prev=>({...prev,school:edit(prev.school)}))}/></Panel>
    </section>
    <section className="set-group set-data" aria-labelledby="set-data-heading">
      <h2 id="set-data-heading">單字與資料</h2>
    <Panel icon={BookA} title="匯入我的單字表" hint={'已匯入 '+state.customWords.length+' 個單字'}>
      <p>每行一個單字，可接中文和級別。支援貼上文字、逗號分隔檔與試算表複製的欄位。</p>
      <label>單字清單<textarea rows={4} placeholder={'student,學生,1\npatient,病人'} value={text}
        onPaste={cancelWordRead} onCompositionStart={cancelWordRead} onChange={e=>editWordText(e.target.value)} /></label>
      <label>這一批單字<select value={wordMode} onChange={e=>setWordMode(e.target.value as 'learn' | 'known')}><option value="learn">加入想學的清單</option><option value="known">已經認得，略過新字練習</option></select></label>
      <input type="file" ref={wordInput} hidden accept=".csv,.tsv,.txt,text/plain,text/csv" onChange={e=>{void readWordFile(e.target.files?.[0]);e.target.value=''}}/>
      <div className="set-actions"><button type="button" onClick={()=>wordInput.current?.click()}>從檔案讀取</button><button type="button" disabled={!!wordFile} onClick={saveVocabulary}>匯入單字</button></div>
      {wordFile ? <p role="status" className="set-status">正在讀取 <b style={{overflowWrap:'anywhere'}}>{wordFile.name}</b>……你仍可改寫或選另一份檔案。</p> : status('words')}
    </Panel>
    {!(["exam","internship"].includes(activePeriod(today,s.periods))) && <Panel icon={ListChecks} title="第 1、2 級單字快篩" hint="認得的單字直接略過"><VocabScreen {...props} /></Panel>}
    <Panel icon={Flag} title="我標記的題目" hint={'共 '+state.flagged.length+' 題'}>{state.flagged.length?<div className="set-list">{state.flagged.map(id=><div key={id}><span>題號 {id}<small>{quizBank.find(q=>q.id===id)?.en}</small></span><button type="button" onClick={()=>update(prev=>({...prev,flagged:prev.flagged.filter(item=>item!==id)}))}>取消標記</button></div>)}</div>:<p>練習時按「這題怪怪的」，題號就會留在這裡。</p>}</Panel>
    <Panel icon={DatabaseBackup} title="備份與還原" hint="把進度存成檔案，換手機也帶得走">
      <p>進度存在目前的瀏覽器。換手機或清除瀏覽器資料前，請先下載備份。</p>
      {(()=>{const mb=JSON.stringify(state).length/1e6; const folder=archiveFolderUrl(); return <p className={mb>3.5?'set-warn':undefined}>進度檔約 {mb<0.1?'不到 0.1':mb.toFixed(1)} MB。實際可用空間依瀏覽器和裝置而異。{
        driveConnected()&&cloudArchive()?<>較早的複習紀錄、每天的小紀錄和舊課的批改全文，在雲端確認收到後才會從這台整理。封存遇到暫時斷線時，連線恢復後會再試。{folder&&<> <a href={folder} target="_blank" rel="noreferrer">打開封存資料夾</a></>}</>
        :driveConnected()?'舊紀錄會先留在這台。請依上方「雲端硬碟」的步驟更新雲端小程式。支援封存的版本會先將紀錄存進雲端硬碟，再從這台整理掉。'
        :'兩個月以前的複習紀錄會整理成統計，每天的小紀錄和較早的批改全文會定期整理。連上雲端硬碟後，舊紀錄會先等雲端封存。'}{mb>3.5?' 這份進度已經偏大。若畫面提示最近的更動未儲存，請在關閉前先下載備份。':''}</p>})()}
      <input type="file" ref={backupInput} hidden accept=".json,application/json" onChange={e=>{void selectBackup(e.target.files?.[0]);e.target.value=''}}/>
      <div className="set-actions"><button type="button" onClick={download}>下載備份</button><button type="button" disabled={restoring} onClick={()=>backupInput.current?.click()}>選擇備份檔</button></div>
      {backup && <div className="set-restore set-backup-selection">
        <b>{backup.name}</b>
        {backup.phase==='reading' ? <p role="status">正在讀取這份備份……</p> : <>
          <p>{backup.exportedAt === undefined ? '檔案修改時間' : '備份匯出時間'} {backupTime.format(backup.exportedAt ?? backup.modifiedAt)}</p>
          <p>還原會用這份備份的課表、學習紀錄和設定取代目前進度。</p>
        </>}
        <div className="set-actions">
          {backup.phase==='ready' && <button type="button" disabled={restoring || officeSaving || whySaving} onClick={()=>void confirmRestore()}>{restoring?'還原中':'確認還原'}</button>}
          <button type="button" disabled={restoring} onClick={cancelBackup}>取消</button>
        </div>
      </div>}{status('backup')}
    </Panel>
    </section>
    <section className="set-group set-preferences" aria-labelledby="set-preferences-heading">
      <h2 id="set-preferences-heading">偏好與說明</h2>
    <Panel icon={Trophy} title="顯示與對手" hint="排行榜、對手語氣與連續紀錄">
      <label className="set-toggle"><span>顯示模擬對手排行榜<small>對手都是模擬角色，分數在這台裝置計算。</small></span><input type="checkbox" checked={s.rivalsEnabled} onChange={e=>set('rivalsEnabled',e.target.checked)}/></label>
      {s.rivalsEnabled && <label>對手的嗆聲強度<select value={s.taunt} onChange={e=>set('taunt', e.target.value as SettingsData['taunt'])}><option value="off">關</option><option value="gentle">普通</option><option value="bold">毒舌</option></select></label>}
      <label className="set-toggle"><span>在紀錄頁顯示連續天數與請假卡</span><input type="checkbox" checked={s.showStreak} onChange={e=>set('showStreak',e.target.checked)}/></label>
    </Panel>
    <Panel icon={BookOpen} title="使用說明與資料來源" hint="練習規則與赴美護理資料"><h3>累爆的日子，15 分鐘也算一天</h3><p>只複習 15 分鐘也算有練，能幫你留住習慣。要達到英文檢定分數，平常還是照一般日的 1.5 小時（複習、一堂課、單字、聽或讀、說或寫）走。</p><p>每天依手機當地時間凌晨 4 點換日。普通或有電完成後，課表往前一天。累爆只練舊內容。</p><h3>資料來源</h3><p>課程與學籍依你提供的藍圖更新，修課和實習安排以校方公告為準。</p>{sourceLinks.map(([name,url])=><a key={url} href={url} target="_blank" rel="noreferrer">{name} ↗</a>)}</Panel>
    </section>
    </div>
  </section>
}





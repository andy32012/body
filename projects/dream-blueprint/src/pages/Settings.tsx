import { useRef, useState, type ReactNode } from 'react'
import SchoolSettings from '../components/SchoolSettings'
import VocabScreen from '../components/VocabScreen'
import quizBank from '../data/quiz.json'
import './settings.css'

type ImportedWord = { en: string; zh: string; level?: number }

function csvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++ }
      else quoted = !quoted
    } else if (!quoted && [',', '\t', '，'].includes(char)) {
      row.push(field.trim())
      field = ''
    } else if (!quoted && char === '\n') {
      row.push(field.trim())
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') field += char
  }
  if (quoted) throw new Error('有一格的引號尚未成對，請檢查單字表。')
  row.push(field.trim())
  rows.push(row)
  return rows.filter(cells => cells.some(Boolean))
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

function Panel({title, hint, children, open = false}: {title:string; hint?:string; children:ReactNode; open?:boolean}) {
  return <details className="set-panel" open={open || undefined}><summary><span>{title}{hint && <small>{hint}</small>}</span><span className="set-caret" aria-hidden="true">⌄</span></summary><div className="set-body">{children}</div></details>
}

import { exportBackup, importBackup, restoreBackup, replacePeriod, type AppState, type PageProps } from '../lib/store'
import { dayKey, addDays, activePeriod } from '../lib/progress'

type SettingsData = AppState['settings']
type PeriodType = SettingsData['periods'][number]['type']
const periodNames: Record<PeriodType, string> = { semester: '一般學期', exam: '考週', internship: '實習', vacation: '寒暑假' }
const weekdays = ['日', '一', '二', '三', '四', '五', '六']
const sourceLinks = [
  ['紐約州教育廳｜境外護理學校畢業生', 'https://www.op.nysed.gov/professions/registered-professional-nursing/license-requirements/pathway-5'],
  ['美國衛生資源暨服務署｜外籍醫事人員英文門檻', 'https://www.hrsa.gov/office-global-health/foreign-healthcare-worker-requirements'],
  ['TruMerit｜醫事人員資格審查', 'https://www.trumerit.org/services/certification/visascreen-visa-credentials-assessment/'],
  ['NCLEX｜考試常見問題', 'https://www.nclex.com/faqs.htm'],
]

export default function Settings(props: PageProps) {
  const { state, update } = props
  const s = state.settings
  const set = <K extends keyof SettingsData,>(key: K, value: SettingsData[K]) => update(prev => ({...prev, settings: {...prev.settings, [key]: value}}))
  const today = dayKey()
  const [reply, setReply] = useState(s.officeReply)
  const [why, setWhy] = useState(s.why)
  const [period, setPeriod] = useState<PeriodType>('exam')
  const [start, setStart] = useState(dayKey())
  const [end, setEnd] = useState(dayKey())
  const [text, setText] = useState('')
  const [wordMode, setWordMode] = useState<'learn' | 'known'>('learn')
  const [backup, setBackup] = useState<AppState | null>(null)
  const [result, setResult] = useState({area:'', msg:''})
  const announce = (area:string,msg:string) => setResult({area,msg})
  const status = (area:string) => result.area === area ? <p role="status" className="set-status">{result.msg}</p> : null
  const wordInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)

  function savePeriod() {
    if (!start || !end || end < start) { announce('period', '請填入起訖日期，結束日要在開始日當天或之後。'); return }
    if (s.periods.some(p => p.start === start && p.end === end && p.type === period)) { announce('period', '這段期間已經排好了。'); return }
    update(prev=>({...prev,settings:{...prev.settings,periods:replacePeriod(prev.settings.periods,{type:period,start,end})}}))
    announce('period','已加入時期，當天會自動切換。')
  }
  function saveVocabulary() {
    try {
      const parsed = parseVocabulary(text)
      update(prev => {
        const dict = new Map(prev.customWords.map(w => [w.en.toLowerCase(), w]))
        for (const w of parsed) {
          const key = w.en.toLowerCase(), old = dict.get(key)
          dict.set(key, {...old, ...w, zh:w.zh || old?.zh || ''})
        }
        const inputKeys = parsed.map(w => w.en.toLowerCase())
        const known = new Set(prev.knownWords.map(w => w.toLowerCase()))
        if (wordMode === 'known') for (const key of inputKeys) known.add(key)
        const learning = new Set(prev.learningWords.map(w => w.toLowerCase()))
        if (wordMode === 'learn') for (const key of inputKeys) learning.add(key)
        return {...prev, customWords:[...dict.values()], knownWords:[...known], learningWords:[...learning].filter(key=>!known.has(key))}
      })
      setText('')
      announce('words', '已匯入 ' + parsed.length + ' 個單字，重複的單字已合併。')
    } catch (e) { announce('words', (e as Error).message) }
  }
  function download() {
    const file = new Blob([exportBackup(state)], {type:'application/json'})
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
  async function readFile(file: File | undefined, mode:'backup'|'words') {
    if (!file) return
    if (mode === 'backup') setBackup(null)
    try {
      const raw = await file.text()
      if (mode === 'backup') { setBackup(importBackup(raw)); announce('backup','備份已讀取，請確認是否還原。') }
      else { setText(raw); announce('words','已讀取檔案，可檢查內容再匯入。') }
    } catch (e) { announce(mode, e instanceof Error ? e.message : '讀取檔案時遇到問題，請再選一次。') }
  }
  return <main className="settings-page">
    <header><h1>設定</h1></header>
    <Panel title="我的學習節奏" hint="時期、練習日與朗讀速度" open>
      <div><h3>學期每週安排</h3><div className="set-week">{weekdays.map((day, i) =>
        <label key={day}>週{day}<select aria-label={'星期'+day+'練習安排'} value={s.regularDays.includes(i)?'normal':s.restDays.includes(i)?'rest':'low'} onChange={e=>{
          const choice=e.target.value
          update(prev=>({...prev,school:{...prev.school,study:prev.school.study.map(slot=>{
            if (slot.weekday!==i) return slot
            const defaultMinutes=prev.settings.regularDays.includes(i)?8:prev.settings.restDays.includes(i)?0:2
            return slot.minutes===defaultMinutes ? {...slot,minutes:choice==='normal'?8:choice==='rest'?0:2} : slot
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
      <label>英文朗讀速度<select value={s.speechRate} onChange={e=>set('speechRate',Number(e.target.value))}>{[...new Set([0.65,0.8,0.9,1,1.15,s.speechRate])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n} 倍速</option>)}</select></label>
    </Panel>
    <Panel title="我的出發點" hint="記下出發的原因與實習安排">
      <label>為什麼出發<textarea rows={3} maxLength={50000} value={why} onChange={e=>setWhy(e.target.value)} placeholder="用一到三句話，留給累了的自己。" /></label>
      <button type="button" onClick={()=>{set('why',why.trim()); announce('why','已儲存出發的原因。')}}>儲存出發的原因</button>{status('why')}
      <label>已確認的基護實習時段<input aria-label="已確認的基護實習時段" value={s.internshipSeason} onChange={e=>set('internshipSeason',e.target.value)} /></label>
      <label>系辦補充（選填）<textarea rows={3} maxLength={50000} value={reply} onChange={e=>setReply(e.target.value)} placeholder="有確切梯次或報到日期時，可以記在這裡。" /></label>
      <button type="button" onClick={()=>{update(prev=>({...prev,settings:{...prev.settings,officeReply:reply.trim(),officeAsked:prev.settings.officeAsked||!!reply.trim()}})); announce('office','已儲存系辦回覆。')}}>儲存系辦回覆</button>{status('office')}
    </Panel>
    <Panel title="學校與課表" hint="課程、學分與讀書時段"><SchoolSettings regularDays={s.regularDays} school={state.school} onChange={school=>update(prev=>({...prev,school}))}/></Panel>
    <Panel title="顯示與對手" hint="外觀、排行榜與紀錄">
      <label>外觀<select value={s.theme} onChange={e=>set('theme',e.target.value as SettingsData['theme'])}><option value="dark">深色星空</option><option value="light">淺色星空</option></select></label>
      <label className="set-toggle"><span>顯示模擬對手排行榜<small>對手都是模擬角色，分數在這台裝置計算。</small></span><input type="checkbox" checked={s.rivalsEnabled} onChange={e=>set('rivalsEnabled',e.target.checked)}/></label>
      {s.rivalsEnabled && <label>對手的嗆聲強度<select value={s.taunt} onChange={e=>set('taunt', e.target.value as SettingsData['taunt'])}><option value="off">關</option><option value="gentle">普通</option><option value="bold">毒舌</option></select></label>}
      <label className="set-toggle"><span>在紀錄頁顯示連續天數與請假卡</span><input type="checkbox" checked={s.showStreak} onChange={e=>set('showStreak',e.target.checked)}/></label>
    </Panel>
    <Panel title="匯入我的單字表" hint={'已匯入 '+state.customWords.length+' 個單字'}>
      <p>每行一個單字，可接中文和級別。支援貼上文字、逗號分隔檔與試算表複製的欄位。</p>
      <label>單字清單<textarea rows={4} placeholder={'student,學生,1\npatient,病人'} value={text} onChange={e=>setText(e.target.value)} /></label>
      <label>這一批單字<select value={wordMode} onChange={e=>setWordMode(e.target.value as 'learn' | 'known')}><option value="learn">加入想學的清單</option><option value="known">已經認得，略過新字練習</option></select></label>
      <input type="file" ref={wordInput} hidden accept=".csv,.tsv,.txt,text/plain,text/csv" onChange={e=>{void readFile(e.target.files?.[0],'words');e.target.value=''}}/>
      <div className="set-actions"><button type="button" onClick={()=>wordInput.current?.click()}>從檔案讀取</button><button type="button" onClick={saveVocabulary}>匯入單字</button></div>{status('words')}
    </Panel>
    {!(["exam","internship"].includes(activePeriod(today,s.periods))) && <Panel title="第 1、2 級單字快篩" hint="認得的單字直接略過"><VocabScreen {...props} /></Panel>}
    <Panel title="備份與還原" hint="把進度存成檔案，換手機也帶得走">
      <p>進度存在目前的瀏覽器。換手機或清除瀏覽器資料前，請先下載備份。</p>
      <input type="file" ref={backupInput} hidden accept=".json,application/json" onChange={e=>{void readFile(e.target.files?.[0],'backup');e.target.value=''}}/>
      <div className="set-actions"><button type="button" onClick={download}>下載備份</button><button type="button" onClick={()=>backupInput.current?.click()}>選擇備份檔</button></div>
      {backup && <div className="set-restore"><b>用這份備份取代目前進度？</b><p>還原會包含原本的課表、學習紀錄和設定。</p>
        <div className="set-actions"><button type="button" onClick={()=>{restoreBackup(exportBackup(backup));setWhy(backup.settings.why);setReply(backup.settings.officeReply);setBackup(null);announce('backup','進度和設定已還原。')}}>確認還原</button><button type="button" onClick={()=>{setBackup(null); announce('backup','已保留目前進度。')}}>取消</button></div></div>}{status('backup')}
    </Panel>
    <Panel title="我標記的題目" hint={'共 '+state.flagged.length+' 題'}>{state.flagged.length?<div className="set-list">{state.flagged.map(id=><div key={id}><span>題號 {id}<small>{quizBank.find(q=>q.id===id)?.en}</small></span><button type="button" onClick={()=>update(prev=>({...prev,flagged:prev.flagged.filter(item=>item!==id)}))}>取消標記</button></div>)}</div>:<p>練習時按「這題怪怪的」，題號就會留在這裡。</p>}</Panel>
    <Panel title="使用說明與資料來源"><h3>兩分鐘也算一天</h3><p>兩分鐘能幫你留住習慣。要達到英文檢定分數，仍需在負荷穩定時逐步增加聽、說、讀、寫的練習。</p><p>每天依手機當地時間凌晨 4 點換日。普通或有電完成後，課表往前一天。累爆只練舊內容。</p><h3>資料來源</h3><p>課程與學籍依你提供的藍圖更新，修課和實習安排以校方公告為準。</p>{sourceLinks.map(([name,url])=><a key={url} href={url} target="_blank" rel="noreferrer">{name} ↗</a>)}</Panel>
  </main>
}





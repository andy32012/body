import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Send, Sparkles, X } from 'lucide-react'
import { askTutor, personaText, tutorKey, type TutorTurn } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import './ai-chat.css'

/** A conversation with Claude. `opening` is sent automatically when the panel opens. */
const loadTurns = (key?: string): TutorTurn[] => {
  if (!key) return []
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const saveTurns = (key: string | undefined, turns: TutorTurn[]) => {
  if (!key) return
  try { localStorage.setItem(key, JSON.stringify(turns.slice(-40))) } catch { /* private mode */ }
}

export function AIChat({ system, opening, placeholder = '有問題就問我', suggestions = [], persist }:
  { system: string; opening?: string; placeholder?: string; suggestions?: string[]; persist?: string }) {
  const memory = useMemory()
  const [turns, setTurns] = useState<TutorTurn[]>(() => loadTurns(persist))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const connected = !!tutorKey()

  async function send(content: string, history = turns) {
    const q = content.trim()
    if (!q || busy) return
    const next: TutorTurn[] = [...history, { role: 'user', content: q }]
    setTurns(next); setBusy(true); setError(''); setText('')
    try {
      const raw = await askTutor(system + '\n' + memoryPrompt(memory.notes), next)
      const { clean, remember, forget } = extractMemory(raw)
      if (remember.length || forget.length) memory.update(remember, forget)
      const done: TutorTurn[] = [...next, { role: 'assistant', content: clean || '嗯嗯～' }]
      setTurns(done); saveTurns(persist, done)
      driveLog('問問 Claude', [{ role: 'user', text: q }, { role: 'Claude', text: clean }])
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setTurns(history) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (opening && connected && !started.current) { started.current = true; void send(opening, []) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [turns, busy])

  if (!connected) return <div className="ai-empty">
    <p>還沒連接 Claude。到「設定 → 連接 Claude」貼上 API 金鑰，這裡就能用了。</p>
    <a className="ai-go" href="#settings">去設定</a>
  </div>

  const shown = opening ? turns.slice(1) : turns
  return <div className="ai-chat">
    <div className="ai-log">
      {shown.map((t, i) => <div key={i} className={'ai-msg ai-' + t.role}>
        {t.content.split('\n').map((line, j) => line.trim() ? <p key={j}>{line.replace(/\*\*/g, '')}</p> : null)}
      </div>)}
      {busy && <div className="ai-msg ai-assistant ai-typing" aria-label="思考中"><i /><i /><i /></div>}
      {error && <p className="ai-error" role="alert">{error}</p>}
      {persist && turns.length > 0 && !busy && <button type="button" className="ai-clear" onClick={() => { setTurns([]); saveTurns(persist, []) }}>清空這段對話（記住的事不會刪）</button>}
      {!busy && turns.length <= (opening ? 2 : 0) && suggestions.length > 0 && <div className="ai-suggest">
        {suggestions.map(s => <button type="button" key={s} onClick={() => send(s)}>{s}</button>)}
      </div>}
      <div ref={end} />
    </div>
    <form className="ai-input" onSubmit={e => { e.preventDefault(); void send(text) }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label="輸入問題" />
      <button type="submit" disabled={busy || !text.trim()} aria-label="送出"><Send size={17} /></button>
    </form>
  </div>
}

/** Floating panel (bottom sheet on phones) that sits above everything, including other dialogs. */
export function AISheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return createPortal(<div className="ai-veil" onClick={e => { e.stopPropagation(); onClose() }}>
    <section className="ai-sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : '問問 Claude'} onClick={e => e.stopPropagation()}>
      <header><Sparkles size={17} aria-hidden="true" /><strong>{title}</strong>
        <button type="button" className="ai-close" aria-label="關閉" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>, document.body)
}

const wordSystem = [
  '你在教玄燁英文。他是台灣護理系學生，英文國中程度，正在背大考中心 7000 單字，之後要考雅思。',
  '他問一個單字時，用繁體中文簡短回答，總共不超過 6 行：',
  '1. 最常用的中文意思和詞性（一行）。',
  '2. 一個簡單、生活化的英文例句，下一行附中文。',
  '3. 如果有常見搭配、易混淆的字或護理會用到的意思，挑最重要的一個講一行；沒有就省略。',
  '4. 最後一行問他有沒有問題，用你的語氣、每次換個說法。',
  '不要用 Markdown 標題或粗體。他追問時一樣簡短清楚，像朋友一樣口語。',
].join('\n')

/** Small "問 AI" button for any word; opens a short teacher-style explanation. */
export function AskWord({ en, zh, label = '問問 Claude' }: { en: string; zh?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="ask-word" onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={'問問 Claude：' + en}>
      <Sparkles size={13} aria-hidden="true" />{label}
    </button>
    {open && <AISheet title={<><span lang="en">{en}</span>{zh ? <small> · {zh}</small> : null}</>} onClose={() => setOpen(false)}>
      <AIChat system={personaText() + '\n\n' + wordSystem} opening={'請教我這個單字：' + en + (zh ? '（' + zh + '）' : '')}
        placeholder="例如：可以再給我一個例句嗎？" suggestions={['再給我一個例句', '怎麼記比較好？', '跟它很像的字是什麼？']} />
    </AISheet>}
  </>
}

/** The always-available "問問 Claude" button: knows the learner's progress from the handoff text. */
export function AIAssistant({ progress }: { progress: string }) {
  const [open, setOpen] = useState(false)
  const system = [
    personaText(),
    '你住在玄燁的「夢想藍圖」網站裡，幫他學習。他是台灣護理系學生，目標考雅思、去美國當註冊護理師。',
    '他可能問英文單字、文法、中翻英、雅思，也可能問護理課業或學習計畫。用繁體中文回答，簡短、口語：先直接回答，再給一個例子，最後簡短問他有沒有問題。不要用 Markdown 標題或粗體。',
    '他要練中翻英時，照下面的教法：一次一句、先讓他自己翻、錯了分層提示。',
    '',
    '以下是網站自動產生的他的進度：',
    progress,
  ].join('\n')
  return <>
    <button type="button" className="ai-fab" onClick={() => setOpen(true)}><Sparkles size={17} aria-hidden="true" />問問 Claude</button>
    {open && <AISheet title="問問 Claude" onClose={() => setOpen(false)}>
      <AIChat system={system} persist="dream-blueprint.assistant-chat" placeholder="問單字、文法，或叫我出一句中翻英"
        suggestions={['出一句今天的中翻英給我', '幫我複習最近錯的文法', '我今天要做什麼？', 'be 動詞什麼時候用 is？']} />
    </AISheet>}
  </>
}

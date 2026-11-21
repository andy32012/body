import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Sparkles, X } from 'lucide-react'
import { askTutor, personaText, tutorKey, tutorPersona, type TutorTurn } from '../lib/tutor'
import { askEvent, currentTask, taskPrompt, useCurrentTask } from '../lib/taskContext'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import { PencilCaret, SketchIntro, SketchThinking } from './Sketch'
import { HoverPet, PixelPet, usePet } from './PixelPet'
import './ai-chat.css'
import './sketch.css'

/** A small twinkling star used while Claude is thinking. */
export function Spark({ size = 26, spinning = false }: { size?: number; spinning?: boolean }) {
  return <svg className={'ai-spark' + (spinning ? ' spin' : '')} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 2c1.2 6.6 3.4 9.9 14 14-10.6 4.1-12.8 7.4-14 14-1.2-6.6-3.4-9.9-14-14C12.6 11.9 14.8 8.6 16 2Z" fill="currentColor" />
    <circle cx="26" cy="6" r="1.8" fill="currentColor" className="ai-spark-dot" />
  </svg>
}

const thinkingWords = ['思考中', '翻一下筆記', '想想怎麼說', '整理一下']
function Thinking() {
  const [i, setI] = useState(0)
  useEffect(() => { const t = setInterval(() => setI(n => (n + 1) % thinkingWords.length), 1600); return () => clearInterval(t) }, [])
  return <div className="ai-thinking" aria-label="思考中"><SketchThinking /><em key={i}>{thinkingWords[i]}…</em></div>
}

/** Reveals the newest reply a few characters at a time. */
function Typed({ text, animate, onTick }: { text: string; animate: boolean; onTick: () => void }) {
  const [n, setN] = useState(animate ? 0 : text.length)
  useEffect(() => {
    if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(text.length); return }
    let k = 0
    const t = setInterval(() => { k = Math.min(text.length, k + 2); setN(k); onTick(); if (k >= text.length) clearInterval(t) }, 22)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, animate])
  return <>{text.slice(0, n).split('\n').map((line, j) => line.trim() ? <p key={j}>{line.replace(/\*\*/g, '')}</p> : null)}{n < text.length && <PencilCaret />}</>
}

/** A conversation with Claude. `opening` is sent automatically when the panel opens. */
const loadTurns = (key?: string): TutorTurn[] => {
  if (!key) return []
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const saveTurns = (key: string | undefined, turns: TutorTurn[]) => {
  if (!key) return
  try { localStorage.setItem(key, JSON.stringify(turns.slice(-40))) } catch { /* private mode */ }
}

export function AIChat({ system, opening, placeholder = '有問題就問我', suggestions = [], persist, introCards = [], ask, alwaysSuggest = false }:
  { system: string | (() => string); opening?: string; placeholder?: string; suggestions?: string[]; persist?: string; introCards?: string[]
    /** A message to send right away (e.g. from 「我卡住了」); a new n sends again. */
    ask?: { text: string; n: number }; alwaysSuggest?: boolean }) {
  const memory = useMemory()
  const [turns, setTurns] = useState<TutorTurn[]>(() => loadTurns(persist))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const [fresh, setFresh] = useState(-1)
  const connected = !!tutorKey()

  async function send(content: string, history = turns) {
    const q = content.trim()
    if (!q || busy) return
    const next: TutorTurn[] = [...history, { role: 'user', content: q }]
    setTurns(next); setBusy(true); setError(''); setText('')
    try {
      const raw = await askTutor((typeof system === 'function' ? system() : system) + '\n' + memoryPrompt(memory.notes), next)
      const { clean, remember, forget } = extractMemory(raw)
      if (remember.length || forget.length) memory.update(remember, forget)
      const done: TutorTurn[] = [...next, { role: 'assistant', content: clean || '嗯嗯～' }]
      setTurns(done); saveTurns(persist, done); setFresh(done.length - 1)
      driveLog('問問 Claude', [{ role: 'user', text: q }, { role: 'Claude', text: clean }])
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setTurns(history) }
    finally { setBusy(false) }
  }
  useEffect(() => {
    if (opening && connected && !started.current) { started.current = true; void send(opening, []) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const asked = useRef(0)
  useEffect(() => {
    if (ask && connected && ask.n !== asked.current) { asked.current = ask.n; void send(ask.text) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask?.n])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [turns, busy])

  if (!connected) return <div className="ai-empty">
    <p>還沒連接 Claude。到「設定 → 連接 Claude」貼上 API 金鑰，這裡就能用了。</p>
    <a className="ai-go" href="#settings">去設定</a>
  </div>

  const shown = opening ? turns.slice(1) : turns
  return <div className="ai-chat">
    <div className="ai-log">
      {shown.length === 0 && !busy && <SketchIntro text={tutorPersona() === 'teacher' ? '你好' : '嗨～哥哥'} />}
      {shown.map((t, i) => {
        const index = opening ? i + 1 : i
        return <div key={index} className={'ai-msg ai-' + t.role}>
          {t.role === 'assistant' ? <><Spark size={18} /><div className="ai-text"><Typed text={t.content} animate={index === fresh} onTick={() => end.current?.scrollIntoView({ block: 'nearest' })} /></div></>
            : <p>{t.content}</p>}
        </div>
      })}
      {busy && <Thinking />}
      {error && <p className="ai-error" role="alert">{error}</p>}
      {persist && turns.length > 0 && !busy && <button type="button" className="ai-clear" onClick={() => { setTurns([]); saveTurns(persist, []) }}>清空這段對話（記住的事不會刪）</button>}
      {!busy && (alwaysSuggest || turns.length <= (opening ? 2 : 0)) && suggestions.length > 0 && <div className="ai-suggest">
        {suggestions.map(s => <button type="button" key={s} onClick={() => send(s)}>{s}</button>)}
      </div>}
      <div ref={end} />
    </div>
    <form className="ai-input" onSubmit={e => { e.preventDefault(); void send(text) }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label="輸入問題" />
      <button type="submit" disabled={busy || !text.trim()} aria-label="送出"><ArrowUp size={19} strokeWidth={2.4} /></button>
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
      <header><HoverPet size={26} /><strong>{title}</strong>
        <button type="button" className="ai-close" aria-label="關閉" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>, document.body)
}

const wordSystem = [
  '你在教玄燁英文。他是台灣護理系學生，英文國中程度，正在背大考中心 7000 單字，之後要考雅思。',
  '他問一個單字時，用繁體中文很短地回答，總共不超過 4 行：',
  '1. 最常用的中文意思和詞性（一行）。',
  '2. 一個簡單、生活化的英文例句，下一行附中文。',
  '3. 最後用很短的一句問他有沒有問題（例如「懂了嗎～」）。',
  '不要用 Markdown 標題或粗體。他追問時也只回 1～2 句。',
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

function progressCards(progress: string) {
  const m = progress.match(/現在：單元 (\d+)（[^）]*）第 (\d+) 天/)
  return m ? ['單元 ' + m[1] + ' · 第 ' + m[2] + ' 天'] : []
}

/** The always-available "問問 Claude" button: knows the learner's progress from the handoff text. */
/** True while the learner is typing an answer somewhere on the page (not in the assistant itself). */
function useTyping() {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const check = () => {
      const el = document.activeElement as HTMLElement | null
      const field = !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'range'].includes((el as HTMLInputElement).type)))
      setTyping(field && !el!.closest('.ai-sheet'))
    }
    const later = () => setTimeout(check, 0)
    document.addEventListener('focusin', check)
    document.addEventListener('focusout', later)
    return () => { document.removeEventListener('focusin', check); document.removeEventListener('focusout', later) }
  }, [])
  return typing
}

export function AIAssistant({ progress }: { progress: string }) {
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState<{ text: string; n: number }>()
  const typing = useTyping()
  const pet = usePet(typing)
  const task = useCurrentTask()
  useEffect(() => {
    const on = (e: Event) => { setOpen(true); setAsk(a => ({ text: String((e as CustomEvent).detail), n: (a?.n ?? 0) + 1 })) }
    window.addEventListener(askEvent, on)
    return () => window.removeEventListener(askEvent, on)
  }, [])
  const base = [
    personaText(),
    '你住在玄燁的「夢想藍圖」網站裡，幫他學習。他是台灣護理系學生，目標考雅思、去美國當註冊護理師。',
    '他可能問英文單字、文法、中翻英、雅思，也可能問護理課業或學習計畫。用繁體中文回答，非常簡短：直接回答重點就好，需要時才給一個短例子。出中翻英時一次只出一句，不先給答案。不要用 Markdown 標題、粗體或長清單。',
    '他要練中翻英時，照下面的教法：一次一句、先讓他自己翻、錯了分層提示。',
    '',
    '以下是網站自動產生的他的進度：',
    progress,
  ].join('\n')
  // Read at send time, so the latest draft goes along with the question.
  const system = () => base + '\n' + taskPrompt(currentTask())
  return <>
    <div className={'ai-fab' + (typing ? ' compact' : '') + (pet.big ? ' showing' : '')}>
      <button type="button" className="ai-pet-btn" aria-label={typing ? '問問 Claude' : '小怪獸：點一下看牠表演'} title={typing ? '問問 Claude' : '摸摸小怪獸'}
        onPointerEnter={e => { if (e.pointerType === 'mouse' && !typing) pet.show(true) }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') pet.hide() }}
        onClick={e => { if (typing) setOpen(true); else if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') pet.show(false) }}>
        <span className="ai-pet-stage"><PixelPet action={pet.action} size={30} /></span>
        {pet.label && <span className="ai-pet-bubble" aria-live="polite">{pet.label}</span>}
      </button>
      <button type="button" className="ai-fab-label" onClick={() => setOpen(true)}>問問 Claude</button>
    </div>
    {open && <AISheet title="問問 Claude" onClose={() => setOpen(false)}>
      {task && <p className="ai-task"><b>正在協助</b><span>{task.label}</span></p>}
      <AIChat system={system} persist="dream-blueprint.assistant-chat" introCards={progressCards(progress)} ask={ask} alwaysSuggest={!!task}
        suggestions={task ? ['我卡住了，給我一點提示就好', '幫我看我寫的哪裡怪', '這題要用哪個文法？'] : []}
        placeholder={task ? '問這一題，或問別的' : '問單字、文法，或叫我出一句中翻英'} />
    </AISheet>}
  </>
}

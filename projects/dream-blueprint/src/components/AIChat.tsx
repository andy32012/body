import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, X } from 'lucide-react'
import { askTutor, personaText, tutorKey, tutorPersona, type TutorTurn } from '../lib/tutor'
import { askDetail, askEvent, askedAbout, currentTask, taskPrompt, useCurrentTask } from '../lib/taskContext'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import { useModal } from '../lib/modal'
import { PencilCaret, SketchIntro, SketchThinking } from './Sketch'
import { HoverPet, PetIcon, PixelPet, usePet } from './PixelPet'
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

type ChatAsk = { text: string; system: string; onSend?: () => void }
type ChatQuestion = { text: string; system: string; opening?: boolean }
type FailedQuestion = { question: ChatQuestion; error: string }
type ChatDraft = { text: string; failed: FailedQuestion[] }

export function AIChat({ system, opening, placeholder = '有問題就問我', suggestions = [], persist, introCards = [], ask, onAskConsumed, onGoToSettings, alwaysSuggest = false, recovery }:
  { system: string | (() => string); opening?: string; placeholder?: string; suggestions?: string[]; persist?: string; introCards?: string[]
    /** A one-time request from a button outside the chat, with the context captured when it was pressed. */
    ask?: ChatAsk; onAskConsumed?: (ask: ChatAsk) => void; onGoToSettings: () => void; alwaysSuggest?: boolean
    recovery?: RefObject<ChatDraft> }) {
  const memory = useMemory()
  const [turns, setTurns] = useState<TutorTurn[]>(() => loadTurns(persist))
  const [draft, setDraft] = useState<ChatDraft>(() => recovery?.current ?? { text: '', failed: [] })
  const [pending, setPending] = useState<ChatQuestion | null>(null)
  const busy = pending !== null
  const [openingIndex, setOpeningIndex] = useState(-1)
  const end = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const request = useRef<AbortController | null>(null)
  const consumed = useRef<ChatAsk | null>(null)
  const [fresh, setFresh] = useState(-1)
  const connected = !!tutorKey()

  // Closing the sheet drops ownership before an old response can update history, memory or the optional Drive log.
  useLayoutEffect(() => () => {
    const controller = request.current
    request.current = null
    controller?.abort()
  }, [])
  // Keep the floating assistant's draft available if the learner closes it to fix their Claude settings.
  useLayoutEffect(() => {
    if (recovery) recovery.current = draft
  }, [draft, recovery])

  async function submit(question: ChatQuestion, fromInput: boolean, retry?: FailedQuestion) {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    const next: TutorTurn[] = [...turns, { role: 'user', content: question.text }]
    setPending(question)
    if (fromInput) setDraft(d => ({ ...d, text: '' }))
    try {
      const raw = await askTutor(question.system + '\n' + memoryPrompt(memory.notes), next, controller.signal)
      if (request.current !== controller) return
      if (!raw.trim()) throw new Error('Claude 沒有回傳文字，請再試一次。')
      const { clean, remember, forget } = extractMemory(raw)
      if (remember.length || forget.length) memory.update(remember, forget)
      const done: TutorTurn[] = [...next, { role: 'assistant', content: clean || '這次沒有可顯示的回覆。' }]
      setTurns(done)
      saveTurns(persist, done)
      setFresh(done.length - 1)
      if (question.opening) setOpeningIndex(turns.length)
      if (retry) setDraft(d => ({ ...d, failed: d.failed.filter(f => f !== retry) }))
      driveLog('問問 Claude', [{ role: 'user', text: question.text }, { role: 'Claude', text: clean }])
    } catch (error) {
      if (request.current !== controller) return
      const failed = { question, error: error instanceof Error ? error.message : String(error) }
      setDraft(d => ({ ...d, failed: retry ? d.failed.map(f => f === retry ? failed : f) : [...d.failed, failed] }))
    } finally {
      if (request.current === controller) {
        request.current = null
        setPending(null)
      }
    }
  }

  function send(content: string, options: { fromInput?: boolean; opening?: boolean; ask?: ChatAsk } = {}) {
    const q = content.trim()
    if (!q || request.current) return
    const prompt = options.ask?.system ?? (typeof system === 'function' ? system() : system)
    options.ask?.onSend?.()
    void submit({ text: q, system: prompt, opening: options.opening }, options.fromInput ?? false)
  }
  useEffect(() => {
    if (opening && connected && !started.current) { started.current = true; send(opening, { opening: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!ask || !connected || busy || request.current || consumed.current === ask) return
    consumed.current = ask
    onAskConsumed?.(ask)
    send(ask.text, { ask })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, busy, connected])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [turns, busy, draft.failed])

  if (!connected) return <div className="ai-empty">
    <p>還沒連接 Claude。到「設定 → 連接 Claude」貼上 API 金鑰，這裡就能用了。</p>
    <a className="ai-go" href="#settings" onClick={e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      onGoToSettings()
    }}>去設定</a>
  </div>

  return <div className="ai-chat">
    <div className="ai-log">
      {turns.length === 0 && draft.failed.length === 0 && !busy && <SketchIntro text={tutorPersona() === 'teacher' ? '你好' : '嗨～哥哥'} />}
      {turns.map((t, index) => {
        if (index === openingIndex) return null
        return <div key={index} className={'ai-msg ai-' + t.role}>
          {t.role === 'assistant' ? <><Spark size={18} /><div className="ai-text"><Typed text={t.content} animate={index === fresh} onTick={() => end.current?.scrollIntoView({ block: 'nearest' })} /></div></>
            : <p>{t.content}</p>}
        </div>
      })}
      {pending && !pending.opening && <div className="ai-msg ai-user"><p>{pending.text}</p></div>}
      {busy && <Thinking />}
      {draft.failed.map((f, i) => pending === f.question ? null : <div className="ai-failed" key={i}>
        <div className="ai-msg ai-user"><p>{f.question.text}</p></div>
        <p className="ai-error" role="alert">{f.error}</p>
        <div className="ai-suggest">
          <button type="button" disabled={busy} onClick={() => void submit(f.question, false, f)}>重送這個問題</button>
          <button type="button" disabled={busy} onClick={() => setDraft(d => ({ ...d, failed: d.failed.filter(other => other !== f) }))}>移除這則問題</button>
        </div>
      </div>)}
      {persist && turns.length > 0 && !busy && <button type="button" className="ai-clear" onClick={() => { setTurns([]); saveTurns(persist, []) }}>清空這段對話（記住的事不會刪）</button>}
      {!busy && (alwaysSuggest || turns.length <= (opening ? 2 : 0)) && suggestions.length > 0 && <div className="ai-suggest">
        {suggestions.map(s => <button type="button" key={s} onClick={() => send(s)}>{s}</button>)}
      </div>}
      <div ref={end} />
    </div>
    <form className="ai-input" onSubmit={e => { e.preventDefault(); send(draft.text, { fromInput: true }) }}>
      <input value={draft.text} onChange={e => {
        const text = e.target.value
        setDraft(d => ({ ...d, text }))
      }} placeholder={placeholder} aria-label="輸入問題" />
      <button type="submit" disabled={busy || !draft.text.trim()} aria-label="送出"><ArrowUp size={19} strokeWidth={2.4} /></button>
    </form>
  </div>
}

/** Floating panel (bottom sheet on phones) that sits above everything, including other dialogs. */
export function AISheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const veil = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLElement>(null)
  // Focus starts on the sheet itself (not the input, so a phone keyboard does not jump up) and returns to the button.
  useModal(veil, onClose, { initial: () => sheet.current })
  return createPortal(<div className="ai-veil" ref={veil} onClick={e => { e.stopPropagation(); onClose() }}>
    <section className="ai-sheet" ref={sheet} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : '問問 Claude'} onClick={e => e.stopPropagation()}>
      <header><HoverPet size={26} /><strong>{title}</strong>
        <button type="button" className="ai-close" aria-label="關閉" onClick={onClose}><X size={18} /></button></header>
      {children}
    </section>
  </div>, document.body)
}

export const tutorSettingsEvent = 'dream-blueprint:open-tutor-settings'

function goToTutorSettings(close: () => void) {
  close()
  window.dispatchEvent(new Event(tutorSettingsEvent))
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
    {/* Just the pet: 問問 Claude on every word reads as clutter. A word used as its own button keeps its text. */}
    {label === '問問 Claude' || label === '問'
      ? <button type="button" className="ask-word ask-pet" onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={'問問 Claude：' + en} title="問問 Claude">
          <PetIcon />
        </button>
      : <button type="button" className="ask-word" onClick={e => { e.stopPropagation(); setOpen(true) }} aria-label={'問問 Claude：' + en}>
          <PetIcon size={16} />{label}
        </button>}
    {open && <AISheet title={<><span lang="en">{en}</span>{zh ? <small> · {zh}</small> : null}</>} onClose={() => setOpen(false)}>
      <AIChat system={personaText() + '\n\n' + wordSystem} opening={'請教我這個單字：' + en + (zh ? '（' + zh + '）' : '')}
        onGoToSettings={() => goToTutorSettings(() => setOpen(false))}
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
  const [ask, setAsk] = useState<ChatAsk>()
  const recovery = useRef<ChatDraft>({ text: '', failed: [] })
  const typing = useTyping()
  const pet = usePet(typing)
  const task = useCurrentTask()
  const base = [
    personaText(),
    '你住在玄燁的「夢想藍圖」網站裡，幫他學習。他是台灣護理系學生，目標考雅思、去美國當註冊護理師。',
    '他可能問英文單字、文法、中翻英、雅思，也可能問護理課業或學習計畫。用繁體中文回答，非常簡短：直接回答重點就好，需要時才給一個短例子。出中翻英時一次只出一句，不先給答案。不要用 Markdown 標題、粗體或長清單。',
    '他要練中翻英時，照下面的教法：一次一句、先讓他自己翻、錯了分層提示。',
    '',
    '以下是網站自動產生的他的進度：',
    progress,
  ].join('\n')
  // 「只問單字或別的」: the task on screen stays out of the question and its record (back on for the next task).
  const [general, setGeneral] = useState(false)
  const hiddenNow = useRef('')
  useEffect(() => { setGeneral(false); hiddenNow.current = '' }, [task?.label])
  useEffect(() => {
    const on = (e: Event) => {
      const d = askDetail((e as CustomEvent).detail)
      const standalone = !!d.general
      const hidden = d.hidden ?? ''
      setOpen(true)
      setGeneral(standalone)
      hiddenNow.current = hidden
      // A button starts one question. Bind its subject before a route or the visible task can change.
      if (d.text.trim() && tutorKey()) {
        const subject = standalone ? null : currentTask()
        const onSend = subject?.onHelp ? () => {
          const active = currentTask()
          if (active && active.label === subject.label && active.detail === subject.detail) active.onHelp?.()
        } : undefined
        setAsk({ text: d.text, system: base + '\n' + [hidden, taskPrompt(subject)].filter(Boolean).join('\n'), onSend })
      } else {
        setAsk(undefined)
      }
    }
    window.addEventListener(askEvent, on)
    return () => window.removeEventListener(askEvent, on)
  }, [base])
  const openChat = () => { setGeneral(false); hiddenNow.current = ''; setAsk(undefined); setOpen(true) }
  const closeChat = () => { setAsk(undefined); setOpen(false) }
  // Read the latest draft at the time of a typed follow-up.
  const system = () => base + '\n' + [hiddenNow.current, askedAbout(currentTask(), general).prompt].filter(Boolean).join('\n')
  return <>
    <div className={'ai-fab' + (typing ? ' compact' : '') + (pet.big ? ' showing' : '')}>
      <button type="button" className="ai-pet-btn" aria-label={typing ? '問問 Claude' : '小怪獸：點一下看牠表演'} title={typing ? '問問 Claude' : '摸摸小怪獸'}
        onPointerEnter={e => { if (e.pointerType === 'mouse' && !typing) pet.show(true) }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') pet.hide() }}
        onClick={e => { if (typing) openChat(); else if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') pet.show(false) }}>
        <span className="ai-pet-stage"><PixelPet action={pet.action} size={30} /></span>
        {pet.label && <span className="ai-pet-bubble" aria-live="polite">{pet.label}</span>}
      </button>
      <button type="button" className="ai-fab-label" onClick={openChat}>問問 Claude</button>
    </div>
    {open && <AISheet title="問問 Claude" onClose={closeChat}>
      {task && <p className="ai-task"><b>{general ? '先不帶這題' : '正在協助'}</b><span>{task.label}</span></p>}
      {task?.onHelp && <p className="ai-task-note">{general ? '現在問的不會帶這一題，也不影響這題的紀錄。' : '問這一題會記成「有提示完成」（跟按「我卡住了」一樣）；要正式批改，用題目下面的批改按鈕。'}
        <button type="button" className="pr-link" onClick={() => setGeneral(!general)}>{general ? '改回問這一題' : '只問單字或別的'}</button></p>}
      <AIChat system={system} persist="dream-blueprint.assistant-chat" introCards={progressCards(progress)} ask={ask} alwaysSuggest={!!task} recovery={recovery}
        onAskConsumed={sent => setAsk(pending => pending === sent ? undefined : pending)}
        onGoToSettings={() => goToTutorSettings(closeChat)}
        suggestions={task && !general ? ['我卡住了，給我一點提示就好', '幫我看我寫的哪裡怪', '這題要用哪個文法？'] : []}
        placeholder={task && !general ? '問這一題' + (task.onHelp ? '' : '，或問別的') : '問單字、文法，或叫我出一句中翻英'} />
    </AISheet>}
  </>
}

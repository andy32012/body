import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, X } from 'lucide-react'
import { askTutor, isTutorCredentialStorageKey, personaText, tutorKey, tutorKeyChange, tutorPersona, type TutorTurn } from '../lib/tutor'
import { askClaude, askDetail, askEvent, askedAbout, captureTaskHelp, currentTask, currentTaskChatScope, taskPrompt, useCurrentTask } from '../lib/taskContext'
import { appendChatExchange, clearChatHistory, createChatExchange, emptyChat, exchangeTurns, isChatChange, readChatHistory, type ChatHistory, type ChatTurn } from '../lib/chatHistory'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog, logConsent } from '../lib/drive'
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

function loadHistory(key?: string) {
  try { return key ? readChatHistory(key) : undefined } catch { return undefined }
}

function watchConnection(refresh: () => void) {
  const onStorage = (event: StorageEvent) => { if (isTutorCredentialStorageKey(event.key)) refresh() }
  window.addEventListener('storage', onStorage)
  window.addEventListener(tutorKeyChange, refresh)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(tutorKeyChange, refresh)
  }
}
const useConnected = () => useSyncExternalStore(watchConnection, () => !!tutorKey(), () => false)
const mergeTurns = (stored: ChatTurn[], unsaved: ChatTurn[]) =>
  [...new Map([...stored, ...unsaved].map(turn => [turn.id, turn])).values()].slice(-40)

const generalScope = 'general'
type ChatPrompt = { system: string; scope: string; label?: string }
type ChatAsk = ChatPrompt & { id: string; text: string; standalone: boolean; onSend?: () => void }
type ChatQuestion = ChatPrompt & { text: string; opening?: boolean }
type FailedQuestion = { question: ChatQuestion; error: string }
type ChatDraft = { text: string; failed: FailedQuestion[] }
type ActiveRequest = { controller: AbortController; question: ChatQuestion; generation: string }
type ChatRecovery = {
  draft: ChatDraft
  unsaved: ChatHistory
  request: { current: ActiveRequest | null }
  listeners: Set<() => void>
}
const emptyDraft: ChatDraft = { text: '', failed: [] }

function failedDraft(draft: ChatDraft, question: ChatQuestion, error: string, retry?: FailedQuestion): ChatDraft {
  const failed = { question, error }
  return { ...draft, failed: retry ? draft.failed.map(f => f === retry ? failed : f) : [...draft.failed, failed] }
}

// A pairing dialog or page can remount the assistant. Keep original prompts in this tab's memory.
let heldQuestions: ChatAsk[] = []
const floatingRecovery: ChatRecovery = { draft: emptyDraft, unsaved: emptyChat, request: { current: null }, listeners: new Set() }
let questionSerial = 0

/** A conversation with Claude. `opening` is sent from the word button that opened the panel. */
export function AIChat({ system, opening, placeholder = '有問題就問我', suggestions = [], persist, introCards = [], ask, onAskConsumed, deferred = [], onDeferred, onRetry, onGoToSettings, alwaysSuggest = false, recovery }:
  { system: string | (() => ChatPrompt); opening?: string; placeholder?: string; suggestions?: string[]; persist?: string; introCards?: string[]
    /** A one-time request from a button outside the chat, with the context captured when it was pressed. */
    ask?: ChatAsk; onAskConsumed?: (ask: ChatAsk) => void; onGoToSettings: () => void; alwaysSuggest?: boolean
    deferred?: ChatAsk[]; onDeferred?: (ask: ChatAsk, send: boolean) => void
    onRetry?: (question: ChatQuestion) => void; recovery?: ChatRecovery }) {
  const memory = useMemory()
  const [history, setHistory] = useState(() => {
    const saved = loadHistory(persist)
    if (!saved) return recovery?.unsaved ?? emptyChat
    return recovery?.unsaved.generation === saved.generation
      ? { ...saved, turns: mergeTurns(saved.turns, recovery.unsaved.turns) } : saved
  })
  const { turns } = history
  const generation = useRef(history.generation)
  const unsaved = useRef<ChatTurn[]>(recovery?.unsaved.generation === history.generation ? recovery.unsaved.turns : [])
  const [notice, setNotice] = useState(() => unsaved.current.length ? '這裡還有未能儲存的回覆，關閉分頁前可以先複製。' : '')
  const [draft, setRenderedDraft] = useState(() => recovery?.draft ?? emptyDraft)
  const currentDraft = useRef(draft)
  const [pending, setPending] = useState<ChatQuestion | null>(() => recovery?.request.current?.question ?? null)
  const busy = pending !== null
  const [openingId, setOpeningId] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  const localRequest = useRef<ActiveRequest | null>(null)
  const request = recovery?.request ?? localRequest
  const consumed = useRef<ChatAsk | null>(null)
  const [fresh, setFresh] = useState('')
  const connected = useConnected()

  function setDraft(change: (prev: ChatDraft) => ChatDraft) {
    const next = change(recovery?.draft ?? currentDraft.current)
    currentDraft.current = next
    if (recovery) recovery.draft = next
    setRenderedDraft(next)
  }
  // Drop ownership before aborting so a late reply can't update the history, memory or optional Drive log.
  function stopRequest() {
    const active = request.current
    request.current = null
    active?.controller.abort()
  }
  // The floating assistant owns its request per tab. A panel rebuilt after navigation can still show the same answer.
  useLayoutEffect(() => () => {
    if (!recovery) stopRequest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function saveUnsaved(value: ChatTurn[]) {
    unsaved.current = value
    if (recovery) recovery.unsaved = { generation: generation.current, turns: value }
  }
  function showHistory(saved: typeof history) {
    if (request.current && request.current.generation !== saved.generation) {
      stopRequest()
      setPending(null)
      setNotice('這段對話已清空。')
    }
    if (saved.generation !== generation.current) {
      generation.current = saved.generation
      saveUnsaved([])
      setFresh('')
      setNotice('這段對話已清空。')
    } else if (recovery && recovery.unsaved.generation !== saved.generation) {
      saveUnsaved([])
    }
    const next = { ...saved, turns: mergeTurns(saved.turns, unsaved.current) }
    setHistory(next)
    return next
  }
  useLayoutEffect(() => {
    if (!persist) return
    const refresh = () => {
      const latest = loadHistory(persist)
      if (latest) showHistory(latest)
    }
    const recover = () => {
      if (!recovery) return
      setRenderedDraft(recovery.draft)
      setPending(recovery.request.current?.question ?? null)
      unsaved.current = recovery.unsaved.generation === generation.current ? recovery.unsaved.turns : []
      if (unsaved.current.length) setNotice('這裡還有未能儲存的回覆，關閉分頁前可以先複製。')
      const latest = loadHistory(persist)
      if (latest) showHistory(latest)
      else setHistory(previous => ({ ...previous, turns: mergeTurns(previous.turns, unsaved.current) }))
    }
    const onStorage = (event: StorageEvent) => { if (isChatChange(persist, event.key)) refresh() }
    window.addEventListener('storage', onStorage)
    if (recovery) {
      recovery.listeners.add(recover)
      recover()
    } else refresh()
    return () => {
      window.removeEventListener('storage', onStorage)
      recovery?.listeners.delete(recover)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persist])
  async function submit(question: ChatQuestion, fromInput: boolean, retry?: FailedQuestion) {
    if (request.current) return
    const saved = loadHistory(persist)
    const base = saved ? showHistory(saved) : history
    const active = { controller: new AbortController(), question, generation: base.generation }
    const consent = logConsent()
    request.current = active
    // The visible log includes earlier activities. Claude sees only the turns from the chosen conversation.
    const next: TutorTurn[] = [
      ...base.turns.filter(turn => turn.scope === question.scope).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: question.text },
    ]
    setPending(question)
    if (fromInput) setDraft(d => ({ ...d, text: '' }))
    const timeout = window.setTimeout(() => active.controller.abort(), 5 * 60_000)
    const canUpdateMemory = question.scope === generalScope
    try {
      const raw = await askTutor(question.system + '\n' + memoryPrompt(memory.notes, canUpdateMemory), next, active.controller.signal)
      if (request.current !== active) return
      if (active.controller.signal.aborted) throw active.controller.signal.reason
      if (!raw.trim()) throw new Error('Claude 沒有回傳文字，請再試一次。')
      const { clean, remember, forget } = extractMemory(raw)
      const entry = createChatExchange(question.text, clean || '這次沒有可顯示的回覆。', question.scope)
      const exchange = exchangeTurns(entry)
      if (persist) {
        try {
          if (!appendChatExchange(persist, base.generation, entry)) {
            const latest = loadHistory(persist)
            if (latest) showHistory(latest)
            return
          }
          const latest = readChatHistory(persist)
          showHistory(latest)
          if (latest.generation !== base.generation) return
        } catch {
          saveUnsaved(mergeTurns(unsaved.current, exchange))
          setHistory(previous => ({ ...previous, turns: mergeTurns(previous.turns, exchange) }))
          setNotice('瀏覽器未能確認這則對話已儲存。回覆目前仍可在這裡查看。')
        }
      } else {
        setHistory(previous => ({ ...previous, turns: [...previous.turns, ...exchange] }))
      }
      setFresh(exchange[1].id)
      if (question.opening) setOpeningId(exchange[0].id)
      if (retry) setDraft(d => ({ ...d, failed: d.failed.filter(f => f !== retry) }))
      try {
        // Don't turn an exercise's answer or private prompt into a shared memory entry.
        if (canUpdateMemory && (remember.length || forget.length)) memory.update(remember, forget)
        driveLog('問問 Claude', [{ role: 'user', text: question.text }, { role: 'Claude', text: clean }], consent)
      } catch {
        if (request.current === active) setNotice('回覆已收到，未能更新長期記憶或雲端紀錄。')
      }
    } catch (error) {
      if (request.current !== active) return
      const message = active.controller.signal.aborted ? '等候回覆逾時，可以選擇重送。'
        : error instanceof Error ? error.message : String(error)
      setDraft(d => failedDraft(d, question, message, retry))
    } finally {
      window.clearTimeout(timeout)
      if (request.current === active) {
        request.current = null
        setPending(null)
      }
      recovery?.listeners.forEach(listener => listener())
    }
  }

  function send(content: string, options: { fromInput?: boolean; opening?: boolean; ask?: ChatAsk } = {}) {
    const q = content.trim()
    if (!q || request.current || !tutorKey()) return
    const source = options.ask ?? (typeof system === 'function' ? system() : { system, scope: generalScope })
    options.ask?.onSend?.()
    void submit({ text: q, system: source.system, scope: source.scope, label: source.label, opening: options.opening }, options.fromInput ?? false)
  }
  function sendDeferred(question: ChatAsk) {
    if (request.current || !tutorKey()) return
    onDeferred?.(question, true)
    send(question.text, { ask: question })
  }
  function clearHistory() {
    if (!persist || request.current) return
    try { showHistory(clearChatHistory(persist)) }
    catch { setNotice('瀏覽器未能清空這段對話，請再試一次。') }
  }
  useEffect(() => {
    if (opening && connected && !started.current) { started.current = true; send(opening, { opening: true }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (!ask || !connected || !tutorKey() || busy || request.current || consumed.current === ask) return
    consumed.current = ask
    onAskConsumed?.(ask)
    send(ask.text, { ask })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, busy, connected])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [turns, busy, draft.failed])

  if (!connected) return <div className="ai-empty">
    <p>還沒連接 Claude。到「設定 → 連接 Claude」貼上 API 金鑰，這裡就能用了。</p>
    {deferred.length > 0 && <p>這個分頁會保留原題。設定好後再開「問問 Claude」，就能確認送出。</p>}
    <a className="ai-go" href="#settings" onClick={e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      onGoToSettings()
    }}>去設定</a>
  </div>

  return <div className="ai-chat">
    <div className="ai-log">
      {turns.length === 0 && draft.failed.length === 0 && !busy && <SketchIntro text={tutorPersona() === 'teacher' ? '你好' : '嗨～哥哥'} />}
      {turns.map(t => {
        if (t.id === openingId) return null
        return <div key={t.id} className={'ai-msg ai-' + t.role}>
          {t.role === 'assistant' ? <><Spark size={18} /><div className="ai-text"><Typed text={t.content} animate={t.id === fresh} onTick={() => end.current?.scrollIntoView({ block: 'nearest' })} /></div></>
            : <p>{t.content}</p>}
        </div>
      })}
      {pending && !pending.opening && <div className="ai-msg ai-user"><p>{pending.text}</p></div>}
      {busy && <Thinking />}
      {deferred.map(question => <div className="ai-failed" key={question.id}>
        <small>{question.label ?? '連接 Claude 前保留的問題'}</small>
        <div className="ai-msg ai-user"><p>{question.text}</p></div>
        <div className="ai-suggest">
          <button type="button" disabled={busy} onClick={() => sendDeferred(question)}>送出這個問題</button>
          <button type="button" onClick={() => onDeferred?.(question, false)}>移除這則問題</button>
        </div>
      </div>)}
      {draft.failed.map((f, i) => pending === f.question ? null : <div className="ai-failed" key={i}>
        <div className="ai-msg ai-user"><p>{f.question.text}</p></div>
        <p className="ai-error" role="alert">{f.error}</p>
        <div className="ai-suggest">
          <button type="button" disabled={busy} onClick={() => {
            if (request.current || !tutorKey()) return
            onRetry?.(f.question)
            void submit(f.question, false, f)
          }}>重送這個問題</button>
          <button type="button" disabled={busy} onClick={() => setDraft(d => ({ ...d, failed: d.failed.filter(other => other !== f) }))}>移除這則問題</button>
        </div>
      </div>)}
      {notice && <p className="ai-error" role="status">{notice}</p>}
      {persist && turns.length > 0 && !busy && <button type="button" className="ai-clear" onClick={clearHistory}>清空這段對話（記住的事不會刪）</button>}
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
export function AISheet({ title, onClose, children, fallback }: {
  title: ReactNode; onClose: () => void; children: ReactNode; fallback?: () => HTMLElement | null | undefined
}) {
  const veil = useRef<HTMLDivElement>(null)
  const sheet = useRef<HTMLElement>(null)
  // Focus starts on the sheet itself (not the input, so a phone keyboard does not jump up) and returns to the button.
  useModal(veil, onClose, { initial: () => sheet.current, fallback })
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
export function AskWord({ en, zh, label = '問問 Claude', fallback }: {
  en?: string; zh?: string; label?: string; fallback?: () => HTMLElement | null | undefined
}) {
  const [word, setWord] = useState<{ en: string; zh?: string }>()
  const question = (entry: { en: string; zh?: string }) => '請教我這個單字：' + entry.en + (entry.zh ? '（' + entry.zh + '）' : '')
  function openWord() {
    if (!en) return
    if (!tutorKey()) {
      askClaude(question({ en, zh }), { general: true, hidden: wordSystem })
      return
    }
    // Keep the conversation on the selected word if the page moves to a different card.
    setWord({ en, zh })
  }
  const closeWord = () => setWord(undefined)
  return <>
    {/* Just the pet: 問問 Claude on every word reads as clutter. A word used as its own button keeps its text. */}
    {en && (label === '問問 Claude' || label === '問'
      ? <button type="button" className="ask-word ask-pet" onClick={e => { e.stopPropagation(); openWord() }} aria-label={'問問 Claude：' + en} title="問問 Claude">
          <PetIcon />
        </button>
      : <button type="button" className="ask-word" onClick={e => { e.stopPropagation(); openWord() }} aria-label={'問問 Claude：' + en}>
          <PetIcon size={16} />{label}
        </button>)}
    {word && <AISheet title={<><span lang="en">{word.en}</span>{word.zh ? <small> · {word.zh}</small> : null}</>} onClose={closeWord} fallback={fallback}>
      <AIChat system={personaText() + '\n\n' + wordSystem} opening={question(word)}
        onGoToSettings={() => goToTutorSettings(closeWord)}
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
  const [deferred, setDeferred] = useState(() => heldQuestions)
  const [focused, setFocused] = useState<ChatPrompt>()
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
  // Detach from this activity only. Opening a different task makes its help available again.
  const [detached, setDetached] = useState<string>()
  const taskScope = currentTaskChatScope()
  const general = detached === taskScope
  function hold(question: ChatAsk) {
    heldQuestions = [...heldQuestions, question]
    setDeferred(heldQuestions)
  }
  function removeHeld(question: ChatAsk) {
    heldQuestions = heldQuestions.filter(item => item !== question)
    setDeferred(heldQuestions)
  }
  useEffect(() => {
    const on = (e: Event) => {
      const d = askDetail((e as CustomEvent).detail)
      const standalone = !!d.general
      const hidden = d.hidden ?? ''
      setOpen(true)
      setDetached(undefined)
      setFocused(undefined)
      // Keep each button question until the chat actually starts it. Unmounting or a second button press won't lose it.
      if (d.text.trim()) {
        const subject = standalone ? null : currentTask()
        const scope = currentTaskChatScope()
        const id = String(++questionSerial)
        const question: ChatAsk = { id, text: d.text, label: subject?.label, standalone,
          scope: standalone ? scope + ':question:' + id : subject ? scope : generalScope,
          system: base + '\n' + [hidden, taskPrompt(subject)].filter(Boolean).join('\n'),
          onSend: standalone ? undefined : captureTaskHelp() }
        hold(question)
        setAsk(tutorKey() ? question : undefined)
      } else {
        setAsk(undefined)
      }
    }
    window.addEventListener(askEvent, on)
    return () => window.removeEventListener(askEvent, on)
  }, [base])
  const openChat = () => { setDetached(undefined); setAsk(undefined); setFocused(undefined); setOpen(true) }
  const closeChat = () => {
    setAsk(undefined)
    setOpen(false)
  }
  function system(): ChatPrompt {
    if (focused) return focused
    const scope = currentTaskChatScope()
    const subject = detached === scope ? null : currentTask()
    const prompt = askedAbout(subject, !subject).prompt
    return { system: prompt ? base + '\n' + prompt : base, scope: subject ? scope : generalScope, label: subject?.label }
  }
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
      {focused ? <p className="ai-task"><b>正在協助</b><span>{focused.label ?? '剛才選的問題'}</span>
        <button type="button" className="pr-link" onClick={() => { setFocused(undefined); setDetached(taskScope) }}>結束原題追問</button></p>
        : task && <p className="ai-task"><b>{general ? '先不帶這題' : '正在協助'}</b><span>{task.label}</span></p>}
      {!focused && task && <p className="ai-task-note">{general ? '現在問的不會帶這一題，也不影響這題的紀錄。' : task.onHelp ? '問這一題會記成「有提示完成」（跟按「我卡住了」一樣）；要正式批改，用題目下面的批改按鈕。' : null}
        <button type="button" className="pr-link" onClick={() => setDetached(general ? undefined : taskScope)}>{general ? '改回問這一題' : '只問單字或別的'}</button></p>}
      <AIChat system={system} persist="dream-blueprint.assistant-chat" introCards={progressCards(progress)} ask={ask}
        deferred={deferred.filter(item => item !== ask)} alwaysSuggest={!focused && !!task} recovery={floatingRecovery}
        onAskConsumed={sent => {
          removeHeld(sent)
          if (sent.standalone) setFocused(sent)
          setAsk(pending => pending === sent ? undefined : pending)
        }}
        onDeferred={(question, send) => {
          removeHeld(question)
          if (send) {
            setFocused(question.scope === generalScope ? undefined : question)
            if (question.scope === generalScope) setDetached(taskScope)
          }
        }}
        onRetry={question => {
          setFocused(question.scope === generalScope ? undefined : question)
          if (question.scope === generalScope) setDetached(taskScope)
        }}
        onGoToSettings={() => goToTutorSettings(closeChat)}
        suggestions={!focused && task && !general ? ['我卡住了，給我一點提示就好', '幫我看我寫的哪裡怪', '這題要用哪個文法？'] : []}
        placeholder={focused ? '接著問原來的問題' : task && !general ? '問這一題' : '問單字、文法，或叫我出一句中翻英'} />
    </AISheet>}
  </>
}

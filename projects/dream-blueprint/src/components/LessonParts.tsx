import DraftVersions from './DraftVersions'
import OwnCheck from './OwnCheck'
import AskWhy from './AskWhy'
import { useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, Volume2 } from 'lucide-react'
import CorrectBox, { correctionBlocked, useCorrectionBlocked, useCorrectionPending } from './CorrectBox'
import { mergeCorrectionFollowUps, requireCorrectionSave, type CorrectionSubmission } from '../lib/correctionHistory'
import TutorChat from './TutorChat'
import { sameEnglish } from '../lib/evidence'
import StuckButton from './StuckButton'
import { useTaskContext } from '../lib/taskContext'
import { tutorKey } from '../lib/tutor'
import { clearDraft, readDraft, writeDraft } from '../lib/drafts'
import { chartBounds, isTimeSeries } from '../lib/chart'
import { isProcessChart, isTableChart, type WriteChart } from '../lib/writing'
import type { SayCard } from '../lib/sayCards'
import { issuesFixed, lessonSteps, mergeExpress, sentenceFrame, type CorrectionResult, type ExpressRecord, type HeardRecord, type Lesson, type LessonLine, type LessonPrompt, type LessonStep, type VariationCheck } from '../lib/lesson'
import './lesson.css'

/** `pick` lists the earlier steps that can be looked at again; pressing one calls onPick. `review` is the one being looked at. */
export function StepBar({ current, done, pick = [], onPick, review }: { current: LessonStep; done: LessonStep[]; pick?: LessonStep[]
  onPick?: (id: LessonStep) => void; review?: LessonStep | null }) {
  return <ol className="ls-steps" aria-label="今天這一堂的步驟">
    {lessonSteps.map(([id, name]) => {
      const state = id === 'done' && done.includes('done') ? 'done' : id === current ? 'now' : done.includes(id) ? 'done' : 'todo'
      const mark = <><i aria-hidden="true">{state === 'done' ? <Check size={11} strokeWidth={3} /> : null}</i><span>{name}</span></>
      return <li key={id} data-state={state} data-review={review === id || undefined} aria-current={state === 'now' ? 'step' : undefined}>
        {onPick && pick.includes(id) ? <button type="button" className="ls-step-pick" aria-label={'回頭看：' + name} onClick={() => onPick(id)}>{mark}</button> : mark}
      </li>
    })}
  </ol>
}

/** The device's English voices for an accent (en-GB, en-AU…), best first; empty when the device has none. */
export function accentVoices(accent: string) {
  if (!('speechSynthesis' in window)) return []
  const want = accent.toLowerCase()
  return speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase() === want)
}
/** Re-renders when the device's voice list arrives (it loads late on some browsers). */
export function useVoiceList() {
  const [, setN] = useState(0)
  useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const on = () => setN(n => n + 1)
    speechSynthesis.addEventListener?.('voiceschanged', on)
    return () => speechSynthesis.removeEventListener?.('voiceschanged', on)
  }, [])
}

/** Reads lines aloud one after another; the second speaker gets a different voice (or pitch).
 *  `accent` picks the device's voices for that accent when it has them (computer voices, not recordings), else any English voice.
 *  `completed` counts plays that reached the last line without being stopped or failing — pressing play is not listening.
 *  `status`: error = the voice could not play (treated as no audio, so nothing counts as "understood by ear"). */
export function useDialogueVoice(rate: number, accent = 'en-US') {
  const [playing, setPlaying] = useState<number | null>(null)
  const [completed, setCompleted] = useState(0)
  const [status, setStatus] = useState<'idle' | 'playing' | 'done' | 'stopped' | 'error'>('idle')
  const run = useRef(0)
  useEffect(() => () => { run.current++; window.speechSynthesis?.cancel() }, [])
  function stop() {
    run.current++; window.speechSynthesis?.cancel(); setPlaying(null)
    setStatus(s => s === 'playing' ? 'stopped' : s)
  }
  function play(lines: LessonLine[], start = 0, only = false) {
    if (!('speechSynthesis' in window)) return false
    run.current++; window.speechSynthesis.cancel()
    const id = run.current
    const full = start === 0 && !only
    const speakers = [...new Set(lines.map(l => l.who))]
    const english = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'))
    const matching = accentVoices(accent)
    const voices = matching.length ? matching : english
    const say = (i: number) => {
      if (id !== run.current) return
      if (i >= lines.length || (only && i > start)) {
        setPlaying(null)
        if (full) { setCompleted(n => n + 1); setStatus('done') } else setStatus('idle')
        return
      }
      const u = new SpeechSynthesisUtterance(lines[i].en)
      const who = speakers.indexOf(lines[i].who)
      u.lang = matching.length ? accent : 'en-US'
      u.rate = Math.max(0.5, Math.min(1.4, rate))
      if (voices.length > 1 || matching.length) u.voice = voices[who % 2 === 0 ? 0 : Math.min(voices.length - 1, 1)]
      u.pitch = who % 2 === 0 ? 1 : 1.25
      u.onend = () => say(i + 1)
      u.onerror = e => {
        if (id !== run.current) return
        setPlaying(null)
        setStatus(e.error === 'interrupted' || e.error === 'canceled' ? 'stopped' : 'error')
      }
      setPlaying(i)
      speechSynthesis.speak(u)
    }
    setStatus(full ? 'playing' : 'idle')
    say(start)
    return true
  }
  return { playing, play, stop, completed, status }
}

export function Transcript({ lines, playing, onPlayLine, showZh }: { lines: LessonLine[]; playing: number | null; onPlayLine: (i: number) => void; showZh: boolean }) {
  return <ol className="ls-lines">
    {lines.map((l, i) => <li key={i} data-playing={playing === i}>
      <button type="button" className="ls-line-play" aria-label={'播放這一句：' + l.en} onClick={() => onPlayLine(i)}><Volume2 size={14} /></button>
      <div><small>{l.who}</small><p lang="en">{l.en}</p>{showZh && <p className="ls-zh">{l.zh}</p>}</div>
    </li>)}
  </ol>
}

/** Listen first without the text, answer two questions, then read along. Later days: listen and shadow.
 *  The questions open after one complete play. A play that cannot be confirmed (no voice, an error, or a device that never
 *  reports the end) still lets him read or answer, but the result is not counted as understood by ear. */
export function LessonListen({ lesson, firstTime, rate, saved, onReveal, onDone, doneLabel = '下一步：句型' }: { lesson: Lesson; firstTime: boolean; rate: number
  saved?: HeardRecord; onReveal?: (record: Omit<HeardRecord, 'day' | 'lessonDate'>) => void; onDone: () => void; doneLabel?: string }) {
  const voice = useDialogueVoice(rate)
  const mountedAt = useRef(Date.now())
  const ready = () => Date.now() - mountedAt.current > 450
  const [started, setStarted] = useState(0)
  const [answers, setAnswers] = useState<number[]>(() => Array.isArray(saved?.picks) ? saved.picks : [])
  const [checked, setChecked] = useState(!firstTime)
  const [showZh, setShowZh] = useState(false)
  const [noVoice, setNoVoice] = useState(false)
  const [unsure, setUnsure] = useState(false)
  const openedTranscript = useRef(false)
  const heard = voice.completed > 0
  const open = heard || unsure
  const counted = firstTime && heard && !unsure && !noVoice
  const correct = lesson.questions.filter((q, i) => answers[i] === q.answer).length
  function openTranscript(counted: boolean, hasAnswers: boolean) {
    if (firstTime && !openedTranscript.current) {
      openedTranscript.current = true
      onReveal?.({ correct: hasAnswers ? correct : 0, total: hasAnswers ? lesson.questions.length : 0, counted, plays: voice.completed,
        ...(hasAnswers ? { picks: [...answers] } : {}) })
    }
    setChecked(true)
  }
  useEffect(() => {
    if (voice.status === 'error' && !noVoice) {
      setNoVoice(true)
      openTranscript(false, false)
    }
  }, [voice.status, noVoice, openTranscript])
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(lesson.dialogue)) { setNoVoice(true); openTranscript(false, false); return }
    setStarted(n => n + 1)
  }
  return <section className="ls-listen">
    <div className="pr-label">聽懂 · 情境：{lesson.scene}</div>
    <h2 className="pr-question">{firstTime && !checked ? '先只聽，不看字' : '看著字再聽一次，跟著唸'}</h2>
    <p className="ls-help">{firstTime && !checked ? '完整聽一到兩次，再回答下面兩題。聽不懂的字先猜。' : '一句一句點來聽，跟著念出聲；想確認意思再打開中文。'}</p>
    <button type="button" className="ls-play" onClick={playAll}>
      {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />播放對話{voice.completed ? '（完整聽過 ' + voice.completed + ' 次）' : ''}</>}
    </button>
    {noVoice && <p className="ls-help">這個瀏覽器沒辦法播放語音，直接讀下面的對話。這次不算「只聽也懂」。</p>}
    {firstTime && !checked && <ol className="ls-qs">
      {lesson.questions.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={answers[i] === j} disabled={!open}
          onClick={() => { if (!ready() || !open) return; const a = [...answers]; a[i] = j; setAnswers(a) }}>{o}</button>)}</div>
      </li>)}
    </ol>}
    {firstTime && !checked && !open && <p className="ls-help ls-need">先按「播放對話」完整聽一次，題目才能作答。中途停掉不算聽完。</p>}
    {firstTime && !checked && !open && started > 0 && voice.playing === null && <button type="button" className="pr-link" onClick={() => setUnsure(true)}>播完了，但題目沒有打開？</button>}
    {unsure && !heard && !checked && <p className="ls-help">這台裝置沒有回報播放結束，可以作答，但這次不算「只聽也懂」。</p>}
    {firstTime && !checked && <button type="button" className="pr-main" disabled={!open || answers.filter(a => a !== undefined).length < lesson.questions.length}
      onClick={() => { voice.stop(); openTranscript(counted, true) }}>對答案、看全文</button>}
    {(firstTime || Array.isArray(saved?.picks)) && checked && !noVoice && <ul className="ls-results">
      {lesson.questions.map((q, i) => <li key={i} data-ok={answers[i] === q.answer}>
        <span lang="en">{q.q}</span><b lang="en">{answers[i] === q.answer ? '✓ ' : '✗ '}{q.options[q.answer]}</b>
        <AskWhy q={{ source: '每日課的聽力', passage: lesson.dialogue.map(d => d.en).join(' / '), stem: q.q, options: q.options, picked: answers[i] === undefined ? '' : q.options[answers[i]], answer: q.options[q.answer], right: answers[i] === q.answer }} />
      </li>)}
    </ul>}
    {checked && <>
      <Transcript lines={lesson.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(lesson.dialogue, i, true)} />
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        <button type="button" className="pr-main" onClick={() => { voice.stop(); onDone() }}>{doneLabel}</button>
      </div>
    </>}
  </section>
}

/** What Claude said about a variation: the verdict on the first try with the exact text it judged, and whether it gave the answer away. */
export type { VariationCheck } from '../lib/lesson'
/** One more sentence with the same pattern, written from Chinese. With Claude connected the teacher can check it first
 *  (hints before the answer, as in the main sentence); the reference opens on 看答案 or once the teacher says it is right. */
export function LessonVariation({ item, count, tutorId, pattern, rule, peekedBefore, onPeek, saved, draftKey, onCheck, onDone, alreadyMarked = false }: { item: { zh: string; en: string; alt?: string[] }
  /** The check kept from an earlier visit today, and where to keep it (so leaving and coming back changes nothing). */
  saved?: VariationCheck; onCheck?: (check: VariationCheck) => void
  /** Where the answer being written is kept while he is away. */
  draftKey?: string
  /** Which of today's variations this is, and how many there are. */
  count?: [number, number]
  /** The id of today's sentence, so the teacher knows the unit and its rule. */
  tutorId?: string; pattern?: string; rule?: string
  /** The answer of this sentence was already shown on an earlier visit (the page was left and opened again). */
  peekedBefore?: boolean
  /** Remembers that the answer was shown, so opening the page again cannot hide it. */
  onPeek?: () => void
  alreadyMarked?: boolean
  onDone: (mark: 'good' | 'small' | 'again', answer: string, check: VariationCheck) => boolean }) {
  const [answer, setAnswerNow] = useState(() => (draftKey ? readDraft(draftKey) : '') || saved?.answer || saved?.last?.text || saved?.before || '')
  const setAnswer = (text: string) => { setAnswerNow(text); if (draftKey) writeDraft(draftKey, text) }
  const [shown, setShown] = useState(false)
  // Read once: pressing 看答案 now marks the record too, which must not show the "earlier visit" note right away.
  const [peekedAtStart] = useState(!!peekedBefore)
  const [check, setCheck] = useState<VariationCheck>(() => ({ ...(saved ?? {}), ...(peekedAtStart ? { revealed: true } : {}) }))
  const [latest, setLatestNow] = useState<{ v: string; text: string } | null>(() => saved?.last ?? null)
  const setLatest = (l: { v: string; text: string }) => { setLatestNow(l); setCheck(c => ({ ...c, last: l })) }
  // Every change of the check is kept as it happens (not only when the variation is finished).
  const firstCheck = useRef(true)
  useEffect(() => {
    if (firstCheck.current) { firstCheck.current = false; return }
    onCheck?.(check)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check])
  const [selfMark, setSelfMark] = useState(false)
  // With Claude connected there is no 看答案: Claude checks first and gives clearer hints on 「再給我一個提示」, never the whole answer. If Claude can't be reached, a comparison with the answer comes back (his own words marked).
  const keyed = !!tutorKey()
  const [claudeDown, setClaudeDown] = useState(false)
  const mountedAt = useRef(Date.now())
  const shownAt = useRef(0)
  const ready = () => Date.now() - mountedAt.current > 450
  const done = (m: 'good' | 'small' | 'again') => {
    if (Date.now() - shownAt.current > 450 && onDone(m, answer, check) && draftKey) clearDraft(draftKey)
  }
  const reveal = () => { shownAt.current = Date.now(); setShown(true); setCheck(c => c.before === undefined ? { ...c, before: answer } : c); onPeek?.() }
  const sentence = { id: tutorId ?? 'variation', zh: item.zh, reference: [item.en, ...(item.alt ?? [])], grammar: pattern ? [pattern] : [], hints: [], why: rule ?? '', newWords: [] }
  const edited = check.checkedText !== undefined && !sameEnglish(check.checkedText, answer)
  useTaskContext({
    label: '換個說法：' + item.zh,
    detail: ['題目（中翻英，跟今天的句子同一個句型）：' + item.zh, pattern ? '句型：' + pattern : '', '參考答案（他還沒看答案前不要說出來）：' + sentence.reference.join(' / ')].filter(Boolean).join('\n'),
    draft: answer,
    // Asked the floating Claude about it: counted like the teacher giving the answer (有提示完成).
    onHelp: () => { setCheck(c => c.revealed ? c : { ...c, revealed: true }); onPeek?.() },
  })
  return <section className="ls-vary">
    <div className="pr-label">換個說法{count ? ' ' + count[0] + '／' + count[1] : ''} · 同一個句型</div>
    <h2 className="pr-question">{item.zh}</h2>
    {peekedAtStart && <p className="ls-help">上次已經看過這題的答案了：這次寫對會記成有提示完成。</p>}
    <label className="pr-field">我的英文
      <textarea lang="en" rows={2} value={answer} spellCheck={false} autoComplete="off" onChange={e => setAnswer(e.target.value)} placeholder="先自己寫，再請 Claude 批改" />
    </label>
    {draftKey && <DraftVersions id={draftKey} text={answer} onChoose={setAnswerNow} />}
    <TutorChat sentence={sentence} answer={answer} onError={() => setClaudeDown(true)} trackWeak={!alreadyMarked}
      onReveal={() => { setCheck(c => ({ ...c, revealed: true })); onPeek?.(); if (keyed && !shown) reveal() }}
      onVerdict={(v, attempt, text) => {
        setLatest({ v, text })
        if (attempt === 1) setCheck(c => c.firstVerdict ? c : { ...c, firstVerdict: v, checkedText: text })
        // The teacher says it is right: the reference and the marks open without another tap.
        if (v === 'good') setShown(true)
      }} />
    {!shown ? <>
      {(!keyed || claudeDown) && <div className="pr-actions"><button type="button" className={keyed ? undefined : 'pr-main'} onClick={() => { if (ready()) reveal() }}>跟答案對照</button></div>}
      {/* A way on from the very first screen: a blank answer cannot be sent to Claude, and he may not know where to start. */}
      {keyed && !claudeDown && <div className="pr-actions ls-skip"><span className="ls-help">{check.firstVerdict ? '照 Claude 的提示改好再批一次；真的不會，按「再給我一個提示」，或' : answer.trim() ? '寫好就請 Claude 批改；想不出來也可以' : '連第一個字都想不到？可以'}</span><button type="button" className="pr-link" onClick={() => done('again')}>{check.firstVerdict ? '先跳過這題（加入複習）→' : '不會，先跳過（加入複習）→'}</button></div>}
    </> : <>
      {latest?.v === 'good' && sameEnglish(latest.text, answer)
        ? <section className="pr-reference"><small>你的答案（Claude 確認過）</small><p lang="en">{answer}</p></section>
        : <section className="pr-reference"><small>跟答案對照（不顯示答案）</small><OwnCheck answer={answer} references={[item.en, ...(item.alt ?? [])]} /></section>}
      {latest?.v === 'good' && sameEnglish(latest.text, answer) && !selfMark ? <div className="pr-actions pr-next-step">
        <button type="button" className="pr-main" onClick={() => done('good')}>Claude 說對了，{count && count[0] < count[1] ? '下一題' : '下一步'} →</button>
        <button type="button" className="pr-link" onClick={() => setSelfMark(true)}>我想自己評</button>
      </div> : <fieldset className="pr-marks"><legend>我寫得…（按一個就到{count && count[0] < count[1] ? '下一題' : '下一步'}）</legend>
        <button type="button" disabled={!answer.trim()} onClick={() => done('good')}>對了</button>
        <button type="button" disabled={!answer.trim()} onClick={() => done('small')}>差一點（加入複習）</button>
        <button type="button" onClick={() => done('again')}>不會（加入複習）</button>
      </fieldset>}
      {!answer.trim() && <p className="ls-help">沒有寫答案只能按「不會」：沒寫的題目不算完成。</p>}
      {answer.trim() && check.before !== undefined && !check.before.trim() && <p className="ls-help">還沒寫就先按了對照：這題不算完成，會加入複習；明天再自己寫一次。</p>}
      {answer.trim() && check.before?.trim() && !sameEnglish(check.before, answer) && <p className="ls-help">對照以後改過：記成有提示完成（對照前就寫對的話，還是算你自己完成）。</p>}
      {answer.trim() && check.firstVerdict && <p className="ls-help">
        {check.revealed ? '老師已經把答案告訴你了：按「對了」會記成有提示完成。'
          : check.firstVerdict !== 'good' ? '老師指出過要改的地方：改好後按「對了」，這次記成有提示完成。'
          : edited ? '你在老師確認之後又改了答案：按「對了」會拿你現在寫的跟參考句比。'
          : '老師確認意思和文法都對：按「對了」會記成當次獨立完成。'}
      </p>}
    </>}
  </section>
}

export function MiniChart({ chart }: { chart: NonNullable<LessonPrompt['chart']> }) {
  // Points in time are joined by a line (a trend); separate things (centres A–F) are bars from zero (a comparison).
  const bars = !isTimeSeries(chart.points.map(p => p.label))
  const bounds = chartBounds(chart.points.map(p => p.value))
  const lo = bars ? Math.min(0, bounds.lo) : bounds.lo, hi = bounds.hi
  const W = 320, H = 150, L = 34, R = 12, T = 14, B = 26
  const slot = (W - L - R) / Math.max(1, chart.points.length)
  const x = (i: number) => bars ? L + slot * (i + 0.5) : L + (W - L - R) * (chart.points.length === 1 ? 0.5 : i / (chart.points.length - 1))
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo))
  return <figure className="ls-chart">
    <figcaption lang="en">{chart.title}</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title + '：' + chart.points.map(p => p.label + ' ' + p.value).join('、')}>
      {[lo, (lo + hi) / 2, hi].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="ls-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>)}
      {!bars && <polyline points={chart.points.map((p, i) => x(i) + ',' + y(p.value)).join(' ')} className="ls-lineplot" />}
      {chart.points.map((p, i) => <g key={p.label}>
        {bars ? <rect x={x(i) - slot * 0.28} width={slot * 0.56} y={y(Math.max(p.value, lo))} height={Math.max(0, y(lo) - y(Math.max(p.value, lo)))} className="ls-bar" />
          : <circle cx={x(i)} cy={y(p.value)} r={3.5} className="ls-dot" />}
        <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" className="ls-val">{p.value}</text>
        <text x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
      </g>)}
    </svg>
  </figure>
}

/** A writing task's picture: a line or bars (MiniChart), a table with several columns, or a process drawn as numbered steps. */
export function ChartView({ chart }: { chart: WriteChart }) {
  if (isTableChart(chart)) return <figure className="ls-chart ls-table">
    <figcaption lang="en">{chart.title}</figcaption>
    <div className="ls-table-wrap"><table lang="en">
      <thead><tr><td />{chart.columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{chart.rows.map(r => <tr key={r.label}><th scope="row">{r.label}</th>{r.values.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody>
    </table></div>
  </figure>
  if (isProcessChart(chart)) return <figure className="ls-chart ls-process">
    <figcaption lang="en">{chart.title}</figcaption>
    <ol lang="en">{chart.steps.map((step, i) => <li key={i}><b aria-hidden="true">{i + 1}</b><span>{step}</span></li>)}</ol>
  </figure>
  return <MiniChart chart={chart} />
}

/** Say it your own way (no Chinese sentence to translate), get it corrected, fix it, try again. */
export function LessonExpress({ lessonId, lesson, prompt, draftKey, legacyDraftKey, pattern, saved, onRecord, onSave, onSpeak, onFinish }: {
  /** The open task is today's (promptFor), not always the unit's first. */
  lessonId: string; lesson: Lesson; prompt: LessonPrompt; draftKey: string; pattern: string; saved?: ExpressRecord
  legacyDraftKey?: string
  onRecord: (apply: (rec: ExpressRecord) => ExpressRecord, corrected: boolean) => void | Promise<void>
  onSave: (card: SayCard) => void; onSpeak: () => void; onFinish: (answer: string, rec: ExpressRecord) => void
}) {
  const [answer, setAnswer] = useState(() => readDraft(draftKey) || saved?.lastAnswer || '')
  const [run, setRun] = useState(0)
  const rec = saved ?? { corrections: 0, help: [] }
  const [shown, setShown] = useState<string[]>(() => saved?.help ?? [])
  const mountedAt = useRef(Date.now())
  const keyed = !!tutorKey()
  const p = prompt
  const corrected = rec.corrections > 0
  const firstSentence = p.sample.match(/^[^.?!]+[.?!]/)?.[0] ?? p.sample
  useTaskContext({
    label: '表達：' + p.en,
    detail: ['開放寫作題：' + p.en + '（' + p.zh + '）', '這課的句型：' + pattern + (lesson.cando ? '。目標：' + lesson.cando : ''),
      '參考寫法（只是例子，不要直接給他）：' + p.sample, '他要寫自己的內容；幫他想內容或句型就好，不要替他寫整段。'].join('\n'),
    draft: answer,
    onHelp: () => help('claude'),
  })
  function help(kind: 'zh' | 'cue' | 'frame' | 'sample' | 'claude') {
    if (Date.now() - mountedAt.current < 450) return
    setShown(list => list.includes(kind) ? list : [...list, kind])
    if (rec.help.includes(kind)) return
    onRecord(current => current.help.includes(kind) ? current : { ...current, help: [...current.help, kind] }, false)
  }
  const [previous, setPrevious] = useState<CorrectionResult>()
  // While Claude checks, the answer and the button wait: the check belongs to the text that was sent.
  const [checking, setChecking] = useState(false)
  const requestId = 'lesson-grade:' + lessonId
  const pending = useCorrectionPending(requestId)
  const blocked = useCorrectionBlocked(requestId)
  const waiting = checking || blocked
  const submission = useRef<ExpressRecord | undefined>(undefined)
  const submitted = submission.current
  const waitingForGrade = blocked || !!submitted
  /** The first answer is kept the moment it is sent, so a failed request still leaves a record. */
  function submit() {
    if (!answer.trim() || submission.current || correctionBlocked(requestId)) return
    setPrevious(rec.last)
    const first = { first: answer, firstHelp: [...rec.help] }
    submission.current = rec.first ? rec : { ...rec, ...first }
    setChecking(true)
    if (!rec.first) {
      onRecord(current => current.first ? current : { ...current, ...first }, false)
    }
    setRun(n => n + 1)
  }
  function result(r: CorrectionResult, sent: string, grade: CorrectionSubmission) {
    if (!submitted) throw new Error('找不到原作答的紀錄。')
    const isFirst = !submitted.firstResult && (submitted.first ?? sent).trim() === sent.trim()
    const fixed = submitted.corrections > 0 && issuesFixed(r, submitted.last)
    const next: ExpressRecord = {
      ...submitted, corrections: submitted.corrections + 1, lastAnswer: sent, last: r, lastGradeId: grade.id, fixed,
      ...(isFirst ? { firstResult: r } : {}),
    }
    return requireCorrectionSave(applied => onRecord(current => {
      applied()
      const sameAnswer = !current.first || current.first === submitted.first
      if (!sameAnswer || current.corrections !== submitted.corrections || current.lastAnswer !== submitted.lastAnswer)
        return mergeExpress(current, next)
      return { ...next, help: [...new Set([...next.help, ...current.help])],
        revealed: next.revealed || current.revealed, others: current.others, discussion: current.discussion }
    }, true))
  }
  function finish() {
    const next = !rec.first && answer.trim() ? { ...rec, first: answer, firstHelp: [...rec.help] } : rec
    onFinish(answer, next)
  }
  const sees = (kind: string) => shown.includes(kind)
  // Claude says what is in the box now is good: finishing is the way on, not another check.
  const good = rec.last?.verdict === 'good' && (rec.lastAnswer ?? '').trim() === answer.trim()
  return <section className="ls-express">
    <div className="pr-label">{good ? '表達 · Claude 說寫得好' : corrected ? '訂正再試' : '表達 · 用自己的話'}</div>
    <h2 className="pr-question ls-prompt" lang="en">{p.en}</h2>
    {p.chart && <MiniChart chart={p.chart} />}
    {p.scaffold && <ol className="ls-scaffold" aria-label="回答的順序">{p.scaffold.map(s => <li key={s} lang="en">{s}</li>)}</ol>}
    {p.scaffold && !answer.trim() && <button type="button" className="pr-link ls-zh-toggle" disabled={waiting} onClick={() => { const t = p.scaffold!.map(x => x.replace(/…$/, ' ')).join('\n'); setAnswer(t); writeDraft(draftKey, t); help('frame') }}>用這個順序開頭</button>}
    <label className="pr-field">我的英文
      <textarea lang="en" rows={4} value={answer} spellCheck={false} autoComplete="off" placeholder="不用翻譯，想到什麼就寫什麼" readOnly={waiting}
        onChange={e => { setAnswer(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <DraftVersions id={draftKey} text={answer} onChoose={setAnswer} disabled={waiting} legacyId={legacyDraftKey} />
    <div className="ls-helps" role="group" aria-label="需要幫忙時一層一層打開">
      <span>卡住了？一層一層打開：</span>
      <button type="button" aria-pressed={sees('zh')} onClick={() => help('zh')}>① 要做什麼</button>
      <button type="button" aria-pressed={sees('cue')} onClick={() => help('cue')}>② 用哪個句型</button>
      <button type="button" aria-pressed={sees('frame')} onClick={() => help('frame')}>③ 句架</button>
      <StuckButton onUse={() => help('claude')} />
    </div>
    {sees('zh') && <p className="ls-help">{p.zh}</p>}
    {sees('cue') && <p className="ls-help">這課的句型：<b>{pattern}</b>{lesson.cando ? '。目標：' + lesson.cando : ''}</p>}
    {sees('frame') && <p className="pr-frame" lang="en">{sentenceFrame(firstSentence)}</p>}
    <div className="pr-actions">
      {keyed && <button type="button" className={good ? 'pr-link' : 'pr-main'} disabled={!answer.trim() || waiting} onClick={submit}>{corrected ? '改好了，請 Claude 再批一次' : '請 Claude 批改'}</button>}
      <button type="button" className="pr-link" disabled={waitingForGrade} onClick={onSpeak}>改用說的：跟 Emma 練</button>
    </div>
    {!keyed && <p className="ls-help">還沒連接 Claude，先自己檢查：有沒有用到「{pattern}」？主詞和動詞對得上嗎？這次會記成「自評完成・待確認」。</p>}
    {pending && !checking && <p role="status" className="ls-help">Claude 正在批改這份作答，回覆會保存在這一堂。</p>}
    <CorrectBox key={run ? 'checking' : 'saved-' + (rec.lastGradeId ?? rec.corrections + '-' + (rec.lastAnswer ?? ''))} run={run} mode="open" rubric="gept-paragraph" zh={p.en + '（' + p.zh + '）'} reference={p.sample} words={[pattern]} answer={answer}
      restore={!run && rec.last && rec.lastAnswer ? { answer: rec.lastAnswer, result: rec.last, id: rec.lastGradeId } : undefined}
      previous={previous} selfFix={!corrected || !rec.revealed}
      onReveal={() => { if (!rec.revealed) onRecord(current => ({ ...current, revealed: true }), false) }}
      discussion={{ id: lessonId, saved: rec.discussion, save: turn => requireCorrectionSave(applied => onRecord(current => {
        applied()
        return { ...current, discussion: mergeCorrectionFollowUps(current.discussion ?? [], [turn]) }
      }, false)) }}
      onSave={onSave} onBusy={busy => { if (!busy) submission.current = undefined; setChecking(busy) }}
      backgroundGrade={{ id: requestId, save: result }} />
    {corrected && !rec.fixed && !good && <p className="ls-help ls-fixnote">照上面的提示把你的句子改好，再按「改好了，請 Claude 再批一次」，會告訴你上次的問題哪些改好了。寫錯的句子按「加入複習」，之後會再出現。</p>}
    {rec.fixed && <p className="ls-help ls-fixnote">上次的問題都改好了。</p>}
    <button type="button" className={corrected || !keyed || sees('sample') ? 'pr-main ls-finish' : 'pr-link ls-finish'} disabled={waitingForGrade} onClick={finish}>{good ? 'Claude 說寫得好，完成今天這一堂 →' : '完成今天這一堂'}</button>
  </section>
}

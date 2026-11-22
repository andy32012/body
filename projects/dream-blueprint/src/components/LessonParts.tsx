import { useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, Volume2 } from 'lucide-react'
import CorrectBox from './CorrectBox'
import StuckButton from './StuckButton'
import { useTaskContext } from '../lib/taskContext'
import { tutorKey } from '../lib/tutor'
import { readDraft, writeDraft } from '../lib/drafts'
import type { SayCard } from '../lib/sayCards'
import { issuesFixed, lessonSteps, sentenceFrame, type CorrectionResult, type ExpressRecord, type Lesson, type LessonLine, type LessonPrompt, type LessonStep } from '../lib/lesson'
import './lesson.css'

export function StepBar({ current, done }: { current: LessonStep; done: LessonStep[] }) {
  return <ol className="ls-steps" aria-label="今天這一堂的步驟">
    {lessonSteps.map(([id, name]) => {
      const state = id === 'done' && done.includes('done') ? 'done' : id === current ? 'now' : done.includes(id) ? 'done' : 'todo'
      return <li key={id} data-state={state} aria-current={state === 'now' ? 'step' : undefined}>
        <i aria-hidden="true">{state === 'done' ? <Check size={11} strokeWidth={3} /> : null}</i><span>{name}</span>
      </li>
    })}
  </ol>
}

/** Reads lines aloud one after another; the second speaker gets a different voice (or pitch).
 *  `completed` counts plays that reached the last line without being stopped or failing — pressing play is not listening.
 *  `status`: error = the voice could not play (treated as no audio, so nothing counts as "understood by ear"). */
export function useDialogueVoice(rate: number) {
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
    const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'))
    const say = (i: number) => {
      if (id !== run.current) return
      if (i >= lines.length || (only && i > start)) {
        setPlaying(null)
        if (full) { setCompleted(n => n + 1); setStatus('done') } else setStatus('idle')
        return
      }
      const u = new SpeechSynthesisUtterance(lines[i].en)
      const who = speakers.indexOf(lines[i].who)
      u.lang = 'en-US'
      u.rate = Math.max(0.5, Math.min(1.4, rate))
      if (voices.length > 1) u.voice = voices[who % 2 === 0 ? 0 : Math.min(voices.length - 1, 1)]
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
 *  reports the end) still lets him answer, but the result is not counted as understood by ear (onDone gets -1). */
export function LessonListen({ lesson, firstTime, rate, onDone }: { lesson: Lesson; firstTime: boolean; rate: number; onDone: (correct: number, total: number, plays: number) => void }) {
  const voice = useDialogueVoice(rate)
  const mountedAt = useRef(Date.now())
  const ready = () => Date.now() - mountedAt.current > 450
  const [started, setStarted] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [checked, setChecked] = useState(!firstTime)
  const [showZh, setShowZh] = useState(false)
  const [noVoice, setNoVoice] = useState(false)
  const [unsure, setUnsure] = useState(false)
  const heard = voice.completed > 0
  const open = heard || unsure
  const counted = firstTime && heard && !unsure && !noVoice
  const correct = lesson.questions.filter((q, i) => answers[i] === q.answer).length
  useEffect(() => { if (voice.status === 'error') { setNoVoice(true); setChecked(true) } }, [voice.status])
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(lesson.dialogue)) { setNoVoice(true); setChecked(true); return }
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
      onClick={() => { voice.stop(); setChecked(true) }}>對答案、看全文</button>}
    {firstTime && checked && !noVoice && <ul className="ls-results">
      {lesson.questions.map((q, i) => <li key={i} data-ok={answers[i] === q.answer}>
        <span lang="en">{q.q}</span><b lang="en">{answers[i] === q.answer ? '✓ ' : '✗ '}{q.options[q.answer]}</b>
      </li>)}
    </ul>}
    {checked && <>
      <Transcript lines={lesson.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(lesson.dialogue, i, true)} />
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        <button type="button" className="pr-main" onClick={() => { voice.stop(); onDone(counted ? correct : -1, counted ? lesson.questions.length : 0, voice.completed) }}>下一步：句型</button>
      </div>
    </>}
  </section>
}

/** One more sentence with the same pattern, written from Chinese, answer revealed after trying. */
export function LessonVariation({ item, onDone }: { item: { zh: string; en: string; alt?: string[] }; onDone: (mark: 'good' | 'small' | 'again', answer: string) => void }) {
  const [answer, setAnswer] = useState('')
  const [shown, setShown] = useState(false)
  const mountedAt = useRef(Date.now())
  const shownAt = useRef(0)
  const ready = () => Date.now() - mountedAt.current > 450
  const done = (m: 'good' | 'small' | 'again') => { if (Date.now() - shownAt.current > 450) onDone(m, answer) }
  return <section className="ls-vary">
    <div className="pr-label">換個說法 · 同一個句型</div>
    <h2 className="pr-question">{item.zh}</h2>
    <label className="pr-field">我的英文
      <textarea lang="en" rows={2} value={answer} spellCheck={false} autoComplete="off" onChange={e => setAnswer(e.target.value)} placeholder="先自己寫，再看答案" />
    </label>
    {!shown ? <div className="pr-actions"><button type="button" className="pr-main" onClick={() => { if (ready()) { shownAt.current = Date.now(); setShown(true) } }}>看答案</button></div> : <>
      <section className="pr-reference"><small>參考句</small><p lang="en">{item.en}</p>{item.alt?.map(a => <p lang="en" key={a}>{a}</p>)}</section>
      <fieldset className="pr-marks"><legend>我寫得…</legend>
        <button type="button" disabled={!answer.trim()} onClick={() => done('good')}>對了</button>
        <button type="button" disabled={!answer.trim()} onClick={() => done('small')}>差一點（加入複習）</button>
        <button type="button" onClick={() => done('again')}>不會（加入複習）</button>
      </fieldset>
      {!answer.trim() && <p className="ls-help">沒有寫答案只能按「不會」：沒寫的題目不算完成。</p>}
    </>}
  </section>
}

export function MiniChart({ chart }: { chart: NonNullable<LessonPrompt['chart']> }) {
  const values = chart.points.map(p => p.value)
  const min = Math.min(...values), max = Math.max(...values)
  const lo = Math.floor((min - (max - min) * 0.25) / 5) * 5, hi = Math.ceil((max + (max - min) * 0.25) / 5) * 5
  const W = 320, H = 150, L = 34, R = 12, T = 14, B = 26
  const x = (i: number) => L + (W - L - R) * (chart.points.length === 1 ? 0.5 : i / (chart.points.length - 1))
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / Math.max(1, hi - lo))
  return <figure className="ls-chart">
    <figcaption lang="en">{chart.title}</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={chart.title + '：' + chart.points.map(p => p.label + ' ' + p.value).join('、')}>
      {[lo, (lo + hi) / 2, hi].map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="ls-grid" /><text x={L - 6} y={y(v) + 4} textAnchor="end">{Math.round(v)}</text></g>)}
      <polyline points={chart.points.map((p, i) => x(i) + ',' + y(p.value)).join(' ')} className="ls-lineplot" />
      {chart.points.map((p, i) => <g key={p.label}>
        <circle cx={x(i)} cy={y(p.value)} r={3.5} className="ls-dot" />
        <text x={x(i)} y={y(p.value) - 8} textAnchor="middle" className="ls-val">{p.value}</text>
        <text x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
      </g>)}
    </svg>
  </figure>
}

/** Say it your own way (no Chinese sentence to translate), get it corrected, fix it, try again.
 *  Help comes in layers — purpose (中文說明) → cue (句型) → frame (句架) → model (參考寫法) — and every layer used is saved,
 *  as are the first answer, its feedback and the corrected try, so a reload comes back to the same feedback. */
export function LessonExpress({ lesson, draftKey, pattern, saved, onRecord, onSave, onSpeak, onFinish }: {
  lesson: Lesson; draftKey: string; pattern: string; saved?: ExpressRecord
  onRecord: (rec: ExpressRecord, corrected: boolean) => void; onSave: (card: SayCard) => void; onSpeak: () => void; onFinish: (answer: string, rec: ExpressRecord) => void
}) {
  const [answer, setAnswer] = useState(() => readDraft(draftKey) || saved?.lastAnswer || '')
  const [run, setRun] = useState(0)
  const [rec, setRec] = useState<ExpressRecord>(() => saved ?? { corrections: 0, help: [] })
  const [shown, setShown] = useState<string[]>(() => saved?.help ?? [])
  const mountedAt = useRef(Date.now())
  const keyed = !!tutorKey()
  const p = lesson.prompt
  const corrected = rec.corrections > 0
  const firstSentence = p.sample.match(/^[^.?!]+[.?!]/)?.[0] ?? p.sample
  useTaskContext({
    label: '表達：' + p.en,
    detail: ['開放寫作題：' + p.en + '（' + p.zh + '）', '這課的句型：' + pattern + (lesson.cando ? '。目標：' + lesson.cando : ''),
      '參考寫法（只是例子，不要直接給他）：' + p.sample, '他要寫自己的內容；幫他想內容或句型就好，不要替他寫整段。'].join('\n'),
    draft: answer,
  })
  function help(kind: 'zh' | 'cue' | 'frame' | 'sample' | 'claude') {
    if (Date.now() - mountedAt.current < 450) return
    setShown(list => list.includes(kind) ? list : [...list, kind])
    if (rec.help.includes(kind)) return
    const next = { ...rec, help: [...rec.help, kind] }
    setRec(next); onRecord(next, false)
  }
  const [previous, setPrevious] = useState<CorrectionResult>()
  /** The first answer is kept the moment it is sent, so a failed request still leaves a record. */
  function submit() {
    if (!answer.trim()) return
    setPrevious(rec.last)
    if (!rec.first) {
      const next: ExpressRecord = { ...rec, first: answer, firstHelp: [...rec.help] }
      setRec(next); onRecord(next, false)
    }
    setRun(n => n + 1)
  }
  function result(r: CorrectionResult) {
    const isFirst = !rec.firstResult && (rec.first ?? answer) === answer
    const fixed = rec.corrections > 0 && issuesFixed(r, rec.last)
    const next: ExpressRecord = {
      ...rec, corrections: rec.corrections + 1, lastAnswer: answer, last: r, fixed,
      ...(rec.first ? {} : { first: answer, firstHelp: [...rec.help] }),
      ...(isFirst ? { firstResult: r } : {}),
    }
    setRec(next); onRecord(next, true)
  }
  function finish() {
    const next = !rec.first && answer.trim() ? { ...rec, first: answer, firstHelp: [...rec.help] } : rec
    onFinish(answer, next)
  }
  const sees = (kind: string) => shown.includes(kind)
  return <section className="ls-express">
    <div className="pr-label">{corrected ? '訂正再試' : '表達 · 用自己的話'}</div>
    <h2 className="pr-question ls-prompt" lang="en">{p.en}</h2>
    {p.chart && <MiniChart chart={p.chart} />}
    {p.scaffold && <ol className="ls-scaffold" aria-label="回答的順序">{p.scaffold.map(s => <li key={s} lang="en">{s}</li>)}</ol>}
    {p.scaffold && !answer.trim() && <button type="button" className="pr-link ls-zh-toggle" onClick={() => { const t = p.scaffold!.map(x => x.replace(/…$/, ' ')).join('\n'); setAnswer(t); writeDraft(draftKey, t) }}>用這個順序開頭</button>}
    <label className="pr-field">我的英文
      <textarea lang="en" rows={4} value={answer} spellCheck={false} autoComplete="off" placeholder="不用翻譯，想到什麼就寫什麼"
        onChange={e => { setAnswer(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <div className="ls-helps" role="group" aria-label="需要幫忙時一層一層打開">
      <span>卡住了？一層一層打開：</span>
      <button type="button" aria-pressed={sees('zh')} onClick={() => help('zh')}>① 要做什麼</button>
      <button type="button" aria-pressed={sees('cue')} onClick={() => help('cue')}>② 用哪個句型</button>
      <button type="button" aria-pressed={sees('frame')} onClick={() => help('frame')}>③ 句架</button>
      <button type="button" aria-pressed={sees('sample')} onClick={() => help('sample')}>④ 參考寫法</button>
      <StuckButton onUse={() => help('claude')} />
    </div>
    {sees('zh') && <p className="ls-help">{p.zh}</p>}
    {sees('cue') && <p className="ls-help">這課的句型：<b>{pattern}</b>{lesson.cando ? '。目標：' + lesson.cando : ''}</p>}
    {sees('frame') && <p className="pr-frame" lang="en">{sentenceFrame(firstSentence)}</p>}
    {sees('sample') && <section className="pr-reference"><small>參考寫法（只是一種例子）</small><p lang="en">{p.sample}</p></section>}
    <div className="pr-actions">
      {keyed && <button type="button" className="pr-main" disabled={!answer.trim()} onClick={submit}>{corrected ? '改好了，再批一次' : '請 Claude 批改'}</button>}
      <button type="button" className="pr-link" onClick={onSpeak}>改用說的：跟 Emma 練</button>
    </div>
    {!keyed && <p className="ls-help">還沒連接 Claude，先對照參考寫法自己檢查：有沒有用到「{pattern}」？主詞和動詞對得上嗎？這次會記成「自評完成・待確認」。</p>}
    <CorrectBox run={run} mode="open" zh={p.en + '（' + p.zh + '）'} reference={p.sample} words={[pattern]} answer={answer}
      restore={!run && rec.last && rec.lastAnswer ? { answer: rec.lastAnswer, result: rec.last } : undefined}
      previous={previous} selfFix={!corrected || !rec.revealed}
      onReveal={() => { if (!rec.revealed) { const next = { ...rec, revealed: true }; setRec(next); onRecord(next, false) } }}
      onSave={onSave} onResult={(_, __, r) => result(r)} />
    {corrected && !rec.fixed && <p className="ls-help ls-fixnote">照上面的提示把你的句子改好，再按「改好了，再批一次」，會告訴你上次的問題哪些改好了。寫錯的句子按「加入複習」，之後會再出現。</p>}
    {rec.fixed && <p className="ls-help ls-fixnote">上次的問題都改好了。</p>}
    <button type="button" className={corrected || !keyed || sees('sample') ? 'pr-main ls-finish' : 'pr-link ls-finish'} onClick={finish}>完成今天這一堂</button>
  </section>
}

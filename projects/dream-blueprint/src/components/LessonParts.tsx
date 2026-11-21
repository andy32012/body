import { useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, Volume2 } from 'lucide-react'
import CorrectBox from './CorrectBox'
import { tutorKey } from '../lib/tutor'
import { readDraft, writeDraft } from '../lib/drafts'
import type { SayCard } from '../lib/sayCards'
import { lessonSteps, type Lesson, type LessonLine, type LessonPrompt, type LessonStep } from '../lib/lesson'
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

/** Reads lines aloud one after another; the second speaker gets a different voice (or pitch). */
function useDialogueVoice(rate: number) {
  const [playing, setPlaying] = useState<number | null>(null)
  const run = useRef(0)
  useEffect(() => () => { run.current++; window.speechSynthesis?.cancel() }, [])
  function stop() { run.current++; window.speechSynthesis?.cancel(); setPlaying(null) }
  function play(lines: LessonLine[], start = 0, only = false) {
    if (!('speechSynthesis' in window)) return false
    stop()
    const id = ++run.current
    const speakers = [...new Set(lines.map(l => l.who))]
    const voices = speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().startsWith('en'))
    const say = (i: number) => {
      if (id !== run.current || i >= lines.length || (only && i > start)) { if (id === run.current) setPlaying(null); return }
      const u = new SpeechSynthesisUtterance(lines[i].en)
      const who = speakers.indexOf(lines[i].who)
      u.lang = 'en-US'
      u.rate = Math.max(0.5, Math.min(1.4, rate))
      if (voices.length > 1) u.voice = voices[who % 2 === 0 ? 0 : Math.min(voices.length - 1, 1)]
      u.pitch = who % 2 === 0 ? 1 : 1.25
      u.onend = () => say(i + 1)
      u.onerror = () => { if (id === run.current) setPlaying(null) }
      setPlaying(i)
      speechSynthesis.speak(u)
    }
    say(start)
    return true
  }
  return { playing, play, stop }
}

function Transcript({ lines, playing, onPlayLine, showZh }: { lines: LessonLine[]; playing: number | null; onPlayLine: (i: number) => void; showZh: boolean }) {
  return <ol className="ls-lines">
    {lines.map((l, i) => <li key={i} data-playing={playing === i}>
      <button type="button" className="ls-line-play" aria-label={'播放這一句：' + l.en} onClick={() => onPlayLine(i)}><Volume2 size={14} /></button>
      <div><small>{l.who}</small><p lang="en">{l.en}</p>{showZh && <p className="ls-zh">{l.zh}</p>}</div>
    </li>)}
  </ol>
}

/** Listen first without the text, answer two questions, then read along. Later days: listen and shadow. */
export function LessonListen({ lesson, firstTime, rate, onDone }: { lesson: Lesson; firstTime: boolean; rate: number; onDone: (correct: number, total: number) => void }) {
  const voice = useDialogueVoice(rate)
  const [plays, setPlays] = useState(0)
  const [answers, setAnswers] = useState<number[]>([])
  const [checked, setChecked] = useState(!firstTime)
  const [showZh, setShowZh] = useState(false)
  const [noVoice, setNoVoice] = useState(false)
  const correct = lesson.questions.filter((q, i) => answers[i] === q.answer).length
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(lesson.dialogue)) { setNoVoice(true); setChecked(true); return }
    setPlays(n => n + 1)
  }
  return <section className="ls-listen">
    <div className="pr-label">聽懂 · 情境：{lesson.scene}</div>
    <h2 className="pr-question">{firstTime && !checked ? '先只聽，不看字' : '看著字再聽一次，跟著唸'}</h2>
    <p className="ls-help">{firstTime && !checked ? '聽一到兩次，再回答下面兩題。聽不懂的字先猜。' : '一句一句點來聽，跟著念出聲；想確認意思再打開中文。'}</p>
    <button type="button" className="ls-play" onClick={playAll}>
      {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />播放對話{plays ? '（聽過 ' + plays + ' 次）' : ''}</>}
    </button>
    {noVoice && <p className="ls-help">這個瀏覽器不能播放語音，直接讀下面的對話。</p>}
    {firstTime && !checked && <ol className="ls-qs">
      {lesson.questions.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={answers[i] === j}
          onClick={() => { const a = [...answers]; a[i] = j; setAnswers(a) }}>{o}</button>)}</div>
      </li>)}
    </ol>}
    {firstTime && !checked && <button type="button" className="pr-main" disabled={answers.filter(a => a !== undefined).length < lesson.questions.length}
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
        <button type="button" className="pr-main" onClick={() => { voice.stop(); onDone(firstTime && !noVoice ? correct : -1, firstTime && !noVoice ? lesson.questions.length : 0) }}>下一步：句型</button>
      </div>
    </>}
  </section>
}

/** One more sentence with the same pattern, written from Chinese, answer revealed after trying. */
export function LessonVariation({ item, onDone }: { item: { zh: string; en: string }; onDone: (mark: 'good' | 'small' | 'again') => void }) {
  const [answer, setAnswer] = useState('')
  const [shown, setShown] = useState(false)
  return <section className="ls-vary">
    <div className="pr-label">換個說法 · 同一個句型</div>
    <h2 className="pr-question">{item.zh}</h2>
    <label className="pr-field">我的英文
      <textarea lang="en" rows={2} value={answer} spellCheck={false} autoComplete="off" onChange={e => setAnswer(e.target.value)} placeholder="先自己寫，再看答案" />
    </label>
    {!shown ? <div className="pr-actions"><button type="button" className="pr-main" onClick={() => setShown(true)}>看答案</button></div> : <>
      <section className="pr-reference"><small>參考句</small><p lang="en">{item.en}</p></section>
      <fieldset className="pr-marks"><legend>我寫得…</legend>
        <button type="button" onClick={() => onDone('good')}>對了</button>
        <button type="button" onClick={() => onDone('small')}>差一點（加入複習）</button>
        <button type="button" onClick={() => onDone('again')}>不會（加入複習）</button>
      </fieldset>
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

/** Say it your own way (no Chinese sentence to translate), get it corrected, fix it, try again. */
export function LessonExpress({ lesson, draftKey, pattern, onCorrected, onSave, onSpeak, onFinish }: {
  lesson: Lesson; draftKey: string; pattern: string
  onCorrected: (fixes: number) => void; onSave: (card: SayCard) => void; onSpeak: () => void; onFinish: () => void
}) {
  const [answer, setAnswer] = useState(() => readDraft(draftKey))
  const [run, setRun] = useState(0)
  const [corrected, setCorrected] = useState(false)
  const [sample, setSample] = useState(false)
  const [zh, setZh] = useState(false)
  const keyed = !!tutorKey()
  const p = lesson.prompt
  return <section className="ls-express">
    <div className="pr-label">{corrected ? '訂正再試' : '表達 · 用自己的話'}</div>
    <h2 className="pr-question ls-prompt" lang="en">{p.en}</h2>
    {zh ? <p className="ls-help">{p.zh}</p> : <button type="button" className="pr-link ls-zh-toggle" onClick={() => setZh(true)}>看中文說明</button>}
    {p.chart && <MiniChart chart={p.chart} />}
    {p.scaffold && <ol className="ls-scaffold" aria-label="回答的順序">{p.scaffold.map(s => <li key={s} lang="en">{s}</li>)}</ol>}
    <label className="pr-field">我的英文
      <textarea lang="en" rows={4} value={answer} spellCheck={false} autoComplete="off" placeholder="不用翻譯，想到什麼就寫什麼，三句左右"
        onChange={e => { setAnswer(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <div className="pr-actions">
      {keyed && <button type="button" className="pr-main" disabled={!answer.trim()} onClick={() => setRun(n => n + 1)}>{run ? '改好了，再批一次' : '請 Claude 批改'}</button>}
      <button type="button" className="pr-link" onClick={() => setSample(!sample)}>{sample ? '收起參考寫法' : '看參考寫法'}</button>
      <button type="button" className="pr-link" onClick={onSpeak}>改用說的：跟 Emma 練</button>
    </div>
    {sample && <section className="pr-reference"><small>參考寫法（只是一種例子）</small><p lang="en">{p.sample}</p></section>}
    {!keyed && <p className="ls-help">還沒連接 Claude，先對照參考寫法自己檢查：有沒有用到「{pattern}」？主詞和動詞對得上嗎？</p>}
    <CorrectBox run={run} mode="open" zh={p.en + '（' + p.zh + '）'} reference={p.sample} words={[pattern]} answer={answer}
      onSave={onSave} onResult={(_, fixes) => { setCorrected(true); onCorrected(fixes) }} />
    {corrected && <p className="ls-help ls-fixnote">看著上面的批改，把你的句子改好，再按「改好了，再批一次」。寫錯的句子按「加入複習」，之後會再出現。</p>}
    <button type="button" className={corrected || !keyed || sample ? 'pr-main ls-finish' : 'pr-link ls-finish'} onClick={onFinish}>完成今天這一堂</button>
  </section>
}

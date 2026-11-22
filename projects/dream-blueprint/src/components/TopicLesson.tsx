import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, Mic, Pause, Play, Square, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import type { Energy, Period } from '../lib/progress'
import { PracticeCover, Translation } from '../pages/Practice'
import CorrectBox, { type Result } from './CorrectBox'
import StuckButton from './StuckButton'
import { Transcript, useDialogueVoice } from './LessonParts'
import { answered, judgeExpress, judgeWritten, levelNames, sameEnglish, type Level, type Verdict } from '../lib/evidence'
import { readHints, sentenceFrame, writeHint } from '../lib/lesson'
import { clearDraft, readDraft, writeDraft } from '../lib/drafts'
import { tutorKey } from '../lib/tutor'
import { openaiKey } from '../lib/voice'
import { addSayCard } from '../lib/sayCards'
import { useTaskContext } from '../lib/taskContext'
import {
  completePart, countSentences, judgeReview, judgeSpeak, partNames, partSteps, readTopic, reviewFrom, speakGoals, writeTopic,
  type ItemResult, type ReadSkill, type SpeakRecord, type SpeakTask, type Topic, type TopicPart, type TopicRecord, type TopicSentence,
} from '../lib/topics'
import './lesson.css'
import './topic.css'

type Save = (patch: Partial<TopicRecord> | ((r: TopicRecord) => Partial<TopicRecord>)) => void
type Update = PageProps['update']
const ratingOf = { good: 'correct', small: 'minor', again: 'again' } as const
const levelText = (l: Level | null | undefined) => l ? levelNames[l] : '未作答'

function useSay(rate: number) {
  useEffect(() => () => { window.speechSynthesis?.cancel() }, [])
  return (en: string) => {
    if (!('speechSynthesis' in window)) return
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(en)
    u.lang = 'en-US'
    u.rate = Math.max(0.5, Math.min(1.4, rate))
    speechSynthesis.speak(u)
  }
}
/** Taps that land in the first moments after a screen changes are ignored (a double tap must not answer the next question). */
function useReady() {
  const at = useRef(Date.now())
  return () => Date.now() - at.current > 450
}

/** One life-topic session (A 理解, B 說和寫, or C 換情境). Every step is saved, so leaving and coming back continues here. */
export default function TopicLesson({ state, update, navigate, topic, part, startStep, date, energy, period, onSkip }: PageProps & {
  topic: Topic; part: TopicPart; startStep: number; date: string; energy: Energy; period: Period; onSkip: () => void
}) {
  const steps = partSteps[part]
  const [step, setStep] = useState(() => Math.min(startStep, steps.length - 1))
  const [finished, setFinished] = useState(false)
  const [sessionId] = useState(() => 'topic-' + topic.id + '-' + part + '-' + Date.now().toString(36))
  const rec = readTopic(state.notes, topic.id)
  const rate = state.settings.speechRate
  useEffect(() => {
    update(prev => readTopic(prev.notes, topic.id).done[part] ? prev
      : { ...prev, notes: writeTopic(prev.notes, topic.id, { cur: { part, step, day: date } }) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])
  const save: Save = patch => update(prev => ({
    ...prev, notes: writeTopic(prev.notes, topic.id, typeof patch === 'function' ? patch(readTopic(prev.notes, topic.id)) : patch),
  }))
  function next() {
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
    if (step + 1 < steps.length) { setStep(step + 1); return }
    update(prev => completePart(prev, topic, part, date, energy, period, sessionId))
    setFinished(true)
  }
  const now = steps[step][0]
  const shared = { topic, rec, save, onNext: next, rate, date, notes: state.notes, update }
  return <section className="practice-page topic-page">
    <PracticeCover title={'生活主題 ' + topic.n + '：' + topic.title}>
      <button type="button" className="pr-back" onClick={() => navigate('today')}><ChevronLeft size={16} aria-hidden="true" />回今天</button>
    </PracticeCover>
    <div className="pr-pane pr-session tl-session">
      <div className="pr-session-meta">
        <span>第 {'ABC'.indexOf(part) + 1} 次（共 3 次）· {partNames[part]}</span>
        {!finished && <button type="button" className="pr-link tl-skip" onClick={onSkip}>今天先上文法課</button>}
      </div>
      {!finished && <ol className="ls-steps" aria-label="這次的步驟" style={{ gridTemplateColumns: 'repeat(' + steps.length + ', minmax(0, 1fr))' }}>
        {steps.map(([id, name], i) => {
          const s = i < step ? 'done' : i === step ? 'now' : 'todo'
          return <li key={id} data-state={s} aria-current={s === 'now' ? 'step' : undefined}>
            <i aria-hidden="true">{s === 'done' ? <Check size={11} strokeWidth={3} /> : null}</i><span>{name}</span>
          </li>
        })}
      </ol>}
      {finished ? <TopicDone topic={topic} part={part} rec={rec} navigate={navigate} />
        : now === 'goal' ? <GoalStep topic={topic} onNext={next} />
        : now === 'words' ? <WordsStep {...shared} />
        : now === 'pattern' ? <SentenceItems {...shared} sentences={topic.practice} label="句型練習" doneLabel="下一步：聽"
          preparation={(first: boolean) => <GrammarBox topic={topic} open={first} rate={rate} />} />
        : now === 'listen' ? <ListenStep {...shared} />
        : now === 'read' ? <ReadStep {...shared} />
        : now === 'speak' ? <SpeakStep {...shared} part={part} task={part === 'C' ? topic.review.speak : topic.speak} />
        : now === 'write' ? <WriteStep {...shared} />
        : <SentenceItems {...shared} sentences={topic.review.practice} label="換情境" doneLabel="下一步：說"
          intro={<p className="tl-situation">{topic.review.situation}</p>}
          preparation={() => <p className="ls-help">這次不先看規則：先自己寫，真的卡住再看提示（看了就記成有提示完成）。</p>}
          onAllDone={results => save({ review: { level: judgeReview(results) } })} />}
    </div>
  </section>
}

type StepProps = { topic: Topic; rec: TopicRecord; save: Save; onNext: () => void; rate: number; date: string; notes: Record<string, string>; update: Update }

function GoalStep({ topic, onNext }: { topic: Topic; onNext: () => void }) {
  const ready = useReady()
  return <section className="tl-goal">
    <div className="pr-label">這個主題的目標</div>
    <h2 className="pr-question">{topic.goal}</h2>
    <p className="tl-situation">情境：{topic.scene}</p>
    <ol className="tl-plan">
      <li data-now="true"><b>第 1 次・理解</b>單字搭配、句型、聽懂一段對話、讀一則{topic.read.kind}</li>
      <li><b>第 2 次・說和寫</b>用英文完成一個情境，再寫一則 3–5 句的訊息</li>
      <li><b>第 3 次・換情境</b>隔幾天，換一個情境再用一次，先不看提示</li>
    </ol>
    <p className="ls-help">每一題分開記：自己做到、有提示完成，還是自評待確認。看了提示也沒關係，紀錄會照實寫。</p>
    <div className="pr-actions"><button type="button" className="pr-main" onClick={() => { if (ready()) onNext() }}>開始</button></div>
  </section>
}

type Choice = { q: string; options: string[]; answer: number; lead?: string; tag?: string; en?: boolean }
function Questions({ items, picks, onPick, checked, disabled }: { items: Choice[]; picks: (number | undefined)[]; onPick: (i: number, j: number) => void; checked: boolean; disabled?: boolean }) {
  return <ol className="ls-qs tl-qs">
    {items.map((q, i) => <li key={i}>
      {q.tag && <small className="tl-tag">{q.tag}</small>}
      {q.lead && <p lang="en" className="tl-lead">{q.lead}</p>}
      <p lang={q.en ? 'en' : undefined}>{q.q}</p>
      <div className="pr-options">{q.options.map((o, j) => <button key={j} type="button" lang={q.en ? 'en' : undefined}
        aria-pressed={picks[i] === j} disabled={checked || disabled}
        data-result={checked ? (j === q.answer ? 'right' : picks[i] === j ? 'wrong' : undefined) : undefined}
        onClick={() => onPick(i, j)}>{o}</button>)}</div>
    </li>)}
  </ol>
}
const allPicked = (picks: (number | undefined)[], n: number) => picks.filter(p => p !== undefined).length >= n

function WordsStep({ topic, rec, save, onNext, rate }: StepProps) {
  const say = useSay(rate)
  const ready = useReady()
  const [picks, setPicks] = useState<(number | undefined)[]>([])
  const checked = !!rec.words
  const qs: Choice[] = topic.wordCheck.map(q => ({ ...q, lead: q.sentence }))
  return <section className="tl-words">
    <div className="pr-label">單字搭配 · 先看在句子裡怎麼用</div>
    <ul className="tl-wordlist">
      {topic.words.map(w => <li key={w.en}>
        <button type="button" className="ls-line-play" aria-label={'播放：' + w.example} onClick={() => say(w.example)}><Volume2 size={14} /></button>
        <div>
          <p><b lang="en">{w.en}</b> {w.zh}<span className="tl-use" lang="en">{w.use}</span></p>
          <p lang="en" className="tl-ex">{w.example}</p>
          <p className="ls-zh">{w.exampleZh}</p>
        </div>
      </li>)}
    </ul>
    <h3 className="tl-h">常用的整句</h3>
    <ul className="tl-chunks">
      {topic.chunks.map(c => <li key={c.en}>
        <button type="button" className="ls-line-play" aria-label={'播放：' + c.en} onClick={() => say(c.en)}><Volume2 size={14} /></button>
        <span lang="en">{c.en}</span><small>{c.zh}</small>
      </li>)}
    </ul>
    <h3 className="tl-h">在這句裡是什麼意思？</h3>
    <Questions items={qs} picks={picks} checked={checked} onPick={(i, j) => { if (!ready()) return; const p = [...picks]; p[i] = j; setPicks(p) }} />
    {!checked ? <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!allPicked(picks, qs.length)}
        onClick={() => save(r => r.words ? {} : { words: { correct: qs.filter((q, i) => picks[i] === q.answer).length, total: qs.length } })}>對答案</button>
    </div> : <>
      <p className="tl-score">第一次就選對 {rec.words!.correct} / {rec.words!.total}{rec.words!.correct < rec.words!.total ? '：同一個字在不同句子裡意思會變，看整句再決定。' : ''}</p>
      <div className="pr-actions"><button type="button" className="pr-main" onClick={onNext}>下一步：句型</button></div>
    </>}
  </section>
}

function GrammarBox({ topic, open, rate }: { topic: Topic; open: boolean; rate: number }) {
  const say = useSay(rate)
  const body = <>
    <ul className="tl-points">{topic.grammar.points.map(p => <li key={p}>{p}</li>)}</ul>
    {topic.grammar.examples.map(e => <p key={e.en} className="tl-example">
      <button type="button" className="ls-line-play" aria-label={'播放：' + e.en} onClick={() => say(e.en)}><Volume2 size={14} /></button>
      <span><span lang="en">{e.en}</span><br />{e.zh}</span>
    </p>)}
  </>
  return open ? <section className="pr-rule tl-rule"><strong>{topic.grammar.title}</strong>{body}</section>
    : <details className="pr-tools pr-rule tl-rule"><summary>再看一次規則：{topic.grammar.title}</summary>{body}</details>
}

/** Sentences written from Chinese, one at a time, judged the same way as everywhere else. */
function SentenceItems({ sentences, rec, save, notes, update, date, label, doneLabel, intro, preparation, onAllDone, onNext }: StepProps & {
  sentences: TopicSentence[]; label: string; doneLabel: string; intro?: ReactNode
  preparation?: (first: boolean) => ReactNode; onAllDone?: (levels: (Level | null)[]) => void
}) {
  const results = rec.items ?? {}
  const index = sentences.findIndex(s => !results[s.id])
  const ready = useReady()
  if (index === -1) return <section className="tl-items-done">
    <div className="pr-label">{label} · 完成</div>
    <ul className="tl-levels">{sentences.map(s => {
      const r = results[s.id]
      return <li key={s.id} data-level={r?.level ?? 'none'}><span>{s.zh}</span><b>{r?.level ? levelNames[r.level] : r?.rating === 'again' ? '不會（之後再複習）' : '未作答'}</b></li>
    })}</ul>
    <p className="ls-help">這些句子都會進複習卡，隔幾天再出現。</p>
    <div className="pr-actions"><button type="button" className="pr-main" onClick={() => { if (!ready()) return; onAllDone?.(sentences.map(s => results[s.id]?.level ?? null)); onNext() }}>{doneLabel}</button></div>
  </section>
  const s = sentences[index]
  return <>
    {intro}
    <Translation key={s.id} sentence={s} checkpoint={false} label={label + ' · ' + (index + 1) + ' / ' + sentences.length}
      preparation={preparation?.(index === 0)}
      saved={readHints(notes, date)[s.id]}
      onHint={use => update(prev => ({ ...prev, notes: writeHint(prev.notes, date, s.id, use) }))}
      onMark={(mark, revealed, info) => {
        const rating = ratingOf[mark]
        const blank = !answered(info.answer)
        const result: ItemResult = {
          level: judgeWritten({ rating, revealed, answer: info.answer, references: s.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText }),
          rating, revealed: revealed || blank,
        }
        // The first mark is the record: a second tap cannot replace it.
        save(r => r.items?.[s.id] ? {} : { items: { ...r.items, [s.id]: result } })
      }} />
  </>
}

type ListenSub = 'gist' | 'details' | 'text' | 'shadow' | 'retell'
/** Five steps: the gist without the text → details (still no text) → the transcript → shadowing → retelling.
 *  What was understood from listening alone is saved before the text appears; later plays are kept apart. */
function ListenStep({ topic, rec, save, onNext, rate, notes, update, date }: StepProps) {
  const L = topic.listen
  const voice = useDialogueVoice(rate)
  const ready = useReady()
  const saved = rec.listen ?? {}
  const [sub, setSub] = useState<ListenSub>(() => saved.noVoice || saved.details !== undefined ? 'text' : saved.gist !== undefined ? 'details' : 'gist')
  // Complete plays only: started-then-stopped or failed plays do not count as having listened.
  const [startedPlays, setStarted] = useState(0)
  const [unsure, setUnsure] = useState(!!saved.unsure)
  // Plays of this visit after the gist was answered (a reload starts the count again).
  const [gistAt, setGistAt] = useState<number | null>(saved.gist !== undefined ? 0 : null)
  const plays = saved.gist !== undefined ? saved.plays ?? 0 : voice.completed
  const replays = saved.details !== undefined ? saved.replays ?? 0 : gistAt === null ? 0 : Math.max(0, voice.completed - gistAt)
  const heard = (saved.plays ?? 0) > 0 || voice.completed > 0
  const open = heard || unsure
  const [gistPick, setGistPick] = useState<number>()
  const [picks, setPicks] = useState<(number | undefined)[]>([])
  const [showZh, setShowZh] = useState(false)
  const [noVoice, setNoVoice] = useState(!!saved.noVoice)
  const [shadowed, setShadowed] = useState<number[]>([])
  const before = sub === 'gist' || sub === 'details'
  function noAudio() {
    setNoVoice(true); setSub('text')
    save(r => ({ listen: { ...r.listen, noVoice: true } }))
  }
  useEffect(() => { if (voice.status === 'error' && before) noAudio() }, [voice.status])  // eslint-disable-line react-hooks/exhaustive-deps
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(L.dialogue)) { noAudio(); return }
    setStarted(n => n + 1)
  }
  const play = <button type="button" className="ls-play" onClick={playAll}>
    {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />播放對話{before && plays + replays ? '（完整聽過 ' + (plays + replays) + ' 次）' : ''}</>}
  </button>
  const unsureLink = before && !open && startedPlays > 0 && voice.playing === null &&
    <button type="button" className="pr-link" onClick={() => { setUnsure(true); save(r => ({ listen: { ...r.listen, unsure: true } })) }}>播完了，但題目沒有打開？</button>
  const go = (s: ListenSub) => { voice.stop(); setSub(s); window.scrollTo?.({ top: 0, behavior: 'smooth' }) }
  return <section className="ls-listen tl-listen">
    <div className="pr-label">聽 · {L.scene}</div>
    <ol className="tl-substeps" aria-label="聽力的五個步驟">
      {(['gist', 'details', 'text', 'shadow', 'retell'] as const).map((id, i) => <li key={id} data-now={sub === id}>{['只聽大意', '再聽細節', '看逐字稿', '跟讀', '重述'][i]}</li>)}
    </ol>
    {noVoice && <p className="ls-help">這個瀏覽器不能播放語音：直接讀下面的對話。這次不算「只聽就懂」。</p>}

    {sub === 'gist' && <>
      <h2 className="pr-question">先只聽，不看字</h2>
      <p className="ls-help">完整聽一到兩次，先抓他們在做什麼。聽不懂的字先猜。</p>
      {play}
      <Questions items={[{ ...L.gist, en: true }]} picks={[gistPick]} checked={saved.gist !== undefined} disabled={!open}
        onPick={(_, j) => { if (ready() && open) setGistPick(j) }} />
      {!open && <p className="ls-help ls-need">先按「播放對話」完整聽一次，題目才能作答。中途停掉不算聽完。</p>}
      {unsureLink}
      {unsure && !heard && <p className="ls-help">這台裝置沒有回報播放結束：可以作答，但這次不算「只聽就懂」。</p>}
      {saved.gist === undefined
        ? <button type="button" className="pr-main" disabled={gistPick === undefined} onClick={() => {
          setGistAt(voice.completed)
          save(r => r.listen?.gist !== undefined ? {} : { listen: { ...r.listen, gist: gistPick === L.gist.answer, plays: voice.completed } })
        }}>確定</button>
        : <>
          <p className="tl-score">{saved.gist ? '✓ 大意聽懂了。' : '✗ 這次大意沒抓到，沒關係，下一步再聽一次細節。'}</p>
          <button type="button" className="pr-main" onClick={() => go('details')}>下一步：聽細節</button>
        </>}
    </>}

    {sub === 'details' && <>
      <h2 className="pr-question">再聽一次，回答細節</h2>
      <p className="ls-help">還是不看字。可以用剛剛聽到的回答，也可以再完整聽一次，再聽的次數會另外記。</p>
      {play}
      <Questions items={L.details.map(q => ({ ...q, en: true }))} picks={picks} checked={saved.details !== undefined}
        onPick={(i, j) => { if (!ready()) return; const p = [...picks]; p[i] = j; setPicks(p) }} />
      {saved.details === undefined
        ? <button type="button" className="pr-main" disabled={!allPicked(picks, L.details.length)} onClick={() => {
          voice.stop()
          save(r => r.listen?.details !== undefined ? {} : { listen: { ...r.listen, details: L.details.filter((q, i) => picks[i] === q.answer).length, total: L.details.length, replays } })
        }}>對答案</button>
        : <>
          <p className="tl-score">{saved.unsure && !saved.plays ? '播放沒有確認，' : '只聽（不看字）：'}細節答對 {saved.details} / {saved.total}，完整聽了 {saved.plays ?? 0} 次{(saved.replays ?? 0) > 0 ? '，答細節前又聽了 ' + saved.replays + ' 次' : ''}。</p>
          <button type="button" className="pr-main" onClick={() => { save(r => ({ listen: { ...r.listen, transcript: true } })); go('text') }}>下一步：看逐字稿</button>
        </>}
    </>}

    {sub === 'text' && <>
      <h2 className="pr-question">看著字再聽，找出剛剛沒聽懂的地方</h2>
      <p className="ls-help">點每一句旁邊的喇叭單獨播放；想確認意思再打開中文。</p>
      {!noVoice && play}
      <Transcript lines={L.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(L.dialogue, i, true)} />
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        <button type="button" className="pr-main" onClick={() => { if (!saved.transcript) save(r => ({ listen: { ...r.listen, transcript: true } })); go('shadow') }}>下一步：跟讀</button>
      </div>
    </>}

    {sub === 'shadow' && <>
      <h2 className="pr-question">跟著唸這幾句</h2>
      <p className="ls-help">先聽一句，再照同樣的速度和語氣唸出聲。這裡不評發音，只記你有沒有跟讀；想聽自己的聲音可以錄音。</p>
      <ol className="tl-shadow">
        {L.shadow.map(i => <li key={i}>
          <button type="button" className="ls-line-play" aria-label={'播放：' + L.dialogue[i].en} onClick={() => voice.play(L.dialogue, i, true)}><Volume2 size={14} /></button>
          <p lang="en">{L.dialogue[i].en}</p>
          <label className="tl-check"><input type="checkbox" checked={shadowed.includes(i)} onChange={e => setShadowed(e.target.checked ? [...shadowed, i] : shadowed.filter(x => x !== i))} />唸了</label>
        </li>)}
      </ol>
      <Recorder />
      <button type="button" className="pr-main" onClick={() => { save(r => ({ listen: { ...r.listen, shadowed: shadowed.length >= L.shadow.length } })); go('retell') }}>下一步：重述</button>
    </>}

    {sub === 'retell' && <Retell topic={topic} rec={rec} save={save} notes={notes} update={update} date={date} onDone={level => {
      save(r => ({ listen: { ...r.listen, retell: level } })); onNext()
    }} />}
  </section>
}

/** Help and Claude's first check for an open answer, kept in the record so a reload does not reset them.
 *  The check belongs to the exact text Claude saw: after a "good", an edited answer is unchecked again. */
function useOpenTask(rec: TopicRecord, key: string, save: Save) {
  const saved = rec.open?.[key] ?? { help: [] as string[] }
  const [help, setHelp] = useState<string[]>(saved.help)
  const [firstVerdict, setFirst] = useState<Verdict | undefined>(saved.firstVerdict)
  const [checkedText, setChecked] = useState<string | undefined>(saved.checkedText)
  const sent = useRef('')
  const persist = (next: { help: string[]; firstVerdict?: Verdict; checkedText?: string }) => save(r => ({ open: { ...r.open, [key]: next } }))
  const stale = (text: string) => firstVerdict === 'good' && checkedText !== undefined && !sameEnglish(checkedText, text)
  return {
    help, firstVerdict, stale,
    /** Remember what was sent, so the reply is tied to that text. */
    send(text: string) { sent.current = text },
    /** The first verdict, if it still applies to this text. */
    verdictFor: (text: string) => stale(text) ? undefined : firstVerdict,
    addHelp(kind: string) {
      if (help.includes(kind)) return
      const next = [...help, kind]; setHelp(next); persist({ help: next, ...(firstVerdict ? { firstVerdict, checkedText } : {}) })
    },
    setVerdict(v: Verdict) {
      if (firstVerdict) return
      setFirst(v); setChecked(sent.current); persist({ help, firstVerdict: v, checkedText: sent.current })
    },
  }
}

function Retell({ topic, rec, save, onDone }: Pick<StepProps, 'topic' | 'rec' | 'save' | 'notes' | 'update' | 'date'> & { onDone: (level: Level | null) => void }) {
  const L = topic.listen
  const key = 'topic-retell-' + topic.id
  const open = useOpenTask(rec, 'retell', save)
  const [text, setText] = useState(() => readDraft(key))
  const [run, setRun] = useState(0)
  const ready = useReady()
  useTaskContext({ label: '重述對話：' + topic.title, detail: ['重述題：' + L.retell, '對話：' + L.dialogue.map(l => l.who + ': ' + l.en).join(' / '), '參考說法（不要直接給他）：' + L.retellSample].join('\n'), draft: text })
  return <>
    <h2 className="pr-question">不看稿，用兩三句說出重點</h2>
    <p className="ls-help">{L.retell}</p>
    <label className="pr-field">我的重述（先說出來，再打下來）
      <textarea lang="en" rows={3} value={text} spellCheck={false} autoComplete="off" onChange={e => { setText(e.target.value); writeDraft(key, e.target.value) }} />
    </label>
    <div className="ls-helps" role="group" aria-label="需要幫忙時打開">
      <button type="button" aria-pressed={open.help.includes('sample')} onClick={() => { if (ready()) open.addHelp('sample') }}>看參考說法</button>
      <StuckButton onUse={() => open.addHelp('claude')} />
    </div>
    {open.help.includes('sample') && <section className="pr-reference"><small>參考說法（看過就記成有提示完成）</small><p lang="en">{L.retellSample}</p></section>}
    {tutorKey() && <div className="pr-actions"><button type="button" className="pr-main" disabled={!text.trim()} onClick={() => { open.send(text); setRun(n => n + 1) }}>請 Claude 看</button></div>}
    <CorrectBox run={run} mode="open" zh={'重述對話重點：' + L.retell} reference={L.retellSample} answer={text} selfFix
      onReveal={() => open.addHelp('sample')} onResult={v => open.setVerdict(v)} />
    <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!text.trim()} onClick={() => { clearDraft(key); onDone(judgeExpress({ answered: true, help: open.help, firstVerdict: open.verdictFor(text) })) }}>完成聽力</button>
      <button type="button" className="pr-link" onClick={() => onDone(null)}>先跳過重述</button>
    </div>
    {text.trim() && !open.verdictFor(text) && <p className="ls-help">{open.stale(text) ? '你在 Claude 看過之後改了內容：改過的這一版還沒人確認，會記成「自評完成・待確認」。' : tutorKey() ? '沒請 Claude 看就完成，會先記成「自評完成・待確認」。' : '還沒連接 Claude：對照對話自己檢查，會記成「自評完成・待確認」。'}</p>}
  </>
}

const readTips: Record<ReadSkill, string> = {
  主旨: '主旨題看整篇在講什麼，不是其中一句的細節。',
  細節: '細節題回到文章找那一句，對好數字、時間和地點。',
  指涉: '指涉題往前找：it、they、me 指的是前面提過的哪個人或東西。',
  推論: '推論題的答案沒有直接寫，要用文章給的資訊推出來。',
  有沒有提供: '文章沒寫的就選「沒有說」，不要用自己的常識補。',
}
function ReadStep({ topic, rec, save, onNext }: StepProps) {
  const R = topic.read
  const ready = useReady()
  const [picks, setPicks] = useState<(number | undefined)[]>([])
  const [showZh, setShowZh] = useState(false)
  const checked = !!rec.read
  return <section className="tl-read">
    <div className="pr-label">讀 · {R.kind}</div>
    <h2 className="pr-question">先讀英文，再回答</h2>
    <article className="tl-text">
      <strong lang="en">{R.title}</strong>
      {R.lines.map(l => <p key={l.en}><span lang="en">{l.en}</span>{checked && showZh && <span className="ls-zh">{l.zh}</span>}</p>)}
    </article>
    <Questions items={R.questions.map(q => ({ ...q, tag: q.skill, en: true }))} picks={picks} checked={checked}
      onPick={(i, j) => { if (!ready()) return; const p = [...picks]; p[i] = j; setPicks(p) }} />
    {!checked ? <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!allPicked(picks, R.questions.length)} onClick={() => {
        const missed = R.questions.filter((q, i) => picks[i] !== q.answer).map(q => q.skill)
        save(r => r.read ? {} : { read: { correct: R.questions.length - missed.length, total: R.questions.length, missed } })
      }}>對答案</button>
    </div> : <>
      <p className="tl-score">第一次答對 {rec.read!.correct} / {rec.read!.total}</p>
      {[...new Set(rec.read!.missed)].map(k => <p key={k} className="ls-help tl-tip"><b>{k}</b>{readTips[k]}</p>)}
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        <button type="button" className="pr-main" onClick={onNext}>完成第 1 次</button>
      </div>
    </>}
  </section>
}

async function transcribe(blob: Blob) {
  const form = new FormData()
  form.append('file', blob, 'speaking.webm')
  form.append('model', 'gpt-4o-mini-transcribe')
  form.append('language', 'en')
  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + openaiKey() }, body: form })
  if (!res.ok) throw new Error('轉文字失敗（' + res.status + '）')
  return ((await res.json()).text as string) || ''
}
/** Optional: record yourself and listen back. The clip stays on this screen. */
function Recorder({ onClip }: { onClip?: (blob: Blob) => void }) {
  const [recording, setRecording] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop() }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null
  async function toggle() {
    if (recording) { recorder.current?.stop(); return }
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const r = new MediaRecorder(stream)
      r.ondataavailable = e => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunks, { type: r.mimeType })
        setUrl(URL.createObjectURL(blob)); setRecording(false); onClip?.(blob)
      }
      recorder.current = r; r.start(); setRecording(true)
    } catch { setError('麥克風被擋住了，直接說出來就好。') }
  }
  return <div className="tl-rec">
    <button type="button" className="ls-play" onClick={toggle}>{recording ? <><Square size={14} />停止錄音</> : <><Mic size={14} />{url ? '重錄' : '錄音（選用）'}</>}</button>
    {url && <audio controls src={url} />}
    {error && <p className="ls-help">{error}</p>}
  </div>
}

type SpeakMode = 'recorded' | 'spoken' | 'typed'
const modeChoice: Record<SpeakMode, string> = { recorded: '說出來了，也有錄音', spoken: '說出來了，沒有錄音', typed: '只用打字（沒有說出來）' }
const modeNames: Record<SpeakMode, string> = { recorded: '說出來了（有錄音，自己聽過）', spoken: '說出來了（沒有錄音）', typed: '只用打字，不算口說' }
/** A speaking task: conditions only, say it (optionally record), then type what you said.
 *  Feedback comes from the transcript, so pronunciation is 未評估; one or two goals for next time. */
function SpeakStep({ topic, rec, save, onNext, update, date, part, task }: StepProps & { part: TopicPart; task: SpeakTask }) {
  const open = useOpenTask(rec, part + '-speak', save)
  const draftKey = 'topic-speak-' + topic.id + '-' + part
  const [text, setText] = useState(() => readDraft(draftKey))
  // How it was done: out loud with a recording, out loud without one, or typed only (typing is not speaking).
  const [mode, setMode] = useState<SpeakMode | null>(null)
  const [clip, setClip] = useState<Blob>()
  const how: SpeakMode | null = clip && !mode ? 'recorded' : mode
  const [busy, setBusy] = useState('')
  const [met, setMet] = useState<boolean[]>(() => task.conditions.map(() => false))
  const [run, setRun] = useState(0)
  const [result, setResult] = useState<Result>()
  const [done, setDone] = useState<SpeakRecord | null>(null)
  const ready = useReady()
  useTaskContext({
    label: '口說：' + task.situation,
    detail: ['口說情境：' + task.situation, '要做到：' + task.conditions.join('；'), '這是他說完後打下來的文字稿，只看內容和文法，不評發音。', '參考說法（不要直接給他）：' + task.sample].join('\n'),
    draft: text,
  })
  async function toText() {
    if (!clip) return
    setBusy('轉文字中……')
    try { const t = await transcribe(clip); if (t) { setText(t); writeDraft(draftKey, t) } setBusy('') }
    catch (e) { setBusy(e instanceof Error ? e.message : String(e)) }
  }
  function finish() {
    if (!ready() || !how) return
    const verdict = open.verdictFor(text)
    const textLevel = text.trim() ? judgeExpress({ answered: true, help: open.help, firstVerdict: verdict }) : null
    const level = how === 'typed' ? null : judgeSpeak({ said: true, transcript: text, help: open.help, firstVerdict: verdict })
    const unmet = task.conditions.filter((_, i) => !met[i])
    const record: SpeakRecord = { level, textLevel, mode: how, help: open.help, ...(verdict ? { firstVerdict: verdict } : {}), recorded: !!clip, goals: speakGoals(result?.fixes ?? [], unmet) }
    if (part === 'C') save(r => ({ review: { level: r.review?.level ?? null, speak: record } }))
    else save({ speak: record })
    clearDraft(draftKey)
    setDone(record)
  }
  if (done) return <section className="tl-speak-done">
    <div className="pr-label">說 · 這次的紀錄</div>
    <h2 className="pr-question">{done.mode === 'typed' ? '只用打字完成（不算口說）' : done.level ? levelNames[done.level] : '未作答'}</h2>
    <ul className="tl-levels">
      <li data-level={done.level ?? 'none'}><span>口說</span><b>{modeNames[done.mode ?? 'spoken']}</b></li>
      <li data-level={done.textLevel ?? 'none'}><span>內容和文法（文字稿）</span><b>{!done.textLevel ? '沒有文字稿，沒辦法確認'
        : done.help.some(h => h === 'sample' || h === 'frame' || h === 'claude') ? '用了參考說法或提示'
        : done.firstVerdict ? 'Claude 看過文字稿' : '沒有人確認，先記成自評'}</b></li>
      <li data-level="none"><span>發音</span><b>未評估（只看文字稿，沒有聽你的聲音）</b></li>
    </ul>
    <div className="tl-goals"><strong>下次的目標</strong><ol>{done.goals.map(g => <li key={g}>{g}</li>)}</ol></div>
    <div className="pr-actions"><button type="button" className="pr-main" onClick={onNext}>{part === 'C' ? '完成第 3 次' : '下一步：寫訊息'}</button></div>
  </section>
  return <section className="tl-speak">
    <div className="pr-label">說 · {part === 'C' ? '換個情境' : '用英文完成一件事'}</div>
    <h2 className="pr-question">{task.situation}</h2>
    {part === 'C' && <p className="tl-situation">{topic.review.situation}</p>}
    <div className="tl-conditions"><strong>要做到</strong><ul>{task.conditions.map(c => <li key={c}>{c}</li>)}</ul></div>
    {task.followUps?.length ? <p className="ls-help">對方可能接著問：<span lang="en">{task.followUps.join(' ／ ')}</span>（也試著回答）</p> : null}
    <p className="ls-help">先想 30 秒，再開口說。可以錄音聽自己，也可以直接說。</p>
    <Recorder onClip={setClip} />
    {clip && openaiKey() && <div className="pr-actions"><button type="button" className="pr-link" disabled={!!busy && busy.endsWith('……')} onClick={toText}>把錄音轉成文字</button>{busy && <small role="status">{busy}</small>}</div>}
    <label className="pr-field">{openaiKey() ? '你剛剛說的（打下來，或錄音後按「把錄音轉成文字」）' : '你剛剛說的（照著打下來）'}
      <textarea lang="en" rows={4} value={text} spellCheck={false} autoComplete="off" placeholder="照你說的寫，不用先改好" onChange={e => { setText(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <div className="ls-helps" role="group" aria-label="卡住了再打開">
      <span>卡住了？</span>
      <button type="button" aria-pressed={open.help.includes('cue')} onClick={() => { if (ready()) open.addHelp('cue') }}>句型提示</button>
      <button type="button" aria-pressed={open.help.includes('sample')} onClick={() => { if (ready()) open.addHelp('sample') }}>參考說法</button>
      <StuckButton onUse={() => open.addHelp('claude')} />
    </div>
    {open.help.includes('cue') && <p className="ls-help">{topic.grammar.title}：{topic.grammar.points[0]}</p>}
    {open.help.includes('sample') && <section className="pr-reference"><small>參考說法（看過就記成有提示完成）</small><p lang="en">{task.sample}</p></section>}
    {tutorKey() && <div className="pr-actions"><button type="button" className="pr-main" disabled={!text.trim()} onClick={() => { open.send(text); setRun(n => n + 1) }}>{run ? '改好了，再看一次' : '請 Claude 看文字稿'}</button></div>}
    <CorrectBox run={run} mode="open" zh={'口說情境：' + task.situation + '。要做到：' + task.conditions.join('；') + '（這是說完後打下來的文字稿，不評發音）'}
      reference={task.sample} words={[topic.grammar.title]} answer={text} selfFix
      onReveal={() => open.addHelp('sample')}
      onResult={(v, _n, r) => { open.setVerdict(v); setResult(r) }}
      onSave={card => update(prev => addSayCard(prev, { ...card, from: 'lesson' }, date))} />
    <fieldset className="tl-selfcheck"><legend>說完後勾一下：我有做到</legend>
      {task.conditions.map((c, i) => <label key={c} className="tl-check"><input type="checkbox" checked={met[i]} onChange={e => setMet(met.map((m, j) => j === i ? e.target.checked : m))} />{c}</label>)}
    </fieldset>
    <a className="pr-link tl-emma" href={'#speaking/topic-' + topic.id + '-' + part}>改用說的：跟 Emma 練這個情境</a>
    <fieldset className="tl-selfcheck" role="radiogroup"><legend>你怎麼完成這題？</legend>
      {(['recorded', 'spoken', 'typed'] as const).map(m => <label key={m} className="tl-check">
        <input type="radio" name={'how-' + part} checked={how === m} disabled={m === 'recorded' && !clip} onChange={() => setMode(m)} />{modeChoice[m]}</label>)}
    </fieldset>
    <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!how || (how === 'typed' && !text.trim())} onClick={finish}>完成這題</button>
      <button type="button" className="pr-link" onClick={() => { if (!ready()) return; const record: SpeakRecord = { level: null, help: open.help, goals: speakGoals([], task.conditions) }; if (part === 'C') save(r => ({ review: { level: r.review?.level ?? null, speak: record } })); else save({ speak: record }); onNext() }}>先跳過</button>
    </div>
    {how === 'typed' && <p className="ls-help">只用打字的話，內容和文法照樣記，但不算口說。下次試著先說出來再打。</p>}
    {how && how !== 'typed' && !text.trim() && <p className="ls-help">沒有文字稿就沒辦法確認內容，這題會記成「自評完成・待確認」。打下來再請 Claude 看，才能確認。</p>}
    {text.trim() && !open.verdictFor(text) && <p className="ls-help">{open.stale(text) ? '你在 Claude 看過之後改了內容：改過的這一版還沒人確認，會記成「自評完成・待確認」。' : tutorKey() ? '沒請 Claude 看就完成，會記成「自評完成・待確認」。' : '還沒連接 Claude：對照條件自己檢查，會記成「自評完成・待確認」。'}</p>}
  </section>
}

/** A 3–5 sentence message; the frame, the model answer or asking Claude count as help. */
function WriteStep({ topic, rec, save, onNext, update, date }: StepProps) {
  const W = topic.write
  const open = useOpenTask(rec, 'write', save)
  const draftKey = 'topic-write-' + topic.id
  const [text, setText] = useState(() => readDraft(draftKey))
  const [run, setRun] = useState(0)
  const ready = useReady()
  const n = countSentences(text)
  const enough = n >= W.minSentences
  const inRange = enough && n <= 5
  const [met, setMet] = useState<boolean[]>(() => W.conditions.map(() => false))
  const firstSentence = W.sample.match(/^[^.?!]+[.?!]/)?.[0] ?? W.sample
  useTaskContext({
    label: '寫訊息：' + W.task,
    detail: ['寫一則 3–5 句的訊息：' + W.task, '要寫到：' + W.conditions.join('；'), '這個主題的句型：' + topic.grammar.title, '參考寫法（不要直接給他）：' + W.sample, '他要寫自己的內容；幫他想內容或句型就好，不要替他寫整段。'].join('\n'),
    draft: text,
  })
  return <section className="tl-write">
    <div className="pr-label">寫訊息 · {W.minSentences}–5 句</div>
    <h2 className="pr-question">{W.task}</h2>
    <div className="tl-conditions"><strong>要寫到</strong><ul>{W.conditions.map(c => <li key={c}>{c}</li>)}</ul></div>
    <label className="pr-field">我的訊息
      <textarea lang="en" rows={5} value={text} spellCheck={false} autoComplete="off" placeholder="寫你自己的內容" onChange={e => { setText(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <p className="tl-count" data-ok={inRange}>已寫 {n} 句{!enough ? '，要 ' + W.minSentences + '–5 句' : n > 5 ? '：訊息最多 5 句，挑最重要的留下' : ''}（只算長度，兩個字以上才算一句；文法和意思要另外檢查）</p>
    <div className="ls-helps" role="group" aria-label="需要幫忙時一層一層打開">
      <span>卡住了？一層一層打開：</span>
      <button type="button" aria-pressed={open.help.includes('cue')} onClick={() => { if (ready()) open.addHelp('cue') }}>① 用哪個句型</button>
      <button type="button" aria-pressed={open.help.includes('frame')} onClick={() => { if (ready()) open.addHelp('frame') }}>② 句架</button>
      <button type="button" aria-pressed={open.help.includes('sample')} onClick={() => { if (ready()) open.addHelp('sample') }}>③ 參考寫法</button>
      <StuckButton onUse={() => open.addHelp('claude')} />
    </div>
    {open.help.includes('cue') && <p className="ls-help">{topic.grammar.title}：{topic.grammar.points.join(' ')}</p>}
    {open.help.includes('frame') && <p className="pr-frame" lang="en">{sentenceFrame(firstSentence)}</p>}
    {open.help.includes('sample') && <section className="pr-reference"><small>參考寫法（只是一種例子）</small><p lang="en">{W.sample}</p></section>}
    {tutorKey() && <div className="pr-actions"><button type="button" className="pr-main" disabled={!text.trim()} onClick={() => { open.send(text); setRun(r => r + 1) }}>{run ? '改好了，再批一次' : '請 Claude 批改'}</button></div>}
    <CorrectBox run={run} mode="open" zh={W.task + '（要寫到：' + W.conditions.join('；') + '）'} reference={W.sample} words={[topic.grammar.title]} answer={text} selfFix
      onReveal={() => open.addHelp('sample')} onResult={v => open.setVerdict(v)}
      onSave={card => update(prev => addSayCard(prev, { ...card, from: 'lesson' }, date))} />
    <fieldset className="tl-selfcheck"><legend>寫完勾一下：我有寫到</legend>
      {W.conditions.map((c, i) => <label key={c} className="tl-check"><input type="checkbox" checked={met[i]} onChange={e => setMet(met.map((m, j) => j === i ? e.target.checked : m))} />{c}</label>)}
    </fieldset>
    <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!inRange} onClick={() => {
        if (!ready()) return
        const verdict = open.verdictFor(text)
        save({ write: { level: judgeExpress({ answered: true, help: open.help, firstVerdict: verdict }), sentences: n, covered: met.filter(Boolean).length, help: open.help, ...(verdict ? { firstVerdict: verdict } : {}) } })
        clearDraft(draftKey); onNext()
      }}>完成第 2 次</button>
      <button type="button" className="pr-link" onClick={() => { if (!ready()) return; save({ write: { level: null, sentences: n, help: open.help } }); onNext() }}>先跳過</button>
    </div>
    {inRange && !open.verdictFor(text) && <p className="ls-help">{open.stale(text) ? '你在 Claude 批改之後改了內容：改過的這一版還沒人確認，會記成「自評完成・待確認」。' : tutorKey() ? '沒請 Claude 批改就完成，會記成「自評完成・待確認」。' : '還沒連接 Claude：對照「要寫到」自己檢查，會記成「自評完成・待確認」。'}</p>}
  </section>
}

const speakLine = (r?: SpeakRecord) => !r ? '—' : r.mode === 'typed' ? '只用打字（不算口說）· 內容：' + levelText(r.textLevel)
  : levelText(r.level) + (r.mode === 'recorded' ? ' · 有錄音' : '') + ' · 發音未評估'
function TopicDone({ topic, part, rec, navigate }: { topic: Topic; part: TopicPart; rec: TopicRecord; navigate: PageProps['navigate'] }) {
  const items = (list: TopicSentence[]) => list.map(s => ({ s, r: rec.items?.[s.id] }))
  const L = rec.listen
  const lines: [string, string][] = part === 'A' ? [
    ['單字', rec.words ? '在句子裡選意思：第一次選對 ' + rec.words.correct + ' / ' + rec.words.total : '—'],
    ...items(topic.practice).map(({ s, r }) => ['句型', s.zh + ' → ' + (r?.level ? levelNames[r.level] : r?.rating === 'again' ? '不會' : '未作答')] as [string, string]),
    ['聽', L?.noVoice ? '沒有語音，直接讀對話（不算只聽就懂）'
      : (L?.unsure && !L?.plays ? '播放沒有確認（不算只聽就懂）：' : '只聽不看字：') + '大意' + (L?.gist ? ' ✓' : ' ✗') + '，細節 ' + (L?.details ?? 0) + ' / ' + (L?.total ?? topic.listen.details.length) + '（完整聽了 ' + (L?.plays ?? 0) + ' 次' + (L?.replays ? '＋再聽 ' + L.replays + ' 次' : '') + '）'],
    ['聽', '看逐字稿' + (L?.transcript ? ' ✓' : ' —') + ' · 跟讀' + (L?.shadowed ? ' ✓' : ' —') + ' · 重述：' + (L?.retell ? levelNames[L.retell] : '跳過')],
    ['讀', rec.read ? '第一次答對 ' + rec.read.correct + ' / ' + rec.read.total + (rec.read.missed.length ? '（要再練：' + [...new Set(rec.read.missed)].join('、') + '）' : '') : '—'],
  ] : part === 'B' ? [
    ['說', speakLine(rec.speak)],
    ['寫', levelText(rec.write?.level) + (rec.write ? ' · ' + rec.write.sentences + ' 句' + (rec.write.covered !== undefined ? ' · 自己勾了 ' + rec.write.covered + ' / ' + topic.write.conditions.length + ' 項' : '') : '')],
  ] : [
    ...items(topic.review.practice).map(({ s, r }) => ['換情境（筆答）', s.zh + ' → ' + (r?.level ? levelNames[r.level] : r?.rating === 'again' ? '不會' : '未作答')] as [string, string]),
    ['換情境（說）', speakLine(rec.review?.speak)],
  ]
  const stable = part === 'C' && rec.review?.level === 'delayed'
  const nextLine = part === 'A' ? '下次（上完一堂文法課之後）做第 2 次：說和寫。'
    : part === 'B' ? '第 3 次換情境複習隔幾天才會出現' + (reviewFrom(rec) ? '（' + reviewFrom(rec)!.slice(5).replace('-', '/') + ' 以後）' : '') + '，看看還記得多少。'
    : stable ? '這個主題的句型穩了：隔了幾天、換了情境，還能自己寫對兩句以上（這是筆答；口說另外記在上面）。'
    : '還沒到「穩了」：換情境的句子要有兩句是自己寫、而且確認過的。寫錯的句子已經進複習卡。'
  const goals = part === 'B' ? rec.speak?.goals : part === 'C' ? rec.review?.speak?.goals : undefined
  return <section className="tl-done">
    <div className="pr-label">第 {'ABC'.indexOf(part) + 1} 次完成</div>
    <h2 className="pr-question">{topic.title}：{partNames[part]}</h2>
    <ul className="tl-levels">{lines.map(([k, v], i) => <li key={i}><span>{k}</span><b>{v}</b></li>)}</ul>
    {goals?.length ? <div className="tl-goals"><strong>下次說的時候</strong><ol>{goals.map(g => <li key={g}>{g}</li>)}</ol></div> : null}
    <p className={'ls-goal' + (stable ? ' tl-stable' : '')}><small>接下來</small>{nextLine}</p>
    <div className="pr-actions">
      <button type="button" className="pr-main" onClick={() => navigate('today')}>回今天</button>
      <button type="button" className="pr-link" onClick={() => { location.hash = 'history' }}>看紀錄</button>
    </div>
  </section>
}

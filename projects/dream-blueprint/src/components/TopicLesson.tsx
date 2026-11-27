import DraftVersions from './DraftVersions'
import AskWhy from './AskWhy'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, Mic, Pause, Play, Square, Volume2 } from 'lucide-react'
import { updateStoreNow, type PageProps } from '../lib/store'
import type { Energy, Period } from '../lib/progress'
import { PracticeCover } from './PracticeCover'
import { Translation } from './Translation'
import CorrectBox, { correctionBlocked, useCorrectionBlocked, useCorrectionPending, type Result } from './CorrectBox'
import { correctionKey, correctionOrder, readCorrection, storeCorrection, type CorrectionSubmission } from '../lib/correctionHistory'
import StuckButton from './StuckButton'
import { Transcript, useDialogueVoice } from './LessonParts'
import { answered, judgeExpress, judgeWritten, levelNames, type Level, type Verdict } from '../lib/evidence'
import { readHints, sentenceFrame, writeHint } from '../lib/lesson'
import { captureDraftCleanup, readDraft, transcriptLanding, writeDraft } from '../lib/drafts'
import { tutorKey } from '../lib/tutor'
import { openaiKey } from '../lib/voice'
import { transcribe } from '../lib/speech'
import { addSayCards } from '../lib/sayCards'
import { useTaskContext } from '../lib/taskContext'
import { completePart, countSentences, judgeReview, judgeSpeak, listenStage, openVerdict, partNames, partSteps, readTopic, reviewFrom, speakGoals, writeTopic, type ItemResult, type ListenRecord, type ListenStage, type OpenCheck, type ReadSkill, type SpeakRecord, type SpeakTask, type Topic, type TopicPart, type TopicRecord, type TopicSentence, retellTask } from '../lib/topics'
import './lesson.css'
import './topic.css'

type Patch = Partial<TopicRecord> | ((record: TopicRecord, notes: Record<string, string>) => Partial<TopicRecord>)
type Save = (patch: Patch) => void
type Next = (patch?: Patch, afterSave?: () => void, stay?: boolean) => Promise<void>
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
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const transition = useRef(false)
  const mounted = useRef(false)
  const rec = readTopic(state.notes, topic.id)
  const rate = state.settings.speechRate
  useEffect(() => {
    mounted.current = true
    update(prev => {
      const current = readTopic(prev.notes, topic.id)
      return current.done[part] || current.cur ? prev
        : { ...prev, notes: writeTopic(prev.notes, topic.id, { cur: { part, step, day: date } }) }
    })
    return () => { mounted.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const save: Save = patch => update(prev => ({
    ...prev, notes: writeTopic(prev.notes, topic.id, typeof patch === 'function' ? patch(readTopic(prev.notes, topic.id), prev.notes) : patch),
  }))
  const next: Next = async (patch = {}, afterSave, stay = false) => {
    if (transition.current) return
    transition.current = true
    setSaving(true)
    setSaveError('')
    try {
      const last = step + 1 === steps.length
      await updateStoreNow(prev => {
        const current = readTopic(prev.notes, topic.id)
        if (current.done[part] || (current.cur && (current.cur.part !== part || current.cur.step !== step))) {
          throw new Error('另一個分頁或裝置已更新這堂課。請回「今天」再打開，草稿仍在。')
        }
        const change = typeof patch === 'function' ? patch(current, prev.notes) : patch
        const staged = { ...prev, notes: writeTopic(prev.notes, topic.id, { ...change, cur: { part, step: stay || last ? step : step + 1, day: date } }) }
        return last && !stay ? completePart(staged, topic, part, date, energy, period, sessionId) : staged
      })
      afterSave?.()
      if (!mounted.current || stay) return
      if (last) setFinished(true)
      else setStep(step + 1)
      window.scrollTo?.({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (mounted.current) setSaveError(error instanceof Error ? error.message : '這次沒有存成功。草稿仍在，請再試一次。')
    } finally {
      transition.current = false
      if (mounted.current) setSaving(false)
    }
  }
  const now = steps[step][0]
  const shared = { topic, rec, save, onNext: next, saving, rate, date, notes: state.notes, update }
  return <section className="practice-page topic-page">
    <PracticeCover title={'生活主題 ' + topic.n + '：' + topic.title}>
      <button type="button" className="pr-back" onClick={() => navigate('today')}><ChevronLeft size={16} aria-hidden="true" />回今天</button>
    </PracticeCover>
    <div className="pr-pane pr-session tl-session">
      <div className="pr-session-meta">
        <span>第 {'ABC'.indexOf(part) + 1} 次（共 3 次）· {partNames[part]}</span>
        {!finished && <button type="button" className="pr-link tl-skip" disabled={saving} onClick={onSkip}>今天先上文法課</button>}
      </div>
      {!finished && <ol className="ls-steps" aria-label="這次的步驟" style={{ gridTemplateColumns: 'repeat(' + steps.length + ', minmax(0, 1fr))' }}>
        {steps.map(([id, name], i) => {
          const s = i < step ? 'done' : i === step ? 'now' : 'todo'
          return <li key={id} data-state={s} aria-current={s === 'now' ? 'step' : undefined}>
            <i aria-hidden="true">{s === 'done' ? <Check size={11} strokeWidth={3} /> : null}</i><span>{name}</span>
          </li>
        })}
      </ol>}
      {saveError && <p className="tu-error" role="alert">{saveError}</p>}
      {finished ? <TopicDone topic={topic} part={part} rec={rec} navigate={navigate} />
        : now === 'goal' ? <GoalStep topic={topic} onNext={next} saving={saving} />
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
          onAllDone={results => r => ({ review: { ...r.review, level: judgeReview(results) } })} />}
    </div>
  </section>
}

type StepProps = { topic: Topic; rec: TopicRecord; save: Save; onNext: Next; saving: boolean; rate: number; date: string; notes: Record<string, string>; update: Update }

function GoalStep({ topic, onNext, saving }: Pick<StepProps, 'topic' | 'onNext' | 'saving'>) {
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
    <div className="pr-actions"><button type="button" className="pr-main" disabled={saving} onClick={() => { if (ready()) void onNext() }}>開始</button></div>
  </section>
}

type Choice = { q: string; options: string[]; answer: number; lead?: string; tag?: string; en?: boolean }
function Questions({ items, picks, onPick, checked, disabled, source, passage }: { items: Choice[]; picks: (number | undefined)[]; onPick: (i: number, j: number) => void; checked: boolean; disabled?: boolean
  /** For 「問 Claude 為什麼」 once checked: what kind of question, and the dialogue or text it is about. */
  source?: string; passage?: string }) {
  return <ol className="ls-qs tl-qs">
    {items.map((q, i) => <li key={i}>
      {q.tag && <small className="tl-tag">{q.tag}</small>}
      {q.lead && <p lang="en" className="tl-lead">{q.lead}</p>}
      <p lang={q.en ? 'en' : undefined}>{q.q}</p>
      <div className="pr-options">{q.options.map((o, j) => <button key={j} type="button" lang={q.en ? 'en' : undefined}
        aria-pressed={picks[i] === j} disabled={checked || disabled}
        data-result={checked ? (j === q.answer ? 'right' : picks[i] === j ? 'wrong' : undefined) : undefined}
        onClick={() => onPick(i, j)}>{o}</button>)}</div>
      {checked && source && <AskWhy q={{ source, passage, stem: (q.lead ? q.lead + ' ' : '') + q.q, options: q.options, picked: picks[i] === undefined ? '' : q.options[picks[i]!], answer: q.options[q.answer], right: picks[i] === q.answer }} />}
    </li>)}
  </ol>
}
const allPicked = (picks: (number | undefined)[], n: number) => picks.filter(p => p !== undefined).length >= n

function WordsStep({ topic, rec, save, onNext, rate, saving }: StepProps) {
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
    <Questions items={qs} picks={rec.words?.picks ?? picks} checked={checked} source="生活主題的單字" onPick={(i, j) => { if (!ready()) return; const p = [...picks]; p[i] = j; setPicks(p) }} />
    {!checked ? <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!allPicked(picks, qs.length)}
        onClick={() => save(r => r.words ? {} : { words: { correct: qs.filter((q, i) => picks[i] === q.answer).length, total: qs.length,
          picks: picks.filter((choice): choice is number => choice !== undefined) } })}>對答案</button>
    </div> : <>
      <p className="tl-score">第一次就選對 {rec.words!.correct} / {rec.words!.total}{rec.words!.correct < rec.words!.total ? '：同一個字在不同句子裡意思會變，看整句再決定。' : ''}</p>
      <div className="pr-actions"><button type="button" className="pr-main" disabled={saving} onClick={() => void onNext()}>下一步：句型</button></div>
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
function SentenceItems({ topic, sentences, rec, notes, update, date, label, doneLabel, intro, preparation, onAllDone, onNext, saving }: StepProps & {
  sentences: TopicSentence[]; label: string; doneLabel: string; intro?: ReactNode
  preparation?: (first: boolean) => ReactNode; onAllDone?: (levels: (Level | null)[]) => Patch
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
    <div className="pr-actions"><button type="button" className="pr-main" disabled={saving} onClick={() => {
      if (ready()) void onNext(onAllDone?.(sentences.map(s => results[s.id]?.level ?? null)))
    }}>{doneLabel}</button></div>
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
          rating, revealed: revealed || blank, attempted: !blank,
        }
        // The first mark is the record: a second tap cannot replace it.
        return updateStoreNow(prev => {
          const current = readTopic(prev.notes, topic.id)
          if (current.items?.[s.id]) throw new Error('這一句已有正式紀錄，草稿仍在。')
          return { ...prev, notes: writeTopic(prev.notes, topic.id, { items: { ...current.items, [s.id]: result } }) }
        }).then(() => true)
      }} />
  </>
}

/** Five steps: the gist without the text → details (still no text) → the transcript → shadowing → retelling.
 *  What was understood from listening alone is saved before the text appears; later plays are kept apart. */
function ListenStep({ topic, rec, save, onNext, rate, notes, saving }: StepProps) {
  const L = topic.listen
  const voice = useDialogueVoice(rate)
  const ready = useReady()
  const saved = rec.listen ?? {}
  const [sub, setSub] = useState<ListenStage>(() => listenStage(saved))
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
  const [recording, setRecording] = useState(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const before = sub === 'gist' || sub === 'details'
  function noAudio() {
    go('text', { noVoice: true }, () => setNoVoice(true))
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
  function go(stage: ListenStage, patch: Partial<ListenRecord> = {}, afterSave?: () => void) {
    voice.stop()
    void onNext(r => {
      if (r.listen?.stage && r.listen.stage !== sub) {
        throw new Error('另一個分頁或裝置已更新聽力步驟。請回「今天」再繼續。')
      }
      return { listen: { ...r.listen, ...patch, stage } }
    }, () => {
      if (!mounted.current) return
      setSub(stage)
      afterSave?.()
      window.scrollTo?.({ top: 0, behavior: 'smooth' })
    }, true)
  }
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
      <Questions items={[{ ...L.gist, en: true }]} picks={[saved.gist !== undefined ? saved.gistPick ?? gistPick : gistPick]} checked={saved.gist !== undefined} disabled={!open} source="生活主題的聽力（大意）" passage={L.dialogue.map(d => d.en).join(' / ')}
        onPick={(_, j) => { if (ready() && open) setGistPick(j) }} />
      {!open && <p className="ls-help ls-need">先按「播放對話」完整聽一次，題目才能作答。中途停掉不算聽完。</p>}
      {unsureLink}
      {unsure && !heard && <p className="ls-help">這台裝置沒有回報播放結束：可以作答，但這次不算「只聽就懂」。</p>}
      {saved.gist === undefined
        ? <button type="button" className="pr-main" disabled={gistPick === undefined} onClick={() => {
          setGistAt(voice.completed)
          save(r => r.listen?.gist !== undefined ? {} : { listen: { ...r.listen, gist: gistPick === L.gist.answer, gistPick, plays: voice.completed } })
        }}>確定</button>
        : <>
          <p className="tl-score">{saved.gist ? '✓ 大意聽懂了。' : '✗ 這次大意沒抓到，沒關係，下一步再聽一次細節。'}</p>
          <button type="button" className="pr-main" disabled={saving} onClick={() => go('details')}>下一步：聽細節</button>
        </>}
    </>}

    {sub === 'details' && <>
      <h2 className="pr-question">再聽一次，回答細節</h2>
      <p className="ls-help">還是不看字。可以用剛剛聽到的回答，也可以再完整聽一次，再聽的次數會另外記。</p>
      {play}
      <Questions items={L.details.map(q => ({ ...q, en: true }))} picks={saved.details !== undefined ? saved.detailPicks ?? picks : picks} checked={saved.details !== undefined} source="生活主題的聽力（細節）" passage={L.dialogue.map(d => d.en).join(' / ')}
        onPick={(i, j) => { if (!ready()) return; const p = [...picks]; p[i] = j; setPicks(p) }} />
      {saved.details === undefined
        ? <button type="button" className="pr-main" disabled={!allPicked(picks, L.details.length)} onClick={() => {
          voice.stop()
          save(r => r.listen?.details !== undefined ? {} : { listen: { ...r.listen, details: L.details.filter((q, i) => picks[i] === q.answer).length,
            detailPicks: picks.filter((choice): choice is number => choice !== undefined), total: L.details.length, replays } })
        }}>對答案</button>
        : <>
          <p className="tl-score">{saved.unsure && !saved.plays ? '播放沒有確認，' : '只聽（不看字）：'}細節答對 {saved.details} / {saved.total}，完整聽了 {saved.plays ?? 0} 次{(saved.replays ?? 0) > 0 ? '，答細節前又聽了 ' + saved.replays + ' 次' : ''}。</p>
          <button type="button" className="pr-main" disabled={saving} onClick={() => go('text', { transcript: true })}>下一步：看逐字稿</button>
        </>}
    </>}

    {sub === 'text' && <>
      <h2 className="pr-question">看著字再聽，找出剛剛沒聽懂的地方</h2>
      <p className="ls-help">點每一句旁邊的喇叭單獨播放；想確認意思再打開中文。</p>
      {!noVoice && play}
      <Transcript lines={L.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(L.dialogue, i, true)} />
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        <button type="button" className="pr-main" disabled={saving} onClick={() => go('shadow', { transcript: true })}>下一步：跟讀</button>
      </div>
    </>}

    {sub === 'shadow' && <>
      <h2 className="pr-question">跟著唸這幾句</h2>
      <p className="ls-help">先聽一句，再照同樣的速度和語氣唸出聲。這裡不評發音，只記你有沒有跟讀；想聽自己的聲音可以錄音。</p>
      <ol className="tl-shadow">
        {L.shadow.map(i => <li key={i}>
          <button type="button" className="ls-line-play" disabled={recording} aria-label={'播放：' + L.dialogue[i].en} onClick={() => voice.play(L.dialogue, i, true)}><Volume2 size={14} /></button>
          <p lang="en">{L.dialogue[i].en}</p>
          <label className="tl-check"><input type="checkbox" checked={shadowed.includes(i)} onChange={e => setShadowed(e.target.checked ? [...shadowed, i] : shadowed.filter(x => x !== i))} />唸了</label>
        </li>)}
      </ol>
      <Recorder disabled={saving} onBusy={active => { if (active) voice.stop(); setRecording(active) }} />
      <button type="button" className="pr-main" disabled={recording || saving} onClick={() => go('retell', { shadowed: shadowed.length >= L.shadow.length })}>下一步：重述</button>
    </>}

    {sub === 'retell' && <Retell topic={topic} rec={rec} save={save} notes={notes} saving={saving} onNext={onNext} />}
  </section>
}

/** The first check supplies the help verdict, while each recent draft keeps its own feedback. */
function useTopicGrade({ topic, rec, save, notes }: Pick<StepProps, 'topic' | 'rec' | 'save' | 'notes'>, key: string, gradeKey: string, text: string) {
  const check = rec.open?.[key] ?? { help: [] }
  const [run, setRun] = useState(0)
  const graded = readCorrection(notes, gradeKey, text)
  const grading = useCorrectionPending(gradeKey)
  const blocked = useCorrectionBlocked(gradeKey)
  function verdictFor(answer: string, checked = check, currentNotes = notes) {
    if (checked.firstVerdict && checked.firstVerdict !== 'good') return checked.firstVerdict
    const matching = readCorrection(currentNotes, gradeKey, answer)
    if (matching?.answer === answer.trim()) return matching.result.verdict
    // New records identify the exact submitted answer. The punctuation-insensitive fallback is for old scores only.
    return checked.firstSubmission || matching ? undefined : openVerdict(checked, answer)
  }
  return {
    check, run, graded, grading, blocked, gradeKey, verdictFor,
    reset() { setRun(0) },
    submit() {
      if (text.trim() && !correctionBlocked(gradeKey)) setRun(n => n + 1)
    },
    addHelp(kind: string) {
      if (check.help.includes(kind)) return
      save(current => {
        const latest = current.open?.[key] ?? { help: [] }
        return { open: { ...current.open, [key]: { ...latest, help: [...new Set([...latest.help, kind])] } } }
      })
    },
    saveGrade(result: Result, answer: string, submission: CorrectionSubmission) {
      return updateStoreNow(prev => {
        const topicRecord = readTopic(prev.notes, topic.id)
        const history = storeCorrection(prev.notes, gradeKey, { ...submission, answer, result })
        const latest = readCorrection(history, gradeKey, '')
        const open = topicRecord.open?.[key] ?? { help: [] }
        const first = !open.firstVerdict || (open.firstSubmission && correctionOrder(submission, open.firstSubmission) < 0)
        const next: OpenCheck = {
          ...open,
          ...(first ? { firstVerdict: result.verdict, checkedText: answer, firstSubmission: submission } : {}),
          ...(latest?.id === submission.id ? { latestVerdict: result.verdict, latestText: answer } : {}),
        }
        return { ...prev, notes: writeTopic(history, topic.id, { open: { ...topicRecord.open, [key]: next } }) }
      })
    },
  }
}

function Retell({ topic, rec, save, onNext, notes, saving }: Pick<StepProps, 'topic' | 'rec' | 'save' | 'notes' | 'onNext' | 'saving'>) {
  const L = topic.listen
  const key = 'topic-retell-' + topic.id
  const [text, setText] = useState(() => readDraft(key))
  const open = useTopicGrade({ topic, rec, save, notes }, 'retell', correctionKey('topic-retell.' + topic.id), text)
  const locked = saving || open.blocked
  const ready = useReady()
  function showDraft(value: string) { open.reset(); setText(value) }
  function done(skipped: boolean) {
    if (!ready() || correctionBlocked(open.gradeKey) || (!skipped && !text.trim())) return
    void onNext((current, notes) => {
      const checked = current.open?.retell ?? { help: [] }
      const level = skipped ? null : judgeExpress({ answered: true, help: checked.help, firstVerdict: open.verdictFor(text, checked, notes) })
      return { listen: { ...current.listen, retell: level } }
    }, skipped ? undefined : captureDraftCleanup(key, text))
  }
  useTaskContext({ label: '重述對話：' + topic.title, detail: ['重述題：' + L.retell, '對話：' + L.dialogue.map(l => l.who + ': ' + l.en).join(' / '), '參考說法（不要直接給他）：' + L.retellSample].join('\n'), draft: text, onHelp: () => open.addHelp('claude') })
  return <>
    <h2 className="pr-question">不看稿，用兩三句說出重點</h2>
    <p className="ls-help">{L.retell}</p>
    <label className="pr-field">我的重述（先說出來，再打下來）
      <textarea lang="en" rows={3} value={text} spellCheck={false} autoComplete="off" readOnly={locked} onChange={e => { showDraft(e.target.value); writeDraft(key, e.target.value) }} />
    </label>
    <DraftVersions id={key} text={text} onChoose={showDraft} disabled={locked} />
    <div className="ls-helps" role="group" aria-label="需要幫忙時打開">
      <StuckButton onUse={() => open.addHelp('claude')} />
    </div>
    {tutorKey() && <div className="pr-actions"><button type="button" className="pr-main" disabled={locked || !text.trim()} onClick={open.submit}>{open.graded ? '請 Claude 再批一次' : '請 Claude 批改'}</button></div>}
    {open.grading && !open.run && <p role="status" className="ls-help">Claude 正在批改，回覆會留在這一題。</p>}
    <CorrectBox key={open.run ? 'grading' : open.graded?.id ?? 'ungraded'} run={open.run} mode="open" rubric="gept-paragraph" zh={retellTask(topic)} reference={L.retellSample} answer={text} selfFix
      restore={!open.run && open.graded ? { ...open.graded, showFull: false } : undefined}
      backgroundGrade={{ id: open.gradeKey, save: open.saveGrade }} onReveal={() => open.addHelp('sample')} />
    <div className="pr-actions">
      <button type="button" className="pr-main" disabled={locked || !text.trim()} onClick={() => done(false)}>完成聽力</button>
      <button type="button" className="pr-link" disabled={locked} onClick={() => done(true)}>先跳過重述</button>
    </div>
    {!locked && text.trim() && !open.verdictFor(text) && <p className="ls-help">{open.check.firstVerdict === 'good' ? '你在 Claude 看過之後改了內容：改過的這一版還沒人確認，會記成「自評完成・待確認」。' : tutorKey() ? '沒請 Claude 看就完成，會先記成「自評完成・待確認」。' : '還沒連接 Claude：對照對話自己檢查，會記成「自評完成・待確認」。'}</p>}
  </>
}

const readTips: Record<ReadSkill, string> = {
  主旨: '主旨題看整篇在講什麼，不是其中一句的細節。',
  細節: '細節題回到文章找那一句，對好數字、時間和地點。',
  指涉: '指涉題往前找：it、they、me 指的是前面提過的哪個人或東西。',
  推論: '推論題的答案沒有直接寫，要用文章給的資訊推出來。',
  有沒有提供: '文章沒寫的就選「沒有說」，不要用自己的常識補。',
}
function ReadStep({ topic, rec, save, onNext, saving }: StepProps) {
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
    <Questions items={R.questions.map(q => ({ ...q, tag: q.skill, en: true }))} picks={rec.read?.picks ?? picks} checked={checked} source="生活主題的閱讀" passage={R.title + '：' + R.lines.map(l => l.en).join(' ')}
      onPick={(i, j) => { if (!ready()) return; const p = [...picks]; p[i] = j; setPicks(p) }} />
    {!checked ? <div className="pr-actions">
      <button type="button" className="pr-main" disabled={!allPicked(picks, R.questions.length)} onClick={() => {
        const missed = R.questions.filter((q, i) => picks[i] !== q.answer).map(q => q.skill)
        save(r => r.read ? {} : { read: { correct: R.questions.length - missed.length, total: R.questions.length, missed,
          picks: picks.filter((choice): choice is number => choice !== undefined) } })
      }}>對答案</button>
    </div> : <>
      <p className="tl-score">第一次答對 {rec.read!.correct} / {rec.read!.total}</p>
      {[...new Set(rec.read!.missed)].map(k => <p key={k} className="ls-help tl-tip"><b>{k}</b>{readTips[k]}</p>)}
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        <button type="button" className="pr-main" disabled={saving} onClick={() => void onNext()}>完成第 1 次</button>
      </div>
    </>}
  </section>
}

/** Optional: record yourself and listen back. The clip stays on this screen. Each press asks for the microphone once;
 *  leaving the step (or skipping it) while the permission is still pending cancels that request, so a late permission
 *  never starts a recording nobody can see, and every microphone track it got is stopped. */
function Recorder({ disabled, onClip, onBusy }: { disabled?: boolean; onClip?: (blob: Blob) => void; onBusy?: (busy: boolean) => void }) {
  const [recording, setRecording] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const occupied = useRef(false)
  const playback = useRef<HTMLAudioElement>(null)
  const asking = useRef(0)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false; asking.current++
      try { if (recorder.current?.state === 'recording') recorder.current.stop() } catch { /* already stopped */ }
      stream.current?.getTracks().forEach(t => t.stop())
    }
  }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return null
  function finishRequest(media: MediaStream | null) {
    media?.getTracks().forEach(t => t.stop())
    if (stream.current === media) stream.current = null
    occupied.current = false
    if (!alive.current) return
    setRecording(false); setRequesting(false); onBusy?.(false)
  }
  async function toggle() {
    if (recorder.current?.state === 'recording') { recorder.current.stop(); return }
    if (disabled || occupied.current) return
    occupied.current = true
    playback.current?.pause()
    const mine = ++asking.current
    setError(''); setRequesting(true); onBusy?.(true)
    let media: MediaStream | null = null
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true })
      // The permission came back after he left or pressed again: close it, record nothing.
      if (!alive.current || asking.current !== mine) { media.getTracks().forEach(t => t.stop()); return }
      stream.current = media
      const chunks: Blob[] = []
      const r = new MediaRecorder(media)
      let failed = false
      r.ondataavailable = e => { if (e.data.size) chunks.push(e.data) }
      r.onerror = () => {
        failed = true
        finishRequest(media)
        if (alive.current && asking.current === mine) setError('錄音中斷。請再錄一次，或直接說完後打下來。')
      }
      r.onstop = () => {
        if (asking.current !== mine || failed) return
        finishRequest(media)
        if (!alive.current) return
        const blob = new Blob(chunks, { type: r.mimeType })
        if (!blob.size) { setError('沒有收到錄音。請再錄一次，或直接說完後打下來。'); return }
        setUrl(URL.createObjectURL(blob)); onClip?.(blob)
      }
      recorder.current = r; r.start(); setRecording(true); setRequesting(false)
    } catch {
      finishRequest(media)
      if (alive.current && asking.current === mine) setError('麥克風被擋住了，直接說出來就好。')
    }
  }
  return <div className="tl-rec">
    <button type="button" className="ls-play" onClick={toggle} disabled={requesting || (!!disabled && !recording)}>{recording ? <><Square size={14} />停止錄音</> : requesting ? '等麥克風允許……' : <><Mic size={14} />{url ? '重錄' : '錄音（選用）'}</>}</button>
    {url && !recording && !requesting && <audio ref={playback} controls src={url} />}
    {error && <p className="ls-help">{error}</p>}
  </div>
}

type SpeakMode = 'recorded' | 'spoken' | 'typed'
const modeChoice: Record<SpeakMode, string> = { recorded: '說出來了，也有錄音', spoken: '說出來了，沒有錄音', typed: '只用打字（沒有說出來）' }
const modeNames: Record<SpeakMode, string> = { recorded: '說出來了（有錄音，自己聽過）', spoken: '說出來了（沒有錄音）', typed: '只用打字，不算口說' }
/** A speaking task: conditions only, say it (optionally record), then type what you said.
 *  Feedback comes from the transcript, so pronunciation is 未評估; one or two goals for next time. */
function SpeakStep({ topic, rec, save, onNext, notes, date, part, task, saving }: StepProps & { part: TopicPart; task: SpeakTask }) {
  const draftKey = 'topic-speak-' + topic.id + '-' + part
  const [text, setText] = useState(() => readDraft(draftKey))
  const open = useTopicGrade({ topic, rec, save, notes }, part + '-speak', correctionKey('topic-speak.' + topic.id + '.' + part), text)
  const locked = saving || open.blocked
  // How it was done: out loud with a recording, out loud without one, or typed only (typing is not speaking).
  const [mode, setMode] = useState<SpeakMode | null>(null)
  const [clip, setClip] = useState<Blob>()
  const how: SpeakMode | null = clip && !mode ? 'recorded' : mode
  const [busy, setBusy] = useState('')
  const [recording, setRecording] = useState(false)
  const waitingForTranscript = busy === '轉文字中……'
  const [met, setMet] = useState<boolean[]>(() => task.conditions.map(() => false))
  const done = part === 'C' ? rec.review?.speak : rec.speak
  const ready = useReady()
  function showDraft(value: string) { open.reset(); setText(value) }
  useTaskContext({
    label: '口說：' + task.situation,
    detail: ['口說情境：' + task.situation, '要做到：' + task.conditions.join('；'), '這是他說完後打下來的文字稿，只看內容和文法，不評發音。', '參考說法（不要直接給他）：' + task.sample].join('\n'),
    draft: text,
    onHelp: () => open.addHelp('claude'),
  })
  // The transcript belongs to the clip it was made from and the text as it was when asked: a reply that comes back after
  // he typed his own changes, recorded again or left the step never replaces what is in the box (it waits as a choice).
  const textNow = useRef(text)
  textNow.current = text
  const transcribing = useRef(0)
  const request = useRef<AbortController | undefined>(undefined)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false; transcribing.current++; request.current?.abort() } }, [])
  const [offered, setOffered] = useState('')
  // A new recording makes the earlier one's pending transcript (and any waiting choice) out of date.
  const clipNow = useRef(clip)
  useEffect(() => {
    if (clipNow.current === clip) return
    clipNow.current = clip; transcribing.current++; request.current?.abort(); setOffered('')
    setBusy(b => b === '轉文字中……' ? '' : b)
  }, [clip])
  async function toText() {
    if (!clip || request.current || locked || recording) return
    const mine = ++transcribing.current, before = textNow.current, from = clip
    const controller = new AbortController()
    request.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 45_000)
    setBusy('轉文字中……'); setOffered('')
    try {
      const t = await transcribe(from, controller.signal)
      if (!alive.current || transcribing.current !== mine) return
      if (controller.signal.aborted) { setBusy('轉文字超過等候時間，可以再試一次。'); return }
      const land = transcriptLanding(before, textNow.current, t)
      if (land === 'fill' && !correctionBlocked(open.gradeKey)) { showDraft(t); writeDraft(draftKey, t) }
      else if (land !== 'none') setOffered(t)
      setBusy(land === 'none' ? '這段錄音沒有辨識出文字。可以再錄，或自己打下來。' : '')
    } catch (e) {
      if (alive.current && transcribing.current === mine) setBusy(controller.signal.aborted ? '轉文字超過等候時間，可以再試一次。' : e instanceof Error ? e.message : String(e))
    } finally {
      clearTimeout(timeout)
      if (request.current === controller) request.current = undefined
    }
  }
  function finish() {
    if (!ready() || !how || correctionBlocked(open.gradeKey) || recording || request.current || (how === 'typed' && !text.trim())) return
    const unmet = task.conditions.filter((_, i) => !met[i])
    void onNext((current, currentNotes) => {
      if (part === 'C' ? current.review?.speak : current.speak) throw new Error('這一題已有儲存的口說紀錄，未清除你的草稿。')
      const check = current.open?.[part + '-speak'] ?? { help: [] }
      const verdict = open.verdictFor(text, check, currentNotes)
      const textLevel = text.trim() ? judgeExpress({ answered: true, help: check.help, firstVerdict: verdict }) : null
      const level = how === 'typed' ? null : judgeSpeak({ said: true, transcript: text, help: check.help, firstVerdict: verdict })
      const feedback = readCorrection(currentNotes, open.gradeKey, text)
      const fixes = feedback?.answer === text.trim() ? feedback.result.fixes : []
      const record: SpeakRecord = { level, textLevel, mode: how, help: check.help, ...(verdict ? { firstVerdict: verdict } : {}), recorded: !!clip, goals: speakGoals(fixes, unmet) }
      return part === 'C' ? { review: { ...current.review, level: current.review?.level ?? null, speak: record } } : { speak: record }
    }, captureDraftCleanup(draftKey, text), true)
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
    <div className="pr-actions"><button type="button" className="pr-main" disabled={saving} onClick={() => void onNext()}>{part === 'C' ? '完成第 3 次' : '下一步：寫訊息'}</button></div>
  </section>
  return <section className="tl-speak">
    <div className="pr-label">說 · {part === 'C' ? '換個情境' : '用英文完成一件事'}</div>
    <h2 className="pr-question">{task.situation}</h2>
    {part === 'C' && <p className="tl-situation">{topic.review.situation}</p>}
    <div className="tl-conditions"><strong>要做到</strong><ul>{task.conditions.map(c => <li key={c}>{c}</li>)}</ul></div>
    {task.followUps?.length ? <p className="ls-help">對方可能接著問：<span lang="en">{task.followUps.join(' ／ ')}</span>（也試著回答）</p> : null}
    <p className="ls-help">先想 30 秒，再開口說。可以錄音聽自己，也可以直接說。</p>
    <Recorder disabled={locked || waitingForTranscript} onClip={setClip} onBusy={setRecording} />
    {clip && openaiKey() && <div className="pr-actions"><button type="button" className="pr-link" disabled={locked || waitingForTranscript || recording} onClick={toText}>把錄音轉成文字</button>{busy && <small role="status">{busy}</small>}</div>}
    <label className="pr-field">{openaiKey() ? '你剛剛說的（打下來，或錄音後按「把錄音轉成文字」）' : '你剛剛說的（照著打下來）'}
      <textarea lang="en" rows={4} value={text} spellCheck={false} autoComplete="off" readOnly={locked} placeholder="照你說的寫，不用先改好" onChange={e => { showDraft(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <DraftVersions id={draftKey} text={text} onChoose={showDraft} disabled={locked} />
    {offered && <section className="pr-reference" aria-live="polite"><small>錄音轉好的文字（你在等的時候改過框裡的字，所以沒有直接換掉）</small><p lang="en">{offered}</p>
      <div className="pr-actions"><button type="button" className="pr-link" disabled={locked} onClick={() => { showDraft(offered); writeDraft(draftKey, offered); setOffered('') }}>換成這段辨識結果</button>
        <button type="button" className="pr-link" onClick={() => setOffered('')}>不用，留我改的</button></div></section>}
    <div className="ls-helps" role="group" aria-label="卡住了再打開">
      <span>卡住了？</span>
      <button type="button" aria-pressed={open.check.help.includes('cue')} onClick={() => { if (ready()) open.addHelp('cue') }}>句型提示</button>
      <StuckButton onUse={() => open.addHelp('claude')} />
    </div>
    {open.check.help.includes('cue') && <p className="ls-help">{topic.grammar.title}：{topic.grammar.points[0]}</p>}
    {tutorKey() && <div className="pr-actions"><button type="button" className="pr-main" disabled={locked || !text.trim() || waitingForTranscript || recording} onClick={open.submit}>{open.graded ? '請 Claude 再批一次' : '請 Claude 照評分表看文字稿'}</button></div>}
    {open.grading && !open.run && <p role="status" className="ls-help">Claude 正在批改，回覆會留在這一題。</p>}
    <CorrectBox key={open.run ? 'grading' : open.graded?.id ?? 'ungraded'} run={open.run} mode="open" rubric="gept-speak-elementary" zh={'口說情境：' + task.situation + '。要做到：' + task.conditions.join('；') + '（這是說完後打下來的文字稿，不評發音）'}
      reference={task.sample} words={[topic.grammar.title]} answer={text} selfFix
      restore={!open.run && open.graded ? { ...open.graded, showFull: false } : undefined}
      backgroundGrade={{ id: open.gradeKey, save: open.saveGrade }}
      onReveal={() => open.addHelp('sample')}
      onSave={cards => updateStoreNow(prev => addSayCards(prev, cards, date, 'lesson'))} />
    <fieldset className="tl-selfcheck"><legend>說完後勾一下：我有做到</legend>
      {task.conditions.map((c, i) => <label key={c} className="tl-check"><input type="checkbox" checked={met[i]} onChange={e => setMet(met.map((m, j) => j === i ? e.target.checked : m))} />{c}</label>)}
    </fieldset>
    <a className="pr-link tl-emma" href={'#speaking/topic-' + topic.id + '-' + part}>改用說的：跟 Emma 練這個情境</a>
    <fieldset className="tl-selfcheck" role="radiogroup"><legend>你怎麼完成這題？</legend>
      {(['recorded', 'spoken', 'typed'] as const).map(m => <label key={m} className="tl-check">
        <input type="radio" name={'how-' + part} checked={how === m} disabled={m === 'recorded' && !clip} onChange={() => setMode(m)} />{modeChoice[m]}</label>)}
    </fieldset>
    <div className="pr-actions">
      <button type="button" className="pr-main" disabled={locked || waitingForTranscript || recording || !how || (how === 'typed' && !text.trim())} onClick={finish}>完成這題</button>
      <button type="button" className="pr-link" disabled={locked || waitingForTranscript || recording} onClick={() => {
        if (!ready() || recording || request.current || correctionBlocked(open.gradeKey)) return
        void onNext(current => {
          const record: SpeakRecord = { level: null, help: current.open?.[part + '-speak']?.help ?? [], goals: speakGoals([], task.conditions) }
          return part === 'C' ? { review: { ...current.review, level: current.review?.level ?? null, speak: record } } : { speak: record }
        })
      }}>先跳過</button>
    </div>
    {how === 'typed' && <p className="ls-help">只用打字的話，內容和文法照樣記，但不算口說。下次試著先說出來再打。</p>}
    {how && how !== 'typed' && !text.trim() && <p className="ls-help">沒有文字稿就沒辦法確認內容，這題會記成「自評完成・待確認」。打下來再請 Claude 看，才能確認。</p>}
    {!locked && text.trim() && !open.verdictFor(text) && <p className="ls-help">{open.check.firstVerdict === 'good' ? '你在 Claude 看過之後改了內容：改過的這一版還沒人確認，會記成「自評完成・待確認」。' : tutorKey() ? '沒請 Claude 看就完成，會記成「自評完成・待確認」。' : '還沒連接 Claude：對照條件自己檢查，會記成「自評完成・待確認」。'}</p>}
  </section>
}

/** A 3–5 sentence message; the frame, the model answer or asking Claude count as help. */
function WriteStep({ topic, rec, save, onNext, date, notes, saving }: StepProps) {
  const W = topic.write
  const draftKey = 'topic-write-' + topic.id
  const [text, setText] = useState(() => readDraft(draftKey))
  const open = useTopicGrade({ topic, rec, save, notes }, 'write', correctionKey('topic-write.' + topic.id), text)
  const { check } = open
  const locked = saving || open.blocked
  const ready = useReady()
  const n = countSentences(text)
  const enough = n >= W.minSentences
  const inRange = enough && n <= 5
  const [met, setMet] = useState<boolean[]>(() => W.conditions.map(() => false))
  function showDraft(value: string) {
    open.reset()
    setText(value)
    if (value.trim() !== text.trim()) setMet(W.conditions.map(() => false))
  }
  const firstSentence = W.sample.match(/^[^.?!]+[.?!]/)?.[0] ?? W.sample
  useTaskContext({
    label: '寫訊息：' + W.task,
    detail: ['寫一則 3–5 句的訊息：' + W.task, '要寫到：' + W.conditions.join('；'), '這個主題的句型：' + topic.grammar.title, '參考寫法（不要直接給他）：' + W.sample, '他要寫自己的內容；幫他想內容或句型就好，不要替他寫整段。'].join('\n'),
    draft: text,
    onHelp: () => open.addHelp('claude'),
  })
  return <section className="tl-write">
    <div className="pr-label">寫訊息 · {W.minSentences}–5 句</div>
    <h2 className="pr-question">{W.task}</h2>
    <div className="tl-conditions"><strong>要寫到</strong><ul>{W.conditions.map(c => <li key={c}>{c}</li>)}</ul></div>
    <label className="pr-field">我的訊息
      <textarea lang="en" rows={5} value={text} spellCheck={false} autoComplete="off" readOnly={locked} placeholder="寫你自己的內容" onChange={e => { showDraft(e.target.value); writeDraft(draftKey, e.target.value) }} />
    </label>
    <DraftVersions id={draftKey} text={text} onChoose={showDraft} disabled={locked} />
    <p className="tl-count" data-ok={inRange}>已寫 {n} 句{!enough ? '，要 ' + W.minSentences + '–5 句' : n > 5 ? '：訊息最多 5 句，挑最重要的留下' : ''}（只算長度，兩個字以上才算一句；文法和意思要另外檢查）</p>
    <div className="ls-helps" role="group" aria-label="需要幫忙時一層一層打開">
      <span>卡住了？一層一層打開：</span>
      <button type="button" aria-pressed={check.help.includes('cue')} onClick={() => { if (ready()) open.addHelp('cue') }}>① 用哪個句型</button>
      <button type="button" aria-pressed={check.help.includes('frame')} onClick={() => { if (ready()) open.addHelp('frame') }}>② 句架</button>
      <StuckButton onUse={() => open.addHelp('claude')} />
    </div>
    {check.help.includes('cue') && <p className="ls-help">{topic.grammar.title}：{topic.grammar.points.join(' ')}</p>}
    {check.help.includes('frame') && <p className="pr-frame" lang="en">{sentenceFrame(firstSentence)}</p>}
    {tutorKey() && <div className="pr-actions"><button type="button" className="pr-main" disabled={locked || !text.trim()} onClick={open.submit}>{open.graded ? '請 Claude 再批一次' : '請 Claude 批改'}</button></div>}
    {open.grading && !open.run && <p role="status" className="ls-help">Claude 正在批改，回覆會留在這一題。</p>}
    <CorrectBox key={open.run ? 'grading' : open.graded?.id ?? 'ungraded'} run={open.run} mode="open" rubric="gept-paragraph" zh={W.task + '（要寫到：' + W.conditions.join('；') + '）'} reference={W.sample} words={[topic.grammar.title]} answer={text} selfFix
      restore={!open.run && open.graded ? { ...open.graded, showFull: false } : undefined} backgroundGrade={{ id: open.gradeKey, save: open.saveGrade }}
      onReveal={() => open.addHelp('sample')}
      onSave={cards => updateStoreNow(prev => addSayCards(prev, cards, date, 'lesson'))} />
    <fieldset className="tl-selfcheck"><legend>寫完勾一下：我有寫到</legend>
      {W.conditions.map((c, i) => <label key={c} className="tl-check"><input type="checkbox" checked={met[i]} disabled={saving} onChange={e => setMet(met.map((m, j) => j === i ? e.target.checked : m))} />{c}</label>)}
    </fieldset>
    <div className="pr-actions">
      <button type="button" className="pr-main" disabled={locked || !inRange} onClick={() => {
        if (correctionBlocked(open.gradeKey) || !ready()) return
        void onNext((current, currentNotes) => {
          const latest = current.open?.write ?? { help: [] }
          const verdict = open.verdictFor(text, latest, currentNotes)
          return { write: { level: judgeExpress({ answered: true, help: latest.help, firstVerdict: verdict }), sentences: n,
            answer: text.trim(), covered: met.filter(Boolean).length, help: latest.help, ...(verdict ? { firstVerdict: verdict } : {}) } }
        }, captureDraftCleanup(draftKey, text))
      }}>完成第 2 次</button>
      <button type="button" className="pr-link" disabled={locked} onClick={() => {
        if (correctionBlocked(open.gradeKey) || !ready()) return
        void onNext(current => ({ write: { level: null, sentences: n, help: current.open?.write?.help ?? [] } }))
      }}>先跳過</button>
    </div>
    {!locked && inRange && !open.verdictFor(text) && <p className="ls-help">{check.firstVerdict === 'good' ? '你在 Claude 批改之後改了內容：改過的這一版還沒人確認，會記成「自評完成・待確認」。' : tutorKey() ? '沒請 Claude 批改就完成，會記成「自評完成・待確認」。' : '還沒連接 Claude：對照「要寫到」自己檢查，會記成「自評完成・待確認」。'}</p>}
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
    {part === 'B' && rec.write?.answer && <details className="pr-tools">
      <summary>看我交出的訊息</summary>
      <p className="tu-corrected" lang="en">{rec.write.answer}</p>
    </details>}
    {goals?.length ? <div className="tl-goals"><strong>下次說的時候</strong><ol>{goals.map(g => <li key={g}>{g}</li>)}</ol></div> : null}
    <p className={'ls-goal' + (stable ? ' tl-stable' : '')}><small>接下來</small>{nextLine}</p>
    <div className="pr-actions">
      <button type="button" className="pr-main" onClick={() => navigate('today')}>回今天</button>
      <button type="button" className="pr-link" onClick={() => { location.hash = 'history' }}>看紀錄</button>
    </div>
  </section>
}

import { useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Camera, Check, Mic, Square, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import data from '../data/gept-speaking.json'
import { geptLevelsOpen, geptPass, geptRoundDone, readSeconds, speakRubric, answerSeconds, geptFeedbackComplete, geptLevels, parseGeptFeedback, parsePhotoQuestions, photoQuestionsComplete, photoQuestionsPrompt, picturePrompt, questionsPrompt, readGept, saveGept, type GeptElementarySet, type GeptFeedback, type GeptIntermediateSet, type GeptLevel, type GeptPart, type GeptPicture, type GeptRecord, repeatCounts, geptMistakeId, newGeptAttempt } from '../lib/gept'
import { engineNames, listen, listenEngine, type Listening } from '../lib/speech'
import { speakEnglish, speakEnglishTwice } from '../lib/tts'
import { AudioActivityContext, useAudioActivity } from '../lib/audioActivity'
import { askTutor, askTutorImage, tutorKey } from '../lib/tutor'
import { addSayCard, sayIdentity } from '../lib/sayCards'
import { addWeak, normalizeLabel, refreshWeakExample } from '../lib/weakPoints'
import { logSkill } from '../lib/bridge'
import { dayKey } from '../lib/progress'
import ReadAloudCheck from './ReadAloudCheck'
import { readingPieceRatios } from '../lib/readAloud'
import { RubricTable } from './RubricTable'
import { LockLine } from './Locked'
import { levelText, rubrics, type RubricId } from '../lib/rubrics'
import GeptScene from './GeptScene'
import './gept.css'

const elementary = data.elementary as GeptElementarySet[]
const intermediate = data.intermediate as GeptIntermediateSet[]
const elementaryIds = elementary.map(set => set.id)
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const levels: GeptLevel[] = ['elementary', 'intermediate']
type Grading = { feedback: GeptFeedback } & ({ attempt: string } | { recordings: (Recording | undefined)[] })
type Save = (patch: GeptRecord, grading?: Grading) => void
type SaveScore = (score?: number, grading?: Grading) => void
type SaveQuestions = (score?: number, grading?: Grading, listenedOnly?: boolean) => void

function mistakeRecording(grading: Grading, card: GeptFeedback['cards'][number]) {
  if ('attempt' in grading) return grading.attempt
  const fragment = sayIdentity(card.wrong)
  if (!fragment) return undefined
  const matches = (recording?: Recording) =>
    !!recording && (' ' + sayIdentity(recording.text) + ' ').includes(' ' + fragment + ' ')
  const cited = card.question === undefined ? undefined : grading.recordings[card.question - 1]
  if (cited && matches(cited)) return cited.id
  const found = grading.recordings.filter(matches)
  return found.length === 1 ? found[0]?.id : undefined
}

/** 全民英檢口說練習: the parts of the test one by one, with honest checks (see lib/gept.ts). */
export default function GeptSpeaking({ state, update }: PageProps) {
  // 中級 opens once a 初級 round's 回答問題 reached 4 級分 (the official pass level); until then it stays locked.
  const levelOpen = geptLevelsOpen(state.notes, elementaryIds)
  const setsOf = (l: GeptLevel): { id: string }[] => l === 'elementary' ? elementary : intermediate
  // The first set not practised yet, chosen once: finishing a part must not switch the page to the next set.
  const firstOpen = (l: GeptLevel) => (setsOf(l).find(s => !readGept(state.notes, l, s.id).d) ?? setsOf(l)[0]).id
  const [selection, setSelection] = useState(() => {
    const level: GeptLevel = state.curriculum.unit > 28 && levelOpen.intermediate ? 'intermediate' : 'elementary'
    return { level, setId: firstOpen(level) }
  })
  // Parts stay open once started, so a result is still there after moving on to the next part.
  const [open, setOpen] = useState<GeptPart[]>([])
  const level: GeptLevel = levelOpen[selection.level] ? selection.level : 'elementary'
  const sets = setsOf(level)
  const setId = selection.level === level && sets.some(s => s.id === selection.setId) ? selection.setId : firstOpen(level)
  // A backup can lock the previous level. Adopt a valid set and close its old controls together.
  if (selection.level !== level || selection.setId !== setId) {
    setSelection({ level, setId })
    setOpen([])
  }
  const audio = useAudioActivity()
  const info = geptLevels[level]
  const engine = listenEngine()
  const rate = state.settings.speechRate
  const tabsId = useId()
  const record = readGept(state.notes, level, setId)
  const today = dayKey()

  function chooseLevel(next: GeptLevel) {
    if (level === next || !levelOpen[next]) return
    setSelection({ level: next, setId: firstOpen(next) })
    setOpen([])
  }

  const save: Save = (patch, grading) => update(prev => {
    if (level === 'intermediate' && !geptLevelsOpen(prev.notes, elementaryIds).intermediate) return prev
    let next = prev
    const known = new Set(readGept(prev.notes, level, setId).weakMarks ?? [])
    const added: string[] = []
    // Each correction goes into review by itself and onto the weak-point list.
    for (const [i, c] of (grading?.feedback.cards ?? []).entries()) {
      const tag = c.tag ? normalizeLabel(c.tag) : null
      next = addSayCard(next, { zh: c.zh, en: c.en, wrong: c.wrong, why: c.why, from: 'gept', ...(tag ? { tag } : {}) }, today, 'g' + i)
      if (!tag || !grading) continue
      const source = mistakeRecording(grading, c)
      if (!source) continue
      const mark = geptMistakeId(source, c.wrong)
      const example = { w: c.wrong, r: c.en }
      if (known.has(mark)) {
        next = { ...next, notes: refreshWeakExample(next.notes, tag, example, 'gept') }
      } else {
        next = { ...next, notes: addWeak(next.notes, tag, today, example, 'gept', mark) }
        known.add(mark)
        added.push(mark)
      }
    }
    const notes = saveGept(next.notes, level, setId, { ...patch, d: today, ...(added.length ? { weakMarks: added } : {}) })
    return { ...next, notes: logSkill(notes, 'speak', today) }
  })

  const el = level === 'elementary' ? elementary.find(s => s.id === setId) ?? elementary[0] : null
  const mid = level === 'intermediate' ? intermediate.find(s => s.id === setId) ?? intermediate[0] : null
  return <AudioActivityContext.Provider value={audio}><div className="gp-page">
    <section className="gp-head">
      <a className="gp-back" href="#speaking">← 回到 Emma</a>
      <h1>全民英檢口說練習</h1>
      <div className="gp-tabs" role="tablist" aria-label="級數">
        {levels.map(l => <button key={l} id={tabsId + '-' + l} type="button" role="tab" aria-selected={level === l}
          aria-controls={tabsId + '-panel-' + l} tabIndex={level === l ? 0 : -1} disabled={!levelOpen[l]} data-locked={!levelOpen[l]}
          onClick={() => chooseLevel(l)}
          onKeyDown={e => {
            const available = levels.filter(x => levelOpen[x])
            let next: GeptLevel
            if (e.key === 'Home') next = available[0]
            else if (e.key === 'End') next = available[available.length - 1]
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              const offset = e.key === 'ArrowLeft' ? -1 : 1
              next = available[(available.indexOf(l) + offset + available.length) % available.length]
            } else return
            e.preventDefault()
            chooseLevel(next)
            document.getElementById(tabsId + '-' + next)?.focus()
          }}>{geptLevels[l].name}{levelOpen[l] ? <small>{geptLevels[l].cefr}</small> : <LockLine text={'初級回答問題只聽題拿到 ' + geptPass + ' 級分才打開'} />}</button>)}
      </div>
    </section>
    {levels.map(l => <div key={l} id={tabsId + '-panel-' + l} role="tabpanel" aria-labelledby={tabsId + '-' + l}
      hidden={level !== l} className="gp-panel">{level === l && <><section className="gp-head">
      <div className="gp-sets" role="group" aria-label="題組">
        {sets.map((s, i) => {
          const rec = readGept(state.notes, level, s.id)
          return <button key={s.id} type="button" aria-pressed={s.id === setId} onClick={() => { setSelection({ level, setId: s.id }); setOpen([]) }}>
            {/* ✓ only when every part of the round was done (each read-aloud piece, the repeated sentences); one part started is said as such. */}
            第 {i + 1} 回{geptRoundDone(rec, level, level === 'elementary' ? elementary.find(e => e.id === s.id) ?? {} : {}, level === 'elementary' ? 2 : intermediate.find(m => m.id === s.id)?.passages.length ?? 2) ? ' ✓' : rec.d ? <small>做過一部分</small> : ''}{rec.q !== undefined ? <small>問答 {rec.q}</small> : null}
          </button>
        })}
      </div>
      <p className="gp-small">{info.name}口說有 {info.parts.length} 部分：{info.parts.map(p => p.name).join('、')}，全部約 {info.minutes} 分鐘，滿分 5 級分、4 級分通過。格式照 LTTC 公布的資料整理，題數和時間以報名時的官方說明為準。</p>
      <p className="gp-honest">分數怎麼來的：朗讀和複誦只比對語音辨識聽出哪些字；回答問題和看圖敘述由 Claude 看辨識出來的文字，給「內容和語言」的參考分。官方還會評發音和語調，這裡聽不到，所以都<b>不是官方分數</b>，當作練習的方向就好。</p>
      {!engine && <p className="gp-warn">這台裝置不能做語音辨識：到 Emma 那頁的設定填 OpenAI 金鑰，或改用 Chrome、Safari 開。</p>}
      {engine && <p className="gp-small">語音辨識：{engineNames[engine]}{tutorKey() ? '' : '。還沒連接 Claude，所以只會有逐字稿、沒有參考分（設定 → 連接 Claude）。'}</p>}
    </section>

    {audio.busy && <p className="gp-small" role="status">語音練習進行中，請等播放或收音結束後再使用其他部分的音訊。</p>}
    {info.parts.map(p => <section key={level + ':' + setId + ':' + p.part} className="gp-part" aria-label={p.name}>
      <header><h2>{p.name}</h2><small>{p.how}</small></header>
      {!open.includes(p.part) ? <button type="button" className="gp-open" disabled={!engine} onClick={() => setOpen(o => [...o, p.part])}>開始這一部分</button>
        : p.part === 'repeat' && el ? <RepeatPart key={setId} sentences={el.repeat} rate={rate}
            ids={record.rrIds ?? []} legacyCount={record.rr ?? 0}
            onRepeated={id => { if (!record.rrIds?.includes(id)) save({ rrIds: [id] }) }} />
        : p.part === 'read' ? <ReadPart key={setId} texts={el ? [el.readSentences.join(' '), el.readPassage] : mid!.passages} lists={el ? [el.readSentences] : []} level={level} rate={rate}
            onRead={(whole, pieces) => save({ r: Math.round(whole * 100), rp: pieces.map(x => Math.round(x * 100)) })} />
        : p.part === 'questions' ? <QuestionsPart key={setId} level={level} questions={(el ?? mid)!.questions} rate={rate}
            onScore={(score, fb, listenedOnly) => save(score !== undefined ? { q: score, listeningBest: listenedOnly ? score : null } : {}, fb)} />
        : p.part === 'picture' && mid ? <PicturePart key={setId} picture={mid.picture} rate={rate} onScore={(score, fb) => save({ ...(score !== undefined ? { p: score } : {}) }, fb)} />
        : null}
    </section>)}</>}</div>)}
  </div></AudioActivityContext.Provider>
}

/** 複誦: record each recognised sentence once and retain older totals without guessing the sentence IDs. */
function RepeatPart({ sentences, rate, ids, legacyCount, onRepeated }: {
  sentences: string[]; rate: number; ids: number[]; legacyCount: number; onRepeated: (id: number) => void
}) {
  const allDone = Math.max(legacyCount, ids.length) >= sentences.length
  return <>
    <p className="gp-small">已完成 {Math.max(legacyCount, ids.length)} / {sentences.length} 句。</p>
    {legacyCount > ids.length && !allDone && <p className="gp-small">舊紀錄只保留句數。現在會逐句記錄，勾號會標在可確認的句子旁。</p>}
    <ol className="gp-list">{sentences.map((text, id) => <RepeatItem key={id} n={id + 1} text={text} rate={rate}
      done={allDone || ids.includes(id)} onSaid={() => onRepeated(id)} />)}</ol>
  </>
}
function RepeatItem({ n, text, rate, done, onSaid }: { n: number; text: string; rate: number; done: boolean; onSaid: () => void }) {
  const [played, setPlayed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const signal = useSectionSignal()
  const audio = useContext(AudioActivityContext)
  async function play() {
    const release = audio?.acquire(signal)
    if (audio && !release) return
    setPlaying(true); setError('')
    try {
      const finished = await speakEnglishTwice(text, rate, 700, signal)
      if (signal.aborted) return
      if (finished === 'played') setPlayed(true)
      else setError(playbackMessage(finished))
    } finally {
      release?.()
      if (!signal.aborted) setPlaying(false)
    }
  }
  return <li>
    <div className="gp-row">
      <button type="button" className="gp-play" disabled={playing || audio?.busy} onClick={() => void play()}><Volume2 size={14} />{playing ? '播放中……' : played ? '第 ' + n + ' 句：再聽兩次' : '第 ' + n + ' 句：聽兩次'}</button>
      {done && <span className="gp-done"><Check size={14} aria-hidden="true" />這句完成了</span>}
    </div>
    {error && <p className="gp-warn" role="alert">{error}</p>}
    {played && <ReadAloudCheck text={text} rate={rate} maxMs={15000} hideText compact onResult={r => { if (repeatCounts(r)) onSaid() }} />}
  </li>
}

/** 朗讀 as the test runs it: every piece of the part on screen together (初級 the five sentences and the passage, 中級
 *  both passages), one silent minute for all of them, then one time to read them all aloud (初級 1 minute, 中級 2
 *  minutes), not a minute and two minutes for each. Reading piece by piece without the clock is a practice mode of its
 *  own and is not kept as the round's result. Afterwards: which words came through, for the whole part and each piece. */
function ReadPart({ texts, lists, level, rate, onRead }: { texts: string[]; lists: string[][]; level: GeptLevel; rate: number; onRead: (whole: number, pieces: number[]) => void }) {
  const time = readSeconds[level]
  const [mode, setMode] = useState<'test' | 'practice'>('test')
  const [phase, setPhase] = useState<'ready' | 'silent' | 'aloud'>('ready')
  const [left, setLeft] = useState(time.silent)
  useEffect(() => {
    if (phase !== 'silent') return
    const end = Date.now() + time.silent * 1000
    const t = setInterval(() => { const s = Math.ceil((end - Date.now()) / 1000); setLeft(Math.max(0, s)); if (s <= 0) setPhase('aloud') }, 250)
    return () => clearInterval(t)
  }, [phase, time.silent])
  const titles = texts.map((_, i) => level === 'elementary' ? (lists[i] ? '五個句子' : '短文') : '短文 ' + (i + 1))
  const piece = (t: string, i: number) => <section key={t} className="gp-read-piece">
    <strong>{titles[i]}</strong>
    {lists[i] ? <ol className="gp-sentences" lang="en">{lists[i].map(s => <li key={s}>{s}</li>)}</ol> : <p className="gp-passage" lang="en">{t}</p>}
  </section>
  const minutes = (sec: number) => sec % 60 ? sec + ' 秒' : sec / 60 + ' 分鐘'
  if (mode === 'practice') return <div className="gp-read">
    <p className="gp-small">分段練習：一段一段念，不計時，不算這一回的成績。<button type="button" className="gp-link" onClick={() => setMode('test')}>回到照考試時間</button></p>
    <ol className="gp-list">{texts.map((t, i) => <li key={t} className="gp-read">{piece(t, i)}<ReadAloudCheck text={t} rate={rate} maxMs={120000} /></li>)}</ol>
  </div>
  return <div className="gp-read">
    {phase === 'ready' && <div className="gp-row">
      <button type="button" className="gp-play" onClick={() => setPhase('silent')}>開始默讀 {minutes(time.silent)}</button>
      <button type="button" className="gp-link" onClick={() => setPhase('aloud')}>直接開始念</button>
      <button type="button" className="gp-link" onClick={() => setMode('practice')}>分段練習（不計時）</button>
    </div>}
    {phase !== 'ready' && <>
      {texts.map(piece)}
      {phase === 'silent' && <div className="gp-row"><span className="gp-timer">默讀還有 {left} 秒（全部一起）</span><button type="button" className="gp-link" onClick={() => setPhase('aloud')}>準備好了</button></div>}
      <button type="button" className="gp-link" onClick={() => { setLeft(time.silent); setPhase('ready') }}>{phase === 'silent' ? '先不要，回到開始前' : '從默讀重新來一次'}</button>
      {phase === 'aloud' && <>
        <p className="gp-small">{level === 'elementary' ? '句子和短文' : '兩篇短文'}要在 {minutes(time.aloud)}內一起念完，時間到會自己停。</p>
        <ReadAloudCheck text={texts.join(' ')} rate={rate} maxMs={time.aloud * 1000} onResult={r => onRead(r.ratio, readingPieceRatios(texts, r))} />
      </>}
    </>}
  </div>
}

/** Ending a part cancels only its own playback, microphone and pending request. */
function useSectionSignal() {
  const [leaving] = useState(() => new AbortController())
  useLayoutEffect(() => () => leaving.abort(), [leaving])
  return leaving.signal
}

type Recording = { id: string; text: string }
type Answer = ({ kind: 'recorded'; sawText: boolean } & Recording) | { kind: 'failed' | 'silent' }
const hasTranscript = (text: string) => /[\p{L}\p{N}]/u.test(text)
const playbackMessage = (result: 'failed' | 'aborted') => result === 'failed' ? '這台裝置沒有播完，請再試一次。' : '播放中斷了，請再試一次。'
function answerText(answer: Answer | undefined) {
  if (!answer) return '（尚未回答）'
  if (answer.kind === 'failed') return '（這次沒有完成語音辨識）'
  return answer.kind === 'recorded' ? answer.text : '（沒有辨識到可批改的文字）'
}

/** 回答問題: ten questions (中級) or seven (初級), one after another; Claude scores them together at the end. */
function QuestionsPart({ level, questions, rate, onScore }: { level: GeptLevel; questions: string[]; rate: number; onScore: SaveQuestions }) {
  const [at, setAt] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'playing' | 'playback-failed' | 'opening-mic' | 'answering' | 'working' | 'between' | 'scoring' | 'done'>('ready')
  const [answers, setAnswers] = useState<(Answer | undefined)[]>([])
  const [show, setShow] = useState(false)
  const [textPractice, setTextPractice] = useState(false)
  const [left, setLeft] = useState(0)
  const [error, setError] = useState('')
  const [fb, setFb] = useState<GeptFeedback | null>(null)
  const session = useRef<Listening | null>(null)
  const asking = useRef(false)
  const scoring = useRef(false)
  const revealed = useRef(new Set<number>())
  const signal = useSectionSignal()
  const audio = useContext(AudioActivityContext)

  function remember(k: number, answer: Answer) {
    setAnswers(previous => {
      if (answer.kind !== 'recorded' && previous[k]?.kind === 'recorded') return previous
      const next = [...previous]
      next[k] = answer
      return next
    })
  }

  async function ask(k: number, readQuestion = false) {
    if (asking.current || scoring.current || signal.aborted) return
    const release = audio?.acquire(signal)
    if (audio && !release) return
    asking.current = true
    if (readQuestion) revealed.current.add(k)
    setAt(k); setError(''); setShow(readQuestion); setTextPractice(readQuestion)
    const secs = answerSeconds(level, k)
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      if (!readQuestion) {
        setPhase('playing')
        const played = await speakEnglishTwice(questions[k], rate, 900, signal)
        if (signal.aborted) return
        if (played !== 'played') {
          setError(playbackMessage(played))
          setPhase('playback-failed')
          return
        }
      }
      setPhase('opening-mic')
      const s = await listen({ maxMs: secs * 1000, signal })
      if (signal.aborted) return
      if (release) void s.captured.then(release)
      session.current = s
      const end = Date.now() + secs * 1000
      setLeft(secs); setPhase('answering')
      timer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000))
        setLeft(remaining)
        if (!remaining) {
          clearInterval(timer)
          setPhase('working')
        }
      }, 250)
      const text = (await s.done).trim()
      if (signal.aborted) return
      remember(k, hasTranscript(text) ? { kind: 'recorded', text, id: newGeptAttempt(), sawText: revealed.current.has(k) } : { kind: 'silent' })
      revealed.current.add(k) // The review screen displays the prompt after the recording.
      setPhase('between')
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      remember(k, { kind: 'failed' })
      revealed.current.add(k)
      setPhase('between')
    } finally { clearInterval(timer); session.current = null; asking.current = false; release?.() }
  }
  /** Back (or forward) to a question already answered, without asking it again: its answer shows, to keep or answer
   *  again. The set is scored once, when he asks for the result. */
  function view(k: number) {
    revealed.current.add(k)
    setAt(k); setError(''); setShow(true); setTextPractice(false); setPhase('between')
  }
  const answeredAll = questions.every((_, j) => answers[j] && answers[j]?.kind !== 'failed')
  const anySpoken = answers.some(a => a?.kind === 'recorded' && hasTranscript(a.text))
  const listenedOnly = !answers.some(a => a?.kind === 'recorded' && a.sawText)
  function showResults() {
    questions.forEach((_, i) => revealed.current.add(i))
    setPhase('done')
  }
  async function score() {
    if (scoring.current || asking.current || signal.aborted) return
    setError('')
    setFb(null)
    if (!tutorKey() || !anySpoken) {
      if (anySpoken) onScore(undefined)
      showResults()
      return
    }
    scoring.current = true
    setPhase('scoring')
    try {
      const sent = questions.map((q, j) => (j + 1) + '. 題目：' + q + '\n他說：' + answerText(answers[j])).join('\n')
      const result = parseGeptFeedback(await askTutor(questionsPrompt(level), [{ role: 'user', content: sent }], signal), true)
      if (signal.aborted) return
      // Only a complete check is scored (and can open 中級); otherwise his answers stay and the same ones can go again.
      if (geptFeedbackComplete(result, questions.length)) {
        const recordings = questions.map((_, j) => {
          const answer = answers[j]
          return answer?.kind === 'recorded' ? answer : undefined
        })
        setFb(result); onScore(result.score, { recordings, feedback: result }, listenedOnly)
      }
      else { setFb(null); setError(incomplete); onScore(undefined) }
    } catch (e) {
      if (!signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
        onScore(undefined)
      }
    } finally {
      scoring.current = false
      if (!signal.aborted) showResults()
    }
  }

  const secs = answerSeconds(level, at)
  const answer = answers[at]
  return <div className="gp-run">
    {phase === 'ready' && <>
      <p className="gp-small">按開始後，每題會念兩次（題目不會出現），念完就開始計時回答：{level === 'intermediate' ? '第 1–5 題 15 秒、第 6–10 題 30 秒' : '每題 15 秒'}。可以提早按「說完了」。</p>
      <button type="button" className="gp-open" disabled={audio?.busy} onClick={() => void ask(0)}><Mic size={15} />開始第 1 題</button>
    </>}
    {phase !== 'ready' && phase !== 'done' && phase !== 'scoring' && <div className="gp-q">
      <small>第 {at + 1} / {questions.length} 題 · {textPractice ? '文字練習 · ' : ''}回答時間 {secs} 秒</small>
      {phase === 'playing' && <p className="gp-live">題目播放中（念兩次）……</p>}
      {phase === 'opening-mic' && <p className="gp-live">等待麥克風……</p>}
      {phase === 'answering' && <div className="gp-row"><span className="gp-timer big">{left}</span><span className="gp-live">請回答</span>
        <button type="button" className="gp-stop" onClick={() => { setPhase('working'); session.current?.stop() }}><Square size={12} fill="currentColor" />說完了</button></div>}
      {phase === 'working' && <p className="gp-live">整理你的回答……</p>}
      {phase === 'playback-failed' ? <>
        <p className="gp-warn" role="alert">{error}</p>
        <div className="gp-row">
          <button type="button" className="gp-open" disabled={audio?.busy} onClick={() => void ask(at)}>重播這一題</button>
          <button type="button" className="gp-link" disabled={audio?.busy} onClick={() => void ask(at, true)}>改用文字練習</button>
          {at > 0 && <button type="button" className="gp-link" onClick={() => view(at - 1)}>上一題（第 {at} 題）</button>}
        </div>
      </> : show || phase === 'between' ? <p className="gp-qtext" lang="en">{questions[at]}</p>
        : phase !== 'working' && <button type="button" className="gp-link" onClick={() => { revealed.current.add(at); setShow(true); setTextPractice(true) }}>聽不懂，看題目文字（這題算文字練習）</button>}
      {phase === 'between' && <>
        <p className="gp-said"><small>你說的（語音辨識）：</small><span lang={answer?.kind === 'recorded' && answer.text ? 'en' : undefined}>{answerText(answer)}</span></p>
        {error && <p className="gp-warn" role="alert">{error}</p>}
        <div className="gp-row">
          {at + 1 < questions.length
            ? answers[at + 1] !== undefined
              ? <button type="button" className="gp-open" onClick={() => view(at + 1)}>查看下一題（第 {at + 2} 題）</button>
              : <button type="button" className="gp-open" disabled={audio?.busy} onClick={() => void ask(at + 1)}>下一題（第 {at + 2} 題）</button>
            : <button type="button" className="gp-open" onClick={() => void score()}>看結果</button>}
          {answeredAll && at + 1 < questions.length && <button type="button" className="gp-link" onClick={() => void score()}>都答完了，看結果</button>}
          {at > 0 && <button type="button" className="gp-link" onClick={() => view(at - 1)}>上一題（第 {at} 題）</button>}
          <button type="button" className={at + 1 < questions.length ? 'gp-link' : 'gp-link gp-retry'} disabled={audio?.busy} onClick={() => void ask(at, textPractice)}>這題重答</button>
        </div>
      </>}
    </div>}
    {phase === 'scoring' && <p className="gp-live">Claude 在看你的回答……</p>}
    {phase === 'done' && <>
      {error && <p className="gp-warn" role="alert">{error}</p>}
      {fb ? <FeedbackView fb={fb} items={questions} answers={answers} rubric={speakRubric[level]} /> : <Transcripts items={questions} answers={answers} />}
      {!anySpoken && <p className="gp-small">這回沒有辨識到可批改的回答，可以回題目重錄。</p>}
      {level === 'elementary' && !listenedOnly && <p className="gp-small">這回有回答是在看過題目文字後錄的，參考分只用於練習。可以從第 1 題重做，回答前只聽題來取得中級解鎖分數。</p>}
      {!fb && anySpoken && tutorKey() && <button type="button" className="gp-open" onClick={() => void score()}>用同樣的回答，請 Claude 再批一次</button>}
      <div className="gp-row">
        <button type="button" className="gp-link" onClick={() => view(0)}>回去看每一題、改答案（改完再看一次結果）</button>
        <button type="button" className="gp-link" onClick={() => { revealed.current.clear(); setAnswers([]); setFb(null); setPhase('ready') }}>整個部分重做一次</button>
      </div>
    </>}
  </div>
}

/** 看圖敘述 (中級): 30 seconds with the picture and the questions, then a minute and a half. */
function PicturePart({ picture, rate, onScore }: { picture: GeptPicture; rate: number; onScore: SaveScore }) {
  const [photo, setPhoto] = useState<{ url: string; media: string; data: string } | null>(null)
  const [custom, setCustom] = useState<{ questions: string[]; describe: string } | null>(null)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'prep' | 'talking' | 'working' | 'scoring' | 'done'>('ready')
  const [left, setLeft] = useState(30)
  const [said, setSaid] = useState<Recording | null>(null)
  const [error, setError] = useState('')
  const [fb, setFb] = useState<GeptFeedback | null>(null)
  const session = useRef<Listening | null>(null)
  const scoring = useRef(false)
  const signal = useSectionSignal()
  const audio = useContext(AudioActivityContext)
  const file = useRef<HTMLInputElement>(null)
  const zoom = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const skip = useRef(false)
  const questions = custom?.questions.length ? custom.questions : picture.questions
  const describe = custom?.describe || picture.describe
  const pictureImage = () => photo ? <img src={photo.url} alt="你選的照片" /> : <GeptScene id={picture.scene} />

  async function pickPhoto(f: File) {
    setError(''); setPhase('loading')
    try {
      const shot = await shrink(f)
      if (signal.aborted) return
      const text = await askTutorImage('你是英文老師，幫台灣學生準備全民英檢中級口說。', photoQuestionsPrompt, { media: shot.media, data: shot.data }, signal)
      const got = parsePhotoQuestions(text)
      if (!photoQuestionsComplete(got)) throw new Error('Claude 這次沒有把提示問題和照片描述都寫好，先用原來的圖；可以再選一次照片。')
      if (signal.aborted) return
      setPhoto(shot); setCustom(got); setPhase('ready')
    } catch (e) {
      if (signal.aborted) return
      setError(e instanceof Error ? e.message : String(e)); setPhase('ready')
    }
  }
  async function begin() {
    if (signal.aborted) return
    const release = audio?.acquire(signal)
    if (audio && !release) return
    setError(''); setSaid(null); setFb(null); setPhase('prep'); skip.current = false
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      for (let s = 30; s > 0 && !skip.current; s--) { if (signal.aborted) return; setLeft(s); await wait(1000) }
      if (signal.aborted) return
      const s = await listen({ maxMs: 90000, signal })
      if (signal.aborted) return
      if (release) void s.captured.then(release)
      session.current = s
      const end = Date.now() + 90000
      setLeft(90); setPhase('talking')
      timer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000))
        setLeft(remaining)
        if (!remaining) {
          clearInterval(timer)
          setPhase('working')
        }
      }, 250)
      const text = (await s.done).trim()
      clearInterval(timer)
      session.current = null
      if (signal.aborted) return
      if (!hasTranscript(text)) {
        setPhase('done')
        return
      }
      const recording = { id: newGeptAttempt(), text }
      setSaid(recording)
      if (!tutorKey()) { setPhase('done'); onScore(undefined); return }
      await grade(recording)
    } catch (e) { if (!signal.aborted) { setError(e instanceof Error ? e.message : String(e)); setPhase('done') } }
    finally { clearInterval(timer); session.current = null; release?.() }
  }
  /** Claude grades what he said against the same picture he looked at: his own photo goes along with its description. */
  async function grade(recording: Recording) {
    if (scoring.current || signal.aborted || !hasTranscript(recording.text) || !tutorKey()) return
    scoring.current = true
    setError(''); setPhase('scoring')
    try {
      const system = picturePrompt({ describe, questions }), said = '他說：' + recording.text
      const reply = photo ? await askTutorImage(system, said + '\n（附上的照片就是他看的那一張）', { media: photo.media, data: photo.data }, signal) : await askTutor(system, [{ role: 'user', content: said }], signal)
      const result = parseGeptFeedback(reply)
      if (signal.aborted) return
      if (geptFeedbackComplete(result, questions.length)) { setFb(result); onScore(result.score, { attempt: recording.id, feedback: result }) }
      else { setFb(null); setError(incomplete); onScore(undefined) }
    } catch (e) { if (!signal.aborted) setError(e instanceof Error ? e.message : String(e)) }
    finally {
      scoring.current = false
      if (!signal.aborted) setPhase('done')
    }
  }
  async function playSample() {
    const release = audio?.acquire(signal)
    if (audio && !release) return
    try { await speakEnglish(describe, rate, signal) }
    finally { release?.() }
  }

  return <div className="gp-run">
    <button ref={zoom} type="button" className="gp-picture" onClick={() => dialog.current?.showModal()}
      aria-label={'放大圖片：' + (photo ? '你選的照片' : picture.title)} aria-haspopup="dialog">
      {pictureImage()}
      <span>放大圖片</span>
    </button>
    <dialog ref={dialog} className="gp-picture-dialog" aria-label="放大圖片" onClose={() => zoom.current?.focus()}>
      <div>
        <button type="button" className="gp-link" autoFocus onClick={() => dialog.current?.close()}>關閉放大圖片</button>
        {pictureImage()}
      </div>
    </dialog>
    <ol className="gp-sentences" lang="en">{questions.map(q => <li key={q}>{q}</li>)}</ol>
    {phase === 'ready' && <div className="gp-row">
      <button type="button" className="gp-open" disabled={audio?.busy} onClick={() => void begin()}>開始：先看 30 秒</button>
      {tutorKey() && <button type="button" className="gp-link" onClick={() => file.current?.click()}><Camera size={14} />換成我自己的照片</button>}
      <input ref={file} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickPhoto(f) }} />
    </div>}
    {phase === 'ready' && photo && <p className="gp-small">照片只傳給 Claude 看、出提示問題和評分，不會存起來。<button type="button" className="gp-link" onClick={() => { setPhoto(null); setCustom(null) }}>改回內建的圖</button></p>}
    {phase === 'loading' && <p className="gp-live">Claude 在看你的照片、出提示問題……</p>}
    {phase === 'prep' && <div className="gp-row"><span className="gp-timer big">{left}</span><span className="gp-live">看圖和問題，想想要說什麼</span>
      <button type="button" className="gp-link" onClick={() => { skip.current = true }}>準備好了</button></div>}
    {phase === 'talking' && <div className="gp-row"><span className="gp-timer big">{left}</span><span className="gp-live">開始描述（1 分 30 秒）</span>
      <button type="button" className="gp-stop" onClick={() => { setPhase('working'); session.current?.stop() }}><Square size={12} fill="currentColor" />說完了</button></div>}
    {phase === 'working' && <p className="gp-live">整理你的回答……</p>}
    {phase === 'scoring' && <p className="gp-live">Claude 在看你的描述……</p>}
    {error && <p className="gp-warn" role="alert">{error}</p>}
    {phase === 'done' && <>
      {said ? <p className="gp-said"><small>你說的（語音辨識）：</small><span lang="en">{said.text}</span></p>
        : <p className="gp-warn" role="status">這次沒有辨識到可批改的內容，請再說一次。</p>}
      {fb && <FeedbackView fb={fb} items={questions} rubric={speakRubric.intermediate} />}
      {!fb && said && tutorKey() && <button type="button" className="gp-open" onClick={() => void grade(said)}>用同樣的描述，請 Claude 再批一次</button>}
      <div className="gp-row">
        <button type="button" className="gp-link" onClick={() => setPhase('ready')}>再說一次</button>
        <button type="button" className="gp-link" disabled={audio?.busy} onClick={() => void playSample()}><Volume2 size={14} />聽一段示範描述</button>
      </div>
    </>}
  </div>
}

const incomplete = 'Claude 這次的批改不完整（缺分數的理由、某一題的回饋，或做得好／要改的地方），這次不計分。你說的都留著，可以請 Claude 再批一次。'

function FeedbackView({ fb, items, answers, rubric }: { fb: GeptFeedback; items: string[]; answers?: (Answer | undefined)[]; rubric: RubricId }) {
  return <div className="gp-feedback" role="status">
    {fb.score !== undefined && <p className="gp-score"><b>{fb.score}</b><span>/ 5</span><small>Claude 照官方評分表給的參考分（只看內容和語言，聽不到發音；不是官方分數）· 官方 4 級分通過</small></p>}
    {fb.score !== undefined && <small className="gp-small">表上第 {fb.score} 級：{levelText(rubrics[rubric], fb.score)}</small>}
    <RubricTable rubric={rubrics[rubric]} label="對照的評分表" />
    {fb.why && <p>{fb.why}</p>}
    <ol className="gp-items">{items.map((q, i) => {
      const note = fb.items.find(x => x.n === i + 1)
      return <li key={i}><span lang="en">{q}</span>{answers && <AnswerLine answer={answers[i]} />}{note && <em>{note.text}</em>}</li>
    })}</ol>
    {fb.good && <p className="gp-good">做得好：{fb.good}</p>}
    {fb.fix && <p className="gp-fix">先改這個：{fb.fix}</p>}
    {fb.cards.length > 0 && <div className="gp-cards"><small>這些修正會加入複習。能對回原作答、有分類的錯句會記進「我的弱點」。</small>
      {fb.cards.map((c, i) => <p key={i}><s lang="en">{c.wrong}</s> → <b lang="en">{c.en}</b><span>{c.zh}・{c.why}</span></p>)}</div>}
    {fb.rest && <p className="gp-small">{fb.rest}</p>}
  </div>
}
function Transcripts({ items, answers }: { items: string[]; answers: (Answer | undefined)[] }) {
  return <ol className="gp-items">{items.map((q, i) => <li key={i}><span lang="en">{q}</span><AnswerLine answer={answers[i]} /></li>)}</ol>
}

function AnswerLine({ answer }: { answer?: Answer }) {
  return <small>你說：<span lang={answer?.kind === 'recorded' && answer.text ? 'en' : undefined}>{answerText(answer)}</span></small>
}

/** A photo made small enough to send (longest side 1024 px, JPEG). */
async function shrink(f: File) {
  const src = URL.createObjectURL(f)
  try {
    const img = new Image()
    img.src = src
    await img.decode()
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const url = canvas.toDataURL('image/jpeg', 0.85)
    return { url, media: 'image/jpeg', data: url.slice(url.indexOf(',') + 1) }
  } catch { throw new Error('這張照片打不開，換一張試試。') }
  finally { URL.revokeObjectURL(src) }
}


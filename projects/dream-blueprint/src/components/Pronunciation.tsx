import ReadAloudCheck from './ReadAloudCheck'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, Mic, Square, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { useTaskContext } from '../lib/taskContext'
import { logSkill } from '../lib/bridge'
import { chunkClips, hasQuiz, nextPron, PASS, pronLessons, pronPassed, pronProgress, quizFor, readPron, readVoice, savePron, stressParts, voiceKey, voiceNames,
  type PronItem, type PronLesson, type PronQuestion, type PronVoice, type VoiceChoice } from '../lib/pronunciation'
import { saveAllPacks, usePronPlayer, type Take } from '../lib/pronAudio'
import './pron.css'

type Props = Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }
type Player = ReturnType<typeof usePronPlayer>
const SAVED = 'dream-blueprint.pron-saved'
/** Size of all the sound packs together (pack.py prints it). */
const PACKS_MB = 10.5
const number = (l: PronLesson) => pronLessons.indexOf(l) + 1
const short = (day: string) => day.slice(5).replace('-', '/')
const voicesOf = (choice: VoiceChoice): PronVoice[] => choice === 'both' ? ['f', 'm'] : [choice]
/** One word: each chosen voice says it. A pair to compare: one voice says both words, then the other voice does. */
const takes = (texts: string[], choice: VoiceChoice): Take[] => voicesOf(choice).flatMap(voice => texts.map(text => ({ text, voice })))

/** The pronunciation course in the practice library: the list of lessons, or one lesson. */
export default function Pronunciation({ state, onActivity, date }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)
  const lesson = pronLessons.find(l => l.id === openId)
  const top = useRef<HTMLDivElement>(null)
  function open(id: string | null) {
    setOpenId(id)
    requestAnimationFrame(() => top.current?.scrollIntoView({ block: 'start' }))
  }
  return <div className="pr-stack pn" ref={top}>
    {lesson
      ? <Lesson key={lesson.id} lesson={lesson} state={state} onActivity={onActivity} date={date} onBack={() => open(null)} onOpen={open} />
      : <Index state={state} onOpen={open} />}
  </div>
}

function Index({ state, onOpen }: { state: Props['state']; onOpen: (id: string) => void }) {
  const progress = pronProgress(state.notes)
  const next = nextPron(state.notes)
  return <>
    <p className="st-note">每堂 5–8 分鐘：先看這個音怎麼念，點字聽女聲和男聲，做一個聽辨小測驗，再跟著念三句。照順序上，也可以挑想練的。</p>
    <div className="passage-head">
      <span className="passage-count">過關 <b>{progress.done}</b> / {progress.total} 堂</span>
    </div>
    {next
      ? <button type="button" className="pr-main pn-next" onClick={() => onOpen(next.id)}>{progress.done || readPron(state.notes, next.id).q ? '接著上' : '開始'}：第 {number(next)} 堂 {next.title}</button>
      : <p className="pn-allclear" role="status">{progress.total} 堂都過關了。哪個音又念不準，就回來點那一堂再練。</p>}
    <ol className="pn-list">
      {pronLessons.map(l => {
        const rec = readPron(state.notes, l.id)
        const passed = pronPassed(l, rec)
        return <li key={l.id}>
          <button type="button" onClick={() => onOpen(l.id)} data-passed={passed}>
            <i aria-hidden="true">{passed ? <Check size={14} strokeWidth={3} /> : number(l)}</i>
            <span><b>{l.title}</b><small>{l.tag}{rec.q ? ' · 測驗 ' + rec.q[0] + ' / ' + rec.q[1] + (passed ? '' : '，再練一次') : ''}{passed ? ' · 過關' : ''}</small></span>
          </button>
        </li>
      })}
    </ol>
    <SaveAll />
  </>
}

/** Keeps every clip on this device so the course works without a connection (only where the offline service is running). */
function SaveAll() {
  const total = pronLessons.length * 2
  const [saved, setSaved] = useState(() => { try { return localStorage.getItem(SAVED) === String(total) } catch { return false } })
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')
  if (typeof navigator === 'undefined' || !navigator.serviceWorker?.controller) return null
  async function save() {
    setError('')
    try {
      await saveAllPacks(done => setProgress(done))
      try { localStorage.setItem(SAVED, String(total)) } catch { /* private mode */ }
      setSaved(true)
    } catch { setError('有幾堂沒存到，確認網路後再按一次。') }
    setProgress(null)
  }
  return <p className="pn-save">
    {saved ? '全部的發音都存在這台裝置了，沒有網路也能聽。'
      : progress !== null ? '正在存：' + progress + ' / ' + total
      : <>上過的課會自動留在這台裝置。想先全部存好（約 {PACKS_MB} MB）：<button type="button" className="pr-link" onClick={save}>全部存起來</button></>}
    {error && <span role="alert"> {error}</span>}
  </p>
}

function Lesson({ lesson, state, onActivity, date, onBack, onOpen }: Props & { lesson: PronLesson; onBack: () => void; onOpen: (id: string) => void }) {
  const player = usePronPlayer(lesson.id)
  const choice = readVoice(state.notes)
  const [slow, setSlow] = useState(false)
  const rate = slow ? 0.7 : 1
  const rec = readPron(state.notes, lesson.id)
  const passed = pronPassed(lesson, rec)
  const at = pronLessons.indexOf(lesson)
  const following = pronLessons[at + 1]
  useTaskContext({
    label: '發音課：' + lesson.title,
    detail: ['他正在上發音課第 ' + (at + 1) + ' 堂「' + lesson.title + '」（' + lesson.tag + '）。', ...lesson.explain, lesson.tip ?? '',
      lesson.pairs ? '這堂的對比字：' + lesson.pairs.map(p => p.join(' / ')).join('、') : '', '你聽不到他的聲音，不要評他的發音；可以解釋嘴型、舌頭位置和中文裡最接近的音。'].filter(Boolean).join('\n'),
  })
  const say = (texts: string[], voice: VoiceChoice = choice) => player.play(takes(texts, voice), rate)
  const setVoice = (v: VoiceChoice) => onActivity(prev => ({ ...prev, notes: { ...prev.notes, [voiceKey]: v } }))
  const speaking = (text: string) => player.now?.text === text
  const finish = (patch: { d?: string; q?: [number, number]; s?: string }, spoke = false) =>
    onActivity(prev => { const notes = savePron(prev.notes, lesson.id, patch); return { ...prev, notes: spoke ? logSkill(notes, 'speak', date) : notes } })

  return <>
    <button type="button" className="pr-link pn-back" onClick={onBack}><ChevronLeft size={16} />全部 {pronLessons.length} 堂</button>
    <header className="pn-head">
      <small>第 {at + 1} 堂 · {lesson.tag}{passed ? ' · 過關' : ''}</small>
      <h3>{lesson.title}</h3>
    </header>
    <div className="pn-controls">
      <div className="pr-options qz-tabs" role="group" aria-label="誰念給你聽">
        {(['both', 'f', 'm'] as const).map(v => <button key={v} type="button" aria-pressed={choice === v} onClick={() => setVoice(v)}>{voiceNames[v]}</button>)}
      </div>
      <div className="pr-options qz-tabs" role="group" aria-label="速度">
        <button type="button" aria-pressed={!slow} onClick={() => setSlow(false)}>正常</button>
        <button type="button" aria-pressed={slow} onClick={() => setSlow(true)}>慢速</button>
      </div>
    </div>
    <p className="pn-status" role="status">
      {player.loading ? '正在準備發音…'
        : player.missing.length ? '錄好的' + player.missing.map(v => voiceNames[v]).join('、') + '現在下載不到，先用這台裝置的語音念（連上網路再打開這一堂就有）。'
        : player.deviceVoice ? '剛才那一下用的是這台裝置的語音；現在錄好的發音準備好了。'
        : '錄好的電腦語音（不是真人），女聲和男聲各一份。'}
    </p>

    <section className="pn-sec" aria-label="怎麼念">
      <h4><i aria-hidden="true">1</i>怎麼念</h4>
      {lesson.explain.map(p => <p key={p}>{p}</p>)}
      {lesson.tip && <p className="pn-tip"><b>容易錯的地方</b>{lesson.tip}</p>}
    </section>

    <section className="pn-sec" aria-label="聽聽看">
      <h4><i aria-hidden="true">2</i>聽聽看，跟著念</h4>
      <small className="pn-hint">{lesson.kind === 'chunks' ? '點一小段聽那一段；點整個字聽正常速度。每個都跟著念出聲。' : '點一個字聽一次，跟著念出聲。'}{lesson.pairs ? '「比一比」會把兩個連著念，聽它們差在哪。' : ''}</small>
      {lesson.pairs && <ul className="pn-pairs">
        {lesson.pairs.map(([a, b]) => <li key={a + b} data-long={a.includes(' ') || undefined}>
          <Word text={a} on={speaking(a)} onSay={() => say([a])} />
          <Word text={b} on={speaking(b)} onSay={() => say([b])} />
          <button type="button" className="pn-both" aria-label={'比一比：' + a + '、' + b} onClick={() => say([a, b])}>比一比</button>
        </li>)}
      </ul>}
      {lesson.kind === 'chunks' && lesson.items && <ul className="pn-chunk-list">
        {lesson.items.map(item => <Chunks key={item.text} item={item} player={player} choice={choice} rate={rate} />)}
      </ul>}
      {lesson.kind !== 'chunks' && lesson.items && <ul className="pn-items" data-kind={lesson.kind}>
        {lesson.items.map(item => <li key={item.label + item.text}>
          <span className="pn-label" lang="en">{lesson.kind === 'stress' ? <Stress label={item.label} /> : item.label}</span>
          <Word text={item.text} on={speaking(item.text)} onSay={() => say([item.text])} />
          <small>{item.note}</small>
        </li>)}
      </ul>}
      {lesson.kind === 'table' && <div className="pn-done">
        {rec.d ? <p role="status">{short(rec.d)} 聽過、念過一輪了。之後每一堂都會再細教其中幾個音。</p>
          : <button type="button" className="pr-main" onClick={() => finish({ d: date, s: date }, true)}>每個都聽過、跟著念過了</button>}
      </div>}
    </section>

    {hasQuiz(lesson) && <section className="pn-sec" aria-label="聽辨小測驗">
      <h4><i aria-hidden="true">3</i>聽辨小測驗</h4>
      <Quiz lesson={lesson} player={player} choice={choice} rate={rate} best={rec.q} onDone={(right, total) => finish({ d: date, q: [right, total] })} />
    </section>}

    {lesson.sentences && <section className="pn-sec" aria-label="跟著念句子">
      <h4><i aria-hidden="true">{hasQuiz(lesson) ? 4 : 3}</i>放進句子裡，跟著念</h4>
      <Shadow lesson={lesson} speaking={speaking} onSay={t => say([t])} saidOn={rec.s} today={date} onDone={() => finish({ s: date }, true)} />
    </section>}

    {(passed || lesson.kind === 'table') && following && <button type="button" className="pr-main pn-next" onClick={() => onOpen(following.id)}>下一堂：{following.title}</button>}
  </>
}

function Word({ text, on, onSay }: { text: string; on: boolean; onSay: () => void }) {
  return <button type="button" className="pn-word" lang="en" data-on={on} aria-label={'聽：' + text} onClick={onSay}><Volume2 size={14} aria-hidden="true" /><span>{text}</span></button>
}
/** A long word cut into syllables. Every piece can be heard on its own; two buttons walk through the word:
 *  piece by piece and then together, or growing by one piece at a time. All of it comes from one slow recording. */
function Chunks({ item, player, choice, rate }: { item: PronItem; player: Player; choice: VoiceChoice; rate: number }) {
  const { parts, stressed } = stressParts(item.label)
  const clips = chunkClips(item)
  const chosen = voicesOf(choice)
  // The pieces only exist as recordings: without a downloaded voice the device can still read the whole word, nothing else.
  const voice = chosen.find(v => player.ready.includes(v)) ?? player.ready[0]
  const whole = takes([item.text], choice)
  const one = (text: string): Take[] => voice ? [{ text, voice }] : []
  const now = player.now?.text
  const lit = (i: number) => now === clips.pieces[i] || now === clips.slow || now === item.text || clips.grown.some((g, j) => now === g && i <= j + 1)
  return <li className="pn-chunk-card">
    <div className="pn-chunk-top">
      <Word text={item.text} on={now === item.text} onSay={() => player.play(whole, rate)} />
      <small>{item.note}</small>
    </div>
    <div className="pn-chunks" role="group" aria-label={item.text + ' 的每一段'}>
      {parts.map((p, i) => <button key={i} type="button" className="pn-chunk" lang="en" disabled={!voice} data-stress={i === stressed} data-on={lit(i)}
        aria-label={'聽第 ' + (i + 1) + ' 段：' + p + (i === stressed ? '（重音）' : '')} onClick={() => player.play(one(clips.pieces[i]), rate)}>
        <b>{i === stressed ? p.toUpperCase() : p}</b><small>[{item.kk?.[i]}]</small>
      </button>)}
    </div>
    {voice ? <div className="pn-chunk-actions">
      <button type="button" onClick={() => player.play([...clips.pieces.flatMap(one), ...one(clips.slow), ...whole], rate)}>一段一段念，再合起來</button>
      <button type="button" onClick={() => player.play([...one(clips.pieces[0]), ...clips.grown.flatMap(one), ...one(clips.slow), ...whole], rate)}>慢慢加長</button>
      <button type="button" onClick={() => player.play(one(clips.slow), rate)}>慢速</button>
    </div> : !player.loading && <small className="pn-hint">小段的聲音要連上網路下載；現在只能聽整個字。</small>}
  </li>
}

/** "HOS·pi·tal": the stressed syllable stands out. */
function Stress({ label }: { label: string }) {
  const { parts, stressed } = stressParts(label)
  return <>{parts.map((p, i) => <span key={i}>{i > 0 && '·'}{i === stressed ? <b>{p.toUpperCase()}</b> : p}</span>)}</>
}

/** One attempt: hear a clip, choose. The questions are fixed when the attempt starts; the score is saved at the end. */
function Quiz({ lesson, player, choice, rate, best, onDone }: { lesson: PronLesson; player: Player; choice: VoiceChoice; rate: number; best?: [number, number]
  onDone: (right: number, total: number) => void }) {
  const [questions, setQuestions] = useState<PronQuestion[] | null>(null)
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [rights, setRights] = useState<boolean[]>([])
  const [plays, setPlays] = useState(0)
  const q = questions?.[at]
  // With both voices chosen the questions take turns, so the ear is tested on each.
  const voiceAt = (i: number): PronVoice => choice === 'both' ? (i % 2 ? 'm' : 'f') : choice
  function hear(question: PronQuestion, v: PronVoice) { player.play([{ text: question.audio, voice: v }], rate); setPlays(n => n + 1) }
  // Starting and moving on happen inside a tap, so the clip of the new question can play at once.
  function start() {
    const list = quizFor(lesson, Date.now())
    setQuestions(list); setAt(0); setPicked(null); setRights([]); setPlays(1)
    player.play([{ text: list[0].audio, voice: voiceAt(0) }], rate)
  }
  function choose(i: number) {
    if (!q || picked !== null) return
    player.stop()
    setPicked(i); setRights(r => [...r, i === q.answer])
  }
  function next() {
    if (!questions) return
    if (at + 1 < questions.length) {
      setAt(at + 1); setPicked(null); setPlays(1)
      player.play([{ text: questions[at + 1].audio, voice: voiceAt(at + 1) }], rate)
    } else {
      onDone(rights.filter(Boolean).length, rights.length)
      setAt(questions.length)
    }
  }
  if (!questions) return <div className="pn-quiz">
    <p className="ls-help">{best ? '最好成績 ' + best[0] + ' / ' + best[1] + (best[0] / best[1] >= PASS ? '，已經過關；想再測可以再來一次。' : '，對 ' + Math.ceil(best[1] * PASS) + ' 題過關。') : '只用耳朵聽，選出聽到的是哪一個。答對八成就過關，可以重測。'}</p>
    <button type="button" className="pr-main" onClick={start}>{best ? '再測一次' : '開始測驗'}</button>
  </div>
  if (!q) {
    const right = rights.filter(Boolean).length, ok = right / rights.length >= PASS
    return <div className="pn-quiz gm-feedback" data-ok={ok} role="status">
      <strong>{rights.length} 題對 {right} 題{ok ? '，過關' : ''}</strong>
      <small>{ok ? '耳朵分得出來了。接著把下面的句子跟著念出聲。' : '還分不太出來很正常。回到上面「比一比」多聽幾次，再測一次。'}</small>
      <button type="button" className={ok ? 'pr-link' : 'pr-main'} onClick={start}>再測一次</button>
    </div>
  }
  const answered = picked !== null
  const voice = voiceAt(at)
  return <div className="pn-quiz">
    <small className="pn-count">第 {at + 1} / {questions.length} 題</small>
    <p className="gm-ask">{q.prompt}</p>
    {q.show && <p className="pn-show" lang="en">{q.show}</p>}
    <button type="button" className="ls-play" onClick={() => hear(q, voice)}><Volume2 size={16} />{plays ? '再聽一次' : '播放'}</button>
    <div className="pr-options gm-options pn-options" data-count={q.options.length}>
      {q.options.map((o, i) => <button key={i + o} type="button" lang="en" disabled={answered}
        className={!answered ? undefined : i === q.answer ? 'gm-right' : i === picked ? 'gm-miss' : undefined} onClick={() => choose(i)}>{o}</button>)}
    </div>
    {answered && <div className="gm-feedback" data-ok={picked === q.answer} role="status">
      <strong>{picked === q.answer ? '對了' : '這次是 ' + q.options[q.answer]}</strong>
      {q.why && <small>{q.why}</small>}
      {q.compare && <div className="pn-compare"><small>再比一次：</small>
        {q.compare.map(t => <Word key={t} text={t} on={player.now?.text === t} onSay={() => player.play([{ text: t, voice }], rate)} />)}
      </div>}
    </div>}
    {answered && <button type="button" className="pr-main gm-next" onClick={next}>{at + 1 < questions.length ? '下一題' : '看結果'}</button>}
  </div>
}

/** The lesson's sentences: listen, say each one aloud (recording yourself is optional), tick it. All ticked = a speaking day. */
function Shadow({ lesson, speaking, onSay, saidOn, today, onDone }: { lesson: PronLesson; speaking: (t: string) => boolean; onSay: (t: string) => void
  saidOn?: string; today: string; onDone: () => void }) {
  const list = lesson.sentences ?? []
  const [said, setSaid] = useState<boolean[]>(() => list.map(() => false))
  const [finished, setFinished] = useState(false)
  function tick(i: number) {
    const nextSaid = said.map((v, j) => j === i ? !v : v)
    setSaid(nextSaid)
    if (!finished && nextSaid.every(Boolean)) { setFinished(true); onDone() }
  }
  return <>
    <small className="pn-hint">先聽，再自己念出聲，念過就打勾。可以錄下來跟示範比一比（錄音只留在這個畫面），或按「念念看，幫我比對」看哪些字語音辨識沒聽出來。</small>
    <ol className="pn-lines">
      {list.map((s, i) => <li key={s.en} data-on={speaking(s.en)}>
        <button type="button" className="st-say" aria-label={'聽這一句：' + s.en} onClick={() => onSay(s.en)}><Volume2 size={14} /></button>
        <div><p lang="en">{s.en}</p><small>{s.zh}</small><Recorder /><ReadAloudCheck text={s.en} compact maxMs={20000} /></div>
        <button type="button" className="pn-tick" aria-pressed={said[i]} aria-label={(said[i] ? '取消：' : '我念過了：') + s.en} onClick={() => tick(i)}>
          {said[i] ? <Check size={14} strokeWidth={3} /> : '念了'}</button>
      </li>)}
    </ol>
    {finished ? <p className="pn-ok" role="status">{list.length} 句都念過了，今天的口說算一天。</p>
      : saidOn && <p className="ls-help">{saidOn === today ? '今天念過這一堂的句子了。' : '上次 ' + short(saidOn) + ' 念過。'}</p>}
  </>
}

/** Optional: record yourself and listen back. The clip stays on this screen. */
function Recorder() {
  const [recording, setRecording] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  const recorder = useRef<MediaRecorder | null>(null)
  useEffect(() => () => { if (recorder.current?.state === 'recording') recorder.current.stop() }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const supported = useMemo(() => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined', [])
  if (!supported) return null
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
        setUrl(URL.createObjectURL(new Blob(chunks, { type: r.mimeType }))); setRecording(false)
      }
      recorder.current = r; r.start(); setRecording(true)
    } catch { setError('麥克風被擋住了，直接念出來就好。') }
  }
  return <div className="pn-rec">
    <button type="button" className="pr-link" onClick={toggle}>{recording ? <><Square size={13} />停止錄音</> : <><Mic size={13} />{url ? '重錄' : '錄自己的聲音'}</>}</button>
    {url && <audio controls src={url} />}
    {error && <small role="alert">{error}</small>}
  </div>
}

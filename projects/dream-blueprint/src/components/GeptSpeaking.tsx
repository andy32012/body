import { useEffect, useRef, useState } from 'react'
import { Camera, Mic, Square, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import data from '../data/gept-speaking.json'
import { geptLevelsOpen, geptPass, speakRubric,
  answerSeconds, geptLevels, parseGeptFeedback, parsePhotoQuestions, photoQuestionsPrompt, picturePrompt, questionsPrompt, readGept, saveGept,
  type GeptElementarySet, type GeptFeedback, type GeptIntermediateSet, type GeptLevel, type GeptPart, type GeptPicture, type GeptRecord,
} from '../lib/gept'
import { engineNames, listen, listenEngine, type Listening } from '../lib/speech'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { askTutor, askTutorImage, tutorKey } from '../lib/tutor'
import { addSayCard } from '../lib/sayCards'
import { addWeak, normalizeLabel } from '../lib/weakPoints'
import { logSkill } from '../lib/bridge'
import { dayKey } from '../lib/progress'
import ReadAloudCheck from './ReadAloudCheck'
import { RubricTable } from './RubricTable'
import { LockLine } from './Locked'
import { levelText, rubrics, type RubricId } from '../lib/rubrics'
import GeptScene from './GeptScene'
import './gept.css'

const elementary = data.elementary as GeptElementarySet[]
const intermediate = data.intermediate as GeptIntermediateSet[]
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
type Save = (patch: GeptRecord, feedback?: GeptFeedback) => void

/** 全民英檢口說練習: the parts of the test one by one, with honest checks (see lib/gept.ts). */
export default function GeptSpeaking({ state, update }: PageProps) {
  // 中級 opens once a 初級 round's 回答問題 reached 4 級分 (the official pass level); until then it stays locked.
  const levelOpen = geptLevelsOpen(state.notes, elementary.map(s => s.id))
  // The A1→A2 units prepare for 初級; from the A2→B1 units on, 中級 — if it is open.
  const [chosen, setLevel] = useState<GeptLevel>(() => state.curriculum.unit > 28 && levelOpen.intermediate ? 'intermediate' : 'elementary')
  const level: GeptLevel = levelOpen[chosen] ? chosen : 'elementary'
  const setsOf = (l: GeptLevel): { id: string }[] => l === 'elementary' ? elementary : intermediate
  // The first set not practised yet, chosen once: finishing a part must not switch the page to the next set.
  const firstOpen = (l: GeptLevel) => (setsOf(l).find(s => !readGept(state.notes, l, s.id).d) ?? setsOf(l)[0]).id
  const sets = setsOf(level)
  const [setId, setSetId] = useState(() => firstOpen(level))
  // Parts stay open once started, so a result is still there after moving on to the next part.
  const [open, setOpen] = useState<GeptPart[]>([])
  const info = geptLevels[level]
  const engine = listenEngine()
  const rate = state.settings.speechRate
  const today = dayKey()

  const save: Save = (patch, feedback) => update(prev => {
    let next = { ...prev, notes: logSkill(saveGept(prev.notes, level, setId, { ...patch, d: today }), 'speak', today) }
    // Each correction goes into review by itself and onto the weak-point list.
    for (const [i, c] of (feedback?.cards ?? []).entries()) {
      const tag = c.tag ? normalizeLabel(c.tag) : null
      next = addSayCard(next, { zh: c.zh, en: c.en, wrong: c.wrong, why: c.why, from: 'gept', ...(tag ? { tag } : {}) }, today, 'g' + i)
      if (tag) next = { ...next, notes: addWeak(next.notes, tag, today, { w: c.wrong, r: c.en }, 'gept') }
    }
    return next
  })

  const el = level === 'elementary' ? elementary.find(s => s.id === setId) ?? elementary[0] : null
  const mid = level === 'intermediate' ? intermediate.find(s => s.id === setId) ?? intermediate[0] : null
  return <div className="gp-page">
    <section className="gp-head">
      <a className="gp-back" href="#speaking">← 回到 Emma</a>
      <h1>全民英檢口說練習</h1>
      <div className="gp-tabs" role="tablist" aria-label="級數">
        {(['elementary', 'intermediate'] as GeptLevel[]).map(l => <button key={l} type="button" role="tab" aria-selected={level === l} disabled={!levelOpen[l]} data-locked={!levelOpen[l]}
          onClick={() => { setLevel(l); setSetId(firstOpen(l)); setOpen([]) }}>{geptLevels[l].name}{levelOpen[l] ? <small>{geptLevels[l].cefr}</small> : <LockLine text={'初級回答問題拿到 ' + geptPass + ' 級分才打開'} />}</button>)}
      </div>
      <div className="gp-sets" role="group" aria-label="題組">
        {sets.map((s, i) => {
          const rec = readGept(state.notes, level, s.id)
          return <button key={s.id} type="button" aria-pressed={s.id === setId} onClick={() => { setSetId(s.id); setOpen([]) }}>
            第 {i + 1} 回{rec.d ? ' ✓' : ''}{rec.q !== undefined ? <small>問答 {rec.q}</small> : null}
          </button>
        })}
      </div>
      <p className="gp-small">{info.name}口說有 {info.parts.length} 部分：{info.parts.map(p => p.name).join('、')}，全部約 {info.minutes} 分鐘，滿分 5 級分、4 級分通過。格式照 LTTC 公布的資料整理，題數和時間以報名時的官方說明為準。</p>
      <p className="gp-honest">分數怎麼來的：朗讀和複誦只比對語音辨識聽出哪些字；回答問題和看圖敘述由 Claude 看辨識出來的文字，給「內容和語言」的參考分。官方還會評發音和語調，這裡聽不到，所以都<b>不是官方分數</b>，當作練習的方向就好。</p>
      {!engine && <p className="gp-warn">這台裝置不能做語音辨識：到 Emma 那頁的設定填 OpenAI 金鑰，或改用 Chrome、Safari 開。</p>}
      {engine && <p className="gp-small">語音辨識：{engineNames[engine]}{tutorKey() ? '' : '。還沒連接 Claude，所以只會有逐字稿、沒有參考分（設定 → 連接 Claude）。'}</p>}
    </section>

    {info.parts.map(p => <section key={setId + p.part} className="gp-part" aria-label={p.name}>
      <header><h2>{p.name}</h2><small>{p.how}</small></header>
      {!open.includes(p.part) ? <button type="button" className="gp-open" disabled={!engine} onClick={() => setOpen(o => [...o, p.part])}>開始這一部分</button>
        : p.part === 'repeat' && el ? <RepeatPart sentences={el.repeat} rate={rate} />
        : p.part === 'read' ? <ReadPart texts={el ? [el.readSentences.join(' '), el.readPassage] : mid!.passages} lists={el ? [el.readSentences] : []} level={level} rate={rate}
            onRead={ratio => save({ r: Math.round(ratio * 100) })} />
        : p.part === 'questions' ? <QuestionsPart key={setId} level={level} questions={(el ?? mid)!.questions} rate={rate} onScore={(score, fb) => save({ ...(score !== undefined ? { q: score } : {}) }, fb)} />
        : p.part === 'picture' && mid ? <PicturePart key={setId} picture={mid.picture} rate={rate} onScore={(score, fb) => save({ ...(score !== undefined ? { p: score } : {}) }, fb)} />
        : null}
    </section>)}
  </div>
}

/** 複誦: hear the sentence twice without seeing it, then say it. */
function RepeatPart({ sentences, rate }: { sentences: string[]; rate: number }) {
  return <ol className="gp-list">{sentences.map((s, i) => <RepeatItem key={s} n={i + 1} text={s} rate={rate} />)}</ol>
}
function RepeatItem({ n, text, rate }: { n: number; text: string; rate: number }) {
  const [played, setPlayed] = useState(false)
  const [playing, setPlaying] = useState(false)
  async function play() {
    setPlaying(true)
    await speakEnglish(text, rate); await wait(700); await speakEnglish(text, rate)
    setPlaying(false); setPlayed(true)
  }
  return <li>
    <button type="button" className="gp-play" disabled={playing} onClick={() => void play()}><Volume2 size={14} />{playing ? '播放中……' : played ? '再聽兩次' : '第 ' + n + ' 句：聽兩次'}</button>
    {played && <ReadAloudCheck text={text} rate={rate} maxMs={15000} hideText compact />}
  </li>
}

/** 朗讀: read silently first (a minute, or skip), then aloud; then see which words came through. */
function ReadPart({ texts, lists, level, rate, onRead }: { texts: string[]; lists: string[][]; level: GeptLevel; rate: number; onRead: (ratio: number) => void }) {
  return <ol className="gp-list">{texts.map((t, i) => <ReadItem key={t} n={i} text={t} list={lists[i]} title={level === 'elementary' ? (lists[i] ? '五個句子' : '短文') : '短文 ' + (i + 1)} rate={rate} onRead={onRead} />)}</ol>
}
function ReadItem({ text, list, title, rate, onRead }: { n: number; text: string; list?: string[]; title: string; rate: number; onRead: (ratio: number) => void }) {
  const [phase, setPhase] = useState<'ready' | 'silent' | 'aloud'>('ready')
  const [left, setLeft] = useState(60)
  useEffect(() => {
    if (phase !== 'silent') return
    const end = Date.now() + 60000
    const t = setInterval(() => { const s = Math.ceil((end - Date.now()) / 1000); setLeft(Math.max(0, s)); if (s <= 0) setPhase('aloud') }, 250)
    return () => clearInterval(t)
  }, [phase])
  return <li className="gp-read">
    <strong>{title}</strong>
    {phase === 'ready' && <div className="gp-row">
      <button type="button" className="gp-play" onClick={() => setPhase('silent')}>開始默讀 1 分鐘</button>
      <button type="button" className="gp-link" onClick={() => setPhase('aloud')}>直接開始念</button>
    </div>}
    {phase !== 'ready' && <>
      {list ? <ol className="gp-sentences" lang="en">{list.map(s => <li key={s}>{s}</li>)}</ol> : <p className="gp-passage" lang="en">{text}</p>}
      {phase === 'silent' && <div className="gp-row"><span className="gp-timer">默讀還有 {left} 秒</span><button type="button" className="gp-link" onClick={() => setPhase('aloud')}>準備好了</button></div>}
      {phase === 'aloud' && <ReadAloudCheck text={text} rate={rate} maxMs={120000} onResult={r => onRead(r.ratio)} />}
    </>}
  </li>
}

/** One answer: the question is read twice (not shown unless asked), then the answer time runs. */
function useAnswer() {
  const session = useRef<Listening | null>(null)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false; session.current?.cancel(); stopSpeaking() }, [])
  return { session, alive }
}

/** 回答問題: ten questions (中級) or seven (初級), one after another; Claude scores them together at the end. */
function QuestionsPart({ level, questions, rate, onScore }: { level: GeptLevel; questions: string[]; rate: number; onScore: (score: number | undefined, fb?: GeptFeedback) => void }) {
  const [at, setAt] = useState(0)
  const [phase, setPhase] = useState<'ready' | 'playing' | 'answering' | 'working' | 'between' | 'scoring' | 'done'>('ready')
  const [answers, setAnswers] = useState<string[]>([])
  const kept = useRef<string[]>([])
  const [show, setShow] = useState(false)
  const [left, setLeft] = useState(0)
  const [error, setError] = useState('')
  const [fb, setFb] = useState<GeptFeedback | null>(null)
  const { session, alive } = useAnswer()

  async function ask(k: number) {
    setAt(k); setError(''); setPhase('playing'); setShow(false)
    await speakEnglish(questions[k], rate); if (!alive.current) return
    await wait(900)
    await speakEnglish(questions[k], rate); if (!alive.current) return
    const secs = answerSeconds(level, k)
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      const s = await listen({ maxMs: secs * 1000 })
      session.current = s
      const end = Date.now() + secs * 1000
      setLeft(secs); setPhase('answering')
      timer = setInterval(() => { const l = Math.ceil((end - Date.now()) / 1000); setLeft(Math.max(0, l)); if (l <= 0) setPhase('working') }, 250)
      const text = await s.done
      if (!alive.current) return
      kept.current[k] = text
      setAnswers([...kept.current])
      if (k + 1 < questions.length) setPhase('between')
      else void score()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('between')
    } finally { clearInterval(timer); session.current = null }
  }
  async function score() {
    if (!tutorKey()) { setPhase('done'); onScore(undefined); return }
    setPhase('scoring')
    try {
      const sent = questions.map((q, j) => (j + 1) + '. 題目：' + q + '\n他說：' + (kept.current[j] || '（沒有說話）')).join('\n')
      const result = parseGeptFeedback(await askTutor(questionsPrompt(level), [{ role: 'user', content: sent }]))
      if (!alive.current) return
      setFb(result); onScore(result.score, result)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); onScore(undefined) }
    setPhase('done')
  }

  const secs = answerSeconds(level, at)
  return <div className="gp-run">
    {phase === 'ready' && <>
      <p className="gp-small">按開始後，每題會念兩次（題目不會出現），念完就開始計時回答：{level === 'intermediate' ? '第 1–5 題 15 秒、第 6–10 題 30 秒' : '每題 15 秒'}。可以提早按「說完了」。</p>
      <button type="button" className="gp-open" onClick={() => void ask(0)}><Mic size={15} />開始第 1 題</button>
    </>}
    {phase !== 'ready' && phase !== 'done' && phase !== 'scoring' && <div className="gp-q">
      <small>第 {at + 1} / {questions.length} 題 · 回答時間 {secs} 秒</small>
      {phase === 'playing' && <p className="gp-live">題目播放中（念兩次）……</p>}
      {phase === 'answering' && <div className="gp-row"><span className="gp-timer big">{left}</span><span className="gp-live">請回答</span>
        <button type="button" className="gp-stop" onClick={() => { setPhase('working'); session.current?.stop() }}><Square size={12} fill="currentColor" />說完了</button></div>}
      {phase === 'working' && <p className="gp-live">整理你的回答……</p>}
      {show || phase === 'between' ? <p className="gp-qtext" lang="en">{questions[at]}</p>
        : <button type="button" className="gp-link" onClick={() => setShow(true)}>聽不懂，看題目文字（考試時看不到）</button>}
      {phase === 'between' && <>
        <p className="gp-said"><small>你說的（語音辨識）：</small><span lang="en">{answers[at] || '（沒有聽到聲音）'}</span></p>
        {error && <p className="gp-warn" role="alert">{error}</p>}
        <div className="gp-row">
          <button type="button" className="gp-open" onClick={() => void ask(at + 1)}>下一題（第 {at + 2} 題）</button>
          <button type="button" className="gp-link" onClick={() => void ask(at)}>這題重答</button>
        </div>
      </>}
    </div>}
    {phase === 'scoring' && <p className="gp-live">Claude 在看你的回答……</p>}
    {phase === 'done' && <>
      {error && <p className="gp-warn" role="alert">{error}</p>}
      {fb ? <FeedbackView fb={fb} items={questions} answers={answers} rubric={speakRubric[level]} /> : <Transcripts items={questions} answers={answers} />}
      <button type="button" className="gp-link" onClick={() => { kept.current = []; setAnswers([]); setFb(null); setPhase('ready') }}>整個部分重做一次</button>
    </>}
  </div>
}

/** 看圖敘述 (中級): 30 seconds with the picture and the questions, then a minute and a half. */
function PicturePart({ picture, rate, onScore }: { picture: GeptPicture; rate: number; onScore: (score: number | undefined, fb?: GeptFeedback) => void }) {
  const [photo, setPhoto] = useState<{ url: string; media: string; data: string } | null>(null)
  const [custom, setCustom] = useState<{ questions: string[]; describe: string } | null>(null)
  const [phase, setPhase] = useState<'ready' | 'loading' | 'prep' | 'talking' | 'working' | 'scoring' | 'done'>('ready')
  const [left, setLeft] = useState(30)
  const [said, setSaid] = useState('')
  const [error, setError] = useState('')
  const [fb, setFb] = useState<GeptFeedback | null>(null)
  const { session, alive } = useAnswer()
  const file = useRef<HTMLInputElement>(null)
  const skip = useRef(false)
  const [big, setBig] = useState(false)
  const questions = custom?.questions.length ? custom.questions : picture.questions
  const describe = custom?.describe || picture.describe

  async function pickPhoto(f: File) {
    setError(''); setPhase('loading')
    try {
      const shot = await shrink(f)
      const text = await askTutorImage('你是英文老師，幫台灣學生準備全民英檢中級口說。', photoQuestionsPrompt, { media: shot.media, data: shot.data })
      const got = parsePhotoQuestions(text)
      if (!got.questions.length) throw new Error('Claude 沒有回提示問題，換一張照片試試。')
      if (!alive.current) return
      setPhoto(shot); setCustom(got); setPhase('ready')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase('ready') }
  }
  async function begin() {
    setError(''); setSaid(''); setFb(null); setPhase('prep'); skip.current = false
    for (let s = 30; s > 0 && !skip.current; s--) { if (!alive.current) return; setLeft(s); await wait(1000) }
    if (!alive.current) return
    let timer: ReturnType<typeof setInterval> | undefined
    try {
      const s = await listen({ maxMs: 90000 })
      session.current = s
      const end = Date.now() + 90000
      setLeft(90); setPhase('talking')
      timer = setInterval(() => { const l = Math.ceil((end - Date.now()) / 1000); setLeft(Math.max(0, l)); if (l <= 0) setPhase('working') }, 250)
      const text = await s.done
      if (!alive.current) return
      setSaid(text)
      if (!tutorKey()) { setPhase('done'); onScore(undefined); return }
      setPhase('scoring')
      const result = parseGeptFeedback(await askTutor(picturePrompt({ describe, questions }), [{ role: 'user', content: '他說：' + (text || '（沒有說話）') }]))
      if (!alive.current) return
      setFb(result); onScore(result.score, result); setPhase('done')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setPhase('done') }
    finally { clearInterval(timer); session.current = null }
  }

  return <div className="gp-run">
    <figure className={'gp-picture' + (big ? ' big' : '')} onClick={() => setBig(!big)} title={big ? '點一下縮小' : '點一下放大'}>
      {photo ? <img src={photo.url} alt="你選的照片" /> : <GeptScene id={picture.scene} />}
      {!big && <figcaption>點圖可以放大</figcaption>}
    </figure>
    <ol className="gp-sentences" lang="en">{questions.map(q => <li key={q}>{q}</li>)}</ol>
    {phase === 'ready' && <div className="gp-row">
      <button type="button" className="gp-open" onClick={() => void begin()}>開始：先看 30 秒</button>
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
      <p className="gp-said"><small>你說的（語音辨識）：</small><span lang="en">{said || '（沒有聽到聲音）'}</span></p>
      {fb && <FeedbackView fb={fb} items={questions} rubric={speakRubric.intermediate} />}
      <div className="gp-row">
        <button type="button" className="gp-link" onClick={() => setPhase('ready')}>再說一次</button>
        <button type="button" className="gp-link" onClick={() => void speakEnglish(describe, rate)}><Volume2 size={14} />聽一段示範描述</button>
      </div>
    </>}
  </div>
}

function FeedbackView({ fb, items, answers, rubric }: { fb: GeptFeedback; items: string[]; answers?: string[]; rubric: RubricId }) {
  return <div className="gp-feedback" role="status">
    {fb.score !== undefined && <p className="gp-score"><b>{fb.score}</b><span>/ 5</span><small>Claude 照官方評分表給的參考分（只看內容和語言，聽不到發音；不是官方分數）· 官方 4 級分通過</small></p>}
    {fb.score !== undefined && <small className="gp-small">表上第 {fb.score} 級：{levelText(rubrics[rubric], fb.score)}</small>}
    <RubricTable rubric={rubrics[rubric]} label="對照的評分表" />
    {fb.why && <p>{fb.why}</p>}
    <ol className="gp-items">{items.map((q, i) => {
      const note = fb.items.find(x => x.n === i + 1)
      return <li key={i}><span lang="en">{q}</span>{answers && <small lang="en">你說：{answers[i] || '（沒有說話）'}</small>}{note && <em>{note.text}</em>}</li>
    })}</ol>
    {fb.good && <p className="gp-good">做得好：{fb.good}</p>}
    {fb.fix && <p className="gp-fix">先改這個：{fb.fix}</p>}
    {fb.cards.length > 0 && <div className="gp-cards"><small>這些修正已經加進複習，也記進「我的弱點」：</small>
      {fb.cards.map((c, i) => <p key={i}><s lang="en">{c.wrong}</s> → <b lang="en">{c.en}</b><span>{c.zh}・{c.why}</span></p>)}</div>}
    {fb.rest && <p className="gp-small">{fb.rest}</p>}
  </div>
}
function Transcripts({ items, answers }: { items: string[]; answers: string[] }) {
  return <ol className="gp-items">{items.map((q, i) => <li key={i}><span lang="en">{q}</span><small lang="en">你說：{answers[i] || '（沒有說話）'}</small></li>)}</ol>
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


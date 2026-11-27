import AskWhy from './AskWhy'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { useActivitySave, type SaveActivity } from '../lib/activitySave'
import {
  accentNames, hasPack, heldOpen, listenAttempt, listenKey, withBestListen, logSkill, packFor, packUnits, readHeld, readListen, saveHeld, speakKey, unitTitle,
  type HeldPart, type ListenRecord, type Pack, type PackListening,
} from '../lib/bridge'
import { reached } from '../lib/unlock'
import { readDraft, writeDraft } from '../lib/drafts'
import { passed, readRecord, savedPicks, savedQuestionRevisions, shownPassage, shownPicks, usesCurrentQuestion, type ReadPassage } from '../lib/reading'
import { readWrite, selfChecked, taskDone, type WriteStage, type WriteTask } from '../lib/writing'
import { accentVoices, Transcript, useDialogueVoice, useVoiceList } from './LessonParts'
import ReadingPath from './ReadingPath'
import './unit-pack.css'

type Tab = 'chunks' | 'read' | 'listen' | 'write' | 'speak' | 'test'
const tabs: [Tab, string][] = [['chunks', '詞塊'], ['read', '閱讀'], ['listen', '聽力'], ['write', '寫作'], ['speak', '口說'], ['test', '回測']]
const md = (d: string) => d.slice(5).replace('-', '/')
const pct = (c: number, t: number) => Math.round(c / Math.max(1, t) * 100) + '%'

/** #library/unit/<tab>/<unit> */
function fromHash(): { tab?: Tab; unit?: number } {
  const [, , t, u] = location.hash.replace(/^#/, '').split('/')
  return { tab: tabs.some(([k]) => k === t) ? t as Tab : undefined, unit: hasPack(Number(u)) ? Number(u) : undefined }
}

function Chunks({ pack, rate }: { pack: Pack; rate: number }) {
  const voice = useDialogueVoice(rate)
  const [hide, setHide] = useState(false)
  const [shown, setShown] = useState<number[]>([])
  return <section className="up-section">
    <p className="ls-help">這一課常用的詞塊。先聽例句、跟著念；熟了就遮住英文，看中文先說出來，再打開對答案。</p>
    <button type="button" className="pr-link" onClick={() => { setHide(!hide); setShown([]) }}>{hide ? '顯示全部英文' : '遮住英文，自己考自己'}</button>
    <ol className="up-chunks">
      {pack.chunks.map((c, i) => {
        const open = !hide || shown.includes(i)
        return <li key={c.en}>
          <button type="button" className="ls-line-play" aria-label={'播放例句：' + c.ex} onClick={() => voice.play([{ who: '', en: c.ex, zh: '' }], 0, true)}><Volume2 size={14} /></button>
          <div>
            {open ? <b lang="en">{c.en}</b> : <button type="button" className="up-reveal" onClick={() => setShown([...shown, i])}>說好了，看英文</button>}
            <span>{c.zh}</span>
            {open && <small lang="en">{c.ex}</small>}
          </div>
        </li>
      })}
    </ol>
  </section>
}

/** Listen without the text, answer, then read along. Questions open after one complete play; a play that cannot be
 *  confirmed still lets him answer, but it is not recorded as understood by ear. */
export function PackListen({ l, rate, last, onSave, review, previewKey }: { l: PackListening; rate: number; last: ListenRecord | null
  onSave: (r: Omit<ListenRecord, 'day'>, byEar: boolean) => Promise<void>
  review?: { alreadyRead: boolean; onPreview: () => Promise<void> }
  previewKey?: string
}) {
  useVoiceList()
  const voice = useDialogueVoice(rate, l.accent)
  const hasAccent = accentVoices(l.accent).length > 0
  const [answers, setAnswers] = useState<number[]>([])
  const [checked, setChecked] = useState(false)
  const [showZh, setShowZh] = useState(false)
  const [noVoice, setNoVoice] = useState(false)
  const [readAlong, setReadAlong] = useState(false)
  const [unsure, setUnsure] = useState(false)
  const [started, setStarted] = useState(0)
  const { saving, error, save, clearError } = useActivitySave()
  // A redo starts a new round: plays finished before it do not open its questions.
  const [playsBefore, setPlaysBefore] = useState(0)
  const [reviewRound, setReviewRound] = useState(false)
  const [seenPreview, setSeenPreview] = useState(() => !!previewKey && readDraft(previewKey) === 'seen')
  useEffect(() => {
    if (voice.status !== 'error') return
    setNoVoice(true)
    if (previewKey && !review && !seenPreview) {
      writeDraft(previewKey, 'seen')
      setSeenPreview(true)
    }
  }, [voice.status, previewKey, review, seenPreview])
  const heard = voice.completed > playsBefore
  const usingText = readAlong || (!review && noVoice)
  const open = heard || unsure || usingText
  const seenBefore = reviewRound || seenPreview || !!last || !!review?.alreadyRead
  const correct = l.questions.filter((q, i) => answers[i] === q.answer).length
  function rememberPreview() {
    if (previewKey && !seenPreview) {
      writeDraft(previewKey, 'seen')
      setSeenPreview(true)
    }
  }
  function cannotPlay() {
    setNoVoice(true)
    if (!review) rememberPreview()
  }
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(l.dialogue)) { cannotPlay(); return }
    setStarted(n => n + 1)
  }
  function check() {
    if (!open || !l.questions.every((_, i) => typeof answers[i] === 'number')) return
    voice.stop()
    const byEar = heard && !unsure && !usingText
    const attempt = listenAttempt(last, { correct, total: l.questions.length, played: byEar, textShown: seenBefore, plays: voice.completed - playsBefore })
    void save(async () => {
      await onSave(attempt, byEar)
      setChecked(true)
      rememberPreview()
    })
  }
  function restart() {
    voice.stop()
    clearError()
    setPlaysBefore(voice.completed)
    setReviewRound(true)
    setAnswers([])
    setChecked(false)
    setUnsure(false)
    setShowZh(false)
    setNoVoice(false)
    setReadAlong(false)
    setStarted(0)
  }
  return <section className="ls-listen up-section">
    <div className="pr-label">聽力 · {l.scene}</div>
    <h3 lang="en" className="up-title">{l.title}</h3>
    <p className="ls-help">電腦語音（不是真人錄音）：{hasAccent ? accentNames[l.accent] + '口音' : '這台裝置沒有' + accentNames[l.accent] + '語音，先用其他英文語音'}。先不看字完整聽一到兩次，再回答。
      {last ? ' 上次 ' + last.correct + ' / ' + last.total + (last.heard ? '（首次只聽）' : '（練習）') + '。' : ''}</p>
    <button type="button" className="ls-play" onClick={playAll} disabled={saving}>
      {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />播放對話{voice.completed ? '（完整聽過 ' + voice.completed + ' 次）' : ''}</>}
    </button>
    {noVoice && !checked && (review
      ? <p className="ls-help">語音這次沒有播完。可以重播，也可以看稿練習。{!usingText && <button type="button" className="pr-link"
        disabled={saving} onClick={() => void save(async () => { await review.onPreview(); setReadAlong(true) })}>看稿練習</button>}</p>
      : <p className="ls-help">這個瀏覽器沒辦法播放語音，看下面的對話作答；這次不算「只聽也懂」。</p>)}
    {review && usingText && !checked && <p className="ls-help">看稿作答會存成練習。要用這段重聽過關，請關掉文稿，再從頭完整聽一次。</p>}
    {seenBefore && !checked && <p className="ls-help">{review
      ? '這段之前已做過或看過全文。重聽時先遮住文稿，完整聽完再作答，答對至少七成可算本級過關。原有首次成績照樣保留。'
      : '這段已做過，這次成績算練習。原有首次只聽的成績照樣保留。'}</p>}
    {!checked && <ol className="ls-qs">
      {l.questions.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options rd-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={answers[i] === j} disabled={saving || !open}
          onClick={() => { const a = [...answers]; a[i] = j; setAnswers(a) }}>{o}</button>)}</div>
      </li>)}
    </ol>}
    {!checked && !open && <p className="ls-help ls-need">先按「播放對話」完整聽一次，題目才能作答。</p>}
    {!checked && !open && started > 0 && voice.playing === null && <button type="button" className="pr-link" onClick={() => setUnsure(true)}>播完了，但題目沒有打開？</button>}
    {!checked && <button type="button" className="pr-main" disabled={saving || !open || answers.filter(a => a !== undefined).length < l.questions.length} onClick={check}>{saving ? '正在儲存……' : '對答案、看全文'}</button>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {checked && <ul className="ls-results">
      {l.questions.map((q, i) => <li key={i} data-ok={answers[i] === q.answer}><span lang="en">{q.q}</span><b lang="en">{answers[i] === q.answer ? '✓ ' : '✗ '}{q.options[q.answer]}</b>
        <AskWhy q={{ source: '聽力', passage: l.dialogue.map(d => d.who + ': ' + d.en).join(' / '), stem: q.q, options: q.options, picked: answers[i] === undefined ? '' : q.options[answers[i]], answer: q.options[q.answer], right: answers[i] === q.answer }} /></li>)}
    </ul>}
    {(checked || usingText) && <>
      <Transcript lines={l.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(l.dialogue, i, true)} />
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        {(checked || (review && usingText)) && <button type="button" className="pr-link" onClick={restart}>{review ? '關掉文稿，重聽作答' : '再做一次（不看字先聽）'}</button>}
      </div>
    </>}
  </section>
}

function HeldReading({ passage: data, done, onSubmit }: { passage: ReadPassage; done?: HeldPart; onSubmit: (picks: number[], correct: number) => Promise<void> }) {
  // Options shuffled the same way every time (in the data the answers often go A, B, C in turn); saved in data order.
  const passage = useMemo(() => shownPassage(data), [data])
  const [draft, setPicks] = useState<number[]>([])
  const picks = done ? shownPicks(passage.qs, done.picks ?? [], done.questionRevisions) : draft
  const finished = !!done
  const ready = passage.qs.every((_, i) => picks[i] !== undefined)
  const { saving, error, save } = useActivitySave()
  return <article className="up-held">
    <header><strong>沒看過的閱讀</strong><small>{passage.words} 字 · {passage.qs.length} 題 · {done ? '第一次成績 ' + done.correct + ' / ' + done.total + '（' + md(done.day) + '）' : '只有一次機會，不看中文、不查字典'}</small></header>
    <div className="rd-passage"><h3 lang="en">{passage.title}</h3>{passage.paras.map((p, i) => <p key={i} lang="en" className="rd-para">{p}</p>)}</div>
    <ol className="ls-qs">
      {passage.qs.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options rd-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={picks[i] === j} disabled={finished || saving}
          onClick={() => { const n = [...picks]; n[i] = j; setPicks(n) }}>{o}</button>)}</div>
        {finished && <p className="up-why" data-ok={picks[i] !== undefined ? picks[i] === q.answer : undefined}>
          {picks[i] === undefined
            ? (usesCurrentQuestion(q, q.from, done?.questionRevisions) ? '舊紀錄沒有這題的選項。' : '這題已修訂，原成績保留。') + '目前答案是「' + q.options[q.answer] + '」。'
            : picks[i] === q.answer ? '✓ 對。' : '✗ 答案是「' + q.options[q.answer] + '」。'}{q.why}</p>}
        {finished && picks[i] !== undefined && <AskWhy q={{ source: '單元閱讀', passage: passage.paras.join(' '), stem: q.q, options: q.options, picked: q.options[picks[i]], answer: q.options[q.answer], right: picks[i] === q.answer }} />}
      </li>)}
    </ol>
    {!finished && <button type="button" className="pr-main" disabled={saving || !ready}
      onClick={() => void save(() => onSubmit(savedPicks(passage.qs, picks), passage.qs.filter((q, i) => picks[i] === q.answer).length))}>{saving ? '正在儲存……' : '交卷（只有這一次）'}</button>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {finished && <details className="up-zh"><summary>看中文大意</summary><p className="rd-zh">{passage.zh}</p></details>}
  </article>
}

type HeldDraft = { starts: number; heard: boolean; picks: (number | null)[] }
function heldDraft(key: string, l: PackListening): HeldDraft {
  try {
    const data = JSON.parse(readDraft(key)) as Partial<HeldDraft>
    if (typeof data.starts === 'number' && Number.isInteger(data.starts) && data.starts >= 0 && data.starts <= 2 &&
        typeof data.heard === 'boolean' && Array.isArray(data.picks)) {
      const picks = l.questions.map((question, i) => {
        const pick = data.picks?.[i]
        return typeof pick === 'number' && Number.isInteger(pick) && pick >= 0 && pick < question.options.length ? pick : null
      })
      return { starts: data.starts, heard: data.heard && data.starts > 0, picks }
    }
  } catch { /* No usable draft. */ }
  return { starts: 0, heard: false, picks: [] }
}

function HeldListening({ l, unit, rate, done, onPractice, onSubmit }: { l: PackListening; unit: number; rate: number; done?: HeldPart
  onPractice: () => void; onSubmit: (picks: number[], correct: number) => Promise<void>
}) {
  useVoiceList()
  const voice = useDialogueVoice(rate, l.accent)
  const hasAccent = accentVoices(l.accent).length > 0
  const draftKey = 'bridge-held-listen.' + unit
  const [draft, setDraft] = useState(() => heldDraft(draftKey, l))
  const draftRef = useRef(draft)
  const [noVoice, setNoVoice] = useState(false)
  const [showZh, setShowZh] = useState(false)
  const { saving, error, save } = useActivitySave()
  useEffect(() => { if (voice.status === 'error') setNoVoice(true) }, [voice.status])
  const finished = !!done
  const { heard, starts } = draft
  const picks = done ? done.picks ?? [] : draft.picks
  const ready = l.questions.every((_, i) => typeof picks[i] === 'number')
  const left = 2 - starts
  function saveDraft(next: HeldDraft) {
    draftRef.current = next
    writeDraft(draftKey, JSON.stringify(next))
    setDraft(next)
  }
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!finished && draftRef.current.starts >= 2) return
    if (!voice.play(l.dialogue, 0, false, finished ? undefined : {
      started: () => saveDraft({ ...draftRef.current, starts: draftRef.current.starts + 1 }),
      completed: () => saveDraft({ ...draftRef.current, heard: true }),
    })) { setNoVoice(true); return }
    setNoVoice(false)
  }
  return <article className="up-held">
    <header><strong>沒聽過的聽力</strong><small>{l.questions.length} 題 · 電腦語音（{hasAccent ? accentNames[l.accent] + '口音' : '這台裝置沒有' + accentNames[l.accent] + '語音'}） · {done ? (done.heard === true ? '第一次成績 ' : '舊紀錄，未確認聽完：') + done.correct + ' / ' + done.total + '（' + md(done.day) + '）' : '最多播兩次，不看字'}</small></header>
    <p className="ls-help">情境：{l.scene}</p>
    <button type="button" className="ls-play" onClick={playAll} disabled={saving || (!finished && left <= 0 && voice.playing === null)}>
      {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />{finished ? '再聽一次' : left > 0 ? '播放（還能播 ' + left + ' 次）' : '兩次都播完了'}</>}
    </button>
    {!finished && !heard && (noVoice || (starts > 0 && voice.playing === null)) && <div className="pr-hint">
      <p>{left > 0 ? '這次沒確認語音完整播放，還能使用剩餘的播放次數。若目前無法播出，可以先用這個單元的其他對話看稿練習。'
        : '兩次語音都已開始播放，且沒有完整播完。這段還沒有正式成績，可以先用這個單元的其他對話練習。'}</p>
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={onPractice}>用其他對話練習</button>
      </div>
    </div>}
    {finished && <Transcript lines={l.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(l.dialogue, i, true)} />}
    <ol className="ls-qs">
      {l.questions.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options rd-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={picks[i] === j} disabled={saving || finished || !heard}
          onClick={() => { const n = [...draftRef.current.picks]; n[i] = j; saveDraft({ ...draftRef.current, picks: n }) }}>{o}</button>)}</div>
        {finished && <p className="up-why" data-ok={typeof picks[i] === 'number' ? picks[i] === q.answer : undefined}>
          {typeof picks[i] !== 'number' ? '舊紀錄沒有這題的選項。答案是「' + q.options[q.answer] + '」。' : picks[i] === q.answer ? '✓ 對' : '✗ 答案是「' + q.options[q.answer] + '」'}</p>}
        {finished && typeof picks[i] === 'number' && <AskWhy q={{ source: '單元聽力', passage: l.dialogue.map(d => d.who + ': ' + d.en).join(' / '), stem: q.q, options: q.options, picked: q.options[picks[i]], answer: q.options[q.answer], right: picks[i] === q.answer }} />}
      </li>)}
    </ol>
    {!finished && <button type="button" className="pr-main" disabled={saving || !heard || !ready} onClick={() => {
      voice.stop()
      const chosen = l.questions.map((_, i) => draftRef.current.picks[i])
      if (chosen.every((pick): pick is number => typeof pick === 'number')) void save(() => onSubmit(chosen, l.questions.filter((q, i) => chosen[i] === q.answer).length))
    }}>{saving ? '正在儲存……' : '交卷（只有這一次）'}</button>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    {finished && <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>}
  </article>
}

function HeldTest({ pack, state, onSavedActivity, date, onPractice }: { pack: Pack; state: PageProps['state']
  onSavedActivity: SaveActivity; date: string; onPractice: () => void
}) {
  const open = heldOpen(state.curriculum, pack.unit)
  const rec = readHeld(state.notes, pack.unit)
  const [passage, setPassage] = useState<ReadPassage | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  useEffect(() => {
    if (!open) return
    let alive = true
    import('../data/reading.json').then(f => { if (alive) setPassage((f.default as ReadPassage[]).find(p => p.id === pack.heldReading) ?? null) }).catch(() => { if (alive) setReadFailed(true) })
    return () => { alive = false }
  }, [open, pack.heldReading])
  if (!open) return <div className="pr-hint up-section">
    <strong>回測還沒開</strong>
    <p>單元 {pack.unit} 第 6 天（單元小關卡那天）開放，上完這個單元之後也能做。回測是一篇沒看過的閱讀和一段沒聽過的聽力，各只有一次機會，用來看這週學的能不能用在新的材料上。</p>
  </div>
  // Practice passages (best attempts) next to the unseen one: the gap shows whether the skill carries over.
  const train = pack.reading.map(id => readRecord(state.notes, id)).filter(r => r !== null)
  const trainRight = train.reduce((a, r) => a + (r.best ?? r).correct, 0), trainTotal = train.reduce((a, r) => a + (r.best ?? r).total, 0)
  const save = (part: 'reading' | 'listening', p: HeldPart) => onSavedActivity(prev => {
    const notes = saveHeld(prev.notes, pack.unit, part, p)
    return notes === prev.notes ? prev : { ...prev, notes: logSkill(notes, part === 'reading' ? 'read' : 'listen', date) }
  })
  return <section className="up-section">
    <p className="ls-help">沒看過的閱讀和聽力各一份，各只有一次機會：成績只記第一次，交卷後才看得到答案和解釋。照考試的方式做——不看中文、不查字典。</p>
    {(rec.reading || rec.listening) && <p className="up-compare">
      {rec.reading && <span>閱讀：練習文章 {trainTotal ? pct(trainRight, trainTotal) : '還沒做'} → 沒看過的 {pct(rec.reading.correct, rec.reading.total)}</span>}
      {rec.listening && <span>{rec.listening.heard === true ? '聽力：沒聽過的 ' + pct(rec.listening.correct, rec.listening.total) : '聽力：舊紀錄未確認完整聽過，不納入比較'}</span>}
    </p>}
    {passage ? <HeldReading passage={passage} done={rec.reading}
      onSubmit={(picks, correct) => save('reading', { day: date, picks, correct, total: passage.qs.length, questionRevisions: savedQuestionRevisions(passage.qs) })} />
      : readFailed ? <div className="pr-hint" role="alert"><strong>回測的閱讀沒有下載到</strong><p>可能是網路斷了；回測還沒做，機會還在。連上網路後按「重新載入」。下面的聽力可以先做。</p>
        <div className="pr-actions"><button type="button" className="pr-main" onClick={() => location.reload()}>重新載入</button></div></div>
      : <p>載入中……</p>}
    <HeldListening l={pack.heldListen} unit={pack.unit} rate={state.settings.speechRate} done={rec.listening} onPractice={onPractice}
      onSubmit={(picks, correct) => save('listening', { day: date, picks, correct, total: pack.heldListen.questions.length, heard: true })} />
  </section>
}

/** 單元讀聽說寫：a bridge unit's skills pack — chunks, readings, a listening, writing and speaking tasks, and the held-out test. */
export default function UnitPack({ state, onActivity, onSavedActivity, date }: Pick<PageProps, 'state'> & {
  onActivity: PageProps['update']; onSavedActivity: SaveActivity; date: string
}) {
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [bridgeTasks, setBridgeTasks] = useState<WriteTask[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    import('../data/bridge.json').then(f => { if (alive) setPacks(f.default as Pack[]) }).catch(() => { if (alive) setFailed(true) })
    // The writing bank is large: loaded here, only when a pack opens.
    import('../data/writing.json').then(f => { if (alive) setBridgeTasks(((f.default.stages as WriteStage[]).find(s => s.pack)?.tasks ?? []) as WriteTask[]) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  const [tab, setTab] = useState<Tab>(() => fromHash().tab ?? 'chunks')
  const [picked, setUnit] = useState(() => fromHash().unit ?? packFor(state.curriculum.unit))
  // A pack opens with its unit: units ahead of the course stay locked, and a link to one opens the latest reached pack.
  const reachedPacks = packUnits.filter(u => reached(u, state.curriculum.unit))
  const unit = reached(picked, state.curriculum.unit) ? picked : reachedPacks.at(-1) ?? null
  useEffect(() => {
    const on = () => {
      if (!location.hash.startsWith('#library/unit')) return
      const h = fromHash()
      if (h.tab) setTab(h.tab)
      if (h.unit) setUnit(h.unit)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  if (failed) return <p>單元教材載入失敗，重新整理再試一次。</p>
  if (unit === null) return <p className="ls-help">單元讀聽說寫從單元 {packUnits[0]} 開始，課程上到那裡才會打開。</p>
  const pack = packs?.find(p => p.unit === unit)
  if (!pack || !bridgeTasks) return <p>載入中……</p>
  const cur = state.curriculum
  const notes = state.notes
  const rate = state.settings.speechRate
  const tasks = pack.write.flatMap(id => bridgeTasks.filter(t => t.id === id))
  const held = readHeld(notes, unit)
  const status: Record<Tab, string> = {
    chunks: String(pack.chunks.length),
    read: pack.reading.filter(id => passed(readRecord(notes, id))).length + '/' + pack.reading.length,
    listen: pack.listen.every((_, i) => readListen(notes, unit, i)) ? '✓' : '',
    write: tasks.filter(t => taskDone(readWrite(notes, t.id), false)).length + '/' + tasks.length,
    speak: pack.speak.filter((_, i) => notes[speakKey(unit, i)]).length + '/' + pack.speak.length,
    test: held.reading && held.listening ? (held.listening.heard === true ? '✓' : '舊聽力未確認') : heldOpen(cur, unit) ? '可以做' : '第 6 天',
  }
  return <div className="pr-stack up">
    <header className="up-head">
      <label className="up-pick">單元
        <select value={unit} onChange={e => setUnit(Number(e.target.value))}>
          {packUnits.map(u => <option key={u} value={u} disabled={!reached(u, cur.unit)}>{reached(u, cur.unit) ? '' : '🔒 '}{u} · {unitTitle(u).split(/[：（]/)[0]}{reached(u, cur.unit) ? '' : '（上到才打開）'}</option>)}
        </select>
      </label>
      <p className="up-focus"><b>{pack.code}</b>{pack.focus}</p>
      <p className="qz-meta">
        <span>{cur.unit === unit ? '這週的單元（第 ' + cur.day + ' 天）' : '上過的單元，可以回來複習'}</span>
        <span>一個單元一週：詞塊和閱讀 → 聽力 → 寫作 → 口說 → 第 6 天回測</span>
      </p>
    </header>
    <div className="pr-options up-tabs" role="group" aria-label="單元讀聽說寫">
      {tabs.map(([k, label]) => <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>{label}<small>{status[k]}</small></button>)}
    </div>
    {tab === 'chunks' && <Chunks key={unit} pack={pack} rate={rate} />}
    {tab === 'read' && <ReadingPath key={unit} state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} only={pack.reading} />}
    {tab === 'listen' && pack.listen.map((l, i) => <PackListen key={unit + '-' + i} l={l} rate={rate} last={readListen(notes, unit, i)} previewKey={'bridge-listen-preview.' + unit + '.' + i}
      onSave={r => onSavedActivity(prev => ({ ...prev, notes: logSkill({ ...prev.notes, [listenKey(unit, i)]: JSON.stringify(withBestListen(readListen(prev.notes, unit, i), { ...r, day: date })) }, 'listen', date) }))} />)}
    {tab === 'write' && <section className="up-section">
      <p className="ls-help">兩題段落寫作，題目會要你用這一課的文法。連上 Claude 就照全民英檢中級英文作文的官方評分表批改；沒連的話自己對照檢查（記成自評，不算過關）。</p>
      {tasks.map(t => {
        const r = readWrite(notes, t.id)
        return <article key={t.id} className="up-item">
          <div><b>{t.zh}</b><small lang="en">{t.prompt}</small>
            <small>{taskDone(r, false) ? '✓ 過關' : selfChecked(r) ? '自評完成・待確認' : r ? '寫過，還沒過關' : '還沒寫'} · 至少 {t.min} 字</small></div>
          <a className="up-go" href={'#library/writing/' + t.id}>去寫</a>
        </article>
      })}
    </section>}
    {tab === 'speak' && <section className="up-section">
      <p className="ls-help">跟 Emma 用這一課的文法完成兩個口說任務。她聽的是語音辨識的文字，不評發音。還沒設定語音金鑰的話，先自己說 1–2 分鐘、用上幾個詞塊也可以。</p>
      {pack.speak.map((s, i) => <article key={i} className="up-item">
        <div><b>{s.title}</b><small>{s.zh}</small>{notes[speakKey(unit, i)] && <small>說過 ✓（{md(notes[speakKey(unit, i)])}）</small>}</div>
        <a className="up-go" href={'#speaking/pack-' + unit + '-' + i}>跟 Emma 練</a>
      </article>)}
    </section>}
    {tab === 'test' && <HeldTest key={unit} pack={pack} state={state} onSavedActivity={onSavedActivity} date={date} onPractice={() => setTab('listen')} />}
  </div>
}

import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import {
  accentNames, hasPack, heldOpen, listenKey, withBestListen, logSkill, packFor, packUnits, readHeld, readListen, saveHeld, speakKey, unitTitle,
  type HeldPart, type ListenRecord, type Pack, type PackListening,
} from '../lib/bridge'
import { reached } from '../lib/unlock'
import { passed, readRecord, savedPicks, shownPassage, shownPicks, type ReadPassage } from '../lib/reading'
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
export function PackListen({ l, rate, last, onSave }: { l: PackListening; rate: number; last: ListenRecord | null; onSave: (r: Omit<ListenRecord, 'day'>) => void }) {
  useVoiceList()
  const voice = useDialogueVoice(rate, l.accent)
  const hasAccent = accentVoices(l.accent).length > 0
  const [answers, setAnswers] = useState<number[]>([])
  const [checked, setChecked] = useState(false)
  const [showZh, setShowZh] = useState(false)
  const [noVoice, setNoVoice] = useState(false)
  const [unsure, setUnsure] = useState(false)
  const [started, setStarted] = useState(0)
  // A redo starts a new round: plays finished before it do not open its questions.
  const [playsBefore, setPlaysBefore] = useState(0)
  // The transcript and the answers were seen in this visit: a redo now is practice, not understanding by ear.
  const [seenText, setSeenText] = useState(false)
  useEffect(() => { if (voice.status === 'error') setNoVoice(true) }, [voice.status])
  const heard = voice.completed > playsBefore
  const open = heard || unsure || noVoice
  const correct = l.questions.filter((q, i) => answers[i] === q.answer).length
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(l.dialogue)) { setNoVoice(true); return }
    setStarted(n => n + 1)
  }
  function check() {
    voice.stop(); setChecked(true)
    onSave({ correct, total: l.questions.length, heard: heard && !unsure && !noVoice && !seenText, plays: voice.completed - playsBefore })
  }
  return <section className="ls-listen up-section">
    <div className="pr-label">聽力 · {l.scene}</div>
    <h3 lang="en" className="up-title">{l.title}</h3>
    <p className="ls-help">電腦語音（不是真人錄音）：{hasAccent ? accentNames[l.accent] + '口音' : '這台裝置沒有' + accentNames[l.accent] + '語音，先用其他英文語音'}。先不看字完整聽一到兩次，再回答。
      {last ? ' 上次 ' + last.correct + ' / ' + last.total + (last.heard ? '' : '（沒有確認聽完，不算只聽也懂）') + '。' : ''}</p>
    <button type="button" className="ls-play" onClick={playAll}>
      {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />播放對話{voice.completed ? '（完整聽過 ' + voice.completed + ' 次）' : ''}</>}
    </button>
    {noVoice && <p className="ls-help">這個瀏覽器沒辦法播放語音，看下面的對話作答；這次不算「只聽也懂」。</p>}
    {seenText && !checked && <p className="ls-help">剛剛看過全文和答案：這次重做是練習，先再完整聽一次才能作答，成績不算「只聽也懂」（之前的最好成績會留著）。</p>}
    {!checked && <ol className="ls-qs">
      {l.questions.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options rd-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={answers[i] === j} disabled={!open}
          onClick={() => { const a = [...answers]; a[i] = j; setAnswers(a) }}>{o}</button>)}</div>
      </li>)}
    </ol>}
    {!checked && !open && <p className="ls-help ls-need">先按「播放對話」完整聽一次，題目才能作答。</p>}
    {!checked && !open && started > 0 && voice.playing === null && <button type="button" className="pr-link" onClick={() => setUnsure(true)}>播完了，但題目沒有打開？</button>}
    {!checked && <button type="button" className="pr-main" disabled={!open || answers.filter(a => a !== undefined).length < l.questions.length} onClick={check}>對答案、看全文</button>}
    {checked && <ul className="ls-results">
      {l.questions.map((q, i) => <li key={i} data-ok={answers[i] === q.answer}><span lang="en">{q.q}</span><b lang="en">{answers[i] === q.answer ? '✓ ' : '✗ '}{q.options[q.answer]}</b></li>)}
    </ul>}
    {(checked || noVoice) && <>
      <Transcript lines={l.dialogue} playing={voice.playing} showZh={showZh} onPlayLine={i => voice.play(l.dialogue, i, true)} />
      <div className="pr-actions">
        <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>
        {checked && <button type="button" className="pr-link" onClick={() => { voice.stop(); setPlaysBefore(voice.completed); setSeenText(true); setAnswers([]); setChecked(false); setUnsure(false); setShowZh(false) }}>再做一次（不看字先聽）</button>}
      </div>
    </>}
  </section>
}

function HeldReading({ passage: data, done, onSubmit }: { passage: ReadPassage; done?: HeldPart; onSubmit: (picks: number[], correct: number) => void }) {
  // Options shuffled the same way every time (in the data the answers often go A, B, C in turn); saved in data order.
  const passage = useMemo(() => shownPassage(data), [data])
  const [picks, setPicks] = useState<number[]>(done?.picks ? shownPicks(passage.qs, done.picks) : [])
  const finished = !!done
  const ready = passage.qs.every((_, i) => picks[i] !== undefined)
  return <article className="up-held">
    <header><strong>沒看過的閱讀</strong><small>{passage.words} 字 · {passage.qs.length} 題 · {done ? '第一次成績 ' + done.correct + ' / ' + done.total + '（' + md(done.day) + '）' : '只有一次機會，不看中文、不查字典'}</small></header>
    <div className="rd-passage"><h3 lang="en">{passage.title}</h3>{passage.paras.map((p, i) => <p key={i} lang="en" className="rd-para">{p}</p>)}</div>
    <ol className="ls-qs">
      {passage.qs.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options rd-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={picks[i] === j} disabled={finished}
          onClick={() => { const n = [...picks]; n[i] = j; setPicks(n) }}>{o}</button>)}</div>
        {finished && <p className="up-why" data-ok={picks[i] === q.answer}>{picks[i] === q.answer ? '✓ 對。' : '✗ 答案是「' + q.options[q.answer] + '」。'}{q.why}</p>}
      </li>)}
    </ol>
    {!finished && <button type="button" className="pr-main" disabled={!ready} onClick={() => onSubmit(savedPicks(passage.qs, picks), passage.qs.filter((q, i) => picks[i] === q.answer).length)}>交卷（只有這一次）</button>}
    {finished && <details className="up-zh"><summary>看中文大意</summary><p className="rd-zh">{passage.zh}</p></details>}
  </article>
}

function HeldListening({ l, rate, done, onSubmit }: { l: PackListening; rate: number; done?: HeldPart; onSubmit: (picks: number[], correct: number, heard: boolean) => void }) {
  useVoiceList()
  const voice = useDialogueVoice(rate, l.accent)
  const hasAccent = accentVoices(l.accent).length > 0
  const [picks, setPicks] = useState<number[]>(done?.picks ?? [])
  const [plays, setPlays] = useState(0)
  const [noVoice, setNoVoice] = useState(false)
  const [unsure, setUnsure] = useState(false)
  const [showZh, setShowZh] = useState(false)
  useEffect(() => { if (voice.status === 'error') setNoVoice(true) }, [voice.status])
  const finished = !!done
  const open = finished || voice.completed > 0 || unsure || noVoice
  const ready = l.questions.every((_, i) => picks[i] !== undefined)
  const left = 2 - plays
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!finished && left <= 0) return
    if (!voice.play(l.dialogue)) { setNoVoice(true); return }
    if (!finished) setPlays(n => n + 1)
  }
  return <article className="up-held">
    <header><strong>沒聽過的聽力</strong><small>{l.questions.length} 題 · 電腦語音（{hasAccent ? accentNames[l.accent] + '口音' : '這台裝置沒有' + accentNames[l.accent] + '語音'}） · {done ? '第一次成績 ' + done.correct + ' / ' + done.total + (done.heard ? '' : '（沒有確認聽完）') + '（' + md(done.day) + '）' : '最多播兩次，不看字'}</small></header>
    <p className="ls-help">情境：{l.scene}</p>
    <button type="button" className="ls-play" onClick={playAll} disabled={!finished && left <= 0 && voice.playing === null}>
      {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />{finished ? '再聽一次' : left > 0 ? '播放（還能播 ' + left + ' 次）' : '兩次都播完了'}</>}
    </button>
    {noVoice && !finished && <p className="ls-help">這個瀏覽器沒辦法播放語音，只能看文字作答；這次會記成「沒有聲音」，不算聽力成績。</p>}
    {!open && plays > 0 && voice.playing === null && <button type="button" className="pr-link" onClick={() => setUnsure(true)}>播完了，但題目沒有打開？</button>}
    {(noVoice || finished) && <Transcript lines={l.dialogue} playing={voice.playing} showZh={finished && showZh} onPlayLine={i => voice.play(l.dialogue, i, true)} />}
    <ol className="ls-qs">
      {l.questions.map((q, i) => <li key={i}>
        <p lang="en">{q.q}</p>
        <div className="pr-options rd-options">{q.options.map((o, j) => <button key={j} type="button" lang="en" aria-pressed={picks[i] === j} disabled={finished || !open}
          onClick={() => { const n = [...picks]; n[i] = j; setPicks(n) }}>{o}</button>)}</div>
        {finished && <p className="up-why" data-ok={picks[i] === q.answer}>{picks[i] === q.answer ? '✓ 對' : '✗ 答案是「' + q.options[q.answer] + '」'}</p>}
      </li>)}
    </ol>
    {!finished && <button type="button" className="pr-main" disabled={!open || !ready} onClick={() => { voice.stop(); onSubmit(picks, l.questions.filter((q, i) => picks[i] === q.answer).length, voice.completed > 0 && !unsure && !noVoice) }}>交卷（只有這一次）</button>}
    {finished && <button type="button" className="pr-link" onClick={() => setShowZh(!showZh)}>{showZh ? '隱藏中文' : '看中文'}</button>}
  </article>
}

function HeldTest({ pack, state, onActivity, date }: { pack: Pack; state: PageProps['state']; onActivity: PageProps['update']; date: string }) {
  const open = heldOpen(state.curriculum, pack.unit)
  const rec = readHeld(state.notes, pack.unit)
  const [passage, setPassage] = useState<ReadPassage | null>(null)
  useEffect(() => {
    if (!open) return
    let alive = true
    import('../data/reading.json').then(f => { if (alive) setPassage((f.default as ReadPassage[]).find(p => p.id === pack.heldReading) ?? null) }).catch(() => {})
    return () => { alive = false }
  }, [open, pack.heldReading])
  if (!open) return <div className="pr-hint up-section">
    <strong>回測還沒開</strong>
    <p>單元 {pack.unit} 第 6 天（單元小關卡那天）開放，上完這個單元之後也能做。回測是一篇沒看過的閱讀和一段沒聽過的聽力，各只有一次機會，用來看這週學的能不能用在新的材料上。</p>
  </div>
  // Practice passages (best attempts) next to the unseen one: the gap shows whether the skill carries over.
  const train = pack.reading.map(id => readRecord(state.notes, id)).filter(r => r !== null)
  const trainRight = train.reduce((a, r) => a + (r.best ?? r).correct, 0), trainTotal = train.reduce((a, r) => a + (r.best ?? r).total, 0)
  const save = (part: 'reading' | 'listening', p: HeldPart) => onActivity(prev => ({
    ...prev, notes: logSkill(saveHeld(prev.notes, pack.unit, part, p), part === 'reading' ? 'read' : 'listen', date),
  }))
  return <section className="up-section">
    <p className="ls-help">沒看過的閱讀和聽力各一份，各只有一次機會：成績只記第一次，交卷後才看得到答案和解釋。照考試的方式做——不看中文、不查字典。</p>
    {(rec.reading || rec.listening) && <p className="up-compare">
      {rec.reading && <span>閱讀：練習文章 {trainTotal ? pct(trainRight, trainTotal) : '還沒做'} → 沒看過的 {pct(rec.reading.correct, rec.reading.total)}</span>}
      {rec.listening && <span>聽力：沒聽過的 {pct(rec.listening.correct, rec.listening.total)}{rec.listening.heard ? '' : '（沒有確認聽完）'}</span>}
    </p>}
    {passage ? <HeldReading passage={passage} done={rec.reading}
      onSubmit={(picks, correct) => save('reading', { day: date, picks, correct, total: passage.qs.length })} /> : <p>載入中……</p>}
    <HeldListening l={pack.heldListen} rate={state.settings.speechRate} done={rec.listening}
      onSubmit={(picks, correct, heard) => save('listening', { day: date, picks, correct, total: pack.heldListen.questions.length, heard })} />
  </section>
}

/** 單元讀聽說寫：a bridge unit's skills pack — chunks, readings, a listening, writing and speaking tasks, and the held-out test. */
export default function UnitPack({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
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
    test: held.reading && held.listening ? '✓' : heldOpen(cur, unit) ? '可以做' : '第 6 天',
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
    {tab === 'read' && <ReadingPath key={unit} state={state} onActivity={onActivity} date={date} only={pack.reading} />}
    {tab === 'listen' && pack.listen.map((l, i) => <PackListen key={unit + '-' + i} l={l} rate={rate} last={readListen(notes, unit, i)}
      onSave={r => onActivity(prev => ({ ...prev, notes: logSkill({ ...prev.notes, [listenKey(unit, i)]: JSON.stringify(withBestListen(readListen(prev.notes, unit, i), { ...r, day: date })) }, 'listen', date) }))} />)}
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
    {tab === 'test' && <HeldTest key={unit} pack={pack} state={state} onActivity={onActivity} date={date} />}
  </div>
}

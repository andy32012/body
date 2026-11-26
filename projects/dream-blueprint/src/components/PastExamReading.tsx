import { useEffect, useMemo, useState } from 'react'
import type { PageProps } from '../lib/store'
import { readBands, readLevels, readReadingProgress, saveReadingProgress, type ReadBand, type ReadLevel } from '../lib/reading'
import {
  blankParts, examKinds, examPassed, examPlaceKey, examWords, kindName, nextExamPassage, questionRange, readExamPlace, readExamRecord, saveExamRead, sameWord,
  type ExamKind, type ExamPassage, type ExamPlace, type ExamQuestion, type ExamWord,
} from '../lib/examReading'
import { addWordsToReview } from '../lib/dailyWords'
import { logSkill } from '../lib/bridge'
import { markSkill } from '../lib/wordSkills'
import { useTapGuard } from '../lib/tapGuard'
import { askClaude, useTaskContext } from '../lib/taskContext'
import { LookedUp, TapWords, useLookup } from './WordLookup'
import './reading.css'
import './exam-reading.css'

type Props = Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }
const letters = 'ABCD'
/** Where a passage left halfway is kept (reading.progress.exam), like the graded reading's. */
const PROGRESS = 'exam'
const PAGE = 40
const levelFiles: Record<ReadLevel, () => Promise<{ default: unknown }>> = {
  A1: () => import('../data/exam-reading-a1.json'),
  A2: () => import('../data/exam-reading-a2.json'),
  B1: () => import('../data/exam-reading-b1.json'),
  B2: () => import('../data/exam-reading-b2.json'),
}
const bandName = (b: ReadBand) => readBands.find(x => x.id === b)!.name
const optionText = (q: ExamQuestion, i: number) => '(' + letters[i] + ') ' + q.options[i]
/** The passage as plain text for Claude, blanks written as (40). */
const plainText = (p: ExamPassage) => p.paras.map(x => x.replace(/\{\{(\d+)\}\}/g, '（$1）')).join('\n')

/** 歷屆考題閱讀: past exam passages with their official answers, by level (A1–B2) and band. One question at a time, the answer
 *  shown right after; a passage left halfway comes back; the words of a passage can be practised (看中文寫英文) and put into the
 *  word review. It does not open, lock or count toward the graded reading (閱讀理解). */
export default function PastExamReading({ state, onActivity, date }: Props) {
  const [all, setAll] = useState<ExamPassage[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    Promise.all((['A1', 'A2', 'B1', 'B2'] as ReadLevel[]).map(l => levelFiles[l]()))
      .then(files => { if (alive) setAll(files.flatMap(f => f.default as ExamPassage[])) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  const [place, setPlace] = useState<ExamPlace | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [skip, setSkip] = useState<string[]>([])
  const [shown, setShown] = useState(PAGE)
  // Opening the page: a passage left halfway comes back first; otherwise the list he looked at last, or the first band
  // with a passage not passed yet.
  useEffect(() => {
    if (!all || place) return
    const half = readReadingProgress(state.notes, PROGRESS)
    const back = half && all.find(p => p.id === half.id)
    if (back) { setPlace({ level: back.level, band: back.band }); setCurrentId(back.id); return }
    const saved = readExamPlace(state.notes)
    const first = all.find(p => !examPassed(readExamRecord(state.notes, p.id))) ?? all[0]
    setPlace(saved ?? { level: first.level, band: first.band })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])

  if (failed) return <div className="pr-hint" role="alert"><strong>歷屆考題沒有下載到</strong><p>可能是網路斷了。連上網路後重新載入一次。</p>
    <div className="pr-actions"><button type="button" className="pr-main" onClick={() => location.reload()}>重新載入</button></div></div>
  if (!all || !place) return <p>載入中……</p>

  const inLevel = all.filter(p => p.level === place.level)
  const bands = readBands.filter(b => inLevel.some(p => p.band === b.id))
  const band = bands.some(b => b.id === place.band) ? place.band : bands[0].id
  const inBand = inLevel.filter(p => p.band === band)
  const kinds = examKinds.filter(k => inBand.some(p => p.kind === k.id))
  const kind = place.kind && kinds.some(k => k.id === place.kind) ? place.kind : undefined
  const list = kind ? inBand.filter(p => p.kind === kind) : inBand
  const passage = currentId ? all.find(p => p.id === currentId) ?? null : null

  function go(next: ExamPlace) {
    setPlace(next); setSkip([]); setShown(PAGE); setCurrentId(null)
    onActivity(prev => ({ ...prev, notes: { ...prev.notes, [examPlaceKey]: JSON.stringify(next) } }))
  }
  const toTop = () => requestAnimationFrame(() => document.querySelector('.ex')?.scrollIntoView({ block: 'start' }))
  function open(id: string) { setCurrentId(id); toTop() }
  function nextPassage(done?: string) {
    const nextSkip = done ? [...skip, done] : skip
    setSkip(nextSkip)
    const n = nextExamPassage(list, state.notes, nextSkip)
    if (n) open(n.id); else { setCurrentId(null); toTop() }
  }

  if (passage) return <ExamPassageView key={passage.id} passage={passage} state={state} onActivity={onActivity} date={date}
    where={passage.level + ' ' + bandName(passage.band) + (kind ? '・' + kindName(kind) : '')}
    onList={() => { setCurrentId(null); toTop() }} onNext={() => nextPassage(passage.id)} />

  const passedHere = (ps: readonly ExamPassage[]) => ps.filter(p => examPassed(readExamRecord(state.notes, p.id))).length
  const upNext = nextExamPassage(list, state.notes, skip)
  return <div className="pr-stack rd ex">
    <p className="ex-intro">會考、學測、指考和國家考試的閱讀題，答案都是官方公布的。用字彙和句子長度排到 A1–B2，跟「閱讀理解」同一把尺；在這裡讀不會影響閱讀理解的關卡。</p>
    <div className="pr-options rd-levels" role="group" aria-label="程度" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      {readLevels.map(l => {
        const here = all.filter(p => p.level === l.id)
        return <button key={l.id} type="button" aria-pressed={l.id === place.level} disabled={!here.length}
          onClick={() => go({ level: l.id, band: readBands.find(b => here.some(p => p.band === b.id))?.id ?? 'easy' })}>
          <span>{l.id}</span><small>{here.length} 篇</small><small>過關 {passedHere(here)}</small>
        </button>
      })}
    </div>
    <div className="pr-options rd-bands" role="group" aria-label={place.level + ' 小級'} style={{ gridTemplateColumns: `repeat(${bands.length}, minmax(0, 1fr))` }}>
      {bands.map(b => {
        const here = inLevel.filter(p => p.band === b.id)
        return <button key={b.id} type="button" aria-pressed={b.id === band} onClick={() => go({ level: place.level, band: b.id })}>
          <span>{b.name}</span><small>過關 {passedHere(here)} / {here.length}</small>
        </button>
      })}
    </div>
    {kinds.length > 1 && <div className="ex-kinds" role="group" aria-label="哪一種考試">
      <button type="button" aria-pressed={!kind} onClick={() => go({ level: place.level, band })}>全部</button>
      {kinds.map(k => <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => go({ level: place.level, band, kind: k.id })}>{k.name}</button>)}
    </div>}
    <div className="pr-actions">
      {upNext ? <button type="button" className="pr-main" onClick={() => open(upNext.id)}>{readExamRecord(state.notes, upNext.id) ? '再讀一篇還沒過關的' : '開始下一篇'}：{upNext.source}</button>
        : <p className="ls-help">這一組都過關了{skip.length ? '（或這一輪略過了）' : ''}。換一個小級，或從清單點一篇再讀。</p>}
    </div>
    <ul className="ex-list">{list.slice(0, shown).map(p => {
      const rec = readExamRecord(state.notes, p.id)
      return <li key={p.id}><button type="button" onClick={() => open(p.id)} data-done={examPassed(rec) || undefined}>
        <span><b>{p.source}</b> · {questionRange(p)}</span>
        <small>{p.qs.length} 題 · {p.words} 字</small>
        <em>{rec ? (examPassed(rec) ? '過關 ✓ ' : '上次 ') + (rec.best ?? rec).correct + ' / ' + rec.total : '還沒讀'}</em>
      </button></li>
    })}</ul>
    {list.length > shown && <button type="button" className="pr-link" onClick={() => setShown(n => n + PAGE)}>再列出 {Math.min(PAGE, list.length - shown)} 篇（這一組共 {list.length} 篇）</button>}
  </div>
}

function ExamPassageView({ passage, state, onActivity, date, where, onList, onNext }: Props & { passage: ExamPassage; where: string; onList: () => void; onNext: () => void }) {
  const half = readReadingProgress(state.notes, PROGRESS)
  const [picks, setPicks] = useState<number[]>(() => half && half.id === passage.id && half.picks.length < passage.qs.length ? half.picks : [])
  const [saved, setSaved] = useState(false)
  const [redo, setRedo] = useState(false)
  const look = useLookup(useMemo(() => ({ words: passage.gloss }), [passage]))
  const at = picks.length
  const done = at >= passage.qs.length
  const q = passage.qs[at]
  const last = at > 0 ? passage.qs[at - 1] : null
  const lastPick = at > 0 ? picks[at - 1] : -1
  const ready = useTapGuard(passage.id + ':' + at)
  const before = readExamRecord(state.notes, passage.id)
  const correct = passage.qs.filter((x, i) => picks[i] === x.answer).length
  useTaskContext({
    label: '歷屆考題閱讀：' + passage.source + ' ' + questionRange(passage) + (q ? '（原卷第 ' + q.n + ' 題）' : ''),
    detail: [
      '他在讀歷屆考題的閱讀（' + passage.exam + '，' + questionRange(passage) + '，答案是官方公布的）：\n' + plainText(passage),
      last ? '剛做完原卷第 ' + last.n + ' 題：' + (last.blank ? '第 ' + last.n + ' 格要填什麼' : last.q) + '\n選項：' + last.options.map((_, i) => optionText(last, i)).join(' / ')
        + '\n官方答案：' + optionText(last, last.answer) + '；他選了 ' + optionText(last, lastPick) + '。他問為什麼時，用中文說明，指出文章裡的線索。' : '',
      q ? '現在這題（原卷第 ' + q.n + ' 題）：' + (q.blank ? '第 ' + q.n + ' 格要填什麼' : q.q) + '\n選項：' + q.options.map((_, i) => optionText(q, i)).join(' / ')
        + '\n官方答案是 ' + optionText(q, q.answer) + '，他作答前不要說，只帶他回到文章找線索。' : '這篇的題目都做完了。',
    ].filter(Boolean).join('\n'),
  })
  function pick(i: number) {
    // The next question appears under the finger: a double tap must not answer it too.
    if (done || !ready()) return
    const next = [...picks, i]
    setPicks(next)
    if (next.length === passage.qs.length) {
      const right = passage.qs.filter((x, j) => next[j] === x.answer).length
      // Each day a passage is read counts as a reading day. A second try on the same day is practice (saveExamRead).
      onActivity(prev => ({ ...prev, notes: logSkill(saveExamRead(saveReadingProgress(prev.notes, PROGRESS, null), passage.id, { day: date, picks: next, correct: right, total: passage.qs.length }), 'read', date) }))
      setSaved(true)
    } else if (!redo) {
      onActivity(prev => ({ ...prev, notes: saveReadingProgress(prev.notes, PROGRESS, { id: passage.id, picks: next }) }))
    }
  }
  function again() { setPicks([]); setSaved(false); setRedo(true) }
  const blankNow = q?.blank ? q.n : null
  /** A blank of the passage: its number, and once answered the official answer written in. */
  function blank(n: number, key: number) {
    const i = passage.qs.findIndex(x => x.n === n)
    const answered = i >= 0 && i < at
    return <span key={key} className="ex-blank" data-now={n === blankNow || undefined} data-skipped={i < 0 || undefined} data-ok={answered ? picks[i] === passage.qs[i].answer : undefined}>
      <small>{n}</small>{answered ? <span lang="en">{passage.qs[i].options[passage.qs[i].answer]}</span> : null}
    </span>
  }
  const rec = saved ? readExamRecord(state.notes, passage.id) : null
  return <div className="pr-stack rd ex">
    <button type="button" className="pr-link ex-back" onClick={onList}>← 回清單（{where}）</button>
    <article className="rd-passage">
      <header><h3>{passage.source} · {questionRange(passage)}</h3>
        <small>{passage.exam.split('｜')[0].replace(/（閱讀）$/, '')} · {passage.level} {bandName(passage.band)} · {passage.words} 字{before ? ' · 上次 ' + before.correct + ' / ' + before.total : ''}</small></header>
      {passage.paras.map((para, i) => <div key={i} className="ex-para">
        <p lang="en" className="rd-para">{blankParts(para).map((part, j) => 'blank' in part ? blank(part.blank, j)
          : <TapWords key={j} text={part.text} line={i} onWord={look.tap} picked={look.pickedForm} pickedLine={look.line} />)}</p>
        {look.line === i && look.box}
      </div>)}
      <small className="ex-note">不會的字點一下看意思。</small>
      {passage.picture && <small className="ex-note">原卷這篇附了一張圖，這裡沒有放；留下來的題目不用看圖也答得出來。</small>}
      {passage.skipped?.length ? <small className="ex-note">第 {passage.skipped.join('、')} 格要看原卷的圖才答得出來，這裡不考。</small> : null}
      {passage.gloss?.length ? <p className="ex-gloss"><small>原卷附註</small>{passage.gloss.map(g => <span key={g.en}><b lang="en">{g.en}</b> {g.zh}</span>)}</p> : null}
    </article>
    {last && <div className="pr-hint rd-feedback" data-ok={lastPick === last.answer}>
      <strong>{lastPick === last.answer ? '原卷第 ' + last.n + ' 題答對了' : '原卷第 ' + last.n + ' 題的答案是 ' + optionText(last, last.answer)}</strong>
      {lastPick !== last.answer && <p>你選了 {optionText(last, lastPick)}。回文章找一找線索，或請 Claude 說明。</p>}
      <div className="pr-actions"><button type="button" className="pr-link" onClick={() => askClaude('原卷第 ' + last.n + ' 題為什麼答案是 ' + optionText(last, last.answer) + '？' + (lastPick === last.answer ? '' : '我選了 ' + optionText(last, lastPick) + '。') + '請用中文說明文章裡的線索。')}>問 Claude 為什麼</button></div>
    </div>}
    {q && <section className="rd-q">
      <p className="rd-qmeta">第 {at + 1} / {passage.qs.length} 題 · 原卷第 {q.n} 題{redo ? ' · 再做一次（練習）' : ''}</p>
      <h4 lang="en" className="ex-stem">{q.blank ? <span lang="zh-TW">文章裡第 {q.n} 格，填哪一個最好？</span> : q.q}</h4>
      <div className="pr-options rd-options">{q.options.map((o, i) => <button key={i} type="button" lang="en" onClick={() => pick(i)}><b>({letters[i]})</b> {o}</button>)}</div>
    </section>}
    {done && <div className="pr-hint">
      <strong>這篇答對 {correct} / {passage.qs.length}{redo || rec?.practice ? '（今天已經做過這篇：這次是練習，不算新的過關' + (examPassed(rec) ? '；之前的過關留著 ✓' : '') + '）'
        : examPassed(rec) ? '，過關 ✓' : '，七成以上算過關，之後會再排到'}</strong>
      <ul className="rd-review">{passage.qs.map((x, i) => <li key={x.n} data-ok={picks[i] === x.answer}>第 {x.n} 題：{picks[i] === x.answer ? '對' : '錯，答案 (' + letters[x.answer] + ')'}</li>)}</ul>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={onNext}>下一篇 →</button>
        <button type="button" className="pr-link" onClick={again}>這篇再做一次（練習）</button>
        <button type="button" className="pr-link" onClick={onList}>回清單</button>
      </div>
    </div>}
    {done && <ExamWords passage={passage} state={state} onActivity={onActivity} date={date} />}
    <LookedUp items={look.seen} state={state} onActivity={onActivity} date={date} />
  </div>
}

/** The passage's words after the questions: the paper's word notes and a few harder table words. 看中文寫英文 one by one;
 *  table words written right count as 寫出 (the word's four skills), and any of them can go into the word review. */
function ExamWords({ passage, state, onActivity, date }: Props & { passage: ExamPassage }) {
  const [words] = useState<ExamWord[]>(() => examWords(passage, { known: state.knownWords, learning: state.learningWords, cards: state.cards.map(c => c.id) }))
  const [step, setStep] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [checked, setChecked] = useState<boolean | null>(null)
  const [results, setResults] = useState<boolean[]>([])
  // 對答案 turns into 下一個 in the same place: a double tap must not skip the answer.
  const ready = useTapGuard(String(step) + ':' + String(checked))
  if (!words.length) return null
  const cards = new Set(state.cards.map(c => c.id))
  const reviewable = (list: ExamWord[]) => list.filter(w => w.key && !cards.has('word:' + w.key))
  const add = (list: ExamWord[]) => onActivity(prev => addWordsToReview(prev, list.flatMap(w => w.key ? [w.key] : []), date))
  const w = step !== null ? words[step] : undefined
  function check(gaveUp = false) {
    if (!w || checked !== null || !ready()) return
    const ok = !gaveUp && sameWord(typed, w.en)
    setChecked(ok)
    setResults(r => [...r, ok])
    if (ok && w.key) onActivity(prev => ({ ...prev, notes: markSkill(prev.notes, w.key!, 'write', date) }))
  }
  function next() { if (!ready()) return; setStep(s => (s ?? 0) + 1); setTyped(''); setChecked(null) }
  const finished = step !== null && step >= words.length
  const wrong = words.filter((_, i) => results[i] === false)
  return <section className="ex-words">
    <strong>這篇的單字</strong>
    {step === null && <>
      <ul>{words.map(x => <li key={x.en}><b lang="en">{x.en}</b> {x.zh}{x.note ? <small> · 原卷附註</small> : null}{x.key && cards.has('word:' + x.key) ? <small className="st-in">已在單字複習</small> : null}</li>)}</ul>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={() => setStep(0)}>看中文寫英文（{words.length} 個字）</button>
        {reviewable(words).length > 0 && <button type="button" className="pr-link" onClick={() => add(reviewable(words))}>把字表裡的 {reviewable(words).length} 個字加進單字複習</button>}
      </div>
    </>}
    {w && <div className="ex-write">
      <p className="rd-qmeta">第 {step! + 1} / {words.length} 個{w.note ? ' · 原卷附註的意思' : ''}</p>
      <p className="ex-zh">{w.zh}</p>
      <input lang="en" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={typed} disabled={checked !== null} aria-label={'寫出「' + w.zh + '」的英文'}
        onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { if (checked === null) check(); else next() } }} />
      {checked === null ? <div className="pr-actions">
        <button type="button" className="pr-main" disabled={!typed.trim()} onClick={() => check()}>對答案</button>
        <button type="button" className="pr-link" onClick={() => check(true)}>不會，看答案</button>
      </div> : <div className="pr-actions">
        <p className="ex-result" data-ok={checked}>{checked ? '對了：' : '答案：'}<b lang="en">{w.en}</b></p>
        <button type="button" className="pr-main" onClick={next}>{step! + 1 < words.length ? '下一個 →' : '看結果'}</button>
      </div>}
    </div>}
    {finished && <>
      <p>寫對 {results.filter(Boolean).length} / {words.length} 個。{wrong.length ? '寫錯的：' + wrong.map(x => x.en).join('、') : '全部寫對了'}</p>
      <div className="pr-actions">
        {reviewable(wrong).length > 0 && <button type="button" className="pr-main" onClick={() => add(reviewable(wrong))}>把寫錯的 {reviewable(wrong).length} 個字加進單字複習</button>}
        <button type="button" className="pr-link" onClick={() => { setStep(0); setResults([]); setTyped(''); setChecked(null) }}>再寫一次</button>
      </div>
    </>}
  </section>
}

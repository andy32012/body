import AskWhy from './AskWhy'
import { useMemo, useState } from 'react'
import type { PageProps } from '../lib/store'
import { readBands, readReadingProgress, saveReadingProgress, type ReadBand } from '../lib/reading'
import { blankNumbers, blankParts, examPassed, examWords, readExamRecord, saveExamRead, sameWord, type ExamPassage, type ExamQuestion, type ExamWord } from '../lib/examReading'
import { addWordsToReview } from '../lib/dailyWords'
import { logSkill } from '../lib/bridge'
import { markSkill } from '../lib/wordSkills'
import { useTapGuard } from '../lib/tapGuard'
import { askClaude, useTaskContext } from '../lib/taskContext'
import { LookedUp, TapWords, useLookup } from './WordLookup'
import './reading.css'
import './exam-reading.css'

type Base = Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }
const letters = 'ABCD'
/** Where a passage left halfway is kept (reading.progress.exam), apart from the graded passages'. */
export const examProgressSet = 'exam'
const bandName = (b: ReadBand) => readBands.find(x => x.id === b)!.name
const optionText = (q: ExamQuestion, i: number) => '(' + letters[i] + ') ' + q.options[i]

/** One past-exam passage inside 閱讀測驗: one question at a time with the answer shown right after; a passage left halfway
 *  comes back; afterwards its words can be practised (看中文寫英文) and put into the word review. Nothing on screen says
 *  which exam it came from: no exam name, no paper question numbers (blanks are numbered 1, 2, 3 in the text). */
export default function ExamPassageView({ passage, state, onActivity, date, onNext }: Base & { passage: ExamPassage; onNext: () => void }) {
  const half = readReadingProgress(state.notes, examProgressSet)
  const [picks, setPicks] = useState<number[]>(() => half && half.id === passage.id && half.picks.length < passage.qs.length ? half.picks : [])
  const [saved, setSaved] = useState(false)
  const [redo, setRedo] = useState(false)
  const at = picks.length
  const done = at >= passage.qs.length
  const look = useLookup(useMemo(() => ({ words: passage.gloss }), [passage]), { rate: state.settings.speechRate, askTeacher: done })
  const nums = useMemo(() => blankNumbers(passage), [passage])
  const q = passage.qs[at]
  const last = at > 0 ? passage.qs[at - 1] : null
  const lastPick = at > 0 ? picks[at - 1] : -1
  const ready = useTapGuard(passage.id + ':' + at)
  const before = readExamRecord(state.notes, passage.id)
  const correct = passage.qs.filter((x, i) => picks[i] === x.answer).length
  const where = passage.level + ' ' + bandName(passage.band)
  /** What a question is called on screen: the k-th blank, or the i-th question of this passage. */
  const named = (x: ExamQuestion, i: number) => x.blank ? '第 ' + (nums.get(x.n) ?? i + 1) + ' 格' : '第 ' + (i + 1) + ' 題'
  const plain = passage.paras.map(x => x.replace(/\{\{(\d+)\}\}/g, (_, n: string) => '（' + (nums.get(Number(n)) ?? n) + '）')).join('\n')
  useTaskContext({
    label: '閱讀測驗：' + where + (q ? '（' + named(q, at) + '）' : ''),
    detail: [
      '他在做閱讀測驗（' + where + '），文章裡的空格寫成（1）（2）：\n' + plain,
      last ? '剛做完' + named(last, at - 1) + '：' + (last.blank ? '這一格要填什麼' : last.q) + '\n選項：' + last.options.map((_, i) => optionText(last, i)).join(' / ')
        + '\n答案：' + optionText(last, last.answer) + '；他選了 ' + optionText(last, lastPick) + '。他問為什麼時，用中文說明，指出文章裡的線索。' : '',
      q ? '現在這題（' + named(q, at) + '）：' + (q.blank ? '這一格要填什麼' : q.q) + '\n選項：' + q.options.map((_, i) => optionText(q, i)).join(' / ')
        + '\n答案是 ' + optionText(q, q.answer) + '，他作答前不要說，只帶他回到文章找線索。' : '這篇的題目都做完了。',
      '不要提這篇文章出自哪一種考試或哪一年。',
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
      onActivity(prev => ({ ...prev, notes: logSkill(saveExamRead(saveReadingProgress(prev.notes, examProgressSet, null), passage.id, { day: date, picks: next, correct: right, total: passage.qs.length }), 'read', date) }))
      setSaved(true)
    } else if (!redo) {
      onActivity(prev => ({ ...prev, notes: saveReadingProgress(prev.notes, examProgressSet, { id: passage.id, picks: next }) }))
    }
  }
  function again() { setPicks([]); setSaved(false); setRedo(true) }
  const blankNow = q?.blank ? q.n : null
  /** A blank of the passage: its number on screen, and once answered the answer written in. */
  function blank(n: number, key: number) {
    const i = passage.qs.findIndex(x => x.n === n)
    const answered = i >= 0 && i < at
    return <span key={key} className="ex-blank" data-now={n === blankNow || undefined} data-skipped={i < 0 || undefined} data-ok={answered ? picks[i] === passage.qs[i].answer : undefined}>
      <small>{nums.get(n) ?? n}</small>{answered ? <span lang="en">{passage.qs[i].options[passage.qs[i].answer]}</span> : null}
    </span>
  }
  const rec = saved ? readExamRecord(state.notes, passage.id) : null
  return <div className="pr-stack rd ex">
    <article className="rd-passage">
      <header><h3>{where}</h3><small>{passage.words} 字{before ? ' · 上次 ' + before.correct + ' / ' + before.total : ''}</small></header>
      {passage.paras.map((para, i) => <div key={i} className="ex-para">
        <p lang="en" className="rd-para">{blankParts(para).map((part, j) => 'blank' in part ? blank(part.blank, j)
          : <TapWords key={j} text={part.text} line={i} onWord={look.tap} picked={look.pickedForm} pickedLine={look.line} />)}</p>
        {look.line === i && look.box}
      </div>)}
      <small className="ex-note">{done ? '點文章裡的字看意思、聽發音，也可以問 Claude 老師。' : '不會的字點一下看意思。'}</small>
      {passage.picture && <small className="ex-note">這篇原本附了一張圖，這裡沒有放；留下來的題目不用看圖也答得出來。</small>}
      {passage.skipped?.length ? <small className="ex-note">第 {passage.skipped.map(n => nums.get(n) ?? n).join('、')} 格要看圖才答得出來，這裡不考。</small> : null}
      {passage.gloss?.length ? <p className="ex-gloss"><small>單字附註</small>{passage.gloss.map(g => <span key={g.en}><b lang="en">{g.en}</b> {g.zh}</span>)}</p> : null}
    </article>
    {last && <div className="pr-hint rd-feedback" data-ok={lastPick === last.answer}>
      <strong>{lastPick === last.answer ? named(last, at - 1) + '答對了' : named(last, at - 1) + '的答案是 ' + optionText(last, last.answer)}</strong>
      {lastPick !== last.answer && <p>你選了 {optionText(last, lastPick)}。回文章找一找線索，或請 Claude 說明。</p>}
      <div className="pr-actions"><button type="button" className="pr-link" onClick={() => askClaude(named(last, at - 1) + '為什麼答案是 ' + optionText(last, last.answer) + '？' + (lastPick === last.answer ? '' : '我選了 ' + optionText(last, lastPick) + '。') + '請用中文說明文章裡的線索。')}>問 Claude 為什麼</button></div>
    </div>}
    {q && <section className="rd-q">
      <p className="rd-qmeta">第 {at + 1} / {passage.qs.length} 題{redo ? ' · 再做一次（練習）' : ''}</p>
      <h4 lang="en" className="ex-stem">{q.blank ? <span lang="zh-TW">文章裡{named(q, at)}，填哪一個最好？</span> : q.q}</h4>
      <div className="pr-options rd-options">{q.options.map((o, i) => <button key={i} type="button" lang="en" onClick={() => pick(i)}><b>({letters[i]})</b> {o}</button>)}</div>
    </section>}
    {!done && at === 0 && <button type="button" className="pr-link" onClick={onNext}>換一篇</button>}
    {done && <div className="pr-hint">
      <strong>這篇答對 {correct} / {passage.qs.length}{redo || rec?.practice ? '（今天已經做過這篇：這次是練習，不算新的過關' + (examPassed(rec) ? '；之前的過關留著 ✓' : '') + '）'
        : examPassed(rec) ? '，過關 ✓' : '，七成以上算過關，之後會再排到'}</strong>
      <ul className="rd-review">{passage.qs.map((x, i) => <li key={x.n} data-ok={picks[i] === x.answer}>{named(x, i)}：{picks[i] === x.answer ? '對' : '錯，答案 (' + letters[x.answer] + ')'}</li>)}</ul>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={onNext}>下一篇 →</button>
        <button type="button" className="pr-link" onClick={again}>這篇再做一次（練習）</button>
      </div>
    </div>}
    {done && <ExamWords passage={passage} state={state} onActivity={onActivity} date={date} />}
    <LookedUp items={look.seen} state={state} onActivity={onActivity} date={date} />
  </div>
}

/** The passage's words after the questions: the word notes printed with it and a few harder table words. 看中文寫英文 one by one;
 *  table words written right count as 寫出 (the word's four skills), and any of them can go into the word review. */
function ExamWords({ passage, state, onActivity, date }: Base & { passage: ExamPassage }) {
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
      <ul>{words.map(x => <li key={x.en}><b lang="en">{x.en}</b> {x.zh}{x.note ? <small> · 附註</small> : null}{x.key && cards.has('word:' + x.key) ? <small className="st-in">已在單字複習</small> : null}</li>)}</ul>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={() => setStep(0)}>看中文寫英文（{words.length} 個字）</button>
        {reviewable(words).length > 0 && <button type="button" className="pr-link" onClick={() => add(reviewable(words))}>把字表裡的 {reviewable(words).length} 個字加進單字複習</button>}
      </div>
    </>}
    {w && <div className="ex-write">
      <p className="rd-qmeta">第 {step! + 1} / {words.length} 個{w.note ? ' · 附註的意思' : ''}</p>
      <p className="ex-zh">{w.zh}</p>
      <input lang="en" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={typed} disabled={checked !== null} aria-label={'寫出「' + w.zh + '」的英文'}
        onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { if (checked === null) check(); else next() } }} />
      {checked === null ? <div className="pr-actions">
        <button type="button" className="pr-main" disabled={!typed.trim()} onClick={() => check()}>對答案</button>
        <button type="button" className="pr-link" onClick={() => check(true)}>不會，看答案</button>
      </div> : <div className="pr-actions">
        <p className="ex-result" data-ok={checked}>{checked ? '對了：' : '答案：'}<b lang="en">{w.en}</b></p>
        {!checked && <AskWhy label="問 Claude" q={{ source: '歷屆考題的單字（看中文寫英文）', stem: '寫出「' + w.zh + '」的英文', picked: typed, answer: w.en, right: false }} />}
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

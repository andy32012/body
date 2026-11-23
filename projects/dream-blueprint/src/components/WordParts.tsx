import { useState } from 'react'
import type { PageProps } from '../lib/store'
import { AskWord } from './AIChat'
import { dayKey } from '../lib/progress'
import { PARTS_A_DAY, dayCountKey, guessQuiz, isLearned, learnedKey, learnedParts, learnedToday, meaningQuiz, moreKey, partsForToday, reviewRound, wordParts, type PartQuiz, type WordPart } from '../lib/wordParts'

const kinds = ['字首', '字根', '字尾'] as const

/** Three choices; a wrong one is crossed out and he tries again, so the right answer is always found by himself. */
function Choices({ quiz, onRight, lang }: { quiz: PartQuiz; onRight: (firstTry: boolean) => void; lang?: string }) {
  const [wrong, setWrong] = useState<number[]>([])
  const [right, setRight] = useState(false)
  return <div className="wp-options" role="group">
    {quiz.options.map((o, i) => <button type="button" key={o} lang={lang} disabled={right || wrong.includes(i)} data-state={right && i === quiz.answer ? 'right' : wrong.includes(i) ? 'wrong' : undefined}
      onClick={() => { if (i === quiz.answer) { setRight(true); onRight(wrong.length === 0) } else setWrong(w => [...w, i]) }}>{o}</button>)}
  </div>
}

function PartCard({ part, n, total, onLearned }: { part: WordPart; n: number; total: number; onLearned: () => void }) {
  const [guessed, setGuessed] = useState(false)
  return <article className="wp-card">
    <small>今天第 {n} 個／{total} · {part.type}</small>
    <strong className="vocab-term" lang="en">{part.part}</strong>
    <p className="wp-meaning">{part.meaning} <AskWord en={part.part} zh={part.type + '：' + part.meaning} /></p>
    <ul className="wp-examples">{part.examples.map(e => <li key={e.en}>
      <span><b lang="en">{e.en}</b> · {e.zh}</span>
      {e.how && <small>{e.how}</small>}
    </li>)}</ul>
    <div className="wp-guess">
      <p>猜猜看：<b lang="en">{part.guess.en}</b> 是什麼意思？</p>
      <Choices quiz={guessQuiz(part)} onRight={() => setGuessed(true)} />
      {guessed && <p className="wp-ok" role="status">對，<span lang="en">{part.guess.en}</span>＝{part.guess.zh}。<AskWord en={part.guess.en} zh={part.guess.zh} /></p>}
    </div>
    <button type="button" className="wp-next" disabled={!guessed} onClick={onLearned}>記下這個{part.type}{n < total ? '，下一個' : ''}</button>
  </article>
}

function Review({ checks }: Pick<PageProps['state'], 'checks'>) {
  const [round, setRound] = useState(0)
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState(0)
  const [firstTries, setFirstTries] = useState(0)
  const [answered, setAnswered] = useState(false)
  const items = reviewRound(checks, round)
  if (!items.length) return null
  if (!open) return <button type="button" onClick={() => { setOpen(true); setAt(0); setFirstTries(0); setAnswered(false) }}>複習已學的（{items.length} 題）</button>
  const part = items[at]
  if (!part) return <div className="wp-card">
    <p role="status">複習完了：{items.length} 題裡有 {firstTries} 題一次就對。</p>
    <div className="vocab-tabs">
      <button type="button" onClick={() => { setRound(r => r + 1); setAt(0); setFirstTries(0); setAnswered(false) }}>再來一輪</button>
      <button type="button" onClick={() => setOpen(false)}>先到這裡</button>
    </div>
  </div>
  return <article className="wp-card">
    <small>複習第 {at + 1} 題／{items.length} · {part.type}</small>
    <p><b className="vocab-term" lang="en">{part.part}</b>是什麼意思？</p>
    <Choices key={part.id + round} quiz={meaningQuiz(part, round)} onRight={first => { setAnswered(true); if (first) setFirstTries(n => n + 1) }} />
    {answered && <>
      <p className="wp-ok" role="status">{part.examples.slice(0, 2).map(e => e.en + '（' + e.zh + '）').join('、')}</p>
      <button type="button" className="wp-next" onClick={() => { setAt(at + 1); setAnswered(false) }}>{at + 1 < items.length ? '下一題' : '看結果'}</button>
    </>}
  </article>
}

/** Everyday prefixes, roots and suffixes: a few new ones a day, each with words that show it and one word to work out. */
export default function WordParts({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const today = dayKey()
  const parts = partsForToday(state.checks, state.notes, today)
  const learned = learnedParts(state.checks)
  const doneToday = learnedToday(state.notes, today)
  const left = wordParts.length - learned.length
  function learn(p: WordPart) {
    update(prev => prev.checks[learnedKey(p.id)] ? prev : {
      ...prev, checks: { ...prev.checks, [learnedKey(p.id)]: true },
      notes: { ...prev.notes, [dayCountKey(today)]: String(learnedToday(prev.notes, today) + 1) },
    })
  }
  return <div className="wp">
    <p>看懂字首、字根、字尾，長的單字就能拆開來猜意思。一天 {PARTS_A_DAY} 個，已學 <b>{learned.length}</b>／{wordParts.length}。</p>
    {parts[0] ? <PartCard key={parts[0].id} part={parts[0]} n={doneToday + 1} total={doneToday + parts.length} onLearned={() => learn(parts[0])} />
      : left ? <div className="wp-card">
        <p role="status">今天的 {doneToday} 個學完了。</p>
        <button type="button" onClick={() => update(prev => ({ ...prev, notes: { ...prev.notes, [moreKey(today)]: String((Number(prev.notes[moreKey(today)]) || 0) + 1) } }))}>再學 {Math.min(PARTS_A_DAY, left)} 個</button>
      </div> : <p role="status">{wordParts.length} 個都學過了。</p>}
    <Review checks={state.checks} />
    <details className="wp-all"><summary>全部 {wordParts.length} 個（學過的打勾）</summary>
      {kinds.map(kind => <section key={kind}>
        <h4>{kind}</h4>
        <ul>{wordParts.filter(p => p.type === kind).map(p => <li key={p.id} data-learned={isLearned(state.checks, p)}>
          <span><b lang="en">{p.part}</b> {p.meaning}{isLearned(state.checks, p) ? ' ✓' : ''}</span>
          <small lang="en">{p.examples.map(e => e.en).join(', ')}</small>
        </li>)}</ul>
      </section>)}
    </details>
  </div>
}

import AskWhy from './AskWhy'
import { useEffect, useState, type ReactNode } from 'react'
import { reached } from '../lib/unlock'
import { Volume2 } from 'lucide-react'
import curriculum from '../data/curriculum.json'
import type { PageProps } from '../lib/store'
import { useTaskContext } from '../lib/taskContext'
import { checkDrill, drillAnswer, drillNames, drillSummary, drillsForDay, grammarFor, grammarUnits, saveDrill, type Drill, type GrammarMistake, type GrammarStep, type GrammarTable } from '../lib/grammar'
import { addWeak, labelOfUnit } from '../lib/weakPoints'
import './grammar.css'

type SaveNotes = (apply: (notes: Record<string, string>) => Record<string, string>) => void
const stageNames: Record<string, string> = { A: 'A1 → A2', B: 'A2 → B1', C: 'B1 → B2', BR: 'B1 → B2 橋接' }

function say(text: string, rate: number) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = Number.isFinite(rate) ? Math.max(0.5, Math.min(1.4, rate)) : 0.85
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

/** The teaching itself: the steps with examples, one table to look things up in, and the mistakes learners usually make. */
export function GrammarExplain({ unit, rate }: { unit: number; rate: number }) {
  const g = grammarFor(unit)
  if (!g) return null
  return <>
    <ExplainBody steps={g.steps} table={g.table} mistakes={g.mistakes} rate={rate} />
    {/* A1–A2 items this unit did not teach before (checked against the Core Inventory): extra, practice only. */}
    {g.extra && <section className="gm-extra" aria-label="補充">
      <h3>補充：A1／A2 也要會——{g.extra.title}</h3>
      <ExplainBody steps={g.extra.steps} mistakes={[]} rate={rate} />
      <p className="gm-extra-note">補充練習：做來熟悉，不算進這一課的七題，也不會排進每日課。</p>
      {g.extra.drills.map((d, i) => <DrillCard key={unit + '-x' + i} drill={d} />)}
    </section>}
  </>
}
/** The same teaching from any source (a course unit, a section of 完整文法). Each example can be played. */
export function ExplainBody({ steps, table, mistakes, rate }: { steps: GrammarStep[]; table?: GrammarTable; mistakes: GrammarMistake[]; rate: number }) {
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  const g = { steps, table, mistakes }
  return <div className="gm-explain">
    <ol className="gm-steps">
      {g.steps.map((s, i) => <li key={i}>
        <h4><i aria-hidden="true">{i + 1}</i>{s.t}</h4>
        <p>{s.p}</p>
        <ul className="gm-ex">{s.ex.map(e => <li key={e.en}>
          <button type="button" className="gm-say" aria-label={'聽這一句：' + e.en} onClick={() => say(e.en, rate)}><Volume2 size={14} /></button>
          <span><b lang="en">{e.en}</b><small>{e.zh}</small></span>
        </li>)}</ul>
      </li>)}
    </ol>
    {g.table && <figure className="gm-table">
      <figcaption>{g.table.title}</figcaption>
      <div className="gm-table-scroll"><table>
        <thead><tr>{g.table.head.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{g.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table></div>
    </figure>}
    {g.mistakes.length > 0 && <>
    <section className="gm-mistakes">
      <h4>常見錯誤</h4>
      {g.mistakes.map(m => <p key={m.bad}>
        <span className="gm-bad" lang="en">✗ {m.bad}</span>
        <span className="gm-good" lang="en">✓ {m.good}</span>
        <small>{m.why}</small>
      </p>)}
    </section>
    </>}
  </div>
}

const drillInstruction = (drill: Drill) => drill.k === 'choose' ? '' : drill.instruction ??
  (drill.k === 'fix' ? '這句有一個地方錯了，改成正確的句子。' : '')

/** One drill with feedback. Report the first try and the first successful correction separately. */
export function DrillCard({ drill, onDone, onCorrected }: {
  drill: Drill; onDone?: (right: boolean, said: string) => void; onCorrected?: () => void
}) {
  // Start from the sentence to edit so only the requested part needs retyping on a phone.
  const [text, setText] = useState(drill.k === 'fix' ? drill.q : '')
  const [missed, setMissed] = useState<number[]>([])
  const [result, setResult] = useState<boolean | null>(null)
  const [solved, setSolved] = useState(false)
  const [said, setSaid] = useState('')
  const untouched = drill.k === 'fix' ? text.trim() === drill.q : !text.trim()
  const instruction = drillInstruction(drill)
  const stem = instruction ? instruction + '\n' + drill.q : (drill.k === 'fill' ? '填空：' : '') + drill.q
  function check(answer: string | number) {
    if (solved) return
    const right = checkDrill(drill, answer)
    const typed = typeof answer === 'number' ? (drill.k === 'choose' ? drill.options[answer] ?? '' : '') : answer
    if (result === null) { setResult(right); onDone?.(right, typed) }
    else if (right) onCorrected?.()
    setSaid(typed)
    if (right) setSolved(true)
    else if (typeof answer === 'number') setMissed(m => [...m, answer])
  }
  const gaveUp = result === false && !said.trim() || (drill.k === 'fix' && said.trim() === drill.q)
  return <div className="gm-drill" data-kind={drill.k}>
    {instruction && <p className="gm-ask">{instruction}</p>}
    <p className={drill.k === 'fix' && !drill.instruction ? 'gm-q gm-wrong' : 'gm-q'} lang="en">{drill.q}</p>
    {drill.k === 'choose' && <div className="pr-options gm-options">
      {drill.options.map((o, i) => <button key={o} type="button" lang="en" disabled={solved || missed.includes(i)}
        className={solved && i === drill.answer ? 'gm-right' : missed.includes(i) ? 'gm-miss' : undefined}
        aria-pressed={missed.includes(i) || (solved && i === drill.answer)} onClick={() => check(i)}>{o}</button>)}
    </div>}
    {drill.k !== 'choose' && <form className="gm-type" onSubmit={e => { e.preventDefault(); if (!untouched) check(text) }}>
      <label className="pr-field">{drill.k === 'fill' ? '空格裡填' : '改好的句子'}
        {drill.k === 'fill'
          ? <input lang="en" value={text} readOnly={solved} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
              onChange={e => setText(e.target.value)} placeholder="寫在這裡" />
          : <textarea lang="en" rows={2} value={text} readOnly={solved} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
              onChange={e => setText(e.target.value)} />}
      </label>
      {!solved && <div className="pr-actions">
        <button type="submit" className="pr-main" disabled={untouched}>{result === null ? '對答案' : '改好了，再對一次'}</button>
        {/* A way on without an answer: it counts as missed and comes back later, like any wrong answer. */}
        {result === null && <button type="button" className="pr-link" onClick={() => check(drill.k === 'fix' ? drill.q : '')}>不會，先跳過</button>}
      </div>}
    </form>}
    {result !== null && (solved ? <div className="gm-feedback" data-ok={result} role="status">
      <strong>{result ? '對了' : onCorrected ? '這次改對了（保留首次的作答紀錄）' : '這次改對了'}</strong>
      <p lang="en">{drillAnswer(drill)}</p>
      {drill.k === 'fix' && drill.accept.length > 1 && <small>也可以寫：<span lang="en">{drill.accept.slice(1).join('／')}</span></small>}
      <small>{drill.why}</small>
      <AskWhy q={{ source: '文法小練習', stem,
        options: drill.k === 'choose' ? drill.options : undefined, picked: said, answer: drillAnswer(drill), right: true }} />
    </div> : <div className="gm-feedback" data-ok={false} role="status">
      <strong>{gaveUp ? onDone ? '先跳過了，這題之後會再出現' : '先跳過了，這題可以隨時再試' : '還沒對'}</strong>
      {!gaveUp && <small>{drill.k === 'choose' ? '劃掉的不是答案，再選一次。' : '看看上面的講解，找出哪裡不一樣再改一次。'}</small>}
      <AskWhy label="問 Claude 提示（不會直接給答案）" q={{ source: '文法小練習', stem,
        options: drill.k === 'choose' ? drill.options : undefined, picked: gaveUp ? '' : said, answer: drillAnswer(drill), right: false }} />
    </div>)}
  </div>
}

/** The drills, one at a time. `indices` is fixed when the block opens; the first try of each drill is what gets recorded. */
export function GrammarDrills({ unit, indices, onSave, date, done, after }: { unit: number; indices: number[]; onSave: SaveNotes; date: string; done?: string
  /** Where to go once the drills are done (the grammar book: the next unit). */
  after?: ReactNode }) {
  const g = grammarFor(unit)
  if (!g) return null
  return <DrillRun drills={g.drills} indices={indices} done={done} after={after}
    onCorrected={i => onSave(notes => saveDrill(notes, unit, i, true, date))}
    onAnswer={(i, right, said) => onSave(notes => {
    // A miss also goes on the shared weak-point list, under this unit's grammar.
    const saved = saveDrill(notes, unit, i, right, date)
    const label = labelOfUnit(unit)
    return right || !label ? saved : addWeak(saved, label, date, { w: said, r: drillAnswer(g.drills[i]) }, 'drill')
  })} />
}
/** Any list of drills, one at a time (a course unit's, or a section's three in 完整文法). */
export function DrillRun({ drills, indices, onAnswer, onCorrected, done, after, title = '小練習：先認得，再寫', missed = '還沒改對的題目之後會再出現。' }: { drills: Drill[]; indices: number[]
  onAnswer: (index: number, right: boolean, said: string) => void; onCorrected: (index: number) => void
  done?: string; after?: ReactNode; title?: string
  /** What happens to the drills missed (in a lesson they come back on later days). */
  missed?: string }) {
  const [at, setAt] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [rights, setRights] = useState<boolean[]>([])
  const [corrected, setCorrected] = useState(0)
  const index = indices[at]
  const drill = drills[index]
  useTaskContext(drill ? {
    label: '文法小練習（' + drillNames[drill.k] + '）：' + drill.q,
    detail: ['文法小練習，題目：' + drill.q, drillInstruction(drill), drill.k === 'choose' ? '選項：' + drill.options.join(' / ') : '', '正確答案：' + drillAnswer(drill) + '（他作答前不要說出來）', '原因：' + drill.why].filter(Boolean).join('\n'),
  } : null)
  if (!indices.length) return null
  if (!drill) {
    const right = rights.filter(Boolean).length
    return <div className="gm-drills gm-drills-done" role="status">
      <strong>第一次 {rights.length} 題答對 {right} 題{corrected > 0 ? ' · 當場訂正 ' + corrected + ' 題' : ''}</strong>
      <p>{right + corrected < rights.length ? missed : '這輪都答對了。'}{done ?? ''}</p>
      {after}
    </div>
  }
  return <div className="gm-drills">
    <div className="gm-drills-head"><strong>{title}</strong><small>{drillNames[drill.k]} · 第 {at + 1} / {indices.length} 題</small></div>
    <DrillCard key={index} drill={drill} onDone={(right, said) => {
      setAnswered(true); setRights(r => [...r, right])
      onAnswer(index, right, said)
    }} onCorrected={() => {
      setCorrected(n => n + 1)
      onCorrected(index)
    }} />
    {answered && <button type="button" className="pr-main gm-next" onClick={() => { setAt(at + 1); setAnswered(false) }}>{at + 1 < indices.length ? '下一題' : '看結果'}</button>}
  </div>
}

/** In a lesson, before the sentence is written. Day 1 teaches the unit in full and gives the first drills;
 *  later days keep the teaching folded and bring the remaining drills and the ones missed before. */
export default function GrammarTeach({ unit, day, title, rule, notes, onSave, date, rate }: {
  unit: number; day: number; title: string; rule: string; notes: Record<string, string>; onSave: SaveNotes; date: string; rate: number }) {
  const [indices] = useState(() => drillsForDay(notes, unit, day))
  const first = day <= 1
  const body = <><p className="gm-rule">{rule}</p><GrammarExplain unit={unit} rate={rate} /></>
  return <section className="pr-rule gm" aria-label={'文法講解：' + title}>
    {first ? <><strong>{title}</strong><small className="gm-lead">先看懂這三步，做幾題小練習，再寫今天的句子。</small>{body}</>
      : <details className="pr-tools"><summary>複習這課的講解：{title}</summary>{body}</details>}
    <GrammarDrills unit={unit} indices={indices} onSave={onSave} date={date} done="接著寫下面這一句。" />
  </section>
}

/** In the practice library: the teaching and all the drills of any unit the course has reached, to go back to.
 *  Units ahead of the course stay locked until the lessons get there. */
export function GrammarBook({ state, onActivity, date, initialUnit }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string; initialUnit?: number }) {
  // A unit asked for in the address (from 主題總複習) opens if the course has reached it; otherwise the current unit.
  const [unit, setUnit] = useState(() => initialUnit && initialUnit <= grammarUnits.length && reached(initialUnit, state.curriculum.unit) ? initialUnit
    : Math.min(grammarUnits.length, Math.max(1, state.curriculum.unit)))
  const [round, setRound] = useState(0)
  const info = curriculum.units.find(u => u.unit === unit)
  const g = grammarFor(unit)
  const sum = drillSummary(state.notes, unit)
  const stages = [...new Set(curriculum.overview.map(o => o.stage))]
  const onSave: SaveNotes = apply => onActivity(prev => ({ ...prev, notes: apply(prev.notes) }))
  // The unit after this one, if the course has reached it.
  const next = curriculum.overview.find(o => o.unit === unit + 1 && reached(o.unit, state.curriculum.unit) && grammarFor(o.unit))
  function open(u: number) {
    setUnit(u); setRound(0)
    requestAnimationFrame(() => document.querySelector('.gm-book')?.scrollIntoView({ block: 'start' }))
  }
  if (!info || !g) return <p>這個單元的講解還沒有寫好。</p>
  return <div className="pr-stack gm gm-book">
    <label className="gm-pick">單元
      <select value={unit} onChange={e => { setUnit(Number(e.target.value)); setRound(0) }}>
        {stages.map(s => <optgroup key={s} label={stageNames[s] ?? s}>
          {curriculum.overview.filter(o => o.stage === s).map(o => <option key={o.unit} value={o.unit} disabled={!reached(o.unit, state.curriculum.unit)}>{reached(o.unit, state.curriculum.unit) ? '' : '🔒 '}{o.unit}．{o.title}{o.unit === state.curriculum.unit ? '（現在這一課）' : reached(o.unit, state.curriculum.unit) ? '' : '（上到才打開）'}</option>)}
        </optgroup>)}
      </select>
    </label>
    <p className="qz-meta"><span>小練習 {sum.done} / {sum.total} 題做過</span><span>第一次就對 {sum.first} 題</span>{sum.open > 0 && <span>還沒改對 {sum.open} 題</span>}</p>
    <h3>{info.title}</h3>
    <p className="gm-rule">{info.rule}</p>
    <GrammarExplain key={unit} unit={unit} rate={state.settings.speechRate} />
    <GrammarDrills key={unit + '.' + round} unit={unit} indices={g.drills.map((_, i) => i)} onSave={onSave} date={date}
      after={<div className="pr-actions">
        {next ? <button type="button" className="pr-main" onClick={() => open(next.unit)}>下一個單元：{next.unit}．{next.title} →</button>
          : <small>{unit < grammarUnits.length ? '下一個單元等每天的課上到才打開。' : '這是最後一個單元。'}可以在最上面選其他單元複習。</small>}
        <button type="button" className="pr-link" onClick={() => setRound(round + 1)}>這個單元再做一次</button>
      </div>} />
    <button type="button" className="pr-link" onClick={() => setRound(round + 1)}>這個單元的小練習從頭再做一次</button>
  </div>
}

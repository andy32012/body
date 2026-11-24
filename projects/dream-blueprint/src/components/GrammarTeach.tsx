import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import curriculum from '../data/curriculum.json'
import type { PageProps } from '../lib/store'
import { useTaskContext } from '../lib/taskContext'
import { checkDrill, drillAnswer, drillNames, drillSummary, drillsForDay, grammarFor, grammarUnits, saveDrill, type Drill } from '../lib/grammar'
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
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  if (!g) return null
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
    <section className="gm-mistakes">
      <h4>常見錯誤</h4>
      {g.mistakes.map(m => <p key={m.bad}>
        <span className="gm-bad" lang="en">✗ {m.bad}</span>
        <span className="gm-good" lang="en">✓ {m.good}</span>
        <small>{m.why}</small>
      </p>)}
    </section>
  </div>
}

function DrillCard({ drill, onDone }: { drill: Drill; onDone: (right: boolean, said: string) => void }) {
  // A fix drill starts from the wrong sentence, so only the wrong part needs retyping on a phone.
  const [text, setText] = useState(drill.k === 'fix' ? drill.q : '')
  const [picked, setPicked] = useState<number | null>(null)
  const [result, setResult] = useState<boolean | null>(null)
  const untouched = drill.k === 'fix' ? text.trim() === drill.q : !text.trim()
  function check(answer: string | number) {
    if (result !== null) return
    const right = checkDrill(drill, answer)
    setResult(right)
    onDone(right, typeof answer === 'number' ? (drill.k === 'choose' ? drill.options[answer] ?? '' : '') : answer)
  }
  return <div className="gm-drill" data-kind={drill.k}>
    {drill.k === 'fix'
      ? <><p className="gm-ask">這句有一個地方錯了，改成正確的句子。</p><p className="gm-q gm-wrong" lang="en">{drill.q}</p></>
      : <p className="gm-q" lang="en">{drill.q}</p>}
    {drill.k === 'choose' && <div className="pr-options gm-options">
      {drill.options.map((o, i) => <button key={o} type="button" lang="en" disabled={result !== null}
        className={result === null ? undefined : i === drill.answer ? 'gm-right' : i === picked ? 'gm-miss' : undefined}
        aria-pressed={picked === i} onClick={() => { setPicked(i); check(i) }}>{o}</button>)}
    </div>}
    {drill.k !== 'choose' && <form className="gm-type" onSubmit={e => { e.preventDefault(); if (!untouched) check(text) }}>
      <label className="pr-field">{drill.k === 'fill' ? '空格裡填' : '改好的句子'}
        {drill.k === 'fill'
          ? <input lang="en" value={text} readOnly={result !== null} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
              onChange={e => setText(e.target.value)} placeholder="寫在這裡" />
          : <textarea lang="en" rows={2} value={text} readOnly={result !== null} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false}
              onChange={e => setText(e.target.value)} />}
      </label>
      {result === null && <button type="submit" className="pr-main" disabled={untouched}>對答案</button>}
    </form>}
    {result !== null && <div className="gm-feedback" data-ok={result} role="status">
      <strong>{result ? '對了' : '還沒對'}</strong>
      <p lang="en">{drillAnswer(drill)}</p>
      {drill.k === 'fix' && drill.accept.length > 1 && <small>也可以寫：<span lang="en">{drill.accept.slice(1).join('／')}</span></small>}
      <small>{drill.why}</small>
    </div>}
  </div>
}

/** The drills, one at a time. `indices` is fixed when the block opens; the first try of each drill is what gets recorded. */
export function GrammarDrills({ unit, indices, onSave, date, done }: { unit: number; indices: number[]; onSave: SaveNotes; date: string; done?: string }) {
  const g = grammarFor(unit)
  const [at, setAt] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [rights, setRights] = useState<boolean[]>([])
  const drill = g?.drills[indices[at]]
  useTaskContext(drill ? {
    label: '文法小練習（' + drillNames[drill.k] + '）：' + drill.q,
    detail: ['文法小練習，題目：' + drill.q, drill.k === 'choose' ? '選項：' + drill.options.join(' / ') : '', '正確答案：' + drillAnswer(drill) + '（他作答前不要說出來）', '原因：' + drill.why].filter(Boolean).join('\n'),
  } : null)
  if (!g || !indices.length) return null
  if (!drill) {
    const right = rights.filter(Boolean).length
    return <div className="gm-drills gm-drills-done" role="status">
      <strong>小練習做完了：{rights.length} 題對 {right} 題</strong>
      <p>{right < rights.length ? '錯的題目之後會再出現一次。' : '都認得了。'}{done ?? ''}</p>
    </div>
  }
  return <div className="gm-drills">
    <div className="gm-drills-head"><strong>小練習：先認得，再寫</strong><small>{drillNames[drill.k]} · 第 {at + 1} / {indices.length} 題</small></div>
    <DrillCard key={indices[at]} drill={drill} onDone={(right, said) => {
      setAnswered(true); setRights(r => [...r, right])
      // A miss also goes on the shared weak-point list, under this unit's grammar.
      onSave(notes => {
        const saved = saveDrill(notes, unit, indices[at], right, date)
        const label = labelOfUnit(unit)
        return right || !label ? saved : addWeak(saved, label, date, { w: said, r: drillAnswer(drill) }, 'drill')
      })
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

/** In the practice library: any unit's teaching and all of its drills, to read ahead or to go back to. */
export function GrammarBook({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const [unit, setUnit] = useState(() => Math.min(grammarUnits.length, Math.max(1, state.curriculum.unit)))
  const [round, setRound] = useState(0)
  const info = curriculum.units.find(u => u.unit === unit)
  const g = grammarFor(unit)
  const sum = drillSummary(state.notes, unit)
  const stages = [...new Set(curriculum.overview.map(o => o.stage))]
  const onSave: SaveNotes = apply => onActivity(prev => ({ ...prev, notes: apply(prev.notes) }))
  if (!info || !g) return <p>這個單元的講解還沒有寫好。</p>
  return <div className="pr-stack gm gm-book">
    <label className="gm-pick">單元
      <select value={unit} onChange={e => { setUnit(Number(e.target.value)); setRound(0) }}>
        {stages.map(s => <optgroup key={s} label={stageNames[s] ?? s}>
          {curriculum.overview.filter(o => o.stage === s).map(o => <option key={o.unit} value={o.unit}>{o.unit}．{o.title}{o.unit === state.curriculum.unit ? '（現在這一課）' : ''}</option>)}
        </optgroup>)}
      </select>
    </label>
    <p className="qz-meta"><span>小練習 {sum.done} / {sum.total} 題做過</span><span>第一次就對 {sum.first} 題</span>{sum.open > 0 && <span>還沒改對 {sum.open} 題</span>}</p>
    <h3>{info.title}</h3>
    <p className="gm-rule">{info.rule}</p>
    <GrammarExplain key={unit} unit={unit} rate={state.settings.speechRate} />
    <GrammarDrills key={unit + '.' + round} unit={unit} indices={g.drills.map((_, i) => i)} onSave={onSave} date={date} />
    <button type="button" className="pr-link" onClick={() => setRound(round + 1)}>這個單元的小練習從頭再做一次</button>
  </div>
}

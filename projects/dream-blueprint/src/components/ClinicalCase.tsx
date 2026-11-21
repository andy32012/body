import { useState } from 'react'
import data from '../data/scenarios.json'
import type { PageProps } from '../lib/store'
import { caseCauses, causeSummary, nextScenario, saveCase, stepNames, type Scenario, type StepResult } from '../lib/scenarios'

const all = data as Scenario[]

export default function ClinicalCase({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const [skip, setSkip] = useState<string[]>([])
  const [current, setCurrent] = useState(() => nextScenario(all, state.notes))
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<number>()
  const [results, setResults] = useState<StepResult[]>([])
  const [zh, setZh] = useState(false)
  const summary = causeSummary(all, state.notes)
  const s = current.steps[step]
  const finished = step >= current.steps.length
  const wrong = picked !== undefined && picked !== s?.answer

  function pick(i: number) {
    if (picked !== undefined) return
    setPicked(i)
    setResults(r => [...r, { kind: s.kind, correct: i === s.answer }])
  }
  function cause(c: string) {
    setResults(r => r.map((x, j) => j === r.length - 1 ? { ...x, cause: c } : x))
  }
  function next() {
    const last = step + 1 >= current.steps.length
    if (last) onActivity(prev => ({ ...prev, notes: saveCase(prev.notes, current.id, date, results, zh) }))
    setStep(step + 1); setPicked(undefined)
  }
  function another() {
    const nextSkip = [...skip, current.id]
    setSkip(nextSkip)
    setCurrent(nextScenario(all, state.notes, nextSkip.length >= all.length ? [current.id] : nextSkip))
    setStep(0); setPicked(undefined); setResults([]); setZh(false)
  }
  const lastCause = results.at(-1)?.cause
  const top = Object.entries(summary.count).sort((a, b) => b[1] - a[1])[0]
  return <div className="pr-stack cc">
    <p className="qz-meta"><span>臨床情境 · {current.topic}</span><span>做過 {summary.done} / {summary.total}</span>{top && <span>最常卡在：{top[0]}</span>}</p>
    <ol className="cc-steps" aria-label="四個步驟">{current.steps.map((x, i) => <li key={x.kind} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>{stepNames[x.kind]}</li>)}</ol>
    <section className="cc-case">
      <p lang="en">{current.case}</p>
      {zh ? <p className="cc-zh">{current.caseZh}</p> : <button type="button" className="pr-link" onClick={() => setZh(true)}>看不懂？看中文（會記下來）</button>}
    </section>
    {!finished && s && <>
      <h3 lang="en"><small>{step + 1}. {stepNames[s.kind]}</small>{s.q}</h3>
      <div className="pr-options cc-options">{s.options.map((o, i) => <button key={o} type="button" lang="en" disabled={picked !== undefined} aria-pressed={picked === i}
        className={picked === undefined ? undefined : i === s.answer ? 'qz-right' : picked === i ? 'qz-wrong' : undefined} onClick={() => pick(i)}>{o}</button>)}</div>
      {picked !== undefined && <div className="pr-hint">
        <strong>{wrong ? '這一步的答案是：' : '答對了'}{wrong && <span lang="en"> {s.options[s.answer]}</span>}</strong>
        <p>{s.why}</p>
        {wrong && <div className="qz-cause"><small>卡在哪？英文看不懂和護理觀念不熟會分開記。</small>
          <div className="pr-options">{caseCauses.map(c => <button key={c} type="button" aria-pressed={lastCause === c} disabled={!!lastCause && lastCause !== c} onClick={() => cause(c)}>{c}</button>)}</div>
        </div>}
        <button type="button" className="pr-main qz-next" onClick={next}>{step + 1 >= current.steps.length ? '看結果' : '下一步：' + stepNames[current.steps[step + 1].kind]}</button>
      </div>}
    </>}
    {finished && <div className="pr-hint">
      <strong>這個情境答對 {results.filter(r => r.correct).length} / {results.length} 步</strong>
      <ul className="cc-result">{results.map(r => <li key={r.kind} data-ok={r.correct}>{stepNames[r.kind]}：{r.correct ? '對' : '錯' + (r.cause ? '（' + r.cause + '）' : '')}</li>)}</ul>
      <p>錯的情境之後會再出現。英文看不懂的，可以把題目句子拿去「問問 Claude」。</p>
      <button type="button" className="pr-main qz-next" onClick={another}>下一個情境</button>
    </div>}
  </div>
}

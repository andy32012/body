import { useState } from 'react'
import data from '../data/scenarios.json'
import type { PageProps } from '../lib/store'
import DiagnoseBox from './DiagnoseBox'
import './tutor.css'
import { useTaskContext } from '../lib/taskContext'
import { caseCauses, causeSummary, nextScenario, saveCase, stepNames, type Scenario, type StepResult } from '../lib/scenarios'

const all = data as Scenario[]
/** A case in progress survives leaving the page: which case, which step, and the answers so far. */
const progressKey = 'case.progress'
interface Progress { id: string; step: number; results: StepResult[]; zh: boolean; picked?: number }
function readProgress(notes: Record<string, string>): Progress | null {
  try { const p = JSON.parse(notes[progressKey] ?? 'null') as Progress | null; return p && all.some(c => c.id === p.id) && p.step < all.find(c => c.id === p.id)!.steps.length ? p : null } catch { return null }
}

export default function ClinicalCase({ state, onActivity, date, subject }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string
  /** Only this licensing-exam subject's cases (opened from the 國考科目 page). */
  subject?: string }) {
  const pool = subject ? all.filter(c => c.subjects?.includes(subject)) : all
  // A case left halfway is resumed, unless a subject was chosen and the case belongs to another one.
  const [saved] = useState(() => { const p = readProgress(state.notes); return p && pool.some(c => c.id === p.id) ? p : null })
  const [skip, setSkip] = useState<string[]>([])
  const [current, setCurrent] = useState(() => saved ? all.find(c => c.id === saved.id)! : nextScenario(pool.length ? pool : all, state.notes))
  const [step, setStep] = useState(saved?.step ?? 0)
  const [picked, setPicked] = useState<number | undefined>(saved?.picked)
  const [results, setResults] = useState<StepResult[]>(saved?.results ?? [])
  const [zh, setZh] = useState(saved?.zh ?? false)
  const keep = (p: Progress | null) => onActivity(prev => {
    const notes = { ...prev.notes }
    if (p) notes[progressKey] = JSON.stringify(p); else delete notes[progressKey]
    return { ...prev, notes }
  })
  const summary = causeSummary(all, state.notes)
  const s = current.steps[step]
  const finished = step >= current.steps.length
  const wrong = picked !== undefined && picked !== s?.answer

  function pick(i: number) {
    if (picked !== undefined) return
    setPicked(i)
    const r = [...results, { kind: s.kind, correct: i === s.answer }]
    setResults(r); keep({ id: current.id, step, results: r, zh, picked: i })
  }
  function cause(c: string) {
    if (results.at(-1)?.cause) return
    const r = results.map((x, j) => j === results.length - 1 ? { ...x, cause: c } : x)
    setResults(r); keep({ id: current.id, step, results: r, zh, picked })
  }
  function next() {
    const last = step + 1 >= current.steps.length
    if (last) onActivity(prev => {
      const notes = saveCase(prev.notes, current.id, date, results, zh)
      delete notes[progressKey]
      return { ...prev, notes }
    })
    else keep({ id: current.id, step: step + 1, results, zh })
    setStep(step + 1); setPicked(undefined)
  }
  function another() {
    const nextSkip = [...skip, current.id]
    setSkip(nextSkip)
    const list = pool.length ? pool : all
    setCurrent(nextScenario(list, state.notes, nextSkip.filter(id => list.some(c => c.id === id)).length >= list.length ? [current.id] : nextSkip))
    setStep(0); setPicked(undefined); setResults([]); setZh(false); keep(null)
  }
  const lastCause = results.at(-1)?.cause
  useTaskContext(s && !finished ? {
    label: '臨床情境：' + current.topic + '（' + stepNames[s.kind] + '）',
    detail: ['臨床情境：' + current.case, '這一步：' + s.q, '選項：' + s.options.map((o, i) => (i + 1) + '. ' + o).join(' / '),
      picked === undefined ? '他還沒作答；正確答案是第 ' + (s.answer + 1) + ' 個，作答前不要說出來，只幫他看懂英文或想清楚觀念。'
        : '他選了第 ' + (picked + 1) + ' 個，正確是第 ' + (s.answer + 1) + ' 個。說明：' + s.why].join('\n'),
  } : null)
  const top = Object.entries(summary.count).sort((a, b) => b[1] - a[1])[0]
  return <div className="pr-stack cc">
    {subject && <p className="qz-meta"><span>只出「{subject}」的情境（{pool.length} 個）</span><a href="#library/case">改練全部情境</a></p>}
    <p className="qz-meta"><span>臨床情境 · {current.topic}</span><span>做過 {summary.done} / {summary.total}</span>{top && <span>最常卡在：{top[0]}</span>}</p>
    <ol className="cc-steps" aria-label="四個步驟">{current.steps.map((x, i) => <li key={x.kind} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>{stepNames[x.kind]}</li>)}</ol>
    <section className="cc-case">
      <p lang="en">{current.case}</p>
      {zh ? <p className="cc-zh">{current.caseZh}</p> : <button type="button" className="pr-link" onClick={() => { setZh(true); if (step || results.length) keep({ id: current.id, step, results, zh: true, picked }) }}>看不懂？看中文（會記下來）</button>}
    </section>
    {!finished && s && <>
      <h3 lang="en"><small>{step + 1}. {stepNames[s.kind]}</small>{s.q}</h3>
      <div className="pr-options cc-options">{s.options.map((o, i) => <button key={o} type="button" lang="en" disabled={picked !== undefined} aria-pressed={picked === i}
        className={picked === undefined ? undefined : i === s.answer ? 'qz-right' : picked === i ? 'qz-wrong' : undefined} onClick={() => pick(i)}>{o}</button>)}</div>
      {picked !== undefined && <div className="pr-hint">
        <strong>{wrong ? '這一步的答案是：' : '答對了'}{wrong && <span lang="en"> {s.options[s.answer]}</span>}</strong>
        <p>{s.why}</p>
        {s.whyOptions && <ol className="dg-why cc-why" aria-label="每個選項為什麼對或錯">{s.options.map((o, i) => <li key={o} data-ok={i === s.answer}>
          <span lang="en">{o}</span><small>{s.whyOptions![i]}</small></li>)}</ol>}
        {wrong && <div className="qz-cause"><small>卡在哪？英文看不懂和護理觀念不熟會分開記。</small>
          <div className="pr-options">{caseCauses.map(c => <button key={c} type="button" aria-pressed={lastCause === c} disabled={!!lastCause && lastCause !== c} onClick={() => cause(c)}>{c}</button>)}</div>
          <DiagnoseBox key={current.id + step} id={'case.' + current.id + '.' + step} context={current.case} question={s.q} options={s.options} answer={s.answer} picked={picked!}
            notes={state.notes} onSave={(k, v) => onActivity(prev => ({ ...prev, notes: { ...prev.notes, [k]: v } }))} onCause={cause} cause={lastCause} />
        </div>}
        <button type="button" className="pr-main qz-next" onClick={next}>{step + 1 >= current.steps.length ? '看結果' : '下一步：' + stepNames[current.steps[step + 1].kind]}</button>
      </div>}
    </>}
    <footer className="cc-meta">
      {current.subjects && <span>國考科目：{current.subjects.join('、')}</span>}
      {current.sources && <span>依據：{current.sources.map((x, i) => <a key={x.url} href={x.url} target="_blank" rel="noreferrer">{i ? '、' : ''}{x.title}</a>)}</span>}
      <span>{current.updated ? '更新 ' + current.updated + ' · ' : ''}{current.review === 'reviewed' ? '已經臨床護理師審校' : '自編教材，照上面的公開資料整理，還沒經過臨床護理師審校；實際照護以醫囑和醫院流程為準'}</span>
    </footer>
    {finished && <div className="pr-hint">
      <strong>這個情境答對 {results.filter(r => r.correct).length} / {results.length} 步</strong>
      <ul className="cc-result">{results.map(r => <li key={r.kind} data-ok={r.correct}>{stepNames[r.kind]}：{r.correct ? '對' : '錯' + (r.cause ? '（' + r.cause + '）' : '')}</li>)}</ul>
      <p>錯的情境之後會再出現。英文看不懂的，可以把題目句子拿去「問問 Claude」。</p>
      <button type="button" className="pr-main qz-next" onClick={another}>下一個情境</button>
    </div>}
  </div>
}

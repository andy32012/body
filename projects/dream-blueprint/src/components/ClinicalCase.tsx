import AskWhy from './AskWhy'
import { useState } from 'react'
import data from '../data/scenarios.json'
import { getSnapshot, updateStore, updateStoreNow, type PageProps } from '../lib/store'
import { useActivitySave, type SaveActivity } from '../lib/activitySave'
import DiagnoseBox from './DiagnoseBox'
import './tutor.css'
import { useTaskContext } from '../lib/taskContext'
import { caseCauses, caseKey, causeSummary, nextScenario, readCase, saveCase, stepNames, type CaseRecord, type Scenario, type StepResult } from '../lib/scenarios'
import { unfinishedItems, writeUnfinished } from '../lib/unfinished'

const all = data as Scenario[]
/** A case in progress survives leaving the page: which case, which step, and the answers so far. */
const progressKey = 'case.progress'
interface Progress { id: string; step: number; results: StepResult[]; zh: boolean; picked?: number; updatedAt?: number }
function readProgress(notes: Record<string, string>, pool: readonly Scenario[], exclude?: string): Progress | undefined {
  return unfinishedItems(notes, progressKey, (value): value is Progress => {
    const p = value as Progress
    const c = pool.find(c => c.id === p.id && c.id !== exclude)
    return !!c && Number.isInteger(p.step) && p.step >= 0 && p.step < c.steps.length && Array.isArray(p.results)
  })[0]
}

export default function ClinicalCase({ state, onSavedActivity, date, subject }: Pick<PageProps, 'state'> & {
  onSavedActivity: SaveActivity; date: string
  /** Only this licensing-exam subject's cases (opened from the 國考科目 page). */
  subject?: string }) {
  const pool = subject ? all.filter(c => c.subjects?.includes(subject)) : all
  // A case left halfway is resumed, unless a subject was chosen and the case belongs to another one.
  const [saved] = useState(() => readProgress(state.notes, pool))
  const [skip, setSkip] = useState<string[]>([])
  const [current, setCurrent] = useState(() => saved ? all.find(c => c.id === saved.id)! : nextScenario(pool.length ? pool : all, state.notes) ?? all[0])
  const [openedResult, setOpenedResult] = useState(() => state.notes[caseKey(current.id)])
  const [progress, setProgress] = useState(saved)
  const [complete, setComplete] = useState<CaseRecord | null>(null)
  const [resultChinese, setResultChinese] = useState(false)
  const { saving, error, save, clearError } = useActivitySave()
  const step = complete ? current.steps.length : progress?.step ?? 0
  const picked = progress?.picked
  const results = complete?.results ?? progress?.results ?? []
  const zh = complete?.usedZh ?? progress?.zh ?? false
  const finished = complete !== null
  const summary = causeSummary(all, state.notes)
  const s = current.steps[step]
  const wrong = picked !== undefined && picked !== s?.answer

  function change(draft: Progress | null, recordActivity = false) {
    return save(async () => {
      let next: Progress | undefined
      let recorded: CaseRecord | null = null
      let changedElsewhere = false
      let resultVersion = openedResult
      const currentResultKey = caseKey(current.id)
      const persist = recordActivity ? onSavedActivity : updateStoreNow
      await persist(prev => {
        const latest = readProgress(prev.notes, [current])
        resultVersion = prev.notes[currentResultKey]
        if (JSON.stringify(latest) !== JSON.stringify(progress) || (!latest && resultVersion !== openedResult)) {
          changedElsewhere = true
          next = latest
          if (!latest) recorded = readCase(prev.notes, current.id)
          return prev
        }
        const caseNotes = draft ? prev.notes : saveCase(prev.notes, current.id, date, results, zh)
        const notes = writeUnfinished(caseNotes, progressKey, current.id, draft)
        if (draft) next = readProgress(notes, [current])
        else {
          recorded = readCase(notes, current.id)
          resultVersion = notes[currentResultKey]
        }
        return { ...prev, notes }
      })
      setProgress(next)
      setComplete(recorded)
      setOpenedResult(resultVersion)
      if (changedElsewhere) throw new Error('其他分頁或裝置已更新這個情境。目前畫面已載入儲存的進度。')
    })
  }
  function showChinese() {
    if (!zh && s) void change({ id: current.id, step, results, zh: true, picked })
  }
  function pick(i: number) {
    if (!s || picked !== undefined) return
    const r = [...results, { kind: s.kind, correct: i === s.answer }]
    void change({ id: current.id, step, results: r, zh, picked: i }, true)
  }
  function cause(c: string) {
    if (!wrong || results.at(-1)?.cause) return
    const r = results.map((x, j) => j === results.length - 1 ? { ...x, cause: c } : x)
    void change({ id: current.id, step, results: r, zh, picked })
  }
  function next() {
    if (!s || picked === undefined) return
    const last = step + 1 >= current.steps.length
    void change(last ? null : { id: current.id, step: step + 1, results, zh })
  }
  function another() {
    const notes = getSnapshot().state.notes
    const nextSkip = [...skip, current.id]
    setSkip(nextSkip)
    const list = pool.length ? pool : all
    const resume = readProgress(notes, list, current.id)
    const available = nextSkip.filter(id => list.some(c => c.id === id)).length >= list.length ? [current.id] : nextSkip
    const next = resume ? list.find(c => c.id === resume.id)! : nextScenario(list, notes, available) ?? current
    setCurrent(next); setProgress(resume); setComplete(null); setResultChinese(false); clearError()
    setOpenedResult(notes[caseKey(next.id)])
  }
  const lastCause = results.at(-1)?.cause
  useTaskContext(s && !finished ? {
    label: '臨床情境：' + current.topic + '（' + stepNames[s.kind] + '）',
    detail: ['臨床情境：' + current.case, '這一步：' + s.q, '選項：' + s.options.map((o, i) => (i + 1) + '. ' + o).join(' / '),
      picked === undefined ? '他還沒作答；正確答案是第 ' + (s.answer + 1) + ' 個，作答前不要說出來，只幫他看懂英文或想清楚觀念。'
        : '他選了第 ' + (picked + 1) + ' 個，正確是第 ' + (s.answer + 1) + ' 個。說明：' + s.why].join('\n'),
  } : null)
  const top = Object.entries(summary.count).sort((a, b) => b[1] - a[1])[0]
  // A subject without cases (an old bookmark): say so, instead of quietly giving cases of every subject.
  if (subject && !pool.length) return <div className="pr-hint"><strong>「{subject}」還沒有臨床情境</strong>
    <p>這一科的情境還沒寫好。</p>
    <div className="pr-actions"><button type="button" className="pr-main" onClick={() => { location.hash = 'library/case' }}>改練全部情境</button></div></div>
  return <div className="pr-stack cc" aria-busy={saving}>
    {subject && <p className="qz-meta"><span>只出「{subject}」的情境（{pool.length} 個）</span><a href="#library/case">改練全部情境</a></p>}
    <p className="qz-meta"><span>臨床情境 · {current.topic}</span><span>做過 {summary.done} / {summary.total}</span>{top && <span>最常卡在：{top[0]}</span>}</p>
    {saving && <p className="ls-help" role="status">儲存情境紀錄中……</p>}
    {error && <p className="tu-error" role="alert">{error}</p>}
    <ol className="cc-steps" aria-label="四個步驟">{current.steps.map((x, i) => <li key={x.kind} data-state={i < step ? 'done' : i === step ? 'now' : 'todo'}>{stepNames[x.kind]}</li>)}</ol>
    <section className="cc-case">
      <p lang="en">{current.case}</p>
      {zh || resultChinese ? <p className="cc-zh">{current.caseZh}</p> : <button type="button" className="pr-link" disabled={saving}
        onClick={finished ? () => setResultChinese(true) : showChinese}>{finished ? '看情境中文' : '看不懂？看中文（會記下來）'}</button>}
    </section>
    {!finished && s && <>
      <h3 lang="en"><small>{step + 1}. {stepNames[s.kind]}</small>{s.q}</h3>
      <div className="pr-options cc-options">{s.options.map((o, i) => <button key={o} type="button" lang="en" disabled={saving || picked !== undefined} aria-pressed={picked === i}
        className={picked === undefined ? undefined : i === s.answer ? 'qz-right' : picked === i ? 'qz-wrong' : undefined} onClick={() => pick(i)}>{o}</button>)}</div>
      {picked !== undefined && <div className="pr-hint">
        <strong>{wrong ? '這一步的答案是：' : '答對了'}{wrong && <span lang="en"> {s.options[s.answer]}</span>}</strong>
        <p>{s.why}</p>
        {!wrong && <AskWhy q={{ source: '臨床情境', passage: current.case, stem: s.q, options: s.options, picked: s.options[picked], answer: s.options[s.answer], right: true }} />}
        {s.whyOptions && <ol className="dg-why cc-why" aria-label="每個選項為什麼對或錯">{s.options.map((o, i) => <li key={o} data-ok={i === s.answer}>
          <span lang="en">{o}</span><small>{s.whyOptions![i]}</small></li>)}</ol>}
        {wrong && <div className="qz-cause"><small>卡在哪？英文看不懂和護理觀念不熟會分開記。</small>
          <div className="pr-options">{caseCauses.map(c => <button key={c} type="button" aria-pressed={lastCause === c} disabled={saving || !!lastCause} onClick={() => cause(c)}>{c}</button>)}</div>
          <DiagnoseBox key={current.id + step} id={'case.' + current.id + '.' + step} context={current.case} question={s.q} options={s.options} answer={s.answer} picked={picked!}
            notes={state.notes} onSave={(k, v) => updateStore(prev => ({ ...prev, notes: { ...prev.notes, [k]: v } }))} onCause={cause} cause={lastCause} />
        </div>}
        <button type="button" className="pr-main qz-next" disabled={saving} onClick={next}>{step + 1 >= current.steps.length ? '看結果' : '下一步：' + stepNames[current.steps[step + 1].kind]}</button>
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
      {(pool.length ? pool : all).length > 1 ? <button type="button" className="pr-main qz-next" onClick={another}>下一個情境</button>
        : <div className="pr-actions">
          <p className="ls-help">這一科目前只有這一個情境，這一輪做完了。</p>
          <button type="button" className="pr-main qz-next" onClick={another}>重做這個情境</button>
          {subject && <a className="pr-link" href="#plan/exam">回國考科目</a>}
        </div>}
    </div>}
  </div>
}

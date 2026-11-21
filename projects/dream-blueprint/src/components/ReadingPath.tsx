import { useEffect, useMemo, useState } from 'react'
import type { PageProps } from '../lib/store'
import {
  nextReading, passed, readCauses, readLevels, readRecord, readSummary, saveRead, suggestedLevel, typeNames,
  type ReadLevel, type ReadPassage,
} from '../lib/reading'
import { useTaskContext } from '../lib/taskContext'
import { AskWord } from './AIChat'
import './reading.css'

const letters = 'ABCDEFGH'

function Highlight({ text, marks }: { text: string; marks: string[] }) {
  const hits = marks.filter(m => m && text.includes(m))
  if (!hits.length) return <>{text}</>
  const m = hits[0]
  const i = text.indexOf(m)
  return <>{text.slice(0, i)}<mark>{m}</mark><Highlight text={text.slice(i + m.length)} marks={hits.slice(1)} /></>
}

/** 閱讀理解：A1 → B2 (IELTS question types). Answer one question at a time; a wrong answer asks why. */
export default function ReadingPath({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const [all, setAll] = useState<ReadPassage[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    import('../data/reading.json').then(f => { if (alive) setAll(f.default as ReadPassage[]) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  const suggested = all ? suggestedLevel(all, state.notes) : 'A1'
  const [level, setLevel] = useState<ReadLevel | null>(null)
  const lvl = level ?? suggested
  const [skip, setSkip] = useState<string[]>([])
  const [pickedId, setPickedId] = useState<string>()
  const passage = useMemo(() => {
    if (!all) return null
    return (pickedId && all.find(p => p.id === pickedId)) || nextReading(all, lvl, state.notes, skip)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, lvl, skip, pickedId])
  const [picks, setPicks] = useState<number[]>([])
  const [causes, setCauses] = useState<Record<number, string>>({})
  const [zh, setZh] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setPicks([]); setCauses({}); setZh(false); setSaved(false) }, [passage?.id])
  const at = picks.length
  const q = passage?.qs[at]
  useTaskContext(passage ? {
    label: '閱讀：' + passage.title + (q ? '（第 ' + (at + 1) + ' 題）' : ''),
    detail: ['閱讀理解短文：\n' + passage.paras.join('\n'), q ? '現在這題（' + typeNames[q.type] + '）：' + q.q + '\n選項：' + q.options.join(' / ') + '\n正確答案是「' + q.options[q.answer] + '」，他作答前不要說，只帶他回到文章找線索。' : '題目都做完了。'].join('\n'),
  } : null)

  if (failed) return <p>閱讀教材載入失敗，重新整理再試一次。</p>
  if (!all || !passage) return <p>載入中……</p>
  const summary = readSummary(all, state.notes)
  const done = at >= passage.qs.length
  const correct = passage.qs.filter((x, i) => picks[i] === x.answer).length
  const last = at > 0 ? passage.qs[at - 1] : null
  const lastWrong = last && picks[at - 1] !== last.answer
  function pick(i: number) {
    if (!passage || done) return
    const next = [...picks, i]
    setPicks(next)
    if (next.length === passage.qs.length) finish(next, causes)
  }
  function finish(p: number[], c: Record<number, string>) {
    if (!passage) return
    const right = passage.qs.filter((x, i) => p[i] === x.answer).length
    onActivity(prev => ({ ...prev, notes: saveRead(prev.notes, passage.id, { day: date, picks: p, correct: right, total: passage.qs.length, ...(Object.keys(c).length ? { causes: c } : {}), ...(zh ? { zh: true } : {}) }) }))
    setSaved(true)
  }
  function cause(qi: number, c: string) {
    if (causes[qi]) return
    const next = { ...causes, [qi]: c }
    setCauses(next)
    if (saved && passage) onActivity(prev => {
      const r = readRecord(prev.notes, passage.id)
      return r ? { ...prev, notes: { ...prev.notes, ['read.' + passage.id]: JSON.stringify({ ...r, causes: next }) } } : prev
    })
  }
  const marks = last && at > 0 ? [last.evidence ?? ''] : []
  const prevRec = readRecord(state.notes, passage.id)
  return <div className="pr-stack rd">
    <div className="pr-options rd-levels" role="group" aria-label="閱讀程度">
      {readLevels.map(l => {
        const here = all.filter(p => p.level === l.id)
        const ok = here.filter(p => passed(readRecord(state.notes, p.id))).length
        return <button key={l.id} type="button" aria-pressed={l.id === lvl} onClick={() => { setLevel(l.id); setSkip([]); setPickedId(undefined) }}>
          {l.name}<small>{ok} / {here.length}{l.id === suggested ? ' · 建議' : ''}</small></button>
      })}
    </div>
    <p className="qz-meta">
      <span>{readLevels.find(l => l.id === lvl)!.note}</span>
      <span>讀過 {summary.done} / {summary.total} 篇</span>
      {summary.weakest && <span>最弱題型：{typeNames[summary.weakest]}</span>}
      {summary.topCause && <span>最常卡在：{summary.topCause}</span>}
    </p>
    <article className="rd-passage">
      <header><h3 lang="en">{passage.title}</h3><small>{passage.topic} · {passage.words} 字{prevRec ? ' · 上次 ' + prevRec.correct + ' / ' + prevRec.total : ''}</small></header>
      {passage.paras.map((p, i) => <p key={i} lang="en" className="rd-para">
        {passage.ielts && <b className="rd-letter">{letters[i]}</b>}<Highlight text={p} marks={marks} />
      </p>)}
      {zh ? <p className="rd-zh">{passage.zh}</p> : <button type="button" className="pr-link" onClick={() => setZh(true)}>真的看不懂？看中文大意（這篇會記成「看過中文」）</button>}
    </article>
    {last && <div className="pr-hint rd-feedback" data-ok={!lastWrong}>
      <strong>{lastWrong ? '第 ' + at + ' 題答案是「' + last.options[last.answer] + '」' : '第 ' + at + ' 題答對了'}</strong>
      <p>{last.why}</p>
      {last.evidence && <small>文章裡標起來的那一句就是證據。</small>}
      {lastWrong && <div className="qz-cause"><small>卡在哪？選一個，之後會看哪一種最常出現。</small>
        <div className="pr-options">{readCauses.map(c => <button key={c} type="button" aria-pressed={causes[at - 1] === c} disabled={!!causes[at - 1] && causes[at - 1] !== c} onClick={() => cause(at - 1, c)}>{c}</button>)}</div>
      </div>}
    </div>}
    {q && <section className="rd-q">
      <p className="rd-qmeta">第 {at + 1} / {passage.qs.length} 題 · {typeNames[q.type]}{q.type === 'tfng' ? '（True 文章這樣說；False 文章說相反；Not Given 文章沒提到）' : ''}</p>
      <h4 lang="en">{q.q}</h4>
      <div className="pr-options rd-options">{q.options.map((o, i) => <button key={o} type="button" lang="en" onClick={() => pick(i)}>{o}</button>)}</div>
    </section>}
    {done && <div className="pr-hint">
      <strong>這篇答對 {correct} / {passage.qs.length}{passed({ day: date, picks, correct, total: passage.qs.length, zh, tries: 1 }) ? '，過關 ✓' : zh ? '（看過中文，下次不看中文再試一次）' : '，70% 以上算過關，之後會再出現'}</strong>
      <ul className="rd-review">{passage.qs.map((x, i) => <li key={i} data-ok={picks[i] === x.answer}>{typeNames[x.type]}：{picks[i] === x.answer ? '對' : '錯' + (causes[i] ? '（' + causes[i] + '）' : '')}</li>)}</ul>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={() => { setPickedId(undefined); setSkip(s => [...s, passage.id]) }}>下一篇</button>
        <button type="button" className="pr-link" onClick={() => { setPicks([]); setCauses({}); setSaved(false) }}>這篇再做一次</button>
      </div>
      <p className="rd-words">文章裡不懂的字可以問：{passage.paras.join(' ').match(/[A-Za-z]{7,}/g)?.filter((w, i, a) => a.indexOf(w) === i).slice(0, 6).map(w => <span key={w}><AskWord en={w} label={w} /> </span>)}</p>
    </div>}
    {!done && at === 0 && <button type="button" className="pr-link" onClick={() => setSkip(s => [...s, passage.id])}>換一篇</button>}
  </div>
}

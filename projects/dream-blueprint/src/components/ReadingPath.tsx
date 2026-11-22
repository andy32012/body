import { useEffect, useState } from 'react'
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

/** 閱讀理解：A1 → B2 (IELTS question types). Answer one question at a time; a wrong answer asks why.
 *  `only`: just these passages (a unit's pack), without the level picker. Held-out test passages are never listed here. */
export default function ReadingPath({ state, onActivity, date, only }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string; only?: readonly string[] }) {
  const [all, setAll] = useState<ReadPassage[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    import('../data/reading.json').then(f => { if (alive) setAll((f.default as ReadPassage[]).filter(p => only ? only.includes(p.id) : !p.held)) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const suggested = all ? suggestedLevel(all, state.notes) : 'A1'
  // The level and the passage only change when he moves on (or picks a level): a new score changing the suggestion
  // must not swap the passage while its feedback is still on screen.
  const [level, setLevel] = useState<ReadLevel | null>(null)
  const [manual, setManual] = useState(!!only)
  const lvl = level ?? suggested
  const [skip, setSkip] = useState<string[]>([])
  const [currentId, setCurrentId] = useState<string | null | undefined>(undefined)
  const [moved, setMoved] = useState<ReadLevel | null>(null)
  useEffect(() => {
    if (!all || currentId !== undefined) return
    setLevel(suggested)
    setCurrentId(nextReading(all, suggested, state.notes, [])?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])
  const passage = all && currentId ? all.find(p => p.id === currentId) ?? null : null
  function moveOn(nextSkip: string[]) {
    if (!all) return
    // The suggestion applies here, when moving on — unless a level was picked by hand.
    const target = manual ? lvl : suggestedLevel(all, state.notes)
    const list = target === lvl ? nextSkip : []
    setMoved(target !== lvl ? target : null)
    setLevel(target); setSkip(list)
    setCurrentId(nextReading(all, target, state.notes, list)?.id ?? null)
  }
  function chooseLevel(l: ReadLevel) {
    if (!all) return
    setLevel(l); setManual(true); setSkip([]); setMoved(null)
    setCurrentId(nextReading(all, l, state.notes, [])?.id ?? null)
  }
  const [picks, setPicks] = useState<number[]>([])
  const [causes, setCauses] = useState<Record<number, string>>({})
  // zh: the Chinese is open now; seenZh: it was opened for this passage (kept on a redo, so the record stays honest).
  const [zh, setZh] = useState(false)
  const [seenZh, setSeenZh] = useState(false)
  const [saved, setSaved] = useState(false)
  const [redo, setRedo] = useState(false)
  useEffect(() => { setPicks([]); setCauses({}); setZh(false); setSeenZh(false); setSaved(false); setRedo(false) }, [passage?.id])
  const at = picks.length
  const q = passage?.qs[at]
  useTaskContext(passage ? {
    label: '閱讀：' + passage.title + (q ? '（第 ' + (at + 1) + ' 題）' : ''),
    detail: ['閱讀理解短文：\n' + passage.paras.join('\n'), q ? '現在這題（' + typeNames[q.type] + '）：' + q.q + '\n選項：' + q.options.join(' / ') + '\n正確答案是「' + q.options[q.answer] + '」，他作答前不要說，只帶他回到文章找線索。' : '題目都做完了。'].join('\n'),
  } : null)

  if (failed) return <p>閱讀教材載入失敗，重新整理再試一次。</p>
  if (!all) return <p>載入中……</p>
  const levelButtons = only ? null : <div className="pr-options rd-levels" role="group" aria-label="閱讀程度">
    {readLevels.map(l => {
      const here = all.filter(p => p.level === l.id)
      const ok = here.filter(p => passed(readRecord(state.notes, p.id))).length
      return <button key={l.id} type="button" aria-pressed={l.id === lvl} onClick={() => chooseLevel(l.id)}>
        {l.name}<small>{ok} / {here.length}{l.id === suggested ? ' · 建議' : ''}</small></button>
    })}
  </div>
  if (!passage) {
    const nextLevel = readLevels[readLevels.findIndex(l => l.id === lvl) + 1]
    return <div className="pr-stack rd">
      {levelButtons}
      <div className="pr-hint">
        <strong>{currentId === undefined ? '準備文章中……' : only ? '這個單元的文章都看過或略過了' : readLevels.find(l => l.id === lvl)!.name + '這一輪的文章都看過或略過了'}</strong>
        {currentId !== undefined && <div className="pr-actions">
          <button type="button" className="pr-main" onClick={() => chooseLevel(lvl)}>{only ? '從第一篇再來' : '這一級從頭再來'}</button>
          {nextLevel && !only && <button type="button" className="pr-link" onClick={() => chooseLevel(nextLevel.id)}>換到 {nextLevel.name}</button>}
        </div>}
      </div>
    </div>
  }
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
    onActivity(prev => ({ ...prev, notes: saveRead(prev.notes, passage.id, { day: date, picks: p, correct: right, total: passage.qs.length, ...(Object.keys(c).length ? { causes: c } : {}), ...(seenZh ? { zh: true } : {}) }) }))
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
    {levelButtons}
    {moved && <p className="rd-moved" role="status">前面這一級已經有三篇過關，升到 {readLevels.find(l => l.id === moved)!.name}。想留在原本那一級，按上面的程度就好。</p>}
    <p className="qz-meta">
      {!only && <span>{readLevels.find(l => l.id === lvl)!.note}</span>}
      <span>{only ? '這個單元' : ''}讀過 {summary.done} / {summary.total} 篇</span>
      {summary.weakest && <span>最弱題型：{typeNames[summary.weakest]}</span>}
      {summary.topCause && <span>最常卡在：{summary.topCause}</span>}
    </p>
    <article className="rd-passage">
      <header><h3 lang="en">{passage.title}</h3><small>{passage.topic} · {passage.words} 字{prevRec ? ' · 上次 ' + prevRec.correct + ' / ' + prevRec.total : ''}</small></header>
      {passage.paras.map((p, i) => <p key={i} lang="en" className="rd-para">
        {passage.ielts && <b className="rd-letter">{letters[i]}</b>}<Highlight text={p} marks={marks} />
      </p>)}
      {zh ? <p className="rd-zh">{passage.zh}</p> : <button type="button" className="pr-link" onClick={() => { setZh(true); setSeenZh(true) }}>{seenZh ? '再看一次中文大意' : '真的看不懂？看中文大意（這篇會記成「看過中文」）'}</button>}
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
      <strong>這篇答對 {correct} / {passage.qs.length}{redo ? '（重做是練習：答案剛看過，這次不算過關）' : passed({ day: date, picks, correct, total: passage.qs.length, zh: seenZh, tries: 1 }) ? '，過關 ✓' : seenZh ? '（看過中文，下次不看中文再試一次）' : '，70% 以上算過關，之後會再出現'}</strong>
      <ul className="rd-review">{passage.qs.map((x, i) => <li key={i} data-ok={picks[i] === x.answer}>{typeNames[x.type]}：{picks[i] === x.answer ? '對' : '錯' + (causes[i] ? '（' + causes[i] + '）' : '')}</li>)}</ul>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={() => moveOn([...skip, passage.id])}>下一篇</button>
        <button type="button" className="pr-link" onClick={() => { setPicks([]); setCauses({}); setSaved(false); setZh(false); setRedo(true) }}>這篇再做一次（練習）</button>
      </div>
      <p className="rd-words">文章裡不懂的字可以問：{passage.paras.join(' ').match(/[A-Za-z]{7,}/g)?.filter((w, i, a) => a.indexOf(w) === i).slice(0, 6).map(w => <span key={w}><AskWord en={w} label={w} /> </span>)}</p>
    </div>}
    {!done && at === 0 && <button type="button" className="pr-link" onClick={() => moveOn([...skip, passage.id])}>換一篇</button>}
  </div>
}

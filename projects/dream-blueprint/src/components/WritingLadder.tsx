import { useEffect, useMemo, useState } from 'react'
import data from '../data/writing.json'
import type { PageProps } from '../lib/store'
import { askTutor, tutorKey } from '../lib/tutor'
import { readDraft, writeDraft } from '../lib/drafts'
import { useTaskContext } from '../lib/taskContext'
import { parseFeedback, readWrite, scoreOf, suggestedStage, taskDone, wordCount, writeKey, type WriteFeedback, type WriteStage } from '../lib/writing'
import { MiniChart } from './LessonParts'
import StuckButton from './StuckButton'
import './writing.css'

const stages = data.stages as WriteStage[]
const outlines: Record<string, string[]> = {
  paragraph: ['Topic sentence：一句說整段要講什麼', 'First, …', 'Also / Second, …', 'Finally, …', 'Conclusion：For these reasons, …'],
  multi: ['第一段：開頭（打招呼／說出主題或立場）', '第二段：內容（理由、例子、經過）', '第三段：結尾（總結／請求／祝福）'],
  task1: ['Introduction：用自己的話改寫題目', 'Overview：Overall, …（最大的趨勢或特點，不放數字）', 'Body 1：前半段的重要數據和比較', 'Body 2：後半段的重要數據和比較'],
  task2: ['Introduction：改寫題目＋你的立場', 'Body 1：第一個論點＋解釋＋例子', 'Body 2：第二個論點（或另一方看法）＋解釋＋例子', 'Conclusion：重申立場，不加新論點'],
}

function system(stage: WriteStage, prompt: string) {
  const ielts = !!stage.ielts
  return [
    '你是英文寫作老師，批改台灣護理系學生（英文約國中程度，目標雅思）的英文寫作。',
    '題目：' + prompt,
    '這一階的評分項目：' + stage.criteria.join('；'),
    ielts ? '每個項目給雅思分數（1–9，可用 .5；初學者寫得很短、錯很多就如實給 1–3.5，不要為了鼓勵而墊高到 4），再給整體 band（四項平均，四捨五入到 .5）。分數要誠實，寧可保守；這只是練習估計，不是正式分數。字數不足要在 Task 項目扣分並說明。'
      : '每個項目給 1–5 分（5 = 完全做到）。',
    '只輸出 JSON：{"criteria":[{"name":"項目名","score":數字,"comment":"一句繁體中文說明做得好的和要改的"}],' + (ielts ? '"band":數字,' : '') + '"summary":"一句整體評語","next":"下一版最重要、只改一件事的建議","fixes":[{"wrong":"原文片段","right":"改成","why":"一句原因"}],"revised":"保留他內容的修改版全文"}',
    'fixes 最多 6 個，挑最重要的；comment 和 why 用口語繁體中文。',
  ].join('\n')
}

/** 寫作階梯 with criteria feedback; IELTS tasks get a timer and a word target. */
export default function WritingLadder({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const suggested = suggestedStage(stages, state.notes)
  const [stageId, setStageId] = useState(suggested)
  const stage = stages.find(s => s.id === stageId)!
  const firstOpen = stage.tasks.find(t => !taskDone(readWrite(state.notes, t.id), !!stage.ielts)) ?? stage.tasks[0]
  const [taskId, setTaskId] = useState(firstOpen.id)
  const task = stage.tasks.find(t => t.id === taskId) ?? firstOpen
  const draftKey = 'write.' + task.id
  const [text, setText] = useState(() => readDraft(draftKey))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fb, setFb] = useState<WriteFeedback | null>(() => readWrite(state.notes, task.id)?.last ?? null)
  const [showRevised, setShowRevised] = useState(false)
  const [showSample, setShowSample] = useState(false)
  const [checks, setChecks] = useState<boolean[]>([])
  const [endAt, setEndAt] = useState<number>()
  const [now, setNow] = useState(Date.now())
  useEffect(() => { setText(readDraft(draftKey)); setFb(readWrite(state.notes, task.id)?.last ?? null); setShowRevised(false); setShowSample(false); setChecks([]); setEndAt(undefined); setError('') // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])
  useEffect(() => { if (!endAt) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [endAt])
  const words = wordCount(text)
  const keyed = !!tutorKey()
  const rec = readWrite(state.notes, task.id)
  const left = endAt ? Math.max(0, endAt - now) : 0
  useTaskContext({ label: '寫作 ' + stage.name + '：' + task.zh, detail: '寫作題：' + task.prompt + '（' + task.zh + '）\n這一階的評分項目：' + stage.criteria.join('；') + '\n幫他想內容、結構或句型，不要替他寫整段。', draft: text })
  const outline = outlines[stage.id]
  const prompt = task.prompt + (task.chart ? '\n圖表資料：' + task.chart.title + ' ' + task.chart.points.map(p => p.label + ' ' + p.value).join(', ') : '')

  function save(patch: Partial<NonNullable<typeof rec>>) {
    onActivity(prev => {
      const old = readWrite(prev.notes, task.id)
      const next = { ...old, ...patch, day: date, words, tries: (old?.tries ?? 0) + (patch.last ? 1 : 0) }
      return { ...prev, notes: { ...prev.notes, [writeKey(task.id)]: JSON.stringify(next) } }
    })
  }
  async function check() {
    if (!text.trim() || busy) return
    setBusy(true); setError(''); setShowRevised(false)
    try {
      const reply = await askTutor(system(stage, prompt), [{ role: 'user', content: text.trim() }])
      const f = parseFeedback(reply, stage.criteria)
      if (!f) { setError('批改格式怪怪的，再按一次試試。'); return }
      setFb(f)
      const sc = scoreOf(f, !!stage.ielts)
      save({ last: f, best: Math.max(rec?.best ?? 0, sc) })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const stageDone = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s.tasks.filter(t => taskDone(readWrite(state.notes, t.id), !!s.ielts)).length])), [state.notes])

  return <div className="pr-stack wl">
    <div className="pr-options wl-stages" role="group" aria-label="寫作階梯">
      {stages.map(s => <button key={s.id} type="button" aria-pressed={s.id === stage.id} onClick={() => { setStageId(s.id); setTaskId((s.tasks.find(t => !taskDone(readWrite(state.notes, t.id), !!s.ielts)) ?? s.tasks[0]).id) }}>
        {s.name}<small>{stageDone[s.id]} / {s.tasks.length}{s.id === suggested ? ' · 建議' : ''}</small></button>)}
    </div>
    <p className="qz-meta"><span>這一階的目標：{stage.goal}</span>{stage.ielts && <span>正式考試建議 {stage.minutes} 分鐘、至少 {task.min} 字</span>}</p>
    {stage.tasks.length > 1 && <div className="wl-tasks" role="group" aria-label="題目">{stage.tasks.map((t, i) => <button key={t.id} type="button" aria-pressed={t.id === task.id} onClick={() => setTaskId(t.id)}>
      題 {i + 1}{taskDone(readWrite(state.notes, t.id), !!stage.ielts) ? ' ✓' : ''}</button>)}</div>}
    <section className="wl-task">
      <h3 lang="en">{task.prompt}</h3>
      <p className="wl-zh">{task.zh}</p>
      {task.chart && <MiniChart chart={task.chart} />}
      {outline && <details className="wl-outline"><summary>結構提示</summary><ol>{outline.map(o => <li key={o}>{o}</li>)}</ol></details>}
      <details className="wl-criteria"><summary>這一階怎麼評分（{stage.criteria.length} 項）</summary><ul>{stage.criteria.map(c => <li key={c}>{c}</li>)}</ul></details>
    </section>
    <label className="pr-field">我的英文
      <textarea lang="en" rows={stage.id === 'sentence' ? 4 : stage.ielts ? 14 : 8} value={text} spellCheck={false} autoComplete="off"
        onChange={e => { setText(e.target.value); writeDraft(draftKey, e.target.value) }} placeholder={stage.id === 'sentence' ? '一句一行也可以' : '先照結構提示寫，寫不出來的地方先留空'} />
    </label>
    <div className="wl-bar">
      <span data-ok={words >= task.min}>{words} / {task.min} 字</span>
      {stage.ielts && (endAt ? <span data-ok={left > 0}>{left > 0 ? '剩 ' + Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0') : '時間到（可以繼續寫完）'}</span>
        : <button type="button" className="pr-link" onClick={() => { setEndAt(Date.now() + (stage.minutes ?? 20) * 60000); setNow(Date.now()) }}>開始計時 {stage.minutes} 分鐘</button>)}
      {rec?.best !== undefined && <span>最佳：{stage.ielts ? 'band ' + rec.best : rec.best.toFixed(1) + ' / 5'}</span>}
    </div>
    <div className="pr-actions">
      {keyed ? <button type="button" className="pr-main" disabled={!text.trim() || busy} onClick={check}>{busy ? '批改中……' : fb ? '改好了，再批一次' : '照評分項目批改'}</button>
        : <button type="button" className="pr-main" disabled={!text.trim()} onClick={() => setChecks(stage.criteria.map(() => false))}>自己對照評分項目檢查</button>}
      <StuckButton />
      {task.sample && <button type="button" className="pr-link" onClick={() => setShowSample(!showSample)}>{showSample ? '收起參考範文' : '看參考範文'}</button>}
    </div>
    {error && <p className="tu-error" role="alert">{error}</p>}
    {showSample && <section className="pr-reference"><small>參考範文（只是一種寫法；看完先自己改，不要照抄）</small>{task.sample.split('\n').map((l, i) => l.trim() ? <p key={i} lang="en">{l}</p> : null)}</section>}
    {!keyed && checks.length > 0 && <section className="wl-self">
      <strong>逐項檢查，做到就打勾</strong>
      {stage.criteria.map((c, i) => <label key={c}><input type="checkbox" checked={!!checks[i]} onChange={e => { const n = [...checks]; n[i] = e.target.checked; setChecks(n) }} /> {c}</label>)}
      <button type="button" disabled={!checks.length || checks.some(x => !x)} onClick={() => save({ self: 1, day: date, words })}>都做到了，記下來</button>
      <small>還沒連接 Claude，這一題會記成「自己檢查過」。</small>
    </section>}
    {fb && <section className="wl-fb" aria-live="polite">
      <div className="wl-fb-head"><strong>批改</strong>{stage.ielts && fb.band !== undefined && <span className="wl-band">估計 band {fb.band}</span>}</div>
      {fb.summary && <p>{fb.summary}</p>}
      <ul className="wl-crit">{fb.criteria.map(c => <li key={c.name}><span className="wl-score" data-level={stage.ielts ? (c.score >= 6.5 ? 'hi' : c.score >= 5.5 ? 'mid' : 'lo') : (c.score >= 4 ? 'hi' : c.score >= 3 ? 'mid' : 'lo')}>{stage.ielts ? c.score : c.score + '/5'}</span>
        <div><b>{c.name}</b><small>{c.comment}</small></div></li>)}</ul>
      {fb.next && <p className="wl-next"><b>下一版只改這件事：</b>{fb.next}</p>}
      {fb.fixes.length > 0 && <details><summary>文法和用字（{fb.fixes.length}）</summary><ul className="tu-fixes">{fb.fixes.map((f, i) => <li key={i}><span lang="en"><s>{f.wrong || '（漏寫）'}</s> → <b>{f.right}</b></span><small>{f.why}</small></li>)}</ul></details>}
      {fb.revised && <button type="button" className="pr-link" onClick={() => setShowRevised(!showRevised)}>{showRevised ? '收起修改版' : '看修改後的全文（先自己改過再看）'}</button>}
      {showRevised && fb.revised && <section className="pr-reference">{fb.revised.split('\n').map((l, i) => l.trim() ? <p key={i} lang="en">{l}</p> : null)}</section>}
      {stage.ielts && <small className="wl-note">分數是練習用的估計，跟正式考官評分可能有差距。</small>}
    </section>}
  </div>
}

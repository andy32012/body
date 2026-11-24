import { useEffect, useMemo, useRef, useState } from 'react'
import data from '../data/writing.json'
import type { PageProps } from '../lib/store'
import { askTutor, tutorKey } from '../lib/tutor'
import { readDraft, writeDraft } from '../lib/drafts'
import { useTaskContext } from '../lib/taskContext'
import { criteriaFor, essayKind, essays, parseFeedback, readWrite, scoreOf, selfChecked, suggestedStage, taskDone, wordCount, writeKey, type WriteFeedback, type WriteStage, type WriteTask } from '../lib/writing'
import { MiniChart } from './LessonParts'
import StuckButton from './StuckButton'
import { answerAllowed, isAbort, useClaudeGate } from '../lib/answerGate'
import { hintRuleLines, stageFor, type Stage } from '../lib/correction'
import { learnedFor, learnedLines } from '../lib/learned'
import { addSayCard, fixToCard } from '../lib/sayCards'
import './writing.css'

const stages = data.stages as WriteStage[]
const outlines: Record<string, string[]> = {
  paragraph: ['Topic sentence：一句說整段要講什麼', 'First, …', 'Also / Second, …', 'Finally, …', 'Conclusion：For these reasons, …'],
  multi: ['第一段：開頭（打招呼／說出主題或立場）', '第二段：內容（理由、例子、經過）', '第三段：結尾（總結／請求／祝福）'],
  task1: ['Introduction：用自己的話改寫題目', 'Overview：Overall, …（最大的趨勢或特點，不放數字）', 'Body 1：前半段的重要數據和比較', 'Body 2：後半段的重要數據和比較'],
  task2: ['Introduction：改寫題目＋你的立場', 'Body 1：第一個論點＋解釋＋例子', 'Body 2：第二個論點（或另一方看法）＋解釋＋例子', 'Conclusion：重申立場，不加新論點'],
  bridge: ['第一句：說出這一段要講什麼', '中間三到五句：照題目用這一課的句型寫，用時間、因果、轉折的字接起來（First / Then / because / so / However）', '最後一句：收尾（結果、感想或建議）'],
}
/** The first two checks of a piece give scores and hints only (where, what kind); the third, or asking for it, gives
 *  the right answers and a revised text. */
function system(stage: WriteStage, task: WriteTask, prompt: string, step: Stage = 'full', learned: string[] = []) {
  const ielts = !!stage.ielts
  const kind = stage.id === 'task2' ? essayKind(task.prompt) : null
  const hinting = step !== 'full'
  return [
    '你是英文寫作老師，批改台灣護理系學生（英文約國中程度，目標雅思）的英文寫作。',
    '題目：' + prompt,
    ...(task.after ? ['這題只用到單元 ' + task.after + ' 以前教過的文法；用到還沒教的結構不扣分，在 hint 簡單教。'] : []),
    ...(learned.length ? ['', ...learned, ''] : []),
    ...(kind ? ['這題是「' + essays[kind].name + '」題，照這種題目該有的結構評：' + essays[kind].outline.join('；')] : []),
    ...(task.focus ? ['這一課的文法重點：' + task.focus + '。第一項看他有沒有照題目用到這些句型、用得對不對；沒用到就照實給低分並說明要怎麼加。'] : []),
    '這一階的評分項目（name 一定要照這些名稱、照這個順序）：' + criteriaFor(stage, task).join('；'),
    ielts ? '每個項目給雅思分數（1–9 的數字，可用 .5；初學者寫得很短、錯很多就如實給 1–3.5，不要為了鼓勵而墊高到 4），再給整體 band（四項平均，四捨五入到 .5）。分數要誠實，寧可保守；這只是練習估計，不是正式分數。字數不足要在 Task 項目扣分並說明。'
      : '這一階不是考試作文，不給雅思分數。每個項目給 1–5 的整數（5 = 完全做到），comment 要具體說出哪個字、哪個文法或哪句表達要改，以及怎麼改。',
    ...(hinting ? [
      ...hintRuleLines(step),
      '- comment、summary、next 也不可以寫出正確的英文句子，只說要往哪個方向改。',
      '只輸出 JSON：{"criteria":[{"name":"項目名","score":數字,"comment":"一句繁體中文說明做得好的和要改的"}],' + (ielts ? '"band":數字,' : '') + '"summary":"一句整體評語","next":"下一版最重要、只改一件事的方向","fixes":[{"wrong":"原文片段（照他寫的抄）","type":"錯誤類型，例如：時態、冠詞、單複數、主詞動詞一致、介系詞、用字、連接詞","hint":"提示","learned":true}]}',
      'fixes 最多 6 個，挑最重要的。',
    ] : [
      '只輸出 JSON：{"criteria":[{"name":"項目名","score":數字,"comment":"一句繁體中文說明做得好的和要改的"}],' + (ielts ? '"band":數字,' : '') + '"summary":"一句整體評語","next":"下一版最重要、只改一件事的建議","fixes":[{"wrong":"原文片段","right":"改成","why":"一句原因"}],"revised":"保留他內容的修改版全文"}',
      'fixes 最多 6 個，挑最重要的；comment 和 why 用口語繁體中文。文法和意思對就不要改成更難的寫法。',
    ]),
  ].join('\n')
}

/** 寫作階梯 with criteria feedback; IELTS tasks get a timer and a word target. */
export default function WritingLadder({ state, onActivity, date, initialTask }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string; initialTask?: string }) {
  const suggested = suggestedStage(stages, state.notes)
  // A task opened from a unit's pack (library/writing/<id>) starts on that task.
  const opened = initialTask ? stages.find(s => s.tasks.some(t => t.id === initialTask)) : undefined
  const [stageId, setStageId] = useState(() => opened?.id ?? suggested)
  const stage = stages.find(s => s.id === stageId)!
  const firstOpen = stage.tasks.find(t => !taskDone(readWrite(state.notes, t.id), !!stage.ielts)) ?? stage.tasks[0]
  const [taskId, setTaskId] = useState(() => opened && initialTask ? initialTask : firstOpen.id)
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
  // Each check carries a number; switching task cancels it, so a late reply never lands on another question.
  const request = useRef(0)
  useEffect(() => { request.current++; setBusy(false); setText(readDraft(draftKey)); setFb(readWrite(state.notes, task.id)?.last ?? null); setShowRevised(false); setShowSample(false); setChecks([]); setEndAt(undefined); setError(''); setSavedFix([]) // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])
  useEffect(() => { if (!endAt) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [endAt])
  const words = wordCount(text)
  const keyed = !!tutorKey()
  const gate = useClaudeGate()
  const rec = readWrite(state.notes, task.id)
  const learned = learnedLines(learnedFor(state, { id: '', reference: [''], newWords: [] }))
  const [savedFix, setSavedFix] = useState<number[]>([])
  const left = endAt ? Math.max(0, endAt - now) : 0
  useTaskContext({ label: '寫作 ' + stage.name + '：' + task.zh, detail: '寫作題：' + task.prompt + '（' + task.zh + '）\n評分項目：' + criteriaFor(stage, task).join('；') + '\n幫他想內容、結構或句型，不要替他寫整段。', draft: text })
  const kind = stage.id === 'task2' ? essayKind(task.prompt) : null
  const outline = kind ? essays[kind].outline : outlines[stage.id]
  const criteria = criteriaFor(stage, task)
  const prompt = task.prompt + (task.chart ? '\n圖表資料：' + task.chart.title + ' ' + task.chart.points.map(p => p.label + ' ' + p.value).join(', ') : '')

  function save(patch: Partial<NonNullable<typeof rec>>, id = task.id, count = words, countTry = true) {
    onActivity(prev => {
      const old = readWrite(prev.notes, id)
      // The best score is worked out from the saved record, so two checks in a row cannot overwrite each other.
      const best = patch.best === undefined ? old?.best : Math.max(old?.best ?? 0, patch.best)
      const next = { ...old, ...patch, best, day: date, words: count, tries: (old?.tries ?? 0) + (patch.last && countTry ? 1 : 0) }
      return { ...prev, notes: { ...prev.notes, [writeKey(id)]: JSON.stringify(next) } }
    })
  }
  /** Once the right answers are out, every mistake goes into the sentence cards so it comes back in review. */
  function saveMistakes(fixes: WriteFeedback['fixes']) {
    onActivity(prev => fixes.reduce((p, f, i) => { const card = fixToCard(f, 'lesson'); return card ? addSayCard(p, card, date, '-' + i) : p }, prev))
    setSavedFix(fixes.map((_, i) => i))
  }
  async function check() {
    if (!text.trim() || busy) return
    const mine = ++request.current
    const asked = { id: task.id, words, ielts: !!stage.ielts }
    setBusy(true); setError(''); setShowRevised(false); setSavedFix([])
    const step = stageFor((rec?.tries ?? 0) + 1, true)
    try {
      const reply = await askTutor(system(stage, task, prompt, step, learned), [{ role: 'user', content: text.trim() }])
      gate.worked()
      if (mine !== request.current) return
      const f = parseFeedback(reply, criteria, asked.ielts, step !== 'full')
      if (!f) { setError('評估失敗：回傳的分數不完整、項目對不上，或不在合理範圍（' + (asked.ielts ? '每項 1–9，band 要跟四項平均差不多' : '每項是 1–5 的整數') + '），這次不算數，也不會記成過關。再按一次批改。'); return }
      setFb(f)
      save({ last: f, best: scoreOf(f, asked.ielts) }, asked.id, asked.words)
      if (!f.partial && f.fixes.length) saveMistakes(f.fixes)
    } catch (e) { if (!isAbort(e)) gate.failed(); if (mine === request.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (mine === request.current) setBusy(false) }
  }
  /** After the hints, he asks for the right answers and the revised text: the scores already given stay. */
  async function showFull() {
    if (!fb || busy) return
    const mine = ++request.current
    const asked = { id: task.id, words }
    setBusy(true); setError('')
    try {
      const reply = await askTutor(system(stage, task, prompt, 'full', learned), [{ role: 'user', content: text.trim() }])
      gate.worked()
      if (mine !== request.current) return
      const full = parseFeedback(reply, criteria, !!stage.ielts)
      if (!full) { setError('老師回得格式怪怪的，再按一次「看完整批改」。'); return }
      const merged = { ...fb, fixes: full.fixes, revised: full.revised, partial: false }
      setFb(merged)
      save({ last: merged, revealed: true }, asked.id, asked.words, false)
      if (merged.fixes.length) saveMistakes(merged.fixes)
    } catch (e) { if (!isAbort(e)) gate.failed(); if (mine === request.current) setError(e instanceof Error ? e.message : String(e)) }
    finally { if (mine === request.current) setBusy(false) }
  }
  const stageDone = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s.tasks.filter(t => taskDone(readWrite(state.notes, t.id), !!s.ielts)).length])), [state.notes])

  return <div className="pr-stack wl">
    <div className="pr-options wl-stages" role="group" aria-label="寫作階梯">
      {stages.map(s => <button key={s.id} type="button" aria-pressed={s.id === stage.id} onClick={() => { setStageId(s.id); setTaskId((s.tasks.find(t => !taskDone(readWrite(state.notes, t.id), !!s.ielts)) ?? s.tasks[0]).id) }}>
        {s.name}<small>{stageDone[s.id]} / {s.tasks.length}{s.id === suggested ? ' · 建議' : ''}</small></button>)}
    </div>
    <p className="qz-meta"><span>這一階的目標：{stage.goal}</span>{stage.ielts && <span>正式考試建議 {stage.minutes} 分鐘、至少 {task.min} 字</span>}</p>
    {stage.tasks.length > 1 && <div className="wl-tasks" role="group" aria-label="題目">{stage.tasks.map((t, i) => <button key={t.id} type="button" aria-pressed={t.id === task.id} onClick={() => setTaskId(t.id)}>
      {stage.pack && t.unit ? '單元 ' + t.unit + (t.id.endsWith('a') ? '-1' : '-2') : '題 ' + (i + 1)}{taskDone(readWrite(state.notes, t.id), !!stage.ielts) ? ' ✓' : selfChecked(readWrite(state.notes, t.id)) ? ' · 自評' : ''}</button>)}</div>}
    <section className="wl-task">
      <h3 lang="en">{task.prompt}</h3>
      <p className="wl-zh">{task.zh}</p>
      {task.chart && <MiniChart chart={task.chart} />}
      {outline && <details className="wl-outline"><summary>結構提示{kind ? '（' + essays[kind].name + '題）' : ''}</summary><ol>{outline.map(o => <li key={o}>{o}</li>)}</ol></details>}
      <details className="wl-criteria"><summary>這{kind ? '題' : '一階'}怎麼評分（{criteria.length} 項）</summary><ul>{criteria.map(c => <li key={c}>{c}</li>)}</ul></details>
    </section>
    <label className="pr-field">我的英文
      <textarea lang="en" rows={stage.id === 'sentence' ? 4 : stage.ielts ? 14 : 8} value={text} spellCheck={false} autoComplete="off"
        onChange={e => { setText(e.target.value); writeDraft(draftKey, e.target.value) }} placeholder={stage.id === 'sentence' ? '一句一行也可以' : '先照結構提示寫，寫不出來的地方先留空'} />
    </label>
    <div className="wl-bar">
      <span data-ok={words >= task.min}>{words} / {task.min} 字</span>
      {stage.ielts && (endAt ? <span data-ok={left > 0}>{left > 0 ? '剩 ' + Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0') : '時間到（可以繼續寫完）'}</span>
        : <button type="button" className="pr-link" onClick={() => { setEndAt(Date.now() + (stage.minutes ?? 20) * 60000); setNow(Date.now()) }}>開始計時 {stage.minutes} 分鐘</button>)}
      {rec?.best !== undefined && rec.best <= (stage.ielts ? 9 : 5) && <span>最佳：{stage.ielts ? '練習估計 ' + rec.best : rec.best.toFixed(1) + ' / 5'}</span>}
    </div>
    {stage.ielts && <small className="wl-count">字數怎麼算：英文字和數字各算一個（well-known、don't、37.5 都算一個），標點不算。跟考場算法接近，但不完全一樣，寧可多寫幾個字。</small>}
    <div className="pr-actions">
      {keyed ? <button type="button" className="pr-main" disabled={!text.trim() || busy} onClick={check}>{busy ? '批改中……' : fb ? '改好了，再批一次' : '照評分項目批改'}</button>
        : <button type="button" className="pr-main" disabled={!text.trim()} onClick={() => setChecks(criteria.map(() => false))}>自己對照評分項目檢查</button>}
      <StuckButton />
      {task.sample && (answerAllowed(gate.usable, !!text.trim()) || showSample) && <button type="button" className="pr-link" onClick={() => setShowSample(!showSample)}>{showSample ? '收起參考範文' : '看參考範文'}</button>}
    </div>
    {error && <p className="tu-error" role="alert">{error}</p>}
    {showSample && <section className="pr-reference"><small>參考範文（只是一種寫法；看完先自己改，不要照抄）</small>{task.sample.split('\n').map((l, i) => l.trim() ? <p key={i} lang="en">{l}</p> : null)}</section>}
    {!keyed && checks.length > 0 && <section className="wl-self">
      <strong>逐項檢查，做到就打勾</strong>
      {criteria.map((c, i) => <label key={c}><input type="checkbox" checked={!!checks[i]} onChange={e => { const n = [...checks]; n[i] = e.target.checked; setChecks(n) }} /> {c}</label>)}
      <button type="button" disabled={!checks.length || checks.some(x => !x)} onClick={() => save({ self: 1, day: date, words })}>都做到了，記下來</button>
      <small>還沒連接 Claude，這一題會記成「自評完成・待確認」，不算過關；連上 Claude 批改過才算。</small>
    </section>}
    {fb && <section className="wl-fb" aria-live="polite">
      <div className="wl-fb-head"><strong>批改</strong>{stage.ielts && fb.band !== undefined && <span className="wl-band">IELTS 練習估計分數 {fb.band}</span>}</div>
      {fb.summary && <p>{fb.summary}</p>}
      <ul className="wl-crit">{fb.criteria.map(c => <li key={c.name}><span className="wl-score" data-level={stage.ielts ? (c.score >= 6.5 ? 'hi' : c.score >= 5.5 ? 'mid' : 'lo') : (c.score >= 4 ? 'hi' : c.score >= 3 ? 'mid' : 'lo')}>{stage.ielts ? c.score : c.score >= 4 ? '做到' : '要改'}</span>
        <div><b>{c.name}</b><small>{c.comment}</small></div></li>)}</ul>
      {fb.next && <p className="wl-next"><b>下一版只改這件事：</b>{fb.next}</p>}
      {fb.partial && fb.fixes.length > 0 && <section className="tu-self">
        <strong>先自己改（{fb.fixes.length}）</strong>
        <ol className="tu-fixes">{fb.fixes.map((f, i) => <li key={i}>
          <span>問題在：<b lang="en">{f.wrong || '（這裡漏寫了一部分）'}</b>{f.type ? <> · {f.type}</> : null}</span>
          {f.learned === false && <small className="tu-new">這個還沒教過，先學起來：</small>}
          <small>{f.hint}</small>
        </li>)}</ol>
        <p className="tu-help">照提示改好再批一次{(rec?.tries ?? 0) >= 2 ? '' : '；第三次還沒改好會給你完整批改'}。</p>
        <button type="button" className="pr-link" disabled={busy} onClick={showFull}>看完整批改</button>
      </section>}
      {!fb.partial && fb.fixes.length > 0 && <details><summary>文法和用字（{fb.fixes.length}）</summary><ul className="tu-fixes">{fb.fixes.map((f, i) => {
        const card = fixToCard(f, 'lesson')
        return <li key={i}><span lang="en"><s>{f.wrong || '（漏寫）'}</s>{f.right ? <> → <b>{f.right}</b></> : null}</span><small>{f.why}</small>
          {card && <button type="button" className="tu-save" disabled={savedFix.includes(i)} onClick={() => { onActivity(prev => addSayCard(prev, card, date)); setSavedFix(list => [...list, i]) }}>{savedFix.includes(i) ? '已加入複習' : '加入複習'}</button>}</li>
      })}</ul></details>}
      {fb.revised && <button type="button" className="pr-link" onClick={() => setShowRevised(!showRevised)}>{showRevised ? '收起修改版' : '看修改後的全文（先自己改過再看）'}</button>}
      {showRevised && fb.revised && <section className="pr-reference">{fb.revised.split('\n').map((l, i) => l.trim() ? <p key={i} lang="en">{l}</p> : null)}</section>}
      {stage.ielts && <small className="wl-note">分數是練習用的估計，跟正式考官評分可能有差距。</small>}
    </section>}
  </div>
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { askTutor, ClaudeIncomplete, tutorKey } from '../lib/tutor'
import { readDraft, writeDraft } from '../lib/drafts'
import { useTaskContext } from '../lib/taskContext'
import { chartKind, chartText, checksFor, countedBest, essayKind, essays, gradePrompt, nextWritingTask, parseGrade, readWrite, rubricFor, scoredParts, selfChecked, stagesOpen, stageTarget, suggestedStage, taskDone, wordCount, writeKey, writeTaskOpen, writingTaskPages, taskOneOutlines, type WriteFeedback, type WriteStage } from '../lib/writing'
import { logSkill, packUnits } from '../lib/bridge'
import { LockLine } from './Locked'
import { levelText, passes, rubrics } from '../lib/rubrics'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { ChartView } from './LessonParts'
import StuckButton from './StuckButton'
import { RubricTable } from './RubricTable'
import './grammar.css'
import './writing.css'

const outlines: Record<string, string[]> = {
  paragraph: ['Topic sentence：一句說整段要講什麼', 'First, …', 'Also / Second, …', 'Finally, …', 'Conclusion：換個說法再講一次主題（For these reasons／That is why／All in all, …）'],
  multi: ['第一段：開頭（打招呼／說出主題或立場）', '第二段：內容（理由、例子、經過）', '第三段：結尾（總結／請求／祝福）'],
  task2: ['Introduction：改寫題目＋你的立場', 'Body 1：第一個論點＋解釋＋例子', 'Body 2：第二個論點（或另一方看法）＋解釋＋例子', 'Conclusion：重申立場，不加新論點'],
  bridge: ['第一句：說出這一段要講什麼', '中間三到五句：照題目用這一課的句型寫，用時間、因果、轉折的字接起來（First / Then / because / so / However）', '最後一句：收尾（結果、感想或建議）'],
}
/** The colour of a score: 單句寫作 2 / 1 / 0; 全民英檢 4–5 passes, 3 is close; IELTS 7+ / 6 / 5 and below. */
const levelOf = (score: number, max: number) =>
  max === 2 ? (score >= 2 ? 'hi' : score >= 1 ? 'mid' : 'lo')
    : max === 5 ? (score >= 4 ? 'hi' : score >= 3 ? 'mid' : 'lo')
      : (score >= 7 ? 'hi' : score >= 6 ? 'mid' : 'lo')

/** A check graded by a published table: the total, each score with the level it matches and why, and the stage's own requirements. */
function Graded({ fb, short }: { fb: WriteFeedback; short?: { words: number; min: number } }) {
  const r = rubrics[fb.rubric!]
  const scores = fb.scores ?? []
  const ielts = r.id.startsWith('ielts')
  const got = scores.reduce((a, s) => a + s.score, 0), full = r.max * scores.length
  const ok = passes(r, scores.length ? got / scores.length : 0)
  return <>
    <div className="wl-fb-head"><strong>Claude 批改</strong><span className="wl-band">{ielts ? 'IELTS 練習估計 ' + fb.band : r.id === 'gept-sentence' ? got + ' / ' + full + ' 分' : got + ' / 5 級分'}</span></div>
    <p className="wl-pass" data-ok={ok && !short}>照「{r.title}」官方評分表給分{r.pass ? (ok ? (short ? '：分數有到練習目標（' + r.pass.note + '）' : '：✓ 達到這裡的練習目標（' + r.pass.note + '）') : '：還沒到這裡的練習目標（' + r.pass.note + '）') : '：四項平均，照雅思的方式進位'}</p>
    {short && <p className="wl-pass" data-ok={false}>這一版只有 {short.words} 字，題目要至少 {short.min} 字：分數照常給你看，但這次不算過關。</p>}
    {fb.summary && <p>{fb.summary}</p>}
    <ul className="wl-scores">{scores.map((s, i) => <li key={s.name}>
      <span className="wl-score" data-level={levelOf(s.score, r.max)}>{s.score}{ielts ? '' : ' / ' + r.max}</span>
      <div><b>{s.name === '整篇' ? r.title : s.name}</b>
        <small className="wl-level">表上第 {s.score} 級：{levelText(r, s.score, r.scales.length > 1 ? i : 0)}</small>
        {s.reason && <small>{s.reason}</small>}</div>
    </li>)}</ul>
    {fb.checks && fb.checks.length > 0 && <ul className="wl-checks" aria-label="這一階的要求">{fb.checks.map(c => <li key={c.name} data-ok={c.ok}>
      <span>{c.ok ? '✓' : '✗'}</span><div>{c.name}{c.comment && <small>{c.comment}</small>}</div></li>)}</ul>}
    {fb.unchecked && fb.unchecked.length > 0 && <p className="ls-help">這幾項要求 Claude 這次沒有回答到：{fb.unchecked.join('；')}（想知道的話再按一次批改）</p>}
    <RubricTable rubric={r} label="對照的評分表" />
  </>
}

/** 寫作階梯: Claude grades each piece by the published table for its stage (全民英檢 or IELTS); IELTS tasks get a timer and a word target. */
type LadderProps = Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string; initialTask?: string }
/** The bank (1,400 tasks) loads only when this page opens, so it does not slow down every start of the app. */
export default function WritingLadder(props: LadderProps) {
  const [stages, setStages] = useState<WriteStage[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    import('../data/writing.json').then(f => { if (alive) setStages(f.default.stages as WriteStage[]) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  if (failed) return <p>寫作題目載入失敗，重新整理再試一次。</p>
  if (!stages) return <p>載入中……</p>
  return <Ladder {...props} stages={stages} />
}

function Ladder({ state, onActivity, date, initialTask, stages }: LadderProps & { stages: WriteStage[] }) {
  const suggested = suggestedStage(stages, state.notes)
  const unit = state.curriculum.unit
  // A stage opens once the one before it has two tasks done; the bridge stage and its tasks open with their units.
  const openStage = stagesOpen(stages, state.notes, unit)
  const firstOpenTask = (s: WriteStage) => s.tasks.find(t => writeTaskOpen(t, unit) && !taskDone(readWrite(state.notes, t.id), !!s.ielts)) ?? s.tasks.find(t => writeTaskOpen(t, unit)) ?? s.tasks[0]
  // A task opened from a unit's pack (library/writing/<id>) starts on that task, if it is open.
  const fromPack = initialTask ? stages.find(s => s.tasks.some(t => t.id === initialTask && writeTaskOpen(t, unit))) : undefined
  const [stageId, setStageId] = useState(() => fromPack && openStage[fromPack.id] ? fromPack.id : suggested)
  const stage = stages.find(s => s.id === stageId && openStage[s.id]) ?? stages.find(s => s.id === suggested)!
  const firstOpen = firstOpenTask(stage)
  const [taskId, setTaskId] = useState(() => fromPack && initialTask && fromPack.id === stage.id ? initialTask : firstOpen.id)
  const task = stage.tasks.find(t => t.id === taskId && writeTaskOpen(t, unit)) ?? firstOpen
  const pages = useMemo(() => writingTaskPages(stage), [stage])
  const [pageIndex, setPageIndex] = useState(() => pages.findIndex(p => p.tasks.some(t => t.task.id === task.id)))
  const taskPage = pages[pageIndex] ?? pages[0]
  useEffect(() => { setPageIndex(pages.findIndex(p => p.tasks.some(t => t.task.id === task.id))) }, [pages, task.id])
  const draftKey = 'write.' + task.id
  const [text, setText] = useState(() => readDraft(draftKey))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Claude could not be reached this time (no network, a refused key…): the model essay opens as a way on.
  const [claudeDown, setClaudeDown] = useState(false)
  const [fb, setFb] = useState<WriteFeedback | null>(() => readWrite(state.notes, task.id)?.last ?? null)
  const [showRevised, setShowRevised] = useState(false)
  const [showSample, setShowSample] = useState(false)
  const [ticks, setTicks] = useState<boolean[]>([])
  // The self-check was saved just now (without Claude): say so, and offer the next task.
  const [savedSelf, setSavedSelf] = useState(false)
  const [endAt, setEndAt] = useState<number>()
  const [now, setNow] = useState(Date.now())
  const stageStrip = useRef<HTMLDivElement>(null)
  const stageStarted = stage.tasks.some(t => readWrite(state.notes, t.id) !== null)
  useEffect(() => {
    const strip = stageStrip.current
    const selected = strip?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')
    if (!strip || !selected) return
    // Move only this row, keeping the current stage visible without jumping the page vertically.
    strip.scrollLeft += selected.getBoundingClientRect().left - strip.getBoundingClientRect().left - (strip.clientWidth - selected.offsetWidth) / 2
  }, [stage.id])
  useEffect(() => () => stopSpeaking(), [stage.id])
  // Each check carries a number; switching task cancels it, so a late reply never lands on another question.
  const request = useRef(0)
  useEffect(() => { request.current++; setBusy(false); setText(readDraft(draftKey)); setFb(readWrite(state.notes, task.id)?.last ?? null); setShowRevised(false); setShowSample(false); setTicks([]); setSavedSelf(false); setEndAt(undefined); setError('') // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id])
  useEffect(() => { if (!endAt) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [endAt])
  const words = wordCount(text)
  const keyed = !!tutorKey()
  const rec = readWrite(state.notes, task.id)
  const left = endAt ? Math.max(0, endAt - now) : 0
  const rubric = rubricFor(stage)
  const parts = scoredParts(stage, task)
  const checks = checksFor(stage, task)
  // Without Claude he ticks the stage's requirements himself (or each required sentence / IELTS criterion).
  const selfList = checks.length ? checks : parts
  useTaskContext({ label: '寫作 ' + stage.name + '：' + task.zh, detail: '寫作題：' + task.prompt + '（' + task.zh + '）\n評分表：' + rubric.title + '（官方）' + (checks.length ? '\n這一階的要求：' + checks.join('；') : '') + '\n幫他想內容、結構或句型，不要替他寫整段。', draft: text })
  const kind = stage.id === 'task2' ? essayKind(task.prompt) : null
  const outline = kind ? essays[kind].outline : stage.id === 'task1' ? taskOneOutlines[chartKind(task.chart) ?? 'trend'] : outlines[stage.id]
  const prompt = task.prompt + (task.chart ? '\n圖表資料：' + chartText(task.chart) : '')
  const sentencePoints = rubric.id === 'gept-sentence' ? rubric.max * parts.length : 0

  function save(patch: Partial<NonNullable<typeof rec>>, id = task.id, count = words) {
    onActivity(prev => {
      const old = readWrite(prev.notes, id)
      // The best score is worked out from the saved record, so two checks in a row cannot overwrite each other.
      const best = patch.best === undefined ? old?.best : Math.max(old?.best ?? 0, patch.best)
      const next = { ...old, ...patch, best, day: date, words: count, tries: (old?.tries ?? 0) + (patch.last ? 1 : 0) }
      // Every day he hands in writing counts as a writing day, even when the same task is redone on a later day.
      return { ...prev, notes: logSkill({ ...prev.notes, [writeKey(id)]: JSON.stringify(next) }, 'write', date) }
    })
  }
  async function check() {
    if (!text.trim() || busy) return
    const mine = ++request.current
    const asked = { id: task.id, words, ielts: !!stage.ielts, rubric, parts, checks, task, text: text.trim() }
    setBusy(true); setError(''); setShowRevised(false)
    try {
      const reply = await askTutor(gradePrompt(stage, task, prompt), [{ role: 'user', content: text.trim() }])
      if (mine !== request.current) return
      setClaudeDown(false)
      const f = parseGrade(reply, asked.rubric, asked.parts, asked.checks)
      if (!f) { setError('評分失敗：回傳的批改缺了項目名稱或理由，或分數不在評分表上（' + (asked.ielts ? '每項是 1–9 的整數 band' : '0–' + asked.rubric.max + ' 的整數') + '）。這次不算數，也不會記成過關，再按一次批改。'); return }
      // The check belongs to the text that was sent: it is saved with it, and a later draft is never shown under its scores.
      const graded: WriteFeedback = { ...f, answer: asked.text }
      setFb(graded)
      save({ last: graded, best: countedBest(graded, asked.ielts, asked.words, asked.task) }, asked.id, asked.words)
    } catch (e) {
      // A reply cut off or declined is not Claude out of reach: the sample essay stays hidden, pressing again is the way on.
      if (mine === request.current) { setError(e instanceof Error ? e.message : String(e)); setClaudeDown(!(e instanceof ClaudeIncomplete)) }
    }
    finally { if (mine === request.current) setBusy(false) }
  }
  /** Another task: the page scrolls back up to its question (the essay box below follows the chosen task). */
  function goTo(id: string) {
    setTaskId(id)
    requestAnimationFrame(() => document.querySelector('.wl-task')?.scrollIntoView({ block: 'start' }))
  }
  /** 上一組 / 下一組 / the range list: the question below changes with the list, to the first open task of that group,
   *  so the list and the essay never show two different tasks (each task keeps its own draft). */
  function showPage(i: number) {
    const page = pages[i]
    if (!page) return
    setPageIndex(i)
    const first = page.tasks.find(t => writeTaskOpen(t.task, unit) && !taskDone(readWrite(state.notes, t.task.id), !!stage.ielts)) ?? page.tasks.find(t => writeTaskOpen(t.task, unit))
    if (first) setTaskId(first.task.id)
  }
  const stageDone = useMemo(() => Object.fromEntries(stages.map(s => [s.id, s.tasks.filter(t => taskDone(readWrite(state.notes, t.id), !!s.ielts)).length])), [state.notes, stages])
  const bestText = rec?.best === undefined || rec.best > (stage.ielts ? 9 : 5) ? ''
    : stage.ielts ? '練習估計 ' + rec.best : sentencePoints ? Math.round(rec.best / 5 * sentencePoints) + ' / ' + sentencePoints + ' 分' : (Number.isInteger(rec.best) ? rec.best : rec.best.toFixed(1)) + ' / 5 級分'

  return <div className="pr-stack wl">
    <div ref={stageStrip} className="pr-options wl-stages" role="group" aria-label="寫作階梯">
      {stages.map((s, i) => {
        const before = !s.pack ? stages.slice(0, i).filter(x => !x.pack).at(-1) : undefined
        return <button key={s.id} type="button" aria-pressed={s.id === stage.id} disabled={!openStage[s.id]} data-locked={!openStage[s.id]} onClick={() => { setStageId(s.id); setTaskId(firstOpenTask(s).id) }}>
          {s.name}{openStage[s.id] ? <small>{stageDone[s.id]} / {s.tasks.length}{s.id === suggested ? ' · 建議' : ''}</small>
            : <LockLine text={s.pack ? '上到單元 ' + packUnits[0] + ' 才打開' : before ? '「' + before.name.replace(/^\S+\s*/, '') + '」做完 ' + stageTarget(before) + ' 題才打開（現在 ' + stageDone[before.id] + '）' : '還沒打開'} />}</button>
      })}
    </div>
    <p className="qz-meta"><span>這一階的目標：{stage.goal}</span>{stage.ielts && <span>正式考試建議 {stage.minutes} 分鐘、至少 {task.min} 字</span>}</p>
    {stage.grammar && <details key={stage.id} className="wl-grammar" open={!stageStarted}>
      <summary>這一階要用的文法</summary>
      <div className="gm-explain">
        <h4>{stage.grammar.title}</h4>
        <ul className="wl-grammar-points">{stage.grammar.points.map(point => <li key={point}>{point}</li>)}</ul>
        <ul className="gm-ex">{stage.grammar.examples.map(example => <li key={example.en}>
          <button type="button" className="gm-say" aria-label={'聽這一句：' + example.en} onClick={() => void speakEnglish(example.en, state.settings.speechRate)}><Volume2 size={18} aria-hidden="true" /></button>
          <span><b lang="en">{example.en}</b><small>{example.zh}</small></span>
        </li>)}</ul>
        {!!stage.grammar.mistakes?.length && <section className="gm-mistakes">
          <h4>常見錯誤</h4>
          {stage.grammar.mistakes.map(mistake => <p key={mistake.bad}>
            <span className="gm-bad" lang="en">✗ {mistake.bad}</span>
            <span className="gm-good" lang="en">✓ {mistake.good}</span>
            <small>{mistake.why}</small>
          </p>)}
        </section>}
      </div>
    </details>}
    {stage.tasks.length > 1 && <section className="wl-picker" aria-label="選擇寫作題目">
      <p className="wl-bank">這一階共 {stage.tasks.length} 題・已過關 {stageDone[stage.id]} 題
        <small>{stage.pack ? '依單元選題，上到該單元才打開。' : '通過 ' + stageTarget(stage) + ' 題就能往下一階，其餘可以慢慢加練。'}</small></p>
      {pages.length > 1 && <div className="wl-pages">
        <button type="button" aria-label="前一組題目" disabled={pageIndex <= 0} onClick={() => showPage(pageIndex - 1)}>上一組</button>
        <label><span className="wl-range-label">選題範圍</span><select aria-label="選題範圍" value={Math.max(0, pageIndex)} onChange={e => showPage(Number(e.target.value))}>
          {pages.map((p, i) => <option key={p.label} value={i}>{p.label}{p.tasks.every(t => !writeTaskOpen(t.task, unit)) ? '（未解鎖）' : ''}</option>)}
        </select></label>
        <button type="button" aria-label="下一組題目" disabled={pageIndex >= pages.length - 1} onClick={() => showPage(pageIndex + 1)}>下一組</button>
      </div>}
      <div className="wl-tasks" role="group" aria-label="題目">{taskPage?.tasks.map(({ task: t, label }) => {
        const open = writeTaskOpen(t, unit)
        return <button key={t.id} type="button" aria-pressed={t.id === task.id} disabled={!open} data-locked={!open} title={open ? t.zh : '上到單元 ' + t.unit + ' 才打開'} onClick={() => setTaskId(t.id)}>
          {!open && '🔒 '}{label}{taskDone(readWrite(state.notes, t.id), !!stage.ielts) ? ' ✓' : selfChecked(readWrite(state.notes, t.id)) ? ' · 自評' : ''}</button>
      })}</div>
    </section>}
    <section className="wl-task">
      <small className="wl-current">目前作答：{pages.flatMap(p => p.tasks).find(t => t.task.id === task.id)?.label}</small>
      <h3 lang="en">{task.prompt}</h3>
      <p className="wl-zh">{task.zh}</p>
      {task.chart && <ChartView chart={task.chart} />}
      {outline && <details className="wl-outline"><summary>結構提示{kind ? '（' + essays[kind].name + '題）' : ''}</summary><ol>{outline.map(o => <li key={o}>{o}</li>)}</ol></details>}
      {rubric.id === 'gept-sentence' && <p className="wl-parts">要寫的句子：{parts.join('、')}（每句 0–2 分）</p>}
      {checks.length > 0 && <details className="wl-criteria"><summary>這{kind ? '題' : '一階'}要做到（{checks.length} 項）</summary><ul>{checks.map(c => <li key={c}>{c}</li>)}</ul></details>}
      <RubricTable rubric={rubric} />
    </section>
    <label className="pr-field">我的英文
      <textarea lang="en" rows={rubric.id === 'gept-sentence' ? 4 : stage.ielts ? 14 : 8} value={text} spellCheck={false} autoComplete="off" readOnly={busy}
        onChange={e => { setText(e.target.value); writeDraft(draftKey, e.target.value) }} placeholder={rubric.id === 'gept-sentence' ? '一句一行也可以' : '先照文法介紹和題目要求寫，寫不出來的地方先留空'} />
    </label>
    <div className="wl-bar">
      <span data-ok={words >= task.min}>{words} / {task.min} 字</span>
      {stage.ielts && (endAt ? <span data-ok={left > 0}>{left > 0 ? '剩 ' + Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0') : '時間到（可以繼續寫完）'}</span>
        : <button type="button" className="pr-link" onClick={() => { setEndAt(Date.now() + (stage.minutes ?? 20) * 60000); setNow(Date.now()) }}>開始計時 {stage.minutes} 分鐘</button>)}
      {bestText && <span>最佳：{bestText}</span>}
    </div>
    {stage.ielts && <small className="wl-count">字數怎麼算：英文字和數字各算一個（well-known、don't、37.5 都算一個），標點不算。跟考場算法接近，但不完全一樣，寧可多寫幾個字。</small>}
    <div className="pr-actions">
      {keyed ? <button type="button" className="pr-main" disabled={!text.trim() || busy} onClick={check}>{busy ? 'Claude 批改中……' : fb ? '改好了，請 Claude 再批一次' : '請 Claude 照評分表批改'}</button>
        : <button type="button" className="pr-main" disabled={!text.trim()} onClick={() => setTicks(selfList.map(() => false))}>自己對照評分表檢查</button>}
      <StuckButton />
      {/* With Claude connected there is no model essay: Claude grades and teaches. It opens only if Claude can't be reached. */}
      {task.sample && (!keyed || claudeDown) && <button type="button" className="pr-link" onClick={() => setShowSample(!showSample)}>{showSample ? '收起參考範文' : '看參考範文'}</button>}
    </div>
    {error && <p className="tu-error" role="alert">{error}</p>}
    {showSample && (!keyed || claudeDown) && <section className="pr-reference"><small>參考範文（只是一種寫法；看完先自己改，不要照抄）</small>{task.sample.split('\n').map((l, i) => l.trim() ? <p key={i} lang="en">{l}</p> : null)}</section>}
    {!keyed && ticks.length > 0 && <section className="wl-self">
      <strong>逐項檢查，做到就打勾</strong>
      {selfList.map((c, i) => <label key={c}><input type="checkbox" checked={!!ticks[i]} onChange={e => { const n = [...ticks]; n[i] = e.target.checked; setTicks(n) }} /> {c}</label>)}
      {savedSelf ? <p className="wl-saved" role="status">記下來了 ✓（自評完成・待確認）</p>
        : <button type="button" disabled={!ticks.length || ticks.some(x => !x)} onClick={() => { save({ self: 1, day: date, words }); setSavedSelf(true) }}>都做到了，記下來</button>}
      <small>還沒連接 Claude，這一題會記成「自評完成・待確認」，不算過關；連上 Claude 照評分表批改過才算。</small>
    </section>}
    {fb && <section className="wl-fb" aria-live="polite">
      {fb.answer !== undefined && fb.answer.trim() !== text.trim() && <details className="wl-old"><summary>這是你改之前那一版的批改；改過的這一版還沒批改</summary><p lang="en">{fb.answer}</p></details>}
      {fb.rubric && fb.scores ? <Graded fb={fb} short={fb.answer !== undefined && wordCount(fb.answer) < task.min ? { words: wordCount(fb.answer), min: task.min } : undefined} /> : <>
        {/* Feedback saved before the published tables. */}
        <div className="wl-fb-head"><strong>批改</strong>{stage.ielts && fb.band !== undefined && <span className="wl-band">IELTS 練習估計分數 {fb.band}</span>}</div>
        {fb.summary && <p>{fb.summary}</p>}
        <ul className="wl-crit">{fb.criteria.map(c => <li key={c.name}><span className="wl-score" data-level={stage.ielts ? (c.score >= 6.5 ? 'hi' : c.score >= 5.5 ? 'mid' : 'lo') : (c.score >= 4 ? 'hi' : c.score >= 3 ? 'mid' : 'lo')}>{stage.ielts ? c.score : c.score >= 4 ? '做到' : '要改'}</span>
          <div><b>{c.name}</b><small>{c.comment}</small></div></li>)}</ul>
      </>}
      {fb.next && <p className="wl-next"><b>下一版只改這件事：</b>{fb.next}</p>}
      {fb.fixes.length > 0 && <details><summary>文法和用字（{fb.fixes.length}）</summary><ul className="tu-fixes">{fb.fixes.map((f, i) => <li key={i}><span lang="en"><s>{f.wrong || '（漏寫）'}</s> → <b>{f.right}</b></span><small>{f.why}</small></li>)}</ul></details>}
      {fb.revised && <button type="button" className="pr-link" onClick={() => setShowRevised(!showRevised)}>{showRevised ? '收起修改版' : '看修改後的全文（先自己改過再看）'}</button>}
      {showRevised && fb.revised && <section className="pr-reference">{fb.revised.split('\n').map((l, i) => l.trim() ? <p key={i} lang="en">{l}</p> : null)}</section>}
      {stage.ielts && <small className="wl-note">分數是照官方 band descriptors 的練習估計，跟正式考官評分可能有差距。</small>}
    </section>}
    {(fb || savedSelf) && (() => {
      // Done with this task: the way on is right here, not back up in the list.
      const next = nextWritingTask(stage, task.id, state.notes, unit)
      const label = next ? pages.flatMap(p => p.tasks).find(t => t.task.id === next.id)?.label : undefined
      const passedStage = stageDone[stage.id] >= stageTarget(stage)
      const following = stages.slice(stages.indexOf(stage) + 1).find(s => !s.pack && openStage[s.id])
      return <div className="pr-actions wl-next-task">
        {next && <button type="button" className={passedStage && following ? undefined : 'pr-main'} onClick={() => goTo(next.id)}>下一題{label ? '：' + label : ''} →</button>}
        {passedStage && following && <button type="button" className="pr-main" onClick={() => { setStageId(following.id); goTo(firstOpenTask(following).id) }}>這一階過關了，去下一階：{following.name} →</button>}
        {!next && !(passedStage && following) && <p className="ls-help">這一階開放的題目都過關了。</p>}
      </div>
    })()}
  </div>
}

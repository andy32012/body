import AskWhy from './AskWhy'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { updateStoreNow, type AppState, type PageProps } from '../lib/store'
import { useActivitySave, type SaveActivity } from '../lib/activitySave'
import { listReadingProgress, readReadingProgress, saveReadingProgress, savedCauses, savedPicks, shownPassage, readBands, readLevelsOpen, readSteps, readStepKey, readStepName, readStepProgress, previousReadStep,
  moveNote, nextReading, passed, readCauses, readLevels, readRecord, readSummary, saveRead, suggestedLevel, typeNames,
  hasReadSubmission, prepareReadingDraft, readKey, readingVersion, savedQuestionRevisions,
  type ReadingProgress, type ReadLevel, type ReadPassage, type ReadRecord, type ReadStep, type ShownQuestion,
} from '../lib/reading'
import { examPassed, readExamRecord, type ExamPassage } from '../lib/examReading'
import { examExtras, nextInBand } from '../lib/readingTest'
import { LockLine } from './Locked'
import { useTaskContext } from '../lib/taskContext'
import { logSkill } from '../lib/bridge'
import { useTapGuard } from '../lib/tapGuard'
import { LookedUp, TapWords, useLookup } from './WordLookup'
import ExamPassageView, { examProgressSet } from './ExamPassageView'
import './reading.css'

const letters = 'ABCDEFGH'
const sameStep = (a: ReadStep, b: ReadStep) => readStepKey(a) === readStepKey(b)

const examFiles = () => Promise.all([import('../data/exam-reading-a1.json'), import('../data/exam-reading-a2.json'), import('../data/exam-reading-b1.json'), import('../data/exam-reading-b2.json')])
  .then(files => files.flatMap(f => f.default as ExamPassage[]))

/** 閱讀測驗：A1 → B2. The graded passages (IELTS question types) and the past-exam passages share the levels and bands:
 *  A1 past-exam passages are in A1, B1 in B1 (readingTest.ts). Answer one question at a time; a wrong answer asks why.
 *  Words can be tapped for their meaning and sound; once the questions are done, also to ask the Claude teacher.
 *  `only`: just these passages (a unit's pack), without the level picker. Held-out test passages are never listed here.
 *  `set="nursing"`: the nursing passages (護理閱讀) instead of the graded reading; only the levels they have are offered.
 *  Neither of those two gets the past-exam passages. */
export default function ReadingPath({ state, onActivity, onSavedActivity, date, only, set }: Pick<PageProps, 'state'> & {
  onActivity: PageProps['update']; onSavedActivity: SaveActivity; date: string; only?: readonly string[]; set?: 'nursing'
}) {
  const [all, setAll] = useState<ReadPassage[] | null>(null)
  const [exams, setExams] = useState<readonly ExamPassage[]>([])
  const [failed, setFailed] = useState(false)
  const merged = set !== 'nursing' && !only
  useEffect(() => {
    let alive = true
    const load = set === 'nursing' ? import('../data/nursing-reading.json') : import('../data/reading.json')
    // The past-exam passages are extra: if they cannot be downloaded, the graded passages still open.
    Promise.all([load, merged ? examFiles().catch(() => []) : Promise.resolve([])])
      .then(([f, ex]) => { if (alive) { setExams(ex); setAll((f.default as ReadPassage[]).filter(p => only ? only.includes(p.id) : !p.held)) } })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // The past-exam passages as passages of their bands: their passes count toward opening the next band.
  const extras = useMemo(() => examExtras(exams, state.notes), [exams, state.notes])
  /** The next passage of a band (both kinds in 閱讀測驗), or of the whole list (a unit's pack). */
  const nextId = (target: ReadStep | null, list: readonly string[]) => merged && target && all
    ? nextInBand(all, exams, target, state.notes, list)?.id ?? null
    : all ? nextReading(all, target, state.notes, list)?.id ?? null : null
  const suggested = all ? suggestedLevel(all, state.notes, extras) : readSteps[0]
  // The level and the passage only change when he moves on (or picks a level): a new score changing the suggestion
  // must not swap the passage while its feedback is still on screen.
  const [step, setStep] = useState<ReadStep | null>(null)
  const [manual, setManual] = useState(!!only)
  const selected = step ?? suggested
  const [skip, setSkip] = useState<string[]>([])
  const [currentId, setCurrentId] = useState<string | null | undefined>(undefined)
  // The band 下一篇 moved away from, and to (said once under the level buttons).
  const [moved, setMoved] = useState<{ from: ReadStep; to: ReadStep } | null>(null)
  const { saving, error, save, clearError } = useActivitySave()
  // Which list this is, for a passage left halfway: general reading, nursing reading or a unit's pack.
  const progressSet = set === 'nursing' ? 'nursing' : only ? 'unit' : 'general'
  function resumePassage(target: ReadStep | null, skipped: readonly string[] = [], level?: ReadLevel) {
    if (!all) return undefined
    const open = readLevelsOpen(all, state.notes, extras)
    const inProgress: { p: ReadingProgress; passage?: ReadPassage | ExamPassage }[] =
      listReadingProgress(state.notes, progressSet).map(p => ({ p, passage: all.find(x => x.id === p.id) }))
    if (merged) for (const p of listReadingProgress(state.notes, examProgressSet)) {
      inProgress.push({ p, passage: exams.find(x => x.id === p.id) })
    }
    return inProgress.sort((a, b) => (b.p.updatedAt ?? 0) - (a.p.updatedAt ?? 0)).find(({ p, passage }) =>
      passage && (!level || passage.level === level) && !skipped.includes(p.id) && p.picks.length < passage.qs.length &&
      (only || (open[readStepKey(passage)] && (!target || sameStep(target, passage)))))?.passage
  }
  useEffect(() => {
    if (!all || currentId !== undefined) return
    const back = resumePassage(null)
    if (back) {
      setStep({ level: back.level, band: back.band }); setCurrentId(back.id); return
    }
    setStep(suggested)
    setCurrentId(nextId(only ? null : suggested, []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])
  const data = all && currentId ? all.find(p => p.id === currentId) ?? null : null
  const exam = !data && currentId ? exams.find(p => p.id === currentId) ?? null : null
  // Shown with its options shuffled (the same way every time); answers are saved in the data's own order.
  const passage = useMemo(() => data && shownPassage(data), [data])
  function moveOn(nextSkip: string[]) {
    if (!all || saving) return
    clearError()
    // The suggestion applies here, when moving on — unless a level was picked by hand.
    const target = manual ? selected : suggestedLevel(all, state.notes, extras)
    const list = sameStep(target, selected) ? nextSkip : []
    setMoved(!only && !sameStep(target, selected) ? { from: selected, to: target } : null)
    setStep(target); setSkip(list)
    const band = only ? null : target
    setCurrentId(resumePassage(band, list)?.id ?? nextId(band, list))
  }
  function chooseStep(target: ReadStep) {
    if (!all || saving) return
    if (!only && !readLevelsOpen(all, state.notes, extras)[readStepKey(target)]) return
    clearError()
    setStep(target); setManual(true); setSkip([]); setMoved(null)
    const band = only ? null : target
    setCurrentId(resumePassage(band)?.id ?? nextId(band, []))
  }
  function chooseLevel(level: ReadLevel) {
    if (!all) return
    const resume = resumePassage(null, [], level)
    if (resume) { chooseStep({ level: resume.level, band: resume.band }); return }
    const opened = readLevelsOpen(all, state.notes, extras)
    const candidates = readSteps.filter(s => s.level === level && opened[readStepKey(s)] && [...all, ...exams].some(p => p.level === level && p.band === s.band))
    const target = candidates.find(s => sameStep(s, suggested)) ?? candidates.find(s => {
      const { ok, target } = readStepProgress(all, s, state.notes, extras)
      return ok < target
    }) ?? candidates[0]
    if (target) chooseStep(target)
  }
  const [picks, setPicks] = useState<number[]>([])
  const [causes, setCauses] = useState<Record<number, string>>({})
  // zh: the Chinese is open now; seenZh: it was opened before submitting this attempt.
  const [zh, setZh] = useState(false)
  const [seenZh, setSeenZh] = useState(false)
  const [saved, setSaved] = useState<ReadRecord | null>(null)
  const [practice, setPractice] = useState(false)
  const [redo, setRedo] = useState(false)
  const revision = useRef('')
  function restoreDraft() {
    // Back to a passage left halfway: the answers so far (and whether the Chinese was opened) come back.
    const half = passage ? readReadingProgress(state.notes, progressSet, passage.id) : null
    const draft = half && passage ? prepareReadingDraft(half, passage.qs) : null
    const resume = draft && passage && draft.picks.length < passage.qs.length ? draft : null
    revision.current = passage ? readingVersion(state.notes, progressSet, passage.id, readKey(passage.id)) : ''
    setPicks(resume?.picks ?? []); setCauses(resume?.causes ?? {}); setZh(false); setSeenZh(!!resume?.zh); setSaved(null); setPractice(false); setRedo(false)
  }
  useLayoutEffect(() => {
    restoreDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passage?.id])
  const at = picks.length
  const ready = useTapGuard(passage?.id + ':' + at)
  function draftVersion(notes: typeof state.notes) {
    return passage ? readingVersion(notes, progressSet, passage.id, readKey(passage.id)) : ''
  }
  function confirmDraft(notes: typeof state.notes) {
    if (draftVersion(notes) !== revision.current) throw new Error('這篇已有另一份練習進度，先讀取最新進度再繼續。')
  }
  /** The answers so far, kept until the passage is done (a redo is practice and is not kept). */
  const keep = async (p: number[], c: Record<number, string>, z: boolean, answered: boolean) => {
    if (!passage || redo) return
    let version = ''
    const apply = (prev: AppState) => {
      confirmDraft(prev.notes)
      const notes = saveReadingProgress(prev.notes, progressSet, { id: passage.id, picks: p, questionRevisions: savedQuestionRevisions(passage.qs),
        ...(Object.keys(c).length ? { causes: c } : {}), ...(z ? { zh: true } : {}) })
      version = draftVersion(notes)
      return { ...prev, notes }
    }
    if (answered) await onSavedActivity(apply)
    else await updateStoreNow(apply)
    revision.current = version
  }
  const q = passage?.qs[at]
  useTaskContext(passage ? {
    label: (merged ? '閱讀測驗：' : '閱讀：') + passage.title + (q ? '（第 ' + (at + 1) + ' 題）' : ''),
    detail: [(merged ? '閱讀測驗' : '閱讀') + '短文：\n' + passage.paras.join('\n'), q ? '現在這題（' + typeNames[q.type] + '）：' + q.q + '\n選項：' + q.options.join(' / ') + '\n正確答案是「' + q.options[q.answer] + '」，他作答前不要說，只帶他回到文章找線索。' : '題目都做完了。'].join('\n'),
  } : null)
  // Tap a word for its meaning and sound; once this passage's questions are done, also to ask the Claude teacher.
  // A new object for each passage, so the box and the list of looked-up words start empty on the next one.
  const noNotes = useMemo(() => ({ words: undefined }), [currentId])
  const look = useLookup(noNotes, { rate: state.settings.speechRate, askTeacher: !!passage && at >= passage.qs.length })

  if (failed) return <p>閱讀教材載入失敗，重新整理再試一次。</p>
  if (!all) return <p>載入中……</p>
  const opened = readLevelsOpen(all, state.notes, extras)
  const shownLevels = readLevels.filter(l => all.some(p => p.level === l.id))
  function lockText(target: ReadStep) {
    const before = previousReadStep(all!, target)
    if (!before) return '先從第一篇開始'
    const progress = readStepProgress(all!, before, state.notes, extras)
    return readStepName(before) + '過關 ' + progress.target + ' 篇才打開（現在 ' + progress.ok + '）'
  }
  const levelButtons = only ? null : <>
    <div className="pr-options rd-levels" role="group" aria-label="閱讀程度" style={{ gridTemplateColumns: `repeat(${shownLevels.length}, minmax(0, 1fr))` }}>
    {shownLevels.map(l => {
      const here = all.filter(p => p.level === l.id)
      const hereExams = exams.filter(p => p.level === l.id)
      const ok = here.filter(p => passed(readRecord(state.notes, p.id))).length + hereExams.filter(p => examPassed(readExamRecord(state.notes, p.id))).length
      const available = readSteps.filter(s => s.level === l.id && [...here, ...hereExams].some(p => p.band === s.band))
      const isOpen = available.some(s => opened[readStepKey(s)])
      return <button key={l.id} type="button" aria-pressed={l.id === selected.level} disabled={saving || !isOpen} data-locked={!isOpen} onClick={() => chooseLevel(l.id)}>
        <span>{l.id}</span><small>{l.name.slice(3)}</small>
        <small>過關 {ok} / {here.length + hereExams.length}</small>
        {!isOpen && <LockLine text={lockText(available[0])} />}
      </button>
    })}
    </div>
    <div className="pr-options rd-bands" role="group" aria-label={selected.level + ' 小級'}>
      {readBands.map(b => {
        const target = { level: selected.level, band: b.id }
        const progress = readStepProgress(all, target, state.notes, extras)
        const isOpen = opened[readStepKey(target)] && progress.total > 0
        return <button key={b.id} type="button" aria-pressed={b.id === selected.band} disabled={saving || !isOpen} data-locked={!isOpen} onClick={() => chooseStep(target)}>
          <span>{b.name}</span><small>過關 {progress.ok} / {progress.total}{sameStep(target, suggested) ? ' · 建議' : ''}</small>
          {!isOpen && <LockLine text={progress.total ? lockText(target) : '這一小級還沒有文章'} />}
        </button>
      })}
    </div>
    <p className="rd-band-note">{readStepName(selected)}：{readBands.find(b => b.id === selected.band)!.note}。{(() => {
      const progress = readStepProgress(all, selected, state.notes, extras)
      return '這一小級的目標：過關 ' + progress.target + ' 篇。'
    })()}</p>
  </>
  const summary = readSummary(all, state.notes)
  const movedNote = moved && <p className="rd-moved" role="status">{moveNote(moved.from, moved.to)}</p>
  const meta = <p className="qz-meta">
    {!only && <span>{readLevels.find(l => l.id === selected.level)!.note}</span>}
    <span>{only ? '這個單元' : ''}讀過 {summary.done + extras.filter(e => e.recorded).length} / {summary.total + exams.length} 篇</span>
    {summary.weakest && <span>最弱題型：{typeNames[summary.weakest]}</span>}
    {summary.topCause && <span>最常卡在：{summary.topCause}</span>}
  </p>
  const saveNotice = saving ? <p role="status">正在儲存練習紀錄……</p> : error ? <p className="tu-error" role="alert">{error}</p> : null
  // A past-exam passage: its own view, under the same level buttons; 下一篇 and 換一篇 go on in the same band.
  if (exam) return <div className="pr-stack rd">
    {levelButtons}
    {movedNote}
    {meta}
    {saveNotice}
    <ExamPassageView key={exam.id} passage={exam} state={state} onActivity={onActivity} onSavedActivity={onSavedActivity}
      save={save} saving={saving} error={error} clearError={clearError} date={date} onNext={() => moveOn([...skip, exam.id])} />
  </div>
  if (!passage) {
    const nextStep = readSteps.slice(readSteps.findIndex(s => sameStep(s, selected)) + 1).find(s => [...all, ...exams].some(p => p.level === s.level && p.band === s.band))
    return <div className="pr-stack rd">
      {levelButtons}
      <div className="pr-hint">
        <strong>{currentId === undefined ? '準備文章中……' : only ? '這個單元的文章都看過或略過了' : readStepName(selected) + '這一輪的文章都看過或略過了'}</strong>
        {currentId !== undefined && <div className="pr-actions">
          <button type="button" className="pr-main" onClick={() => chooseStep(selected)}>{only ? '從第一篇再來' : '這一小級再來一輪'}</button>
          {nextStep && !only && opened[readStepKey(nextStep)] && <button type="button" className="pr-link" onClick={() => chooseStep(nextStep)}>換到 {readStepName(nextStep)}</button>}
        </div>}
      </div>
    </div>
  }
  const done = at >= passage.qs.length
  const correct = passage.qs.filter((x, i) => picks[i] === x.answer).length
  const last = at > 0 ? passage.qs[at - 1] : null
  // In B2 reading, revealing one judgement can give away another.
  const defer = (item: ShownQuestion) => passage.level === 'B2' && item.type === 'tfng'
  const immediate = last && !defer(last) ? last : null
  function pick(i: number) {
    // The next question appears under the finger: a double tap must not answer it too.
    if (!passage || done || !ready()) return
    const next = [...picks, i]
    void save(async () => {
      if (next.length === passage.qs.length) await finish(next, causes)
      else await keep(next, causes, seenZh, true)
      setPicks(next)
    })
  }
  async function finish(p: number[], c: Record<number, string>) {
    if (!passage) return
    const right = passage.qs.filter((x, i) => p[i] === x.answer).length
    // Each day a passage is read counts as a reading day, also when the same passage is read again on a later day.
    let record: ReadRecord | null = null
    let sameDay = false
    await onSavedActivity(prev => {
      if (!redo) confirmDraft(prev.notes)
      sameDay = hasReadSubmission(readRecord(prev.notes, passage.id), date)
      const cleared = redo ? prev.notes : saveReadingProgress(prev.notes, progressSet, null, passage.id)
      const notes = saveRead(cleared, passage.id, { day: date, picks: savedPicks(passage.qs, p), correct: right, total: passage.qs.length,
        questionRevisions: savedQuestionRevisions(passage.qs), ...(Object.keys(c).length ? { causes: savedCauses(passage.qs, c) } : {}), ...(seenZh ? { zh: true } : {}) })
      record = readRecord(notes, passage.id)
      return { ...prev, notes: logSkill(notes, 'read', date) }
    })
    setSaved(record)
    setPractice(sameDay)
  }
  function cause(qi: number, c: string) {
    if (!passage || causes[qi]) return
    const next = { ...causes, [qi]: c }
    if (done && practice) { setCauses(next); return }
    void save(async () => {
      if (saved) {
        await updateStoreNow(prev => {
          const r = readRecord(prev.notes, passage.id)
          if (!r || saved.day !== date || r.day !== saved.day || r.at !== saved.at || JSON.stringify(r.picks) !== JSON.stringify(saved.picks)) {
            throw new Error('已有另一份較新的作答，無法把這筆錯因加到那一次。')
          }
          return { ...prev, notes: { ...prev.notes, [readKey(passage.id)]: JSON.stringify({
            ...r, causes: { ...r.causes, ...savedCauses(passage.qs, { [qi]: c }) },
          }) } }
        })
      } else {
        await keep(picks, next, seenZh, false)
      }
      setCauses(next)
    })
  }
  const evidence = immediate?.evidence
  const marks = evidence ? [evidence] : []
  const article = passage.paras.join(' ')
  function answerFeedback(item: ShownQuestion, i: number, afterFinish = false) {
    const chosen = picks[i]
    const right = chosen === item.answer
    const answer = item.options[item.answer]
    const notGiven = item.type === 'tfng' && answer === 'Not Given'
    const label = right ? '第 ' + (i + 1) + ' 題答對了' + (afterFinish ? ' · ' + answer : '')
      : '第 ' + (i + 1) + ' 題答案是「' + answer + '」'
    const body = <>
      {afterFinish && <p lang="en">{item.q}</p>}
      <p>{item.why}</p>
      {item.evidence && (afterFinish ? <blockquote lang="en">{item.evidence}</blockquote> : !notGiven && <small>文章裡標起來的句子可以用來核對答案。</small>)}
      {notGiven && <small>{item.evidence ? (afterFinish ? '引句只是相關線索。' : '文章裡標起來的是相關線索。') : ''}選 Not Given 要確認全文都沒有提供題目所問的資訊。</small>}
      <AskWhy q={{ source: '閱讀', passage: article, stem: item.q, options: item.options, picked: item.options[chosen] ?? '', answer, right }} />
      {!right && <div className="qz-cause"><small>卡在哪？選一個，之後會看哪一種最常出現。</small>
        <div className="pr-options">{readCauses.map(c => <button key={c} type="button" aria-pressed={causes[i] === c} disabled={saving || !!causes[i]} onClick={() => cause(i, c)}>{c}</button>)}</div>
      </div>}
    </>
    return afterFinish
      ? <details key={item.from} className="pr-hint rd-feedback" data-ok={right}><summary>{label}</summary>{body}</details>
      : <div className="pr-hint rd-feedback" data-ok={right}><strong>{label}</strong>{body}</div>
  }
  const prevRec = readRecord(state.notes, passage.id)
  return <div className="pr-stack rd">
    {levelButtons}
    {movedNote}
    {meta}
    {saveNotice}
    {error && !done && !redo && draftVersion(state.notes) !== revision.current &&
      <button type="button" className="pr-link" onClick={() => { clearError(); restoreDraft() }}>讀取這篇最新的進度</button>}
    <article className="rd-passage">
      <header><h3 lang="en">{passage.title}</h3><small>{passage.topic} · {passage.words} 字{prevRec ? ' · 上次 ' + prevRec.correct + ' / ' + prevRec.total : ''}</small></header>
      {passage.paras.map((p, i) => <Fragment key={i}>
        <p lang="en" className="rd-para">{passage.ielts && <b className="rd-letter">{letters[i]}</b>}<TapWords text={p} line={i} onWord={look.tap} pickedIndex={look.index} pickedLine={look.line} marks={marks} /></p>
        {look.line === i && look.box}
      </Fragment>)}
      {zh ? <p className="rd-zh">{passage.zh}</p> : <button type="button" className="pr-link" disabled={saving} onClick={() => {
        if (done || seenZh) { setZh(true); return }
        void save(async () => { await keep(picks, causes, true, false); setSeenZh(true); setZh(true) })
      }}>{done ? '看中文大意' : seenZh ? '再看一次中文大意' : '真的看不懂？看中文大意（這篇會記成「看過中文」）'}</button>}
    </article>
    {immediate && answerFeedback(immediate, at - 1)}
    {q && <section className="rd-q">
      <p className="rd-qmeta">第 {at + 1} / {passage.qs.length} 題 · {typeNames[q.type]}{q.type === 'tfng' ? '（True 文章這樣說；False 文章說相反；Not Given 文章沒提到）' : ''}</p>
      <h4 lang="en">{q.q}</h4>
      <div className="pr-options rd-options">{q.options.map((o, i) => <button key={i} type="button" lang="en" disabled={saving} onClick={() => pick(i)}>{o}</button>)}</div>
      {defer(q) && <small>完成這篇後可以查看是非題的答案和原因。</small>}
    </section>}
    {done && <div className="pr-hint">
      <strong>這篇答對 {correct} / {passage.qs.length}{(() => {
        // Said from what was actually saved: a second try on the same day is practice whichever way it was reached.
        const rec = saved
        if (practice) return '（今天已經做過這篇：這次是練習，不算新的過關' + (passed(rec) ? '；之前的過關留著 ✓' : '') + '）'
        if (rec && !seenZh && correct / passage.qs.length >= 0.7) return '，過關 ✓'
        const earlier = passed(rec) ? '（保留之前的過關紀錄）' : ''
        return (seenZh ? '（看過中文，下次不看中文再試一次）' : '，70% 以上算過關，之後會再出現') + earlier
      })()}</strong>
      <ul className="rd-review">{passage.qs.map((x, i) => <li key={i} data-ok={picks[i] === x.answer}>{typeNames[x.type]}：{picks[i] === x.answer ? '對' : '錯' + (causes[i] ? '（' + causes[i] + '）' : '')}</li>)}</ul>
      {passage.qs.map((item, i) => defer(item) ? answerFeedback(item, i, true) : null)}
      <div className="pr-actions">
        <button type="button" className="pr-main" disabled={saving} onClick={() => moveOn([...skip, passage.id])}>下一篇</button>
        <button type="button" className="pr-link" disabled={saving} onClick={() => { clearError(); setPicks([]); setCauses({}); setSaved(null); setZh(false); setSeenZh(false); setRedo(true) }}>這篇再做一次（練習）</button>
      </div>
      <p className="rd-words">點文章裡的字，可以看意思、聽發音，也可以問 Claude 老師。</p>
    </div>}
    {!done && at === 0 && <button type="button" className="pr-link" disabled={saving} onClick={() => moveOn([...skip, passage.id])}>換一篇</button>}
    <LookedUp items={look.seen} state={state} onActivity={onActivity} date={date} />
  </div>
}

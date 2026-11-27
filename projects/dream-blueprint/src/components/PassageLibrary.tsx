import DraftVersions from './DraftVersions'
import { useEffect, useMemo, useRef, useState } from 'react'
import { updateStoreNow, type AppState, type PageProps } from '../lib/store'
import CorrectBox, { correctionBlocked, useCorrectionBlocked, useCorrectionPending, type Result as Feedback } from './CorrectBox'
import { checkApplies } from '../lib/checks'
import { answered } from '../lib/evidence'
import { MessageCircleQuestion } from 'lucide-react'
import { openClaude, useTaskContext } from '../lib/taskContext'
import { tutorKey } from '../lib/tutor'
import { captureDraftCleanup, readDraft, writeDraft } from '../lib/drafts'
import { AskWord } from './AIChat'
import ContextMeaning from './ContextMeaning'
import { passageLevelsOpen, doneKey, levelKey, levelProgress, nextPassage, passageRound, redoDue, redoKey, type Passage } from '../lib/passages'
import { openAt } from '../lib/unlock'
import { dayKey } from '../lib/progress'
import { addSayCards } from '../lib/sayCards'
import { correctionKey, correctionOrder, readCorrection, readCorrections, storeCorrection } from '../lib/correctionHistory'

type Props = Pick<PageProps, 'state'> & { onSavedActivity: (apply: (prev: AppState) => AppState) => Promise<void> }
const marks = [['good', '對了'], ['small', '小錯'], ['again', '不會，明天再來']] as const

// Short passages written around the 7000-word list. One passage at a time, in book order.
// The page is built around Claude: it corrects the translation and answers questions about it, and its verdict decides
// whether the passage is done. The reference translation and self-rating only appear when Claude is not there
// (no key on this device, or it cannot be reached), so the page still works then.
/** The word as it is used in this passage; when that is another form of a table word, the table word follows: saw（see）. */
function HintWord({ word }: { word: { en: string; form?: string } }) {
  const form = word.form ?? word.en
  const same = form.toLowerCase() === word.en.toLowerCase()
  return <><span lang="en">{form}</span>{!same && <small className="passage-lemma">（<span lang="en">{word.en}</span>）</small>}</>
}

export default function PassageLibrary({ state, update, onSavedActivity }: Props & Pick<PageProps, 'update'>) {
  const [all, setAll] = useState<Passage[]>()
  const [failed, setFailed] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])
  const [letter, setLetter] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const stored = Math.min(6, Math.max(1, Number(state.notes[levelKey]) || 1))

  useEffect(() => {
    let alive = true
    import('../data/passages.json')
      .then(file => { if (alive) setAll(file.default as Passage[]) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  // A level opens once the one before it is done to 80%; a saved level that is locked falls back to the highest open one.
  const levelOpen = useMemo(() => all ? passageLevelsOpen(all, state.checks) : [true, false, false, false, false, false], [all, state.checks])
  const level = openAt(levelOpen, stored - 1) + 1
  const passage = useMemo(() => all && nextPassage(all, level, state.checks, state.notes, skipped, letter),
    [all, level, state.checks, state.notes, skipped, letter])
  const progress = useMemo(() => all ? levelProgress(all, level, state.checks) : { done: 0, total: 0 },
    [all, level, state.checks])
  const letters = useMemo(() => all ? [...new Set(all.filter(p => p.level === level).map(p => p.letter))] : [], [all, level])

  function choose(next: number) {
    update(prev => ({ ...prev, notes: { ...prev.notes, [levelKey]: String(next) } }))
    setSkipped([]); setLetter('')
  }

  if (failed) return <p>短文還沒下載到這台裝置。連上網路後再打開一次。</p>
  if (!all) return <p>正在準備短文…</p>
  return <div className="pr-stack passage-library">
    <div className="passage-head">
      <label>級別 <select id="passage-level" value={level} onChange={event => choose(Number(event.target.value))}>
        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n} disabled={!levelOpen[n - 1]}>{levelOpen[n - 1] ? '' : '🔒 '}第 {n} 級{levelOpen[n - 1] ? '' : '（第 ' + (n - 1) + ' 級完成八成才打開）'}</option>)}
      </select></label>
      <label>字母 <select id="passage-letter" value={letter} onChange={event => { setLetter(event.target.value); setSkipped([]) }}>
        <option value="">照順序</option>
        {letters.map(l => <option key={l} value={l}>{l}</option>)}
      </select></label>
      <span className="passage-count">已完成 <b>{progress.done}</b> / {progress.total}</span>
      <button type="button" className="pr-link" aria-expanded={showHistory} onClick={() => setShowHistory(open => !open)}>
        {showHistory ? '收起批改紀錄' : '看批改紀錄'}
      </button>
    </div>
    {showHistory && <PassageCorrections passages={all} notes={state.notes} />}
    {!passage ? (() => {
      const round = passageRound(all, level, state.checks, state.notes, skipped, letter)
      const where = letter ? '字母 ' + letter + ' ' : '第 ' + level + ' 級'
      if (!round.left) return <p>{letter ? '這個字母的短文都做完了，換一個字母或回到照順序。' : '第 ' + level + ' 級的短文都做完了' + (levelOpen[level] ? '，可以換下一級。' : '。')}</p>
      return <div className="pr-hint">
        <strong>{where}還有 {round.left} 段沒完成</strong>
        {round.skipped > 0 && <p>這一輪按「換一段」略過了 {round.skipped} 段。</p>}
        {round.waiting > 0 && <p>{round.waiting} 段今天按了「不會」，明天再出現。</p>}
        {round.skipped > 0 && <div className="pr-actions"><button type="button" className="pr-main" onClick={() => setSkipped([])}>把略過的拿回來</button></div>}
      </div>
    })() : <PassagePractice key={passage.id} passage={passage} state={state} onSavedActivity={onSavedActivity}
      onSkip={() => setSkipped(list => [...list, passage.id])} />}
  </div>
}

function PassageCorrections({ passages, notes }: { passages: Passage[]; notes: Record<string, string> }) {
  const [selected, setSelected] = useState('')
  const history = useMemo(() => passages.flatMap(passage => readCorrections(notes[correctionKey('passage.' + passage.id)])
    .map(grade => ({ passage, grade }))).sort((a, b) => correctionOrder(b.grade, a.grade)), [passages, notes])
  const rowId = (row: typeof history[number]) => row.passage.id + ':' + row.grade.id
  const row = history.find(entry => rowId(entry) === selected) ?? history[0]
  return <section className="pr-reference">
    <h2>短文批改紀錄</h2>
    {!row ? <p>還沒有已儲存的短文批改。</p> : <>
      <label className="pr-field">選擇作答
        <select value={rowId(row)} onChange={event => setSelected(event.target.value)}>
          {history.map(entry => <option key={rowId(entry)} value={rowId(entry)}>
            第 {entry.passage.level} 級 · {entry.passage.letter} {entry.passage.n} · {entry.grade.answer.slice(0, 55)}
          </option>)}
        </select>
      </label>
      <p>{row.passage.zh}</p>
      <p lang="en">{row.grade.answer}</p>
      <CorrectBox key={rowId(row)} run={0} zh={row.passage.zh} reference={row.passage.en} words={row.passage.words?.map(word => word.en)}
        rubric="gept-translation" answer={row.grade.answer} restore={row.grade} archiveOnly />
    </>}
  </section>
}

/** A selected passage owns its draft, feedback and requests. A sync picking the next passage mounts a fresh instance. */
function PassagePractice({ passage, state, onSavedActivity, onSkip }: Props & { passage: Passage; onSkip: () => void }) {
  const draftKey = 'passage.' + passage.id
  const [answer, setAnswer] = useState(() => readDraft(draftKey))
  const [show, setShow] = useState<'none' | 'words'>('none')
  const [byHand, setByHand] = useState(false)
  const [unreachable, setUnreachable] = useState(false)
  const [run, setRun] = useState(0)
  const [checking, setChecking] = useState(false)
  const [previous, setPrevious] = useState<Feedback>()
  const gradeKey = correctionKey(draftKey)
  const grade = readCorrection(state.notes, gradeKey, answer)
  const last = grade?.result
  const grading = useCorrectionPending(gradeKey)
  const blocked = useCorrectionBlocked(gradeKey)
  const marking = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)
  useTaskContext({
    label: '短文中翻英：' + passage.zh.slice(0, 40) + (passage.zh.length > 40 ? '…' : ''),
    detail: ['短文中翻英，題目：' + passage.zh, passage.words?.length ? '會用到的單字：' + passage.words.map(w => w.en + '（' + w.zh + '）').join('、') : '',
      passage.en ? '參考翻譯（只供你判斷，他沒說要看前不要整段給）：' + passage.en : ''].filter(Boolean).join('\n'),
    draft: answer,
  })
  async function mark(result: typeof marks[number][0]) {
    const attempted = answered(answer)
    if (marking.current || correctionBlocked(gradeKey) || (result !== 'again' && !attempted)) return
    const id = passage.id
    const clearSubmitted = captureDraftCleanup(draftKey, answer)
    marking.current = true
    setSaving(true)
    setSaveError(false)
    try {
      const write = attempted ? onSavedActivity : updateStoreNow
      await write(prev => {
        const notes = { ...prev.notes }
        if (result === 'again') notes[redoKey(id)] = dayKey()
        else delete notes[redoKey(id)]
        return { ...prev, notes, checks: result === 'again' ? prev.checks : { ...prev.checks, [doneKey(id)]: true } }
      })
      clearSubmitted()
      if (result === 'again') onSkip()
    } catch { setSaveError(true) }
    finally { marking.current = false; setSaving(false) }
  }
  const keyed = !!tutorKey()
  const current = !!grade && checkApplies({ id: passage.id, answer: grade.answer }, passage.id, answer)
  const passed = current && (last?.verdict === 'good' || last?.verdict === 'small')
  return <>
      <div className="pr-label">7000 單短文 · 第 {passage.level} 級 · {passage.letter} {String(passage.n).padStart(2, '0')}</div>
      {redoDue(state.notes, passage.id) && <p className="passage-again">這段之前按了「不會」，隔一天再試一次。寫不出來的地方先空著，批改後把錯的加入複習。</p>}
      <p className="passage-text">{passage.zh}</p>
      <label className="pr-field" htmlFor="passage-answer">我的英文翻譯</label>
      <textarea id="passage-answer" rows={5} lang="en" value={answer} readOnly={saving || blocked} placeholder="一句一句翻，寫不出來的先空著"
        onChange={event => { setRun(0); setAnswer(event.target.value); writeDraft(draftKey, event.target.value) }} />
      <DraftVersions id={draftKey} text={answer} onChoose={text => { setRun(0); setAnswer(text) }} disabled={saving || blocked} />
      <div className="pr-actions">
        {keyed && <button className={passed ? undefined : 'pr-main'} disabled={!answered(answer) || checking || blocked || saving} onClick={() => { if (correctionBlocked(gradeKey)) return; setPrevious(last); setUnreachable(false); setRun(n => n + 1) }}>{checking || grading ? 'Claude 批改中……' : last ? '改好了，請 Claude 再批一次' : '請 Claude 批改'}</button>}
        {keyed && <button className="passage-ask" onClick={openClaude}><MessageCircleQuestion size={16} aria-hidden="true" />問問 Claude</button>}
        {passage.words && passage.words.length > 0 &&
          <button className="pr-link" onClick={() => setShow(show === 'words' ? 'none' : 'words')}>這段會用到的單字</button>}
        <button className="pr-link" disabled={saving} onClick={onSkip}>換一段</button>
      </div>
      {keyed && !run && <p className="passage-note">寫不出來的地方先空著，按「請 Claude 批改」；卡住或想知道某個字怎麼說，按「問問 Claude」。</p>}
      {!keyed && <p className="passage-note">這一頁是請 Claude 批改的：到 <a href="#settings">設定 → 連接 Claude</a> 貼上金鑰就能用。{!byHand && <> <button className="pr-link" onClick={() => setByHand(true)}>先自己對答案</button></>}</p>}
      {!run && grading && <p className="passage-note" role="status">Claude 正在批改，回覆會留在這一段。</p>}
      <CorrectBox key={run ? 'grading' : grade?.id ?? 'ungraded'} run={run} rubric="gept-translation" zh={passage.zh} reference={passage.en} words={passage.words?.map(w => w.en)} answer={answer}
        selfFix previous={previous} onBusy={setChecking} restore={!run && grade ? { ...grade, showFull: false } : undefined} onError={() => setUnreachable(true)}
        backgroundGrade={{ id: gradeKey, save: (result, text, submission) => updateStoreNow(prev => ({
          ...prev, notes: storeCorrection(prev.notes, gradeKey, { ...submission, answer: text, result }),
        })) }}
        onSave={cards => updateStoreNow(prev => addSayCards(prev, cards, dayKey()))} />
      {saveError && <p className="tu-error" role="alert">這次沒有存進短文紀錄。草稿仍在，可以再儲存一次。</p>}
      {last && !current && <p className="passage-note">批改之後你改了答案：改過的這一版請 Claude 再批一次，才算完成。</p>}
      {last && current && <div className="pr-actions passage-next">
        {passed ? <button className="pr-main" disabled={saving || blocked} onClick={() => void mark(last.verdict === 'good' ? 'good' : 'small')}>完成，下一段</button>
          : <button className="pr-link" disabled={saving || blocked} onClick={() => void mark('again')}>今天先到這裡，明天再來這段</button>}
        {passed && last.verdict === 'small' && <small>小地方改一改再批一次也可以。</small>}
      </div>}
      {keyed && unreachable && !byHand && <p className="passage-note">Claude 現在連不上。<button className="pr-link" onClick={() => setByHand(true)}>先自己對答案</button></p>}
      {show === 'words' && passage.words && <div className="pr-tags">
        {passage.words.map(word => <span key={word.en + (word.form ?? '')}><HintWord word={word} /> · {word.zh}{' '}
          <ContextMeaning word={word.form && word.form.toLowerCase() !== word.en.toLowerCase() ? word.form + '（' + word.en + '）' : word.en} context={(passage.en ?? '') + '\n' + passage.zh}
            cacheKey={'ctx.' + passage.id + '.' + word.en + '.' + (word.form ?? '') + '.' + word.zh}
            notes={state.notes} onSave={(k, v) => updateStoreNow(prev => ({ ...prev, notes: { ...prev.notes, [k]: v } }))} />{' '}
          <AskWord en={word.en} zh={word.zh} /></span>)}
      </div>}
      {byHand && <>
        {passage.en ? <section className="pr-reference">
          <small>參考翻譯（寫法不只一種，意思和文法對就算對）</small>
          <p lang="en">{passage.en}</p>
        </section> : <p className="passage-note">這一級還沒有參考翻譯，要連上 Claude 才能批改。</p>}
        <fieldset className="pr-marks">
          <legend>我的自評</legend>
          {marks.map(([key, label]) => <button key={key} disabled={saving || blocked || (key !== 'again' && (!answered(answer) || !passage.en))} onClick={() => void mark(key)}>{label}</button>)}
          {!answered(answer) && <p className="pr-blank-note">寫下英文後才能自評「對了」或「小錯」。</p>}
        </fieldset>
      </>}
  </>
}

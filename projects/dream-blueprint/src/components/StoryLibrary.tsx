import AskWhy from './AskWhy'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pause, Play, Volume2 } from 'lucide-react'
import type { PageProps } from '../lib/store'
import type { Passage } from '../lib/passages'
import { useTaskContext } from '../lib/taskContext'
import { useTapGuard } from '../lib/tapGuard'
import { logSkill } from '../lib/bridge'
import { useDialogueVoice } from './LessonParts'
import DraftVersions from './DraftVersions'
import { LookedUp, TapWords, useLookup } from './WordLookup'
import { captureDraftCleanup, readDraft, savedDraftTexts, writeDraft } from '../lib/drafts'
import { advanceDictation, dictationDraftKey, dictationDraftPrefix, dictationRound, dictationScore, dictationStart,
  hasDictationAnswer, meaningQuestions, nextStory, readStory, saveStory, saveStoryRead, splitSentences, storyLevelKey, storyLevelsOpen, storyProgress, storyTabs,
  type StoryRecord, type StoryTab, type WordPosition } from '../lib/story'
import { speakEnglishResult } from '../lib/tts'
import { openAt } from '../lib/unlock'
import './story.css'

type Props = Pick<PageProps, 'state' | 'update'> & { onActivity: PageProps['update']; onSavedActivity: PageProps['update']; date: string; initialTab?: StoryTab }
const tabNotes: Record<StoryTab, string> = {
  read: '讀一段短文，不會的字點一下看意思，讀完考幾個字。',
  listen: '先不看字完整聽一次，再打開文字一句一句跟著念。',
  dictate: '一次聽一句，把聽到的寫下來，再對答案。',
}
const tabDone: Record<StoryTab, string> = { read: '讀過', listen: '聽過', dictate: '聽寫過' }
/** Each tab's own name in a lock line: 第 1 級閱讀完成八成才打開. */
const tabName: Record<StoryTab, string> = { read: '閱讀', listen: '聽力', dictate: '聽寫' }

/** The sentences of a passage. Each word can be tapped for its meaning; each sentence can be played. */
/** `detail` (the meaning of the tapped word) is shown right under the sentence the word is in, so it never covers the text. */
function Sentences({ list, playing, onPlay, onWord, detail, detailLine, pickedIndex }: { list: string[]; playing?: number | null; onPlay?: (i: number) => void
  onWord?: (w: string, line: number, position: WordPosition) => void; detail?: ReactNode; detailLine?: number; pickedIndex?: number }) {
  return <ol className="st-lines">
    {list.map((s, i) => <li key={i} data-playing={playing === i}>
      {onPlay && <button type="button" className="st-say" aria-label={'播放這一句：' + s} onClick={() => onPlay(i)}><Volume2 size={14} /></button>}
      <p lang="en"><TapWords text={s} line={i} onWord={onWord} pickedLine={detailLine} pickedIndex={pickedIndex} /></p>
      {onWord && detailLine === i && detail}
    </li>)}
  </ol>
}

export default function StoryLibrary({ state, update, onActivity, onSavedActivity, date, initialTab = 'read' }: Props) {
  const [all, setAll] = useState<Passage[]>()
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<StoryTab>(initialTab)
  const [skipped, setSkipped] = useState<string[]>([])
  const [selection, setSelection] = useState<{ tab: StoryTab; level: number; id?: string }>()
  const [requested, setRequested] = useState<{ level: number; id?: string }>()
  const [dictationVersion, setDictationVersion] = useState(0)
  const stored = Math.min(6, Math.max(1, Number(state.notes[storyLevelKey]) || 1))
  useEffect(() => {
    let alive = true
    import('../data/passages.json')
      .then(file => { if (alive) setAll((file.default as Passage[]).filter(p => p.en)) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    setTab(initialTab)
    setSkipped(list => list.length ? [] : list)
    setRequested(undefined)
  }, [initialTab])
  // Each tab climbs on its own: a level opens once the one before it is done to 80% on that tab (讀、聽、聽寫).
  const levelOpen = useMemo(() => all ? storyLevelsOpen(all, state.notes, tab) : [true, false, false, false, false, false], [all, state.notes, tab])
  const level = openAt(levelOpen, (requested?.level ?? stored) - 1) + 1
  const canDictate = useMemo(() => tab === 'listen' && !!all && storyLevelsOpen(all, state.notes, 'dictate')[level - 1],
    [all, level, state.notes, tab])
  // The passage stays the same while it is being worked on; only a new level, tab or 下一段 picks another.
  useLayoutEffect(() => {
    if (!all) return
    const drafts = tab === 'dictate' ? savedDraftTexts(dictationDraftPrefix) : undefined
    const exact = requested?.id ? all.find(p => p.id === requested.id && p.level === level) : undefined
    const pick = exact ?? nextStory(all, level, state.checks, state.notes, tab, skipped, drafts?.size
      ? (p, record, at) => drafts.has(dictationDraftKey(p.id, record, at))
      : undefined)
    setSelection({ tab, level, id: pick?.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, level, tab, skipped, requested])
  const currentId = selection?.tab === tab && selection.level === level ? selection.id : undefined
  const passage = useMemo(() => all?.find(p => p.id === currentId), [all, currentId])
  const progress = useMemo(() => all ? storyProgress(all, level, state.notes, tab) : { done: 0, total: 0 }, [all, level, state.notes, tab])
  function next() {
    if (!passage) return
    setRequested(current => current?.id ? { level: current.level } : current)
    setSkipped(list => [...list, passage.id])
  }
  function chooseLevel(n: number) {
    if (n === level) return
    update(prev => ({ ...prev, notes: { ...prev.notes, [storyLevelKey]: String(n) } }))
    setRequested(undefined)
    setSkipped([])
  }
  function chooseTab(t: StoryTab, id?: string) {
    if (t === tab) return
    setSkipped([])
    setRequested(id ? { id, level } : undefined)
    setTab(t)
    if (id && level !== stored) update(prev => ({ ...prev, notes: { ...prev.notes, [storyLevelKey]: String(level) } }))
    if (location.hash.startsWith('#library/story')) history.replaceState(null, '', '#library/story/' + t)
  }

  if (failed) return <p>短文還沒下載到這台裝置。連上網路後再打開一次。</p>
  if (!all) return <p>正在準備短文…</p>
  return <div className="pr-stack st">
    <div className="pr-options qz-tabs" role="group" aria-label="短文怎麼練">
      {storyTabs.map(([id, name]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => chooseTab(id)}>{name}</button>)}
    </div>
    <div className="passage-head">
      <label>級別 <select value={level} onChange={e => chooseLevel(Number(e.target.value))}>
        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n} disabled={!levelOpen[n - 1]}>{levelOpen[n - 1] ? '' : '🔒 '}第 {n} 級{n === 1 ? '（最簡單）' : levelOpen[n - 1] ? '' : '（第 ' + (n - 1) + ' 級' + tabName[tab] + '完成八成才打開）'}</option>)}
      </select></label>
      <span className="passage-count">{tabDone[tab]} <b>{progress.done}</b> / {progress.total} 段</span>
    </div>
    <p className="st-note">{tabNotes[tab]}</p>
    {!passage ? <p>這一級的短文都輪過一次了，換一級或再來一輪。<button type="button" className="pr-link" onClick={() => setSkipped([])}>再來一輪</button></p>
      : tab === 'read' ? <StoryRead key={passage.id} passage={passage} all={all} state={state} onActivity={onActivity}
          onSavedActivity={onSavedActivity} date={date} onNext={next} />
      : tab === 'listen' ? <StoryListen key={passage.id} passage={passage} state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} onNext={next}
          onDictate={canDictate ? () => chooseTab('dictate', passage.id) : undefined} />
      : <StoryDictate key={passage.id + '/' + dictationVersion} passage={passage} state={state} onActivity={onSavedActivity} date={date} onNext={next}
          onResume={() => setDictationVersion(n => n + 1)} />}
  </div>
}

type PartProps = { passage: Passage; state: PageProps['state']; onActivity: PageProps['update']; date: string; onNext: () => void }
type SavedPartProps = PartProps & { onSavedActivity: PageProps['update'] }
const label = (p: Passage) => '第 ' + p.level + ' 級 · ' + p.letter + ' ' + String(p.n).padStart(2, '0')

function StoryRead({ passage, all, state, onActivity, onSavedActivity, date, onNext }: SavedPartProps & { all: Passage[] }) {
  const sentences = useMemo(() => splitSentences(passage.en ?? ''), [passage])
  const voice = useDialogueVoice(state.settings.speechRate)
  const lines = useMemo(() => sentences.map(en => ({ who: '', en, zh: '' })), [sentences])
  const look = useLookup(passage, { rate: state.settings.speechRate, onSay: voice.stop })
  const [phase, setPhase] = useState<'read' | 'quiz' | 'done'>('read')
  const [zh, setZh] = useState(false)
  const [zhEarly, setZhEarly] = useState(false)
  const [qs, setQs] = useState<ReturnType<typeof meaningQuestions>>([])
  const [picks, setPicks] = useState<number[]>([])
  const saving = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const before = readStory(state.notes, passage.id)
  useTaskContext({ label: '短文閱讀：' + label(passage), detail: '他正在讀這段英文短文（7000 單 ' + label(passage) + '）：\n' + passage.en + '\n中文：' + passage.zh })
  async function finish(answered: number[]) {
    if (saving.current) return
    saving.current = true
    setSaveStatus('saving')
    const score: [number, number] = [qs.filter((q, j) => answered[j] === q.answer).length, qs.length]
    try {
      await onSavedActivity(prev => ({ ...prev, notes: logSkill(saveStoryRead(prev.notes, passage.id, date, zhEarly,
        score[1] ? score : undefined), 'read', date) }))
      setPicks(answered)
      setPhase('done')
      setZh(true)
      setSaveStatus('idle')
    } catch {
      setSaveStatus('failed')
    } finally {
      saving.current = false
    }
  }
  function startQuiz() {
    if (saving.current) return
    voice.stop()
    const looked = new Set(look.seen.flatMap(l => [l.form.toLowerCase(), l.en.toLowerCase()]))
    const made = zhEarly ? [] : meaningQuestions(passage, all, looked)
    if (!made.length) { void finish([]); return }
    setQs(made); setPhase('quiz')
  }
  function pick(i: number) {
    // A double tap on an answer must not also answer the next word that appears in the same place.
    if (!ready() || saving.current) return
    const nextPicks = [...picks, i]
    if (nextPicks.length === qs.length) void finish(nextPicks)
    else setPicks(nextPicks)
  }
  const q = phase === 'quiz' ? qs[picks.length] : undefined
  const ready = useTapGuard(phase + picks.length)
  const right = qs.filter((x, j) => picks[j] === x.answer).length
  return <>
    <article className="rd-passage st-text">
      <header><small>{label(passage)}{before.r ? ' · 上次 ' + before.r.slice(5).replace('-', '/') + ' 讀過' : ''}</small></header>
      <Sentences list={sentences} playing={voice.playing} onPlay={i => voice.play(lines, i, true)} onWord={phase === 'quiz' ? undefined : look.tap}
        detail={look.box} detailLine={look.line} pickedIndex={look.index} />
      {zh ? <p className="rd-zh">{passage.zh}</p>
        : phase === 'read' && <button type="button" className="pr-link" disabled={saveStatus === 'saving'} onClick={() => { setZh(true); setZhEarly(true) }}>真的看不懂？看整段中文（這次就不考字義）</button>}
    </article>
    {saveStatus === 'failed' && <p className="ls-help" role="status">閱讀紀錄暫時存不下來，請再按一次。</p>}
    {phase === 'read' && <div className="pr-actions">
      <button type="button" className="pr-main" disabled={saveStatus === 'saving'} onClick={startQuiz}>{saveStatus === 'saving' ? '儲存中…' : '讀完了'}</button>
      <button type="button" className="pr-link" disabled={saveStatus === 'saving'} onClick={onNext}>換一段</button>
    </div>}
    {q && <section className="rd-q">
      <p className="rd-qmeta">沒查過的字考 {qs.length} 個 · 第 {picks.length + 1} 個</p>
      <h4>這段裡的 <span lang="en">{q.form}</span> 是什麼意思？</h4>
      <div className="pr-options rd-options">{q.options.map((o, i) => <button key={o} type="button" disabled={saveStatus === 'saving'} onClick={() => pick(i)}>{o}</button>)}</div>
      {saveStatus === 'saving' && <p className="ls-help" role="status">儲存中…</p>}
    </section>}
    {phase === 'done' && <div className="pr-hint">
      <strong>{qs.length ? '字義 ' + qs.length + ' 題對 ' + right + ' 題' : '這段讀完了'}</strong>
      {qs.length > 0 && <ul className="rd-review">{qs.map((x, j) => <li key={x.form} data-ok={picks[j] === x.answer}><span lang="en">{x.form}</span>：{x.zh}{picks[j] === x.answer ? '' : '（你選了「' + x.options[picks[j]] + '」）'}
        {picks[j] !== x.answer && <AskWhy label="問 Claude" q={{ source: '短文字義', passage: passage.en, stem: '這段裡的 ' + x.form + ' 是什麼意思？', options: x.options, picked: x.options[picks[j]] ?? '', answer: x.options[x.answer], right: false }} />}</li>)}</ul>}
      <p className="st-note">再看一次英文和下面的中文，確認每一句都對得起來。</p>
      <div className="pr-actions"><button type="button" className="pr-main" onClick={onNext}>下一段</button></div>
    </div>}
    <LookedUp items={look.seen} state={state} onActivity={onActivity} date={date} />
  </>
}

function StoryListen({ passage, state, onActivity, onSavedActivity, date, onNext, onDictate }: SavedPartProps & { onDictate?: () => void }) {
  const sentences = useMemo(() => splitSentences(passage.en ?? ''), [passage])
  const lines = useMemo(() => sentences.map(en => ({ who: '', en, zh: '' })), [sentences])
  const voice = useDialogueVoice(state.settings.speechRate)
  const look = useLookup(passage, { rate: state.settings.speechRate, onSay: voice.stop })
  const [started, setStarted] = useState(0)
  const [noVoice, setNoVoice] = useState(false)
  const [unsure, setUnsure] = useState(false)
  const [rated, setRated] = useState(false)
  const [showZh, setShowZh] = useState(false)
  const saving = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const before = readStory(state.notes, passage.id)
  const heard = voice.completed > 0
  useEffect(() => { if (voice.status === 'error') setNoVoice(true) }, [voice.status])
  useTaskContext({ label: '短文聽力：' + label(passage), detail: '他正在聽這段英文短文（先不看字）：\n' + passage.en + '\n中文：' + passage.zh + (rated ? '' : '\n他還沒看文字，先不要把內容說出來。') })
  function playAll() {
    if (voice.playing !== null) { voice.stop(); return }
    if (!voice.play(lines)) { setNoVoice(true); return }
    setNoVoice(false)
    setStarted(n => n + 1)
  }
  async function rate(u?: 1 | 2 | 3) {
    if (saving.current) return
    voice.stop()
    saving.current = true
    setSaveStatus('saving')
    // Only a play that reached the end counts as listening (the passage's 聽過 and the level's progress). Without it the
    // text is still there to learn from, recorded apart.
    try {
      await onSavedActivity(prev => {
        const notes = saveStory(prev.notes, passage.id, u ? { l: date, u } : { lt: date })
        return { ...prev, notes: u ? logSkill(notes, 'listen', date) : notes }
      })
      setRated(true)
      setSaveStatus('idle')
    } catch {
      setSaveStatus('failed')
    } finally {
      saving.current = false
    }
  }
  const open = heard || unsure || noVoice
  return <>
    <div className="st-listen">
      <small>{label(passage)} · {sentences.length} 句{before.r ? ' · 這段讀過' : ' · 這段沒讀過'}{before.l ? ' · 上次 ' + before.l.slice(5).replace('-', '/') + ' 聽過' : ''}</small>
      <button type="button" className="ls-play" disabled={saveStatus === 'saving'} onClick={playAll}>
        {voice.playing !== null ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />{rated ? '整段再聽一次' : '播放整段'}{voice.completed ? '（完整聽過 ' + voice.completed + ' 次）' : ''}</>}
      </button>
      <small>電腦語音（不是真人錄音）。想慢一點，到設定 → 我的學習節奏調朗讀速度。</small>
      {noVoice && !heard && <p className="ls-help">這台裝置現在沒辦法播放語音。可以改成看文字，這次不算聽力練習。</p>}
    </div>
    {!rated && <>
      {saveStatus === 'failed' && <p className="ls-help" role="status">這次練習暫時存不下來，請再按一次。</p>}
      {saveStatus === 'saving' && <p className="ls-help" role="status">儲存中…</p>}
      {!open && <p className="ls-help ls-need">先完整聽一到兩次，不看字，抓大意就好。</p>}
      {!open && started > 0 && <button type="button" className="pr-link" onClick={() => { voice.stop(); setUnsure(true) }}>播放卡住或沒有顯示結果？</button>}
      {heard && <fieldset className="pr-marks" disabled={saveStatus === 'saving'}><legend>只用聽的，聽懂多少？</legend>
        <button type="button" onClick={() => rate(3)}>幾乎都懂</button>
        <button type="button" onClick={() => rate(2)}>大概懂</button>
        <button type="button" onClick={() => rate(1)}>聽不太懂</button>
      </fieldset>}
      {open && !heard && <button type="button" className="pr-link" disabled={saveStatus === 'saving'} onClick={() => rate()}>直接看這段文字</button>}
    </>}
    {rated && <>
      <article className="rd-passage st-text">
        <header><small>一句一句點來聽，跟著念出聲。不會的字點一下。</small></header>
        <Sentences list={sentences} playing={voice.playing} onPlay={i => voice.play(lines, i, true)} onWord={look.tap} detail={look.box} detailLine={look.line} pickedIndex={look.index} />
        {showZh ? <p className="rd-zh">{passage.zh}</p> : <button type="button" className="pr-link" onClick={() => setShowZh(true)}>看中文</button>}
      </article>
      <div className="pr-actions">
        <button type="button" className="pr-main" onClick={onNext}>下一段</button>
        {!noVoice && onDictate && <button type="button" className="pr-link" onClick={onDictate}>用這段短文練聽寫</button>}
      </div>
      {!noVoice && !onDictate && <p className="ls-help">這一級的聽寫還沒開放。先完成上一級八成的聽寫。</p>}
      <LookedUp items={look.seen} state={state} onActivity={onActivity} date={date} />
    </>}
  </>
}

function StoryDictate({ passage, state, onActivity, date, onNext, onResume }: PartProps & { onResume: () => void }) {
  const sentences = useMemo(() => splitSentences(passage.en ?? ''), [passage])
  const [resume] = useState(() => readStory(state.notes, passage.id))
  const start = dictationStart(resume, sentences.length)
  const [round] = useState(() => dictationRound(passage.id, resume, start))
  const cursor = useRef({ at: start, stamp: resume.dAt, round })
  const [at, setAt] = useState(start)
  const currentDraft = (index: number) => dictationDraftKey(passage.id, resume, index, round)
  const [text, setText] = useState(() => readDraft(currentDraft(start)))
  const [plays, setPlays] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [playError, setPlayError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'failed' | 'changed'>('idle')
  const [totalScore, setTotalScore] = useState<[number, number]>(() => (start > 0 ? resume.dqp : undefined) ?? [0, 0])
  const playback = useRef<AbortController | null>(null)
  const saving = useRef(false)
  const active = useRef(false)
  const [early, setEarly] = useState(false)
  const [results, setResults] = useState<ReturnType<typeof dictationScore>[]>([])
  const [summary, setSummary] = useState(false)
  const [countedRound, setCountedRound] = useState(false)
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
      playback.current?.abort()
      playback.current = null
    }
  }, [])
  const checked = results[at - start]
  const sentence = sentences[at]
  useTaskContext({ label: '聽寫：' + label(passage), detail: '他正在做聽寫（聽一句、寫一句）。現在這一句：' + (sentence ?? '') + '\n他對答案前不要把句子說出來。', draft: text })
  function stopPlay() {
    const current = playback.current
    playback.current = null
    current?.abort()
    setPlaying(false)
  }
  async function play() {
    if (playback.current) { stopPlay(); return }
    const request = new AbortController()
    playback.current = request
    setPlaying(true)
    setPlayError('')
    const result = await speakEnglishResult(sentence, state.settings.speechRate, request.signal)
    if (playback.current !== request) return
    playback.current = null
    setPlaying(false)
    if (result === 'played') setPlays(n => n + 1)
    else setPlayError(result === 'aborted' ? '播放中斷，請再聽一次。' : '這一句未能播完。請重播，或換一個支援英文語音的瀏覽器。')
  }
  async function check(written = text) {
    if (!plays || saving.current || cursor.current.at !== at || saveStatus === 'changed') return
    stopPlay()
    saving.current = true
    setSaveStatus('saving')
    const submitted = hasDictationAnswer(written)
    const result = dictationScore(written, sentence)
    const finish = at + 1 === sentences.length
    const clearSubmittedDraft = captureDraftCleanup(currentDraft(at), text)
    let attempted = false
    let saved: StoryRecord | undefined
    try {
      await onActivity(prev => {
        attempted = true
        saved = advanceDictation(readStory(prev.notes, passage.id), cursor.current, result, finish, date, submitted)
        if (!saved) return prev
        const notes = saveStory(prev.notes, passage.id, saved)
        return { ...prev, notes: submitted ? logSkill(notes, 'listen', date) : notes }
      })
    } catch {
      attempted = false
      saved = undefined
    } finally {
      saving.current = false
      if (saved) clearSubmittedDraft()
      if (active.current) {
        if (saved) {
          const score = saved.dqp ?? saved.dq
          cursor.current = { at: at + 1, stamp: saved.dAt, round }
          setText(written)
          setTotalScore(from => score ?? [from[0] + result.right, from[1] + result.total])
          if (finish) setCountedRound(saved.dDoneRound === round)
          setResults(list => [...list, result])
          setSaveStatus('idle')
        } else setSaveStatus(attempted ? 'changed' : 'failed')
      }
    }
  }
  function done(stop = false) {
    stopPlay()
    setEarly(stop)
    setSummary(true)
  }
  if (summary) {
    const [right, total] = totalScore
    const title = early ? '這輪已練 ' + (start + results.length) + ' / ' + sentences.length + ' 句，下次從第 ' + (start + results.length + 1) + ' 句接著練'
      : countedRound ? '這段聽寫完成' : '這段看完了，這次沒有提交聽寫答案'
    return <div className="pr-hint">
      <strong>{title}。{total} 個字寫對 {right} 個（{Math.round(right / Math.max(1, total) * 100)}%）</strong>
      {start > 0 && <p>這次接著寫的句子</p>}
      <ol className="st-lines st-recap" start={start + 1}>{sentences.slice(start, start + results.length).map((s, i) => <li key={i}><p lang="en">{s}<small> {results[i].right} / {results[i].total}</small></p></li>)}</ol>
      <p className="rd-zh">{passage.zh}</p>
      <div className="pr-actions"><button type="button" className="pr-main" onClick={onNext}>下一段</button></div>
    </div>
  }
  return <section className="st-dictate">
    <small>{label(passage)} · 第 {at + 1} / {sentences.length} 句{start && at === start ? '（上次寫到這裡，接著寫）' : ''}</small>
    <button type="button" className="ls-play" disabled={saveStatus === 'saving'} onClick={play}>
      {playing ? <><Pause size={16} />停止</> : <><Play size={16} fill="currentColor" />{plays ? '再聽一次' : '播放這一句'}</>}
      {plays ? '（完整聽了 ' + plays + ' 次）' : ''}</button>
    {playError && <p className="ls-help" role="status">{playError}</p>}
    <label className="pr-field">我聽到的
      <textarea lang="en" rows={3} value={text} readOnly={!!checked || saveStatus === 'saving'} autoCapitalize="sentences" autoComplete="off" autoCorrect="off" spellCheck={false}
        onChange={e => { setText(e.target.value); writeDraft(currentDraft(at), e.target.value) }} placeholder="聽幾次都可以，聽到什麼寫什麼" />
    </label>
    {!checked && <DraftVersions id={currentDraft(at)} text={text} onChoose={setText} disabled={saveStatus === 'saving'} />}
    {saveStatus === 'changed' && <div className="pr-hint"><p role="status">這段聽寫已有新的儲存進度。</p>
      <button type="button" className="pr-link" onClick={onResume}>接續已儲存的進度</button></div>}
    {saveStatus === 'failed' && <p className="ls-help" role="status">這次聽寫進度無法寫入，請再按一次對答案。</p>}
    {!checked && saveStatus !== 'changed' && <div className="pr-actions">
      <button type="button" className="pr-main" disabled={saveStatus === 'saving' || !plays || !hasDictationAnswer(text)} onClick={() => check()}>{saveStatus === 'saving' ? '儲存中…' : '對答案'}</button>
      <button type="button" className="pr-link" disabled={saveStatus === 'saving' || !plays} onClick={() => check('')}>這句聽不出來，看答案</button>
    </div>}
    {checked && <div className="pr-reference st-check">
      <small>原句</small>
      <p lang="en">{sentence}</p>
      {checked.words.length > 0 && <p className="pr-compare"><small>你寫的：</small> <span lang="en">{checked.words.map((t, i) => <span key={i} className={t.extra ? 'pr-diff-extra' : undefined}>{t.w} </span>)}</span></p>}
      {checked.missing.length > 0 && <p className="pr-compare"><small>沒寫到的字：</small> <span lang="en" className="pr-diff-missing">{checked.missing.join(' ')}</span></p>}
      {checked.extra > 0 && <p className="pr-compare"><small>多寫了 {checked.extra} 個原句沒有的字（畫波浪線的），也算錯：多一個字意思可能就反了。</small></p>}
      <strong>{checked.total} 個字寫對 {checked.right} 個{checked.right === checked.total ? ' ✓' : ''}</strong>
      <small>大小寫和標點不算錯；畫波浪線的字原句沒有。</small>
      {checked.right !== checked.total && <AskWhy label="問 Claude 我聽錯在哪" q={{ source: '聽寫', stem: '聽一句英文，把聽到的寫下來', picked: text, answer: sentence, right: false }} />}
      <div className="pr-actions">
        {at + 1 < sentences.length
          ? <button type="button" className="pr-main" onClick={() => { stopPlay(); setAt(at + 1); setText(readDraft(currentDraft(at + 1))); setPlays(0); setPlayError('') }}>下一句</button>
          : <button type="button" className="pr-main" onClick={() => done()}>看整段結果</button>}
        {at + 1 < sentences.length && <button type="button" className="pr-link" onClick={() => done(true)}>今天寫到這裡（下次接著寫）</button>}
      </div>
    </div>}
  </section>
}

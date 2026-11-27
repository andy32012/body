import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Mic, Square, Settings2, X } from 'lucide-react'
import { updateStoreNow, type AppState, type PageProps } from '../lib/store'
import { echoGuard, onVoicePreferencesChanged, openaiKey, setEchoGuard, setOpenaiKey, setVoiceName, startVoice, voiceName, voices, type Line, type VoiceSession } from '../lib/voice'
import { EMMA, emmaInstructions, emmaOpening, emmaStudy, quietNudge } from '../lib/emmaPrompt'
import { askTutor, tutorKey } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog, logConsent } from '../lib/drive'
import { dayKey } from '../lib/progress'
import { addSayCard, removeSayCard, sayIdentity } from '../lib/sayCards'
import { checkSequence } from '../lib/checks'
import { addWeak, easeWeak, labelOfUnit, normalizeLabel, readRemoved, readWeak, weakAfterRemoval, weakLinesEn } from '../lib/weakPoints'
import { parseSpeakFeedback, speakFeedbackOk, speakFeedbackPrompt, type SpeakFeedback, type SpeakFix } from '../lib/speakFeedback'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import curriculum from '../data/curriculum.json'
import { emmaLesson, emmaLessonInstructions } from '../lib/emmaLesson'
import { topicById, topicInstructions, type TopicPart } from '../lib/topics'
import { cueKey, nextCueCard, part2FeedbackPrompt, part2Instructions, type CueCard } from '../lib/ieltsSpeaking'
import cueCards from '../data/cue-cards.json'
import { lessonTarget, markLessonStep, parseLessonTarget, promptFor, selectLessonRecord, type Lesson } from '../lib/lesson'
import VoiceWave, { type Levels } from '../components/VoiceWave'
import { emmaLevel } from '../lib/cefr'
import { hasPack, logSkill, packInstructions, speakKey, unitTitle, type Pack } from '../lib/bridge'
import { nurseInstructions, nurseSpeakKey, type NurseListening } from '../lib/nursing'
import { PairPaste } from '../components/PairDevice'
import { partNames, readWordChat, wordChatBack, wordChatInstructions } from '../lib/wordChat'
import './speaking.css'

const NAME = EMMA

type Fix = SpeakFix & { key: string; status: 'active' | 'removed' | 'unsaved'; cardId?: string; weak?: { day: string; at: number } }
type Focus = { label: string; rule: string }
type LessonVoice = { target: string; date: string; turns: number; words: number }
type Attempt = {
  id: number
  focus: Focus
  lines: Line[]
  review: string
  fixes: Fix[]
  feedback?: SpeakFeedback
  unverifiedFixes?: number
  noting?: boolean
  fixing?: boolean
  error?: string
  lessonVoice?: LessonVoice
  savingLessonVoice?: boolean
  lessonVoiceError?: string
}
type CardWork = { prepNotes?: string; prepEnd?: number; attempt?: Attempt }
type CardWorks = Record<string, CardWork>

// Keep the latest pages' work in this browser tab's memory. Nothing here is saved to disk or sent on navigation.
function newSpeakingWork() {
  let cards: CardWorks = {}
  const listeners = new Set<() => void>()
  return {
    snapshot: () => cards,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    edit: (apply: (prev: CardWorks) => CardWorks) => {
      const next = apply(cards)
      if (next === cards) return
      cards = next
      listeners.forEach(listener => listener())
    },
    pending: new Set<number>(),
    selectedCard: undefined as string | undefined,
    skipped: [] as string[],
  }
}
const recentSpeakingWork = new Map<string, ReturnType<typeof newSpeakingWork>>()
let nextSpeakingAttempt = 0

type SceneLoad<T> = { status: 'loading' | 'missing' | 'failed' } | { status: 'ready'; value: T }
const sceneStatus = {
  loading: '載入中……',
  missing: '找不到這個口說任務。請回到練習重新選題。',
  failed: '口說教材下載失敗。請連上網路後重試。',
}

function keepFix(prev: AppState, fix: SpeakFix & { key: string }, day: string): { state: AppState; fix: Fix } {
  const tag = fix.tag ? normalizeLabel(fix.tag) : null
  const next = addSayCard(prev, { zh: fix.zh, en: fix.en, wrong: fix.wrong, why: fix.why, from: 'emma', ...(tag ? { tag } : {}) }, day)
  const cardId = next === prev ? undefined : next.cards.at(-1)?.id
  const notes = tag ? addWeak(next.notes, tag, day, { w: fix.wrong, r: fix.en }, 'speak') : next.notes
  const weakAt = tag ? readWeak(notes).find(item => item.k === tag)?.lastAt : undefined
  return {
    state: notes === next.notes ? next : { ...next, notes },
    fix: { ...fix, cardId, status: 'active', weak: weakAt ? { day, at: weakAt } : undefined },
  }
}
const clock = (ms: number) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0')

/** Speaker labels are kept in the editable transcript. Never use Emma's replies to verify the learner's words. */
function learnerTurns(transcript: string) {
  const turns: string[] = []
  let active: string[] | undefined
  for (const line of transcript.split('\n')) {
    const prefix = /^([^：:]+)[：:]\s*(.*)$/.exec(line.trim())
    if (prefix?.[1] === '玄燁' || prefix?.[1] === NAME) {
      if (active) turns.push(sayIdentity(active.join(' ')))
      active = prefix[1] === '玄燁' ? [prefix[2]] : undefined
    } else if (active) active.push(line.trim())
  }
  if (active) turns.push(sayIdentity(active.join(' ')))
  return turns
}

export default function Speaking({ state, update, lessonMode = false, lessonDate, ieltsMode = false, topicMode, packMode, nurseMode, wordMode }: PageProps & { lessonMode?: boolean; lessonDate?: string; ieltsMode?: boolean; topicMode?: string; packMode?: string; nurseMode?: string; wordMode?: string }) {
  const memory = useMemory()
  // Lessons stay tied to the day they belong to, including when an older lesson is resumed.
  const [wantedTarget] = useState(() => lessonDate ?? dayKey())
  const courseDate = parseLessonTarget(wantedTarget)?.date
  function loadCourse() {
    if (!lessonMode) return null
    const selection = selectLessonRecord(state.notes, wantedTarget)
    if (lessonDate !== undefined && !selection) return null
    const target = selection ? lessonTarget(selection.date, selection.rec) : wantedTarget
    const lesson = emmaLesson(state, target)
    return lesson ? { target, lesson } : null
  }
  const [course, setCourse] = useState(loadCourse)
  useEffect(() => {
    // The lesson can arrive just after navigation, from a queued local save or from sync.
    if (!course) {
      const next = loadCourse()
      if (next) setCourse(next)
    }
  }, [course, wantedTarget, lessonDate, lessonMode, state])
  const courseRecord = course && selectLessonRecord(state.notes, course.target)
  const lesson = course?.lesson
  const courseDone = courseRecord?.rec.steps.includes('done')
  // "t1-B": role-play the speaking situation of a life topic.
  const [topic] = useState(() => {
    const match = topicMode?.match(/^(.+)-([ABC])$/)
    const t = match ? topicById(match[1]) : undefined
    return t && match ? { topic: t, part: match[2] as TopicPart } : null
  })
  // "43-0": the first speaking task of bridge unit 43's pack.
  const [packRef] = useState(() => { const m = (packMode ?? '').match(/^(\d+)-(\d+)$/); return m ? { unit: Number(m[1]), i: Number(m[2]) } : null })
  const [packLoad, setPackLoad] = useState<SceneLoad<Pack>>({ status: 'loading' })
  useEffect(() => {
    if (!packRef) return
    let alive = true
    import('../data/bridge.json').then(f => {
      if (!alive) return
      const pack = (f.default as Pack[]).find(x => x.unit === packRef.unit)
      setPackLoad(pack?.speak[packRef.i] ? { status: 'ready', value: pack } : { status: 'missing' })
    }).catch(() => { if (alive) setPackLoad({ status: 'failed' }) })
    return () => { alive = false }
  }, [packRef])
  const pack = packLoad.status === 'ready' ? packLoad.value : null
  const packTask = pack && packRef ? pack.speak[packRef.i] : null
  // "nl-07": act out a nursing listening dialogue; Emma plays the other person.
  const [nurseLoad, setNurseLoad] = useState<SceneLoad<NurseListening>>({ status: 'loading' })
  useEffect(() => {
    if (!nurseMode) return
    let alive = true
    import('../data/nursing-listening.json').then(f => {
      if (!alive) return
      const nurse = (f.default as NurseListening[]).find(x => x.id === nurseMode)
      setNurseLoad(nurse ? { status: 'ready', value: nurse } : { status: 'missing' })
    }).catch(() => { if (alive) setNurseLoad({ status: 'failed' }) })
    return () => { alive = false }
  }, [nurseMode])
  const nurse = nurseLoad.status === 'ready' ? nurseLoad.value : null
  const lessonUnavailable = lessonMode && (!course || (lessonDate !== undefined && !courseRecord))
  const packStatus = packRef ? packLoad.status : 'missing'
  const nurseStatus = nurseMode ? nurseLoad.status : 'missing'
  // From a word card: chat about that word; Emma knows the list, the drill and the other words of the round.
  const [wordChat] = useState(() => readWordChat(wordMode))
  const topicUnavailable = topicMode !== undefined && !topic
  const wordUnavailable = wordMode !== undefined && !wordChat
  const sceneUnavailable = lessonUnavailable || topicUnavailable || wordUnavailable ||
    (packMode !== undefined && !packTask) || (nurseMode !== undefined && !nurse)
  const [routeHash] = useState(() => location.hash)
  const workRoute = lessonMode ? 'lesson/' + (course?.target ?? wantedTarget) : routeHash
  const work = useMemo(() => recentSpeakingWork.get(workRoute) ?? newSpeakingWork(), [workRoute])
  useLayoutEffect(() => {
    recentSpeakingWork.delete(workRoute)
    recentSpeakingWork.set(workRoute, work)
    if (recentSpeakingWork.size > 6) {
      const oldest = recentSpeakingWork.keys().next().value
      if (oldest !== undefined) recentSpeakingWork.delete(oldest)
    }
  }, [work, workRoute])
  const [task, setTask] = useState<string>()
  const [cardSkip, setCardSkip] = useState(() => work.skipped)
  // The card is chosen once and kept: the call, the notes, the transcript and the feedback all belong to it. Saving
  // the card as done must not swap the title above the feedback; only 換一張 / 下一張 moves on.
  const [cardId, setCardId] = useState(() => ieltsMode ? work.selectedCard ?? nextCueCard(cueCards as CueCard[], state.notes, [])?.id : undefined)
  const card = ieltsMode ? (cueCards as CueCard[]).find(c => c.id === cardId) ?? nextCueCard(cueCards as CueCard[], state.notes, cardSkip) : null
  useLayoutEffect(() => { work.selectedCard = card?.id }, [work, card])
  // The request writes back to its own card and transcript, even if a different card is open.
  const cardWork = useSyncExternalStore(work.subscribe, work.snapshot)
  const workKey = card?.id ?? 'chat'
  const { prepNotes = '', prepEnd, attempt } = cardWork[workKey] ?? {}
  const { lines = [], review = '', noting = false, fixes = [], feedback, unverifiedFixes = 0, error: fbError, fixing = false } = attempt ?? {}
  function editCard(key: string, edit: (prev: CardWork) => CardWork) {
    work.edit(prev => ({ ...prev, [key]: edit(prev[key] ?? {}) }))
  }
  function editAttempt(key: string, id: number, edit: (prev: Attempt) => Attempt) {
    work.edit(prev => {
      const card = prev[key]
      if (card?.attempt?.id !== id) return prev
      return { ...prev, [key]: { ...card, attempt: edit(card.attempt) } }
    })
  }
  function moveCard(to: string | undefined, skip: string[]) {
    if (!card) return
    work.skipped = skip
    work.selectedCard = to
    setCardSkip(skip)
    setCardId(to)
    setStatus(to && cardWork[to]?.attempt?.review ? 'closed' : 'idle')
    setError('')
  }
  function nextCard() {
    if (!card) return
    const skip = [...cardSkip, card.id]
    moveCard(nextCueCard(cueCards as CueCard[], state.notes, skip)?.id, skip)
  }
  const prevCardId = cardSkip[cardSkip.length - 1]
  function prevCard() { if (card && prevCardId) moveCard(prevCardId, cardSkip.slice(0, -1)) }
  const [liveAt, setLiveAt] = useState<number>()
  // Part 2 timing counts from his first words, not from the connection; youMs adds up the time his voice is heard.
  const [youFrom, setYouFrom] = useState<number>()
  const [youMs, setYouMs] = useState(0)
  const [tick, setTick] = useState(Date.now())
  useEffect(() => { if (!prepEnd && !liveAt) return; const t = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(t) }, [prepEnd, liveAt])
  useEffect(() => {
    if (!lesson) return
    let alive = true
    import('../data/lessons.json').then(f => {
      const data = (f.default as Lesson[]).find(l => l.unit === lesson.unit)
      if (alive) setTask(data && promptFor(data, lesson.day).en)
    }).catch(() => {})
    return () => { alive = false }
  }, [lesson])
  const [key, setKey] = useState(openaiKey())
  const [settings, setSettings] = useState(!openaiKey())
  const [keyError, setKeyError] = useState('')
  const [voice, setVoice] = useState(voiceName)
  const [guard, setGuard] = useState(echoGuard)
  const [voiceSaveFailed, setVoiceSaveFailed] = useState(false)
  const [guardSaveFailed, setGuardSaveFailed] = useState(false)
  useEffect(() => onVoicePreferencesChanged(() => {
    setVoice(voiceName())
    setGuard(echoGuard())
  }), [])
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'closed'>(() => review ? 'closed' : 'idle')
  const [error, setError] = useState('')
  const levels = useRef<Levels>({ her: 0, you: 0 })
  const [who, setWho] = useState<'' | 'her' | 'you'>('')
  // The grammar this chat looks at: today's lesson in lesson mode, otherwise the unit he is on.
  const focusUnit = lesson?.unit ?? state.curriculum.unit
  const focusInfo = curriculum.units.find(u => u.unit === focusUnit)
  const focus = { label: labelOfUnit(focusUnit) ?? focusInfo?.title ?? '', rule: lesson?.rule ?? focusInfo?.rule ?? '' }
  const session = useRef<VoiceSession | null>(null)
  const log = useRef<HTMLDivElement>(null)

  // A call still being set up (permission dialog open, network not answered) is cancelled by 結束 or by leaving.
  const setup = useRef<AbortController | null>(null)
  // Call setup and audio events belong to the newest call. The grading result belongs to its transcript.
  const attempts = useRef(checkSequence())
  const pending = work.pending
  const pageOpen = useRef(false)
  useLayoutEffect(() => {
    pageOpen.current = true
    return () => {
      pageOpen.current = false
      stopSpeaking()
      setup.current?.abort()
      session.current?.stop()
    }
  }, [])
  // Keys that arrive from the computer (QR pairing) fill in here without a reload.
  useEffect(() => {
    const on = () => {
      const pairedKey = openaiKey()
      setKey(pairedKey)
      setKeyError('')
      if (pairedKey) setSettings(false)
    }
    window.addEventListener('dream-blueprint:keys', on)
    return () => window.removeEventListener('dream-blueprint:keys', on)
  }, [])
  useEffect(() => {
    if (status !== 'live') { setWho(''); return }
    const t = setInterval(() => {
      const { her, you } = levels.current
      const now = her > 0.06 ? 'her' : you > 0.08 ? 'you' : ''
      setWho(now)
      if (now === 'you') { setYouMs(ms => ms + 220); setYouFrom(at => at ?? Date.now()) }
    }, 220)
    return () => clearInterval(t)
  }, [status])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }) }, [lines])

  function saveVoiceKey() {
    const value = key.trim()
    if (!setOpenaiKey(value)) {
      setKeyError('這台裝置無法儲存 OpenAI 金鑰。欄位內容已保留，請檢查瀏覽器的儲存設定或釋出空間後再試。')
      return
    }
    setKey(value)
    setKeyError('')
    if (value) setSettings(false)
  }

  async function start() {
    if (sceneUnavailable || setup.current || (attempt && pending.has(attempt.id))) return
    if (!openaiKey()) { setSettings(true); return }
    stopSpeaking()
    setError(''); setYouMs(0); setYouFrom(undefined); setLiveAt(undefined); setTick(Date.now())
    const mine = attempts.current.start()
    const recording: Attempt = { id: ++nextSpeakingAttempt, focus, lines: [], fixes: [], review: '' }
    editCard(workKey, work => ({ ...work, attempt: recording }))
    const mineNow = () => attempts.current.isCurrent(mine)
    const controller = new AbortController()
    setup.current = controller
    let ended = false
    let said: Line[] = []
    const transcriptConsent = logConsent()
    const extra = card ? part2Instructions(card, prepNotes) : pack && packRef && packTask ? packInstructions(pack, packRef.i) : nurse ? nurseInstructions(nurse) : topic ? topicInstructions(topic.topic, topic.part) : lesson ? emmaLessonInstructions(lesson, task) : wordChat ? wordChatInstructions(wordChat) : ''
    try {
      const started = await startVoice({
        // Everything but the IELTS test knows what his course has taught and corrects him by his rule.
        instructions: emmaInstructions(memory.notes, extra, emmaLevel(state.curriculum.unit), {
          // Role-plays (life topic, unit task, nursing scene) keep their own rule for mistakes.
          longTurn: !!card, ...(card ? {} : { study: emmaStudy(state.curriculum.unit, weakLinesEn(state.notes, dayKey(), 5), !(topic || packTask || nurse)) }),
        }),
        opening: emmaOpening(!!extra),
        // In IELTS Part 2 he talks alone for a minute or two and may stop to think: nobody hurries him there.
        quiet: card ? undefined : { afterMs: 10000, times: 2, say: quietNudge },
        // Not in Part 2 either: a "Mm-hm" from her would cut a hole in his long answer.
        guard: echoGuard() && !card,
        onLine: change => {
          if (!mineNow() || ended) return
          const current = change(said)
          said = current
          editAttempt(workKey, recording.id, prev => ({ ...prev, lines: current }))
        },
        signal: controller.signal,
        onLevel: (her, you) => { if (mineNow()) levels.current = { her, you } },
        onState: (s, detail) => {
          if (!mineNow()) return
          if (pageOpen.current) {
            setStatus(s)
            if (s === 'live') { const now = Date.now(); setLiveAt(now); setTick(now) }
            if (detail) setError(detail)
          }
          if (s === 'closed' && !ended) {
            ended = true
            session.current = null
            setup.current = null
            if (pageOpen.current) setLiveAt(undefined)
            wrapUp(recording, said, transcriptConsent, !detail)
          }
        },
      })
      // Ended (or another call started) while it was connecting: this one is hung up, the newer one is left alone.
      if (controller.signal.aborted || !mineNow() || ended) { started.stop(); return }
      session.current = started
    } catch (e) {
      if (!mineNow() || !pageOpen.current) return
      setup.current = null
      if (ended) return
      setStatus('idle')
      if (controller.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(/Permission|NotAllowed/i.test(msg) ? '麥克風被擋住了：按網址列左邊的圖示，把麥克風改成「允許」再試一次。' : msg)
    }
  }

  function hangUp() {
    if (session.current) { session.current.stop(); return }
    const controller = setup.current
    if (!controller) return
    controller.abort()
    // A native permission prompt may still be unanswered. Its eventual result belongs to the old call.
    if (setup.current === controller) {
      setup.current = null
      attempts.current.start()
      setStatus('idle')
    }
  }

  async function saveLessonVoice(recording: Attempt, activity: LessonVoice) {
    editAttempt(workKey, recording.id, prev => ({ ...prev, lessonVoice: activity, savingLessonVoice: true, lessonVoiceError: '' }))
    try {
      await updateStoreNow(prev => {
        const saved = selectLessonRecord(prev.notes, activity.target)
        if (!saved) throw new Error('找不到這次口說所屬的每日課，請同步後再存。')
        const notes = logSkill(prev.notes, 'speak', activity.date)
        return { ...prev, notes: markLessonStep(notes, saved.date, saved.rec.unit, saved.rec.day, 'express', {
          sentenceId: saved.rec.sentenceId, retry: saved.rec.retry,
          voiceExpression: { date: activity.date, turns: activity.turns, words: activity.words },
        }) }
      })
      editAttempt(workKey, recording.id, prev => ({ ...prev, lessonVoice: undefined }))
    } catch (error) {
      editAttempt(workKey, recording.id, prev => ({ ...prev,
        lessonVoiceError: error instanceof Error ? error.message : '原課口說無法儲存，可以重存這次的紀錄。',
      }))
    } finally {
      editAttempt(workKey, recording.id, prev => ({ ...prev, savingLessonVoice: false }))
    }
  }

  function wrapUp(recording: Attempt, said: Line[], transcriptConsent: string | null, finishedNormally: boolean) {
    const day = dayKey()
    driveLog('英文口說', said.map(l => ({ role: l.role === 'user' ? 'user' : NAME, text: l.text })), transcriptConsent)
    // One long answer (a Part 2 monologue arrives as one line) counts as much as a back-and-forth.
    const userLines = said.filter(l => l.role === 'user')
    const wordsPerTurn = userLines.map(l => l.text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0).filter(Boolean)
    const userWords = wordsPerTurn.reduce((total, count) => total + count, 0)
    const spoke = wordsPerTurn.length >= 2 || userWords >= 15
    const transcript = said.map(l => (l.role === 'user' ? '玄燁：' : NAME + '：') + l.text).join('\n')
    // Even one short sentence stays on screen, to correct and send by hand (「請 Claude 批改」).
    if (userLines.length) editAttempt(workKey, recording.id, prev => ({ ...prev, review: transcript }))
    if (!spoke) return
    // Speaking counts toward the week's balance of skills, whatever the mode.
    if (courseRecord && course) void saveLessonVoice(recording, { target: course.target, date: day, turns: wordsPerTurn.length, words: userWords })
    else update(prev => {
      const marked = packRef && packTask ? { ...prev.notes, [speakKey(packRef.unit, packRef.i)]: day }
        : nurse ? { ...prev.notes, [nurseSpeakKey(nurse.id)]: day }
        : card ? { ...prev.notes, [cueKey(card.id)]: day } : prev.notes
      return { ...prev, notes: logSkill(marked, 'speak', day) }
    })
    // A normal longer call can be graded here. A failed call leaves what was said for manual review.
    if (finishedNormally && pageOpen.current && tutorKey()) void grade(transcript, recording)
  }

  /** Claude's feedback on a transcript (the call's own, or the one he corrected). Only a complete reply counts: then
   *  the corrections go into review and onto the weak-point list; an error or a broken reply keeps the transcript and
   *  says what happened, so the same transcript can be sent again. */
  async function grade(transcript: string, recording: Attempt) {
    if (pending.has(recording.id) || !transcript.trim()) return
    pending.add(recording.id)
    editAttempt(workKey, recording.id, prev => ({ ...prev, noting: true, error: '' }))
    const controller = new AbortController()
    const wait = setTimeout(() => controller.abort(), 120_000)
    try {
      const raw = await askTutor((card ? part2FeedbackPrompt + '\n題目卡：' + card.topic : speakFeedbackPrompt(recording.focus, NAME)) + '\n' + memoryPrompt(memory.notes),
        [{ role: 'user', content: transcript }], controller.signal)
      controller.signal.throwIfAborted()
      clearTimeout(wait)
      const { clean, remember, forget } = extractMemory(raw)
      const fb = parseSpeakFeedback(clean)
      if (!speakFeedbackOk(fb, !!card)) throw new Error('Claude 的回饋格式不完整，這次不算，什麼都沒有記。可以用同一份逐字稿再批一次。')
      const day = dayKey()
      // Preserve each correction's status across regrading, including mistakes the learner already dismissed.
      const fixes = [...recording.fixes]
      const seen = new Set(fixes.map(f => f.key))
      const userTurns = learnerTurns(transcript)
      let unverifiedFixes = 0
      const fresh = fb.fixes.flatMap(f => {
        const key = sayIdentity(f.wrong)
        if (key && key === sayIdentity(f.en)) return []
        if (!key || !userTurns.some(turn => (' ' + turn + ' ').includes(' ' + key + ' '))) {
          unverifiedFixes++
          return []
        }
        if (seen.has(key)) return []
        seen.add(key)
        return [{ ...f, key }]
      })
      let error = ''
      if (fresh.length) {
        try {
          const saved: Fix[] = []
          await updateStoreNow(prev => {
            let next = prev
            for (const f of fresh) {
              const kept = keepFix(next, f, day)
              next = kept.state
              saved.push(kept.fix)
            }
            return next
          })
          fixes.push(...saved)
        } catch {
          fixes.push(...fresh.map(f => ({ ...f, status: 'unsaved' as const })))
          error = '這次的回饋已拿到，但修正句尚未存入複習。可以直接用下方按鈕再存一次。'
        }
      }
      if (remember.length || forget.length) memory.update(remember, forget)
      editAttempt(workKey, recording.id, prev => ({ ...prev, feedback: fb, fixes, unverifiedFixes, error }))
    } catch (e) {
      const reason = controller.signal.aborted ? '等不到 Claude 回覆。逐字稿已保留，可以手動再試。' : e instanceof Error ? e.message : String(e)
      editAttempt(workKey, recording.id, prev => ({ ...prev, error: reason }))
    } finally {
      clearTimeout(wait)
      pending.delete(recording.id)
      editAttempt(workKey, recording.id, prev => ({ ...prev, noting: false }))
    }
  }

  async function toggleFix(recording: Attempt, fix: Fix) {
    if (pending.has(recording.id)) return
    pending.add(recording.id)
    editAttempt(workKey, recording.id, prev => ({ ...prev, fixing: true, error: '' }))
    try {
      let updated = fix
      const shared = fix.cardId && recording.fixes.find(f => f.key !== fix.key && f.status === 'active' && sayIdentity(f.en) === sayIdentity(fix.en))
      await updateStoreNow(prev => {
        if (fix.status !== 'active') {
          const kept = keepFix(prev, fix, dayKey())
          updated = kept.fix
          return kept.state
        }
        const next = fix.cardId && !shared ? removeSayCard(prev, fix.en, fix.cardId) : prev
        updated = { ...fix, status: 'removed', cardId: undefined, weak: undefined }
        const tag = fix.tag ? normalizeLabel(fix.tag) : null
        const weak = tag && readWeak(next.notes).find(item => item.k === tag)
        return tag && fix.weak && weak && weakAfterRemoval({ ...weak, last: fix.weak.day, lastAt: fix.weak.at }, readRemoved(next.notes)[tag])
          ? { ...next, notes: easeWeak(next.notes, tag) } : next
      })
      editAttempt(workKey, recording.id, prev => ({ ...prev, fixes: prev.fixes.map(f =>
        f.key === fix.key ? updated : shared && f.key === shared.key ? { ...f, cardId: fix.cardId } : f) }))
    } catch (e) {
      editAttempt(workKey, recording.id, prev => ({ ...prev, error: e instanceof Error ? e.message : String(e) }))
    } finally {
      pending.delete(recording.id)
      editAttempt(workKey, recording.id, prev => ({ ...prev, fixing: false }))
    }
  }

  const live = status === 'live' || status === 'connecting'
  const statusText = status === 'connecting' ? '連線中…' : status === 'live'
    ? (who === 'her' ? NAME + ' 正在說' : who === 'you' ? '正在聽你說' : '輪到你說了')
    : '20 · Harvard Nursing'
  return <div className="sp-page">
    <section className={'sp-shell' + (live ? ' is-live' : '')}>
      <header className="sp-top">
        <div className="sp-who"><strong>{NAME}</strong><small><i className={'sp-dot ' + (status === 'live' ? 'on' : '')} />{statusText}</small></div>
        <button type="button" className="sp-gear" aria-label={settings ? '關閉設定' : '語音設定'} onClick={() => setSettings(!settings)} disabled={live}>
          {settings ? <X size={17} /> : <Settings2 size={17} />}
        </button>
      </header>

      <div className="sp-body">
        {lesson && !lessonUnavailable && <div className="sp-lesson">
          <small>{lessonDate && courseDate !== dayKey() ? '接續 ' + courseDate + ' 的課' : '今天這一堂'} · 單元 {lesson.unit}</small>
          <strong>{lesson.cando || lesson.title}</strong>
          <span>Emma 會照今天的句型跟你聊，講錯一兩個地方會請你再說一次。</span>
          {course && lessonDate && <a href={courseDone ? '#history/day-' + course.target : '#practice/resume-' + course.target}>
            {courseDone ? '查看這堂課的紀錄' : '回這堂課'}
          </a>}
          <a href="#speaking">改回一般聊天</a>
        </div>}
        {lessonUnavailable && <div className="sp-lesson">
          <strong role="status">{courseDate && lessonDate ? '這台裝置找不到 ' + courseDate + ' 的每日課紀錄' : '目前找不到可接續的每日課'}</strong>
          <span>可返回英文練習選課。若紀錄從另一台裝置同步過來，這頁會接上原本的口說練習。</span>
          <a href="#library">回到英文練習</a>
          <a href="#speaking">前往一般聊天</a>
        </div>}

        {packMode !== undefined && <div className="sp-lesson">
          <small>{packRef ? '單元 ' + packRef.unit + ' · 口說任務 ' + (packRef.i + 1) : '單元口說任務'}{pack && packRef ? ' · ' + unitTitle(packRef.unit).split(/[：（]/)[0] : ''}</small>
          {packTask ? <strong>{packTask.title}</strong> : packStatus !== 'ready' && <strong role="status">{sceneStatus[packStatus]}</strong>}
          {packTask && <span>{packTask.zh}</span>}
          {packStatus === 'failed' && <button type="button" className="sp-link" onClick={() => location.reload()}>重新下載口說教材</button>}
          <a href={'#library/unit/speak' + (packRef && hasPack(packRef.unit) ? '/' + packRef.unit : '')}>回到單元讀聽說寫</a>
        </div>}

        {nurseMode !== undefined && <div className="sp-lesson">
          <small>護理英文 · 演一段{nurse ? ' · ' + nurse.level : ''}</small>
          {nurse ? <strong lang="en">{nurse.title}</strong> : nurseStatus !== 'ready' && <strong role="status">{sceneStatus[nurseStatus]}</strong>}
          {nurse && <span>{nurse.scene}。你演 {nurse.you}，Emma {nurse.handoff ? "先演 " + nurse.emma + "，接著演 " + nurse.handoff.colleague : "演 " + nurse.emma}。她聽的是語音辨識的文字，不會評你的發音。</span>}
          {nurseStatus === 'failed' && <button type="button" className="sp-link" onClick={() => location.reload()}>重新下載口說教材</button>}
          <a href={nurse ? '#library/nlisten/' + nurse.id : '#library/nlisten'}>{nurse ? '回到這段聽力' : '回到護理聽力選一段'}</a>
        </div>}

        {topic && <div className="sp-lesson">
          <small>生活主題 {topic.topic.n} · {topic.topic.title}</small>
          <strong>{(topic.part === 'C' ? topic.topic.review.speak : topic.topic.speak).situation}</strong>
          <span>Emma 會演情境裡的另一個人。她聽的是語音辨識的文字，不會評你的發音。</span>
          <a href="#practice/normal">回到生活主題</a>
        </div>}

        {card && <div className="sp-lesson sp-cue">
          <small>雅思口說 Part 2 · 題目卡</small>
          <strong lang="en">{card.topic}</strong>
          <span lang="en">You should say:</span>
          <ul lang="en">{card.bullets.map(b => <li key={b}>{b}</li>)}</ul>
          <span lang="en">{card.explain}</span>
          {!live && status !== 'closed' && <>
            {!prepEnd ? <button type="button" onClick={() => {
              const now = Date.now()
              setTick(now)
              editCard(workKey, work => ({ ...work, prepEnd: now + 60000 }))
            }}>開始 1 分鐘準備</button>
              // The countdown is for the eyes; a screen reader hears only the start and the end (the status line below).
              : <p className="sp-timer" aria-hidden="true">{prepEnd > tick ? '準備時間剩 ' + Math.ceil((prepEnd - tick) / 1000) + ' 秒' : '準備時間到，按麥克風開始說'}</p>}
            <p className="sp-sr" role="status">{!prepEnd ? '' : prepEnd > tick ? '1 分鐘準備開始了' : '準備時間到，按麥克風開始說'}</p>
            {prepEnd && <label className="sp-prep">準備筆記（選填，只寫關鍵字）
              <textarea lang="en" rows={3} value={prepNotes} onChange={e => {
                const text = e.target.value
                editCard(workKey, work => ({ ...work, prepNotes: text }))
              }} placeholder="例如：grandma / nurse / hospital / kind" />
            </label>}
            <button type="button" className="sp-link" onClick={nextCard}>換一張題目卡</button>
            {prevCardId && <button type="button" className="sp-link" onClick={prevCard}>回上一張題目卡</button>}
          </>}
          {status === 'closed' && <button type="button" className="sp-link" onClick={nextCard}>下一張題目卡</button>}
          {status === 'closed' && prevCardId && <button type="button" className="sp-link" onClick={prevCard}>回上一張題目卡</button>}
          {status === 'live' && liveAt && <p className="sp-timer">{youFrom ? '從你開口算起 ' + clock(tick - youFrom) + ' · 實際出聲 ' + clock(youMs) : '等你開口才開始計時'} · 通話 {clock(tick - liveAt)}（Part 2 目標從開口算 1–2 分鐘，之後 Emma 會問 Part 3）</p>}
          <a href="#speaking">改回一般聊天</a>
        </div>}
        {wordChat && <div className="sp-lesson">
          <small>{wordChat.where} · {partNames[wordChat.part]} · 聊這個字</small>
          <strong lang="en">{wordChat.en.split('/').join(' / ')}</strong>
          {wordChat.zh && (wordChat.seen ? <span>{wordChat.zh}</span> : <details><summary>看中文意思</summary><span>{wordChat.zh}</span></details>)}
          <span>Emma 知道你在複習這個字，會找你用它說幾句；想問意思、用法，或這一輪的其他字{wordChat.others.length ? '（' + wordChat.others.join('、') + '）' : ''}，直接問她。</span>
          <a href={wordChatBack(wordChat)}>回到{wordChat.where}</a>
        </div>}
        {(topicUnavailable || wordUnavailable) && <div className="sp-lesson">
          <strong role="status">{topicUnavailable ? '找不到這個生活情境' : '找不到這張單字的口說題目'}</strong>
          <a href={topicUnavailable ? '#practice/normal' : '#library/words'}>{topicUnavailable ? '回到生活主題' : '回到單字複習'}</a>
          <a href="#speaking">前往一般聊天</a>
        </div>}
        {!card && !lesson && !topic && !packTask && !nurse && !wordChat && !sceneUnavailable && <div className="sp-links">
          <a className="sp-ielts-link" href="#speaking/gept">練全民英檢口說（朗讀、回答問題、看圖敘述）→</a>
          <a className="sp-ielts-link" href="#speaking/ielts">練雅思口說 Part 2 →</a>
        </div>}

        {settings && <div className="sp-settings">
          <label>OpenAI 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => { setKey(e.target.value); setKeyError('') }} placeholder="sk-..." /></label>
          <label>聲音<select value={voice} onChange={e => {
            setVoiceSaveFailed(!setVoiceName(e.target.value))
            setVoice(voiceName())
          }}>
            {voices.map(v => <option key={v} value={v}>{v}</option>)}
          </select></label>
          {voiceSaveFailed && <small role="alert">聲音設定沒有儲存，畫面已恢復這台裝置目前使用的聲音。</small>}
          <label className="sp-check"><input type="checkbox" checked={guard} onChange={e => {
            setGuardSaveFailed(!setEchoGuard(e.target.checked))
            setGuard(echoGuard())
          }} />
            <span>防回音：{NAME} 說話的時候先不收你的聲音<small>用喇叭時開著，她才不會聽到自己的聲音就停下來。戴耳機、想在她說話時插話，再關掉。</small></span></label>
          {guardSaveFailed && <small role="alert">防回音設定沒有儲存，畫面已恢復這台裝置目前使用的設定。</small>}
          <button type="button" onClick={saveVoiceKey}>儲存</button>
          {keyError && <small role="alert">{keyError}</small>}
          <small>語音用 OpenAI GPT-Live-1.1，說話中每分鐘約 US$0.05。金鑰只存在這台裝置。</small>
          <PairPaste need="voice" />
        </div>}

        <div className={'sp-wavebox' + (lines.length ? ' compact' : '')}>
          <VoiceWave levels={levels} live={status === 'live'} className="sp-wave" />
          <span className={'sp-tag you' + (who === 'you' ? ' on' : '')}>你</span>
          <span className={'sp-tag her' + (who === 'her' ? ' on' : '')}>{NAME}</span>
          {lines.length === 0 && !sceneUnavailable && <p className="sp-hint">{status === 'connecting' ? `正在打給 ${NAME}…` : live ? 'Say hi!' : '按下麥克風開始聊天'}</p>}
        </div>

        {lines.length > 0 && <div className="sp-stage" ref={log} aria-live="polite">
          {lines.map((l, i) => <div key={i} className={'sp-bubble ' + (l.role === 'user' ? 'me' : 'her')}>
            <p lang={l.role === 'user' ? undefined : 'en'}>{l.text}</p>
          </div>)}
        </div>}

        {error && <p className="sp-error" role="alert">{error}</p>}
      </div>
      <footer className="sp-bar">
        <button type="button" className={'sp-mic' + (live ? ' on' : '')}
          disabled={!live && (sceneUnavailable || noting || fixing)}
          onClick={() => live ? hangUp() : void start()} aria-label={live ? '結束通話' : '開始聊天'}>
          {live ? <Square size={18} fill="currentColor" /> : <Mic size={22} />}
        </button>
      </footer>
    </section>

    {!live && attempt && review && <section className="sp-notes sp-review">
      <strong>這次的逐字稿</strong>
      {attempt.savingLessonVoice && <p role="status">正在將口說存回原本的每日課……</p>}
      {attempt.lessonVoice && attempt.lessonVoiceError && <div>
        <p className="sp-error" role="alert">{attempt.lessonVoiceError}</p>
        <button type="button" className="pr-link" disabled={attempt.savingLessonVoice} onClick={() => {
          if (attempt.lessonVoice && !attempt.savingLessonVoice) void saveLessonVoice(attempt, attempt.lessonVoice)
        }}>重存這次的口說紀錄</button>
      </div>}
      <p>語音辨識聽錯的字可以先改，請保留每一段前面的名字。{noting ? '批改中……' : feedback ? '這份已經批改過了。' : '還沒批改。'}</p>
      <textarea rows={6} value={review} lang="en" spellCheck={false} autoComplete="off" readOnly={noting} onChange={e => {
        const text = e.target.value
        editAttempt(workKey, attempt.id, prev => ({ ...prev, review: text }))
      }} aria-label="這次的逐字稿" />
      {tutorKey() ? <div className="pr-actions"><button type="button" className="pr-main" disabled={noting || fixing || !review.trim()} onClick={() => void grade(review, attempt)}>
        {fbError ? '用同一份逐字稿再批一次' : feedback ? '改好了，再批一次' : '請 Claude 批改'}</button></div>
        : <p>連接 Claude 之後（設定 → 連接 Claude）就能批改這份逐字稿。</p>}
      {fbError && <p className="sp-error" role="alert">{fbError}</p>}
      {unverifiedFixes > 0 && <p role="status">有 {unverifiedFixes} 句修正對不到你在逐字稿裡說的話，已略過這些複習卡。</p>}
    </section>}

    {attempt && (noting || feedback) && <section className="sp-notes sp-feedback" aria-live="polite">
      <strong>這次聊天的回饋</strong>
      {noting ? <p>整理中……</p> : feedback && <>
        {feedback.used && attempt.focus.label && <div className="sp-fb-row">
          <small>這次的文法 · {attempt.focus.label}</small>
          <p>{feedback.used.n > 0 ? '你說對了 ' + feedback.used.n + ' 次' : '這次還沒用到，下次試著用一次看看'}{feedback.used.example && <> · <span lang="en">{feedback.used.example}</span></>}</p>
        </div>}
        {fixes.length > 0 && <div className="sp-fixes">
          <small>修正句會加入複習。同一句只留一張卡。語音辨識聽錯造成的「錯」，按移除就好。</small>
          {fixes.map(f => <div key={f.key} className={'sp-fix' + (f.status === 'removed' ? ' removed' : '')}>
            <div><s lang="en">{f.wrong}</s><b lang="en">{f.en}</b><span>{f.zh}・{f.why}{f.tag && normalizeLabel(f.tag) ? '（' + normalizeLabel(f.tag) + '）' : ''}</span></div>
            <button type="button" className={f.status === 'active' ? 'sp-fix-remove' : 'sp-fix-undo'} disabled={fixing} onClick={() => void toggleFix(attempt, f)}>
              {f.status === 'unsaved' ? '存到複習' : f.status === 'removed' ? '加回去' : f.cardId ? '移除' : '移除這次記錄'}
            </button>
          </div>)}
        </div>}
        {feedback.next && <div className="sp-fb-row">
          <small>下次可以用這句</small>
          <p><b lang="en">{feedback.next.en}</b>{feedback.next.zh && <span>{feedback.next.zh}</span>}</p>
          <button type="button" className="sp-fb-say" onClick={() => void speakEnglish(feedback.next!.en, state.settings.speechRate)}>念給我聽</button>
        </div>}
        {feedback.cheer && <p className="sp-cheer">{feedback.cheer}</p>}
        {feedback.rest && feedback.rest.split('\n').map((line, i) => line.trim() ? <p key={i}>{line}</p> : null)}
      </>}
    </section>}
  </div>
}

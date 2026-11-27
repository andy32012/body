import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Settings2, X } from 'lucide-react'
import { updateStoreNow, type AppState, type PageProps } from '../lib/store'
import { echoGuard, openaiKey, setEchoGuard, setOpenaiKey, setVoiceName, startVoice, voiceName, voices, type Line, type VoiceSession } from '../lib/voice'
import { EMMA, emmaInstructions, emmaOpening, emmaStudy, quietNudge } from '../lib/emmaPrompt'
import { askTutor, tutorKey } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import { dayKey } from '../lib/progress'
import { addSayCard, removeSayCard, sayIdentity } from '../lib/sayCards'
import { checkSequence } from '../lib/checks'
import { addWeak, easeWeak, labelOfUnit, normalizeLabel, readRemoved, readWeak, weakAfterRemoval, weakLinesEn } from '../lib/weakPoints'
import { parseSpeakFeedback, speakFeedbackOk, speakFeedbackPrompt, type SpeakFeedback, type SpeakFix } from '../lib/speakFeedback'
import { speakEnglish } from '../lib/tts'
import curriculum from '../data/curriculum.json'
import { emmaLesson, emmaLessonInstructions } from '../lib/emmaLesson'
import { topicById, topicInstructions, type TopicPart } from '../lib/topics'
import { cueKey, nextCueCard, part2FeedbackPrompt, part2Instructions, type CueCard } from '../lib/ieltsSpeaking'
import cueCards from '../data/cue-cards.json'
import { markLessonStep, promptFor, readLessonRecord, type Lesson } from '../lib/lesson'
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
type Attempt = {
  id: number
  focus: Focus
  lines: Line[]
  review: string
  fixes: Fix[]
  feedback?: SpeakFeedback
  noting?: boolean
  fixing?: boolean
  error?: string
}
type CardWork = { prepNotes?: string; prepEnd?: number; attempt?: Attempt }
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

export default function Speaking({ state, update, lessonMode = false, lessonDate, ieltsMode = false, topicMode, packMode, nurseMode, wordMode }: PageProps & { lessonMode?: boolean; lessonDate?: string; ieltsMode?: boolean; topicMode?: string; packMode?: string; nurseMode?: string; wordMode?: string }) {
  const memory = useMemory()
  // Lessons stay tied to the day they belong to, including when an older lesson is resumed.
  const [courseDate] = useState(() => lessonDate ?? dayKey())
  const [lesson, setLesson] = useState(() => lessonMode && (!lessonDate || readLessonRecord(state.notes, courseDate)) ? emmaLesson(state, courseDate) : null)
  useEffect(() => {
    // The lesson can arrive just after navigation, from a queued local save or from sync.
    if (lessonMode && lessonDate && !lesson && readLessonRecord(state.notes, courseDate)) {
      setLesson(emmaLesson(state, courseDate))
    }
  }, [courseDate, lesson, lessonDate, lessonMode, state])
  // "t1-B": role-play the speaking situation of a life topic.
  const [topic] = useState(() => {
    const [id, part] = (topicMode ?? '').split('-')
    const t = id ? topicById(id) : undefined
    return t && ['A', 'B', 'C'].includes(part) ? { topic: t, part: part as TopicPart } : null
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
  const lessonUnavailable = lessonMode && !lesson
  const sceneUnavailable = lessonUnavailable || (packMode !== undefined && !packTask) || (nurseMode !== undefined && !nurse)
  const packStatus = packRef ? packLoad.status : 'missing'
  const nurseStatus = nurseMode ? nurseLoad.status : 'missing'
  // From a word card: chat about that word; Emma knows the list, the drill and the other words of the round.
  const [wordChat] = useState(() => readWordChat(wordMode))
  const [task, setTask] = useState<string>()
  const [cardSkip, setCardSkip] = useState<string[]>([])
  // The card is chosen once and kept: the call, the notes, the transcript and the feedback all belong to it. Saving
  // the card as done must not swap the title above the feedback; only 換一張 / 下一張 moves on.
  const [cardId, setCardId] = useState(() => ieltsMode ? nextCueCard(cueCards as CueCard[], state.notes, [])?.id : undefined)
  const card = ieltsMode ? (cueCards as CueCard[]).find(c => c.id === cardId) ?? nextCueCard(cueCards as CueCard[], state.notes, cardSkip) : null
  // The request writes back to its own card and transcript, even if a different card is open.
  const [cardWork, setCardWork] = useState<Record<string, CardWork>>({})
  const workKey = card?.id ?? 'chat'
  const { prepNotes = '', prepEnd, attempt } = cardWork[workKey] ?? {}
  const { lines = [], review = '', noting = false, fixes = [], feedback, error: fbError, fixing = false } = attempt ?? {}
  function editCard(key: string, edit: (prev: CardWork) => CardWork) {
    setCardWork(prev => ({ ...prev, [key]: edit(prev[key] ?? {}) }))
  }
  function editAttempt(key: string, id: number, edit: (prev: Attempt) => Attempt) {
    setCardWork(prev => {
      const work = prev[key]
      if (work?.attempt?.id !== id) return prev
      return { ...prev, [key]: { ...work, attempt: edit(work.attempt) } }
    })
  }
  function moveCard(to: string | undefined, skip: string[]) {
    if (!card) return
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
  const [voice, setVoice] = useState(voiceName())
  const [guard, setGuard] = useState(echoGuard)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'closed'>('idle')
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
  const pending = useRef(new Set<number>())
  useEffect(() => () => { setup.current?.abort(); session.current?.stop() }, [])
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
    if (sceneUnavailable || setup.current || (attempt && pending.current.has(attempt.id))) return
    if (!openaiKey()) { setSettings(true); return }
    setError(''); setYouMs(0); setYouFrom(undefined); setLiveAt(undefined); setTick(Date.now())
    const mine = attempts.current.start()
    const recording: Attempt = { id: mine, focus, lines: [], fixes: [], review: '' }
    editCard(workKey, work => ({ ...work, attempt: recording }))
    const mineNow = () => attempts.current.isCurrent(mine)
    const controller = new AbortController()
    setup.current = controller
    let ended = false
    let said: Line[] = []
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
          editAttempt(workKey, mine, prev => ({ ...prev, lines: current }))
        },
        signal: controller.signal,
        onLevel: (her, you) => { if (mineNow()) levels.current = { her, you } },
        onState: (s, detail) => {
          if (!mineNow()) return
          setStatus(s)
          if (s === 'live') { const now = Date.now(); setLiveAt(now); setTick(now) }
          if (detail) setError(detail)
          if (s === 'closed' && !ended) {
            ended = true
            session.current = null
            setup.current = null
            setLiveAt(undefined)
            wrapUp(recording, said)
          }
        },
      })
      // Ended (or another call started) while it was connecting: this one is hung up, the newer one is left alone.
      if (controller.signal.aborted || !mineNow() || ended) { started.stop(); return }
      session.current = started
    } catch (e) {
      if (!mineNow()) return
      setup.current = null
      setStatus('idle')
      if (controller.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(/Permission|NotAllowed/i.test(msg) ? '麥克風被擋住了：按網址列左邊的圖示，把麥克風改成「允許」再試一次。' : msg)
    }
  }

  function wrapUp(recording: Attempt, said: Line[]) {
    const day = dayKey()
    driveLog('英文口說', said.map(l => ({ role: l.role === 'user' ? 'user' : NAME, text: l.text })))
    // One long answer (a Part 2 monologue arrives as one line) counts as much as a back-and-forth.
    const userLines = said.filter(l => l.role === 'user')
    const userWords = userLines.map(l => l.text).join(' ').split(/\s+/).filter(Boolean).length
    const spoke = userLines.length >= 2 || userWords >= 15
    const transcript = said.map(l => (l.role === 'user' ? '玄燁：' : NAME + '：') + l.text).join('\n')
    // Even one short sentence stays on screen, to correct and send by hand (「請 Claude 批改」).
    if (userLines.length) editAttempt(workKey, recording.id, prev => ({ ...prev, review: transcript }))
    if (!spoke) return
    // Speaking counts toward the week's balance of skills, whatever the mode.
    update(prev => {
      const marked = packRef && packTask ? { ...prev.notes, [speakKey(packRef.unit, packRef.i)]: day }
        : nurse ? { ...prev.notes, [nurseSpeakKey(nurse.id)]: day }
        : card ? { ...prev.notes, [cueKey(card.id)]: day } : prev.notes
      const notes = logSkill(marked, 'speak', day)
      const rec = lesson && readLessonRecord(notes, courseDate)
      return { ...prev, notes: lesson && rec && rec.unit === lesson.unit && rec.day === lesson.day
        ? markLessonStep(notes, courseDate, rec.unit, rec.day, 'express') : notes }
    })
    // A longer call is sent by itself, as before; a short one waits for his press.
    if (tutorKey()) void grade(transcript, recording)
  }

  /** Claude's feedback on a transcript (the call's own, or the one he corrected). Only a complete reply counts: then
   *  the corrections go into review and onto the weak-point list; an error or a broken reply keeps the transcript and
   *  says what happened, so the same transcript can be sent again. */
  async function grade(transcript: string, recording: Attempt) {
    if (pending.current.has(recording.id) || !transcript.trim()) return
    pending.current.add(recording.id)
    editAttempt(workKey, recording.id, prev => ({ ...prev, noting: true, error: '' }))
    try {
      const raw = await askTutor((card ? part2FeedbackPrompt + '\n題目卡：' + card.topic : speakFeedbackPrompt(recording.focus, NAME)) + '\n' + memoryPrompt(memory.notes),
        [{ role: 'user', content: transcript }])
      const { clean, remember, forget } = extractMemory(raw)
      const fb = parseSpeakFeedback(clean)
      if (!speakFeedbackOk(fb, !!card)) throw new Error('Claude 的回饋格式不完整，這次不算，什麼都沒有記。可以用同一份逐字稿再批一次。')
      const day = dayKey()
      // Preserve each correction's status across regrading, including mistakes the learner already dismissed.
      const fixes = [...recording.fixes]
      const seen = new Set(fixes.map(f => f.key))
      const fresh = fb.fixes.flatMap(f => {
        const key = sayIdentity(f.wrong) || sayIdentity(f.en) || f.wrong
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
      editAttempt(workKey, recording.id, prev => ({ ...prev, feedback: fb, fixes, error }))
    } catch (e) {
      editAttempt(workKey, recording.id, prev => ({ ...prev, error: e instanceof Error ? e.message : String(e) }))
    } finally {
      pending.current.delete(recording.id)
      editAttempt(workKey, recording.id, prev => ({ ...prev, noting: false }))
    }
  }

  async function toggleFix(recording: Attempt, fix: Fix) {
    if (pending.current.has(recording.id)) return
    pending.current.add(recording.id)
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
      pending.current.delete(recording.id)
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
        {lesson && <div className="sp-lesson">
          <small>{lessonDate && courseDate !== dayKey() ? '接續 ' + courseDate + ' 的課' : '今天這一堂'} · 單元 {lesson.unit}</small>
          <strong>{lesson.cando || lesson.title}</strong>
          <span>Emma 會照今天的句型跟你聊，講錯一兩個地方會請你再說一次。</span>
          {lessonDate && <a href={'#practice/resume-' + lessonDate}>回這堂課</a>}
          <a href="#speaking">改回一般聊天</a>
        </div>}
        {lessonUnavailable && <div className="sp-lesson">
          <strong role="status">{lessonDate ? '這台裝置找不到 ' + courseDate + ' 的每日課紀錄' : '目前找不到可接續的每日課'}</strong>
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
          {nurse && <span>{nurse.scene}。你演 {nurse.you}，Emma 演 {nurse.emma}。她聽的是語音辨識的文字，不會評你的發音。</span>}
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
        {!card && !lessonMode && !topic && packMode === undefined && nurseMode === undefined && !wordChat && <div className="sp-links">
          <a className="sp-ielts-link" href="#speaking/gept">練全民英檢口說（朗讀、回答問題、看圖敘述）→</a>
          <a className="sp-ielts-link" href="#speaking/ielts">練雅思口說 Part 2 →</a>
        </div>}

        {settings && <div className="sp-settings">
          <label>OpenAI 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => { setKey(e.target.value); setKeyError('') }} placeholder="sk-..." /></label>
          <label>聲音<select value={voice} onChange={e => { setVoice(e.target.value); setVoiceName(e.target.value) }}>
            {voices.map(v => <option key={v} value={v}>{v}</option>)}
          </select></label>
          <label className="sp-check"><input type="checkbox" checked={guard} onChange={e => { setGuard(e.target.checked); setEchoGuard(e.target.checked) }} />
            <span>防回音：{NAME} 說話的時候先不收你的聲音<small>用喇叭時開著，她才不會聽到自己的聲音就停下來。戴耳機、想在她說話時插話，再關掉。</small></span></label>
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
          onClick={() => live ? (session.current ? session.current.stop() : setup.current?.abort()) : void start()} aria-label={live ? '結束通話' : '開始聊天'}>
          {live ? <Square size={18} fill="currentColor" /> : <Mic size={22} />}
        </button>
      </footer>
    </section>

    {!live && attempt && review && <section className="sp-notes sp-review">
      <strong>這次的逐字稿</strong>
      <p>語音辨識聽錯的字可以先改，再請 Claude 批改。{noting ? '批改中……' : feedback ? '這份已經批改過了。' : '還沒批改。'}</p>
      <textarea rows={6} value={review} lang="en" spellCheck={false} autoComplete="off" readOnly={noting} onChange={e => {
        const text = e.target.value
        editAttempt(workKey, attempt.id, prev => ({ ...prev, review: text }))
      }} aria-label="這次的逐字稿" />
      {tutorKey() ? <div className="pr-actions"><button type="button" className="pr-main" disabled={noting || fixing || !review.trim()} onClick={() => void grade(review, attempt)}>
        {fbError ? '用同一份逐字稿再批一次' : feedback ? '改好了，再批一次' : '請 Claude 批改'}</button></div>
        : <p>連接 Claude 之後（設定 → 連接 Claude）就能批改這份逐字稿。</p>}
      {fbError && <p className="sp-error" role="alert">{fbError}</p>}
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

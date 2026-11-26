import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Settings2, X } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { echoGuard, openaiKey, setEchoGuard, setOpenaiKey, setVoiceName, startVoice, voiceName, voices, type Line, type VoiceSession } from '../lib/voice'
import { EMMA, emmaInstructions, emmaOpening, emmaStudy, quietNudge } from '../lib/emmaPrompt'
import { askTutor, tutorKey } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import { dayKey } from '../lib/progress'
import { addSayCard, hasSayCard, removeSayCard } from '../lib/sayCards'
import { addWeak, easeWeak, labelOfUnit, normalizeLabel, weakLinesEn } from '../lib/weakPoints'
import { parseSpeakFeedback, speakFeedbackPrompt, type SpeakFeedback, type SpeakFix } from '../lib/speakFeedback'
import { speakEnglish } from '../lib/tts'
import curriculum from '../data/curriculum.json'
import { emmaLesson, emmaLessonInstructions } from '../lib/emmaLesson'
import { topicById, topicInstructions, type TopicPart } from '../lib/topics'
import { cueKey, nextCueCard, part2FeedbackPrompt, part2Instructions, type CueCard } from '../lib/ieltsSpeaking'
import cueCards from '../data/cue-cards.json'
import { markLessonStep, promptFor, readLessonRecord, type Lesson } from '../lib/lesson'
import VoiceWave, { type Levels } from '../components/VoiceWave'
import { emmaLevel } from '../lib/cefr'
import { logSkill, packInstructions, speakKey, unitTitle, type Pack } from '../lib/bridge'
import { nurseInstructions, nurseSpeakKey, type NurseListening } from '../lib/nursing'
import { PairPaste } from '../components/PairDevice'
import { partNames, readWordChat, wordChatBack, wordChatInstructions } from '../lib/wordChat'
import './speaking.css'

const NAME = EMMA

/** added: put into review by itself; already: the same sentence was in review before; removed: taken out again. */
type Fix = SpeakFix & { status: 'added' | 'already' | 'removed' }
const clock = (ms: number) => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0')

export default function Speaking({ state, update, lessonMode = false, ieltsMode = false, topicMode, packMode, nurseMode, wordMode }: PageProps & { lessonMode?: boolean; ieltsMode?: boolean; topicMode?: string; packMode?: string; nurseMode?: string; wordMode?: string }) {
  const memory = useMemory()
  const [today] = useState(dayKey)
  const [lesson] = useState(() => lessonMode ? emmaLesson(state, today) : null)
  // "t1-B": role-play the speaking situation of a life topic.
  const [topic] = useState(() => {
    const [id, part] = (topicMode ?? '').split('-')
    const t = id ? topicById(id) : undefined
    return t && ['A', 'B', 'C'].includes(part) ? { topic: t, part: part as TopicPart } : null
  })
  // "43-0": the first speaking task of bridge unit 43's pack.
  const [packRef] = useState(() => { const m = (packMode ?? '').match(/^(\d+)-(\d+)$/); return m ? { unit: Number(m[1]), i: Number(m[2]) } : null })
  const [pack, setPack] = useState<Pack | null>(null)
  // The task or scene could not be downloaded: say so instead of 「還在載入」 forever.
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    if (!packRef) return
    let alive = true
    import('../data/bridge.json').then(f => { const p = (f.default as Pack[]).find(x => x.unit === packRef.unit); if (alive && p?.speak[packRef.i]) setPack(p) }).catch(() => { if (alive) setLoadFailed(true) })
    return () => { alive = false }
  }, [packRef])
  const packTask = pack && packRef ? pack.speak[packRef.i] : null
  // "nl-07": act out a nursing listening dialogue; Emma plays the other person.
  const [nurse, setNurse] = useState<NurseListening | null>(null)
  useEffect(() => {
    if (!nurseMode) return
    let alive = true
    import('../data/nursing-listening.json').then(f => { const l = (f.default as NurseListening[]).find(x => x.id === nurseMode); if (alive && l) setNurse(l) }).catch(() => { if (alive) setLoadFailed(true) })
    return () => { alive = false }
  }, [nurseMode])
  // From a word card: chat about that word; Emma knows the list, the drill and the other words of the round.
  const [wordChat] = useState(() => readWordChat(wordMode))
  const [task, setTask] = useState<string>()
  const [cardSkip, setCardSkip] = useState<string[]>([])
  // The card is chosen once and kept: the call, the notes, the transcript and the feedback all belong to it. Saving
  // the card as done must not swap the title above the feedback; only 換一張 / 下一張 moves on.
  const [cardId, setCardId] = useState(() => ieltsMode ? nextCueCard(cueCards as CueCard[], state.notes, [])?.id : undefined)
  const card = ieltsMode ? (cueCards as CueCard[]).find(c => c.id === cardId) ?? nextCueCard(cueCards as CueCard[], state.notes, cardSkip) : null
  function nextCard() {
    if (!card) return
    const skip = [...cardSkip, card.id]
    setCardSkip(skip); setCardId(nextCueCard(cueCards as CueCard[], state.notes, skip)?.id); setPrepEnd(undefined); setPrepNotes('')
    setLines([]); setFeedback(null); setStatus('idle')
  }
  const [prepEnd, setPrepEnd] = useState<number>()
  const [prepNotes, setPrepNotes] = useState('')
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
  const [voice, setVoice] = useState(voiceName())
  const [guard, setGuard] = useState(echoGuard)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'closed'>('idle')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const levels = useRef<Levels>({ her: 0, you: 0 })
  const [who, setWho] = useState<'' | 'her' | 'you'>('')
  const [feedback, setFeedback] = useState<SpeakFeedback | null>(null)
  const [noting, setNoting] = useState(false)
  const [fixes, setFixes] = useState<Fix[]>([])
  // The latest notes, for checking which corrections are already in review when the call ends.
  const notesRef = useRef(state.notes)
  notesRef.current = state.notes
  // The grammar this chat looks at: today's lesson in lesson mode, otherwise the unit he is on.
  const focusUnit = lesson?.unit ?? state.curriculum.unit
  const focusInfo = curriculum.units.find(u => u.unit === focusUnit)
  const focus = { label: labelOfUnit(focusUnit) ?? focusInfo?.title ?? '', rule: lesson?.rule ?? focusInfo?.rule ?? '' }
  const session = useRef<VoiceSession | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines

  // A call still being set up (permission dialog open, network not answered) is cancelled by 結束 or by leaving.
  const setup = useRef<AbortController | null>(null)
  useEffect(() => () => { setup.current?.abort(); session.current?.stop() }, [])
  // One wrap-up per call, however the call ended.
  const wrapped = useRef(false)
  // Keys that arrive from the computer (QR pairing) fill in here without a reload.
  useEffect(() => {
    const on = () => { setKey(openaiKey()); if (openaiKey()) setSettings(false) }
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

  async function start() {
    if (!openaiKey()) { setSettings(true); return }
    if (packRef && !packTask) { setError(loadFailed ? '口說任務沒有下載到：連上網路後重新整理這一頁。' : '口說任務還在載入，等一下再按。'); return }
    if (nurseMode && !nurse) { setError(loadFailed ? '這段情境沒有下載到：連上網路後重新整理這一頁。' : '情境還在載入，等一下再按。'); return }
    setError(''); setLines([]); setFeedback(null); setFixes([]); setYouMs(0); setYouFrom(undefined)
    setup.current?.abort()
    const controller = new AbortController()
    setup.current = controller
    wrapped.current = false
    const extra = card ? part2Instructions(card, prepNotes) : pack && packRef && packTask ? packInstructions(pack, packRef.i) : nurse ? nurseInstructions(nurse) : topic ? topicInstructions(topic.topic, topic.part) : lesson ? emmaLessonInstructions(lesson, task) : wordChat ? wordChatInstructions(wordChat) : ''
    try {
      session.current = await startVoice({
        // Everything but the IELTS test knows what his course has taught and corrects him by his rule.
        instructions: emmaInstructions(memory.notes, extra, emmaLevel(state.curriculum.unit), {
          // Role-plays (life topic, unit task, nursing scene) keep their own rule for mistakes.
          longTurn: !!card, ...(card ? {} : { study: emmaStudy(state.curriculum.unit, weakLinesEn(state.notes, today, 5), !(topic || packTask || nurse)) }),
        }),
        opening: emmaOpening(!!extra),
        // In IELTS Part 2 he talks alone for a minute or two and may stop to think: nobody hurries him there.
        quiet: card ? undefined : { afterMs: 10000, times: 2, say: quietNudge },
        // Not in Part 2 either: a "Mm-hm" from her would cut a hole in his long answer.
        guard: echoGuard() && !card,
        onLine: setLines,
        signal: controller.signal,
        onLevel: (her, you) => { levels.current = { her, you } },
        onState: (s, detail) => {
          setStatus(s)
          if (s === 'live') setLiveAt(Date.now())
          if (detail) setError(detail)
          if (s === 'closed') { session.current = null; if (!wrapped.current) { wrapped.current = true; void wrapUp() } }
        },
      })
      if (controller.signal.aborted) session.current?.stop()
    } catch (e) {
      setStatus('idle')
      if (controller.signal.aborted) return
      const msg = e instanceof Error ? e.message : String(e)
      setError(/Permission|NotAllowed/i.test(msg) ? '麥克風被擋住了：按網址列左邊的圖示，把麥克風改成「允許」再試一次。' : msg)
    }
  }

  async function wrapUp() {
    const said = linesRef.current
    driveLog('英文口說', said.map(l => ({ role: l.role === 'user' ? 'user' : NAME, text: l.text })))
    // One long answer (a Part 2 monologue arrives as one line) counts as much as a back-and-forth.
    const userLines = said.filter(l => l.role === 'user')
    const userWords = userLines.map(l => l.text).join(' ').split(/\s+/).filter(Boolean).length
    const spoke = userLines.length >= 2 || userWords >= 15
    if (!spoke) return
    // Speaking counts toward the week's balance of skills, whatever the mode.
    update(prev => {
      const marked = packRef && packTask ? { ...prev.notes, [speakKey(packRef.unit, packRef.i)]: today }
        : nurse ? { ...prev.notes, [nurseSpeakKey(nurse.id)]: today } : prev.notes
      return { ...prev, notes: logSkill(marked, 'speak', today) }
    })
    // The attempt is kept whether or not Claude is connected to give feedback.
    if (card) update(prev => ({ ...prev, notes: { ...prev.notes, [cueKey(card.id)]: today } }))
    if (lesson) update(prev => {
      const rec = readLessonRecord(prev.notes, today)
      return rec ? { ...prev, notes: markLessonStep(prev.notes, today, rec.unit, rec.day, 'express') } : prev
    })
    if (!tutorKey()) return
    setNoting(true)
    try {
      const transcript = said.map(l => (l.role === 'user' ? '玄燁：' : NAME + '：') + l.text).join('\n')
      const raw = await askTutor((card ? part2FeedbackPrompt + '\n題目卡：' + card.topic : speakFeedbackPrompt(focus, NAME)) + '\n' + memoryPrompt(memory.notes),
        [{ role: 'user', content: transcript }])
      const { clean, remember, forget } = extractMemory(raw)
      if (remember.length || forget.length) memory.update(remember, forget)
      const fb = parseSpeakFeedback(clean)
      const day = dayKey()
      // The corrections go into review by themselves (each can be taken out again), and onto the weak-point list.
      setFixes(fb.fixes.map(f => ({ ...f, status: hasSayCard(notesRef.current, f.en) ? 'already' : 'added' })))
      if (fb.fixes.length) update(prev => fb.fixes.reduce((next, f, i) => keepFix(next, f, day, i), prev))
      setFeedback(fb)
    } catch { /* feedback is optional */ }
    finally { setNoting(false) }
  }

  function keepFix<S extends Parameters<typeof addSayCard>[0]>(prev: S, f: SpeakFix, day: string, salt: number): S {
    const tag = f.tag ? normalizeLabel(f.tag) : null
    const next = addSayCard(prev, { zh: f.zh, en: f.en, wrong: f.wrong, why: f.why, from: 'emma', ...(tag ? { tag } : {}) }, day, String(salt))
    return tag ? { ...next, notes: addWeak(next.notes, tag, day, { w: f.wrong, r: f.en }, 'speak') } : next
  }
  function removeFix(i: number) {
    const f = fixes[i]
    const tag = f.tag ? normalizeLabel(f.tag) : null
    update(prev => { const next = removeSayCard(prev, f.en); return tag ? { ...next, notes: easeWeak(next.notes, tag) } : next })
    setFixes(list => list.map((x, j) => j === i ? { ...x, status: 'removed' } : x))
  }
  function restoreFix(i: number) {
    update(prev => keepFix(prev, fixes[i], dayKey(), i))
    setFixes(list => list.map((x, j) => j === i ? { ...x, status: 'added' } : x))
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

      {lesson && <div className="sp-lesson">
        <small>今天這一堂 · 單元 {lesson.unit}</small>
        <strong>{lesson.cando || lesson.title}</strong>
        <span>Emma 會照今天的句型跟你聊，講錯一兩個地方會請你再說一次。</span>
        <a href="#speaking">改回一般聊天</a>
      </div>}

      {packRef && <div className="sp-lesson">
        <small>單元 {packRef.unit} · 口說任務 {packRef.i + 1}{pack ? ' · ' + unitTitle(packRef.unit).split(/[：（]/)[0] : ''}</small>
        <strong>{packTask ? packTask.title : '載入中……'}</strong>
        {packTask && <span>{packTask.zh}</span>}
        <a href={'#library/unit/speak/' + packRef.unit}>回到單元讀聽說寫</a>
      </div>}

      {nurseMode && <div className="sp-lesson">
        <small>護理英文 · 演一段{nurse ? ' · ' + nurse.level : ''}</small>
        <strong lang="en">{nurse ? nurse.title : '載入中……'}</strong>
        {nurse && <span>{nurse.scene}。你演 {nurse.you}，Emma 演 {nurse.emma}。她聽的是語音辨識的文字，不會評你的發音。</span>}
        <a href={'#library/nlisten/' + (nurse?.id ?? '')}>回到這段聽力</a>
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
          {!prepEnd ? <button type="button" onClick={() => setPrepEnd(Date.now() + 60000)}>開始 1 分鐘準備</button>
            // The countdown is for the eyes; a screen reader hears only the start and the end (the status line below).
            : <p className="sp-timer" aria-hidden="true">{prepEnd > tick ? '準備時間剩 ' + Math.ceil((prepEnd - tick) / 1000) + ' 秒' : '準備時間到，按麥克風開始說'}</p>}
          <p className="sp-sr" role="status">{!prepEnd ? '' : prepEnd > tick ? '1 分鐘準備開始了' : '準備時間到，按麥克風開始說'}</p>
          {prepEnd && <label className="sp-prep">準備筆記（選填，只寫關鍵字）
            <textarea lang="en" rows={3} value={prepNotes} onChange={e => setPrepNotes(e.target.value)} placeholder="例如：grandma / nurse / hospital / kind" />
          </label>}
          <button type="button" className="sp-link" onClick={nextCard}>換一張題目卡</button>
        </>}
        {status === 'closed' && <button type="button" className="sp-link" onClick={nextCard}>下一張題目卡</button>}
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
      {!card && !lesson && !topic && !packRef && !nurseMode && !wordChat && <div className="sp-links">
        <a className="sp-ielts-link" href="#speaking/gept">練全民英檢口說（朗讀、回答問題、看圖敘述）→</a>
        <a className="sp-ielts-link" href="#speaking/ielts">練雅思口說 Part 2 →</a>
      </div>}

      {settings && <div className="sp-settings">
        <label>OpenAI 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="sk-..." /></label>
        <label>聲音<select value={voice} onChange={e => { setVoice(e.target.value); setVoiceName(e.target.value) }}>
          {voices.map(v => <option key={v} value={v}>{v}</option>)}
        </select></label>
        <label className="sp-check"><input type="checkbox" checked={guard} onChange={e => { setGuard(e.target.checked); setEchoGuard(e.target.checked) }} />
          <span>防回音：{NAME} 說話的時候先不收你的聲音<small>用喇叭時開著，她才不會聽到自己的聲音就停下來。戴耳機、想在她說話時插話，再關掉。</small></span></label>
        <button type="button" onClick={() => { setOpenaiKey(key); if (key.trim()) setSettings(false) }}>儲存</button>
        <small>語音用 OpenAI GPT-Live-1.1，說話中每分鐘約 US$0.05。金鑰只存在這台裝置。</small>
        <PairPaste need="voice" />
      </div>}

      <div className={'sp-wavebox' + (lines.length ? ' compact' : '')}>
        <VoiceWave levels={levels} live={status === 'live'} className="sp-wave" />
        <span className={'sp-tag you' + (who === 'you' ? ' on' : '')}>你</span>
        <span className={'sp-tag her' + (who === 'her' ? ' on' : '')}>{NAME}</span>
        {lines.length === 0 && <p className="sp-hint">{status === 'connecting' ? `正在打給 ${NAME}…` : live ? 'Say hi!' : '按下麥克風開始聊天'}</p>}
      </div>

      {lines.length > 0 && <div className="sp-stage" ref={log} aria-live="polite">
        {lines.map((l, i) => <div key={i} className={'sp-bubble ' + (l.role === 'user' ? 'me' : 'her')}>
          <p lang={l.role === 'user' ? undefined : 'en'}>{l.text}</p>
        </div>)}
      </div>}

      {error && <p className="sp-error" role="alert">{error}</p>}
      <footer className="sp-bar">
        <button type="button" className={'sp-mic' + (live ? ' on' : '')}
          onClick={() => live ? (session.current ? session.current.stop() : setup.current?.abort()) : void start()} aria-label={live ? '結束通話' : '開始聊天'}>
          {live ? <Square size={18} fill="currentColor" /> : <Mic size={22} />}
        </button>
      </footer>
    </section>

    {(noting || feedback) && <section className="sp-notes sp-feedback" aria-live="polite">
      <strong>這次聊天的回饋</strong>
      {noting ? <p>整理中……</p> : feedback && <>
        {feedback.used && focus.label && <div className="sp-fb-row">
          <small>這次的文法 · {focus.label}</small>
          <p>{feedback.used.n > 0 ? '你說對了 ' + feedback.used.n + ' 次' : '這次還沒用到，下次試著用一次看看'}{feedback.used.example && <> · <span lang="en">{feedback.used.example}</span></>}</p>
        </div>}
        {fixes.length > 0 && <div className="sp-fixes">
          <small>{fixes.filter(f => f.status !== 'removed').length} 句修正已經自動加進複習。語音辨識聽錯造成的「錯」，按移除就好。</small>
          {fixes.map((f, i) => <div key={i} className={'sp-fix' + (f.status === 'removed' ? ' removed' : '')}>
            <div><s lang="en">{f.wrong}</s><b lang="en">{f.en}</b><span>{f.zh}・{f.why}{f.tag && normalizeLabel(f.tag) ? '（' + normalizeLabel(f.tag) + '）' : ''}</span></div>
            {f.status === 'already' ? <small className="sp-fix-note">本來就在複習裡</small>
              : f.status === 'removed' ? <button type="button" className="sp-fix-undo" onClick={() => restoreFix(i)}>加回去</button>
              : <button type="button" className="sp-fix-remove" onClick={() => removeFix(i)}>移除</button>}
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

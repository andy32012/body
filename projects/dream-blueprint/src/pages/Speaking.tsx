import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Settings2, X } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { openaiKey, setOpenaiKey, setVoiceName, startVoice, voiceName, voices, type Line, type VoiceSession } from '../lib/voice'
import { askTutor, tutorKey } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import { dayKey } from '../lib/progress'
import { addSayCard } from '../lib/sayCards'
import { emmaLesson, emmaLessonInstructions } from '../lib/emmaLesson'
import { cueKey, nextCueCard, part2FeedbackPrompt, part2Instructions, type CueCard } from '../lib/ieltsSpeaking'
import cueCards from '../data/cue-cards.json'
import { markLessonStep, readLessonRecord } from '../lib/lesson'
import VoiceWave, { type Levels } from '../components/VoiceWave'
import { PairPaste } from '../components/PairDevice'
import './speaking.css'

const NAME = 'Emma'

function instructions(memory: string[], lesson = '') {
  return [
    `You are ${NAME}, a cute, cheerful 20-year-old American girl. You are a nursing student at Harvard, and you are a close friend of 玄燁 (call him by name or "hey you"). You two chat like good friends.`,
    'He is a nursing student in Taiwan. His English is around junior-high level and he wants to get better for IELTS and to work as a nurse in the US someday.',
    'This is casual everyday chat: your day, his day, classes, food, movies, weekend plans, nursing school life, little jokes. Be warm, playful and curious, use natural American expressions, laugh a little, react with feeling.',
    'Speak simple, clear English (A2–B1) a bit slowly. Keep your turns short, usually one or two sentences, and end with an easy question so he talks more.',
    'If he makes a mistake, casually say it back the right way inside your reply (like "Oh, you went to the night market? Nice!"), never lecture.',
    'If he gets stuck or uses Chinese, help with one short Traditional-Mandarin hint, then encourage him back into English.',
    'Start by greeting him like a friend you are happy to see.',
    lesson,
    memory.length ? 'Things you remember about him from before: ' + memory.join('; ') : '',
  ].filter(Boolean).join('\n')
}

type Fix = { wrong: string; en: string; zh: string; why: string; added?: boolean }

export default function Speaking({ state, update, lessonMode = false, ieltsMode = false }: PageProps & { lessonMode?: boolean; ieltsMode?: boolean }) {
  const memory = useMemory()
  const [today] = useState(dayKey)
  const [lesson] = useState(() => lessonMode ? emmaLesson(state, today) : null)
  const [task, setTask] = useState<string>()
  const [cardSkip, setCardSkip] = useState<string[]>([])
  const card = ieltsMode ? nextCueCard(cueCards as CueCard[], state.notes, cardSkip) : null
  const [prepEnd, setPrepEnd] = useState<number>()
  const [prepNotes, setPrepNotes] = useState('')
  const [liveAt, setLiveAt] = useState<number>()
  const [tick, setTick] = useState(Date.now())
  useEffect(() => { if (!prepEnd && !liveAt) return; const t = setInterval(() => setTick(Date.now()), 500); return () => clearInterval(t) }, [prepEnd, liveAt])
  useEffect(() => {
    if (!lesson) return
    let alive = true
    import('../data/lessons.json').then(f => { if (alive) setTask((f.default as { unit: number; prompt: { en: string } }[]).find(l => l.unit === lesson.unit)?.prompt.en) }).catch(() => {})
    return () => { alive = false }
  }, [lesson])
  const [key, setKey] = useState(openaiKey())
  const [settings, setSettings] = useState(!openaiKey())
  const [voice, setVoice] = useState(voiceName())
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'closed'>('idle')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const levels = useRef<Levels>({ her: 0, you: 0 })
  const [who, setWho] = useState<'' | 'her' | 'you'>('')
  const [notes, setNotes] = useState('')
  const [noting, setNoting] = useState(false)
  const [fixes, setFixes] = useState<Fix[]>([])
  const session = useRef<VoiceSession | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines

  useEffect(() => () => session.current?.stop(), [])
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
      setWho(her > 0.06 ? 'her' : you > 0.08 ? 'you' : '')
    }, 220)
    return () => clearInterval(t)
  }, [status])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }) }, [lines])

  async function start() {
    if (!openaiKey()) { setSettings(true); return }
    setError(''); setLines([]); setNotes(''); setFixes([])
    try {
      session.current = await startVoice({
        instructions: instructions(memory.notes, card ? part2Instructions(card, prepNotes) : lesson ? emmaLessonInstructions(lesson, task) : ''),
        onLine: setLines,
        onLevel: (her, you) => { levels.current = { her, you } },
        onState: (s, detail) => {
          setStatus(s)
          if (s === 'live') setLiveAt(Date.now())
          if (detail) setError(detail)
          if (s === 'closed') { session.current = null; void wrapUp() }
        },
      })
    } catch (e) {
      setStatus('idle')
      const msg = e instanceof Error ? e.message : String(e)
      setError(/Permission|NotAllowed/i.test(msg) ? '麥克風被擋住了：按網址列左邊的圖示，把麥克風改成「允許」再試一次。' : msg)
    }
  }

  async function wrapUp() {
    const said = linesRef.current
    driveLog('英文口說', said.map(l => ({ role: l.role === 'user' ? 'user' : NAME, text: l.text })))
    if (said.filter(l => l.role === 'user').length < 2 || !tutorKey()) return
    setNoting(true)
    try {
      const transcript = said.map(l => (l.role === 'user' ? '玄燁：' : NAME + '：') + l.text).join('\n')
      const raw = await askTutor(card ? part2FeedbackPrompt + '\n題目卡：' + card.topic + '\n' + memoryPrompt(memory.notes) : [
        `你是 ${NAME} 的口說小幫手。下面是玄燁剛剛跟美國朋友 ${NAME} 用英文聊天的逐字稿（語音辨識，可能有小錯字）。`,
        '用繁體中文、輕鬆的語氣給他很短的回饋，最多 3 行：一句鼓勵＋一個下次聊天可以用的句子。不要用 Markdown 標題。',
        '另外，把他說錯或不自然的句子（最多 3 句，沒有就不要寫）各寫成一行，格式固定為：[卡] 他說的原句 ||| 正確自然的英文 ||| 這句的中文意思 ||| 一句繁體中文原因',
        memoryPrompt(memory.notes),
      ].join('\n'), [{ role: 'user', content: transcript }])
      const { clean, remember, forget } = extractMemory(raw)
      if (card) update(prev => ({ ...prev, notes: { ...prev.notes, [cueKey(card.id)]: today } }))
      if (lesson) update(prev => {
        const rec = readLessonRecord(prev.notes, today)
        return rec ? { ...prev, notes: markLessonStep(prev.notes, today, rec.unit, rec.day, 'express') } : prev
      })
      if (remember.length || forget.length) memory.update(remember, forget)
      const found: Fix[] = []
      const text = clean.split('\n').filter(line => {
        const m = line.trim().match(/^\[卡\]\s*(.+?)\s*\|\|\|\s*(.+?)\s*\|\|\|\s*(.+?)\s*\|\|\|\s*(.+)$/)
        if (m) found.push({ wrong: m[1], en: m[2], zh: m[3], why: m[4] })
        return !m
      }).join('\n').trim()
      setFixes(found)
      setNotes(text)
    } catch { /* notes are optional */ }
    finally { setNoting(false) }
  }

  function addCard(i: number) {
    const f = fixes[i]
    update(prev => addSayCard(prev, { zh: f.zh, en: f.en, wrong: f.wrong, why: f.why, from: 'emma' }, dayKey(), String(i)))
    setFixes(list => list.map((x, j) => j === i ? { ...x, added: true } : x))
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

      {card && <div className="sp-lesson sp-cue">
        <small>雅思口說 Part 2 · 題目卡</small>
        <strong lang="en">{card.topic}</strong>
        <span lang="en">You should say:</span>
        <ul lang="en">{card.bullets.map(b => <li key={b}>{b}</li>)}</ul>
        <span lang="en">{card.explain}</span>
        {!live && status !== 'closed' && <>
          {!prepEnd ? <button type="button" onClick={() => setPrepEnd(Date.now() + 60000)}>開始 1 分鐘準備</button>
            : <p className="sp-timer">{prepEnd > tick ? '準備時間剩 ' + Math.ceil((prepEnd - tick) / 1000) + ' 秒' : '準備時間到，按麥克風開始說'}</p>}
          {prepEnd && <textarea lang="en" rows={3} value={prepNotes} onChange={e => setPrepNotes(e.target.value)} placeholder="只寫關鍵字，例如：grandma / nurse / hospital / kind" />}
          <button type="button" className="sp-link" onClick={() => { setCardSkip(s => [...s, card.id]); setPrepEnd(undefined); setPrepNotes('') }}>換一張題目卡</button>
        </>}
        {status === 'live' && liveAt && <p className="sp-timer">已經說了 {Math.floor((tick - liveAt) / 60000)}:{String(Math.floor((tick - liveAt) / 1000) % 60).padStart(2, '0')}（Part 2 目標 1–2 分鐘，之後 Emma 會問 Part 3）</p>}
        <a href="#speaking">改回一般聊天</a>
      </div>}
      {!card && !lesson && <a className="sp-ielts-link" href="#speaking/ielts">練雅思口說 Part 2 →</a>}

      {settings && <div className="sp-settings">
        <label>OpenAI 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="sk-..." /></label>
        <label>聲音<select value={voice} onChange={e => { setVoice(e.target.value); setVoiceName(e.target.value) }}>
          {voices.map(v => <option key={v} value={v}>{v}</option>)}
        </select></label>
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
          onClick={() => live ? session.current?.stop() : void start()} aria-label={live ? '結束通話' : '開始聊天'}>
          {live ? <Square size={18} fill="currentColor" /> : <Mic size={22} />}
        </button>
      </footer>
    </section>

    {(noting || notes) && <section className="sp-notes">
      <strong>這次聊天的小筆記</strong>
      {noting ? <p>整理中……</p> : notes.split('\n').map((line, i) => line.trim() ? <p key={i}>{line}</p> : null)}
      {fixes.length > 0 && <div className="sp-fixes">
        <small>要把這些句子加入明天的複習嗎？</small>
        {fixes.map((f, i) => <div key={i} className="sp-fix">
          <div><s lang="en">{f.wrong}</s><b lang="en">{f.en}</b><span>{f.zh}・{f.why}</span></div>
          <button type="button" disabled={f.added} onClick={() => addCard(i)}>{f.added ? '已加入' : '加入複習'}</button>
        </div>)}
      </div>}
    </section>}
  </div>
}

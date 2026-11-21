import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Settings2, X } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { openaiKey, setOpenaiKey, setVoiceName, startVoice, voiceName, voices, type Line, type VoiceSession } from '../lib/voice'
import { askTutor, tutorKey } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { driveLog } from '../lib/drive'
import './speaking.css'

const NAME = 'Emma'

function instructions(memory: string[]) {
  return [
    `You are ${NAME}, a cute, cheerful 20-year-old American girl. You are a nursing student at Harvard, and you are a close friend of 玄燁 (call him by name or "hey you"). You two chat like good friends.`,
    'He is a nursing student in Taiwan. His English is around junior-high level and he wants to get better for IELTS and to work as a nurse in the US someday.',
    'This is casual everyday chat: your day, his day, classes, food, movies, weekend plans, nursing school life, little jokes. Be warm, playful and curious, use natural American expressions, laugh a little, react with feeling.',
    'Speak simple, clear English (A2–B1) a bit slowly. Keep your turns short, usually one or two sentences, and end with an easy question so he talks more.',
    'If he makes a mistake, casually say it back the right way inside your reply (like "Oh, you went to the night market? Nice!"), never lecture.',
    'If he gets stuck or uses Chinese, help with one short Traditional-Mandarin hint, then encourage him back into English.',
    'Start by greeting him like a friend you are happy to see.',
    memory.length ? 'Things you remember about him from before: ' + memory.join('; ') : '',
  ].filter(Boolean).join('\n')
}

export default function Speaking(_: PageProps) {
  const memory = useMemory()
  const [key, setKey] = useState(openaiKey())
  const [settings, setSettings] = useState(!openaiKey())
  const [voice, setVoice] = useState(voiceName())
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'closed'>('idle')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [level, setLevel] = useState(0)
  const [notes, setNotes] = useState('')
  const [noting, setNoting] = useState(false)
  const session = useRef<VoiceSession | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines

  useEffect(() => () => session.current?.stop(), [])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }) }, [lines])

  async function start() {
    if (!openaiKey()) { setSettings(true); return }
    setError(''); setLines([]); setNotes('')
    try {
      session.current = await startVoice({
        instructions: instructions(memory.notes),
        onLine: setLines,
        onLevel: setLevel,
        onState: (s, detail) => {
          setStatus(s)
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
      const raw = await askTutor([
        `你是 ${NAME} 的口說小幫手。下面是玄燁剛剛跟美國朋友 ${NAME} 用英文聊天的逐字稿（語音辨識，可能有小錯字）。`,
        '用繁體中文、輕鬆的語氣給他很短的回饋，最多 5 行：一句鼓勵；最多 2 個可以說得更自然的地方，寫成「他說的 → 更自然的說法」；一個下次聊天可以用的句子。不要用 Markdown 標題。',
        memoryPrompt(memory.notes),
      ].join('\n'), [{ role: 'user', content: transcript }])
      const { clean, remember, forget } = extractMemory(raw)
      if (remember.length || forget.length) memory.update(remember, forget)
      setNotes(clean)
    } catch { /* notes are optional */ }
    finally { setNoting(false) }
  }

  const live = status === 'live' || status === 'connecting'
  const speaking = level > 0.04
  return <div className="sp-page">
    <section className="sp-shell">
      <header className="sp-top">
        <span className={'sp-avatar' + (live ? ' on' : '')} aria-hidden="true" />
        <div className="sp-who"><strong>{NAME}</strong><small>{status === 'connecting' ? '連線中…' : status === 'live' ? (speaking ? 'speaking…' : 'listening…') : '20 · Harvard Nursing · 你的美國朋友'}</small></div>
        <button type="button" className="sp-gear" aria-label={settings ? '關閉設定' : '語音設定'} onClick={() => setSettings(!settings)} disabled={live}>
          {settings ? <X size={18} /> : <Settings2 size={18} />}
        </button>
      </header>

      {settings && <div className="sp-settings">
        <label>OpenAI 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="sk-..." /></label>
        <label>聲音<select value={voice} onChange={e => { setVoice(e.target.value); setVoiceName(e.target.value) }}>
          {voices.map(v => <option key={v} value={v}>{v}</option>)}
        </select></label>
        <button type="button" onClick={() => { setOpenaiKey(key); if (key.trim()) setSettings(false) }}>儲存</button>
        <small>語音用 OpenAI GPT-Live-1.1，說話中每分鐘約 US$0.05。金鑰只存在這台裝置。</small>
      </div>}

      <div className="sp-stage" ref={log} aria-live="polite">
        {lines.length === 0
          ? <div className="sp-empty">
              <span className={'sp-orb' + (live ? ' on' : '')} style={{ transform: `scale(${1 + Math.min(level * 2.2, 0.35)})` }} aria-hidden="true" />
              <p>{status === 'connecting' ? `正在打給 ${NAME}…` : live ? 'Say hi!' : `按下麥克風，跟 ${NAME} 聊聊天`}</p>
            </div>
          : lines.map((l, i) => <div key={i} className={'sp-bubble ' + (l.role === 'user' ? 'me' : 'her')}>
              <p lang={l.role === 'user' ? undefined : 'en'}>{l.text}</p>
            </div>)}
      </div>

      {error && <p className="sp-error" role="alert">{error}</p>}
      <footer className="sp-bar">
        <button type="button" className={'sp-mic' + (live ? ' on' : '')} style={live ? { boxShadow: `0 0 0 ${4 + level * 40}px rgba(232,140,125,.18)` } : undefined}
          onClick={() => live ? session.current?.stop() : void start()} aria-label={live ? '結束通話' : '開始聊天'}>
          {live ? <Square size={20} fill="currentColor" /> : <Mic size={24} />}
        </button>
      </footer>
    </section>

    {(noting || notes) && <section className="sp-notes">
      <strong>這次聊天的小筆記</strong>
      {noting ? <p>整理中……</p> : notes.split('\n').map((line, i) => line.trim() ? <p key={i}>{line}</p> : null)}
    </section>}
  </div>
}

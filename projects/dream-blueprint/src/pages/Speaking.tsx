import { useEffect, useRef, useState } from 'react'
import { Mic, Square, KeyRound, Sparkles } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { openaiKey, setOpenaiKey, setVoiceName, startVoice, voiceName, voices, type Line, type VoiceSession } from '../lib/voice'
import { askTutor, tutorKey, tutorPersona } from '../lib/tutor'
import { extractMemory, memoryPrompt, useMemory } from '../lib/memory'
import { handoffText } from '../lib/handoff'
import { dayKey } from '../lib/progress'
import './speaking.css'

const topics = [
  { id: 'free', label: '自由聊天', brief: 'Chat freely about his day, school, and life. Ask easy follow-up questions.' },
  { id: 'intro', label: '自我介紹', brief: 'Help him practise introducing himself: name, school (nursing student in Taiwan), hobbies, his dream of becoming a US RN.' },
  { id: 'hospital', label: '醫院情境', brief: 'Role-play simple hospital English: he is the nurse, you are the patient. Greeting, asking about pain, taking vital signs, explaining simple care.' },
  { id: 'ielts1', label: '雅思 Part 1', brief: 'Act as a friendly IELTS speaking examiner for Part 1: ask one short everyday question at a time (home, study, food, weekends) and wait for his answer.' },
  { id: 'daily', label: '生活對話', brief: 'Practise everyday situations: ordering food, shopping, asking for directions, small talk with a classmate.' },
]

function persona() {
  if (tutorPersona() === 'teacher') return 'You are a warm, patient English speaking teacher.'
  return 'You are his younger sister, a brilliant Harvard Medical School student. Call him "哥哥" (gēge). You are sweet and a little playful-cute, sometimes teasing in a lovable way, but always a helpful tutor first. Keep it a cute sibling vibe, never romantic.'
}

export default function Speaking({ state }: PageProps) {
  const memory = useMemory()
  const [key, setKey] = useState(openaiKey())
  const [editing, setEditing] = useState(!openaiKey())
  const [voice, setVoice] = useState(voiceName())
  const [topic, setTopic] = useState(topics[0].id)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'closed'>('idle')
  const [error, setError] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [review, setReview] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const session = useRef<VoiceSession | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines

  useEffect(() => () => session.current?.stop(), [])
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }) }, [lines])

  async function start() {
    setError(''); setLines([]); setReview('')
    const t = topics.find(x => x.id === topic)!
    const instructions = [
      persona(),
      'You are his English speaking partner. He is a Taiwanese nursing student whose English is about junior-high level; he wants to pass IELTS and work as a registered nurse in the US.',
      'Speak mostly in simple, clear English, slowly, short sentences (A2–B1). Keep each turn short so he talks more than you.',
      'When he makes a mistake, first repeat his sentence the correct way naturally, then continue the conversation. Do not lecture.',
      'If he is stuck or speaks Chinese, help with a short Traditional-Mandarin hint, then encourage him to try again in English.',
      'Start by greeting him and opening the topic.',
      'Topic: ' + t.brief,
      memory.notes.length ? 'Things you remember about him: ' + memory.notes.join('; ') : '',
      'His learning progress (Chinese):\n' + handoffText(state, dayKey()).slice(0, 2500),
    ].filter(Boolean).join('\n')
    try {
      session.current = await startVoice({
        instructions,
        onLine: setLines,
        onState: (s, detail) => {
          setStatus(s)
          if (detail) setError(detail)
          if (s === 'closed') { session.current = null; void summarise() }
        },
      })
    } catch (e) {
      setStatus('idle')
      const msg = e instanceof Error ? e.message : String(e)
      setError(/Permission|NotAllowed/i.test(msg) ? '麥克風被擋住了：按網址列左邊的圖示，把麥克風改成「允許」再試一次。' : msg)
    }
  }

  async function summarise() {
    const said = linesRef.current
    if (said.filter(l => l.role === 'user').length < 2 || !tutorKey()) return
    setReviewing(true)
    try {
      const transcript = said.map(l => (l.role === 'user' ? '哥哥：' : '對方：') + l.text).join('\n')
      const raw = await askTutor([
        tutorPersona() === 'teacher' ? '你是英文口說老師。' : '你是玄燁的妹妹，哈佛醫學系，叫他哥哥，語氣可愛、偶爾撒嬌。',
        '下面是他剛剛的英文口說練習逐字稿（語音辨識，可能有小錯字）。用繁體中文給他簡短回饋：',
        '1. 一句鼓勵。2. 最多 3 個他說錯或可以說得更自然的地方，寫成「他說的 → 比較好的說法：一句原因」。3. 一個下次可以練的句子。',
        '不要用 Markdown 標題。',
        memoryPrompt(memory.notes),
      ].join('\n'), [{ role: 'user', content: transcript }])
      const { clean, remember, forget } = extractMemory(raw)
      if (remember.length || forget.length) memory.update(remember, forget)
      setReview(clean)
    } catch (e) { setReview('回饋產生失敗：' + (e instanceof Error ? e.message : String(e))) }
    finally { setReviewing(false) }
  }

  const live = status === 'live' || status === 'connecting'
  return <div className="sp-page">
    <header className="sp-head">
      <h1>英文口說</h1>
      <p>按下開始，直接用講的。對方會用簡單英文跟你聊，你講錯時會順口幫你改。講完按結束，會整理這次的回饋。</p>
    </header>

    {editing ? <section className="orbit-card sp-key">
      <h2><KeyRound size={18} aria-hidden="true" />連接 OpenAI 語音</h2>
      <p>語音用的是 OpenAI 的 GPT-Live-1.1。貼上 OpenAI 的 API 金鑰（platform.openai.com → API keys）。金鑰只存在這台裝置的瀏覽器裡。</p>
      <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="sk-..." aria-label="OpenAI API 金鑰" />
      <div className="sp-row">
        <button type="button" className="sp-main" onClick={() => { setOpenaiKey(key); setEditing(!key.trim()) }}>儲存</button>
        {openaiKey() && <button type="button" className="sp-link" onClick={() => { setKey(openaiKey()); setEditing(false) }}>取消</button>}
      </div>
    </section> : <>
      <section className="orbit-card sp-setup">
        <div className="sp-topics" role="group" aria-label="練習主題">
          {topics.map(t => <button type="button" key={t.id} aria-pressed={topic === t.id} disabled={live} onClick={() => setTopic(t.id)}>{t.label}</button>)}
        </div>
        <div className="sp-row sp-meta">
          <label>聲音 <select value={voice} disabled={live} onChange={e => { setVoice(e.target.value); setVoiceName(e.target.value) }}>
            {voices.map(v => <option key={v} value={v}>{v}</option>)}
          </select></label>
          <button type="button" className="sp-link" disabled={live} onClick={() => setEditing(true)}>更換 OpenAI 金鑰</button>
        </div>
        <button type="button" className={'sp-mic' + (live ? ' on' : '')} onClick={() => live ? session.current?.stop() : void start()}>
          {live ? <Square size={22} fill="currentColor" aria-hidden="true" /> : <Mic size={26} aria-hidden="true" />}
          <span>{status === 'connecting' ? '連線中…' : status === 'live' ? '結束' : '開始說話'}</span>
        </button>
        {status === 'live' && <p className="sp-hint"><i aria-hidden="true" />正在聽，直接開口就好</p>}
        {error && <p className="sp-error" role="alert">{error}</p>}
      </section>

      {lines.length > 0 && <section className="orbit-card sp-log" ref={log} aria-live="polite">
        {lines.map((l, i) => <div key={i} className={'sp-line sp-' + l.role}><small>{l.role === 'user' ? '你' : '對方'}</small><p lang={l.role === 'user' ? undefined : 'en'}>{l.text}</p></div>)}
      </section>}

      {(reviewing || review) && <section className="orbit-card sp-review">
        <h2><Sparkles size={17} aria-hidden="true" />這次的回饋</h2>
        {reviewing ? <p>整理中……</p> : review.split('\n').map((line, i) => line.trim() ? <p key={i}>{line}</p> : null)}
      </section>}
    </>}
    <p className="sp-cost">費用：說話中每分鐘約 US$0.05，從你的 OpenAI 額度扣。回饋用的是 Claude 金鑰。</p>
  </div>
}

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Mic, Square, Volume2 } from 'lucide-react'
import { engineNames, listen, listenEngine, type Listening } from '../lib/speech'
import { compareReading, missedWords, type ReadResult } from '../lib/readAloud'
import { speakEnglish, stopSpeaking } from '../lib/tts'
import { AudioActivityContext } from '../lib/audioActivity'
import './read-aloud.css'

/** 朗讀比對: read the text aloud, then see which words speech recognition did not catch. Honest about what it is:
 *  a word can be missed for many reasons, so there is no pronunciation score — only the words to listen to again. */
export default function ReadAloudCheck({ text, rate = 0.9, maxMs = 120000, hideText = false, onResult, compact = false }: {
  text: string; rate?: number; maxMs?: number
  /** Repeat-after-me: the sentence stays hidden until the result. */
  hideText?: boolean
  onResult?: (result: ReadResult, heard: string, seconds: number) => void
  compact?: boolean
}) {
  const [phase, setPhase] = useState<'idle' | 'listening' | 'working' | 'done'>('idle')
  const [partial, setPartial] = useState('')
  const [heard, setHeard] = useState('')
  const [result, setResult] = useState<ReadResult | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const session = useRef<Listening | null>(null)
  const [tick, setTick] = useState(0)
  // Leaving cancels the recording, also one whose microphone permission comes back only afterwards; one press asks once.
  const active = useRef<AbortController | null>(null)
  const sample = useRef<AbortController | null>(null)
  const audio = useContext(AudioActivityContext)
  useLayoutEffect(() => {
    setPhase('idle'); setPartial(''); setHeard(''); setResult(null); setError('')
    return () => {
      active.current?.abort()
      active.current = null
      session.current = null
      sample.current?.abort()
      sample.current = null
    }
  }, [text])
  useEffect(() => {
    if (phase !== 'listening') return
    const timer = setInterval(() => {
      const current = session.current
      if (!current) return
      setTick(Math.round(current.durationMs / 1000))
      if (!current.recording) setPhase('working')
    }, 500)
    return () => clearInterval(timer)
  }, [phase])
  const engine = listenEngine()
  if (!engine) return <p className="ra-note">這台裝置不能做朗讀比對：到「口說」頁的設定填 OpenAI 金鑰，或改用 Chrome、Safari。</p>

  async function start() {
    if (active.current) return
    const controller = new AbortController()
    const release = audio?.acquire(controller.signal)
    if (audio && !release) return
    // Another comparison on the same page can also have a word sample playing.
    stopSpeaking()
    sample.current = null
    active.current = controller
    setError(''); setPartial(''); setResult(null); setHeard(''); setTick(0)
    try {
      const s = await listen({ maxMs, onPartial: setPartial, signal: controller.signal })
      if (controller.signal.aborted) return
      if (release) void s.captured.then(release)
      session.current = s
      setPhase('listening')
      const words = await s.done
      if (controller.signal.aborted) return
      const secs = Math.round(s.durationMs / 1000)
      const r = compareReading(text, words)
      setHeard(words); setResult(r); setSeconds(secs); setPhase('done')
      // Silence leaves the question available for another recording.
      if (words.trim()) onResult?.(r, words, secs)
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('idle')
      }
    } finally {
      release?.()
      if (active.current === controller) {
        session.current = null
        active.current = null
      }
    }
  }
  function stop() { setPhase('working'); session.current?.stop() }
  function playSample(word: string) {
    if (active.current) return
    sample.current?.abort()
    const controller = new AbortController()
    const release = audio?.acquire(controller.signal)
    if (audio && !release) return
    sample.current = controller
    void speakEnglish(word, rate, controller.signal).finally(() => {
      if (sample.current === controller) sample.current = null
      release?.()
    })
  }

  const missed = result ? missedWords(result) : []
  return <div className={'ra-box' + (compact ? ' compact' : '')}>
    {(phase === 'idle' || phase === 'done') && <button type="button" className="ra-start" disabled={audio?.busy} onClick={() => void start()}><Mic size={15} />{result ? '再念一次' : '念念看，幫我比對'}</button>}
    {phase === 'listening' && <>
      <button type="button" className="ra-stop" onClick={stop}><Square size={13} fill="currentColor" />念完了</button>
      <small className="ra-live">錄音中 {tick} 秒{engine === 'browser' && partial ? '：' + partial : ''}</small>
    </>}
    {phase === 'working' && <small className="ra-live">比對中……</small>}
    {error && <p className="ra-error" role="alert">{error}</p>}
    {result && phase !== 'listening' && <div className="ra-result" role="status">
      {!heard ? <p>沒有聽到聲音。靠近麥克風一點，再念一次。</p> : <>
        <p className="ra-text" lang="en">{result.marks.map((m, i) => m.word ? <span key={i} className={m.heard ? 'ok' : 'miss'}>{m.text}</span> : <span key={i}>{m.text}</span>)}</p>
        <p className="ra-sum">聽出 {result.heard} / {result.total} 個字{seconds ? ' · ' + seconds + ' 秒' : ''}{result.ratio >= 0.95 ? '，很清楚' : ''}</p>
        {missed.length > 0 && <div className="ra-missed">
          <small>沒聽出來的字（點一下聽示範）：</small>
          {missed.slice(0, 12).map(w => <button key={w} type="button" lang="en" disabled={phase === 'working' || audio?.busy} onClick={() => playSample(w)}><Volume2 size={12} />{w}</button>)}
        </div>}
        {hideText && <p className="ra-heard"><small>辨識到的：</small><span lang="en">{heard}</span></p>}
        <small className="ra-note">這不是發音分數：用{engineNames[engine]}比對，沒聽出來可能是念不清楚、太小聲、漏念，也可能是辨識錯。同一個字常常沒聽出來，再聽示範念幾次。</small>
      </>}
    </div>}
  </div>
}

import { useState, useEffect, useRef } from 'react'

interface Props {
  english: string
  chinese: string
  rate?: number
  onSpoken?: () => void
}

export default function SpeechPractice(props: Props) {
  return <SentenceAudio key={props.english + props.chinese} {...props} />
}

function SentenceAudio({ english, chinese, rate = 0.85, onSpoken }: Props) {
  const [reading, setReading] = useState(false)
  const [spoken, setSpoken] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [phase, setPhase] = useState<'ready' | 'requesting' | 'recording' | 'skipped'>('ready')
  const [notice, setNotice] = useState('')
  const [clip, setClip] = useState('')
  const mic = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const url = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const generation = useRef(0)
  const speech = useRef<SpeechSynthesisUtterance | null>(null)
  const player = useRef<HTMLAudioElement | null>(null)

  function stopSpeech() {
    if (!speech.current) return
    speech.current.onend = null
    speech.current.onerror = null
    speech.current = null
    window.speechSynthesis?.cancel()
  }

  function releaseMic() {
    clearTimeout(timer.current)
    const active = recorder.current
    recorder.current = null
    if (active && active.state !== 'inactive') active.stop()
    mic.current?.getTracks().forEach(track => track.stop())
    mic.current = null
  }

  useEffect(() => () => {
    generation.current++
    releaseMic()
    stopSpeech()
    if (url.current) URL.revokeObjectURL(url.current)
  }, [])

  function readInstead() {
    stopSpeech()
    setSpeaking(false)
    setReading(true)
  }

  function speak() {
    stopSpeech()
    player.current?.pause()
    try {
      const phrase = new SpeechSynthesisUtterance(english)
      phrase.lang = 'en-US'
      phrase.rate = Number.isFinite(rate) ? Math.max(0.1, Math.min(10, rate)) : 0.85
      phrase.onend = () => { setSpeaking(false); speech.current = null }
      phrase.onerror = readInstead
      speech.current = phrase
      setSpeaking(true)
      window.speechSynthesis.speak(phrase)
    } catch {
      readInstead()
    }
  }

  function skipRecording(message = '已略過錄音，可以完成今天的練習。') {
    generation.current++
    releaseMic()
    setPhase('skipped')
    setNotice(message)
  }

  async function record() {
    if (phase === 'requesting' || phase === 'recording') return
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      skipRecording('這個瀏覽器目前無法錄音，直接念一句就好。')
      return
    }
    stopSpeech()
    player.current?.pause()
    setSpeaking(false)
    setNotice('')
    setPhase('requesting')
    const attempt = ++generation.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (attempt !== generation.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }
      mic.current = stream
      const session = new MediaRecorder(stream)
      recorder.current = session
      const chunks: Blob[] = []
      session.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data)
      }
      session.onerror = () => {
        if (generation.current === attempt) skipRecording('錄音已結束，直接念一句就好。')
      }
      session.onstop = () => {
        if (generation.current !== attempt) return
        releaseMic()
        if (chunks.length) {
          if (url.current) URL.revokeObjectURL(url.current)
          url.current = URL.createObjectURL(new Blob(chunks, { type: session.mimeType || chunks[0].type }))
          setClip(url.current)
          setNotice('按播放就能聽自己的聲音。')
        } else {
          setNotice('沒有錄到聲音，可以重新錄音或繼續練習。')
        }
        setPhase('ready')
      }
      session.start()
      setPhase('recording')
      timer.current = setTimeout(releaseMic, 30_000)
    } catch {
      if (attempt === generation.current) skipRecording('麥克風目前無法使用，直接念一句就好。')
    }
  }

  const micBusy = phase === 'requesting' || phase === 'recording'
  return (
    <section className="speech-practice" aria-label="同一句聽說練習">
      <h3>聽一次，跟著念一句</h3>
      <div className="speech-controls">
        <button type="button" disabled={micBusy || speaking} onClick={speak}>{speaking ? '朗讀中…' : '聽英文'}</button>
        <button type="button" onClick={readInstead}>沒有聲音，改用看的</button>
      </div>
      {reading && <blockquote><span lang="en">{english}</span><br />{chinese}</blockquote>}
      <button type="button" disabled={spoken} onClick={() => {
        setSpoken(true)
        onSpoken?.()
      }}>{spoken ? '已跟讀一次' : '我跟著說了一次'}</button>
      <p>想聽自己的發音時可以錄一句，最長 30 秒。</p>
      <div className="speech-controls">
        {phase === 'recording'
          ? <button type="button" onClick={releaseMic}>結束錄音</button>
          : <button type="button" onClick={record} disabled={micBusy}>
              {phase === 'requesting' ? '等待麥克風權限…' : clip ? '重新錄音' : '錄下我的聲音'}
            </button>}
        {phase !== 'skipped' && <button type="button" onClick={() => skipRecording()}>略過錄音</button>}
      </div>
      {notice && <p role="status">{notice}</p>}
      {clip && !micBusy && <audio ref={player} style={{ maxWidth: '100%' }} aria-label="回放自己的聲音" controls src={clip} />}
    </section>
  )
}

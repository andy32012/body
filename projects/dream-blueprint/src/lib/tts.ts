/** The device's own English voice, for a sentence that has no recording. */
function englishVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find(v => /^en[-_]US/i.test(v.lang) && /samantha|google|natural|aria|jenny/i.test(v.name))
    ?? voices.find(v => /^en[-_]US/i.test(v.lang)) ?? voices.find(v => /^en/i.test(v.lang))
}

/** Reads the text aloud and resolves when it ends (or right away when the device cannot speak). */
export async function speakEnglish(text: string, rate = 0.9, signal?: AbortSignal): Promise<void> {
  await speakEnglishResult(text, rate, signal)
}

export type PlaybackResult = 'played' | 'failed' | 'aborted'

/** For a flow that needs to know if the device really finished speaking before it continues. */
export function speakEnglishResult(text: string, rate = 0.9, signal?: AbortSignal): Promise<PlaybackResult> {
  return speakSequence(text, rate, 1, 0, signal)
}

export function speakEnglishTwice(text: string, rate: number, gap: number, signal: AbortSignal): Promise<PlaybackResult> {
  return speakSequence(text, rate, 2, gap, signal)
}

let stopActive: (() => void) | undefined

export function stopSpeaking() {
  if (stopActive) stopActive()
  else {
    try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ }
  }
}

async function speakSequence(text: string, rate: number, times: number, gap: number, signal?: AbortSignal): Promise<PlaybackResult> {
  if (signal?.aborted) return 'aborted'
  if (!text.trim()) return 'failed'
  stopSpeaking()
  const sequence = new AbortController()
  const stop = () => {
    sequence.abort()
    if (stopActive === stop) {
      try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ }
    }
  }
  stopActive = stop
  signal?.addEventListener('abort', stop, { once: true })
  try {
    for (let i = 0; i < times; i++) {
      if (i) await pause(gap, sequence.signal)
      if (sequence.signal.aborted) return 'aborted'
      const result = await speakOnce(text, rate, sequence.signal)
      if (sequence.signal.aborted) return 'aborted'
      if (result !== 'played') return result
    }
    return 'played'
  } finally {
    if (stopActive === stop) stopActive = undefined
    signal?.removeEventListener('abort', stop)
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const timer = setTimeout(finish, ms)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    if (signal.aborted) finish()
    else signal.addEventListener('abort', finish, { once: true })
  })
}

function speakOnce(text: string, rate: number, signal: AbortSignal): Promise<PlaybackResult> {
  return new Promise(resolve => {
    let limit: ReturnType<typeof setTimeout> | undefined
    let utterance: SpeechSynthesisUtterance | undefined
    function finish(result: PlaybackResult) {
      clearTimeout(limit)
      signal.removeEventListener('abort', abort)
      if (utterance) utterance.onend = utterance.onerror = null
      resolve(result)
    }
    const abort = () => finish('aborted')
    try {
      const synth = window.speechSynthesis
      if (!synth) { finish('failed'); return }
      const u = utterance = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = rate
      const v = englishVoice()
      if (v) u.voice = v
      // Some browsers emit no event when a voice is blocked. Cancel the stalled utterance and allow a retry.
      limit = setTimeout(() => {
        finish('failed')
        try { synth.cancel() } catch { /* nothing to stop */ }
      }, 2500 + text.length * 120 / rate)
      signal.addEventListener('abort', abort, { once: true })
      u.onend = () => finish('played')
      u.onerror = e => finish(e.error === 'canceled' || e.error === 'interrupted' ? 'aborted' : 'failed')
      synth.speak(u)
    } catch { finish('failed') }
  })
}

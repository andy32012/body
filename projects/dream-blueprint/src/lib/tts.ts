/** The device's own English voice, for a sentence that has no recording. */
function englishVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find(v => /^en[-_]US/i.test(v.lang) && /samantha|google|natural|aria|jenny/i.test(v.name))
    ?? voices.find(v => /^en[-_]US/i.test(v.lang)) ?? voices.find(v => /^en/i.test(v.lang))
}

/** Reads the text aloud and resolves when it ends (or right away when the device cannot speak). */
export async function speakEnglish(text: string, rate = 0.9, signal?: AbortSignal): Promise<void> {
  await speakSequence(text, rate, 1, 0, signal)
}

export function speakEnglishTwice(text: string, rate: number, gap: number, signal: AbortSignal): Promise<boolean> {
  return speakSequence(text, rate, 2, gap, signal)
}

let stopActive: (() => void) | undefined

export function stopSpeaking() {
  if (stopActive) stopActive()
  else {
    try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ }
  }
}

async function speakSequence(text: string, rate: number, times: number, gap: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false
  if (!text.trim()) return true
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
      if (sequence.signal.aborted) return false
      await speakOnce(text, rate, sequence.signal)
    }
    return !sequence.signal.aborted
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

function speakOnce(text: string, rate: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    let limit: ReturnType<typeof setTimeout> | undefined
    function finish() {
      clearTimeout(limit)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    try {
      const synth = window.speechSynthesis
      if (!synth) { finish(); return }
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = rate
      const v = englishVoice()
      if (v) u.voice = v
      // Some browsers never fire onend for a cancelled or blocked utterance: a time limit from the length keeps a
      // waiting caller (a question read twice before the answer time) from hanging.
      limit = setTimeout(finish, 2500 + text.length * 120 / rate)
      signal.addEventListener('abort', finish, { once: true })
      u.onend = u.onerror = finish
      synth.speak(u)
    } catch { finish() }
  })
}

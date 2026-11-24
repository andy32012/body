/** The device's own English voice, for a sentence that has no recording. */
function englishVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? []
  return voices.find(v => /^en[-_]US/i.test(v.lang) && /samantha|google|natural|aria|jenny/i.test(v.name))
    ?? voices.find(v => /^en[-_]US/i.test(v.lang)) ?? voices.find(v => /^en/i.test(v.lang))
}

/** Reads the text aloud and resolves when it ends (or right away when the device cannot speak). */
export function speakEnglish(text: string, rate = 0.9): Promise<void> {
  return new Promise(resolve => {
    try {
      const synth = window.speechSynthesis
      if (!synth || !text.trim()) { resolve(); return }
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'en-US'
      u.rate = rate
      const v = englishVoice()
      if (v) u.voice = v
      // Some browsers never fire onend for a cancelled or blocked utterance: a time limit from the length keeps a
      // waiting caller (a question read twice before the answer time) from hanging.
      const limit = setTimeout(resolve, 2500 + text.length * 120 / rate)
      u.onend = u.onerror = () => { clearTimeout(limit); resolve() }
      synth.speak(u)
    } catch { resolve() }
  })
}
export const stopSpeaking = () => { try { window.speechSynthesis?.cancel() } catch { /* nothing to stop */ } }

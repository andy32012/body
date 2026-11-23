import { useEffect, useRef, useState } from 'react'
import { clipSlug, packFile, pronLessons, pronVoices, type PronVoice } from './pronunciation'

/** A pack holds every clip of one lesson in one voice: 4 bytes (little-endian length of the index), the index as JSON
 *  { clip name: [offset, length] }, then the mp3 clips one after another. One request per lesson and voice instead of dozens. */
export function unpack(buf: ArrayBuffer): Map<string, Blob> {
  const size = new DataView(buf).getUint32(0, true)
  const index = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, size))) as Record<string, [number, number]>
  const start = 4 + size
  return new Map(Object.entries(index).map(([name, [offset, length]]) => [name, new Blob([buf.slice(start + offset, start + offset + length)], { type: 'audio/mpeg' })]))
}
async function fetchPack(lessonId: string, voice: PronVoice, signal?: AbortSignal) {
  const res = await fetch(new URL(packFile(lessonId, voice), document.baseURI), { signal })
  if (!res.ok) throw new Error('pack ' + res.status)
  return res.arrayBuffer()
}

/** Fetches every pack once so the service worker keeps them: the course then plays without a connection. */
export async function saveAllPacks(onProgress: (done: number, total: number) => void) {
  const all = pronLessons.flatMap(l => pronVoices.map(v => [l.id, v] as const))
  let done = 0
  onProgress(done, all.length)
  for (const [id, v] of all) { await fetchPack(id, v); onProgress(++done, all.length) }
}

export interface Take { text: string; voice: PronVoice }
type Clips = Partial<Record<PronVoice, Map<string, string>>>

/** Plays the recorded clips of one lesson. Clips are loaded when the lesson opens, so a tap can start the sound at once
 *  (iPad and iPhone only allow sound that starts inside the tap). Until a voice has loaded, or when it cannot be loaded,
 *  the device's own English voice reads the text instead. */
export function usePronPlayer(lessonId: string) {
  const [clips, setClips] = useState<Clips>({})
  const [missing, setMissing] = useState<PronVoice[]>([])
  const [now, setNow] = useState<Take | null>(null)
  const [deviceVoice, setDeviceVoice] = useState(false)
  const loaded = useRef<Clips>({})
  const player = useRef<HTMLAudioElement | null>(null)
  const run = useRef(0)

  useEffect(() => {
    const abort = new AbortController()
    const urls: string[] = []
    loaded.current = {}
    setClips({}); setMissing([]); setDeviceVoice(false)
    for (const voice of pronVoices) {
      fetchPack(lessonId, voice, abort.signal).then(buf => {
        if (abort.signal.aborted) return
        const map = new Map<string, string>()
        for (const [name, blob] of unpack(buf)) { const url = URL.createObjectURL(blob); urls.push(url); map.set(name, url) }
        loaded.current = { ...loaded.current, [voice]: map }
        setClips(loaded.current)
      }).catch(() => { if (!abort.signal.aborted) setMissing(list => [...list, voice]) })
    }
    return () => { abort.abort(); urls.forEach(u => URL.revokeObjectURL(u)) }
  }, [lessonId])

  function stop() {
    run.current++
    player.current?.pause()
    window.speechSynthesis?.cancel()
    setNow(null)
  }
  useEffect(() => stop, [])

  /** Plays the takes one after another. Returns false when nothing on this device can make sound. */
  function play(queue: Take[], rate = 1): boolean {
    stop()
    if (!queue.length) return true
    const id = ++run.current
    const audio = player.current ?? (player.current = new Audio())
    const step = (i: number) => {
      if (id !== run.current) return
      const take = queue[i]
      if (!take) { setNow(null); return }
      const next = () => { if (id === run.current) setTimeout(() => step(i + 1), 280) }
      const url = loaded.current[take.voice]?.get(clipSlug(take.text))
      setNow(take)
      if (url) {
        audio.onended = next
        audio.onerror = next
        audio.src = url
        audio.defaultPlaybackRate = rate
        audio.playbackRate = rate
        audio.play().catch(() => { if (id === run.current) setNow(null) })
        return
      }
      if (!('speechSynthesis' in window)) { setNow(null); return }
      // The device has one voice: when neither recording is there, the same words are not read twice in a row.
      const before = queue[i - 1]
      if (before && before.text === take.text && !loaded.current[before.voice]?.get(clipSlug(before.text))) { step(i + 1); return }
      setDeviceVoice(true)
      const u = new SpeechSynthesisUtterance(take.text)
      u.lang = 'en-US'
      u.rate = 0.85 * rate
      u.onend = next
      u.onerror = next
      window.speechSynthesis.speak(u)
    }
    const first = queue[0]
    if (!loaded.current[first.voice]?.get(clipSlug(first.text)) && !('speechSynthesis' in window)) return false
    step(0)
    return true
  }
  const ready = pronVoices.filter(v => clips[v])
  return { play, stop, now, ready, missing, deviceVoice, loading: ready.length + missing.length < pronVoices.length }
}

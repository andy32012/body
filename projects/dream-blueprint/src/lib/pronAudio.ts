import { useEffect, useRef, useState } from 'react'
import { clipSlug, packFile, pronVoices, type PronVoice } from './pronunciation'
import { appRelease, withAppRelease } from './appRelease'

/** A pack holds every clip of one lesson in one voice: 4 bytes (little-endian length of the index), the index as JSON
 *  { clip name: [offset, length] }, then the mp3 clips one after another. One request per lesson and voice instead of dozens. */
export function unpack(buf: ArrayBuffer): Map<string, Blob> {
  const size = new DataView(buf).getUint32(0, true)
  const index = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, size))) as Record<string, [number, number]>
  const start = 4 + size
  return new Map(Object.entries(index).map(([name, [offset, length]]) => [name, new Blob([buf.slice(start + offset, start + offset + length)], { type: 'audio/mpeg' })]))
}
async function fetchPack(lessonId: string, voice: PronVoice, signal?: AbortSignal) {
  const url = new URL(withAppRelease(packFile(lessonId, voice)), document.baseURI)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error('pack ' + res.status)
  return res.arrayBuffer()
}

export interface PackProgress { done: number; total: number }

/** Read and download the exact version's packs through the worker that serves them offline. */
export function offlinePacks(
  worker: ServiceWorker,
  download: boolean,
  signal: AbortSignal,
  onProgress?: (progress: PackProgress) => void,
): Promise<PackProgress> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return }
    const channel = new MessageChannel()
    let timer: ReturnType<typeof setTimeout>
    const close = () => {
      clearTimeout(timer)
      channel.port1.close()
      signal.removeEventListener('abort', abort)
    }
    const fail = (reason: unknown) => { close(); reject(reason) }
    const abort = () => fail(signal.reason)
    const wait = () => {
      clearTimeout(timer)
      timer = setTimeout(() => fail(new Error('離線服務暫時沒有回應，請稍後再試。')), download ? 120000 : 10000)
    }
    channel.port1.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        onProgress?.({ done: data.done, total: data.total })
        wait()
      } else if (data.type === 'complete') {
        close()
        resolve({ done: data.done, total: data.total })
      } else if (data.type === 'error') fail(new Error(data.message))
    }
    signal.addEventListener('abort', abort, { once: true })
    wait()
    try {
      worker.postMessage({ type: download ? 'SOUNDS_DOWNLOAD' : 'SOUNDS_STATUS', version: appRelease() }, [channel.port2])
    } catch { fail(new Error('離線服務正在切換，請稍後再試。')) }
  })
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

  /** Plays the takes one after another. Returns false when nothing on this device can make sound. `onSound` is called
   *  once sound really comes out (a recording starts playing, or the device voice starts or reaches the end), so a
   *  listening question can wait for it instead of opening on a play that failed. */
  function play(queue: Take[], rate = 1, onSound?: () => void): boolean {
    stop()
    if (!queue.length) return true
    const id = ++run.current
    let sounded = false
    const sound = () => { if (id === run.current && !sounded) { sounded = true; onSound?.() } }
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
        audio.onplaying = sound
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
      u.onstart = sound
      // Some engines never report the start; one that reached its end was heard.
      u.onend = () => { sound(); next() }
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

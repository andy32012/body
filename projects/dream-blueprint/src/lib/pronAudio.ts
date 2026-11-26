import { useEffect, useRef, useState } from 'react'
import { clipSlug, packFile, pronVoices, type PronVoice } from './pronunciation'
import { appRelease, withAppRelease } from './appRelease'
import { speakEnglishResult, type PlaybackResult } from './tts'

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

export interface Take { text: string; voice: PronVoice; recordingOnly?: boolean }
type Clips = Partial<Record<PronVoice, Map<string, string>>>

function playRecording(audio: HTMLAudioElement, url: string, rate: number, signal: AbortSignal): Promise<PlaybackResult> {
  return new Promise(resolve => {
    const failed = () => finish('failed')
    const aborted = () => finish('aborted')
    const limit = setTimeout(failed, 30000)
    let settled = false
    function finish(result: PlaybackResult) {
      if (settled) return
      settled = true
      clearTimeout(limit)
      audio.onended = audio.onerror = null
      signal.removeEventListener('abort', aborted)
      if (result !== 'played') audio.pause()
      resolve(result)
    }
    audio.onended = () => { if (audio.ended) finish('played') }
    audio.onerror = () => { if (audio.error) failed() }
    signal.addEventListener('abort', aborted, { once: true })
    try {
      audio.src = url
      audio.defaultPlaybackRate = rate
      audio.playbackRate = rate
      void audio.play().catch(failed)
    } catch { failed() }
  })
}

/** Plays the recorded clips of one lesson. Clips are loaded when the lesson opens, so a tap can start the sound at once
 *  (iPad and iPhone only allow sound that starts inside the tap). Until a voice has loaded, or when it cannot be loaded,
 *  the device's own English voice reads the text instead. */
export function usePronPlayer(lessonId: string) {
  const [clips, setClips] = useState<Clips>({})
  const [missing, setMissing] = useState<PronVoice[]>([])
  const [now, setNow] = useState<Take | null>(null)
  const [deviceVoice, setDeviceVoice] = useState(false)
  const [playbackFailed, setPlaybackFailed] = useState(false)
  const loaded = useRef<Clips>({})
  const player = useRef<HTMLAudioElement | null>(null)
  const playback = useRef<AbortController | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    const urls: string[] = []
    loaded.current = {}
    setClips({}); setMissing([]); setDeviceVoice(false); setNow(null); setPlaybackFailed(false)
    for (const voice of pronVoices) {
      fetchPack(lessonId, voice, abort.signal).then(buf => {
        if (abort.signal.aborted) return
        const map = new Map<string, string>()
        for (const [name, blob] of unpack(buf)) { const url = URL.createObjectURL(blob); urls.push(url); map.set(name, url) }
        loaded.current = { ...loaded.current, [voice]: map }
        setClips(loaded.current)
      }).catch(() => { if (!abort.signal.aborted) setMissing(list => [...list, voice]) })
    }
    return () => {
      abort.abort()
      const playing = playback.current
      playback.current = null
      playing?.abort()
      urls.forEach(u => URL.revokeObjectURL(u))
    }
  }, [lessonId])

  function stop() {
    const playing = playback.current
    playback.current = null
    playing?.abort()
    setNow(null)
  }

  /** A cancelled play leaves no result. A listening question counts only when its clip reaches the end. */
  async function play(queue: Take[], rate = 1): Promise<PlaybackResult> {
    stop()
    setPlaybackFailed(false)
    setDeviceVoice(false)
    if (!queue.length) return 'aborted'
    const controller = new AbortController()
    const { signal } = controller
    playback.current = controller
    let deviceText: string | null = null
    try {
      for (const [i, take] of queue.entries()) {
        if (signal.aborted) return 'aborted'
        const url = loaded.current[take.voice]?.get(clipSlug(take.text))
        // The device has one voice. A second missing recording of the same text would read identically.
        if (!url && !take.recordingOnly && deviceText === take.text) continue
        setNow(take)
        let result: PlaybackResult
        if (url) {
          const audio = player.current ?? (player.current = new Audio())
          deviceText = null
          result = await playRecording(audio, url, rate, signal)
        } else if (take.recordingOnly) {
          result = 'failed'
        } else {
          setDeviceVoice(true)
          deviceText = take.text
          result = await speakEnglishResult(take.text, 0.85 * rate, signal)
        }
        if (signal.aborted) return 'aborted'
        if (result !== 'played') {
          // If the device interrupted this still-current attempt, offer a retry.
          setPlaybackFailed(true)
          return 'failed'
        }
        if (i + 1 < queue.length) await new Promise(resolve => setTimeout(resolve, 280))
      }
      return signal.aborted ? 'aborted' : 'played'
    } catch {
      if (signal.aborted) return 'aborted'
      setPlaybackFailed(true)
      return 'failed'
    } finally {
      if (playback.current === controller) {
        playback.current = null
        setNow(null)
      }
    }
  }
  const ready = pronVoices.filter(v => clips[v])
  return { play, stop, now, ready, missing, deviceVoice, playbackFailed, loading: ready.length + missing.length < pronVoices.length }
}

import { useEffect, useRef, useState } from 'react'
import HanziWriter from 'hanzi-writer'
import hai from 'hanzi-writer-data/嗨.json'
import ge from 'hanzi-writer-data/哥.json'
import ni from 'hanzi-writer-data/你.json'
import hao from 'hanzi-writer-data/好.json'

/** Hand-drawn style animations for the 問問 Claude panel: a pencil draws a frame, writes, and doodles. */

function PencilShape() {
  // tip at (0,0), body pointing up-right
  return <g className="sk-pencil">
    <g transform="rotate(-38)">
      <path d="M0 0 L5 -9 L-5 -9 Z" fill="#f3d2b3" />
      <path d="M0 0 L1.8 -3.2 L-1.8 -3.2 Z" fill="#2b2b33" />
      <rect x="-5" y="-40" width="10" height="31" rx="1.5" fill="#e07a5f" />
      <rect x="-5" y="-40" width="3.3" height="31" fill="#f09a80" />
      <rect x="-5" y="-46" width="10" height="6" fill="#c9ccd6" />
      <rect x="-5" y="-52" width="10" height="6" rx="2.5" fill="#f2a7b8" />
    </g>
  </g>
}

const FRAME = 'M28 14 H292 Q306 14 306 28 V150 Q306 164 292 164 H28 Q14 164 14 150 V28 Q14 14 28 14 Z'
const CHARS: Record<string, CharData> = { 嗨: hai, 哥: ge, 你: ni, 好: hao }
type CharData = { strokes: string[]; medians: number[][][] }

/** A pencil draws a frame, then each character is written in real stroke order. */
export function SketchIntro({ text }: { text: string }) {
  const slots = useRef<(HTMLSpanElement | null)[]>([])
  const [underline, setUnderline] = useState(false)
  const parts = [...text]
  useEffect(() => {
    let alive = true
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const color = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e9ecf4'
    const writers = parts.map((ch, i) => {
      const el = slots.current[i]
      if (!el || !CHARS[ch]) return null
      el.innerHTML = ''
      return HanziWriter.create(el, ch, {
        width: 70, height: 70, padding: 2, strokeColor: color, radicalColor: color,
        showOutline: false, showCharacter: reduced, strokeAnimationSpeed: 4, delayBetweenStrokes: 30,
        charDataLoader: (c, onLoad) => onLoad(CHARS[c] as never),
      })
    })
    if (reduced) { setUnderline(true); return }
    const run = async () => {
      await new Promise(r => setTimeout(r, 1250))
      for (let i = 0; i < parts.length && alive; i++) {
        const w = writers[i]
        if (w) await new Promise<void>(r => w.animateCharacter({ onComplete: () => r() }))
        else { slots.current[i]?.classList.add('show'); await new Promise(r => setTimeout(r, 450)) }
      }
      if (alive) setUnderline(true)
    }
    void run()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])
  return <div className="sk-intro" aria-label={text}>
    <div className="sk-board">
      <svg viewBox="0 0 320 178" aria-hidden="true">
        <path className="sk-frame" d={FRAME} pathLength={1} />
        <path className="sk-frame sk-frame-2" d={FRAME} pathLength={1} transform="translate(2 1.5)" />
        <g className="sk-pen-wrap">
          <PencilShape />
          <animateMotion dur="1.1s" begin="0s" fill="freeze" path={FRAME} />
        </g>
      </svg>
      <div className="sk-words" aria-hidden="true">
        {parts.map((ch, i) => CHARS[ch]
          ? <span key={i} className="sk-char" ref={el => { slots.current[i] = el }} />
          : <span key={i} className="sk-tilde" ref={el => { slots.current[i] = el }}>
              <svg viewBox="0 0 40 20"><path d="M3 12 C9 2, 15 4, 20 10 S31 18, 37 6" pathLength={1} /></svg>
            </span>)}
      </div>
      {underline && <svg className="sk-under" viewBox="0 0 240 14" aria-hidden="true"><path d="M4 9 C60 13, 140 3, 236 8" pathLength={1} /></svg>}
    </div>
  </div>
}

export function SketchThinking() {
  const squiggle = 'M6 26 C16 6, 26 6, 30 22 S44 40, 52 20 S66 4, 74 22 S90 38, 98 18 S112 8, 118 24'
  return <svg className="sk-think" viewBox="0 0 124 40" aria-hidden="true">
    <path className="sk-squiggle" d={squiggle} pathLength={1} />
    <g>
      <g transform="scale(.62)"><PencilShape /></g>
      <animateMotion dur="1.6s" repeatCount="indefinite" path={squiggle} />
    </g>
  </svg>
}

export function PencilCaret() {
  return <svg className="sk-caret" width="18" height="22" viewBox="-12 -34 26 36" aria-hidden="true"><g transform="scale(.62)"><PencilShape /></g></svg>
}

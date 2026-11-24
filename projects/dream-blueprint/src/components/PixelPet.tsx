import { useEffect, useRef, useState } from 'react'
import './pet.css'

/** A small original pixel monster (lavender, two horns, a tail) that lives on the 問問 Claude button. */
const palette: Record<string, string> = {
  o: '#3d2a63', b: '#b79df4', l: '#e2d6ff', s: '#8f72e0', w: '#ffffff', p: '#24173d', c: '#ff9fc2', h: '#ffd98a', k: '#8f72e0', t: '#8f72e0',
}
// 18 × 14 pixels. Eyes (p/w) and the tail (t + its outline) are drawn as their own layers so they can move.
const art = [
  '....o......o......',
  '...oho....oho.....',
  '..oooooooooooo....',
  '.obbbbbbbbbbbbo...',
  'obllbbbbbbbbbbbo..',
  'obbbwpbbbbwpbbbo..',
  'obbbppbbbbppbbbo..',
  'obbbppbbbbppbbbo.o',
  'obccbbbbbbbbccbo.t',
  'obbbbbobbobbbbbo.t',
  'obsbbbboobbbbsbott',
  '.ossssssssssssoo..',
  '..kk.kk..kk.kk....',
  '..oo.oo..oo.oo....',
]
type Px = { x: number; y: number; c: string }
const pixels: Px[] = art.flatMap((row, y) => [...row].flatMap((c, x) => (c in palette ? [{ x, y, c }] : [])))
const isEye = (p: Px) => p.y >= 5 && p.y <= 7 && (p.c === 'p' || p.c === 'w')
const isTail = (p: Px) => p.x >= 16
const leg = (p: Px) => (p.y >= 12 ? (p.x <= 3 ? 1 : p.x <= 6 ? 2 : p.x <= 10 ? 3 : 4) : 0)

function Rects({ list, fill }: { list: Px[]; fill?: string }) {
  return <>{list.map(p => <rect key={p.x + '-' + p.y} x={p.x} y={p.y} width={1.02} height={1.02} fill={fill ?? palette[p.c]} />)}</>
}

/** The same pet, still, as a few paths (one per colour): light enough to sit on every word of a long list. */
const iconPaths = Object.entries(pixels.reduce<Record<string, string>>((m, p) => {
  m[p.c] = (m[p.c] ?? '') + 'M' + p.x + ' ' + p.y + 'h1v1h-1z'
  return m
}, {}))
export function PetIcon({ size = 22 }: { size?: number }) {
  return <svg className="pet-icon" width={size} height={size * 14 / 18} viewBox="0 0 18 14" shapeRendering="crispEdges" aria-hidden="true">
    {iconPaths.map(([c, d]) => <path key={c} d={d} fill={palette[c]} />)}
  </svg>
}

export type PetAction = 'idle' | 'look' | 'walk' | 'hop' | 'wag' | 'spin' | 'turn' | 'dance' | 'heart' | 'sleep' | 'surprise' | 'wave' | 'stretch'

export function PixelPet({ action = 'idle', size = 26 }: { action?: PetAction; size?: number }) {
  const body = pixels.filter(p => !isEye(p) && !isTail(p) && !leg(p))
  // Body colour under the eyes, so the eyes can glance sideways without leaving holes.
  const under = pixels.filter(isEye).map(p => ({ ...p, c: 'b' }))
  return <svg className={'pet pet--' + action} width={size} height={size * 19 / 20} viewBox="-1 -5 20 19" shapeRendering="crispEdges" aria-hidden="true">
    <g className="pet-root">
      <g className="pet-tail"><Rects list={pixels.filter(isTail)} /></g>
      <g className="pet-body"><Rects list={body} /><Rects list={under} /></g>
      {[1, 2, 3, 4].map(n => <g key={n} className={'pet-leg pet-leg' + n}><Rects list={pixels.filter(p => leg(p) === n)} /></g>)}
      <g className="pet-eyes"><Rects list={pixels.filter(isEye)} /></g>
      <g className="pet-lids"><rect x={4} y={7} width={2} height={0.9} fill={palette.p} /><rect x={10} y={7} width={2} height={0.9} fill={palette.p} /></g>
    </g>
    <g className="pet-fx pet-heart" fill="#ff6f9f"><rect x={7} y={-4} width={1} height={1} /><rect x={9} y={-4} width={1} height={1} /><rect x={6.5} y={-3.2} width={4} height={1} /><rect x={7} y={-2.4} width={3} height={1} /><rect x={8} y={-1.6} width={1} height={1} /></g>
    <g className="pet-fx pet-z" fill="#d9ccff"><rect x={13} y={-4.5} width={3} height={1} /><rect x={14} y={-3.5} width={1} height={1} /><rect x={13} y={-2.5} width={3} height={1} /><rect x={16.5} y={-6} width={2} height={0.7} /><rect x={17} y={-5.5} width={0.7} height={0.7} /><rect x={16.5} y={-5} width={2} height={0.7} /></g>
    <g className="pet-fx pet-bang" fill="#ffd98a"><rect x={16} y={-4} width={1} height={2.6} /><rect x={16} y={-1} width={1} height={0.9} /></g>
    <g className="pet-fx pet-note" fill="#9ed9c7"><rect x={15} y={-4} width={0.7} height={3} /><rect x={15} y={-4} width={2} height={0.7} /><rect x={13.8} y={-1.6} width={1.6} height={1.2} /></g>
  </svg>
}

const showNames: Partial<Record<PetAction, string>> = {
  wave: '嗨～揮揮手', hop: '跳！', spin: '轉圈圈', dance: '跳舞 ♪', wag: '搖尾巴', heart: '最喜歡你 ♡', turn: '轉身看看', look: '東張西望', stretch: '伸懶腰', surprise: '嚇一跳！',
}
const showcase: PetAction[] = ['wave', 'hop', 'spin', 'dance', 'wag', 'heart']
const idleMoves: PetAction[] = ['look', 'wag', 'walk', 'hop', 'turn', 'stretch']
const durations: Partial<Record<PetAction, number>> = { look: 1700, wag: 1300, walk: 1600, hop: 800, turn: 1000, stretch: 1300, surprise: 900, heart: 1300, spin: 900, dance: 1600, wave: 1300 }
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** The pet's life: breathes and blinks, does a small move now and then, naps when you are away,
 *  jumps when you start typing, and when touched grows big and shows its moves one by one. */
export function usePet(typing: boolean) {
  const [action, setActionState] = useState<PetAction>('idle')
  const [big, setBig] = useState(false)
  const now = useRef<PetAction>('idle')
  const busy = useRef(false)
  const lastSeen = useRef(Date.now())
  const timer = useRef<number | undefined>(undefined)
  function set(a: PetAction, back?: number) {
    now.current = a
    setActionState(a)
    window.clearTimeout(timer.current)
    if (back) timer.current = window.setTimeout(() => { if (now.current === a && !busy.current) set('idle') }, back)
  }

  useEffect(() => {
    if (reduced()) return
    const seen = () => {
      lastSeen.current = Date.now()
      if (now.current === 'sleep') set('surprise', durations.surprise)
    }
    window.addEventListener('pointermove', seen, { passive: true })
    window.addEventListener('keydown', seen)
    const tick = window.setInterval(() => {
      if (busy.current) return
      if (Date.now() - lastSeen.current > 45000) { if (now.current !== 'sleep') set('sleep'); return }
      if (now.current !== 'idle' || Math.random() > 0.35) return
      const move = idleMoves[Math.floor(Math.random() * idleMoves.length)]
      set(move, durations[move] ?? 1200)
    }, 3000)
    return () => {
      window.removeEventListener('pointermove', seen); window.removeEventListener('keydown', seen)
      window.clearInterval(tick); window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (typing && !busy.current && !reduced()) set('surprise', durations.surprise)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing])

  const hovering = useRef(false)
  const showTimer = useRef<number | undefined>(undefined)
  /** One move, grown big. With the mouse it stays big while hovered and shrinks the moment the mouse leaves. */
  function show(hover = false) {
    hovering.current = hover
    if (busy.current) return
    busy.current = true
    lastSeen.current = Date.now()
    setBig(true)
    const move: PetAction = reduced() ? 'idle' : showcase[Math.floor(Math.random() * showcase.length)]
    set(move)
    window.clearTimeout(showTimer.current)
    showTimer.current = window.setTimeout(() => {
      busy.current = false
      set('idle')
      if (!hovering.current) setBig(false)
    }, (durations[move] ?? 1000) + 150)
  }
  function hide() {
    hovering.current = false
    window.clearTimeout(showTimer.current)
    busy.current = false
    setBig(false)
    set('idle')
  }
  return { action, big, show, hide, label: big && action !== 'idle' ? showNames[action] ?? '' : '' }
}

/** The pet as a small icon (e.g. in the chat header): hover or tap makes it grow and do one move. */
export function HoverPet({ size = 24 }: { size?: number }) {
  const pet = usePet(false)
  return <span className={'pet-hover' + (pet.big ? ' big' : '')} aria-hidden="true"
    onPointerEnter={e => { if (e.pointerType === 'mouse') pet.show(true) }}
    onPointerLeave={e => { if (e.pointerType === 'mouse') pet.hide() }}
    onClick={e => { if ((e.nativeEvent as PointerEvent).pointerType !== 'mouse') pet.show(false) }}>
    <PixelPet action={pet.action} size={size} />
  </span>
}

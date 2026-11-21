import { useEffect, useRef, type MutableRefObject } from 'react'

/** Watercolor sound wave: blue (you) on the left, green (Emma) on the right; they swell with each voice
 *  and blend in the middle. The pointer bends the wave, and a click sends a ripple through it. */
export type Levels = { her: number; you: number }

const STOPS: [number, [number, number, number]][] = [
  [0, [58, 86, 255]], [0.38, [44, 150, 255]], [0.52, [34, 214, 230]], [0.66, [40, 226, 160]], [1, [86, 230, 96]],
]
function colorAt(x: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [x0, c0] = STOPS[i - 1], [x1, c1] = STOPS[i]
      const k = (x - x0) / (x1 - x0)
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]
    }
  }
  return STOPS[STOPS.length - 1][1]
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
const gauss = (x: number, mu: number, s: number) => Math.exp(-((x - mu) ** 2) / (2 * s * s))

type Particle = { x: number; off: number; v: number; r: number; seed: number; push: number }

export default function VoiceWave({ levels, live, className }: { levels: MutableRefObject<Levels>; live: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const liveRef = useRef(live)
  liveRef.current = live

  useEffect(() => {
    const el = canvas.current!
    const ctx = el.getContext('2d')!
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let W = 0, H = 0, dpr = 1, raf = 0, last = performance.now()
    const mouse = { x: 0.5, y: 0.5, active: false, strength: 0 }
    const ripples: { x: number; t0: number }[] = []
    const smooth = { her: 0, you: 0, wake: 0 }
    let phase = 0 // accumulated, so a change in speed never makes the wave jump
    const parts: Particle[] = Array.from({ length: 90 }, () => ({
      x: Math.random(), off: (Math.random() * 2 - 1), v: 0.012 + Math.random() * 0.03,
      r: 0.6 + Math.random() * 2.2, seed: Math.random() * 10, push: 0,
    }))

    const resize = () => {
      const box = el.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = box.width; H = box.height
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(el); resize()

    const local = (e: PointerEvent) => { const b = el.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height } }
    const onMove = (e: PointerEvent) => { const p = local(e); mouse.x = p.x; mouse.y = p.y; mouse.active = true }
    const onLeave = () => { mouse.active = false }
    const onDown = (e: PointerEvent) => { const p = local(e); ripples.push({ x: p.x, t0: performance.now() / 1000 }); if (ripples.length > 6) ripples.shift() }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now
      const t = now / 1000
      const lv = levels.current
      // ignore room noise, rise quickly when someone speaks, settle slowly
      const gate = (v: number) => Math.max(0, (v - 0.05) / 0.95)
      const herIn = gate(lv.her)
      const youIn = gate(lv.you) * (1 - Math.min(1, herIn * 2) * 0.7) // her voice leaking into the mic
      const follow = (cur: number, target: number) => cur + (target - cur) * (target > cur ? 0.22 : 0.05)
      smooth.her = follow(smooth.her, herIn)
      smooth.you = follow(smooth.you, youIn)
      smooth.wake += ((liveRef.current ? 1 : 0) - smooth.wake) * 0.04
      mouse.strength += ((mouse.active ? 1 : 0) - mouse.strength) * 0.08
      const idle = 0.16 + 0.05 * Math.sin(t * 0.9)
      const you = Math.min(1.05, idle * 0.7 + Math.sqrt(smooth.you) * 0.85)
      const her = Math.min(1.05, idle * 0.7 + Math.sqrt(smooth.her) * 0.85)
      const mid = H * 0.5

      // amplitude envelope across the width
      const env = (x: number) => {
        let a = you * gauss(x, 0.27, 0.24) + her * gauss(x, 0.73, 0.24)
        a += 0.25 * Math.min(you, her) * gauss(x, 0.5, 0.12) // the two meet in the middle
        a += 0.55 * mouse.strength * gauss(x, mouse.x, 0.09) * (1 - Math.min(1, Math.abs(mouse.y - 0.5) * 1.4))
        for (const r of ripples) {
          const age = t - r.t0
          const fade = Math.exp(-age * 1.3)
          a += 0.9 * fade * (gauss(x, r.x - age * 0.45, 0.05) + gauss(x, r.x + age * 0.45, 0.05))
        }
        return a * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, Math.max(0, x))) ** 0.7)
      }
      const speed = 1.1 + Math.sqrt(smooth.her) * 1.6 + Math.sqrt(smooth.you) * 1.6
      phase += speed * dt
      const wave = (x: number, i: number) => {
        const f = 0.45 + 0.55 * Math.sin(i * 1.7) ** 2
        const ph = i * 0.33
        const y = Math.sin(Math.PI * 2 * (1.6 * x) - phase + ph) + 0.35 * Math.sin(Math.PI * 2 * (3.4 * x) + phase * 0.7 - ph)
        const bend = mouse.strength * gauss(x, mouse.x, 0.1) * (mouse.y - 0.5) * H * 0.35
        return mid + y * Math.min(1.2, env(x)) * H * 0.3 * f + bend
      }

      ctx.clearRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'

      // watercolor clouds that follow the wave
      const blobs = 16
      for (let k = 0; k < blobs; k++) {
        const x = (k + 0.5) / blobs + 0.015 * Math.sin(t * 0.5 + k)
        const e = Math.min(1, env(x))
        const y = wave(x, 3) + Math.sin(t * 0.7 + k * 2.1) * H * 0.04
        const r = H * (0.15 + e * 0.26)
        const c = colorAt(x)
        const g = ctx.createRadialGradient(x * W, y, 0, x * W, y, r)
        g.addColorStop(0, rgba(c, 0.11 + e * 0.07))
        g.addColorStop(0.55, rgba(c, 0.04 + e * 0.03))
        g.addColorStop(1, rgba(c, 0))
        ctx.fillStyle = g
        ctx.beginPath(); ctx.ellipse(x * W, y, r * 1.5, r, 0, 0, Math.PI * 2); ctx.fill()
      }

      // fine strands
      const grad = ctx.createLinearGradient(0, 0, W, 0)
      for (const [s, c] of STOPS) grad.addColorStop(s, rgba(c, 1))
      const step = Math.max(4, W / 180)
      const strands = 20
      for (let i = 0; i < strands; i++) {
        ctx.beginPath()
        for (let px = 0; px <= W; px += step) {
          const y = wave(px / W, i)
          px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y)
        }
        ctx.strokeStyle = grad
        ctx.globalAlpha = 0.12 + 0.1 * Math.sin(i * 2.3) ** 2
        ctx.lineWidth = 1
        ctx.stroke()
      }
      // the bright core line
      ctx.globalAlpha = 0.95
      ctx.shadowColor = 'rgba(120,230,255,.8)'
      ctx.shadowBlur = 14
      ctx.lineWidth = 2.2
      ctx.beginPath()
      for (let px = 0; px <= W; px += step) {
        const y = wave(px / W, 0)
        px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0

      // particles drifting along the wave
      for (const p of parts) {
        p.x += p.v * dt * (0.6 + speed * 0.35)
        if (p.x > 1.02) { p.x = -0.02; p.off = Math.random() * 2 - 1 }
        const e = Math.min(1, env(p.x))
        let y = wave(p.x, 2) + p.off * H * (0.08 + e * 0.35)
        const dx = (p.x - mouse.x) * W, dy = y - mouse.y * H
        const d = Math.hypot(dx, dy)
        if (mouse.active && d < 80) p.push = Math.min(1, p.push + 0.12)
        else p.push *= 0.94
        y += p.push * Math.sign(dy || 1) * 26
        const c = colorAt(Math.min(1, Math.max(0, p.x)))
        ctx.globalAlpha = (0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + p.seed))) * (0.4 + e)
        ctx.fillStyle = rgba(c, 1)
        ctx.beginPath(); ctx.arc(p.x * W, y, p.r * (0.8 + e * 0.6), 0, Math.PI * 2); ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      while (ripples.length && t - ripples[0].t0 > 3) ripples.shift()
      if (!reduced) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf); ro.disconnect()
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
    }
  }, [levels])

  return <canvas ref={canvas} className={className} aria-hidden="true" />
}

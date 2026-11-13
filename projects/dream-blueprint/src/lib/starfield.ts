// Generated night skies for the daily word card. Each word draws its own sky from its spelling.
export function seedOf(text: string) {
  let n = 2166136261
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return n >>> 0
}
export function seededRandom(seed: number) {
  let a = seed || 1
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// Base sky, then two or three cloud colours.
const palettes: [string, string, string[]][] = [
  ['#05070f', '#0f1a3a', ['#6b5bd6', '#d86aa8', '#f4c589']],
  ['#04090d', '#0a2a33', ['#2fb8a6', '#4f7fe0', '#bfe8d8']],
  ['#0a0508', '#2a0f24', ['#e0527a', '#f09a5a', '#8a5bd6']],
  ['#03060c', '#101c2c', ['#5aa6f0', '#9bd0ff', '#e8e2ff']],
  ['#07060c', '#1c1438', ['#a07af0', '#5ad0e0', '#f0b8e0']],
  ['#080604', '#2a1a0c', ['#f0a04a', '#e0603a', '#ffe0a8']],
  ['#030809', '#0c2420', ['#4ad0a0', '#d0e86a', '#3a8ad0']],
  ['#06040a', '#22102e', ['#d05ae0', '#6a6af0', '#f08ab0']],
  ['#04070b', '#12223a', ['#e8c078', '#5a8ae0', '#c070d0']],
  ['#080508', '#2c1220', ['#f07090', '#f0c060', '#70c0e0']],
  ['#03050a', '#0a1430', ['#3a6af0', '#30c0d0', '#a0a0ff']],
  ['#070707', '#1e1e2a', ['#c8c8e8', '#8090d0', '#e0b090']],
]
/** Paints a sky into the canvas. The same seed always gives the same picture. */
export function paintSky(canvas: HTMLCanvasElement, seed: number) {
  const size = 720
  canvas.width = size; canvas.height = size
  const g = canvas.getContext('2d')
  if (!g) return
  const next = seededRandom(seed)
  const [deep, mid, clouds] = palettes[seed % palettes.length]
  const layout = Math.floor(seed / palettes.length) % 9
  const base = g.createLinearGradient(0, 0, size * (0.3 + next() * 0.7), size)
  base.addColorStop(0, deep); base.addColorStop(0.55 + next() * 0.3, mid); base.addColorStop(1, deep)
  g.fillStyle = base; g.fillRect(0, 0, size, size)

  g.globalCompositeOperation = 'lighter'
  const blobs = 6 + (layout % 3) * 2
  // Clouds follow a band whose angle depends on the layout, so skies differ in shape and not only in colour.
  const angle = (layout / 9) * Math.PI
  for (let i = 0; i < blobs; i++) {
    const along = (i / (blobs - 1) - 0.5) * size * 1.1
    const off = (next() - 0.5) * size * 0.45
    const x = size / 2 + Math.cos(angle) * along - Math.sin(angle) * off
    const y = size / 2 + Math.sin(angle) * along + Math.cos(angle) * off
    const r = size * (0.2 + next() * 0.26)
    const glow = g.createRadialGradient(x, y, 0, x, y, r)
    const colour = clouds[Math.floor(next() * clouds.length)]
    glow.addColorStop(0, colour + 'c8'); glow.addColorStop(0.45, colour + '5a'); glow.addColorStop(1, colour + '00')
    g.fillStyle = glow; g.fillRect(0, 0, size, size)
  }
  const stars = 170 + Math.floor(next() * 160)
  for (let i = 0; i < stars; i++) {
    const x = next() * size, y = next() * size, bright = next()
    const r = bright > 0.97 ? 2.2 : bright > 0.85 ? 1.3 : 0.7
    g.fillStyle = 'rgba(255,255,255,' + (0.35 + bright * 0.6).toFixed(2) + ')'
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    if (bright > 0.985) {
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1
      g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke()
    }
  }
  g.globalCompositeOperation = 'source-over'
  // Three layouts in nine carry a planet at the edge of the frame.
  if (layout % 3 === 1) {
    const r = size * (0.32 + next() * 0.3)
    const x = next() > 0.5 ? size + r * 0.35 : -r * 0.35
    const y = size * (0.55 + next() * 0.5)
    const body = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r)
    const tone = clouds[Math.floor(next() * clouds.length)]
    body.addColorStop(0, tone); body.addColorStop(0.6, mid); body.addColorStop(1, deep)
    g.fillStyle = body; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
  }
}

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

export function SketchIntro({ title, subtitle, cards }: { title: string; subtitle: string; cards: string[] }) {
  return <div className="sk-intro" aria-label={title + ' ' + subtitle}>
    <svg className="sk-board" viewBox="0 0 320 178" role="img" aria-hidden="true">
      <defs>
        <clipPath id="sk-clip-1"><rect className="sk-reveal sk-r1" x="30" y="40" height="60" width="260" /></clipPath>
        <clipPath id="sk-clip-2"><rect className="sk-reveal sk-r2" x="30" y="100" height="40" width="260" /></clipPath>
      </defs>
      <path className="sk-frame" d={FRAME} pathLength={1} />
      <path className="sk-frame sk-frame-2" d={FRAME} pathLength={1} transform="translate(2 1.5)" />
      <g clipPath="url(#sk-clip-1)">
        <text className="sk-write sk-w1" x="38" y="84">{title}</text>
      </g>
      <g clipPath="url(#sk-clip-2)">
        <text className="sk-write sk-w2" x="40" y="128">{subtitle}</text>
      </g>
      <path className="sk-underline" d="M40 95 C90 101, 150 90, 236 96" pathLength={1} />
      <g className="sk-pen-wrap">
        <PencilShape />
        <animateMotion dur="1.1s" begin="0s" fill="freeze" path={FRAME} keyPoints="0;1" keyTimes="0;1" calcMode="linear" />
        <animateMotion dur="0.35s" begin="1.1s" fill="freeze" path="M28 14 L40 84" />
        <animateMotion dur="1.2s" begin="1.45s" fill="freeze" path="M40 84 C90 76, 160 90, 236 82" />
        <animateMotion dur="0.3s" begin="2.65s" fill="freeze" path="M236 82 L42 126" />
        <animateMotion dur="1.1s" begin="2.95s" fill="freeze" path="M42 126 C110 120, 190 130, 270 124" />
        <animateMotion dur="0.6s" begin="4.05s" fill="freeze" path="M270 124 L330 30" />
      </g>
    </svg>
    {cards.length > 0 && <div className="sk-cards">
      {cards.map((c, i) => <span key={c} className="sk-card" style={{ animationDelay: 4.2 + i * 0.18 + 's', rotate: (i % 2 ? 2.5 : -2.5) + 'deg' }}>{c}</span>)}
    </div>}
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

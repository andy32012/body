import type { ReactNode } from 'react'

/** Simple drawn scenes for 看圖敘述: several people, each doing one clear thing, the way the test pictures are. */

type Pt = [number, number]
interface PersonProps {
  x: number; y: number; s?: number
  skin?: string; hair?: string; style?: 'short' | 'long' | 'bun' | 'bald' | 'pony'
  top: string; bottom: string; skirt?: boolean
  /** chair: sitting on a seat, shins down; ground: sitting cross-legged; bust: only the upper body (in bed). */
  sit?: boolean | 'ground' | 'bust'
  /** Hand positions, relative to the feet (a standing adult is 100 tall, the shoulders are at y = -70). */
  armL?: Pt; armR?: Pt
  glasses?: boolean
  children?: ReactNode
}
/** A person seen from the front, feet at (x, y). */
function Person({ x, y, s = 1, skin = '#f0c8a4', hair = '#2b2118', style = 'short', top, bottom, skirt, sit, armL = [-18, -40], armR = [18, -40], glasses, children }: PersonProps) {
  const hip = sit === 'ground' ? -14 : sit === 'bust' ? -10 : sit ? -34 : -40
  const shoulder = hip - 32
  const head = shoulder - 15
  return <g transform={`translate(${x} ${y}) scale(${s})`}>
    {sit === 'bust' ? null : sit === 'ground'
      ? <><rect x={-24} y={hip} width={48} height={13} rx={6.5} fill={bottom} /><ellipse cx={-22} cy={-2} rx={6} ry={3} fill="#3a3a44" /><ellipse cx={22} cy={-2} rx={6} ry={3} fill="#3a3a44" /></>
      : sit
      ? <><rect x={-14} y={hip - 2} width={28} height={10} rx={4} fill={bottom} /><rect x={-13} y={hip + 6} width={10} height={-hip - 6} rx={3} fill={bottom} /><rect x={3} y={hip + 6} width={10} height={-hip - 6} rx={3} fill={bottom} /></>
      : skirt
        ? <><path d={`M-13 ${hip - 4} L13 ${hip - 4} L18 ${hip + 18} L-18 ${hip + 18} Z`} fill={bottom} /><rect x={-10} y={hip + 18} width={6} height={-hip - 18} fill={skin} /><rect x={4} y={hip + 18} width={6} height={-hip - 18} fill={skin} /></>
        : <><rect x={-13} y={hip - 2} width={11} height={-hip + 2} rx={3} fill={bottom} /><rect x={2} y={hip - 2} width={11} height={-hip + 2} rx={3} fill={bottom} /></>}
    {(!sit || sit === true) && <><ellipse cx={-8} cy={-1} rx={7} ry={3} fill="#3a3a44" /><ellipse cx={8} cy={-1} rx={7} ry={3} fill="#3a3a44" /></>}
    <line x1={-12} y1={shoulder + 4} x2={armL[0]} y2={armL[1]} stroke={top} strokeWidth={8} strokeLinecap="round" />
    <line x1={12} y1={shoulder + 4} x2={armR[0]} y2={armR[1]} stroke={top} strokeWidth={8} strokeLinecap="round" />
    <rect x={-15} y={shoulder} width={30} height={hip - shoulder + 2} rx={9} fill={top} />
    <circle cx={armL[0]} cy={armL[1]} r={4} fill={skin} /><circle cx={armR[0]} cy={armR[1]} r={4} fill={skin} />
    <rect x={-4} y={head + 9} width={8} height={7} fill={skin} />
    {style === 'long' && <path d={`M-14 ${head - 2} Q0 ${head - 18} 14 ${head - 2} L15 ${head + 20} L-15 ${head + 20} Z`} fill={hair} />}
    <circle cx={0} cy={head} r={12} fill={skin} />
    {style === 'short' && <path d={`M-12 ${head - 1} Q-12 ${head - 14} 0 ${head - 14} Q12 ${head - 14} 12 ${head - 1} Q6 ${head - 8} -12 ${head - 1} Z`} fill={hair} />}
    {style === 'long' && <path d={`M-12 ${head - 2} Q0 ${head - 15} 12 ${head - 2} Q4 ${head - 9} -12 ${head - 2} Z`} fill={hair} />}
    {style === 'bun' && <><circle cx={0} cy={head - 14} r={6} fill={hair} /><path d={`M-12 ${head - 1} Q0 ${head - 16} 12 ${head - 1} Q0 ${head - 9} -12 ${head - 1} Z`} fill={hair} /></>}
    {style === 'pony' && <><path d={`M10 ${head - 6} Q20 ${head} 16 ${head + 14}`} stroke={hair} strokeWidth={5} fill="none" strokeLinecap="round" /><path d={`M-12 ${head - 1} Q0 ${head - 16} 12 ${head - 1} Q0 ${head - 9} -12 ${head - 1} Z`} fill={hair} /></>}
    {style === 'bald' && <path d={`M-12 ${head + 2} Q-13 ${head - 6} -9 ${head - 7} M12 ${head + 2} Q13 ${head - 6} 9 ${head - 7}`} stroke={hair} strokeWidth={4} fill="none" />}
    <circle cx={-4} cy={head} r={1.4} fill="#2a2a2a" /><circle cx={4} cy={head} r={1.4} fill="#2a2a2a" />
    <path d={`M-4 ${head + 5} Q0 ${head + 8} 4 ${head + 5}`} stroke="#9a4a3a" strokeWidth={1.3} fill="none" strokeLinecap="round" />
    {glasses && <g stroke="#333" strokeWidth={1.2} fill="none"><circle cx={-4.5} cy={head} r={3.4} /><circle cx={4.5} cy={head} r={3.4} /><line x1={-1.1} y1={head} x2={1.1} y2={head} /></g>}
    {children}
  </g>
}

function Ward() {
  return <>
    <rect width={640} height={400} fill="#e3f0ec" />
    <rect y={330} width={640} height={70} fill="#cfd6d8" />
    <g transform="translate(0 30)">
    {/* door with the doctor */}
    <rect x={18} y={92} width={92} height={208} fill="#f6f6f2" stroke="#b8c2c4" strokeWidth={3} />
    <Person x={64} y={298} skin="#e8b88f" hair="#2b2118" style="short" top="#ffffff" bottom="#5b6b7c" glasses armL={[-6, -50]} armR={[10, -52]}>
      <rect x={-14} y={-66} width={22} height={28} rx={2} fill="#c49a6c" stroke="#8a6a44" />
      <rect x={-11} y={-62} width={16} height={20} fill="#fffef8" />
      <line x1={8} y1={-52} x2={0} y2={-46} stroke="#1f3a8a" strokeWidth={2.4} />
    </Person>
    {/* clock at ten o'clock */}
    <circle cx={330} cy={62} r={24} fill="#fff" stroke="#6b7a80" strokeWidth={3} />
    <line x1={330} y1={62} x2={318} y2={55} stroke="#333" strokeWidth={3} strokeLinecap="round" />
    <line x1={330} y1={62} x2={330} y2={44} stroke="#333" strokeWidth={2} strokeLinecap="round" />
    {/* window and the daughter with flowers */}
    <rect x={470} y={60} width={140} height={120} fill="#bfe3ff" stroke="#f6f6f2" strokeWidth={8} />
    <line x1={540} y1={60} x2={540} y2={180} stroke="#f6f6f2" strokeWidth={6} />
    <Person x={566} y={300} skin="#f2cfae" hair="#3b2a1e" style="long" top="#e98aa6" bottom="#4b5a8a" skirt armL={[-6, -52]} armR={[8, -54]}>
      <g transform="translate(-2 -58)">
        <line x1={0} y1={0} x2={-6} y2={-16} stroke="#4c8a3c" strokeWidth={2} /><line x1={0} y1={0} x2={2} y2={-18} stroke="#4c8a3c" strokeWidth={2} /><line x1={0} y1={0} x2={9} y2={-14} stroke="#4c8a3c" strokeWidth={2} />
        <circle cx={-6} cy={-18} r={5} fill="#f2c94c" /><circle cx={2} cy={-21} r={5} fill="#eb5757" /><circle cx={10} cy={-16} r={5} fill="#bb6bd9" />
        <path d="M-6 -4 L8 -4 L4 6 L-3 6 Z" fill="#fff4d6" />
      </g>
    </Person>
    {/* IV pole */}
    <line x1={168} y1={110} x2={168} y2={300} stroke="#9aa4a8" strokeWidth={4} />
    <line x1={152} y1={110} x2={184} y2={110} stroke="#9aa4a8" strokeWidth={4} />
    <rect x={156} y={114} width={20} height={30} rx={5} fill="#d9f1ff" stroke="#8fbfd9" strokeWidth={2} />
    <path d="M166 144 Q200 200 268 214" stroke="#8fbfd9" strokeWidth={2} fill="none" />
    {/* bed and the patient sitting up */}
    <rect x={200} y={232} width={250} height={34} rx={6} fill="#ffffff" stroke="#b8c2c4" strokeWidth={3} />
    <rect x={204} y={266} width={8} height={36} fill="#9aa4a8" /><rect x={438} y={266} width={8} height={36} fill="#9aa4a8" />
    <rect x={200} y={170} width={14} height={100} rx={4} fill="#9aa4a8" />
    <rect x={216} y={176} width={56} height={30} rx={12} fill="#ffffff" stroke="#d6dde0" />
    <Person x={280} y={236} skin="#e8b88f" hair="#b8b8b8" style="bald" top="#a8d5c2" bottom="#a8d5c2" sit="bust" armL={[-18, -14]} armR={[28, -10]}>
      <rect x={11} y={-36} width={12} height={11} rx={2} fill="#2f4f6f" transform="rotate(-30 17 -30)" />
    </Person>
    <rect x={226} y={222} width={226} height={30} rx={10} fill="#eaf4fb" stroke="#c9dce8" />
    {/* the nurse taking his blood pressure */}
    <Person x={352} y={300} skin="#f2cfae" hair="#1d1612" style="bun" top="#9cc9e8" bottom="#9cc9e8" armL={[-42, -74]} armR={[-10, -46]}>
      <path d="M-8 -66 Q0 -54 8 -66" stroke="#444" strokeWidth={1.8} fill="none" /><circle cx={0} cy={-54} r={2.4} fill="#555" />
      <ellipse cx={-10} cy={-44} rx={5} ry={6} fill="#2f4f6f" />
    </Person>
    <path d="M300 211 Q318 250 342 254" stroke="#2f4f6f" strokeWidth={2} fill="none" />
    {/* bedside table: water and fruit */}
    <rect x={458} y={250} width={56} height={50} fill="#d9b48a" />
    <rect x={464} y={232} width={10} height={18} fill="#d9f1ff" stroke="#8fbfd9" />
    <path d="M482 244 L510 244 L506 250 L486 250 Z" fill="#b07a4a" />
    <circle cx={490} cy={240} r={6} fill="#eb5757" /><circle cx={501} cy={239} r={6} fill="#f2994a" /><circle cx={496} cy={233} r={5} fill="#6fcf97" />
    </g>
  </>
}

function Park() {
  return <>
    <rect width={640} height={400} fill="#bfe6ff" />
    <circle cx={580} cy={56} r={30} fill="#ffd95a" />
    <g fill="#ffffff"><ellipse cx={130} cy={60} rx={42} ry={16} /><ellipse cx={160} cy={50} rx={30} ry={16} /><ellipse cx={380} cy={42} rx={36} ry={13} /></g>
    <rect y={190} width={640} height={210} fill="#8ed081" />
    <path d="M0 380 Q240 300 380 330 T640 290 L640 330 Q470 350 400 368 T0 400 Z" fill="#ead9b2" />
    {/* kite */}
    <path d="M300 60 L318 84 L300 112 L282 84 Z" fill="#eb5757" stroke="#b33" strokeWidth={1.5} />
    <path d="M300 112 Q296 124 304 134 Q296 144 302 152" stroke="#555" strokeWidth={1.4} fill="none" />
    <path d="M300 112 Q330 190 352 222" stroke="#555" strokeWidth={1} fill="none" />
    <Person x={360} y={268} skin="#f0c8a4" hair="#2b2118" style="short" top="#2d9cdb" bottom="#4f4f4f" armL={[-8, -86]} armR={[16, -46]} s={0.85} />
    {/* picnic */}
    <path d="M60 290 L250 290 L280 350 L30 350 Z" fill="#5b8def" />
    <g stroke="#ffffff" strokeWidth={5} opacity={0.75}><line x1={100} y1={290} x2={86} y2={350} /><line x1={150} y1={290} x2={150} y2={350} /><line x1={200} y1={290} x2={214} y2={350} /><line x1={45} y1={318} x2={265} y2={318} /></g>
    <Person x={96} y={330} skin="#e8b88f" hair="#2b2118" style="short" top="#27ae60" bottom="#3d4f6a" sit="ground" armL={[-20, -18]} armR={[22, -34]}>
      <rect x={18} y={-42} width={14} height={9} rx={2} fill="#f2c94c" />
    </Person>
    <Person x={196} y={330} skin="#f2cfae" hair="#3b2a1e" style="long" top="#f2994a" bottom="#7a4b8a" sit="ground" armL={[-24, -30]} armR={[20, -18]} />
    <Person x={150} y={338} skin="#f2cfae" hair="#3b2a1e" style="pony" top="#f78fb3" bottom="#f78fb3" skirt s={0.62} armL={[-16, -56]} armR={[18, -40]} />
    <g transform="translate(220 330)"><circle r={9} fill="#f2cfae" /><rect x={-9} y={6} width={18} height={14} rx={6} fill="#fff7b3" /></g>
    <rect x={120} y={296} width={28} height={18} rx={3} fill="#b07a4a" /><path d="M122 296 Q134 284 146 296" stroke="#8a5a34" strokeWidth={3} fill="none" />
    {/* tree and bench with the old man */}
    <rect x={520} y={150} width={24} height={120} fill="#8a5a34" />
    <circle cx={532} cy={130} r={62} fill="#4caf50" /><circle cx={490} cy={150} r={40} fill="#43a047" /><circle cx={576} cy={152} r={40} fill="#43a047" />
    <rect x={470} y={238} width={120} height={10} rx={3} fill="#a0703c" />
    <rect x={476} y={248} width={8} height={26} fill="#6b4a2a" /><rect x={576} y={248} width={8} height={26} fill="#6b4a2a" />
    <Person x={528} y={274} skin="#e8b88f" hair="#c9c9c9" style="short" top="#8d6e63" bottom="#5d5d5d" sit glasses armL={[-22, -52]} armR={[22, -52]}>
      <rect x={-26} y={-66} width={52} height={30} fill="#f7f7f2" stroke="#999" />
      <line x1={-20} y1={-58} x2={-4} y2={-58} stroke="#888" strokeWidth={2} /><line x1={-20} y1={-50} x2={-4} y2={-50} stroke="#888" strokeWidth={2} /><line x1={4} y1={-58} x2={20} y2={-58} stroke="#888" strokeWidth={2} />
    </Person>
    {/* the woman walking her dog */}
    <Person x={430} y={356} skin="#f2cfae" hair="#1d1612" style="pony" top="#bb6bd9" bottom="#2d3a5a" armL={[-14, -40]} armR={[30, -44]} s={0.95} />
    <path d="M460 312 Q478 330 486 342" stroke="#c0392b" strokeWidth={2} fill="none" />
    <g transform="translate(496 352)"><ellipse rx={18} ry={9} fill="#a0703c" /><circle cx={-16} cy={-8} r={7} fill="#a0703c" /><path d="M-20 -14 L-23 -6 L-18 -8 Z" fill="#6b4a2a" /><rect x={-12} y={4} width={4} height={10} fill="#a0703c" /><rect x={8} y={4} width={4} height={10} fill="#a0703c" /><path d="M17 -3 Q26 -10 24 -16" stroke="#a0703c" strokeWidth={3} fill="none" /></g>
  </>
}

function Market() {
  return <>
    <rect width={640} height={400} fill="#1d2747" />
    <rect y={300} width={640} height={100} fill="#3b3f52" />
    <path d="M0 36 Q160 66 320 40 T640 44" stroke="#2a2a2a" strokeWidth={2} fill="none" />
    {[40, 120, 200, 280, 360, 440, 520, 600].map((x, i) => <g key={x} transform={`translate(${x} ${48 + (i % 2) * 6})`}><line y1={-8} y2={0} stroke="#2a2a2a" /><ellipse cy={12} rx={13} ry={15} fill="#e74c3c" /><rect x={-6} y={-2} width={12} height={4} fill="#f1c40f" /><rect x={-6} y={25} width={12} height={4} fill="#f1c40f" /></g>)}
    {/* game stall on the left */}
    <rect x={10} y={120} width={150} height={150} fill="#6c5ce7" />
    <rect x={10} y={110} width={150} height={20} fill="#fdcb6e" />
    <text x={85} y={126} textAnchor="middle" fontSize={15} fill="#2d3436" fontWeight={700}>遊戲 GAMES</text>
    {[34, 70, 106, 142].map(x => <g key={x} transform={`translate(${x} 160)`}><circle r={12} fill="#c8a27a" /><circle cx={-9} cy={-10} r={5} fill="#c8a27a" /><circle cx={9} cy={-10} r={5} fill="#c8a27a" /><circle cx={-4} cy={-2} r={1.5} fill="#333" /><circle cx={4} cy={-2} r={1.5} fill="#333" /></g>)}
    <rect x={10} y={230} width={150} height={40} fill="#4834d4" />
    {/* the boy with a balloon, pointing at the game stall */}
    <line x1={200} y1={255} x2={210} y2={172} stroke="#ddd" strokeWidth={1} />
    <ellipse cx={212} cy={156} rx={14} ry={17} fill="#00cec9" />
    <Person x={200} y={330} skin="#f0c8a4" hair="#2b2118" style="short" top="#fd9644" bottom="#2d3a5a" s={0.72} armL={[-36, -66]} armR={[0, -104]} />
    {/* fried chicken stall */}
    <rect x={250} y={150} width={200} height={130} fill="#c0392b" />
    {[0, 1, 2, 3, 4].map(i => <rect key={i} x={250 + i * 40} y={120} width={20} height={30} fill="#ffffff" />)}
    {[0, 1, 2, 3, 4].map(i => <rect key={i} x={270 + i * 40} y={120} width={20} height={30} fill="#e74c3c" />)}
    <rect x={300} y={152} width={100} height={28} rx={4} fill="#fffbe6" />
    <text x={350} y={173} textAnchor="middle" fontSize={18} fill="#c0392b" fontWeight={800}>雞排 $80</text>
    <Person x={350} y={276} skin="#e8b88f" hair="#2b2118" style="short" top="#f5f6fa" bottom="#f5f6fa" armL={[-24, -44]} armR={[26, -50]} s={0.9}>
      <rect x={-12} y={-62} width={24} height={30} fill="#ffffff" stroke="#aaa" />
    </Person>
    <rect x={262} y={236} width={176} height={44} fill="#7f8c8d" />
    <ellipse cx={330} cy={238} rx={40} ry={8} fill="#2d3436" />
    <g stroke="#dfe6e9" strokeWidth={2} fill="none" opacity={0.8}><path d="M316 226 Q310 214 318 204" /><path d="M332 226 Q326 212 334 200" /><path d="M348 226 Q342 214 350 204" /></g>
    {/* the queue */}
    <Person x={300} y={350} skin="#f2cfae" hair="#3b2a1e" style="long" top="#00b894" bottom="#2d3436" skirt armL={[-16, -40]} armR={[16, -40]} s={0.95} />
    <Person x={360} y={352} skin="#e8b88f" hair="#2b2118" style="short" top="#0984e3" bottom="#636e72" armL={[-16, -40]} armR={[16, -40]} s={0.98} />
    <Person x={420} y={354} skin="#d9a37a" hair="#1d1612" style="short" top="#fdcb6e" bottom="#2d3436" armL={[-16, -40]} armR={[16, -40]} />
    {/* the young woman photographing her bubble tea */}
    <Person x={500} y={360} skin="#f2cfae" hair="#1d1612" style="long" top="#fd79a8" bottom="#6c5ce7" skirt armL={[-16, -88]} armR={[16, -88]}>
      <rect x={-22} y={-104} width={13} height={20} rx={2} fill="#2d3436" />
      <rect x={10} y={-102} width={14} height={20} rx={3} fill="#e8d5b5" stroke="#b9a37f" />
      <line x1={18} y1={-102} x2={21} y2={-112} stroke="#e17055" strokeWidth={2} />
      <circle cx={14} cy={-86} r={1.8} fill="#3d2b1f" /><circle cx={19} cy={-85} r={1.8} fill="#3d2b1f" />
    </Person>
    {/* the couple eating noodles at a folding table */}
    <Person x={566} y={352} skin="#e8b88f" hair="#2b2118" style="short" top="#55efc4" bottom="#2d3436" sit s={0.8} armL={[-10, -40]} armR={[16, -44]} />
    <Person x={614} y={352} skin="#f2cfae" hair="#3b2a1e" style="bun" top="#fab1a0" bottom="#2d3436" sit s={0.8} armL={[-16, -44]} armR={[10, -40]} />
    <rect x={544} y={318} width={92} height={8} fill="#dfe6e9" />
    <line x1={552} y1={326} x2={566} y2={362} stroke="#b2bec3" strokeWidth={3} /><line x1={628} y1={326} x2={614} y2={362} stroke="#b2bec3" strokeWidth={3} />
    <path d="M568 306 Q576 320 586 306 Z" fill="#ffffff" stroke="#b2bec3" /><path d="M594 306 Q602 320 612 306 Z" fill="#ffffff" stroke="#b2bec3" />
    <path d="M572 300 Q576 306 582 304 M598 300 Q602 306 608 304" stroke="#f6e58d" strokeWidth={2} fill="none" />
    <line x1={580} y1={308} x2={579} y2={316} stroke="#a0703c" strokeWidth={1.5} /><line x1={579} y1={306} x2={578} y2={318} stroke="#a0703c" strokeWidth={1.2} />
    <line x1={602} y1={306} x2={599} y2={318} stroke="#a0703c" strokeWidth={1.5} />
  </>
}

const scenes: Record<string, { title: string; draw: () => ReactNode }> = {
  ward: { title: '病房：護士幫病人量血壓，家人拿著花，醫生在門口寫資料', draw: Ward },
  park: { title: '公園：一家人野餐，男孩放風箏，女生遛狗，老先生在長椅上看報紙', draw: Park },
  market: { title: '夜市：雞排攤前排隊，女生拍珍奶，情侶吃麵，小男孩拿氣球指著遊戲攤', draw: Market },
}
export const hasScene = (id: string) => id in scenes

export default function GeptScene({ id }: { id: string }) {
  const scene = scenes[id]
  if (!scene) return null
  return <svg className="gp-scene" viewBox="0 0 640 400" role="img" aria-label={scene.title}>
    <title>{scene.title}</title>
    {scene.draw()}
  </svg>
}

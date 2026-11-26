import { addDays } from './progress'
import { readEvidence, unitsWithEvidence, type Evidence } from './evidence'
import { readQuizRecord } from './quiz'
import { readSkills } from './wordSkills'
import { readHeard, type HeardRecord } from './lesson'

/** One small, evidence-based adjustment for today. It replaces part of the chosen time (never adds to it),
 *  says what it is based on, and says so plainly when there is not enough to go on. */
export interface Focus {
  kind: 'listen' | 'contrast' | 'produce' | 'raise' | 'probe' | 'none'
  reason: string
  minutes: number
  action?: { label: string; hash: string }
}
type Translation = { grammar?: string[]; rating?: 'correct' | 'minor' | 'again' }
interface Input {
  notes: Record<string, string>
  sessions: { day: string; translations?: Translation[] }[]
  learningWords?: string[]
}

/** The lesson's first listen of each unit's dialogue (the questions answered by ear), newest last. */
function firstListens(notes: Record<string, string>) {
  return Object.keys(notes).filter(k => /^lesson\.heard\.\d+$/.test(k)).map(k => readHeard(notes, Number(k.slice(13))))
    .filter((r): r is HeardRecord => !!r && typeof r.day === 'string' && r.total > 0 && Number.isFinite(r.correct))
    .sort((a, b) => a.day.localeCompare(b.day))
}

function recentEvidence(notes: Record<string, string>) {
  const all: Evidence[] = []
  for (const u of unitsWithEvidence(notes)) all.push(...readEvidence(notes, u))
  return all.sort((a, b) => a.day.localeCompare(b.day))
}

export function nextFocus(input: Input, today: string, energy: 'low' | 'normal' | 'high'): Focus {
  if (energy === 'low') return { kind: 'none', reason: '', minutes: 0 }
  const ev = recentEvidence(input.notes)
  const listen = ev.filter(e => e.skill === 'listen').slice(-3)
  const write = ev.filter(e => e.skill === 'write' && e.level !== 'pending').slice(-3)

  // 1. Understands with the text, not by ear.
  const byEar = listen.filter(e => e.level === 'assisted').length
  const words = input.learningWords ?? []
  const read = words.filter(w => readSkills(input.notes, w).read).length
  const heard = words.filter(w => readSkills(input.notes, w).listen).length
  if (listen.length >= 2 && byEar >= 2)
    return { kind: 'listen', minutes: 5, action: { label: '先練 5 分鐘聽', hash: 'library/words/listen' },
      reason: `最近 ${listen.length} 次只聽對話，有 ${byEar} 次要看字才答得出來。今天先花 5 分鐘練聽熟字，再上課。` }
  // The daily lesson's listening questions keep going wrong (kept as they were answered, not as "done with help").
  const lastListens = firstListens(input.notes).slice(-3)
  const missed = lastListens.filter(r => r.correct < r.total).length
  if (lastListens.length >= 2 && missed >= 2)
    return { kind: 'listen', minutes: 5, action: { label: '先練 5 分鐘聽', hash: 'library/words/listen' },
      reason: `最近 ${lastListens.length} 個單元第一次聽課文對話，有 ${missed} 次題目沒有全對。今天先花 5 分鐘練聽熟字，再上課。` }
  if (read >= 8 && heard * 3 <= read)
    return { kind: 'listen', minutes: 5, action: { label: '先練 5 分鐘聽', hash: 'library/words/listen' },
      reason: `在學的字裡，${read} 個看得懂，但只有 ${heard} 個練過「聽懂」。今天先花 5 分鐘聽音選意思。` }

  // 2. The same grammar keeps going wrong (a reminder rule, not a verdict).
  const since = addDays(today, -14)
  const misses = new Map<string, number>()
  for (const s of input.sessions) if (s.day >= since)
    for (const t of s.translations ?? []) if (t.rating && t.rating !== 'correct')
      for (const g of t.grammar ?? []) misses.set(g, (misses.get(g) ?? 0) + 1)
  const worst = [...misses].sort((a, b) => b[1] - a[1])[0]
  if (worst && worst[1] >= 3)
    return { kind: 'contrast', minutes: 5, action: { label: '先重練這個句型', hash: 'library/translate' },
      reason: `「${worst[0]}」這兩週有 ${worst[1]} 句沒寫對。今天先花 5 分鐘重寫幾句舊句，對照參考句看差在哪。` }

  // 3. Can pick the answer, but not yet produce it.
  const quiz = Object.keys(input.notes).filter(k => k.startsWith('quiz.ans.')).map(k => readQuizRecord(input.notes, k.slice(9))).filter(Boolean)
  const quizRight = quiz.filter(r => r!.correct).length
  const helped = write.filter(e => e.level === 'assisted').length
  const alone = write.filter(e => e.level === 'independent' || e.level === 'delayed').length
  if (write.length >= 3 && helped >= 2 && alone === 0)
    return { kind: 'produce', minutes: 5, action: { label: '先多寫兩句', hash: 'library/translate' },
      reason: (quiz.length >= 5 && quizRight / quiz.length >= 0.7 ? `選擇題答對 ${quizRight} / ${quiz.length}，` : '') +
        `最近 ${write.length} 次自己寫，有 ${helped} 次要看提示才完成。今天先不看提示多寫兩句，卡住再開。` }

  // 4. Doing it alone: hold the help back a little.
  if (write.length >= 3 && alone === write.length)
    return { kind: 'raise', minutes: 0, reason: `最近 ${write.length} 次都沒看提示就寫對了。今天先自己寫完，真的卡住再開提示。` }

  // 5. Not enough to go on.
  if (ev.length < 3)
    return { kind: 'probe', minutes: 0, reason: '紀錄還不夠，看不出你卡在哪一步。今天先照課表上一堂，做完就會比較清楚。' }
  return { kind: 'none', minutes: 0, reason: '最近幾次沒有特別卡住的地方，照課表往前走。' }
}

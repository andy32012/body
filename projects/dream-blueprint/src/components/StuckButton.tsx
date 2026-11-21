import { LifeBuoy } from 'lucide-react'
import { tutorKey } from '../lib/tutor'
import { askClaude } from '../lib/taskContext'

/** 「我卡住了」beside an answer box: opens Claude with this task and the current draft, for a small hint. */
/** onUse lets the caller record that help was asked for, so the answer is not counted as done alone. */
export default function StuckButton({ label = '我卡住了', onUse }: { label?: string; onUse?: () => void }) {
  if (!tutorKey()) return null
  return <button type="button" className="pr-link stuck-btn" onClick={() => { onUse?.(); askClaude('我卡住了，給我一點提示就好，先不要給答案。') }}>
    <LifeBuoy size={14} aria-hidden="true" />{label}
  </button>
}

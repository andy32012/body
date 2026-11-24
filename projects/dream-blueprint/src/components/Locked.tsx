import { Lock } from 'lucide-react'
import './locked.css'

/** The line on a locked level, stage or lesson: what opens it. */
export function LockLine({ text }: { text: string }) {
  return <small className="lock-line"><Lock size={12} aria-hidden="true" />{text}</small>
}

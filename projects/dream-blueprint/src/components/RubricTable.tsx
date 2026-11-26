import { levelText, rubrics, type Rubric, type RubricId } from '../lib/rubrics'
import './rubric.css'

/** The published table a check is graded by, folded: every level of every scale, the official rules and pass mark,
 *  and the official page it was taken from. */
export function RubricTable({ rubric, label = '評分表', open = false }: { rubric: Rubric; label?: string; open?: boolean }) {
  return <details className="rb-table" open={open}>
    <summary>{label}：{rubric.title}（官方）</summary>
    {rubric.scales.map(s => <div key={s.name} className="rb-scale">
      {rubric.scales.length > 1 && <b>{s.name}</b>}
      <ol>{s.levels.map(l => <li key={l.score}><span className="rb-score">{l.score}</span><span>{l.text}</span></li>)}</ol>
    </div>)}
    {rubric.rules && <ul className="rb-rules">{rubric.rules.map(r => <li key={r}>{r}</li>)}</ul>}
    {rubric.pass && <p className="rb-note">{rubric.pass.official}</p>}
    {rubric.pass && <p className="rb-note">這裡的練習目標（不是官方的通過標準）：{rubric.pass.note}</p>}
    {rubric.limits && <p className="rb-note">{rubric.limits}</p>}
    <p className="rb-source">照官方說明整理：<a href={rubric.source.url} target="_blank" rel="noopener noreferrer">{rubric.source.name}</a></p>
  </details>
}

/** Claude's score on a correction box: the level, what that level means on the table, and why. */
export function RubricScore({ id, score, reason }: { id: RubricId; score: number; reason?: string }) {
  const r = rubrics[id]
  const level = score >= r.max ? 'hi' : score >= r.max - 1 ? 'mid' : 'lo'
  return <div className="rb-result">
    <p><span className="rb-chip" data-level={level}>{score} / {r.max}{r.id === 'gept-sentence' ? ' 分' : ' 級分'}</span> <b>{r.title}</b></p>
    <small className="rb-level">表上第 {score} 級：{levelText(r, score)}</small>
    {reason && <small>{reason}</small>}
    <RubricTable rubric={r} label="對照的評分表" />
  </div>
}

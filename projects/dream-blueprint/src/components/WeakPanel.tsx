import { useAppStore } from '../lib/store'
import { dayKey } from '../lib/progress'
import { fixShown, readWeak, removeWeak, weakScore, type WeakSource } from '../lib/weakPoints'

const srcNames: Record<WeakSource, string> = {
  tutor: 'Claude 批改中翻英', self: '自己對答案', drill: '文法小練習', speak: '跟 Emma 聊天', write: 'Claude 批改寫作', review: '複習', gept: '英檢口說練習',
}

/** The shared weak-point list, where the learner can see why something is on it and delete what is wrong. */
export default function WeakPanel() {
  const { state, update } = useAppStore()
  const today = dayKey()
  const list = readWeak(state.notes).map(i => ({ ...i, score: weakScore(i, today) })).sort((a, b) => b.score - a.score || b.last.localeCompare(a.last))
  if (!list.length) return <p>還沒有紀錄。Claude 批改中翻英和寫作、文法小練習、跟 Emma 聊完的回饋找到的錯，會自動記在這裡。</p>
  return <div className="weak-panel">
    <p>Claude 老師、Emma 和「問問 Claude」都會看最前面 5 項：碰到這些文法時先給提示，讓你自己改。之後同一種文法自己寫對，次數會往下降；三週沒再錯也會慢慢淡掉。記錯的可以直接刪掉。</p>
    <ol className="weak-list">{list.map((i, n) => <li key={i.k} className={i.score < 0.5 ? 'faded' : n < 5 ? 'top' : undefined}>
      <div className="weak-head">
        <strong>{i.k}</strong>
        <small>錯 {i.n} 次 · 最近 {i.last.slice(5).replace('-', '/')}{i.score < 0.5 ? ' · 已經淡掉，老師不會再特別提' : n < 5 ? ' · 老師會注意' : ''}</small>
      </div>
      {i.ex.map((e, j) => <p key={j} className="weak-ex">{fixShown(e) ? <span lang="en"><s>{e.w}</s> → <b>{e.r}</b></span>
        : <span><s lang="en">{e.w}</s> <small>（這題之後會再練到，到時候自己改）</small></span>}<small>{srcNames[e.src] ?? ''}</small></p>)}
      <button type="button" onClick={() => update(prev => ({ ...prev, notes: removeWeak(prev.notes, i.k) }))} aria-label={'刪掉弱點：' + i.k}>刪掉</button>
    </li>)}</ol>
  </div>
}

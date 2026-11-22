import { useState } from 'react'
import curriculum from '../data/curriculum.json'
import type { PageProps } from '../lib/store'
import { askTutor, tutorKey } from '../lib/tutor'
import { bestLevel, levelNames, readEvidence, setEvidenceLevel, sourceNames, unitsWithEvidence, type Evidence, type Level } from '../lib/evidence'

const CHECK = '你是英文老師。判斷學生的英文是否正確表達了題目的意思（文法正確、意思對就算對，不必跟參考答案一樣）。第一個字只能是「對」或「錯」；錯的話，後面用繁體中文一句話說原因。'

function Pending({ e, onLevel }: { e: Evidence; onLevel: (level: Level) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  return <div className="ev-pending">
    <small>{sourceNames[e.source]} · {e.day.slice(5).replace('-', '/')} · 自評完成・待確認</small>
    {e.prompt && <span className="ev-prompt">{e.prompt}</span>}
    <p lang="en">{e.answer}</p>
    {msg && <small role="status">{msg}</small>}
    {tutorKey()
      ? <button type="button" disabled={busy} onClick={async () => {
          setBusy(true); setMsg('')
          try {
            const reply = (await askTutor(CHECK, [{ role: 'user', content: '題目：' + (e.prompt ?? '') + '\n參考：' + (e.ref ?? '') + '\n學生：' + (e.answer ?? '') }])).trim()
            const ok = /^對/.test(reply)
            setMsg(reply.split('\n')[0])
            // One confirmed answer is 當次獨立完成; 延後換題 needs new sentences days later (the unit checkpoint).
            setTimeout(() => onLevel(ok ? 'independent' : 'assisted'), 1800)
          } catch { setMsg('沒連上 Claude，等一下再試。') } finally { setBusy(false) }
        }}>{busy ? '確認中…' : '請 Claude 看看'}</button>
      : <small>連接 Claude 之後可以在這裡確認。</small>}
  </div>
}

/** Per unit: the strongest evidence so far, written and listening kept apart, plus answers still waiting to be checked. */
export default function EvidencePanel({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const units = unitsWithEvidence(state.notes)
  return <section className="history-section history-evidence">
    <h2>我會什麼</h2>
    <p className="history-note">「完成」和「學會」分開記：有提示完成 → 當次獨立完成 → 延後換題仍能完成。自己勾「對了」但沒人確認的，先放在「自評完成・待確認」；沒寫答案的不算作答。</p>
    {!units.length && <p>上完「今天這一堂」以後，這裡會開始有紀錄。</p>}
    <ul className="ev-list">{units.map(u => {
      const list = readEvidence(state.notes, u)
      const write = bestLevel(list, 'write'), listen = bestLevel(list, 'listen')
      const title = curriculum.units.find(x => x.id === u)?.title ?? ''
      const pending = list.map((e, i) => ({ e, i })).filter(x => x.e.level === 'pending' && x.e.answer)
      return <li key={u}>
        <div className="ev-head"><b>單元 {u} · {title}</b>
          <span data-level={write ?? ''}>寫／說：{write ? levelNames[write] : '還沒有'}</span>
          <span data-level={listen ?? ''}>聽：{listen ? (listen === 'assisted' ? '只聽還沒全對' : '只聽也懂') : '還沒有'}</span>
        </div>
        {pending.map(({ e, i }) => <Pending key={i} e={e} onLevel={level => update(prev => ({ ...prev, notes: setEvidenceLevel(prev.notes, u, i, level) }))} />)}
      </li>
    })}</ul>
  </section>
}

import { useState } from 'react'
import curriculum from '../data/curriculum.json'
import type { PageProps } from '../lib/store'
import { askTutor, tutorKey } from '../lib/tutor'
import { bestLevel, checkPending, levelNames, pendingRef, readEvidence, sourceNames, teacherReason, teacherVerdict, unitsWithEvidence, type Evidence, type PendingRef } from '../lib/evidence'

const CHECK = '你是英文老師。判斷學生的英文是否正確表達了題目的意思（文法正確、意思對就算對，不必跟參考答案一樣）。只回兩行：第一行「判定：對」或「判定：錯」；第二行「原因：」後面用繁體中文一句話說為什麼（對也要說為什麼對）。'

function Pending({ e, onCheck }: { e: Evidence; onCheck: (ref: PendingRef, reply: string, rewrite?: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [text, setText] = useState(e.answer ?? '')
  const rewriting = !!e.wrong
  async function ask() {
    setBusy(true); setMsg('')
    const answer = rewriting ? text.trim() : e.answer ?? ''
    // The check belongs to this answer as it is now; the list may move while Claude answers.
    const ref = pendingRef(e)
    try {
      const reply = (await askTutor(CHECK, [{ role: 'user', content: '題目：' + (e.prompt ?? '') + '\n參考：' + (e.ref ?? '') + '\n學生：' + answer }])).trim()
      const verdict = teacherVerdict(reply)
      setMsg(verdict === 'unclear' ? 'Claude 這次沒有照格式回答（要先寫「判定：對／錯」，再寫原因），這題先不動，再按一次。' : 'Claude：' + (verdict === 'right' ? '對' : '要改') + '。' + teacherReason(reply))
      // One confirmed answer is 當次獨立完成; 延後換題 needs new sentences days later (the unit checkpoint). A wrong answer
      // stays here with the reason until he rewrites it right.
      if (verdict !== 'unclear') setTimeout(() => onCheck(ref, reply, rewriting ? answer : undefined), 1800)
    } catch { setMsg('沒連上 Claude，等一下再試。') } finally { setBusy(false) }
  }
  return <div className="ev-pending">
    <small>{sourceNames[e.source]} · {e.day.slice(5).replace('-', '/')} · {rewriting ? '要重寫' : '自評完成・待確認'}</small>
    {e.prompt && <span className="ev-prompt">{e.prompt}</span>}
    <p lang="en">{e.answer}</p>
    {rewriting && <>
      <small>Claude 說要改：{e.wrong}</small>
      <label className="ev-rewrite">改寫成：
        <textarea lang="en" rows={2} value={text} spellCheck={false} autoComplete="off" onChange={ev => setText(ev.target.value)} />
      </label>
    </>}
    {msg && <small role="status">{msg}</small>}
    {tutorKey()
      ? <button type="button" disabled={busy || (rewriting && !text.trim())} onClick={ask}>{busy ? '確認中…' : rewriting ? '改好了，請 Claude 再看' : '請 Claude 看看'}</button>
      : <small>連接 Claude 之後可以在這裡確認。</small>}
  </div>
}

/** Per unit: the strongest evidence so far, written and listening kept apart, plus answers still waiting to be checked. */
export default function EvidencePanel({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const units = unitsWithEvidence(state.notes)
  return <section className="history-section history-evidence">
    <h2>我會什麼</h2>
    <p className="history-note">「完成」和「學會」分開記：有提示完成 → 當次獨立完成 → 延後換題仍能完成。自己勾「對了」但沒人確認的，先放在「自評完成・待確認」；Claude 說錯的會留在這裡等你重寫；沒寫答案的不算作答。</p>
    {!units.length && <p>上完「今天這一堂」以後，這裡會開始有紀錄。</p>}
    <ul className="ev-list">{units.map(u => {
      const list = readEvidence(state.notes, u)
      const write = bestLevel(list, 'write'), listen = bestLevel(list, 'listen')
      const title = curriculum.units.find(x => x.id === u)?.title ?? ''
      const pending = list.map((e, i) => ({ e, i })).filter(x => x.e.level === 'pending' && x.e.answer)
      return <li key={u}>
        <div className="ev-head"><b>單元 {u} · {title}</b>
          <span data-level={write ?? ''}>寫：{write ? levelNames[write] : '還沒有'}</span>
          <span data-level={listen ?? ''}>聽：{listen ? (listen === 'assisted' ? '只聽還沒全對' : '只聽也懂') : '還沒有'}</span>
        </div>
        {pending.map(({ e, i }) => <Pending key={i + (e.wrong ?? '')} e={e} onCheck={(ref, reply, rewrite) => update(prev => ({ ...prev, notes: checkPending(prev.notes, u, ref, reply, rewrite) }))} />)}
      </li>
    })}</ul>
  </section>
}

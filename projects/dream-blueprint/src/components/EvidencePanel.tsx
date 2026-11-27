import { useRef, useState } from 'react'
import DraftVersions from './DraftVersions'
import curriculum from '../data/curriculum.json'
import { captureDraftCleanup, readDraft, writeDraft } from '../lib/drafts'
import { readStoreForCloud, updateStoreNow, type PageProps } from '../lib/store'
import { askTutor, tutorKey } from '../lib/tutor'
import { answered, bestLevel, checkPending, levelNames, pendingRef, pendingReviewId, readEvidence, sourceNames, stillPending, teacherReason, teacherVerdict, unitsWithEvidence, type Evidence, type PendingRef } from '../lib/evidence'
import { claimReview, closeReview, receiveReview, reviewTimeout, type ReviewReply } from '../lib/pendingReview'

const CHECK = '你是英文老師。判斷學生的英文是否正確表達了題目的意思（文法正確、意思對就算對，不必跟參考答案一樣）。關係子句的逗號若改變了原意，要判錯。直接問句的句尾需要問號，陳述句不能加上語意不符的問號。只回兩行：第一行「判定：對」或「判定：錯」；第二行「原因：」後面用繁體中文一句話說為什麼（對也要說為什麼對）。'

type PendingReview = ReviewReply & { token: string }
type ApplyReview = (ref: PendingRef, review: ReviewReply) => Promise<'applied' | 'outdated' | 'retry'>
const uncertain = '上一次批改中斷，無法確認是否計費。如果要再次送出，請按「確認重新送出」。'

function Pending({ unit, e, onCheck }: { unit: number; e: Evidence; onCheck: ApplyReview }) {
  const rewriting = !!e.wrong
  const ref = pendingRef(e)
  const id = pendingReviewId(unit, ref)
  // The same attempt can need more than one rewrite. The request ID is for one check, the draft is for the attempt.
  const draftKey = `pending-rewrite.${unit}.${e.attemptId ?? id}`
  const checking = useRef(false)
  const [busy, setBusy] = useState(false)
  const [review, setReview] = useState<PendingReview | null>(null)
  const [outdated, setOutdated] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [msg, setMsg] = useState('')
  const [text, setText] = useState(() => rewriting ? readDraft(draftKey, e.answer ?? '') : e.answer ?? '')
  const hasAnswer = answered(rewriting ? text : ref.answer)

  function showOutdated() {
    setOutdated(true)
    setMsg('這份作答已變更。請重新開啟學習紀錄查看最新結果。')
  }

  async function requestReview(): Promise<PendingReview | null> {
    const claim = await claimReview(id, confirm, !!tutorKey() && hasAnswer)
    setConfirm(false)
    if (claim.state === 'busy') {
      setMsg('另一個分頁正在處理這份批改。若原分頁已關閉，等兩分半後再查看。')
      return null
    }
    if (claim.state === 'confirm') {
      setConfirm(true)
      setMsg(uncertain)
      return null
    }
    if (claim.state === 'unconfigured') {
      setMsg(hasAnswer ? '尚未收到這份作答的批改。連接 Claude 後可以送出。' : '尚未收到批改。先寫下英文，再送出作答。')
      return null
    }
    if (claim.state === 'received') return { ...claim.value, token: claim.token }
    const { token } = claim
    let sent = false
    try {
      const latest = await readStoreForCloud()
      if (!latest.persisted || Date.now() + reviewTimeout >= claim.until) {
        await closeReview(id, token)
        setMsg('目前無法確認這份作答已在瀏覽器儲存。請先儲存學習進度，再回來批改。')
        return null
      }
      if (!stillPending(latest.state.notes, unit, ref)) {
        await closeReview(id, token)
        showOutdated()
        return null
      }
      if (!tutorKey()) {
        await closeReview(id, token)
        setMsg('目前沒有 Claude 金鑰。連接 Claude 後可以送出。')
        return null
      }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), reviewTimeout)
      const answer = rewriting ? text.trim() : ref.answer ?? ''
      sent = true
      let reply: string
      try {
        reply = (await askTutor(CHECK, [{ role: 'user', content: '題目：' + (e.prompt ?? '') + '\n參考：' + (e.ref ?? '') + '\n學生：' + answer }], controller.signal)).trim()
      } finally { clearTimeout(timer) }
      if (teacherVerdict(reply) === 'unclear') {
        await closeReview(id, token)
        setMsg('Claude 已回覆，但沒有照格式提供「判定：對／錯」和原因。再次按下批改會送出新請求。')
        return null
      }
      const value = { reply, rewrite: rewriting ? answer : undefined }
      const received = await receiveReview(id, token, value).catch(() => Date.now() < claim.until)
      if (!received) { showOutdated(); return null }
      return { ...value, token }
    } catch {
      await closeReview(id, token, sent).catch(() => {})
      if (sent) setConfirm(true)
      setMsg(sent ? uncertain : '目前無法確認學習進度。請重新開啟學習紀錄後再試。')
      return null
    }
  }

  const usesOtherDraft = review?.rewrite !== undefined && review.rewrite !== text.trim()
  async function ask() {
    if (checking.current || outdated) return
    const cleanup = rewriting ? captureDraftCleanup(draftKey, text) : undefined
    checking.current = true
    setBusy(true); setMsg('')
    let applied = false
    try {
      const checked = review ?? await requestReview()
      if (!checked) return
      setReview(checked)
      if (!review && checked.rewrite !== undefined && checked.rewrite !== text.trim()) {
        setMsg('另一個分頁送出的文字和作答欄不同。請先看下方實際批改的版本，再決定是否套用結果。')
        return
      }
      const result = await onCheck(ref, checked)
      applied = result === 'applied'
      if (applied && checked.rewrite === text.trim()) cleanup?.()
      if (result !== 'retry') void closeReview(id, checked.token).catch(() => {})
      if (result === 'outdated') {
        showOutdated()
      } else if (result === 'retry') {
        setMsg('批改已收到，暫時無法寫入學習紀錄。可以再次按下方按鈕儲存。')
      }
    } catch {
      setMsg('瀏覽器無法保存或讀取批改。請允許這個網站使用瀏覽器儲存空間，再回來查看。')
    } finally {
      // Once the verdict is applied, the updated evidence removes or replaces this row.
      if (!applied) {
        checking.current = false
        setBusy(false)
      }
    }
  }
  return <div className="ev-pending">
    <small>{sourceNames[e.source]} · {e.day.slice(5).replace('-', '/')} · {rewriting ? '要重寫' : '自評完成・待確認'}</small>
    {e.prompt && <span className="ev-prompt">{e.prompt}</span>}
    <p lang="en">{e.answer}</p>
    {rewriting && <>
      <small>Claude 說要改：{e.wrong}</small>
      <label className="ev-rewrite">改寫成：
        <textarea lang="en" rows={2} value={text} readOnly={busy || !!review} spellCheck={false} autoComplete="off" onChange={ev => {
          setText(ev.target.value)
          writeDraft(draftKey, ev.target.value, true)
        }} />
      </label>
      <DraftVersions id={draftKey} text={text} onChoose={setText} disabled={busy || !!review} keepBlank />
    </>}
    {msg && <small role="status">{msg}</small>}
    {usesOtherDraft && <div>
      <small>Claude 實際批改的版本</small>
      <p lang="en">{review?.rewrite}</p>
    </div>}
    {!outdated && (
      <button type="button" disabled={busy} onClick={ask}>
        {busy ? review ? '儲存批改中…' : '確認中…' : review ? (usesOtherDraft ? '儲存這份批改' : '重試儲存批改') : (!tutorKey() || !hasAnswer) ? '查看已收到的批改'
          : confirm ? '確認重新送出' : rewriting ? '改好了，請 Claude 再看' : '請 Claude 看看'}
      </button>
    )}
  </div>
}

/** Per unit: the strongest evidence so far, written and listening kept apart, plus answers still waiting to be checked. */
export default function EvidencePanel({ state }: Pick<PageProps, 'state'>) {
  const units = unitsWithEvidence(state.notes)
  const [notice, setNotice] = useState<{ unit: number; attemptId?: string; after: number; text: string } | null>(null)
  return <section className="history-section history-evidence">
    <h2>我會什麼</h2>
    <p className="history-note">「完成」和「學會」分開記：有提示完成 → 當次獨立完成 → 延後換題仍能完成。自己勾「對了」但沒人確認的，先放在「自評完成・待確認」；Claude 說錯的會留在這裡等你重寫；沒寫答案的不算作答。</p>
    {!units.length && <p>上完「今天這一堂」以後，這裡會開始有紀錄。</p>}
    <ul className="ev-list">{units.map(u => {
      const list = readEvidence(state.notes, u)
      const write = bestLevel(list, 'write'), listen = bestLevel(list, 'listen')
      const title = curriculum.units.find(x => x.id === u)?.title ?? ''
      const pending = list.filter(e => e.level === 'pending' && e.answer)
      const showNotice = notice?.unit === u && list.some(e => e.attemptId === notice.attemptId
        && e.level !== 'pending' && (e.reviewedAt ?? 0) > notice.after)
      return <li key={u}>
        <div className="ev-head"><b>單元 {u} · {title}</b>
          <span data-level={write ?? ''}>寫：{write ? levelNames[write] : '還沒有'}</span>
          <span data-level={listen ?? ''}>聽：{listen ? (listen === 'assisted' ? '只聽還沒全對' : '只聽也懂') : '還沒有'}</span>
        </div>
        {showNotice && <small role="status">{notice.text}</small>}
        {pending.map(e => <Pending key={pendingReviewId(u, pendingRef(e))}
          unit={u} e={e} onCheck={async (ref, { reply, rewrite }) => {
            const result: { status: Awaited<ReturnType<ApplyReview>> } = { status: 'retry' }
            try {
              await updateStoreNow(prev => {
                const notes = checkPending(prev.notes, u, ref, reply, rewrite)
                result.status = notes === prev.notes ? 'outdated' : 'applied'
                return notes === prev.notes ? prev : { ...prev, notes }
              })
            } catch { return result.status === 'outdated' ? 'outdated' : 'retry' }
            if (result.status === 'applied') setNotice(teacherVerdict(reply) === 'right'
              ? { unit: u, attemptId: ref.attemptId, after: e.reviewedAt ?? 0, text: 'Claude：對。' + teacherReason(reply) }
              : null)
            return result.status
          }} />)}
      </li>
    })}</ul>
  </section>
}

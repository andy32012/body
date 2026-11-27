import { useRef, useState } from 'react'
import { updateStoreNow, type PageProps } from '../lib/store'
import { dayKey } from '../lib/progress'
import {
  certStatus, certifiedLevel, courseProgress, exams, gept, geptParts, ieltsBandCheck, legacyElementary, levelIds, lrPass, partsOf,
  readAttempts, removeAttempt, saveAttempt, speakingOf, speakingPass, steps, validExamDay, visaCurrent, visaScreen, waiting, writingOf, writingPass,
  type CertAttempt, type CertStatus, type ExamId, type GeptParts, type LevelId, type Step,
} from '../lib/cefr'
import { skills as ieltsSkills } from '../lib/ieltsMock'
import { officialWords, wordKey } from '../lib/vocab'
import './level-ladder.css'

const md = (d: string) => d.slice(0, 4) + '/' + d.slice(5, 7) + '/' + d.slice(8)
const partNames: Record<GeptParts, string> = { lr: '聽讀', sw: '說寫', both: '聽讀＋說寫（一日考）', w: '只考寫作（說寫只差寫作）', s: '只考口說（說寫只差口說）' }
const visaRequirements = 'https://www.trumerit.org/services/certification/visascreen-visa-credentials-assessment/#english-requirement'

/** What a 全民英檢 level still needs, from what is passed and still counts (lib/cefr.ts geptPassed). */
function stillNeeds(s: CertStatus, today: string) {
  const until = s.until ? '（' + md(s.until) + ' 以前要報名）' : ''
  if (s.until && s.until < today) return '之前通過的部分已經超過兩年，要從聽讀重新考'
  if (s.lr && s.w) return '聽讀和寫作過了，還差口說：報名「只考口說」' + until
  if (s.lr && s.s) return '聽讀和口說過了，還差寫作：報名「只考寫作」' + until
  if (s.lr) return '聽讀過了，還差說寫' + until
  if (s.w && s.s) return '一日考寫作、口說已過，還差聽讀' + until
  return (s.w ? '一日考寫作過了' : '一日考口說過了') + '，還差聽讀：先考過聽讀，再補沒過的那一項' + until
}
function statusLine(s: CertStatus, step: Step, today: string) {
  const exam = exams[step.exams[0]].name
  if (s.state === 'passed') return '✓ 通過，升到 ' + step.to + (s.passedOn ? '（' + md(s.passedOn) + '）' : '')
  if (s.state === 'waiting' && s.next) return '等成績：' + exams[s.next.exam].name + ' ' + md(s.next.date) + (s.lr ? '（聽讀已過）' : s.w || s.s ? '（一日考有一項已過）' : '') + ' · 下一段先讀'
  if (s.state === 'partial') return stillNeeds(s, today) + ' · 報名下一場才能接著上'
  if (s.attempts.some(a => legacyElementary(a) || a.band && !ieltsBandCheck(a.band).valid)) return '有成績待核對。請依成績單更正。'
  if (s.state === 'failed') return '這次沒過 · 補最弱的那一項，報名下一場才能接著上'
  return '還沒報名' + exam + (step.bookWhen ? ' · ' + step.bookWhen : '')
}
/** What a filled-in result says, part by part. */
function resultLine(a: CertAttempt) {
  if (waiting(a)) return '等成績'
  if (gept(a.exam)) {
    const w = writingOf(a), sp = speakingOf(a)
    return [
      a.lr && (lrPass(a.lr) ? '聽讀過' : '聽讀沒過（聽 ' + a.lr[0] + '、讀 ' + a.lr[1] + '）'),
      w !== undefined && (writingPass(a) ? '寫作過（' + w + '）' : '寫作沒過（' + w + '）'),
      sp !== undefined && (speakingPass(a) ? '口說過（' + sp + '）' : '口說沒過（' + sp + '）'),
    ].filter(Boolean).join('、')
  }
  if (a.exam === 'ielts' && a.band) return '總分 ' + a.band.overall + (a.band.speaking != null ? '、口說 ' + a.band.speaking : '')
  return (a.otherName ? a.otherName + ' ' : '') + (a.otherLevel ? a.otherLevel + ' ' : '') + (a.passed ? '通過' : '沒過')
}

type Band = NonNullable<CertAttempt['band']>
const bandInputs = ['overall', ...ieltsSkills] as const

function applyBandChanges(draft: Band, original: Band | undefined, current: Band | undefined) {
  const combined = { ...draft }
  if (!current) return combined
  for (const key of bandInputs) {
    const proposed = draft[key] ?? null
    const beforeEdit = original?.[key] ?? null
    const latest = current[key] ?? null
    if (proposed === beforeEdit) {
      if (key === 'overall') combined.overall = current.overall
      else combined[key] = current[key]
    } else if (latest !== beforeEdit && latest !== proposed) {
      throw new Error('這個欄位已在另一個分頁更新，請重新開啟成績後核對。')
    }
  }
  return combined
}

function ScoreForm({ attempt, busy, onSave, onEditing }: {
  attempt: CertAttempt; busy: boolean; onSave: (a: CertAttempt, originalBand?: Band) => void; onEditing: () => void
}) {
  const [initialBand] = useState(attempt.band)
  const [v, setV] = useState<Record<string, string>>(() => {
    const band = initialBand
    if (!band) return {}
    return Object.fromEntries(Object.entries({ o: band.overall, li: band.listening, re: band.reading, wr: band.writing, sp: band.speaking })
      .map(([key, score]) => [key, score == null ? '' : String(score)]))
  })
  const num = (k: string) => Number(v[k])
  const field = (k: string, label: string, max: number, step = 1) => <label key={k}>{label}
    <input type="number" inputMode="decimal" min={0} max={max} step={step} value={v[k] ?? ''} onChange={e => {
      setV({ ...v, [k]: e.target.value })
      if (attempt.exam === 'ielts') onEditing()
    }} /></label>
  const okRange = (k: string, max: number, step = 1) => v[k] !== undefined && v[k] !== '' && num(k) >= 0 && num(k) <= max && Number.isInteger(num(k) / step)
  if (gept(attempt.exam)) {
    // Only the parts this sitting had: a skill not taken is not a zero.
    const parts = partsOf(attempt)
    const lr = parts === 'lr' || parts === 'both', sw = parts === 'sw' || parts === 'both'
    const ready = (!lr || (okRange('l', 120) && okRange('r', 120))) && (!sw || (okRange('w', 100) && okRange('s', 100)))
      && (parts !== 'w' || okRange('w', 100)) && (parts !== 's' || okRange('s', 100))
    return <div className="ll-score">
      {lr && <>{field('l', '聽力（滿分 120）', 120)}{field('r', '閱讀（滿分 120）', 120)}</>}
      {(sw || parts === 'w') && field('w', '寫作（滿分 100）', 100)}
      {(sw || parts === 's') && field('s', '口說（滿分 100）', 100)}
      <button type="button" disabled={busy || !ready} onClick={() => onSave({ ...attempt,
        ...(lr ? { lr: [num('l'), num('r')] as [number, number] } : {}), ...(sw ? { sw: [num('w'), num('s')] as [number, number] } : {}),
        ...(parts === 'w' ? { writing: num('w') } : {}), ...(parts === 's' ? { speaking: num('s') } : {}) })}>記下成績</button>
    </div>
  }
  if (attempt.exam === 'ielts') {
    const opt = (k: string, old?: number | null) => v[k] ? num(k) : old == null ? undefined : null
    const band = { overall: num('o'), listening: opt('li', initialBand?.listening), reading: opt('re', initialBand?.reading),
      writing: opt('wr', initialBand?.writing), speaking: opt('sp', initialBand?.speaking) }
    const { valid, calculated } = ieltsBandCheck(band)
    const ready = okRange('o', 9, 0.5) && ['li', 're', 'wr', 'sp'].every(k => !v[k] || okRange(k, 9, 0.5)) && valid
    return <div className="ll-score">
      {field('o', '總分', 9, 0.5)}{field('li', '聽', 9, 0.5)}{field('re', '讀', 9, 0.5)}{field('wr', '寫', 9, 0.5)}{field('sp', '說', 9, 0.5)}
      {v.o && calculated !== undefined && !valid && <p role="alert">四科算出的總分是 {calculated}，請用成績單核對總分和各科。</p>}
      <button type="button" disabled={busy || !ready} onClick={() => onSave({ ...attempt, band }, initialBand)}>記下成績</button>
    </div>
  }
  return <div className="ll-score">
    <button type="button" disabled={busy} onClick={() => onSave({ ...attempt, passed: true })}>通過了</button>
    <button type="button" disabled={busy} onClick={() => onSave({ ...attempt, passed: false })}>沒過</button>
  </div>
}

function Booking({ step, busy, onSave }: { step: Step; busy: boolean; onSave: (a: CertAttempt) => void }) {
  const [exam, setExam] = useState<ExamId>(step.exams[0])
  const [parts, setParts] = useState<GeptParts>('lr')
  const [date, setDate] = useState('')
  const [registeredOn, setRegisteredOn] = useState('')
  const [id] = useState(() => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + '-' + Math.random().toString(36).slice(2))
  const [otherName, setOtherName] = useState('')
  const [otherLevel, setOtherLevel] = useState<LevelId>(step.to)
  const kind = geptParts(exam).includes(parts) ? parts : 'lr'
  const ok = validExamDay(date) && (exam !== 'other' || otherName.trim()) &&
    (!gept(exam) || !registeredOn || validExamDay(registeredOn) && registeredOn <= date && registeredOn <= dayKey())
  return <div className="ll-book">
    <label>考哪一個
      <select value={exam} onChange={e => setExam(e.target.value as ExamId)}>{step.exams.map(id => <option key={id} value={id}>{exams[id].name}</option>)}</select>
    </label>
    {gept(exam) && <label>這次考
      <select value={kind} onChange={e => setParts(e.target.value as GeptParts)}>{geptParts(exam).map(p => <option key={p} value={p}>{partNames[p]}</option>)}</select>
    </label>}
    {exam === 'other' && <>
      <label>證照名稱<input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="例如：劍橋 A2 Key" /></label>
      <label>成績單上的 CEFR<select value={otherLevel} onChange={e => setOtherLevel(e.target.value as LevelId)}>{levelIds.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    </>}
    <label>考試日期<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    {gept(exam) && <label>實際報名日期（可稍後補登）
      <input type="date" max={date && date < dayKey() ? date : dayKey()} value={registeredOn} onChange={e => setRegisteredOn(e.target.value)} /></label>}
    <button type="button" disabled={busy || !ok} onClick={() => onSave({
      id, exam, date,
      ...(gept(exam) ? { parts: kind, registeredOn: registeredOn || undefined } : {}),
      ...(exam === 'other' ? { otherName: otherName.trim(), otherLevel } : {}),
    })}>報名了，記下來</button>
  </div>
}

function RegisterDate({ attempt, busy, onSave, onCancel }: { attempt: CertAttempt; busy: boolean; onSave: (date: string) => void; onCancel: () => void }) {
  const [date, setDate] = useState(attempt.registeredOn ?? '')
  const today = dayKey()
  const last = attempt.date < today ? attempt.date : today
  return <div className="ll-score">
    <label>實際報名日期<input type="date" max={last} value={date} onChange={e => setDate(e.target.value)} /></label>
    <button type="button" disabled={busy || !validExamDay(date) || date > last} onClick={() => onSave(date)}>存報名日期</button>
    <button type="button" disabled={busy} onClick={onCancel}>取消</button>
  </div>
}

/** 英文程度：A1 → C2, the certificate that moves each level up, and where the daily lessons are. */
export default function LevelLadder({ state }: Pick<PageProps, 'state'>) {
  const certified = certifiedLevel(state.notes)
  const course = courseProgress(state.curriculum.unit)
  const visa = visaScreen(state.notes)
  const seen = new Set([...state.knownWords, ...state.learningWords].map(wordKey))
  const [booking, setBooking] = useState<LevelId | null>(null)
  const [editScore, setEditScore] = useState<string | null>(null)
  const [editRegistration, setEditRegistration] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const today = dayKey()
  async function change(updateNotes: (notes: Record<string, string>) => Record<string, string>, done?: () => void) {
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      await updateStoreNow(prev => ({ ...prev, notes: updateNotes(prev.notes) }))
      done?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '沒有存下更改。請再試一次。')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  function save(to: LevelId, attempt: CertAttempt, creating = false, originalBand?: Band) {
    void change(notes => {
      const current = readAttempts(notes, to).find(a => a.id === attempt.id)
      if (!creating && !current) throw new Error('這筆已被刪除，請重開需要的報名紀錄。')
      const band = attempt.band ? applyBandChanges(attempt.band, originalBand, current?.band) : undefined
      if (band && !ieltsBandCheck(band).valid)
        throw new Error('另一個分頁已更新成績。合併後的分數和總分不一致，請重新開啟並核對成績單。')
      return saveAttempt(notes, to, { ...attempt, band, registeredOn: current?.registeredOn ?? attempt.registeredOn })
    }, () => {
      if (creating) setBooking(null)
      else setEditScore(null)
    })
  }
  function register(to: LevelId, id: string, date: string) {
    void change(notes => {
      const current = readAttempts(notes, to).find(a => a.id === id)
      if (!current || date > current.date) throw new Error('考試紀錄已變更，請重新開啟核對。')
      return saveAttempt(notes, to, { ...current, registeredOn: date })
    }, () => setEditRegistration(null))
  }
  return <div className="ll">
    <section className="ll-head">
      <h2>英文程度階梯</h2>
      <p className="ll-now">{certified ? <>證照上的程度 <b>{certified}</b></> : <>還沒有登錄證照，從 <b>A1</b> 課程起步</>} · 每日課正在上 <b>{course.step.from}→{course.step.to}</b>
        {course.total ? '（單元 ' + Math.min(course.done + 1, course.total) + ' / ' + course.total + '）' : '（這一段的每日課還在寫）'}</p>
      <p>每天：週一到週六 1.5 小時，寒假 3–4 小時；實習時 20–30 分鐘護理英文，國考衝刺 15 分鐘。每一級最後考一張證照，考過才算升級。報名後填上考試日期，就能先讀下一段，等成績也不用停；沒過就補最弱的那一項，報名下一場再繼續。7000 單的日期是照每天打開今日單字（週日也開）、看 20 個新字、先做複習算的；週日沒開會晚 1–7 個月，第 4 級會拖進實習期間。每天看幾個可以在「設定 → 我的學習節奏」改。</p>
      {visa && visaCurrent(visa, today) ? <p className="ll-visa">✓ {md(visa.date)} 登錄的雅思學術組成績達到美國 RN 的 VisaScreen 分數門檻。依雅思建議，測驗日起兩年為 {md(visa.until)}。採認與效期由受理單位確認。</p>
        : visa ? <p className="ll-goal">{md(visa.date)} 登錄的雅思成績曾達到分數門檻，已超過雅思建議的兩年效期（{md(visa.until)}）。送件前請向受理單位確認。</p>
        : <p className="ll-goal">美國 RN 的 VisaScreen 雅思學術組分數門檻為總分至少 6.5、口說至少 7。</p>}
      <p className="ll-goal">採認的考試形式和其他資格請見 <a href={visaRequirements} target="_blank" rel="noopener noreferrer">TruMerit 英語規定</a>。</p>
      {error && <p role="alert">{error}</p>}
    </section>
    <ol className="ll-steps">
      {steps.map(step => {
        const s = certStatus(state.notes, step.to, today)
        const current = course.step === step
        const words = step.words ? officialWords.filter(w => w.level >= step.words![0] && w.level <= step.words![1]) : []
        const known = words.filter(w => seen.has(wordKey(w.en))).length
        const units = step.units ? Math.max(0, Math.min(step.units[1] + 1, state.curriculum.unit) - step.units[0]) : 0
        return <li key={step.to} className="ll-step" data-state={s.state} data-current={current || undefined} data-optional={step.optional || undefined}>
          <div className="ll-rung" aria-hidden="true"><b>{step.to}</b></div>
          <div className="ll-body">
            <header>
              <h3>{step.from} → {step.to}{step.optional ? '（選修）' : ''}{current ? <small>現在在這一段</small> : null}</h3>
              <p className="ll-status">{statusLine(s, step, today)}</p>
            </header>
            <p className="ll-meta">{step.optional ? step.target : '預估 ' + step.target} · 參考時數 {step.hours}（Cambridge 估的有老師帶的時數，自己讀通常要更多）</p>
            <p className="ll-meta">教材：{step.practice}</p>
            {step.units && <div className="ll-bar"><span>每日課 {units} / {step.units[1] - step.units[0] + 1} 單元（單元 {step.units[0]}–{step.units[1]}）</span>
              <progress max={step.units[1] - step.units[0] + 1} value={units} /></div>}
            {step.words && <div className="ll-bar"><span>7000 單第 {step.words[0]}–{step.words[1]} 級：看過 {known} / {words.length} 個{step.wordsBy ? ' · 計畫的目標：' + step.wordsBy : ''}{step.wordsForecast ? '；照現在的複習規則推算：' + step.wordsForecast + '（每天都開到週日不開）' : ''}</span>
              <progress max={words.length} value={known} /></div>}
            <details className="ll-exams"><summary>怎麼考、多少錢</summary>
              {step.exams.filter(id => id !== 'other').map(id => { const e = exams[id]; return <div key={id} className="ll-exam">
                <strong>{e.name}</strong>
                <span>{e.how}；{e.sessions}</span>
                {id === 'ielts' && step.ielts
                  ? <span>本課程升級門檻為學術組總分 {step.ielts}。<a href="https://ielts.org/organisations/ielts-for-organisations/compare-ielts/ielts-and-the-cefr" target="_blank" rel="noopener noreferrer">IELTS 與 CEFR 的整體分數參照</a></span>
                  : <span>通過標準為 {e.pass}</span>}
                {e.fee && <span>報名費：{e.fee}</span>}
                {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer">官網</a>}
              </div> })}
              <small>費用和場次是 2026 年 11 月查的，報名前以官網為準。</small>
            </details>
            {s.attempts.length > 0 && <ul className="ll-attempts">
              {s.attempts.map(a => <li key={a.id}>
                <span>{md(a.date)} · {exams[a.exam].name}{legacyElementary(a) ? '（舊版合併紀錄）' : a.parts ? '（' + partNames[a.parts] + '）' : ''} · {resultLine(a)}</span>
                {legacyElementary(a) && <small>初級分開考聽讀、說寫。請核對舊紀錄，依成績單各自登錄正式考次，這筆保留供查看。</small>}
                {a.band && !ieltsBandCheck(a.band).valid && <small>成績待核對，暫停採計。請依成績單更正。</small>}
                {((waiting(a) && a.date <= today && !legacyElementary(a)) || editScore === a.id) &&
                  <ScoreForm attempt={a} busy={busy} onEditing={() => setEditScore(a.id)}
                    onSave={(x, originalBand) => save(step.to, x, false, originalBand)} />}
                {a.band && editScore !== a.id && <button type="button" disabled={busy} onClick={() => setEditScore(a.id)}>更正成績</button>}
                {a.band && editScore === a.id && <button type="button" disabled={busy} onClick={() => setEditScore(null)}>取消更正</button>}
                {waiting(a) && a.date > today && <small>考完、成績出來再回來填。</small>}
                {gept(a.exam) && !legacyElementary(a) && (editRegistration === a.id
                  ? <RegisterDate key={'date-' + a.id} attempt={a} busy={busy} onSave={date => register(step.to, a.id, date)} onCancel={() => setEditRegistration(null)} />
                  : <button type="button" disabled={busy} onClick={() => setEditRegistration(a.id)}>
                    {a.registeredOn ? '報名日 ' + md(a.registeredOn) + ' · 更正' : '補登實際報名日'}
                  </button>)}
                <button type="button" disabled={busy} className="ll-remove" onClick={() => void change(notes => removeAttempt(notes, step.to, a.id))}>刪掉這筆</button>
              </li>)}
            </ul>}
            {booking === step.to
              ? <Booking step={step} busy={busy} onSave={a => save(step.to, a, true)} />
              : s.state !== 'passed'
                ? <button type="button" className="ll-add" onClick={() => setBooking(step.to)}>＋ 報名了，填考試日期</button>
                // Passed stays passed; a new sitting (an IELTS score that runs out for VisaScreen) can still be added.
                : <button type="button" className="ll-add ll-again" onClick={() => setBooking(step.to)}>＋ 又報名了一場（例如雅思要重考）</button>}
          </div>
        </li>
      })}
    </ol>
  </div>
}

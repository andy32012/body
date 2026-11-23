import { useState } from 'react'
import type { PageProps } from '../lib/store'
import { dayKey } from '../lib/progress'
import {
  certStatus, courseProgress, exams, levelIds, lrPass, officialLevel, removeAttempt, saveAttempt, steps, swPass, visaScreen, waiting,
  type CertAttempt, type CertStatus, type ExamId, type LevelId, type Step,
} from '../lib/cefr'
import { officialWords, wordKey } from '../lib/vocab'
import './level-ladder.css'

const md = (d: string) => d.slice(0, 4) + '/' + d.slice(5, 7) + '/' + d.slice(8)
const isGept = (e: ExamId) => e === 'gept-a2' || e === 'gept-b1' || e === 'gept-b2'
const partNames = { lr: '聽讀', sw: '說寫', both: '聽讀＋說寫（一日考）' } as const

function statusLine(s: CertStatus, step: Step) {
  const exam = exams[step.exams[0]].name
  if (s.state === 'passed') return '✓ 通過，升到 ' + step.to + (s.passedOn ? '（' + md(s.passedOn) + '）' : '')
  if (s.state === 'waiting' && s.next) return '等成績：' + exams[s.next.exam].name + ' ' + md(s.next.date) + (s.lr ? '（聽讀已過）' : s.sw ? '（說寫已過）' : '') + ' · 下一段先讀'
  if (s.state === 'partial') return (s.lr ? '聽讀過了，還差說寫' : '說寫過了，還差聽讀') + ' · 報名下一場才能接著上'
  if (s.state === 'failed') return '這次沒過 · 補最弱的那一項，報名下一場才能接著上'
  return '還沒報名' + exam
}
/** What a filled-in result says, part by part. */
function resultLine(a: CertAttempt) {
  if (waiting(a)) return '等成績'
  if (isGept(a.exam)) return [
    a.lr && (lrPass(a.lr) ? '聽讀過' : '聽讀沒過（聽 ' + a.lr[0] + '、讀 ' + a.lr[1] + '）'),
    a.sw && (swPass(a.exam, a.sw) ? '說寫過' : '說寫沒過（寫 ' + a.sw[0] + '、說 ' + a.sw[1] + '）'),
  ].filter(Boolean).join('、')
  if (a.exam === 'ielts' && a.band) return '總分 ' + a.band.overall + (a.band.speaking !== undefined ? '、口說 ' + a.band.speaking : '')
  return (a.otherName ? a.otherName + ' ' : '') + (a.otherLevel ? a.otherLevel + ' ' : '') + (a.passed ? '通過' : '沒過')
}

function ScoreForm({ attempt, onSave }: { attempt: CertAttempt; onSave: (a: CertAttempt) => void }) {
  const [v, setV] = useState<Record<string, string>>({})
  const num = (k: string) => Number(v[k])
  const field = (k: string, label: string, max: number, step = 1) => <label key={k}>{label}
    <input type="number" inputMode="decimal" min={0} max={max} step={step} value={v[k] ?? ''} onChange={e => setV({ ...v, [k]: e.target.value })} /></label>
  const okRange = (k: string, max: number, step = 1) => v[k] !== undefined && v[k] !== '' && num(k) >= 0 && num(k) <= max && Number.isInteger(num(k) / step)
  if (isGept(attempt.exam)) {
    const lr = attempt.parts !== 'sw', sw = attempt.parts !== 'lr'
    const ready = (!lr || (okRange('l', 120) && okRange('r', 120))) && (!sw || (okRange('w', 100) && okRange('s', 100)))
    return <div className="ll-score">
      {lr && <>{field('l', '聽力（滿分 120）', 120)}{field('r', '閱讀（滿分 120）', 120)}</>}
      {sw && <>{field('w', '寫作（滿分 100）', 100)}{field('s', '口說（滿分 100）', 100)}</>}
      <button type="button" disabled={!ready} onClick={() => onSave({ ...attempt, ...(lr ? { lr: [num('l'), num('r')] as [number, number] } : {}), ...(sw ? { sw: [num('w'), num('s')] as [number, number] } : {}) })}>記下成績</button>
    </div>
  }
  if (attempt.exam === 'ielts') {
    const ready = okRange('o', 9, 0.5) && ['li', 're', 'wr', 'sp'].every(k => !v[k] || okRange(k, 9, 0.5))
    const opt = (k: string) => v[k] ? num(k) : undefined
    return <div className="ll-score">
      {field('o', '總分', 9, 0.5)}{field('li', '聽', 9, 0.5)}{field('re', '讀', 9, 0.5)}{field('wr', '寫', 9, 0.5)}{field('sp', '說', 9, 0.5)}
      <button type="button" disabled={!ready} onClick={() => onSave({ ...attempt, band: { overall: num('o'), listening: opt('li'), reading: opt('re'), writing: opt('wr'), speaking: opt('sp') } })}>記下成績</button>
    </div>
  }
  return <div className="ll-score">
    <button type="button" onClick={() => onSave({ ...attempt, passed: true })}>通過了</button>
    <button type="button" onClick={() => onSave({ ...attempt, passed: false })}>沒過</button>
  </div>
}

function Booking({ step, onSave }: { step: Step; onSave: (a: CertAttempt) => void }) {
  const [exam, setExam] = useState<ExamId>(step.exams[0])
  const [parts, setParts] = useState<'lr' | 'sw' | 'both'>('lr')
  const [date, setDate] = useState('')
  const [otherName, setOtherName] = useState('')
  const [otherLevel, setOtherLevel] = useState<LevelId>(step.to)
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && (exam !== 'other' || otherName.trim())
  return <div className="ll-book">
    <label>考哪一個
      <select value={exam} onChange={e => setExam(e.target.value as ExamId)}>{step.exams.map(id => <option key={id} value={id}>{exams[id].name}</option>)}</select>
    </label>
    {isGept(exam) && <label>這次考
      <select value={parts} onChange={e => setParts(e.target.value as 'lr' | 'sw' | 'both')}>{(Object.keys(partNames) as (keyof typeof partNames)[]).map(p => <option key={p} value={p}>{partNames[p]}</option>)}</select>
    </label>}
    {exam === 'other' && <>
      <label>證照名稱<input value={otherName} onChange={e => setOtherName(e.target.value)} placeholder="例如：劍橋 A2 Key" /></label>
      <label>成績單上的 CEFR<select value={otherLevel} onChange={e => setOtherLevel(e.target.value as LevelId)}>{levelIds.map(l => <option key={l} value={l}>{l}</option>)}</select></label>
    </>}
    <label>考試日期<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    <button type="button" disabled={!ok} onClick={() => onSave({
      id: date + '-' + exam + '-' + Date.now().toString(36), exam, date,
      ...(isGept(exam) ? { parts } : {}), ...(exam === 'other' ? { otherName: otherName.trim(), otherLevel } : {}),
    })}>報名了，記下來</button>
  </div>
}

/** 英文程度：A1 → C2, the certificate that moves each level up, and where the daily lessons are. */
export default function LevelLadder({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const level = officialLevel(state.notes)
  const course = courseProgress(state.curriculum.unit)
  const visa = visaScreen(state.notes)
  const seen = new Set([...state.knownWords, ...state.learningWords].map(wordKey))
  const [booking, setBooking] = useState<LevelId | null>(null)
  const today = dayKey()
  const save = (to: LevelId, a: CertAttempt) => { update(prev => ({ ...prev, notes: saveAttempt(prev.notes, to, a) })); setBooking(null) }
  return <div className="ll">
    <section className="ll-head">
      <h2>英文程度階梯</h2>
      <p className="ll-now">證照上的程度 <b>{level}</b> · 每日課正在上 <b>{course.step.from}→{course.step.to}</b>
        {course.total ? '（單元 ' + Math.min(course.done + 1, course.total) + ' / ' + course.total + '）' : '（這一段的每日課還在寫）'}</p>
      <p>每天：週一到週六 1.5 小時，寒假 3–4 小時；實習時 20–30 分鐘護理英文，國考衝刺 15 分鐘。每一級最後考一張證照，考過才算升級。報名後填上考試日期，就能先讀下一段，等成績也不用停；沒過就補最弱的那一項，報名下一場再繼續。7000 單的日期是照每天打開今日單字（週日也開）、看 20 個新字、先做複習算的；週日沒開會晚 1–7 個月，第 4 級會拖進實習期間。每天看幾個可以在「設定 → 我的學習節奏」改。</p>
      {visa ? <p className="ll-visa">✓ 美國 RN 的 VisaScreen 英文達標（雅思 {md(visa.date)}）。雅思成績一般兩年有效，大約 {md(visa.until)} 前要送件。</p>
        : <p className="ll-goal">美國 RN 的 VisaScreen 要雅思學術組總分 6.5、口說 7：整體 B2 以上、口說到 C1。</p>}
    </section>
    <ol className="ll-steps">
      {steps.map(step => {
        const s = certStatus(state.notes, step.to)
        const current = course.step === step
        const words = step.words ? officialWords.filter(w => w.level >= step.words![0] && w.level <= step.words![1]) : []
        const known = words.filter(w => seen.has(wordKey(w.en))).length
        const units = step.units ? Math.max(0, Math.min(step.units[1] + 1, state.curriculum.unit) - step.units[0]) : 0
        return <li key={step.to} className="ll-step" data-state={s.state} data-current={current || undefined} data-optional={step.optional || undefined}>
          <div className="ll-rung" aria-hidden="true"><b>{step.to}</b></div>
          <div className="ll-body">
            <header>
              <h3>{step.from} → {step.to}{step.optional ? '（選修）' : ''}{current ? <small>現在在這一段</small> : null}</h3>
              <p className="ll-status">{statusLine(s, step)}</p>
            </header>
            <p className="ll-meta">{step.optional ? step.target : '預估 ' + step.target} · 參考時數 {step.hours}（Cambridge 估的有老師帶的時數，自己讀通常要更多）</p>
            <p className="ll-meta">教材：{step.practice}</p>
            {step.units && <div className="ll-bar"><span>每日課 {units} / {step.units[1] - step.units[0] + 1} 單元（單元 {step.units[0]}–{step.units[1]}）</span>
              <progress max={step.units[1] - step.units[0] + 1} value={units} /></div>}
            {step.words && <div className="ll-bar"><span>7000 單第 {step.words[0]}–{step.words[1]} 級：看過 {known} / {words.length} 個{step.wordsBy ? ' · 照計畫' + step.wordsBy : ''}</span>
              <progress max={words.length} value={known} /></div>}
            <details className="ll-exams"><summary>怎麼考、多少錢</summary>
              {step.exams.filter(id => id !== 'other').map(id => { const e = exams[id]; return <div key={id} className="ll-exam">
                <strong>{e.name}</strong>
                <span>{e.how}；{e.sessions}</span>
                <span>及格：{id === 'ielts' && step.ielts ? '總分 ' + step.ielts + ' 以上算 ' + step.to + '。' + (step.to === 'C1' ? 'VisaScreen 要總分 6.5、口說 7。' : '') : e.pass}</span>
                {e.fee && <span>報名費：{e.fee}</span>}
                {e.link && <a href={e.link} target="_blank" rel="noopener noreferrer">官網</a>}
              </div> })}
              <small>費用和場次是 2026 年 11 月查的，報名前以官網為準。</small>
            </details>
            {s.attempts.length > 0 && <ul className="ll-attempts">
              {s.attempts.map(a => <li key={a.id}>
                <span>{md(a.date)} · {exams[a.exam].name}{a.parts ? '（' + partNames[a.parts] + '）' : ''} · {resultLine(a)}</span>
                {waiting(a) && a.date <= today && <ScoreForm attempt={a} onSave={x => save(step.to, x)} />}
                {waiting(a) && a.date > today && <small>考完、成績出來再回來填。</small>}
                <button type="button" className="ll-remove" onClick={() => update(prev => ({ ...prev, notes: removeAttempt(prev.notes, step.to, a.id) }))}>刪掉這筆</button>
              </li>)}
            </ul>}
            {s.state !== 'passed' && (booking === step.to
              ? <Booking step={step} onSave={a => save(step.to, a)} />
              : <button type="button" className="ll-add" onClick={() => setBooking(step.to)}>＋ 報名了，填考試日期</button>)}
          </div>
        </li>
      })}
    </ol>
  </div>
}

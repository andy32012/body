import { useRef, useState } from 'react'
import { updateStoreNow, type PageProps } from '../lib/store'
import { dayKey } from '../lib/progress'
import { addMock, officialPractice, overallBand, readMocks, skillNames, skills, validBand, type MockEntry, type MockSkill } from '../lib/ieltsMock'

const bands = Array.from({ length: 19 }, (_, i) => i / 2)
const slash = (d: string) => d.split('-').join('/')

/** Under the month goals that ask for IELTS listening or full mocks: the official practice tests (all four parts, real
 *  question types) and a log of each full mock — date, the four bands, timed or not, a redo or not. */
export default function IeltsMockLog({ state }: Pick<PageProps, 'state'>) {
  const [day, setDay] = useState(() => dayKey())
  const [scores, setScores] = useState<Partial<Record<MockSkill, number>>>({})
  const [timed, setTimed] = useState(true)
  const [redo, setRedo] = useState(false)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const list = readMocks(state.notes)
  const any = skills.some(s => validBand(scores[s]))
  async function save() {
    if (!any || inFlight.current) return
    const entry: MockEntry = { day, timed, redo, ...scores }
    const overall = overallBand(scores)
    inFlight.current = true
    setSaving(true); setError(''); setSaved('')
    try {
      await updateStoreNow(prev => {
        const notes = addMock(prev.notes, entry)
        if (notes === prev.notes) throw new Error('請填有效的日期和至少一科分數。')
        return { ...prev, notes }
      })
      setScores({}); setRedo(false)
      setSaved('存好了：' + slash(day) + (overall !== undefined ? '，總分 ' + overall.toFixed(1) : ''))
    } catch (error) {
      setError(error instanceof Error ? error.message : '這次模考未儲存，請重試。')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }
  return <details className="pl-mock">
    <summary>雅思模考：官方練習題・記下四科分數{list.length ? '（已記 ' + list.length + ' 次）' : ''}</summary>
    <p className="pl-mock-note">正式考試：聽力四段 40 題、錄音只播一次；閱讀三篇 40 題；寫作 Task 1、Task 2；口說 Part 1、2、3。用官方的練習題照考試時間做完，再把分數記在這裡。</p>
    <div className="pr-actions pl-mock-links">
      {officialPractice.map(p => <a key={p.url} className="pr-link" href={p.url} target="_blank" rel="noreferrer">{p.name}（外部網站）</a>)}
      <a className="pr-link" href="#speaking/ielts">口說 Part 2、3：跟 Emma 練</a>
    </div>
    <form className="pl-mock-form" onSubmit={e => { e.preventDefault(); void save() }}>
      <label>日期<input type="date" disabled={saving} value={day} onChange={e => { if (e.target.value) setDay(e.target.value) }} /></label>
      {skills.map(s => <label key={s}>{skillNames[s]}
        <select disabled={saving} value={scores[s] ?? ''} onChange={e => { const v = e.target.value; setScores(p => ({ ...p, [s]: v === '' ? undefined : Number(v) })) }}>
          <option value="">沒考</option>{bands.map(b => <option key={b} value={b}>{b.toFixed(1)}</option>)}
        </select></label>)}
      <label className="pl-mock-check"><input type="checkbox" disabled={saving} checked={timed} onChange={e => setTimed(e.target.checked)} />照考試時間計時</label>
      <label className="pl-mock-check"><input type="checkbox" disabled={saving} checked={redo} onChange={e => setRedo(e.target.checked)} />這份以前做過（重做）</label>
      <button type="submit" className="pr-main" disabled={!any || saving}>{saving ? '儲存中…' : '存這次模考'}</button>
      {error && <small role="alert">{error}</small>}
      {saved && <small role="status">{saved}</small>}
    </form>
    {list.length > 0 && <ol className="pl-mock-list">{list.slice(0, 12).map((m, i) => {
      const overall = overallBand(m)
      return <li key={m.day + '.' + i}><b>{slash(m.day)}</b> {skills.filter(s => m[s] !== undefined).map(s => skillNames[s] + ' ' + m[s]!.toFixed(1)).join('、') || '沒有分數'}
        {overall !== undefined && <> · 總分 <b>{overall.toFixed(1)}</b></>} <small>{m.timed ? '計時' : '沒計時'}{m.redo ? '・重做' : ''}</small></li>
    })}</ol>}
  </details>
}

import { useState } from 'react'
import type { PageProps } from '../lib/store'
import curriculum from '../data/curriculum.json'
import { dayKey } from '../lib/progress'
import { handoffText } from '../lib/handoff'
import { markAssisted } from '../lib/grammarRetention'

export default function AIHandoff({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  const today = dayKey()
  // Past the last published unit (course finished) the picker shows the last one.
  const [unit, setUnit] = useState(Math.min(curriculum.units[curriculum.units.length - 1].id, state.curriculum.unit))
  const [day, setDay] = useState(state.curriculum.day)
  const [copied, setCopied] = useState('')
  const [saved, setSaved] = useState('')
  const text = handoffText(state, today)
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied('已複製，貼到其他 AI 的對話框就好。') }
    catch { setCopied('請長按下方文字全選，再複製。') }
  }
  return <>
    <p>想讓別的 AI 接著教你時，按「複製交接內容」貼過去。內容依這台裝置的紀錄自動產生：現在做到哪一天、最近做過的句子、哪些文法還常錯，還有你要的教法。</p>
    <p>在別的地方上過課，就在這裡把進度改成做到的地方，網站才會接得上。跳過的單元不會直接算「穩了」，之後的回想會各出一句讓你自己寫，寫對才算。</p>
    <div className="set-dates">
      <label>單元<select id="handoff-unit" value={unit} onChange={e => setUnit(Number(e.target.value))}>
        {curriculum.units.map(u => <option key={u.id} value={u.id}>{u.id}．{u.title}</option>)}
      </select></label>
      <label>第幾天<select id="handoff-day" value={day} onChange={e => setDay(Number(e.target.value))}>
        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>第 {n} 天{n === 6 ? '（小關卡）' : ''}</option>)}
      </select></label>
    </div>
    <button type="button" onClick={() => {
      // Units done elsewhere move the cursor but are not 「穩了」 here: each waits for an unaided recheck first.
      update(prev => {
        let notes = prev.notes
        for (let id = 1; id < unit; id++) if (!prev.curriculum.stableUnits.includes(id) && !notes['unit-assisted.' + id]) notes = markAssisted(notes, id, today)
        return { ...prev, notes, curriculum: { ...prev.curriculum, unit, day, retry: 0, stableUnits: prev.curriculum.stableUnits.filter(id => id < unit) } }
      })
      setSaved('已設定：下一次從單元 ' + unit + ' 第 ' + day + ' 天開始。')
    }}>把進度設成這一天</button>
    <small role="status">{saved}</small>
    <div className="set-actions"><button type="button" onClick={copy}>複製交接內容</button></div>
    <small role="status">{copied}</small>
    <textarea id="handoff-text" aria-label="交接內容" readOnly rows={12} value={text} onFocus={e => e.target.select()} />
  </>
}

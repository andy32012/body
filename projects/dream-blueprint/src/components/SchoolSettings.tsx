import { useState } from 'react'
import { defaultSchool, makeSchoolId, weekdays, type SchoolClass, type SchoolData } from '../lib/school'
import './school-settings.css'

type SchoolEvent = SchoolData['events'][number]
type Requirement = SchoolData['requirements'][number]

interface Props {
  school: SchoolData
  onChange: (school: SchoolData) => void
  regularDays?: number[]
}
const emptyClass = { id: '', weekday: 1, start: '', end: '', label: '' }
const emptyEvent = { id: '', day: '', label: '', kind: '考試' }
const emptyRequirement = { id: '', group: '畢業條件', label: '', done: false }
const numberFields = [
  ['requiredCredits', '畢業學分'], ['acceptedCredits', '已採計學分'], ['transferCourses', '抵免科數'],
  ['currentCourses', '本學期科數'], ['currentCredits', '本學期學分'], ['weeklyPeriods', '每週節數']
] as const
const textFields = [
  ['schoolName', '學校'], ['program', '學制與科系'], ['className', '班級'], ['studentStatus', '身分'],
  ['term', '學期'], ['graduation', '預計畢業時間']
] as const
function replaceRow<T extends { id: string }>(items: T[], row: T) {
  if (!row.id) return [...items, { ...row, id: makeSchoolId() }]
  return items.map(item => item.id === row.id ? row : item)
}
function DaySelector({ value, change }: { value: number; change: (value: number) => void }) {
  return <select aria-label="星期" value={value} onChange={e => change(Number(e.target.value))}>
    {weekdays.map((label, i) => <option key={label} value={i}>週{label}</option>)}
  </select>
}

export default function SchoolSettings({ school = defaultSchool, onChange }: Props) {
  const [lesson, setLesson] = useState<SchoolClass>(emptyClass)
  const [event, setEvent] = useState<SchoolEvent>(emptyEvent)
  const [requirement, setRequirement] = useState<Requirement>(emptyRequirement)
  const [studyDay, setStudyDay] = useState(1)
  const slot = school.study.find(s => s.weekday === studyDay) ?? { weekday: studyDay, minutes: 0, time: '' }
  const setSlot = (patch: Partial<typeof slot>) => onChange({ ...school, study: [
    ...school.study.filter(s => s.weekday !== studyDay), { ...slot, ...patch }
  ].sort((a, b) => a.weekday - b.weekday) })
  const groups = Array.from(new Set(school.requirements.map(item => item.group)))
  const invalidTimes = !!(lesson.start && lesson.end && lesson.start >= lesson.end)
  function saveLesson() {
    if (!lesson.label.trim() || invalidTimes) return
    onChange({ ...school, classes: replaceRow(school.classes, { ...lesson, label: lesson.label.trim() }) })
    setLesson(emptyClass)
  }
  function saveEvent() {
    if (!event.label.trim() || !event.day) return
    onChange({ ...school, events: replaceRow(school.events, { ...event, label: event.label.trim() })
      .sort((a, b) => a.day.localeCompare(b.day)) })
    setEvent(emptyEvent)
  }
  function saveRequirement() {
    if (!requirement.group.trim() || !requirement.label.trim()) return
    onChange({ ...school, requirements: replaceRow(school.requirements, {
      ...requirement, group: requirement.group.trim(), label: requirement.label.trim()
    }) })
    setRequirement(emptyRequirement)
  }
  return <section className="school-settings" aria-label="學校資料與時段">
    <details><summary>學籍與學分</summary>
      <p>原始資料依 {school.verifiedOn} 的校務系統查詢。可以在這裡更新學期與畢業條件。</p>
      <div className="school-grid">{textFields.map(([field, title]) =>
        <label key={field}>{title}<input value={school[field]} onChange={e => onChange({ ...school, [field]: e.target.value })}/></label>
      )}{numberFields.map(([field, title]) =>
        <label key={field}>{title}<input type="number" min="0" step="1" value={school[field]}
          onChange={e => onChange({ ...school, [field]: Math.max(0, Math.floor(Number(e.target.value))) })}/></label>
      )}</div>
      <h4>查詢當時的實習安排</h4><ul>{school.notes.map(note => <li key={note}>{note}</li>)}</ul>
    </details>
    <details><summary>每週課表與讀書時段</summary>
      {school.classes.length === 0 && <p>尚未填入上課時段。可以先加今天的第一堂課。</p>}
      <ul className="school-list">{[...school.classes].sort((a,b) => a.weekday-b.weekday || a.start.localeCompare(b.start)).map(c =>
        <li key={c.id}><span>週{weekdays[c.weekday]} {c.start}{c.end && '–' + c.end} {c.label}</span>
          <button type="button" aria-label={'編輯' + c.label} onClick={() => setLesson(c)}>編輯</button>
          <button type="button" aria-label={'移除' + c.label} onClick={() => { onChange({ ...school, classes: school.classes.filter(x => x.id !== c.id) }); if (lesson.id === c.id) setLesson(emptyClass) }}>移除</button></li>
      )}</ul>
      <div className="school-form">
        <h4>{lesson.id ? '修改這堂課' : '新增課程時段'}</h4>
        <div className="school-grid"><label>課名<input value={lesson.label} onChange={e => setLesson({ ...lesson, label: e.target.value })}/></label>
          <label>上課日<DaySelector value={lesson.weekday} change={weekday => setLesson({ ...lesson, weekday })}/></label>
          <label>開始時間<input type="time" value={lesson.start} onChange={e => setLesson({ ...lesson, start: e.target.value })}/></label>
          <label>結束時間<input type="time" value={lesson.end} onChange={e => setLesson({ ...lesson, end: e.target.value })}/></label></div>
        {invalidTimes && <small role="status">結束時間需晚於開始時間。</small>}
        <button type="button" disabled={!lesson.label.trim() || invalidTimes} onClick={saveLesson}>{lesson.id ? '儲存課程' : '加入課表'}</button>
        {lesson.id && <button type="button" onClick={() => setLesson(emptyClass)}>取消編輯</button>}
      </div>
      <h4>每週可用的英文時段</h4><p>選一天修改。分鐘填 0 即為休息日。</p>
      <div className="school-grid"><label>選擇日期<DaySelector value={studyDay} change={setStudyDay}/></label>
        <label>開始時間（選填）<input type="time" value={slot.time} onChange={e => setSlot({ time: e.target.value })}/></label>
        <label>可用分鐘<input type="number" min="0" max="1440" value={slot.minutes} onChange={e => setSlot({ minutes: Math.min(1440, Math.max(0, Math.floor(Number(e.target.value)))) })}/></label>
      </div>
    </details>
    <details><summary>考試與學校行事曆</summary>
      <ul className="school-list">{[...school.events].sort((a,b) => a.day.localeCompare(b.day)).map(e =>
        <li key={e.id}><span><time>{e.day}</time> {e.label}</span><button type="button" aria-label={'編輯' + e.label} onClick={() => setEvent(e)}>編輯</button>
          <button type="button" aria-label={'移除' + e.label} onClick={() => { onChange({ ...school, events: school.events.filter(x => x.id !== e.id) }); if (event.id === e.id) setEvent(emptyEvent) }}>移除</button></li>
      )}</ul>
      <div className="school-grid"><label>日期<input type="date" value={event.day} onChange={e => setEvent({ ...event, day: e.target.value })}/></label>
        <label>類型<select value={event.kind} onChange={e => setEvent({ ...event, kind: e.target.value })}>{['考試','實習','假期','其他'].map(k => <option key={k}>{k}</option>)}</select></label>
        <label>事項<input placeholder="例如：基護實習報到" value={event.label} onChange={e => setEvent({ ...event, label: e.target.value })}/></label></div>
      <button type="button" disabled={!event.day || !event.label.trim()} onClick={saveEvent}>{event.id ? '儲存事項' : '新增事項'}</button>
      {event.id && <button type="button" onClick={() => setEvent(emptyEvent)}>取消編輯</button>}
    </details>
    <details><summary>修課清單與畢業條件</summary>
      <p>勾選結果會同步到航線地圖第一站。學分數可在學籍欄依學校採計結果更新。</p>
      {groups.map(group => <details key={group}><summary>{group} · {school.requirements.filter(item => item.group === group && item.done).length}／{school.requirements.filter(item => item.group === group).length}</summary>
        <ul className="school-list">{school.requirements.filter(item => item.group === group).map(item => <li key={item.id}>
          <label className="school-check"><input type="checkbox" checked={item.done} onChange={() => onChange({ ...school, requirements: replaceRow(school.requirements, { ...item, done: !item.done }) })}/>{item.label}</label>
          <button type="button" aria-label={'編輯' + item.label} onClick={() => setRequirement(item)}>編輯</button>
        </li>)}</ul></details>)}
      <div className="school-grid"><label>所屬分類<input list="school-groups" value={requirement.group} onChange={e => setRequirement({ ...requirement, group: e.target.value })}/></label>
        <datalist id="school-groups">{groups.map(group => <option key={group} value={group}/>)}</datalist>
        <label>科目或條件<input value={requirement.label} onChange={e => setRequirement({ ...requirement, label: e.target.value })}/></label></div>
      <button type="button" disabled={!requirement.label.trim() || !requirement.group.trim()} onClick={saveRequirement}>{requirement.id ? '儲存條件' : '新增條件'}</button>
      {requirement.id && <><button type="button" onClick={() => { onChange({ ...school, requirements: school.requirements.filter(item => item.id !== requirement.id) }); setRequirement(emptyRequirement) }}>移除此項</button>
        <button type="button" onClick={() => setRequirement(emptyRequirement)}>取消編輯</button></>}
    </details>
  </section>
}

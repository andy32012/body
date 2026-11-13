import { useRef, useState } from 'react'
import map from '../data/roadmap.json'
import type { PageProps } from '../lib/store'
import './roadmap.css'

const milestones = ['學校課程', '台灣執照', '紐約申請', '護理考試', '英文檢定', '臨床求職', '職業移民', '抵達美國']

export default function Roadmap({ state, update, navigate }: PageProps) {
  const [selected, select] = useState(1)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const station = map.stations[selected - 1]
  const { school } = state
  const groups = [...new Set(school.requirements.map(item => item.group))]

  function showStation(id: number) {
    select(id)
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  function toggleCheck(key: string) {
    update(prev => ({ ...prev, checks: { ...prev.checks, [key]: !prev.checks[key] } }))
  }

  function toggleCourse(id: string) {
    update(prev => ({
      ...prev,
      school: {
        ...prev.school,
        requirements: prev.school.requirements.map(item =>
          item.id === id ? { ...item, done: !item.done } : item)
      }
    }))
  }

  return <section className="rn-map" aria-label="赴美護理師路線地圖">
    <p className="rn-map-note">資料最後核對日期：{map.verified}。規定和分數會改，報名前一定要回官方網站再看一次。</p>
    <nav className="rn-orbits" aria-label="選擇路線站點">
      {map.stations.map((item, index) =>
        <button type="button" key={item.id} aria-current={selected === item.id ? 'step' : undefined} onClick={() => showStation(item.id)}>
          <span className="rn-planet" aria-hidden="true">{String(item.id).padStart(2, '0')}</span>
          {milestones[index]}
        </button>
      )}
    </nav>
    <article className="rn-panel">
      <header>
        <small>第 {selected} 站 ／ 共 8 站</small>
        <h3 ref={titleRef} tabIndex={-1}>{station.title}</h3>
        {station.expectation && <p><strong>{station.expectation}</strong></p>}
        <p>{station.description}</p>
      </header>
      {selected === 1 && <>
        <p className="rn-credits">已採計 <strong>{school.acceptedCredits}</strong> ／ {school.requiredCredits} 學分</p>
        <p>畢業時間：{school.graduation}</p>
        <div className="rn-step">
          <b>基護安排</b>
          <p>{state.settings.internshipSeason}</p>
          {state.settings.officeReply && <p>{state.settings.officeReply}</p>}
          <button type="button" onClick={() => navigate('settings')}>編輯學校資料</button>
        </div>
        <h4>課程與畢業條件</h4>
        {groups.map(group => {
          const items = school.requirements.filter(item => item.group === group)
          const done = items.filter(item => item.done).length
          return <details key={group} className="rn-group">
            <summary>{group} <span>{done} ／ {items.length}</span></summary>
            {items.map(item => <label key={item.id} className="rn-check">
              <input type="checkbox" checked={item.done} onChange={() => toggleCourse(item.id)} />
              {item.label}
            </label>)}
          </details>
        })}
      </>}
      {station.scores && <details className="rn-group">
        <summary>六種英文檢定的 RN 最低分數</summary>
        <dl className="rn-scores">{station.scores.map(([exam, score]) => <div key={exam}><dt>{exam}</dt><dd>{score}</dd></div>)}</dl>
      </details>}
      {station.tasks.length > 0 && <><h4>這一站的待辦</h4>
        {station.tasks.map((task, i) => {
          const key = 'roadmap.' + station.id + '.' + (i + 1)
          return <label key={key} className="rn-check"><input type="checkbox" checked={Boolean(state.checks[key])} onChange={() => toggleCheck(key)} />{task}</label>
        })}
      </>}
      <h4>費用</h4><p>{station.fees}</p>
      <h4>可以同時準備</h4>
      <div className="rn-related">{station.parallel.map(id => <button type="button" onClick={() => showStation(id)} key={id}>第 {id} 站・{milestones[id - 1]}</button>)}</div>
      <h4>核對來源</h4><ul className="rn-links">{station.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title} ↗</a></li>)}</ul>
    </article>
  </section>
}

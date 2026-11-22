import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/store'
import { markSkill, skillSummary, skills, type Skill } from '../lib/wordSkills'
import { wordKey } from '../lib/vocab'
import { countNurseWord, nurseWordsOn, type NurseWord } from '../lib/nursing'
import WordSkills from './WordSkills'

const ALL = '全部'

/** The nursing word list, drilled 10 at a time: 看懂 / 聽懂 / 說出 / 寫出, by area. Each answer shows an example sentence. */
export default function NursingWords({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const [all, setAll] = useState<NurseWord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [skill, setSkill] = useState<Skill>('read')
  const [area, setArea] = useState(ALL)
  useEffect(() => {
    let alive = true
    import('../data/nursing-words.json').then(f => { if (alive) setAll(f.default as NurseWord[]) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  if (failed) return <p>護理單字載入失敗，連上網路再試一次。</p>
  if (!all) return <p className="ls-help">載入護理單字……</p>
  const areas = [ALL, ...new Set(all.map(w => w.area))]
  const list = area === ALL ? all : all.filter(w => w.area === area)
  const count = skillSummary(state.notes, list.map(w => wordKey(w.en)))
  const today = nurseWordsOn(state.notes, date)
  return <div className="pr-stack ws-head">
    <div className="pr-options qz-tabs" role="group" aria-label="單字能力">
      {skills.map(([key, label]) => <button key={key} type="button" aria-pressed={skill === key} onClick={() => setSkill(key)}>{label}</button>)}
    </div>
    <label className="nw-area">範圍
      <select value={area} onChange={e => setArea(e.target.value)}>
        {areas.map(a => <option key={a} value={a}>{a === ALL ? '全部 ' + all.length + ' 個' : a}</option>)}
      </select>
    </label>
    <p className="qz-meta">
      <span>{area === ALL ? '護理單字' : area} {list.length} 個：</span>
      {skills.map(([key, label]) => <span key={key}>{label} {count[key]}</span>)}
      {today > 0 && <span>今天過關 {today} 個</span>}
    </p>
    <WordSkills key={skill + area} skill={skill} words={list} distractors={list.length >= 6 ? list : all} notes={state.notes}
      keyOf={w => wordKey(w.en)} rate={state.settings.speechRate}
      onPass={w => onActivity(prev => ({ ...prev, notes: countNurseWord(markSkill(prev.notes, wordKey(w.en), skill, date), date) }))} />
  </div>
}

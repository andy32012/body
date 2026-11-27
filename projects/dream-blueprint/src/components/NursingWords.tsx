import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/store'
import { markSkill, skillSummary, skills, type Skill } from '../lib/wordSkills'
import { nurseSkillKey } from '../lib/homographs'
import { countNurseWord, nurseWordsOn, type NurseWord } from '../lib/nursing'
import WordSkills, { type WordRound } from './WordSkills'

const ALL = '全部'
const resumeKey = 'dream.nursing-words.resume'
type NursingRound = { area: string; skill: Skill; round: WordRound }
let resumeInTab: NursingRound | undefined

function readNursingRound(): NursingRound | undefined {
  if (resumeInTab) return resumeInTab
  try {
    const data = JSON.parse(sessionStorage.getItem(resumeKey) ?? 'null') as NursingRound | null
    if (!data || typeof data.area !== 'string' || !skills.some(([id]) => id === data.skill)) return
    const r = data.round
    if (!r || !Array.isArray(r.order) || r.order.length > 10 || r.order.some(key => typeof key !== 'string') ||
        !Number.isInteger(r.index) || r.index < 0 || r.index >= r.order.length ||
        !Number.isInteger(r.passed) || r.passed < 0 || r.passed > r.index ||
        typeof r.answer !== 'string' || (r.pickedWord !== undefined && typeof r.pickedWord !== 'string') ||
        typeof r.shown !== 'boolean' || typeof r.heard !== 'boolean' || typeof r.helped !== 'boolean') return
    return data
  } catch { /* Session storage is optional. */ }
}

function clearNursingRound() {
  resumeInTab = undefined
  try { sessionStorage.removeItem(resumeKey) } catch { /* In-memory recovery still works. */ }
}

function keepNursingRound(data: NursingRound) {
  resumeInTab = data
  try { sessionStorage.setItem(resumeKey, JSON.stringify(data)) } catch { /* In-memory recovery still works. */ }
}

/** The nursing word list, drilled 10 at a time: 看懂 / 聽懂 / 說出 / 寫出, by area. Each answer shows an example sentence. */
export default function NursingWords({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const [all, setAll] = useState<NurseWord[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [resume, setResume] = useState(readNursingRound)
  const [skill, setSkill] = useState<Skill>(resume?.skill ?? 'read')
  const [area, setArea] = useState(resume?.area ?? ALL)
  useEffect(() => { if (all) clearNursingRound() }, [all])
  useEffect(() => {
    let alive = true
    import('../data/nursing-words.json').then(f => { if (alive) setAll(f.default as NurseWord[]) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  if (failed) return <p>護理單字載入失敗，連上網路再試一次。</p>
  if (!all) return <p className="ls-help">載入護理單字……</p>
  const areas = [ALL, ...new Set(all.map(w => w.area))]
  const currentArea = areas.includes(area) ? area : ALL
  const list = currentArea === ALL ? all : all.filter(w => w.area === currentArea)
  // pupil (瞳孔) is practised apart from the everyday pupil (學生): nurseSkillKey keeps their records separate.
  const count = skillSummary(state.notes, list.map(w => nurseSkillKey(w.en)))
  const today = nurseWordsOn(state.notes, date)
  return <div className="pr-stack ws-head">
    <div className="pr-options qz-tabs" role="group" aria-label="單字能力">
      {skills.map(([key, label]) => <button key={key} type="button" aria-pressed={skill === key} onClick={() => {
        if (key !== skill) { setResume(undefined); setSkill(key) }
      }}>{label}</button>)}
    </div>
    <label className="nw-area">範圍
      <select value={currentArea} onChange={e => { setResume(undefined); setArea(e.target.value) }}>
        {areas.map(a => <option key={a} value={a}>{a === ALL ? '全部 ' + all.length + ' 個' : a}</option>)}
      </select>
    </label>
    <p className="qz-meta">
      <span>{currentArea === ALL ? '護理單字' : currentArea} {list.length} 個：</span>
      {skills.map(([key, label]) => <span key={key}>{label} {count[key]}</span>)}
      {today > 0 && <span>今天過關 {today} 個</span>}
    </p>
    <WordSkills key={skill + currentArea} skill={skill} words={list} distractors={list.length >= 6 ? list : all} notes={state.notes}
      keyOf={w => nurseSkillKey(w.en)} rate={state.settings.speechRate} where="護理單字" side="nurse"
      resume={resume?.area === currentArea ? resume.round : undefined}
      onSuspend={round => keepNursingRound({ area: currentArea, skill, round })}
      onPass={w => onActivity(prev => ({ ...prev, notes: countNurseWord(markSkill(prev.notes, nurseSkillKey(w.en), skill, date), date, w.en) }))} />
  </div>
}

import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/store'
import { logSkill } from '../lib/bridge'
import { heardWell, nextNurseListening, nurseLastKey, nurseListenKey, nurseSpeakKey, readNurseListen, type NurseListening } from '../lib/nursing'
import { PackListen } from './UnitPack'

const levelNames = { A2: '基礎', B1: '中級', B2: '中高級' } as const
/** #library/nlisten/<id> opens that dialogue. */
const idFromHash = () => location.hash.startsWith('#library/nlisten/') ? decodeURIComponent(location.hash.split('/')[2] ?? '') || undefined : undefined

/** Nurse–patient dialogues: listen without the text, answer, then the transcript and its Chinese open (the same player
 *  as a unit's listening). After that he can act the scene out with Emma. */
export default function NursingListen({ state, onActivity, date }: Pick<PageProps, 'state'> & { onActivity: PageProps['update']; date: string }) {
  const [all, setAll] = useState<NurseListening[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [currentId, setCurrentId] = useState<string | undefined>(idFromHash)
  const [skip, setSkip] = useState<string[]>([])
  useEffect(() => {
    let alive = true
    import('../data/nursing-listening.json').then(f => { if (alive) setAll(f.default as NurseListening[]) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  useEffect(() => {
    const on = () => { const id = idFromHash(); if (id) setCurrentId(id) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  // Settled once per dialogue: a new record must not swap the dialogue while its transcript is on screen.
  const [shownId, setShownId] = useState<string | null>(null)
  useEffect(() => {
    if (!all || shownId) return
    setShownId((all.find(x => x.id === currentId) ?? nextNurseListening(all, state.notes, skip))?.id ?? null)
  }, [all, currentId, skip, shownId, state.notes])

  if (failed) return <p>護理聽力載入失敗，連上網路再試一次。</p>
  if (!all) return <p className="ls-help">載入護理聽力……</p>
  const l = all.find(x => x.id === shownId)
  if (!l) return <p className="ls-help">準備對話中……</p>
  const heard = all.filter(x => readNurseListen(state.notes, x.id)).length
  const good = all.filter(x => heardWell(readNurseListen(state.notes, x.id))).length
  const spoke = state.notes[nurseSpeakKey(l.id)]
  function open(id: string | undefined, more: string[] = skip) {
    setSkip(more); setCurrentId(id); setShownId(null)
    if (location.hash.startsWith('#library/nlisten/')) history.replaceState(null, '', '#library/nlisten')
    document.querySelector('.pr-extras')?.scrollIntoView({ block: 'start' })
  }
  return <div className="pr-stack nl">
    <p className="qz-meta"><span>護理聽力共 {all.length} 段</span><span>聽過 {heard}</span><span>只聽就全對 {good}</span><span>{levelNames[l.level]}（{l.level}）</span></p>
    <PackListen key={l.id} l={l} rate={state.settings.speechRate} last={readNurseListen(state.notes, l.id)}
      onSave={r => onActivity(prev => ({ ...prev, notes: logSkill({
        ...prev.notes,
        [nurseListenKey(l.id)]: JSON.stringify({ ...r, day: date }),
        [nurseLastKey]: JSON.stringify({ id: l.id, title: l.title, you: l.you, day: date }),
      }, 'listen', date) }))} />
    <details className="nl-words"><summary>這段的重點字（{l.words.length} 個）</summary>
      <ul>{l.words.map(w => <li key={w.en}><b lang="en">{w.en}</b> {w.zh}</li>)}</ul>
    </details>
    <div className="pr-actions">
      <button type="button" className="pr-main" onClick={() => { location.hash = 'speaking/nurse-' + l.id }}>跟 Emma 演這一段（你演 {l.you}）</button>
      <button type="button" onClick={() => open(undefined, [...skip, l.id])}>下一段</button>
    </div>
    {spoke && <small className="ls-help">上次跟 Emma 演這段：{spoke}</small>}
    <details className="nl-list"><summary>全部 {all.length} 段，選一段聽</summary>
      <ol>{all.map(x => {
        const r = readNurseListen(state.notes, x.id)
        return <li key={x.id}>
          <button type="button" className="pr-link" aria-current={x.id === l.id ? 'true' : undefined} onClick={() => open(x.id)}>{x.title}</button>
          <small> {x.level} · {x.scene}{r ? ' · ' + r.correct + ' / ' + r.total + (r.heard ? '' : '（看過字）') : ''}</small>
        </li>
      })}</ol>
    </details>
  </div>
}

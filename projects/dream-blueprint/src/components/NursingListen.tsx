import { useEffect, useState } from 'react'
import type { PageProps } from '../lib/store'
import { bestListen, logSkill } from '../lib/bridge'
import { listenPassed, nurseLevels, nurseLevelsOpen, heardWell, nextNurseListening, nurseLastKey, nurseListenKey, nursePreviewKey, nurseReviewPassed, nurseSpeakKey, readNurseListen, saveNurseListen, type NurseListening } from '../lib/nursing'
import { levelTarget } from '../lib/unlock'
import { PackListen } from './UnitPack'

const levelNames = { A2: '基礎', B1: '中級', B2: '中高級' } as const
/** #library/nlisten/<id> opens that dialogue. */
const idFromHash = () => location.hash.startsWith('#library/nlisten/') ? decodeURIComponent(location.hash.split('/')[2] ?? '') || undefined : undefined

/** Nurse–patient dialogues: listen without the text, answer, then the transcript and its Chinese open (the same player
 *  as a unit's listening). After that he can act the scene out with Emma. */
export default function NursingListen({ state, update, onActivity, date }: Pick<PageProps, 'state' | 'update'> & { onActivity: PageProps['update']; date: string }) {
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
    // A link or bookmark to another dialogue on the same page: show that one (the title follows the address).
    const on = () => { const id = idFromHash(); if (id) { setCurrentId(id); setShownId(null); setRoundDone(false) } }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  // Settled once per dialogue: a new record must not swap the dialogue while its transcript is on screen.
  const [shownId, setShownId] = useState<string | null>(null)
  // Every open dialogue was passed over with 下一段: say so and offer a new round, instead of waiting forever.
  const [roundDone, setRoundDone] = useState(false)
  // B1 opens once A2 has its target of passed dialogues, B2 after B1; locked levels are not offered.
  const levelOpen = all ? nurseLevelsOpen(all, state.notes) : {}
  useEffect(() => {
    if (!all || shownId) return
    const open = all.filter(x => levelOpen[x.level])
    const next = open.find(x => x.id === currentId) ?? nextNurseListening(open, state.notes, skip)
    if (next) setShownId(next.id)
    else if (skip.length) setRoundDone(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, currentId, skip, shownId, state.notes])

  if (failed) return <p>護理聽力載入失敗，連上網路再試一次。</p>
  if (!all) return <p className="ls-help">載入護理聽力……</p>
  const l = all.find(x => x.id === shownId)
  function open(id: string | undefined, more: string[] = skip) {
    setRoundDone(false); setSkip(more); setCurrentId(id); setShownId(null)
    if (location.hash.startsWith('#library/nlisten/')) history.replaceState(null, '', '#library/nlisten')
    document.querySelector('.pr-extras')?.scrollIntoView({ block: 'start' })
  }
  /** Every dialogue, to pick one: under the player, and on its own (opened) when a round is over. */
  const list = (currentDialogue?: string) => <details className="nl-list" open={!currentDialogue}><summary>全部 {all.length} 段，選一段聽</summary>
    <ol>{all.map(x => {
      const r = readNurseListen(state.notes, x.id)
      return <li key={x.id}>
        <button type="button" className="pr-link" aria-current={x.id === currentDialogue ? 'true' : undefined} disabled={!levelOpen[x.level]} data-locked={!levelOpen[x.level]} onClick={() => open(x.id)}>{levelOpen[x.level] ? '' : '🔒 '}{x.title}</button>
        <small> {x.level} · {x.scene}{r ? ' · ' + r.correct + ' / ' + r.total + (r.heard ? '（首次只聽）' : '（練習）') : ''}{nurseReviewPassed(r) && ' · 重聽已過關'}</small>
      </li>
    })}</ol>
  </details>
  if (!l) return roundDone ? <div className="pr-stack nl">
    <div className="pr-hint">
      <strong>這一輪開放的對話都看過或略過了</strong>
      <p>可以從第一段再來一輪，或在下面直接選一段。</p>
      <div className="pr-actions"><button type="button" className="pr-main" onClick={() => open(undefined, [])}>從第一段再來一輪</button></div>
    </div>
    {list()}
  </div> : <p className="ls-help">準備對話中……</p>
  const attempted = all.filter(x => readNurseListen(state.notes, x.id)).length
  const good = all.filter(x => heardWell(readNurseListen(state.notes, x.id))).length
  const last = readNurseListen(state.notes, l.id)
  const first = bestListen(last)
  const review = last?.reviewBest
  const previewKey = nursePreviewKey(l.id)
  const spoke = state.notes[nurseSpeakKey(l.id)]
  return <div className="pr-stack nl">
    <p className="qz-meta"><span>護理聽力共 {all.length} 段</span><span>已作答 {attempted}</span><span>首次只聽全對 {good}</span><span>{levelNames[l.level]}（{l.level}）</span></p>
    <p className="qz-meta nl-levels">{nurseLevels.map((lv, i) => {
      const here = all.filter(x => x.level === lv), ok = here.filter(x => listenPassed(readNurseListen(state.notes, x.id))).length
      const before = nurseLevels[i - 1], beforeHere = before ? all.filter(x => x.level === before) : []
      return <span key={lv}>{levelOpen[lv] ? levelNames[lv] + ' ' + lv + ' 過關 ' + ok + ' / ' + here.length
        : '🔒 ' + levelNames[lv] + ' ' + lv + '：' + before + ' 過關 ' + levelTarget(beforeHere.length) + ' 段才打開'}</span>
    })}</p>
    {(first?.heard || review) && <p className="qz-meta">
      {first?.heard && <span>首次只聽 {first.correct} / {first.total}</span>}
      {review && <span>重聽 {review.correct} / {review.total}{nurseReviewPassed(last) ? '（已過關）' : ''}</span>}
    </p>}
    <PackListen key={l.id} l={l} rate={state.settings.speechRate} last={last}
      review={{
        alreadyRead: Boolean(state.notes[previewKey]),
        onPreview: () => update(prev => prev.notes[previewKey] ? prev : { ...prev, notes: { ...prev.notes, [previewKey]: date } }),
      }}
      onSave={(r, byEar) => onActivity(prev => ({ ...prev, notes: logSkill({
        ...prev.notes,
        [nurseListenKey(l.id)]: JSON.stringify(saveNurseListen(prev.notes, l.id, { ...r, day: date }, byEar)),
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
    {list(l.id)}
  </div>
}

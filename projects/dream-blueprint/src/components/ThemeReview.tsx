import { useState } from 'react'
import type { AppState, PageProps } from '../lib/store'
import { DrillCard } from './GrammarTeach'
import { Translation } from './Translation'
import { drillAnswer, drillNames, saveDrill } from '../lib/grammar'
import { addWeak, labelOfUnit } from '../lib/weakPoints'
import { answered, judgeWritten, levelNames, type Level } from '../lib/evidence'
import { logSentence } from '../lib/progress'
import { useTaskContext } from '../lib/taskContext'
import {
  dueThemeRun, finishedRuns, lastFinishedRun, nextRun, readThemeResult, saveThemeResult, saveThemeSentence, themeBreakdown,
  themeMinutes, themePassed, themeQuiz, themeRuns, themeScope, themeSentences, type ThemeRun,
} from '../lib/themes'
import './theme-review.css'

type Props = { state: AppState; onActivity: PageProps['update']; date: string; sessionId: string }
const ratingOf = { good: 'correct', small: 'minor', again: 'again' } as const
const shortDay = (day: string) => Number(day.slice(5, 7)) + '/' + Number(day.slice(8))

/** 主題總複習 (#library/theme): when several units in a row teach one grammar theme, the theme is tested all mixed
 *  together with the related grammar learned before it. The review that is due opens first; any finished theme can be
 *  done again, and themes the course hasn't finished stay locked. */
export default function ThemeReview(props: Props) {
  const { state } = props
  const current = state.curriculum.unit
  const done = finishedRuns(current)
  const [runId, setRunId] = useState(() => (dueThemeRun(state.notes, current) ?? lastFinishedRun(current))?.id ?? '')
  const [round, setRound] = useState(0)
  const run = done.find(r => r.id === runId)
  if (!run) {
    const next = nextRun(current)
    return <section className="tr tr-empty" aria-labelledby="tr-title">
      <h3 id="tr-title">還沒有學完的主題</h3>
      {next && <p>好幾個單元連著教同一種文法時，最後一個單元上完的那個休息日，會把整個主題混在一起考一次，連以前學過的相關文法也一起混進來。
        第一個是「{themeScope(next).title}」，上完單元 {next.units[next.units.length - 1]} 就打開。</p>}
    </section>
  }
  return <Round key={run.id + '.' + round} {...props} run={run} done={done} onPick={id => { setRunId(id); setRound(0) }} onAgain={() => setRound(r => r + 1)} />
}

type Phase = 'intro' | 'drills' | 'sentences' | 'done'

function Round({ state, onActivity, date, sessionId, run, done, onPick, onAgain }: Props & {
  run: ThemeRun; done: ThemeRun[]; onPick: (id: string) => void; onAgain: () => void
}) {
  const scope = themeScope(run)
  // Fixed when the round opens: the same questions in the same order until it is done.
  const [items] = useState(() => themeQuiz(run, state.notes))
  const [sentences] = useState(() => themeSentences(run))
  const [before] = useState(() => readThemeResult(state.notes, run.id))
  const [phase, setPhase] = useState<Phase>('intro')
  const [at, setAt] = useState(0)
  const [rights, setRights] = useState<boolean[]>([])
  const [written, setWritten] = useState<{ id: string; level: Level | null }[]>([])
  const [sentenceAt, setSentenceAt] = useState(0)
  const item = items[at]
  const answeredNow = rights.length > at
  const correct = rights.filter(Boolean).length
  const wrong = items.filter((_, i) => rights[i] === false)
  const what = run.theme.family === 'tense' ? '時態' : '文法'
  useTaskContext(phase === 'drills' && item ? {
    label: '主題總複習（' + drillNames[item.drill.k] + '）：' + item.drill.q,
    detail: ['主題總複習：' + scope.title + '，題目混在一起出，他作答前不知道是哪一課。', '題目：' + item.drill.q,
      item.drill.k === 'choose' ? '選項：' + item.drill.options.join(' / ') : '', '這題是單元 ' + item.unit + '（作答前不要說出來）',
      '正確答案：' + drillAnswer(item.drill) + '（他作答前不要說出來）', '原因：' + item.drill.why].filter(Boolean).join('\n'),
  } : phase === 'done' ? {
    label: '主題總複習的結果：' + scope.title,
    detail: ['主題總複習：' + scope.title + '，文法題 ' + items.length + ' 題對 ' + correct + ' 題。',
      ...wrong.map(x => '答錯（單元 ' + x.unit + '）：' + x.drill.q + ' → 正確：' + drillAnswer(x.drill) + '；' + x.drill.why)].join('\n'),
  } : null)

  if (phase === 'intro') return <section className="tr" aria-labelledby="tr-title">
    <h3 id="tr-title">{scope.title}</h3>
    <p className="tr-lead">{run.theme.name}這 {run.units.length} 課上完了。這次把它們混在一起考{scope.earlierThemes.length ? '，再混進以前學過的' + scope.earlierThemes.join('、') : ''}，看你分不分得出來什麼時候用哪一個。</p>
    <div className="tr-scope">
      <div><b>這次考</b><ul>{scope.units.map(u => <li key={u.unit}>單元 {u.unit}．{u.title}</li>)}</ul></div>
      {scope.earlier.length > 0 && <div><b>一起混進來（以前學過的）</b><ul>{scope.earlier.map(u => <li key={u.unit}>單元 {u.unit}．{u.title}</li>)}</ul></div>}
    </div>
    <p className="tr-how">{items.length} 題文法題（選擇、填空、改錯）打散混在一起，題目不會告訴你是哪一課；最後 {sentences.length} 句中翻英，要自己判斷用哪個{what}。大約 {themeMinutes(run)} 分鐘。</p>
    {before && <p className="tr-before">上次：{shortDay(before.day)} · {before.total} 題對 {before.correct} 題{(before.tries ?? 1) > 1 ? '（考過 ' + before.tries + ' 次）' : ''}{before.first && (before.tries ?? 1) > 1 ? ' · 第一次 ' + before.first.total + ' 題對 ' + before.first.correct + ' 題' : ''}</p>}
    <div className="pr-actions"><button type="button" className="pr-main" onClick={() => setPhase(items.length ? 'drills' : 'sentences')}>{before ? '再考一次' : '開始'}</button></div>
    <label className="tr-pick">換一個主題
      <select value={run.id} onChange={e => onPick(e.target.value)}>
        {themeRuns().map(r => {
          const open = done.some(d => d.id === r.id)
          return <option key={r.id} value={r.id} disabled={!open}>{open ? '' : '🔒 '}{themeScope(r).title}{!open ? '（上完才打開）' : readThemeResult(state.notes, r.id) ? ' ✓ 考過' : ''}</option>
        })}
      </select>
    </label>
  </section>

  if (phase === 'drills' && item) return <section className="tr" aria-label={'主題總複習：' + scope.title}>
    <div className="tr-head"><strong>第一部分：文法題混在一起</strong><small>{drillNames[item.drill.k]} · 第 {at + 1} / {items.length} 題</small></div>
    <div className="tr-bar" aria-hidden="true"><i style={{ width: (rights.length / items.length) * 100 + '%' }} /></div>
    <DrillCard key={at} drill={item.drill} onDone={(right, said) => {
      const next = [...rights, right]
      setRights(next)
      onActivity(prev => {
        // The unit's own drill record (first try counts), the shared weak points, and — after the last question — the result.
        let notes = saveDrill(prev.notes, item.unit, item.index, right, date)
        const label = labelOfUnit(item.unit)
        if (!right && label) notes = addWeak(notes, label, date, { w: said, r: drillAnswer(item.drill) }, 'review')
        if (next.length === items.length) notes = saveThemeResult(notes, run.id, items, next, date)
        return { ...prev, notes }
      })
    }} />
    {answeredNow && <p className="tr-from">這題考的是：單元 {item.unit}．{scope.units.concat(scope.earlier).find(u => u.unit === item.unit)?.title}</p>}
    {answeredNow && <button type="button" className="pr-main gm-next" onClick={() => {
      if (at + 1 < items.length) setAt(at + 1)
      else setPhase(sentences.length ? 'sentences' : 'done')
    }}>{at + 1 < items.length ? '下一題' : sentences.length ? '接著寫 ' + sentences.length + ' 句中翻英' : '看結果'}</button>}
  </section>

  const sentence = sentences[sentenceAt]
  if (phase === 'sentences' && sentence) {
    const mark = written.find(w => w.id === sentence.id)
    return <section className="tr tr-write" aria-label={'主題總複習：' + scope.title}>
      <div className="tr-head"><strong>第二部分：中翻英</strong><small>第 {sentenceAt + 1} / {sentences.length} 句</small></div>
      <Translation key={sentence.id} sentence={sentence} checkpoint={false} hideTags label={'自己判斷要用哪個' + what + '（上面不標文法）'}
        onMark={(m, revealed, info) => {
          if (written.some(w => w.id === sentence.id)) return
          if (!answered(info.answer)) revealed = true
          const level = judgeWritten({ rating: ratingOf[m], revealed, answer: info.answer, references: sentence.reference, firstVerdict: info.firstVerdict, checkedText: info.checkedText })
          setWritten([...written, { id: sentence.id, level }])
          onActivity(prev => {
            const logged = logSentence(prev, sessionId, date, { sentenceId: sentence.id, rating: ratingOf[m], grammar: sentence.grammar, revealed, verified: level === 'independent' })
            return { ...logged, notes: saveThemeSentence(logged.notes, run.id, sentence.id, level) }
          })
        }} />
      <div className="pr-actions tr-next">
        {mark
          ? <button type="button" className="pr-main" onClick={() => sentenceAt + 1 < sentences.length ? setSentenceAt(sentenceAt + 1) : setPhase('done')}>{sentenceAt + 1 < sentences.length ? '下一句' : '看結果'}</button>
          : <button type="button" className="pr-link" onClick={() => sentenceAt + 1 < sentences.length ? setSentenceAt(sentenceAt + 1) : setPhase('done')}>這句先跳過（不算作答）</button>}
      </div>
    </section>
  }

  // The result: by unit, so a weak spot inside the theme shows, with the way back to that unit's teaching.
  const breakdown = themeBreakdown(items, rights)
  const passed = themePassed(correct, items.length)
  const need = Math.ceil(items.length * 0.8)
  return <section className="tr tr-done" aria-labelledby="tr-result">
    <p className="tr-kicker">主題總複習 · {scope.title}</p>
    <h3 id="tr-result">{items.length ? '文法題 ' + items.length + ' 題對 ' + correct + ' 題' : '做完了'}</h3>
    {items.length > 0 && <p className="tr-verdict" data-ok={passed}>{passed
      ? run.theme.name + '這幾課穩了' + (scope.earlierThemes.length ? '，跟以前學過的' + scope.earlierThemes.join('、') + '也分得清楚。' : '。')
      : '對 ' + need + ' 題（八成）才算這個主題穩了。下面標出來的單元，回去看一次講解再考。'}</p>}
    {[{ name: run.theme.name, list: breakdown.filter(b => run.units.includes(b.unit)) }, { name: '以前學過的', list: breakdown.filter(b => !run.units.includes(b.unit)) }]
      .filter(g => g.list.length).map(g => <div className="tr-group" key={g.name}>
        <b>{g.name}</b>
        <ul className="tr-units">{g.list.map(b => <li key={b.unit} data-ok={b.right === b.total}>
          <span>單元 {b.unit}．{b.title}</span>
          <b>{b.right} / {b.total}</b>
          {b.right < b.total ? <a href={'#library/grammar/' + b.unit}>看講解</a> : <i aria-label="全對">✓</i>}
        </li>)}</ul>
      </div>)}
    {wrong.length > 0 && <details className="tr-wrong">
      <summary>錯的 {wrong.length} 題（答案不直接列出：看講解，下一輪自己再做一次）</summary>
      <ol>{wrong.map(x => <li key={x.unit + '.' + x.index}>
        <span lang="en">{x.drill.q}</span>
        <small>單元 {x.unit} · <a href={'#library/grammar/' + x.unit}>看講解</a></small>
      </li>)}</ol>
    </details>}
    {sentences.length > 0 && <div className="tr-sentences">
      <b>中翻英</b>
      {sentences.map(s => {
        const w = written.find(x => x.id === s.id)
        return <p key={s.id}><span>{s.zh}</span><small>{!w ? '跳過了' : w.level ? levelNames[w.level] : '不會'}</small></p>
      })}
    </div>}
    {wrong.length > 0 && <p className="tr-note">錯的題目記進「我的弱點」了：Emma 和 Claude 批改會特別注意；下次再考這個主題，會先出這些題目。</p>}
    <div className="pr-actions">
      <button type="button" className="pr-main" onClick={onAgain}>再考一次</button>
      <a className="pr-link" href="#library">回到英文練習</a>
    </div>
  </section>
}

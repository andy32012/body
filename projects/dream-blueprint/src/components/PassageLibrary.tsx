import { useEffect, useMemo, useState } from 'react'
import type { PageProps } from '../lib/store'
import CorrectBox, { type Result as Feedback } from './CorrectBox'
import StuckButton from './StuckButton'
import { useTaskContext } from '../lib/taskContext'
import { clearDraft, readDraft, writeDraft } from '../lib/drafts'
import { AskWord } from './AIChat'
import ContextMeaning from './ContextMeaning'
import { doneKey, levelKey, levelProgress, nextPassage, redoDue, redoKey, type Passage } from '../lib/passages'
import { dayKey } from '../lib/progress'
import { addSayCard } from '../lib/sayCards'

type Props = Pick<PageProps, 'state'> & { onActivity: PageProps['update'] }
const marks = [['good', '對了'], ['small', '小錯'], ['again', '不會，明天再來']] as const

// Short passages written around the 7000-word list. One passage at a time, in book order.
/** The word as it is used in this passage; when that is another form of a table word, the table word follows: saw（see）. */
function HintWord({ word }: { word: { en: string; form?: string } }) {
  const form = word.form ?? word.en
  const same = form.toLowerCase() === word.en.toLowerCase()
  return <><span lang="en">{form}</span>{!same && <small className="passage-lemma">（<span lang="en">{word.en}</span>）</small>}</>
}

export default function PassageLibrary({ state, onActivity }: Props) {
  const [all, setAll] = useState<Passage[]>()
  const [failed, setFailed] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])
  const [letter, setLetter] = useState('')
  const [answer, setAnswer] = useState('')
  const [show, setShow] = useState<'none' | 'words' | 'reference'>('none')
  const [copied, setCopied] = useState('')
  const [manualCopy, setManualCopy] = useState('')
  const [run, setRun] = useState(0)
  const [last, setLast] = useState<Feedback>()
  const [previous, setPrevious] = useState<Feedback>()
  const level = Math.min(6, Math.max(1, Number(state.notes[levelKey]) || 1))

  useEffect(() => {
    let alive = true
    import('../data/passages.json')
      .then(file => { if (alive) setAll(file.default as Passage[]) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])

  const passage = useMemo(() => all && nextPassage(all, level, state.checks, state.notes, skipped, letter),
    [all, level, state.checks, state.notes, skipped, letter])
  const progress = useMemo(() => all ? levelProgress(all, level, state.checks) : { done: 0, total: 0 },
    [all, level, state.checks])
  const letters = useMemo(() => all ? [...new Set(all.filter(p => p.level === level).map(p => p.letter))] : [], [all, level])

  useEffect(() => { if (passage) setAnswer(readDraft('passage.' + passage.id)) }, [passage?.id])
  useTaskContext(passage ? {
    label: '短文中翻英：' + passage.zh.slice(0, 40) + (passage.zh.length > 40 ? '…' : ''),
    detail: ['短文中翻英，題目：' + passage.zh, passage.words?.length ? '會用到的單字：' + passage.words.map(w => w.en + '（' + w.zh + '）').join('、') : '',
      passage.en ? '參考翻譯（只供你判斷，他沒說要看前不要整段給）：' + passage.en : ''].filter(Boolean).join('\n'),
    draft: answer,
  } : null)
  function reset() { setRun(0); setAnswer(''); setShow('none'); setCopied(''); setManualCopy(''); setLast(undefined); setPrevious(undefined) }
  function choose(next: number) {
    onActivity(prev => ({ ...prev, notes: { ...prev.notes, [levelKey]: String(next) } }))
    setSkipped([]); setLetter(''); reset()
  }
  function mark(result: typeof marks[number][0]) {
    if (!passage) return
    const id = passage.id
    onActivity(prev => {
      const notes = { ...prev.notes }
      if (result === 'again') notes[redoKey(id)] = dayKey()
      else delete notes[redoKey(id)]
      return { ...prev, notes, checks: result === 'again' ? prev.checks : { ...prev.checks, [doneKey(id)]: true } }
    })
    if (result === 'again') setSkipped(list => [...list, id])
    clearDraft('passage.' + id)
    reset()
  }
  async function copy() {
    if (!passage) return
    const value = '請幫我批改這段中翻英。\n題目：' + passage.zh + '\n我的答案：' + answer +
      (passage.en ? '\n參考翻譯：' + passage.en : '')
    try { await navigator.clipboard.writeText(value); setCopied('已複製') }
    catch { setManualCopy(value); setCopied('請長按選取並複製下方文字。') }
  }

  if (failed) return <p>短文還沒下載到這台裝置。連上網路後再打開一次。</p>
  if (!all) return <p>正在準備短文…</p>
  return <div className="pr-stack passage-library">
    <div className="passage-head">
      <label>級別 <select id="passage-level" value={level} onChange={event => choose(Number(event.target.value))}>
        {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>第 {n} 級</option>)}
      </select></label>
      <label>字母 <select id="passage-letter" value={letter} onChange={event => { setLetter(event.target.value); setSkipped([]); reset() }}>
        <option value="">照順序</option>
        {letters.map(l => <option key={l} value={l}>{l}</option>)}
      </select></label>
      <span className="passage-count">已完成 <b>{progress.done}</b> / {progress.total}</span>
    </div>
    {!passage ? <p>{letter ? '這個字母的短文都做完了，換一個字母或回到照順序。' : '第 ' + level + ' 級的短文都做完了。可以換下一級。'}</p> : <>
      <div className="pr-label">7000 單短文 · 第 {passage.level} 級 · {passage.letter} {String(passage.n).padStart(2, '0')}</div>
      {redoDue(state.notes, passage.id) && <p className="passage-again">這段之前按了「不會」，隔一天再試一次。寫不出來的地方先空著，批改後把錯的加入複習。</p>}
      <p className="passage-text">{passage.zh}</p>
      <label className="pr-field" htmlFor="passage-answer">我的英文翻譯</label>
      <textarea id="passage-answer" rows={5} lang="en" value={answer} placeholder="一句一句翻，寫不出來的先空著"
        onChange={event => { setAnswer(event.target.value); writeDraft('passage.' + passage.id, event.target.value) }} />
      <div className="pr-actions">
        {passage.words && passage.words.length > 0 &&
          <button className="pr-link" onClick={() => setShow(show === 'words' ? 'none' : 'words')}>這段會用到的單字</button>}
        <button className="pr-main" onClick={() => { setPrevious(last); setRun(n => n + 1) }}>{run ? '改好了，再批一次' : '批改'}</button>
        <StuckButton />
        {passage.en && <button className="pr-link" onClick={() => setShow(show === 'reference' ? 'none' : 'reference')}>參考翻譯</button>}
        <button className="pr-link" onClick={() => { setSkipped(list => [...list, passage.id]); reset() }}>換一段</button>
      </div>
      <CorrectBox key={passage.id} run={run} zh={passage.zh} reference={passage.en} words={passage.words?.map(w => w.en)} answer={answer}
        selfFix previous={previous} onResult={(_, __, r) => setLast(r)}
        onSave={card => onActivity(prev => addSayCard(prev, card, dayKey()))} />
      {show === 'words' && passage.words && <div className="pr-tags">
        {passage.words.map(word => <span key={word.en + (word.form ?? '')}><HintWord word={word} /> · {word.zh}{' '}
          <ContextMeaning word={word.en} context={(passage.en ?? '') + '\n' + passage.zh} cacheKey={'ctx.' + passage.id + '.' + word.en}
            notes={state.notes} onSave={(k, v) => onActivity(prev => ({ ...prev, notes: { ...prev.notes, [k]: v } }))} />{' '}
          <AskWord en={word.en} zh={word.zh} /></span>)}
      </div>}
      {show === 'reference' && passage.en && <section className="pr-reference">
        <small>參考翻譯（寫法不只一種，意思和文法對就算對）</small>
        <p lang="en">{passage.en}</p>
        {passage.words && passage.words.length > 0 && <div className="pr-tags">
          {passage.words.map(word => <span key={word.en + (word.form ?? '')}><HintWord word={word} /> · {word.zh} <AskWord en={word.en} zh={word.zh} /></span>)}
        </div>}
      </section>}
      {!passage.en && <p className="passage-note">這一級的參考翻譯還沒加入。寫完按下面的按鈕複製，貼到聊天裡請人批改。</p>}
      <button className="pr-link passage-copy" onClick={copy}>複製題目和我的答案</button>
      <small role="status">{copied}</small>
      {manualCopy && <textarea aria-label="可複製的內容" readOnly value={manualCopy} onFocus={event => event.target.select()} />}
      <fieldset className="pr-marks">
        <legend>我的自評</legend>
        {marks.map(([key, label]) => <button key={key} disabled={key !== 'again' && !answer.trim()} onClick={() => mark(key)}>{label}</button>)}
        {!answer.trim() && <p className="pr-blank-note">還沒寫翻譯：寫下來才能自評「對了／小錯」，沒寫的不算完成。</p>}
      </fieldset>
    </>}
  </div>
}

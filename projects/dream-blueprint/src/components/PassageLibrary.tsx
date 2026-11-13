import { useEffect, useMemo, useState } from 'react'
import type { PageProps } from '../lib/store'
import { doneKey, levelKey, levelProgress, nextPassage, redoKey, type Passage } from '../lib/passages'

type Props = Pick<PageProps, 'state'> & { onActivity: PageProps['update'] }
const marks = [['good', '對了'], ['small', '小錯'], ['again', '不會，之後再來']] as const

// Short passages written around the 7000-word list. One passage at a time, in book order.
export default function PassageLibrary({ state, onActivity }: Props) {
  const [all, setAll] = useState<Passage[]>()
  const [failed, setFailed] = useState(false)
  const [skipped, setSkipped] = useState<string[]>([])
  const [letter, setLetter] = useState('')
  const [answer, setAnswer] = useState('')
  const [show, setShow] = useState<'none' | 'words' | 'reference'>('none')
  const [copied, setCopied] = useState('')
  const [manualCopy, setManualCopy] = useState('')
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

  function reset() { setAnswer(''); setShow('none'); setCopied(''); setManualCopy('') }
  function choose(next: number) {
    onActivity(prev => ({ ...prev, notes: { ...prev.notes, [levelKey]: String(next) } }))
    setSkipped([]); setLetter(''); reset()
  }
  function mark(result: typeof marks[number][0]) {
    if (!passage) return
    const id = passage.id
    onActivity(prev => {
      const notes = { ...prev.notes }
      if (result === 'again') notes[redoKey(id)] = '1'
      else delete notes[redoKey(id)]
      return { ...prev, notes, checks: result === 'again' ? prev.checks : { ...prev.checks, [doneKey(id)]: true } }
    })
    if (result === 'again') setSkipped(list => [...list, id])
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
      <p className="passage-text">{passage.zh}</p>
      <label className="pr-field" htmlFor="passage-answer">我的英文翻譯</label>
      <textarea id="passage-answer" rows={5} lang="en" value={answer} placeholder="一句一句翻，寫不出來的先空著"
        onChange={event => setAnswer(event.target.value)} />
      <div className="pr-actions">
        {passage.words && passage.words.length > 0 &&
          <button className="pr-link" onClick={() => setShow(show === 'words' ? 'none' : 'words')}>這段會用到的單字</button>}
        {passage.en && <button className="pr-main" onClick={() => setShow('reference')}>我寫好了，看參考翻譯</button>}
        <button className="pr-link" onClick={() => { setSkipped(list => [...list, passage.id]); reset() }}>換一段</button>
      </div>
      {show === 'words' && passage.words && <div className="pr-tags">
        {passage.words.map(word => <span key={word.en}><span lang="en">{word.en}</span> · {word.zh}</span>)}
      </div>}
      {show === 'reference' && passage.en && <section className="pr-reference">
        <small>參考翻譯（寫法不只一種，意思和文法對就算對）</small>
        <p lang="en">{passage.en}</p>
        {passage.words && passage.words.length > 0 && <div className="pr-tags">
          {passage.words.map(word => <span key={word.en}><span lang="en">{word.en}</span> · {word.zh}</span>)}
        </div>}
      </section>}
      {!passage.en && <p className="passage-note">這一級的參考翻譯還沒加入。寫完按下面的按鈕複製，貼到聊天裡請人批改。</p>}
      <button className="pr-link" onClick={copy}>複製題目和我的答案</button>
      <small role="status">{copied}</small>
      {manualCopy && <textarea aria-label="可複製的內容" readOnly value={manualCopy} onFocus={event => event.target.select()} />}
      <fieldset className="pr-marks">
        <legend>我的自評</legend>
        {marks.map(([key, label]) => <button key={key} onClick={() => mark(key)}>{label}</button>)}
      </fieldset>
    </>}
  </div>
}

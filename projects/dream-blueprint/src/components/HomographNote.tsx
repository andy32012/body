import { confusableOf, homographOf } from '../lib/homographs'
import './homograph.css'

/** 一字多義 / 容易搞混: shown with a word once it has been answered (or its meaning shown), never before, so it does not give
 *  the answer away. `side` is the list the word is being learned from. */
export default function HomographNote({ en, side }: { en: string; side: 'nurse' | 'everyday' }) {
  const h = homographOf(en, side)
  const c = side === 'nurse' ? confusableOf(en) : null
  if (!h && !c) return null
  return <div className="hg-note">
    {h && <p><b className="hg-tag">一字多義</b> <span lang="en">{h.en}</span> 在一般英文是「{h.everyday}」，在護理裡是「{h.nurse}」。
      <small><span lang="en">{side === 'nurse' ? h.nurseEx.en : h.everydayEx.en}</span>（{side === 'nurse' ? h.nurseEx.zh : h.everydayEx.zh}）</small>
      <small><span lang="en">{side === 'nurse' ? h.everydayEx.en : h.nurseEx.en}</span>（{side === 'nurse' ? h.everydayEx.zh : h.nurseEx.zh}）</small></p>}
    {c && <p><b className="hg-tag">容易搞混</b> {c.tip}</p>}
  </div>
}

import { answered, clauseCommaNote, compareWithReference } from '../lib/evidence'

/** His answer held against the reference without showing it: his own words, the ones the reference does not have
 *  marked, and how many words he has not written yet (not which). Matching it says so. */
export default function OwnCheck({ answer, references }: { answer: string; references: readonly string[] }) {
  if (!answered(answer)) return <p className="pr-compare"><small>先把想到的英文寫上去，再對照哪裡不一樣。</small></p>
  const diff = compareWithReference(answer, references)
  const commas = clauseCommaNote(answer, references)
  if (commas) return <p className="pr-compare"><small>{commas}</small></p>
  if (!diff || diff.same) return <p className="pr-compare"><small>跟參考句一樣 ✓</small></p>
  return <p className="pr-compare">
    <small>你寫的：</small>{' '}
    <span lang="en">{diff.words.map((t, i) => <span key={i} className={t.extra ? 'pr-diff-extra' : undefined}>{t.w} </span>)}</span>
    {diff.missing.length > 0 && <><br /><small>參考句還有 {diff.missing.length} 個字你沒寫到：回去看提示，想想少了什麼。</small></>}
    <br /><small>畫波浪線的字跟參考句不一樣。寫法不同也可能是對的，重點是意思有沒有變：時間、人物、動作或否定換了，就是意思不一樣。</small>
  </p>
}

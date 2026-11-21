import { useState } from 'react'
import { PenLine } from 'lucide-react'
import CorrectBox from './CorrectBox'
import { tutorKey } from '../lib/tutor'
import type { SayCard } from '../lib/sayCards'
import { useTaskContext } from '../lib/taskContext'
import './use-word.css'

/** 「用它寫一句」: knowing a word means using it, so write one sentence of your own and get it checked. */
export default function UseWord({ en, zh, example, onGood, onSave }: {
  en: string; zh?: string; example?: string
  /** Called when the sentence is judged correct (marks the word's 寫出 skill). */
  onGood?: () => void
  onSave?: (card: SayCard) => void
}) {
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState('')
  const [run, setRun] = useState(0)
  const [checked, setChecked] = useState(false)
  const keyed = !!tutorKey()
  const used = new RegExp('\\b' + en.split(/[ /(]/)[0].replace(/[^a-z'-]/gi, '').slice(0, -1), 'i').test(answer)
  useTaskContext(open ? {
    label: '用單字造句：' + en,
    detail: '他要用 ' + en + (zh ? '（' + zh + '）' : '') + ' 自己造一個英文句子。幫他想情境或句型，不要替他寫。' + (example ? '課本例句（只供參考）：' + example : ''),
    draft: answer,
  } : null)
  if (!open) return <button type="button" className="use-word-open" onClick={() => setOpen(true)}><PenLine size={14} aria-hidden="true" />用它寫一句</button>
  return <section className="use-word" aria-label={'用 ' + en + ' 寫一句'}>
    <label className="pr-field">用 <b lang="en">{en}</b> 寫一句自己的話
      <textarea lang="en" rows={2} value={answer} spellCheck={false} autoComplete="off" placeholder="例如跟你今天、學校或醫院有關的事"
        onChange={e => { setAnswer(e.target.value); setChecked(false) }} />
    </label>
    {answer.trim() && !used && <small className="use-word-warn">句子裡好像還沒有用到 {en}。</small>}
    <div className="pr-actions">
      {keyed
        ? <button type="button" className="pr-main" disabled={!answer.trim()} onClick={() => setRun(n => n + 1)}>{run ? '改好了，再批一次' : '請 Claude 看看'}</button>
        : <button type="button" className="pr-main" disabled={!answer.trim()} onClick={() => setChecked(true)}>寫好了</button>}
      <button type="button" className="pr-link" onClick={() => setOpen(false)}>收起來</button>
    </div>
    {!keyed && checked && <p className="ls-help">{example ? <>對照例句：<span lang="en">{example}</span>。</> : ''}檢查：主詞和動詞有沒有對上？{en} 的用法跟例句一樣嗎？</p>}
    <CorrectBox run={run} mode="open" zh={'用單字 ' + en + (zh ? '（' + zh + '）' : '') + ' 自己造一個句子'} reference={example} words={[en]} answer={answer} selfFix
      onSave={onSave} onResult={v => { if (v === 'good' && used) onGood?.() }} />
  </section>
}

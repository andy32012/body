import exam from '../data/exam-subjects.json'
import scenarios from '../data/scenarios.json'
import quiz from '../data/quiz.json'
import type { PageProps } from '../lib/store'
import { readCase, type Scenario } from '../lib/scenarios'
import { quizSectionKey, readQuizRecord, type QuizItem } from '../lib/quiz'
import { AskWord } from './AIChat'
import './exam-map.css'

const cases = scenarios as Scenario[]
const questions = (quiz as (QuizItem & { subjects?: string[] })[]).filter(q => q.kind === 'nursing')

/** 台灣護理師國考五科 ↔ the English practice in this site: what each subject covers and which cases and questions train it. */
export default function ExamMap({ state, update }: Pick<PageProps, 'state' | 'update'>) {
  return <section className="ex-map" aria-label="國考科目對照">
    <p className="ex-note">台灣護理師國考共 5 科。每科下面是這個網站裡對應的英文情境、護理英文題和常見英文字，國考讀到哪一科，就先練那一科的英文。</p>
    {exam.subjects.map(s => {
      const myCases = cases.filter(c => c.subjects?.includes(s.name))
      const myQs = questions.filter(q => q.subjects?.includes(s.name))
      const casesDone = myCases.filter(c => readCase(state.notes, c.id)).length
      const qsDone = myQs.filter(q => readQuizRecord(state.notes, q.id)?.correct).length
      return <article key={s.id} className="ex-subject">
        <header><h3>{s.name}</h3><small>{s.includes}</small></header>
        <ul className="ex-outline" aria-label="命題大綱">{s.outline.map(o => <li key={o}>{o}</li>)}</ul>
        <dl className="ex-stats">
          <div><dt>臨床情境</dt><dd>{myCases.length ? casesDone + ' / ' + myCases.length + ' 個做過' : '還沒有'}</dd></div>
          <div><dt>護理英文題</dt><dd>{myQs.length ? qsDone + ' / ' + myQs.length + ' 題答對' : '還沒有'}</dd></div>
        </dl>
        {myCases.length > 0 && <p className="ex-cases">情境：{myCases.map(c => c.topic).join('、')}</p>}
        <details className="ex-words"><summary>這科常見的英文字（{s.words.length}）</summary>
          <ul>{s.words.map(w => <li key={w.en}><b lang="en">{w.en}</b> {w.zh} <AskWord en={w.en} zh={w.zh} label="問" /></li>)}</ul>
        </details>
        <div className="ex-go">
          {myCases.length > 0 && <a href={'#library/case/' + s.id}>練這科的情境</a>}
          {myQs.length > 0 && <a href={'#library/quiz/' + s.id} onClick={() => update(prev => ({ ...prev, notes: { ...prev.notes, [quizSectionKey]: 'nursing' } }))}>練這科的護理英文題</a>}
        </div>
      </article>
    })}
    <p className="ex-source">科目和大綱依據：<a href={exam.source.url} target="_blank" rel="noreferrer">{exam.source.title}</a>。資料核對日期 {exam.updated}；報名前請到<a href={exam.official.url} target="_blank" rel="noreferrer">考選部網站</a>確認最新公告。</p>
  </section>
}

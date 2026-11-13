import { useMemo, useState } from 'react'
import type { PageProps } from '../lib/store'
import { activePeriod, dayKey, newCard, weekKey } from '../lib/progress'
import { getScreeningQueue, officialWords, wordKey } from '../lib/vocab'
import wordParts from '../data/medical-parts.json'
import './vocabulary.css'

export default function VocabScreen({state, update}: PageProps) {
  const today = dayKey()
  const period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  const dailyKey = 'vocab-screen.' + today
  const screened = Number(state.notes[dailyKey] || 0)
  const queue = useMemo(() => getScreeningQueue(state.knownWords, state.learningWords, state.customWords),
    [state.knownWords, state.learningWords, state.customWords])
  const item = queue[0]
  const [reveal, setReveal] = useState(false)
  const [tab, setTab] = useState<'screen'|'learn'|'roots'|'lookup'>('screen')
  const [working, setWorking] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const targetLevel = today < '2027-07-01' ? 1 : today < '2029-08-01' ? 3 : 4
  const [lookupLevel,setLookupLevel] = useState(targetLevel)
  const term = searchTerm.trim().toLowerCase()
  const lookup = useMemo(() => {
    if (lookupLevel >= 5 && !term) return []
    return officialWords.filter(w => w.level === lookupLevel &&
      (!term || w.en.toLowerCase().includes(term) || w.zh.includes(term))).slice(0, 12)
  }, [lookupLevel,term])
  const classified = useMemo(() => new Set([...state.knownWords,...state.learningWords].map(wordKey)),
    [state.knownWords,state.learningWords])

  const waiting = useMemo(() => {
    const started = new Set(state.cards.filter(c => c.id.startsWith('word:')).map(c => c.id.slice(5)))
    const known = new Set(state.knownWords.map(wordKey))
    const byKey = new Map([...officialWords, ...state.customWords].map(w => [wordKey(w.en), w]))
    return state.learningWords.map(wordKey).filter(k => !known.has(k) && !started.has(k))
      .flatMap(k => { const match = byKey.get(k); return match ? [match] : [] })
  }, [state.learningWords, state.knownWords, state.cards, state.customWords])

  function classify(known: boolean) {
    if (!item || quiet) return
    const key = wordKey(item.en)
    update(prev => {
      if (Number(prev.notes[dailyKey] || 0) >= 50 ||
          [...prev.knownWords, ...prev.learningWords].some(w => wordKey(w) === key)) return prev
      return {...prev, knownWords: known ? [...prev.knownWords, key] : prev.knownWords,
        learningWords: known ? prev.learningWords : [...prev.learningWords, key],
        notes: {...prev.notes, [dailyKey]: String(Number(prev.notes[dailyKey] || 0) + 1)}}
    })
    setReveal(false)
  }

  const weekPrefix = 'medical-part.' + weekKey(today) + '.'
  const finishedThisWeek = Object.entries(state.checks).filter(([key,done]) => key.startsWith(weekPrefix) && done).length
  const parts = wordParts.filter(p => !state.checks['medical-learned.' + p.id]).slice(0, Math.max(0, 2-finishedThisWeek))
  const practiceWord = waiting[0]

  if (quiet) return <p>今天只複習熟悉的內容。</p>
  return <section className="vocab-area" aria-label="單字與醫護字根">
    <div className="vocab-tabs">{([['screen','單字快篩'],['learn','待學單字'],['lookup','分級找字'],['roots','醫護字根']] as const)
      .map(([id,label]) => <button type="button" key={id} aria-pressed={tab === id}
        onClick={() => {setTab(id);setReveal(false)}}>{label}</button>)}</div>

      {tab === 'screen' && <div className="vocab-panel">
        <p>第 1、2 級優先。認得的字會跳過，不認得的字收進待學單字。</p>
        {screened >= 50 || !item ? <strong>{screened >= 50 ? '今天 50 個完成，明天接著看。' : '已篩完第 1、2 級和匯入的單字。'}</strong> :
          working ? <>
            <small>今天第 {screened+1} 個／50 · {item.level ? '第 '+item.level+' 級' : '我的詞表'}</small>
            <strong className="vocab-term" lang="en">{item.en}</strong>
            {reveal ? <p>{item.zh || '匯入時未提供中文詞義。'}</p> :
              <button type="button" onClick={() => setReveal(true)}>看中文意思</button>}
            <div className="vocab-tabs">
              <button type="button" onClick={() => classify(true)}>認得</button>
              <button type="button" onClick={() => classify(false)}>不認得</button>
              <button type="button" onClick={() => setWorking(false)}>先到這裡</button>
            </div></> :
          <button type="button" onClick={() => setWorking(true)}>{screened ? '繼續快篩' : '開始快篩'} · 今天已看 {screened} 個</button>}
      </div>}
      {tab === 'learn' && <div className="vocab-panel">
        {practiceWord ? <><small>待學 {waiting.length} 個</small><strong className="vocab-term" lang="en">{practiceWord.en}</strong>
          <p>{practiceWord.zh || '匯入時未提供中文詞義。'}</p>
          <button type="button" onClick={() => {
            const id = 'word:' + wordKey(practiceWord.en)
            update(prev => prev.cards.some(card => card.id === id) ? prev : {...prev, cards:[...prev.cards,newCard(id,today)]})
          }}>學過這個字，明天複習</button></> :
          <p>快篩選「不認得」的字會放在這裡。已開始學的字會排進單字複習。</p>}
      </div>}
      {tab === 'lookup' && <div className="vocab-panel">
        <label>詞彙級別 <select value={lookupLevel} onChange={event => setLookupLevel(Number(event.target.value))}>
          {[1,2,3,4,5,6].map(level => <option key={level} value={level}>第 {level} 級</option>)}
        </select></label>
        <label>查英文或中文 <input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)}
          placeholder="輸入遇到的字" /></label>
        {lookupLevel >= 5 && !term ? <p>第 5、6 級只挑讀護理題或準備檢定時遇到的字。輸入一個字開始找。</p> :
          !lookup.length ? <p>這個級別沒有找到。可以切換級別或在設定匯入自己的單字。</p> :
            <ul className="vocab-results">{lookup.map(word => <li key={word.en}><span><b lang="en">{word.en}</b> · {word.zh}</span>
              <button type="button" disabled={classified.has(wordKey(word.en))} onClick={() => {
                const key = wordKey(word.en)
                update(prev => [...prev.knownWords,...prev.learningWords].some(w => wordKey(w) === key) ? prev :
                  {...prev,learningWords:[...prev.learningWords,key]})
              }}>{classified.has(wordKey(word.en)) ? '已記錄' : '加入待學'}</button></li>)}</ul>}
      </div>}
      {tab === 'roots' && <div className="vocab-panel">
        <p>本週兩個醫護字根、字首或字尾，已學 {finishedThisWeek} 個。</p>
        {parts.map(part => <article key={part.id}>
          <small>{part.type}</small><strong className="vocab-term" lang="en">{part.part}</strong>
          <p>{part.meaning} · <span lang="en">{part.example}</span>（{part.translation}）</p>
          <button type="button" onClick={() => update(prev => ({...prev,checks:{...prev.checks,
            [weekPrefix+part.id]:true,['medical-learned.'+part.id]:true}}))}>記下這個{part.type}</button>
        </article>)}
        {!parts.length && <p>{finishedThisWeek >= 2 ? '本週的兩個已完成。' : '60 個醫護構詞都學過了。'}</p>}
        <a href="https://medlineplus.gov/appendixa.html" target="_blank" rel="noreferrer">醫護構詞參考（MedlinePlus）</a>
      </div>}

    <details><summary>詞表來源</summary>
      <p>大考中心 111 學年度起適用的高中英文參考詞彙表共六級，本版收錄 6,012 個詞條。快篩內建第 1、2 級的 2,004 個詞條，中文釋義另行整理。</p>
      <a href="https://www.ceec.edu.tw/xmdoc?xsmsid=0K213553204833715309" target="_blank" rel="noreferrer">大考中心詞表</a> · <a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">中文詞義來源</a>
    </details>
  </section>
}

import { AskWord } from './AIChat'
import UseWord from './UseWord'
import HomographNote from './HomographNote'
import { markSkill } from '../lib/wordSkills'
import { useTapGuard } from '../lib/tapGuard'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageProps } from '../lib/store'
import { activePeriod, dayKey, newCard, weekKey } from '../lib/progress'
import { formLines, getScreeningQueue, levelEntry, lookupWords, meaningLine, officialWords, wordKey } from '../lib/vocab'
import { readDailyCount, recordDailyItem, screeningKey, screeningLimit } from '../lib/dailyCounts'
import { noteMoved } from '../lib/wordStates'
import wordParts from '../data/medical-parts.json'
import WordParts from './WordParts'
import { learnedParts, wordParts as everydayParts } from '../lib/wordParts'
import './vocabulary.css'

/** A table word shows each meaning with its part of speech, and a merged entry each of its forms. */
function shownMeaning(w: { en: string; zh: string }) {
  const e = levelEntry(w.en)
  if (!e || e.zh !== w.zh) return w.zh
  const forms = formLines(e)
  return forms.length ? forms.map(f => f.en + ' ' + f.pos + ' ' + f.zh).join('　') : meaningLine(e)
}

const medicalLimit = 2
const medicalCount = (checks: PageProps['state']['checks'], prefix: string) =>
  Object.entries(checks).filter(([key, done]) => done && key.startsWith(prefix)).length

export default function VocabScreen({state, update}: PageProps) {
  const today = dayKey()
  const period = activePeriod(today, state.settings.periods)
  const quiet = period === 'exam' || period === 'internship'
  const dailyKey = screeningKey(today)
  const screened = readDailyCount(state.notes, dailyKey)
  const queue = useMemo(() => getScreeningQueue(state.knownWords, state.learningWords, state.customWords),
    [state.knownWords, state.learningWords, state.customWords])
  const [tab, setTab] = useState<'screen'|'learn'|'roots'|'lookup'>('screen')
  const [working, setWorking] = useState(false)
  const item = working && !quiet && screened < screeningLimit && tab === 'screen' ? queue[0] : undefined
  const itemKey = item && wordKey(item.en)
  const cardIdentity = itemKey && today + ':' + itemKey
  // 認得 / 不認得 stay in the same place for the next word: a double tap must not sort that one too.
  const ready = useTapGuard(cardIdentity)
  const [revealedCard, setRevealedCard] = useState<string>()
  const reveal = cardIdentity !== undefined && revealedCard === cardIdentity
  const screenPanel = useRef<HTMLDivElement>(null)
  const learnPanel = useRef<HTMLDivElement>(null)
  useEffect(() => setRevealedCard(undefined), [cardIdentity])
  const [rootKind, setRootKind] = useState<'everyday'|'medical'>('everyday')
  const [searchTerm, setSearchTerm] = useState('')
  const targetLevel = today < '2027-07-01' ? 1 : today < '2029-08-01' ? 3 : 4
  const [lookupLevel,setLookupLevel] = useState(targetLevel)
  const term = searchTerm.trim().toLowerCase()
  const lookup = useMemo(() => {
    if (lookupLevel >= 5 && !term) return []
    return lookupWords(officialWords, lookupLevel, term)
  }, [lookupLevel,term])
  const classified = useMemo(() => new Set([...state.knownWords,...state.learningWords].map(wordKey)),
    [state.knownWords,state.learningWords])

  const waiting = useMemo(() => {
    const started = new Set(state.cards.filter(c => c.id.startsWith('word:')).map(c => wordKey(c.id.slice(5))))
    const known = new Set(state.knownWords.map(wordKey))
    const byKey = new Map([...officialWords, ...state.customWords].map(w => [wordKey(w.en), w]))
    return [...new Set(state.learningWords.map(wordKey))].filter(k => !known.has(k) && !started.has(k))
      .flatMap(k => { const match = byKey.get(k); return match ? [match] : [] })
  }, [state.learningWords, state.knownWords, state.cards, state.customWords])

  function classify(known: boolean) {
    if (!itemKey || !ready()) return
    update(prev => {
      const currentPeriod = activePeriod(today, prev.settings.periods)
      if (dayKey() !== today || currentPeriod === 'exam' || currentPeriod === 'internship' ||
          readDailyCount(prev.notes, dailyKey) >= screeningLimit ||
          [...prev.knownWords, ...prev.learningWords].some(w => wordKey(w) === itemKey)) return prev
      const notes = recordDailyItem(prev.notes, dailyKey, itemKey)
      return { ...prev, knownWords: known ? [...prev.knownWords, itemKey] : prev.knownWords,
        learningWords: known ? prev.learningWords : [...prev.learningWords, itemKey],
        notes: noteMoved(notes, [itemKey], known ? 'k' : 'l', today) }
    })
  }

  const weekPrefix = 'medical-part.' + weekKey(today) + '.'
  const finishedThisWeek = medicalCount(state.checks, weekPrefix)
  const parts = wordParts.filter(p => !state.checks['medical-learned.' + p.id]).slice(0, Math.max(0, medicalLimit - finishedThisWeek))
  const practiceWord = waiting[0]
  function startReview(word: typeof practiceWord) {
    if (!word) return
    const key = wordKey(word.en), id = 'word:' + key
    update(prev => {
      if (dayKey() !== today || prev.cards.some(card => card.id.startsWith('word:') && wordKey(card.id.slice(5)) === key) ||
          !prev.learningWords.some(entry => wordKey(entry) === key) || prev.knownWords.some(entry => wordKey(entry) === key)) return prev
      return { ...prev, cards: [...prev.cards, newCard(id, today)] }
    })
  }
  function rememberMedicalPart(id: (typeof wordParts)[number]['id']) {
    const key = 'medical-learned.' + id
    update(prev => {
      if (dayKey() !== today || prev.checks[key] || medicalCount(prev.checks, weekPrefix) >= medicalLimit) return prev
      return { ...prev, checks: { ...prev.checks, [weekPrefix + id]: true, [key]: true } }
    })
  }

  if (quiet) return <p>今天只複習熟悉的內容。</p>
  return <section className="vocab-area" aria-label="單字與字根字首">
    <div className="vocab-tabs">{([['screen','單字快篩'],['learn','待學單字'],['lookup','分級找字'],['roots','字根字首']] as const)
      .map(([id,label]) => <button type="button" key={id} aria-pressed={tab === id}
        onClick={() => setTab(id)}>{label}</button>)}</div>

      {tab === 'screen' && <div className="vocab-panel" ref={screenPanel} tabIndex={-1}>
        <p>第 1、2 級優先。認得的字會跳過，不認得的字收進待學單字。</p>
        {item ? <>
          <small>今天第 {screened + 1} 個／{screeningLimit} · {item.level ? '第 ' + item.level + ' 級' : '我的詞表'}</small>
          <strong className="vocab-term" lang="en">{item.en}</strong>
        </> : screened >= screeningLimit ? <strong>今天已看 {screened} 個，明天接著看。</strong> :
          !queue.length ? <strong>已篩完第 1、2 級和匯入的單字。{screened > 0 && '今天已看 ' + screened + ' 個。'}</strong> :
          <button type="button" onClick={() => setWorking(true)}>{screened ? '繼續快篩' : '開始快篩'} · 今天已看 {screened} 個</button>}
        <div hidden={!item}><AskWord en={item?.en} zh={reveal ? item?.zh : undefined} fallback={() => screenPanel.current} /></div>
        {item && <>
          {reveal ? <p>{item.zh ? shownMeaning(item) : '匯入時未提供中文詞義。'}</p> :
            <button type="button" onClick={() => setRevealedCard(cardIdentity)}>看中文意思</button>}
          <div className="vocab-tabs">
            <button type="button" onClick={() => classify(true)}>認得</button>
            <button type="button" onClick={() => classify(false)}>不認得</button>
            <button type="button" onClick={() => setWorking(false)}>先到這裡</button>
          </div>
        </>}
      </div>}
      {tab === 'learn' && <div className="vocab-panel" ref={learnPanel} tabIndex={-1}>
        {practiceWord && <><small>待學 {waiting.length} 個</small><strong className="vocab-term" lang="en">{practiceWord.en}</strong>
          <p>{practiceWord.zh ? shownMeaning(practiceWord) : '匯入時未提供中文詞義。'}</p>
        </>}
        <div hidden={!practiceWord}>
          <AskWord en={practiceWord?.en} zh={practiceWord?.zh} fallback={() => learnPanel.current} />
          {practiceWord && <UseWord key={practiceWord.en} en={practiceWord.en} zh={practiceWord.zh}
            onGood={() => update(prev => ({ ...prev, notes: markSkill(prev.notes, wordKey(practiceWord.en), 'write', today) }))} />}
        </div>
        {practiceWord ? <button type="button" onClick={() => startReview(practiceWord)}>學過這個字，明天複習</button> :
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
            <ul className="vocab-results">{lookup.map(word => <li key={word.en}><span><b lang="en">{word.en}</b> · {shownMeaning(word)} <AskWord en={word.en} zh={word.zh} /><HomographNote en={word.en} side="everyday" /></span>
              <button type="button" disabled={classified.has(wordKey(word.en))} onClick={() => {
                const key = wordKey(word.en)
                update(prev => [...prev.knownWords, ...prev.learningWords].some(w => wordKey(w) === key) ? prev : {
                  ...prev, learningWords: [...prev.learningWords, key], notes: noteMoved(prev.notes, [key], 'l', today),
                })
              }}>{classified.has(wordKey(word.en)) ? '已記錄' : '加入待學'}</button></li>)}</ul>}
      </div>}
      {tab === 'roots' && <div className="vocab-panel">
        <div className="vocab-tabs wp-kinds">
          <button type="button" aria-pressed={rootKind === 'everyday'} onClick={() => setRootKind('everyday')}>日常 <small>{learnedParts(state.checks).length}／{everydayParts.length}</small></button>
          <button type="button" aria-pressed={rootKind === 'medical'} onClick={() => setRootKind('medical')}>醫護 <small>{wordParts.filter(p => state.checks['medical-learned.' + p.id]).length}／{wordParts.length}</small></button>
        </div>
        {rootKind === 'everyday' ? <WordParts state={state} update={update} /> : <>
          <p>本週兩個醫護字根、字首或字尾，已學 {finishedThisWeek} 個。</p>
          {parts.map(part => <article key={part.id}>
            <small>{part.type}</small><strong className="vocab-term" lang="en">{part.part}</strong>
            <p>{part.meaning} · <span lang="en">{part.example}</span>（{part.translation}） <AskWord en={part.part} zh={part.type + '：' + part.meaning} /></p>
            <button type="button" onClick={() => rememberMedicalPart(part.id)}>記下這個{part.type}</button>
          </article>)}
          {!parts.length && <p>{finishedThisWeek >= medicalLimit ? '本週的兩個已完成。' : '60 個醫護構詞都學過了。'}</p>}
          <a href="https://medlineplus.gov/appendixa.html" target="_blank" rel="noreferrer">醫護構詞參考（MedlinePlus）</a>
        </>}
      </div>}

    <details><summary>詞表來源</summary>
      <p>大考中心 111 學年度起適用的高中英文參考詞彙表共六級，本版收錄 6,012 個詞條。快篩內建第 1、2 級的 2,004 個詞條，中文釋義另行整理。</p>
      <a href="https://www.ceec.edu.tw/xmdoc?xsmsid=0K213553204833715309" target="_blank" rel="noreferrer">大考中心詞表</a> · <a href="https://github.com/skywind3000/ECDICT" target="_blank" rel="noreferrer">中文詞義來源</a>
    </details>
  </section>
}

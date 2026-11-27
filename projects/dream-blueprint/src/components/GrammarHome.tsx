import DraftVersions from './DraftVersions'
import { chapterLeft, stagesUsing } from '../lib/writing'
import { useEffect, useMemo, useState } from 'react'
import type { AppState, PageProps } from '../lib/store'
import { bookRoute, chapterFile, chapterLabel, chapterOf, chapterReady, findSection, flatSections, levelNames, neighbors, saveBookDrill, sectionDone, sectionLabel, shownParts,
  type BookIndex, type ChapterContent, type SectionContent } from '../lib/grammarBook'
import { openClaude, useTaskContext } from '../lib/taskContext'
import { readDraft, writeDraft } from '../lib/drafts'
import { tutorKey } from '../lib/tutor'
import { reached } from '../lib/unlock'
import { DrillRun, ExplainBody, GrammarBook } from './GrammarTeach'
import CorrectBox, { useCorrectionBlocked, useCorrectionPending } from './CorrectBox'
import { correctionKey, readCorrection, storeCorrection } from '../lib/correctionHistory'
import { PetIcon } from './PixelPet'
import './grammar.css'
import './grammar-book.css'
import './ai-chat.css'

type Props = Pick<PageProps, 'state'> & { onActivity: PageProps['update']; onSavedActivity: (apply: (prev: AppState) => AppState) => Promise<void>; date: string; hash: string }
// Each chapter's teaching is its own download, fetched when a section of it opens.
const files = import.meta.glob<{ default: ChapterContent }>('../data/grammar-book/*.json')
const loadChapter = (id: string) => files['../data/grammar-book/' + chapterFile(chapterOf(id)) + '.json']?.().then(f => f.default) ?? Promise.resolve(null)
const go = (to: string) => { location.hash = '#library/grammar' + (to ? '/' + to : '') }

function GrammarLoadError({ section = false }: { section?: boolean }) {
  return <div className="pr-hint" role="alert">
    <strong>{section ? '這一節的教材載入失敗' : '文法講解載入失敗'}</strong>
    <p>確認網路連線後，重新載入這一頁。</p>
    <div className="pr-actions">
      {/* A reload clears the failed module import and keeps the section address. */}
      <button type="button" className="pr-main" onClick={() => location.reload()}>重新載入</button>
    </div>
  </div>
}

/** 文法講解: 完整文法 (the whole catalog, section by section) and 課程單元 (the course units' teaching, as before). */
export default function GrammarHome({ state, onActivity, onSavedActivity, date, hash }: Props) {
  const [index, setIndex] = useState<BookIndex | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    import('../data/grammar-book/index.json').then(f => { if (alive) setIndex(f.default as BookIndex) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [])
  const route = index ? bookRoute(index, hash) : null
  useEffect(() => { document.querySelector('.gb-top')?.scrollIntoView({ block: 'start' }) }, [hash])
  if (failed) return <GrammarLoadError />
  if (!index || !route) return <p>載入中……</p>
  const units = route.kind === 'unit' || route.kind === 'units'
  return <div className="pr-stack gb-top">
    <div className="pr-options qz-tabs" role="group" aria-label="文法講解">
      <button type="button" aria-pressed={!units} onClick={() => go('')}>完整文法</button>
      <button type="button" aria-pressed={units} onClick={() => go('units')}>課程單元</button>
    </div>
    {route.kind === 'unit' ? <GrammarBook key={route.unit} initialUnit={route.unit} state={state} onActivity={onActivity} date={date} />
      : route.kind === 'units' ? <GrammarBook state={state} onActivity={onActivity} date={date} />
      : route.kind === 'section' ? <SectionView key={route.id} index={index} id={route.id} state={state} onActivity={onActivity} onSavedActivity={onSavedActivity} date={date} />
      : <Catalog index={index} notes={state.notes} />}
  </div>
}

/** The whole catalog: parts, then chapters (folded, with how many sections are practised), then their sections. */
function Catalog({ index, notes }: { index: BookIndex; notes: Record<string, string> }) {
  const all = useMemo(() => flatSections(index), [index])
  const written = all.filter(s => chapterReady(index, s.chapter))
  const practised = written.filter(s => sectionDone(notes, s.id))
  const upNext = written.find(s => !sectionDone(notes, s.id))
  const openAt = upNext ? upNext.chapter : undefined
  const parts = useMemo(() => shownParts(index), [index])
  const chapters = parts.flatMap(p => p.chapters)
  const row = (s: (typeof all)[number]) => {
    const ready = chapterReady(index, s.chapter)
    const done = ready && sectionDone(notes, s.id)
    return <li key={s.id}><a href={'#library/grammar/' + s.id} data-done={done || undefined} data-ready={ready || undefined}>
      <span className="gb-id">{sectionLabel(index, s.id)}</span><span className="gb-title">{s.title}</span>
      <em className={'gb-lv gb-lv' + s.level}>{levelNames[s.level]}</em>{done ? <i className="gb-ok" aria-label="練過">✓</i> : null}
    </a></li>
  }
  return <div className="pr-stack gb">
    <p className="gb-intro">照「英文文法完整主題目錄」排：{chapters.length} 章、{all.length - index.appendix.length} 節，另有 {index.appendix.length} 張附錄表。每一節有白話重點、例句（可以點來聽）、常見錯誤、3 題小練習，還可以自己造一句請 Claude 批改。標「基礎」的先讀。</p>
    <p className="qz-meta"><span>寫好 {written.length} / {all.length} 節</span><span>練過 {practised.length} 節</span></p>
    {upNext && <div className="pr-actions"><a className="pr-main gb-next" href={'#library/grammar/' + upNext.id}>{practised.length ? '接著讀' : '從這裡開始'}：{sectionLabel(index, upNext.id)} {upNext.title} →</a></div>}
    {parts.map(p => <section key={p.id} className="gb-part">
      <h3>{p.title}</h3>
      {p.chapters.map(c => {
        const done = c.ready ? c.sections.filter(s => sectionDone(notes, s.id)).length : 0
        return <details key={c.n} className="gb-ch" open={openAt === c.n || undefined}>
          <summary><b>第 {chapterLabel(index, c.n)} 章</b><span>{c.title}</span><small>{c.ready ? '練過 ' + done + ' / ' + c.sections.length + ' 節' : c.sections.length + ' 節 · 還在寫'}</small></summary>
          <ol className="gb-list">{c.sections.map(s => row({ ...s, chapter: c.n }))}</ol>
        </details>
      })}
    </section>)}
    <section className="gb-part">
      <h3>附錄</h3>
      <details className="gb-ch" open={openAt === 'A' || undefined}>
        <summary><b>附錄</b><span>對照表與索引</span><small>{index.appendixReady ? '' : index.appendix.length + ' 張 · 還在寫'}</small></summary>
        <ol className="gb-list">{index.appendix.map(s => row({ ...s, chapter: 'A' }))}</ol>
      </details>
    </section>
  </div>
}

/** One section: where it sits, the teaching, three drills, a sentence of his own for Claude, and the way to the next one. */
function SectionView({ index, id, state, onActivity, onSavedActivity, date }: Omit<Props, 'hash'> & { index: BookIndex; id: string }) {
  const found = findSection(index, id)!
  const { section, chapter, part } = found
  const ready = chapterReady(index, chapterOf(id))
  const [content, setContent] = useState<SectionContent | null | undefined>(ready ? undefined : null)
  useEffect(() => {
    if (!ready) return
    let alive = true
    loadChapter(id).then(c => { if (alive) setContent(c?.[id] ?? null) }).catch(() => { if (alive) setContent(null) })
    return () => { alive = false }
  }, [id, ready])
  const { prev, next } = neighbors(index, id)
  const label = sectionLabel(index, id)
  const name = label + ' ' + section.title
  const draftKey = 'gbook-' + id
  const [text, setText] = useState(() => readDraft(draftKey))
  const [run, setRun] = useState(0)
  function showDraft(value: string) {
    setRun(0)
    setText(value)
  }
  const gradeKey = correctionKey('grammar.' + id)
  const graded = readCorrection(state.notes, gradeKey, text)
  const grading = useCorrectionPending(gradeKey)
  const blocked = useCorrectionBlocked(gradeKey)
  const [round, setRound] = useState(0)
  useTaskContext({
    label: '完整文法：' + name,
    detail: ['他在讀文法講解「' + name + '」（' + levelNames[section.level] + '）' + (chapter ? '，第 ' + chapterLabel(index, chapter.n) + ' 章 ' + chapter.title : '，附錄') + '。',
      content ? '這一節的重點：\n' + content.points.map(p => '・' + p.t + '：' + p.p).join('\n')
        : (ready ? '本頁沒有載入這一節的教材。' : '這一節的教材尚未上架。') + '他想請你用白話教他重點，給兩三個簡單的例句。',
      '他的英文大約國中一年級程度，用繁體中文、白話回答，例句要簡單。'].join('\n'),
  })
  const onSave = (i: number, right: boolean) => onActivity(prev => ({ ...prev, notes: saveBookDrill(prev.notes, id, i, right, date) }))
  return <div className="pr-stack gb gb-sec">
    <a className="pr-link gb-back" href="#library/grammar">← 回目錄</a>
    <small className="gb-crumb">{part ? part.title + ' · 第 ' + chapterLabel(index, chapter!.n) + ' 章 ' + chapter!.title : '附錄'}</small>
    <h3 className="gb-head"><span className="gb-id">{label}</span>{section.title}<em className={'gb-lv gb-lv' + section.level}>{levelNames[section.level]}</em></h3>
    {section.units?.length ? <p className="gb-units">相關課程單元 {section.units.map((u, i) => <span key={u}>{i ? '、' : ''}{reached(u, state.curriculum.unit)
      ? <a href={'#library/grammar/' + u}>{u}</a> : <>{u}（上到才打開）</>}</span>)}</p> : null}
    {!ready ? <div className="pr-hint"><strong>這一節還在寫</strong><p>想先學的話，按下面的「問 Claude 老師」，請它用白話教你這一節。</p></div>
      : content === undefined ? <p>載入中……</p>
      : content === null ? <GrammarLoadError section />
      : <>
        <ExplainBody steps={content.points} table={content.table} mistakes={content.mistakes} rate={state.settings.speechRate} />
        <DrillRun key={round} drills={content.drills} indices={content.drills.map((_, i) => i)} title="小練習（3 題）" allowUnansweredSkip onAnswer={onSave} onCorrected={i => onSave(i, true)} missed="還沒改對的題目可以按「這三題再做一次」再練一遍。"
          after={<div className="pr-actions"><button type="button" className="pr-link" onClick={() => setRound(round + 1)}>這三題再做一次</button></div>} />
        <section className="gb-try">
          <strong>自己造一句</strong>
          <p>用「{section.title}」寫一句英文，Claude 照全民英檢初級「單句寫作」批改，告訴你哪裡要改。</p>
          <label className="pr-field">我的句子
            <textarea lang="en" rows={2} value={text} spellCheck={false} autoComplete="off" autoCapitalize="off" readOnly={blocked}
              onChange={e => { showDraft(e.target.value); writeDraft(draftKey, e.target.value) }} placeholder="例如照上面的例句換幾個字" />
          </label>
          <DraftVersions id={draftKey} text={text} onChoose={showDraft} disabled={blocked} />
          {tutorKey() ? <div className="pr-actions"><button type="button" className="pr-main" disabled={blocked || !text.trim()} onClick={() => setRun(r => r + 1)}>{graded ? '請 Claude 再批一次' : '請 Claude 批改'}</button></div>
            : <p className="ls-help">還沒連接 Claude：到「設定 → 連接 Claude」貼上金鑰，就能請它批改。</p>}
          {grading && !run && <p role="status" className="ls-help">Claude 正在批改，回覆會留在這一節。</p>}
          <CorrectBox key={run ? 'grading' : graded?.id ?? 'ungraded'} run={run} mode="open" rubric="gept-sentence" selfFix zh={'用這一節的文法「' + name + '」自己寫一句英文'}
            reference={content.points[0]?.ex[0]?.en} words={[section.title]} answer={text}
            restore={!run && graded ? { ...graded, showFull: false } : undefined}
            backgroundGrade={{ id: gradeKey, save: (result, answer, submission) => onSavedActivity(prev => ({
              ...prev, notes: storeCorrection(prev.notes, gradeKey, { ...submission, result, answer }),
            })) }} />
        </section>
      </>}
    <div className="pr-actions"><button type="button" className="ask-word gb-ask" onClick={openClaude}><PetIcon size={18} />問 Claude 老師</button></div>
    {/* The writing ladder follows this book: the stages that use this chapter, and how much of it is left to learn. */}
    {chapter && stagesUsing(chapter.n).length > 0 && (() => {
      const left = chapterLeft(state.notes, chapter.n)
      return <p className="gb-writing">寫作階梯{stagesUsing(chapter.n).map(st => '「' + st.name + '」').join('、')}要先讀這一章：{left ? '還有 ' + left + ' 節的小練習沒做，做完這一章就符合打開的條件。' : '這一章讀完了。'}<a href="#library/writing">去寫作階梯 →</a></p>
    })()}
    <nav className="gb-nav" aria-label="上一節、下一節">
      {prev ? <a href={'#library/grammar/' + prev.id}>← 上一節<small>{sectionLabel(index, prev.id)} {prev.title}</small></a> : <span />}
      {next ? <a href={'#library/grammar/' + next.id}>下一節 →<small>{sectionLabel(index, next.id)} {next.title}</small></a> : <span />}
    </nav>
  </div>
}

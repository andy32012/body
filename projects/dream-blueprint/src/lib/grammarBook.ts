/** 完整文法: the owner's grammar catalog (英文文法完整主題目錄 — 5 parts, 41 chapters, 638 sections and appendix tables
 *  A-1…A-10), every section taught in plain Chinese with examples, common mistakes and three drills, plus a sentence of his
 *  own for Claude to check. The index (src/data/grammar-book/index.json) lists every section; a chapter's teaching is its
 *  own file (ch01.json … ch41.json, appendix.json), written a whole chapter at a time (`ready`). The course units'
 *  teaching (grammar.json, gram.<unit>) stays as it is; sections a unit teaches link to it (`units`). */
import { readMarks, saveMark, type Drill, type GrammarMistake, type GrammarRecord, type GrammarStep, type GrammarTable } from './grammar'

export type BookLevel = 1 | 2 | 3
export const levelNames: Record<BookLevel, string> = { 1: '基礎', 2: '進階', 3: '高階' }
export interface BookSection { id: string; title: string; level: BookLevel
  /** The course units that teach this (their 講解 and 7 drills in 課程單元). */
  units?: number[] }
export interface BookChapter { n: number; title: string; en: string; sections: BookSection[]
  /** Every section of the chapter is written (its file exists). */
  ready?: boolean }
export interface BookPart { id: string; title: string; chapters: BookChapter[] }
export interface BookIndex { parts: BookPart[]; appendix: BookSection[]; appendixReady?: boolean }
export interface SectionContent { points: GrammarStep[]; table?: GrammarTable; mistakes: GrammarMistake[]; drills: Drill[] }
export type ChapterContent = Record<string, SectionContent>
export type ChapterKey = number | 'A'

/** The file a section's chapter lives in: 14-2 → ch14, A-1 → appendix. */
export const chapterOf = (id: string): ChapterKey => id.startsWith('A-') ? 'A' : Number(id.split('-')[0])
export const chapterFile = (c: ChapterKey) => c === 'A' ? 'appendix' : 'ch' + String(c).padStart(2, '0')

export type FlatSection = BookSection & { chapter: ChapterKey }
/** Every section in reading order: the chapters, then the appendix. */
export function flatSections(index: BookIndex): FlatSection[] {
  return [...index.parts.flatMap(p => p.chapters.flatMap(c => c.sections.map(s => ({ ...s, chapter: c.n as ChapterKey })))),
    ...index.appendix.map(s => ({ ...s, chapter: 'A' as ChapterKey }))]
}
/** A section with its chapter and part (none for the appendix). */
export function findSection(index: BookIndex, id: string) {
  for (const part of index.parts) for (const chapter of part.chapters) {
    const section = chapter.sections.find(s => s.id === id)
    if (section) return { section, chapter, part }
  }
  const section = index.appendix.find(s => s.id === id)
  return section ? { section, chapter: undefined, part: undefined } : null
}
/** 上一節 / 下一節: the neighbours in reading order, across chapters. */
export function neighbors(index: BookIndex, id: string): { prev?: FlatSection; next?: FlatSection } {
  const all = flatSections(index)
  const i = all.findIndex(s => s.id === id)
  return i < 0 ? {} : { prev: all[i - 1], next: all[i + 1] }
}
/** Whether a chapter's teaching is written. */
export const chapterReady = (index: BookIndex, c: ChapterKey) => c === 'A' ? !!index.appendixReady : !!index.parts.flatMap(p => p.chapters).find(x => x.n === c)?.ready

export type BookRoute = { kind: 'catalog' } | { kind: 'units' } | { kind: 'unit'; unit: number } | { kind: 'section'; id: string }
/** #library/grammar → the catalog; …/12 → course unit 12 (the old address, kept); …/14-2 or …/A-1 → that section;
 *  …/units → the course units. Anything else opens the catalog. */
export function bookRoute(index: BookIndex, hash: string): BookRoute {
  const rest = hash.replace(/^#/, '').split('/')[2]
  if (!rest) return { kind: 'catalog' }
  if (rest === 'units') return { kind: 'units' }
  if (/^\d+$/.test(rest) && Number(rest) > 0) return { kind: 'unit', unit: Number(rest) }
  return findSection(index, rest) ? { kind: 'section', id: rest } : { kind: 'catalog' }
}

export const bookKey = (id: string) => 'gbook.' + id
export const readBook = (notes: Record<string, string>, id: string): GrammarRecord => readMarks(notes, bookKey(id))
export const saveBookDrill = (notes: Record<string, string>, id: string, index: number, right: boolean, day: string) => saveMark(notes, bookKey(id), index, right, day)
/** Practised: every one of its three drills answered at least once. */
export const sectionDone = (notes: Record<string, string>, id: string, drills = 3) => Object.keys(readBook(notes, id).marks).length >= drills

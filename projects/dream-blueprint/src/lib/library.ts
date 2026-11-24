import { hasPack, packUnits } from './bridge'

/** The practice library. Every kind of practice has a page of its own, #library/<mode>, and nothing puts two kinds on one
 *  page. The main menu lists them under 英文練習 (the sidebar on a computer or tablet); on a phone the 英文練習 page itself
 *  (#library) is that list. The speaking page (#speaking) is listed with them. */
export type LibraryMode = 'words' | 'listen' | 'quiz' | 'case' | 'screen' | 'translate' | 'passage' | 'reading' | 'writing' | 'unit'
  | 'nlisten' | 'nread' | 'nwords' | 'grammar' | 'story' | 'sound'
/** An entry of the 英文練習 menu: a kind of practice, or the speaking page. */
export type MenuId = LibraryMode | 'speaking'
export type LibraryGroup = 'main' | 'words' | 'nursing'

export const libraryModes: LibraryMode[] = ['listen', 'translate', 'story', 'reading', 'writing', 'unit', 'quiz', 'words', 'screen', 'passage',
  'grammar', 'sound', 'nlisten', 'nread', 'nwords', 'case']
const labels: Record<MenuId, string> = {
  listen: '句子跟讀', translate: '中翻英', story: '短文讀聽', reading: '閱讀理解', writing: '寫作階梯', unit: '單元讀聽說寫', quiz: '選擇題',
  words: '單字複習', screen: '單字快篩', passage: '7000 單短文', grammar: '文法講解', sound: '發音課',
  nlisten: '護理聽力', nread: '護理閱讀', nwords: '護理單字', case: '臨床情境', speaking: '英文口說',
}
/** One line under each entry of the 英文練習 page: what you do there. */
const notes: Record<MenuId, string> = {
  translate: '看中文寫英文，Claude 批改；到期的句子卡也在這裡',
  speaking: '跟 Emma 用英文聊天',
  listen: '聽一句英文，跟著念',
  story: '分級短文：讀、聽、聽寫',
  reading: '讀一篇文章，回答問題',
  writing: '從一句寫到一整篇，一階一階變難',
  unit: '這個單元的聽、讀、說、寫和回測',
  quiz: '英文和護理英文的選擇題',
  grammar: '每個文法單元的講解和小練習',
  sound: '自然發音、重音、連音',
  words: '到期的單字卡，還有聽懂、說出、寫出',
  screen: '篩出已經會的字，還有分級找字和字根字首',
  passage: '用 7000 單寫成的短文',
  nlisten: '護理師和病人的對話聽力',
  nread: '護理文章閱讀',
  nwords: '護理常用字，看懂、聽懂、說出、寫出',
  case: '一步一步判斷臨床情境',
}
/** During exams and internship the questions are the nursing-English ones only. */
export const modeLabel = (mode: MenuId, periodQuiet = false) => mode === 'quiz' && periodQuiet ? '護理英文題' : labels[mode]

export interface MenuEntry { id: MenuId; label: string; note: string; hash: string }
export interface MenuGroup { id: LibraryGroup; title: string; entries: MenuEntry[] }

/** The menu's order: 中翻英 and 英文口說 first, then the other kinds of practice; words and nursing English each in a group. */
const groups: { id: LibraryGroup; title: string; ids: MenuId[] }[] = [
  { id: 'main', title: '聽說讀寫', ids: ['translate', 'speaking', 'listen', 'story', 'reading', 'writing', 'unit', 'quiz', 'grammar', 'sound'] },
  { id: 'words', title: '單字', ids: ['words', 'screen', 'passage'] },
  { id: 'nursing', title: '護理英文', ids: ['nlisten', 'nread', 'nwords', 'case'] },
]
export const menuHash = (id: MenuId) => id === 'speaking' ? 'speaking' : 'library/' + id
/** The unit packs (單元讀聽說寫) start at the first bridge unit. */
export const unitPackOpen = (unit: number) => hasPack(unit) || unit > packUnits[0]

/** What the menu lists now. Exams and internship add no new material: writing, the unit packs and the word screen rest, and
 *  the questions are the nursing ones only, listed with nursing English as 護理英文題. */
export function menuGroups({ periodQuiet = false, unit = 1 }: { periodQuiet?: boolean; unit?: number } = {}): MenuGroup[] {
  const resting = new Set<MenuId>(periodQuiet ? ['writing', 'unit', 'screen'] : [])
  if (!unitPackOpen(unit)) resting.add('unit')
  return groups.map(g => {
    let ids = g.ids.filter(id => !resting.has(id))
    if (periodQuiet && g.id === 'main') ids = ids.filter(id => id !== 'quiz')
    if (periodQuiet && g.id === 'nursing') ids = [...ids, 'quiz']
    return { id: g.id, title: g.title, entries: ids.map(id => ({ id, label: modeLabel(id, periodQuiet), note: notes[id], hash: menuHash(id) })) }
  })
}

/** The kind of practice a library address opens: "#library/story/listen", "library/words" or just the mode. The page alone
 *  (#library), or a name it does not know, opens the 英文練習 list: null. */
export function libraryPage(hash: string | undefined): LibraryMode | null {
  const parts = (hash ?? '').replace(/^#/, '').split('/')
  const mode = (parts[0] === 'library' ? parts[1] : parts[0]) as LibraryMode
  return libraryModes.includes(mode) ? mode : null
}

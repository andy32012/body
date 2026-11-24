/** The practice library is one page with many kinds of practice. They are grouped into sections; each section has its own
 *  entry in the main menu (the sidebar on a computer or tablet, a row of chips on a phone), so the page itself only shows the
 *  few kinds that belong to the section that is open. A kind of practice is addressed as #library/<mode>.
 *  英文練習 itself (#library, mode `home`) is only today's lesson; every extra practice has its own menu entry and page. */
export type LibraryMode = 'home' | 'words' | 'listen' | 'quiz' | 'case' | 'screen' | 'translate' | 'passage' | 'reading' | 'writing' | 'unit'
  | 'nlisten' | 'nread' | 'nwords' | 'grammar' | 'story' | 'sound'
export type LibrarySection = 'practice' | 'listen' | 'translate' | 'story' | 'reading' | 'writing' | 'unit' | 'quiz'
  | 'words' | 'grammar' | 'sound' | 'nursing'

export const libraryModes: LibraryMode[] = ['home', 'listen', 'translate', 'story', 'reading', 'writing', 'unit', 'quiz', 'words', 'screen', 'passage',
  'grammar', 'sound', 'nlisten', 'nread', 'nwords', 'case']
const labels: Record<LibraryMode, string> = {
  home: '英文練習', listen: '句子跟讀', translate: '中翻英', story: '短文讀聽', reading: '閱讀理解', writing: '寫作階梯', unit: '單元讀聽說寫', quiz: '選擇題',
  words: '單字複習', screen: '單字快篩', passage: '7000 單短文', grammar: '文法講解', sound: '發音課',
  nlisten: '護理聽力', nread: '護理閱讀', nwords: '護理單字', case: '臨床情境',
}
/** During exams and internship the questions are the nursing-English ones only. */
export const modeLabel = (mode: LibraryMode, periodQuiet = false) => mode === 'quiz' && periodQuiet ? '護理英文題' : labels[mode]

export interface SectionInfo { id: LibrarySection; title: string; menu: string; chip: string; heading: string; modes: LibraryMode[] }
/** `title` names the page, `menu` is the name in the sidebar, `chip` the two-character name on a phone, `heading` stands above the section's buttons. */
export const librarySections: SectionInfo[] = [
  { id: 'practice', title: '英文練習', menu: '英文練習', chip: '練習', heading: '英文練習', modes: ['home'] },
  { id: 'listen', title: '句子跟讀', menu: '句子跟讀', chip: '跟讀', heading: '句子跟讀', modes: ['listen'] },
  { id: 'translate', title: '中翻英', menu: '中翻英', chip: '翻譯', heading: '中翻英', modes: ['translate'] },
  { id: 'story', title: '短文讀聽', menu: '短文讀聽', chip: '讀聽', heading: '短文讀聽', modes: ['story'] },
  { id: 'reading', title: '閱讀理解', menu: '閱讀理解', chip: '閱讀', heading: '閱讀理解', modes: ['reading'] },
  { id: 'writing', title: '寫作', menu: '寫作', chip: '寫作', heading: '寫作', modes: ['writing'] },
  { id: 'unit', title: '單元讀聽說寫', menu: '單元讀聽說寫', chip: '單元', heading: '單元讀聽說寫', modes: ['unit'] },
  { id: 'quiz', title: '選擇題', menu: '選擇題', chip: '選擇', heading: '選擇題', modes: ['quiz'] },
  { id: 'words', title: '單字', menu: '單字', chip: '單字', heading: '單字', modes: ['words', 'screen', 'passage'] },
  { id: 'grammar', title: '文法講解', menu: '文法', chip: '文法', heading: '文法講解', modes: ['grammar'] },
  { id: 'sound', title: '發音課', menu: '發音', chip: '發音', heading: '發音課', modes: ['sound'] },
  { id: 'nursing', title: '護理英文', menu: '護理英文', chip: '護理', heading: '護理英文', modes: ['nlisten', 'nread', 'nwords', 'case'] },
]
export const sectionInfo = (id: LibrarySection) => librarySections.find(s => s.id === id)!

/** The kinds of practice of a section, in the order of their buttons. The questions (quiz) sit with general practice in
 *  term time and with nursing English during exams and internship, when only the nursing questions are open. */
export function sectionModes(section: LibrarySection, periodQuiet = false): LibraryMode[] {
  const modes = sectionInfo(section).modes
  if (!periodQuiet) return modes
  if (section === 'quiz') return []
  return section === 'nursing' ? [...modes, 'quiz'] : modes
}
export const sectionOf = (mode: LibraryMode, periodQuiet = false): LibrarySection =>
  librarySections.find(s => sectionModes(s.id, periodQuiet).includes(mode))!.id

/** "#library/story/listen", "library/words" or just the mode: the kind of practice it names. The page alone opens 英文練習. */
export function modeFromHash(hash: string | undefined): LibraryMode {
  const parts = (hash ?? '').replace(/^#/, '').split('/')
  const mode = (parts[0] === 'library' ? parts[1] : parts[0]) as LibraryMode
  return libraryModes.includes(mode) ? mode : 'home'
}
/** Where a section's menu entry leads: its first kind of practice (英文練習 is the bare #library). */
export const sectionHash = (section: LibrarySection, periodQuiet = false) => {
  const first = sectionModes(section, periodQuiet)[0]
  return !first || first === 'home' ? 'library' : 'library/' + first
}
/** The sections that get a menu entry now: the unit pack only once bridge units have started (or while it is open),
 *  the questions not in exam and internship periods (they move to 護理英文 then). */
export const menuSections = (o: { periodQuiet: boolean; packOpen: boolean; current?: LibrarySection | null }) =>
  librarySections.filter(s => sectionModes(s.id, o.periodQuiet).length > 0 && (s.id !== 'unit' || o.packOpen || o.current === 'unit'))

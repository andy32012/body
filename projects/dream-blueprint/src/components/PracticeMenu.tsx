import {
  AudioLines, BookA, BookOpenText, ChevronRight, ClipboardList, FileText, Gauge, Headphones, HeartPulse, Languages, Layers,
  ListChecks, ListFilter, Mic, Newspaper, PenLine, Repeat, Shuffle, SpellCheck, Stethoscope,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AppState } from '../lib/store'
import { menuGroups, type MenuId } from '../lib/library'
import { activePeriod, reviewEnergy, reviewLoad } from '../lib/progress'
import { readResults, testDue } from '../lib/baseline'
import { dueThemeRun } from '../lib/themes'
import './practice-menu.css'

/** One icon per kind of practice, shared by the sidebar and the 英文練習 page. */
export const menuIcons: Record<MenuId, LucideIcon> = {
  translate: Languages, speaking: Mic, listen: Repeat, story: BookOpenText, reading: FileText, writing: PenLine, unit: Layers,
  quiz: ListChecks, grammar: SpellCheck, theme: Shuffle, sound: AudioLines, words: BookA, screen: ListFilter, passage: Newspaper,
  nlisten: Headphones, nread: ClipboardList, nwords: Stethoscope, case: HeartPulse,
}

/** The 英文練習 page: every kind of practice as one row that opens its own page. On a phone this is the whole menu. */
export default function PracticeMenu({ state, today }: { state: AppState; today: string }) {
  const periodQuiet = ['exam', 'internship'].includes(activePeriod(today, state.settings.periods))
  const groups = menuGroups({ periodQuiet, unit: state.curriculum.unit })
  const load = reviewLoad(state, today, reviewEnergy(today, state.settings.periods))
  const waiting: Partial<Record<MenuId, string>> = {
    ...(load.words ? { words: '今天 ' + load.words + ' 張' } : {}),
    ...(load.sentences ? { translate: '今天 ' + load.sentences + ' 句' } : {}),
    ...(dueThemeRun(state.notes, state.curriculum.unit) ? { theme: '該考了' } : {}),
  }
  const retest = testDue(state.notes, today)
  return <nav className="pm-menu" aria-label="英文練習的種類">
    {retest && <a className="pm-retest" href="#leveltest">
      <span className="pm-icon"><Gauge size={19} /></span>
      <span className="pm-text"><b>{readResults(state.notes).length ? '英文程度回測' : '起點測驗'}</b><small>時間到了，大約 15 分鐘</small></span>
      <ChevronRight size={17} aria-hidden="true" />
    </a>}
    {groups.filter(g => g.entries.length).map(g => <section className="pm-group" key={g.id} aria-labelledby={'pm-' + g.id}>
      <h2 id={'pm-' + g.id}>{g.title}</h2>
      <ul>{g.entries.map(e => {
        const Icon = menuIcons[e.id]
        return <li key={e.id}><a href={'#' + e.hash}>
          <span className="pm-icon"><Icon size={19} /></span>
          <span className="pm-text"><b>{e.label}</b><small>{e.note}</small></span>
          {waiting[e.id] ? <em>{waiting[e.id]}</em> : <span />}
          <ChevronRight size={17} aria-hidden="true" />
        </a></li>
      })}</ul>
    </section>)}
  </nav>
}

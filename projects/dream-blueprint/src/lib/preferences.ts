import { countKey } from './dailyWords'
import type { AppState } from './store'

const revisionsKey = 'preferences.revisions'
const days = [0, 1, 2, 3, 4, 5, 6]
const settingsFields = ['theme', 'why', 'rivalsEnabled', 'taunt', 'periods', 'showStreak', 'speechRate', 'officeAsked',
  'officeReply', 'internshipSeason'] as const satisfies ReadonlyArray<keyof AppState['settings']>
const schoolFields = ['schoolName', 'program', 'className', 'studentStatus', 'term', 'requiredCredits', 'acceptedCredits',
  'transferCourses', 'currentCourses', 'currentCredits', 'weeklyPeriods', 'graduation'] as const satisfies
  ReadonlyArray<keyof AppState['school']>
const schoolLists = ['classes', 'events'] as const

function readRevisions(notes: AppState['notes']): Map<string, number> {
  try {
    const value: unknown = JSON.parse(notes[revisionsKey] ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return new Map(Object.entries(value).filter((entry): entry is [string, number] =>
        Number.isSafeInteger(entry[1]) && entry[1] > 0 && entry[1] < Number.MAX_SAFE_INTEGER))
    }
  } catch { /* Older or unreadable preference metadata can be rebuilt as preferences are saved. */ }
  return new Map()
}

const settingKey = (field: string) => 'settings.' + field
const schoolKey = (field: string) => 'school.' + field
const schoolItemKey = (field: typeof schoolLists[number], id: string) => schoolKey(field) + '.' + id
const weekKey = (day: number) => 'week.' + day
const timeKey = (day: number) => 'study.time.' + day
const studySlot = (state: AppState, day: number) => state.school.study.find(slot => slot.weekday === day)
// A change to the weekday arrangement can change its default study budget as part of the same edit.
const week = (state: AppState, day: number) => {
  return [state.settings.regularDays.includes(day), state.settings.restDays.includes(day), studySlot(state, day)?.minutes] as const
}
const equal = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)
const byId = <T extends { id: string }>(items: T[]) => new Map(items.map(item => [item.id, item]))

/** A local edit moves only the preferences it actually changed forward. Other progress copies their metadata. */
export function stampPreferenceChanges(previous: AppState, state: AppState, now: number): AppState {
  const changed: string[] = []
  if (previous.settings !== state.settings) {
    for (const field of settingsFields) {
      if (!equal(previous.settings[field], state.settings[field])) changed.push(settingKey(field))
    }
  }
  if (previous.school !== state.school) {
    for (const field of schoolFields) {
      if (!equal(previous.school[field], state.school[field])) changed.push(schoolKey(field))
    }
    for (const field of schoolLists) {
      if (previous.school[field] === state.school[field]) continue
      const before = byId<{ id: string }>(previous.school[field])
      const after = byId<{ id: string }>(state.school[field])
      for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (!equal(before.get(id), after.get(id))) changed.push(schoolItemKey(field, id))
      }
    }
  }
  if (previous.settings !== state.settings || previous.school !== state.school) {
    for (const day of days) {
      if (!equal(week(previous, day), week(state, day))) changed.push(weekKey(day))
      if ((studySlot(previous, day)?.time ?? '') !== (studySlot(state, day)?.time ?? '')) changed.push(timeKey(day))
    }
  }
  if (previous.notes[countKey] !== state.notes[countKey]) changed.push(countKey)
  if (!changed.length) return state
  const revisions = readRevisions(state.notes)
  for (const key of changed) revisions.set(key, Math.max(now, (revisions.get(key) ?? 0) + 1))
  return { ...state, notes: { ...state.notes, [revisionsKey]: JSON.stringify(Object.fromEntries(revisions)) } }
}

/** A preference with no recorded edit follows the older backup behavior. Known edits beat an untracked copy. */
export function mergePreferences(older: AppState, newer: AppState, notes: AppState['notes']) {
  const oldRevisions = readRevisions(older.notes)
  const newRevisions = readRevisions(newer.notes)
  if (!oldRevisions.size && !newRevisions.size) return { settings: newer.settings, school: newer.school, notes }
  const revisions = new Map(newRevisions)
  const winner = (key: string) => (oldRevisions.get(key) ?? 0) > (newRevisions.get(key) ?? 0) ? older : newer
  for (const [key, revision] of oldRevisions) {
    if (winner(key) === older) revisions.set(key, revision)
  }
  const settings = { ...newer.settings }
  const school = { ...newer.school }
  for (const field of settingsFields) Object.assign(settings, { [field]: winner(settingKey(field)).settings[field] })
  for (const field of schoolFields) Object.assign(school, { [field]: winner(schoolKey(field)).school[field] })
  function mergeSchoolItems<T extends { id: string }>(field: typeof schoolLists[number], before: T[], after: T[]) {
    const olderItems = byId(before), newerItems = byId(after)
    const items: T[] = []
    for (const id of new Set([...newerItems.keys(), ...olderItems.keys()])) {
      const chosen = (winner(schoolItemKey(field, id)) === older ? olderItems : newerItems).get(id)
      if (chosen) items.push(chosen)
    }
    return items
  }
  school.classes = mergeSchoolItems('classes', older.school.classes, newer.school.classes)
  school.events = mergeSchoolItems('events', older.school.events, newer.school.events)
  if (days.some(day => revisions.has(weekKey(day)) || revisions.has(timeKey(day)))) {
    settings.regularDays = []
    settings.restDays = []
    school.study = []
    for (const day of days) {
      const [regular, rest, minutes] = week(winner(weekKey(day)), day)
      const time = studySlot(winner(timeKey(day)), day)?.time
      if (regular) settings.regularDays.push(day)
      if (rest) settings.restDays.push(day)
      if (minutes !== undefined || time) school.study.push({ weekday: day, minutes: minutes ?? 0, time: time ?? '' })
    }
  }
  const mergedNotes = { ...notes }
  if (revisions.has(countKey)) {
    const count = winner(countKey).notes[countKey]
    if (count === undefined) delete mergedNotes[countKey]
    else mergedNotes[countKey] = count
  }
  mergedNotes[revisionsKey] = JSON.stringify(Object.fromEntries(revisions))
  return { settings, school, notes: mergedNotes }
}

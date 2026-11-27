type DatedGrade = { day: string; at?: number; correct: number; total: number; zh?: boolean; picks?: number[] }
const orderWhenTied = (g: DatedGrade) => JSON.stringify([g.correct, g.total, !!g.zh, g.picks ?? []])
export function isDatedGrade(value: unknown): value is DatedGrade {
  if (!value || typeof value !== 'object') return false
  const grade = value as Partial<DatedGrade>
  return typeof grade.day === 'string' && Number.isFinite(grade.correct) && Number.isFinite(grade.total)
    && (grade.total ?? 0) > 0 && (grade.at === undefined || Number.isFinite(grade.at))
}

/** A date-only grade predates precise timestamps. Keep it when the first submission cannot be timed. */
export function firstOfDay<T extends DatedGrade>(a: T, b: T): T {
  if ((a.at ?? 0) !== (b.at ?? 0)) return (a.at ?? 0) < (b.at ?? 0) ? a : b
  return orderWhenTied(a) <= orderWhenTied(b) ? a : b
}

export function mergeDailyGrades<T extends DatedGrade>(a: readonly T[], b: readonly T[]): T[] {
  const days = new Map<string, T>()
  for (const grade of [...a, ...b]) {
    const earlier = days.get(grade.day)
    days.set(grade.day, earlier ? firstOfDay(earlier, grade) : grade)
  }
  return [...days.values()].sort((left, right) => left.day.localeCompare(right.day))
}

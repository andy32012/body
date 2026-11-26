/** Bounds for the small teaching charts. Keep the existing scale for changing data;
 *  a flat series still needs room above and below it so the three axis ticks differ. */
export function chartBounds(values: readonly number[]): { lo: number; hi: number } {
  const min = Math.min(...values), max = Math.max(...values)
  const padding = max === min ? 1 : (max - min) * 0.25
  return {
    lo: Math.floor((min - padding) / 5) * 5,
    hi: Math.ceil((max + padding) / 5) * 5,
  }
}

const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
/** Whether the labels are points in time (months, weekdays, years, clock times, week 1…), so a line between them means
 *  a change over time. Anything else (centres A–F, wards, countries) is a comparison and is drawn as bars. */
export function isTimeSeries(labels: readonly string[]): boolean {
  const time = (l: string) => {
    const t = l.trim().toLowerCase()
    return months.includes(t.slice(0, 3)) || weekdays.includes(t.slice(0, 3)) || /^(19|20)\d{2}$/.test(t)
      || /^\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/.test(t) || /^(week|day|month|year|q)\s*\d+$/.test(t)
  }
  return labels.length > 0 && labels.every(time)
}

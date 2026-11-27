import type { ReviewCard, ReviewEvent } from './progress'

const signature = (event: ReviewEvent) =>
  JSON.stringify([event.day, event.id, event.gap, event.remembered, event.shownAnswer])

export const reviewEventKey = (event: ReviewEvent) => event.attempt
  ? JSON.stringify([event.day, event.id, event.attempt]) : signature(event)

/** Separate new offline attempts. An older copy with no ID might be the same attempt already identified elsewhere. */
export function mergeReviewEvents(events: Iterable<ReviewEvent>) {
  const byId = new Map<string, ReviewEvent>()
  const identified = new Set<string>()
  for (const event of events) {
    if (event.attempt) identified.add(signature(event))
    byId.set(reviewEventKey(event), event)
  }
  return [...byId.values()].filter(event => event.attempt || !identified.has(signature(event)))
}

const recallStrength = (event: ReviewEvent) => event.shownAnswer ? 0 : event.remembered ? 2 : 1
const weaker = (a: ReviewEvent, b: ReviewEvent) =>
  recallStrength(a) < recallStrength(b) || (recallStrength(a) === recallStrength(b) && a.gap < b.gap)

/** The latest graded attempt counts once for the card and day. Use the weaker recall if order is unavailable. */
export function effectiveReviews(events: Iterable<ReviewEvent>) {
  const byDayAndCard = new Map<string, { timed?: ReviewEvent; legacy?: ReviewEvent }>()
  for (const event of events) {
    const key = event.day + '/' + event.id
    const group = byDayAndCard.get(key) ?? {}
    if (event.at === undefined) {
      if (!group.legacy || weaker(event, group.legacy)) group.legacy = event
    } else if (!group.timed || event.at > (group.timed.at ?? 0) ||
      (event.at === group.timed.at && weaker(event, group.timed))) {
      group.timed = event
    }
    byDayAndCard.set(key, group)
  }
  return [...byDayAndCard.values()].flatMap(({ timed, legacy }) => {
    if (!timed) return legacy ? [legacy] : []
    return [legacy && weaker(legacy, timed) ? legacy : timed]
  })
}

export function mergeReviewCard(older: ReviewCard, newer: ReviewCard, olderReviewed: boolean, newerReviewed: boolean) {
  if (older.lastDay !== newer.lastDay) return older.lastDay > newer.lastDay ? older : newer
  if (olderReviewed !== newerReviewed) return olderReviewed ? older : newer
  if (older.reviewedAt !== undefined && newer.reviewedAt !== undefined && older.reviewedAt !== newer.reviewedAt)
    return older.reviewedAt > newer.reviewedAt ? older : newer
  // An old client may send the same graded schedule back without its timestamp.
  if ((older.reviewedAt === undefined) !== (newer.reviewedAt === undefined) &&
      older.due === newer.due && older.box === newer.box && older.s === newer.s && older.d === newer.d)
    return older.reviewedAt !== undefined ? older : newer
  if (olderReviewed || older.s !== undefined || newer.s !== undefined) return older.due < newer.due ? older : newer
  return older.due > newer.due ? older : newer
}

import { useEffect } from 'react'
import type { AppState, PageProps } from '../lib/store'
import {
  activePeriod,
  dayKey,
  daysBetween,
  workloadDecision,
} from '../lib/progress'

function decision(state: AppState, day: string) {
  return workloadDecision({
    day,
    startedDay: state.startedDay,
    lastAssessment: state.workload.lastAssessment,
    lastReduction: state.workload.lastReduction,
    period: activePeriod(day, state.settings.periods),
    sessions: state.sessions,
    events: state.reviewEvents,
  })
}

export default function WorkloadRecommendation({
  state,
  update,
}: Pick<PageProps, 'state' | 'update'>) {
  const day = dayKey()
  const action = decision(state, day)
  const { extraWords, lastReduction, lastAssessment } = state.workload
  const period = activePeriod(day, state.settings.periods)
  const assessmentDue =
    period !== 'exam' &&
    period !== 'internship' &&
    daysBetween(lastAssessment || state.startedDay, day) >= 14
  useEffect(() => {
    if (
      action !== 'offer' &&
      assessmentDue &&
      (action === 'keep' || extraWords === 0)
    ) {
      update((prev) => {
        if (
          daysBetween(prev.workload.lastAssessment || prev.startedDay, day) <
            14 ||
          decision(prev, day) === 'offer'
        )
          return prev
        return { ...prev, workload: { ...prev.workload, lastAssessment: day } }
      })
      return
    }
    if (action !== 'reduce' || extraWords <= 0) return
    update((prev) => {
      if (decision(prev, day) !== 'reduce' || prev.workload.extraWords <= 0)
        return prev
      return {
        ...prev,
        workload: {
          ...prev.workload,
          extraWords: prev.workload.extraWords - 1,
          lastReduction: day,
          lastAssessment: day,
        },
      }
    })
  }, [day, action, assessmentDue, extraWords, update])
  function respond(accept: boolean) {
    update((prev) => {
      if (decision(prev, day) !== 'offer') return prev
      return {
        ...prev,
        workload: {
          ...prev.workload,
          lastAssessment: day,
          extraWords: prev.workload.extraWords + Number(accept),
        },
      }
    })
  }
  if (lastReduction === day)
    return <p role="status">最近的練習已調輕，普通和有電時少一個額外單字。</p>
  if (action !== 'offer') return null
  return (
    <section className="workload-recommendation" aria-label="調整練習份量">
      <h3>下次多學一個字？</h3>
      <p>這兩週的練習裡，隔了四天還記得的卡片達到七成。</p>
      <div>
        <button onClick={() => respond(true)}>好，加一個字</button>{' '}
        <button onClick={() => respond(false)}>維持現在的份量</button>
      </div>
    </section>
  )
}

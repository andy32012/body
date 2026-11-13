import { useLayoutEffect, useRef, useState } from 'react'
import { createVisitRotation, sceneAt } from '../lib/backgroundRotation'
import type { AstroPhoto } from '../lib/cosmos'
import RotatingPhoto from './RotatingPhoto'
import './observatory.css'

function deviceRotation() {
  try { return createVisitRotation(window.localStorage) }
  catch { return createVisitRotation() }
}
const nextVisit = deviceRotation()

export function useObservatory(page: string, pinnedId?: string) {
  const lastPage = useRef<string>(undefined)
  const [visit, setVisit] = useState<ReturnType<typeof nextVisit>>()
  useLayoutEffect(() => {
    if (lastPage.current === page) return
    lastPage.current = page
    setVisit(nextVisit())
  }, [page])
  return visit && sceneAt(visit.deck, visit.index, pinnedId)
}

export function UniverseBackground({photo}: {photo?: AstroPhoto}) {
  return <div className="universe-scene" aria-hidden="true">
    {photo && <RotatingPhoto photo={photo} className="universe-photo" priority/>}
    <div className="universe-scrim"/>
  </div>
}

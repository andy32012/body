import { useEffect, useState } from 'react'
import { dailyPhoto, firstOfflinePhoto, photoUrl } from '../lib/cosmos'
import type { AppState } from '../lib/store'
import './observatory.css'

export function useObservatory(state:AppState, day:string, page:string) {
  const selected = dailyPhoto(page,day,state.startedDay,state.notes['cosmos.pin.'+page])
  const [failedId,setFailedId] = useState('')
  const [missingFallback,setMissingFallback] = useState(false)
  const shown = failedId===selected.id ? firstOfflinePhoto : selected
  const unavailable = missingFallback && shown.id===firstOfflinePhoto.id
  function clearErrors() { setFailedId(''); setMissingFallback(false) }
  useEffect(()=>{
    window.addEventListener('online',clearErrors)
    return ()=>window.removeEventListener('online',clearErrors)
  },[])
  function imageFailed() {
    if(shown.id===firstOfflinePhoto.id) setMissingFallback(true)
    else setFailedId(selected.id)
  }
  return {shown,unavailable,imageFailed}
}
type BackgroundState = ReturnType<typeof useObservatory>

export function UniverseBackground({sky}:{sky:BackgroundState}) {
  return <div className="universe-scene" aria-hidden="true">
    {!sky.unavailable && <img key={sky.shown.id} className="universe-photo" src={photoUrl(sky.shown)}
      alt="" fetchPriority="high" style={{objectPosition:sky.shown.focus}} onError={sky.imageFailed}/>}
    <div className="universe-scrim"/>
  </div>
}

export function BackgroundCredit({sky}:{sky:BackgroundState}) {
  if (sky.unavailable) return null
  const photo = sky.shown
  return <footer className="background-credit">
    背景攝影 · <a href={photo.source} target="_blank" rel="noreferrer">{photo.credit}</a>
    {' · '}<a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a>
  </footer>
}

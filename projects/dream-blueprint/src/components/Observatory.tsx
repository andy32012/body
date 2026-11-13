import { useEffect, useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Expand, Images } from 'lucide-react'
import { dailyPhoto, firstOfflinePhoto, photos, photoUrl, type AstroPhoto } from '../lib/cosmos'
import type { AppState } from '../lib/store'
import './observatory.css'

export function useObservatory(state:AppState, day:string, page:string) {
  const defaultPhoto = dailyPhoto(page,day,state.startedDay,state.notes['cosmos.pin.'+page])
  const selectionKey = [page,day,defaultPhoto.id].join(':')
  const [selection,setSelection] = useState<{key:string;id:string} | null>(null)
  const selected = (selection?.key===selectionKey && photos.find(p=>p.id===selection.id)) || defaultPhoto
  const [failedId,setFailedId] = useState('')
  const [missingFallback,setMissingFallback] = useState(false)
  const shown = failedId===selected.id ? firstOfflinePhoto : selected
  const unavailable = missingFallback && shown.id===firstOfflinePhoto.id
  function clearErrors() { setFailedId(''); setMissingFallback(false) }
  useEffect(()=>{
    window.addEventListener('online',clearErrors)
    return ()=>window.removeEventListener('online',clearErrors)
  },[])
  function choose(id:string) {
    clearErrors()
    setSelection({key:selectionKey,id})
  }
  function turn(direction:number) {
    const next = (photos.indexOf(selected)+direction+photos.length)%photos.length
    choose(photos[next].id)
  }
  function imageFailed() {
    if(shown.id===firstOfflinePhoto.id) setMissingFallback(true)
    else setFailedId(selected.id)
  }
  return {shown,unavailable,usingFallback:failedId===selected.id,choose,turn,imageFailed}
}
export type SkyControls = ReturnType<typeof useObservatory>

export function UniverseBackground({sky}:{sky:SkyControls}) {
  return <div className="universe-scene" aria-hidden="true">
    {!sky.unavailable && <img key={sky.shown.id} className="universe-photo" src={photoUrl(sky.shown)}
      alt="" fetchPriority="high" style={{objectPosition:sky.shown.focus}} onError={sky.imageFailed}/>}
    <div className="universe-scrim"/>
  </div>
}

export function PhotoCaption({sky}:{sky:SkyControls}) {
  const photo = sky.shown
  const number=String(photos.indexOf(photo)+1).padStart(2,'0')
  return <div className="sky-caption" aria-label="目前的宇宙背景">
    <div className="sky-info" aria-live="polite">
      <span className="sky-category">{sky.unavailable?'照片尚未儲存':sky.usingFallback?'離線典藏':photo.category}</span>
      <a className="sky-name" href={'#cosmos/'+photo.id}>{photo.title}<Expand size={13} aria-hidden="true"/></a>
      <div className="sky-credit"><span>{photo.instrument}</span><a href={photo.source} target="_blank" rel="noreferrer">{photo.credit} <ArrowUpRight size={11}/></a><a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a></div>
    </div>
    <div className="sky-controls">
      <button type="button" onClick={()=>sky.turn(-1)} aria-label="上一張天文影像"><ChevronLeft size={17}/></button>
      <a href="#cosmos" aria-label={'宇宙圖鑑，第 '+number+' 張，共 '+photos.length+' 張'}><Images size={13}/>{number}<span>/ {photos.length}</span></a>
      <button type="button" onClick={()=>sky.turn(1)} aria-label="下一張天文影像"><ChevronRight size={17}/></button>
    </div>
  </div>
}
export function PhotoCollections({sky}:{sky:SkyControls}) {
  return <div className="sky-collections" aria-label="切換背景類型">{photos.slice(0,5).map(sample=>{
    const current=sky.shown.category===sample.category
    const photo:AstroPhoto=current ? sky.shown : sample
    return <button type="button" key={sample.id} aria-pressed={current} onClick={()=>sky.choose(photo.id)}>
      <span className="collection-thumb"><img src={photoUrl(photo)} alt="" style={{objectPosition:photo.focus}}
        onError={e=>{e.currentTarget.style.visibility='hidden'}} onLoad={e=>{e.currentTarget.style.visibility='visible'}}/></span>{sample.category}
    </button>
  })}</div>
}

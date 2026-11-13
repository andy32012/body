import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, Expand, Images, LoaderCircle, Pin, RotateCw, WifiOff, X } from 'lucide-react'
import { categories, photos, photoUrl, type AstroPhoto } from '../lib/cosmos'
import { downloadGalleryOffline, getGalleryOfflineStatus } from '../lib/offlineGallery'
import type { PageProps } from '../lib/store'
import './cosmos-gallery.css'

const destinations = [
  ['today', '今日航行'], ['library', '英文練習'],
  ['plan', '夢想星圖'], ['history', '航行紀錄'], ['rivals', '星際排行榜'], ['settings', '設定'], ['cosmos', '宇宙圖鑑'],
] as const

function GalleryImage({ photo, large = false }: {photo:AstroPhoto; large?:boolean}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => { setFailed(false); setLoaded(false); setAttempt(n => n + 1) }
  useEffect(() => {
    if (!failed) return
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [failed])
  if (failed) return <span className="cg-img-error">
    <WifiOff size={19}/>這張影像尚未載入
    {large && <button type="button" onClick={retry}>重新載入</button>}
  </span>
  return <>
    {large && !loaded && <span className="cg-img-error" role="status"><LoaderCircle className="cg-spin" size={18}/>正在載入影像</span>}
    <img key={attempt} src={photoUrl(photo)} alt={large ? photo.title : ''} loading={large ? 'eager' : 'lazy'}
      style={{objectPosition:photo.focus}} onLoad={() => setLoaded(true)} onError={() => setFailed(true)}/>
  </>
}

function OfflineLibrary() {
  const [progress, setProgress] = useState({done:0,total:0})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const supported = window.isSecureContext && 'serviceWorker' in navigator
  useEffect(() => {
    mounted.current = true
    const changed = () => setOnline(navigator.onLine)
    window.addEventListener('online',changed)
    window.addEventListener('offline',changed)
    const status = () => getGalleryOfflineStatus().then(result => {
      if (mounted.current && !inFlight.current) setProgress(result)
    }).catch(() => {})
    if (supported) void status()
    return () => {
      mounted.current = false
      window.removeEventListener('online',changed)
      window.removeEventListener('offline',changed)
    }
  }, [supported])
  async function download() {
    if (inFlight.current) return
    inFlight.current = true
    setMessage('')
    setBusy(true)
    try {
      const result = await downloadGalleryOffline(p => { if (mounted.current) setProgress(p) })
      if (mounted.current) {setProgress(result); setMessage('全圖庫已保存到這個裝置。')}
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '下載中斷，連線後可接續。')
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }
  const done = progress.total > 0 && progress.done === progress.total
  return <div className="cg-offline">
    <button type="button" className="cg-soft-button" disabled={busy || done || !online || !supported} onClick={download}>
      {done ? <Check size={16}/> : busy ? <LoaderCircle size={16} className="cg-spin"/> : <ArrowDownToLine size={16}/>}
      {done ? '全庫可離線瀏覽' : busy ? '正在下載' : '保存全圖庫供離線瀏覽'}
    </button>
    <small role="status">{!online && '目前離線。'}{!supported ? '使用正式 HTTPS 網址可保存全圖庫。' : message || (progress.total && (busy || progress.done > 0) ? '已保存 '+progress.done+' / '+progress.total+' 個檔案' : '')}</small>
  </div>
}

function Viewer({ photo, group, change, close, state, update }: PageProps & {
  photo:AstroPhoto; group:AstroPhoto[]; change:(photo:AstroPhoto)=>void; close:()=>void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const [target, setTarget] = useState<string>('today')
  const [notice, setNotice] = useState('')
  const index = group.findIndex(item => item.id === photo.id)
  const route = destinations.find(([id]) => id === target)!
  const pinned = state.notes['cosmos.pin.'+target]
  const currentTitle = photos.find(item => item.id === pinned)?.title
  function move(n:number) {
    setNotice('')
    change(group[(index+n+group.length)%group.length])
  }
  function choose(daily:boolean) {
    closeButton.current?.focus({preventScroll:true})
    update(prev => {
      const notes = {...prev.notes}
      if (daily) delete notes['cosmos.pin.'+target]
      else notes['cosmos.pin.'+target] = photo.id
      return {...prev,notes}
    })
    setNotice(daily ? route[1]+'已切換成每日更換。' : '已將「'+photo.title+'」設為'+route[1]+'背景。')
  }
  useEffect(() => {
    const dialog = ref.current!
    const focus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      dialog.close()
      document.body.style.overflow = overflow
      focus?.focus({preventScroll:true})
    }
  }, [])
  return <dialog ref={ref} className="cg-view" aria-labelledby="cg-view-title" onCancel={e => {e.preventDefault();close()}}
    onClick={e => {if(e.target === ref.current) close()}}
    onKeyDown={e => {
      if ((e.target as Element).closest('select,input,textarea')) return
      if(e.key === 'ArrowLeft' || e.key === 'ArrowRight') {e.preventDefault();move(e.key === 'ArrowLeft' ? -1 : 1)}
    }}>
    <div className="cg-view-inner">
      <div className="cg-view-toolbar"><span><Images size={16}/> {photo.category} <i/> {index+1} / {group.length}</span>
        <button ref={closeButton} type="button" className="cg-icon" aria-label="關閉大圖" autoFocus onClick={close}><X size={21}/></button></div>
      <div className="cg-view-picture">
        <GalleryImage key={photo.id} photo={photo} large/>
        {group.length > 1 && <><button type="button" className="cg-step prev" aria-label="上一張" onClick={() => move(-1)}><ArrowLeft/></button>
          <button type="button" className="cg-step next" aria-label="下一張" onClick={() => move(1)}><ArrowRight/></button></>}
      </div>
      <div className="cg-caption">
        <h2 id="cg-view-title">{photo.title}</h2>
        <div className="cg-placement"><label htmlFor="cg-destination">頁面背景</label>
          <select id="cg-destination" value={target} onChange={e => {setTarget(e.target.value);setNotice('')}}>
            {destinations.filter(([id]) => id !== 'rivals' || state.settings.rivalsEnabled).map(([id,name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <div className="cg-pin-buttons"><button type="button" onClick={() => choose(false)} disabled={pinned === photo.id}><Pin size={14}/>設為這張</button>
            <button type="button" onClick={() => choose(true)} disabled={!pinned}><RotateCw size={14}/>每日更換</button></div>
          <small role="status">{notice || (currentTitle ? '目前固定 · '+currentTitle : '目前每日更換')}</small>
        </div>
      </div>
    </div>
  </dialog>
}

type GalleryProps = PageProps & {initialPhotoId?:string; onViewerClose?:()=>void}

export default function CosmosGallery(props:GalleryProps) {
  const [category,setCategory] = useState('')
  const [selected,setSelected] = useState<AstroPhoto | undefined>(() => photos.find(photo => photo.id === props.initialPhotoId))
  useEffect(() => {
    if (!props.initialPhotoId) return
    const requested = photos.find(photo => photo.id === props.initialPhotoId)
    if (requested) {setCategory('');setSelected(requested)}
  }, [props.initialPhotoId])
  const group = category ? photos.filter(photo => photo.category === category) : photos
  return <section className="cg-gallery">
    <header className="cg-head"><div><h1>宇宙圖鑑</h1><p>{photos.length} 張天文觀測影像</p></div><OfflineLibrary/></header>
    <div className="cg-filters" role="group" aria-label="影像分類">{['',...categories].map(cat =>
      <button type="button" key={cat} aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat || '全部'}<small>{cat ? photos.filter(photo => photo.category === cat).length : photos.length}</small></button>)}</div>
    <div className="cg-grid">{group.map((photo,i) => <button type="button" className={'cg-card'+(i===0?' cg-lead':'')}
      key={photo.id} onClick={() => setSelected(photo)} aria-label={'放大查看'+photo.title}>
      <div className="cg-image"><GalleryImage key={photo.id} photo={photo}/><span className="cg-zoom" aria-hidden="true"><Expand size={16}/></span></div>
      <div className="cg-card-caption"><span>{photo.category}</span><h2>{photo.title}</h2></div>
    </button>)}</div>
    {selected && <Viewer {...props} photo={selected} group={group} change={setSelected} close={() => {setSelected(undefined);props.onViewerClose?.()}}/>}
  </section>
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, ChevronDown, Expand, LoaderCircle, Pin, RotateCw, WifiOff, X } from 'lucide-react'
import { useSceneFeature } from '../components/ScenePhoto'
import { readBackgroundPin, setBackgroundPin } from '../lib/backgroundPin'
import { categories, photos, photoUrl, type AstroPhoto } from '../lib/cosmos'
import { downloadGalleryOffline, getGalleryOfflineStatus } from '../lib/offlineGallery'
import type { PageProps } from '../lib/store'
import './cosmos-gallery.css'

const destinations = [
  ['today', '今日航行'], ['library', '英文練習'],
  ['plan', '夢想星圖'], ['history', '航行紀錄'], ['rivals', '星際排行榜'], ['settings', '設定'], ['cosmos', '宇宙圖鑑'],
] as const

function GalleryImage({ photo, large = false, eager = false }: {photo:AstroPhoto; large?:boolean; eager?:boolean}) {
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
    <img key={attempt} src={photoUrl(photo)} alt={large ? photo.title : ''} loading={large || eager ? 'eager' : 'lazy'}
      style={{objectPosition:photo.focus}} onLoad={() => setLoaded(true)} onError={() => setFailed(true)}/>
  </>
}

function OfflineLibrary() {
  const [progress, setProgress] = useState({done:0,total:0})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [statusError, setStatusError] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const mounted = useRef(true)
  const inFlight = useRef(false)
  const requestStatus = useRef<() => void>(() => {})
  const supported = window.isSecureContext && 'serviceWorker' in navigator
  useEffect(() => {
    mounted.current = true
    let watching = true
    let checking = false
    let queued = false
    let timer: ReturnType<typeof setTimeout> | undefined
    async function refresh() {
      if (!watching || checking || inFlight.current || document.hidden) return
      checking = true
      queued = false
      try {
        const result = await getGalleryOfflineStatus()
        if (watching && !queued && !inFlight.current) {
          setProgress(result)
          setStatusError('')
        }
      } catch (error) {
        if (watching && !queued && !inFlight.current) {
          setProgress({done:0,total:0})
          setStatusError(error instanceof Error ? error.message : '目前無法確認離線保存的張數。')
        }
      } finally {
        checking = false
        if (queued) schedule()
      }
    }
    function schedule() {
      queued = true
      if (!watching || !supported || checking || inFlight.current || document.hidden) return
      clearTimeout(timer)
      // Delay briefly to group notifications when several photos are being saved.
      timer = setTimeout(refresh, 150)
    }
    const changed = () => { setOnline(navigator.onLine); schedule() }
    const cacheChanged = (event: MessageEvent) => { if (event.data?.type === 'GALLERY_CACHE_CHANGED') schedule() }
    requestStatus.current = schedule
    window.addEventListener('online', changed)
    window.addEventListener('offline', changed)
    window.addEventListener('focus', changed)
    window.addEventListener('pageshow', changed)
    document.addEventListener('visibilitychange', changed)
    if (supported) {
      navigator.serviceWorker.addEventListener('controllerchange', schedule)
      navigator.serviceWorker.addEventListener('message', cacheChanged)
      schedule()
    }
    return () => {
      watching = false
      mounted.current = false
      clearTimeout(timer)
      window.removeEventListener('online', changed)
      window.removeEventListener('offline', changed)
      window.removeEventListener('focus', changed)
      window.removeEventListener('pageshow', changed)
      document.removeEventListener('visibilitychange', changed)
      if (supported) {
        navigator.serviceWorker.removeEventListener('controllerchange', schedule)
        navigator.serviceWorker.removeEventListener('message', cacheChanged)
      }
    }
  }, [supported])
  async function download() {
    if (inFlight.current) return
    inFlight.current = true
    requestStatus.current()
    setMessage('')
    setStatusError('')
    setBusy(true)
    try {
      const result = await downloadGalleryOffline(p => { if (mounted.current) setProgress(p) })
      if (mounted.current) setProgress(result)
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '下載中斷，連線後可接續。')
    } finally {
      inFlight.current = false
      if (mounted.current) {
        setBusy(false)
        requestStatus.current()
      }
    }
  }
  const done = progress.total > 0 && progress.done === progress.total
  return <details className="cg-offline" onToggle={event => { if (event.currentTarget.open) requestStatus.current() }}>
    <summary><ArrowDownToLine size={16} aria-hidden="true"/>離線圖庫</summary>
    <div className="cg-download-panel">
    <button type="button" className="cg-soft-button" disabled={busy || done || !online || !supported} onClick={download}>
      {busy ? <LoaderCircle size={16} className="cg-spin"/> : done ? <Check size={16}/> : <ArrowDownToLine size={16}/>}
      {busy ? '正在下載' : done ? '全庫可離線瀏覽' : '保存全圖庫供離線瀏覽'}
    </button>
    <small role="status">{!online && '目前離線。'}{!supported ? '使用正式 HTTPS 網址可保存全圖庫。' : <>
      {progress.total > 0 && '已保存 '+progress.done+' / '+progress.total+' 個檔案。'}
      {!done && (statusError || message)}
    </>}</small>
    </div>
  </details>
}

function Viewer({ photo, group, change, close, state, update }: PageProps & {
  photo:AstroPhoto; group:AstroPhoto[]; change:(photo:AstroPhoto)=>void; close:()=>void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const swipeStart = useRef<{x:number;y:number} | null>(null)
  const [preferredTarget, setTarget] = useState<string>('today')
  const index = group.findIndex(item => item.id === photo.id)
  const available = destinations.filter(([id]) => id !== 'rivals' || state.settings.rivalsEnabled)
  const [target] = available.find(([id]) => id === preferredTarget) ?? destinations[0]
  const pinned = readBackgroundPin(state.notes, target)
  const currentTitle = photos.find(item => item.id === pinned)?.title
  useEffect(() => {
    if (target !== preferredTarget) setTarget(target)
  }, [preferredTarget, target])
  function move(n:number) {
    change(group[(index+n+group.length)%group.length])
  }
  function choose(automatic:boolean) {
    closeButton.current?.focus({preventScroll:true})
    update(prev => {
      // Sync may have disabled the selected page while this save waited for the store lock.
      if (target === 'rivals' && !prev.settings.rivalsEnabled) return prev
      return { ...prev, notes: setBackgroundPin(prev.notes, target, automatic ? null : photo.id) }
    })
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
      <div className="cg-view-toolbar">
        <span>{photo.category}</span>
        <button ref={closeButton} type="button" className="cg-icon" aria-label="關閉大圖" autoFocus onClick={close}><X size={21}/></button>
      </div>
      <div className="cg-view-picture"
        onTouchStart={event => {
          const point = event.touches[0]
          swipeStart.current = event.touches.length === 1 ? {x:point.clientX,y:point.clientY} : null
        }}
        onTouchCancel={() => { swipeStart.current = null }}
        onTouchEnd={event => {
          const start = swipeStart.current
          swipeStart.current = null
          if (!start || event.touches.length || group.length < 2) return
          const dx = event.changedTouches[0].clientX - start.x
          const dy = event.changedTouches[0].clientY - start.y
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)*1.5) move(dx < 0 ? 1 : -1)
        }}>
        <GalleryImage key={photo.id} photo={photo} large/>
      </div>
      <div className="cg-caption">
        <div className="cg-caption-row">
          <h2 id="cg-view-title">{photo.title}</h2>
          <div className="cg-paging">
            <button type="button" className="cg-step" aria-label="上一張" onClick={() => move(-1)} disabled={group.length < 2}><ArrowLeft size={18}/></button>
            <span>{index+1} / {group.length}</span>
            <button type="button" className="cg-step" aria-label="下一張" onClick={() => move(1)} disabled={group.length < 2}><ArrowRight size={18}/></button>
          </div>
        </div>
        <details className="cg-background">
          <summary><Pin size={14} aria-hidden="true"/>頁面背景<ChevronDown size={14} aria-hidden="true"/></summary>
          <div className="cg-placement"><label htmlFor="cg-destination">套用頁面</label>
            <select id="cg-destination" value={target} onChange={e => setTarget(e.target.value)}>
              {available.map(([id,name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <div className="cg-pin-buttons"><button type="button" onClick={() => choose(false)} disabled={pinned === photo.id}><Pin size={14}/>設為這張</button>
              <button type="button" onClick={() => choose(true)} disabled={!pinned}><RotateCw size={14}/>自動輪替</button></div>
            <small role="status">{currentTitle ? '目前固定 · '+currentTitle : '目前自動輪替'}</small>
          </div>
        </details>
      </div>
    </div>
  </dialog>
}

type GalleryProps = PageProps & {photoId?:string; onPhotoChange:(id?:string, fromList?:boolean)=>void}

export default function CosmosGallery(props:GalleryProps) {
  const feature = useSceneFeature()
  const [category,setCategory] = useState('')
  const selected = photos.find(photo => photo.id === props.photoId)
  useLayoutEffect(() => {
    if (selected && category && selected.category !== category) setCategory('')
  }, [selected, category])
  const collection = feature ? [feature, ...photos.filter(photo => photo.id !== feature.id)] : photos
  const group = category ? photos.filter(photo => photo.category === category) : collection
  return <section className="cg-gallery">
    <header className="cg-head"><div><h1>宇宙圖鑑</h1><p>{photos.length} 張天文觀測影像</p></div><OfflineLibrary/></header>
    <div className="cg-filters" role="group" aria-label="影像分類">{['',...categories].map(cat =>
      <button type="button" key={cat} aria-pressed={category === cat} onClick={() => setCategory(cat)}>{cat || '全部'}</button>)}</div>
    <div className="cg-grid">{group.map((photo,i) => <button type="button" className={'cg-card'+(i===0?' cg-lead':'')}
      key={photo.id} onClick={() => props.onPhotoChange(photo.id, true)} aria-label={'放大查看'+photo.title}>
      <span className="cg-image"><GalleryImage key={photo.id} photo={photo} eager={i===0}/></span>
      <span className="cg-card-caption">{i===0 && <small>{photo.category}</small>}<strong>{photo.title}</strong></span>
      {i===0 && <span className="cg-zoom" aria-hidden="true"><Expand size={16}/></span>}
    </button>)}</div>
    {selected && <Viewer {...props} photo={selected} group={group} change={photo => props.onPhotoChange(photo.id)} close={() => props.onPhotoChange()}/>}
  </section>
}

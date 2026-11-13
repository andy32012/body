import { useEffect, useState } from 'react'
import { firstOfflinePhoto, photos, photoUrl, type AstroPhoto } from '../lib/cosmos'

interface Props {
  photo: AstroPhoto
  className: string
  priority?: boolean
}

// The service worker stores each verified image under its URL plus a content hash.
async function fallbackPhotos(original: AstroPhoto): Promise<AstroPhoto[]> {
  let saved: AstroPhoto[] = []
  try {
    const scope = new URL('./', document.baseURI).href
    const cacheName = 'dream-blueprint:' + scope + ':photos'
    if ('caches' in window && await caches.has(cacheName)) {
      const keys = await (await caches.open(cacheName)).keys()
      const urls = new Set(keys.map(request => {
        const url = new URL(request.url)
        url.search = ''
        return url.href
      }))
      saved = photos.filter(item => item.id !== original.id && urls.has(new URL(item.image, scope).href))
    }
  } catch { /* Private browsing can restrict cache access. */ }

  if (saved.length) {
    const start = photos.indexOf(original) % saved.length
    saved = [...saved.slice(start), ...saved.slice(0, start)]
  }
  if (original.id !== firstOfflinePhoto.id && !saved.includes(firstOfflinePhoto)) saved.push(firstOfflinePhoto)
  return saved
}

function PhotoAttempt({ photo, className, priority }: Props) {
  const [failed, setFailed] = useState(false)
  const [alternatives, setAlternatives] = useState<AstroPhoto[]>([])
  useEffect(() => {
    if (!failed) return
    let active = true
    void fallbackPhotos(photo).then(list => { if (active) setAlternatives(list) })
    const retry = () => { setAlternatives([]); setFailed(false) }
    window.addEventListener('online', retry)
    return () => { active = false; window.removeEventListener('online', retry) }
  }, [failed, photo])

  const shown = failed ? alternatives[0] : photo
  if (!shown) return null
  return <img key={shown.id} className={className} alt="" src={photoUrl(shown)}
    fetchPriority={priority ? 'high' : 'auto'} style={{ objectPosition: shown.focus }}
    onError={() => failed ? setAlternatives(list => list.filter(item => item.id !== shown.id)) : setFailed(true)} />
}

export default function RotatingPhoto(props: Props) {
  return <PhotoAttempt key={props.photo.id} {...props} />
}

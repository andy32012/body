import nebulae from '../data/cosmos-n.json'
import galaxies from '../data/cosmos-g.json'
import planets from '../data/cosmos-p.json'
import stars from '../data/cosmos-s.json'
import deepFields from '../data/cosmos-d.json'

export interface AstroPhoto {
  id: string
  title: string
  category: string
  source: string
  credit: string
  instrument: string
  image: string
  focus: string
  license: string
  licenseUrl: string
}

const collections = [nebulae, galaxies, planets, stars, deepFields]
export const categories = collections.map(collection => collection[0].category)
const catalogue = collections.flat().map(photo => {
  const isNASA = new URL(photo.source).hostname === 'science.nasa.gov'
  return {
    ...photo,
    license: isNASA ? 'NASA 影像使用說明' : 'CC BY 4.0',
    licenseUrl: isNASA ? 'https://www.nasa.gov/nasa-brand-center/images-and-media/' : 'https://creativecommons.org/licenses/by/4.0/'
  }
})
// Alternate subjects throughout the observing sequence, including the first five views.
const opening = ['n03','g01','p01','s03','d01']
const interleaved = Array.from({length: Math.max(...collections.map(c=>c.length))}, (_,i) =>
  collections.flatMap(c=>c[i] ? [c[i].id] : [])).flat()
export const photos: AstroPhoto[] = [...new Set([...opening,...interleaved])]
  .map(id=>catalogue.find(photo=>photo.id===id)!)
export const photoUrl = (photo:AstroPhoto) => './'+photo.image
export const firstOfflinePhoto = photos.find(photo=>photo.id==='n01')!



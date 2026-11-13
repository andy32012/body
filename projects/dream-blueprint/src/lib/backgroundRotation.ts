import { categories, photos, type AstroPhoto } from './cosmos'
import { seededRandom } from './starfield'

const storageKey = 'dream-blueprint.photo-rotation.v1'
const featureOffset = 17
type RotationStorage = Pick<Storage, 'getItem' | 'setItem'>
type Cursor = { seed: number; next: number }

function shuffle<T>(items: T[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const previous = items[i]
    items[i] = items[j]
    items[j] = previous
  }
  return items
}

// Deal one photo per subject in each round, including the shorter collections.
export function createSceneDeck(seed: number): AstroPhoto[] {
  const random = seededRandom(seed)
  const groups = shuffle([...categories], random).map(category =>
    shuffle(photos.filter(photo => photo.category === category), random))
  const deck: AstroPhoto[] = []
  const rounds = Math.max(...groups.map(group => group.length))
  for (let i = 0; i < rounds; i++) {
    for (const group of groups) if (group[i]) deck.push(group[i])
  }
  return deck
}

export function sceneAt(deck: readonly AstroPhoto[], index: number, pinnedId?: string) {
  const scheduled = deck[index % deck.length]
  const background = (pinnedId && deck.find(photo => photo.id === pinnedId)) || scheduled
  const feature = deck[(index + featureOffset) % deck.length]
  return {background, feature: feature.id === background.id ? scheduled : feature}
}

function readCursor(raw: string | null): Cursor | undefined {
  if (!raw) return
  try {
    const value = JSON.parse(raw)
    if (value && Number.isInteger(value.seed) && value.seed >= 0 && value.seed <= 0xffffffff &&
      Number.isInteger(value.next) && value.next >= 0 && value.next < photos.length) return value
  } catch { /* An older or interrupted record can be replaced on the next visit. */ }
}

export function createVisitRotation(storage?: RotationStorage, random = Math.random) {
  let cursor: Cursor = {seed: Math.floor(random() * 0x100000000), next: 0}
  let deckSeed: number | undefined
  let deck: AstroPhoto[]
  return () => {
    try { cursor = readCursor(storage?.getItem(storageKey) ?? null) ?? cursor }
    catch { storage = undefined }
    const {seed, next: index} = cursor
    if (seed !== deckSeed) {
      deck = createSceneDeck(seed)
      deckSeed = seed
    }
    cursor = {seed, next: (index + 1) % deck.length}
    try { storage?.setItem(storageKey, JSON.stringify(cursor)) }
    catch { storage = undefined }
    return {deck, index}
  }
}

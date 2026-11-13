import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { photos } from '../src/lib/cosmos.ts'
import { createSceneDeck, createVisitRotation, sceneAt } from '../src/lib/backgroundRotation.ts'

const total = 56
const draws = (seed: number, count = total) => {
  const deck = createSceneDeck(seed)
  return Array.from({length: count}, (_, index) => sceneAt(deck, index))
}

test('56 張圖均為不同檔案；每輪全幅與橫幅各能看完整套實拍', () => {
  const paths = photos.map(p => p.image)
  assert.equal(paths.length, total)
  const hashes = paths.map(path => createHash('sha256').update(
    readFileSync(new URL('../public/' + path, import.meta.url))).digest('hex'))
  assert.equal(new Set(hashes).size, total)
  for (const seed of [0, 17, 20261113, 4294967295]) {
    const scenes = draws(seed)
    for (const role of ['background', 'feature'] as const) {
      assert.deepEqual(new Set(scenes.map(s => s[role].image)), new Set(paths))
    }
    assert.ok(scenes.every(s => s.background.image !== s.feature.image))
  }
})

test('起始排列可重現也能換新，連續八次造訪有多種天體', () => {
  const order = (seed: number) => createSceneDeck(seed).map(p => p.id)
  assert.deepEqual(order(7), order(7))
  assert.notDeepEqual(order(7), order(8))
  for (const seed of [7, 8, 41]) {
    const scenes = draws(seed)
    for (let i = 0; i < total; i++) {
      const nearby = Array.from({length: 8}, (_, n) => scenes[(i+n)%total].background.category)
      assert.ok(new Set(nearby).size >= 3, '連續八張至少涵蓋三種天體')
    }
  }
})

test('釘選只固定全幅；遇到原定橫幅會避開同圖，無效或解除釘選會回到輪替', () => {
  const deck = createSceneDeck(13)
  for (let i = 0; i < total; i++) {
    const natural = sceneAt(deck, i)
    const collision = sceneAt(deck, i, natural.feature.id)
    assert.equal(collision.background.id, natural.feature.id)
    assert.notEqual(collision.feature.id, collision.background.id)
    assert.deepEqual(sceneAt(deck, i, '已移除的照片'), natural)
    assert.deepEqual(sceneAt(deck, i), natural)
  }
})

test('重開接續進度；連續三輪都不會陷入少數圖片的小迴圈', () => {
  const values = new Map<string,string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) } }
  let next = createVisitRotation(storage, () => 0.19)
  const scenes = Array.from({length: total*3}, (_,i) => {
    if (i === 23 || i === 79) next = createVisitRotation(storage, () => 0.83)
    const {deck, index} = next()
    return sceneAt(deck,index)
  })
  for (const role of ['background','feature'] as const) {
    for (let cycle = 0; cycle < 3; cycle++) {
      assert.equal(new Set(scenes.slice(total*cycle,total*(cycle+1)).map(s => s[role].id)).size,total)
    }
    for (let i = 1; i < scenes.length; i++) assert.notEqual(scenes[i-1][role].id,scenes[i][role].id)
  }
})

test('私人瀏覽拒絕儲存或舊紀錄損毀時，仍可在本次使用看完一輪', () => {
  const unavailable = () => { throw new Error('Storage denied') }
  for (const storage of [undefined, {getItem: unavailable, setItem: unavailable},
    {getItem: () => '{broken', setItem: () => {}}]) {
    const next = createVisitRotation(storage, () => 0.4)
    const images = Array.from({length: total}, () => {
      const {deck,index} = next()
      return sceneAt(deck,index).background.id
    })
    assert.equal(new Set(images).size,total)
  }
})

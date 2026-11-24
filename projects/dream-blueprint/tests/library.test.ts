import test from 'node:test'
import assert from 'node:assert/strict'
import { libraryModes, libraryPage, menuGroups, menuHash, modeLabel, unitPackOpen } from '../src/lib/library.ts'
import { packUnits } from '../src/lib/bridge.ts'

const ids = (groups: ReturnType<typeof menuGroups>) => groups.flatMap(g => g.entries.map(e => e.id))
const open = packUnits[0] + 1

test('每一種練習都是自己一頁：英文練習底下每種一個入口，中翻英和英文口說排最前面', () => {
  const groups = menuGroups({ unit: open })
  assert.deepEqual(groups.map(g => g.id), ['main', 'words', 'nursing'])
  const all = ids(groups)
  assert.equal(new Set(all).size, all.length, '沒有重複')
  assert.deepEqual(all.filter(id => id !== 'speaking').sort(), [...libraryModes].sort(), '每一種練習都在選單上')
  assert.deepEqual(all.slice(0, 2), ['translate', 'speaking'])
  for (const g of groups) for (const e of g.entries) {
    assert.ok(e.label && e.note, e.id + ' 有名字和一句說明')
    assert.equal(e.hash, menuHash(e.id))
    assert.equal(libraryPage('#' + e.hash), e.id === 'speaking' ? null : e.id, e.id + ' 的網址打開自己那一頁')
  }
  assert.equal(menuHash('speaking'), 'speaking', '英文口說還是原本的口說頁')
  assert.deepEqual(groups[1].entries.map(e => e.label), ['單字複習', '單字快篩', '7000 單短文'])
  assert.deepEqual(groups[2].entries.map(e => e.label), ['護理聽力', '護理閱讀', '護理單字', '臨床情境'])
})

test('單元讀聽說寫到第一個橋接單元才出現在選單上', () => {
  assert.ok(!unitPackOpen(1))
  assert.ok(!ids(menuGroups({ unit: 1 })).includes('unit'))
  assert.ok(unitPackOpen(packUnits[0]))
  assert.ok(ids(menuGroups({ unit: packUnits[0] })).includes('unit'))
  assert.ok(ids(menuGroups({ unit: open })).includes('unit'))
})

test('考週和實習：寫作、單元包、單字快篩先休息，選擇題只剩護理英文題、移到護理英文', () => {
  const groups = menuGroups({ periodQuiet: true, unit: open })
  const all = ids(groups)
  for (const id of ['writing', 'unit', 'screen'] as const) assert.ok(!all.includes(id), id)
  assert.ok(!groups[0].entries.some(e => e.id === 'quiz'))
  const quiz = groups[2].entries.find(e => e.id === 'quiz')
  assert.equal(quiz?.label, '護理英文題')
  assert.equal(modeLabel('quiz'), '選擇題')
  assert.equal(modeLabel('quiz', true), '護理英文題')
  assert.equal(modeLabel('sound', true), '發音課')
  assert.ok(all.includes('translate') && all.includes('speaking') && all.includes('words'))
})

test('網址認得出是哪一頁：只開 #library 是英文練習的清單，今天清單和其他頁面用的連結都還通', () => {
  assert.equal(libraryPage('#library'), null)
  assert.equal(libraryPage(''), null)
  assert.equal(libraryPage(undefined), null)
  assert.equal(libraryPage('#library/nothing'), null, '不認得的種類回到清單')
  assert.equal(libraryPage('#library/words'), 'words')
  assert.equal(libraryPage('#library/words/listen'), 'words')
  assert.equal(libraryPage('#library/story/dictate'), 'story')
  assert.equal(libraryPage('#library/unit/speak/43'), 'unit')
  assert.equal(libraryPage('#library/nlisten/n-a2-01'), 'nlisten')
  assert.equal(libraryPage('#library/writing/w-a1-03'), 'writing')
  assert.equal(libraryPage('library/sound'), 'sound')
  assert.equal(libraryPage('sound'), 'sound', '只給種類也可以（App 的路由只留斜線後那一段）')
  for (const m of libraryModes) assert.equal(libraryPage('#library/' + m), m)
})

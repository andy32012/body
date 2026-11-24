import test from 'node:test'
import assert from 'node:assert/strict'
import { libraryModes, librarySections, menuSections, modeFromHash, modeLabel, sectionHash, sectionModes, sectionOf } from '../src/lib/library.ts'

test('每一種加練都有自己在主選單的一頁；英文練習本身只放今天這一堂', () => {
  assert.deepEqual(librarySections.map(s => s.id), ['practice', 'listen', 'translate', 'story', 'reading', 'writing', 'unit', 'quiz', 'words', 'grammar', 'sound', 'nursing'])
  assert.deepEqual(sectionModes('practice'), ['home'])
  for (const m of ['listen', 'translate', 'story', 'reading', 'writing', 'unit', 'quiz'] as const) assert.equal(sectionOf(m), m, m + ' 是自己的一頁')
  for (const quiet of [false, true]) {
    const all = librarySections.flatMap(s => sectionModes(s.id, quiet))
    assert.equal(all.length, libraryModes.length, '沒有重複')
    assert.deepEqual([...all].sort(), [...libraryModes].sort(), '沒有漏掉')
    for (const m of libraryModes) assert.ok(sectionModes(sectionOf(m, quiet), quiet).includes(m))
  }
  for (const s of librarySections) {
    assert.ok(s.title && s.menu && s.heading && s.chip.length === 2, s.id)
    assert.ok(s.modes.length <= 7, s.id + ' 一區不超過七個按鈕')
    assert.equal(modeFromHash('#' + sectionHash(s.id)), s.modes[0], '入口打開這一區的第一種練習')
    assert.ok(s.id === 'practice' || s.modes[0] !== 'home')
  }
  assert.equal(sectionOf('sound'), 'sound')
  assert.equal(sectionOf('grammar'), 'grammar')
  assert.equal(sectionOf('screen'), 'words')
  assert.equal(sectionOf('passage'), 'words')
  assert.equal(sectionOf('case'), 'nursing')
  assert.equal(sectionOf('story'), 'story')
  assert.equal(sectionHash('practice'), 'library')
})

test('主選單：選擇題在考週和實習移到護理英文；單元讀聽說寫到橋接單元才出現', () => {
  const ids = (o: Parameters<typeof menuSections>[0]) => menuSections(o).map(s => s.id)
  assert.ok(ids({ periodQuiet: false, packOpen: false }).includes('quiz'))
  assert.ok(!ids({ periodQuiet: true, packOpen: false }).includes('quiz'))
  assert.ok(!ids({ periodQuiet: false, packOpen: false }).includes('unit'))
  assert.ok(ids({ periodQuiet: false, packOpen: true }).includes('unit'))
  assert.ok(ids({ periodQuiet: false, packOpen: false, current: 'unit' }).includes('unit'), '從單元連結打開時還是看得到')
})

test('選擇題平常是自己的一頁；考週和實習只開護理題，改放護理英文', () => {
  assert.equal(sectionOf('quiz'), 'quiz')
  assert.equal(modeLabel('quiz'), '選擇題')
  assert.equal(sectionOf('quiz', true), 'nursing')
  assert.equal(modeLabel('quiz', true), '護理英文題')
  assert.deepEqual(sectionModes('quiz', true), [])
  assert.equal(modeLabel('sound', true), '發音課')
})

test('網址認得出是哪一種練習：今天清單和其他頁面用的連結都還通', () => {
  assert.equal(modeFromHash('#library'), 'home', '只開練習頁是英文練習本身')
  assert.equal(modeFromHash(''), 'home')
  assert.equal(modeFromHash(undefined), 'home')
  assert.equal(modeFromHash('#library/words'), 'words')
  assert.equal(modeFromHash('#library/words/listen'), 'words')
  assert.equal(modeFromHash('#library/story/dictate'), 'story')
  assert.equal(modeFromHash('#library/unit/speak/43'), 'unit')
  assert.equal(modeFromHash('#library/nlisten/n-a2-01'), 'nlisten')
  assert.equal(modeFromHash('library/sound'), 'sound')
  assert.equal(modeFromHash('sound'), 'sound', '只給種類也可以（App 的路由只留斜線後那一段）')
  assert.equal(modeFromHash('#library/nothing'), 'home')
  for (const m of libraryModes) assert.equal(modeFromHash('#library/' + m), m)
})

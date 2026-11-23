import test from 'node:test'
import assert from 'node:assert/strict'
import { libraryModes, librarySections, modeFromHash, modeLabel, sectionHash, sectionModes, sectionOf } from '../src/lib/library.ts'

test('練習分成五區：每一種練習剛好屬於一區，主選單各有一個入口', () => {
  assert.deepEqual(librarySections.map(s => s.id), ['practice', 'words', 'grammar', 'sound', 'nursing'])
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
  }
  assert.equal(sectionOf('sound'), 'sound')
  assert.equal(sectionOf('grammar'), 'grammar')
  assert.equal(sectionOf('screen'), 'words')
  assert.equal(sectionOf('passage'), 'words')
  assert.equal(sectionOf('case'), 'nursing')
  assert.equal(sectionOf('story'), 'practice')
})

test('選擇題平常在英文練習；考週和實習只開護理題，改放護理英文', () => {
  assert.equal(sectionOf('quiz'), 'practice')
  assert.equal(modeLabel('quiz'), '選擇題')
  assert.equal(sectionOf('quiz', true), 'nursing')
  assert.equal(modeLabel('quiz', true), '護理英文題')
  assert.ok(!sectionModes('practice', true).includes('quiz'))
  assert.equal(modeLabel('sound', true), '發音課')
})

test('網址認得出是哪一種練習：今天清單和其他頁面用的連結都還通', () => {
  assert.equal(modeFromHash('#library'), 'listen', '只開練習頁是英文練習區')
  assert.equal(modeFromHash(''), 'listen')
  assert.equal(modeFromHash(undefined), 'listen')
  assert.equal(modeFromHash('#library/words'), 'words')
  assert.equal(modeFromHash('#library/words/listen'), 'words')
  assert.equal(modeFromHash('#library/story/dictate'), 'story')
  assert.equal(modeFromHash('#library/unit/speak/43'), 'unit')
  assert.equal(modeFromHash('#library/nlisten/n-a2-01'), 'nlisten')
  assert.equal(modeFromHash('library/sound'), 'sound')
  assert.equal(modeFromHash('sound'), 'sound', '只給種類也可以（App 的路由只留斜線後那一段）')
  assert.equal(modeFromHash('#library/nothing'), 'listen')
  for (const m of libraryModes) assert.equal(modeFromHash('#library/' + m), m)
})

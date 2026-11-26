import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import index from '../src/data/grammar-book/index.json' with { type: 'json' }
import { bookRoute, chapterFile, chapterLabel, flatSections, neighbors, readBook, saveBookDrill, sectionDone, sectionLabel, shownParts, type BookIndex, type ChapterContent } from '../src/lib/grammarBook.ts'
import { checkDrill, drillAnswer } from '../src/lib/grammar.ts'

/** 完整文法: the owner's catalog (英文文法完整主題目錄), every section with teaching and three drills. */
const book = index as BookIndex
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/data/grammar-book')
const chapters = book.parts.flatMap(p => p.chapters)

test('完整文法目錄：5 部、41 章、638 節加 10 張附錄；編號照章節順序、不重複；每個課程單元都對到至少一節', () => {
  assert.equal(book.parts.length, 5)
  assert.deepEqual(chapters.map(c => c.n), Array.from({ length: 41 }, (_, i) => i + 1))
  for (const c of chapters) {
    assert.ok(c.title && c.en, '第 ' + c.n + ' 章有中英文名稱')
    c.sections.forEach((s, i) => assert.equal(s.id, c.n + '-' + (i + 1), '第 ' + c.n + ' 章第 ' + (i + 1) + ' 節的編號'))
  }
  assert.equal(chapters.reduce((n, c) => n + c.sections.length, 0), 638)
  assert.deepEqual(book.appendix.map(s => s.id), Array.from({ length: 10 }, (_, i) => 'A-' + (i + 1)))
  const all = [...chapters.flatMap(c => c.sections), ...book.appendix]
  assert.equal(all.length, 648)
  assert.equal(new Set(all.map(s => s.id)).size, 648)
  for (const s of all) {
    assert.ok([1, 2, 3].includes(s.level), s.id + ' 的程度')
    assert.ok(s.title.trim() && !/\[\^/.test(s.title), s.id + ' 的名稱')
  }
  const units = new Set(all.flatMap(s => s.units ?? []))
  assert.deepEqual([...units].sort((a, b) => a - b), Array.from({ length: 53 }, (_, i) => i + 1), '53 個課程單元都在目錄裡找得到')
})

test('上一節、下一節照目錄順序走，跨章接得上，附錄在最後', () => {
  assert.equal(neighbors(book, '2-1').prev, undefined, '第 1 章不讀，2-1 是第一節')
  assert.equal(neighbors(book, '2-1').next?.id, '2-2')
  assert.equal(neighbors(book, '2-16').next?.id, '3-1', '第 2 章最後一節接第 3 章第一節')
  assert.equal(neighbors(book, '3-1').prev?.id, '2-16')
  assert.equal(neighbors(book, '41-14').next?.id, 'A-1')
  assert.equal(neighbors(book, 'A-10').next, undefined)
  assert.deepEqual(neighbors(book, 'nope'), {})
})

test('第 1 章（文法用語）照他的意思不放進目錄：章節編號從第 1 章重新算，紀錄和網址還是原本的編號', () => {
  const shown = shownParts(book)
  assert.equal(shown.length, 5, '第一部還在，只是少了原本的第 1 章')
  assert.equal(shown[0].chapters[0].n, 2, '目錄的第一章是句子成分與基本句型')
  assert.equal(chapterLabel(book, 2), 1, '句子成分與基本句型顯示成第 1 章')
  assert.equal(chapterLabel(book, 41), 40, '最後一章顯示成第 40 章')
  assert.equal(sectionLabel(book, '2-1'), '1-1')
  assert.equal(sectionLabel(book, '14-2'), '13-2')
  assert.equal(sectionLabel(book, 'A-1'), 'A-1', '附錄的編號不變')
  const order = flatSections(book)
  assert.equal(order[0].id, '2-1', '「從這裡開始」打開 2-1（畫面上是 1-1）')
  assert.equal(order.length, 648 - 12)
  assert.ok(!order.some(s => s.chapter === 1), '原本的第 1 章不算進寫好、練過的節數')
  assert.deepEqual(neighbors(book, '1-3'), {}, '原本的第 1 章不在上一節、下一節的路線上')
  assert.deepEqual(bookRoute(book, '#library/grammar/1-3'), { kind: 'catalog' }, '原本第 1 章的網址回到目錄，不會出現兩個「1-3」')
  assert.deepEqual(bookRoute(book, '#library/grammar/2-1'), { kind: 'section', id: '2-1' }, '網址和紀錄（gbook.2-1）還是原本的編號')
  assert.ok(existsSync(path.join(dir, 'ch01.json')), '原本第 1 章的講解沒有刪掉')
})

test('網址：#library/grammar 是目錄，數字是原本的課程單元，14-2 這種是小節，units 是單元清單', () => {
  assert.deepEqual(bookRoute(book, '#library/grammar'), { kind: 'catalog' })
  assert.deepEqual(bookRoute(book, '#library/grammar/12'), { kind: 'unit', unit: 12 }, '主題總複習的「看講解」連結照舊打開單元')
  assert.deepEqual(bookRoute(book, '#library/grammar/14-2'), { kind: 'section', id: '14-2' })
  assert.deepEqual(bookRoute(book, '#library/grammar/A-1'), { kind: 'section', id: 'A-1' })
  assert.deepEqual(bookRoute(book, '#library/grammar/units'), { kind: 'units' })
  assert.deepEqual(bookRoute(book, '#library/grammar/99-9'), { kind: 'catalog' }, '目錄裡沒有的節回到目錄')
  assert.deepEqual(bookRoute(book, '#library/grammar/0'), { kind: 'catalog' })
})

test('小練習的紀錄：第一次答的才算，後來改對另外記；三題都做過才算這一節練過', () => {
  let notes: Record<string, string> = {}
  notes = saveBookDrill(notes, '4-2', 0, true, '2026-11-26')
  notes = saveBookDrill(notes, '4-2', 1, false, '2026-11-26')
  assert.equal(sectionDone(notes, '4-2'), false)
  notes = saveBookDrill(notes, '4-2', 1, true, '2026-11-27')
  notes = saveBookDrill(notes, '4-2', 2, true, '2026-11-27')
  assert.deepEqual(readBook(notes, '4-2').marks, { 0: 1, 1: 2, 2: 1 })
  assert.equal(sectionDone(notes, '4-2'), true)
  assert.ok(notes['gbook.4-2'] && !notes['gram.4'], '用自己的 gbook. 紀錄，不碰課程單元的 gram.')
  assert.deepEqual(readBook({ 'gbook.1-1': '{bad' }, '1-1').marks, {})
})

const english = (t: string) => /[A-Za-z]/.test(t) && !/[㐀-鿿]/.test(t)
test('寫好的章：每一節都有重點和例句、常見錯誤、剛好三題小練習，每題只有一個標準答案；沒寫完的章不放檔案', () => {
  const files = readdirSync(dir).filter(f => f !== 'index.json')
  for (const c of [...chapters.map(c => ({ key: c.n as number | 'A', ready: !!c.ready, ids: c.sections.map(s => s.id) })), { key: 'A' as const, ready: !!book.appendixReady, ids: book.appendix.map(s => s.id) }]) {
    const file = chapterFile(c.key) + '.json'
    assert.equal(existsSync(path.join(dir, file)), c.ready, file + '：寫完（ready）才有檔案')
    if (!c.ready) continue
    const content = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as ChapterContent
    assert.deepEqual(Object.keys(content), c.ids, file + ' 每一節都寫了，照順序')
    for (const [id, s] of Object.entries(content)) {
      assert.ok(s.points.length >= 1 && s.points.length <= 3, id + ' 有 1–3 個重點')
      for (const p of s.points) {
        assert.ok(p.t.trim() && p.p.trim(), id + ' 重點有標題和說明')
        assert.ok(p.ex.length >= 1, id + ' 每個重點至少一個例句')
        for (const e of p.ex) assert.ok(english(e.en) && /[.?!"”)]$/.test(e.en.trim()) && e.zh.trim(), id + ' 例句：' + e.en)
      }
      assert.ok(s.mistakes.length >= 1 && s.mistakes.length <= 2, id + ' 有 1–2 個常見錯誤')
      for (const m of s.mistakes) assert.ok(m.bad !== m.good && m.why.trim(), id + ' 常見錯誤：' + m.bad)
      if (s.table) assert.ok(s.table.rows.every(r => r.length === s.table!.head.length), id + ' 表格每一列欄數一樣')
      assert.equal(s.drills.length, 3, id + ' 剛好三題')
      for (const d of s.drills) {
        assert.ok(d.why.trim(), id + ' 每題有原因：' + d.q)
        if (d.k === 'choose') {
          assert.ok(d.q.includes('___') && new Set(d.options).size === d.options.length && d.answer >= 0 && d.answer < d.options.length, id + ' 選擇題：' + d.q)
        } else if (d.k === 'fill') {
          assert.ok(d.q.includes('___') && d.accept.length && checkDrill(d, d.accept[0]), id + ' 填空題：' + d.q)
        } else {
          assert.equal(checkDrill(d, d.q), false, id + ' 改錯題沒改就不能算對：' + d.q)
          assert.ok(checkDrill(d, d.accept[0]), id + ' 改錯題的答案算對：' + d.accept[0])
        }
        assert.ok(!drillAnswer(d).includes('___'), id + ' 完整答案沒有空格：' + d.q)
      }
    }
  }
  for (const f of files) assert.ok(/^(ch\d{2}|appendix)\.json$/.test(f), '只有章節檔案：' + f)
})

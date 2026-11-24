import test from 'node:test'
import assert from 'node:assert/strict'
import { readWordChat, wordChatBack, wordChatHash, wordChatInstructions } from '../src/lib/wordChat.ts'

test('跟 Emma 聊這個字：網址帶著字、清單、練習種類和這一輪的其他字，Emma 知道他在做什麼', () => {
  const chat = { en: 'column', zh: '專欄；圓柱；欄', where: '單字複習', part: 'read' as const, seen: false, others: ['column', 'hospital', 'nurse/RN'] }
  const hash = wordChatHash(chat)
  assert.ok(hash.startsWith('speaking/word-'))
  assert.equal(hash.split('/').length, 2, '網址只有一個斜線，App 的路由讀得到整段')
  const back = readWordChat(hash.slice('speaking/word-'.length))!
  assert.deepEqual(back, { ...chat, others: ['hospital', 'nurse/RN'] }, '卡片上的字不會重複出現在其他字裡')
  const text = wordChatInstructions(back)
  assert.match(text, /"column"/)
  assert.match(text, /專欄/)
  assert.match(text, /看懂/)
  assert.match(text, /hospital, nurse\/RN/)
  assert.match(text, /guess first/, '還沒看中文意思：先讓他猜')
  assert.doesNotMatch(wordChatInstructions({ ...back, seen: true }), /guess first/)
  assert.equal(wordChatBack(back), '#library/words')
  assert.equal(wordChatBack({ ...back, part: 'listen' }), '#library/words/listen')
  assert.equal(wordChatBack({ ...back, where: '護理單字' }), '#library/nwords')
  assert.match(wordChatInstructions({ ...back, where: '護理單字' }), /nursing English/)
})

test('壞掉的網址就當一般聊天', () => {
  assert.equal(readWordChat(undefined), null)
  assert.equal(readWordChat('%7Bnot json'), null)
  assert.equal(readWordChat(encodeURIComponent('{"zh":"x"}')), null)
  assert.equal(readWordChat(encodeURIComponent('{"en":"cat","p":"fly"}'))?.part, 'read', '不認得的練習種類當成看懂')
})

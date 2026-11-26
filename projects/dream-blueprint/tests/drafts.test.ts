import { test } from 'node:test'
import assert from 'node:assert/strict'
import { transcriptLanding } from '../src/lib/drafts'

// R026: a transcript that comes back late never replaces what he typed while waiting.
test('a transcript fills the box only when the box still holds what it held when he asked', () => {
  assert.equal(transcriptLanding('', '', 'I need a new card.'), 'fill')
  assert.equal(transcriptLanding('I need', 'I need', 'I need a new card.'), 'fill')
  // He typed (or cleared the box) while waiting: the transcript waits as a choice.
  assert.equal(transcriptLanding('', 'I lost my card', 'I need a new card.'), 'offer')
  assert.equal(transcriptLanding('I lost my card', '', 'I need a new card.'), 'offer')
  // Nothing came back: nothing changes.
  assert.equal(transcriptLanding('', '', ''), 'none')
  assert.equal(transcriptLanding('', '', '   '), 'none')
})

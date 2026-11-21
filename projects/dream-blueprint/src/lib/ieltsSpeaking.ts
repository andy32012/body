/** IELTS Speaking Part 2 (long turn) and Part 3 with Emma as a friendly practice partner. */
export interface CueCard { id: string; topic: string; bullets: string[]; explain: string; part3: string[] }
export const cueKey = (id: string) => 'ielts.p2.' + id

/** Cards not practised yet first, then the one practised longest ago. */
export function nextCueCard(cards: readonly CueCard[], notes: Record<string, string>, skip: readonly string[] = []) {
  const pool = cards.filter(c => !skip.includes(c.id))
  const fresh = pool.find(c => !notes[cueKey(c.id)])
  if (fresh) return fresh
  return [...pool].sort((a, b) => (notes[cueKey(a.id)] ?? '').localeCompare(notes[cueKey(b.id)] ?? ''))[0] ?? cards[0]
}

export function part2Instructions(card: CueCard, notes: string) {
  return [
    'Today you are his IELTS Speaking practice partner, still friendly, but you follow the IELTS Part 2 and Part 3 format.',
    `His Part 2 cue card: "${card.topic}" You should say: ${card.bullets.join('; ')}; ${card.explain}`,
    notes.trim() ? `He made these preparation notes: ${notes.trim()}` : '',
    'Step 1: In one short sentence, tell him to start talking about the card and that he can speak for one to two minutes.',
    'Step 2: While he talks, do NOT interrupt and do not correct anything. If he pauses briefly, stay silent or say only a short "Mm-hm" or "Go on". If he stops before about one minute, gently ask one prompt from the card bullets.',
    'Step 3: After about two minutes, or when he finishes, thank him and ask one short rounding-off question.',
    `Step 4: Then ask these Part 3 discussion questions one at a time, waiting for each answer, and ask one natural follow-up ("Why do you think so?", "Can you give an example?"): ${card.part3.join(' | ')}`,
    'Use clear, natural English at a normal-but-slightly-slow speed. Do not give feedback during the test. When Part 3 is finished, say in one or two sentences what he did well and one thing to try next time.',
  ].filter(Boolean).join('\n')
}

export const part2FeedbackPrompt = [
  '下面是玄燁做雅思口說 Part 2（獨白）和 Part 3（討論）的逐字稿，語音辨識可能有小錯字。',
  '用繁體中文給回饋，照雅思四個評分項目各一行：流暢與連貫、詞彙、文法範圍與正確度、發音（逐字稿看不出發音，就寫「這項要聽錄音才知道」）。每行先寫一個估計分數（例如 5 或 5.5），再寫一句做得好的和一句要改的。',
  '最後一行寫「估計整體：x–y」並提醒這是練習估計。不要用 Markdown 標題。',
  '另外，把他說錯或不自然的句子（最多 3 句，沒有就不要寫）各寫成一行，格式固定為：[卡] 他說的原句 ||| 正確自然的英文 ||| 這句的中文意思 ||| 一句繁體中文原因',
].join('\n')

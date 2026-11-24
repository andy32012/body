/**
 * Taught before used: which grammar a sentence needs, by simple patterns on its English, and the unit that teaches it.
 * A sentence the learner has to write may only need grammar from its own unit or earlier — unless the material right
 * there teaches it (a hint, the explanation, a new word, or the life topic's grammar box mentions it). The patterns
 * are deliberately narrow: common chunks of the first units (every day, want to, please, but) are not flagged.
 */
const PART = 'been|done|gone|seen|eaten|had|made|taken|given|written|known|met|heard|left|lost|found|bought|got|gotten|told|said|come|become|begun|broken|chosen|drunk|driven|fallen|felt|flown|forgotten|kept|paid|put|read|ridden|sent|slept|spent|spoken|stood|taught|thought|understood|woken|worn|won|grown|shown|sold|built|caught|brought|held|hurt|cut|run|swum|sung|drawn|thrown'
const ADJ_ED = 'tired|interested|bored|worried|married|excited|scared|closed|crowded|located|used|surprised|pleased|satisfied|confused|disappointed|embarrassed|frightened|relaxed|exhausted|injured|retired|allowed|supposed|ashamed|amazed|annoyed|stressed|dressed|qualified|experienced|advanced|required|needed|born|finished|done|gone|lost|broken|red|bed|shed|need|feed|seed|speed|weed|bleed|hundred|ed'
const ING_ADJ = 'interesting|boring|amazing|exciting|tiring|surprising|relaxing|annoying|confusing|embarrassing|frightening|disappointing|morning|evening|something|anything|nothing|everything|thing|during|building|ceiling|king|ring|sing|bring|spring|swing|wing|string|nursing|charming|willing'
const IRREG = 'went|saw|ate|bought|came|did|had|got|took|made|said|told|found|gave|knew|left|met|paid|ran|sat|slept|spoke|spent|stood|thought|understood|woke|wore|wrote|began|broke|brought|caught|chose|drank|drove|fell|felt|forgot|heard|kept|lost|rode|sang|sent|sold|swam|taught|threw|won|became|built|drew|flew|grew|hid|held|lent|meant|rang|shook|showed|stole|tore'
const TIMEWORD = 'day|morning|night|week|month|year|evening|afternoon|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|time|other|\\d+|two|three|four|five|six|eight|ten|twelve'

export interface Rule { unit: number; name: string; rx: RegExp; cue: RegExp }
const r = (unit: number, name: string, rx: string, cue: string): Rule => ({ unit, name, rx: new RegExp(rx), cue: new RegExp(cue, 'i') })

export const rules: Rule[] = [
  r(6, '現在進行式', `\\b(am|is|are|'m|'re|isn't|aren't)\\s+(not\\s+)?(?!(?:${ING_ADJ})\\b)\\w+ing\\b`, '進行'),
  r(7, 'be 動詞過去式', `\\b(was|were|wasn't|weren't)\\b`, '\\bwas\\b|\\bwere\\b'),
  r(8, '過去式（規則）', `\\b(i|you|he|she|we|they|it)\\s+(?!(?:${ADJ_ED})\\b)\\w{3,}ed\\b(?!\\s+(by|to)\\b)`, '過去式|-ed'),
  r(9, '過去式（不規則）', `\\b(i|you|he|she|we|they|it)\\s+(${IRREG})\\b`, '過去式|不規則'),
  r(10, '過去式的否定和疑問', `\\bdidn't\\b|\\bdid not\\b|^did\\b`, "didn't|did not|\\bdid\\b"),
  r(11, '未來式', `\\bwill\\b|'ll\\b|\\bwon't\\b|\\bgoing to\\s+(?!(?:the|a|an|my|your|his|her|our|their|school|work|bed|class|church|be)\\b)[a-z]+`, '\\bwill\\b|going to|未來'),
  r(12, '助動詞', `\\b(can|can't|cannot|could|couldn't|should|shouldn't|must|mustn't|may|might)\\b`, '助動詞|\\bcan\\b|should|must|could|may|might'),
  r(14, '可數與不可數', `\\bhow (much|many)\\b|\\bmuch\\b(?!\\s+(better|more|worse|less|[a-z]+er)\\b)`, 'much|many|可數'),
  r(15, '比較級和最高級', `\\bthan\\b|\\bthe (most|best|worst|least)\\b|\\bthe (?!(?:test|rest|guest|chest|west|forest|interest|contest|request|nest|vest|pest|protest|quest)\\b)[a-z]+est\\b`, '比較|最高級|than'),
  r(16, '疑問詞問句', `^(what|where|when|who|why|which|whose|how(?! (much|many)\\b))\\b.*\\?$`, '疑問詞|what|where|when|who|why|how'),
  r(17, 'there is／there are', `\\bthere (is|are|was|were|isn't|aren't)\\b|\\bthere's\\b`, 'there (is|are|was|were)'),
  r(19, '禮貌的請求', `\\bcould you\\b|\\bwould you\\b`, 'could you|would you|禮貌'),
  r(20, '限定詞', `\\bevery\\b(?!\\s+(${TIMEWORD})\\b)|\\b(all|both|something|anything|nothing|everything|someone|anyone|everyone|nobody|somebody|everybody)\\b`, 'every|\\ball\\b|both|some(thing|one|body)|any(thing|one|body)|nothing|everything|everyone|nobody'),
  r(21, '連接詞 so／because', `\\bbecause\\b|,\\s*so\\b`, '\\bbecause\\b|\\bso\\b'),
  r(22, 'when／before／after／if 子句', `\\bif\\b|(?<!^)\\bwhen\\b(?!.*\\?$)|\\b(before|after|until)\\s+(i|you|he|she|we|they)\\s+[a-z]+`, '\\bwhen\\b|\\bbefore\\b|\\bafter\\b|\\bif\\b'),
  r(23, '不定詞和動名詞', `\\b(hope|hopes|plan|plans|decide|decided|try|tries|tried|forget|forgot|remember|learn|learned)\\s+to\\s+[a-z]+|\\b(enjoy|enjoys|finish|finished|stop|stopped|mind|keep|kept|practice|avoid)\\s+[a-z]+ing\\b`, '不定詞|動名詞|to 加原形|ing'),
  r(24, '過去進行式', `\\b(was|were)\\s+(?!(?:${ING_ADJ})\\b)[a-z]+ing\\b|\\bwhile\\b`, '過去進行|while'),
  r(25, '現在完成式', `\\b(have|has|haven't|hasn't|'ve)\\s+(never\\s+|just\\s+|already\\s+|ever\\s+|not\\s+)?([a-z]+ed|${PART})\\b`, '現在完成|have \\+|has \\+'),
  r(26, 'unless', `\\bunless\\b`, 'unless|除非'),
  r(27, 'So do I／Neither do I', `\\bso (do|does|did|am|is|are|can|have|was) (i|we)\\b|\\bneither (do|am|can|did) (i|we)\\b`, 'so do i|neither'),
  r(28, 'into／by＋交通工具／afraid of', `\\bafraid of\\b|\\binto\\b|\\bby (bus|car|train|taxi|bike|email|phone|mrt|plane)\\b`, 'afraid of|into|by (bus|car|train|taxi|bike|email|phone|mrt|plane)|by 加'),
  r(30, '被動語態', `\\b(is|are|was|were|be|been|being|am|isn't|aren't|wasn't|weren't)\\s+(not\\s+)?(?!(?:${ADJ_ED})\\b)([a-z]{3,}ed|done|made|given|taken|written|known|seen|found|sold|told|built|caught|kept|sent|brought|held|paid|shown|stolen|eaten|left)\\b`, '被動'),
  r(31, '關係子句', `(?<!^)\\b[a-z]+\\s+(who|which|whose)\\b(?!.*\\?$)`, '關係子句|\\bwho\\b|which'),
  r(32, '間接問句', `\\b(know|wonder|asked|ask|remember|sure)\\s+(what|where|when|why|how|who|if|whether)\\b`, '間接問句'),
  r(34, 'as…as／too…to／enough', `\\bas [a-z]+ as\\b|\\btoo [a-z]+ to\\b|\\benough\\b`, 'as.as|too|enough'),
  r(35, 'tell 人 to／make／let／used to', `\\b(told|tell|tells|asked|ask) (me|him|her|us|them) to\\b|\\b(make|makes|made|let|lets) (me|him|her|us|them) [a-z]+\\b|\\bused to\\b`, 'tell.*to|make|let|used to'),
  r(36, '現在完成進行式', `\\b(have|has|'ve) been [a-z]+ing\\b`, '現在完成進行'),
  r(37, '過去完成式', `\\bhad ([a-z]+ed|${PART})\\b`, '過去完成'),
  r(38, '第二類假設', `\\bif\\b[^.]*\\b(would|could)\\b|\\bwould\\b[^.]*\\bif\\b`, '第二類|would'),
  r(39, '對比和讓步', `\\balthough\\b|\\bthough\\b|\\bhowever\\b|\\bwhereas\\b`, 'although|though|however|whereas|雖然|讓步'),
  r(40, '因果的書面說法', `\\bdue to\\b|\\bas a result\\b|\\btherefore\\b|\\bbecause of\\b`, 'due to|as a result|therefore|because of'),
  r(41, '助動詞的被動', `\\b(must|should|can|will|may|might|could) be (?!(?:${ADJ_ED})\\b)([a-z]{3,}ed|done|made|given|taken|written|seen|found|kept|sent|paid)\\b`, '被動'),
]

/** The rules a sentence of `unit` breaks: grammar from a later unit that the material around it does not teach. */
export function untaught(en: string, unit: number, teaching = '') {
  const text = en.toLowerCase().replace(/[’‘]/g, "'").trim()
  return rules.filter(rule => rule.unit > unit && rule.rx.test(text) && !rule.cue.test(teaching))
}

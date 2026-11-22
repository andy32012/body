import { Check } from 'lucide-react'
import type { PageProps } from '../lib/store'
import { reviewEnergy, reviewLoad, sentenceReviewKey, type Energy } from '../lib/progress'
import { answeredOn, quizSectionKey, sectionOf, type QuizItem } from '../lib/quiz'
import { casesFinishedOn } from '../lib/scenarios'
import quizData from '../data/quiz.json'
import { activeLesson, lessonFinished } from '../lib/lesson'
import { dueTopic, partNumber, partPlan, topicDoneToday } from '../lib/topics'
import type { Focus } from '../lib/nextFocus'
import { dayBudget, planBlocks, type BlockId } from '../lib/dailyPlan'
import { dailyTarget, doneKey } from '../lib/dailyWords'
import { certStatus, exams, officialLevel, steps } from '../lib/cefr'
import { hasPack, heldOpen, practisedOn, readHeld, weekCounts } from '../lib/bridge'
import { nurseSlot, nurseWordsOn, readLastHeard } from '../lib/nursing'
import './today-plan.css'

const nursingIds = new Set((quizData as QuizItem[]).filter(q => sectionOf(q) === 'nursing').map(q => q.id))

type Task = { id: string; min: number; title: string; detail: string; auto: boolean; go?: () => void; goLabel?: string; go2?: () => void; go2Label?: string }
const to = (hash: string) => () => { location.hash = hash }
/** Something saved today under notes '<prefix>.<id>' (a reading or a writing record). */
const savedToday = (notes: Record<string, string>, prefix: string, today: string) =>
  Object.entries(notes).some(([k, v]) => k.startsWith(prefix) && v.includes('"day":"' + today + '"'))

/** Today's list. Its minutes come from the day's plan — the same numbers as the choices above — and add up to them.
 *  During exams and internship it is a short nursing-English plan and the curriculum does not move: review, then listen
 *  or read a nursing text (whichever was done on fewer days this week), then one slot that takes turns day by day —
 *  nursing word drills, acting a scene out with Emma, or nursing questions. */
export default function TodayPlan({ state, update, today, energy, onStart, onWord, mode = 'regular', focus }:
  Pick<PageProps, 'state' | 'update'> & { today: string; energy: Energy; onStart: (e: Energy) => void; onWord?: () => void; mode?: 'regular' | 'nursing'; focus?: Focus }) {
  const budget = dayBudget(today, state.settings)
  const total = budget.minutes[energy] ?? budget.minutes.normal ?? 30
  // Today's review: word cards up to the day's cap and a few sentence cards; only word cards beyond the cap hold back new words.
  const load = reviewLoad(state, today, reviewEnergy(today, state.settings.periods))
  // On a 累爆 day the list asks for the short review (50 word cards); the rest simply waits, it does not change new words.
  const shown = energy === 'low' ? reviewLoad(state, today, 'low') : load
  const left = shown.words + shown.sentences
  const reviewedToday = state.reviewEvents.some(e => e.day === today) || Number(state.notes[sentenceReviewKey(today)]) > 0
  const key = (id: string) => 'plan.' + today + '.' + id
  // Only nursing questions count toward the nursing plan; an English question is not nursing practice.
  const quizToday = answeredOn(state.notes, today, nursingIds)
  const casesToday = casesFinishedOn(state.notes, today)
  const topic = mode === 'regular' && energy !== 'low' ? dueTopic(state, today) : null
  const topicDone = topicDoneToday(state.notes, today)
  const wordTarget = dailyTarget(state.notes, budget.quiet, today, load.backlog)
  const wordsDone = Number(state.notes[doneKey(today)] || 0)
  const readToday = savedToday(state.notes, 'read.', today)
  const wroteToday = savedToday(state.notes, 'write.', today)
  const listenedToday = practisedOn(state.notes, state.sessions, 'listen', today)
  const spokeToday = practisedOn(state.notes, state.sessions, 'speak', today)
  // Four skills over the week: the "listen or read" and "speak or write" slots point at whichever was done on fewer days;
  // on a tie, listening and speaking go first (they are the harder ones to fit in, and VisaScreen asks for speaking 7).
  const week = weekCounts(state.notes, state.sessions, today)
  const listenFirst = week.listen <= week.read
  const speakFirst = week.speak <= week.write
  // A bridge unit's skills pack, when the current unit has one; on its last day, the held-out test comes first.
  const unit = state.curriculum.unit
  const pack = hasPack(unit) ? unit : null
  const held = pack ? readHeld(state.notes, pack) : {}
  const testDay = !!pack && heldOpen(state.curriculum, pack) && !(held.reading && held.listening)
  const where = (tab: string, other: string) => pack ? 'library/unit/' + tab : other
  // The certificate to prepare for: the step after the level already shown on a certificate.
  const level = officialLevel(state.notes)
  const nextStep = steps.find(s => s.from === level)
  const cert = nextStep ? certStatus(state.notes, nextStep.to) : null
  const exam = nextStep ? exams[nextStep.exams[0]] : null

  const queued = shown.queued ? '另有 ' + shown.queued + ' 句句子卡排在之後的日子' : ''
  const reviewDetail = left
    ? [shown.words ? '單字卡 ' + shown.words + ' 張' : '', shown.sentences ? '句子卡 ' + shown.sentences + ' 句（中翻英）' : ''].filter(Boolean).join('、') + '，先不看答案回想'
      + (shown.backlog ? '；單字卡另外 ' + shown.backlog + ' 張排到明天' : '') + (queued ? '（' + queued + '）' : '')
    : reviewedToday ? '今天的複習做完了' + (queued ? '（' + queued + '，想多做可以再開中翻英）' : '')
    : '今天沒有到期的卡，可以快篩幾個新字'
  // Word cards on 單字複習, sentence cards on 中翻英: two buttons when both are waiting.
  const reviewGo: Pick<Task, 'go' | 'goLabel' | 'go2' | 'go2Label'> = shown.words
    ? { go: to('library/words'), goLabel: '單字卡', ...(shown.sentences ? { go2: to('library/translate'), go2Label: '句子卡' } : {}) }
    : shown.sentences ? { go: to('library/translate'), goLabel: '句子卡' } : { go: to('library/words') }
  const review: Task = { id: 'review', min: 0, title: '複習卡', detail: reviewDetail, auto: reviewedToday && left === 0, ...reviewGo }
  const lesson: Task = topic ? { id: 'lesson', min: 0, title: '生活主題：' + topic.topic.title, detail: '第 ' + partNumber(topic.part) + ' 次（共 3 次）：' + partPlan[topic.part],
      auto: false, go: () => onStart(energy), goLabel: topic.step > 0 ? '繼續' : '開始' }
    : topicDone && !lessonFinished(state.notes, today) ? { id: 'lesson', min: 0, title: '今天的生活主題', detail: '完成了。文法課下次上；想多練也可以現在上。',
      auto: true, go: () => onStart(energy), goLabel: '加練' }
    : { id: 'lesson', min: 0, title: '今天這一堂', detail: '回想 → 聽懂 → 句型 → 用自己的話說 → 訂正',
      auto: lessonFinished(state.notes, today), go: () => onStart(energy), goLabel: lessonFinished(state.notes, today) ? '再上' : activeLesson(state.notes) ? '繼續' : '開始' }
  const catalog: Record<Exclude<BlockId, 'review' | 'lesson'>, Omit<Task, 'min'>> = {
    focus: { id: 'focus', title: '先補強', detail: focus?.reason ?? '', auto: false, go: focus?.action ? to(focus.action.hash) : undefined, goLabel: '去做' },
    words: { id: 'words', title: '今日單字', detail: wordTarget ? '今天 ' + wordTarget + ' 個新字' + (wordsDone ? '，看了 ' + Math.min(wordsDone, wordTarget) + ' 個' : '') + (budget.kind === 'winter' ? '（寒假可以把每天看幾個調到 15–20）' : '') : '單字卡積了 ' + load.backlog + ' 張今天複習不完，先不加新字',
      auto: wordTarget > 0 && wordsDone >= wordTarget, go: onWord, goLabel: '打開' },
    input: testDay ? { id: 'input', title: '聽或讀：單元回測', detail: '單元 ' + pack + ' 最後一天：一篇沒看過的閱讀＋一段沒聽過的聽力，各只有一次機會', auto: !!(held.reading && held.listening),
        go: to('library/unit/test'), goLabel: '回測' }
      : { id: 'input', title: '聽或讀', auto: readToday || listenedToday,
        detail: '這週聽 ' + week.listen + ' 天、讀 ' + week.read + ' 天 → 今天先' + (listenFirst
          ? '聽：' + (pack ? '單元 ' + pack + ' 的聽力，先不看字' : '句子跟讀，聽一句、跟著念，再自己說一次')
          : '讀：' + (pack ? '單元 ' + pack + ' 的閱讀' : '一篇閱讀理解')),
        go: to(listenFirst ? where('listen', 'library/listen') : where('read', 'library/reading')), goLabel: listenFirst ? '聽' : '讀',
        go2: to(listenFirst ? where('read', 'library/reading') : where('listen', 'library/listen')), go2Label: listenFirst ? '讀' : '聽' },
    output: { id: 'output', title: '說或寫', auto: wroteToday || spokeToday,
      detail: '這週說 ' + week.speak + ' 天、寫 ' + week.write + ' 天 → 今天先' + (speakFirst
        ? '說：' + (pack ? '跟 Emma 做單元 ' + pack + ' 的口說任務' : '跟 Emma 聊 10 分鐘')
        : '寫：' + (pack ? '單元 ' + pack + ' 的段落寫作' : '寫作階梯一題')),
      go: to(speakFirst ? where('speak', 'speaking') : where('write', 'library/writing')), goLabel: speakFirst ? '說' : '寫',
      go2: to(speakFirst ? where('write', 'library/writing') : where('speak', 'speaking')), go2Label: speakFirst ? '寫' : '說' },
    // The 7000-word passages are a translation exercise with no audio, so listening points at sentence shadowing.
    listen: { id: 'listen', title: '聽力', detail: pack ? '單元 ' + pack + ' 的聽力：先不看字聽完再作答，再一句一句跟著念' : '句子跟讀：聽一句、跟著念，再自己說一次', auto: listenedToday,
      go: to(where('listen', 'library/listen')), goLabel: pack ? '聽力' : '跟讀', ...(pack ? { go2: to('library/listen'), go2Label: '跟讀' } : {}) },
    read: testDay ? { id: 'read', title: '單元回測', detail: '單元 ' + pack + ' 最後一天：沒看過的閱讀和聽力，各只有一次機會', auto: !!(held.reading && held.listening), go: to('library/unit/test'), goLabel: '回測' }
      : { id: 'read', title: '閱讀理解', detail: pack ? '單元 ' + pack + ' 的兩篇閱讀；錯的題目選「卡在哪」' : '一到兩篇；錯的題目選「卡在哪」', auto: readToday,
        go: to(where('read', 'library/reading')), goLabel: '閱讀', ...(pack ? { go2: to('library/reading'), go2Label: '其他文章' } : {}) },
    write: { id: 'write', title: '寫作', detail: pack ? '單元 ' + pack + ' 的段落寫作一題，批改完改一版' : '寫作階梯一題，批改完改一版', auto: wroteToday,
      go: to(where('write', 'library/writing')), goLabel: '寫作' },
    speak: { id: 'speak', title: '口說', detail: pack ? '跟 Emma 做單元 ' + pack + ' 的口說任務，或練一張雅思 Part 2 題目卡' : '跟 Emma 聊 20 分鐘，或練一張雅思 Part 2 題目卡', auto: spokeToday,
      go: to(where('speak', 'speaking')), goLabel: 'Emma', go2: to('speaking/ielts'), go2Label: 'Part 2' },
    cert: { id: 'cert', title: '證照準備', auto: false, go: to('plan/levels'), goLabel: '關卡',
      detail: !exam ? '照下一張證照的題型練一回' : cert?.state === 'waiting' && cert.next ? exam.name + ' ' + cert.next.date.slice(5).replace('-', '/') + ' 考，考前聽讀、說寫的題型各練一回'
        : '下一張：' + exam.name + '。照它的題型練一回' + (exam.link ? '（官網有練習題）' : ''),
      ...(exam?.link ? { go2: () => { window.open(exam.link, '_blank', 'noopener') }, go2Label: '官網' } : {}) },
    extra: { id: 'extra', title: '加練', detail: '再一篇閱讀、多寫一題，或再跟 Emma 聊', auto: false, go: to('library/reading'), goLabel: '閱讀', go2: to('speaking'), go2Label: 'Emma' },
  }
  let tasks: Task[]
  if (mode === 'nursing') {
    const nReview: Task = { id: 'n-review', min: total, title: '複習', detail: left || reviewedToday ? reviewDetail : '今天沒有到期的卡，這步跳過',
      auto: left === 0, ...(left ? reviewGo : {}) }
    const third = Math.round(total / 3)
    const rest = total - 2 * third
    const nInput: Task = { id: 'n-input', min: third, title: '護理英文：聽或讀', auto: listenedToday || readToday,
      detail: '這週聽 ' + week.listen + ' 天、讀 ' + week.read + ' 天 → 今天先' + (listenFirst
        ? '聽一段護理師和病人的對話：先不看字作答，再看聽力稿和中文'
        : '讀一篇護理短文，做完 3–4 題；錯的題目選「卡在哪」'),
      go: to(listenFirst ? 'library/nlisten' : 'library/nread'), goLabel: listenFirst ? '聽' : '讀',
      go2: to(listenFirst ? 'library/nread' : 'library/nlisten'), go2Label: listenFirst ? '讀' : '聽' }
    const slot = nurseSlot(today)
    const heard = readLastHeard(state.notes)
    const wordsToday = nurseWordsOn(state.notes, today)
    const nSlot: Task = slot === 'words'
      ? { id: 'n-words', min: rest, title: '護理單字題', detail: '練一輪 10 個護理單字（看懂、聽懂或寫出），答完會出例句' + (wordsToday ? '（今天過關 ' + wordsToday + ' 個）' : ''),
        auto: wordsToday >= 5, go: to('library/nwords'), goLabel: '單字' }
      : slot === 'speak'
      ? { id: 'n-speak', min: rest, title: '口說：演一段', auto: spokeToday,
        detail: heard ? '跟 Emma 演你最近聽的「' + heard.title + '」，你演 ' + heard.you + '；沒有語音金鑰就自己唸你的台詞' : '跟 Emma 用英文說一件今天實習或讀書遇到的事，三句就好',
        go: to(heard ? 'speaking/nurse-' + heard.id : 'speaking'), goLabel: 'Emma' }
      : { id: 'n-quiz', min: rest, title: '護理英文題', detail: '做 3–5 題護理英文題，或做完一個臨床情境；先不看中文，答錯就選「卡在哪」' + (quizToday || casesToday ? '（今天' + [quizToday ? '護理題 ' + quizToday + ' 題' : '', casesToday ? '情境 ' + casesToday + ' 個' : ''].filter(Boolean).join('、') + '）' : ''),
        auto: quizToday >= 3 || casesToday >= 1, go: () => { update(prev => ({ ...prev, notes: { ...prev.notes, [quizSectionKey]: 'nursing' } })); location.hash = 'library/quiz' },
        goLabel: '題目', go2: to('library/case'), go2Label: '情境' }
    tasks = energy === 'low' ? [nReview] : [{ ...nReview, min: third }, nInput, nSlot]
  } else {
    tasks = planBlocks(total, focus?.action ? focus.minutes : 0, shown.minutes).map(b =>
      b.id === 'review' ? { ...review, min: b.min } : b.id === 'lesson' ? { ...lesson, min: b.min } : { ...catalog[b.id], min: b.min })
  }
  const isDone = (t: Task) => t.auto || state.notes[key(t.id)] === '1'
  const finished = tasks.filter(isDone).length
  const toggle = (id: string) => update(prev => {
    const notes = { ...prev.notes }
    if (notes[key(id)] === '1') delete notes[key(id)]; else notes[key(id)] = '1'
    return { ...prev, notes }
  })
  const title = mode === 'nursing' ? '今天的護理英文 ' + budget.labels[energy] : '今天的 ' + budget.labels[energy]
  return <section className="tp-card" aria-label={title}>
    <header><strong>{title}</strong><span>{finished} / {tasks.length}</span></header>
    <div className="tp-bar" aria-hidden="true"><i style={{ width: finished / tasks.length * 100 + '%' }} /></div>
    <ol>
      {tasks.map(t => <li key={t.id} className={isDone(t) ? 'done' : ''}>
        <button type="button" className="tp-check" aria-pressed={isDone(t)} aria-label={(isDone(t) ? '取消完成：' : '標記完成：') + t.title}
          disabled={t.auto} onClick={() => toggle(t.id)}>{isDone(t) && <Check size={14} strokeWidth={3} />}</button>
        <div className="tp-text"><b>{t.title}<small>{t.min} 分鐘</small></b><span>{t.detail}</span></div>
        <div className="tp-go">
          {t.go && <button type="button" onClick={t.go}>{t.goLabel ?? '去做'}</button>}
          {t.go2 && <button type="button" onClick={t.go2}>{t.go2Label ?? 'Emma'}</button>}
        </div>
      </li>)}
    </ol>
  </section>
}

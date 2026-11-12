import test from 'node:test';
import assert from 'node:assert/strict';
import japanese from '../learning/courses/ja.js';
import korean from '../learning/courses/ko.js';
import {
  courses, courseById, lessons, words, lessonById, wordById, catalogIds,
  courseLessons, nextLesson, searchText,
} from '../learning/catalog.js';

const clean = (value) => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
const text = (value, label) => {
  assert.equal(typeof value, 'string', `${label} must be text`);
  assert(value.trim().length > 0, `${label} cannot be empty`);
};
const unique = (values, label) => assert.equal(new Set(values).size, values.length, `${label} must be unique`);
const examples = (items, label) => {
  assert(Array.isArray(items), `${label} must be an array`);
  assert(items.length >= 2, `${label} needs at least two examples`);
  items.forEach((example, index) => {
    for (const key of ['original', 'reading', 'meaning']) text(example[key], `${label}[${index}].${key}`);
  });
};

for (const course of [japanese, korean]) {
  test(`${course.id}: six stages contain five substantial lessons each`, () => {
    for (const key of ['id', 'language', 'native', 'locale', 'tagline', 'description']) text(course[key], `${course.id}.${key}`);
    assert.equal(course.locale, course.id === 'ja' ? 'ja-JP' : 'ko-KR');
    assert.equal(course.stages.length, 6);
    assert.equal(course.lessons.length, 30);
    unique(course.stages.map((stage) => stage.id), `${course.id} stage IDs`);
    const stageIds = new Set(course.stages.map((stage) => stage.id));
    for (const stage of course.stages) {
      for (const key of ['id', 'label', 'title', 'description']) text(stage[key], `${stage.id}.${key}`);
      assert(Array.isArray(stage.outcomes) && stage.outcomes.length >= 2, `${stage.id} needs learning outcomes`);
      stage.outcomes.forEach((outcome) => text(outcome, `${stage.id} outcome`));
      assert.equal(course.lessons.filter((lesson) => lesson.stageId === stage.id).length, 5, `${stage.id} lesson count`);
    }
    for (const lesson of course.lessons) {
      assert(lesson.id.startsWith(`${course.id}-`), `${lesson.id} has the wrong language prefix`);
      assert(stageIds.has(lesson.stageId), `${lesson.id} refers to an unknown stage`);
      for (const key of ['title', 'subtitle', 'canDo']) text(lesson[key], `${lesson.id}.${key}`);
      assert(Number.isFinite(lesson.duration) && lesson.duration > 0 && lesson.duration <= 120, `${lesson.id} duration must be a reasonable estimate`);
      assert(Array.isArray(lesson.points) && lesson.points.length >= 2, `${lesson.id} needs substantive teaching points`);
      lesson.points.forEach((point, index) => {
        text(point.title, `${lesson.id} point ${index + 1} title`);
        text(point.body, `${lesson.id} point ${index + 1} explanation`);
      });
      examples(lesson.examples, `${lesson.id}.examples`);
      examples(lesson.dialogue, `${lesson.id}.dialogue`);
      lesson.dialogue.forEach((line) => text(line.speaker, `${lesson.id} dialogue speaker`));
    }
  });

  test(`${course.id}: every lesson has four usable word cards with bilingual examples`, () => {
    for (const lesson of course.lessons) {
      assert.equal(lesson.words.length, 4, `${lesson.id} word-card count`);
      for (const word of lesson.words) {
        assert(word.id.startsWith(`${course.id}-w`), `${word.id} word ID has the wrong language prefix`);
        for (const key of ['id', 'term', 'reading', 'meaning', 'example', 'exampleReading', 'exampleMeaning']) {
          text(word[key], `${word.id}.${key}`);
        }
        assert(/\p{Script=Han}/u.test(word.meaning), `${word.id} needs a Chinese meaning`);
        assert(/\p{Script=Han}/u.test(word.exampleMeaning), `${word.id} needs a Chinese example translation`);
        const targetScript = course.id === 'ja' ? /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u : /\p{Script=Hangul}/u;
        assert(targetScript.test(word.term), `${word.id} needs a target-language term`);
        assert(targetScript.test(word.example), `${word.id} needs a target-language example`);
      }
    }
  });

  test(`${course.id}: each lesson has three four-choice questions with distinct options and explanations`, () => {
    const answerPositions = new Set();
    for (const lesson of course.lessons) {
      assert.equal(lesson.questions.length, 3, `${lesson.id} question count`);
      for (const question of lesson.questions) {
        assert(question.id.startsWith(`${lesson.id}-`), `${question.id} does not belong to ${lesson.id}`);
        text(question.prompt, `${question.id} prompt`);
        text(question.explanation, `${question.id} explanation`);
        assert.equal(question.choices.length, 4, `${question.id} needs four choices`);
        question.choices.forEach((choice, index) => text(choice, `${question.id} choice ${index + 1}`));
        unique(question.choices.map(clean), `${question.id} normalized choices`);
        assert(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < 4, `${question.id} has an invalid answer index`);
        answerPositions.add(question.answer);
      }
    }
    assert(answerPositions.size >= 3, `${course.id} answers should not always use the same position`);
  });

  test(`${course.id}: alphabet cards and source references are usable`, () => {
    text(course.alphabet.intro, `${course.id} alphabet introduction`);
    assert(Array.isArray(course.alphabet.groups) && course.alphabet.groups.length >= 2);
    unique(course.alphabet.groups.map((group) => group.id), `${course.id} alphabet group IDs`);
    for (const group of course.alphabet.groups) {
      for (const key of ['id', 'title', 'description']) text(group[key], `${course.id} alphabet ${key}`);
      assert(Array.isArray(group.items) && group.items.length > 0);
      unique(group.items.map((item) => item.symbol), `${course.id}/${group.id} symbols`);
      for (const item of group.items) {
        for (const key of ['symbol', 'reading', 'example', 'meaning']) text(item[key], `${course.id}/${group.id} ${key}`);
      }
    }
    assert(Array.isArray(course.sources) && course.sources.length > 0, `${course.id} needs learning references`);
    for (const source of course.sources) {
      text(source.title, `${course.id} source title`);
      assert.equal(new URL(source.url).protocol, 'https:');
    }
  });
}

test('Japanese alphabet includes all 46 basic hiragana and all 46 basic katakana', () => {
  const required = [
    [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'],
    [...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン'],
  ];
  const matched = new Set();
  for (const symbols of required) {
    assert.equal(symbols.length, 46, 'test reference alphabet has the expected size');
    const group = japanese.alphabet.groups.find((candidate) => symbols.every((symbol) => candidate.items.some((item) => item.symbol === symbol)));
    assert(group, `missing a complete basic alphabet beginning with ${symbols[0]}`);
    assert(group.items.length >= 46);
    matched.add(group.id);
  }
  assert.equal(matched.size, 2, 'hiragana and katakana should each have their own chart');
});

test('Korean alphabet covers 14 consonants, 10 vowels, 5 tense consonants and 11 compound vowels', () => {
  const required = [
    [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'],
    [...'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'],
    [...'ㄲㄸㅃㅆㅉ'],
    [...'ㅐㅒㅔㅖㅘㅙㅚㅝㅞㅟㅢ'],
  ];
  const matched = new Set();
  for (const symbols of required) {
    const group = korean.alphabet.groups.find((candidate) => symbols.every((symbol) => candidate.items.some((item) => item.symbol === symbol)));
    assert(group, `missing a complete Korean alphabet group beginning with ${symbols[0]}`);
    assert(group.items.length >= symbols.length);
    matched.add(group.id);
  }
  assert.equal(matched.size, 4, 'basic and extended Korean sounds should have separate charts');
});

test('all persistent record IDs are globally unique and the full catalog is complete', () => {
  const stageIds = courses.flatMap((course) => course.stages.map((stage) => stage.id));
  const questionIds = lessons.flatMap((lesson) => lesson.questions.map((question) => question.id));
  unique([...courses.map((course) => course.id), ...stageIds, ...lessons.map((lesson) => lesson.id), ...words.map((word) => word.id), ...questionIds], 'catalog IDs');
  assert.equal(courses.length, 2);
  assert.equal(lessons.length, 60);
  assert.equal(words.length, 240);
  assert.equal(questionIds.length, 180);
  assert.deepEqual(new Set(catalogIds.lessonIds), new Set(lessons.map((lesson) => lesson.id)));
  assert.deepEqual(new Set(catalogIds.wordIds), new Set(words.map((word) => word.id)));
  assert.deepEqual(new Set(catalogIds.questionIds), new Set(questionIds));
});

test('catalog indexes preserve language, stage and originating lesson information', () => {
  // Versioned module URLs create distinct instances; the exported course data
  // must still match its source file exactly.
  assert.deepEqual(courseById.ja, japanese);
  assert.deepEqual(courseById.ko, korean);
  for (const language of ['ja', 'ko']) assert.equal(courseLessons(language).length, 30);
  assert.deepEqual(courseLessons('en'), []);
  for (const lesson of lessons) {
    assert.equal(lessonById[lesson.id], lesson);
    assert.equal(lesson.stage.id, lesson.stageId);
    assert(lesson.stageIndex >= 0 && lesson.stageIndex < 6);
    assert(lesson.order >= 1 && lesson.order <= 30);
    assert.equal(lesson.locale, courseById[lesson.language].locale);
  }
  for (const word of words) {
    assert.equal(wordById[word.id], word);
    const lesson = lessonById[word.lessonId];
    assert(lesson.words.some((entry) => entry.id === word.id));
    assert.equal(word.language, lesson.language);
    assert.equal(word.stageId, lesson.stageId);
    assert.equal(word.stageIndex, lesson.stageIndex);
    assert.equal(word.stageLabel, lesson.stage.label);
  }
});

test('lesson recommendations resume an unfinished lesson without mixing languages', () => {
  const ja = courseLessons('ja');
  const ko = courseLessons('ko');
  const state = { lastLesson: null, lessons: {} };
  assert.equal(nextLesson('ja', state), ja[0]);
  state.lastLesson = ja[5].id;
  assert.equal(nextLesson('ja', state), ja[5]);
  assert.equal(nextLesson('ko', state), ko[0]);
  state.lessons[ja[5].id] = { completedAt: '2026-11-12T00:00:00.000Z' };
  state.lessons[ja[0].id] = { completedAt: '2026-11-12T00:00:00.000Z' };
  assert.equal(nextLesson('ja', state), ja[1]);
  state.lastLesson = 'unknown';
  assert.equal(nextLesson('ja', state), ja[1]);
  ja.forEach((lesson) => { state.lessons[lesson.id] = { completedAt: '2026-11-12T00:00:00.000Z' }; });
  assert.equal(nextLesson('ja', state), ja[0], 'all-complete learners can review from the first lesson');
});

test('search normalization supports full-width Latin text and ordinary spacing', () => {
  assert.equal(searchText('  ＡＢＣ　 日本語   '), 'abc 日本語');
  assert.equal(searchText('  한국어  '), '한국어');
  assert.equal(searchText(null), '');
});

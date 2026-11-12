import japanese from './courses/ja.js?v=15790524e112';
import korean from './courses/ko.js?v=a30ec9277426';

export const courses = [japanese, korean];
const indexById = entries => Object.assign(Object.create(null), Object.fromEntries(entries));
export const courseById = indexById(courses.map(course => [course.id, course]));
export const lessons = courses.flatMap(course => course.lessons.map((lesson, index) => ({
  ...lesson,
  language: course.id,
  languageName: course.language,
  locale: course.locale,
  order: index + 1,
  stageIndex: course.stages.findIndex(stage => stage.id === lesson.stageId),
  stage: course.stages.find(stage => stage.id === lesson.stageId),
})));
export const words = lessons.flatMap(lesson => lesson.words.map(word => ({
  ...word,
  language: lesson.language,
  languageName: lesson.languageName,
  locale: lesson.locale,
  stageId: lesson.stageId,
  stageIndex: lesson.stageIndex,
  stageLabel: lesson.stage.label,
  lessonId: lesson.id,
  lessonTitle: lesson.title,
})));
export const lessonById = indexById(lessons.map(lesson => [lesson.id, lesson]));
export const wordById = indexById(words.map(word => [word.id, word]));
export const catalogIds = {
  lessonIds: lessons.map(lesson => lesson.id),
  wordIds: words.map(word => word.id),
  questionIds: lessons.flatMap(lesson => lesson.questions.map(question => question.id)),
};

export function courseLessons(language) {
  return lessons.filter(lesson => lesson.language === language);
}

export function nextLesson(language, state) {
  const list = courseLessons(language);
  const recent = lessonById[state.lastLesson];
  if (recent?.language === language && !state.lessons[recent.id]?.completedAt) return recent;
  return list.find(lesson => !state.lessons[lesson.id]?.completedAt) || list[0];
}

export function searchText(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

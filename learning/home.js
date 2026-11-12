import { createStore } from './store.js?v=298dd99771b4';

const store = createStore();

function updateLearningSummary() {
  const stats = store.getStats();
  const state = store.getState();
  const completed = Object.entries(state.lessons).filter(([id, lesson]) => /^(ja|ko)-\d{2}$/.test(id) && lesson.completedAt).length;
  const words = document.getElementById('daily-word-summary');
  const progress = document.getElementById('learning-progress-summary');
  if (words) words.textContent = stats.reviewedToday ? `今天已複習 ${stats.reviewedToday} 個字 · 繼續累積` : '日文與韓文 · 每日 10 張字卡';
  if (progress) progress.textContent = completed || stats.streak ? `已完成 ${completed} 堂課 · 連續學習 ${stats.streak} 天` : '從第一堂課開始，記下每一步';
}

updateLearningSummary();
store.subscribe(updateLearningSummary);
window.addEventListener('pageshow', () => { store.refresh(); updateLearningSummary(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { store.refresh(); updateLearningSummary(); }
});

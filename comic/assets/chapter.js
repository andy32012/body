'use strict';
// 章節頁：章名、故事簡介、卷列表
(() => {
  const { h, store, loadManifest, volsOf, readUrl, volCard, setupResume } = window.X;
  const $ = (id) => document.getElementById(id);

  loadManifest()
    .then(render)
    .catch(() => {
      $('list').replaceChildren(h('p', { class: 'muted center', text: '載入失敗，請重新整理頁面。' }));
    });

  function render(m) {
    const chapters = m.chapters || [];
    const wanted = new URLSearchParams(location.search).get('c');
    // 只接受存在的章節；網址亂填就回到第一章
    const c = chapters.find((x) => x.id === wanted) || chapters[0];
    if (!c) return;
    const vols = volsOf(m, c);

    document.title = `${c.name}　${c.title}｜${m.title}`;
    $('hero-bg').src = `assets/chapters/${c.id}.webp`;
    $('kicker').textContent = c.name + (c.status ? `・${c.status}` : '');
    $('ctitle').textContent = c.title;
    $('ctag').textContent = c.tagline || '';
    if (vols[0]) $('start').href = readUrl(vols[0]);
    setupResume(m, c);

    $('story').replaceChildren(
      h('h2', {}, '故事簡介'),
      h('div', { class: 'intro' }, (c.intro || []).map((t) => h('p', { text: t })))
    );

    const progress = store.get('progress', {});
    $('list').replaceChildren(
      h('h2', { class: 'sec' }, '卷'),
      ...vols.map((v) => volCard(v, progress[v.id])),
      h('p', { class: 'soon', text: '敬請期待' })
    );
  }
})();

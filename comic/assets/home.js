'use strict';
// 作品首頁：故事簡介＋各章節
(() => {
  const { h, store, loadManifest, pageNo, volName, readUrl, chapterUrl, volsOf, slash, readBar, setupResume } =
    window.X;
  const list = document.getElementById('list');

  loadManifest()
    .then(render)
    .catch(() => {
      list.replaceChildren(h('p', { class: 'muted center', text: '目錄載入失敗，請重新整理頁面。' }));
    });

  function render(m) {
    setupResume(m);

    // 最近更新
    const newest = m.volumes
      .filter((v) => v.updated)
      .sort((a, b) => (a.updated < b.updated ? 1 : -1))[0];
    if (newest) {
      const news = document.getElementById('news');
      news.replaceChildren(
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        `最近更新 ${slash(newest.updated)}　`,
        h('a', { href: readUrl(newest), text: `${newest.stage}・${volName(newest)}` })
      );
      news.hidden = false;
    }

    // 故事簡介
    const work = m.work;
    if (work) {
      document.getElementById('story').replaceChildren(
        h('h2', {}, '故事', h('small', { text: `《${work.name}》` })),
        h('div', { class: 'intro' }, (work.intro || []).map((t) => h('p', { text: t })))
      );
    }

    // 章節
    const progress = store.get('progress', {});
    const cards = (m.chapters || []).map((c) => {
      const vols = volsOf(m, c);
      const total = vols.reduce((s, v) => s + v.pages.length, 0);
      const first = vols.length ? pageNo(vols[0].pages[0]) : 0;
      const readTo = Math.max(0, ...vols.map((v) => progress[v.id] || 0));
      const done = readTo && total ? Math.min(1, (readTo - first + 1) / total) : 0;
      return h(
        'a',
        { class: 'chap', href: chapterUrl(c) },
        h(
          'div',
          { class: 'chap-cover' },
          h('img', {
            src: `assets/chapters/${c.id}.webp`, alt: '', width: 1280, height: 720,
            decoding: 'async',
          }),
          c.status ? h('span', { class: 'badge', text: c.status }) : null
        ),
        h(
          'div',
          { class: 'chap-body' },
          h('p', { class: 'chap-no', text: c.name }),
          h('h3', { text: c.title }),
          c.tagline ? h('p', { class: 'blurb', text: c.tagline }) : null,
          h('p', { class: 'meta', text: `${vols.length} 卷・${total} 頁` }),
          done ? readBar(done, readTo) : null,
          h('span', { class: 'chap-go', text: '進入這一章 ›' })
        )
      );
    });
    if (m.upcoming) {
      cards.push(
        h(
          'div',
          { class: 'chap upcoming', 'aria-label': `${m.upcoming}，敬請期待` },
          h('div', { class: 'chap-cover blank' }, h('span', { text: '燈未點' })),
          h(
            'div',
            { class: 'chap-body' },
            h('p', { class: 'chap-no', text: m.upcoming }),
            h('h3', { text: '敬請期待' })
          )
        )
      );
    }
    list.replaceChildren(h('h2', { class: 'sec' }, '章節'), h('div', { class: 'chaps' }, cards));
  }
})();

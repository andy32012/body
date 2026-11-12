'use strict';
// 首頁與閱讀頁共用的小工具。全部用 DOM API 建立元素、以 textContent 放文字，
// 不把資料拼成 HTML 字串，避免 manifest 或網址參數裡的內容被當成程式執行。

window.X = (() => {
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // 瀏覽器儲存可能被關閉（無痕模式等），讀寫失敗時當作沒有資料。
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('xitian:' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('xitian:' + key, JSON.stringify(value));
      } catch {}
    },
  };

  const loadManifest = () =>
    fetch('manifest.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error('manifest ' + r.status);
      return r.json();
    });

  // 檔名就是全書頁碼：0137.webp → 137
  const pageNo = (page) => parseInt(page.f, 10);

  const volName = (v) => (v.subtitle ? `${v.title}・${v.subtitle}` : v.title);

  const readUrl = (v, p) => 'read.html?v=' + encodeURIComponent(v.id) + (p ? '&p=' + p : '');

  // 章節：卷的 stage 對應章的 name
  const chapterOf = (m, v) => (m.chapters || []).find((c) => c.name === v.stage) || null;
  const chapterUrl = (c) => 'chapter.html?c=' + encodeURIComponent(c.id);
  const volsOf = (m, c) => m.volumes.filter((v) => v.stage === c.name);
  const slash = (d) => d.replaceAll('-', '/');

  function readBar(done, readTo) {
    const fill = h('i');
    // 用 CSSOM 設寬度：CSP 不允許 HTML 內嵌 style 屬性，但允許程式設定
    fill.style.width = Math.round(done * 100) + '%';
    return h(
      'div',
      { class: 'readbar' },
      h('b', {}, fill),
      h('span', { text: done >= 1 ? '已讀完' : `讀到第 ${readTo} 頁` })
    );
  }

  // 卷卡片（章節頁使用）
  function volCard(v, readTo) {
    const first = pageNo(v.pages[0]);
    const lastNo = pageNo(v.pages[v.pages.length - 1]);
    const done = readTo ? Math.min(1, (readTo - first + 1) / v.pages.length) : 0;
    return h(
      'a',
      { class: 'vol', href: readUrl(v, readTo && readTo < lastNo ? readTo : null) },
      h('img', {
        class: 'thumb', src: v.dir + '/thumb.webp', alt: '',
        width: 640, height: 360, loading: 'lazy', decoding: 'async',
      }),
      h(
        'div',
        { class: 'vol-body' },
        h('h3', {}, v.title, v.subtitle ? h('span', { text: v.subtitle }) : null),
        v.blurb ? h('p', { class: 'blurb', text: v.blurb }) : null,
        h(
          'p',
          { class: 'meta' },
          `第 ${first}～${lastNo} 頁・共 ${v.pages.length} 頁`,
          v.updated ? `・${slash(v.updated)} 更新` : null
        ),
        done ? readBar(done, readTo) : null
      )
    );
  }

  // 「繼續閱讀」按鈕：只在讀者讀過（且屬於指定章節，若有指定）時顯示
  let resumeArgs = null;
  function setupResume(m, onlyChapter) {
    resumeArgs = [m, onlyChapter];
    const last = store.get('last', null);
    const v = last && m.volumes.find((x) => x.id === last.v);
    if (!v || (onlyChapter && v.stage !== onlyChapter.name)) return;
    const resume = document.getElementById('resume');
    resume.href = readUrl(v, last.p);
    resume.textContent = `繼續閱讀：${v.title} 第 ${last.p} 頁`;
    resume.hidden = false;
    document.getElementById('start').classList.remove('primary');
  }
  // 登入後若改用雲端進度，重新顯示「繼續閱讀」
  const refreshResume = () => resumeArgs && setupResume(...resumeArgs);

  return {
    h, store, loadManifest, pageNo, volName, readUrl,
    chapterOf, chapterUrl, volsOf, slash, readBar, volCard, setupResume, refreshResume,
  };
})();

'use strict';
(() => {
  const { h, store, loadManifest, pageNo, volName, chapterOf, chapterUrl } = window.X;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const MODES = { flip: '翻書', scroll: '捲動' };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  loadManifest()
    .then(render)
    .catch(() => {
      $('p').replaceChildren(h('p', { class: 'muted center pad', text: '載入失敗，請重新整理頁面。' }));
    });

  function render(m) {
    const vols = m.volumes;
    // 只接受 manifest 裡存在的卷；網址亂填就回到第一卷
    const vi = Math.max(0, vols.findIndex((x) => x.id === params.get('v')));
    const v = vols[vi];
    const prevVol = vols[vi - 1];
    const nextVol = vols[vi + 1];
    const pages = v.pages;
    const nums = pages.map(pageNo);
    const n = pages.length;

    let mode = null;
    let view = null;
    let current = nums[0];

    document.title = `${v.stage} ${volName(v)}｜${m.title}`;
    const chapter = chapterOf(m, v);
    const backHref = chapter ? chapterUrl(chapter) : './';
    $('back').href = backHref;
    $('t').textContent = `${v.stage}・${volName(v)}`;

    const url = (vol, p, md) =>
      'read.html?v=' + encodeURIComponent(vol.id) + (p ? '&p=' + p : '') + (md ? '&m=' + md : '');

    const smallSrc = (pg) => (pg.w > 720 ? `${v.dir}/s/${pg.f}` : `${v.dir}/${pg.f}`);

    function pageImg(k, eager) {
      const pg = pages[k];
      const big = `${v.dir}/${pg.f}`;
      const img = h('img', {
        src: big,
        srcset: pg.w > 720 ? `${v.dir}/s/${pg.f} 720w, ${big} ${pg.w}w` : null,
        sizes: '(max-width: 760px) 100vw, 1000px',
        width: pg.w,
        height: pg.h,
        alt: `第 ${nums[k]} 頁`,
        loading: eager ? 'eager' : 'lazy',
        decoding: 'async',
        draggable: 'false',
        'data-n': nums[k],
      });
      img.style.setProperty('--r', (pg.w / pg.h).toFixed(4));
      return img;
    }

    const volNav = (where) =>
      h(
        'nav',
        { class: 'volnav ' + where, 'aria-label': '換卷' },
        prevVol
          ? h('a', { href: url(prevVol, null, mode) }, h('small', { text: '上一卷' }), volName(prevVol))
          : h('span'),
        nextVol
          ? h('a', { class: 'next', href: url(nextVol, null, mode) }, h('small', { text: '下一卷' }), volName(nextVol))
          : h('span', { class: 'soon-inline', text: '下一卷敬請期待' })
      );

    const endPanel = () => [
      h('p', { class: 'end-title', text: `${volName(v)}　完` }),
      volNav('bottom'),
      h('a', { class: 'btn', href: backHref, text: chapter ? `回${chapter.name}` : '回目錄' }),
    ];

    // ── 共用：頁碼、進度、存檔 ───────────────────
    const jump = $('jump');
    jump.replaceChildren(...nums.map((x) => h('option', { value: x, text: `${x}` })));
    $('total').textContent = `/ ${nums[n - 1]}`;
    jump.addEventListener('change', () => view && view.go(+jump.value));

    let saveTimer;
    function setCurrent(num) {
      if (num === current) return;
      current = num;
      jump.value = String(num);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    }
    function save() {
      store.set('last', { v: v.id, p: current, t: Date.now() });
      // 交給 auth.js：登入時同步到雲端
      dispatchEvent(new CustomEvent('xitian:progress', { detail: { v: v.id, p: current } }));
      const progress = store.get('progress', {});
      progress[v.id] = Math.max(progress[v.id] || 0, current);
      store.set('progress', progress);
      history.replaceState(null, '', url(v, current === nums[0] ? null : current, mode));
    }
    const bar = $('bar');
    const setProgress = (f) => (bar.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`);

    // 縮放（只有捲動模式用得到）
    let fit = store.get('fit', 'screen');
    const applyFit = () => {
      document.body.classList.toggle('fit-width', fit === 'width');
      $('fit').textContent = fit === 'width' ? '整頁' : '放大';
      $('fit').setAttribute('aria-label', fit === 'width' ? '改為整頁顯示' : '改為填滿寬度');
    };
    applyFit();
    $('fit').addEventListener('click', () => {
      const keep = current;
      fit = fit === 'width' ? 'screen' : 'width';
      store.set('fit', fit);
      applyFit();
      view && view.go(keep);
    });

    // 鍵盤
    addEventListener('keydown', (e) => {
      if (!view || e.target === jump || e.altKey || e.ctrlKey || e.metaKey) return;
      if (document.querySelector('.chooser')) return;
      if (e.key === 'ArrowRight' || (mode === 'flip' && (e.key === ' ' || e.key === 'PageDown'))) {
        e.preventDefault();
        view.next();
      } else if (e.key === 'ArrowLeft' || (mode === 'flip' && e.key === 'PageUp')) {
        e.preventDefault();
        view.prev();
      }
    });

    // ── 啟動 ───────────────────────────────────
    const wanted = parseInt(params.get('p'), 10);
    const startAt = nums.includes(wanted) ? wanted : null;
    const urlMode = params.get('m');
    const savedMode = store.get('mode', null);

    $('mode').addEventListener('click', () => chooser(true));

    if (MODES[urlMode]) start(urlMode, startAt, true);
    else if (MODES[savedMode]) start(savedMode, startAt, true);
    else chooser(false);

    function start(md, at, firstTime) {
      if (view) view.destroy();
      mode = md;
      document.body.classList.toggle('mode-flip', md === 'flip');
      document.body.classList.toggle('mode-scroll', md === 'scroll');
      document.body.classList.remove('bar-hidden');
      $('mode').textContent = MODES[md];
      view = md === 'flip' ? flipView(at) : scrollView(at);
      history.replaceState(null, '', url(v, current === nums[0] ? null : current, mode));
      if (firstTime && !at) offerResume();
    }

    function offerResume() {
      const last = store.get('last', null);
      if (!(last && last.v === v.id && last.p > nums[0] && nums.includes(last.p))) return;
      const toast = $('toast');
      toast.replaceChildren(
        `上次看到第 ${last.p} 頁`,
        h('button', {
          class: 'btn small primary',
          text: '繼續',
          onclick: () => {
            toast.hidden = true;
            view.go(last.p);
          },
        }),
        h('button', { class: 'x', 'aria-label': '關閉', text: '×', onclick: () => (toast.hidden = true) })
      );
      toast.hidden = false;
      setTimeout(() => (toast.hidden = true), 9000);
    }

    // ── 閱讀方式公告 ─────────────────────────────
    function chooser(switching) {
      if (document.querySelector('.chooser')) return;
      const a = pages[0];
      const b = pages[Math.min(1, n - 1)];
      const c = pages[Math.min(2, n - 1)];
      const thumb = (pg) => h('img', { src: smallSrc(pg), alt: '', draggable: 'false' });
      const remember = h('input', { type: 'checkbox', id: 'remember' });
      if (store.get('mode', null)) remember.checked = true;

      const option = (md, title, demo) =>
        h(
          'button',
          {
            class: 'choice' + (md === mode ? ' on' : ''),
            type: 'button',
            'data-mode': md,
            onclick: () => pick(md),
          },
          h('div', { class: 'demo demo-' + md, 'aria-hidden': 'true' }, demo),
          h('div', { class: 'choice-text' }, h('b', { text: title }))
        );

      const flipDemo = h(
        'div',
        { class: 'pv-book' },
        h('div', { class: 'pv-page pv-under' }, thumb(b)),
        h(
          'div',
          { class: 'pv-leaf' },
          h('div', { class: 'pv-face pv-front' }, thumb(a)),
          h('div', { class: 'pv-face pv-back' })
        ),
        h('i', { class: 'pv-finger' })
      );
      const scrollDemo = h(
        'div',
        { class: 'pv-phone' },
        h('div', { class: 'pv-strip' }, thumb(a), thumb(b), thumb(c), thumb(a), thumb(b)),
        h('i', { class: 'pv-finger' })
      );

      const dialog = h(
        'div',
        { class: 'chooser-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'chooser-title' },
        h('p', { class: 'chooser-kicker', text: `${v.stage}・${volName(v)}` }),
        h('h2', { id: 'chooser-title', text: '你想怎麼讀？' }),
        h(
          'div',
          { class: 'choices' },
          option('flip', '翻書', flipDemo),
          option('scroll', '往下滑', scrollDemo)
        ),
        h(
          'label',
          { class: 'remember' },
          remember,
          h('span', { text: '記住我的選擇，下次直接開始（右上角隨時可以切換）' })
        )
      );
      const overlay = h('div', { class: 'chooser' }, h('div', { class: 'chooser-bg' }), dialog);

      if (switching && mode) {
        overlay.firstChild.addEventListener('click', close);
      }
      const onKey = (e) => {
        if (e.key === 'Escape' && switching && mode) close();
      };
      addEventListener('keydown', onKey);

      document.body.append(overlay);
      document.body.classList.add('modal-open');
      void overlay.offsetWidth; // 先排版一次，接著加上 in 才會播放進場動畫
      overlay.classList.add('in');
      setTimeout(() => dialog.querySelector('.choice').focus({ preventScroll: true }), 60);

      function close(after) {
        removeEventListener('keydown', onKey);
        overlay.classList.remove('in');
        overlay.classList.add('out');
        setTimeout(
          () => {
            overlay.remove();
            document.body.classList.remove('modal-open');
            if (typeof after === 'function') after();
          },
          reduceMotion ? 0 : 380
        );
      }

      function pick(md) {
        store.set('mode', remember.checked ? md : null);
        const btn = dialog.querySelector(`[data-mode="${md}"]`);
        btn.classList.add('picked');
        const keep = mode ? current : startAt;
        setTimeout(
          () => close(() => (md === mode ? null : start(md, keep, !mode))),
          reduceMotion ? 0 : 260
        );
      }
    }

    // ── 往下滑模式 ───────────────────────────────
    function scrollView(at) {
      const imgs = pages.map((_, k) => pageImg(k, k < 2));
      $('p').className = 'pages';
      $('p').replaceChildren(volNav('top'), ...imgs);
      $('end').replaceChildren(...endPanel());
      $('end').hidden = false;

      let jumping = 0;
      function go(num) {
        const target = imgs[nums.indexOf(num)];
        if (!target) return;
        jumping = Date.now();
        target.scrollIntoView({ block: 'start' });
      }

      const seen = new IntersectionObserver(
        (entries) => {
          for (const e of entries) if (e.isIntersecting) setCurrent(+e.target.dataset.n);
        },
        { rootMargin: '-50% 0px -50% 0px' }
      );
      imgs.forEach((img) => seen.observe(img));

      let lastY = scrollY;
      const onScroll = () => {
        const max = document.documentElement.scrollHeight - innerHeight;
        setProgress(max > 0 ? scrollY / max : 0);
        const y = scrollY;
        if (Date.now() - jumping > 1200) {
          document.body.classList.toggle('bar-hidden', y > lastY && y > 120);
        }
        lastY = y;
      };
      addEventListener('scroll', onScroll, { passive: true });

      if (at) requestAnimationFrame(() => go(at));
      else scrollTo(0, 0);
      onScroll();

      const step = (d) => {
        const idx = nums.indexOf(current) + d;
        if (idx >= 0 && idx < n) go(nums[idx]);
      };

      return {
        go,
        next: () => step(1),
        prev: () => step(-1),
        destroy() {
          seen.disconnect();
          removeEventListener('scroll', onScroll);
        },
      };
    }

    // ── 翻書模式 ─────────────────────────────────
    function flipView(at) {
      const END = n; // 最後多一張「卷末」
      let index = at ? nums.indexOf(at) : 0;
      let busy = false;
      const cache = new Map();

      const slide = (k) => {
        if (!cache.has(k)) {
          cache.set(
            k,
            k < n ? pageImg(k, true) : h('div', { class: 'endcard' }, ...endPanel())
          );
        }
        return cache.get(k);
      };
      const ratio = (k) => (k < n ? pages[k].w / pages[k].h : 0.75);

      const shade = () => h('i', { class: 'shade' });
      const under = h('div', { class: 'leaf under' }, h('div', { class: 'face' }), shade());
      const top = h(
        'div',
        { class: 'leaf top' },
        h('div', { class: 'face front' }),
        h('div', { class: 'face back' }),
        shade()
      );
      const stage = h('div', { class: 'stage' }, under, top);
      const prevBtn = h('button', { class: 'turn prev', type: 'button', 'aria-label': '上一頁', text: '‹' });
      const nextBtn = h('button', { class: 'turn next', type: 'button', 'aria-label': '下一頁', text: '›' });
      const hint = h('p', { class: 'flip-hint', text: '點右側或向左滑翻到下一頁' });
      const book = h('div', { class: 'book' }, stage, prevBtn, nextBtn, hint);

      $('p').className = 'pages flip';
      $('p').replaceChildren(book);
      $('end').replaceChildren();
      $('end').hidden = true;
      scrollTo(0, 0);

      let W = 0;
      let H = 0;
      function measure() {
        W = stage.clientWidth;
        H = stage.clientHeight;
      }
      function place(el, k) {
        const r = ratio(k);
        const w = Math.min(W, H * r);
        const hh = w / r;
        el.style.width = w + 'px';
        el.style.height = hh + 'px';
        el.style.left = (W - w) / 2 + 'px';
        el.style.top = (H - hh) / 2 + 'px';
        el.dataset.k = k;
      }
      const fill = (leaf, k, sel) => {
        leaf.querySelector(sel || '.face').replaceChildren(slide(k));
        place(leaf, k);
      };
      function setAngle(a) {
        top.style.transform = `rotateY(${a}deg)`;
        const t = Math.abs(a) / 180;
        top.style.setProperty('--shade', (Math.sin(t * Math.PI) * 0.55).toFixed(3));
        under.style.setProperty('--shade', ((1 - t) * 0.6).toFixed(3));
      }

      function show(k) {
        index = k;
        fill(top, k, '.front');
        setAngle(0);
        under.hidden = true;
        prevBtn.disabled = k <= 0;
        nextBtn.disabled = k >= END;
        if (k < n) setCurrent(nums[k]);
        setProgress(k / END);
        // 預先載入前後兩頁
        for (const d of [1, 2, -1]) if (k + d >= 0 && k + d <= END) slide(k + d);
      }

      // 以 requestAnimationFrame 做翻頁動畫，陰影才能跟著角度變化
      function animate(from, to, ms, done) {
        if (reduceMotion) ms = 1;
        const t0 = performance.now();
        const ease = (x) => 1 - Math.pow(1 - x, 3);
        const tick = (now) => {
          const x = Math.min(1, (now - t0) / ms);
          setAngle(from + (to - from) * ease(x));
          if (x < 1) requestAnimationFrame(tick);
          else done();
        };
        requestAnimationFrame(tick);
      }

      // 準備翻頁：next = 目前這頁翻走，露出下一頁；prev = 上一頁從左邊翻回來蓋住
      function prepare(dir) {
        if (dir > 0) {
          if (index >= END) return false;
          fill(under, index + 1);
        } else {
          if (index <= 0) return false;
          fill(under, index);
          fill(top, index - 1, '.front');
          setAngle(-180);
        }
        under.hidden = false;
        hint.classList.add('gone');
        return true;
      }
      function finish(dir, fromAngle, ms) {
        busy = true;
        const target = dir > 0 ? -180 : 0;
        animate(fromAngle, target, ms, () => {
          busy = false;
          show(index + dir);
        });
      }
      function cancel(dir, fromAngle) {
        busy = true;
        animate(fromAngle, dir > 0 ? 0 : -180, 260, () => {
          busy = false;
          show(index);
        });
      }
      function turn(dir) {
        if (busy || !prepare(dir)) return;
        finish(dir, dir > 0 ? 0 : -180, 620);
      }

      prevBtn.addEventListener('click', () => turn(-1));
      nextBtn.addEventListener('click', () => turn(1));

      // 手指／滑鼠拖曳：頁面跟著手轉，放開後超過三成就翻過去，否則彈回
      let drag = null;
      stage.addEventListener('pointerdown', (e) => {
        if (busy || e.button > 0 || e.target.closest('a,button')) return;
        drag = { x: e.clientX, y: e.clientY, t: performance.now(), dir: 0, a: 0 };
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (!drag.dir) {
          if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(e.clientY - drag.y)) return;
          drag.dir = dx < 0 ? 1 : -1;
          if (!prepare(drag.dir)) {
            drag = null;
            return;
          }
        }
        const span = Math.max(W, 280) * 0.9;
        drag.a =
          drag.dir > 0
            ? Math.max(-180, Math.min(0, (dx / span) * 180))
            : Math.max(-180, Math.min(0, -180 + (dx / span) * 180));
        setAngle(drag.a);
      });
      const end = (e) => {
        if (!drag) return;
        const d = drag;
        drag = null;
        const dx = e.clientX - d.x;
        const dt = performance.now() - d.t;
        if (!d.dir) {
          // 點一下：左邊三分之一往前，其餘往後
          if (Math.abs(dx) < 10 && dt < 500) {
            const rect = stage.getBoundingClientRect();
            turn(e.clientX - rect.left < rect.width * 0.33 ? -1 : 1);
          }
          return;
        }
        const progress = d.dir > 0 ? -d.a / 180 : (d.a + 180) / 180;
        const fast = Math.abs(dx) / dt > 0.5;
        if (progress > 0.3 || fast) finish(d.dir, d.a, 420 * (1 - progress) + 160);
        else cancel(d.dir, d.a);
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);

      const onResize = () => {
        measure();
        place(top, index);
        if (!under.hidden) place(under, +under.dataset.k);
      };
      addEventListener('resize', onResize);

      measure();
      show(index < 0 ? 0 : index);

      return {
        go(num) {
          const k = nums.indexOf(num);
          if (k >= 0 && !busy) show(k);
        },
        next: () => turn(1),
        prev: () => turn(-1),
        destroy() {
          removeEventListener('resize', onResize);
        },
      };
    }
  }
})();

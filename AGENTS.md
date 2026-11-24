# AGENTS.md — body (xitian.page)

給寫程式的助手（Codex、Claude 等）看的規則。網站主人不是工程師：做完以後，用白話的繁體中文告訴他改了什麼、他需要自己做什麼，不要丟程式術語給他。

## What this repository is

The static website https://xitian.page, served by GitHub Pages straight from the `main` branch (repo root, `CNAME`, `.nojekyll`). There is no server and no database: whatever a visitor saves stays in their own browser.

Most folders are hand-written static pages. One folder is a built app, 夢想藍圖 (Dream Blueprint): its source is `projects/dream-blueprint/` and its published build is `dream/`.

| Path | What it is |
| --- | --- |
| `index.html`, `style.css`, `assets/` | Home page and shared styles |
| `comic/` | 《西天》 comic reader |
| `nursing/` | 內科黑板課 lessons; narration is pre-generated audio in each lesson's `audio/` (no API at runtime) |
| `japanese/`, `korean/`, `learning/`, `vocabulary/`, `progress/` | Japanese and Korean courses, their shared code, word review and progress pages |
| `english/` | English course plan page |
| `america/` | Life in the US and US nursing careers |
| `projects/dream-blueprint/` | Source of 夢想藍圖 (React + Vite + TypeScript). **Read `projects/dream-blueprint/AGENTS.md` before touching it or `dream/`.** |
| `dream/` | Build output of `projects/dream-blueprint/`. Never edit it by hand. |
| `tests/` | Tests of the static learning pages (node:test + happy-dom) |
| `licenses/` | Third-party licenses |

## Checks

Root pages (Node 24):

```sh
npm ci --ignore-scripts --no-fund
npm test
TZ=America/New_York node --test tests/store.test.mjs
```

After editing `learning/` or `america/` assets, refresh their cache-busting hashes with `npm run version:learning` or `npm run version:america`.

夢想藍圖 has its own checks, listed in `projects/dream-blueprint/AGENTS.md`. CI (`.github/workflows/learning-tests.yml`) runs both on every push and pull request; it also fails when `dream/` is not the build of the current source.

## Rules for every change

1. Progress lives in the visitor's browser (localStorage). Never rename or delete storage keys, never write code that clears saved progress, and keep old saved data readable.
2. Don't move or rename published pages or folders: the phone has them bookmarked and installed, and the offline caches use those paths.
3. No secrets in the repository — no API keys, tokens or passwords, not even as examples. Keys the owner uses are typed into the page and stay in his browser.
4. No third-party scripts, trackers, web fonts or CDNs at runtime. Pages that work offline must keep working offline.
5. User-facing text is Traditional Chinese (Taiwan), except learning content in the language being learned.
6. Learning content only grows. Don't delete lessons, words or questions to make a check pass; fix the content or the code instead.
7. Keep a change inside the folder the task is about. Don't reformat or "clean up" unrelated files.
8. Run the checks before committing, and commit a source change together with its published build.

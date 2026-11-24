# AGENTS.md — 夢想藍圖 (Dream Blueprint)

給寫程式的助手看的規則。主人是準備去美國當護理師的護理系學生，每天在手機上用這個網站學英文；他不是工程師。做完以後用白話的繁體中文告訴他：他會看到什麼不一樣、他需要自己做什麼（例如重新部署雲端程式）。不要用程式術語，也不要叫他自己跑指令。

## What it is

An offline-first web app (PWA) for one learner: English lessons in 53 units, daily words with spaced review, reading and listening, grammar, writing, speaking with a tutor named Emma, nursing English, GEPT and IELTS practice, a weekly race, and a long-term plan toward working as an RN in the US.

- React 19 + Vite 6 + TypeScript (strict) + zod 4. No backend.
- All progress is one JSON object in the browser's localStorage. Optional sync to the owner's Google Drive goes through a Google Apps Script that he deploys himself (source: `appsScriptCode` in `src/lib/drive.ts`).
- Claude and OpenAI are called straight from the browser with keys the owner types into Settings. The keys stay in his localStorage (`dream-blueprint.claude-key`, `dream-blueprint.openai-key`).
- Published at https://xitian.page/dream/ from the repository's `dream/` folder, which is this project's build output.

## Commands

Run in `projects/dream-blueprint/` with Node 24:

```sh
npm ci               # install exactly what package-lock.json says
npm test             # every test: tsx --test tests/*.test.*
npm run build        # tsc --noEmit (strict type check) + vite build into dist/
npm run check:offline  # the built app installs and works offline (needs dist/)
npm run preview -- --host 0.0.0.0 --port 4173   # try the build, also from a phone on the same Wi-Fi
```

All four must pass before committing. Dates are the learner's local days, so CI also runs the tests with `TZ=Asia/Taipei`; if a test touches dates, run `TZ=UTC npm test` and `TZ=Asia/Taipei npm test`.

## Publishing

A source change and its build go in the same commit:

```sh
# in projects/dream-blueprint/
npm test && npm run build && npm run check:offline
# then in the repository root
rm -rf dream/assets && cp -a projects/dream-blueprint/dist/. dream/
diff -r projects/dream-blueprint/dist dream   # no output = dream/ is exactly the build; delete any "Only in dream" leftovers
git status --short                             # changes only in projects/dream-blueprint/ and dream/ (plus docs or CI you meant to touch)
```

The build is deterministic. CI fails when `dream/` differs from a fresh build of the source, so never edit `dream/` by hand and never commit source without publishing it. GitHub Pages deploys `main` automatically ("pages build and deployment"). The installed app downloads the new version in the background the next time it opens online, and shows it after a restart.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/lib/store.ts` | The saved state: zod schema, defaults, `importBackup` (every migration, then content updates, then compaction), localStorage reading and writing |
| `src/lib/compact.ts` | Keeps the saved progress small (see "Saved progress") |
| `src/lib/progress.ts` | Local dates, FSRS-6 review scheduling (`newCard`, `reviewCard`), review lines, the race bonus, workload decisions |
| `src/lib/todayLesson.ts` | Builds today's lesson from the course position (sentence, checkpoint, new words or a review day); all lesson sentences by ID |
| `src/lib/lesson.ts` | The day's lesson record (`lesson.<date>` notes), unfinished and active lessons |
| `src/lib/dailyWords.ts` | 今日單字 and how many new words today |
| `src/lib/weakPoints.ts` | 我的弱點, shared by every kind of practice |
| `src/lib/tutor.ts`, `emmaPrompt.ts`, `emmaLesson.ts` | Claude API calls and Emma's instructions |
| `src/lib/drive.ts`, `cloudSync.ts` | Google Drive sync, the Apps Script source, cloud history versions |
| `src/lib/projection.ts` + `src/data/curriculumSchedule.json` | The one course schedule; the month plan and calendar are computed from it |
| `src/lib/rivals.ts` | The weekly race |
| `src/pages/` | Top-level screens (Practice, Plan, History, Rivals, Speaking, Settings, CosmosGallery) |
| `src/components/` | Everything else on screen |
| `src/data/*.json` | Teaching content and settings data |
| `tests/` | node:test tests, run with tsx |
| `scripts/` | Offline worker template (`service-worker.js` → `sw.js` in the build), the offline check, the Windows preview tool |
| `public/` | Photos (credit and official source of each in `src/data/cosmos-*.json`), icons, manifest, pronunciation audio |

`README.md` explains every feature in Traditional Chinese, including how answers are judged (獨立完成、有提示完成、自評完成・待確認、穩了). Keep it current when behavior changes.

## Saved progress

- The whole state lives in localStorage key `dream-blueprint.v2` (`dream-blueprint.v1` is the pre-v2 key, still read). Browsers keep about 5 MB per site. Other keys: `dream-blueprint.modified`, `.drive`, `.cloud-*`, `.drive-logs`, `.draft.<id>`, `.assistant-chat`, `.claude-key`, `.claude-model`, `.claude-persona`, `.openai-key`, `.openai-voice`, `.echo-guard`, `.pron-saved`, `.photo-rotation.v1`. Never rename or reuse any of them.
- Never write code that wipes, resets or shrinks what he did: sessions, cards, evidence, weak points, memory, his sentences, dated records.
- Schema changes stay backward compatible: add fields as optional (or with defaults); when old data must be converted, add a one-time migration in `importBackup` guarded by a `migrate.*` note, and a test that an old backup still imports. `importBackup` runs on every app start, on backup import and on cloud restore.
- `compact.ts` keeps the state small. On every load it folds review lines older than 60 days into `notes['review.archive']` (History's recall totals and the race bonus read it through `delayedRecall` and `bonusOn`), deletes day-only notes after 45 days, and slims finished lessons older than 120 days (windows shrink to 30/21/45 days once the state passes 3 MB). If you add:
  - a note key that only matters on its own day → add its pattern to `dayOnly` in `compact.ts` and to `tests/compact.test.ts`;
  - something that reads `reviewEvents` further back than 14 days → read the archive too; old lines are gone.
- Settings shows the progress size and warns above 3.5 MB. Past that, the next step is moving the state to IndexedDB, with a migration.

## Teaching content

- IDs never change: unit numbers, sentence IDs (`u<unit>-d<n>` lesson days, `u<unit>-c<n>` checkpoint, `u<unit>-r<n>` backup), word keys (review card `word:<en>`), topic, passage, reading, scenario and say-card IDs. Review cards, history and evidence point at them.
- Content only grows. `tests/invariants.test.ts` compares the data with `tests/fixtures/content-baseline.json` (every ID and the totals of teaching items) and fails when something is missing, renamed or fewer. After adding content, record it with `UPDATE_BASELINE=1 npx tsx --test tests/invariants.test.ts` (it only adds). Never edit the baseline by hand to make a deletion pass.
- When the meaning or answer of published content changes, add a new entry to `src/data/content-updates.json` listing the changed word keys and sentence IDs (never edit old entries). Learned cards for them come due that day, nothing is reset, and the home page says 教材修正了 once.
- Taught before used: a sentence he must write may only need grammar from its unit or earlier, unless the hints, explanation, new words or grammar box right there teach it; words above level 4 of the 7000-word list must have been taught as new words. `tests/taught.test.ts` (rules in `tests/taughtRules.ts`) checks over 1,500 sentences. When it fails, fix the sentence or teach the item; don't loosen the rules.
- `levels.json`: `zh` separates meanings with 「；」 and `sensePos` gives each meaning's part of speech; merged entries list each form in `forms`. The word hints in `passages.json` were written for each paragraph — don't overwrite them from the word list.
- Clinical content must stay correct for nursing; check facts against reliable sources and say which.
- Keep each data file's formatting so diffs stay small (Python: `json.dumps(data, ensure_ascii=False, indent=N)`, plus a final newline where the file has one):
  - indent 2 + newline: curriculum, curriculumSchedule, cosmos-d/g/p/s, gept-speaking, medical-parts, plan, quiz, reading, rivals, roadmap, school, sentences, words; indent 2, no newline: cosmos-n
  - indent 1 + newline: bridge, cue-cards, exam-subjects, lessons, scenarios, topics, writing; indent 1, no newline: content-updates, grammar, pronunciation, starters, word-parts
  - one line (`separators=(',', ':')`), no newline: levels, passages
  - hand formatted — edit in place, never re-dump: nursing-listening, nursing-reading, nursing-words
  - Windows line endings (CRLF), keep them: cosmos-d/g/n/p, rivals. Python's text mode hides `\r`; open these with `newline=''`.
  - Floats such as `150.0` in lessons.json survive a Python round trip but not JavaScript's `JSON.stringify`, so rewrite data files with Python.

## Code rules

- Layers are one-way: pages use components and lib, components use lib, lib never imports components or pages, and no files import each other in a circle (`tests/cycles.test.ts`). UI that two screens share goes in `src/components/` (for example `Translation`, `PracticeCover`).
- Logic belongs in `src/lib/` as plain functions (a few hooks live there too, but no components), with a test in `tests/`. New behavior gets a test; bug fixes get a test that failed before the fix.
- TypeScript strict, no `any`, no `dangerouslySetInnerHTML`, no third-party scripts, fonts or trackers at runtime, nothing that breaks offline use.
- Paid API calls (Claude, OpenAI) happen only when he presses something; no background loops or automatic retries that spend money.
- The Apps Script is deployed by hand, so the app must keep working with older deployed versions. Script changes need `tests/cloudScript.test.ts` updates, and a plain note telling him to redeploy.
- UI text is Traditional Chinese (Taiwan). English is for the learning content itself.

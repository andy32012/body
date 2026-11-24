@AGENTS.md

## Notes for Claude

- He uses the app on a phone. Check screens you changed in the built app at phone width (for example `npx vite preview --port 4173 --strictPort` in the background, then Playwright), not only in tests, and stop the preview server when done.
- Before a large change, read the README section of the feature: many rules there (how answers are judged, what counts as 穩了) are deliberate.
- When you change teaching content, run `npx tsx --test tests/taught.test.ts tests/invariants.test.ts tests/content.test.ts` first; they explain failures in Chinese with the sentence ID.
- Tell him what changed in casual Traditional Chinese, from his side of the screen, and list anything he has to do himself.

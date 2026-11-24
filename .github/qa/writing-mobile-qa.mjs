import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = process.env.GITHUB_WORKSPACE ?? resolve(here, '../..')
const dependencyDir = process.env.WRITING_QA_PLAYWRIGHT_DIR
assert.ok(dependencyDir, 'Set WRITING_QA_PLAYWRIGHT_DIR to the temporary pinned Playwright installation')
const { chromium } = await import(pathToFileURL(resolve(dependencyDir, 'node_modules/playwright/index.mjs')).href)
const playwright = JSON.parse(await readFile(resolve(dependencyDir, 'node_modules/playwright/package.json'), 'utf8')).version
assert.equal(playwright, '1.62.1', 'QA uses the explicit Playwright pin')
const state = JSON.parse(await readFile(resolve(here, 'writing-qa-state.json'), 'utf8'))
const { stages } = JSON.parse(await readFile(resolve(root, 'projects/dream-blueprint/src/data/writing.json'), 'utf8'))
const out = process.env.WRITING_QA_OUT ?? resolve(process.env.RUNNER_TEMP ?? here, 'writing-mobile-qa-results')
const url = process.env.WRITING_QA_URL ?? 'http://127.0.0.1:4173/#library/writing'
await mkdir(out, { recursive: true })
const results = []
const activeCases = new Map()
let browser
let failure

async function openCase(name, fixture) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Taipei', serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors = []
  activeCases.set(name, { page, errors })
  page.on('pageerror', e => errors.push(e.message))
  await context.addInitScript(({ fixture }) => {
    if (!localStorage.getItem('dream-blueprint.v2')) localStorage.setItem('dream-blueprint.v2', JSON.stringify(fixture))
    window.__spoken = []
    Object.defineProperty(window.speechSynthesis, 'speak', { value(utterance) {
      window.__spoken.push({ text: utterance.text, rate: utterance.rate, lang: utterance.lang })
      utterance.onend?.()
    } })
    Object.defineProperty(window.speechSynthesis, 'cancel', { value() {} })
  }, { fixture })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.locator('.wl-stages button').first().waitFor()
  assert.equal(await page.locator('.wl-stages button').count(), 14, name + ': stage count')
  return { context, page, errors }
}

async function assertGrammarOpen(page, expected, label = 'grammar disclosure state') {
  await page.waitForFunction(value => document.querySelector('.wl-grammar')?.open === value, expected, { timeout: 5000 })
  assert.equal(await page.locator('.wl-grammar').evaluate(e => e.open), expected, label)
}

async function geometry(page, label) {
  // React scrolls the selected button in an effect; wait for that specific result,
  // rather than taking a timing-dependent measurement immediately after a click.
  await page.waitForFunction(() => {
    const strip = document.querySelector('.wl-stages')
    const selected = strip?.querySelector('[aria-pressed="true"]')
    if (!strip || !selected) return false
    const a = strip.getBoundingClientRect(), b = selected.getBoundingClientRect()
    return b.left >= a.left - 2 && b.right <= a.right + 2
  })
  const g = await page.evaluate(() => {
    const strip = document.querySelector('.wl-stages')
    const selected = strip.querySelector('[aria-pressed="true"]')
    const a = strip.getBoundingClientRect(), b = selected.getBoundingClientRect()
    return { viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      stripWidth: strip.clientWidth, stripScroll: strip.scrollWidth, stripLeft: strip.scrollLeft,
      selectedVisible: b.left >= a.left - 2 && b.right <= a.right + 2,
      selected: selected.innerText.split('\n')[0], grammarOpen: document.querySelector('.wl-grammar').open }
  })
  assert.ok(g.document <= 390 && g.body <= 390, label + ': document overflow ' + JSON.stringify(g))
  assert.ok(g.stripScroll > g.stripWidth, label + ': horizontally scrollable stages')
  assert.ok(g.selectedVisible, label + ': active stage in view')
  results.push({ label, ...g })
  return g
}

try {
  browser = await chromium.launch({ headless: true })
  const fresh = structuredClone(state)
  fresh.settings.theme = 'dark'
  fresh.settings.speechRate = 0.65
  fresh.settings.periods = []
  const a = await openCase('fresh', fresh)
  assert.match((await a.page.locator('.wl-stages [aria-pressed="true"]').innerText()), /① 一句完整的話/)
  assert.equal(await a.page.locator('.wl-stages button:disabled').count(), 13)
  await assertGrammarOpen(a.page, true)
  assert.equal(await a.page.locator('.wl-grammar .gm-ex li').count(), stages[0].grammar.examples.length)
  await a.page.locator('.wl-grammar .gm-say').first().click()
  const spoken = await a.page.evaluate(() => window.__spoken.at(-1))
  assert.equal(spoken.text, stages[0].grammar.examples[0].en)
  assert.equal(spoken.lang, 'en-US')
  assert.ok(Math.abs(spoken.rate - 0.65) < 1e-6, 'spoken rate matches the preference within browser float precision')
  await geometry(a.page, 'fresh-dark')
  await a.page.locator('.wl-stages').scrollIntoViewIfNeeded()
  await a.page.screenshot({ path: out + '/fresh-dark.png', fullPage: true })
  await a.page.getByRole('button', { name: '切換淺色', exact: true }).click()
  await a.page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await geometry(a.page, 'fresh-light')
  await a.page.locator('.wl-stages').scrollIntoViewIfNeeded()
  await a.page.screenshot({ path: out + '/fresh-light.png', fullPage: true })
  const scroll = await a.page.locator('.wl-stages').evaluate(el => { el.scrollLeft = el.scrollWidth; return el.scrollLeft })
  assert.ok(scroll > 1000, 'stage strip can scroll to the end')
  assert.ok(await a.page.evaluate(() => document.documentElement.scrollWidth <= 390), 'horizontal scrolling stays inside strip')
  await a.page.locator('.wl-stages').evaluate(el => { el.scrollLeft = 0 })
  await a.page.locator('textarea').fill('I am a student. She is a nurse. We are students.')
  await a.page.getByRole('button', { name: '自己對照評分表檢查', exact: true }).click()
  for (const box of await a.page.locator('.wl-self input[type="checkbox"]').all()) await box.check()
  await a.page.getByRole('button', { name: '都做到了，記下來', exact: true }).click()
  await assertGrammarOpen(a.page, false, 'first saved attempt collapses grammar')
  await a.page.reload({ waitUntil: 'networkidle' })
  await assertGrammarOpen(a.page, false, 'saved stage remains collapsed after restart')
  assert.equal(await a.page.locator('textarea').inputValue(), 'I am a student. She is a nurse. We are students.', 'draft survives restart')
  await a.page.locator('.wl-grammar summary').click()
  await assertGrammarOpen(a.page, true, 'grammar can be reopened manually')
  assert.deepEqual(a.errors, [])
  await a.context.close()

  const legacy = structuredClone(fresh)
  delete legacy.notes['migrate.writing-ladder-14']
  legacy.notes['write.s1'] = JSON.stringify({ day: '2026-11-24', words: 30, tries: 1, best: 4 })
  legacy.notes['write.s2'] = JSON.stringify({ day: '2026-11-24', words: 30, tries: 1, best: 4 })
  const b = await openCase('legacy', legacy)
  assert.match(await b.page.locator('.wl-stages [aria-pressed="true"]').innerText(), /⑦ 一段/)
  const saved = await b.page.evaluate(() => JSON.parse(localStorage.getItem('dream-blueprint.v2')))
  assert.equal(saved.notes['write.s1'], legacy.notes['write.s1'])
  assert.equal(saved.notes['write.s2'], legacy.notes['write.s2'])
  await geometry(b.page, 'legacy-paragraph')
  await b.page.locator('.wl-stages').scrollIntoViewIfNeeded()
  await b.page.screenshot({ path: out + '/legacy-paragraph.png', fullPage: true })
  await b.page.locator('.wl-stages button').nth(4).click()
  await assertGrammarOpen(b.page, false, 'legacy attempted stage starts collapsed')
  await b.page.locator('.wl-stages button').first().click()
  await assertGrammarOpen(b.page, true, 'unattempted foundation starts expanded')
  assert.deepEqual(b.errors, [])
  await b.context.close()

  const advanced = structuredClone(fresh)
  advanced.curriculum.unit = 53
  advanced.notes['write.t2a'] = JSON.stringify({ day: '2026-11-24', words: 260, tries: 1, best: 5 })
  const c = await openCase('advanced', advanced)
  assert.match(await c.page.locator('.wl-stages [aria-pressed="true"]').innerText(), /⑬ 雅思 Task 2/)
  assert.equal(await c.page.locator('.wl-stages button:disabled').count(), 0)
  await geometry(c.page, 'advanced-task2')
  const y = await c.page.evaluate(() => scrollY)
  await c.page.locator('.wl-stages button').nth(9).click()
  await assertGrammarOpen(c.page, true)
  assert.ok(await c.page.locator('.wl-task svg').count() > 0, 'number warmup renders chart')
  await geometry(c.page, 'numbers-dark')
  await c.page.locator('.wl-grammar summary').click()
  await c.page.locator('.wl-stages').scrollIntoViewIfNeeded()
  await c.page.screenshot({ path: out + '/numbers-dark.png', fullPage: true })
  await c.page.getByRole('button', { name: '切換淺色', exact: true }).click()
  await c.page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  await geometry(c.page, 'numbers-light')
  await c.page.locator('.wl-stages').scrollIntoViewIfNeeded()
  await c.page.screenshot({ path: out + '/numbers-light.png', fullPage: true })
  for (let i = 0; i < stages.length; i++) {
    await c.page.locator('.wl-stages button').nth(i).click()
    await c.page.waitForFunction(title => document.querySelector('.wl-grammar .gm-explain > h4')?.textContent === title, stages[i].grammar.title, { timeout: 5000 })
    assert.equal(await c.page.locator('.wl-grammar .gm-explain > h4').innerText(), stages[i].grammar.title)
    await geometry(c.page, 'stage-' + stages[i].id)
  }
  results.push({ label: 'speech', verifiedRate: 0.65, observedRate: spoken.rate, firstExample: stages[0].grammar.examples[0].en }, { label: 'runtime-errors', fresh: a.errors, legacy: b.errors, advanced: c.errors }, { label: 'initial-page-scroll', value: y })
  assert.deepEqual(c.errors, [])
  await c.context.close()
} catch (error) {
  failure = { name: error?.name ?? 'Error', message: error?.message ?? String(error) }
  results.push({ label: 'failure', ...failure })
  for (const [name, active] of activeCases) {
    if (active.page.isClosed()) continue
    try {
      await active.page.screenshot({ path: resolve(out, 'failure-' + name + '.png'), fullPage: true, timeout: 5000 })
    } catch (screenshotError) {
      console.error('Failure screenshot unavailable:', name, screenshotError.message)
    }
  }
  throw error
} finally {
  const report = { ok: !failure, playwright, viewport: { width: 390, height: 844 }, cases: results.length,
    speechCheck: 'Mocked speechSynthesis verifies the utterance and setting; it does not test a physical speaker.',
    results }
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  // Keep concise result evidence in the workflow log if artifact download is unavailable.
  console.log(JSON.stringify(report, null, 2))
  await browser?.close()
}

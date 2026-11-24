import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * How the source files depend on each other. A cycle (A imports B, B imports A) makes the load order fragile: one of
 * the two can see the other half-initialised. And the layers stay one-way: pages use components and lib, components
 * use lib, lib never imports screens.
 */
const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const list = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? list(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : [])
const files = new Map(list(src).map(f => [f, readFileSync(f, 'utf8')]))
const rel = (f: string) => path.relative(src, f).split(path.sep).join('/')

function resolve(from: string, spec: string) {
  if (!spec.startsWith('.')) return undefined
  const base = path.normalize(path.join(path.dirname(from), spec))
  return [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts'), path.join(base, 'index.tsx')].find(c => files.has(c))
}

/** Imports that run when a module loads. `import type …` and lists of only `type X` don't; dynamic import() is lazy. */
const typeOnly = /^\{\s*(?:type\s+[\w$]+(?:\s+as\s+[\w$]+)?\s*,?\s*)+\}$/
const graph = new Map<string, Set<string>>()
for (const [file, text] of files) {
  const deps = new Set<string>()
  const add = (spec: string) => { const r = resolve(file, spec); if (r) deps.add(r) }
  for (const m of text.matchAll(/^\s*import\s+(?!type\b)([^'";]*?)\s*from\s*['"]([^'"]+)['"]/gm)) if (!typeOnly.test(m[1].trim())) add(m[2])
  for (const m of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) add(m[1])
  for (const m of text.matchAll(/^\s*export\s+(?!type\b)(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"]+)['"]/gm)) if (!typeOnly.test(m[1].trim())) add(m[2])
  graph.set(file, deps)
}

/** Groups of files that import each other in a circle (Tarjan's strongly connected components). */
function cycles() {
  const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], on = new Set<string>()
  const groups: string[][] = []
  let next = 0
  const visit = (v: string) => {
    index.set(v, next); low.set(v, next); next++
    stack.push(v); on.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v)!, low.get(w)!)) }
      else if (on.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!))
    }
    if (low.get(v) === index.get(v)) {
      const group: string[] = []
      let w: string
      do { w = stack.pop()!; on.delete(w); group.push(rel(w)) } while (w !== v)
      if (group.length > 1 || graph.get(v)?.has(v)) groups.push(group.sort())
    }
  }
  for (const v of graph.keys()) if (!index.has(v)) visit(v)
  return groups
}

test('程式檔之間沒有互相 import 的圈圈', () => {
  assert.ok(files.size > 100 && [...graph.values()].reduce((n, d) => n + d.size, 0) > 300, '真的有讀到程式檔和它們的 import')
  assert.deepEqual(cycles(), [])
})

test('分層是單向的：lib 不 import 畫面，components 不 import pages', () => {
  const layer = (f: string) => rel(f).split('/')[0]
  const wrong = [...graph].flatMap(([f, deps]) => [...deps].filter(d =>
    (layer(f) === 'lib' && ['components', 'pages'].includes(layer(d))) || (layer(f) === 'components' && layer(d) === 'pages'),
  ).map(d => rel(f) + ' → ' + rel(d)))
  assert.deepEqual(wrong, [])
})

test('檢查本身：抓得到圈圈和型別 import 的差別', () => {
  assert.ok(typeOnly.test('{ type A, type B as C }') && !typeOnly.test('{ type A, b }') && !typeOnly.test('{ a }'))
  const practice = graph.get(path.join(src, 'pages/Practice.tsx'))!
  assert.ok(practice.has(path.join(src, 'components/Translation.tsx')) && practice.has(path.join(src, 'lib/todayLesson.ts')))
})

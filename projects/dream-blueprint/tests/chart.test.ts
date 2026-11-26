import test from 'node:test'
import assert from 'node:assert/strict'
import { chartBounds } from '../src/lib/chart.ts'
import writing from '../src/data/writing.json' with { type: 'json' }

test('數值持平時仍有上下留白、三個不同刻度及有限座標', () => {
  for (const value of [140, 0, -20]) {
    const { lo, hi } = chartBounds([value, value, value])
    assert.ok(Number.isFinite(lo) && Number.isFinite(hi))
    assert.ok(lo < value && value < hi, '持平線要在上下界之間：' + value)
    assert.equal(new Set([lo, (lo + hi) / 2, hi]).size, 3)
    const position = (value - lo) / (hi - lo)
    assert.ok(Number.isFinite(position) && position > 0 && position < 1)
  }
})

test('有升降的圖表保留原本範圍', () => {
  assert.deepEqual(chartBounds([20, 40, 60]), { lo: 10, hi: 70 })
  assert.deepEqual(chartBounds([38, 34, 32]), { lo: 30, hi: 40 })
  assert.deepEqual(chartBounds([0, 10, 20]), { lo: -5, hi: 25 })
})

test('全部數字暖身與 Task 1 真實題目都能畫出不同刻度及有效位置', () => {
  let flatCharts = 0
  for (const stage of writing.stages.filter(s => s.id === 'numbers' || s.id === 'task1')) {
    for (const task of stage.tasks) {
      assert.ok('chart' in task && task.chart, task.id + ' 有圖表')
      const values = task.chart.points.map(p => p.value)
      const { lo, hi } = chartBounds(values)
      assert.ok(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi, task.id)
      assert.equal(new Set([lo, (lo + hi) / 2, hi]).size, 3, task.id + ' 刻度不重複')
      for (const value of values) {
        const position = (value - lo) / (hi - lo)
        assert.ok(Number.isFinite(position) && position > 0 && position < 1, task.id + ' 點在圖內')
      }
      if (new Set(values).size === 1) flatCharts++
    }
  }
  assert.ok(flatCharts > 0, '包含原先上下界相同的持平題目')
})

test('寫作 Task 1 的圖：時間（月份、星期）畫成折線，不同中心 A–F 畫成長條（比較，不是走勢）', async () => {
  const { isTimeSeries } = await import('../src/lib/chart.ts')
  assert.equal(isTimeSeries(['Jan', 'Feb', 'Mar']), true)
  assert.equal(isTimeSeries(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']), true)
  assert.equal(isTimeSeries(['2020', '2021', '2022']), true)
  assert.equal(isTimeSeries(['A', 'B', 'C', 'D', 'E', 'F']), false)
  assert.equal(isTimeSeries(['Ward 1', 'ICU', 'ER']), false)
  const writing = (await import('../src/data/writing.json', { with: { type: 'json' } })).default
  const charts: { title: string; points: { label: string }[] }[] = []
  const walk = (o: unknown): void => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { const r = o as Record<string, unknown>; if (r.chart) charts.push(r.chart as typeof charts[number]); Object.values(r).forEach(walk) } }
  walk(writing)
  const centres = charts.filter(c => c.points.every(p => /^[A-F]$/.test(p.label)))
  assert.ok(centres.length > 0 && centres.every(c => !isTimeSeries(c.points.map(p => p.label))), '中心比較的圖都畫成長條')
})

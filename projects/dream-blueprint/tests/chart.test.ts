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

/** Bounds for the small teaching charts. Keep the existing scale for changing data;
 *  a flat series still needs room above and below it so the three axis ticks differ. */
export function chartBounds(values: readonly number[]): { lo: number; hi: number } {
  const min = Math.min(...values), max = Math.max(...values)
  const padding = max === min ? 1 : (max - min) * 0.25
  return {
    lo: Math.floor((min - padding) / 5) * 5,
    hi: Math.ceil((max + padding) / 5) * 5,
  }
}

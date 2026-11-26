/** Stable, compact identity for older saved records that did not have an ID. */
export function legacyRecordId(value: string) {
  let hash = 0xcbf29ce484222325n
  for (let i = 0; i < value.length; i++) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(i))) * 0x100000001b3n)
  }
  return 'legacy-' + hash.toString(36)
}

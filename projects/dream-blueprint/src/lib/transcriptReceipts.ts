// Older Apps Script deployments cannot recognize repeat uploads. Keep only the upload identity across browser tabs.
type Receipt = { state: 'sending'; token: string; until: number } | { state: 'confirmed' | 'uncertain' }
let database: Promise<IDBDatabase> | undefined

function openReceipts() {
  if (!database) database = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('dream-blueprint-transcript-receipts', 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore('receipts')
    request.onblocked = () => { blocked = true; reject(new Error('無法開啟逐字稿送達紀錄。')) }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      db.onversionchange = () => { db.close(); database = undefined }
      db.onclose = () => { database = undefined }
      resolve(db)
    }
  }).catch(error => { database = undefined; throw error })
  return database
}

async function editReceipt<T>(id: string, edit: (receipt: Receipt | undefined) => { result: T; next?: Receipt | null }) {
  const db = await openReceipts()
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction('receipts', 'readwrite')
    const receipts = transaction.objectStore('receipts')
    const request = receipts.get(id)
    let result: T
    request.onsuccess = () => {
      const change = edit(request.result)
      result = change.result
      if (change.next === null) receipts.delete(id)
      else if (change.next) receipts.put(change.next, id)
    }
    transaction.oncomplete = () => resolve(result)
    transaction.onabort = () => reject(transaction.error ?? new Error('無法保存逐字稿送達紀錄。'))
  })
}

export function claimLegacyTranscript(id: string, token: string, confirmed: boolean) {
  return editReceipt<'send' | 'delivered' | 'wait' | 'hold'>(id, current => {
    if (current?.state === 'confirmed') return { result: 'delivered' }
    if (current?.state === 'sending' && current.until > Date.now()) return { result: 'wait' }
    if (current && !confirmed) return { result: 'hold' }
    return { result: 'send', next: { state: 'sending', token, until: Date.now() + 60_000 } }
  })
}

export function legacyTranscriptStatus(id: string) {
  return editReceipt(id, current => ({ result: current?.state === 'sending' && current.until <= Date.now()
    ? 'uncertain' as const : current?.state }))
}

// A known preflight cancellation made no request. A lost reply after sending requires explicit confirmation.
export function finishLegacyTranscript(id: string, token: string, state: 'confirmed' | 'uncertain' | null) {
  return editReceipt(id, current => ({
    result: undefined,
    next: current?.state === 'sending' && current.token === token ? (state ? { state } : null) : undefined,
  }))
}

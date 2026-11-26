export const backgroundPinPrefix = 'cosmos.pin.'

type BackgroundPin = { photoId: string | null; changedAt: number }

function readPin(value: string): BackgroundPin {
  if (value.startsWith('{')) {
    try {
      const pin = JSON.parse(value) as Partial<BackgroundPin> | null
      if (pin) {
        const { photoId, changedAt } = pin
        if ((photoId === null || (typeof photoId === 'string' && photoId.length > 0)) &&
            typeof changedAt === 'number' && Number.isSafeInteger(changedAt) && changedAt > 0) return { photoId, changedAt }
      }
    } catch { /* An invalid record can be replaced by the next choice. */ }
    return { photoId: null, changedAt: 0 }
  }
  // Existing backups use the photo ID alone.
  return { photoId: value || null, changedAt: 0 }
}

export function readBackgroundPin(notes: Record<string, string>, page: string): string | undefined {
  return readPin(notes[backgroundPinPrefix + page] ?? '').photoId ?? undefined
}

export function setBackgroundPin(notes: Record<string, string>, page: string, photoId: string | null): Record<string, string> {
  const key = backgroundPinPrefix + page
  const changedAt = Math.max(Date.now(), readPin(notes[key] ?? '').changedAt + 1)
  // A saved null choice carries the removal to devices that still have the old pin.
  return { ...notes, [key]: JSON.stringify({ photoId, changedAt }) }
}

export function mergeBackgroundPin(older: string, newer: string): string {
  const before = readPin(older), after = readPin(newer)
  if (before.changedAt !== after.changedAt) return before.changedAt > after.changedAt ? older : newer
  if (!before.changedAt) return newer
  // Resolve simultaneous changes consistently on both devices. Clearing wins a tie.
  return (before.photoId ?? '') <= (after.photoId ?? '') ? older : newer
}

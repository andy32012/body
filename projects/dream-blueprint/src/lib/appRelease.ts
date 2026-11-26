/** The release stamped on the loaded document, even when another release controls its requests. */
export function appRelease() {
  if (typeof document !== 'undefined') return document.querySelector<HTMLMetaElement>('meta[name="dream-release"]')?.content
}

export function withAppRelease(url: string) {
  const version = appRelease()
  return version ? url + '?release=' + encodeURIComponent(version) : url
}

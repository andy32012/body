import { useEffect, useRef, type RefObject } from 'react'

/** Open dialogs, top one last: Escape and Tab only act on the top one, so 今日單字 → 問問 Claude closes one layer at a time. */
const stack: HTMLElement[] = []

const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const focusables = (box: HTMLElement) => Array.from(box.querySelectorAll<HTMLElement>(selector)).filter(el => el.getClientRects().length > 0)

/** A modal dialog: everything else goes inert while it is open, focus moves in and Tab stays inside, Escape closes
 *  only the top dialog, and focus goes back to what opened it (or to `fallback` when it opened by itself). */
export function useModal(ref: RefObject<HTMLElement | null>, onClose: () => void,
  options: { initial?: () => HTMLElement | null | undefined; fallback?: () => HTMLElement | null | undefined } = {}) {
  const close = useRef(onClose)
  close.current = onClose
  const opts = useRef(options)
  opts.current = options
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const active = document.activeElement
    const opener = active instanceof HTMLElement && active !== document.body ? active : null
    // Siblings along the path up to <body> go inert, so a screen reader and the keyboard stay in the dialog.
    const touched: [HTMLElement, boolean][] = []
    for (let node: HTMLElement | null = box; node && node !== document.body && node.parentElement; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib === node || !(sib instanceof HTMLElement) || sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue
        touched.push([sib, sib.inert])
        sib.inert = true
      }
    }
    stack.push(box)
    ;(opts.current.initial?.() ?? box).focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== box) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab') return
      const items = focusables(box)
      if (!items.length) { e.preventDefault(); box.focus(); return }
      const at = items.indexOf(document.activeElement as HTMLElement)
      const inside = box.contains(document.activeElement)
      if (e.shiftKey ? at <= 0 : at === items.length - 1 || !inside) {
        e.preventDefault()
        items[e.shiftKey ? items.length - 1 : 0].focus()
      }
    }
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      const i = stack.lastIndexOf(box)
      if (i >= 0) stack.splice(i, 1)
      for (const [el, was] of touched.reverse()) el.inert = was
      const back = opener?.isConnected ? opener : opts.current.fallback?.()
      back?.focus({ preventScroll: true })
    }
  }, [ref])
}

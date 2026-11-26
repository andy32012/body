import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Smartphone } from 'lucide-react'
import { setTutorKey, setTutorModel, tutorKey, tutorModel } from '../lib/tutor'
import { openaiKey, setOpenaiKey } from '../lib/voice'
import { normalizePairCode, open, pairDurationMs, pairEvent, pairPrefix, pairingLinkError, payloadFrom, randomCode, seal } from '../lib/pairing'
import { useModal } from '../lib/modal'
import './pair.css'

type PairOffer = { qr: string; code: string; link: string; until: number; copyStatus?: string }
const linkErrors = {
  legacy: '這是舊版配對連結。請更新兩台裝置的夢想藍圖，在電腦重新產生 QR code。',
  broken: '讀不到這個配對連結，請在電腦重新產生 QR code。',
}

/** The sending device shows the QR code and the separately generated secret. */
export function PairSend() {
  const [offer, setOffer] = useState<PairOffer | null>(null)
  const [now, setNow] = useState(Date.now)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const link = offer?.link, until = offer?.until
  useEffect(() => {
    if (!link || !until) return
    const interval = window.setInterval(() => {
      const time = Date.now()
      setNow(time)
      if (time >= until) setOffer(current => current?.link === link ? null : current)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [link, until])
  if (!tutorKey()) return null

  async function make() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const issued = Date.now()
      const code = randomCode()
      const payload = await seal({ claude: tutorKey(), openai: openaiKey() || undefined, model: tutorModel() }, code, issued)
      // The query triggers a full navigation on Safari; the encrypted payload stays in the fragment.
      const link = location.origin + location.pathname + '?pair=1' + pairPrefix + payload
      const qr = await QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'L' })
      const time = Date.now()
      const until = issued + pairDurationMs
      if (time >= until) throw new Error('配對逾時')
      setNow(time)
      setOffer({ qr, code, link, until })
    } catch {
      setError('目前無法產生配對 QR code。請重新整理後再試。')
    } finally {
      setBusy(false)
    }
  }
  async function copyLink(link: string, until: number) {
    if (Date.now() >= until) return
    let copyStatus: string
    try {
      await navigator.clipboard.writeText(link)
      copyStatus = '已複製連結。只在自己的裝置上貼上，配對密語請在原畫面查看。'
    } catch {
      copyStatus = '複製不了，請用相機掃描 QR code。'
    }
    setOffer(current => current?.link === link ? { ...current, copyStatus } : current)
  }

  const seconds = offer ? Math.max(0, Math.ceil((offer.until - now) / 1000)) : 0
  return <div className="pair">
    <strong><Smartphone size={15} aria-hidden="true" /> 讓 iPad、手機也能用</strong>
    <p>用自己的另一台裝置掃 QR code，再輸入這個畫面上的配對密語。</p>
    {!offer ? <button type="button" disabled={busy} onClick={make}>{busy ? '產生中……' : '產生配對 QR code'}</button> : <>
      <img className="pair-qr" src={offer.qr} alt="配對用 QR code，用另一台裝置的相機掃描" width={240} height={240} />
      <div className="pair-code">配對密語
        <b lang="en">{offer.code.match(/.{1,5}/g)?.join(' ')}</b>
      </div>
      <small>網站接收配對的剩餘時間 {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}。已保存的連結在倒數結束後仍可用密語解密，請分開保管。</small>
      <small>若連結和密語都已外流，請到金鑰服務商停用原金鑰。</small>
      <div className="set-actions">
        <button type="button" onClick={() => void copyLink(offer.link, offer.until)}>複製連結</button>
        <button type="button" onClick={() => setOffer(null)}>關掉</button>
      </div>
      {offer.copyStatus && <small role="status">{offer.copyStatus}</small>}
    </>}
    {error && <small role="alert">{error}</small>}
  </div>
}

/** On the iPad: opened from the QR link; type the code and the keys are saved here. */
export function PairReceive({ payload, onDone }: { payload: string; onDone: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const [voice, setVoice] = useState(false)
  const veil = useRef<HTMLDivElement>(null)
  const attempt = useRef<AbortController | null>(null)
  const linkError = useMemo(() => pairingLinkError(payload), [payload])
  const acceptedCode = normalizePairCode(code)
  useLayoutEffect(() => () => {
    attempt.current?.abort()
    attempt.current = null
  }, [payload])

  function close() {
    attempt.current?.abort()
    attempt.current = null
    onDone()
  }
  useModal(veil, close, {
    initial: () => veil.current?.querySelector('input') ?? veil.current?.querySelector('button'),
    fallback: () => document.getElementById('content'),
  })

  async function submit() {
    if (attempt.current || !acceptedCode || linkError || ok) return
    const operation = new AbortController()
    attempt.current = operation
    setBusy(true)
    setMsg('')
    const r = await open(payload, acceptedCode)
    if (operation.signal.aborted || attempt.current !== operation) return
    attempt.current = null
    setBusy(false)
    if (!r.ok) {
      setMsg(r.reason === 'code' ? '配對密語不符，請核對電腦的畫面。'
        : r.reason === 'expired' ? '此配對頁面的接收時間已過，請在電腦重新產生 QR code。'
        : linkErrors[r.reason])
      return
    }
    setTutorKey(r.keys.claude)
    if (r.keys.model) setTutorModel(r.keys.model)
    if (r.keys.openai) setOpenaiKey(r.keys.openai)
    setVoice(Boolean(openaiKey()))
    setCode('')
    window.dispatchEvent(new Event('dream-blueprint:keys'))
    setOk(true)
  }
  return <div className="pair-veil" ref={veil} role="dialog" aria-modal="true" aria-labelledby="pair-title">
    <form className="pair-box" onSubmit={e => { e.preventDefault(); void submit() }}>
      <h2 id="pair-title">{ok ? '這台也連上 Claude 了 ✓' : '連接這台裝置'}</h2>
      {ok ? <p>{voice ? '這台裝置已儲存 Claude 和 OpenAI 的金鑰。' : '這台裝置已儲存 Claude 金鑰。口說用的 OpenAI 金鑰可以另外在口說頁設定。'}</p>
        : linkError ? <p className="pair-err" role="alert">{linkErrors[linkError]}</p> : <>
          <p>輸入電腦畫面上的 26 位配對密語，空格可省略。連接後會更新這台裝置上相同服務的金鑰。</p>
          <input autoComplete="off" spellCheck={false} autoCapitalize="characters" maxLength={36}
            value={code} readOnly={busy} onChange={e => setCode(e.target.value)} aria-label="配對密語" />
          {msg && <p className="pair-err" role="alert">{msg}</p>}
        </>}
      <div className="set-actions">
        {ok ? <button type="button" onClick={close} autoFocus>開始用</button> : <>
          {!linkError && <button type="submit" disabled={busy || !acceptedCode}>{busy ? '解鎖中……' : '連接'}</button>}
          <button type="button" onClick={close}>{linkError ? '關閉' : '取消'}</button>
        </>}
      </div>
    </form>
  </div>
}

/** On a device without a key: paste the link sent from the computer (works in the home-screen app too). */
export function PairPaste({ need = 'claude' }: { need?: 'claude' | 'voice' }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  if (need === 'claude' ? tutorKey() : openaiKey()) return null
  return <div className="pair">
    <strong><Smartphone size={15} aria-hidden="true" /> 從電腦連過來</strong>
    <p>{need === 'voice' ? '在電腦打開「設定 → 連接 Claude」，用這台裝置掃描配對 QR code。電腦上有存口說的 OpenAI 金鑰就會一併帶過來。掃描沒反應時，可以把配對連結貼在這裡。'
      : '掃 QR code 沒反應，或使用主畫面的 App 時，可以把配對連結貼在這裡。'}</p>
    <label className="set-field">配對連結<input value={text} autoComplete="off" spellCheck={false} onChange={e => { setText(e.target.value); setMsg('') }} placeholder="https://xitian.page/dream/#pair=…" /></label>
    <div className="set-actions"><button type="button" disabled={!text.trim()} onClick={() => {
      const p = payloadFrom(text)
      if (!p) { setMsg('這不是配對連結，請整段貼上。'); return }
      window.dispatchEvent(new CustomEvent(pairEvent, { detail: p })); setText('')
    }}>下一步：輸入配對密語</button></div>
    {msg && <small role="alert">{msg}</small>}
  </div>
}

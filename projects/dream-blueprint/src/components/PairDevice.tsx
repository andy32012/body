import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Smartphone } from 'lucide-react'
import { setTutorKey, setTutorModel, tutorKey, tutorModel } from '../lib/tutor'
import { openaiKey, setOpenaiKey } from '../lib/voice'
import { open, pairEvent, pairPrefix, payloadFrom, randomCode, seal } from '../lib/pairing'
import { useModal } from '../lib/modal'
import './pair.css'

/** On the computer: a QR code + 6-digit code that carries the keys to an iPad or phone. */
export function PairSend() {
  const [qr, setQr] = useState('')
  const [code, setCode] = useState('')
  const [until, setUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [copied, setCopied] = useState('')
  const [link, setLink] = useState('')
  useEffect(() => { if (!until) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [until])
  if (!tutorKey()) return null
  async function make() {
    const c = randomCode()
    const payload = await seal({ claude: tutorKey(), openai: openaiKey() || undefined, model: tutorModel() }, c)
    // ?pair=1 makes Safari load the page fresh even when the site is already open in a tab (a link that only
    // differs after # would just jump inside the old page). The keys stay after #, which is never sent to the server.
    const url = location.origin + location.pathname + '?pair=1' + pairPrefix + payload
    setLink(url); setCode(c); setUntil(Date.now() + 10 * 60 * 1000); setCopied('')
    setQr(await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'L' }))
  }
  const left = until - now
  if (until && left <= 0 && qr) { setQr(''); setCode(''); setLink(''); setUntil(0) }
  return <div className="pair">
    <strong><Smartphone size={15} aria-hidden="true" /> 讓 iPad、手機也能用</strong>
    <p>金鑰只存在每台裝置自己的瀏覽器，所以 iPad 要另外連一次。按下面的按鈕，用 iPad 的相機掃 QR code，再輸入 6 位數配對碼就好，不用再貼金鑰。</p>
    {!qr ? <button type="button" onClick={make}>產生配對 QR code</button> : <>
      <img className="pair-qr" src={qr} alt="配對用 QR code，用 iPad 相機掃描" width={240} height={240} />
      <p className="pair-code">配對碼：<b>{code.slice(0, 3)} {code.slice(3)}</b></p>
      <small>還有 {Math.floor(left / 60000)}:{String(Math.floor(left / 1000) % 60).padStart(2, '0')} 有效。QR code 裡的金鑰是用配對碼加密的，沒有配對碼打不開；過期就失效。</small>
      <div className="set-actions">
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied('已複製連結，用 LINE 傳給自己的 iPad 也可以（配對碼要另外看這裡）') } catch { setCopied('複製不了，請用掃的') } }}>複製連結</button>
        <button type="button" onClick={() => { setQr(''); setCode(''); setLink(''); setUntil(0) }}>關掉</button>
      </div>
      {copied && <small role="status">{copied}</small>}
    </>}
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
  // Escape is 取消; focus starts in the code box and the rest of the page waits behind the dialog.
  useModal(veil, onDone, { initial: () => veil.current?.querySelector('input') ?? null, fallback: () => document.getElementById('content') })
  async function submit() {
    setBusy(true); setMsg('')
    const r = await open(payload, code.replace(/\D/g, ''))
    setBusy(false)
    if (!r.ok) { setMsg(r.reason === 'code' ? '配對碼不對，再看一次電腦上的 6 位數。' : r.reason === 'expired' ? '這個 QR code 過期了（超過 10 分鐘），在電腦上重新產生一個。' : '連結壞掉了，在電腦上重新產生一個。'); return }
    setTutorKey(r.keys.claude)
    if (r.keys.model) setTutorModel(r.keys.model)
    if (r.keys.openai) { setOpenaiKey(r.keys.openai); setVoice(true) }
    window.dispatchEvent(new Event('dream-blueprint:keys'))
    setOk(true)
  }
  return <div className="pair-veil" ref={veil} role="dialog" aria-modal="true" aria-labelledby="pair-title">
    <form className="pair-box" onSubmit={e => { e.preventDefault(); if (!ok) void submit() }}>
      <h2 id="pair-title">{ok ? '這台也連上 Claude 了 ✓' : '連接這台裝置'}</h2>
      {ok ? <p>{voice ? '問問 Claude、批改和英文口說在這台都能用了。' : '問問 Claude 和批改在這台能用了。電腦上還沒存 OpenAI 金鑰，所以口說要另外在口說頁貼。'}金鑰只存在這台的瀏覽器裡。</p> : <>
        <p>輸入電腦畫面上的 6 位數配對碼。</p>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={e => setCode(e.target.value)} placeholder="000 000" aria-label="配對碼" />
        {msg && <p className="pair-err" role="alert">{msg}</p>}
      </>}
      <div className="set-actions">
        {ok ? <button type="button" onClick={onDone} autoFocus>開始用</button> : <>
          <button type="submit" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? '解鎖中……' : '連接'}</button>
          <button type="button" onClick={onDone}>取消</button>
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
    <p>{need === 'voice' ? '不用再貼一次 OpenAI 金鑰：在電腦打開 設定 → 連接 Claude，按「產生配對 QR code」，用這台的相機掃，Claude 和口說的金鑰會一起過來。掃了沒反應的話，在電腦按「複製連結」，用 LINE 傳給自己，貼在這裡。'
      : '掃 QR code 沒反應，或你是用加到主畫面的 App 開的？在電腦按「複製連結」，用 LINE 傳給自己，再把連結貼在這裡。'}</p>
    <label className="set-field">配對連結<input value={text} autoComplete="off" spellCheck={false} onChange={e => { setText(e.target.value); setMsg('') }} placeholder="https://xitian.page/dream/#pair=…" /></label>
    <div className="set-actions"><button type="button" disabled={!text.trim()} onClick={() => {
      const p = payloadFrom(text)
      if (!p) { setMsg('這不是配對連結，請整段貼上。'); return }
      window.dispatchEvent(new CustomEvent(pairEvent, { detail: p })); setText('')
    }}>下一步：輸入配對碼</button></div>
    {msg && <small role="alert">{msg}</small>}
  </div>
}

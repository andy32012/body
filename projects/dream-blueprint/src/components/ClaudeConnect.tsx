import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { PairPaste, PairSend } from './PairDevice'
import { pairKeysEvent, type PairedFields } from '../lib/pairing'
import { askTutor, isTutorCredentialStorageKey, personas, setTutorKey, setTutorModel, setTutorPersona, tutorKey, tutorModel, tutorModels, tutorPersona } from '../lib/tutor'

const readCredentials = () => ({ key: tutorKey(), model: tutorModel() })
type Credentials = ReturnType<typeof readCredentials>
const sameCredentials = (a: Credentials, b: Credentials) => a.key === b.key && a.model === b.model

export default function ClaudeConnect() {
  const [form, setForm] = useState(() => { const base = readCredentials(); return { ...base, base } })
  const [persona, setPersona] = useState(tutorPersona)
  const [status, setStatus] = useState(() => tutorKey() ? '這台裝置已有 Claude 金鑰。' : '')
  const probe = useRef<AbortController | null>(null)
  const { key, model, base } = form
  const observed = useRef(base)

  const cancelProbe = useCallback(() => {
    probe.current?.abort()
    probe.current = null
  }, [])

  const refresh = useCallback((current: Credentials, fields?: PairedFields) => {
    cancelProbe()
    observed.current = current
    setForm(previous => ({
      base: current,
      key: fields?.claude || current.key !== previous.base.key ? current.key : previous.key,
      model: fields?.model || current.model !== previous.base.model ? current.model : previous.model,
    }))
    setStatus(current.key ? '這台裝置的 Claude 設定已更新，可以重新確認連線。' : '這台裝置目前沒有 Claude 金鑰。')
  }, [cancelProbe])

  useLayoutEffect(() => {
    const receivePairing = (event: Event) => {
      const fields = (event as CustomEvent<PairedFields>).detail
      const current = readCredentials()
      if (fields?.claude || fields?.model || !sameCredentials(current, observed.current)) refresh(current, fields)
    }
    const receiveStorage = (event: StorageEvent) => {
      if (!isTutorCredentialStorageKey(event.key)) return
      const current = readCredentials()
      if (!sameCredentials(current, observed.current)) refresh(current)
    }
    window.addEventListener(pairKeysEvent, receivePairing)
    window.addEventListener('storage', receiveStorage)
    return () => {
      window.removeEventListener(pairKeysEvent, receivePairing)
      window.removeEventListener('storage', receiveStorage)
      cancelProbe()
    }
  }, [cancelProbe, refresh])

  function edit(field: keyof Credentials, value: string) {
    cancelProbe()
    setForm(previous => ({ ...previous, [field]: value }))
    setStatus('')
  }

  async function save() {
    if (probe.current) return
    const before = readCredentials()
    if (!sameCredentials(before, base)) { refresh(before); return }
    const requested = { key: key.trim(), model }
    const keySaved = setTutorKey(requested.key)
    const modelSaved = keySaved && setTutorModel(requested.model)
    setTutorPersona(persona)
    const actual = readCredentials()
    observed.current = actual
    setForm({ ...requested, base: actual })
    if (!keySaved || actual.key !== requested.key) {
      setStatus('無法確認 Claude 金鑰已儲存，請檢查瀏覽器的儲存設定後再試。')
      return
    }
    if (!modelSaved || actual.model !== requested.model) {
      setStatus('金鑰已儲存，但無法確認模型已更新，請再儲存一次。')
      return
    }
    if (!actual.key) { setStatus('已清除金鑰。'); return }
    const controller = new AbortController()
    probe.current = controller
    setStatus('測試中……')
    function finish(message: string) {
      if (probe.current !== controller) return
      probe.current = null
      const current = readCredentials()
      if (!sameCredentials(current, actual)) { refresh(current); return }
      setStatus(message)
    }
    try {
      const reply = await askTutor('只回一個字：好', [{ role: 'user', content: '測試' }], controller.signal)
      // Connected means Claude really wrote something back: an empty reply is a failed test, not 連接成功.
      finish(reply.trim() ? '連接成功。之後中翻英、寫作和短文都可以按「請 Claude 批改」，照官方評分表給分。'
        : '金鑰收到了，但 Claude 這次沒有回任何文字，還不算連接成功。等一下再按一次「儲存並測試」；一直這樣的話換一個模型試試。')
    } catch (e) {
      const message = e instanceof Error ? e.message : '連線失敗，請再試一次。'
      finish(message.split(actual.key).join('…'))
    }
  }
  return <>
    <p>貼上你在 console.anthropic.com 建立的 API 金鑰，中翻英寫完就能讓 Claude 照你的教法批改、分層提示、回答問題。</p>
    <p>金鑰只存在這台裝置的瀏覽器裡，不會進備份檔，也不會上傳到網站。建議在 Console 另外開一把專用金鑰，並設每月花費上限；手機掉了就去 Console 把它停用。</p>
    <label className="set-field">API 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => edit('key', e.target.value)} placeholder="sk-ant-..." /></label>
    <label className="set-field">模型<select value={model} onChange={e => edit('model', e.target.value)}>
      {tutorModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select></label>
    <label className="set-field">「問問 Claude」的身分<select value={persona} onChange={e => { setPersona(e.target.value); setTutorPersona(e.target.value) }}>
      {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <div className="set-actions"><button type="button" onClick={() => void save()}>儲存並測試</button></div>
    <small role="status">{status}</small>
    <PairSend />
    <PairPaste />
  </>
}

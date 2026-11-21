import { useState } from 'react'
import { askTutor, personas, setTutorKey, setTutorModel, setTutorPersona, tutorKey, tutorModel, tutorModels, tutorPersona } from '../lib/tutor'

export default function ClaudeConnect() {
  const [key, setKey] = useState(tutorKey())
  const [model, setModel] = useState(tutorModel())
  const [persona, setPersona] = useState(tutorPersona())
  const [status, setStatus] = useState(tutorKey() ? '已連接。' : '')
  async function save() {
    setTutorKey(key); setTutorModel(model); setTutorPersona(persona)
    if (!key.trim()) { setStatus('已清除金鑰。'); return }
    setStatus('測試中……')
    try {
      const reply = await askTutor('只回一個字：好', [{ role: 'user', content: '測試' }])
      setStatus('連接成功（' + reply.slice(0, 20) + '）。之後中翻英按「我寫好了」，就會出現「請老師批改」。')
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)) }
  }
  return <>
    <p>貼上你在 console.anthropic.com 建立的 API 金鑰，中翻英寫完就能讓 Claude 照你的教法批改、分層提示、回答問題。</p>
    <p>金鑰只存在這台裝置的瀏覽器裡，不會進備份檔，也不會上傳到網站。建議在 Console 另外開一把專用金鑰，並設每月花費上限；手機掉了就去 Console 把它停用。</p>
    <label className="set-field">API 金鑰<input type="password" autoComplete="off" spellCheck={false} value={key} onChange={e => setKey(e.target.value)} placeholder="sk-ant-..." /></label>
    <label className="set-field">模型<select value={model} onChange={e => setModel(e.target.value)}>
      {tutorModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select></label>
    <label className="set-field">「問問 Claude」的身分<select value={persona} onChange={e => { setPersona(e.target.value); setTutorPersona(e.target.value) }}>
      {personas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>
    <div className="set-actions"><button type="button" onClick={save}>儲存並測試</button></div>
    <small role="status">{status}</small>
  </>
}

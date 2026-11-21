import { useMemory } from '../lib/memory'

export default function MemoryPanel() {
  const { notes, remove, clear } = useMemory()
  return <>
    <p>你在「問問 Claude」或英文口說裡講到重要的事，她會自己記在這裡，之後每次聊天都會先看過。不想讓她記得的，按「刪掉」就好。</p>
    <p>記憶存在網站的進度裡，所以「備份與還原」的備份檔也會帶著它，換手機還原就會回來。</p>
    {notes.length ? <div className="set-list">
      {notes.map((n, i) => <div key={i + n}><span>{n}</span><button type="button" onClick={() => remove(i)}>刪掉</button></div>)}
    </div> : <p>目前還沒有記住任何事。</p>}
    {notes.length > 0 && <div className="set-actions"><button type="button" onClick={() => clear()}>全部清空</button></div>}
  </>
}

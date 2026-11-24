import { useEffect, useState } from 'react'
import { ALERTS, CLAUDE_CAP, LIVE_PER_MINUTE, monthKey, readUsage, type UsageBook } from '../lib/usage'

/** This month's estimated spending on this device: Claude (from the token counts of each reply) and the live voice
 *  (from connected minutes). The real bills are in the Claude Console and the OpenAI dashboard. */
export default function UsagePanel() {
  const [book, setBook] = useState<UsageBook>(() => readUsage())
  useEffect(() => {
    const on = () => setBook(readUsage())
    window.addEventListener('dream-usage', on)
    window.addEventListener('focus', on)
    return () => { window.removeEventListener('dream-usage', on); window.removeEventListener('focus', on) }
  }, [])
  const month = monthKey()
  const m = book[month]
  const claude = m?.claude.usd ?? 0
  const minutes = (m?.live.ms ?? 0) / 60000
  const pct = Math.min(100, claude / CLAUDE_CAP * 100)
  return <div className="usage">
    <p className="usage-row"><b>Claude（{month}）</b><span>約 US${claude.toFixed(2)} / {CLAUDE_CAP}</span></p>
    <div className="usage-bar" role="progressbar" aria-valuemin={0} aria-valuemax={CLAUDE_CAP} aria-valuenow={Math.round(claude)} aria-label="Claude 本月用量">
      <i style={{ width: pct + '%' }} data-level={claude >= ALERTS[1] ? 'high' : claude >= ALERTS[0] ? 'mid' : 'low'} />
    </div>
    <small>{m ? m.claude.calls + ' 次 · 輸入 ' + m.claude.input.toLocaleString() + '、輸出 ' + m.claude.output.toLocaleString() + ' tokens' : '這個月這台裝置還沒用過 Claude。'}超過 US${ALERTS[0]}、US${ALERTS[1]} 時各提醒一次。</small>
    <p className="usage-row"><b>OpenAI 語音（Emma）</b><span>約 {minutes.toFixed(1)} 分鐘 · US${(m?.live.usd ?? 0).toFixed(2)}</span></p>
    <small>OpenAI 另外算，不在 Claude 的 US${CLAUDE_CAP} 裡。通話中每分鐘約 US${LIVE_PER_MINUTE}，不說話也在計費；錄音轉文字沒算進來（很少）。</small>
    <small>這是這台裝置自己算的估計，別台裝置用的不會加進來；實際帳單以 Claude Console 和 OpenAI 後台為準。Claude 的硬上限要在 Console 設，這裡只提醒。</small>
  </div>
}

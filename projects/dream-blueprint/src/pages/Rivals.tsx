import { useEffect, useState } from 'react';
import type { PageProps } from '../lib/store';
import { raceBoard, rivalLine, type Situation } from '../lib/rivals';
import { addDays } from '../lib/progress';

function RivalVoice({ id, intensity, situation, signature }: { id:string; intensity:'gentle'|'bold'; situation:Situation; signature:string }) {
  const [line,setLine]=useState('');
  useEffect(()=>{
    const key='dream-rival-voice-'+id;
    let previous:string|undefined;
    try { previous=sessionStorage.getItem(key)??undefined; } catch { /* Storage can be unavailable in private browsing. */ }
    const next=rivalLine(intensity,situation,previous,Math.random,signature);
    setLine(next);
    try {sessionStorage.setItem(key,next);} catch { /* Quotes still work for this visit. */ }
  },[id,intensity,situation,signature]);
  return line ? <p className="rival-voice">「{line}」</p> : null;
}

export default function Rivals({state}:PageProps) {
  if(!state.settings.rivalsEnabled) return null;
  const board=raceBoard(state);
  const self=board.rows.find(row=>row.id==='self')!;
  const weekEnd=addDays(board.week,6);
  const strength=state.settings.taunt;
  return <section className="race-page">
    <style>{`
    .race-page {max-width:760px; margin:0 auto; color:inherit}
    .race-page h1 {font-size:clamp(1.75rem,5vw,2.35rem);margin:.35em 0 .2em}
    .race-page header h1,.race-page header .race-week {color:white;text-shadow:var(--space-head-shadow)}
    .race-page p {margin:.35em 0}
    .race-page .rival-brief {font-size:.91rem;color:var(--muted);line-height:1.65}
    .race-page header .rival-brief {width:fit-content;background:var(--space-reading,var(--panel));border-radius:8px;padding:.3rem .6rem}
    .race-week {font-variant-numeric:tabular-nums;letter-spacing:.07em;font-size:.84rem;color:inherit}
    .race-summary {margin:1.25rem 0;padding:1.4rem;border-radius:1.25rem;border:1px solid var(--space-border,var(--line));background:var(--space-card,var(--panel));box-shadow:var(--space-shadow,none)}
    .race-summary strong {font-size:2rem;letter-spacing:.02em}
    .race-list {display:grid;gap:.65rem;list-style:none;padding:0;margin:1rem 0}
    .race-list li {display:grid;grid-template-columns:2rem 2.65rem 1fr auto;align-items:center;gap:.68rem;padding:1rem;border-radius:1.15rem;border:1px solid var(--space-border,var(--line));background:var(--space-card,var(--panel));box-shadow:var(--space-shadow,none)}
    .race-list li.self {border-color:var(--lav);border-inline-start:3px solid var(--lav)}
    .rival-portrait {display:grid;place-items:center;width:2.65rem;height:2.65rem;border:1px solid;border-radius:50%;font-weight:700}
    .rival-who {min-width:0}.rival-name {font-weight:700}
    .rival-rank {text-align:center;font-variant-numeric:tabular-nums;color:var(--muted)}
    .race-list strong {font-size:1.3rem}.race-list small {font-size:.77rem}
    .rival-voice {font-size:.88rem}.race-page details {padding:.85rem 1rem;border-radius:12px;border:1px solid var(--space-border,var(--line));background:var(--space-card,var(--panel))}.race-page details summary {cursor:pointer;font-weight:600}
    @media(max-width:450px){.race-list li{grid-template-columns:1.4rem 2rem 1fr auto;gap:.45rem;padding:.85rem .65rem}.rival-portrait{width:2rem;height:2rem}.rival-brief{font-size:.84rem}}
    `}</style>
    <header><p className="race-week">{board.week.replaceAll('-','.')} — {weekEnd.slice(5).replace('-','.')}</p><h1>星際排行榜</h1>
    <p className="rival-brief">四位模擬對手陪你練習，每週一凌晨四點重新計分。</p></header>
    {board.paused ? <div className="race-summary"><strong>休戰中</strong><p>大家都在{board.period==='exam'?'考試':'實習'}。這一週不列入賽季結算。</p></div> : <>
    <div className="race-summary"><p>你的週排名</p><strong>第 {self.rank} 名</strong><p>{self.score} 分 · 本週累計</p></div>
    <ol className="race-list" aria-label="本週排名">{board.rows.map(row=>{
      const rival=row.rival;
      const situation:Situation=board.returned?'returning':board.today===board.week?'opening':row.score===self.score?'tied':row.score>self.score?'trailing':'leading';
      return <li key={row.id} className={rival?'':'self'}>
        <span className="rival-rank" aria-label={'第 '+row.rank+' 名'}>{String(row.rank).padStart(2,'0')}</span>
        <span aria-hidden="true" className="rival-portrait" style={{borderColor:rival?.color??'#b597ec',background:(rival?.color??'#b597ec')+'24'}}>{rival?.portrait??'我'}</span>
        <div className="rival-who"><div className="rival-name">{row.name}</div>
        {rival && <><p className="rival-brief">{rival.personality}</p>{strength!=='off'&&<RivalVoice id={rival.id} intensity={strength} situation={situation} signature={rival.lines[situation].replace('{n}',String(Math.abs(row.score-self.score)))}/>}</>}</div>
        <span><strong>{row.score}</strong> <small>分</small></span>
      </li>;
    })}</ol></>}
    <details><summary>積分怎麼算？</summary><p className="rival-brief">累爆 10 分、普通 30 分、有電 50 分。同一天取最高電量。隔四天仍能自己想起的複習卡，每張加 2 分，一天最多加 10 分。</p>
    <p className="rival-brief">對手依最近四個有開戰的星期調整。學期上限 150 分，寒暑假上限 300 分。你可以在設定調整對手的話，也可以關閉排行榜。</p></details>
  </section>;
}

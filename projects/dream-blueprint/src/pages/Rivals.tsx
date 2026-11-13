import ScenePhoto from "../components/ScenePhoto";
import { useEffect, useState } from 'react';
import type { PageProps } from '../lib/store';
import { dailyRacePoints, raceBoard, rivalLine, type Situation } from '../lib/rivals';
import { addDays } from '../lib/progress';
import './rivals.css';

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
    <header className="race-hero">
      <ScenePhoto className="race-photo" />
      <div className="race-intro">
        <p className="race-week">{board.week.replaceAll('-','.')} — {weekEnd.slice(5).replace('-','.')}</p>
        <h1>星際排行榜</h1>
        <p className="race-description">四位模擬對手陪你練習，每週一凌晨四點重新計分。</p>
      </div>
      <div className="race-summary">
        {board.paused ? <>
          <p className="race-metric">休戰中</p>
          <p>大家都在{board.period==='exam'?'考試':'實習'}。這一週不列入賽季結算。</p>
        </> : <>
          <p>你的週排名</p>
          <p className="race-metric"><small>第</small> {self.rank} <small>名</small></p>
          <p>本週累計 <b>{self.score}</b> 分</p>
        </>}
      </div>
    </header>
    {!board.paused && <section className="race-standings">
      <h2>本週排名</h2>
      <ol className="race-list" aria-label="本週排名">{board.rows.map(row=>{
        const rival=row.rival;
        const situation:Situation=board.returned?'returning':board.today===board.week?'opening':row.score===self.score?'tied':row.score>self.score?'trailing':'leading';
        return <li key={row.id} className={rival?'':'self'}>
          <span className="rival-rank" aria-label={'第 '+row.rank+' 名'}>{String(row.rank).padStart(2,'0')}</span>
          <span aria-hidden="true" className="rival-portrait" style={{borderColor:rival?.color??'#e5bb80',background:(rival?.color??'#e5bb80')+'29'}}>{rival?.portrait??'我'}</span>
          <div className="rival-who">
            <span className="rival-name">{row.name}</span>
            {rival && <><p className="rival-brief">{rival.personality}</p>{strength!=='off'&&<RivalVoice id={rival.id} intensity={strength} situation={situation} signature={rival.lines[situation].replace('{n}',String(Math.abs(row.score-self.score)))}/>}</>}
          </div>
          <span className="rival-points"><strong>{row.score}</strong> <small>分</small></span>
        </li>;
      })}</ol>
    </section>}
    <section className="race-scoring">
      <h2>練習積分</h2>
      <dl>{(['low','normal','high'] as const).map((energy,index)=><div key={energy}>
        <dt>{['累爆','普通','有電'][index]}</dt><dd>{dailyRacePoints(energy,0)}<small> 分</small></dd>
      </div>)}</dl>
      <details><summary>積分怎麼算？</summary>
        <p>同一天取最高電量。隔四天仍能自己想起的複習卡，每張加 2 分，一天最多加 10 分。</p>
        <p>對手依最近四個有開戰的星期調整。對手的每週積分上限是學期 150 分、寒暑假 300 分。你可以在設定調整對手的話，也可以關閉排行榜。</p>
      </details>
    </section>
  </section>;
}

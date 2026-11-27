import config from '../data/rivals.json' with { type: 'json' };

type Rival = typeof config.rivals[number];
import type { AppState } from './store';
import { dayKey, activePeriod, addDays as offset, weekKey as monday, daysBetween, reviewBonus, type Period } from './progress.ts';
import { readArchive } from './compact.ts';
type WeekData = { score: number; paused: boolean; vacation: boolean };
export type RankedEntry = { id: string; name: string; score: number; rank: number; rival?: Rival };
type StandingInput = { week: string; day: number; score: number; average: number; beginner: boolean; vacation: boolean };

function hash(value:string) {
  let result = 2166136261;
  for (const c of value) result=Math.imul(result^c.charCodeAt(0),16777619);
  return (result>>>0)/4294967296;
}

export function rankWeek(input:StandingInput):RankedEntry[] {
  const entries: RankedEntry[] = [{id:'self',name:'玄燁',score:input.score,rank:1}];
  for(const rival of config.rivals) {
    const base = input.beginner ? rival.minimum : Math.max(rival.minimum,input.average*rival.multiplier);
    const jitter = 0.9+0.2*hash(input.week+'-'+rival.id);
    const total = Math.min(input.vacation ? 300 : 150, Math.round(base*jitter));
    const score = Math.round(total*rival.cadence[Math.min(6, Math.max(0,input.day))]);
    entries.push({id:rival.id,name:rival.name,score,rank:1,rival});
  }
  entries.sort((a,b)=>b.score-a.score);
  entries.forEach((entry,index)=>{entry.rank=index && entries[index-1].score===entry.score ? entries[index-1].rank : index+1;});
  return entries;
}

export function dailyRacePoints(energy:'low'|'normal'|'high', remembered:number) {
  return ({low:10, normal:30, high:50}[energy])+Math.min(5,Math.max(0,Math.floor(remembered)))*2;
}

function seasonFor(date:string, vacation:boolean) {
  const [year,month]=date.split('-').map(Number);
  if(vacation) {
    const winter = month<=3 || month===12;
    const cycle = month===12 ? year+1 : year;
    return {id:cycle+(winter?'-winter':'-summer'),label:cycle+' 年'+(winter?'寒假':'暑假')};
  }
  const spring=month>=2 && month<=8;
  const cycle=month===1 ? year-1 : year;
  return {id:cycle+(spring?'-spring':'-fall'),label:cycle+' 年'+(spring?'春季學期':'秋季學期')};
}

function inTruce(period:Period) {
  return period==='exam' || period==='internship';
}

function raceWeeks(state: AppState) {
  const practice = new Map<string,{base:number; paused:boolean}>();
  for(const session of state.sessions) {
    const previous = practice.get(session.day);
    practice.set(session.day, {
      base: Math.max(previous?.base ?? 0, dailyRacePoints(session.energy,0)),
      paused: !!previous?.paused || inTruce(session.period),
    });
  }
  const archived = readArchive(state.notes).bonus;
  const reviews = new Map<string,AppState['reviewEvents']>();
  for (const event of state.reviewEvents) {
    if (!practice.has(event.day) || archived[event.day] !== undefined) continue;
    const daily = reviews.get(event.day);
    if (daily) daily.push(event);
    else reviews.set(event.day, [event]);
  }
  return (start: string, end: string): WeekData => {
    let score = 0;
    let paused = false;
    for (let day = start; day <= end; day = offset(day,1)) {
      const entry = practice.get(day);
      if (!entry) continue;
      score += entry.base + (archived[day] ?? reviewBonus(reviews.get(day) ?? [], day));
      paused ||= entry.paused;
    }
    paused ||= state.settings.periods.some(range=>inTruce(range.type)&&range.start<=end&&(!range.end||range.end>=start));
    return {score,paused,vacation:activePeriod(end,state.settings.periods)==='vacation'};
  };
}

function lastFour(firstDay: string, week: string, weekData: ReturnType<typeof raceWeeks>) {
  const scores:number[]=[];
  const first=monday(firstDay);
  for(let key=offset(week,-7);key>=first && scores.length<4;key=offset(key,-7)) {
    const data=weekData(key,offset(key,6));
    if(!data.paused) scores.push(data.score);
  }
  return {average:scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0, beginner:scores.length<4};
}

export function raceBoard(state:AppState,now=new Date()) {
  const weekData = raceWeeks(state);
  const today=dayKey(now);
  const week=monday(today);
  const period=activePeriod(today,state.settings.periods);
  const paused=inTruce(period);
  let scoringDay=today;
  if(paused) {
    while(scoringDay>=week && inTruce(activePeriod(scoringDay,state.settings.periods))) {
      scoringDay=offset(scoringDay,-1);
    }
  }
  const closing = weekData(week,scoringDay);
  const rows=rankWeek({week,day:Math.max(0,daysBetween(week,scoringDay)),score:closing.score,...lastFour(state.startedDay,week,weekData),vacation:closing.vacation});
  return {today,week,period,paused,rows,returned:weekData(offset(week,-7),offset(week,-1)).paused||closing.paused};
}

export function rivalSummary(state:AppState,now=new Date()) {
  if(!state.settings.rivalsEnabled) return '';
  const {paused,rows,period}=raceBoard(state,now);
  if(paused) return '休戰中，大家都在'+(period==='exam'?'考試':'實習');
  const me=rows.find(person=>person.id==='self')!;
  const ahead=rows.filter(person=>person.score>me.score).at(-1);
  return '本週第 '+me.rank+' 名'+(ahead?'，差'+ahead.name+' '+(ahead.score-me.score)+' 分':'，目前 '+me.score+' 分');
}

export function seasonHistory(state:AppState,now=new Date()) {
  const weekData = raceWeeks(state);
  const today=dayKey(now);
  const current=monday(today);
  const thisSeason=seasonFor(today,activePeriod(today,state.settings.periods)==='vacation');
  const seasons=new Map<string,{id:string;label:string;firsts:number;weeks:number;sum:number}>();
  const scores:number[]=[];
  for(let week=monday(state.startedDay);week<current;week=offset(week,7)) {
    const end=offset(week,6);
    const data=weekData(week,end);
    if(data.paused) continue;
    const avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
    const rank=rankWeek({week,day:6,average:avg,beginner:scores.length<4,...data}).find(person=>person.id==='self')!.rank;
    scores.push(data.score);
    if(scores.length>4) scores.shift();
    const season=seasonFor(end,data.vacation);
    if(season.id===thisSeason.id) continue;
    const result=seasons.get(season.id)??{...season,firsts:0,weeks:0,sum:0};
    result.firsts+=Number(rank===1);
    result.weeks+=1;
    result.sum+=rank;
    seasons.set(season.id,result);
  }
  return [...seasons.values()].reverse().map(({sum,...s})=>({...s,averageRank:Math.round(sum/s.weeks*10)/10}));
}

export type Situation=keyof typeof config.banter.normal;
export function rivalLine(strength:'gentle'|'bold',situation:Situation,last:string|undefined,random=Math.random, signature?:string) {
  const pool=config.banter[strength==='gentle'?'normal':'sharp'][situation];
  const options=(signature ? [...pool,signature] : pool).filter(line=>line!==last);
  return options[Math.floor(random()*options.length)];
}


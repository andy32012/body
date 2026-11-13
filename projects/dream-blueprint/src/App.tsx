import { useEffect, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChartNoAxesColumnIncreasing,
  Check, ChevronRight, Compass, Flag,
  Map as MapIcon, Moon, Orbit, Play, Settings2, Star, Sun,
  Telescope, Trophy, Images,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore, type Page, type PageProps, type AppState } from './lib/store'
import { activePeriod, addDays, dayKey, daysBetween, weekKey, type Energy } from './lib/progress'
import planData from './data/plan.json'
import roadmap from './data/roadmap.json'
import Plan, { type PlanTab } from './pages/Plan'
import Practice, { PracticeLibrary } from './pages/Practice'
import PracticeDock from './components/PracticeDock'
import WorkloadRecommendation from './components/WorkloadRecommendation'
import Rivals from './pages/Rivals'
import History from './pages/History'
import Settings from './pages/Settings'
import CosmosGallery from './pages/CosmosGallery'
import { UniverseBackground, useObservatory } from './components/Observatory'

type View = Page | 'library' | 'cosmos'
type Route = {view: View, energy: Energy, tab: PlanTab, photoId?:string}
const links: {id: View, title: string, mobile: string, icon: LucideIcon}[] = [
  {id:'today', title:'今日航行', mobile:'今天', icon:Compass},
  {id:'library', title:'英文練習', mobile:'練習', icon:BookOpen},
  {id:'plan', title:'夢想星圖', mobile:'計畫', icon:MapIcon},
  {id:'history', title:'航行紀錄', mobile:'紀錄', icon:ChartNoAxesColumnIncreasing},
  {id:'rivals', title:'星際排行榜', mobile:'對手', icon:Trophy},
  {id:'cosmos', title:'宇宙圖鑑', mobile:'圖鑑', icon:Images},
]
const phases = {semester:'一般學期', exam:'考週模式', internship:'實習模式', vacation:'寒暑假模式'}
function readRoute():Route {
  const [key, value] = location.hash.slice(1).split('/')
  const view = [...links.map(l => l.id),'practice','settings'].includes(key) ? key as View : 'today'
  return {view, photoId:view==='cosmos' ? value : undefined, energy:value==='high'?'high':value==='normal'?'normal':'low', tab:value==='map'?'map':value==='timeline'?'timeline':'calendar'}
}
function setView(view:View, detail?:Energy|PlanTab) {
  const hash = view + (detail ? '/' + detail : '')
  if (location.hash !== '#' + hash) location.hash = hash
}
function nextAction(state:AppState) {
  const unresolved=state.school.requirements.find(r=>!r.done)
  if(unresolved) return {kind:'map',title:unresolved.label,detail:'到星圖第一站核對這項畢業條件，完成後就能勾選。',action:'查看學校清單'}
  for (const station of roadmap.stations.slice(1)) {
    const item=station.tasks.find((_,i)=>!state.checks['roadmap.'+station.id+'.'+(i+1)])
    if(item) return {kind:'map',title:item,detail:'赴美路線第 '+station.id+' 站 · '+station.title,action:'開啟路線地圖'}
  }
  return {kind:'map',title:'回顧你的赴美路線',detail:'所有站點的待辦都已完成。',action:'查看夢想星圖'}
}
function defaultEnergy(state:AppState,today:string):Energy {
  const period=activePeriod(today,state.settings.periods)
  const weekday=new Date(today+'T12:00:00').getDay()
  if(period==='exam'||period==='internship')return 'low'
  if(period==='vacation')return weekday===0?'low':'high'
  return state.settings.regularDays.includes(weekday)?'normal':'low'
}
function Brand() {
  return <button type="button" className="brand" onClick={()=>setView('today')} aria-label="夢想藍圖首頁">
    <span className="brand-orbit" aria-hidden="true"><i/><b/></span><span>夢想藍圖</span>
  </button>
}
function Week({state,today}:{state:AppState,today:string}) {
  const start=weekKey(today)
  const ds=new Set(state.sessions.map(s=>s.day))
  const count=Array.from({length:7},(_,i)=>addDays(start,i)).filter(d=>ds.has(d)).length
  return <section className="orbit-card week-card">
    <div className="section-head"><span className="card-symbol mint"><CalendarDays size={19}/></span><h2>本週軌跡</h2><span className="week-tally"><b>{count}</b> / 7 天</span></div>
    <div className="week-track">{['一','二','三','四','五','六','日'].map((s,i)=>{
      const d=addDays(start,i),done=ds.has(d),isToday=d===today
      const rest=state.settings.restDays.includes((i+1)%7)
      return <div className={'week-position'+(isToday?' is-today':'')+(done?' is-done':'')} key={d} aria-label={d+' '+(isToday?'今天 ':'')+(done?'有練習':rest?'休息日':'尚無練習紀錄')}>
        <small>{s}</small><span className="week-node">{done?<Check size={15}/>:isToday?<Star size={14} fill="currentColor"/>:rest?<Moon size={12}/>:<i/>}</span><small className="week-date">{Number(d.slice(8))}</small>
      </div>})}</div>
    <div className="week-legend"><span><i className="done-key"/>已練習</span><span><i className="today-key"/>今天</span><span><Moon size={11}/>休息日</span></div>
  </section>
}
function Home(props:PageProps & {today:string, start:(e:Energy)=>void}) {
  const {state,update,today,start}=props
  const phase=activePeriod(today,state.settings.periods)
  const maintenance= today>='2028-02-01'&&today<='2029-07-31' && (phase==='exam'||phase==='internship')
  const goal=nextAction(state), days=new Set(state.sessions.map(s=>s.day)).size
  const month=planData.months.find(m=>m.month===today.slice(0,7))
  const year=planData.years.find(y=>y.year===Number(today.slice(0,4)))
  const hadBreak=state.sessions.length>0&&!state.sessions.some(s=>s.day===today||s.day===addDays(today,-1))
  const regular=defaultEnergy(state,today)
  const heroCue=maintenance?'這段維持期已排進計畫，每天只需複習 2 分鐘。':hadBreak?'回來就好，從你熟悉的一句話接著練。':
    regular==='low'?'今天可以只複習一句，照自己的電量前進。':regular==='high'?'假期的英文時間到了，從今天的一句話開始。':'今天從一句中翻英開始，接著用同一句聽和說。'
  return <div className="home-stack">
    <section className="flight-deck" aria-label="今日練習">
      <div className="hero-body">
        <div className="hero-label"><span aria-hidden="true" className="hero-dash"/>累計練習</div>
        <div className="hero-number"><strong>{days}</strong><span>天</span></div>
        <p>{heroCue}</p>
        <button type="button" className="launch" onClick={()=>{const dock=document.getElementById('practice-dock');dock?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});dock?.focus({preventScroll:true})}}><Play size={16} fill="currentColor"/>準備今日練習<ArrowRight size={16}/></button>
      </div>
    </section>
    <div className="overview-row">
      <section className="orbit-card next-card">
        <div className="section-head"><span className="card-symbol amber"><Flag size={18}/></span><h2>下一步</h2><span className="step-context"><i/>夢想線</span></div>
        <h3>{goal.title}</h3><p>{goal.detail}</p>
        <button type="button" onClick={()=>setView('plan','map')} className="next-action"><ArrowRight size={14}/>{goal.action}</button>
      </section>
      <Week state={state} today={today}/>
    </div>
    <section className="home-practice"><PracticeDock {...props} onStart={start} nextStep={goal.title}/></section>
    <WorkloadRecommendation state={state} update={update}/>
    <button className="plan-strip" type="button" onClick={()=>setView('plan','timeline')}><span className="card-symbol lavender"><Telescope size={20}/></span><span><strong>今年 · {year?.school || '重排年度目標'}</strong><small>這個月 · {month?.english || '到計畫頁查看本月目標'}</small></span><ArrowUpRight size={18}/></button>
  </div>
}
function App() {
  const {state,update,storageError}=useAppStore()
  const [route, changeRoute]=useState(readRoute)
  const [today,changeDay]=useState(dayKey)
  const navigate=(p:Page)=>setView(p==='practice'?'library':p)
  const start=(e:Energy)=>setView('practice',e)
  const page=route.view==='rivals'&&!state.settings.rivalsEnabled?'today':route.view
  const active=page==='practice'?'library':page
  const sky=useObservatory(state,today,active)
  useEffect(()=>{
    const handle=()=>{changeRoute(readRoute());window.scrollTo(0,0)}
    const clock=()=>changeDay(dayKey())
    window.addEventListener('hashchange',handle)
    window.addEventListener('focus',clock)
    const timer=window.setInterval(clock,15000)
    return ()=>{window.removeEventListener('hashchange',handle);window.removeEventListener('focus',clock);clearInterval(timer)}
  },[])
  useEffect(()=>{document.documentElement.dataset.theme=state.settings.theme},[state.settings.theme])
  useEffect(()=>{if(route.view==='rivals'&&!state.settings.rivalsEnabled)location.replace('#today')},[route.view,state.settings.rivalsEnabled])
  const pageName=links.find(l=>l.id===active)?.title||'設定'
  useEffect(()=>{document.title=pageName+' · 夢想藍圖'},[pageName])
  const props:PageProps={state,update,navigate}
  const available=links.filter(l=>l.id!=='rivals'||state.settings.rivalsEnabled)
  const date=new Date(today+'T12:00:00')
  const dateText=new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(date)
  const phase=activePeriod(today,state.settings.periods)
  const sorted=state.settings.periods.filter(r=>r.type===phase&&r.start<=today&&(!r.end||r.end>=today)).sort((a,b)=>b.start.localeCompare(a.start))
  const until=sorted[0]?.end
  const status=phase==='exam'&&today>='2029-02-01'&&today<='2029-07-31'?'國考衝刺':phases[phase]
  const titleNav=(l:typeof links[number],mobile=false)=><button type="button" key={l.id} className={(active===l.id?'nav-link current':'nav-link')} aria-current={active===l.id?'page':undefined} onClick={()=>setView(l.id)}><l.icon size={mobile?20:19}/><span>{mobile?l.mobile:l.title}</span>{!mobile&&active===l.id&&<i/>}</button>
  return <div className="application" data-theme={state.settings.theme} data-view={page}>
    <UniverseBackground sky={sky}/>
    <a className="skip-link" href="#content" onClick={e=>{e.preventDefault();document.getElementById('content')?.focus()}}>跳到主要內容</a>
    <aside className="sidebar"><Brand/><div className="sidebar-rule"/>
      <nav aria-label="主要導覽">{available.map(l=>titleNav(l))}</nav>
      <div className="side-bottom"><button className="destination" onClick={()=>setView('plan','map')}><span className="destination-symbol"><Orbit size={27}/></span><small>我的目的地</small><strong>美國註冊護理師 <ArrowUpRight size={13}/></strong><span>期望抵達 2033–2034</span></button>
      <button className={'nav-link settings-link'+(page==='settings'?' current':'')} onClick={()=>setView('settings')}><Settings2 size={18}/>設定</button>
      <div className="profile"><span>玄</span><div><b>玄燁</b><small>弘光科技大學 · 護理系</small></div></div></div>
    </aside>
    <div className="viewport"><div className="mobile-brand"><Brand/><button className="icon-control" aria-label="設定" onClick={()=>setView('settings')}><Settings2 size={20}/></button></div>
    <div className="desktop-content" id="content" tabIndex={-1}>
      <header className="global-head"><div>{page==='today'?<><h1>今日航行</h1><p><CalendarDays size={14}/>{dateText}</p></>:<button className="back-home" onClick={()=>setView('today')}><Compass size={16}/> 今日航行 <ChevronRight size={14}/> {pageName}</button>}</div>
      <div className="header-controls"><button className="phase-pill" title="編輯目前時期" onClick={()=>setView('settings')}><i/>{status}{until&&daysBetween(today,until)<32?' · 還有 '+(daysBetween(today,until)+1)+' 天':''}</button>
      <button className="icon-control theme-switch" aria-label={state.settings.theme==='dark'?'切換淺色':'切換深色'} title={state.settings.theme==='dark'?'切換淺色':'切換深色'} onClick={()=>update(s=>({...s,settings:{...s.settings,theme:s.settings.theme==='dark'?'light':'dark'}}))}>{state.settings.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button></div>
      </header>
      {storageError&&<p className="exam-offer" role="status">{storageError}</p>}
      {page==='cosmos'?<CosmosGallery {...props} initialPhotoId={route.photoId} onViewerClose={()=>{if(route.photoId)location.replace('#cosmos')}}/>:page==='today'?<Home {...props} today={today} start={start}/>:page==='plan'?<Plan key={route.tab} {...props} initialTab={route.tab}/>:page==='practice'?<Practice key={today+route.energy} {...props} energy={route.energy}/>:page==='library'?<div className="library-page"><h1>英文練習</h1><PracticeDock {...props} onStart={start} onlyPractice/><PracticeLibrary {...props}/></div>:page==='history'?<History {...props}/>:page==='rivals'?<Rivals {...props}/>:<Settings {...props}/>}
    </div></div>
    <nav className="mobile-nav" aria-label="行動導覽">{available.map(l=>titleNav(l,true))}</nav>
  </div>
}
export default App


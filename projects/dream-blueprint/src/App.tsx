import { SceneFeatureContext } from './components/ScenePhoto'
import { useEffect, useState } from 'react'
import {
  ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChartNoAxesColumnIncreasing,
  Check, ChevronRight, Compass, Route as RouteIcon,
  Map as MapIcon, Moon, Orbit, Settings2, Star, Sun,
  Telescope, Mic, House,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAppStore, type Page, type PageProps, type AppState } from './lib/store'
import { activePeriod, addDays, dayKey, daysBetween, weekKey, type Energy } from './lib/progress'
import planData from './data/plan.json'
import roadmap from './data/roadmap.json'
import Plan, { type PlanTab } from './pages/Plan'
import { PracticeCover } from './components/PracticeCover'
import Practice, { PracticeLibrary } from './pages/Practice'
import { LessonBanner, TodayLesson, TodayThings } from './components/TodayLesson'
import contentUpdates from './data/content-updates.json'
import WorkloadRecommendation from './components/WorkloadRecommendation'
import History from './pages/History'
import Settings from './pages/Settings'
import CosmosGallery from './pages/CosmosGallery'
import { UniverseBackground, useObservatory } from './components/Observatory'
import { AIAssistant } from './components/AIChat'
import { PairReceive } from './components/PairDevice'
import SyncReceive from './components/SyncReceive'
import { clearPairing, pairEvent, pairPrefix, takePairing } from './lib/pairing'
import { handoffText } from './lib/handoff'
import Speaking from './pages/Speaking'
import GeptSpeaking from './components/GeptSpeaking'
import Baseline, { TestPrompt } from './components/Baseline'
import PracticeMenu, { menuIcons } from './components/PracticeMenu'
import { showTestPrompt } from './lib/baseline'
import { MemoryContext, applyMemory, readMemory, writeMemory, replaceMemory, mergeMemory, readDeleted, memoryDeletedKey, type MemoryApi } from './lib/memory'
import { driveConnected, loadDriveMemory, saveDriveMemory, saveDriveState, cloudConflict, takeSyncLink, clearSyncLink, syncPrefix, driveReadyEvent, cloudArchive, archiveToDrive } from './lib/drive'
import { getSnapshot, localModified, updateStore } from './lib/store'
import { applyBatch, archiveOld } from './lib/compact'
import { useRef } from 'react'
import DailyWord from './components/DailyWord'
import SyncPaused from './components/SyncPaused'
import { autoSettle } from './lib/cloudSync'
import { seenKey } from './lib/dailyWords'
import { libraryPage, menuGroups, modeLabel, type MenuId } from './lib/library'

type View = Page | 'library' | 'cosmos' | 'speaking' | 'leveltest'
type Route = {view: View, energy: Energy, tab: PlanTab, photoId?:string, mode?:string}
const links: {id: View, title: string, mobile: string, icon: LucideIcon}[] = [
  {id:'today', title:'今日航行', mobile:'今天', icon:Compass},
  {id:'library', title:'英文練習', mobile:'練習', icon:BookOpen},
  {id:'speaking', title:'英文口說', mobile:'口說', icon:Mic},
  {id:'history', title:'航行紀錄', mobile:'紀錄', icon:ChartNoAxesColumnIncreasing},
  {id:'plan', title:'夢想星圖', mobile:'計畫', icon:MapIcon},
]
/** 英文口說 is listed under 英文練習 in the sidebar; on a phone it keeps its own place in the bottom bar. */
const extraTitles: Partial<Record<View, string>> = {rivals:'星際排行榜', settings:'設定', cosmos:'宇宙圖鑑', practice:'英文練習', leveltest:'英文程度測驗'}
const phases = {semester:'一般學期', exam:'考週模式', internship:'實習模式', vacation:'寒暑假模式'}
function readRoute():Route {
  const [key, value] = location.hash.slice(1).split('/')
  // The leaderboard now lives inside the plan page.
  if (key === 'rivals') return {view:'plan', tab:'rivals', energy:'low'}
  const view = [...links.map(l => l.id),'practice','settings','cosmos','rivals','leveltest'].includes(key) ? key as View : 'today'
  return {view, photoId:view==='cosmos' ? value : undefined, mode:view==='speaking'||view==='practice'||view==='library' ? value : undefined, energy:value==='high'?'high':value==='normal'||value?.startsWith('resume')?'normal':'low', tab:value==='map'?'map':value==='exam'?'exam':value==='timeline'?'timeline':value==='rivals'?'rivals':value==='levels'?'levels':'calendar'}
}
function setView(view:View, detail?:Energy|PlanTab) {
  const hash = view + (detail ? '/' + detail : '')
  if (location.hash !== '#' + hash) location.hash = hash
}
/** Old records go into the Drive archive first (cloud script v4), and only the ones that arrived leave this device. */
async function archiveOldRecords() {
  if(!driveConnected()||!cloudArchive()||cloudConflict())return
  const today=dayKey()
  const batch=await archiveOld(getSnapshot().state,today,archiveToDrive)
  if(batch)updateStore(prev=>applyBatch(prev,batch,today))
}
function nextAction(state:AppState) {
  const unresolved=state.school.requirements.find(r=>!r.done)
  if(unresolved) return {kind:'map',title:unresolved.label,detail:'到星圖第一站核對這項畢業條件，完成後就能勾選。',action:'查看學校清單'}
  // Still studying: the first station is the next step, not the diploma tasks of station 2.
  const school=state.school
  if(school.acceptedCredits<school.requiredCredits) return {kind:'map',title:roadmap.stations[0].title,detail:'赴美路線第 1 站 · 已採計 '+school.acceptedCredits+'／'+school.requiredCredits+' 學分。英文檢定（第 5 站）可以同時準備。',action:'開啟路線地圖'}
  for (const station of roadmap.stations.slice(1)) {
    const item=station.tasks.find((_,i)=>!state.checks['roadmap.'+station.id+'.'+(i+1)])
    if(item) return {kind:'map',title:item,detail:'赴美路線第 '+station.id+' 站 · '+station.title,action:'開啟路線地圖'}
  }
  return {kind:'map',title:'回顧你的赴美路線',detail:'所有站點的待辦都已完成。',action:'查看夢想星圖'}
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
/** Once, after teaching material was corrected: says how many of the learner's cards changed and that they are due today. */
function ContentNotice({state,update}:Pick<PageProps,'state'|'update'>) {
  const pending=(contentUpdates as {id:string,note:string}[]).filter(u=>Number(state.notes['content.'+u.id])>0&&!state.notes['content.seen.'+u.id])
  if (!pending.length) return null
  const total=pending.reduce((n,u)=>n+Number(state.notes['content.'+u.id]),0)
  return <section className="orbit-card content-notice" role="status">
    <strong>教材修正了</strong>
    <p>{pending.map(u=>u.note).join('；')}。你學過的 {total} 張卡片內容有改，已經排回複習：沒練過的今天就會出現，今天已經練過的明天出現。進度和紀錄都保留。</p>
    <button type="button" onClick={()=>update(prev=>({...prev,notes:{...prev.notes,...Object.fromEntries(pending.map(u=>['content.seen.'+u.id,'1']))}}))}>知道了</button>
  </section>
}
/** Shown until the first practice day (or until dismissed): the three things a new learner needs to know. */
function FirstGuide({state,update}:Pick<PageProps,'state'|'update'>) {
  if (state.sessions.length>0 || state.notes['guide.seen']) return null
  return <section className="orbit-card content-notice first-guide" role="note" aria-label="第一次使用">
    <strong>第一次用？照這三步就好</strong>
    <ol>
      <li>按下面的「開始這一堂」上今天的課：聽一段對話 → 看文法講解、做幾題小練習 → 寫一句英文 → 跟著念 → 換個說法再寫兩句 → 用自己的話寫幾句。大約 30 分鐘。</li>
      <li>上完回到這一頁，照「今天的 1.5 小時」清單由上往下做：做完的會自己打勾，不用的也可以自己勾掉。</li>
      <li>時間不夠就選「15 分鐘」只做複習。明天用同一個網址再打開，進度會接著走。</li>
    </ol>
    <p>想讓 Claude 批改句子、跟 Emma 練口說，到右上角的設定 →「連接 Claude」貼上金鑰；沒有金鑰也能用，寫完自己對照參考句。</p>
    <button type="button" onClick={()=>update(prev=>({...prev,notes:{...prev.notes,'guide.seen':'1'}}))}>知道了</button>
  </section>
}
function Home(props:PageProps & {today:string, start:(e:Energy)=>void, openWord:()=>void}) {
  const {state,update,navigate,today,start,openWord}=props
  const goal=nextAction(state), days=new Set(state.sessions.map(s=>s.day)).size
  const month=planData.months.find(m=>m.month===today.slice(0,7))
  const year=planData.years.find(y=>y.year===Number(today.slice(0,4)))
  const weekStart=weekKey(today), practised=new Set(state.sessions.map(s=>s.day))
  const weekCount=Array.from({length:7},(_,i)=>addDays(weekStart,i)).filter(d=>practised.has(d)).length
  return <div className="home-stack">
    <ContentNotice state={state} update={update}/>
    <FirstGuide state={state} update={update}/>
    <TodayLesson state={state} update={update} today={today} start={start} openWord={openWord} days={days} weekCount={weekCount}/>
    <TodayThings state={state} navigate={navigate} today={today} nextStep={goal.title}/>
    <div className="overview-row">
      <section className="orbit-card next-card">
        <div className="section-head"><h2>夢想星圖 · 下一步</h2></div>
        <span className="route-emblem" aria-hidden="true"><RouteIcon size={29} strokeWidth={1.65}/></span>
        <h3>{goal.title}</h3><p>{goal.detail}</p>
        <button type="button" onClick={()=>setView('plan','map')} className="next-action">{goal.action}<ArrowRight size={15} aria-hidden="true"/></button>
      </section>
      <Week state={state} today={today}/>
    </div>
    <WorkloadRecommendation state={state} update={update}/>
    <button className="plan-strip" type="button" onClick={()=>setView('plan','timeline')}><span className="card-symbol lavender"><Telescope size={20}/></span><span><strong>今年 · {year?.school || '重排年度目標'}</strong><small>這個月 · {month?.english || '到計畫頁查看本月目標'}</small></span><ArrowUpRight size={18}/></button>
  </div>
}
function App() {
  const {state,update,storageError}=useAppStore()
  const [pairing,setPairing]=useState(takePairing)
  const [syncing,setSyncing]=useState(takeSyncLink)
  // Opened from a scan-to-connect link: the dialog connects and settles the progress itself. Its effect runs before
  // App's own (children first) and writes the connection at once, so App's on-open sync must stay out of the way.
  const openedBySync=useRef(syncing!==null)
  const [route, changeRoute]=useState(readRoute)
  const [today,changeDay]=useState(dayKey)
  const [wordOpen,setWordOpen]=useState(false)
  const closeWord=()=>{setWordOpen(false);update(s=>s.notes[seenKey(today)]?s:{...s,notes:{...s.notes,[seenKey(today)]:'1'}})}
  const navigate=(p:Page)=>setView(p==='practice'?'library':p)
  const start=(e:Energy)=>setView('practice',e)
  const page=route.view
  const active=page==='practice'?'library':page
  const sky=useObservatory(page,state.notes['cosmos.pin.'+active])
  useEffect(()=>{
    // A QR link opened while the app is already open in this tab arrives as a hash change, not a new load.
    const pair=()=>{if(location.hash.startsWith(pairPrefix)){const p=takePairing();if(p)setPairing(p)}}
    const sync=()=>{if(location.hash.startsWith(syncPrefix)){const c=takeSyncLink();if(c)setSyncing(c)}}
    const fromSettings=(e:Event)=>setPairing(String((e as CustomEvent).detail))
    window.addEventListener('hashchange',pair)
    window.addEventListener('hashchange',sync)
    window.addEventListener(pairEvent,fromSettings)
    return ()=>{window.removeEventListener('hashchange',pair);window.removeEventListener('hashchange',sync);window.removeEventListener(pairEvent,fromSettings)}
  },[])
  useEffect(()=>{
    const handle=()=>{if(location.hash.startsWith(pairPrefix)||location.hash.startsWith(syncPrefix))return;changeRoute(readRoute());window.scrollTo(0,0)}
    const clock=()=>changeDay(dayKey())
    window.addEventListener('hashchange',handle)
    window.addEventListener('focus',clock)
    const timer=window.setInterval(clock,15000)
    return ()=>{window.removeEventListener('hashchange',handle);window.removeEventListener('focus',clock);clearInterval(timer)}
  },[])
  useEffect(()=>{document.documentElement.dataset.theme=state.settings.theme},[state.settings.theme])
  // Each kind of practice is a page of its own (#library/<mode>) and names the page; #library alone is the 英文練習 list.
  const periodQuiet=['exam','internship'].includes(activePeriod(today,state.settings.periods))
  const libMode=page==='library'?libraryPage(route.mode):null
  const pageName=page==='library'?(libMode?modeLabel(libMode,periodQuiet):'英文練習'):links.find(l=>l.id===active)?.title||extraTitles[active]||'設定'
  useEffect(()=>{document.title=pageName+' · 夢想藍圖'},[pageName])
  // A short window scrolls the list under 英文練習: keep the open page's entry in sight, and fade the edge that has more.
  const subsRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const list=subsRef.current
    if(!list)return
    const open=list.querySelector<HTMLElement>('.current')
    if(open&&(open.offsetTop<list.scrollTop+36||open.offsetTop+open.offsetHeight>list.scrollTop+list.clientHeight-36))
      list.scrollTop=open.offsetTop-(list.clientHeight-open.offsetHeight)/2
    const mark=()=>{const above=list.scrollTop>2,below=list.scrollTop+list.clientHeight<list.scrollHeight-2
      list.dataset.more=above&&below?'both':above?'above':below?'below':''}
    mark()
    list.addEventListener('scroll',mark,{passive:true})
    window.addEventListener('resize',mark)
    return ()=>{list.removeEventListener('scroll',mark);window.removeEventListener('resize',mark)}
  },[libMode,page,periodQuiet,state.curriculum.unit])
  const props:PageProps={state,update,navigate}
  const memoryNotes=readMemory(state.notes)
  const memory:MemoryApi={notes:memoryNotes,
    update:(remember,forget)=>update(s=>({...s,notes:replaceMemory(s.notes,applyMemory(readMemory(s.notes),remember,forget))})),
    remove:i=>update(s=>({...s,notes:replaceMemory(s.notes,readMemory(s.notes).filter((_,j)=>j!==i))})),
    clear:()=>update(s=>({...s,notes:replaceMemory(s.notes,[])}))}
  const stateJson=JSON.stringify(state)
  const cloudReady=useRef(false)
  // A device that connects while the app is open starts saving once it has settled which progress to use.
  useEffect(()=>{const on=()=>{cloudReady.current=true};window.addEventListener(driveReadyEvent,on);return ()=>window.removeEventListener(driveReadyEvent,on)},[])
  useEffect(()=>{
    if(!driveConnected()||openedBySync.current)return
    // Compare with the snapshot this device last synced, not just clocks: if both sides changed, keep both and ask.
    // Take the cloud copy, save this one, or — both changed — merge them by itself (the banner only if merging fails).
    autoSettle().catch(()=>{}).finally(()=>{cloudReady.current=true;void archiveOldRecords()})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  // Coming back to the app (another tab, another app, the screen locked): catch up with what other devices saved.
  useEffect(()=>{
    let last=Date.now()
    const back=()=>{
      if(document.visibilityState!=='visible'||!driveConnected()||!cloudReady.current||Date.now()-last<30000)return
      last=Date.now()
      autoSettle().catch(()=>{})
    }
    // A save refused because another device saved meanwhile: merge right away instead of staying paused.
    const refused=()=>{if(cloudConflict()&&cloudReady.current&&Date.now()-last>=30000){last=Date.now();autoSettle().catch(()=>{})}}
    document.addEventListener('visibilitychange',back)
    window.addEventListener('focus',back)
    window.addEventListener('dream-blueprint:cloud',refused)
    return ()=>{document.removeEventListener('visibilitychange',back);window.removeEventListener('focus',back);window.removeEventListener('dream-blueprint:cloud',refused)}
  },[])
  useEffect(()=>{
    if(!cloudReady.current||!driveConnected()||cloudConflict())return
    const t=setTimeout(()=>void saveDriveState(stateJson,localModified()||Date.now()),5000)
    return ()=>clearTimeout(t)
  },[stateJson])
  const memoryJson=JSON.stringify([memoryNotes,readDeleted(state.notes)])
  const driveReady=useRef(!driveConnected())
  useEffect(()=>{
    if(!driveConnected())return
    // The scan dialog brings the cloud's memory itself; saving can start right away.
    if(openedBySync.current){driveReady.current=true;return}
    loadDriveMemory().then(remote=>{
      if(remote)update(s=>{
        const merged=mergeMemory(readMemory(s.notes),readDeleted(s.notes),remote.notes,remote.deleted)
        return {...s,notes:{...writeMemory(s.notes,merged.notes),[memoryDeletedKey]:JSON.stringify(merged.deleted)}}
      })
    }).catch(()=>{}).finally(()=>{driveReady.current=true})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  useEffect(()=>{
    if(!driveReady.current||!driveConnected())return
    const t=setTimeout(()=>{const [list,deleted]=JSON.parse(memoryJson);saveDriveMemory(list,deleted)},1500)
    return ()=>clearTimeout(t)
  },[memoryJson])
  const available=links
  const date=new Date(today+'T12:00:00')
  const dateText=new Intl.DateTimeFormat('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(date)
  const phase=activePeriod(today,state.settings.periods)
  const sorted=state.settings.periods.filter(r=>r.type===phase&&r.start<=today&&(!r.end||r.end>=today)).sort((a,b)=>b.start.localeCompare(a.start))
  const until=sorted[0]?.end
  const status=phase==='exam'&&today>='2029-02-01'&&today<='2029-07-31'?'國考衝刺':phases[phase]
  // In the sidebar 英文練習 is current on its list (and in a lesson), each kind of practice on its own page; on a phone 練習 stands for all of them.
  const isCurrent=(l:typeof links[number],mobile:boolean)=>active===l.id&&(mobile||l.id!=='library'||!libMode)
  const titleNav=(l:typeof links[number],mobile=false)=><button type="button" key={l.id} className={(isCurrent(l,mobile)?'nav-link current':'nav-link')} aria-current={isCurrent(l,mobile)?'page':undefined} onClick={()=>setView(l.id)}><l.icon size={mobile?20:19}/><span>{mobile?l.mobile:l.title}</span>{!mobile&&isCurrent(l,mobile)&&<i/>}</button>
  // Under 英文練習: every kind of practice and 英文口說, one entry each; words and nursing English under a small heading.
  const subCurrent=(id:MenuId)=>id==='speaking'?page==='speaking':libMode===id
  const subNav=menuGroups({periodQuiet,unit:state.curriculum.unit}).flatMap(g=>[
    ...(g.id==='main'||!g.entries.length?[]:[<span className="nav-group" key={'group-'+g.id}>{g.title}</span>]),
    ...g.entries.map(e=>{const Icon=menuIcons[e.id],on=subCurrent(e.id)
      return <button type="button" key={e.id} className={'nav-link nav-sub'+(on?' current':'')} aria-current={on?'page':undefined} onClick={()=>{location.hash=e.hash}}><Icon size={16}/><span>{e.label}</span>{on&&<i/>}</button>})])
  return <MemoryContext.Provider value={memory}><SceneFeatureContext.Provider value={sky?.feature}><div className="application" data-theme={state.settings.theme} data-view={page}>
    <UniverseBackground photo={sky?.background}/>
    <a className="skip-link" href="#content" onClick={e=>{e.preventDefault();document.getElementById('content')?.focus()}}>跳到主要內容</a>
    <aside className="sidebar"><Brand/><div className="sidebar-rule"/>
      <nav aria-label="主要導覽">{available.filter(l=>l.id!=='speaking').map(l=>l.id==='library'?[titleNav(l),<div className="nav-subs" ref={subsRef} role="group" aria-label="英文練習的種類" key="subs">{subNav}</div>]:titleNav(l))}</nav>
      <div className="side-bottom"><button className="destination" onClick={()=>setView('plan','map')}><span className="destination-symbol"><Orbit size={27}/></span><small>我的目的地</small><strong>美國註冊護理師 <ArrowUpRight size={13}/></strong><span>期望抵達 2033–2034</span></button>
      <button className={'nav-link settings-link'+(page==='settings'?' current':'')} onClick={()=>setView('settings')}><Settings2 size={18}/>設定</button>
      <div className="profile"><span>玄</span><div><b>玄燁</b><small>{state.school.schoolName} · {state.school.program}</small></div></div></div>
    </aside>
    <div className="viewport"><div className="mobile-brand"><Brand/><a className="home-link" href="/" title="回到 Body 首頁"><House size={16}/>回首頁</a><button className="icon-control" aria-label="設定" onClick={()=>setView('settings')}><Settings2 size={20}/></button></div>
    <main className="desktop-content" id="content" tabIndex={-1}>
      <header className="global-head"><div>{page==='today'?<><h1>今日航行</h1><p><CalendarDays size={14}/>{dateText}</p></>:libMode||page==='speaking'?<button className="back-home" onClick={()=>setView('library')}><BookOpen size={16}/> 英文練習 <span className="back-context"><ChevronRight size={14}/> {pageName}</span></button>:<button className="back-home" onClick={()=>setView('today')}><Compass size={16}/> 今日航行 <span className="back-context"><ChevronRight size={14}/> {pageName}</span></button>}</div>
      <div className="header-controls"><button className="phase-pill" title="編輯目前時期" onClick={()=>setView('settings')}><i/>{status}{until&&daysBetween(today,until)<32?' · 還有 '+(daysBetween(today,until)+1)+' 天':''}</button>
      <a className="home-link" href="/" title="回到 Body 首頁"><House size={16}/>回首頁</a>
      <button className="icon-control theme-switch" aria-label={state.settings.theme==='dark'?'切換淺色':'切換深色'} title={state.settings.theme==='dark'?'切換淺色':'切換深色'} onClick={()=>update(s=>({...s,settings:{...s.settings,theme:s.settings.theme==='dark'?'light':'dark'}}))}>{state.settings.theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button></div>
      </header>
      {storageError&&<p className="exam-offer" role="status">{storageError}</p>}
      <SyncPaused/>
      {page==='cosmos'?<CosmosGallery {...props} initialPhotoId={route.photoId} onViewerClose={()=>{if(route.photoId)location.replace('#cosmos')}}/>:page==='today'?<Home {...props} today={today} start={start} openWord={()=>setWordOpen(true)}/>:page==='plan'?<Plan key={route.tab} {...props} initialTab={route.tab}/>:page==='practice'?<Practice key={today+route.energy+(route.mode?.startsWith('resume')?':'+route.mode:'')} {...props} energy={route.energy} resume={route.mode==='resume'||(route.mode?.startsWith('resume-')?route.mode.slice(7):false)}/>:page==='library'?<div className="library-page" data-mode={libMode??'menu'}><PracticeCover title={pageName}/>{libMode?<PracticeLibrary {...props} mode={libMode}/>:<><LessonBanner state={state} today={today} start={start}/><PracticeMenu state={state} today={today}/></>}</div>:page==='leveltest'?<div className="library-page" data-mode="test"><PracticeCover title={pageName}/><Baseline state={state} update={update}/></div>:page==='history'?<History {...props}/>:page==='speaking'&&route.mode==='gept'?<GeptSpeaking {...props}/>:page==='speaking'?<Speaking key={route.mode||'chat'} {...props} lessonMode={route.mode==='lesson'} ieltsMode={route.mode==='ielts'} topicMode={route.mode?.startsWith('topic-')?route.mode.slice(6):undefined} packMode={route.mode?.startsWith('pack-')?route.mode.slice(5):undefined} nurseMode={route.mode?.startsWith('nurse-')?route.mode.slice(6):undefined} wordMode={route.mode?.startsWith('word-')?route.mode.slice(5):undefined}/>:<Settings {...props}/>}
    </main></div>
    {page==='today'&&!syncing&&!pairing&&(wordOpen||!state.notes[seenKey(today)])&&<DailyWord state={state} update={update} today={today} onClose={closeWord}/>}
    {/* The level test stays out of sight until it is due; then it pops up here, after 今日單字. */}
    {page==='today'&&!syncing&&!pairing&&!wordOpen&&!!state.notes[seenKey(today)]&&showTestPrompt(state.notes,today)&&<TestPrompt state={state} update={update} today={today}/>}
    {page!=='speaking'&&<AIAssistant key={pairing===null?'k':'p'} progress={handoffText(state,today)}/>}
    {pairing&&<PairReceive payload={pairing} onDone={()=>{clearPairing();setPairing(null)}}/>}
    {syncing&&<SyncReceive code={syncing} onDone={()=>{clearSyncLink();setSyncing(null)}}/>}
    <nav className="mobile-nav" aria-label="行動導覽">{available.map(l=>titleNav(l,true))}</nav>
  </div></SceneFeatureContext.Provider></MemoryContext.Provider>
}
export default App


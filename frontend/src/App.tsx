import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Code2, Dumbbell, Headphones, LayoutDashboard, ListTodo, Moon, Plus, Sun, Trophy, Trash2, Languages, Clock, LogOut, Play, Pause, SkipForward } from "lucide-react";
import { api } from "./api";
import { connectSpotify, disconnectSpotify, finishSpotifyLogin, spotifyGet, spotifyToken, spotifyCommand } from "./spotify";

type Task = {id:number; title:string; category:string; due_date:string|null; priority:string; xp:number; completed:boolean};
type Course = {id:number; name:string; credits:number; teacher:string};
type Dash = {xp:number;level:number;completed_tasks:number;total_tasks:number;course_count:number;streak:number;cumulative_gpa:number|null;earned_credits:number};

export default function App() {
  const [page,setPage] = useState("Dashboard");
  const [tasks,setTasks] = useState<Task[]>([]);
  const [courses,setCourses] = useState<Course[]>([]);
  const [dash,setDash] = useState<Dash>({xp:0,level:1,completed_tasks:0,total_tasks:0,course_count:0,streak:0,cumulative_gpa:null,earned_credits:0});
  const [newTask,setNewTask] = useState("");
  const [newCourse,setNewCourse] = useState("");
  const [courseCredits,setCourseCredits] = useState("3");
  const [gpa,setGpa] = useState("3.5");
  const [gradeCredits,setGradeCredits] = useState("13.5");
  const [notice,setNotice] = useState("");
  const [mood,setMood] = useState("Good");
  const [sleep,setSleep] = useState("8");
  const [wins,setWins] = useState("");
  const [blockers,setBlockers] = useState("");
  const [tomorrow,setTomorrow] = useState("");
  const [spotifyName,setSpotifyName] = useState("");
  const [playlists,setPlaylists] = useState<any[]>([]);
  const [nowPlaying,setNowPlaying] = useState<any>(null);
  const [mode,setMode] = useState("Study");

  async function refresh() {
    const [t,c,d] = await Promise.all([api.tasks(),api.courses(),api.dashboard()]);
    setTasks(t); setCourses(c); setDash(d);
  }
  useEffect(()=>{ refresh().catch(e=>setNotice(String(e))); },[]);
  useEffect(()=>{ finishSpotifyLogin().then(async token=>{
    if (token) { await loadSpotify(); setPage("Music"); }
  }).catch(e=>setNotice(String(e))); },[]);
  async function loadSpotify() {
    try {
      const me = await spotifyGet("me");
      setSpotifyName(me.display_name || me.id);
      const p = await spotifyGet("me/playlists?limit=20");
      setPlaylists(p.items || []);
      const current = await spotifyGet("me/player/currently-playing").catch(()=>null);
      setNowPlaying(current?.item || null);
    } catch(e) { setNotice(String(e)); }
  }
  async function addTask() {
    if (!newTask.trim()) return;
    await api.addTask({title:newTask,category:"University",priority:"medium",xp:20});
    setNewTask(""); await refresh();
  }
  async function toggle(task:Task) { await api.toggleTask(task.id); await refresh(); }
  async function addCourse() {
    if (!newCourse.trim()) return;
    await api.addCourse({name:newCourse,credits:Number(courseCredits)});
    setNewCourse(""); await refresh();
  }
  async function saveCheckin() {
    await api.checkin({mood,sleep_hours:Number(sleep),wins,blockers,tomorrow_focus:tomorrow});
    setNotice("Evening check-in saved. +10 XP!");
    await refresh();
  }
  async function saveGrade() {
    await api.addGrade({term:"Semester record",gpa:Number(gpa),credits:Number(gradeCredits)});
    setNotice("Grade record saved."); await refresh();
  }
  async function enableNotifications() {
    if (!("Notification" in window)) { setNotice("This browser does not support notifications."); return; }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") { setNotice("Notifications were not enabled."); return; }
    setNotice("Notifications enabled. Keep LIFEOS open for scheduled browser reminders.");
    scheduleReminders();
  }
  function scheduleReminders() {
    const schedule = (hour:number,minute:number,title:string,body:string) => {
      const now = new Date(); const next = new Date();
      next.setHours(hour,minute,0,0); if (next <= now) next.setDate(next.getDate()+1);
      window.setTimeout(()=>{ if (Notification.permission==="granted") new Notification(title,{body}); schedule(hour,minute,title,body); },next.getTime()-now.getTime());
    };
    schedule(7,0,"LIFEOS — Morning briefing","Check your courses, priorities and daily missions.");
    schedule(21,30,"LIFEOS — Evening check-in","Review today and prepare tomorrow.");
  }
  const progress = dash.total_tasks ? Math.round(dash.completed_tasks/dash.total_tasks*100) : 0;
  const nav = [
    ["Dashboard",LayoutDashboard],["Tasks",ListTodo],["Courses",BookOpen],["GPA",Trophy],
    ["Languages",Languages],["Computer Science",Code2],["Focus",Clock],["Music",Headphones],["Check-in",Moon]
  ] as const;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon">L</div><div><b>LIFEOS</b><small>PERSONAL PROGRESS SYSTEM</small></div></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map(([name,Icon])=><button key={name} className={`nav-item ${page===name?"active":""}`} onClick={()=>setPage(name)}><Icon size={18}/>{name}</button>)}
      <div className="sidebar-bottom"><div className="level-card"><Trophy size={18}/><b>Level {dash.level}</b><small>{dash.xp} XP earned</small><div className="progress"><i style={{width:`${dash.xp%500/5}%`}}/></div></div><small className="muted">Small progress. Every day.</small></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="muted">YOUR PERSONAL COMMAND CENTER</span><h1>{page}</h1></div><button className="outline" onClick={enableNotifications}><Sun size={16}/> Enable reminders</button></header>
      {notice && <div className="notice" onClick={()=>setNotice("")}>{notice} <span>×</span></div>}
      {page==="Dashboard" && <><section className="welcome"><div><span className="eyebrow">YOUR JOURNEY, YOUR RULES</span><h2>Build your future.</h2><p>One focused day at a time. Let's make today count.</p></div><div className="date-pill">{new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}</div></section>
        <section className="stats"><Stat label="TOTAL XP" value={dash.xp} icon={<Trophy/>}/><Stat label="CURRENT LEVEL" value={dash.level} icon={<CheckCircle2/>}/><Stat label="TASKS COMPLETED" value={`${dash.completed_tasks}/${dash.total_tasks}`} icon={<ListTodo/>}/><Stat label="CUMULATIVE GPA" value={dash.cumulative_gpa?.toFixed(2) ?? "—"} icon={<BookOpen/>}/></section>
        <div className="grid-two"><section className="panel"><PanelTitle title="Today's missions" sub={`${progress}% completed`}/><div className="progress large"><i style={{width:`${progress}%`}}/></div>{tasks.slice(0,6).map(t=><TaskRow key={t.id} task={t} toggle={()=>toggle(t)}/>)}{tasks.length===0&&<Empty text="Add your first task to get started."/>}<button className="text-button" onClick={()=>setPage("Tasks")}>View all tasks →</button></section>
        <section className="panel"><PanelTitle title="Your progress" sub="Keep showing up"/><div className="big-xp">{dash.xp}<small> XP</small></div><p className="muted">You need {500-(dash.xp%500)} XP to reach the next level.</p><div className="mini-row"><span>Courses</span><b>{dash.course_count}</b></div><div className="mini-row"><span>Earned credits recorded</span><b>{dash.earned_credits}</b></div><div className="mini-row"><span>Daily streak</span><b>{dash.streak} days</b></div></section></div></>}
      {page==="Tasks" && <section className="panel"><PanelTitle title="Task manager" sub="Your priorities, assignments and daily actions"/><div className="form-row"><input value={newTask} onChange={e=>setNewTask(e.target.value)} placeholder="What needs to get done?"/><button className="primary" onClick={addTask}><Plus size={16}/> Add task</button></div>{tasks.map(t=><TaskRow key={t.id} task={t} toggle={()=>toggle(t)} remove={async()=>{await api.deleteTask(t.id);await refresh();}}/>)}{tasks.length===0&&<Empty text="No tasks yet. Add one above."/>}</section>}
      {page==="Courses" && <section className="panel"><PanelTitle title="University courses" sub="Organize your semester and credit load"/><div className="form-row"><input value={newCourse} onChange={e=>setNewCourse(e.target.value)} placeholder="Course name"/><input className="short" type="number" value={courseCredits} onChange={e=>setCourseCredits(e.target.value)} placeholder="Credits"/><button className="primary" onClick={addCourse}><Plus size={16}/> Add</button></div>{courses.map(c=><div className="list-row" key={c.id}><div><b>{c.name}</b><small>{c.credits} credits</small></div><button className="icon-button" onClick={async()=>{await api.deleteCourse(c.id);await refresh();}}><Trash2 size={16}/></button></div>)}{courses.length===0&&<Empty text="Add your current semester courses."/>}</section>}
      {page==="GPA" && <section className="panel"><PanelTitle title="GPA tracker" sub="Cumulative GPA is calculated by credit-weighted records"/><div className="callout">Formula: Σ (semester GPA × semester credits) ÷ Σ semester credits. Add each semester only once.</div><div className="form-row"><input type="number" min="0" max="4" step=".01" value={gpa} onChange={e=>setGpa(e.target.value)} placeholder="Semester GPA"/><input type="number" min=".1" step=".5" value={gradeCredits} onChange={e=>setGradeCredits(e.target.value)} placeholder="Credits"/><button className="primary" onClick={saveGrade}>Save semester</button></div><h2>{dash.cumulative_gpa?.toFixed(2) ?? "No GPA records yet"}</h2><p className="muted">Recorded credits: {dash.earned_credits}. Keep your transcript figures accurate.</p></section>}
      {page==="Check-in" && <section className="panel"><PanelTitle title="Evening check-in" sub="Balanced coach · reflect without guilt"/><label>How are you feeling?<select value={mood} onChange={e=>setMood(e.target.value)}>{["Great","Good","Okay","Tired","Stressed"].map(x=><option>{x}</option>)}</select></label><label>Hours of sleep<input type="number" value={sleep} onChange={e=>setSleep(e.target.value)}/></label><label>What went well today?<textarea value={wins} onChange={e=>setWins(e.target.value)} placeholder="Your wins, even small ones..."/></label><label>What got in your way?<textarea value={blockers} onChange={e=>setBlockers(e.target.value)} placeholder="Distractions or unfinished tasks..."/></label><label>Tomorrow's main focus<textarea value={tomorrow} onChange={e=>setTomorrow(e.target.value)} placeholder="What matters most tomorrow?"/></label><button className="primary" onClick={saveCheckin}>Save check-in · +10 XP</button></section>}
      {page==="Music" && <section className="panel"><PanelTitle title="LIFEOS Music" sub="Your soundtrack for every mode"/><div className="mode-grid">{["Study","Coding","Gym","Relax"].map((m,i)=><button className={`mode ${mode===m?"selected":""}`} onClick={()=>setMode(m)}>{[<BookOpen/>,<Code2/>,<Dumbbell/>,<Moon/>][i]}{m}</button>)}</div><div className="spotify-card"><div className="spotify-logo">●</div><div className="grow"><b>{spotifyName?`Connected: ${spotifyName}`:"Connect your Spotify account"}</b><small>OAuth authorization · no Spotify password stored</small></div>{spotifyToken()?<button className="outline" onClick={()=>{disconnectSpotify();setSpotifyName("");setPlaylists([]);setNowPlaying(null);}}>Disconnect</button>:<button className="primary" onClick={()=>connectSpotify().catch(e=>setNotice(String(e)))}>Connect Spotify</button>}</div>{spotifyToken()&&<><h3>Your playlists</h3>{playlists.map(p=><div className="list-row" key={p.id}><div><b>{p.name}</b><small>{p.tracks?.total ?? 0} tracks</small></div><a href={p.external_urls?.spotify} target="_blank" rel="noreferrer">Open in Spotify ↗</a></div>)}<h3>Playback controls</h3><div className="now-playing">{nowPlaying?<><b>{nowPlaying.name}</b><small>{nowPlaying.artists?.map((a:any)=>a.name).join(", ")}</small></>:"No current track detected. Start Spotify on a device first."}<div className="player-buttons"><button className="outline" onClick={()=>spotifyCommand("me/player/pause").catch(e=>setNotice(String(e)))}><Pause size={16}/></button><button className="outline" onClick={()=>spotifyCommand("me/player/play").catch(e=>setNotice(String(e)))}><Play size={16}/></button><button className="outline" onClick={()=>spotifyCommand("me/player/next","POST").catch(e=>setNotice(String(e)))}><SkipForward size={16}/></button><button className="outline" onClick={()=>loadSpotify().catch(e=>setNotice(String(e)))}>Refresh</button></div></div></>}</section>}
      {page==="Focus" && <FocusPanel/>}
      {page==="Languages" && <section className="panel"><PanelTitle title="Language journey" sub="Track your practice consistently"/>{[["Chinese","HSK 4 · speaking, listening, reading, writing"],["English","C1 · speaking, listening, reading, writing"],["French","Rebuild foundations · communication"]].map(([a,b])=><div className="list-row"><div><b>{a}</b><small>{b}</small></div><span className="tag">In progress</span></div>)}</section>}
      {page==="Computer Science" && <section className="panel"><PanelTitle title="Computer Science roadmap" sub="Build foundations first. Specialize later."/>{["Python","Discrete Mathematics","Data Structures","Algorithms","Java & OOP","C++","Computer Architecture","Operating Systems","Databases","Computer Networks","Projects & portfolio","Explore specializations"].map((x,i)=><div className="list-row"><div><b>{i+1}. {x}</b><small>{i<4?"Foundations":i<10?"Core CS":"Advanced exploration"}</small></div><span className="tag">{i===0?"Start here":"Planned"}</span></div>)}</section>}
      <footer>LIFEOS · Build your future, one day at a time.</footer>
    </main>
  </div>;
}
function Stat({label,value,icon}:{label:string;value:any;icon:any}) {return <div className="stat"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong></div>}
function PanelTitle({title,sub}:{title:string;sub:string}) {return <div className="panel-title"><div><h2>{title}</h2><p>{sub}</p></div></div>}
function Empty({text}:{text:string}) {return <div className="empty">{text}</div>}
function TaskRow({task,toggle,remove}:{task:Task;toggle:()=>void;remove?:()=>void}) {return <div className={`task-row ${task.completed?"done":""}`}><button className="check" onClick={toggle}>{task.completed?<CheckCircle2 size={19}/>:<span/>}</button><div className="grow"><b>{task.title}</b><small>{task.category} · {task.priority} priority · +{task.xp} XP</small></div>{task.due_date&&<small>{task.due_date}</small>}{remove&&<button className="icon-button" onClick={remove}><Trash2 size={16}/></button>}</div>}
function FocusPanel() {
  const [seconds,setSeconds]=useState(25*60); const [running,setRunning]=useState(false); const [mode,setMode]=useState("Focus");
  useEffect(()=>{if(!running)return;const id=window.setInterval(()=>setSeconds(s=>{if(s<=1){setRunning(false);if(Notification.permission==="granted")new Notification("LIFEOS Focus",{body:"Session complete. Take a short break."});return 0;}return s-1;}),1000);return()=>clearInterval(id);},[running]);
  const mins=String(Math.floor(seconds/60)).padStart(2,"0"),secs=String(seconds%60).padStart(2,"0");
  function choose(m:string){setMode(m);setRunning(false);setSeconds(m==="Focus"?1500:300);}
  return <section className="panel focus-panel"><PanelTitle title="Focus room" sub="One task. One session. No distractions."/><div className="mode-grid"><button className={`mode ${mode==="Focus"?"selected":""}`} onClick={()=>choose("Focus")}>Focus · 25 min</button><button className={`mode ${mode==="Break"?"selected":""}`} onClick={()=>choose("Break")}>Break · 5 min</button></div><div className="timer">{mins}:{secs}</div><div className="player-buttons"><button className="primary" onClick={()=>setRunning(!running)}>{running?"Pause":"Start session"}</button><button className="outline" onClick={()=>{setRunning(false);setSeconds(mode==="Focus"?1500:300);}}>Reset</button></div></section>
}

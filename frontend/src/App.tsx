import { CalendarDays, GraduationCap, Grid3x3, Home, Timer } from "lucide-react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Field, OverlayHost, Sheet, toast } from "./components/ui";
import { store, useStore } from "./db/store";
import { syncChallengeXp } from "./lib/actions";
import { evaluateAchievements } from "./lib/gamification";
import { todayISO } from "./lib/date";
import { checkTimer, getTimer, playChime } from "./lib/timer";
import type { LangCode } from "./lib/types";
import { isNative, requestNotificationPermission, syncDailyReminders } from "./native/notifications";
import { applySystemBars, haptic } from "./native/platform";
import { go, useRoute } from "./router";
import { CheckInHistory, EveningCheckIn, MorningCheckIn } from "./pages/CheckIn";
import ComputerScience, { TopicDetail } from "./pages/ComputerScience";
import Dashboard from "./pages/Dashboard";
import Fitness from "./pages/Fitness";
import Focus from "./pages/Focus";
import Habits from "./pages/Habits";
import Languages, { LanguageDetail } from "./pages/Languages";
import More from "./pages/More";
import Music from "./pages/Music";
import Planner from "./pages/Planner";
import Progress from "./pages/Progress";
import Settings from "./pages/Settings";
import Tasks from "./pages/Tasks";
import University, { CourseDetail } from "./pages/University";

const NAV = [
  { path: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { path: "/plan", label: "Plan", icon: CalendarDays, match: (p: string) => p.startsWith("/plan") || p.startsWith("/tasks") || p.startsWith("/checkin") },
  { path: "/uni", label: "Uni", icon: GraduationCap, match: (p: string) => p.startsWith("/uni") },
  { path: "/focus", label: "Focus", icon: Timer, match: (p: string) => p.startsWith("/focus") },
  { path: "/more", label: "More", icon: Grid3x3, match: (p: string) => !["/", "/focus"].includes(p) && !/^\/(plan|tasks|checkin|uni)/.test(p) },
];

function Screen() {
  const { path, parts } = useRoute();
  if (path === "/") return <Dashboard />;
  if (path === "/tasks") return <Tasks />;
  if (path === "/plan") return <Planner />;
  if (path === "/checkin/morning") return <MorningCheckIn />;
  if (path === "/checkin/evening") return <EveningCheckIn />;
  if (path === "/checkin") return <CheckInHistory />;
  if (parts[0] === "uni" && parts[1] === "course" && parts[2]) return <CourseDetail id={parts[2]} />;
  if (parts[0] === "uni") return <University />;
  if (parts[0] === "cs" && parts[1] === "topic" && parts[2]) return <TopicDetail id={parts[2]} />;
  if (parts[0] === "cs") return <ComputerScience />;
  if (parts[0] === "lang" && parts[1]) return <LanguageDetail code={parts[1] as LangCode} />;
  if (path === "/lang") return <Languages />;
  if (path === "/fitness") return <Fitness />;
  if (path === "/habits") return <Habits />;
  if (path === "/focus") return <Focus />;
  if (path === "/xp") return <Progress />;
  if (path === "/music") return <Music />;
  if (path === "/settings") return <Settings />;
  if (path === "/more") return <More />;
  return <Dashboard />;
}

class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }
  render() {
    if (this.state.error)
      return (
        <div className="screen">
          <div className="banner danger" style={{ marginTop: 40 }}>
            <div>
              <b>Something went wrong on this screen.</b>
              <div className="small">{this.state.error.message}</div>
              <div className="small">Your data is safe. Go back and try again.</div>
            </div>
          </div>
          <button className="btn block mt" onClick={() => go("/", { replace: true })}>
            Go home
          </button>
        </div>
      );
    return this.props.children;
  }
}

function useTheme() {
  const theme = useStore().settings.theme;
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b0f19" : "#f4f6fb");
      void applySystemBars(dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
}

/** Checks the focus timer each second while it runs; handles completion. */
function useTimerWatcher() {
  const s = useStore();
  const active = !!getTimer(s) && !getTimer(s)!.paused;
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => runTimerCheck(), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function runTimerCheck() {
  const res = checkTimer(store());
  if (!res) return;
  if (store().settings.focusSound && document.visibilityState === "visible") playChime();
  void haptic("success");
  toast(res.finished.kind === "focus" ? `Focus session complete${res.xp ? ` · +${res.xp} XP` : ""}. Time for a ${res.next === "long_break" ? "long" : "short"} break.` : "Break over. Ready to focus?", res.xp ? "xp" : "info");
}

let lastDay = todayISO();
export function onAppResume() {
  runTimerCheck();
  void syncDailyReminders(store().settings).catch(() => undefined);
  const d = todayISO();
  if (d !== lastDay) {
    lastDay = d;
    syncChallengeXp(store());
  }
}

function Onboarding() {
  const s = useStore();
  const [name, setName] = useState(s.settings.name);
  const open = !s.settings.onboarded;
  const finish = async (askNotif: boolean) => {
    s.saveSettings({ name: name.trim(), onboarded: true });
    if (askNotif && isNative()) {
      const ok = await requestNotificationPermission();
      const r = await syncDailyReminders(store().settings).catch(() => null);
      toast(ok ? `Reminders on at ${s.settings.morningTime} and ${s.settings.eveningTime}${r && !r.exact ? " (approximate timing)" : ""}` : "Notifications stay off. You can enable them later in Settings.");
    }
  };
  return (
    <Sheet open={open} onClose={() => finish(false)} title="Welcome to LIFEOS">
      <p className="muted">Your personal operating system for university, programming, languages, fitness and habits. Everything is stored privately on this phone and works offline.</p>
      <div className="mt-l">
        <Field label="What should LIFEOS call you?">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} />
        </Field>
      </div>
      <div className="banner info">
        <div>
          LIFEOS can remind you at <b>{s.settings.morningTime}</b> to plan your day and at <b>{s.settings.eveningTime}</b> for your evening check-in. You can change or turn these off anytime in Settings.
        </div>
      </div>
      <button className="btn primary block mt-l" onClick={() => finish(true)}>
        {isNative() ? "Continue & enable reminders" : "Get started"}
      </button>
      {isNative() && (
        <button className="btn ghost block mt" onClick={() => finish(false)}>
          Not now
        </button>
      )}
    </Sheet>
  );
}

/** Unlock achievements whenever data changes (debounced), wherever the change came from. */
function useAchievementWatcher() {
  useEffect(() => {
    let t: number | undefined;
    const unsub = store().subscribe(() => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        for (const a of evaluateAchievements(store())) toast(`🏅 Achievement unlocked: ${a.title}`, "xp");
      }, 400);
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);
}

export default function App() {
  const { path } = useRoute();
  useTheme();
  useTimerWatcher();
  useAchievementWatcher();
  return (
    <div className="app">
      <ErrorBoundary resetKey={path}>
        <Screen />
      </ErrorBoundary>
      <nav className="bottom-nav" aria-label="Main">
        {NAV.map((n) => (
          <button key={n.path} className={n.match(path) ? "active" : ""} onClick={() => go(n.path)} aria-current={n.match(path) ? "page" : undefined}>
            <span className="pill">
              <n.icon size={22} />
            </span>
            {n.label}
          </button>
        ))}
      </nav>
      <Onboarding />
      <OverlayHost />
    </div>
  );
}

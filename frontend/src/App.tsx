import { CalendarDays, GraduationCap, Grid3x3, Home, Timer } from "lucide-react";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Field, OverlayHost, Sheet, toast } from "./components/ui";
import { store, useStore } from "./db/store";
import { currentLanguage, t, type TKey } from "./i18n";
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
import Settings, { LanguagePicker } from "./pages/Settings";
import Tasks from "./pages/Tasks";
import University, { CourseDetail } from "./pages/University";

const NAV: { path: string; label: TKey; icon: typeof Home; match: (p: string) => boolean }[] = [
  { path: "/", label: "nav.home", icon: Home, match: (p) => p === "/" },
  { path: "/plan", label: "nav.plan", icon: CalendarDays, match: (p) => p.startsWith("/plan") || p.startsWith("/tasks") || p.startsWith("/checkin") },
  { path: "/uni", label: "nav.uni", icon: GraduationCap, match: (p) => p.startsWith("/uni") },
  { path: "/focus", label: "nav.focus", icon: Timer, match: (p) => p.startsWith("/focus") },
  { path: "/more", label: "nav.more", icon: Grid3x3, match: (p) => !["/", "/focus"].includes(p) && !/^\/(plan|tasks|checkin|uni)/.test(p) },
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
              <b>{t("common.somethingWrong")}</b>
              <div className="small">{this.state.error.message}</div>
              <div className="small">{t("common.dataSafe")}</div>
            </div>
          </div>
          <button className="btn block mt" onClick={() => go("/", { replace: true })}>
            {t("common.goHome")}
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
  if (res.finished.kind === "focus") toast(res.xp ? t("focus.doneToastXp", { n: res.xp }) : t("focus.doneToast"), res.xp ? "xp" : "info");
  else toast(t("focus.breakOver"));
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
      const times = { m: s.settings.morningTime, e: s.settings.eveningTime };
      toast(ok ? t("onb.remindersOn", times) + (r && !r.exact ? t("onb.approx") : "") : t("onb.remindersOffToast"));
    }
  };
  return (
    <Sheet open={open} onClose={() => finish(false)} title={t("onb.title")}>
      <Field label="🌐">
        <LanguagePicker />
      </Field>
      <p className="muted">{t("onb.intro")}</p>
      <div className="mt-l">
        <Field label={t("onb.name")}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("onb.namePh")} maxLength={40} />
        </Field>
      </div>
      <div className="banner info">
        <div>{t("onb.reminders", { m: s.settings.morningTime, e: s.settings.eveningTime })}</div>
      </div>
      <button className="btn primary block mt-l" onClick={() => finish(true)}>
        {isNative() ? t("onb.continueReminders") : t("onb.start")}
      </button>
      {isNative() && (
        <button className="btn ghost block mt" onClick={() => finish(false)}>
          {t("common.notNow")}
        </button>
      )}
    </Sheet>
  );
}

/** Unlock achievements whenever data changes (debounced), wherever the change came from. */
function useAchievementWatcher() {
  useEffect(() => {
    let timer: number | undefined;
    const unsub = store().subscribe(() => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        for (const a of evaluateAchievements(store())) toast(t("toast.achievement", { title: a.title }), "xp");
      }, 400);
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, []);
}

export default function App() {
  const { path } = useRoute();
  useTheme();
  useTimerWatcher();
  useAchievementWatcher();
  // Remount the UI when the language changes so every screen re-renders its text.
  return (
    <div className="app" key={currentLanguage()}>
      <ErrorBoundary resetKey={path}>
        <Screen />
      </ErrorBoundary>
      <nav className="bottom-nav" aria-label={t("a11y.nav")}>
        {NAV.map((n) => (
          <button key={n.path} className={n.match(path) ? "active" : ""} onClick={() => go(n.path)} aria-current={n.match(path) ? "page" : undefined}>
            <span className="pill">
              <n.icon size={22} />
            </span>
            {t(n.label)}
          </button>
        ))}
      </nav>
      <Onboarding />
      <OverlayHost />
    </div>
  );
}

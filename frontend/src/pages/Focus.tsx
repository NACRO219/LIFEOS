import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "../components/charts";
import { Card, Empty, Field, NumberInput, Page, Ring, Section, Segmented, Stat } from "../components/ui";
import { store, useStore } from "../db/store";
import { addDays, formatDuration, prettyDay, todayISO, WEEKDAYS, weekday } from "../lib/date";
import { isOpen } from "../lib/planner";
import { focusMinutes } from "../lib/stats";
import { getTimer, pauseTimer, remainingMs, resetTimer, resumeTimer, startTimer } from "../lib/timer";
import type { ActiveTimer } from "../lib/types";

const KIND_LABEL: Record<ActiveTimer["kind"], string> = { focus: "Focus", short_break: "Short break", long_break: "Long break" };

export default function Focus() {
  const s = useStore();
  const settings = s.settings;
  const timer = getTimer(s);
  const [, force] = useState(0);
  const [kind, setKind] = useState<ActiveTimer["kind"]>("focus");
  const [custom, setCustom] = useState<number | null>(null);
  const [taskId, setTaskId] = useState<string>("");
  const today = todayISO();

  useEffect(() => {
    if (!timer || timer.paused) return;
    const id = window.setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [timer]);

  const minutesFor = (k: ActiveTimer["kind"]) => (k === "focus" ? settings.focusMin : k === "short_break" ? settings.shortBreakMin : settings.longBreakMin);
  const planned = timer ? timer.plannedMin : custom ?? minutesFor(kind);
  const rem = timer ? remainingMs(timer) : planned * 60000;
  const mm = Math.floor(rem / 60000);
  const ss = Math.floor((rem % 60000) / 1000);
  const progress = timer ? 1 - rem / (timer.plannedMin * 60000) : 0;
  const cycle = s.getKv<number>("timerCycle") ?? 0;
  const openTasks = s.all("tasks").filter(isOpen);

  const start = () => {
    const t = openTasks.find((x) => x.id === taskId);
    startTimer(store(), { kind, minutes: planned, taskId: t?.id ?? null, label: t?.title ?? "", cycle });
  };

  const sessions = [...s.all("focusSessions")].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ label: WEEKDAYS[weekday(d)], value: focusMinutes(s, d) }));
  const weekTotal = week.reduce((a, d) => a + d.value, 0);
  const completedFocus = sessions.filter((x) => x.kind === "focus" && x.completed).length;

  return (
    <Page title="Focus" eyebrow={`Cycle ${cycle % Math.max(2, settings.longBreakEvery)}/${settings.longBreakEvery} until long break`}>
      <Card>
        {!timer && <Segmented value={kind} onChange={(k) => { setKind(k); setCustom(null); }} options={[{ value: "focus", label: `Focus ${settings.focusMin}` }, { value: "short_break", label: `Break ${settings.shortBreakMin}` }, { value: "long_break", label: `Long ${settings.longBreakMin}` }]} />}
        <div className="col" style={{ alignItems: "center", padding: "18px 0 8px" }}>
          <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <Ring value={progress} size={240} stroke={10} label="" color={timer?.kind === "focus" || (!timer && kind === "focus") ? "var(--accent)" : "var(--success)"} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div className="timer-face">
                {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
              </div>
              <div className="small muted mt">{timer ? `${KIND_LABEL[timer.kind]}${timer.paused ? " · paused" : ""}` : KIND_LABEL[kind]}</div>
              {timer?.label && <div className="small faint ellipsis" style={{ maxWidth: 180 }}>{timer.label}</div>}
            </div>
          </div>
        </div>
        {!timer ? (
          <>
            <div className="grid-2">
              <Field label="Custom minutes">
                <NumberInput value={custom} min={1} max={240} placeholder={String(minutesFor(kind))} onChange={setCustom} />
              </Field>
              {kind === "focus" && (
                <Field label="Working on">
                  <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    <option value="">No specific task</option>
                    {openTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <button className="btn primary block" style={{ height: 54, fontSize: 17 }} onClick={start}>
              <Play size={20} /> Start
            </button>
          </>
        ) : (
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => resetTimer(store())} aria-label="Reset">
              <RotateCcw size={18} /> Reset
            </button>
            {timer.paused ? (
              <button className="btn primary" style={{ minWidth: 140 }} onClick={() => resumeTimer(store())}>
                <Play size={18} /> Resume
              </button>
            ) : (
              <button className="btn primary" style={{ minWidth: 140 }} onClick={() => pauseTimer(store())}>
                <Pause size={18} /> Pause
              </button>
            )}
          </div>
        )}
        <p className="faint small center mt">The timer keeps running when you leave the app{settings.focusEndNotification ? ", and you'll get a notification when it ends." : "."}</p>
      </Card>

      <Section title="Statistics">
        <div className="grid-3">
          <Stat label="Today" value={formatDuration(focusMinutes(s, today))} />
          <Stat label="7 days" value={formatDuration(weekTotal)} />
          <Stat label="Sessions" value={completedFocus} sub="completed" />
        </div>
        <Card className="mt">
          <BarChart data={week} unit=" min" goal={settings.dailyGoals.focusMin} />
          <small className="faint">Dashed line: daily focus goal ({settings.dailyGoals.focusMin} min)</small>
        </Card>
      </Section>

      <Section title="History">
        <Card className="tight">
          {sessions.length ? (
            <div className="list">
              {sessions.slice(0, 30).map((f) => (
                <div key={f.id} className="list-item">
                  <Timer size={18} className="faint" />
                  <div className="grow">
                    <div className="title">
                      {KIND_LABEL[f.kind]} · {f.actualMin} min
                    </div>
                    <div className="sub">
                      {prettyDay(f.date)} {new Date(f.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {f.label ? ` · ${f.label}` : ""}
                    </div>
                  </div>
                  <span className={`tag ${f.completed ? "success" : ""}`}>{f.completed ? "Completed" : "Stopped early"}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Timer />} title="No sessions yet" text="Finished and stopped sessions are recorded here." />
          )}
        </Card>
      </Section>
    </Page>
  );
}

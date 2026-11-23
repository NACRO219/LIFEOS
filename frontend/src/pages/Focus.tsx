import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "../components/charts";
import { Card, Empty, Field, NumberInput, Page, Ring, Section, Segmented, Stat } from "../components/ui";
import { store, useStore } from "../db/store";
import { intlLocale, t } from "../i18n";
import { addDays, formatDuration, prettyDay, todayISO, weekday, weekdayShort } from "../lib/date";
import { isOpen } from "../lib/planner";
import { focusMinutes } from "../lib/stats";
import { getTimer, pauseTimer, remainingMs, resetTimer, resumeTimer, startTimer } from "../lib/timer";
import type { ActiveTimer } from "../lib/types";

const kindLabel = (k: ActiveTimer["kind"]) => t(`timer.${k}`);

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
    const x = openTasks.find((y) => y.id === taskId);
    startTimer(store(), { kind, minutes: planned, taskId: x?.id ?? null, label: x?.title ?? "", cycle });
  };

  const sessions = [...s.all("focusSessions")].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ label: weekdayShort(weekday(d)), value: focusMinutes(s, d) }));
  const weekTotal = week.reduce((a, d) => a + d.value, 0);
  const completedFocus = sessions.filter((x) => x.kind === "focus" && x.completed).length;

  return (
    <Page title={t("focus.title")} eyebrow={t("focus.cycle", { n: cycle % Math.max(2, settings.longBreakEvery), every: settings.longBreakEvery })}>
      <Card>
        {!timer && (
          <Segmented
            value={kind}
            onChange={(k) => {
              setKind(k);
              setCustom(null);
            }}
            options={[
              { value: "focus", label: t("focus.focusN", { n: settings.focusMin }) },
              { value: "short_break", label: t("focus.breakN", { n: settings.shortBreakMin }) },
              { value: "long_break", label: t("focus.longN", { n: settings.longBreakMin }) },
            ]}
          />
        )}
        <div className="col" style={{ alignItems: "center", padding: "18px 0 8px" }}>
          <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <Ring value={progress} size={240} stroke={10} label="" color={timer?.kind === "focus" || (!timer && kind === "focus") ? "var(--accent)" : "var(--success)"} />
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div className="timer-face" dir="ltr">
                {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
              </div>
              <div className="small muted mt">{timer ? `${kindLabel(timer.kind)}${timer.paused ? ` · ${t("focus.paused")}` : ""}` : kindLabel(kind)}</div>
              {timer?.label && (
                <div className="small faint ellipsis" style={{ maxWidth: 180 }}>
                  {timer.label}
                </div>
              )}
            </div>
          </div>
        </div>
        {!timer ? (
          <>
            <div className="grid-2">
              <Field label={t("focus.custom")}>
                <NumberInput value={custom} min={1} max={240} placeholder={String(minutesFor(kind))} onChange={setCustom} />
              </Field>
              {kind === "focus" && (
                <Field label={t("focus.workingOn")}>
                  <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    <option value="">{t("focus.noTask")}</option>
                    {openTasks.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <button className="btn primary block" style={{ height: 54, fontSize: 17 }} onClick={start}>
              <Play size={20} /> {t("focus.start")}
            </button>
          </>
        ) : (
          <div className="row" style={{ justifyContent: "center" }}>
            <button className="btn" onClick={() => resetTimer(store())}>
              <RotateCcw size={18} /> {t("focus.reset")}
            </button>
            {timer.paused ? (
              <button className="btn primary" style={{ minWidth: 140 }} onClick={() => resumeTimer(store())}>
                <Play size={18} /> {t("focus.resume")}
              </button>
            ) : (
              <button className="btn primary" style={{ minWidth: 140 }} onClick={() => pauseTimer(store())}>
                <Pause size={18} /> {t("focus.pause")}
              </button>
            )}
          </div>
        )}
        <p className="faint small center mt">{settings.focusEndNotification ? t("focus.keepsRunningNotif") : t("focus.keepsRunning")}</p>
      </Card>

      <Section title={t("focus.stats")}>
        <div className="grid-3">
          <Stat label={t("focus.today")} value={formatDuration(focusMinutes(s, today))} />
          <Stat label={t("focus.days7")} value={formatDuration(weekTotal)} />
          <Stat label={t("focus.sessions")} value={completedFocus} sub={t("focus.completed")} />
        </div>
        <Card className="mt">
          <BarChart data={week} unit=" min" goal={settings.dailyGoals.focusMin} />
          <small className="faint">{t("focus.goalLine", { n: settings.dailyGoals.focusMin })}</small>
        </Card>
      </Section>

      <Section title={t("focus.history")}>
        <Card className="tight">
          {sessions.length ? (
            <div className="list">
              {sessions.slice(0, 30).map((f) => (
                <div key={f.id} className="list-item">
                  <Timer size={18} className="faint" />
                  <div className="grow">
                    <div className="title">{t("focus.sessionLine", { kind: kindLabel(f.kind), n: f.actualMin })}</div>
                    <div className="sub">
                      {prettyDay(f.date)} {new Date(f.startedAt).toLocaleTimeString(intlLocale(), { hour: "2-digit", minute: "2-digit" })}
                      {f.label ? ` · ${f.label}` : ""}
                    </div>
                  </div>
                  <span className={`tag ${f.completed ? "success" : ""}`}>{f.completed ? t("focus.complete") : t("focus.stoppedEarly")}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Timer />} title={t("focus.noSessions")} text={t("focus.noSessionsHint")} />
          )}
        </Card>
      </Section>
    </Page>
  );
}

import { Bell, BookOpen, CalendarClock, Code2, Dumbbell, Flame, GraduationCap, Languages, Plus, Sparkles, Target, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { TaskRow, TaskSheet } from "../components/tasks";
import { Bar, Card, Empty, Page, Ring, Section, Stat } from "../components/ui";
import { useStore } from "../db/store";
import { t } from "../i18n";
import { addDays, diffDays, localDay, formatDuration, greeting, nowMinutes, prettyDay, relativeDay, timeToMin, todayISO } from "../lib/date";
import { dailyChallenges } from "../lib/gamification";
import { formatGpa, gpaSummary } from "../lib/gpa";
import { isOpen, rankTasks } from "../lib/planner";
import { activeDays, csProgress, dailyCompletion, focusMinutes, languageMinutes, levelInfo, solvedExercises, streakFrom, todaysTasks, totalXp, weekRange, workoutsBetween } from "../lib/stats";
import type { Task } from "../lib/types";
import { getNotificationStatus, type NotificationStatus } from "../native/notifications";
import { go } from "../router";

export default function Dashboard() {
  const s = useStore();
  const settings = s.settings;
  const today = todayISO();
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [notif, setNotif] = useState<NotificationStatus | null>(null);
  useEffect(() => {
    getNotificationStatus().then(setNotif).catch(() => undefined);
  }, []);

  const xp = totalXp(s);
  const lvl = levelInfo(xp, settings.levelXp);
  const streak = streakFrom(activeDays(s), today);
  const completion = dailyCompletion(s, today);
  const plan = s.get("dayPlans", today);
  const priorities = (plan?.priorityTaskIds ?? []).map((id) => s.get("tasks", id)).filter(Boolean) as Task[];
  const todayList = todaysTasks(s, today).sort((a, b) => Number(a.status === "done") - Number(b.status === "done"));
  const suggestions = priorities.length ? [] : rankTasks(s.all("tasks"), today, s.all("courses")).slice(0, 3);
  const gpa = gpaSummary(s.all("courses"), s.all("assessments"), s.all("semesterRecords"), settings.gradingScale);
  const cs = csProgress(s);
  const { from: wFrom, to: wTo } = weekRange(today);
  const codeWeek = solvedExercises(s, wFrom, wTo).length;
  const langToday = languageMinutes(s, today);
  const gymWeek = workoutsBetween(s, wFrom, wTo).length;
  const focusToday = focusMinutes(s, today);
  const courses = s.all("courses");
  const activeCourses = courses.filter((c) => c.status === "in_progress");
  const uniOpen = s.all("tasks").filter((x) => x.category === "University" && isOpen(x)).length;
  const uniDoneWeek = s.all("tasks").filter((x) => x.category === "University" && x.status === "done" && x.completedAt && localDay(x.completedAt) >= wFrom).length;

  // Upcoming deadlines (next 14 days) — tasks and exams
  const horizon = addDays(today, 14);
  const deadlines = [
    ...s
      .all("tasks")
      .filter((x) => isOpen(x) && x.deadline && x.deadline <= horizon)
      .map((x) => ({ id: x.id, title: x.title, date: x.deadline!, kind: x.kind === "assignment" ? t("kind.assignment") : t("kind.task"), color: courses.find((c) => c.id === x.courseId)?.color })),
    ...courses.flatMap((c) => c.exams.filter((e) => e.date >= today && e.date <= horizon).map((e) => ({ id: e.id, title: `${e.title} · ${c.code || c.name}`, date: e.date, kind: t("dash.exam"), color: c.color }))),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Next scheduled reminder
  const now = nowMinutes();
  const reminders = [
    settings.morningEnabled && { label: t("dash.morningPlan"), time: settings.morningTime },
    settings.eveningEnabled && { label: t("dash.eveningCheckin"), time: settings.eveningTime },
  ].filter(Boolean) as { label: string; time: string }[];
  const nextRem = reminders.map((r) => ({ ...r, inMin: (timeToMin(r.time) - now + 1440) % 1440 })).sort((a, b) => a.inMin - b.inMin)[0];
  const challenges = dailyChallenges(s, today);

  return (
    <Page title={`${greeting()}${settings.name ? `, ${settings.name}` : ""}`} eyebrow={prettyDay(today, { weekday: "long", month: "long", day: "numeric" })}>
      <Card className="accent">
        <div className="row gap-l">
          <Ring value={completion.percent} size={88} stroke={9} color="#fff" track="rgba(255,255,255,.25)" />
          <div className="grow col gap-s">
            <div className="small muted">{t("dash.todayProgress")}</div>
            <b style={{ fontSize: 17 }}>{t("dash.tasksFocus", { done: completion.tasksDone, total: completion.tasksTotal, focus: formatDuration(focusToday) })}</b>
            <div className="row between small">
              <span>{t("dash.level", { n: lvl.level })}</span>
              <span className="muted">{t("dash.xpOf", { into: lvl.intoLevel, need: lvl.needed })}</span>
            </div>
            <Bar value={lvl.progress} />
          </div>
        </div>
        <div className="row mt between small">
          <span className="row gap-s">
            <Flame size={16} /> {t("dash.streak", { n: streak })}
          </span>
          <span className="row gap-s">
            <Sparkles size={16} /> {t("dash.xpTotal", { n: xp })}
          </span>
        </div>
      </Card>

      <Section
        title={t("dash.priorities")}
        action={
          <button className="btn ghost small" onClick={() => go("/plan")}>
            {priorities.length ? t("common.edit") : t("dash.planDay")}
          </button>
        }
      >
        <Card className="tight">
          {priorities.length > 0 ? (
            <div className="list">
              {priorities.map((x, i) => (
                <div key={x.id} className="row">
                  <span className="priority-num">{i + 1}</span>
                  <div className="grow">
                    <TaskRow task={x} onOpen={setEditing} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Target />}
              title={t("dash.noPriorities")}
              text={suggestions.length ? t("dash.suggested", { list: suggestions.map((x) => x.task.title).join(" · ") }) : t("dash.addThenPlan")}
              action={
                <button className="btn primary small" onClick={() => go("/checkin/morning")}>
                  {t("dash.startMorning")}
                </button>
              }
            />
          )}
        </Card>
      </Section>

      <Section
        title={t("dash.todaysTasks")}
        action={
          <button className="btn ghost small" onClick={() => go("/tasks")}>
            {t("dash.allTasks")}
          </button>
        }
      >
        <Card className="tight">
          {todayList.length ? (
            <div className="list">
              {todayList.slice(0, 7).map((x) => (
                <TaskRow key={x.id} task={x} onOpen={setEditing} />
              ))}
              {todayList.length > 7 && (
                <button className="btn ghost" onClick={() => go("/tasks")}>
                  {t("common.more", { n: todayList.length - 7 })}
                </button>
              )}
            </div>
          ) : (
            <Empty
              title={t("dash.nothingToday")}
              text={t("dash.nothingTodayHint")}
              action={
                <button className="btn small" onClick={() => setAdding(true)}>
                  <Plus size={16} /> {t("task.add")}
                </button>
              }
            />
          )}
        </Card>
      </Section>

      <Section title={t("dash.progress")}>
        <div className="grid-2">
          <Stat label={t("dash.gpa")} icon={<GraduationCap size={14} />} value={settings.hideGpaOnDashboard ? "•••" : formatGpa(gpa.cumulative)} sub={gpa.cumulative === null ? t("dash.noGrades") : t("dash.credits", { n: gpa.cumulativeCredits })} onClick={() => go("/uni/gpa")} />
          <Stat label={t("dash.university")} icon={<BookOpen size={14} />} value={activeCourses.length} sub={t("dash.uniSub", { open: uniOpen, done: uniDoneWeek })} onClick={() => go("/uni")} />
          <Stat label={t("dash.programming")} icon={<Code2 size={14} />} value={`${Math.round(cs.percent * 100)}%`} sub={t("dash.progSub", { done: cs.done, total: cs.total, n: codeWeek })} onClick={() => go("/cs")} />
          <Stat label={t("dash.languages")} icon={<Languages size={14} />} value={formatDuration(langToday)} sub={t("dash.todayGoal", { goal: formatDuration(settings.dailyGoals.languageMin) })} onClick={() => go("/lang")} />
          <Stat label={t("dash.fitness")} icon={<Dumbbell size={14} />} value={`${gymWeek}/${settings.weeklyGoals.workouts}`} sub={t("dash.workoutsWeek")} onClick={() => go("/fitness")} />
          <Stat label={t("dash.focus")} icon={<Timer size={14} />} value={formatDuration(focusToday)} sub={t("dash.todayGoal", { goal: formatDuration(settings.dailyGoals.focusMin) })} onClick={() => go("/focus")} />
        </div>
      </Section>

      {challenges.length > 0 && (
        <Section
          title={t("dash.challenges")}
          action={
            <button className="btn ghost small" onClick={() => go("/xp")}>
              {t("dash.xpBadges")}
            </button>
          }
        >
          <Card>
            <div className="col">
              {challenges.map((c) => (
                <div key={c.id} className="col gap-s">
                  <div className="row between small">
                    <span>{c.title}</span>
                    <span className={c.progress >= 1 ? "tag success" : "faint"}>{c.progress >= 1 ? t("common.xpDone", { n: c.xp }) : c.label}</span>
                  </div>
                  <Bar value={c.progress} tone={c.progress >= 1 ? "success" : undefined} />
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}

      <Section
        title={t("dash.deadlines")}
        action={
          <button className="btn ghost small" onClick={() => go("/uni/calendar")}>
            {t("dash.calendar")}
          </button>
        }
      >
        <Card className="tight">
          {deadlines.length ? (
            <div className="list">
              {deadlines.slice(0, 6).map((d) => {
                const n = diffDays(today, d.date);
                return (
                  <div key={d.id} className="list-item">
                    <span className="dot" style={{ background: d.color ?? "var(--text-3)" }} />
                    <div className="grow">
                      <div className="title ellipsis">{d.title}</div>
                      <div className="sub">{d.kind}</div>
                    </div>
                    <span className={`tag ${n < 0 ? "danger" : n <= 2 ? "warning" : ""}`}>{relativeDay(d.date, today)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<CalendarClock />} title={t("dash.noDeadlines")} />
          )}
        </Card>
      </Section>

      <Section title={t("dash.reminders")}>
        <Card className="tight" onClick={() => go("/settings")}>
          <div className="list-item">
            <Bell size={20} className="faint" />
            <div className="grow">
              {nextRem ? (
                <>
                  <div className="title">{t("dash.nextReminder", { label: nextRem.label, time: nextRem.time })}</div>
                  <div className="sub">{t("dash.inDur", { dur: formatDuration(nextRem.inMin) })}</div>
                </>
              ) : (
                <div className="title">{t("dash.remindersOff")}</div>
              )}
              {notif?.supported && notif.permission !== "granted" && (
                <div className="sub" style={{ color: "var(--danger)" }}>
                  {t("dash.permMissing")}
                </div>
              )}
              {notif && !notif.supported && <div className="sub">{t("dash.androidOnly")}</div>}
            </div>
          </div>
        </Card>
      </Section>

      <button className="fab" aria-label={t("task.add")} onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>
      <TaskSheet open={adding} onClose={() => setAdding(false)} defaults={{ scheduledDate: today }} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </Page>
  );
}

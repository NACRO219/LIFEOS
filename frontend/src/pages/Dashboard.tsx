import { Bell, BookOpen, CalendarClock, Code2, Dumbbell, Flame, GraduationCap, Languages, Plus, Sparkles, Target, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { TaskRow, TaskSheet } from "../components/tasks";
import { Bar, Card, Empty, Page, Ring, Section, Stat } from "../components/ui";
import { useStore } from "../db/store";
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
  const uniOpen = s.all("tasks").filter((t) => t.category === "University" && isOpen(t)).length;
  const uniDoneWeek = s.all("tasks").filter((t) => t.category === "University" && t.status === "done" && t.completedAt && localDay(t.completedAt) >= wFrom).length;

  // Upcoming deadlines (next 14 days) — tasks and exams
  const horizon = addDays(today, 14);
  const deadlines = [
    ...s
      .all("tasks")
      .filter((t) => isOpen(t) && t.deadline && t.deadline <= horizon)
      .map((t) => ({ id: t.id, title: t.title, date: t.deadline!, kind: t.kind === "assignment" ? "Assignment" : "Task", color: courses.find((c) => c.id === t.courseId)?.color })),
    ...courses.flatMap((c) => c.exams.filter((e) => e.date >= today && e.date <= horizon).map((e) => ({ id: e.id, title: `${e.title} · ${c.code || c.name}`, date: e.date, kind: "Exam", color: c.color }))),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // Next scheduled reminder
  const now = nowMinutes();
  const reminders = [
    settings.morningEnabled && { label: "Morning plan", time: settings.morningTime },
    settings.eveningEnabled && { label: "Evening check-in", time: settings.eveningTime },
  ].filter(Boolean) as { label: string; time: string }[];
  const nextRem = reminders.map((r) => ({ ...r, inMin: (timeToMin(r.time) - now + 1440) % 1440 })).sort((a, b) => a.inMin - b.inMin)[0];
  const challenges = dailyChallenges(s, today);

  return (
    <Page title={`${greeting()}${settings.name ? `, ${settings.name}` : ""}`} eyebrow={prettyDay(today, { weekday: "long", month: "long", day: "numeric" })}>
      <Card className="accent">
        <div className="row gap-l">
          <Ring value={completion.percent} size={88} stroke={9} color="#fff" track="rgba(255,255,255,.25)" />
          <div className="grow col gap-s">
            <div className="small muted">Today's progress</div>
            <b style={{ fontSize: 17 }}>
              {completion.tasksDone}/{completion.tasksTotal} tasks · {formatDuration(focusToday)} focus
            </b>
            <div className="row between small">
              <span>Level {lvl.level}</span>
              <span className="muted">
                {lvl.intoLevel}/{lvl.needed} XP
              </span>
            </div>
            <Bar value={lvl.progress} />
          </div>
        </div>
        <div className="row mt between small">
          <span className="row gap-s">
            <Flame size={16} /> {streak}-day streak
          </span>
          <span className="row gap-s">
            <Sparkles size={16} /> {xp.toLocaleString()} XP total
          </span>
        </div>
      </Card>

      <Section
        title="Today's 3 priorities"
        action={
          <button className="btn ghost small" onClick={() => go("/plan")}>
            {priorities.length ? "Edit" : "Plan day"}
          </button>
        }
      >
        <Card className="tight">
          {priorities.length > 0 ? (
            <div className="list">
              {priorities.map((t, i) => (
                <div key={t.id} className="row">
                  <span className="priority-num">{i + 1}</span>
                  <div className="grow">
                    <TaskRow task={t} onOpen={setEditing} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={<Target />}
              title="No priorities set for today"
              text={suggestions.length ? `Suggested: ${suggestions.map((x) => x.task.title).join(" · ")}` : "Add tasks, then do your morning plan."}
              action={
                <button className="btn primary small" onClick={() => go("/checkin/morning")}>
                  Start morning plan
                </button>
              }
            />
          )}
        </Card>
      </Section>

      <Section
        title="Today's tasks"
        action={
          <button className="btn ghost small" onClick={() => go("/tasks")}>
            All tasks
          </button>
        }
      >
        <Card className="tight">
          {todayList.length ? (
            <div className="list">
              {todayList.slice(0, 7).map((t) => (
                <TaskRow key={t.id} task={t} onOpen={setEditing} />
              ))}
              {todayList.length > 7 && (
                <button className="btn ghost" onClick={() => go("/tasks")}>
                  +{todayList.length - 7} more
                </button>
              )}
            </div>
          ) : (
            <Empty title="Nothing planned for today" text="Tasks scheduled or due today appear here." action={<button className="btn small" onClick={() => setAdding(true)}><Plus size={16} /> Add task</button>} />
          )}
        </Card>
      </Section>

      <Section title="Progress">
        <div className="grid-2">
          <Stat label="GPA" icon={<GraduationCap size={14} />} value={settings.hideGpaOnDashboard ? "•••" : formatGpa(gpa.cumulative)} sub={gpa.cumulative === null ? "No grades recorded" : `${gpa.cumulativeCredits} credits`} onClick={() => go("/uni/gpa")} />
          <Stat label="University" icon={<BookOpen size={14} />} value={`${activeCourses.length} course${activeCourses.length === 1 ? "" : "s"}`} sub={`${uniOpen} open · ${uniDoneWeek} done this week`} onClick={() => go("/uni")} />
          <Stat label="Programming" icon={<Code2 size={14} />} value={`${Math.round(cs.percent * 100)}%`} sub={`${cs.done}/${cs.total} lessons · ${codeWeek} solved this week`} onClick={() => go("/cs")} />
          <Stat label="Languages" icon={<Languages size={14} />} value={`${langToday} min`} sub={`today · goal ${settings.dailyGoals.languageMin} min`} onClick={() => go("/lang")} />
          <Stat label="Fitness" icon={<Dumbbell size={14} />} value={`${gymWeek}/${settings.weeklyGoals.workouts}`} sub="workouts this week" onClick={() => go("/fitness")} />
          <Stat label="Focus" icon={<Timer size={14} />} value={formatDuration(focusToday)} sub={`today · goal ${formatDuration(settings.dailyGoals.focusMin)}`} onClick={() => go("/focus")} />
        </div>
      </Section>

      {challenges.length > 0 && (
        <Section title="Daily challenges" action={<button className="btn ghost small" onClick={() => go("/xp")}>XP & badges</button>}>
          <Card>
            <div className="col">
              {challenges.map((c) => (
                <div key={c.id} className="col gap-s">
                  <div className="row between small">
                    <span>{c.title}</span>
                    <span className={c.progress >= 1 ? "tag success" : "faint"}>{c.progress >= 1 ? `+${c.xp} XP ✓` : c.label}</span>
                  </div>
                  <Bar value={c.progress} tone={c.progress >= 1 ? "success" : undefined} />
                </div>
              ))}
            </div>
          </Card>
        </Section>
      )}

      <Section title="Upcoming deadlines" action={<button className="btn ghost small" onClick={() => go("/uni/calendar")}>Calendar</button>}>
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
            <Empty icon={<CalendarClock />} title="No deadlines in the next 2 weeks" />
          )}
        </Card>
      </Section>

      <Section title="Reminders">
        <Card className="tight" onClick={() => go("/settings")}>
          <div className="list-item">
            <Bell size={20} className="faint" />
            <div className="grow">
              {nextRem ? (
                <>
                  <div className="title">
                    Next: {nextRem.label} at {nextRem.time}
                  </div>
                  <div className="sub">in {formatDuration(nextRem.inMin)}</div>
                </>
              ) : (
                <div className="title">Daily reminders are off</div>
              )}
              {notif?.supported && notif.permission !== "granted" && <div className="sub" style={{ color: "var(--danger)" }}>Notification permission not granted. Tap to fix.</div>}
              {notif && !notif.supported && <div className="sub">Native notifications run in the Android app.</div>}
            </div>
          </div>
        </Card>
      </Section>

      <button className="fab" aria-label="Add task" onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>
      <TaskSheet open={adding} onClose={() => setAdding(false)} defaults={{ scheduledDate: today }} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </Page>
  );
}

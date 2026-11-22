// User actions that change data and award/revoke XP.
// XP events use deterministic keys (e.g. "task:<id>") so the same event can never be awarded twice;
// undoing an action revokes its XP so totals always match confirmed progress.
import type { Store } from "../db/store";
import { uid } from "../db/store";
import { localDay, todayISO } from "./date";
import { dailyChallenges, evaluateAchievements, weeklyChallenges } from "./gamification";
import { nextRecurrence } from "./planner";
import { weekRange } from "./stats";
import type { CodingExercise, DayPlan, FocusSession, LanguageSession, Settings, Task, Workout, XpEvent } from "./types";

export function award(s: Store, key: string, amount: number, reason: string, source: XpEvent["source"], date = todayISO()): boolean {
  if (amount <= 0 || s.get("xpEvents", key)) return false;
  s.put("xpEvents", { id: key, date, amount, reason, source, createdAt: new Date().toISOString() });
  return true;
}

export function revoke(s: Store, key: string) {
  if (s.get("xpEvents", key)) s.remove("xpEvents", key);
}

export function taskXp(t: Pick<Task, "xp" | "category">, xp: Settings["xp"]): number {
  if (t.xp > 0) return t.xp;
  switch (t.category) {
    case "University":
      return xp.university;
    case "Programming":
      return xp.programmingExercise;
    case "Chinese":
    case "English":
    case "French":
      return xp.languageLesson;
    default:
      return xp.otherTask;
  }
}

export function newTask(partial: Partial<Task> & { title: string }): Task {
  return {
    id: uid(),
    description: "",
    category: "Personal",
    priority: "medium",
    kind: "task",
    deadline: null,
    scheduledDate: null,
    estimatedMin: 30,
    status: "todo",
    courseId: null,
    project: "",
    recurrence: "none",
    xp: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    recurrenceParentId: null,
    ...partial,
    title: partial.title.trim(),
  };
}

export function validateTask(t: Partial<Task>): string | null {
  if (!t.title || !t.title.trim()) return "Give the task a title.";
  if (t.title.length > 200) return "Title is too long (max 200 characters).";
  if (t.estimatedMin !== undefined && (t.estimatedMin < 0 || t.estimatedMin > 24 * 60)) return "Estimated duration must be between 0 and 1440 minutes.";
  if (t.xp !== undefined && (t.xp < 0 || t.xp > 1000)) return "XP must be between 0 and 1000.";
  if (t.deadline && t.scheduledDate && t.scheduledDate > t.deadline) return "Scheduled date is after the deadline.";
  return null;
}

export interface AwardResult {
  xp: number;
  achievements: string[];
}

function finish(s: Store, before: number): AwardResult {
  syncChallengeXp(s);
  const fresh = evaluateAchievements(s);
  const after = s.all("xpEvents").reduce((a, e) => a + e.amount, 0);
  return { xp: after - before, achievements: fresh.map((a) => a.title) };
}

const sumXp = (s: Store) => s.all("xpEvents").reduce((a, e) => a + e.amount, 0);

export function completeTask(s: Store, id: string): AwardResult {
  const before = sumXp(s);
  s.transact(() => {
    const t = s.get("tasks", id);
    if (!t || t.status === "done") return;
    const now = new Date().toISOString();
    const today = todayISO();
    s.put("tasks", { ...t, status: "done", completedAt: now });
    award(s, `task:${t.id}`, taskXp(t, s.settings.xp), `Completed “${t.title}”`, "task", today);
    // Recurring: create the next instance once (never duplicates if toggled again).
    if (t.recurrence !== "none") {
      const base = t.scheduledDate ?? t.deadline ?? today;
      const next = nextRecurrence(base, t.recurrence);
      const exists = s.all("tasks").some((x) => x.recurrenceParentId === t.id);
      if (next && !exists) {
        const shift = (d: string | null) => (d ? nextRecurrence(d, t.recurrence) : null);
        s.put("tasks", { ...t, id: uid(), status: "todo", completedAt: null, createdAt: now, recurrenceParentId: t.id, scheduledDate: t.scheduledDate ? next : null, deadline: shift(t.deadline) });
      }
    }
    checkPriorities(s, today);
  });
  return finish(s, before);
}

export function reopenTask(s: Store, id: string) {
  s.transact(() => {
    const t = s.get("tasks", id);
    if (!t || t.status !== "done") return;
    s.put("tasks", { ...t, status: "todo", completedAt: null });
    revoke(s, `task:${t.id}`);
    // re-check every day whose priorities include this task
    for (const p of s.all("dayPlans")) if (p.priorityTaskIds.includes(t.id)) checkPriorities(s, p.date);
  });
  syncChallengeXp(s);
}

export function deleteTask(s: Store, id: string) {
  s.transact(() => {
    revoke(s, `task:${id}`);
    s.remove("tasks", id);
    for (const p of s.all("dayPlans"))
      if (p.priorityTaskIds.includes(id) || p.blocks.some((b) => b.taskId === id))
        s.put("dayPlans", { ...p, priorityTaskIds: p.priorityTaskIds.filter((x) => x !== id), blocks: p.blocks.filter((b) => b.taskId !== id) });
  });
}

/** +50 XP when all (≥1, max 3) priorities of a day are done; revoked if one is reopened. */
export function checkPriorities(s: Store, date: string) {
  const plan = s.get("dayPlans", date);
  const key = `priorities:${date}`;
  const ids = plan?.priorityTaskIds ?? [];
  const tasks = ids.map((id) => s.get("tasks", id)).filter(Boolean) as Task[];
  if (ids.length > 0 && tasks.length === ids.length && tasks.every((t) => t.status === "done")) award(s, key, s.settings.xp.allPriorities, "All daily priorities completed", "priorities", date);
  else revoke(s, key);
}

export function emptyDayPlan(date: string): DayPlan {
  return { id: date, date, availableMin: null, energy: null, commitments: [], priorityTaskIds: [], blocks: [], morningDone: false, notes: "" };
}

export function setPriorities(s: Store, date: string, ids: string[]) {
  s.transact(() => {
    const plan = s.get("dayPlans", date) ?? emptyDayPlan(date);
    s.put("dayPlans", { ...plan, priorityTaskIds: ids.slice(0, 3) });
    checkPriorities(s, date);
  });
}

export function solveExercise(s: Store, ex: CodingExercise): AwardResult {
  const before = sumXp(s);
  s.transact(() => {
    const solvedAt = ex.solvedAt ?? new Date().toISOString();
    s.put("exercises", { ...ex, status: "solved", solvedAt });
    award(s, `exercise:${ex.id}`, s.settings.xp.programmingExercise, `Solved “${ex.title}”`, "exercise", localDay(solvedAt));
  });
  return finish(s, before);
}

export function saveExercise(s: Store, ex: CodingExercise): AwardResult {
  if (ex.status === "solved") return solveExercise(s, ex);
  s.transact(() => {
    s.put("exercises", { ...ex, solvedAt: null });
    revoke(s, `exercise:${ex.id}`);
  });
  syncChallengeXp(s);
  return { xp: 0, achievements: [] };
}

export function logLanguageSession(s: Store, session: Omit<LanguageSession, "id" | "createdAt">): AwardResult {
  const before = sumXp(s);
  const id = uid();
  s.transact(() => {
    s.put("langSessions", { ...session, id, createdAt: new Date().toISOString() });
    if (session.isLesson) award(s, `lang:${id}`, s.settings.xp.languageLesson, `${langName(session.lang)} lesson (${session.skill})`, "language", session.date);
  });
  return finish(s, before);
}

export function deleteLanguageSession(s: Store, id: string) {
  s.transact(() => {
    revoke(s, `lang:${id}`);
    s.remove("langSessions", id);
  });
  syncChallengeXp(s);
}

export function saveWorkout(s: Store, w: Workout): AwardResult {
  const before = sumXp(s);
  s.transact(() => {
    s.put("workouts", w);
    award(s, `workout:${w.id}`, s.settings.xp.workout, `Workout: ${w.name || "training"}`, "workout", w.date);
  });
  return finish(s, before);
}

export function deleteWorkout(s: Store, id: string) {
  s.transact(() => {
    revoke(s, `workout:${id}`);
    s.remove("workouts", id);
  });
  syncChallengeXp(s);
}

export function recordFocusSession(s: Store, f: FocusSession): AwardResult {
  const before = sumXp(s);
  s.transact(() => {
    s.put("focusSessions", f);
    if (f.kind === "focus" && f.completed && f.actualMin >= 10) award(s, `focus:${f.id}`, s.settings.xp.focusSession, `Focus session (${f.actualMin} min)`, "focus", f.date);
  });
  return finish(s, before);
}

export function completeEveningReview(s: Store, date: string): AwardResult {
  const before = sumXp(s);
  award(s, `evening:${date}`, s.settings.xp.eveningReview, "Evening review completed", "evening", date);
  return finish(s, before);
}

/** Award challenge XP when a challenge is complete; revoke if it no longer is (current day/week only). */
export function syncChallengeXp(s: Store) {
  const today = todayISO();
  const wk = weekRange(today).from;
  s.transact(() => {
    for (const c of dailyChallenges(s, today)) {
      const key = `challenge:day:${today}:${c.id}`;
      if (c.progress >= 1) award(s, key, c.xp, `Daily challenge: ${c.title}`, "challenge", today);
      else revoke(s, key);
    }
    for (const c of weeklyChallenges(s, today)) {
      const key = `challenge:week:${wk}:${c.id}`;
      if (c.progress >= 1) award(s, key, c.xp, `Weekly challenge: ${c.title}`, "challenge", today);
      else revoke(s, key);
    }
  });
}

export function langName(code: string) {
  return code === "zh" ? "Chinese" : code === "en" ? "English" : code === "fr" ? "French" : code;
}

export function toggleHabit(s: Store, habitId: string, date: string) {
  const id = `${habitId}|${date}`;
  if (s.get("habitLogs", id)) s.remove("habitLogs", id);
  else s.put("habitLogs", { id, habitId, date });
  evaluateAchievements(s);
}

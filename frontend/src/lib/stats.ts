// Derived statistics, levels and streaks. Everything here is computed from stored records.
import { addDays, localDay, weekStart } from "./date";
import type { Store } from "../db/store";
import type { LangCode } from "./types";

// ---------------------------------------------------------------- levels
/** Level L→L+1 costs perLevel × L XP (gentle linear growth). */
export function levelInfo(totalXp: number, perLevel: number) {
  const per = Math.max(50, perLevel);
  let level = 1;
  let floor = 0;
  while (totalXp >= floor + per * level) {
    floor += per * level;
    level++;
  }
  const needed = per * level;
  return { level, intoLevel: totalXp - floor, needed, progress: (totalXp - floor) / needed };
}

export function totalXp(s: Store) {
  return s.all("xpEvents").reduce((sum, e) => sum + e.amount, 0);
}

export function xpOn(s: Store, date: string) {
  return s.all("xpEvents").filter((e) => e.date === date).reduce((sum, e) => sum + e.amount, 0);
}

// ---------------------------------------------------------------- activity + streak
/** Days on which the user actually did something (confirmed records only). */
export function activeDays(s: Store): Set<string> {
  const days = new Set<string>();
  for (const t of s.all("tasks")) if (t.status === "done" && t.completedAt) days.add(localDay(t.completedAt));
  for (const f of s.all("focusSessions")) if (f.kind === "focus" && f.actualMin >= 5) days.add(f.date);
  for (const l of s.all("langSessions")) days.add(l.date);
  for (const e of s.all("exercises")) if (e.status === "solved" && e.solvedAt) days.add(localDay(e.solvedAt));
  for (const w of s.all("workouts")) days.add(w.date);
  for (const h of s.all("habitLogs")) days.add(h.date);
  for (const c of s.all("checkins")) days.add(c.date);
  return days;
}

/** Consecutive active days ending today (or yesterday, if today has no activity yet). */
export function streakFrom(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

// ---------------------------------------------------------------- per-area numbers
export function focusMinutes(s: Store, from: string, to = from) {
  return s.all("focusSessions").filter((f) => f.kind === "focus" && f.date >= from && f.date <= to).reduce((m, f) => m + f.actualMin, 0);
}

export function languageMinutes(s: Store, from: string, to = from, lang?: LangCode) {
  return s.all("langSessions").filter((l) => l.date >= from && l.date <= to && (!lang || l.lang === lang)).reduce((m, l) => m + l.minutes, 0);
}

export function languageStreak(s: Store, lang: LangCode, today: string) {
  const days = new Set(s.all("langSessions").filter((l) => l.lang === lang).map((l) => l.date));
  return streakFrom(days, today);
}

export function solvedExercises(s: Store, from?: string, to?: string) {
  return s.all("exercises").filter((e) => e.status === "solved" && e.solvedAt && (!from || localDay(e.solvedAt) >= from) && (!to || localDay(e.solvedAt) <= to));
}

export function csProgress(s: Store) {
  const topics = s.all("csTopics");
  const lessons = topics.flatMap((t) => t.lessons);
  const done = lessons.filter((l) => l.done).length;
  return { done, total: lessons.length, percent: lessons.length ? done / lessons.length : 0 };
}

export function workoutsBetween(s: Store, from: string, to: string) {
  return s.all("workouts").filter((w) => w.date >= from && w.date <= to);
}

export function studyMinutesBetween(s: Store, from: string, to: string) {
  const focus = s.all("focusSessions").filter((f) => f.kind === "focus" && f.date >= from && f.date <= to).reduce((m, f) => m + f.actualMin, 0);
  const sessions = s.all("studySessions").filter((x) => x.done && x.date >= from && x.date <= to).reduce((m, x) => m + x.minutes, 0);
  return focus + sessions;
}

export function weekRange(today: string) {
  const from = weekStart(today);
  return { from, to: addDays(from, 6) };
}

/** Tasks that belong to today: scheduled today, due today, or completed today. */
export function todaysTasks(s: Store, today: string) {
  return s.all("tasks").filter((t) => {
    if (t.scheduledDate === today) return true;
    if (!t.scheduledDate) return t.deadline === today || (t.status === "done" && !!t.completedAt && localDay(t.completedAt) === today);
    // carried over from an earlier day: still today's concern until done (and counts if finished today)
    return t.scheduledDate < today && (t.status !== "done" || (!!t.completedAt && localDay(t.completedAt) === today));
  });
}

/**
 * Daily completion %: share of today's committed items that are done.
 * Items = today's tasks + today's 3 priorities (deduped) + daily language goal + daily focus goal.
 * Goals only count when set (> 0).
 */
export function dailyCompletion(s: Store, today: string) {
  const tasks = todaysTasks(s, today);
  const plan = s.get("dayPlans", today);
  const ids = new Set(tasks.map((t) => t.id));
  for (const id of plan?.priorityTaskIds ?? []) ids.add(id);
  const all = [...ids].map((id) => s.get("tasks", id)).filter(Boolean);
  let total = all.length;
  let done = all.filter((t) => t!.status === "done").length;
  const g = s.settings.dailyGoals;
  if (g.languageMin > 0) {
    total++;
    done += Math.min(1, languageMinutes(s, today) / g.languageMin);
  }
  if (g.focusMin > 0) {
    total++;
    done += Math.min(1, focusMinutes(s, today) / g.focusMin);
  }
  return { total, done, percent: total ? done / total : 0, tasksDone: all.filter((t) => t!.status === "done").length, tasksTotal: all.length };
}

export function personalRecords(s: Store) {
  const prs = new Map<string, { weight: number; reps: number; date: string }>();
  for (const w of s.all("workouts"))
    for (const ex of w.exercises)
      for (const set of ex.sets) {
        const key = ex.name.trim().toLowerCase();
        if (!key) continue;
        const cur = prs.get(key);
        if (!cur || set.weight > cur.weight || (set.weight === cur.weight && set.reps > cur.reps)) prs.set(key, { weight: set.weight, reps: set.reps, date: w.date });
      }
  return [...prs.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => a.name.localeCompare(b.name));
}

// Achievements and challenges — all evaluated from real stored records.
import type { Store } from "../db/store";
import { localDay, todayISO } from "./date";
import { activeDays, csProgress, focusMinutes, languageMinutes, longestStreak, solvedExercises, studyMinutesBetween, totalXp, weekRange, levelInfo, workoutsBetween } from "./stats";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string; // emoji keeps it light without being childish
  check: (s: Store) => boolean;
}

const doneTasks = (s: Store) => s.all("tasks").filter((t) => t.status === "done");

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-task", title: "First step", description: "Complete your first task", icon: "✅", check: (s) => doneTasks(s).length >= 1 },
  { id: "tasks-25", title: "Getting things done", description: "Complete 25 tasks", icon: "📋", check: (s) => doneTasks(s).length >= 25 },
  { id: "tasks-100", title: "Centurion", description: "Complete 100 tasks", icon: "🏛️", check: (s) => doneTasks(s).length >= 100 },
  { id: "streak-3", title: "Warming up", description: "Be active 3 days in a row", icon: "🔥", check: (s) => longestStreak(activeDays(s)) >= 3 },
  { id: "streak-7", title: "One full week", description: "Be active 7 days in a row", icon: "📆", check: (s) => longestStreak(activeDays(s)) >= 7 },
  { id: "streak-30", title: "Habit formed", description: "Be active 30 days in a row", icon: "🌳", check: (s) => longestStreak(activeDays(s)) >= 30 },
  { id: "priorities-1", title: "Top three", description: "Complete all three daily priorities", icon: "🎯", check: (s) => s.all("xpEvents").some((e) => e.source === "priorities") },
  { id: "priorities-10", title: "Focused executor", description: "Complete all daily priorities on 10 days", icon: "🏹", check: (s) => s.all("xpEvents").filter((e) => e.source === "priorities").length >= 10 },
  { id: "evening-7", title: "Reflective", description: "Complete 7 evening reviews", icon: "🌙", check: (s) => s.all("checkins").filter((c) => c.type === "evening").length >= 7 },
  { id: "focus-10h", title: "Deep worker", description: "Accumulate 10 hours of focus", icon: "⏱️", check: (s) => focusMinutes(s, "0000-01-01", "9999-12-31") >= 600 },
  { id: "focus-50h", title: "Flow state", description: "Accumulate 50 hours of focus", icon: "🧠", check: (s) => focusMinutes(s, "0000-01-01", "9999-12-31") >= 3000 },
  { id: "code-1", title: "Hello, world", description: "Solve your first coding exercise", icon: "💻", check: (s) => solvedExercises(s).length >= 1 },
  { id: "code-50", title: "Problem solver", description: "Solve 50 coding exercises", icon: "🧩", check: (s) => solvedExercises(s).length >= 50 },
  { id: "cs-topic", title: "Topic mastered", description: "Finish every lesson in a CS topic", icon: "🎓", check: (s) => s.all("csTopics").some((t) => t.lessons.length > 0 && t.lessons.every((l) => l.done)) },
  { id: "cs-half", title: "Halfway there", description: "Complete half of the CS roadmap", icon: "🗺️", check: (s) => csProgress(s).percent >= 0.5 },
  { id: "lang-10h", title: "Polyglot in training", description: "Practise languages for 10 hours", icon: "🗣️", check: (s) => languageMinutes(s, "0000-01-01", "9999-12-31") >= 600 },
  { id: "lang-three", title: "Three languages, one day", description: "Practise Chinese, English and French on the same day", icon: "🌍", check: (s) => {
    const byDay = new Map<string, Set<string>>();
    for (const l of s.all("langSessions")) { if (!byDay.has(l.date)) byDay.set(l.date, new Set()); byDay.get(l.date)!.add(l.lang); }
    return [...byDay.values()].some((x) => x.size === 3);
  } },
  { id: "vocab-100", title: "Word collector", description: "Add 100 vocabulary cards", icon: "📚", check: (s) => s.all("vocab").length >= 100 },
  { id: "workout-1", title: "First rep", description: "Log your first workout", icon: "🏋️", check: (s) => s.all("workouts").length >= 1 },
  { id: "workout-20", title: "Regular", description: "Log 20 workouts", icon: "💪", check: (s) => s.all("workouts").length >= 20 },
  { id: "gpa-entry", title: "Know your numbers", description: "Record a grade", icon: "📈", check: (s) => s.all("assessments").some((a) => a.score !== null) || s.all("semesterRecords").length > 0 || s.all("courses").some((c) => c.finalGradePoints !== null) },
  { id: "level-5", title: "Level 5", description: "Reach level 5", icon: "⭐", check: (s) => levelInfo(totalXp(s), s.settings.levelXp).level >= 5 },
  { id: "level-10", title: "Level 10", description: "Reach level 10", icon: "🌟", check: (s) => levelInfo(totalXp(s), s.settings.levelXp).level >= 10 },
];

/** Unlock newly earned achievements (stored with their date, so history is preserved). */
export function evaluateAchievements(s: Store): AchievementDef[] {
  const unlocked = new Set(s.all("achievements").map((a) => a.id));
  const fresh = ACHIEVEMENTS.filter((a) => !unlocked.has(a.id) && safe(() => a.check(s)));
  if (fresh.length) s.transact(() => fresh.forEach((a) => s.put("achievements", { id: a.id, unlockedAt: new Date().toISOString() })));
  return fresh;
}

function safe(fn: () => boolean) {
  try {
    return fn();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- challenges
export interface Challenge {
  id: string;
  title: string;
  xp: number;
  progress: number; // 0..1
  label: string;
}

export function dailyChallenges(s: Store, today = todayISO()): Challenge[] {
  const g = s.settings.dailyGoals;
  const doneToday = s.all("tasks").filter((t) => t.status === "done" && !!t.completedAt && localDay(t.completedAt) === today).length;
  const focus = focusMinutes(s, today);
  const lang = languageMinutes(s, today);
  const out: Challenge[] = [];
  if (g.tasks > 0) out.push({ id: "tasks", title: `Complete ${g.tasks} tasks`, xp: 15, progress: Math.min(1, doneToday / g.tasks), label: `${doneToday}/${g.tasks}` });
  if (g.focusMin > 0) out.push({ id: "focus", title: `Focus for ${g.focusMin} minutes`, xp: 15, progress: Math.min(1, focus / g.focusMin), label: `${focus}/${g.focusMin} min` });
  if (g.languageMin > 0) out.push({ id: "language", title: `Practise languages ${g.languageMin} min`, xp: 15, progress: Math.min(1, lang / g.languageMin), label: `${lang}/${g.languageMin} min` });
  return out;
}

export function weeklyChallenges(s: Store, today = todayISO()): Challenge[] {
  const { from, to } = weekRange(today);
  const w = s.settings.weeklyGoals;
  const out: Challenge[] = [];
  const study = studyMinutesBetween(s, from, to);
  const code = solvedExercises(s, from, to).length;
  const gym = workoutsBetween(s, from, to).length;
  const lang = languageMinutes(s, from, to);
  if (w.studyMin > 0) out.push({ id: "study", title: `Study ${Math.round(w.studyMin / 60)}h this week`, xp: 40, progress: Math.min(1, study / w.studyMin), label: `${Math.round(study / 6) / 10}h / ${Math.round(w.studyMin / 6) / 10}h` });
  if (w.codingExercises > 0) out.push({ id: "code", title: `Solve ${w.codingExercises} coding exercises`, xp: 40, progress: Math.min(1, code / w.codingExercises), label: `${code}/${w.codingExercises}` });
  if (w.workouts > 0) out.push({ id: "gym", title: `Train ${w.workouts} times`, xp: 40, progress: Math.min(1, gym / w.workouts), label: `${gym}/${w.workouts}` });
  if (w.languageMin > 0) out.push({ id: "lang", title: `Practise languages ${Math.round(w.languageMin / 60)}h`, xp: 40, progress: Math.min(1, lang / w.languageMin), label: `${lang}/${w.languageMin} min` });
  return out;
}

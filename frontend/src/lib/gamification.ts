// Achievements and challenges — all evaluated from real stored records.
import type { Store } from "../db/store";
import { t, tDyn } from "../i18n";
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

function def(id: string, icon: string, check: (s: Store) => boolean): AchievementDef {
  return {
    id,
    icon,
    check,
    get title() {
      return tDyn(`ach.${id}.t`, id);
    },
    get description() {
      return tDyn(`ach.${id}.d`, "");
    },
  };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  def("first-task", "✅", (s) => doneTasks(s).length >= 1 ),
  def("tasks-25", "📋", (s) => doneTasks(s).length >= 25 ),
  def("tasks-100", "🏛️", (s) => doneTasks(s).length >= 100 ),
  def("streak-3", "🔥", (s) => longestStreak(activeDays(s)) >= 3 ),
  def("streak-7", "📆", (s) => longestStreak(activeDays(s)) >= 7 ),
  def("streak-30", "🌳", (s) => longestStreak(activeDays(s)) >= 30 ),
  def("priorities-1", "🎯", (s) => s.all("xpEvents").some((e) => e.source === "priorities") ),
  def("priorities-10", "🏹", (s) => s.all("xpEvents").filter((e) => e.source === "priorities").length >= 10 ),
  def("evening-7", "🌙", (s) => s.all("checkins").filter((c) => c.type === "evening").length >= 7 ),
  def("focus-10h", "⏱️", (s) => focusMinutes(s, "0000-01-01", "9999-12-31") >= 600 ),
  def("focus-50h", "🧠", (s) => focusMinutes(s, "0000-01-01", "9999-12-31") >= 3000 ),
  def("code-1", "💻", (s) => solvedExercises(s).length >= 1 ),
  def("code-50", "🧩", (s) => solvedExercises(s).length >= 50 ),
  def("cs-topic", "🎓", (s) => s.all("csTopics").some((t) => t.lessons.length > 0 && t.lessons.every((l) => l.done)) ),
  def("cs-half", "🗺️", (s) => csProgress(s).percent >= 0.5 ),
  def("lang-10h", "🗣️", (s) => languageMinutes(s, "0000-01-01", "9999-12-31") >= 600 ),
  def("lang-three", "🌍", (s) => {
    const byDay = new Map<string, Set<string>>();
    for (const l of s.all("langSessions")) { if (!byDay.has(l.date)) byDay.set(l.date, new Set()); byDay.get(l.date)!.add(l.lang); }
    return [...byDay.values()].some((x) => x.size === 3);
  } ),
  def("vocab-100", "📚", (s) => s.all("vocab").length >= 100 ),
  def("workout-1", "🏋️", (s) => s.all("workouts").length >= 1 ),
  def("workout-20", "💪", (s) => s.all("workouts").length >= 20 ),
  def("gpa-entry", "📈", (s) => s.all("assessments").some((a) => a.score !== null) || s.all("semesterRecords").length > 0 || s.all("courses").some((c) => c.finalGradePoints !== null) ),
  def("level-5", "⭐", (s) => levelInfo(totalXp(s), s.settings.levelXp).level >= 5 ),
  def("level-10", "🌟", (s) => levelInfo(totalXp(s), s.settings.levelXp).level >= 10 ),
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
  if (g.tasks > 0) out.push({ id: "tasks", title: t("ch.tasks", { n: g.tasks }), xp: 15, progress: Math.min(1, doneToday / g.tasks), label: `${doneToday}/${g.tasks}` });
  if (g.focusMin > 0) out.push({ id: "focus", title: t("ch.focus", { n: g.focusMin }), xp: 15, progress: Math.min(1, focus / g.focusMin), label: t("ch.minOf", { a: focus, b: g.focusMin }) });
  if (g.languageMin > 0) out.push({ id: "language", title: t("ch.language", { n: g.languageMin }), xp: 15, progress: Math.min(1, lang / g.languageMin), label: t("ch.minOf", { a: lang, b: g.languageMin }) });
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
  if (w.studyMin > 0) out.push({ id: "study", title: t("ch.study", { n: Math.round(w.studyMin / 60) }), xp: 40, progress: Math.min(1, study / w.studyMin), label: t("ch.hOf", { a: Math.round(study / 6) / 10, b: Math.round(w.studyMin / 6) / 10 }) });
  if (w.codingExercises > 0) out.push({ id: "code", title: t("ch.code", { n: w.codingExercises }), xp: 40, progress: Math.min(1, code / w.codingExercises), label: `${code}/${w.codingExercises}` });
  if (w.workouts > 0) out.push({ id: "gym", title: t("ch.gym", { n: w.workouts }), xp: 40, progress: Math.min(1, gym / w.workouts), label: `${gym}/${w.workouts}` });
  if (w.languageMin > 0) out.push({ id: "lang", title: t("ch.lang", { n: Math.round(w.languageMin / 60) }), xp: 40, progress: Math.min(1, lang / w.languageMin), label: t("ch.minOf", { a: lang, b: w.languageMin }) });
  return out;
}

import { beforeEach, describe, expect, it } from "vitest";
import { MemoryBackend } from "../db/backends";
import { SCHEMA_VERSION, Store } from "../db/store";
import { DEFAULT_GRADING_SCALE } from "../db/seed";
import { completeEveningReview, completeTask, deleteTask, logLanguageSession, newTask, reopenTask, saveExercise, setPriorities } from "./actions";
import { addDays, diffDays, isValidDay, todayISO, weekStart, zonedTimeToDate, zonedParts } from "./date";
import { bandForPercent, courseGrade, gpaSummary, requiredAverageForTarget, requiredPercentOnRemaining, weightedGpa } from "./gpa";
import { dayLoads, generatePlan, nextRecurrence, proposeReschedule, rankTasks } from "./planner";
import { pinyinTones, reviewCard, stripTones } from "./srs";
import { dailyCompletion, levelInfo, streakFrom, totalXp } from "./stats";
import type { Assessment, Course, Task } from "./types";

const T = "2026-11-23"; // a Monday

function task(p: Partial<Task> & { title: string }): Task {
  return newTask(p);
}
function course(p: Partial<Course>): Course {
  return { id: "c1", name: "Algebra", code: "M1", credits: 3, teacher: "", semester: "S1", color: "#000", notes: "", exams: [], status: "completed", finalGradePoints: null, targetPercent: null, createdAt: "", ...p };
}

async function freshStore() {
  const s = new Store(new MemoryBackend());
  await s.init();
  return s;
}

// ------------------------------------------------------------------ dates
describe("dates", () => {
  it("does calendar arithmetic across month/year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(diffDays("2026-11-23", "2026-12-01")).toBe(8);
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday -> Monday
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2026-02-28")).toBe(true);
  });
  it("converts a wall-clock time in a timezone to the right instant", () => {
    const d = zonedTimeToDate("2026-07-01", "07:00", "Europe/Paris"); // UTC+2 in summer
    expect(d.toISOString()).toBe("2026-07-01T05:00:00.000Z");
    const w = zonedTimeToDate("2026-01-15", "21:30", "Asia/Shanghai"); // UTC+8
    expect(w.toISOString()).toBe("2026-01-15T13:30:00.000Z");
    const p = zonedParts(new Date("2026-03-29T01:30:00Z"), "Europe/Paris"); // DST day
    expect(p.hour).toBe(3);
  });
});

// ------------------------------------------------------------------ GPA
describe("GPA", () => {
  const scale = DEFAULT_GRADING_SCALE;
  it("maps percentages to bands", () => {
    expect(bandForPercent(95, scale)?.label).toBe("A");
    expect(bandForPercent(90, scale)?.label).toBe("A-");
    expect(bandForPercent(59.9, scale)?.label).toBe("F");
  });
  it("computes a credit-weighted GPA", () => {
    expect(weightedGpa([{ points: 4, credits: 3 }, { points: 3, credits: 1 }])).toBeCloseTo(3.75);
    expect(weightedGpa([])).toBeNull();
  });
  it("calculates course grade from weighted assessments", () => {
    const a: Assessment[] = [
      { id: "a1", courseId: "c1", name: "Mid", weight: 40, score: 80, maxScore: 100, date: null },
      { id: "a2", courseId: "c1", name: "Final", weight: 60, score: 45, maxScore: 50, date: null },
    ];
    const g = courseGrade(course({}), a, scale);
    expect(g.percent).toBeCloseTo(86); // 0.4*80 + 0.6*90
    expect(g.band?.label).toBe("B");
    expect(g.points).toBe(3.0);
  });
  it("combines completed courses and semester records; in-progress only in projection", () => {
    const courses = [course({ id: "c1", credits: 3, finalGradePoints: 4 }), course({ id: "c2", credits: 3, finalGradePoints: 2, status: "in_progress" })];
    const sum = gpaSummary(courses, [], [{ id: "r", term: "Old", gpa: 3, credits: 6 }], scale);
    expect(sum.cumulative).toBeCloseTo((4 * 3 + 3 * 6) / 9);
    expect(sum.projected).toBeCloseTo((4 * 3 + 2 * 3 + 3 * 6) / 12);
    expect(sum.cumulativeCredits).toBe(9);
  });
  it("simulation overrides count toward cumulative", () => {
    const courses = [course({ id: "c1", credits: 3, finalGradePoints: 3 }), course({ id: "c2", credits: 3, status: "in_progress" })];
    expect(gpaSummary(courses, [], [], scale, { c2: 4 }).cumulative).toBeCloseTo(3.5);
  });
  it("computes the required average for a target", () => {
    // 30 credits at 3.0 → need 3.5 overall with 30 more credits → 4.0 needed
    expect(requiredAverageForTarget(3.5, 90, 30, 30)).toBeCloseTo(4.0);
    expect(requiredAverageForTarget(3.5, 90, 30, 0)).toBeNull();
    const a: Assessment[] = [{ id: "a", courseId: "c", name: "Mid", weight: 50, score: 60, maxScore: 100, date: null }, { id: "b", courseId: "c", name: "Final", weight: 50, score: null, maxScore: 100, date: null }];
    expect(requiredPercentOnRemaining(a, 80)).toBeCloseTo(100);
  });
});

// ------------------------------------------------------------------ planner
describe("planner", () => {
  it("ranks overdue and due-soon tasks first", () => {
    const tasks = [task({ title: "later", deadline: addDays(T, 20) }), task({ title: "overdue", deadline: addDays(T, -2) }), task({ title: "today", deadline: T })];
    expect(rankTasks(tasks, T).map((r) => r.task.title)).toEqual(["overdue", "today", "later"]);
  });
  it("never schedules more than realistic capacity and keeps fixed commitments", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => task({ title: `t${i}`, estimatedMin: 60 }));
    const plan = generatePlan({ tasks, today: T, availableMin: 240, energy: "medium", commitments: [{ id: "x", title: "Lecture", start: "10:00", end: "12:00" }], dayStart: "08:00", dayEnd: "22:00" });
    expect(plan.capacityMin).toBe(204); // 240 × 0.85
    expect(plan.plannedMin).toBeLessThanOrEqual(plan.capacityMin);
    expect(plan.blocks.length).toBe(3);
    expect(plan.overflow.length).toBe(5);
    for (const b of plan.blocks) expect(b.end <= "10:00" || b.start >= "12:00").toBe(true);
    expect(plan.priorities.length).toBe(3);
  });
  it("detects overloaded days and proposes moves without deleting", () => {
    const tasks = [
      task({ title: "a", scheduledDate: T, estimatedMin: 120, priority: "high" }),
      task({ title: "b", scheduledDate: T, estimatedMin: 120, priority: "low" }),
      task({ title: "carried", scheduledDate: addDays(T, -1), estimatedMin: 30 }),
    ];
    const loads = dayLoads(tasks, T, 3, () => 180);
    expect(loads[0].overloaded).toBe(true);
    const moves = proposeReschedule(tasks, T, () => 180);
    const titles = moves.map((m) => m.title);
    expect(titles).toContain("carried");
    expect(titles).toContain("b"); // lowest priority moved off the overloaded day
    expect(titles).not.toContain("a");
    expect(moves.find((m) => m.title === "b")!.to > T).toBe(true);
  });
  it("computes recurrence dates", () => {
    expect(nextRecurrence("2026-11-27", "weekdays")).toBe("2026-11-30"); // Fri -> Mon
    expect(nextRecurrence("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextRecurrence(T, "none")).toBeNull();
  });
  it("monthly recurrence keeps its intended day after a short month", () => {
    expect(nextRecurrence("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextRecurrence("2026-04-30", "monthly", 31)).toBe("2026-05-31");
    expect(nextRecurrence("2026-03-15", "monthly", 31)).toBe("2026-04-15"); // moved by the user: follow it
  });
});

// ------------------------------------------------------------------ store + XP
describe("store and XP rules", () => {
  let s: Store;
  beforeEach(async () => {
    s = await freshStore();
  });

  it("seeds reference data once and records the schema version", async () => {
    expect(s.all("csTopics").length).toBeGreaterThan(5);
    expect(s.all("tasks").length).toBe(0); // no fake progress
    expect(await s.backend.getMeta("schema_version")).toBe(String(SCHEMA_VERSION));
  });

  it("persists writes and reloads them", async () => {
    const backend = s.backend as MemoryBackend;
    s.put("tasks", task({ title: "persist me" }));
    s.saveSettings({ name: "Ada" });
    await s.flush();
    const s2 = new Store(backend);
    await s2.init();
    expect(s2.all("tasks").map((t) => t.title)).toEqual(["persist me"]);
    expect(s2.settings.name).toBe("Ada");
    expect(s2.all("csTopics").length).toBe(s.all("csTopics").length); // not re-seeded
  });

  it("awards task XP once, revokes on reopen, never doubles", () => {
    const t = task({ title: "Essay", category: "University" });
    s.put("tasks", t);
    expect(completeTask(s, t.id).xp).toBeGreaterThanOrEqual(20);
    const after = totalXp(s);
    completeTask(s, t.id); // already done: no-op
    expect(totalXp(s)).toBe(after);
    reopenTask(s, t.id);
    expect(s.get("xpEvents", `task:${t.id}`)).toBeUndefined();
    completeTask(s, t.id);
    expect(s.all("xpEvents").filter((e) => e.id === `task:${t.id}`).length).toBe(1);
    expect(s.get("xpEvents", `task:${t.id}`)!.amount).toBe(20);
  });

  it("awards +50 when all priorities are done and revokes if one is reopened", () => {
    const today = todayISO();
    const ts = [task({ title: "1", scheduledDate: today }), task({ title: "2", scheduledDate: today })];
    ts.forEach((t) => s.put("tasks", t));
    setPriorities(s, today, ts.map((t) => t.id));
    completeTask(s, ts[0].id);
    expect(s.get("xpEvents", `priorities:${today}`)).toBeUndefined();
    completeTask(s, ts[1].id);
    expect(s.get("xpEvents", `priorities:${today}`)?.amount).toBe(50);
    reopenTask(s, ts[1].id);
    expect(s.get("xpEvents", `priorities:${today}`)).toBeUndefined();
  });

  it("creates exactly one next instance for recurring tasks", () => {
    const t = task({ title: "Flashcards", recurrence: "daily", scheduledDate: T });
    s.put("tasks", t);
    completeTask(s, t.id);
    reopenTask(s, t.id);
    completeTask(s, t.id);
    const next = s.all("tasks").filter((x) => x.recurrenceParentId === t.id);
    expect(next.length).toBe(1);
    expect(next[0].scheduledDate).toBe(addDays(T, 1));
    expect(next[0].status).toBe("todo");
  });

  it("awards programming, language and evening XP per the rules, once each", () => {
    const ex = { id: "e1", title: "Two Sum", platform: "LC", difficulty: "easy" as const, language: "Python", minutes: 20, notes: "", status: "solved" as const, topicId: null, date: T, solvedAt: null };
    saveExercise(s, ex);
    saveExercise(s, { ...ex, notes: "edited" });
    expect(s.get("xpEvents", "exercise:e1")?.amount).toBe(30);
    expect(s.all("xpEvents").filter((e) => e.source === "exercise").length).toBe(1);
    logLanguageSession(s, { lang: "zh", skill: "hanzi", minutes: 20, date: T, notes: "", isLesson: true });
    logLanguageSession(s, { lang: "fr", skill: "reading", minutes: 15, date: T, notes: "", isLesson: false });
    expect(s.all("xpEvents").filter((e) => e.source === "language").map((e) => e.amount)).toEqual([20]);
    completeEveningReview(s, T);
    completeEveningReview(s, T);
    expect(s.all("xpEvents").filter((e) => e.source === "evening").length).toBe(1);
  });

  it("deleting a completed task removes its XP and its plan references", () => {
    const t = task({ title: "x", scheduledDate: todayISO() });
    s.put("tasks", t);
    setPriorities(s, todayISO(), [t.id]);
    completeTask(s, t.id);
    deleteTask(s, t.id);
    expect(s.get("xpEvents", `task:${t.id}`)).toBeUndefined();
    expect(s.get("dayPlans", todayISO())?.priorityTaskIds).toEqual([]);
  });

  it("daily completion reflects only real data", () => {
    s.saveSettings({ dailyGoals: { tasks: 0, focusMin: 0, languageMin: 0 } });
    expect(dailyCompletion(s, todayISO()).percent).toBe(0);
    const a = task({ title: "a", scheduledDate: todayISO() });
    const b = task({ title: "b", scheduledDate: todayISO() });
    s.put("tasks", a);
    s.put("tasks", b);
    completeTask(s, a.id);
    expect(dailyCompletion(s, todayISO()).percent).toBeCloseTo(0.5);
  });

  it("exports, validates and restores backups", async () => {
    s.put("tasks", task({ title: "backed up" }));
    s.saveSettings({ name: "Lin", syncToken: "secret" });
    const backup = s.exportBackup();
    expect(backup.settings.syncToken).toBe(""); // secrets are not exported
    const json = JSON.parse(JSON.stringify(backup));
    const v = Store.validateBackup(json);
    expect(v.ok).toBe(true);
    expect(Store.validateBackup({ hello: 1 }).ok).toBe(false);
    expect(Store.validateBackup({ ...json, schemaVersion: SCHEMA_VERSION + 1 }).ok).toBe(false);
    expect(Store.validateBackup({ ...json, collections: { tasks: [{ title: "no id" }] } }).ok).toBe(false);

    const other = await freshStore();
    other.put("tasks", task({ title: "will be replaced" }));
    await other.restoreBackup(json);
    expect(other.all("tasks").map((t) => t.title)).toEqual(["backed up"]);
    expect(other.settings.name).toBe("Lin");
  });

  it("a failed restore leaves the existing data untouched (atomic)", async () => {
    const mem = new MemoryBackend();
    const st = new Store(mem);
    await st.init();
    st.put("tasks", task({ title: "keep me" }));
    await st.flush();
    const backup = JSON.parse(JSON.stringify({ ...st.exportBackup(), collections: { tasks: [task({ title: "new" })] } }));
    mem.write = async () => {
      throw new Error("disk full");
    };
    await expect(st.restoreBackup(backup)).rejects.toThrow("disk full");
    expect(st.all("tasks").map((t) => t.title)).toEqual(["keep me"]);
    expect([...mem.records.values()].some((r) => r.data.includes("keep me"))).toBe(true);
  });

  it("a throwing transaction rolls back memory and persists nothing", async () => {
    s.put("tasks", task({ title: "before" }));
    await s.flush();
    const t0 = s.all("tasks")[0];
    const backend = s.backend as MemoryBackend;
    const rowsBefore = backend.records.size;
    expect(() =>
      s.transact(() => {
        s.update("tasks", t0.id, { title: "changed" });
        s.put("tasks", task({ title: "added" }));
        s.saveSettings({ name: "X" });
        s.setKv("k", 1);
        throw new Error("boom");
      }),
    ).toThrow("boom");
    await s.flush();
    expect(s.all("tasks").map((t) => t.title)).toEqual(["before"]);
    expect(s.settings.name).not.toBe("X");
    expect(s.getKv("k")).toBeNull();
    expect(backend.records.size).toBe(rowsBefore);
  });

  it("recurring tasks without dates get scheduled; monthly ones don't drift", () => {
    const undated = task({ title: "undated", recurrence: "daily" });
    s.put("tasks", undated);
    completeTask(s, undated.id);
    const child = s.all("tasks").find((x) => x.recurrenceParentId === undated.id)!;
    expect(child.scheduledDate).toBe(addDays(todayISO(), 1));

    const rent = task({ title: "rent", recurrence: "monthly", scheduledDate: "2026-01-31", deadline: "2026-02-02" });
    s.put("tasks", rent);
    completeTask(s, rent.id);
    const feb = s.all("tasks").find((x) => x.recurrenceParentId === rent.id)!;
    expect(feb.scheduledDate).toBe("2026-02-28");
    expect(feb.deadline).toBe("2026-03-02"); // 2-day gap kept
    completeTask(s, feb.id);
    const mar = s.all("tasks").find((x) => x.recurrenceParentId === feb.id)!;
    expect(mar.scheduledDate).toBe("2026-03-31");
  });

  it("reset wipes data and re-seeds", async () => {
    s.put("tasks", task({ title: "gone" }));
    await s.resetAll();
    expect(s.all("tasks")).toEqual([]);
    expect(s.all("csTopics").length).toBeGreaterThan(5);
  });
});

// ------------------------------------------------------------------ streaks, levels, SRS
describe("streaks, levels and spaced repetition", () => {
  it("counts streaks ending today or yesterday", () => {
    const days = new Set([T, addDays(T, -1), addDays(T, -2), addDays(T, -4)]);
    expect(streakFrom(days, T)).toBe(3);
    expect(streakFrom(days, addDays(T, 1))).toBe(3); // today not active yet: streak still alive
    expect(streakFrom(days, addDays(T, 2))).toBe(0);
  });
  it("levels grow linearly", () => {
    expect(levelInfo(0, 500).level).toBe(1);
    expect(levelInfo(499, 500).level).toBe(1);
    expect(levelInfo(500, 500).level).toBe(2);
    expect(levelInfo(1499, 500).level).toBe(2); // 500 + 1000
    expect(levelInfo(1500, 500).level).toBe(3);
  });
  it("Leitner boxes and pinyin tones", () => {
    const card = { id: "v", lang: "zh" as const, term: "你好", reading: "nǐ hǎo", meaning: "hello", hsk: 1, box: 0, nextReview: T, reviews: 0, correct: 0, createdAt: "" };
    const ok = reviewCard(card, true, T);
    expect(ok.box).toBe(1);
    expect(ok.nextReview).toBe(addDays(T, 1));
    expect(reviewCard({ ...ok, box: 3 }, false, T).box).toBe(0);
    expect(pinyinTones("nǐ hǎo")).toEqual([3, 3]);
    expect(pinyinTones("ma1 ma5")).toEqual([1, 5]);
    expect(pinyinTones("lǜ chá")).toEqual([4, 2]);
    expect(stripTones("nǐ hǎo")).toBe("ni hao");
  });
});

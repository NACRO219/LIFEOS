// GPA engine — credit-weighted, configurable grading scale.
import type { Assessment, Course, GradeBand, SemesterRecord } from "./types";

export interface CourseGrade {
  percent: number | null; // weighted % over graded assessments
  gradedWeight: number;
  totalWeight: number;
  points: number | null; // grade points used for GPA
  band: GradeBand | null;
  source: "final" | "assessments" | "none";
}

export function sortedScale(scale: GradeBand[]): GradeBand[] {
  return [...scale].sort((a, b) => b.minPercent - a.minPercent);
}

export function bandForPercent(percent: number, scale: GradeBand[]): GradeBand | null {
  for (const b of sortedScale(scale)) if (percent >= b.minPercent) return b;
  return null;
}

export function bandForPoints(points: number, scale: GradeBand[]): GradeBand | null {
  const s = [...scale].sort((a, b) => b.points - a.points);
  for (const b of s) if (points >= b.points - 1e-9) return b;
  return s[s.length - 1] ?? null;
}

export function weightedPercent(assessments: Assessment[]) {
  let gradedWeight = 0;
  let earned = 0;
  let totalWeight = 0;
  for (const a of assessments) {
    totalWeight += a.weight;
    if (a.score !== null && a.maxScore > 0) {
      gradedWeight += a.weight;
      earned += a.weight * (a.score / a.maxScore);
    }
  }
  return { percent: gradedWeight > 0 ? (earned / gradedWeight) * 100 : null, gradedWeight, totalWeight, earned };
}

export function courseGrade(course: Course, assessments: Assessment[], scale: GradeBand[]): CourseGrade {
  const own = assessments.filter((a) => a.courseId === course.id);
  const w = weightedPercent(own);
  if (course.finalGradePoints !== null && course.finalGradePoints !== undefined) {
    return { percent: w.percent, gradedWeight: w.gradedWeight, totalWeight: w.totalWeight, points: course.finalGradePoints, band: bandForPoints(course.finalGradePoints, scale), source: "final" };
  }
  if (w.percent !== null) {
    const band = bandForPercent(w.percent, scale);
    return { percent: w.percent, gradedWeight: w.gradedWeight, totalWeight: w.totalWeight, points: band?.points ?? null, band, source: "assessments" };
  }
  return { percent: null, gradedWeight: 0, totalWeight: w.totalWeight, points: null, band: null, source: "none" };
}

export interface GpaEntry {
  points: number;
  credits: number;
}

export function weightedGpa(entries: GpaEntry[]): number | null {
  const credits = entries.reduce((s, e) => s + e.credits, 0);
  if (credits <= 0) return null;
  return entries.reduce((s, e) => s + e.points * e.credits, 0) / credits;
}

export interface GpaSummary {
  cumulative: number | null;
  cumulativeCredits: number;
  completedQualityPoints: number;
  projected: number | null; // includes in-progress courses at their current grade
  bySemester: { semester: string; gpa: number | null; credits: number; courses: number }[];
}

/**
 * Cumulative GPA = completed courses (with a grade) + manually entered semester records.
 * Semester records exist for terms not entered course-by-course; don't enter the same term both ways.
 */
export function gpaSummary(courses: Course[], assessments: Assessment[], records: SemesterRecord[], scale: GradeBand[], overrides: Record<string, number> = {}): GpaSummary {
  const completed: GpaEntry[] = [];
  const projectedEntries: GpaEntry[] = [];
  const semesters = new Map<string, { entries: GpaEntry[]; courses: number }>();

  for (const c of courses) {
    if (c.credits <= 0) continue;
    const g = courseGrade(c, assessments, scale);
    const pts = overrides[c.id] ?? g.points;
    const sem = c.semester || "Unassigned";
    if (!semesters.has(sem)) semesters.set(sem, { entries: [], courses: 0 });
    const bucket = semesters.get(sem)!;
    bucket.courses++;
    if (pts === null || pts === undefined) continue;
    const entry = { points: pts, credits: c.credits };
    bucket.entries.push(entry);
    projectedEntries.push(entry);
    if (c.status === "completed" || overrides[c.id] !== undefined) completed.push(entry);
  }
  for (const r of records) {
    const e = { points: r.gpa, credits: r.credits };
    completed.push(e);
    projectedEntries.push(e);
    if (!semesters.has(r.term)) semesters.set(r.term, { entries: [], courses: 0 });
    semesters.get(r.term)!.entries.push(e);
  }
  const bySemester = [...semesters.entries()].map(([semester, b]) => ({
    semester,
    gpa: weightedGpa(b.entries),
    credits: b.entries.reduce((s, e) => s + e.credits, 0),
    courses: b.courses,
  }));
  return {
    cumulative: weightedGpa(completed),
    cumulativeCredits: completed.reduce((s, e) => s + e.credits, 0),
    completedQualityPoints: completed.reduce((s, e) => s + e.points * e.credits, 0),
    projected: weightedGpa(projectedEntries),
    bySemester,
  };
}

/**
 * Average grade points needed across `remainingCredits` to reach `target` cumulative GPA.
 * Returns null when there are no remaining credits.
 */
export function requiredAverageForTarget(target: number, qualityPoints: number, credits: number, remainingCredits: number): number | null {
  if (remainingCredits <= 0) return null;
  return (target * (credits + remainingCredits) - qualityPoints) / remainingCredits;
}

/** Average % needed on ungraded assessments to finish a course at `targetPercent`. */
export function requiredPercentOnRemaining(assessments: Assessment[], targetPercent: number): number | null {
  const w = weightedPercent(assessments);
  const remaining = w.totalWeight - w.gradedWeight;
  if (remaining <= 0 || w.totalWeight <= 0) return null;
  // final = (earned + remaining * x) / totalWeight
  return ((targetPercent / 100) * w.totalWeight - w.earned) / remaining * 100;
}

export function formatGpa(g: number | null | undefined, digits = 2) {
  return g === null || g === undefined || Number.isNaN(g) ? "—" : g.toFixed(digits);
}

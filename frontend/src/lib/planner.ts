// Adaptive planner. Pure functions: callers decide what to persist, and every
// rescheduling proposal must be confirmed by the user before it is applied.
import { t as tr, type TKey } from "../i18n";
import { addDays, diffDays, minToTime, timeToMin, prettyDay } from "./date";
import type { Commitment, Course, DayPlan, PlanBlock, Priority, Task } from "./types";

export const DEFAULT_TASK_MIN = 30;
const PRIORITY_WEIGHT: Record<Priority, number> = { low: 10, medium: 20, high: 30, critical: 45 };
const ENERGY_FACTOR = { low: 0.7, medium: 0.85, high: 1 } as const;
const BUFFER_MIN = 5;

export function isOpen(t: Task) {
  return t.status !== "done";
}

export function taskMinutes(t: Task) {
  return t.estimatedMin > 0 ? t.estimatedMin : DEFAULT_TASK_MIN;
}

export function isOverdue(t: Task, today: string) {
  return isOpen(t) && !!t.deadline && t.deadline < today;
}

/** Higher = more urgent. Explainable so the UI can show why. */
export function scoreTask(t: Task, today: string, courses: Course[] = []): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = PRIORITY_WEIGHT[t.priority] ?? 20;
  if (t.priority === "critical" || t.priority === "high") reasons.push(tr("reason.priority", { p: tr(`prio.${t.priority}` as TKey).toLowerCase() }));
  if (t.deadline) {
    const d = diffDays(today, t.deadline);
    if (d < 0) {
      score += 50 + Math.min(-d, 10) * 2;
      reasons.push(tr("reason.overdue", { n: -d }));
    } else if (d === 0) {
      score += 40;
      reasons.push(tr("reason.dueToday"));
    } else if (d === 1) {
      score += 30;
      reasons.push(tr("reason.dueTomorrow"));
    } else if (d <= 3) {
      score += 20;
      reasons.push(tr("reason.dueIn", { n: d }));
    } else if (d <= 7) score += 10;
  }
  if (t.courseId) {
    const c = courses.find((x) => x.id === t.courseId);
    const exam = c?.exams.map((e) => diffDays(today, e.date)).filter((d) => d >= 0 && d <= 7).sort((a, b) => a - b)[0];
    if (exam !== undefined) {
      score += 15;
      reasons.push(tr("reason.exam", { n: exam }));
    }
  }
  if (t.scheduledDate === today) {
    score += 15;
    reasons.push(tr("reason.scheduled"));
  } else if (t.scheduledDate && t.scheduledDate < today) {
    score += 10;
    reasons.push(tr("reason.carried"));
  }
  if (taskMinutes(t) <= 20) score += 3;
  if (t.status === "in_progress") score += 5;
  return { score, reasons };
}

export function rankTasks(tasks: Task[], today: string, courses: Course[] = []) {
  return tasks
    .filter(isOpen)
    .filter((t) => !t.scheduledDate || t.scheduledDate <= today) // future-scheduled tasks wait for their day
    .map((t) => ({ task: t, ...scoreTask(t, today, courses) }))
    .sort((a, b) => b.score - a.score || (a.task.deadline ?? "9999").localeCompare(b.task.deadline ?? "9999"));
}

export function commitmentsMinutes(commitments: Commitment[]) {
  return commitments.reduce((s, c) => s + Math.max(0, timeToMin(c.end) - timeToMin(c.start)), 0);
}

/** Realistic task capacity: free time scaled by energy (a buffer so the day is never over-filled). */
export function capacityMinutes(availableMin: number, energy: DayPlan["energy"] = "medium") {
  return Math.max(0, Math.floor(availableMin * ENERGY_FACTOR[energy ?? "medium"]));
}

export interface GeneratedPlan {
  blocks: PlanBlock[];
  overflow: Task[]; // ranked tasks that do not fit today
  capacityMin: number;
  plannedMin: number;
  priorities: Task[]; // top 3
}

/**
 * Build a time-blocked plan: fixed commitments are never moved; tasks fill the gaps in rank order
 * until realistic capacity is used. A task is only placed if it fits entirely in a gap.
 */
export function generatePlan(opts: {
  tasks: Task[];
  courses?: Course[];
  today: string;
  availableMin: number;
  energy?: DayPlan["energy"];
  commitments?: Commitment[];
  dayStart?: string; // HH:MM
  dayEnd?: string;
  pinnedPriorityIds?: string[];
}): GeneratedPlan {
  const { today, courses = [], commitments = [] } = opts;
  const capacityMin = capacityMinutes(opts.availableMin, opts.energy ?? "medium");
  const ranked = rankTasks(opts.tasks, today, courses).map((r) => r.task);
  // pinned priorities first, in the order given
  const pinned = (opts.pinnedPriorityIds ?? []).map((id) => ranked.find((t) => t.id === id)).filter(Boolean) as Task[];
  const order = [...pinned, ...ranked.filter((t) => !pinned.includes(t))];

  const start = timeToMin(opts.dayStart ?? "08:00");
  const end = timeToMin(opts.dayEnd ?? "22:00");
  const busy = commitments
    .map((c) => [timeToMin(c.start), timeToMin(c.end)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = [];
  let cursor = start;
  for (const [a, b] of busy) {
    if (a > cursor) gaps.push([cursor, Math.min(a, end)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < end) gaps.push([cursor, end]);

  const blocks: PlanBlock[] = [];
  const overflow: Task[] = [];
  let used = 0;
  for (const t of order) {
    const m = taskMinutes(t);
    if (used + m > capacityMin) {
      overflow.push(t);
      continue;
    }
    const gi = gaps.findIndex(([a, b]) => b - a >= m);
    if (gi === -1) {
      overflow.push(t);
      continue;
    }
    const [a, b] = gaps[gi];
    blocks.push({ taskId: t.id, start: minToTime(a), end: minToTime(a + m) });
    used += m;
    const next = a + m + BUFFER_MIN;
    if (next >= b) gaps.splice(gi, 1);
    else gaps[gi] = [next, b];
  }
  blocks.sort((x, y) => x.start.localeCompare(y.start));
  const scheduled = new Set(blocks.map((b) => b.taskId));
  const priorities = order.filter((t) => scheduled.has(t.id)).slice(0, 3);
  return { blocks, overflow, capacityMin, plannedMin: used, priorities };
}

export interface DayLoad {
  date: string;
  loadMin: number;
  capacityMin: number;
  overloaded: boolean;
  tasks: Task[];
}

/** Load per day for tasks scheduled (or, if unscheduled, due) on that day. */
export function dayLoads(tasks: Task[], from: string, days: number, capacityFor: (date: string) => number): DayLoad[] {
  const out: DayLoad[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const list = tasks.filter((t) => isOpen(t) && (t.scheduledDate ?? null) === date);
    const loadMin = list.reduce((s, t) => s + taskMinutes(t), 0);
    const capacityMin = capacityFor(date);
    out.push({ date, loadMin, capacityMin, overloaded: loadMin > capacityMin, tasks: list });
  }
  return out;
}

export interface Move {
  taskId: string;
  title: string;
  from: string | null;
  to: string;
  reason: string;
}

/**
 * Propose (never apply) moves that fix overdue scheduling and overloaded days.
 *  1. Unfinished tasks scheduled in the past → the first day from today with room.
 *  2. Overloaded days → lowest-ranked tasks move to the next day with room,
 *     never past their own deadline when avoidable.
 * Nothing is ever deleted.
 */
export function proposeReschedule(tasks: Task[], today: string, capacityFor: (date: string) => number, horizon = 14, courses: Course[] = []): Move[] {
  const moves: Move[] = [];
  const load = new Map<string, number>();
  const effective = new Map<string, string | null>(tasks.map((t) => [t.id, t.scheduledDate]));
  for (const t of tasks) if (isOpen(t) && t.scheduledDate && t.scheduledDate >= today) load.set(t.scheduledDate, (load.get(t.scheduledDate) ?? 0) + taskMinutes(t));

  const findDay = (t: Task, startOffset: number) => {
    for (let i = startOffset; i < horizon; i++) {
      const d = addDays(today, i);
      if ((load.get(d) ?? 0) + taskMinutes(t) <= capacityFor(d)) {
        if (t.deadline && d > t.deadline && i > startOffset) continue; // try to keep before deadline
        return d;
      }
    }
    // nothing fits within the horizon — fall back to the first day after the horizon (still never dropped)
    return addDays(today, horizon);
  };
  const apply = (t: Task, to: string, reason: string) => {
    const from = effective.get(t.id) ?? null;
    if (from && from >= today) load.set(from, (load.get(from) ?? 0) - taskMinutes(t));
    load.set(to, (load.get(to) ?? 0) + taskMinutes(t));
    effective.set(t.id, to);
    moves.push({ taskId: t.id, title: t.title, from, to, reason });
  };

  // 1. carried-over tasks, most urgent first
  const carried = tasks.filter((t) => isOpen(t) && t.scheduledDate && t.scheduledDate < today);
  carried.sort((a, b) => scoreTask(b, today, courses).score - scoreTask(a, today, courses).score);
  for (const t of carried) apply(t, findDay(t, 0), tr("reason.unfinished", { date: prettyDay(t.scheduledDate!) }));

  // 2. overloaded days
  for (let i = 0; i < horizon; i++) {
    const d = addDays(today, i);
    let dayTasks = tasks.filter((t) => isOpen(t) && effective.get(t.id) === d);
    while ((load.get(d) ?? 0) > capacityFor(d) && dayTasks.length > 1) {
      const ranked = [...dayTasks].sort((a, b) => scoreTask(a, d, courses).score - scoreTask(b, d, courses).score);
      const victim = ranked.find((t) => !(t.deadline && t.deadline <= d)) ?? null; // keep tasks due that day
      if (!victim) break;
      apply(victim, findDay(victim, i + 1), tr("reason.overloaded", { h: Math.round(((load.get(d) ?? 0) / 60) * 10) / 10 }));
      dayTasks = dayTasks.filter((t) => t.id !== victim.id);
    }
  }
  return moves;
}

/**
 * Next instance date for a recurring task, or null.
 * `anchorDay` (monthly only) is the intended day of month: 31 → Feb 28 → Mar 31, never stuck on 28.
 */
export function nextRecurrence(day: string, r: Task["recurrence"], anchorDay?: number): string | null {
  switch (r) {
    case "daily":
      return addDays(day, 1);
    case "weekly":
      return addDays(day, 7);
    case "weekdays": {
      let d = addDays(day, 1);
      while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = addDays(d, 1);
      return d;
    }
    case "monthly": {
      const [y, m, dd] = day.split("-").map(Number);
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
      // Only honour the anchor when this date was clipped to its month's end (e.g. 31 → Feb 28);
      // if the user moved an instance to another day, follow that day instead.
      const lastOfThis = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const want = anchorDay && anchorDay <= 31 && dd < anchorDay && dd === lastOfThis ? anchorDay : dd;
      return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(want, last)).padStart(2, "0")}`;
    }
    default:
      return null;
  }
}

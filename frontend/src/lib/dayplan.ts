// Store-aware planning helpers shared by the planner and the check-ins.
import type { Store } from "../db/store";
import { checkPriorities, emptyDayPlan } from "./actions";
import { minToTime, nowMinutes, todayISO, weekday } from "./date";
import { capacityMinutes, generatePlan, type GeneratedPlan, type Move } from "./planner";
import type { DayPlan } from "./types";

export function getPlan(s: Store, date: string): DayPlan {
  const p = s.get("dayPlans", date);
  return p ? { ...emptyDayPlan(date), ...p } : emptyDayPlan(date);
}

export function availableFor(s: Store, date: string) {
  const p = s.get("dayPlans", date);
  return p?.availableMin ?? s.settings.defaultAvailableMin[weekday(date)] ?? 180;
}

export function capacityFor(s: Store, date: string) {
  const p = s.get("dayPlans", date);
  return capacityMinutes(availableFor(s, date), p?.energy ?? "medium");
}

export function buildPlan(s: Store, date: string): GeneratedPlan {
  const plan = getPlan(s, date);
  const isToday = date === todayISO();
  // Planning mid-day starts from now (rounded up to 15 min); otherwise from 08:00.
  const start = isToday ? Math.max(8 * 60, Math.ceil(nowMinutes() / 15) * 15) : 8 * 60;
  const available = availableFor(s, date);
  return generatePlan({
    tasks: s.all("tasks"),
    courses: s.all("courses"),
    today: date,
    availableMin: available,
    energy: plan.energy ?? "medium",
    commitments: plan.commitments,
    dayStart: minToTime(Math.min(start, 22 * 60 - 15)),
    dayEnd: "22:30",
    pinnedPriorityIds: plan.priorityTaskIds,
  });
}

/** Persist an accepted plan: scheduled tasks move to that day, top 3 become priorities (unless already chosen). */
export function acceptPlan(s: Store, date: string, gen: GeneratedPlan) {
  s.transact(() => {
    const plan = getPlan(s, date);
    for (const b of gen.blocks) {
      const t = s.get("tasks", b.taskId);
      if (t && t.scheduledDate !== date) s.put("tasks", { ...t, scheduledDate: date });
    }
    const keep = plan.priorityTaskIds.filter((id) => gen.blocks.some((b) => b.taskId === id));
    const priorities = keep.length ? keep : gen.priorities.map((t) => t.id);
    s.put("dayPlans", { ...plan, blocks: gen.blocks, priorityTaskIds: priorities.slice(0, 3) });
    checkPriorities(s, date);
  });
}

export function applyMoves(s: Store, moves: Move[]) {
  s.transact(() => {
    for (const m of moves) {
      const t = s.get("tasks", m.taskId);
      if (t && t.status !== "done") s.put("tasks", { ...t, scheduledDate: m.to });
      // drop the task from blocks of the day it left
      if (m.from) {
        const p = s.get("dayPlans", m.from);
        if (p) s.put("dayPlans", { ...p, blocks: p.blocks.filter((b) => b.taskId !== m.taskId), priorityTaskIds: p.priorityTaskIds.filter((id) => id !== m.taskId || m.from! < todayISO()) });
      }
    }
  });
}

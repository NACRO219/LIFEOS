// Accountability coach: balanced, honest, practical. Deterministic and based only on
// what the user confirmed — it never assumes something was done.
import { formatDuration } from "./date";

export function morningMessage(o: {
  name: string;
  energy: "low" | "medium" | "high";
  capacityMin: number;
  plannedMin: number;
  scheduledCount: number;
  overflowCount: number;
  overdueCount: number;
  examSoon: { title: string; days: number } | null;
}): string {
  const lines: string[] = [];
  const hi = o.name ? `Morning, ${o.name}.` : "Good morning.";
  if (o.energy === "low") lines.push(`${hi} Energy is low today, so the plan is lighter on purpose. Doing the important things steadily beats forcing a full day.`);
  else if (o.energy === "high") lines.push(`${hi} Good energy today. Put the hardest task first while you have it.`);
  else lines.push(`${hi} A steady day. Start with your first priority before checking anything else.`);

  if (o.scheduledCount === 0) lines.push("Nothing is scheduled yet. Add a task or two, even small ones count.");
  else lines.push(`Plan: ${o.scheduledCount} task${o.scheduledCount === 1 ? "" : "s"}, about ${formatDuration(o.plannedMin)} of ${formatDuration(o.capacityMin)} realistic capacity.`);
  if (o.overflowCount > 0) lines.push(`${o.overflowCount} task${o.overflowCount === 1 ? " doesn't" : "s don't"} fit today. They stay on your list; nothing is dropped. Consider moving them to a lighter day.`);
  if (o.overdueCount > 0) lines.push(`${o.overdueCount} overdue item${o.overdueCount === 1 ? "" : "s"}. Pick one to close or reschedule honestly.`);
  if (o.examSoon) lines.push(`${o.examSoon.title} is in ${o.examSoon.days} day${o.examSoon.days === 1 ? "" : "s"}. Protect some revision time.`);
  return lines.join(" ");
}

export function eveningMessage(o: {
  name: string;
  tasksDone: number;
  tasksPlanned: number;
  prioritiesDone: number;
  prioritiesTotal: number;
  practiced: string[]; // areas practised (confirmed)
  skipped: string[];
  focusMin: number;
  distractions: string;
}): string {
  const lines: string[] = [];
  const pct = o.tasksPlanned ? o.tasksDone / o.tasksPlanned : 0;
  if (o.tasksPlanned === 0 && o.practiced.length === 0) lines.push("A quiet day on record. That's okay. Tomorrow, try one small, concrete win to restart momentum.");
  else if (pct >= 0.8) lines.push(`Strong day: ${o.tasksDone}/${o.tasksPlanned} planned tasks done.`);
  else if (pct >= 0.5) lines.push(`Solid progress: ${o.tasksDone}/${o.tasksPlanned} tasks done. Consistency matters more than perfection.`);
  else if (o.tasksPlanned > 0) lines.push(`${o.tasksDone}/${o.tasksPlanned} tasks done. Not the day you planned, but you showed up to review it, and that counts.`);

  if (o.prioritiesTotal > 0) {
    if (o.prioritiesDone === o.prioritiesTotal) lines.push("All priorities completed. Well done.");
    else lines.push(`Priorities: ${o.prioritiesDone}/${o.prioritiesTotal}. Was the plan too big, or did something urgent take over? Adjust tomorrow's plan to match.`);
  }
  if (o.practiced.length) lines.push(`Practice logged: ${o.practiced.join(", ")}.`);
  if (o.focusMin > 0) lines.push(`${formatDuration(o.focusMin)} of focused work.`);
  if (o.skipped.length >= 3) lines.push(`Skipped today: ${o.skipped.slice(0, 3).join(", ")}${o.skipped.length > 3 ? "…" : ""}. Pick just one of them for tomorrow; 10 minutes is enough to keep the habit alive.`);
  if (o.distractions.trim()) lines.push("You named your distractions. Removing one trigger tomorrow (phone in another room, a site blocked) is a practical next step.");
  lines.push("Rest well.");
  return lines.join(" ");
}

// Accountability coach: balanced, honest, practical. Deterministic and based only on
// what the user confirmed — it never assumes something was done.
import { t } from "../i18n";
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
  const hi = o.name ? t("coach.hiName", { name: o.name }) : t("coach.hi");
  if (o.energy === "low") lines.push(t("coach.lowEnergy", { hi }));
  else if (o.energy === "high") lines.push(t("coach.highEnergy", { hi }));
  else lines.push(t("coach.steady", { hi }));

  if (o.scheduledCount === 0) lines.push(t("coach.nothing"));
  else lines.push(t("coach.plan", { n: o.scheduledCount, planned: formatDuration(o.plannedMin), cap: formatDuration(o.capacityMin) }));
  if (o.overflowCount > 0) lines.push(t("coach.overflow", { n: o.overflowCount }));
  if (o.overdueCount > 0) lines.push(t("coach.overdue", { n: o.overdueCount }));
  if (o.examSoon) lines.push(t("coach.exam", { title: o.examSoon.title, n: o.examSoon.days }));
  return lines.join(" ");
}

export function eveningMessage(o: {
  name: string;
  tasksDone: number;
  tasksPlanned: number;
  prioritiesDone: number;
  prioritiesTotal: number;
  practiced: string[]; // areas practised (confirmed), already translated
  skipped: string[];
  focusMin: number;
  distractions: string;
}): string {
  const lines: string[] = [];
  const pct = o.tasksPlanned ? o.tasksDone / o.tasksPlanned : 0;
  const v = { done: o.tasksDone, total: o.tasksPlanned };
  if (o.tasksPlanned === 0 && o.practiced.length === 0) lines.push(t("coach.quiet"));
  else if (pct >= 0.8) lines.push(t("coach.strong", v));
  else if (pct >= 0.5) lines.push(t("coach.solid", v));
  else if (o.tasksPlanned > 0) lines.push(t("coach.tough", v));

  if (o.prioritiesTotal > 0) {
    if (o.prioritiesDone === o.prioritiesTotal) lines.push(t("coach.allPriorities"));
    else lines.push(t("coach.somePriorities", { done: o.prioritiesDone, total: o.prioritiesTotal }));
  }
  if (o.practiced.length) lines.push(t("coach.practiced", { list: o.practiced.join(", ") }));
  if (o.focusMin > 0) lines.push(t("coach.focus", { dur: formatDuration(o.focusMin) }));
  if (o.skipped.length >= 3) lines.push(t("coach.skipped", { list: o.skipped.slice(0, 3).join(", ") + (o.skipped.length > 3 ? "…" : "") }));
  if (o.distractions.trim()) lines.push(t("coach.distractions"));
  lines.push(t("coach.rest"));
  return lines.join(" ");
}

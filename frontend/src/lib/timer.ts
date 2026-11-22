// Pomodoro engine. Timestamp-based (never counts ticks), so it stays accurate while the app
// is minimised or even killed: the state is persisted and the end time is computed from the clock.
// A native notification is scheduled for the end time so the user is alerted with the app closed.
import type { Store } from "../db/store";
import { uid } from "../db/store";
import { cancelFocusEnd, scheduleFocusEnd } from "../native/notifications";
import { recordFocusSession } from "./actions";
import { todayISO } from "./date";
import type { ActiveTimer, FocusSession } from "./types";

const KEY = "activeTimer";

export function getTimer(s: Store): ActiveTimer | null {
  return s.getKv<ActiveTimer>(KEY);
}

export function remainingMs(t: ActiveTimer, now = Date.now()): number {
  if (t.paused || !t.endsAt) return t.remainingMs;
  return Math.max(0, new Date(t.endsAt).getTime() - now);
}

export function elapsedMs(t: ActiveTimer, now = Date.now()): number {
  return t.plannedMin * 60000 - remainingMs(t, now);
}

export function startTimer(s: Store, opts: { kind: ActiveTimer["kind"]; minutes: number; taskId?: string | null; label?: string; cycle?: number }) {
  const minutes = Math.min(240, Math.max(1, Math.round(opts.minutes)));
  const now = Date.now();
  const t: ActiveTimer = {
    kind: opts.kind,
    plannedMin: minutes,
    startedAt: new Date(now).toISOString(),
    endsAt: new Date(now + minutes * 60000).toISOString(),
    remainingMs: minutes * 60000,
    accumulatedMs: 0,
    taskId: opts.taskId ?? null,
    label: opts.label ?? "",
    cycle: opts.cycle ?? getTimer(s)?.cycle ?? 0,
    paused: false,
  };
  s.setKv(KEY, t);
  if (s.settings.focusEndNotification) void scheduleFocusEnd(new Date(t.endsAt!), t.kind, t.label);
  return t;
}

export function pauseTimer(s: Store) {
  const t = getTimer(s);
  if (!t || t.paused) return;
  s.setKv(KEY, { ...t, paused: true, remainingMs: remainingMs(t), endsAt: null });
  void cancelFocusEnd();
}

export function resumeTimer(s: Store) {
  const t = getTimer(s);
  if (!t || !t.paused) return;
  const endsAt = new Date(Date.now() + t.remainingMs).toISOString();
  s.setKv(KEY, { ...t, paused: false, endsAt });
  if (s.settings.focusEndNotification) void scheduleFocusEnd(new Date(endsAt), t.kind, t.label);
}

/** Stop early. Focus time already spent (≥1 min) is kept in history as an incomplete session. */
export function resetTimer(s: Store) {
  const t = getTimer(s);
  if (!t) return;
  const spent = Math.floor(elapsedMs(t) / 60000);
  if (t.kind === "focus" && spent >= 1) saveSession(s, t, spent, false);
  s.setKv(KEY, null);
  void cancelFocusEnd();
}

function saveSession(s: Store, t: ActiveTimer, actualMin: number, completed: boolean) {
  const end = completed && t.endsAt ? new Date(t.endsAt) : new Date();
  const f: FocusSession = {
    id: uid(),
    kind: t.kind,
    startedAt: t.startedAt,
    endedAt: end.toISOString(),
    plannedMin: t.plannedMin,
    actualMin,
    completed,
    taskId: t.taskId,
    label: t.label,
    date: todayISO(end),
  };
  return recordFocusSession(s, f);
}

/**
 * Called every second while the app is open and on resume. If the timer has ended, records it
 * and returns what should come next (break or focus).
 */
export function checkTimer(s: Store): { finished: ActiveTimer; next: ActiveTimer["kind"]; xp: number } | null {
  const t = getTimer(s);
  if (!t || t.paused || remainingMs(t) > 0) return null;
  const res = saveSession(s, t, t.plannedMin, true);
  const cycle = t.kind === "focus" ? t.cycle + 1 : t.cycle;
  const every = Math.max(2, s.settings.longBreakEvery);
  const next: ActiveTimer["kind"] = t.kind === "focus" ? (cycle % every === 0 ? "long_break" : "short_break") : "focus";
  s.setKv(KEY, null);
  s.setKv("timerCycle", cycle);
  return { finished: t, next, xp: res.xp };
}

export function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((delay, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i];
      g.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.45);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* audio unavailable */
  }
}

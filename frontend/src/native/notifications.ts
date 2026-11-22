// Native Android notifications (Capacitor Local Notifications → AlarmManager).
//
// Reliability design:
//  * Daily reminders are scheduled as a rolling window of one-shot alarms (next 30 days).
//    One-shot alarms use setExactAndAllowWhileIdle (RTC_WAKEUP) when exact alarms are allowed,
//    which fire even in Doze / with the screen locked and the app closed. The plugin's own
//    "repeat daily" mode re-arms with a non-wakeup alarm, which Doze can delay — so we avoid it.
//  * The window is re-synced every time the app starts or resumes, and whenever settings change.
//    Fixed IDs + cancel-before-schedule guarantee no duplicates.
//  * After a reboot the plugin's BOOT_COMPLETED receiver restores pending alarms.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { addDays, todayISO, zonedTimeToDate } from "../lib/date";
import type { Settings } from "../lib/types";

export const isNative = () => Capacitor.isNativePlatform();

const MORNING_BASE = 1000;
const EVENING_BASE = 2000;
export const FOCUS_ID = 3000;
const WINDOW_DAYS = 30;
const CHANNEL_REMINDERS = "lifeos-reminders";
const CHANNEL_FOCUS = "lifeos-focus";

export const MORNING_TEXT = "Good morning. Let's plan your day and make progress on your goals.";
export const EVENING_TEXT = "Time for your LIFEOS check-in. Review today's progress and prepare tomorrow.";

// Static import on purpose: returning a Capacitor plugin proxy from an async function makes
// JavaScript call proxy.then(), which Capacitor rejects ("LocalNotifications.then() is not implemented").
function LN() {
  return LocalNotifications;
}

export interface NotificationStatus {
  supported: boolean;
  permission: "granted" | "denied" | "prompt" | "unsupported";
  exactAlarms: "granted" | "denied" | "not-required" | "unsupported";
  pending: number;
}

export async function getNotificationStatus(): Promise<NotificationStatus> {
  if (!isNative()) return { supported: false, permission: "unsupported", exactAlarms: "unsupported", pending: 0 };
  const ln = LN();
  const perm = await ln.checkPermissions();
  let exact: NotificationStatus["exactAlarms"] = "not-required";
  try {
    const e = await ln.checkExactNotificationSetting();
    exact = e.exact_alarm === "granted" ? "granted" : "denied";
  } catch {
    exact = "not-required";
  }
  const pending = (await ln.getPending().catch(() => ({ notifications: [] }))).notifications.length;
  const p = perm.display;
  return { supported: true, permission: p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt", exactAlarms: exact, pending };
}

/** Android 13+ shows the system permission dialog; older versions grant automatically. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const ln = LN();
  const res = await ln.requestPermissions();
  return res.display === "granted";
}

/** Opens Android's "Alarms & reminders" screen so the user can allow exact timing. */
export async function openExactAlarmSettings() {
  if (!isNative()) return;
  const ln = LN();
  await ln.changeExactNotificationSetting();
}

let channelsReady = false;
async function ensureChannels() {
  if (channelsReady) return;
  const ln = LN();
  await ln.createChannel({ id: CHANNEL_REMINDERS, name: "Daily check-ins", description: "Morning planning and evening review reminders", importance: 4, visibility: 1, vibration: true });
  await ln.createChannel({ id: CHANNEL_FOCUS, name: "Focus timer", description: "Pomodoro session finished", importance: 4, visibility: 1, vibration: true });
  channelsReady = true;
}

async function exactAllowed(): Promise<boolean> {
  try {
    const ln = LN();
    return (await ln.checkExactNotificationSetting()).exact_alarm === "granted";
  } catch {
    return true; // Android < 12: exact alarms need no permission
  }
}

export function plannedReminderTimes(settings: Settings, now = new Date()) {
  const today = todayISO(now);
  const out: { id: number; at: Date; kind: "morning" | "evening" }[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const day = addDays(today, i);
    if (settings.morningEnabled) {
      const at = zonedTimeToDate(day, settings.morningTime);
      if (at.getTime() > now.getTime() + 5000) out.push({ id: MORNING_BASE + i, at, kind: "morning" });
    }
    if (settings.eveningEnabled) {
      const at = zonedTimeToDate(day, settings.eveningTime);
      if (at.getTime() > now.getTime() + 5000) out.push({ id: EVENING_BASE + i, at, kind: "evening" });
    }
  }
  return out;
}

/**
 * Cancel and re-create the reminder window. Returns a short status for the UI.
 * Does not prompt for permissions; call requestNotificationPermission() from a user action first.
 */
export async function syncDailyReminders(settings: Settings): Promise<{ scheduled: number; exact: boolean; message: string }> {
  if (!isNative()) return { scheduled: 0, exact: false, message: "Notifications are available in the Android app." };
  const ln = LN();
  const perm = await ln.checkPermissions();
  // Always clear our reminder IDs first so changes never leave duplicates behind.
  const ids: { id: number }[] = [];
  for (let i = 0; i < WINDOW_DAYS + 5; i++) ids.push({ id: MORNING_BASE + i }, { id: EVENING_BASE + i });
  await ln.cancel({ notifications: ids }).catch(() => undefined);
  if (perm.display !== "granted") return { scheduled: 0, exact: false, message: "Notification permission not granted." };
  await ensureChannels();
  const exact = await exactAllowed();
  const planned = plannedReminderTimes(settings);
  if (!planned.length) return { scheduled: 0, exact, message: "Reminders are turned off." };
  await ln.schedule({
    notifications: planned.map((p) => ({
      id: p.id,
      title: p.kind === "morning" ? "LIFEOS · Morning plan" : "LIFEOS · Evening check-in",
      body: p.kind === "morning" ? MORNING_TEXT : EVENING_TEXT,
      channelId: CHANNEL_REMINDERS,
      smallIcon: "ic_stat_lifeos",
      iconColor: "#4F7CFF",
      schedule: { at: p.at, allowWhileIdle: true },
      isExactNotification: exact, // false = don't open the settings screen on every sync
      extra: { route: p.kind === "morning" ? "/checkin/morning" : "/checkin/evening" },
      autoCancel: true,
    })),
  });
  return { scheduled: planned.length, exact, message: exact ? "Scheduled with exact timing." : "Scheduled. Exact timing is off, so Android may deliver a few minutes late." };
}

export async function scheduleFocusEnd(at: Date, kind: string, label: string) {
  if (!isNative()) return;
  const ln = LN();
  if ((await ln.checkPermissions()).display !== "granted") return;
  await ensureChannels();
  await ln.cancel({ notifications: [{ id: FOCUS_ID }] }).catch(() => undefined);
  const focus = kind === "focus";
  await ln.schedule({
    notifications: [
      {
        id: FOCUS_ID,
        title: focus ? "Focus session complete" : "Break is over",
        body: focus ? `${label ? label + " · " : ""}Nice work. Take a break.` : "Ready for the next focus session?",
        channelId: CHANNEL_FOCUS,
        smallIcon: "ic_stat_lifeos",
        iconColor: "#4F7CFF",
        schedule: { at, allowWhileIdle: true },
        isExactNotification: await exactAllowed(),
        extra: { route: "/focus" },
        autoCancel: true,
      },
    ],
  });
}

export async function cancelFocusEnd() {
  if (!isNative()) return;
  const ln = LN();
  await ln.cancel({ notifications: [{ id: FOCUS_ID }] }).catch(() => undefined);
}

/** Calls `onRoute` when the user taps a LIFEOS notification. */
export async function listenForNotificationTaps(onRoute: (route: string) => void) {
  if (!isNative()) return;
  const ln = LN();
  await ln.addListener("localNotificationActionPerformed", (action) => {
    const route = (action.notification.extra as { route?: string } | undefined)?.route;
    if (route) onRoute(route);
  });
}

export async function sendTestNotification() {
  if (!isNative()) return false;
  const ln = LN();
  if ((await ln.checkPermissions()).display !== "granted") return false;
  await ensureChannels();
  await ln.schedule({
    notifications: [{ id: 9000, title: "LIFEOS test", body: "Notifications are working. Tap to open the evening check-in.", channelId: CHANNEL_REMINDERS, smallIcon: "ic_stat_lifeos", schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }, isExactNotification: false, extra: { route: "/checkin/evening" } }],
  });
  return true;
}

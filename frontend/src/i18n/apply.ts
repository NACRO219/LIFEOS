// Switch the app language: load the dictionary first, then save the setting (which re-renders
// the app), then reschedule reminders so notification texts use the new language.
import { store } from "../db/store";
import { syncDailyReminders } from "../native/notifications";
import { loadLanguage } from "./index";

export async function changeLanguage(setting: string) {
  await loadLanguage(setting);
  store().saveSettings({ language: setting });
  await syncDailyReminders(store().settings).catch(() => undefined);
}

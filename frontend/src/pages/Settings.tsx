import { Bell, Cloud, Database, Download, Info, Moon, Palette, Shield, Sparkles, Target, Timer, Upload, User } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { syncApi } from "../api";
import { Card, confirmDialog, Field, NumberInput, Page, Section, Segmented, Switch, toast } from "../components/ui";
import { Store, store, useStore } from "../db/store";
import { deviceTimezone, setActiveTimezone, WEEKDAYS } from "../lib/date";
import type { Settings as SettingsT } from "../lib/types";
import { exportBackupFile, readFileAsText } from "../native/files";
import { getNotificationStatus, isNative, openExactAlarmSettings, requestNotificationPermission, sendTestNotification, syncDailyReminders, type NotificationStatus } from "../native/notifications";

export const APP_VERSION = "2.0.0";

function Row({ icon, title, sub, children }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="list-item">
      {icon && <span className="faint">{icon}</span>}
      <div className="grow">
        <div className="title">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const s = useStore();
  const st = s.settings;
  const save = (patch: Partial<SettingsT>) => s.saveSettings(patch);
  const [notif, setNotif] = useState<NotificationStatus | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const zones = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
    } catch {
      return [];
    }
  })();

  const refreshNotif = () => getNotificationStatus().then(setNotif).catch(() => undefined);
  useEffect(() => {
    refreshNotif();
  }, []);

  const resync = async (next: SettingsT) => {
    try {
      const r = await syncDailyReminders(next);
      if (isNative()) toast(r.scheduled ? `Reminders updated. ${r.message}` : r.message);
    } catch (e) {
      toast(`Couldn't schedule reminders: ${String((e as Error).message ?? e)}`, "error");
    }
    refreshNotif();
  };
  const saveReminder = (patch: Partial<SettingsT>) => {
    save(patch);
    void resync({ ...store().settings });
  };

  const enableNotifications = async () => {
    const ok = await requestNotificationPermission();
    if (!ok) toast("Permission denied. Enable notifications for LIFEOS in Android Settings → Apps → LIFEOS → Notifications.", "error");
    await resync(store().settings);
  };

  const doExport = async () => {
    try {
      await store().flush();
      const msg = await exportBackupFile(store().exportBackup());
      save({ lastBackupAt: new Date().toISOString() });
      toast(msg);
    } catch (e) {
      toast(`Export failed: ${String((e as Error).message ?? e)}`, "error");
    }
  };

  const doImport = async (file: File) => {
    try {
      const raw = JSON.parse(await readFileAsText(file));
      const v = Store.validateBackup(raw);
      if (!v.ok) return toast(v.error, "error");
      const counts = Object.entries(v.counts).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(", ");
      const ok = await confirmDialog({ title: "Replace all data with this backup?", body: <>Backup from {new Date(v.backup.exportedAt).toLocaleString()}: {counts || "no records"}. Your current data will be replaced. Export a backup first if unsure.</>, confirm: "Restore", danger: true });
      if (!ok) return;
      await store().restoreBackup(v.backup);
      setActiveTimezone(store().settings.timezone);
      await resync(store().settings);
      toast("Backup restored");
    } catch (e) {
      toast(`Import failed: ${e instanceof SyntaxError ? "the file is not valid JSON" : String((e as Error).message ?? e)}`, "error");
    }
  };

  const doReset = async () => {
    if (!(await confirmDialog({ title: "Reset all LIFEOS data?", body: "Every task, course, grade, session and setting on this phone will be permanently erased.", confirm: "Continue", danger: true }))) return;
    if (!(await confirmDialog({ title: "Are you absolutely sure?", body: "This cannot be undone. Consider exporting a backup first.", confirm: "Erase everything", danger: true }))) return;
    await store().resetAll();
    setActiveTimezone("device");
    await resync(store().settings);
    toast("All data erased");
  };

  const upload = async () => {
    setSyncMsg("Uploading…");
    try {
      await store().flush();
      const r = await syncApi.upload(st.syncUrl, st.syncToken, store().exportBackup());
      setSyncMsg(`Uploaded at ${new Date(r.stored_at).toLocaleString()} (${Math.round(r.size / 1024)} KB)`);
    } catch (e) {
      setSyncMsg(`Upload failed: ${String((e as Error).message ?? e)}`);
    }
  };
  const download = async () => {
    setSyncMsg("Downloading…");
    try {
      const b = await syncApi.download(st.syncUrl, st.syncToken);
      const v = Store.validateBackup(b);
      if (!v.ok) return setSyncMsg(v.error);
      if (!(await confirmDialog({ title: "Replace local data with the server backup?", body: `Server backup from ${new Date(v.backup.exportedAt).toLocaleString()}.`, confirm: "Replace", danger: true }))) return setSyncMsg("");
      await store().restoreBackup(v.backup);
      await resync(store().settings);
      setSyncMsg("Restored from server");
    } catch (e) {
      setSyncMsg(`Download failed: ${String((e as Error).message ?? e)}`);
    }
  };

  const permLabel = !notif ? "…" : !notif.supported ? "Android app only" : notif.permission === "granted" ? "Allowed" : notif.permission === "denied" ? "Blocked" : "Not asked yet";

  return (
    <Page title="Settings" showBack>
      <Section title="Profile">
        <Card>
          <Field label="Your name">
            <input value={st.name} maxLength={40} onChange={(e) => save({ name: e.target.value })} placeholder="Used in greetings" />
          </Field>
          <Field label="Timezone" hint={`Device timezone: ${deviceTimezone()}. Dates, streaks and reminder times follow this setting.`}>
            <select
              value={st.timezone}
              onChange={(e) => {
                setActiveTimezone(e.target.value);
                saveReminder({ timezone: e.target.value });
              }}
            >
              <option value="device">Follow device ({deviceTimezone()})</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <small className="faint">App language: English (other interface languages are not available yet).</small>
        </Card>
      </Section>

      <Section title="Appearance">
        <Card>
          <div className="row gap-s" style={{ marginBottom: 8 }}>
            <Palette size={16} /> Theme
          </div>
          <Segmented value={st.theme} onChange={(v) => save({ theme: v })} options={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
        </Card>
      </Section>

      <Section title="Notifications">
        <Card className="tight">
          <Row icon={<Bell size={18} />} title="Permission" sub={permLabel}>
            {notif?.supported && notif.permission !== "granted" && (
              <button className="btn primary small" onClick={enableNotifications}>
                Allow
              </button>
            )}
          </Row>
          {notif?.supported && (
            <Row title="Exact timing (Alarms & reminders)" sub={notif.exactAlarms === "granted" ? "Allowed: reminders fire on the minute" : notif.exactAlarms === "denied" ? "Off: Android may delay reminders by several minutes" : "Not required on this Android version"}>
              {notif.exactAlarms === "denied" && (
                <button className="btn small" onClick={async () => { await openExactAlarmSettings(); await resync(store().settings); }}>
                  Allow
                </button>
              )}
            </Row>
          )}
          <Row icon={<Moon size={18} />} title="Morning planning reminder" sub={st.morningEnabled ? `Daily at ${st.morningTime}` : "Off"}>
            <Switch checked={st.morningEnabled} onChange={(v) => saveReminder({ morningEnabled: v })} label="Morning reminder" />
          </Row>
          {st.morningEnabled && (
            <div style={{ padding: "0 2px 10px" }}>
              <input type="time" value={st.morningTime} onChange={(e) => e.target.value && saveReminder({ morningTime: e.target.value })} />
            </div>
          )}
          <Row icon={<Moon size={18} />} title="Evening check-in reminder" sub={st.eveningEnabled ? `Daily at ${st.eveningTime}` : "Off"}>
            <Switch checked={st.eveningEnabled} onChange={(v) => saveReminder({ eveningEnabled: v })} label="Evening reminder" />
          </Row>
          {st.eveningEnabled && (
            <div style={{ padding: "0 2px 10px" }}>
              <input type="time" value={st.eveningTime} onChange={(e) => e.target.value && saveReminder({ eveningTime: e.target.value })} />
            </div>
          )}
          <Row icon={<Timer size={18} />} title="Notify when a focus session ends">
            <Switch checked={st.focusEndNotification} onChange={(v) => save({ focusEndNotification: v })} />
          </Row>
          <Row title="Chime when the timer ends (app open)">
            <Switch checked={st.focusSound} onChange={(v) => save({ focusSound: v })} />
          </Row>
          {notif?.supported && (
            <Row title="Send a test notification" sub={`${notif.pending} reminder(s) scheduled`}>
              <button className="btn small" onClick={async () => toast((await sendTestNotification()) ? "Test notification arrives in about 5 seconds. Lock the phone to try it." : "Allow notifications first.", "info")}>
                Test
              </button>
            </Row>
          )}
        </Card>
        {notif?.supported && (
          <p className="faint small mt">
            Reminders work with the app closed and the phone locked. Some phones (Xiaomi, Huawei, Samsung, OnePlus…) stop apps in the background to save battery. If a reminder doesn't arrive, set LIFEOS to "Unrestricted" in Settings → Apps → LIFEOS → Battery.
          </p>
        )}
      </Section>

      <Section title="Focus timer">
        <Card>
          <div className="grid-2">
            <Field label="Focus (min)">
              <NumberInput value={st.focusMin} min={1} max={240} onChange={(v) => v && save({ focusMin: v })} />
            </Field>
            <Field label="Short break (min)">
              <NumberInput value={st.shortBreakMin} min={1} max={60} onChange={(v) => v && save({ shortBreakMin: v })} />
            </Field>
            <Field label="Long break (min)">
              <NumberInput value={st.longBreakMin} min={1} max={120} onChange={(v) => v && save({ longBreakMin: v })} />
            </Field>
            <Field label="Long break every">
              <NumberInput value={st.longBreakEvery} min={2} max={10} onChange={(v) => v && save({ longBreakEvery: v })} />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Goals">
        <Card>
          <div className="row gap-s small faint" style={{ marginBottom: 8 }}>
            <Target size={14} /> Daily
          </div>
          <div className="grid-3">
            <Field label="Tasks">
              <NumberInput value={st.dailyGoals.tasks} min={0} max={50} onChange={(v) => save({ dailyGoals: { ...st.dailyGoals, tasks: v ?? 0 } })} />
            </Field>
            <Field label="Focus min">
              <NumberInput value={st.dailyGoals.focusMin} min={0} max={960} onChange={(v) => save({ dailyGoals: { ...st.dailyGoals, focusMin: v ?? 0 } })} />
            </Field>
            <Field label="Language min">
              <NumberInput value={st.dailyGoals.languageMin} min={0} max={600} onChange={(v) => save({ dailyGoals: { ...st.dailyGoals, languageMin: v ?? 0 } })} />
            </Field>
          </div>
          <div className="row gap-s small faint" style={{ marginBottom: 8 }}>
            <Target size={14} /> Weekly
          </div>
          <div className="grid-2">
            <Field label="Study minutes">
              <NumberInput value={st.weeklyGoals.studyMin} min={0} max={6000} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, studyMin: v ?? 0 } })} />
            </Field>
            <Field label="Coding exercises">
              <NumberInput value={st.weeklyGoals.codingExercises} min={0} max={200} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, codingExercises: v ?? 0 } })} />
            </Field>
            <Field label="Workouts">
              <NumberInput value={st.weeklyGoals.workouts} min={0} max={21} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, workouts: v ?? 0 } })} />
            </Field>
            <Field label="Language minutes">
              <NumberInput value={st.weeklyGoals.languageMin} min={0} max={4200} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, languageMin: v ?? 0 } })} />
            </Field>
          </div>
          <div className="small faint" style={{ marginBottom: 8 }}>
            Default free time for tasks (minutes)
          </div>
          <div className="grid-4">
            {WEEKDAYS.map((d, i) => (
              <Field key={d} label={d}>
                <NumberInput value={st.defaultAvailableMin[i]} min={0} max={1200} step={15} onChange={(v) => save({ defaultAvailableMin: st.defaultAvailableMin.map((x, j) => (j === i ? v ?? 0 : x)) })} />
              </Field>
            ))}
          </div>
        </Card>
      </Section>

      <Section title="XP">
        <Card>
          <div className="row gap-s small faint" style={{ marginBottom: 8 }}>
            <Sparkles size={14} /> XP per event (applies to new events)
          </div>
          <div className="grid-2">
            {(
              [
                ["university", "University task"],
                ["programmingExercise", "Programming exercise"],
                ["languageLesson", "Language lesson"],
                ["allPriorities", "All daily priorities"],
                ["eveningReview", "Evening review"],
                ["otherTask", "Other task"],
                ["workout", "Workout"],
                ["focusSession", "Focus session"],
              ] as [keyof SettingsT["xp"], string][]
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <NumberInput value={st.xp[k]} min={0} max={500} onChange={(v) => save({ xp: { ...st.xp, [k]: v ?? 0 } })} />
              </Field>
            ))}
            <Field label="XP for level 1→2" hint="Each level costs a bit more">
              <NumberInput value={st.levelXp} min={50} max={5000} step={50} onChange={(v) => v && save({ levelXp: v })} />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title="Privacy">
        <Card className="tight">
          <Row icon={<Shield size={18} />} title="Your data stays on this phone" sub="Stored in a private SQLite database only LIFEOS can read. No accounts, ads, analytics or tracking. Nothing leaves the phone unless you export a backup or turn on server backup." />
          <Row title="Hide GPA on the dashboard">
            <Switch checked={st.hideGpaOnDashboard} onChange={(v) => save({ hideGpaOnDashboard: v })} />
          </Row>
        </Card>
      </Section>

      <Section title="Data">
        <Card className="tight">
          <Row icon={<Download size={18} />} title="Export backup" sub={st.lastBackupAt ? `Last export ${new Date(st.lastBackupAt).toLocaleString()}` : "Never exported. Export regularly."}>
            <button className="btn small" onClick={doExport}>
              Export
            </button>
          </Row>
          <Row icon={<Upload size={18} />} title="Import backup" sub="Restore from a LIFEOS .json backup">
            <button className="btn small" onClick={() => fileRef.current?.click()}>
              Import
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void doImport(f); }} />
          </Row>
          <Row icon={<Database size={18} />} title="Reset all data" sub={`Storage: ${store().backend.kind === "sqlite" ? "SQLite (on device)" : store().backend.kind === "indexeddb" ? "IndexedDB (browser)" : "memory"}`}>
            <button className="btn danger small" onClick={doReset}>
              Reset
            </button>
          </Row>
        </Card>
      </Section>

      <Section title="Server backup (optional)">
        <Card>
          <p className="small muted" style={{ marginBottom: 12 }}>
            <Cloud size={14} /> Copy your data to your own LIFEOS server (the FastAPI backend). LIFEOS works fully without it.
          </p>
          <Field label="Server URL" hint="e.g. http://192.168.1.20:8000 (your PC on the same Wi-Fi)">
            <input inputMode="url" value={st.syncUrl} onChange={(e) => save({ syncUrl: e.target.value.trim() })} placeholder="http://…:8000" />
          </Field>
          <Field label="Sync token" hint="The LIFEOS_SYNC_TOKEN value from the server's .env file">
            <input type="password" value={st.syncToken} onChange={(e) => save({ syncToken: e.target.value.trim() })} autoComplete="off" />
          </Field>
          <div className="row">
            <button className="btn grow" disabled={!st.syncUrl || !st.syncToken} onClick={upload}>
              <Upload size={16} /> Upload
            </button>
            <button className="btn grow" disabled={!st.syncUrl || !st.syncToken} onClick={download}>
              <Download size={16} /> Restore
            </button>
          </div>
          {syncMsg && <p className="small mt">{syncMsg}</p>}
        </Card>
      </Section>

      <Section title="About">
        <Card className="tight">
          <Row icon={<Info size={18} />} title={`LIFEOS ${APP_VERSION}`} sub="A personal operating system for university, programming, languages, fitness and habits. Built to work fully offline." />
          <Row icon={<User size={18} />} title="Made for you" sub="Small progress. Every day." />
        </Card>
      </Section>
    </Page>
  );
}

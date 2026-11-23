import { Bell, Cloud, Database, Download, Globe, Info, Moon, Palette, Shield, Sparkles, Target, Timer, Upload, User } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { syncApi } from "../api";
import { Card, confirmDialog, Field, NumberInput, Page, Section, Segmented, Switch, toast } from "../components/ui";
import { Store, store, useStore } from "../db/store";
import { currentLanguage, LANGUAGES, loadLanguage, t, type TKey } from "../i18n";
import { changeLanguage } from "../i18n/apply";
import { deviceTimezone, setActiveTimezone, weekdayShort } from "../lib/date";
import type { Settings as SettingsT } from "../lib/types";
import { exportBackupFile, readFileAsText } from "../native/files";
import { getNotificationStatus, isNative, openExactAlarmSettings, requestNotificationPermission, sendTestNotification, syncDailyReminders, type NotificationStatus } from "../native/notifications";

export const APP_VERSION = "2.1.0";

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

export function LanguagePicker() {
  const st = useStore().settings;
  return (
    <select value={st.language ?? "auto"} onChange={(e) => void changeLanguage(e.target.value)} aria-label={t("set.language")}>
      <option value="auto">{t("set.langAuto")}</option>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code} lang={l.intl}>
          {l.native}
          {l.native !== l.english ? ` · ${l.english}` : ""}
        </option>
      ))}
    </select>
  );
}

const errText = (e: unknown) => String((e as Error)?.message ?? e);

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
      if (isNative()) toast(r.scheduled ? t("set.remindersUpdated", { msg: r.message }) : r.message);
    } catch (e) {
      toast(t("set.remindersFailed", { error: errText(e) }), "error");
    }
    refreshNotif();
  };
  const saveReminder = (patch: Partial<SettingsT>) => {
    save(patch);
    void resync({ ...store().settings });
  };
  /** After a restore, settings may name another timezone and language. */
  const afterRestore = async () => {
    setActiveTimezone(store().settings.timezone);
    await loadLanguage(store().settings.language);
    store().saveSettings({});
    await resync(store().settings);
  };

  const enableNotifications = async () => {
    const ok = await requestNotificationPermission();
    if (!ok) toast(t("set.permDenied"), "error");
    await resync(store().settings);
  };

  const doExport = async () => {
    try {
      await store().flush();
      const msg = await exportBackupFile(store().exportBackup());
      save({ lastBackupAt: new Date().toISOString() });
      toast(msg);
    } catch (e) {
      toast(t("set.exportFailed", { error: errText(e) }), "error");
    }
  };

  const doImport = async (file: File) => {
    try {
      const raw = JSON.parse(await readFileAsText(file));
      const v = Store.validateBackup(raw);
      if (!v.ok) return toast(v.error, "error");
      const counts = Object.entries(v.counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(", ");
      const ok = await confirmDialog({ title: t("set.restoreTitle"), body: t("set.restoreBody", { date: new Date(v.backup.exportedAt).toLocaleString(), counts: counts || t("set.noRecords") }), confirm: t("set.restore"), danger: true });
      if (!ok) return;
      await store().restoreBackup(v.backup);
      await afterRestore();
      toast(t("set.restored"));
    } catch (e) {
      toast(t("set.importFailed", { error: e instanceof SyntaxError ? t("set.notJson") : errText(e) }), "error");
    }
  };

  const doReset = async () => {
    if (!(await confirmDialog({ title: t("set.resetTitle"), body: t("set.resetBody"), confirm: t("set.continue"), danger: true }))) return;
    if (!(await confirmDialog({ title: t("set.sureTitle"), body: t("set.sureBody"), confirm: t("set.erase"), danger: true }))) return;
    await store().resetAll();
    await afterRestore();
    toast(t("set.erased"));
  };

  const upload = async () => {
    setSyncMsg(t("set.uploading"));
    try {
      await store().flush();
      const r = await syncApi.upload(st.syncUrl, st.syncToken, store().exportBackup());
      setSyncMsg(t("set.uploaded", { date: new Date(r.stored_at).toLocaleString(), kb: Math.round(r.size / 1024) }));
    } catch (e) {
      setSyncMsg(t("set.uploadFailed", { error: errText(e) }));
    }
  };
  const download = async () => {
    setSyncMsg(t("set.downloading"));
    try {
      const b = await syncApi.download(st.syncUrl, st.syncToken);
      const v = Store.validateBackup(b);
      if (!v.ok) return setSyncMsg(v.error);
      if (!(await confirmDialog({ title: t("set.serverReplace"), body: t("set.serverReplaceBody", { date: new Date(v.backup.exportedAt).toLocaleString() }), confirm: t("set.replace"), danger: true }))) return setSyncMsg("");
      await store().restoreBackup(v.backup);
      await afterRestore();
      setSyncMsg(t("set.restoredServer"));
    } catch (e) {
      setSyncMsg(t("set.downloadFailed", { error: errText(e) }));
    }
  };

  const permLabel = !notif ? "…" : !notif.supported ? t("set.permAndroid") : notif.permission === "granted" ? t("set.permAllowed") : notif.permission === "denied" ? t("set.permBlocked") : t("set.permAsk");
  const storageKind = store().backend.kind === "sqlite" ? t("set.storageSqlite") : store().backend.kind === "indexeddb" ? t("set.storageIdb") : t("set.storageMem");
  const xpFields: [keyof SettingsT["xp"], TKey][] = [
    ["university", "set.xpUni"],
    ["programmingExercise", "set.xpCode"],
    ["languageLesson", "set.xpLang"],
    ["allPriorities", "set.xpPrio"],
    ["eveningReview", "set.xpEvening"],
    ["otherTask", "set.xpOther"],
    ["workout", "set.xpWorkout"],
    ["focusSession", "set.xpFocus"],
  ];

  return (
    <Page title={t("set.title")} showBack>
      <Section title={t("set.language")}>
        <Card>
          <div className="row gap-s" style={{ marginBottom: 8 }}>
            <Globe size={16} /> {LANGUAGES.find((l) => l.code === currentLanguage())?.native}
          </div>
          <LanguagePicker />
          <small className="faint" style={{ display: "block", marginTop: 8 }}>
            {t("set.langHint")}
          </small>
        </Card>
      </Section>

      <Section title={t("set.profile")}>
        <Card>
          <Field label={t("set.name")}>
            <input value={st.name} maxLength={40} onChange={(e) => save({ name: e.target.value })} placeholder={t("set.namePh")} />
          </Field>
          <Field label={t("set.timezone")} hint={t("set.tzHint", { tz: deviceTimezone() })}>
            <select
              value={st.timezone}
              onChange={(e) => {
                setActiveTimezone(e.target.value);
                saveReminder({ timezone: e.target.value });
              }}
            >
              <option value="device">{t("set.tzDevice", { tz: deviceTimezone() })}</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
        </Card>
      </Section>

      <Section title={t("set.appearance")}>
        <Card>
          <div className="row gap-s" style={{ marginBottom: 8 }}>
            <Palette size={16} /> {t("set.theme")}
          </div>
          <Segmented
            value={st.theme}
            onChange={(v) => save({ theme: v })}
            options={[
              { value: "system", label: t("set.themeSystem") },
              { value: "light", label: t("set.themeLight") },
              { value: "dark", label: t("set.themeDark") },
            ]}
          />
        </Card>
      </Section>

      <Section title={t("set.notifications")}>
        <Card className="tight">
          <Row icon={<Bell size={18} />} title={t("set.permission")} sub={permLabel}>
            {notif?.supported && notif.permission !== "granted" && (
              <button className="btn primary small" onClick={enableNotifications}>
                {t("set.allow")}
              </button>
            )}
          </Row>
          {notif?.supported && (
            <Row title={t("set.exact")} sub={notif.exactAlarms === "granted" ? t("set.exactOn") : notif.exactAlarms === "denied" ? t("set.exactOff") : t("set.exactNa")}>
              {notif.exactAlarms === "denied" && (
                <button
                  className="btn small"
                  onClick={async () => {
                    await openExactAlarmSettings();
                    await resync(store().settings);
                  }}
                >
                  {t("set.allow")}
                </button>
              )}
            </Row>
          )}
          <Row icon={<Moon size={18} />} title={t("set.morning")} sub={st.morningEnabled ? t("set.dailyAt", { time: st.morningTime }) : t("set.off")}>
            <Switch checked={st.morningEnabled} onChange={(v) => saveReminder({ morningEnabled: v })} label={t("set.morning")} />
          </Row>
          {st.morningEnabled && (
            <div style={{ padding: "0 2px 10px" }}>
              <input type="time" value={st.morningTime} onChange={(e) => e.target.value && saveReminder({ morningTime: e.target.value })} />
            </div>
          )}
          <Row icon={<Moon size={18} />} title={t("set.evening")} sub={st.eveningEnabled ? t("set.dailyAt", { time: st.eveningTime }) : t("set.off")}>
            <Switch checked={st.eveningEnabled} onChange={(v) => saveReminder({ eveningEnabled: v })} label={t("set.evening")} />
          </Row>
          {st.eveningEnabled && (
            <div style={{ padding: "0 2px 10px" }}>
              <input type="time" value={st.eveningTime} onChange={(e) => e.target.value && saveReminder({ eveningTime: e.target.value })} />
            </div>
          )}
          <Row icon={<Timer size={18} />} title={t("set.focusNotif")}>
            <Switch checked={st.focusEndNotification} onChange={(v) => save({ focusEndNotification: v })} label={t("set.focusNotif")} />
          </Row>
          <Row title={t("set.chime")}>
            <Switch checked={st.focusSound} onChange={(v) => save({ focusSound: v })} label={t("set.chime")} />
          </Row>
          {notif?.supported && (
            <Row title={t("set.test")} sub={t("set.pending", { n: notif.pending })}>
              <button className="btn small" onClick={async () => toast((await sendTestNotification()) ? t("set.testSent") : t("set.allowFirst"), "info")}>
                {t("set.testBtn")}
              </button>
            </Row>
          )}
        </Card>
        {notif?.supported && <p className="faint small mt">{t("set.batteryNote")}</p>}
      </Section>

      <Section title={t("set.focusTimer")}>
        <Card>
          <div className="grid-2">
            <Field label={t("set.focusMin")}>
              <NumberInput value={st.focusMin} min={1} max={240} onChange={(v) => v && save({ focusMin: v })} />
            </Field>
            <Field label={t("set.shortMin")}>
              <NumberInput value={st.shortBreakMin} min={1} max={60} onChange={(v) => v && save({ shortBreakMin: v })} />
            </Field>
            <Field label={t("set.longMin")}>
              <NumberInput value={st.longBreakMin} min={1} max={120} onChange={(v) => v && save({ longBreakMin: v })} />
            </Field>
            <Field label={t("set.longEvery")}>
              <NumberInput value={st.longBreakEvery} min={2} max={10} onChange={(v) => v && save({ longBreakEvery: v })} />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title={t("set.goals")}>
        <Card>
          <div className="row gap-s small faint" style={{ marginBottom: 8 }}>
            <Target size={14} /> {t("set.daily")}
          </div>
          <div className="grid-3">
            <Field label={t("set.gTasks")}>
              <NumberInput value={st.dailyGoals.tasks} min={0} max={50} onChange={(v) => save({ dailyGoals: { ...st.dailyGoals, tasks: v ?? 0 } })} />
            </Field>
            <Field label={t("set.gFocus")}>
              <NumberInput value={st.dailyGoals.focusMin} min={0} max={960} onChange={(v) => save({ dailyGoals: { ...st.dailyGoals, focusMin: v ?? 0 } })} />
            </Field>
            <Field label={t("set.gLang")}>
              <NumberInput value={st.dailyGoals.languageMin} min={0} max={600} onChange={(v) => save({ dailyGoals: { ...st.dailyGoals, languageMin: v ?? 0 } })} />
            </Field>
          </div>
          <div className="row gap-s small faint" style={{ marginBottom: 8 }}>
            <Target size={14} /> {t("set.weekly")}
          </div>
          <div className="grid-2">
            <Field label={t("set.gStudy")}>
              <NumberInput value={st.weeklyGoals.studyMin} min={0} max={6000} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, studyMin: v ?? 0 } })} />
            </Field>
            <Field label={t("set.gCode")}>
              <NumberInput value={st.weeklyGoals.codingExercises} min={0} max={200} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, codingExercises: v ?? 0 } })} />
            </Field>
            <Field label={t("set.gWorkouts")}>
              <NumberInput value={st.weeklyGoals.workouts} min={0} max={21} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, workouts: v ?? 0 } })} />
            </Field>
            <Field label={t("set.gLangW")}>
              <NumberInput value={st.weeklyGoals.languageMin} min={0} max={4200} onChange={(v) => save({ weeklyGoals: { ...st.weeklyGoals, languageMin: v ?? 0 } })} />
            </Field>
          </div>
          <div className="small faint" style={{ marginBottom: 8 }}>
            {t("set.defaultFree")}
          </div>
          <div className="grid-4">
            {[1, 2, 3, 4, 5, 6, 0].map((i) => (
              <Field key={i} label={weekdayShort(i)}>
                <NumberInput value={st.defaultAvailableMin[i]} min={0} max={1200} step={15} onChange={(v) => save({ defaultAvailableMin: st.defaultAvailableMin.map((x, j) => (j === i ? v ?? 0 : x)) })} />
              </Field>
            ))}
          </div>
        </Card>
      </Section>

      <Section title={t("set.xp")}>
        <Card>
          <div className="row gap-s small faint" style={{ marginBottom: 8 }}>
            <Sparkles size={14} /> {t("set.xpPer")}
          </div>
          <div className="grid-2">
            {xpFields.map(([k, label]) => (
              <Field key={k} label={t(label)}>
                <NumberInput value={st.xp[k]} min={0} max={500} onChange={(v) => save({ xp: { ...st.xp, [k]: v ?? 0 } })} />
              </Field>
            ))}
            <Field label={t("set.levelXp")} hint={t("set.levelHint")}>
              <NumberInput value={st.levelXp} min={50} max={5000} step={50} onChange={(v) => v && save({ levelXp: v })} />
            </Field>
          </div>
        </Card>
      </Section>

      <Section title={t("set.privacy")}>
        <Card className="tight">
          <Row icon={<Shield size={18} />} title={t("set.privacyText")} sub={t("set.privacySub")} />
          <Row title={t("set.hideGpa")}>
            <Switch checked={st.hideGpaOnDashboard} onChange={(v) => save({ hideGpaOnDashboard: v })} label={t("set.hideGpa")} />
          </Row>
        </Card>
      </Section>

      <Section title={t("set.data")}>
        <Card className="tight">
          <Row icon={<Download size={18} />} title={t("set.export")} sub={st.lastBackupAt ? t("set.lastExport", { date: new Date(st.lastBackupAt).toLocaleString() }) : t("set.neverExported")}>
            <button className="btn small" onClick={doExport}>
              {t("set.exportBtn")}
            </button>
          </Row>
          <Row icon={<Upload size={18} />} title={t("set.import")} sub={t("set.importSub")}>
            <button className="btn small" onClick={() => fileRef.current?.click()}>
              {t("set.importBtn")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void doImport(f);
              }}
            />
          </Row>
          <Row icon={<Database size={18} />} title={t("set.reset")} sub={t("set.storage", { kind: storageKind })}>
            <button className="btn danger small" onClick={doReset}>
              {t("set.resetBtn")}
            </button>
          </Row>
        </Card>
      </Section>

      <Section title={t("set.server")}>
        <Card>
          <p className="small muted" style={{ marginBottom: 12 }}>
            <Cloud size={14} /> {t("set.serverIntro")}
          </p>
          <Field label={t("set.serverUrl")} hint={t("set.serverUrlHint")}>
            <input inputMode="url" dir="ltr" value={st.syncUrl} onChange={(e) => save({ syncUrl: e.target.value.trim() })} placeholder="http://…:8000" />
          </Field>
          <Field label={t("set.token")} hint={t("set.tokenHint")}>
            <input type="password" dir="ltr" value={st.syncToken} onChange={(e) => save({ syncToken: e.target.value.trim() })} autoComplete="off" />
          </Field>
          <div className="row">
            <button className="btn grow" disabled={!st.syncUrl || !st.syncToken} onClick={upload}>
              <Upload size={16} /> {t("set.upload")}
            </button>
            <button className="btn grow" disabled={!st.syncUrl || !st.syncToken} onClick={download}>
              <Download size={16} /> {t("set.restore")}
            </button>
          </div>
          {syncMsg && <p className="small mt">{syncMsg}</p>}
        </Card>
      </Section>

      <Section title={t("set.about")}>
        <Card className="tight">
          <Row icon={<Info size={18} />} title={`LIFEOS ${APP_VERSION}`} sub={t("set.aboutText")} />
          <Row icon={<User size={18} />} title={t("set.madeForYou")} sub={t("set.tagline")} />
        </Card>
      </Section>
    </Page>
  );
}

import React from "react";
import ReactDOM from "react-dom/client";
import App, { onAppResume } from "./App";
import { toast } from "./components/ui";
import { createDefaultBackend } from "./db/backends";
import { setStore, Store } from "./db/store";
import { loadLanguage, t } from "./i18n";
import { setActiveTimezone } from "./lib/date";
import { listenForNotificationTaps, syncDailyReminders } from "./native/notifications";
import { hideSplash, initPlatform } from "./native/platform";
import { back, go } from "./router";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

function Fatal({ error }: { error: unknown }) {
  return (
    <div className="splash">
      <div style={{ maxWidth: 360, padding: 24, textAlign: "center" }}>
        <div className="logo" style={{ margin: "0 auto 16px" }}>L</div>
        <h2>{t("fatal.title")}</h2>
        <p className="muted small" style={{ marginTop: 8 }}>{String((error as Error)?.message ?? error)}</p>
        <p className="muted small" style={{ marginTop: 8 }}>
          {t("fatal.body")}
        </p>
        <button className="btn primary" style={{ marginTop: 16 }} onClick={() => location.reload()}>
          {t("fatal.retry")}
        </button>
      </div>
    </div>
  );
}

async function boot() {
  // Notification taps can arrive before React renders (cold start), so register first.
  await listenForNotificationTaps((route) => go(route)).catch(() => undefined);
  const s = new Store(createDefaultBackend());
  s.errorHandler = (e) => {
    console.error(e);
    toast(t("toast.saveFailed", { error: String((e as Error)?.message ?? e) }), "error");
  };
  await s.init();
  setStore(s);
  setActiveTimezone(s.settings.timezone);
  await loadLanguage(s.settings.language);
  await initPlatform({ onBack: () => back(), onResume: onAppResume });
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  await hideSplash();
  // Keep the 30-day reminder window topped up on every launch.
  syncDailyReminders(s.settings).catch((e) => console.warn("Reminder sync failed", e));
  onAppResume();
}

boot().catch(async (e) => {
  console.error(e);
  await loadLanguage("auto").catch(() => undefined);
  root.render(<Fatal error={e} />);
  await hideSplash();
});

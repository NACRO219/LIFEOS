import { BookOpen, Code2, Dumbbell, ExternalLink, Moon } from "lucide-react";
import { useState } from "react";
import { Card, Page, toast } from "../components/ui";
import { useStore } from "../db/store";
import { t, type TKey } from "../i18n";
import { openExternal } from "../native/platform";

// Music for each focus mode. Links open in the Spotify app (or any music app/browser) on the phone.
const MODES = [
  { id: "Study", icon: BookOpen },
  { id: "Coding", icon: Code2 },
  { id: "Gym", icon: Dumbbell },
  { id: "Relax", icon: Moon },
];

export default function Music() {
  const s = useStore();
  const links = s.settings.musicLinks ?? {};
  const [draft, setDraft] = useState<Record<string, string>>(links);
  const modeLabel = (id: string) => t(`music.mode.${id}` as TKey);
  const save = (id: string) => {
    const url = (draft[id] ?? "").trim();
    if (url && !/^(https?:\/\/|spotify:)/i.test(url)) return toast(t("music.errLink"), "error");
    s.saveSettings({ musicLinks: { ...links, [id]: url } });
    toast(url ? t("music.saved", { mode: modeLabel(id) }) : t("music.removed", { mode: modeLabel(id) }));
  };
  return (
    <Page title={t("music.title")} eyebrow={t("music.eyebrow")} showBack>
      <p className="muted small">{t("music.intro")}</p>
      <div className="col mt">
        {MODES.map((m) => {
          const url = links[m.id];
          return (
            <Card key={m.id}>
              <div className="row between">
                <b className="row gap-s">
                  <m.icon size={18} /> {modeLabel(m.id)}
                </b>
                {url && (
                  <button className="btn primary small" onClick={() => openExternal(url)}>
                    <ExternalLink size={14} /> {t("common.open")}
                  </button>
                )}
              </div>
              <div className="row mt">
                <input className="grow" inputMode="url" dir="ltr" placeholder="https://open.spotify.com/playlist/…" value={draft[m.id] ?? ""} onChange={(e) => setDraft({ ...draft, [m.id]: e.target.value })} />
                <button className="btn" onClick={() => save(m.id)}>
                  {t("common.save")}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

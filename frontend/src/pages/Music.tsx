import { BookOpen, Code2, Dumbbell, ExternalLink, Moon } from "lucide-react";
import { useState } from "react";
import { Card, Page, toast } from "../components/ui";
import { useStore } from "../db/store";
import { openExternal } from "../native/platform";

// Music for each focus mode. Links open in the Spotify app (or any music app/browser) on the phone.
// No account login is needed and nothing is sent anywhere.
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
  const save = (id: string) => {
    const url = (draft[id] ?? "").trim();
    if (url && !/^(https?:\/\/|spotify:)/i.test(url)) return toast("Paste a playlist link (https://open.spotify.com/… or spotify:…).", "error");
    s.saveSettings({ musicLinks: { ...links, [id]: url } });
    toast(url ? `${id} playlist saved` : `${id} playlist removed`);
  };
  return (
    <Page title="Music" eyebrow="A soundtrack for every mode" showBack>
      <p className="muted small">
        In Spotify, open a playlist → Share → Copy link, then paste it here. Tapping a mode opens it in the Spotify app.
      </p>
      <div className="col mt">
        {MODES.map((m) => {
          const url = links[m.id];
          return (
            <Card key={m.id}>
              <div className="row between">
                <b className="row gap-s">
                  <m.icon size={18} /> {m.id}
                </b>
                {url && (
                  <button className="btn primary small" onClick={() => openExternal(url)}>
                    <ExternalLink size={14} /> Open
                  </button>
                )}
              </div>
              <div className="row mt">
                <input className="grow" inputMode="url" placeholder="https://open.spotify.com/playlist/…" value={draft[m.id] ?? ""} onChange={(e) => setDraft({ ...draft, [m.id]: e.target.value })} />
                <button className="btn" onClick={() => save(m.id)}>
                  Save
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

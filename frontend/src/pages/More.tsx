import { Award, BookOpen, CalendarCheck, Code2, Dumbbell, Flame, Headphones, Languages, ListTodo, Moon, Settings, Sun } from "lucide-react";
import { Page } from "../components/ui";
import { t, type TKey } from "../i18n";
import { go } from "../router";

const TILES: { label: TKey; path: string; icon: typeof Sun; color: string }[] = [
  { label: "more.tasks", path: "/tasks", icon: ListTodo, color: "#4f6bff" },
  { label: "more.morning", path: "/checkin/morning", icon: Sun, color: "#f2a93b" },
  { label: "more.evening", path: "/checkin/evening", icon: Moon, color: "#6366f1" },
  { label: "more.programming", path: "/cs", icon: Code2, color: "#0ea5b7" },
  { label: "more.languages", path: "/lang", icon: Languages, color: "#e0405a" },
  { label: "more.fitness", path: "/fitness", icon: Dumbbell, color: "#16a36a" },
  { label: "more.habits", path: "/habits", icon: Flame, color: "#f97316" },
  { label: "more.xp", path: "/xp", icon: Award, color: "#7b5cff" },
  { label: "more.gpa", path: "/uni/gpa", icon: BookOpen, color: "#3b82f6" },
  { label: "more.history", path: "/checkin", icon: CalendarCheck, color: "#64748b" },
  { label: "more.music", path: "/music", icon: Headphones, color: "#1db954" },
  { label: "more.settings", path: "/settings", icon: Settings, color: "#475569" },
];

export default function More() {
  return (
    <Page title={t("more.title")} eyebrow={t("more.eyebrow")}>
      <div className="more-grid">
        {TILES.map((x) => (
          <button key={x.path} className="more-tile" onClick={() => go(x.path)}>
            <span className="ic" style={{ background: x.color }}>
              <x.icon size={22} />
            </span>
            {t(x.label)}
          </button>
        ))}
      </div>
    </Page>
  );
}

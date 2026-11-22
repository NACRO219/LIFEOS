import { Award, BookOpen, CalendarCheck, Code2, Dumbbell, Flame, Headphones, Languages, ListTodo, Moon, Settings, Sun } from "lucide-react";
import { Page } from "../components/ui";
import { go } from "../router";

const TILES = [
  { label: "Tasks", path: "/tasks", icon: ListTodo, color: "#4f6bff" },
  { label: "Morning plan", path: "/checkin/morning", icon: Sun, color: "#f2a93b" },
  { label: "Evening check-in", path: "/checkin/evening", icon: Moon, color: "#6366f1" },
  { label: "Programming", path: "/cs", icon: Code2, color: "#0ea5b7" },
  { label: "Languages", path: "/lang", icon: Languages, color: "#e0405a" },
  { label: "Fitness", path: "/fitness", icon: Dumbbell, color: "#16a36a" },
  { label: "Habits & goals", path: "/habits", icon: Flame, color: "#f97316" },
  { label: "XP & badges", path: "/xp", icon: Award, color: "#7b5cff" },
  { label: "GPA", path: "/uni/gpa", icon: BookOpen, color: "#3b82f6" },
  { label: "Check-in history", path: "/checkin", icon: CalendarCheck, color: "#64748b" },
  { label: "Music", path: "/music", icon: Headphones, color: "#1db954" },
  { label: "Settings", path: "/settings", icon: Settings, color: "#475569" },
];

export default function More() {
  return (
    <Page title="LIFEOS" eyebrow="Everything">
      <div className="more-grid">
        {TILES.map((t) => (
          <button key={t.path} className="more-tile" onClick={() => go(t.path)}>
            <span className="ic" style={{ background: t.color }}>
              <t.icon size={22} />
            </span>
            {t.label}
          </button>
        ))}
      </div>
    </Page>
  );
}

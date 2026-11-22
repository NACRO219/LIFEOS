import { ListTodo, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TaskRow, TaskSheet } from "../components/tasks";
import { Card, Empty, Page, Segmented } from "../components/ui";
import { useCollection } from "../db/store";
import { addDays, prettyDay, relativeDay, todayISO } from "../lib/date";
import { isOpen, isOverdue, scoreTask } from "../lib/planner";
import { todaysTasks } from "../lib/stats";
import { store } from "../db/store";
import { CATEGORIES, type Task } from "../lib/types";
import { go } from "../router";

type View = "today" | "upcoming" | "overdue" | "all" | "done";

export default function Tasks() {
  const tasks = useCollection("tasks");
  const courses = useCollection("courses");
  const today = todayISO();
  const [view, setView] = useState<View>("today");
  const [cat, setCat] = useState<string>("All");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    let l: Task[];
    switch (view) {
      case "today":
        l = todaysTasks(store(), today);
        break;
      case "upcoming":
        l = tasks.filter((t) => isOpen(t) && ((t.scheduledDate ?? t.deadline ?? "") > today));
        break;
      case "overdue":
        l = tasks.filter((t) => isOverdue(t, today));
        break;
      case "done":
        l = tasks.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
        break;
      default:
        l = tasks.filter(isOpen);
    }
    if (cat !== "All") l = l.filter((t) => t.category === cat);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      l = l.filter((t) => t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle) || t.project.toLowerCase().includes(needle));
    }
    if (view !== "done") l = [...l].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || scoreTask(b, today, courses).score - scoreTask(a, today, courses).score);
    return l;
  }, [tasks, courses, view, cat, q, today]);

  const overdueCount = tasks.filter((t) => isOverdue(t, today)).length;

  // Group upcoming by date
  const groups = useMemo(() => {
    if (view !== "upcoming") return null;
    const m = new Map<string, Task[]>();
    for (const t of list) {
      const d = t.scheduledDate ?? t.deadline ?? "Unscheduled";
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(t);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, view]);

  return (
    <Page
      title="Tasks"
      eyebrow={`${tasks.filter(isOpen).length} open`}
      actions={
        <button className="btn small" onClick={() => go("/plan")}>
          Planner
        </button>
      }
    >
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "today", label: "Today" },
          { value: "upcoming", label: "Upcoming" },
          { value: "overdue", label: `Overdue${overdueCount ? ` (${overdueCount})` : ""}` },
          { value: "all", label: "All" },
          { value: "done", label: "Done" },
        ]}
      />
      <div className="row mt">
        <div className="grow" style={{ position: "relative" }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 14, color: "var(--text-3)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks" style={{ paddingLeft: 36 }} />
        </div>
      </div>
      <div className="chips mt">
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>

      <Card className="tight mt">
        {list.length === 0 ? (
          <Empty
            icon={<ListTodo />}
            title={view === "overdue" ? "Nothing overdue" : view === "done" ? "No completed tasks yet" : "No tasks here"}
            text={view === "today" ? "Tasks planned for today, due today, or carried over show here." : undefined}
            action={
              view !== "done" && (
                <button className="btn primary small" onClick={() => setAdding(true)}>
                  <Plus size={16} /> Add task
                </button>
              )
            }
          />
        ) : groups ? (
          groups.map(([d, ts]) => (
            <div key={d}>
              <div className="small faint" style={{ padding: "10px 2px 0", fontWeight: 650 }}>
                {d === "Unscheduled" ? d : `${relativeDay(d, today)} · ${prettyDay(d)}`}
                {d === addDays(today, 1) ? "" : ""}
              </div>
              <div className="list">
                {ts.map((t) => (
                  <TaskRow key={t.id} task={t} onOpen={setEditing} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="list">
            {list.map((t) => (
              <TaskRow key={t.id} task={t} onOpen={setEditing} />
            ))}
          </div>
        )}
      </Card>

      <button className="fab" aria-label="Add task" onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>
      <TaskSheet open={adding} onClose={() => setAdding(false)} defaults={{ scheduledDate: view === "today" ? today : null, category: cat !== "All" ? (cat as Task["category"]) : "Personal" }} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </Page>
  );
}

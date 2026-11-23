import { ListTodo, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { catLabel, TaskRow, TaskSheet } from "../components/tasks";
import { Card, Empty, Page, Segmented } from "../components/ui";
import { store, useCollection } from "../db/store";
import { t } from "../i18n";
import { prettyDay, relativeDay, todayISO } from "../lib/date";
import { isOpen, isOverdue, scoreTask } from "../lib/planner";
import { todaysTasks } from "../lib/stats";
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
        l = tasks.filter((x) => isOpen(x) && (x.scheduledDate ?? x.deadline ?? "") > today);
        break;
      case "overdue":
        l = tasks.filter((x) => isOverdue(x, today));
        break;
      case "done":
        l = tasks.filter((x) => x.status === "done").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
        break;
      default:
        l = tasks.filter(isOpen);
    }
    if (cat !== "All") l = l.filter((x) => x.category === cat);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      l = l.filter((x) => x.title.toLowerCase().includes(needle) || x.description.toLowerCase().includes(needle) || x.project.toLowerCase().includes(needle));
    }
    if (view !== "done") l = [...l].sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || scoreTask(b, today, courses).score - scoreTask(a, today, courses).score);
    return l;
  }, [tasks, courses, view, cat, q, today]);

  const overdueCount = tasks.filter((x) => isOverdue(x, today)).length;

  const groups = useMemo(() => {
    if (view !== "upcoming") return null;
    const m = new Map<string, Task[]>();
    for (const x of list) {
      const d = x.scheduledDate ?? x.deadline ?? "~";
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(x);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [list, view]);

  return (
    <Page
      title={t("tasks.title")}
      eyebrow={t("tasks.open", { n: tasks.filter(isOpen).length })}
      actions={
        <button className="btn small" onClick={() => go("/plan")}>
          {t("tasks.planner")}
        </button>
      }
    >
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: "today", label: t("tasks.today") },
          { value: "upcoming", label: t("tasks.upcoming") },
          { value: "overdue", label: overdueCount ? t("tasks.overdueN", { n: overdueCount }) : t("tasks.overdue") },
          { value: "all", label: t("tasks.all") },
          { value: "done", label: t("tasks.done") },
        ]}
      />
      <div className="row mt">
        <div className="grow search-box">
          <Search size={16} className="search-icon" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("tasks.search")} />
        </div>
      </div>
      <div className="chips mt">
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
            {c === "All" ? t("common.all") : catLabel(c)}
          </button>
        ))}
      </div>

      <Card className="tight mt">
        {list.length === 0 ? (
          <Empty
            icon={<ListTodo />}
            title={view === "overdue" ? t("tasks.emptyOverdue") : view === "done" ? t("tasks.emptyDone") : t("tasks.empty")}
            text={view === "today" ? t("tasks.emptyTodayHint") : undefined}
            action={
              view !== "done" && (
                <button className="btn primary small" onClick={() => setAdding(true)}>
                  <Plus size={16} /> {t("task.add")}
                </button>
              )
            }
          />
        ) : groups ? (
          groups.map(([d, ts]) => (
            <div key={d}>
              <div className="small faint" style={{ padding: "10px 2px 0", fontWeight: 650 }}>
                {d === "~" ? t("tasks.unscheduled") : `${relativeDay(d, today)} · ${prettyDay(d)}`}
              </div>
              <div className="list">
                {ts.map((x) => (
                  <TaskRow key={x.id} task={x} onOpen={setEditing} />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="list">
            {list.map((x) => (
              <TaskRow key={x.id} task={x} onOpen={setEditing} />
            ))}
          </div>
        )}
      </Card>

      <button className="fab" aria-label={t("task.add")} onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>
      <TaskSheet open={adding} onClose={() => setAdding(false)} defaults={{ scheduledDate: view === "today" ? today : null, category: cat !== "All" ? (cat as Task["category"]) : "Personal" }} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </Page>
  );
}

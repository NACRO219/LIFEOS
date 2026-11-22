import { Check, Clock, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { store, useCollection, useSettings } from "../db/store";
import { completeTask, deleteTask, newTask, reopenTask, taskXp, validateTask } from "../lib/actions";
import { relativeDay, todayISO, formatDuration } from "../lib/date";
import { CATEGORIES, PRIORITIES, type Category, type Task } from "../lib/types";
import { haptic } from "../native/platform";
import { confirmDialog, Field, NumberInput, Sheet, toast, xpToast } from "./ui";

export function TaskRow({ task, onOpen, showDate = true }: { task: Task; onOpen?: (t: Task) => void; showDate?: boolean }) {
  const courses = useCollection("courses");
  const settings = useSettings();
  const today = todayISO();
  const done = task.status === "done";
  const course = task.courseId ? courses.find((c) => c.id === task.courseId) : null;
  const overdue = !done && task.deadline && task.deadline < today;
  const toggle = () => {
    if (done) {
      reopenTask(store(), task.id);
      toast("Task reopened. XP for it was removed.");
    } else {
      const r = completeTask(store(), task.id);
      void haptic("success");
      xpToast(r);
    }
  };
  return (
    <div className={`list-item ${done ? "task-done" : ""}`}>
      <button className={`check ${done ? "on" : ""} p-${task.priority}`} onClick={toggle} aria-label={done ? "Mark as not done" : "Mark as done"}>
        {done && <Check size={16} strokeWidth={3} />}
      </button>
      <div className="grow" onClick={() => onOpen?.(task)} role={onOpen ? "button" : undefined}>
        <div className="title ellipsis">{task.title}</div>
        <div className="sub row gap-s wrap">
          {course && <span className="dot" style={{ background: course.color, width: 8, height: 8 }} />}
          <span>{course ? course.code || course.name : task.category}</span>
          {task.estimatedMin > 0 && (
            <span className="row gap-s">
              · <Clock size={12} /> {formatDuration(task.estimatedMin)}
            </span>
          )}
          {task.recurrence !== "none" && <Repeat size={12} />}
          {showDate && task.deadline && <span className={overdue ? "tag danger" : "tag"}>{overdue ? "Overdue · " : "Due "}{relativeDay(task.deadline, today)}</span>}
          {showDate && !task.deadline && task.scheduledDate && task.scheduledDate !== today && <span className="tag">{relativeDay(task.scheduledDate, today)}</span>}
          <span className="faint">+{taskXp(task, settings.xp)} XP</span>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_LABEL = { low: "Low", medium: "Medium", high: "High", critical: "Critical" };

export function TaskSheet({ open, onClose, task, defaults }: { open: boolean; onClose: () => void; task?: Task | null; defaults?: Partial<Task> }) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? "Edit task" : "New task"}>
      {open && <TaskForm key={task?.id ?? "new"} task={task ?? null} defaults={defaults} onDone={onClose} />}
    </Sheet>
  );
}

function TaskForm({ task, defaults, onDone }: { task: Task | null; defaults?: Partial<Task>; onDone: () => void }) {
  const courses = useCollection("courses");
  const settings = useSettings();
  const [t, setT] = useState<Task>(() => task ?? newTask({ title: "", ...defaults }));
  const [error, setError] = useState("");
  const set = <K extends keyof Task>(k: K, v: Task[K]) => setT((x) => ({ ...x, [k]: v }));

  const save = () => {
    const err = validateTask(t);
    if (err) return setError(err);
    const s = store();
    s.transact(() => {
      if (task && task.status === "done" && t.status !== "done") reopenTask(s, task.id); // revokes its XP
      s.put("tasks", { ...t, title: t.title.trim(), completedAt: t.status === "done" ? t.completedAt : null });
    });
    toast(task ? "Task updated" : "Task added");
    onDone();
  };
  const remove = async () => {
    if (!task) return;
    if (await confirmDialog({ title: "Delete this task?", body: `“${task.title}” will be permanently deleted${task.status === "done" ? " and its XP removed" : ""}.`, confirm: "Delete", danger: true })) {
      deleteTask(store(), task.id);
      toast("Task deleted");
      onDone();
    }
  };

  return (
    <div className="kbd-safe-off">
      {error && <div className="error-text">{error}</div>}
      <Field label="Title">
        <input value={t.title} autoFocus={!task} maxLength={200} placeholder="What needs to get done?" onChange={(e) => set("title", e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Category">
          <select value={t.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select value={t.priority} onChange={(e) => set("priority", e.target.value as Task["priority"])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Deadline">
          <input type="date" value={t.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
        </Field>
        <Field label="Plan for day">
          <input type="date" value={t.scheduledDate ?? ""} onChange={(e) => set("scheduledDate", e.target.value || null)} />
        </Field>
        <Field label="Estimate (min)">
          <NumberInput value={t.estimatedMin} min={0} max={1440} step={5} onChange={(v) => set("estimatedMin", v ?? 0)} />
        </Field>
        <Field label="Status">
          <select
            value={t.status}
            onChange={(e) => {
              const status = e.target.value as Task["status"];
              if (status === "done" && task && task.status !== "done") {
                // completing goes through the XP rules
                const r = completeTask(store(), task.id);
                xpToast(r);
                onDone();
                return;
              }
              set("status", status);
            }}
          >
            <option value="todo">To do</option>
            <option value="in_progress">In progress</option>
            {task && <option value="done">Done</option>}
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Course">
          <select value={t.courseId ?? ""} onChange={(e) => setT((x) => ({ ...x, courseId: e.target.value || null, category: e.target.value ? "University" : x.category }))}>
            <option value="">None</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={t.kind} onChange={(e) => set("kind", e.target.value as Task["kind"])}>
            <option value="task">Task</option>
            <option value="assignment">Assignment</option>
            <option value="revision">Revision</option>
            <option value="lecture">Lecture</option>
          </select>
        </Field>
        <Field label="Repeat">
          <select value={t.recurrence} onChange={(e) => set("recurrence", e.target.value as Task["recurrence"])}>
            <option value="none">Never</option>
            <option value="daily">Daily</option>
            <option value="weekdays">Weekdays</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Field>
        <Field label="XP reward" hint={`0 = default (${taskXp({ ...t, xp: 0 }, settings.xp)} XP)`}>
          <NumberInput value={t.xp} min={0} max={1000} onChange={(v) => set("xp", v ?? 0)} />
        </Field>
      </div>
      <Field label="Project">
        <input value={t.project} placeholder="Optional" onChange={(e) => set("project", e.target.value)} />
      </Field>
      <Field label="Description">
        <textarea value={t.description} placeholder="Details, links, sub-steps…" onChange={(e) => set("description", e.target.value)} />
      </Field>
      {task && (
        <p className="faint small">
          Created {new Date(task.createdAt).toLocaleString()}
          {task.completedAt ? ` · Completed ${new Date(task.completedAt).toLocaleString()}` : ""}
        </p>
      )}
      <div className="row mt">
        {task && (
          <button className="btn danger" onClick={remove} aria-label="Delete task">
            <Trash2 size={18} />
          </button>
        )}
        <button className="btn primary grow" onClick={save}>
          {task ? "Save changes" : "Add task"}
        </button>
      </div>
    </div>
  );
}

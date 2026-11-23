import { Check, Clock, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { store, useCollection, useSettings } from "../db/store";
import { t as tr, type TKey } from "../i18n";
import { completeTask, deleteTask, newTask, reopenTask, taskXp, validateTask } from "../lib/actions";
import { relativeDay, todayISO, formatDuration } from "../lib/date";
import { CATEGORIES, PRIORITIES, type Category, type Task } from "../lib/types";
import { haptic } from "../native/platform";
import { confirmDialog, Field, NumberInput, Sheet, toast, xpToast } from "./ui";

export const catLabel = (c: string) => tr(`cat.${c}` as TKey) ?? c;

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
      toast(tr("task.reopened"));
    } else {
      const r = completeTask(store(), task.id);
      void haptic("success");
      xpToast(r);
    }
  };
  return (
    <div className={`list-item ${done ? "task-done" : ""}`}>
      <button className={`check ${done ? "on" : ""} p-${task.priority}`} onClick={toggle} aria-label={done ? tr("task.markNotDone") : tr("task.markDone")}>
        {done && <Check size={16} strokeWidth={3} />}
      </button>
      <div className="grow" onClick={() => onOpen?.(task)} role={onOpen ? "button" : undefined}>
        <div className="title ellipsis">{task.title}</div>
        <div className="sub row gap-s wrap">
          {course && <span className="dot" style={{ background: course.color, width: 8, height: 8 }} />}
          <span>{course ? course.code || course.name : catLabel(task.category)}</span>
          {task.estimatedMin > 0 && (
            <span className="row gap-s">
              · <Clock size={12} /> {formatDuration(task.estimatedMin)}
            </span>
          )}
          {task.recurrence !== "none" && <Repeat size={12} />}
          {showDate && task.deadline && (
            <span className={overdue ? "tag danger" : "tag"}>{overdue ? tr("task.overdue", { when: relativeDay(task.deadline, today) }) : tr("task.due", { when: relativeDay(task.deadline, today) })}</span>
          )}
          {showDate && !task.deadline && task.scheduledDate && task.scheduledDate !== today && <span className="tag">{relativeDay(task.scheduledDate, today)}</span>}
          <span className="faint">{tr("common.xp", { n: taskXp(task, settings.xp) })}</span>
        </div>
      </div>
    </div>
  );
}

export function TaskSheet({ open, onClose, task, defaults }: { open: boolean; onClose: () => void; task?: Task | null; defaults?: Partial<Task> }) {
  return (
    <Sheet open={open} onClose={onClose} title={task ? tr("task.edit") : tr("task.new")}>
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
    toast(task ? tr("task.updated") : tr("task.added"));
    onDone();
  };
  const remove = async () => {
    if (!task) return;
    const body = tr("task.deleteBody", { title: task.title }) + (task.status === "done" ? " " + tr("task.deleteXp") : "");
    if (await confirmDialog({ title: tr("task.deleteTitle"), body, confirm: tr("common.delete"), danger: true })) {
      deleteTask(store(), task.id);
      toast(tr("task.deleted"));
      onDone();
    }
  };

  return (
    <div>
      {error && <div className="error-text">{error}</div>}
      <Field label={tr("common.title")}>
        <input value={t.title} autoFocus={!task} maxLength={200} placeholder={tr("task.placeholder")} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label={tr("task.category")}>
          <select value={t.category} onChange={(e) => set("category", e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {catLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("task.priority")}>
          <select value={t.priority} onChange={(e) => set("priority", e.target.value as Task["priority"])}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {tr(`prio.${p}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("task.deadline")}>
          <input type="date" value={t.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
        </Field>
        <Field label={tr("task.planDay")}>
          <input type="date" value={t.scheduledDate ?? ""} onChange={(e) => set("scheduledDate", e.target.value || null)} />
        </Field>
        <Field label={tr("task.estimate")}>
          <NumberInput value={t.estimatedMin} min={0} max={1440} step={5} onChange={(v) => set("estimatedMin", v ?? 0)} />
        </Field>
        <Field label={tr("task.status")}>
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
            <option value="todo">{tr("status.todo")}</option>
            <option value="in_progress">{tr("status.in_progress")}</option>
            {task && <option value="done">{tr("status.done")}</option>}
          </select>
        </Field>
      </div>
      <div className="grid-2">
        <Field label={tr("task.course")}>
          <select value={t.courseId ?? ""} onChange={(e) => setT((x) => ({ ...x, courseId: e.target.value || null, category: e.target.value ? "University" : x.category }))}>
            <option value="">{tr("common.none")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} · ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tr("task.type")}>
          <select value={t.kind} onChange={(e) => set("kind", e.target.value as Task["kind"])}>
            <option value="task">{tr("kind.task")}</option>
            <option value="assignment">{tr("kind.assignment")}</option>
            <option value="revision">{tr("kind.revision")}</option>
            <option value="lecture">{tr("kind.lecture")}</option>
          </select>
        </Field>
        <Field label={tr("task.repeat")}>
          <select value={t.recurrence} onChange={(e) => set("recurrence", e.target.value as Task["recurrence"])}>
            <option value="none">{tr("rec.none")}</option>
            <option value="daily">{tr("rec.daily")}</option>
            <option value="weekdays">{tr("rec.weekdays")}</option>
            <option value="weekly">{tr("rec.weekly")}</option>
            <option value="monthly">{tr("rec.monthly")}</option>
          </select>
        </Field>
        <Field label={tr("task.xpReward")} hint={tr("task.xpHint", { n: taskXp({ ...t, xp: 0 }, settings.xp) })}>
          <NumberInput value={t.xp} min={0} max={1000} onChange={(v) => set("xp", v ?? 0)} />
        </Field>
      </div>
      <Field label={tr("task.project")}>
        <input value={t.project} placeholder={tr("task.optional")} onChange={(e) => set("project", e.target.value)} />
      </Field>
      <Field label={tr("task.description")}>
        <textarea value={t.description} placeholder={tr("task.descriptionPh")} onChange={(e) => set("description", e.target.value)} />
      </Field>
      {task && (
        <p className="faint small">
          {tr("task.created", { date: new Date(task.createdAt).toLocaleString() })}
          {task.completedAt ? ` · ${tr("task.completed", { date: new Date(task.completedAt).toLocaleString() })}` : ""}
        </p>
      )}
      <div className="row mt">
        {task && (
          <button className="btn danger" onClick={remove} aria-label={tr("common.delete")}>
            <Trash2 size={18} />
          </button>
        )}
        <button className="btn primary grow" onClick={save}>
          {task ? tr("task.saveChanges") : tr("task.add")}
        </button>
      </div>
    </div>
  );
}

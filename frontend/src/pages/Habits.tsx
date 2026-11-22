import { Check, Flame, Plus, Target, Trash2 } from "lucide-react";
import { useState } from "react";
import { Bar, Card, confirmDialog, Empty, Field, NumberInput, Page, Section, toast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { toggleHabit } from "../lib/actions";
import { addDays, prettyDay, relativeDay, todayISO, WEEKDAYS, weekday } from "../lib/date";
import { streakFrom, weekRange } from "../lib/stats";
import { CATEGORIES, type Category, type Goal } from "../lib/types";

export default function Habits() {
  const s = useStore();
  const today = todayISO();
  const habits = s.all("habits").filter((h) => !h.archived);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const [h, setH] = useState({ name: "", area: "Personal" as Category, target: 7 as number | null });
  const { from, to } = weekRange(today);
  const goals = [...s.all("goals")].sort((a, b) => Number(a.done) - Number(b.done) || (a.targetDate ?? "9").localeCompare(b.targetDate ?? "9"));
  const [g, setG] = useState({ title: "", area: "Personal" as Category, targetDate: "" });

  return (
    <Page title="Habits & goals" eyebrow="Personal development">
      <Section title="Habits">
        <Card className="tight">
          {habits.length ? (
            <div className="list">
              {habits.map((hb) => {
                const logs = new Set(s.all("habitLogs").filter((l) => l.habitId === hb.id).map((l) => l.date));
                const week = [...logs].filter((d) => d >= from && d <= to).length;
                return (
                  <div key={hb.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch" }}>
                    <div className="row between">
                      <div>
                        <b>{hb.name}</b>
                        <div className="small faint row gap-s">
                          <Flame size={13} /> {streakFrom(logs, today)}-day streak · {week}/{hb.targetPerWeek} this week
                        </div>
                      </div>
                      <button className="icon-btn" aria-label="Delete habit" onClick={async () => { if (await confirmDialog({ title: `Delete “${hb.name}”?`, body: "Its history is deleted too.", confirm: "Delete", danger: true })) s.transact(() => { s.all("habitLogs").filter((l) => l.habitId === hb.id).forEach((l) => s.remove("habitLogs", l.id)); s.remove("habits", hb.id); }); }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="grid-4 mt" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
                      {days.map((d) => {
                        const on = logs.has(d);
                        return (
                          <button key={d} onClick={() => toggleHabit(store(), hb.id, d)} className="col" style={{ alignItems: "center", gap: 4 }} aria-label={`${hb.name} ${d}`}>
                            <span className="small faint">{WEEKDAYS[weekday(d)][0]}</span>
                            <span className={`check ${on ? "on" : ""}`} style={d === today ? { borderColor: "var(--accent)" } : undefined}>
                              {on && <Check size={15} strokeWidth={3} />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty icon={<Flame />} title="No habits yet" text="Small daily habits compound: reading, stretching, journaling, sleep before midnight…" />
          )}
          <div className="grid-3 mt">
            <input placeholder="New habit" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
            <select value={h.area} onChange={(e) => setH({ ...h, area: e.target.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <NumberInput value={h.target} min={1} max={7} placeholder="×/week" onChange={(v) => setH({ ...h, target: v })} />
          </div>
          <button className="btn block mt" onClick={() => { if (!h.name.trim()) return toast("Name the habit.", "error"); s.put("habits", { id: uid(), name: h.name.trim(), area: h.area, targetPerWeek: Math.min(7, Math.max(1, h.target ?? 7)), createdAt: new Date().toISOString(), archived: false }); setH({ ...h, name: "" }); }}>
            <Plus size={16} /> Add habit
          </button>
        </Card>
      </Section>

      <Section title="Long-term goals">
        <div className="col">
          {goals.map((gl) => (
            <GoalCard key={gl.id} goal={gl} />
          ))}
          {!goals.length && (
            <Card>
              <Empty icon={<Target />} title="No goals yet" text="e.g. Reach HSK 4 by June, GPA 3.5 this year, 10 pull-ups." />
            </Card>
          )}
        </div>
        <Card className="mt">
          <Field label="New goal">
            <input value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="What do you want to achieve?" />
          </Field>
          <div className="grid-2">
            <select value={g.area} onChange={(e) => setG({ ...g, area: e.target.value as Category })}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <input type="date" value={g.targetDate} onChange={(e) => setG({ ...g, targetDate: e.target.value })} />
          </div>
          <button className="btn block mt" onClick={() => { if (!g.title.trim()) return toast("Describe the goal.", "error"); s.put("goals", { id: uid(), title: g.title.trim(), area: g.area, targetDate: g.targetDate || null, progress: 0, done: false, notes: "", createdAt: new Date().toISOString() }); setG({ ...g, title: "", targetDate: "" }); }}>
            <Plus size={16} /> Add goal
          </button>
        </Card>
      </Section>
    </Page>
  );
}

function GoalCard({ goal }: { goal: Goal }) {
  const s = useStore();
  const today = todayISO();
  return (
    <Card className="tight">
      <div className="row between">
        <div className="grow">
          <b className={goal.done ? "faint" : ""} style={goal.done ? { textDecoration: "line-through" } : undefined}>
            {goal.title}
          </b>
          <div className="small faint">
            {goal.area}
            {goal.targetDate ? ` · ${goal.targetDate < today && !goal.done ? "was due" : "target"} ${relativeDay(goal.targetDate, today).toLowerCase()} (${prettyDay(goal.targetDate)})` : ""}
          </div>
        </div>
        <span className={`tag ${goal.done ? "success" : "accent"}`}>{goal.done ? "Achieved" : `${goal.progress}%`}</span>
      </div>
      <div className="mt">
        <Bar value={goal.progress / 100} tone={goal.done ? "success" : undefined} />
      </div>
      <input type="range" min={0} max={100} step={5} value={goal.progress} aria-label="Progress" onChange={(e) => s.update("goals", goal.id, { progress: Number(e.target.value), done: Number(e.target.value) === 100 ? goal.done : false })} style={{ padding: 0, minHeight: 32, background: "transparent" }} />
      <div className="row">
        <button className="btn small grow" onClick={() => s.update("goals", goal.id, { done: !goal.done, progress: !goal.done ? 100 : goal.progress })}>
          {goal.done ? "Reopen" : "Mark achieved"}
        </button>
        <button className="icon-btn" aria-label="Delete goal" onClick={async () => (await confirmDialog({ title: "Delete goal?", confirm: "Delete", danger: true })) && s.remove("goals", goal.id)}>
          <Trash2 size={16} />
        </button>
      </div>
    </Card>
  );
}

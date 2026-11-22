import { Dumbbell, Plus, Trash2, Trophy } from "lucide-react";
import { useState } from "react";
import { BarChart, LineChart } from "../components/charts";
import { Card, confirmDialog, Empty, Field, NumberInput, Page, Section, Segmented, Sheet, Stat, toast, xpToast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { deleteWorkout, saveWorkout } from "../lib/actions";
import { addDays, prettyDay, todayISO, WEEKDAYS, weekday, weekStart } from "../lib/date";
import { personalRecords, weekRange, workoutsBetween } from "../lib/stats";
import type { BodyMetric, Workout, WorkoutPlan } from "../lib/types";

type Tab = "log" | "plans" | "body" | "records";

export default function Fitness() {
  const [tab, setTab] = useState<Tab>("log");
  return (
    <Page title="Fitness" eyebrow="Training & body">
      <Segmented value={tab} onChange={setTab} options={[{ value: "log", label: "Workouts" }, { value: "plans", label: "Plans" }, { value: "body", label: "Body" }, { value: "records", label: "Records" }]} />
      {tab === "log" && <WorkoutLog />}
      {tab === "plans" && <Plans />}
      {tab === "body" && <Body />}
      {tab === "records" && <Records />}
    </Page>
  );
}

function blankWorkout(plan?: WorkoutPlan): Workout {
  return {
    id: uid(),
    date: todayISO(),
    name: plan?.name ?? "Workout",
    durationMin: 60,
    exercises: plan ? plan.exercises.map((e) => ({ id: uid(), name: e.name, sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: 0 })) })) : [],
    notes: "",
  };
}

function WorkoutLog() {
  const s = useStore();
  const today = todayISO();
  const [editing, setEditing] = useState<Workout | null>(null);
  const [isNew, setIsNew] = useState(false);
  const workouts = [...s.all("workouts")].sort((a, b) => b.date.localeCompare(a.date));
  const { from, to } = weekRange(today);
  const weeks = Array.from({ length: 8 }, (_, i) => weekStart(addDays(today, -7 * (7 - i)))).map((w) => ({ label: prettyDay(w, { month: "numeric", day: "numeric" }), value: workoutsBetween(s, w, addDays(w, 6)).length }));
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const trained = new Set(workouts.map((w) => w.date));
  const todaysPlans = s.all("workoutPlans").filter((p) => p.weekdays.includes(weekday(today)));
  return (
    <>
      <div className="grid-3 mt">
        <Stat label="This week" value={`${workoutsBetween(s, from, to).length}/${s.settings.weeklyGoals.workouts}`} />
        <Stat label="Total" value={workouts.length} />
        <Stat label="Minutes" value={workoutsBetween(s, from, to).reduce((a, w) => a + w.durationMin, 0)} sub="this week" />
      </div>
      {todaysPlans.length > 0 && (
        <Card className="mt">
          <div className="small faint">Planned for today</div>
          {todaysPlans.map((p) => (
            <div key={p.id} className="row between mt">
              <b>{p.name}</b>
              <button className="btn primary small" onClick={() => { setEditing(blankWorkout(p)); setIsNew(true); }}>
                Start
              </button>
            </div>
          ))}
        </Card>
      )}
      <Section title="Gym attendance (4 weeks)">
        <Card>
          <div className="heat">
            {days.map((d) => (
              <i key={d} title={d} style={{ background: trained.has(d) ? "var(--success)" : undefined }} />
            ))}
          </div>
          <div className="mt">
            <BarChart data={weeks} goal={s.settings.weeklyGoals.workouts} color="var(--success)" />
          </div>
        </Card>
      </Section>
      <Section title="History">
        <Card className="tight">
          {workouts.length ? (
            <div className="list">
              {workouts.map((w) => (
                <div key={w.id} className="list-item clickable" onClick={() => { setEditing(w); setIsNew(false); }}>
                  <Dumbbell size={18} className="faint" />
                  <div className="grow">
                    <div className="title">{w.name}</div>
                    <div className="sub">
                      {prettyDay(w.date)} · {w.durationMin} min · {w.exercises.length} exercise(s) · {w.exercises.reduce((a, e) => a + e.sets.length, 0)} sets
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<Dumbbell />} title="No workouts logged" text={`Each workout earns +${s.settings.xp.workout} XP.`} />
          )}
        </Card>
      </Section>
      <button className="fab" aria-label="Log workout" onClick={() => { setEditing(blankWorkout()); setIsNew(true); }}>
        <Plus size={26} />
      </button>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={isNew ? "Log workout" : "Workout"}>
        {editing && <WorkoutForm initial={editing} isNew={isNew} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function WorkoutForm({ initial, isNew, onDone }: { initial: Workout; isNew: boolean; onDone: () => void }) {
  const [w, setW] = useState<Workout>(initial);
  const [exName, setExName] = useState("");
  const known = [...new Set(store().all("workouts").flatMap((x) => x.exercises.map((e) => e.name)))];
  const setEx = (id: string, fn: (e: Workout["exercises"][number]) => Workout["exercises"][number]) => setW((x) => ({ ...x, exercises: x.exercises.map((e) => (e.id === id ? fn(e) : e)) }));
  const save = () => {
    if (!w.date) return toast("Pick a date.", "error");
    if (w.durationMin <= 0 || w.durationMin > 600) return toast("Duration must be 1–600 minutes.", "error");
    const clean = { ...w, name: w.name.trim() || "Workout", exercises: w.exercises.filter((e) => e.name.trim()).map((e) => ({ ...e, sets: e.sets.filter((st) => st.reps > 0) })) };
    xpToast(saveWorkout(store(), clean));
    toast(isNew ? "Workout logged" : "Workout saved");
    onDone();
  };
  return (
    <>
      <div className="grid-2">
        <Field label="Name">
          <input value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
        </Field>
        <Field label="Date">
          <input type="date" value={w.date} onChange={(e) => setW({ ...w, date: e.target.value })} />
        </Field>
        <Field label="Duration (min)">
          <NumberInput value={w.durationMin} min={1} max={600} onChange={(v) => setW({ ...w, durationMin: v ?? 0 })} />
        </Field>
      </div>
      {w.exercises.map((e) => (
        <Card key={e.id} className="tight" >
          <div className="row between">
            <input value={e.name} onChange={(x) => setEx(e.id, (ee) => ({ ...ee, name: x.target.value }))} style={{ fontWeight: 650 }} />
            <button className="icon-btn" aria-label="Remove exercise" onClick={() => setW((x) => ({ ...x, exercises: x.exercises.filter((y) => y.id !== e.id) }))}>
              <Trash2 size={16} />
            </button>
          </div>
          {e.sets.map((st, i) => (
            <div key={i} className="row mt" style={{ marginTop: 8 }}>
              <span className="faint small" style={{ width: 40 }}>
                Set {i + 1}
              </span>
              <NumberInput value={st.reps} min={0} placeholder="Reps" onChange={(v) => setEx(e.id, (ee) => ({ ...ee, sets: ee.sets.map((ss, j) => (j === i ? { ...ss, reps: v ?? 0 } : ss)) }))} />
              <NumberInput value={st.weight} min={0} step={0.5} placeholder="kg" onChange={(v) => setEx(e.id, (ee) => ({ ...ee, sets: ee.sets.map((ss, j) => (j === i ? { ...ss, weight: v ?? 0 } : ss)) }))} />
              <button className="icon-btn" aria-label="Remove set" onClick={() => setEx(e.id, (ee) => ({ ...ee, sets: ee.sets.filter((_, j) => j !== i) }))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button className="btn small mt" onClick={() => setEx(e.id, (ee) => ({ ...ee, sets: [...ee.sets, ee.sets[ee.sets.length - 1] ?? { reps: 10, weight: 0 }] }))}>
            <Plus size={14} /> Set
          </button>
        </Card>
      ))}
      <div className="row mt">
        <input className="grow" list="known-ex" placeholder="Add exercise (e.g. Squat)" value={exName} onChange={(e) => setExName(e.target.value)} />
        <datalist id="known-ex">
          {known.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
        <button className="btn" aria-label="Add exercise" onClick={() => { if (exName.trim()) { setW((x) => ({ ...x, exercises: [...x.exercises, { id: uid(), name: exName.trim(), sets: [{ reps: 10, weight: 0 }] }] })); setExName(""); } }}>
          <Plus size={18} />
        </button>
      </div>
      <Field label="Notes">
        <textarea value={w.notes} onChange={(e) => setW({ ...w, notes: e.target.value })} />
      </Field>
      <div className="row">
        {!isNew && (
          <button className="btn danger" aria-label="Delete workout" onClick={async () => { if (await confirmDialog({ title: "Delete workout?", body: "Its XP will be removed.", confirm: "Delete", danger: true })) { deleteWorkout(store(), w.id); onDone(); } }}>
            <Trash2 size={18} />
          </button>
        )}
        <button className="btn primary grow" onClick={save}>
          Save workout
        </button>
      </div>
    </>
  );
}

function Plans() {
  const s = useStore();
  const plans = s.all("workoutPlans");
  const [p, setP] = useState<WorkoutPlan | null>(null);
  return (
    <>
      <div className="col mt">
        {plans.map((x) => (
          <Card key={x.id} className="tight" onClick={() => setP(x)}>
            <div className="row between">
              <b>{x.name}</b>
              <span className="small faint">{x.weekdays.map((d) => WEEKDAYS[d]).join(" ") || "Any day"}</span>
            </div>
            <div className="small muted">{x.exercises.map((e) => `${e.name} ${e.sets}×${e.reps}`).join(" · ") || "No exercises"}</div>
          </Card>
        ))}
        {!plans.length && (
          <Card>
            <Empty icon={<Dumbbell />} title="No workout plans" text="Create a routine (e.g. Push / Pull / Legs) and pick its training days." />
          </Card>
        )}
      </div>
      <button className="btn block mt" onClick={() => setP({ id: uid(), name: "", weekdays: [], exercises: [] })}>
        <Plus size={16} /> New plan
      </button>
      <Sheet open={!!p} onClose={() => setP(null)} title="Workout plan">
        {p && <PlanForm initial={p} onDone={() => setP(null)} />}
      </Sheet>
    </>
  );
}

function PlanForm({ initial, onDone }: { initial: WorkoutPlan; onDone: () => void }) {
  const s = useStore();
  const [p, setP] = useState(initial);
  const [ex, setEx] = useState({ name: "", sets: 3 as number | null, reps: 10 as number | null });
  const exists = !!s.get("workoutPlans", p.id);
  return (
    <>
      <Field label="Plan name">
        <input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Upper body" />
      </Field>
      <div className="field">
        <span>Training days</span>
        <div className="chips">
          {WEEKDAYS.map((d, i) => (
            <button key={d} className={`chip ${p.weekdays.includes(i) ? "on" : ""}`} onClick={() => setP({ ...p, weekdays: p.weekdays.includes(i) ? p.weekdays.filter((x) => x !== i) : [...p.weekdays, i].sort() })}>
              {d}
            </button>
          ))}
        </div>
      </div>
      {p.exercises.map((e) => (
        <div key={e.id} className="row between small" style={{ padding: "6px 0" }}>
          <span>
            {e.name} · {e.sets}×{e.reps}
          </span>
          <button className="icon-btn" aria-label="Remove" onClick={() => setP({ ...p, exercises: p.exercises.filter((x) => x.id !== e.id) })}>
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="row">
        <input className="grow" placeholder="Exercise" value={ex.name} onChange={(e) => setEx({ ...ex, name: e.target.value })} />
        <div style={{ width: 64 }}>
          <NumberInput value={ex.sets} min={1} placeholder="Sets" onChange={(v) => setEx({ ...ex, sets: v })} />
        </div>
        <div style={{ width: 64 }}>
          <NumberInput value={ex.reps} min={1} placeholder="Reps" onChange={(v) => setEx({ ...ex, reps: v })} />
        </div>
        <button className="btn" aria-label="Add" onClick={() => { if (ex.name.trim() && ex.sets && ex.reps) { setP({ ...p, exercises: [...p.exercises, { id: uid(), name: ex.name.trim(), sets: ex.sets, reps: ex.reps }] }); setEx({ ...ex, name: "" }); } }}>
          <Plus size={18} />
        </button>
      </div>
      <div className="row mt-l">
        {exists && (
          <button className="btn danger" aria-label="Delete plan" onClick={() => { s.remove("workoutPlans", p.id); onDone(); }}>
            <Trash2 size={18} />
          </button>
        )}
        <button className="btn primary grow" onClick={() => { if (!p.name.trim()) return toast("Name the plan.", "error"); s.put("workoutPlans", { ...p, name: p.name.trim() }); onDone(); }}>
          Save plan
        </button>
      </div>
    </>
  );
}

function Body() {
  const s = useStore();
  const metrics = [...s.all("bodyMetrics")].sort((a, b) => a.date.localeCompare(b.date));
  const [m, setM] = useState<BodyMetric>({ id: uid(), date: todayISO(), weight: null, waist: null, chest: null, arms: null, bodyFat: null });
  const save = () => {
    if ([m.weight, m.waist, m.chest, m.arms, m.bodyFat].every((v) => v === null)) return toast("Enter at least one measurement.", "error");
    if (m.weight !== null && (m.weight < 20 || m.weight > 400)) return toast("Weight looks wrong (20–400 kg).", "error");
    const existing = metrics.find((x) => x.date === m.date);
    s.put("bodyMetrics", existing ? { ...existing, ...Object.fromEntries(Object.entries(m).filter(([k, v]) => v !== null && k !== "id")) } : m);
    setM({ id: uid(), date: todayISO(), weight: null, waist: null, chest: null, arms: null, bodyFat: null });
    toast("Measurements saved");
  };
  const weights = metrics.filter((x) => x.weight !== null).map((x) => ({ label: prettyDay(x.date, { month: "numeric", day: "numeric" }), value: x.weight! }));
  const latest = [...metrics].reverse();
  return (
    <>
      <Section title="Body weight">
        <Card>
          <LineChart data={weights.slice(-20)} unit=" kg" color="var(--success)" />
        </Card>
      </Section>
      <Section title="Add measurements">
        <Card>
          <div className="grid-2">
            <Field label="Date">
              <input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
            </Field>
            <Field label="Weight (kg)">
              <NumberInput value={m.weight} min={20} max={400} step={0.1} onChange={(v) => setM({ ...m, weight: v })} />
            </Field>
            <Field label="Waist (cm)">
              <NumberInput value={m.waist} min={0} onChange={(v) => setM({ ...m, waist: v })} />
            </Field>
            <Field label="Chest (cm)">
              <NumberInput value={m.chest} min={0} onChange={(v) => setM({ ...m, chest: v })} />
            </Field>
            <Field label="Arms (cm)">
              <NumberInput value={m.arms} min={0} onChange={(v) => setM({ ...m, arms: v })} />
            </Field>
            <Field label="Body fat (%)">
              <NumberInput value={m.bodyFat} min={0} max={80} step={0.1} onChange={(v) => setM({ ...m, bodyFat: v })} />
            </Field>
          </div>
          <button className="btn primary block" onClick={save}>
            Save
          </button>
        </Card>
      </Section>
      <Section title="History">
        <Card className="tight">
          {latest.length ? (
            <div className="list">
              {latest.map((x) => (
                <div key={x.id} className="list-item">
                  <div className="grow">
                    <div className="title">{prettyDay(x.date)}</div>
                    <div className="sub">{[x.weight !== null && `${x.weight} kg`, x.waist !== null && `waist ${x.waist}`, x.chest !== null && `chest ${x.chest}`, x.arms !== null && `arms ${x.arms}`, x.bodyFat !== null && `${x.bodyFat}% fat`].filter(Boolean).join(" · ")}</div>
                  </div>
                  <button className="icon-btn" aria-label="Delete" onClick={() => s.remove("bodyMetrics", x.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No measurements yet" />
          )}
        </Card>
      </Section>
    </>
  );
}

function Records() {
  const s = useStore();
  const prs = personalRecords(s);
  return (
    <Card className="tight mt">
      {prs.length ? (
        <div className="list">
          {prs.map((p) => (
            <div key={p.name} className="list-item">
              <Trophy size={18} color="var(--warning)" />
              <div className="grow">
                <div className="title" style={{ textTransform: "capitalize" }}>
                  {p.name}
                </div>
                <div className="sub">{prettyDay(p.date)}</div>
              </div>
              <b>
                {p.weight} kg × {p.reps}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <Empty icon={<Trophy />} title="No personal records yet" text="Log sets with weights and your best lifts appear here automatically." />
      )}
    </Card>
  );
}

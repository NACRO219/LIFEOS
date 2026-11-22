import { AlertTriangle, CalendarDays, Check, Plus, Shuffle, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { TaskRow, TaskSheet } from "../components/tasks";
import { Bar, Card, confirmDialog, Empty, Field, NumberInput, Page, Section, Sheet, toast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { setPriorities } from "../lib/actions";
import { acceptPlan, applyMoves, availableFor, buildPlan, capacityFor, getPlan } from "../lib/dayplan";
import { addDays, formatDuration, isValidTime, prettyDay, relativeDay, todayISO, WEEKDAYS, weekday } from "../lib/date";
import { dayLoads, isOpen, proposeReschedule, rankTasks, type GeneratedPlan, type Move } from "../lib/planner";
import type { DayPlan, Task } from "../lib/types";
import { go } from "../router";

export default function Planner() {
  const s = useStore();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const plan = getPlan(s, date);
  const [preview, setPreview] = useState<GeneratedPlan | null>(null);
  const [moves, setMoves] = useState<Move[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [commit, setCommit] = useState({ title: "", start: "09:00", end: "10:00" });

  const savePlan = (patch: Partial<DayPlan>) => s.put("dayPlans", { ...plan, ...patch });
  const available = availableFor(s, date);
  const capacity = capacityFor(s, date);
  const loads = dayLoads(s.all("tasks"), today, 7, (d) => capacityFor(s, d));
  const dayLoad = loads.find((l) => l.date === date) ?? dayLoads(s.all("tasks"), date, 1, (d) => capacityFor(s, d))[0];
  const priorities = plan.priorityTaskIds.map((id) => s.get("tasks", id)).filter(Boolean) as Task[];

  const generate = () => setPreview(buildPlan(s, date));
  const accept = async () => {
    if (!preview) return;
    const moved = preview.blocks.filter((b) => s.get("tasks", b.taskId)?.scheduledDate !== date).length;
    if (moved > 0 || plan.blocks.length > 0) {
      const ok = await confirmDialog({
        title: "Apply this plan?",
        body: (
          <>
            {moved > 0 && <p>{moved} task(s) will be scheduled for {relativeDay(date, today).toLowerCase()}.</p>}
            {plan.blocks.length > 0 && <p>Your previous time blocks for this day will be replaced.</p>}
            {preview.overflow.length > 0 && <p>{preview.overflow.length} task(s) that don't fit stay on your list unchanged.</p>}
          </>
        ),
        confirm: "Apply plan",
      });
      if (!ok) return;
    }
    acceptPlan(store(), date, preview);
    setPreview(null);
    toast("Plan saved");
  };
  const reorganize = () => {
    const m = proposeReschedule(s.all("tasks"), today, (d) => capacityFor(s, d), 14, s.all("courses"));
    if (!m.length) toast("Your schedule already fits. Nothing to move.");
    else setMoves(m);
  };
  const addCommitment = () => {
    if (!commit.title.trim() || !isValidTime(commit.start) || !isValidTime(commit.end) || commit.end <= commit.start) return toast("Enter a title and a valid start/end time.", "error");
    savePlan({ commitments: [...plan.commitments, { id: uid(), title: commit.title.trim(), start: commit.start, end: commit.end }].sort((a, b) => a.start.localeCompare(b.start)) });
    setCommit({ title: "", start: commit.end, end: commit.end });
  };

  // timeline = commitments + blocks
  const timeline = [
    ...plan.commitments.map((c) => ({ key: c.id, start: c.start, end: c.end, title: c.title, fixed: true as const, task: null as Task | null })),
    ...plan.blocks.map((b) => ({ key: b.taskId, start: b.start, end: b.end, title: s.get("tasks", b.taskId)?.title ?? "(deleted task)", fixed: false as const, task: s.get("tasks", b.taskId) ?? null })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <Page title="Planner" eyebrow={`${prettyDay(date, { weekday: "long", month: "short", day: "numeric" })}`} actions={<button className="btn small" onClick={() => go("/checkin/morning")}>Morning check-in</button>}>
      <div className="chips">
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
          const l = loads.find((x) => x.date === d);
          return (
            <button key={d} className={`chip ${d === date ? "on" : ""}`} onClick={() => { setDate(d); setPreview(null); }}>
              {i18nDay(d, today)}
              {l?.overloaded && <AlertTriangle size={13} />}
            </button>
          );
        })}
      </div>

      <Card className="mt">
        <div className="row between">
          <div>
            <div className="small faint">Planned load</div>
            <b>
              {formatDuration(dayLoad.loadMin)} / {formatDuration(capacity)} realistic
            </b>
          </div>
          {dayLoad.overloaded ? <span className="tag danger">Overloaded</span> : <span className="tag success">Fits</span>}
        </div>
        <div className="mt">
          <Bar value={capacity ? dayLoad.loadMin / capacity : 0} tone={dayLoad.overloaded ? "danger" : dayLoad.loadMin / Math.max(1, capacity) > 0.85 ? "warning" : "success"} />
        </div>
        <div className="grid-2 mt">
          <Field label="Free time for tasks (min)" hint={`Default for ${WEEKDAYS[weekday(date)]}: ${s.settings.defaultAvailableMin[weekday(date)]} min`}>
            <NumberInput value={plan.availableMin ?? available} min={0} max={1200} step={15} onChange={(v) => savePlan({ availableMin: v })} />
          </Field>
          <Field label="Energy">
            <select value={plan.energy ?? "medium"} onChange={(e) => savePlan({ energy: e.target.value as DayPlan["energy"] })}>
              <option value="low">Low (70% capacity)</option>
              <option value="medium">Medium (85%)</option>
              <option value="high">High (100%)</option>
            </select>
          </Field>
        </div>
        <div className="row">
          <button className="btn primary grow" onClick={generate}>
            <Wand2 size={18} /> {plan.blocks.length ? "Re-plan day" : "Generate plan"}
          </button>
          <button className="btn" onClick={reorganize} aria-label="Reorganize unfinished tasks">
            <Shuffle size={18} /> Rebalance
          </button>
        </div>
      </Card>

      <Section title="Three priorities" action={<button className="btn ghost small" onClick={() => setPicking(true)}>Choose</button>}>
        <Card className="tight">
          {priorities.length ? (
            priorities.map((t, i) => (
              <div className="row" key={t.id}>
                <span className="priority-num">{i + 1}</span>
                <div className="grow">
                  <TaskRow task={t} onOpen={setEditing} />
                </div>
              </div>
            ))
          ) : (
            <Empty title="No priorities yet" text="Generate a plan or choose up to three tasks." />
          )}
        </Card>
      </Section>

      <Section title="Schedule">
        <Card>
          {timeline.length ? (
            <div className="timeline">
              {timeline.map((b) => (
                <div key={b.key} className={`tl-item ${b.fixed ? "fixed" : ""} ${b.task?.status === "done" ? "done" : ""}`} onClick={() => b.task && setEditing(b.task)}>
                  <span className="tl-time">{b.start}</span>
                  <div className="row between">
                    <b className="ellipsis">{b.title}</b>
                    {b.fixed ? <span className="tag">Fixed</span> : b.task?.status === "done" ? <Check size={16} /> : null}
                  </div>
                  <small className="faint">
                    {b.start}–{b.end}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<CalendarDays />} title="No schedule yet" text="Add fixed commitments, then generate a plan." />
          )}
          <hr className="sep" />
          <div className="small faint" style={{ fontWeight: 650, marginBottom: 8 }}>
            Fixed commitments (never moved)
          </div>
          {plan.commitments.map((c) => (
            <div key={c.id} className="row between small" style={{ padding: "6px 0" }}>
              <span>
                {c.start}–{c.end} · {c.title}
              </span>
              <button className="icon-btn" aria-label="Remove commitment" onClick={() => savePlan({ commitments: plan.commitments.filter((x) => x.id !== c.id) })}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="row mt">
            <input className="grow" placeholder="e.g. Lecture, work, gym" value={commit.title} onChange={(e) => setCommit({ ...commit, title: e.target.value })} />
          </div>
          <div className="row mt">
            <input type="time" value={commit.start} onChange={(e) => setCommit({ ...commit, start: e.target.value })} />
            <input type="time" value={commit.end} onChange={(e) => setCommit({ ...commit, end: e.target.value })} />
            <button className="btn" onClick={addCommitment} aria-label="Add commitment">
              <Plus size={18} />
            </button>
          </div>
        </Card>
      </Section>

      <Section title="This week">
        <Card className="tight">
          <div className="list">
            {loads.map((l) => (
              <div key={l.date} className="list-item clickable" onClick={() => setDate(l.date)}>
                <div style={{ width: 70 }} className="small">
                  <b>{i18nDay(l.date, today)}</b>
                </div>
                <div className="grow col gap-s">
                  <Bar value={l.capacityMin ? l.loadMin / l.capacityMin : l.loadMin ? 1 : 0} tone={l.overloaded ? "danger" : "success"} />
                  <small className="faint">
                    {l.tasks.length} task{l.tasks.length === 1 ? "" : "s"} · {formatDuration(l.loadMin)} / {formatDuration(l.capacityMin)}
                  </small>
                </div>
                {l.overloaded && <AlertTriangle size={18} color="var(--danger)" />}
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <button className="fab" aria-label="Add task" onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>

      {/* plan preview */}
      <Sheet open={!!preview} onClose={() => setPreview(null)} title="Proposed plan">
        {preview && (
          <>
            <p className="muted small">
              {preview.blocks.length} task(s), {formatDuration(preview.plannedMin)} of {formatDuration(preview.capacityMin)} realistic capacity. Fixed commitments are kept as they are.
            </p>
            <div className="timeline mt">
              {[...plan.commitments.map((c) => ({ k: c.id, start: c.start, end: c.end, title: c.title, fixed: true })), ...preview.blocks.map((b) => ({ k: b.taskId, start: b.start, end: b.end, title: s.get("tasks", b.taskId)?.title ?? "", fixed: false }))]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((b) => (
                  <div key={b.k} className={`tl-item ${b.fixed ? "fixed" : ""}`}>
                    <span className="tl-time">{b.start}</span>
                    <b>{b.title}</b>
                    <div className="small faint">
                      {b.start}–{b.end}
                      {preview.priorities.some((p) => p.id === b.k) ? " · Priority" : ""}
                    </div>
                  </div>
                ))}
            </div>
            {preview.blocks.length === 0 && <Empty title="Nothing to schedule" text="Add tasks or free up time." />}
            {preview.overflow.length > 0 && (
              <div className="banner mt">
                <AlertTriangle size={18} />
                <div>
                  <b>Doesn't fit today ({preview.overflow.length})</b>
                  <div>{preview.overflow.slice(0, 5).map((t) => t.title).join(", ")}{preview.overflow.length > 5 ? "…" : ""}</div>
                  <div className="faint">These stay on your list. Use Rebalance to spread them over the week.</div>
                </div>
              </div>
            )}
            <button className="btn primary block mt-l" onClick={accept} disabled={!preview.blocks.length}>
              Apply plan
            </button>
          </>
        )}
      </Sheet>

      {/* rebalance proposals */}
      <Sheet open={!!moves} onClose={() => setMoves(null)} title="Suggested changes">
        {moves && <MovesReview moves={moves} onDone={() => setMoves(null)} />}
      </Sheet>

      {picking && <PrioritiesPicker open onClose={() => setPicking(false)} date={date} />}
      <TaskSheet open={adding} onClose={() => setAdding(false)} defaults={{ scheduledDate: date }} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </Page>
  );
}

function i18nDay(d: string, today: string) {
  const r = relativeDay(d, today);
  return r.startsWith("In ") ? prettyDay(d, { weekday: "short", day: "numeric" }) : r;
}

function MovesReview({ moves, onDone }: { moves: Move[]; onDone: () => void }) {
  const [selected, setSelected] = useState(() => new Set(moves.map((m) => m.taskId)));
  const today = todayISO();
  const apply = () => {
    const chosen = moves.filter((m) => selected.has(m.taskId));
    applyMoves(store(), chosen);
    toast(`${chosen.length} task(s) rescheduled`);
    onDone();
  };
  return (
    <>
      <p className="muted small">Nothing is deleted. Review each change and untick anything you want to keep as it is.</p>
      <div className="list mt">
        {moves.map((m) => (
          <label key={m.taskId} className="list-item">
            <input type="checkbox" checked={selected.has(m.taskId)} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(m.taskId); else n.delete(m.taskId); return n; })} />
            <div className="grow">
              <div className="title">{m.title}</div>
              <div className="sub">
                {m.from ? relativeDay(m.from, today) : "Unscheduled"} → <b>{relativeDay(m.to, today)}</b> · {m.reason}
              </div>
            </div>
          </label>
        ))}
      </div>
      <button className="btn primary block mt-l" disabled={!selected.size} onClick={apply}>
        Apply {selected.size} change{selected.size === 1 ? "" : "s"}
      </button>
    </>
  );
}

function PrioritiesPicker({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const s = useStore();
  const plan = getPlan(s, date);
  const [sel, setSel] = useState<string[]>(plan.priorityTaskIds);
  const ranked = rankTasks(s.all("tasks"), date, s.all("courses"));
  const extra = s.all("tasks").filter((t) => isOpen(t) && t.scheduledDate && t.scheduledDate > date);
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length >= 3 ? x : [...x, id]));
  return (
    <Sheet open={open} onClose={onClose} title="Choose up to 3 priorities">
      {open && (
        <>
          <p className="muted small">{sel.length}/3 selected · ranked by deadline, priority and exams</p>
          <div className="list mt">
            {[...ranked.map((r) => ({ t: r.task, why: r.reasons.join(", ") })), ...extra.map((t) => ({ t, why: `planned ${t.scheduledDate}` }))].map(({ t, why }) => (
              <label key={t.id} className="list-item">
                <input type="checkbox" checked={sel.includes(t.id)} disabled={!sel.includes(t.id) && sel.length >= 3} onChange={() => toggle(t.id)} />
                <div className="grow">
                  <div className="title">{t.title}</div>
                  <div className="sub">{why || t.category}</div>
                </div>
              </label>
            ))}
            {ranked.length === 0 && extra.length === 0 && <Empty title="No open tasks" />}
          </div>
          <button
            className="btn primary block mt-l"
            onClick={() => {
              const st = store();
              st.transact(() => {
                // priorities should be on that day's plan
                for (const id of sel) {
                  const t = st.get("tasks", id);
                  if (t && t.scheduledDate !== date) st.put("tasks", { ...t, scheduledDate: date });
                }
                setPriorities(st, date, sel);
              });
              toast("Priorities saved");
              onClose();
            }}
          >
            Save priorities
          </button>
        </>
      )}
    </Sheet>
  );
}

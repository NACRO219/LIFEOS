import { AlertTriangle, CalendarDays, Check, Plus, Shuffle, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { TaskRow, TaskSheet, catLabel } from "../components/tasks";
import { Bar, Card, confirmDialog, Empty, Field, NumberInput, Page, Section, Sheet, toast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { t } from "../i18n";
import { setPriorities } from "../lib/actions";
import { acceptPlan, applyMoves, availableFor, buildPlan, capacityFor, getPlan } from "../lib/dayplan";
import { addDays, formatDuration, isValidTime, prettyDay, relativeDay, todayISO, weekday, weekdayShort } from "../lib/date";
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
        title: t("plan.applyTitle"),
        body: (
          <>
            {moved > 0 && <p>{t("plan.applyMoved", { n: moved })}</p>}
            {plan.blocks.length > 0 && <p>{t("plan.applyReplace")}</p>}
            {preview.overflow.length > 0 && <p>{t("plan.applyOverflow", { n: preview.overflow.length })}</p>}
          </>
        ),
        confirm: t("plan.apply"),
      });
      if (!ok) return;
    }
    acceptPlan(store(), date, preview);
    setPreview(null);
    toast(t("plan.saved"));
  };
  const reorganize = () => {
    const m = proposeReschedule(s.all("tasks"), today, (d) => capacityFor(s, d), 14, s.all("courses"));
    if (!m.length) toast(t("plan.nothingToMove"));
    else setMoves(m);
  };
  const addCommitment = () => {
    if (!commit.title.trim() || !isValidTime(commit.start) || !isValidTime(commit.end) || commit.end <= commit.start) return toast(t("plan.commitErr"), "error");
    savePlan({ commitments: [...plan.commitments, { id: uid(), title: commit.title.trim(), start: commit.start, end: commit.end }].sort((a, b) => a.start.localeCompare(b.start)) });
    setCommit({ title: "", start: commit.end, end: commit.end });
  };

  const timeline = [
    ...plan.commitments.map((c) => ({ key: c.id, start: c.start, end: c.end, title: c.title, fixed: true as const, task: null as Task | null })),
    ...plan.blocks.map((b) => ({ key: b.taskId, start: b.start, end: b.end, title: s.get("tasks", b.taskId)?.title ?? "—", fixed: false as const, task: s.get("tasks", b.taskId) ?? null })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  return (
    <Page
      title={t("plan.title")}
      eyebrow={prettyDay(date, { weekday: "long", month: "short", day: "numeric" })}
      actions={
        <button className="btn small" onClick={() => go("/checkin/morning")}>
          {t("plan.morningCheckin")}
        </button>
      }
    >
      <div className="chips">
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
          const l = loads.find((x) => x.date === d);
          return (
            <button
              key={d}
              className={`chip ${d === date ? "on" : ""}`}
              onClick={() => {
                setDate(d);
                setPreview(null);
              }}
            >
              {chipDay(d, today)}
              {l?.overloaded && <AlertTriangle size={13} />}
            </button>
          );
        })}
      </div>

      <Card className="mt">
        <div className="row between">
          <div>
            <div className="small faint">{t("plan.load")}</div>
            <b>{t("plan.loadOf", { load: formatDuration(dayLoad.loadMin), cap: formatDuration(capacity) })}</b>
          </div>
          {dayLoad.overloaded ? <span className="tag danger">{t("plan.overloaded")}</span> : <span className="tag success">{t("plan.fits")}</span>}
        </div>
        <div className="mt">
          <Bar value={capacity ? dayLoad.loadMin / capacity : 0} tone={dayLoad.overloaded ? "danger" : dayLoad.loadMin / Math.max(1, capacity) > 0.85 ? "warning" : "success"} />
        </div>
        <div className="grid-2 mt">
          <Field label={t("plan.freeTime")} hint={t("plan.defaultFor", { day: weekdayShort(weekday(date)), n: s.settings.defaultAvailableMin[weekday(date)] })}>
            <NumberInput value={plan.availableMin ?? available} min={0} max={1200} step={15} onChange={(v) => savePlan({ availableMin: v })} />
          </Field>
          <Field label={t("plan.energy")}>
            <select value={plan.energy ?? "medium"} onChange={(e) => savePlan({ energy: e.target.value as DayPlan["energy"] })}>
              <option value="low">{t("plan.energyLow")}</option>
              <option value="medium">{t("plan.energyMed")}</option>
              <option value="high">{t("plan.energyHigh")}</option>
            </select>
          </Field>
        </div>
        <div className="row">
          <button className="btn primary grow" onClick={generate}>
            <Wand2 size={18} /> {plan.blocks.length ? t("plan.replan") : t("plan.generate")}
          </button>
          <button className="btn" onClick={reorganize}>
            <Shuffle size={18} /> {t("plan.rebalance")}
          </button>
        </div>
      </Card>

      <Section
        title={t("plan.threePriorities")}
        action={
          <button className="btn ghost small" onClick={() => setPicking(true)}>
            {t("common.choose")}
          </button>
        }
      >
        <Card className="tight">
          {priorities.length ? (
            priorities.map((x, i) => (
              <div className="row" key={x.id}>
                <span className="priority-num">{i + 1}</span>
                <div className="grow">
                  <TaskRow task={x} onOpen={setEditing} />
                </div>
              </div>
            ))
          ) : (
            <Empty title={t("plan.noPriorities")} text={t("plan.noPrioritiesHint")} />
          )}
        </Card>
      </Section>

      <Section title={t("plan.schedule")}>
        <Card>
          {timeline.length ? (
            <div className="timeline">
              {timeline.map((b) => (
                <div key={b.key} className={`tl-item ${b.fixed ? "fixed" : ""} ${b.task?.status === "done" ? "done" : ""}`} onClick={() => b.task && setEditing(b.task)}>
                  <span className="tl-time">{b.start}</span>
                  <div className="row between">
                    <b className="ellipsis">{b.title}</b>
                    {b.fixed ? <span className="tag">{t("plan.fixed")}</span> : b.task?.status === "done" ? <Check size={16} /> : null}
                  </div>
                  <small className="faint">
                    {b.start}–{b.end}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<CalendarDays />} title={t("plan.noSchedule")} text={t("plan.noScheduleHint")} />
          )}
          <hr className="sep" />
          <div className="small faint" style={{ fontWeight: 650, marginBottom: 8 }}>
            {t("plan.commitments")}
          </div>
          {plan.commitments.map((c) => (
            <div key={c.id} className="row between small" style={{ padding: "6px 0" }}>
              <span>
                {c.start}–{c.end} · {c.title}
              </span>
              <button className="icon-btn" aria-label={t("common.remove")} onClick={() => savePlan({ commitments: plan.commitments.filter((x) => x.id !== c.id) })}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="row mt">
            <input className="grow" placeholder={t("plan.commitPh")} value={commit.title} onChange={(e) => setCommit({ ...commit, title: e.target.value })} />
          </div>
          <div className="row mt">
            <input type="time" value={commit.start} onChange={(e) => setCommit({ ...commit, start: e.target.value })} />
            <input type="time" value={commit.end} onChange={(e) => setCommit({ ...commit, end: e.target.value })} />
            <button className="btn" onClick={addCommitment} aria-label={t("plan.addCommitment")}>
              <Plus size={18} />
            </button>
          </div>
        </Card>
      </Section>

      <Section title={t("plan.thisWeek")}>
        <Card className="tight">
          <div className="list">
            {loads.map((l) => (
              <div key={l.date} className="list-item clickable" onClick={() => setDate(l.date)}>
                <div style={{ width: 78 }} className="small">
                  <b>{chipDay(l.date, today)}</b>
                </div>
                <div className="grow col gap-s">
                  <Bar value={l.capacityMin ? l.loadMin / l.capacityMin : l.loadMin ? 1 : 0} tone={l.overloaded ? "danger" : "success"} />
                  <small className="faint">{t("plan.dayLoad", { n: l.tasks.length, load: formatDuration(l.loadMin), cap: formatDuration(l.capacityMin) })}</small>
                </div>
                {l.overloaded && <AlertTriangle size={18} color="var(--danger)" />}
              </div>
            ))}
          </div>
        </Card>
      </Section>

      <button className="fab" aria-label={t("task.add")} onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>

      <Sheet open={!!preview} onClose={() => setPreview(null)} title={t("plan.proposed")}>
        {preview && (
          <>
            <p className="muted small">{t("plan.proposedSummary", { n: preview.blocks.length, planned: formatDuration(preview.plannedMin), cap: formatDuration(preview.capacityMin) })}</p>
            <div className="timeline mt">
              {[...plan.commitments.map((c) => ({ k: c.id, start: c.start, end: c.end, title: c.title, fixed: true })), ...preview.blocks.map((b) => ({ k: b.taskId, start: b.start, end: b.end, title: s.get("tasks", b.taskId)?.title ?? "", fixed: false }))]
                .sort((a, b) => a.start.localeCompare(b.start))
                .map((b) => (
                  <div key={b.k} className={`tl-item ${b.fixed ? "fixed" : ""}`}>
                    <span className="tl-time">{b.start}</span>
                    <b>{b.title}</b>
                    <div className="small faint">
                      {b.start}–{b.end}
                      {preview.priorities.some((p) => p.id === b.k) ? ` · ${t("plan.priority")}` : ""}
                    </div>
                  </div>
                ))}
            </div>
            {preview.blocks.length === 0 && <Empty title={t("plan.nothingToSchedule")} text={t("plan.nothingToScheduleHint")} />}
            {preview.overflow.length > 0 && (
              <div className="banner mt">
                <AlertTriangle size={18} />
                <div>
                  <b>{t("plan.dontFit", { n: preview.overflow.length })}</b>
                  <div>
                    {preview.overflow
                      .slice(0, 5)
                      .map((x) => x.title)
                      .join(", ")}
                    {preview.overflow.length > 5 ? "…" : ""}
                  </div>
                  <div className="faint">{t("plan.dontFitHint")}</div>
                </div>
              </div>
            )}
            <button className="btn primary block mt-l" onClick={accept} disabled={!preview.blocks.length}>
              {t("plan.apply")}
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={!!moves} onClose={() => setMoves(null)} title={t("plan.suggested")}>
        {moves && <MovesReview moves={moves} onDone={() => setMoves(null)} />}
      </Sheet>

      {picking && <PrioritiesPicker onClose={() => setPicking(false)} date={date} />}
      <TaskSheet open={adding} onClose={() => setAdding(false)} defaults={{ scheduledDate: date }} />
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </Page>
  );
}

function chipDay(d: string, today: string) {
  const n = Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
  return n <= 1 ? relativeDay(d, today) : prettyDay(d, { weekday: "short", day: "numeric" });
}

function MovesReview({ moves, onDone }: { moves: Move[]; onDone: () => void }) {
  const [selected, setSelected] = useState(() => new Set(moves.map((m) => m.taskId)));
  const today = todayISO();
  const apply = () => {
    const chosen = moves.filter((m) => selected.has(m.taskId));
    applyMoves(store(), chosen);
    toast(t("plan.rescheduled", { n: chosen.length }));
    onDone();
  };
  return (
    <>
      <p className="muted small">{t("plan.movesIntro")}</p>
      <div className="list mt">
        {moves.map((m) => (
          <label key={m.taskId} className="list-item">
            <input
              type="checkbox"
              checked={selected.has(m.taskId)}
              onChange={(e) =>
                setSelected((cur) => {
                  const n = new Set(cur);
                  if (e.target.checked) n.add(m.taskId);
                  else n.delete(m.taskId);
                  return n;
                })
              }
            />
            <div className="grow">
              <div className="title">{m.title}</div>
              <div className="sub">
                {m.from ? relativeDay(m.from, today) : t("tasks.unscheduled")} → <b>{relativeDay(m.to, today)}</b> · {m.reason}
              </div>
            </div>
          </label>
        ))}
      </div>
      <button className="btn primary block mt-l" disabled={!selected.size} onClick={apply}>
        {t("plan.applyChanges", { n: selected.size })}
      </button>
    </>
  );
}

function PrioritiesPicker({ onClose, date }: { onClose: () => void; date: string }) {
  const s = useStore();
  const plan = getPlan(s, date);
  const [sel, setSel] = useState<string[]>(plan.priorityTaskIds);
  const ranked = rankTasks(s.all("tasks"), date, s.all("courses"));
  const extra = s.all("tasks").filter((x) => isOpen(x) && x.scheduledDate && x.scheduledDate > date);
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : x.length >= 3 ? x : [...x, id]));
  return (
    <Sheet open onClose={onClose} title={t("plan.pickTitle")}>
      <p className="muted small">{t("plan.pickSelected", { n: sel.length })}</p>
      <div className="list mt">
        {[...ranked.map((r) => ({ x: r.task, why: r.reasons.join(", ") })), ...extra.map((x) => ({ x, why: t("plan.plannedFor", { date: prettyDay(x.scheduledDate!) }) }))].map(({ x, why }) => (
          <label key={x.id} className="list-item">
            <input type="checkbox" checked={sel.includes(x.id)} disabled={!sel.includes(x.id) && sel.length >= 3} onChange={() => toggle(x.id)} />
            <div className="grow">
              <div className="title">{x.title}</div>
              <div className="sub">{why || catLabel(x.category)}</div>
            </div>
          </label>
        ))}
        {ranked.length === 0 && extra.length === 0 && <Empty title={t("plan.noOpen")} />}
      </div>
      <button
        className="btn primary block mt-l"
        onClick={() => {
          const st = store();
          st.transact(() => {
            for (const id of sel) {
              const x = st.get("tasks", id);
              if (x && x.scheduledDate !== date) st.put("tasks", { ...x, scheduledDate: date });
            }
            setPriorities(st, date, sel);
          });
          toast(t("plan.prioritiesSaved"));
          onClose();
        }}
      >
        {t("plan.savePriorities")}
      </button>
    </Sheet>
  );
}

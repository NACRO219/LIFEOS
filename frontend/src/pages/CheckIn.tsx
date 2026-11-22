import { Check, History, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, Empty, Field, NumberInput, Page, Section, Segmented, toast, xpToast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { completeEveningReview, completeTask, langName, logLanguageSession, newTask, saveWorkout, setPriorities, toggleHabit } from "../lib/actions";
import { eveningMessage, morningMessage } from "../lib/coach";
import { acceptPlan, availableFor, buildPlan, getPlan } from "../lib/dayplan";
import { addDays, diffDays, isValidTime, prettyDay, todayISO } from "../lib/date";
import { isOverdue, rankTasks, type GeneratedPlan } from "../lib/planner";
import { focusMinutes, languageMinutes, todaysTasks } from "../lib/stats";
import type { Commitment, DayPlan, LangCode, Skill, Task } from "../lib/types";
import { go } from "../router";

export function CommitmentsEditor({ value, onChange }: { value: Commitment[]; onChange: (v: Commitment[]) => void }) {
  const [c, setC] = useState({ title: "", start: "09:00", end: "10:00" });
  const add = () => {
    if (!c.title.trim() || !isValidTime(c.start) || !isValidTime(c.end) || c.end <= c.start) return toast("Enter a title and a valid time range.", "error");
    onChange([...value, { id: uid(), title: c.title.trim(), start: c.start, end: c.end }].sort((a, b) => a.start.localeCompare(b.start)));
    setC({ title: "", start: c.end, end: c.end });
  };
  return (
    <div>
      {value.map((x) => (
        <div key={x.id} className="row between small" style={{ padding: "6px 0" }}>
          <span>
            {x.start}–{x.end} · {x.title}
          </span>
          <button className="icon-btn" aria-label="Remove" onClick={() => onChange(value.filter((y) => y.id !== x.id))}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <input placeholder="e.g. Lectures, work, family" value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} />
      <div className="row mt">
        <input type="time" value={c.start} onChange={(e) => setC({ ...c, start: e.target.value })} />
        <input type="time" value={c.end} onChange={(e) => setC({ ...c, end: e.target.value })} />
        <button className="btn" onClick={add} aria-label="Add commitment">
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

// =================================================================== MORNING
export function MorningCheckIn() {
  const s = useStore();
  const today = todayISO();
  const plan = getPlan(s, today);
  const [hours, setHours] = useState<number | null>(Math.round((plan.availableMin ?? availableFor(s, today)) / 30) / 2);
  const [commitments, setCommitments] = useState<Commitment[]>(plan.commitments);
  const [energy, setEnergy] = useState<NonNullable<DayPlan["energy"]>>(plan.energy ?? "medium");
  const [chosen, setChosen] = useState<string[]>(plan.priorityTaskIds);
  const [newTitle, setNewTitle] = useState("");
  const [result, setResult] = useState<{ gen: GeneratedPlan; message: string } | null>(null);
  const ranked = useMemo(() => rankTasks(s.all("tasks"), today, s.all("courses")).slice(0, 12), [s, today]);
  const done = s.all("checkins").some((c) => c.date === today && c.type === "morning");

  const addPriority = () => {
    if (!newTitle.trim() || chosen.length >= 3) return;
    const t = newTask({ title: newTitle, scheduledDate: today, priority: "high" });
    s.put("tasks", t);
    setChosen((c) => [...c, t.id]);
    setNewTitle("");
  };

  const submit = () => {
    if (hours === null || hours < 0 || hours > 20) return toast("Enter how many hours you have (0–20).", "error");
    const st = store();
    st.transact(() => {
      for (const id of chosen) {
        const t = st.get("tasks", id);
        if (t && t.scheduledDate !== today) st.put("tasks", { ...t, scheduledDate: today });
      }
      st.put("dayPlans", { ...getPlan(st, today), availableMin: Math.round(hours * 60), energy, commitments, morningDone: true });
      setPriorities(st, today, chosen);
    });
    const gen = buildPlan(st, today);
    const exam = st
      .all("courses")
      .flatMap((c) => c.exams.map((e) => ({ title: `${c.code || c.name} ${e.title}`, days: diffDays(today, e.date) })))
      .filter((e) => e.days >= 0 && e.days <= 7)
      .sort((a, b) => a.days - b.days)[0];
    const message = morningMessage({
      name: st.settings.name,
      energy,
      capacityMin: gen.capacityMin,
      plannedMin: gen.plannedMin,
      scheduledCount: gen.blocks.length,
      overflowCount: gen.overflow.length,
      overdueCount: st.all("tasks").filter((t) => isOverdue(t, today)).length,
      examSoon: exam ?? null,
    });
    st.put("checkins", { id: `morning-${today}`, date: today, type: "morning", createdAt: new Date().toISOString(), answers: { hours, energy, commitments: commitments.map((c) => `${c.start}-${c.end} ${c.title}`), priorities: chosen.map((id) => st.get("tasks", id)?.title ?? id) }, coachMessage: message });
    setResult({ gen, message });
  };

  if (result) {
    return (
      <Page title="Your plan" eyebrow="Morning check-in" showBack>
        <Card className="accent">
          <div className="row gap-s small">
            <Sun size={16} /> Coach
          </div>
          <p className="mt">{result.message}</p>
        </Card>
        <Section title="Proposed schedule">
          <Card>
            {result.gen.blocks.length ? (
              <div className="timeline">
                {[...commitments.map((c) => ({ k: c.id, start: c.start, end: c.end, title: c.title, fixed: true })), ...result.gen.blocks.map((b) => ({ k: b.taskId, start: b.start, end: b.end, title: s.get("tasks", b.taskId)?.title ?? "", fixed: false }))]
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .map((b) => (
                    <div key={b.k} className={`tl-item ${b.fixed ? "fixed" : ""}`}>
                      <span className="tl-time">{b.start}</span>
                      <b>{b.title}</b>
                      <div className="small faint">
                        {b.start}–{b.end}
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <Empty title="No tasks to schedule" text="Add tasks and they'll be planned into your free time." />
            )}
          </Card>
        </Section>
        <div className="row mt-l">
          <button className="btn grow" onClick={() => go("/", { replace: true })}>
            Not now
          </button>
          <button
            className="btn primary grow"
            disabled={!result.gen.blocks.length}
            onClick={() => {
              acceptPlan(store(), today, result.gen);
              toast("Plan applied. Have a good day.");
              go("/plan", { replace: true });
            }}
          >
            Apply plan
          </button>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Plan your day" eyebrow={`Morning check-in · ${prettyDay(today)}`} showBack actions={<button className="icon-btn" aria-label="History" onClick={() => go("/checkin")}><History size={20} /></button>}>
      {done && <div className="banner info">You already checked in this morning. Submitting again updates today's plan.</div>}
      <Card className="mt">
        <Field label="1 · How much free time do you have for tasks today? (hours)" hint="Exclude fixed commitments. LIFEOS keeps a buffer so the plan stays realistic.">
          <NumberInput value={hours} min={0} max={20} step={0.5} onChange={setHours} />
        </Field>
        <div className="field">
          <span>2 · Fixed commitments</span>
          <CommitmentsEditor value={commitments} onChange={setCommitments} />
        </div>
        <div className="field mt">
          <span>3 · Energy level</span>
          <Segmented value={energy} onChange={setEnergy} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
        </div>
        <div className="field">
          <span>4 · Top priorities (up to 3) · {chosen.length}/3</span>
          <div className="list">
            {ranked.map(({ task: t, reasons }) => (
              <label key={t.id} className="list-item">
                <input type="checkbox" checked={chosen.includes(t.id)} disabled={!chosen.includes(t.id) && chosen.length >= 3} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, t.id] : c.filter((x) => x !== t.id)))} />
                <div className="grow">
                  <div className="title">{t.title}</div>
                  <div className="sub">{reasons.join(", ") || t.category}</div>
                </div>
              </label>
            ))}
            {chosen
              .filter((id) => !ranked.some((r) => r.task.id === id))
              .map((id) => (
                <div key={id} className="list-item">
                  <Check size={18} />
                  <div className="grow title">{s.get("tasks", id)?.title}</div>
                  <button className="icon-btn" aria-label="Remove" onClick={() => setChosen((c) => c.filter((x) => x !== id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
          <div className="row mt">
            <input className="grow" placeholder="Or add a new priority…" value={newTitle} disabled={chosen.length >= 3} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPriority()} />
            <button className="btn" onClick={addPriority} disabled={chosen.length >= 3 || !newTitle.trim()} aria-label="Add priority">
              <Plus size={18} />
            </button>
          </div>
        </div>
        <button className="btn primary block mt" onClick={submit}>
          Create my plan
        </button>
      </Card>
    </Page>
  );
}

// =================================================================== EVENING
type LangEntry = { minutes: number | null; skill: Skill };
type MissedAction = "tomorrow" | "keep";

export function EveningCheckIn() {
  const s = useStore();
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const tasks = todaysTasks(s, today);
  const uniTasks = tasks.filter((t) => t.category === "University");
  const [uniDone, setUniDone] = useState<string[]>([]);
  const [cs, setCs] = useState<{ did: boolean; minutes: number | null; what: string }>({ did: false, minutes: null, what: "" });
  const [lang, setLang] = useState<Record<LangCode, LangEntry>>({ zh: { minutes: null, skill: "vocabulary" }, en: { minutes: null, skill: "speaking" }, fr: { minutes: null, skill: "vocabulary" } });
  const [fit, setFit] = useState<{ trained: boolean; name: string; minutes: number | null; personal: string }>({ trained: false, name: "Workout", minutes: 45, personal: "" });
  const [missedAction, setMissedAction] = useState<Record<string, MissedAction>>({});
  const [distractions, setDistractions] = useState("");
  const [tomorrowHours, setTomorrowHours] = useState<number | null>(Math.round(availableFor(s, tomorrow) / 30) / 2);
  const [tomorrowCommit, setTomorrowCommit] = useState<Commitment[]>(getPlan(s, tomorrow).commitments);
  const [message, setMessage] = useState<string | null>(null);
  const alreadyDone = s.all("checkins").some((c) => c.date === today && c.type === "evening");
  const habits = s.all("habits").filter((h) => !h.archived);
  const workoutToday = s.all("workouts").some((w) => w.date === today);

  const openNonUni = tasks.filter((t) => t.status !== "done" && t.category !== "University");
  const missed = [...uniTasks.filter((t) => t.status !== "done" && !uniDone.includes(t.id)), ...openNonUni];

  const submit = () => {
    const st = store();
    let xp = 0;
    const achievements: string[] = [];
    const collect = (r: { xp: number; achievements: string[] }) => {
      xp += r.xp;
      achievements.push(...r.achievements);
    };
    // 1. confirmed completions only
    for (const id of uniDone) collect(completeTask(st, id));
    // 3–5. language practice the user reports (logged as practice sessions)
    for (const code of ["zh", "en", "fr"] as LangCode[]) {
      const e = lang[code];
      if (e.minutes && e.minutes > 0) collect(logLanguageSession(st, { lang: code, skill: e.skill, minutes: Math.min(600, e.minutes), date: today, notes: "Logged in evening check-in", isLesson: false }));
    }
    // 6. workout
    if (fit.trained && !workoutToday && fit.minutes) collect(saveWorkout(st, { id: uid(), date: today, name: fit.name || "Workout", durationMin: fit.minutes, exercises: [], notes: "Logged in evening check-in" }));
    // 7. missed tasks → tomorrow only when the user chose so
    st.transact(() => {
      for (const t of missed) {
        if ((missedAction[t.id] ?? "tomorrow") === "tomorrow") {
          const cur = st.get("tasks", t.id);
          if (cur && cur.status !== "done") st.put("tasks", { ...cur, scheduledDate: tomorrow });
        }
      }
      // 9–10. tomorrow
      const tp = getPlan(st, tomorrow);
      st.put("dayPlans", { ...tp, availableMin: tomorrowHours !== null ? Math.round(tomorrowHours * 60) : tp.availableMin, commitments: tomorrowCommit });
    });
    const plan = getPlan(st, today);
    const prioritiesDone = plan.priorityTaskIds.filter((id) => st.get("tasks", id)?.status === "done").length;
    const after = todaysTasks(st, today);
    const practiced: string[] = [];
    const skipped: string[] = [];
    (cs.did ? practiced : skipped).push("programming");
    for (const code of ["zh", "en", "fr"] as LangCode[]) ((languageMinutes(st, today, today, code) > 0 ? practiced : skipped) as string[]).push(langName(code));
    (fit.trained || workoutToday ? practiced : skipped).push("fitness");
    const msg = eveningMessage({
      name: st.settings.name,
      tasksDone: after.filter((t) => t.status === "done").length,
      tasksPlanned: after.length,
      prioritiesDone,
      prioritiesTotal: plan.priorityTaskIds.length,
      practiced,
      skipped,
      focusMin: focusMinutes(st, today),
      distractions,
    });
    st.put("checkins", {
      id: `evening-${today}`,
      date: today,
      type: "evening",
      createdAt: new Date().toISOString(),
      answers: {
        universityCompleted: uniTasks.filter((t) => t.status === "done" || uniDone.includes(t.id)).map((t) => t.title),
        programming: cs.did ? `${cs.minutes ?? 0} min${cs.what ? ` · ${cs.what}` : ""}` : "No",
        chinese: lang.zh.minutes ?? 0,
        english: lang.en.minutes ?? 0,
        french: lang.fr.minutes ?? 0,
        fitness: fit.trained || workoutToday ? `Yes${fit.minutes ? ` · ${fit.minutes} min` : ""}` : "No",
        personal: fit.personal,
        missed: missed.map((t) => `${t.title} → ${(missedAction[t.id] ?? "tomorrow") === "tomorrow" ? "tomorrow" : "kept"}`),
        distractions,
        tomorrowHours: tomorrowHours ?? 0,
        tomorrowCommitments: tomorrowCommit.map((c) => `${c.start}-${c.end} ${c.title}`),
      },
      coachMessage: msg,
    });
    collect(completeEveningReview(st, today));
    xpToast({ xp, achievements });
    setMessage(msg);
  };

  if (message)
    return (
      <Page title="Day reviewed" eyebrow="Evening check-in" showBack>
        <Card className="accent">
          <div className="row gap-s small">
            <Moon size={16} /> Coach
          </div>
          <p className="mt">{message}</p>
        </Card>
        <div className="row mt-l">
          <button className="btn grow" onClick={() => go("/", { replace: true })}>
            Done
          </button>
          <button className="btn primary grow" onClick={() => go("/plan", { replace: true })}>
            See tomorrow
          </button>
        </div>
      </Page>
    );

  const langRow = (code: LangCode) => {
    const logged = languageMinutes(s, today, today, code);
    const e = lang[code];
    const skills: Skill[] = code === "zh" ? ["vocabulary", "hanzi", "tones", "listening", "speaking", "reading", "writing"] : ["vocabulary", "grammar", "listening", "speaking", "reading", "writing"];
    return (
      <div className="field" key={code}>
        <span>
          {code === "zh" ? "3 · 🇨🇳 Chinese" : code === "en" ? "4 · 🇬🇧 English" : "5 · 🇫🇷 French"} practice {logged > 0 && <span className="tag success">{logged} min already logged</span>}
        </span>
        <div className="row">
          <NumberInput value={e.minutes} min={0} max={600} placeholder={logged ? "Extra minutes (optional)" : "Minutes (0 if none)"} onChange={(v) => setLang((l) => ({ ...l, [code]: { ...l[code], minutes: v } }))} />
          <select value={e.skill} onChange={(ev) => setLang((l) => ({ ...l, [code]: { ...l[code], skill: ev.target.value as Skill } }))}>
            {skills.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <Page title="Evening check-in" eyebrow={prettyDay(today)} showBack actions={<button className="icon-btn" aria-label="History" onClick={() => go("/checkin")}><History size={20} /></button>}>
      {alreadyDone && <div className="banner info">You've already reviewed today. You can submit again to add more; XP is only awarded once.</div>}
      <Card className="mt">
        <div className="field">
          <span>1 · University tasks completed today</span>
          {uniTasks.length === 0 && <small className="faint">No university tasks were planned today.</small>}
          {uniTasks.map((t: Task) => (
            <label key={t.id} className="list-item">
              <input type="checkbox" checked={t.status === "done" || uniDone.includes(t.id)} disabled={t.status === "done"} onChange={(e) => setUniDone((d) => (e.target.checked ? [...d, t.id] : d.filter((x) => x !== t.id)))} />
              <div className="grow title">{t.title}</div>
              {t.status === "done" && <span className="tag success">Done</span>}
            </label>
          ))}
        </div>
        <div className="field">
          <span>2 · Programming / CS practice</span>
          <Segmented value={cs.did ? "yes" : "no"} onChange={(v) => setCs({ ...cs, did: v === "yes" })} options={[{ value: "no", label: "Not today" }, { value: "yes", label: "Yes" }]} />
          {cs.did && (
            <div className="row">
              <NumberInput value={cs.minutes} min={0} max={600} placeholder="Minutes" onChange={(v) => setCs({ ...cs, minutes: v })} />
              <input placeholder="What did you work on?" value={cs.what} onChange={(e) => setCs({ ...cs, what: e.target.value })} />
            </div>
          )}
          {cs.did && <small className="hint">Solved exercises earn XP when logged in Programming → Exercises.</small>}
        </div>
        {langRow("zh")}
        {langRow("en")}
        {langRow("fr")}
        <div className="field">
          <span>6 · Fitness & personal development</span>
          {workoutToday ? (
            <small className="tag success">Workout already logged today ✓</small>
          ) : (
            <>
              <Segmented value={fit.trained ? "yes" : "no"} onChange={(v) => setFit({ ...fit, trained: v === "yes" })} options={[{ value: "no", label: "No training" }, { value: "yes", label: "I trained" }]} />
              {fit.trained && (
                <div className="row">
                  <input value={fit.name} onChange={(e) => setFit({ ...fit, name: e.target.value })} />
                  <NumberInput value={fit.minutes} min={1} max={600} placeholder="Minutes" onChange={(v) => setFit({ ...fit, minutes: v })} />
                </div>
              )}
            </>
          )}
          {habits.length > 0 && (
            <div className="chips mt">
              {habits.map((h) => {
                const on = !!s.get("habitLogs", `${h.id}|${today}`);
                return (
                  <button key={h.id} className={`chip ${on ? "on" : ""}`} onClick={() => toggleHabit(store(), h.id, today)}>
                    {on ? "✓ " : ""}
                    {h.name}
                  </button>
                );
              })}
            </div>
          )}
          <input className="mt" placeholder="Personal development (reading, journaling…)" value={fit.personal} onChange={(e) => setFit({ ...fit, personal: e.target.value })} />
        </div>
        <div className="field">
          <span>7 · Tasks missed today</span>
          {missed.length === 0 ? (
            <small className="faint">Nothing left open.</small>
          ) : (
            missed.map((t) => (
              <div key={t.id} className="list-item">
                <div className="grow">
                  <div className="title">{t.title}</div>
                </div>
                <select style={{ width: 150 }} value={missedAction[t.id] ?? "tomorrow"} onChange={(e) => setMissedAction((m) => ({ ...m, [t.id]: e.target.value as MissedAction }))}>
                  <option value="tomorrow">Move to tomorrow</option>
                  <option value="keep">Leave as is</option>
                </select>
              </div>
            ))
          )}
        </div>
        <Field label="8 · What distracted you?">
          <textarea value={distractions} onChange={(e) => setDistractions(e.target.value)} placeholder="Be honest. This is only for you." />
        </Field>
        <Field label="9 · Free time tomorrow (hours)">
          <NumberInput value={tomorrowHours} min={0} max={20} step={0.5} onChange={setTomorrowHours} />
        </Field>
        <div className="field">
          <span>10 · Tomorrow's commitments</span>
          <CommitmentsEditor value={tomorrowCommit} onChange={setTomorrowCommit} />
        </div>
        <button className="btn primary block mt" onClick={submit}>
          Complete review · +{s.settings.xp.eveningReview} XP
        </button>
      </Card>
    </Page>
  );
}

// =================================================================== HISTORY
export function CheckInHistory() {
  const checkins = [...useStore().all("checkins")].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Page title="Check-in history" showBack>
      <div className="row">
        <button className="btn grow" onClick={() => go("/checkin/morning")}>
          <Sun size={18} /> Morning
        </button>
        <button className="btn grow" onClick={() => go("/checkin/evening")}>
          <Moon size={18} /> Evening
        </button>
      </div>
      <Card className="tight mt">
        {checkins.length === 0 ? (
          <Empty title="No check-ins yet" text="Your morning plans and evening reviews will be kept here." />
        ) : (
          <div className="list">
            {checkins.map((c) => (
              <div key={c.id} className="list-item clickable" style={{ flexDirection: "column", alignItems: "stretch" }} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <div className="row between">
                  <b>
                    {c.type === "morning" ? "☀️ Morning" : "🌙 Evening"} · {prettyDay(c.date)}
                  </b>
                </div>
                <p className="small muted">{c.coachMessage}</p>
                {open === c.id && (
                  <div className="small mt">
                    {Object.entries(c.answers).map(([k, v]) => (
                      <div key={k}>
                        <b>{k}:</b> {Array.isArray(v) ? v.join(", ") || "—" : String(v) || "—"}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

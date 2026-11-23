import { Check, History, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { catLabel } from "../components/tasks";
import { Card, Empty, Field, NumberInput, Page, Section, Segmented, toast, xpToast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { t, type TKey } from "../i18n";
import { completeEveningReview, completeTask, langName, logLanguageSession, newTask, saveWorkout, setPriorities, toggleHabit } from "../lib/actions";
import { eveningMessage, morningMessage } from "../lib/coach";
import { acceptPlan, availableFor, buildPlan, getPlan } from "../lib/dayplan";
import { addDays, diffDays, isValidTime, prettyDay, todayISO } from "../lib/date";
import { isOverdue, rankTasks, type GeneratedPlan } from "../lib/planner";
import { focusMinutes, languageMinutes, todaysTasks } from "../lib/stats";
import type { Commitment, DayPlan, LangCode, Skill, Task } from "../lib/types";
import { go } from "../router";

export const skillLabel = (k: string) => t(`skill.${k}` as TKey);

export function CommitmentsEditor({ value, onChange }: { value: Commitment[]; onChange: (v: Commitment[]) => void }) {
  const [c, setC] = useState({ title: "", start: "09:00", end: "10:00" });
  const add = () => {
    if (!c.title.trim() || !isValidTime(c.start) || !isValidTime(c.end) || c.end <= c.start) return toast(t("ci.commitErr"), "error");
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
          <button className="icon-btn" aria-label={t("common.remove")} onClick={() => onChange(value.filter((y) => y.id !== x.id))}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <input placeholder={t("ci.commitPh")} value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} />
      <div className="row mt">
        <input type="time" value={c.start} onChange={(e) => setC({ ...c, start: e.target.value })} />
        <input type="time" value={c.end} onChange={(e) => setC({ ...c, end: e.target.value })} />
        <button className="btn" onClick={add} aria-label={t("plan.addCommitment")}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function HistoryButton() {
  return (
    <button className="icon-btn" aria-label={t("ci.history")} onClick={() => go("/checkin")}>
      <History size={20} />
    </button>
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
    const x = newTask({ title: newTitle, scheduledDate: today, priority: "high" });
    s.put("tasks", x);
    setChosen((c) => [...c, x.id]);
    setNewTitle("");
  };

  const submit = () => {
    if (hours === null || hours < 0 || hours > 20) return toast(t("ci.hoursErr"), "error");
    const st = store();
    st.transact(() => {
      for (const id of chosen) {
        const x = st.get("tasks", id);
        if (x && x.scheduledDate !== today) st.put("tasks", { ...x, scheduledDate: today });
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
      overdueCount: st.all("tasks").filter((x) => isOverdue(x, today)).length,
      examSoon: exam ?? null,
    });
    st.put("checkins", {
      id: `morning-${today}`,
      date: today,
      type: "morning",
      createdAt: new Date().toISOString(),
      answers: { hours, energy, commitments: commitments.map((c) => `${c.start}-${c.end} ${c.title}`), priorities: chosen.map((id) => st.get("tasks", id)?.title ?? id) },
      coachMessage: message,
    });
    setResult({ gen, message });
  };

  if (result) {
    return (
      <Page title={t("ci.yourPlan")} eyebrow={t("plan.morningCheckin")} showBack>
        <Card className="accent">
          <div className="row gap-s small">
            <Sun size={16} /> {t("ci.coach")}
          </div>
          <p className="mt">{result.message}</p>
        </Card>
        <Section title={t("ci.proposedSchedule")}>
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
              <Empty title={t("ci.noTasksToSchedule")} text={t("ci.noTasksHint")} />
            )}
          </Card>
        </Section>
        <div className="row mt-l">
          <button className="btn grow" onClick={() => go("/", { replace: true })}>
            {t("common.notNow")}
          </button>
          <button
            className="btn primary grow"
            disabled={!result.gen.blocks.length}
            onClick={() => {
              acceptPlan(store(), today, result.gen);
              toast(t("ci.applied"));
              go("/plan", { replace: true });
            }}
          >
            {t("plan.apply")}
          </button>
        </div>
      </Page>
    );
  }

  return (
    <Page title={t("ci.morningTitle")} eyebrow={t("ci.morningEyebrow", { date: prettyDay(today) })} showBack actions={<HistoryButton />}>
      {done && <div className="banner info">{t("ci.alreadyMorning")}</div>}
      <Card className="mt">
        <Field label={t("ci.q1")} hint={t("ci.q1hint")}>
          <NumberInput value={hours} min={0} max={20} step={0.5} onChange={setHours} />
        </Field>
        <div className="field">
          <span>{t("ci.q2")}</span>
          <CommitmentsEditor value={commitments} onChange={setCommitments} />
        </div>
        <div className="field mt">
          <span>{t("ci.q3")}</span>
          <Segmented
            value={energy}
            onChange={setEnergy}
            options={[
              { value: "low", label: t("energy.low") },
              { value: "medium", label: t("energy.medium") },
              { value: "high", label: t("energy.high") },
            ]}
          />
        </div>
        <div className="field">
          <span>{t("ci.q4", { n: chosen.length })}</span>
          <div className="list">
            {ranked.map(({ task: x, reasons }) => (
              <label key={x.id} className="list-item">
                <input type="checkbox" checked={chosen.includes(x.id)} disabled={!chosen.includes(x.id) && chosen.length >= 3} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, x.id] : c.filter((y) => y !== x.id)))} />
                <div className="grow">
                  <div className="title">{x.title}</div>
                  <div className="sub">{reasons.join(", ") || catLabel(x.category)}</div>
                </div>
              </label>
            ))}
            {chosen
              .filter((id) => !ranked.some((r) => r.task.id === id))
              .map((id) => (
                <div key={id} className="list-item">
                  <Check size={18} />
                  <div className="grow title">{s.get("tasks", id)?.title}</div>
                  <button className="icon-btn" aria-label={t("common.remove")} onClick={() => setChosen((c) => c.filter((x) => x !== id))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
          <div className="row mt">
            <input className="grow" placeholder={t("ci.newPriority")} value={newTitle} disabled={chosen.length >= 3} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPriority()} />
            <button className="btn" onClick={addPriority} disabled={chosen.length >= 3 || !newTitle.trim()} aria-label={t("ci.addPriority")}>
              <Plus size={18} />
            </button>
          </div>
        </div>
        <button className="btn primary block mt" onClick={submit}>
          {t("ci.createPlan")}
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
  const uniTasks = tasks.filter((x) => x.category === "University");
  const [uniDone, setUniDone] = useState<string[]>([]);
  const [cs, setCs] = useState<{ did: boolean; minutes: number | null; what: string }>({ did: false, minutes: null, what: "" });
  const [lang, setLang] = useState<Record<LangCode, LangEntry>>({ zh: { minutes: null, skill: "vocabulary" }, en: { minutes: null, skill: "speaking" }, fr: { minutes: null, skill: "vocabulary" } });
  const [fit, setFit] = useState<{ trained: boolean; name: string; minutes: number | null; personal: string }>({ trained: false, name: t("ci.workout"), minutes: 45, personal: "" });
  const [missedAction, setMissedAction] = useState<Record<string, MissedAction>>({});
  const [distractions, setDistractions] = useState("");
  const [tomorrowHours, setTomorrowHours] = useState<number | null>(Math.round(availableFor(s, tomorrow) / 30) / 2);
  const [tomorrowCommit, setTomorrowCommit] = useState<Commitment[]>(getPlan(s, tomorrow).commitments);
  const [message, setMessage] = useState<string | null>(null);
  const alreadyDone = s.all("checkins").some((c) => c.date === today && c.type === "evening");
  const habits = s.all("habits").filter((h) => !h.archived);
  const workoutToday = s.all("workouts").some((w) => w.date === today);

  const openNonUni = tasks.filter((x) => x.status !== "done" && x.category !== "University");
  const missed = [...uniTasks.filter((x) => x.status !== "done" && !uniDone.includes(x.id)), ...openNonUni];

  const submit = () => {
    const st = store();
    let xp = 0;
    const achievements: string[] = [];
    const collect = (r: { xp: number; achievements: string[] }) => {
      xp += r.xp;
      achievements.push(...r.achievements);
    };
    for (const id of uniDone) collect(completeTask(st, id));
    for (const code of ["zh", "en", "fr"] as LangCode[]) {
      const e = lang[code];
      if (e.minutes && e.minutes > 0) collect(logLanguageSession(st, { lang: code, skill: e.skill, minutes: Math.min(600, e.minutes), date: today, notes: t("ci.loggedInCheckin"), isLesson: false }));
    }
    if (fit.trained && !workoutToday && fit.minutes) collect(saveWorkout(st, { id: uid(), date: today, name: fit.name || t("ci.workout"), durationMin: fit.minutes, exercises: [], notes: t("ci.loggedInCheckin") }));
    st.transact(() => {
      for (const x of missed) {
        if ((missedAction[x.id] ?? "tomorrow") === "tomorrow") {
          const cur = st.get("tasks", x.id);
          if (cur && cur.status !== "done") st.put("tasks", { ...cur, scheduledDate: tomorrow });
        }
      }
      const tp = getPlan(st, tomorrow);
      st.put("dayPlans", { ...tp, availableMin: tomorrowHours !== null ? Math.round(tomorrowHours * 60) : tp.availableMin, commitments: tomorrowCommit });
    });
    const plan = getPlan(st, today);
    const prioritiesDone = plan.priorityTaskIds.filter((id) => st.get("tasks", id)?.status === "done").length;
    const after = todaysTasks(st, today);
    const practiced: string[] = [];
    const skipped: string[] = [];
    (cs.did ? practiced : skipped).push(t("coach.area.programming"));
    for (const code of ["zh", "en", "fr"] as LangCode[]) (languageMinutes(st, today, today, code) > 0 ? practiced : skipped).push(langName(code));
    (fit.trained || workoutToday ? practiced : skipped).push(t("coach.area.fitness"));
    const msg = eveningMessage({
      name: st.settings.name,
      tasksDone: after.filter((x) => x.status === "done").length,
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
        universityCompleted: uniTasks.filter((x) => x.status === "done" || uniDone.includes(x.id)).map((x) => x.title),
        programming: cs.did ? `${cs.minutes ?? 0} min${cs.what ? ` · ${cs.what}` : ""}` : "—",
        chinese: lang.zh.minutes ?? 0,
        english: lang.en.minutes ?? 0,
        french: lang.fr.minutes ?? 0,
        fitness: fit.trained || workoutToday ? `✓${fit.minutes ? ` · ${fit.minutes} min` : ""}` : "—",
        personal: fit.personal,
        missed: missed.map((x) => `${x.title} → ${(missedAction[x.id] ?? "tomorrow") === "tomorrow" ? t("ci.moveTomorrow") : t("ci.leave")}`),
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
      <Page title={t("ci.dayReviewed")} eyebrow={t("ci.eveningTitle")} showBack>
        <Card className="accent">
          <div className="row gap-s small">
            <Moon size={16} /> {t("ci.coach")}
          </div>
          <p className="mt">{message}</p>
        </Card>
        <div className="row mt-l">
          <button className="btn grow" onClick={() => go("/", { replace: true })}>
            {t("common.done")}
          </button>
          <button className="btn primary grow" onClick={() => go("/plan", { replace: true })}>
            {t("ci.seeTomorrow")}
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
          {code === "zh" ? t("ci.e3") : code === "en" ? t("ci.e4") : t("ci.e5")} {logged > 0 && <span className="tag success">{t("ci.alreadyLogged", { n: logged })}</span>}
        </span>
        <div className="row">
          <NumberInput value={e.minutes} min={0} max={600} placeholder={logged ? t("ci.extraMinutes") : t("ci.minutesNone")} onChange={(v) => setLang((l) => ({ ...l, [code]: { ...l[code], minutes: v } }))} />
          <select value={e.skill} onChange={(ev) => setLang((l) => ({ ...l, [code]: { ...l[code], skill: ev.target.value as Skill } }))}>
            {skills.map((k) => (
              <option key={k} value={k}>
                {skillLabel(k)}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  return (
    <Page title={t("ci.eveningTitle")} eyebrow={prettyDay(today)} showBack actions={<HistoryButton />}>
      {alreadyDone && <div className="banner info">{t("ci.alreadyEvening")}</div>}
      <Card className="mt">
        <div className="field">
          <span>{t("ci.e1")}</span>
          {uniTasks.length === 0 && <small className="faint">{t("ci.e1none")}</small>}
          {uniTasks.map((x: Task) => (
            <label key={x.id} className="list-item">
              <input type="checkbox" checked={x.status === "done" || uniDone.includes(x.id)} disabled={x.status === "done"} onChange={(e) => setUniDone((d) => (e.target.checked ? [...d, x.id] : d.filter((y) => y !== x.id)))} />
              <div className="grow title">{x.title}</div>
              {x.status === "done" && <span className="tag success">{t("status.done")}</span>}
            </label>
          ))}
        </div>
        <div className="field">
          <span>{t("ci.e2")}</span>
          <Segmented
            value={cs.did ? "yes" : "no"}
            onChange={(v) => setCs({ ...cs, did: v === "yes" })}
            options={[
              { value: "no", label: t("ci.notToday") },
              { value: "yes", label: t("ci.yes") },
            ]}
          />
          {cs.did && (
            <div className="row">
              <NumberInput value={cs.minutes} min={0} max={600} placeholder={t("common.minutes")} onChange={(v) => setCs({ ...cs, minutes: v })} />
              <input placeholder={t("ci.whatWorked")} value={cs.what} onChange={(e) => setCs({ ...cs, what: e.target.value })} />
            </div>
          )}
          {cs.did && <small className="hint">{t("ci.solvedHint")}</small>}
        </div>
        {langRow("zh")}
        {langRow("en")}
        {langRow("fr")}
        <div className="field">
          <span>{t("ci.e6")}</span>
          {workoutToday ? (
            <small className="tag success">{t("ci.workoutLogged")}</small>
          ) : (
            <>
              <Segmented
                value={fit.trained ? "yes" : "no"}
                onChange={(v) => setFit({ ...fit, trained: v === "yes" })}
                options={[
                  { value: "no", label: t("ci.noTraining") },
                  { value: "yes", label: t("ci.trained") },
                ]}
              />
              {fit.trained && (
                <div className="row">
                  <input value={fit.name} onChange={(e) => setFit({ ...fit, name: e.target.value })} />
                  <NumberInput value={fit.minutes} min={1} max={600} placeholder={t("common.minutes")} onChange={(v) => setFit({ ...fit, minutes: v })} />
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
          <input className="mt" placeholder={t("ci.personalPh")} value={fit.personal} onChange={(e) => setFit({ ...fit, personal: e.target.value })} />
        </div>
        <div className="field">
          <span>{t("ci.e7")}</span>
          {missed.length === 0 ? (
            <small className="faint">{t("ci.nothingOpen")}</small>
          ) : (
            missed.map((x) => (
              <div key={x.id} className="list-item">
                <div className="grow">
                  <div className="title">{x.title}</div>
                </div>
                <select style={{ width: 160 }} value={missedAction[x.id] ?? "tomorrow"} onChange={(e) => setMissedAction((m) => ({ ...m, [x.id]: e.target.value as MissedAction }))}>
                  <option value="tomorrow">{t("ci.moveTomorrow")}</option>
                  <option value="keep">{t("ci.leave")}</option>
                </select>
              </div>
            ))
          )}
        </div>
        <Field label={t("ci.e8")}>
          <textarea value={distractions} onChange={(e) => setDistractions(e.target.value)} placeholder={t("ci.distractPh")} />
        </Field>
        <Field label={t("ci.e9")}>
          <NumberInput value={tomorrowHours} min={0} max={20} step={0.5} onChange={setTomorrowHours} />
        </Field>
        <div className="field">
          <span>{t("ci.e10")}</span>
          <CommitmentsEditor value={tomorrowCommit} onChange={setTomorrowCommit} />
        </div>
        <button className="btn primary block mt" onClick={submit}>
          {t("ci.complete", { n: s.settings.xp.eveningReview })}
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
    <Page title={t("ci.historyTitle")} showBack>
      <div className="row">
        <button className="btn grow" onClick={() => go("/checkin/morning")}>
          <Sun size={18} /> {t("ci.morning")}
        </button>
        <button className="btn grow" onClick={() => go("/checkin/evening")}>
          <Moon size={18} /> {t("ci.evening")}
        </button>
      </div>
      <Card className="tight mt">
        {checkins.length === 0 ? (
          <Empty title={t("ci.noCheckins")} text={t("ci.noCheckinsHint")} />
        ) : (
          <div className="list">
            {checkins.map((c) => (
              <div key={c.id} className="list-item clickable" style={{ flexDirection: "column", alignItems: "stretch" }} onClick={() => setOpen(open === c.id ? null : c.id)}>
                <div className="row between">
                  <b>
                    {c.type === "morning" ? `☀️ ${t("ci.morning")}` : `🌙 ${t("ci.evening")}`} · {prettyDay(c.date)}
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

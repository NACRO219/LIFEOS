import { Code2, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BarChart } from "../components/charts";
import { Bar, Card, confirmDialog, Empty, Field, NumberInput, Page, Section, Segmented, Sheet, Stat, toast, xpToast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { CS_ROADMAP } from "../db/seed";
import { t, tDyn, type TKey } from "../i18n";
import { saveExercise } from "../lib/actions";
import { addDays, diffDays, prettyDay, relativeDay, todayISO, weekStart } from "../lib/date";
import { evaluateAchievements } from "../lib/gamification";
import { csProgress, solvedExercises } from "../lib/stats";
import type { CodingExercise, CsTopic } from "../lib/types";
import { openExternal } from "../native/platform";
import { go, useRoute } from "../router";

// Built-in roadmap names are shown translated while the user hasn't renamed them.
const seedTopic = new Map(CS_ROADMAP.map((x) => [x.id, x]));
export function topicName(x: CsTopic) {
  const seed = seedTopic.get(x.id);
  return seed && seed.name === x.name ? tDyn(`seed.${x.id}`, x.name) : x.name;
}
function lessonTitle(topicId: string, l: { id: string; title: string }) {
  const seed = seedTopic.get(topicId)?.lessons.find((s) => s.id === l.id);
  return seed && seed.title === l.title ? tDyn(`seed.${l.id}`, l.title) : l.title;
}
const diffLabel = (d: string) => t(`diff.${d}` as TKey);
const statusLabel = (st: string) => t(`exStatus.${st}` as TKey);

export default function ComputerScience() {
  const { parts } = useRoute();
  const tab = parts[1] === "exercises" ? "exercises" : "roadmap";
  return (
    <Page title={t("cs.title")} eyebrow={t("cs.eyebrow")}>
      <Segmented
        value={tab}
        onChange={(v) => go(v === "roadmap" ? "/cs" : "/cs/exercises", { replace: true })}
        options={[
          { value: "roadmap", label: t("cs.roadmap") },
          { value: "exercises", label: t("cs.exercises") },
        ]}
      />
      {tab === "roadmap" ? <Roadmap /> : <Exercises />}
    </Page>
  );
}

function Roadmap() {
  const s = useStore();
  const topics = [...s.all("csTopics")].sort((a, b) => a.order - b.order);
  const p = csProgress(s);
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const due = topics.filter((x) => x.nextReview && x.nextReview <= today);
  return (
    <>
      <Card className="mt">
        <div className="row between">
          <div>
            <div className="small faint">{t("cs.progress")}</div>
            <b style={{ fontSize: 22 }}>{Math.round(p.percent * 100)}%</b>
          </div>
          <span className="faint small">{t("cs.lessonsOf", { done: p.done, total: p.total })}</span>
        </div>
        <div className="mt">
          <Bar value={p.percent} />
        </div>
        {due.length > 0 && <div className="banner info mt">{t("cs.reviewDue", { list: due.map(topicName).join(", ") })}</div>}
      </Card>
      <div className="col mt">
        {topics.map((x) => {
          const done = x.lessons.filter((l) => l.done).length;
          const pct = x.lessons.length ? done / x.lessons.length : 0;
          return (
            <Card key={x.id} className="tight" onClick={() => go(`/cs/topic/${x.id}`)}>
              <div className="row between">
                <b>
                  {x.order}. {topicName(x)}
                </b>
                <span className={`tag ${pct === 1 ? "success" : pct > 0 ? "accent" : ""}`}>{pct === 1 ? t("cs.complete") : `${done}/${x.lessons.length}`}</span>
              </div>
              <div className="small faint" style={{ margin: "4px 0 8px" }}>
                {diffLabel(x.difficulty)}
                {x.nextReview ? ` · ${t("cs.review", { when: relativeDay(x.nextReview, today) })}` : ""}
              </div>
              <Bar value={pct} tone={pct === 1 ? "success" : undefined} />
            </Card>
          );
        })}
      </div>
      {adding ? (
        <Card className="mt">
          <Field label={t("cs.topicName")}>
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t("cs.topicPh")} />
          </Field>
          <div className="row">
            <button className="btn grow" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </button>
            <button
              className="btn primary grow"
              onClick={() => {
                if (!name.trim()) return;
                const id = uid();
                s.put("csTopics", { id, name: name.trim(), order: topics.length + 1, difficulty: "intermediate", resources: [], lessons: [], notes: "", nextReview: null, lastReviewed: null });
                setAdding(false);
                setName("");
                go(`/cs/topic/${id}`);
              }}
            >
              {t("cs.addTopic")}
            </button>
          </div>
        </Card>
      ) : (
        <button className="btn block mt" onClick={() => setAdding(true)}>
          <Plus size={16} /> {t("cs.addTopic")}
        </button>
      )}
    </>
  );
}

export function TopicDetail({ id }: { id: string }) {
  const s = useStore();
  const x = s.get("csTopics", id);
  const [lesson, setLesson] = useState("");
  const [res, setRes] = useState({ title: "", url: "" });
  const today = todayISO();
  if (!x)
    return (
      <Page title={t("cs.topic")} showBack>
        <Empty title={t("cs.topicNotFound")} />
      </Page>
    );
  const upd = (patch: Partial<CsTopic>) => s.update("csTopics", id, patch);
  const exercises = s.all("exercises").filter((e) => e.topicId === id);
  const done = x.lessons.filter((l) => l.done).length;
  const markReviewed = () => {
    const last = x.lastReviewed ? Math.max(1, diffDays(x.lastReviewed, x.nextReview ?? today)) : 1;
    const next = addDays(today, Math.min(60, Math.max(3, last * 2)));
    upd({ lastReviewed: today, nextReview: next });
    toast(t("cs.reviewed", { date: prettyDay(next) }));
  };
  const addLesson = () => {
    if (!lesson.trim()) return;
    upd({ lessons: [...x.lessons, { id: uid(), title: lesson.trim(), done: false, doneAt: null }] });
    setLesson("");
  };
  return (
    <Page title={topicName(x)} eyebrow={t("cs.topicEyebrow", { done, total: x.lessons.length, diff: diffLabel(x.difficulty) })} showBack>
      <Card>
        <Bar value={x.lessons.length ? done / x.lessons.length : 0} />
        <div className="grid-2 mt">
          <Field label={t("cs.difficulty")}>
            <select value={x.difficulty} onChange={(e) => upd({ difficulty: e.target.value as CsTopic["difficulty"] })}>
              <option value="beginner">{t("diff.beginner")}</option>
              <option value="intermediate">{t("diff.intermediate")}</option>
              <option value="advanced">{t("diff.advanced")}</option>
            </select>
          </Field>
          <Field label={t("cs.nextReview")}>
            <input type="date" value={x.nextReview ?? ""} onChange={(e) => upd({ nextReview: e.target.value || null })} />
          </Field>
        </div>
        <button className="btn block" onClick={markReviewed}>
          {t("cs.markReviewed")}
        </button>
        {x.lastReviewed && <small className="faint">{t("cs.lastReviewed", { date: prettyDay(x.lastReviewed) })}</small>}
      </Card>

      <Section title={t("cs.lessons")}>
        <Card className="tight">
          <div className="list">
            {x.lessons.map((l) => (
              <label key={l.id} className={`list-item ${l.done ? "task-done" : ""}`}>
                <input
                  type="checkbox"
                  checked={l.done}
                  onChange={(e) => {
                    upd({ lessons: x.lessons.map((y) => (y.id === l.id ? { ...y, done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : null } : y)) });
                    evaluateAchievements(store()).forEach((a) => toast(t("toast.achievement", { title: a.title }), "xp"));
                  }}
                />
                <div className="grow title">{lessonTitle(x.id, l)}</div>
                <button
                  className="icon-btn"
                  aria-label={t("cs.removeLesson")}
                  onClick={(e) => {
                    e.preventDefault();
                    upd({ lessons: x.lessons.filter((y) => y.id !== l.id) });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </label>
            ))}
          </div>
          <div className="row mt">
            <input className="grow" placeholder={t("cs.addLesson")} value={lesson} onChange={(e) => setLesson(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLesson()} />
            <button className="btn" aria-label={t("cs.addLesson")} onClick={addLesson}>
              <Plus size={18} />
            </button>
          </div>
        </Card>
      </Section>

      <Section title={t("cs.resources")}>
        <Card className="tight">
          <div className="list">
            {x.resources.map((r) => (
              <div key={r.id} className="list-item">
                <div className="grow clickable" onClick={() => openExternal(r.url)}>
                  <div className="title">{r.title}</div>
                  <div className="sub ellipsis" dir="ltr">
                    {r.url}
                  </div>
                </div>
                <button className="icon-btn" aria-label={t("common.open")} onClick={() => openExternal(r.url)}>
                  <ExternalLink size={16} />
                </button>
                <button className="icon-btn" aria-label={t("cs.removeResource")} onClick={() => upd({ resources: x.resources.filter((y) => y.id !== r.id) })}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid-2 mt">
            <input placeholder={t("common.title")} value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} />
            <input placeholder="https://…" inputMode="url" dir="ltr" value={res.url} onChange={(e) => setRes({ ...res, url: e.target.value })} />
          </div>
          <button
            className="btn block mt"
            onClick={() => {
              if (!res.title.trim() || !/^https?:\/\//i.test(res.url.trim())) return toast(t("cs.errResource"), "error");
              upd({ resources: [...x.resources, { id: uid(), title: res.title.trim(), url: res.url.trim() }] });
              setRes({ title: "", url: "" });
            }}
          >
            <Plus size={16} /> {t("cs.addResource")}
          </button>
        </Card>
      </Section>

      <Section
        title={t("cs.exercisesSolved", { s: exercises.filter((e) => e.status === "solved").length, n: exercises.length })}
        action={
          <button className="btn ghost small" onClick={() => go("/cs/exercises")}>
            {t("common.all")}
          </button>
        }
      >
        <Card className="tight">{exercises.length ? exercises.slice(0, 8).map((e) => <ExerciseRow key={e.id} ex={e} />) : <Empty title={t("cs.noLinked")} text={t("cs.noLinkedHint")} />}</Card>
      </Section>

      <Section title={t("common.notes")}>
        <Card>
          <textarea key={x.id} defaultValue={x.notes} placeholder={t("cs.notesPh")} style={{ minHeight: 140 }} onBlur={(e) => e.target.value !== x.notes && upd({ notes: e.target.value })} />
        </Card>
      </Section>
      <button
        className="btn danger block mt-l"
        onClick={async () => {
          if (await confirmDialog({ title: t("uni.deleteCourseTitle", { name: topicName(x) }), body: t("cs.deleteTopicBody"), confirm: t("common.delete"), danger: true })) {
            s.transact(() => {
              for (const e of exercises) s.put("exercises", { ...e, topicId: null });
              s.remove("csTopics", id);
            });
            go("/cs", { replace: true });
          }
        }}
      >
        {t("cs.deleteTopic")}
      </button>
    </Page>
  );
}

function ExerciseRow({ ex, onOpen }: { ex: CodingExercise; onOpen?: (e: CodingExercise) => void }) {
  return (
    <div className="list-item clickable" onClick={() => onOpen?.(ex)}>
      <Code2 size={18} className="faint" />
      <div className="grow">
        <div className="title ellipsis">{ex.title}</div>
        <div className="sub">{[ex.platform, ex.language, diffLabel(ex.difficulty), ex.minutes ? t("dur.min", { n: ex.minutes }) : ""].filter(Boolean).join(" · ")}</div>
      </div>
      <span className={`tag ${ex.status === "solved" ? "success" : ex.status === "attempted" ? "warning" : ""}`}>{statusLabel(ex.status)}</span>
    </div>
  );
}

function Exercises() {
  const s = useStore();
  const today = todayISO();
  const [filter, setFilter] = useState<"all" | CodingExercise["status"]>("all");
  const [editing, setEditing] = useState<CodingExercise | null | "new">(null);
  const list = [...s.all("exercises")].filter((e) => filter === "all" || e.status === filter).sort((a, b) => b.date.localeCompare(a.date));
  const weeks = Array.from({ length: 8 }, (_, i) => weekStart(addDays(today, -7 * (7 - i)))).map((w) => ({ label: prettyDay(w, { month: "numeric", day: "numeric" }), value: solvedExercises(s, w, addDays(w, 6)).length }));
  const all = s.all("exercises");
  return (
    <>
      <div className="grid-3 mt">
        <Stat label={t("cs.solved")} value={all.filter((e) => e.status === "solved").length} />
        <Stat label={t("cs.thisWeek")} value={solvedExercises(s, weekStart(today), today).length} sub={t("cs.goal", { n: s.settings.weeklyGoals.codingExercises })} />
        <Stat label={t("cs.time")} value={t("dur.h", { h: Math.round(all.reduce((a, e) => a + e.minutes, 0) / 60) })} />
      </div>
      <Card className="mt">
        <div className="small faint">{t("cs.perWeek")}</div>
        <BarChart data={weeks} goal={s.settings.weeklyGoals.codingExercises} />
      </Card>
      <div className="mt">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: t("common.all") },
            { value: "solved", label: t("exStatus.solved") },
            { value: "attempted", label: t("exStatus.attempted") },
            { value: "todo", label: t("exStatus.todo") },
          ]}
        />
      </div>
      <Card className="tight mt">
        {list.length ? (
          <div className="list">
            {list.map((e) => (
              <ExerciseRow key={e.id} ex={e} onOpen={setEditing} />
            ))}
          </div>
        ) : (
          <Empty icon={<Code2 />} title={t("cs.noExercises")} text={t("cs.noExercisesHint", { n: s.settings.xp.programmingExercise })} />
        )}
      </Card>
      <button className="fab" aria-label={t("cs.logExercise")} onClick={() => setEditing("new")}>
        <Plus size={26} />
      </button>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("cs.logExercise") : t("cs.exercise")}>
        {editing !== null && <ExerciseForm ex={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </>
  );
}

function ExerciseForm({ ex, onDone }: { ex: CodingExercise | null; onDone: () => void }) {
  const s = useStore();
  const [e, setE] = useState<CodingExercise>(ex ?? { id: uid(), title: "", platform: "LeetCode", difficulty: "easy", language: "Python", minutes: 30, notes: "", status: "solved", topicId: null, date: todayISO(), solvedAt: null });
  const set = <K extends keyof CodingExercise>(k: K, v: CodingExercise[K]) => setE((x) => ({ ...x, [k]: v }));
  const save = () => {
    if (!e.title.trim()) return toast(t("cs.errTitle"), "error");
    if (e.minutes < 0 || e.minutes > 1440) return toast(t("cs.errTime"), "error");
    xpToast(saveExercise(store(), { ...e, title: e.title.trim() }));
    onDone();
  };
  return (
    <>
      <Field label={t("cs.exTitle")}>
        <input value={e.title} autoFocus={!ex} onChange={(x) => set("title", x.target.value)} placeholder={t("cs.exTitlePh")} />
      </Field>
      <div className="grid-2">
        <Field label={t("cs.platform")}>
          <input value={e.platform} list="platforms" onChange={(x) => set("platform", x.target.value)} />
          <datalist id="platforms">
            {["LeetCode", "HackerRank", "Codeforces", "Exercism", "Codewars", "Project Euler"].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label={t("cs.language")}>
          <input value={e.language} onChange={(x) => set("language", x.target.value)} />
        </Field>
        <Field label={t("cs.difficulty")}>
          <select value={e.difficulty} onChange={(x) => set("difficulty", x.target.value as CodingExercise["difficulty"])}>
            <option value="easy">{t("diff.easy")}</option>
            <option value="medium">{t("diff.medium")}</option>
            <option value="hard">{t("diff.hard")}</option>
          </select>
        </Field>
        <Field label={t("cs.timeSpent")}>
          <NumberInput value={e.minutes} min={0} max={1440} onChange={(v) => set("minutes", v ?? 0)} />
        </Field>
        <Field label={t("task.status")}>
          <select value={e.status} onChange={(x) => set("status", x.target.value as CodingExercise["status"])}>
            <option value="solved">{t("exStatus.solved")}</option>
            <option value="attempted">{t("exStatus.attempted")}</option>
            <option value="todo">{t("exStatus.todo")}</option>
          </select>
        </Field>
        <Field label={t("cs.topic")}>
          <select value={e.topicId ?? ""} onChange={(x) => set("topicId", x.target.value || null)}>
            <option value="">{t("common.none")}</option>
            {[...s.all("csTopics")]
              .sort((a, b) => a.order - b.order)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {topicName(x)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <Field label={t("cs.solutionNotes")}>
        <textarea value={e.notes} onChange={(x) => set("notes", x.target.value)} placeholder={t("cs.solutionPh")} />
      </Field>
      <div className="row">
        {ex && (
          <button
            className="btn danger"
            aria-label={t("common.delete")}
            onClick={async () => {
              if (await confirmDialog({ title: t("cs.deleteExercise"), body: ex.status === "solved" ? t("task.deleteXp") : undefined, confirm: t("common.delete"), danger: true })) {
                s.transact(() => {
                  s.remove("xpEvents", `exercise:${ex.id}`);
                  s.remove("exercises", ex.id);
                });
                onDone();
              }
            }}
          >
            <Trash2 size={18} />
          </button>
        )}
        <button className="btn primary grow" onClick={save}>
          {e.status === "solved" && ex?.status !== "solved" ? t("cs.saveXp", { n: s.settings.xp.programmingExercise }) : t("common.save")}
        </button>
      </div>
    </>
  );
}

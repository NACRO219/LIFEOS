import { Code2, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { BarChart } from "../components/charts";
import { Bar, Card, confirmDialog, Empty, Field, NumberInput, Page, Section, Segmented, Sheet, Stat, toast, xpToast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { saveExercise } from "../lib/actions";
import { addDays, diffDays, prettyDay, relativeDay, todayISO, weekStart } from "../lib/date";
import { evaluateAchievements } from "../lib/gamification";
import { csProgress, solvedExercises } from "../lib/stats";
import type { CodingExercise, CsTopic } from "../lib/types";
import { openExternal } from "../native/platform";
import { go, useRoute } from "../router";

export default function ComputerScience() {
  const { parts } = useRoute();
  const tab = parts[1] === "exercises" ? "exercises" : "roadmap";
  return (
    <Page title="Programming" eyebrow="Computer science">
      <Segmented value={tab} onChange={(v) => go(v === "roadmap" ? "/cs" : "/cs/exercises", { replace: true })} options={[{ value: "roadmap", label: "Roadmap" }, { value: "exercises", label: "Exercises" }]} />
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
  const due = topics.filter((t) => t.nextReview && t.nextReview <= today);
  return (
    <>
      <Card className="mt">
        <div className="row between">
          <div>
            <div className="small faint">Roadmap progress</div>
            <b style={{ fontSize: 22 }}>{Math.round(p.percent * 100)}%</b>
          </div>
          <span className="faint small">
            {p.done}/{p.total} lessons
          </span>
        </div>
        <div className="mt">
          <Bar value={p.percent} />
        </div>
        {due.length > 0 && <div className="banner info mt">Review due: {due.map((t) => t.name).join(", ")}</div>}
      </Card>
      <div className="col mt">
        {topics.map((t) => {
          const done = t.lessons.filter((l) => l.done).length;
          const pct = t.lessons.length ? done / t.lessons.length : 0;
          return (
            <Card key={t.id} className="tight" onClick={() => go(`/cs/topic/${t.id}`)}>
              <div className="row between">
                <b>
                  {t.order}. {t.name}
                </b>
                <span className={`tag ${pct === 1 ? "success" : pct > 0 ? "accent" : ""}`}>{pct === 1 ? "Complete" : `${done}/${t.lessons.length}`}</span>
              </div>
              <div className="small faint" style={{ margin: "4px 0 8px" }}>
                {t.difficulty}
                {t.nextReview ? ` · review ${relativeDay(t.nextReview, today).toLowerCase()}` : ""}
              </div>
              <Bar value={pct} tone={pct === 1 ? "success" : undefined} />
            </Card>
          );
        })}
      </div>
      {adding ? (
        <Card className="mt">
          <Field label="Topic name">
            <input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Operating systems" />
          </Field>
          <div className="row">
            <button className="btn grow" onClick={() => setAdding(false)}>
              Cancel
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
              Add topic
            </button>
          </div>
        </Card>
      ) : (
        <button className="btn block mt" onClick={() => setAdding(true)}>
          <Plus size={16} /> Add topic
        </button>
      )}
    </>
  );
}

export function TopicDetail({ id }: { id: string }) {
  const s = useStore();
  const t = s.get("csTopics", id);
  const [lesson, setLesson] = useState("");
  const [res, setRes] = useState({ title: "", url: "" });
  const today = todayISO();
  if (!t)
    return (
      <Page title="Topic" showBack>
        <Empty title="Topic not found" />
      </Page>
    );
  const upd = (patch: Partial<CsTopic>) => s.update("csTopics", id, patch);
  const exercises = s.all("exercises").filter((e) => e.topicId === id);
  const done = t.lessons.filter((l) => l.done).length;
  const markReviewed = () => {
    const last = t.lastReviewed ? Math.max(1, diffDays(t.lastReviewed, t.nextReview ?? today)) : 1;
    const next = addDays(today, Math.min(60, Math.max(3, last * 2)));
    upd({ lastReviewed: today, nextReview: next });
    toast(`Reviewed. Next review ${prettyDay(next)}.`);
  };
  return (
    <Page title={t.name} eyebrow={`${done}/${t.lessons.length} lessons · ${t.difficulty}`} showBack>
      <Card>
        <Bar value={t.lessons.length ? done / t.lessons.length : 0} />
        <div className="grid-2 mt">
          <Field label="Difficulty">
            <select value={t.difficulty} onChange={(e) => upd({ difficulty: e.target.value as CsTopic["difficulty"] })}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </Field>
          <Field label="Next review">
            <input type="date" value={t.nextReview ?? ""} onChange={(e) => upd({ nextReview: e.target.value || null })} />
          </Field>
        </div>
        <button className="btn block" onClick={markReviewed}>
          Mark reviewed today
        </button>
        {t.lastReviewed && <small className="faint">Last reviewed {prettyDay(t.lastReviewed)}</small>}
      </Card>

      <Section title="Lessons">
        <Card className="tight">
          <div className="list">
            {t.lessons.map((l) => (
              <label key={l.id} className={`list-item ${l.done ? "task-done" : ""}`}>
                <input
                  type="checkbox"
                  checked={l.done}
                  onChange={(e) => {
                    upd({ lessons: t.lessons.map((x) => (x.id === l.id ? { ...x, done: e.target.checked, doneAt: e.target.checked ? new Date().toISOString() : null } : x)) });
                    const fresh = evaluateAchievements(store());
                    fresh.forEach((a) => toast(`🏅 Achievement unlocked: ${a.title}`, "xp"));
                  }}
                />
                <div className="grow title">{l.title}</div>
                <button className="icon-btn" aria-label="Remove lesson" onClick={(e) => { e.preventDefault(); upd({ lessons: t.lessons.filter((x) => x.id !== l.id) }); }}>
                  <Trash2 size={15} />
                </button>
              </label>
            ))}
          </div>
          <div className="row mt">
            <input className="grow" placeholder="Add a lesson" value={lesson} onChange={(e) => setLesson(e.target.value)} onKeyDown={(e) => e.key === "Enter" && lesson.trim() && (upd({ lessons: [...t.lessons, { id: uid(), title: lesson.trim(), done: false, doneAt: null }] }), setLesson(""))} />
            <button className="btn" aria-label="Add lesson" onClick={() => { if (lesson.trim()) { upd({ lessons: [...t.lessons, { id: uid(), title: lesson.trim(), done: false, doneAt: null }] }); setLesson(""); } }}>
              <Plus size={18} />
            </button>
          </div>
        </Card>
      </Section>

      <Section title="Resources">
        <Card className="tight">
          <div className="list">
            {t.resources.map((r) => (
              <div key={r.id} className="list-item">
                <div className="grow clickable" onClick={() => openExternal(r.url)}>
                  <div className="title">{r.title}</div>
                  <div className="sub ellipsis">{r.url}</div>
                </div>
                <button className="icon-btn" aria-label="Open" onClick={() => openExternal(r.url)}>
                  <ExternalLink size={16} />
                </button>
                <button className="icon-btn" aria-label="Remove resource" onClick={() => upd({ resources: t.resources.filter((x) => x.id !== r.id) })}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid-2 mt">
            <input placeholder="Title" value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} />
            <input placeholder="https://…" inputMode="url" value={res.url} onChange={(e) => setRes({ ...res, url: e.target.value })} />
          </div>
          <button
            className="btn block mt"
            onClick={() => {
              if (!res.title.trim() || !/^https?:\/\//i.test(res.url.trim())) return toast("Enter a title and a link starting with http(s)://", "error");
              upd({ resources: [...t.resources, { id: uid(), title: res.title.trim(), url: res.url.trim() }] });
              setRes({ title: "", url: "" });
            }}
          >
            <Plus size={16} /> Add resource
          </button>
        </Card>
      </Section>

      <Section title={`Exercises (${exercises.filter((e) => e.status === "solved").length}/${exercises.length} solved)`} action={<button className="btn ghost small" onClick={() => go("/cs/exercises")}>All</button>}>
        <Card className="tight">
          {exercises.length ? exercises.slice(0, 8).map((e) => <ExerciseRow key={e.id} ex={e} />) : <Empty title="No exercises linked" text="Link exercises to this topic when you log them." />}
        </Card>
      </Section>

      <Section title="Notes">
        <Card>
          <textarea key={t.id} defaultValue={t.notes} placeholder="Key ideas, mistakes to avoid…" style={{ minHeight: 140 }} onBlur={(e) => e.target.value !== t.notes && upd({ notes: e.target.value })} />
        </Card>
      </Section>
      <button
        className="btn danger block mt-l"
        onClick={async () => {
          if (await confirmDialog({ title: `Delete ${t.name}?`, body: "Lessons, resources and notes of this topic are deleted. Exercises are kept.", confirm: "Delete", danger: true })) {
            s.transact(() => {
              for (const e of exercises) s.put("exercises", { ...e, topicId: null });
              s.remove("csTopics", id);
            });
            go("/cs", { replace: true });
          }
        }}
      >
        Delete topic
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
        <div className="sub">{[ex.platform, ex.language, ex.difficulty, ex.minutes ? `${ex.minutes} min` : ""].filter(Boolean).join(" · ")}</div>
      </div>
      <span className={`tag ${ex.status === "solved" ? "success" : ex.status === "attempted" ? "warning" : ""}`}>{ex.status}</span>
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
        <Stat label="Solved" value={all.filter((e) => e.status === "solved").length} />
        <Stat label="This week" value={solvedExercises(s, weekStart(today), today).length} sub={`goal ${s.settings.weeklyGoals.codingExercises}`} />
        <Stat label="Time" value={`${Math.round(all.reduce((a, e) => a + e.minutes, 0) / 60)}h`} />
      </div>
      <Card className="mt">
        <div className="small faint">Solved per week</div>
        <BarChart data={weeks} goal={s.settings.weeklyGoals.codingExercises} />
      </Card>
      <div className="mt">
        <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "solved", label: "Solved" }, { value: "attempted", label: "Attempted" }, { value: "todo", label: "To do" }]} />
      </div>
      <Card className="tight mt">
        {list.length ? <div className="list">{list.map((e) => <ExerciseRow key={e.id} ex={e} onOpen={setEditing} />)}</div> : <Empty icon={<Code2 />} title="No exercises logged" text={`Each solved exercise earns +${s.settings.xp.programmingExercise} XP.`} />}
      </Card>
      <button className="fab" aria-label="Log exercise" onClick={() => setEditing("new")}>
        <Plus size={26} />
      </button>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Log exercise" : "Exercise"}>
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
    if (!e.title.trim()) return toast("Give the exercise a title.", "error");
    if (e.minutes < 0 || e.minutes > 1440) return toast("Time spent must be 0–1440 minutes.", "error");
    const r = saveExercise(store(), { ...e, title: e.title.trim() });
    xpToast(r);
    onDone();
  };
  return (
    <>
      <Field label="Exercise title">
        <input value={e.title} autoFocus={!ex} onChange={(x) => set("title", x.target.value)} placeholder="e.g. Two Sum" />
      </Field>
      <div className="grid-2">
        <Field label="Platform">
          <input value={e.platform} list="platforms" onChange={(x) => set("platform", x.target.value)} />
          <datalist id="platforms">
            {["LeetCode", "HackerRank", "Codeforces", "Exercism", "Codewars", "Project Euler", "University"].map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="Language">
          <input value={e.language} onChange={(x) => set("language", x.target.value)} />
        </Field>
        <Field label="Difficulty">
          <select value={e.difficulty} onChange={(x) => set("difficulty", x.target.value as CodingExercise["difficulty"])}>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </Field>
        <Field label="Time spent (min)">
          <NumberInput value={e.minutes} min={0} max={1440} onChange={(v) => set("minutes", v ?? 0)} />
        </Field>
        <Field label="Status">
          <select value={e.status} onChange={(x) => set("status", x.target.value as CodingExercise["status"])}>
            <option value="solved">Solved</option>
            <option value="attempted">Attempted</option>
            <option value="todo">To do</option>
          </select>
        </Field>
        <Field label="Topic">
          <select value={e.topicId ?? ""} onChange={(x) => set("topicId", x.target.value || null)}>
            <option value="">None</option>
            {[...s.all("csTopics")].sort((a, b) => a.order - b.order).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Solution notes">
        <textarea value={e.notes} onChange={(x) => set("notes", x.target.value)} placeholder="Approach, complexity, what you learned…" />
      </Field>
      <div className="row">
        {ex && (
          <button
            className="btn danger"
            aria-label="Delete exercise"
            onClick={async () => {
              if (await confirmDialog({ title: "Delete this exercise?", body: ex.status === "solved" ? "Its XP will be removed." : undefined, confirm: "Delete", danger: true })) {
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
          Save{e.status === "solved" && ex?.status !== "solved" ? ` · +${s.settings.xp.programmingExercise} XP` : ""}
        </button>
      </div>
    </>
  );
}

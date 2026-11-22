import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TaskRow, TaskSheet } from "../components/tasks";
import { Bar, Card, confirmDialog, COURSE_COLORS, Empty, Field, NumberInput, Page, Section, Segmented, Sheet, Stat, toast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { DEFAULT_GRADING_SCALE } from "../db/seed";
import { addDays, diffDays, formatDuration, pad, prettyDay, relativeDay, todayISO, weekday } from "../lib/date";
import { bandForPoints, courseGrade, formatGpa, gpaSummary, requiredAverageForTarget, sortedScale } from "../lib/gpa";
import { isOpen } from "../lib/planner";
import { studyMinutesBetween, weekRange } from "../lib/stats";
import type { Course, Task } from "../lib/types";
import { go, useRoute } from "../router";

export default function University() {
  const { parts } = useRoute();
  const tab = (parts[1] as "gpa" | "calendar" | undefined) ?? "courses";
  return (
    <Page title="University" eyebrow="Academics">
      <Segmented
        value={tab}
        onChange={(v) => go(v === "courses" ? "/uni" : `/uni/${v}`, { replace: true })}
        options={[
          { value: "courses", label: "Courses" },
          { value: "gpa", label: "GPA" },
          { value: "calendar", label: "Calendar" },
        ]}
      />
      {tab === "courses" && <Courses />}
      {tab === "gpa" && <Gpa />}
      {tab === "calendar" && <AcademicCalendar />}
    </Page>
  );
}

export function blankCourse(): Course {
  return { id: uid(), name: "", code: "", credits: 3, teacher: "", semester: "", color: COURSE_COLORS[0], notes: "", exams: [], status: "in_progress", finalGradePoints: null, targetPercent: null, createdAt: new Date().toISOString() };
}

function Courses() {
  const s = useStore();
  const courses = [...s.all("courses")].sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || a.name.localeCompare(b.name));
  const [adding, setAdding] = useState(false);
  const today = todayISO();
  const scale = s.settings.gradingScale;
  const semesters = [...new Set(courses.map((c) => c.semester || "Unassigned"))];
  return (
    <>
      {courses.length === 0 ? (
        <Card className="mt">
          <Empty icon={<BookOpen />} title="No courses yet" text="Add this semester's courses to track grades, deadlines and exams." action={<button className="btn primary small" onClick={() => setAdding(true)}><Plus size={16} /> Add course</button>} />
        </Card>
      ) : (
        semesters.map((sem) => (
          <Section key={sem} title={sem}>
            <div className="col">
              {courses
                .filter((c) => (c.semester || "Unassigned") === sem)
                .map((c) => {
                  const g = courseGrade(c, s.all("assessments"), scale);
                  const open = s.all("tasks").filter((t) => t.courseId === c.id && isOpen(t)).length;
                  const nextExam = c.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
                  return (
                    <Card key={c.id} className="tight" onClick={() => go(`/uni/course/${c.id}`)}>
                      <div className="row">
                        <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: c.color }} />
                        <div className="grow">
                          <div className="row between">
                            <b className="ellipsis">{c.name}</b>
                            {g.band ? <span className="tag accent">{g.band.label} · {g.points?.toFixed(2)}</span> : <span className="tag">No grade</span>}
                          </div>
                          <div className="small muted">
                            {[c.code, `${c.credits} cr`, c.teacher].filter(Boolean).join(" · ")}
                            {c.status === "completed" ? " · Completed" : ""}
                          </div>
                          <div className="small faint mt" style={{ marginTop: 4 }}>
                            {open} open task{open === 1 ? "" : "s"}
                            {nextExam ? ` · ${nextExam.title} ${relativeDay(nextExam.date, today).toLowerCase()}` : ""}
                            {g.percent !== null ? ` · ${g.percent.toFixed(1)}% so far` : ""}
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })}
            </div>
          </Section>
        ))
      )}
      <button className="fab" aria-label="Add course" onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>
      <CourseSheet open={adding} onClose={() => setAdding(false)} course={null} />
    </>
  );
}

export function CourseSheet({ open, onClose, course }: { open: boolean; onClose: () => void; course: Course | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={course ? "Edit course" : "New course"}>
      {open && <CourseForm course={course} onDone={onClose} />}
    </Sheet>
  );
}

function CourseForm({ course, onDone }: { course: Course | null; onDone: () => void }) {
  const s = useStore();
  const [c, setC] = useState<Course>(course ?? blankCourse());
  const [err, setErr] = useState("");
  const set = <K extends keyof Course>(k: K, v: Course[K]) => setC((x) => ({ ...x, [k]: v }));
  const scale = sortedScale(s.settings.gradingScale);
  const save = () => {
    if (!c.name.trim()) return setErr("Course name is required.");
    if (!(c.credits >= 0 && c.credits <= 60)) return setErr("Credits must be between 0 and 60.");
    if (c.finalGradePoints !== null && (c.finalGradePoints < 0 || c.finalGradePoints > s.settings.gpaMax)) return setErr(`Final grade points must be 0–${s.settings.gpaMax}.`);
    store().put("courses", { ...c, name: c.name.trim(), code: c.code.trim() });
    toast(course ? "Course updated" : "Course added");
    onDone();
  };
  const known = [...new Set(s.all("courses").map((x) => x.semester).filter(Boolean))];
  return (
    <>
      {err && <div className="error-text">{err}</div>}
      <Field label="Course name">
        <input value={c.name} autoFocus={!course} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Linear Algebra" />
      </Field>
      <div className="grid-2">
        <Field label="Code">
          <input value={c.code} onChange={(e) => set("code", e.target.value)} placeholder="MATH201" />
        </Field>
        <Field label="Credits">
          <NumberInput value={c.credits} min={0} max={60} step={0.5} onChange={(v) => set("credits", v ?? 0)} />
        </Field>
        <Field label="Teacher">
          <input value={c.teacher} onChange={(e) => set("teacher", e.target.value)} />
        </Field>
        <Field label="Semester">
          <input value={c.semester} list="semesters" onChange={(e) => set("semester", e.target.value)} placeholder="e.g. 2026 Fall" />
          <datalist id="semesters">
            {known.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label="Status">
          <select value={c.status} onChange={(e) => set("status", e.target.value as Course["status"])}>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
        <Field label="Final grade" hint="Leave empty to calculate from assessments">
          <select value={c.finalGradePoints === null ? "" : String(c.finalGradePoints)} onChange={(e) => set("finalGradePoints", e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">From assessments</option>
            {scale.map((b) => (
              <option key={b.label} value={b.points}>
                {b.label} ({b.points})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Target course grade (%)">
        <NumberInput value={c.targetPercent} min={0} max={100} onChange={(v) => set("targetPercent", v)} />
      </Field>
      <div className="field">
        <span>Color</span>
        <div className="row wrap">
          {COURSE_COLORS.map((col) => (
            <button key={col} className={`color-swatch ${c.color === col ? "on" : ""}`} style={{ background: col }} aria-label={`Color ${col}`} onClick={() => set("color", col)} />
          ))}
        </div>
      </div>
      <button className="btn primary block mt" onClick={save}>
        {course ? "Save" : "Add course"}
      </button>
    </>
  );
}

// ------------------------------------------------------------------ course detail
export function CourseDetail({ id }: { id: string }) {
  const s = useStore();
  const course = s.get("courses", id);
  const [editing, setEditing] = useState(false);
  const [taskOpen, setTaskOpen] = useState<Task | null | "new">(null);
  const [assess, setAssess] = useState({ name: "", weight: null as number | null, score: null as number | null, max: 100 as number | null });
  const [exam, setExam] = useState({ title: "Final exam", date: "" });
  const [sess, setSess] = useState({ type: "lecture" as "lecture" | "revision", topic: "", minutes: 90 as number | null, date: todayISO() });
  const today = todayISO();
  if (!course)
    return (
      <Page title="Course" showBack>
        <Empty title="Course not found" text="It may have been deleted." />
      </Page>
    );
  const assessments = s.all("assessments").filter((a) => a.courseId === id);
  const g = courseGrade(course, s.all("assessments"), s.settings.gradingScale);
  const weightSum = assessments.reduce((a, x) => a + x.weight, 0);
  const tasks = s.all("tasks").filter((t) => t.courseId === id).sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.deadline ?? "9").localeCompare(b.deadline ?? "9"));
  const sessions = s.all("studySessions").filter((x) => x.courseId === id).sort((a, b) => b.date.localeCompare(a.date));
  const lectureMin = sessions.filter((x) => x.type === "lecture" && x.done).reduce((a, x) => a + x.minutes, 0);
  const revisionMin = sessions.filter((x) => x.type === "revision" && x.done).reduce((a, x) => a + x.minutes, 0);
  const need = course.targetPercent !== null ? requiredPercentForCourse(assessments, course.targetPercent) : null;

  const addAssessment = () => {
    if (!assess.name.trim() || assess.weight === null || assess.weight <= 0 || assess.weight > 100) return toast("Name and a weight between 1 and 100 % are required.", "error");
    if (assess.score !== null && (assess.max === null || assess.max <= 0 || assess.score < 0 || assess.score > assess.max * 1.5)) return toast("Score must be between 0 and the max score.", "error");
    s.put("assessments", { id: uid(), courseId: id, name: assess.name.trim(), weight: assess.weight, score: assess.score, maxScore: assess.max ?? 100, date: today });
    setAssess({ name: "", weight: null, score: null, max: 100 });
  };
  const addExam = () => {
    if (!exam.title.trim() || !exam.date) return toast("Exam title and date are required.", "error");
    s.update("courses", id, { exams: [...course.exams, { id: uid(), title: exam.title.trim(), date: exam.date }].sort((a, b) => a.date.localeCompare(b.date)) });
    setExam({ title: "Final exam", date: "" });
  };
  const addSession = () => {
    if (!sess.minutes || sess.minutes <= 0) return toast("Enter the duration in minutes.", "error");
    s.put("studySessions", { id: uid(), courseId: id, type: sess.type, date: sess.date || today, topic: sess.topic.trim(), minutes: sess.minutes, done: sess.date <= today });
    setSess({ ...sess, topic: "" });
  };
  const planRevision = async () => {
    const next = course.exams.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return toast("Add an upcoming exam first.", "error");
    const offsets = [14, 7, 3, 1].filter((o) => addDays(next.date, -o) >= today);
    if (!offsets.length) return toast("The exam is too close for a spaced plan. Schedule revision manually.");
    const ok = await confirmDialog({ title: "Create a revision schedule?", body: `${offsets.length} revision tasks (spaced ${offsets.join(", ")} days before ${next.title} on ${prettyDay(next.date)}).`, confirm: "Create" });
    if (!ok) return;
    s.transact(() => {
      offsets.forEach((o, i) => {
        const d = addDays(next.date, -o);
        s.put("tasks", { id: uid(), title: `Revise ${course.code || course.name} (${i + 1}/${offsets.length})`, description: `Spaced revision before ${next.title}`, category: "University", priority: o <= 3 ? "high" : "medium", kind: "revision", deadline: d, scheduledDate: d, estimatedMin: 60, status: "todo", courseId: id, project: "", recurrence: "none", xp: 0, createdAt: new Date().toISOString(), completedAt: null, recurrenceParentId: null });
      });
    });
    toast("Revision tasks added to your planner");
  };
  const del = async () => {
    if (!(await confirmDialog({ title: `Delete ${course.name}?`, body: "Assessments, lectures and revision logs for this course are deleted. Linked tasks are kept but unlinked.", confirm: "Delete", danger: true }))) return;
    s.transact(() => {
      for (const a of assessments) s.remove("assessments", a.id);
      for (const x of sessions) s.remove("studySessions", x.id);
      for (const t of tasks) s.put("tasks", { ...t, courseId: null });
      s.remove("courses", id);
    });
    go("/uni", { replace: true });
  };

  return (
    <Page title={course.name} eyebrow={[course.code, course.semester].filter(Boolean).join(" · ") || "Course"} showBack actions={<button className="btn small" onClick={() => setEditing(true)}>Edit</button>}>
      <Card>
        <div className="grid-3">
          <Stat label="Grade" value={g.band?.label ?? "—"} sub={g.points !== null ? `${g.points.toFixed(2)} pts` : "not graded"} />
          <Stat label="So far" value={g.percent !== null ? `${g.percent.toFixed(1)}%` : "—"} sub={`${g.gradedWeight}% of ${weightSum}% graded`} />
          <Stat label="Credits" value={course.credits} sub={course.status === "completed" ? "completed" : "in progress"} />
        </div>
        {course.targetPercent !== null && (
          <div className={`banner mt ${need === null ? "info" : need > 100 ? "danger" : need <= 0 ? "success" : "info"}`}>
            <div>
              Target {course.targetPercent}%:{" "}
              {need === null ? "add assessments with weights to calculate what you need." : need <= 0 ? "already secured with graded work." : need > 100 ? `needs ${need.toFixed(0)}% on the remaining work. Not reachable; consider adjusting the target.` : `you need an average of ${need.toFixed(1)}% on the remaining ${Math.max(100, weightSum) - g.gradedWeight}% of the grade.`}
            </div>
          </div>
        )}
        {weightSum > 0 && Math.abs(weightSum - 100) > 0.01 && <div className="banner mt">Assessment weights add up to {weightSum}%, not 100%.</div>}
      </Card>

      <Section title="Assessments & grades">
        <Card className="tight">
          <div className="list">
            {assessments.map((a) => (
              <div key={a.id} className="list-item">
                <div className="grow">
                  <div className="title">{a.name}</div>
                  <div className="sub">
                    Weight {a.weight}% · {a.score === null ? "not graded" : `${a.score}/${a.maxScore} (${((a.score / a.maxScore) * 100).toFixed(1)}%)`}
                  </div>
                </div>
                <div style={{ width: 80 }}>
                  <NumberInput value={a.score} min={0} placeholder="Score" onChange={(v) => s.update("assessments", a.id, { score: v })} />
                </div>
                <button className="icon-btn" aria-label="Delete assessment" onClick={() => s.remove("assessments", a.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid-2 mt">
            <input placeholder="Name (e.g. Midterm)" value={assess.name} onChange={(e) => setAssess({ ...assess, name: e.target.value })} />
            <NumberInput value={assess.weight} placeholder="Weight %" min={0} max={100} onChange={(v) => setAssess({ ...assess, weight: v })} />
            <NumberInput value={assess.score} placeholder="Score (optional)" min={0} onChange={(v) => setAssess({ ...assess, score: v })} />
            <NumberInput value={assess.max} placeholder="Max score" min={1} onChange={(v) => setAssess({ ...assess, max: v })} />
          </div>
          <button className="btn block mt" onClick={addAssessment}>
            <Plus size={16} /> Add assessment
          </button>
        </Card>
      </Section>

      <Section title="Exams" action={<button className="btn ghost small" onClick={planRevision}>Plan revision</button>}>
        <Card className="tight">
          <div className="list">
            {course.exams.map((e) => {
              const n = diffDays(today, e.date);
              return (
                <div key={e.id} className="list-item">
                  <div className="grow">
                    <div className="title">{e.title}</div>
                    <div className="sub">{prettyDay(e.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
                  </div>
                  <span className={`tag ${n < 0 ? "" : n <= 3 ? "danger" : n <= 10 ? "warning" : "accent"}`}>{n < 0 ? "Done" : n === 0 ? "Today" : `${n} days`}</span>
                  <button className="icon-btn" aria-label="Delete exam" onClick={() => s.update("courses", id, { exams: course.exams.filter((x) => x.id !== e.id) })}>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row mt">
            <input className="grow" value={exam.title} onChange={(e) => setExam({ ...exam, title: e.target.value })} />
            <input type="date" style={{ width: 160 }} value={exam.date} onChange={(e) => setExam({ ...exam, date: e.target.value })} />
          </div>
          <button className="btn block mt" onClick={addExam}>
            <Plus size={16} /> Add exam date
          </button>
        </Card>
      </Section>

      <Section title="Assignments & tasks" action={<button className="btn ghost small" onClick={() => setTaskOpen("new")}>Add</button>}>
        <Card className="tight">
          {tasks.length ? (
            <div className="list">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={setTaskOpen} />
              ))}
            </div>
          ) : (
            <Empty title="No assignments yet" />
          )}
        </Card>
      </Section>

      <Section title="Lectures & revision">
        <Card className="tight">
          <div className="row small muted" style={{ padding: "4px 2px 8px" }}>
            Lectures {formatDuration(lectureMin)} · Revision {formatDuration(revisionMin)}
          </div>
          <div className="list">
            {sessions.slice(0, 12).map((x) => (
              <label key={x.id} className="list-item">
                <input type="checkbox" checked={x.done} onChange={(e) => s.update("studySessions", x.id, { done: e.target.checked })} />
                <div className="grow">
                  <div className="title">
                    {x.type === "lecture" ? "Lecture" : "Revision"}
                    {x.topic ? ` · ${x.topic}` : ""}
                  </div>
                  <div className="sub">
                    {prettyDay(x.date)} · {formatDuration(x.minutes)}
                  </div>
                </div>
                <button className="icon-btn" aria-label="Delete" onClick={(e) => { e.preventDefault(); s.remove("studySessions", x.id); }}>
                  <Trash2 size={16} />
                </button>
              </label>
            ))}
          </div>
          <div className="grid-2 mt">
            <select value={sess.type} onChange={(e) => setSess({ ...sess, type: e.target.value as "lecture" | "revision" })}>
              <option value="lecture">Lecture attended</option>
              <option value="revision">Revision</option>
            </select>
            <input type="date" value={sess.date} onChange={(e) => setSess({ ...sess, date: e.target.value })} />
            <input placeholder="Topic" value={sess.topic} onChange={(e) => setSess({ ...sess, topic: e.target.value })} />
            <NumberInput value={sess.minutes} placeholder="Minutes" min={1} onChange={(v) => setSess({ ...sess, minutes: v })} />
          </div>
          <button className="btn block mt" onClick={addSession}>
            <Plus size={16} /> Log session
          </button>
        </Card>
      </Section>

      <Section title="Notes">
        <Card>
          <textarea defaultValue={course.notes} placeholder="Syllabus, office hours, exam topics…" onBlur={(e) => e.target.value !== course.notes && s.update("courses", id, { notes: e.target.value })} style={{ minHeight: 120 }} />
        </Card>
      </Section>

      <button className="btn danger block mt-l" onClick={del}>
        <Trash2 size={16} /> Delete course
      </button>
      <CourseSheet open={editing} onClose={() => setEditing(false)} course={course} />
      <TaskSheet open={taskOpen !== null} onClose={() => setTaskOpen(null)} task={taskOpen === "new" ? null : taskOpen} defaults={{ courseId: id, category: "University", kind: "assignment" }} />
    </Page>
  );
}

function requiredPercentForCourse(assessments: { weight: number; score: number | null; maxScore: number }[], target: number) {
  const total = assessments.reduce((a, x) => a + x.weight, 0);
  const graded = assessments.filter((x) => x.score !== null);
  const gw = graded.reduce((a, x) => a + x.weight, 0);
  const earned = graded.reduce((a, x) => a + x.weight * ((x.score ?? 0) / x.maxScore), 0);
  // Treat the course as out of 100% of weight (or the sum, if weights exceed 100).
  const denom = Math.max(100, total);
  const remaining = denom - gw;
  if (total === 0 || remaining <= 0) return null;
  return (((target / 100) * denom - earned) / remaining) * 100;
}

// ------------------------------------------------------------------ GPA
function Gpa() {
  const s = useStore();
  const settings = s.settings;
  const scale = sortedScale(settings.gradingScale);
  const courses = s.all("courses");
  const [sim, setSim] = useState<Record<string, number>>({});
  const [extraCredits, setExtraCredits] = useState<number | null>(0);
  const [rec, setRec] = useState({ term: "", gpa: null as number | null, credits: null as number | null });
  const summary = gpaSummary(courses, s.all("assessments"), s.all("semesterRecords"), scale);
  const simulated = Object.keys(sim).length ? gpaSummary(courses, s.all("assessments"), s.all("semesterRecords"), scale, sim) : null;
  const inProgress = courses.filter((c) => c.status === "in_progress" && c.credits > 0);
  const remainingCredits = inProgress.reduce((a, c) => a + c.credits, 0) + (extraCredits ?? 0);
  const required = settings.targetGpa !== null ? requiredAverageForTarget(settings.targetGpa, summary.completedQualityPoints, summary.cumulativeCredits, remainingCredits) : null;

  const addRecord = () => {
    if (!rec.term.trim() || rec.gpa === null || rec.gpa < 0 || rec.gpa > settings.gpaMax || !rec.credits || rec.credits <= 0) return toast(`Enter a term, GPA (0–${settings.gpaMax}) and credits > 0.`, "error");
    s.put("semesterRecords", { id: uid(), term: rec.term.trim(), gpa: rec.gpa, credits: rec.credits });
    setRec({ term: "", gpa: null, credits: null });
  };

  return (
    <>
      <Card className="accent mt">
        <div className="row between">
          <div>
            <div className="small muted">Cumulative GPA</div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em" }}>{formatGpa(summary.cumulative)}</div>
            <div className="small muted">
              {summary.cumulativeCredits} credits · scale 0–{settings.gpaMax}
            </div>
          </div>
          <GraduationCap size={44} opacity={0.6} />
        </div>
        {summary.projected !== null && summary.projected !== summary.cumulative && <div className="small mt">Including current courses at their present grade: {formatGpa(summary.projected)}</div>}
      </Card>
      <p className="faint small mt">Credit-weighted: Σ(grade points × credits) ÷ Σ credits. Completed courses and past-semester records count toward the cumulative GPA.</p>

      <Section title="By semester">
        <Card className="tight">
          {summary.bySemester.length ? (
            <div className="list">
              {summary.bySemester.map((b) => (
                <div key={b.semester} className="list-item">
                  <div className="grow">
                    <div className="title">{b.semester}</div>
                    <div className="sub">
                      {b.credits} graded credits{b.courses ? ` · ${b.courses} course(s)` : ""}
                    </div>
                  </div>
                  <b style={{ fontSize: 18 }}>{formatGpa(b.gpa)}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No grades yet" text="Add courses with grades, or past semester records below." />
          )}
        </Card>
      </Section>

      <Section title="Target GPA">
        <Card>
          <div className="grid-2">
            <Field label="Target cumulative GPA">
              <NumberInput value={settings.targetGpa} min={0} max={settings.gpaMax} step={0.01} onChange={(v) => s.saveSettings({ targetGpa: v })} />
            </Field>
            <Field label="Future credits beyond current courses">
              <NumberInput value={extraCredits} min={0} max={400} onChange={setExtraCredits} />
            </Field>
          </div>
          {settings.targetGpa === null ? (
            <small className="faint">Set a target to see what you need.</small>
          ) : required === null ? (
            <small className="faint">Add in-progress courses or future credits to calculate.</small>
          ) : (
            <div className={`banner ${required > settings.gpaMax ? "danger" : required <= 0 ? "success" : "info"}`}>
              {required > settings.gpaMax
                ? `You'd need ${required.toFixed(2)} average over ${remainingCredits} credits, above the ${settings.gpaMax} maximum. Add more credits or adjust the target.`
                : required <= 0
                  ? "Your target is already secured."
                  : `You need an average of ${required.toFixed(2)} (≈ ${bandForPoints(required, scale)?.label ?? "?"} or better) over the next ${remainingCredits} credits.`}
            </div>
          )}
        </Card>
      </Section>

      <Section title="What-if simulation" action={Object.keys(sim).length ? <button className="btn ghost small" onClick={() => setSim({})}>Reset</button> : undefined}>
        <Card className="tight">
          {inProgress.length === 0 ? (
            <Empty title="No in-progress courses" text="Simulations use courses that are still in progress." />
          ) : (
            <>
              <div className="list">
                {inProgress.map((c) => {
                  const g = courseGrade(c, s.all("assessments"), scale);
                  return (
                    <div key={c.id} className="list-item">
                      <span className="dot" style={{ background: c.color }} />
                      <div className="grow">
                        <div className="title ellipsis">{c.name}</div>
                        <div className="sub">
                          {c.credits} cr · now {g.band?.label ?? "—"}
                        </div>
                      </div>
                      <select style={{ width: 110 }} value={sim[c.id] ?? ""} onChange={(e) => setSim((x) => { const n = { ...x }; if (e.target.value === "") delete n[c.id]; else n[c.id] = Number(e.target.value); return n; })}>
                        <option value="">—</option>
                        {scale.map((b) => (
                          <option key={b.label} value={b.points}>
                            {b.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="row between mt" style={{ padding: "0 4px 6px" }}>
                <span className="muted">Simulated cumulative GPA</span>
                <b style={{ fontSize: 22 }}>{simulated ? formatGpa(simulated.cumulative) : "—"}</b>
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="Past semester records">
        <Card className="tight">
          <p className="small faint" style={{ padding: "4px 2px" }}>
            For terms you didn't enter course by course. Don't enter the same term both ways.
          </p>
          <div className="list">
            {s.all("semesterRecords").map((r) => (
              <div key={r.id} className="list-item">
                <div className="grow">
                  <div className="title">{r.term}</div>
                  <div className="sub">{r.credits} credits</div>
                </div>
                <b>{r.gpa.toFixed(2)}</b>
                <button className="icon-btn" aria-label="Delete record" onClick={() => s.remove("semesterRecords", r.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid-3 mt">
            <input placeholder="Term" value={rec.term} onChange={(e) => setRec({ ...rec, term: e.target.value })} />
            <NumberInput value={rec.gpa} placeholder="GPA" min={0} max={settings.gpaMax} step={0.01} onChange={(v) => setRec({ ...rec, gpa: v })} />
            <NumberInput value={rec.credits} placeholder="Credits" min={0} onChange={(v) => setRec({ ...rec, credits: v })} />
          </div>
          <button className="btn block mt" onClick={addRecord}>
            <Plus size={16} /> Add record
          </button>
        </Card>
      </Section>

      <GradingScaleEditor />
    </>
  );
}

function GradingScaleEditor() {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const scale = s.settings.gradingScale;
  const update = (i: number, patch: Partial<(typeof scale)[number]>) => s.saveSettings({ gradingScale: scale.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  return (
    <Section title="Grading scale" action={<button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? "Done" : "Edit"}</button>}>
      <Card className="tight">
        {!open ? (
          <div className="row wrap small" style={{ padding: 6 }}>
            {sortedScale(scale).map((b) => (
              <span key={b.label} className="tag">
                {b.label} ≥{b.minPercent}% → {b.points}
              </span>
            ))}
          </div>
        ) : (
          <>
            <Field label="Maximum GPA">
              <NumberInput value={s.settings.gpaMax} min={1} max={20} onChange={(v) => v && s.saveSettings({ gpaMax: v })} />
            </Field>
            {scale.map((b, i) => (
              <div key={i} className="row" style={{ marginBottom: 8 }}>
                <input value={b.label} onChange={(e) => update(i, { label: e.target.value })} style={{ width: 70 }} aria-label="Label" />
                <NumberInput value={b.minPercent} min={0} max={100} placeholder="Min %" onChange={(v) => update(i, { minPercent: v ?? 0 })} />
                <NumberInput value={b.points} min={0} max={20} step={0.1} placeholder="Points" onChange={(v) => update(i, { points: v ?? 0 })} />
                <button className="icon-btn" aria-label="Remove band" onClick={() => s.saveSettings({ gradingScale: scale.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="row">
              <button className="btn grow" onClick={() => s.saveSettings({ gradingScale: [...scale, { label: "New", minPercent: 0, points: 0 }] })}>
                <Plus size={16} /> Band
              </button>
              <button className="btn grow" onClick={async () => (await confirmDialog({ title: "Reset to default 4.0 scale?" })) && s.saveSettings({ gradingScale: DEFAULT_GRADING_SCALE.map((b) => ({ ...b })), gpaMax: 4 })}>
                Reset
              </button>
            </div>
          </>
        )}
      </Card>
    </Section>
  );
}

// ------------------------------------------------------------------ calendar
function AcademicCalendar() {
  const s = useStore();
  const today = todayISO();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sel, setSel] = useState(today);
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (weekday(first) + 6) % 7; // Monday first
  const courses = s.all("courses");
  const items = (d: string) => [
    ...s.all("tasks").filter((t) => t.deadline === d).map((t) => ({ id: t.id, title: t.title, kind: t.kind === "assignment" ? "Assignment due" : "Due", color: courses.find((c) => c.id === t.courseId)?.color ?? "var(--accent)", task: t })),
    ...s.all("tasks").filter((t) => t.scheduledDate === d && t.deadline !== d).map((t) => ({ id: t.id + "s", title: t.title, kind: "Planned", color: "var(--text-3)", task: t })),
    ...courses.flatMap((c) => c.exams.filter((e) => e.date === d).map((e) => ({ id: e.id, title: `${e.title} · ${c.code || c.name}`, kind: "Exam", color: "var(--danger)", task: null as Task | null }))),
  ];
  const shift = (n: number) => {
    const nm = ((m - 1 + n + 12) % 12) + 1;
    const ny = y + Math.floor((m - 1 + n) / 12);
    setMonth(`${ny}-${pad(nm)}`);
  };
  const { from, to } = weekRange(today);
  const study = studyMinutesBetween(s, from, to);
  const goal = s.settings.weeklyGoals.studyMin;
  const exams = courses.flatMap((c) => c.exams.filter((e) => e.date >= today).map((e) => ({ ...e, course: c }))).sort((a, b) => a.date.localeCompare(b.date));
  const [editing, setEditing] = useState<Task | null>(null);
  return (
    <>
      <Card className="mt">
        <div className="row between">
          <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft />
          </button>
          <b>{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</b>
          <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight />
          </button>
        </div>
        <div className="cal-grid mt small faint center">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i}>{d}</div>
          ))}
        </div>
        <div className="cal-grid mt">
          {Array.from({ length: lead }, (_, i) => (
            <div key={"l" + i} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = `${month}-${pad(i + 1)}`;
            const it = items(d);
            return (
              <button key={d} className={`cal-cell ${d === today ? "today" : ""}`} style={d === sel ? { background: "var(--accent-soft)" } : undefined} onClick={() => setSel(d)}>
                {i + 1}
                <div className="marks">
                  {it.slice(0, 3).map((x) => (
                    <i key={x.id} style={{ background: x.color }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      <Section title={prettyDay(sel, { weekday: "long", month: "long", day: "numeric" })}>
        <Card className="tight">
          {items(sel).length ? (
            <div className="list">
              {items(sel).map((x) => (
                <div key={x.id} className="list-item clickable" onClick={() => x.task && setEditing(x.task)}>
                  <span className="dot" style={{ background: x.color }} />
                  <div className="grow">
                    <div className="title">{x.title}</div>
                    <div className="sub">{x.kind}</div>
                  </div>
                  {x.task?.status === "done" && <span className="tag success">Done</span>}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<CalendarDays />} title="Nothing on this day" />
          )}
        </Card>
      </Section>
      <Section title="Weekly study goal">
        <Card>
          <div className="row between small">
            <span>
              {formatDuration(study)} of {formatDuration(goal)}
            </span>
            <span className="faint">focus + lectures + revision</span>
          </div>
          <div className="mt">
            <Bar value={goal ? study / goal : 0} tone={study >= goal ? "success" : undefined} />
          </div>
        </Card>
      </Section>
      <Section title="Exam countdown">
        <Card className="tight">
          {exams.length ? (
            <div className="list">
              {exams.map((e) => (
                <div key={e.id} className="list-item clickable" onClick={() => go(`/uni/course/${e.course.id}`)}>
                  <span className="dot" style={{ background: e.course.color }} />
                  <div className="grow">
                    <div className="title">{e.title}</div>
                    <div className="sub">
                      {e.course.name} · {prettyDay(e.date)}
                    </div>
                  </div>
                  <b>{diffDays(today, e.date)}d</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No upcoming exams" text="Add exam dates inside each course." />
          )}
        </Card>
      </Section>
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </>
  );
}

import { BookOpen, CalendarDays, ChevronLeft, ChevronRight, GraduationCap, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { TaskRow, TaskSheet } from "../components/tasks";
import { Bar, Card, confirmDialog, COURSE_COLORS, Empty, Field, NumberInput, Page, Section, Segmented, Sheet, Stat, toast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { DEFAULT_GRADING_SCALE } from "../db/seed";
import { intlLocale, t } from "../i18n";
import { addDays, diffDays, formatDuration, pad, prettyDay, relativeDay, todayISO, weekday, weekdayShort } from "../lib/date";
import { bandForPoints, courseGrade, formatGpa, gpaSummary, requiredAverageForTarget, sortedScale } from "../lib/gpa";
import { isOpen } from "../lib/planner";
import { studyMinutesBetween, weekRange } from "../lib/stats";
import type { Course, Task } from "../lib/types";
import { go, useRoute } from "../router";

export default function University() {
  const { parts } = useRoute();
  const tab = (parts[1] as "gpa" | "calendar" | undefined) ?? "courses";
  return (
    <Page title={t("uni.title")} eyebrow={t("uni.eyebrow")}>
      <Segmented
        value={tab}
        onChange={(v) => go(v === "courses" ? "/uni" : `/uni/${v}`, { replace: true })}
        options={[
          { value: "courses", label: t("uni.courses") },
          { value: "gpa", label: t("uni.gpa") },
          { value: "calendar", label: t("uni.calendar") },
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
  const semesters = [...new Set(courses.map((c) => c.semester || ""))];
  return (
    <>
      {courses.length === 0 ? (
        <Card className="mt">
          <Empty
            icon={<BookOpen />}
            title={t("uni.noCourses")}
            text={t("uni.noCoursesHint")}
            action={
              <button className="btn primary small" onClick={() => setAdding(true)}>
                <Plus size={16} /> {t("uni.addCourse")}
              </button>
            }
          />
        </Card>
      ) : (
        semesters.map((sem) => (
          <Section key={sem} title={sem || t("uni.unassigned")}>
            <div className="col">
              {courses
                .filter((c) => (c.semester || "") === sem)
                .map((c) => {
                  const g = courseGrade(c, s.all("assessments"), scale);
                  const open = s.all("tasks").filter((x) => x.courseId === c.id && isOpen(x)).length;
                  const nextExam = c.exams.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
                  return (
                    <Card key={c.id} className="tight" onClick={() => go(`/uni/course/${c.id}`)}>
                      <div className="row">
                        <div style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: c.color }} />
                        <div className="grow">
                          <div className="row between">
                            <b className="ellipsis">{c.name}</b>
                            {g.band ? (
                              <span className="tag accent">
                                {g.band.label} · {g.points?.toFixed(2)}
                              </span>
                            ) : (
                              <span className="tag">{t("uni.noGrade")}</span>
                            )}
                          </div>
                          <div className="small muted">
                            {[c.code, t("uni.creditsShort", { n: c.credits }), c.teacher].filter(Boolean).join(" · ")}
                            {c.status === "completed" ? ` · ${t("uni.completed")}` : ""}
                          </div>
                          <div className="small faint" style={{ marginTop: 4 }}>
                            {t("uni.courseOpen", { n: open })}
                            {nextExam ? ` · ${nextExam.title} ${relativeDay(nextExam.date, today)}` : ""}
                            {g.percent !== null ? ` · ${t("uni.soFar", { p: g.percent.toFixed(1) })}` : ""}
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
      <button className="fab" aria-label={t("uni.addCourse")} onClick={() => setAdding(true)}>
        <Plus size={26} />
      </button>
      <CourseSheet open={adding} onClose={() => setAdding(false)} course={null} />
    </>
  );
}

export function CourseSheet({ open, onClose, course }: { open: boolean; onClose: () => void; course: Course | null }) {
  return (
    <Sheet open={open} onClose={onClose} title={course ? t("uni.editCourse") : t("uni.newCourse")}>
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
    if (!c.name.trim()) return setErr(t("uni.errName"));
    if (!(c.credits >= 0 && c.credits <= 60)) return setErr(t("uni.errCredits"));
    if (c.finalGradePoints !== null && (c.finalGradePoints < 0 || c.finalGradePoints > s.settings.gpaMax)) return setErr(t("uni.errFinal", { max: s.settings.gpaMax }));
    store().put("courses", { ...c, name: c.name.trim(), code: c.code.trim() });
    toast(course ? t("uni.updated") : t("uni.added"));
    onDone();
  };
  const known = [...new Set(s.all("courses").map((x) => x.semester).filter(Boolean))];
  return (
    <>
      {err && <div className="error-text">{err}</div>}
      <Field label={t("uni.courseName")}>
        <input value={c.name} autoFocus={!course} onChange={(e) => set("name", e.target.value)} placeholder={t("uni.courseNamePh")} />
      </Field>
      <div className="grid-2">
        <Field label={t("uni.code")}>
          <input value={c.code} onChange={(e) => set("code", e.target.value)} placeholder="MATH201" />
        </Field>
        <Field label={t("uni.credits")}>
          <NumberInput value={c.credits} min={0} max={60} step={0.5} onChange={(v) => set("credits", v ?? 0)} />
        </Field>
        <Field label={t("uni.teacher")}>
          <input value={c.teacher} onChange={(e) => set("teacher", e.target.value)} />
        </Field>
        <Field label={t("uni.semester")}>
          <input value={c.semester} list="semesters" onChange={(e) => set("semester", e.target.value)} placeholder={t("uni.semesterPh")} />
          <datalist id="semesters">
            {known.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label={t("uni.status")}>
          <select value={c.status} onChange={(e) => set("status", e.target.value as Course["status"])}>
            <option value="in_progress">{t("uni.inProgress")}</option>
            <option value="completed">{t("uni.completed")}</option>
          </select>
        </Field>
        <Field label={t("uni.finalGrade")} hint={t("uni.finalGradeHint")}>
          <select value={c.finalGradePoints === null ? "" : String(c.finalGradePoints)} onChange={(e) => set("finalGradePoints", e.target.value === "" ? null : Number(e.target.value))}>
            <option value="">{t("uni.fromAssessments")}</option>
            {scale.map((b) => (
              <option key={b.label} value={b.points}>
                {b.label} ({b.points})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t("uni.target")}>
        <NumberInput value={c.targetPercent} min={0} max={100} onChange={(v) => set("targetPercent", v)} />
      </Field>
      <div className="field">
        <span>{t("uni.color")}</span>
        <div className="row wrap">
          {COURSE_COLORS.map((col) => (
            <button key={col} className={`color-swatch ${c.color === col ? "on" : ""}`} style={{ background: col }} aria-label={t("uni.colorAria", { c: col })} onClick={() => set("color", col)} />
          ))}
        </div>
      </div>
      <button className="btn primary block mt" onClick={save}>
        {course ? t("common.save") : t("uni.addCourse")}
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
  const [exam, setExam] = useState({ title: t("uni.finalExam"), date: "" });
  const [sess, setSess] = useState({ type: "lecture" as "lecture" | "revision", topic: "", minutes: 90 as number | null, date: todayISO() });
  const today = todayISO();
  if (!course)
    return (
      <Page title={t("uni.course")} showBack>
        <Empty title={t("uni.notFound")} text={t("uni.notFoundHint")} />
      </Page>
    );
  const assessments = s.all("assessments").filter((a) => a.courseId === id);
  const g = courseGrade(course, s.all("assessments"), s.settings.gradingScale);
  const weightSum = assessments.reduce((a, x) => a + x.weight, 0);
  const tasks = s
    .all("tasks")
    .filter((x) => x.courseId === id)
    .sort((a, b) => Number(a.status === "done") - Number(b.status === "done") || (a.deadline ?? "9").localeCompare(b.deadline ?? "9"));
  const sessions = s
    .all("studySessions")
    .filter((x) => x.courseId === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const lectureMin = sessions.filter((x) => x.type === "lecture" && x.done).reduce((a, x) => a + x.minutes, 0);
  const revisionMin = sessions.filter((x) => x.type === "revision" && x.done).reduce((a, x) => a + x.minutes, 0);
  const need = course.targetPercent !== null ? requiredPercentForCourse(assessments, course.targetPercent) : null;

  const addAssessment = () => {
    if (!assess.name.trim() || assess.weight === null || assess.weight <= 0 || assess.weight > 100) return toast(t("uni.errAssess"), "error");
    if (assess.score !== null && (assess.max === null || assess.max <= 0 || assess.score < 0 || assess.score > assess.max * 1.5)) return toast(t("uni.errScore"), "error");
    s.put("assessments", { id: uid(), courseId: id, name: assess.name.trim(), weight: assess.weight, score: assess.score, maxScore: assess.max ?? 100, date: today });
    setAssess({ name: "", weight: null, score: null, max: 100 });
  };
  const addExam = () => {
    if (!exam.title.trim() || !exam.date) return toast(t("uni.errExam"), "error");
    s.update("courses", id, { exams: [...course.exams, { id: uid(), title: exam.title.trim(), date: exam.date }].sort((a, b) => a.date.localeCompare(b.date)) });
    setExam({ title: t("uni.finalExam"), date: "" });
  };
  const addSession = () => {
    if (!sess.minutes || sess.minutes <= 0) return toast(t("uni.errDuration"), "error");
    s.put("studySessions", { id: uid(), courseId: id, type: sess.type, date: sess.date || today, topic: sess.topic.trim(), minutes: sess.minutes, done: sess.date <= today });
    setSess({ ...sess, topic: "" });
  };
  const planRevision = async () => {
    const next = course.exams.filter((e) => e.date > today).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return toast(t("uni.addExamFirst"), "error");
    const offsets = [14, 7, 3, 1].filter((o) => addDays(next.date, -o) >= today);
    if (!offsets.length) return toast(t("uni.examTooClose"));
    const ok = await confirmDialog({ title: t("uni.revisionTitle"), body: t("uni.revisionBody", { n: offsets.length, offsets: offsets.join(", "), exam: next.title, date: prettyDay(next.date) }), confirm: t("uni.create") });
    if (!ok) return;
    s.transact(() => {
      offsets.forEach((o, i) => {
        const d = addDays(next.date, -o);
        s.put("tasks", {
          id: uid(),
          title: t("uni.reviseTask", { course: course.code || course.name, i: i + 1, n: offsets.length }),
          description: t("uni.reviseDesc", { exam: next.title }),
          category: "University",
          priority: o <= 3 ? "high" : "medium",
          kind: "revision",
          deadline: d,
          scheduledDate: d,
          estimatedMin: 60,
          status: "todo",
          courseId: id,
          project: "",
          recurrence: "none",
          xp: 0,
          createdAt: new Date().toISOString(),
          completedAt: null,
          recurrenceParentId: null,
        });
      });
    });
    toast(t("uni.revisionAdded"));
  };
  const del = async () => {
    if (!(await confirmDialog({ title: t("uni.deleteCourseTitle", { name: course.name }), body: t("uni.deleteCourseBody"), confirm: t("common.delete"), danger: true }))) return;
    s.transact(() => {
      for (const a of assessments) s.remove("assessments", a.id);
      for (const x of sessions) s.remove("studySessions", x.id);
      for (const x of tasks) s.put("tasks", { ...x, courseId: null });
      s.remove("courses", id);
    });
    go("/uni", { replace: true });
  };

  const targetText =
    course.targetPercent === null
      ? ""
      : need === null
        ? t("uni.targetNeedData", { t: course.targetPercent })
        : need <= 0
          ? t("uni.targetSecured", { t: course.targetPercent })
          : need > 100
            ? t("uni.targetImpossible", { t: course.targetPercent, n: need.toFixed(0) })
            : t("uni.targetNeed", { t: course.targetPercent, n: need.toFixed(1), r: Math.max(100, weightSum) - g.gradedWeight });

  return (
    <Page
      title={course.name}
      eyebrow={[course.code, course.semester].filter(Boolean).join(" · ") || t("uni.course")}
      showBack
      actions={
        <button className="btn small" onClick={() => setEditing(true)}>
          {t("common.edit")}
        </button>
      }
    >
      <Card>
        <div className="grid-3">
          <Stat label={t("uni.grade")} value={g.band?.label ?? "—"} sub={g.points !== null ? t("uni.pts", { n: g.points.toFixed(2) }) : t("uni.notGraded")} />
          <Stat label={t("uni.soFarLabel")} value={g.percent !== null ? `${g.percent.toFixed(1)}%` : "—"} sub={t("uni.gradedOf", { g: g.gradedWeight, t: weightSum })} />
          <Stat label={t("uni.statCredits")} value={course.credits} sub={course.status === "completed" ? t("uni.completed") : t("uni.inProgress")} />
        </div>
        {course.targetPercent !== null && (
          <div className={`banner mt ${need === null ? "info" : need > 100 ? "danger" : need <= 0 ? "success" : "info"}`}>
            <div>{targetText}</div>
          </div>
        )}
        {weightSum > 0 && Math.abs(weightSum - 100) > 0.01 && <div className="banner mt">{t("uni.weightsWarn", { n: weightSum })}</div>}
      </Card>

      <Section title={t("uni.assessments")}>
        <Card className="tight">
          <div className="list">
            {assessments.map((a) => (
              <div key={a.id} className="list-item">
                <div className="grow">
                  <div className="title">{a.name}</div>
                  <div className="sub">{t("uni.weightLine", { w: a.weight, score: a.score === null ? t("uni.notGraded") : `${a.score}/${a.maxScore} (${((a.score / a.maxScore) * 100).toFixed(1)}%)` })}</div>
                </div>
                <div style={{ width: 84 }}>
                  <NumberInput value={a.score} min={0} placeholder={t("uni.score")} onChange={(v) => s.update("assessments", a.id, { score: v })} />
                </div>
                <button className="icon-btn" aria-label={t("uni.deleteAssessment")} onClick={() => s.remove("assessments", a.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid-2 mt">
            <input placeholder={t("uni.assessNamePh")} value={assess.name} onChange={(e) => setAssess({ ...assess, name: e.target.value })} />
            <NumberInput value={assess.weight} placeholder={t("uni.weightPh")} min={0} max={100} onChange={(v) => setAssess({ ...assess, weight: v })} />
            <NumberInput value={assess.score} placeholder={t("uni.scorePh")} min={0} onChange={(v) => setAssess({ ...assess, score: v })} />
            <NumberInput value={assess.max} placeholder={t("uni.maxPh")} min={1} onChange={(v) => setAssess({ ...assess, max: v })} />
          </div>
          <button className="btn block mt" onClick={addAssessment}>
            <Plus size={16} /> {t("uni.addAssessment")}
          </button>
        </Card>
      </Section>

      <Section
        title={t("uni.exams")}
        action={
          <button className="btn ghost small" onClick={planRevision}>
            {t("uni.planRevision")}
          </button>
        }
      >
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
                  <span className={`tag ${n < 0 ? "" : n <= 3 ? "danger" : n <= 10 ? "warning" : "accent"}`}>{n < 0 ? t("uni.examDone") : n === 0 ? t("uni.examToday") : t("uni.inDays", { n })}</span>
                  <button className="icon-btn" aria-label={t("uni.deleteExam")} onClick={() => s.update("courses", id, { exams: course.exams.filter((x) => x.id !== e.id) })}>
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
            <Plus size={16} /> {t("uni.addExam")}
          </button>
        </Card>
      </Section>

      <Section
        title={t("uni.assignments")}
        action={
          <button className="btn ghost small" onClick={() => setTaskOpen("new")}>
            {t("common.add")}
          </button>
        }
      >
        <Card className="tight">
          {tasks.length ? (
            <div className="list">
              {tasks.map((x) => (
                <TaskRow key={x.id} task={x} onOpen={setTaskOpen} />
              ))}
            </div>
          ) : (
            <Empty title={t("uni.noAssignments")} />
          )}
        </Card>
      </Section>

      <Section title={t("uni.lectures")}>
        <Card className="tight">
          <div className="row small muted" style={{ padding: "4px 2px 8px" }}>
            {t("uni.lectureTotals", { l: formatDuration(lectureMin), r: formatDuration(revisionMin) })}
          </div>
          <div className="list">
            {sessions.slice(0, 12).map((x) => (
              <label key={x.id} className="list-item">
                <input type="checkbox" checked={x.done} onChange={(e) => s.update("studySessions", x.id, { done: e.target.checked })} />
                <div className="grow">
                  <div className="title">
                    {x.type === "lecture" ? t("uni.lecture") : t("uni.revision")}
                    {x.topic ? ` · ${x.topic}` : ""}
                  </div>
                  <div className="sub">
                    {prettyDay(x.date)} · {formatDuration(x.minutes)}
                  </div>
                </div>
                <button
                  className="icon-btn"
                  aria-label={t("common.delete")}
                  onClick={(e) => {
                    e.preventDefault();
                    s.remove("studySessions", x.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </label>
            ))}
          </div>
          <div className="grid-2 mt">
            <select value={sess.type} onChange={(e) => setSess({ ...sess, type: e.target.value as "lecture" | "revision" })}>
              <option value="lecture">{t("uni.lectureAttended")}</option>
              <option value="revision">{t("uni.revision")}</option>
            </select>
            <input type="date" value={sess.date} onChange={(e) => setSess({ ...sess, date: e.target.value })} />
            <input placeholder={t("uni.topic")} value={sess.topic} onChange={(e) => setSess({ ...sess, topic: e.target.value })} />
            <NumberInput value={sess.minutes} placeholder={t("common.minutes")} min={1} onChange={(v) => setSess({ ...sess, minutes: v })} />
          </div>
          <button className="btn block mt" onClick={addSession}>
            <Plus size={16} /> {t("uni.logSession")}
          </button>
        </Card>
      </Section>

      <Section title={t("common.notes")}>
        <Card>
          <textarea defaultValue={course.notes} placeholder={t("uni.notesPh")} onBlur={(e) => e.target.value !== course.notes && s.update("courses", id, { notes: e.target.value })} style={{ minHeight: 120 }} />
        </Card>
      </Section>

      <button className="btn danger block mt-l" onClick={del}>
        <Trash2 size={16} /> {t("uni.deleteCourse")}
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
    if (!rec.term.trim() || rec.gpa === null || rec.gpa < 0 || rec.gpa > settings.gpaMax || !rec.credits || rec.credits <= 0) return toast(t("gpa.errRecord", { max: settings.gpaMax }), "error");
    s.put("semesterRecords", { id: uid(), term: rec.term.trim(), gpa: rec.gpa, credits: rec.credits });
    setRec({ term: "", gpa: null, credits: null });
  };

  return (
    <>
      <Card className="accent mt">
        <div className="row between">
          <div>
            <div className="small muted">{t("gpa.cumulative")}</div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em" }}>{formatGpa(summary.cumulative)}</div>
            <div className="small muted">{t("gpa.creditsScale", { n: summary.cumulativeCredits, max: settings.gpaMax })}</div>
          </div>
          <GraduationCap size={44} opacity={0.6} />
        </div>
        {summary.projected !== null && summary.projected !== summary.cumulative && <div className="small mt">{t("gpa.projected", { g: formatGpa(summary.projected) })}</div>}
      </Card>
      <p className="faint small mt">{t("gpa.formula")}</p>

      <Section title={t("gpa.bySemester")}>
        <Card className="tight">
          {summary.bySemester.length ? (
            <div className="list">
              {summary.bySemester.map((b) => (
                <div key={b.semester} className="list-item">
                  <div className="grow">
                    <div className="title">{b.semester === "Unassigned" ? t("uni.unassigned") : b.semester}</div>
                    <div className="sub">
                      {t("gpa.semesterLine", { n: b.credits })}
                      {b.courses ? ` · ${t("gpa.semesterCourses", { n: b.courses })}` : ""}
                    </div>
                  </div>
                  <b style={{ fontSize: 18 }}>{formatGpa(b.gpa)}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty title={t("gpa.noGrades")} text={t("gpa.noGradesHint")} />
          )}
        </Card>
      </Section>

      <Section title={t("gpa.target")}>
        <Card>
          <div className="grid-2">
            <Field label={t("gpa.targetCumulative")}>
              <NumberInput value={settings.targetGpa} min={0} max={settings.gpaMax} step={0.01} onChange={(v) => s.saveSettings({ targetGpa: v })} />
            </Field>
            <Field label={t("gpa.futureCredits")}>
              <NumberInput value={extraCredits} min={0} max={400} onChange={setExtraCredits} />
            </Field>
          </div>
          {settings.targetGpa === null ? (
            <small className="faint">{t("gpa.setTarget")}</small>
          ) : required === null ? (
            <small className="faint">{t("gpa.needCredits")}</small>
          ) : (
            <div className={`banner ${required > settings.gpaMax ? "danger" : required <= 0 ? "success" : "info"}`}>
              {required > settings.gpaMax
                ? t("gpa.impossible", { need: required.toFixed(2), credits: remainingCredits, max: settings.gpaMax })
                : required <= 0
                  ? t("gpa.secured")
                  : t("gpa.need", { need: required.toFixed(2), band: bandForPoints(required, scale)?.label ?? "?", credits: remainingCredits })}
            </div>
          )}
        </Card>
      </Section>

      <Section
        title={t("gpa.whatIf")}
        action={
          Object.keys(sim).length ? (
            <button className="btn ghost small" onClick={() => setSim({})}>
              {t("common.reset")}
            </button>
          ) : undefined
        }
      >
        <Card className="tight">
          {inProgress.length === 0 ? (
            <Empty title={t("gpa.noInProgress")} text={t("gpa.noInProgressHint")} />
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
                        <div className="sub">{t("gpa.now", { c: c.credits, band: g.band?.label ?? "—" })}</div>
                      </div>
                      <select
                        style={{ width: 110 }}
                        value={sim[c.id] ?? ""}
                        onChange={(e) =>
                          setSim((x) => {
                            const n = { ...x };
                            if (e.target.value === "") delete n[c.id];
                            else n[c.id] = Number(e.target.value);
                            return n;
                          })
                        }
                      >
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
                <span className="muted">{t("gpa.simulated")}</span>
                <b style={{ fontSize: 22 }}>{simulated ? formatGpa(simulated.cumulative) : "—"}</b>
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title={t("gpa.records")}>
        <Card className="tight">
          <p className="small faint" style={{ padding: "4px 2px" }}>
            {t("gpa.recordsHint")}
          </p>
          <div className="list">
            {s.all("semesterRecords").map((r) => (
              <div key={r.id} className="list-item">
                <div className="grow">
                  <div className="title">{r.term}</div>
                  <div className="sub">{t("dash.credits", { n: r.credits })}</div>
                </div>
                <b>{r.gpa.toFixed(2)}</b>
                <button className="icon-btn" aria-label={t("gpa.deleteRecord")} onClick={() => s.remove("semesterRecords", r.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="grid-3 mt">
            <input placeholder={t("gpa.term")} value={rec.term} onChange={(e) => setRec({ ...rec, term: e.target.value })} />
            <NumberInput value={rec.gpa} placeholder={t("gpa.gpaPh")} min={0} max={settings.gpaMax} step={0.01} onChange={(v) => setRec({ ...rec, gpa: v })} />
            <NumberInput value={rec.credits} placeholder={t("uni.credits")} min={0} onChange={(v) => setRec({ ...rec, credits: v })} />
          </div>
          <button className="btn block mt" onClick={addRecord}>
            <Plus size={16} /> {t("gpa.addRecord")}
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
    <Section
      title={t("gpa.scale")}
      action={
        <button className="btn ghost small" onClick={() => setOpen(!open)}>
          {open ? t("common.done") : t("common.edit")}
        </button>
      }
    >
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
            <Field label={t("gpa.maxGpa")}>
              <NumberInput value={s.settings.gpaMax} min={1} max={20} onChange={(v) => v && s.saveSettings({ gpaMax: v })} />
            </Field>
            {scale.map((b, i) => (
              <div key={i} className="row" style={{ marginBottom: 8 }}>
                <input value={b.label} onChange={(e) => update(i, { label: e.target.value })} style={{ width: 70 }} aria-label={t("gpa.label")} />
                <NumberInput value={b.minPercent} min={0} max={100} placeholder={t("gpa.minPct")} onChange={(v) => update(i, { minPercent: v ?? 0 })} />
                <NumberInput value={b.points} min={0} max={20} step={0.1} placeholder={t("gpa.points")} onChange={(v) => update(i, { points: v ?? 0 })} />
                <button className="icon-btn" aria-label={t("gpa.removeBand")} onClick={() => s.saveSettings({ gradingScale: scale.filter((_, j) => j !== i) })}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="row">
              <button className="btn grow" onClick={() => s.saveSettings({ gradingScale: [...scale, { label: "?", minPercent: 0, points: 0 }] })}>
                <Plus size={16} /> {t("gpa.band")}
              </button>
              <button className="btn grow" onClick={async () => (await confirmDialog({ title: t("gpa.resetScale") })) && s.saveSettings({ gradingScale: DEFAULT_GRADING_SCALE.map((b) => ({ ...b })), gpaMax: 4 })}>
                {t("common.reset")}
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
  const [editing, setEditing] = useState<Task | null>(null);
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (weekday(first) + 6) % 7; // Monday first
  const courses = s.all("courses");
  const items = (d: string) => [
    ...s
      .all("tasks")
      .filter((x) => x.deadline === d)
      .map((x) => ({ id: x.id, title: x.title, kind: x.kind === "assignment" ? t("cal.assignmentDue") : t("cal.due"), color: courses.find((c) => c.id === x.courseId)?.color ?? "var(--accent)", task: x })),
    ...s
      .all("tasks")
      .filter((x) => x.scheduledDate === d && x.deadline !== d)
      .map((x) => ({ id: x.id + "s", title: x.title, kind: t("cal.planned"), color: "var(--text-3)", task: x })),
    ...courses.flatMap((c) => c.exams.filter((e) => e.date === d).map((e) => ({ id: e.id, title: `${e.title} · ${c.code || c.name}`, kind: t("cal.exam"), color: "var(--danger)", task: null as Task | null }))),
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
  return (
    <>
      <Card className="mt">
        <div className="row between">
          <button className="icon-btn" aria-label={t("cal.prev")} onClick={() => shift(-1)}>
            <ChevronLeft className="flip-rtl" />
          </button>
          <b>{new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(intlLocale(), { month: "long", year: "numeric", timeZone: "UTC" })}</b>
          <button className="icon-btn" aria-label={t("cal.next")} onClick={() => shift(1)}>
            <ChevronRight className="flip-rtl" />
          </button>
        </div>
        <div className="cal-grid mt small faint center">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <div key={d}>{weekdayShort(d)}</div>
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
                  {x.task?.status === "done" && <span className="tag success">{t("status.done")}</span>}
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={<CalendarDays />} title={t("cal.nothing")} />
          )}
        </Card>
      </Section>
      <Section title={t("cal.weeklyGoal")}>
        <Card>
          <div className="row between small">
            <span>{t("cal.goalOf", { done: formatDuration(study), goal: formatDuration(goal) })}</span>
            <span className="faint">{t("cal.goalHint")}</span>
          </div>
          <div className="mt">
            <Bar value={goal ? study / goal : 0} tone={study >= goal ? "success" : undefined} />
          </div>
        </Card>
      </Section>
      <Section title={t("cal.countdown")}>
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
                  <b>{t("cal.days", { n: diffDays(today, e.date) })}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty title={t("cal.noExams")} text={t("cal.noExamsHint")} />
          )}
        </Card>
      </Section>
      <TaskSheet open={!!editing} onClose={() => setEditing(null)} task={editing} />
    </>
  );
}

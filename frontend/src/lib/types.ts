// LIFEOS domain types. Every record stored in the database has an `id`.

export type ID = string;

export const CATEGORIES = [
  "University",
  "Programming",
  "Chinese",
  "English",
  "French",
  "Fitness",
  "Personal",
  "Projects",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Priority = "low" | "medium" | "high" | "critical";
export const PRIORITIES: Priority[] = ["low", "medium", "high", "critical"];

export type TaskStatus = "todo" | "in_progress" | "done";
export type Recurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export type TaskKind = "task" | "assignment" | "revision" | "lecture";

export interface Task {
  id: ID;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  kind: TaskKind;
  deadline: string | null; // YYYY-MM-DD
  scheduledDate: string | null; // YYYY-MM-DD the day it is planned for
  estimatedMin: number;
  status: TaskStatus;
  courseId: ID | null;
  project: string;
  recurrence: Recurrence;
  xp: number; // 0 = use category default from settings
  createdAt: string; // ISO timestamp
  completedAt: string | null;
  recurrenceParentId?: ID | null;
  /** Monthly recurrence: the intended day of month (e.g. 31), so short months don't make it drift. */
  recurrenceAnchorDay?: number;
}

export interface ExamDate {
  id: ID;
  title: string;
  date: string; // YYYY-MM-DD
  weight?: number;
}

export interface Course {
  id: ID;
  name: string;
  code: string;
  credits: number;
  teacher: string;
  semester: string;
  color: string;
  notes: string;
  exams: ExamDate[];
  status: "in_progress" | "completed";
  // A final grade can be entered directly (grade points on the configured scale)
  // or calculated from weighted assessments.
  finalGradePoints: number | null;
  targetPercent: number | null;
  createdAt: string;
}

export interface Assessment {
  id: ID;
  courseId: ID;
  name: string;
  weight: number; // % of the course grade
  score: number | null; // null = not graded yet
  maxScore: number;
  date: string | null;
}

export interface StudySession {
  id: ID;
  courseId: ID;
  type: "lecture" | "revision";
  date: string;
  topic: string;
  minutes: number;
  done: boolean;
}

/** Semester GPA records entered directly (from the original LIFEOS starter). */
export interface SemesterRecord {
  id: ID;
  term: string;
  gpa: number;
  credits: number;
}

export interface GradeBand {
  label: string;
  minPercent: number;
  points: number;
}

export interface Commitment {
  id: ID;
  title: string;
  start: string; // HH:MM
  end: string; // HH:MM
}

export interface PlanBlock {
  taskId: ID;
  start: string; // HH:MM
  end: string;
}

export interface DayPlan {
  id: ID; // = date
  date: string;
  availableMin: number | null;
  energy: "low" | "medium" | "high" | null;
  commitments: Commitment[];
  priorityTaskIds: ID[]; // max 3
  blocks: PlanBlock[]; // accepted time-blocked schedule
  morningDone: boolean;
  notes: string;
}

export interface CheckIn {
  id: ID;
  date: string;
  type: "morning" | "evening";
  createdAt: string;
  answers: Record<string, string | number | boolean | string[]>;
  coachMessage: string;
}

export interface XpEvent {
  id: ID; // unique event key — prevents awarding twice
  date: string;
  amount: number;
  reason: string;
  source: "task" | "exercise" | "language" | "priorities" | "evening" | "challenge" | "achievement" | "focus" | "workout" | "legacy";
  createdAt: string;
}

export interface Achievement {
  id: ID; // achievement key
  unlockedAt: string;
}

export interface CsTopic {
  id: ID;
  name: string;
  order: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  resources: { id: ID; title: string; url: string }[];
  lessons: { id: ID; title: string; done: boolean; doneAt: string | null }[];
  notes: string;
  nextReview: string | null;
  lastReviewed: string | null;
}

export interface CodingExercise {
  id: ID;
  title: string;
  platform: string;
  difficulty: "easy" | "medium" | "hard";
  language: string;
  minutes: number;
  notes: string;
  status: "todo" | "attempted" | "solved";
  topicId: ID | null;
  date: string;
  solvedAt: string | null;
}

export type LangCode = "zh" | "en" | "fr";
export type Skill = "listening" | "speaking" | "reading" | "writing" | "vocabulary" | "grammar" | "hanzi" | "pinyin" | "tones";

export interface LanguageProfile {
  id: LangCode;
  level: string;
  dailyGoalMin: number;
  dailyReviewGoal: number;
}

export interface LanguageSession {
  id: ID;
  lang: LangCode;
  skill: Skill;
  minutes: number;
  date: string;
  notes: string;
  isLesson: boolean;
  createdAt: string;
}

export interface VocabCard {
  id: ID;
  lang: LangCode;
  term: string;
  reading: string; // pinyin for Chinese
  meaning: string;
  hsk: number | null;
  box: number; // Leitner box 0..5
  nextReview: string; // YYYY-MM-DD
  reviews: number;
  correct: number;
  createdAt: string;
}

export interface WorkoutSet {
  reps: number;
  weight: number;
}
export interface WorkoutExercise {
  id: ID;
  name: string;
  sets: WorkoutSet[];
}
export interface Workout {
  id: ID;
  date: string;
  name: string;
  durationMin: number;
  exercises: WorkoutExercise[];
  notes: string;
}

export interface WorkoutPlan {
  id: ID;
  name: string;
  weekdays: number[]; // 0 = Sunday
  exercises: { id: ID; name: string; sets: number; reps: number }[];
}

export interface BodyMetric {
  id: ID;
  date: string;
  weight: number | null;
  waist: number | null;
  chest: number | null;
  arms: number | null;
  bodyFat: number | null;
}

export interface Habit {
  id: ID;
  name: string;
  area: Category;
  targetPerWeek: number;
  createdAt: string;
  archived: boolean;
}

export interface HabitLog {
  id: ID; // habitId|date
  habitId: ID;
  date: string;
}

export interface Goal {
  id: ID;
  title: string;
  area: Category;
  targetDate: string | null;
  progress: number; // 0..100
  done: boolean;
  notes: string;
  createdAt: string;
}

export interface FocusSession {
  id: ID;
  kind: "focus" | "short_break" | "long_break";
  startedAt: string;
  endedAt: string;
  plannedMin: number;
  actualMin: number;
  completed: boolean;
  taskId: ID | null;
  label: string;
  date: string;
}

export interface ActiveTimer {
  kind: FocusSession["kind"];
  plannedMin: number;
  startedAt: string; // when the current run segment started
  endsAt: string | null; // null while paused
  remainingMs: number; // remaining when paused
  accumulatedMs: number; // completed running time before current segment
  taskId: ID | null;
  label: string;
  cycle: number; // focus sessions completed in this cycle
  paused: boolean;
}

export interface Settings {
  name: string;
  timezone: string; // "device" = follow the phone
  theme: "system" | "light" | "dark";
  language: string; // "auto" = phone language, or a code from i18n LANGUAGES
  morningEnabled: boolean;
  morningTime: string; // HH:MM
  eveningEnabled: boolean;
  eveningTime: string;
  focusEndNotification: boolean;
  focusSound: boolean;
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  defaultAvailableMin: number[]; // per weekday, 0 = Sunday
  xp: {
    university: number;
    programmingExercise: number;
    languageLesson: number;
    allPriorities: number;
    eveningReview: number;
    otherTask: number;
    workout: number;
    focusSession: number;
  };
  levelXp: number; // XP needed per level (grows linearly)
  dailyGoals: { tasks: number; focusMin: number; languageMin: number };
  weeklyGoals: { studyMin: number; codingExercises: number; workouts: number; languageMin: number };
  gradingScale: GradeBand[];
  gpaMax: number;
  targetGpa: number | null;
  hideGpaOnDashboard: boolean;
  syncUrl: string;
  syncToken: string;
  lastBackupAt: string | null;
  onboarded: boolean;
  musicLinks: Record<string, string>;
}

export interface CollectionMap {
  tasks: Task;
  courses: Course;
  assessments: Assessment;
  studySessions: StudySession;
  semesterRecords: SemesterRecord;
  dayPlans: DayPlan;
  checkins: CheckIn;
  xpEvents: XpEvent;
  achievements: Achievement;
  csTopics: CsTopic;
  exercises: CodingExercise;
  languages: LanguageProfile;
  langSessions: LanguageSession;
  vocab: VocabCard;
  workouts: Workout;
  workoutPlans: WorkoutPlan;
  bodyMetrics: BodyMetric;
  habits: Habit;
  habitLogs: HabitLog;
  goals: Goal;
  focusSessions: FocusSession;
}
export type CollectionName = keyof CollectionMap;

export const COLLECTIONS: CollectionName[] = [
  "tasks",
  "courses",
  "assessments",
  "studySessions",
  "semesterRecords",
  "dayPlans",
  "checkins",
  "xpEvents",
  "achievements",
  "csTopics",
  "exercises",
  "languages",
  "langSessions",
  "vocab",
  "workouts",
  "workoutPlans",
  "bodyMetrics",
  "habits",
  "habitLogs",
  "goals",
  "focusSessions",
];

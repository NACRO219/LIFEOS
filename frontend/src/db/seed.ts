// Default settings and first-launch reference data. No fake user progress is seeded:
// only the CS roadmap structure (all lessons unchecked) and language profiles.

import type { CollectionMap, CollectionName, CsTopic, GradeBand, LanguageProfile, Settings } from "../lib/types";

export const DEFAULT_GRADING_SCALE: GradeBand[] = [
  { label: "A", minPercent: 93, points: 4.0 },
  { label: "A-", minPercent: 90, points: 3.7 },
  { label: "B+", minPercent: 87, points: 3.3 },
  { label: "B", minPercent: 83, points: 3.0 },
  { label: "B-", minPercent: 80, points: 2.7 },
  { label: "C+", minPercent: 77, points: 2.3 },
  { label: "C", minPercent: 73, points: 2.0 },
  { label: "C-", minPercent: 70, points: 1.7 },
  { label: "D+", minPercent: 67, points: 1.3 },
  { label: "D", minPercent: 60, points: 1.0 },
  { label: "F", minPercent: 0, points: 0 },
];

export function defaultSettings(): Settings {
  return {
    name: "",
    timezone: "device",
    theme: "system",
    language: "auto",
    morningEnabled: true,
    morningTime: "07:00",
    eveningEnabled: true,
    eveningTime: "21:30",
    focusEndNotification: true,
    focusSound: true,
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    defaultAvailableMin: [240, 180, 180, 180, 180, 180, 240],
    xp: {
      university: 20,
      programmingExercise: 30,
      languageLesson: 20,
      allPriorities: 50,
      eveningReview: 10,
      otherTask: 10,
      workout: 20,
      focusSession: 5,
    },
    levelXp: 500,
    dailyGoals: { tasks: 5, focusMin: 120, languageMin: 30 },
    weeklyGoals: { studyMin: 600, codingExercises: 5, workouts: 3, languageMin: 210 },
    gradingScale: DEFAULT_GRADING_SCALE.map((b) => ({ ...b })),
    gpaMax: 4,
    targetGpa: null,
    hideGpaOnDashboard: false,
    syncUrl: "",
    syncToken: "",
    lastBackupAt: null,
    onboarded: false,
    musicLinks: { Study: "", Coding: "", Gym: "", Relax: "" },
  };
}

let n = 0;
const lid = (topic: string) => `${topic}-l${++n}`;

function topic(id: string, name: string, order: number, difficulty: CsTopic["difficulty"], lessons: string[], resources: [string, string][]): CsTopic {
  n = 0;
  return {
    id,
    name,
    order,
    difficulty,
    lessons: lessons.map((title) => ({ id: lid(id), title, done: false, doneAt: null })),
    resources: resources.map(([title, url], i) => ({ id: `${id}-r${i}`, title, url })),
    notes: "",
    nextReview: null,
    lastReviewed: null,
  };
}

export const CS_ROADMAP: CsTopic[] = [
  topic("python", "Python", 1, "beginner",
    ["Variables, types and operators", "Conditionals and loops", "Functions and scope", "Lists, tuples, dicts, sets", "Strings and files", "Modules and packages", "Exceptions", "Comprehensions and generators"],
    [["Official Python tutorial", "https://docs.python.org/3/tutorial/"], ["Exercism Python track", "https://exercism.org/tracks/python"]]),
  topic("fundamentals", "Programming fundamentals", 2, "beginner",
    ["Problem decomposition", "Pseudocode and tracing", "Debugging techniques", "Testing basics", "Recursion", "Complexity intuition (Big-O)"],
    [["CS50x", "https://cs50.harvard.edu/x/"]]),
  topic("ds", "Data structures", 3, "intermediate",
    ["Arrays and dynamic arrays", "Linked lists", "Stacks and queues", "Hash tables", "Trees and BSTs", "Heaps / priority queues", "Graphs representation", "Tries"],
    [["Visualgo", "https://visualgo.net/"], ["Open Data Structures", "https://opendatastructures.org/"]]),
  topic("algorithms", "Algorithms", 4, "intermediate",
    ["Sorting (merge, quick, heap)", "Binary search", "Two pointers and sliding window", "BFS and DFS", "Shortest paths (Dijkstra)", "Greedy algorithms", "Dynamic programming", "Divide and conquer"],
    [["NeetCode roadmap", "https://neetcode.io/roadmap"], ["CP-Algorithms", "https://cp-algorithms.com/"]]),
  topic("discrete", "Discrete mathematics", 5, "intermediate",
    ["Logic and proofs", "Sets and functions", "Induction", "Counting and combinatorics", "Relations", "Graph theory", "Probability basics", "Number theory basics"],
    [["MIT 6.042J Mathematics for CS", "https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-spring-2015/"]]),
  topic("oop", "Object-oriented programming", 6, "intermediate",
    ["Classes and objects", "Encapsulation", "Inheritance", "Polymorphism", "Composition vs inheritance", "SOLID principles", "Common design patterns"],
    [["Refactoring Guru – design patterns", "https://refactoring.guru/design-patterns"]]),
  topic("databases", "Databases", 7, "intermediate",
    ["Relational model", "SQL SELECT and filtering", "Joins", "Aggregation and GROUP BY", "Normalization", "Indexes", "Transactions and ACID"],
    [["SQLBolt", "https://sqlbolt.com/"], ["CMU 15-445 lectures", "https://15445.courses.cs.cmu.edu/"]]),
  topic("git", "Git & GitHub", 8, "beginner",
    ["init, add, commit", "Branches and merging", "Remotes, push and pull", "Resolving conflicts", "Pull requests", "Rebase basics", ".gitignore and good commits"],
    [["Pro Git book", "https://git-scm.com/book/en/v2"], ["Learn Git Branching", "https://learngitbranching.js.org/"]]),
  topic("projects", "Projects", 9, "advanced",
    ["Plan a project and scope an MVP", "Build a CLI tool", "Build a web API", "Build a full-stack app", "Write a README and deploy", "Publish a portfolio"],
    [["Build your own X", "https://github.com/codecrafters-io/build-your-own-x"]]),
];

export const LANGUAGE_PROFILES: LanguageProfile[] = [
  { id: "zh", level: "HSK 1", dailyGoalMin: 30, dailyReviewGoal: 20 },
  { id: "en", level: "B2", dailyGoalMin: 20, dailyReviewGoal: 10 },
  { id: "fr", level: "A2", dailyGoalMin: 20, dailyReviewGoal: 10 },
];

export function seedCollections(): { [K in CollectionName]?: CollectionMap[K][] } {
  return {
    csTopics: CS_ROADMAP.map((t) => structuredCloneSafe(t)),
    languages: LANGUAGE_PROFILES.map((l) => ({ ...l })),
  };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

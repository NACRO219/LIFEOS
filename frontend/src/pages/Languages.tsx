import { BookOpen, Flame, Pause, Play, Plus, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BarChart } from "../components/charts";
import { Bar, Card, confirmDialog, Empty, Field, NumberInput, Page, Section, Segmented, Stat, toast, xpToast } from "../components/ui";
import { store, uid, useStore } from "../db/store";
import { t } from "../i18n";
import { deleteLanguageSession, langName, logLanguageSession } from "../lib/actions";
import { addDays, formatDuration, prettyDay, todayISO, weekday, weekdayShort } from "../lib/date";
import { dueCards, hasTones, pinyinTones, reviewCard, stripTones } from "../lib/srs";
import { languageMinutes, languageStreak, weekRange } from "../lib/stats";
import type { LangCode, Skill, VocabCard } from "../lib/types";
import { go } from "../router";
import { skillLabel } from "./CheckIn";

export const LANG_META: Record<LangCode, { flag: string; color: string; skills: Skill[]; levels: string[] }> = {
  zh: { flag: "🇨🇳", color: "#e0405a", skills: ["listening", "speaking", "reading", "writing", "vocabulary", "hanzi", "pinyin", "tones"], levels: ["HSK 1", "HSK 2", "HSK 3", "HSK 4", "HSK 5", "HSK 6", "HSK 7–9"] },
  en: { flag: "🇬🇧", color: "#4f6bff", skills: ["listening", "speaking", "reading", "writing", "vocabulary", "grammar"], levels: ["A1", "A2", "B1", "B2", "C1", "C2"] },
  fr: { flag: "🇫🇷", color: "#7b5cff", skills: ["listening", "speaking", "reading", "writing", "vocabulary", "grammar"], levels: ["A1", "A2", "B1", "B2", "C1", "C2"] },
};
const CORE_SKILLS: Skill[] = ["listening", "speaking", "reading", "writing"];

export default function Languages() {
  const s = useStore();
  const today = todayISO();
  const { from, to } = weekRange(today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <Page title={t("lng.title")} eyebrow={t("lng.weekMin", { n: languageMinutes(s, from, to) })}>
      <div className="col">
        {(["zh", "en", "fr"] as LangCode[]).map((code) => {
          const m = LANG_META[code];
          const prof = s.get("languages", code);
          const min = languageMinutes(s, today, today, code);
          const goal = prof?.dailyGoalMin ?? 20;
          const due = dueCards(s.all("vocab").filter((v) => v.lang === code), today).length;
          return (
            <Card key={code} className="tight" onClick={() => go(`/lang/${code}`)}>
              <div className="row">
                <div style={{ fontSize: 34 }}>{m.flag}</div>
                <div className="grow">
                  <div className="row between">
                    <b>{langName(code)}</b>
                    <span className="tag">{prof?.level ?? ""}</span>
                  </div>
                  <div className="small muted row gap-s wrap">
                    <Flame size={13} /> {t("lng.todayLine", { n: min, goal, s: languageStreak(s, code, today) })}
                    {due ? ` · ${t("lng.due", { n: due })}` : ""}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Bar value={goal ? min / goal : 0} tone={min >= goal ? "success" : undefined} />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <Section title={t("lng.last7")}>
        <Card>
          <BarChart data={days.map((d) => ({ label: weekdayShort(weekday(d)), value: languageMinutes(s, d) }))} unit=" min" goal={s.settings.dailyGoals.languageMin} />
        </Card>
      </Section>
    </Page>
  );
}

type Tab = "practice" | "review" | "vocab" | "tones" | "progress";

export function LanguageDetail({ code }: { code: LangCode }) {
  const m = LANG_META[code];
  const s = useStore();
  const [tab, setTab] = useState<Tab>("practice");
  if (!m)
    return (
      <Page title={t("lng.title")} showBack>
        <Empty title={t("lng.unknown")} />
      </Page>
    );
  const prof = s.get("languages", code) ?? { id: code, level: m.levels[0], dailyGoalMin: 20, dailyReviewGoal: 10 };
  const opts: { value: Tab; label: string }[] = [
    { value: "practice", label: t("lng.practice") },
    { value: "review", label: t("lng.review") },
    { value: "vocab", label: t("lng.vocab") },
    ...(code === "zh" ? [{ value: "tones" as Tab, label: t("lng.tones") }] : []),
    { value: "progress", label: t("lng.progress") },
  ];
  return (
    <Page title={`${m.flag} ${langName(code)}`} eyebrow={prof.level} showBack>
      <Segmented value={tab} onChange={setTab} options={opts} />
      {tab === "practice" && <Practice code={code} />}
      {tab === "review" && <Review code={code} />}
      {tab === "vocab" && <Vocab code={code} />}
      {tab === "tones" && <Tones />}
      {tab === "progress" && <Progress code={code} />}
    </Page>
  );
}

interface LangTimer {
  lang: LangCode;
  skill: Skill;
  startedAt: number;
  pausedMs: number;
  pausedAt: number | null;
}

function Practice({ code }: { code: LangCode }) {
  const s = useStore();
  const m = LANG_META[code];
  const today = todayISO();
  const timer = s.getKv<LangTimer>("langTimer");
  const mine = timer?.lang === code ? timer : null;
  const [skill, setSkill] = useState<Skill>(m.skills[0]);
  const [isLesson, setIsLesson] = useState(true);
  const [notes, setNotes] = useState("");
  const [manual, setManual] = useState<number | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!mine || mine.pausedAt) return;
    const id = setInterval(() => tick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [mine]);
  const elapsed = mine ? (mine.pausedAt ?? Date.now()) - mine.startedAt - mine.pausedMs : 0;
  const sessions = s
    .all("langSessions")
    .filter((l) => l.lang === code)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const prof = s.get("languages", code);
  const goal = prof?.dailyGoalMin ?? 20;
  const todayMin = languageMinutes(s, today, today, code);

  const stop = () => {
    if (!mine) return;
    const minutes = Math.round(elapsed / 60000);
    s.setKv("langTimer", null);
    if (minutes < 1) return toast(t("lng.underMinute"));
    xpToast(logLanguageSession(store(), { lang: code, skill: mine.skill, minutes, date: today, notes, isLesson }));
    toast(t("lng.loggedSkill", { skill: skillLabel(mine.skill), n: minutes }));
    setNotes("");
  };
  const logManual = () => {
    if (!manual || manual <= 0 || manual > 600) return toast(t("lng.errMinutes"), "error");
    xpToast(logLanguageSession(store(), { lang: code, skill, minutes: manual, date: today, notes, isLesson }));
    setManual(null);
    setNotes("");
    toast(t("lng.sessionLogged"));
  };
  return (
    <>
      <Card className="mt">
        <div className="row between small">
          <span>{t("lng.today")}</span>
          <span className="faint">{t("ch.minOf", { a: todayMin, b: goal })}</span>
        </div>
        <div className="mt">
          <Bar value={todayMin / Math.max(1, goal)} />
        </div>
      </Card>
      <Card className="mt">
        <Field label={t("lng.skill")}>
          <div className="chips">
            {m.skills.map((k) => (
              <button key={k} className={`chip ${(mine?.skill ?? skill) === k ? "on" : ""}`} disabled={!!mine} onClick={() => setSkill(k)}>
                {skillLabel(k)}
              </button>
            ))}
          </div>
        </Field>
        <div className="timer-face" dir="ltr" style={{ fontSize: 56, margin: "10px 0 16px" }}>
          {String(Math.floor(elapsed / 60000)).padStart(2, "0")}:{String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}
        </div>
        <label className="row small" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={isLesson} onChange={(e) => setIsLesson(e.target.checked)} /> {t("lng.countsLesson", { n: s.settings.xp.languageLesson })}
        </label>
        <input placeholder={t("lng.notesPh")} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="row mt">
          {!mine ? (
            <button className="btn primary grow" disabled={!!timer} onClick={() => s.setKv("langTimer", { lang: code, skill, startedAt: Date.now(), pausedMs: 0, pausedAt: null })}>
              <Play size={18} /> {timer ? t("lng.running", { lang: langName(timer.lang) }) : t("lng.start")}
            </button>
          ) : (
            <>
              {mine.pausedAt ? (
                <button className="btn grow" onClick={() => s.setKv("langTimer", { ...mine, pausedMs: mine.pausedMs + (Date.now() - mine.pausedAt!), pausedAt: null })}>
                  <Play size={18} /> {t("focus.resume")}
                </button>
              ) : (
                <button className="btn grow" onClick={() => s.setKv("langTimer", { ...mine, pausedAt: Date.now() })}>
                  <Pause size={18} /> {t("focus.pause")}
                </button>
              )}
              <button className="btn primary grow" onClick={stop}>
                <Square size={16} /> {t("lng.finish")}
              </button>
            </>
          )}
        </div>
        <hr className="sep" />
        <div className="row">
          <NumberInput value={manual} min={1} max={600} placeholder={t("lng.manualPh")} onChange={setManual} />
          <button className="btn" onClick={logManual}>
            {t("lng.log")}
          </button>
        </div>
      </Card>
      <Section title={t("lng.recent")}>
        <Card className="tight">
          {sessions.length ? (
            <div className="list">
              {sessions.slice(0, 15).map((x) => (
                <div key={x.id} className="list-item">
                  <div className="grow">
                    <div className="title">
                      {skillLabel(x.skill)} · {formatDuration(x.minutes)} {x.isLesson && <span className="tag accent">{t("lng.lesson")}</span>}
                    </div>
                    <div className="sub">
                      {prettyDay(x.date)}
                      {x.notes ? ` · ${x.notes}` : ""}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={t("common.delete")}
                    onClick={async () => (await confirmDialog({ title: t("lng.deleteSession"), body: x.isLesson ? t("task.deleteXp") : undefined, confirm: t("common.delete"), danger: true })) && deleteLanguageSession(store(), x.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <Empty title={t("lng.noSessions")} text={t("lng.noSessionsHint")} />
          )}
        </Card>
      </Section>
    </>
  );
}

function Review({ code }: { code: LangCode }) {
  const s = useStore();
  const today = todayISO();
  const cards = s.all("vocab").filter((v) => v.lang === code);
  const due = useMemo(() => dueCards(cards, today), [cards, today]);
  const [revealed, setRevealed] = useState(false);
  const [mode, setMode] = useState<"term" | "meaning">("term");
  const [count, setCount] = useState(0);
  const card = due[0];
  const goal = s.get("languages", code)?.dailyReviewGoal ?? 10;
  const reviewedToday = s.getKv<Record<string, number>>("reviewsToday")?.[`${code}|${today}`] ?? 0;
  const answer = (ok: boolean) => {
    if (!card) return;
    s.transact(() => {
      s.put("vocab", reviewCard(card, ok, today));
      const k = s.getKv<Record<string, number>>("reviewsToday") ?? {};
      s.setKv("reviewsToday", { [`${code}|${today}`]: (k[`${code}|${today}`] ?? 0) + 1 });
    });
    setRevealed(false);
    setCount((c) => c + 1);
  };
  if (!cards.length)
    return (
      <Card className="mt">
        <Empty icon={<BookOpen />} title={t("lng.noVocab")} text={t("lng.noVocabHint")} />
      </Card>
    );
  return (
    <>
      <div className="row between mt small wrap">
        <span className="muted">{t("lng.reviewedToday", { n: reviewedToday, goal })}</span>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "term", label: code === "zh" ? t("lng.hanziToMeaning") : t("lng.termToMeaning") },
            { value: "meaning", label: t("lng.meaningToTerm") },
          ]}
        />
      </div>
      <div className="mt">
        <Bar value={reviewedToday / Math.max(1, goal)} tone={reviewedToday >= goal ? "success" : undefined} />
      </div>
      {card ? (
        <Card className="mt flashcard" onClick={() => setRevealed(true)}>
          <div className="faint small">
            {t("lng.cardMeta", { n: due.length, b: card.box })}
            {card.hsk ? ` · HSK ${card.hsk}` : ""}
          </div>
          {mode === "term" ? <div className={`term ${code === "zh" ? "zh" : ""}`}>{card.term}</div> : <div style={{ fontSize: 24, fontWeight: 600 }}>{card.meaning}</div>}
          {revealed ? (
            <>
              {mode === "meaning" && <div className={`term ${code === "zh" ? "zh" : ""}`}>{card.term}</div>}
              {card.reading && (
                <div style={{ fontSize: 22 }} className="muted">
                  {card.reading}
                </div>
              )}
              {mode === "term" && <div style={{ fontSize: 20 }}>{card.meaning}</div>}
              <div className="row mt" style={{ width: "100%" }} onClick={(e) => e.stopPropagation()}>
                <button className="btn danger grow" onClick={() => answer(false)}>
                  {t("lng.again")}
                </button>
                <button className="btn primary grow" onClick={() => answer(true)}>
                  {t("lng.gotIt")}
                </button>
              </div>
            </>
          ) : (
            <small className="faint">{t("lng.tapReveal")}</small>
          )}
        </Card>
      ) : (
        <Card className="mt">
          <Empty title={t("lng.caughtUp")} text={count ? t("lng.reviewedSession", { n: count }) : t("lng.noneDue")} />
        </Card>
      )}
    </>
  );
}

function Vocab({ code }: { code: LangCode }) {
  const s = useStore();
  const today = todayISO();
  const [f, setF] = useState({ term: "", reading: "", meaning: "", hsk: null as number | null });
  const [q, setQ] = useState("");
  const cards = s
    .all("vocab")
    .filter((v) => v.lang === code)
    .filter((v) => !q || `${v.term} ${v.reading} ${v.meaning}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const add = () => {
    if (!f.term.trim() || !f.meaning.trim()) return toast(t("lng.errCard"), "error");
    if (s.all("vocab").some((v) => v.lang === code && v.term.trim() === f.term.trim())) return toast(t("lng.dupCard"), "error");
    const c: VocabCard = { id: uid(), lang: code, term: f.term.trim(), reading: f.reading.trim(), meaning: f.meaning.trim(), hsk: code === "zh" ? f.hsk : null, box: 0, nextReview: today, reviews: 0, correct: 0, createdAt: new Date().toISOString() };
    s.put("vocab", c);
    setF({ term: "", reading: "", meaning: "", hsk: f.hsk });
  };
  return (
    <>
      <Card className="mt">
        <div className="grid-2">
          <Field label={code === "zh" ? t("lng.hanzi") : t("lng.word")}>
            <input value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} lang={code} />
          </Field>
          <Field label={code === "zh" ? t("lng.pinyin") : t("lng.pron")} hint={code === "zh" ? t("lng.pinyinHint") : undefined}>
            <input value={f.reading} onChange={(e) => setF({ ...f, reading: e.target.value })} />
          </Field>
          <Field label={t("lng.meaning")}>
            <input value={f.meaning} onChange={(e) => setF({ ...f, meaning: e.target.value })} />
          </Field>
          {code === "zh" && (
            <Field label={t("lng.hsk")}>
              <NumberInput value={f.hsk} min={1} max={9} onChange={(v) => setF({ ...f, hsk: v })} />
            </Field>
          )}
        </div>
        <button className="btn primary block" onClick={add}>
          <Plus size={16} /> {t("lng.addCard")}
        </button>
      </Card>
      <input className="mt" placeholder={t("lng.searchCards", { n: cards.length })} value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="tight mt">
        {cards.length ? (
          <div className="list">
            {cards.slice(0, 200).map((v) => (
              <div key={v.id} className="list-item">
                <div style={{ fontSize: code === "zh" ? 24 : 16, fontWeight: 600, minWidth: 56 }} lang={code}>
                  {v.term}
                </div>
                <div className="grow">
                  <div className="title ellipsis">{v.meaning}</div>
                  <div className="sub">
                    {v.reading}
                    {v.hsk ? ` · HSK ${v.hsk}` : ""} · {t("lng.cardLine", { b: v.box, acc: v.reviews ? t("lng.accuracy", { n: Math.round((v.correct / v.reviews) * 100) }) : t("lng.new") })}
                  </div>
                </div>
                <button className="icon-btn" aria-label={t("lng.deleteCard")} onClick={() => s.remove("vocab", v.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title={t("lng.noCards")} />
        )}
      </Card>
    </>
  );
}

function Tones() {
  const s = useStore();
  const pool = s.all("vocab").filter((v) => v.lang === "zh" && v.reading && hasTones(v.reading));
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * 1e6));
  const [picked, setPicked] = useState<number[]>([]);
  const [score, setScore] = useState({ right: 0, total: 0 });
  if (!pool.length)
    return (
      <Card className="mt">
        <Empty title={t("lng.noTones")} text={t("lng.noTonesHint")} />
      </Card>
    );
  const card = pool[idx % pool.length];
  const tones = pinyinTones(card.reading);
  const syllables = stripTones(card.reading)
    .split(/[\s'’\-]+/)
    .filter(Boolean);
  const finished = picked.length >= tones.length;
  const correct = finished && picked.every((x, i) => x === tones[i]);
  const pick = (n: number) => {
    if (finished) return;
    const next = [...picked, n];
    setPicked(next);
    if (next.length === tones.length) setScore((sc) => ({ right: sc.right + (next.every((x, i) => x === tones[i]) ? 1 : 0), total: sc.total + 1 }));
  };
  return (
    <Card className="mt flashcard">
      <div className="faint small">{t("lng.score", { r: score.right, t: score.total })}</div>
      <div className="term zh" lang="zh">
        {card.term}
      </div>
      <div style={{ fontSize: 22 }} dir="ltr">
        {syllables.map((syl, i) => (
          <span key={i} style={{ margin: "0 4px", color: i < picked.length ? (picked[i] === tones[i] ? "var(--success)" : "var(--danger)") : undefined }}>
            {syl}
            {i < picked.length ? picked[i] : ""}
          </span>
        ))}
      </div>
      {!finished ? (
        <div className="grid-4" style={{ width: "100%", gridTemplateColumns: "repeat(5,1fr)" }} dir="ltr">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} className="btn" onClick={() => pick(n)}>
              {["ˉ", "ˊ", "ˇ", "ˋ", "·"][n - 1]} {n}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={correct ? "tag success" : "tag danger"}>{correct ? t("lng.correct") : t("lng.answer", { a: card.reading })}</div>
          <div>{card.meaning}</div>
          <button
            className="btn primary"
            onClick={() => {
              setPicked([]);
              setIdx((i) => i + 1 + Math.floor(Math.random() * 3));
            }}
          >
            {t("lng.next")}
          </button>
        </>
      )}
    </Card>
  );
}

function Progress({ code }: { code: LangCode }) {
  const s = useStore();
  const m = LANG_META[code];
  const today = todayISO();
  const prof = s.get("languages", code) ?? { id: code, level: m.levels[0], dailyGoalMin: 20, dailyReviewGoal: 10 };
  const sessions = s.all("langSessions").filter((l) => l.lang === code);
  const bySkill = m.skills.map((k) => ({ label: skillLabel(k).slice(0, 5), value: sessions.filter((x) => x.skill === k).reduce((a, x) => a + x.minutes, 0) }));
  const total = sessions.reduce((a, x) => a + x.minutes, 0);
  const cards = s.all("vocab").filter((v) => v.lang === code);
  const mastered = cards.filter((v) => v.box >= 4).length;
  const days = Array.from({ length: 28 }, (_, i) => addDays(today, i - 27));
  const save = (patch: Partial<typeof prof>) => s.put("languages", { ...prof, ...patch });
  const coreMax = Math.max(1, ...CORE_SKILLS.map((k) => sessions.filter((x) => x.skill === k).reduce((a, x) => a + x.minutes, 0)));
  return (
    <>
      <div className="grid-3 mt">
        <Stat label={t("lng.total")} value={formatDuration(total)} />
        <Stat label={t("lng.streak")} value={t("xp.daysShort", { n: languageStreak(s, code, today) })} />
        <Stat label={t("lng.cards")} value={cards.length} sub={t("lng.mastered", { n: mastered })} />
      </div>
      <Section title={t("lng.fourSkills")}>
        <Card>
          {CORE_SKILLS.map((k) => {
            const v = sessions.filter((x) => x.skill === k).reduce((a, x) => a + x.minutes, 0);
            return (
              <div key={k} className="col gap-s" style={{ marginBottom: 10 }}>
                <div className="row between small">
                  <span>{skillLabel(k)}</span>
                  <span className="faint">{formatDuration(v)}</span>
                </div>
                <Bar value={v / coreMax} />
              </div>
            );
          })}
          <small className="faint">{t("lng.balanced")}</small>
        </Card>
      </Section>
      <Section title={t("lng.bySkill")}>
        <Card>
          <BarChart data={bySkill} unit=" min" color={m.color} />
        </Card>
      </Section>
      <Section title={t("lng.last4")}>
        <Card>
          <div className="heat">
            {days.map((d) => {
              const v = languageMinutes(s, d, d, code);
              const a = v === 0 ? 0 : v >= prof.dailyGoalMin ? 1 : 0.45;
              return <i key={d} title={`${prettyDay(d)}: ${formatDuration(v)}`} style={{ background: a ? m.color : undefined, opacity: a ? 0.35 + a * 0.65 : 1 }} />;
            })}
          </div>
        </Card>
      </Section>
      <Section title={t("lng.goals")}>
        <Card>
          <div className="grid-2">
            <Field label={t("lng.level")}>
              <select value={prof.level} onChange={(e) => save({ level: e.target.value })}>
                {m.levels.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label={t("lng.dailyGoal")}>
              <NumberInput value={prof.dailyGoalMin} min={0} max={600} onChange={(v) => save({ dailyGoalMin: v ?? 0 })} />
            </Field>
            <Field label={t("lng.dailyReviews")}>
              <NumberInput value={prof.dailyReviewGoal} min={0} max={500} onChange={(v) => save({ dailyReviewGoal: v ?? 0 })} />
            </Field>
          </div>
        </Card>
      </Section>
    </>
  );
}

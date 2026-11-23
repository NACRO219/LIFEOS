import { Award, Lock } from "lucide-react";
import { BarChart } from "../components/charts";
import { Bar, Card, Empty, Page, Section, Stat } from "../components/ui";
import { useStore } from "../db/store";
import { t, tDyn } from "../i18n";
import { langName } from "../lib/actions";
import { addDays, formatDuration, localDay, prettyDay, todayISO, weekday, weekdayShort } from "../lib/date";
import { ACHIEVEMENTS, dailyChallenges, weeklyChallenges } from "../lib/gamification";
import { activeDays, levelInfo, longestStreak, streakFrom, totalXp, xpOn } from "../lib/stats";
import type { XpEvent } from "../lib/types";

/** Readable, translated label for an XP event (details are stored language-neutral). */
function xpLabel(e: XpEvent): { title: string; detail: string } {
  const title = tDyn(`xpsrc.${e.source}`, e.source);
  let detail = e.reason ?? "";
  const lang = /^(zh|en|fr):(\w+)$/.exec(detail);
  if (e.source === "language" && lang) detail = `${langName(lang[1])} · ${tDyn(`skill.${lang[2]}`, lang[2])}`;
  const min = /^min:(\d+)$/.exec(detail);
  if (e.source === "focus" && min) detail = formatDuration(Number(min[1]));
  return { title, detail };
}

export default function Progress() {
  const s = useStore();
  const today = todayISO();
  const xp = totalXp(s);
  const lvl = levelInfo(xp, s.settings.levelXp);
  const days = activeDays(s);
  const unlocked = new Map(s.all("achievements").map((a) => [a.id, a.unlockedAt]));
  const events = [...s.all("xpEvents")].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => ({ label: weekdayShort(weekday(d)).slice(0, 2), value: xpOn(s, d) }));
  const daily = dailyChallenges(s, today);
  const weekly = weeklyChallenges(s, today);
  const x = s.settings.xp;
  return (
    <Page title={t("xp.title")} showBack>
      <Card className="accent">
        <div className="row between">
          <div>
            <div className="small muted">{t("xp.level")}</div>
            <div style={{ fontSize: 44, fontWeight: 800 }}>{lvl.level}</div>
          </div>
          <div style={{ textAlign: "end" }}>
            <div style={{ fontSize: 22, fontWeight: 750 }}>{t("xp.total", { n: xp })}</div>
            <div className="small muted">{t("xp.toNext", { n: lvl.needed - lvl.intoLevel, l: lvl.level + 1 })}</div>
          </div>
        </div>
        <div className="mt">
          <Bar value={lvl.progress} />
        </div>
      </Card>
      <div className="grid-3 mt">
        <Stat label={t("xp.streak")} value={t("xp.daysShort", { n: streakFrom(days, today) })} />
        <Stat label={t("xp.best")} value={t("xp.daysShort", { n: longestStreak(days) })} />
        <Stat label={t("xp.badges")} value={`${unlocked.size}/${ACHIEVEMENTS.length}`} />
      </div>

      <Section title={t("xp.daily")}>
        <Card>{daily.length ? daily.map((c) => <ChallengeRow key={c.id} {...c} />) : <Empty title={t("xp.setDaily")} />}</Card>
      </Section>
      <Section title={t("xp.weekly")}>
        <Card>{weekly.length ? weekly.map((c) => <ChallengeRow key={c.id} {...c} />) : <Empty title={t("xp.setWeekly")} />}</Card>
      </Section>

      <Section title={t("xp.last14")}>
        <Card>
          <BarChart data={last14} unit=" XP" />
        </Card>
      </Section>

      <Section title={t("xp.achievements")}>
        <div className="grid-2">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked.get(a.id);
            return (
              <div key={a.id} className="stat" style={{ opacity: at ? 1 : 0.55 }}>
                <div style={{ fontSize: 26 }}>{at ? a.icon : <Lock size={22} />}</div>
                <b style={{ fontSize: 14 }}>{a.title}</b>
                <div className="sub">{a.description}</div>
                {at && (
                  <div className="sub" style={{ color: "var(--success)" }}>
                    {t("xp.unlocked", { date: prettyDay(localDay(at)) })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={t("xp.history")}>
        <Card className="tight">
          {events.length ? (
            <div className="list">
              {events.slice(0, 100).map((e) => {
                const l = xpLabel(e);
                return (
                  <div key={e.id} className="list-item">
                    <Award size={18} className="faint" />
                    <div className="grow">
                      <div className="title ellipsis">{l.title}</div>
                      <div className="sub ellipsis">
                        {prettyDay(e.date)}
                        {l.detail ? ` · ${l.detail}` : ""}
                      </div>
                    </div>
                    <b style={{ color: "var(--accent)" }}>+{e.amount}</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty title={t("xp.noXp")} text={t("xp.noXpHint")} />
          )}
        </Card>
      </Section>
      <p className="faint small center mt">{t("xp.rules", { u: x.university, p: x.programmingExercise, l: x.languageLesson, a: x.allPriorities, e: x.eveningReview })}</p>
    </Page>
  );
}

function ChallengeRow({ title, progress, label, xp }: { title: string; progress: number; label: string; xp: number }) {
  return (
    <div className="col gap-s" style={{ marginBottom: 12 }}>
      <div className="row between small">
        <span>{title}</span>
        <span className={progress >= 1 ? "tag success" : "faint"}>{progress >= 1 ? t("common.xpDone", { n: xp }) : t("xp.challengeLine", { label, xp })}</span>
      </div>
      <Bar value={progress} tone={progress >= 1 ? "success" : undefined} />
    </div>
  );
}

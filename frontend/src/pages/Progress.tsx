import { Award, Lock } from "lucide-react";
import { BarChart } from "../components/charts";
import { Bar, Card, Empty, Page, Section, Stat } from "../components/ui";
import { useStore } from "../db/store";
import { addDays, localDay, prettyDay, todayISO, WEEKDAYS, weekday } from "../lib/date";
import { ACHIEVEMENTS, dailyChallenges, weeklyChallenges } from "../lib/gamification";
import { activeDays, levelInfo, longestStreak, streakFrom, totalXp, xpOn } from "../lib/stats";

export default function Progress() {
  const s = useStore();
  const today = todayISO();
  const xp = totalXp(s);
  const lvl = levelInfo(xp, s.settings.levelXp);
  const days = activeDays(s);
  const unlocked = new Map(s.all("achievements").map((a) => [a.id, a.unlockedAt]));
  const events = [...s.all("xpEvents")].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const last14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).map((d) => ({ label: WEEKDAYS[weekday(d)][0], value: xpOn(s, d) }));
  const daily = dailyChallenges(s, today);
  const weekly = weeklyChallenges(s, today);
  return (
    <Page title="XP & achievements" showBack>
      <Card className="accent">
        <div className="row between">
          <div>
            <div className="small muted">Level</div>
            <div style={{ fontSize: 44, fontWeight: 800 }}>{lvl.level}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 750 }}>{xp.toLocaleString()} XP</div>
            <div className="small muted">
              {lvl.needed - lvl.intoLevel} XP to level {lvl.level + 1}
            </div>
          </div>
        </div>
        <div className="mt">
          <Bar value={lvl.progress} />
        </div>
      </Card>
      <div className="grid-3 mt">
        <Stat label="Streak" value={`${streakFrom(days, today)}d`} />
        <Stat label="Best" value={`${longestStreak(days)}d`} />
        <Stat label="Badges" value={`${unlocked.size}/${ACHIEVEMENTS.length}`} />
      </div>

      <Section title="Daily challenges">
        <Card>{daily.length ? daily.map((c) => <ChallengeRow key={c.id} {...c} />) : <Empty title="Set daily goals in Settings to get challenges" />}</Card>
      </Section>
      <Section title="Weekly challenges">
        <Card>{weekly.length ? weekly.map((c) => <ChallengeRow key={c.id} {...c} />) : <Empty title="Set weekly goals in Settings to get challenges" />}</Card>
      </Section>

      <Section title="XP, last 14 days">
        <Card>
          <BarChart data={last14} unit=" XP" />
        </Card>
      </Section>

      <Section title="Achievements">
        <div className="grid-2">
          {ACHIEVEMENTS.map((a) => {
            const at = unlocked.get(a.id);
            return (
              <div key={a.id} className="stat" style={{ opacity: at ? 1 : 0.55 }}>
                <div style={{ fontSize: 26 }}>{at ? a.icon : <Lock size={22} />}</div>
                <b style={{ fontSize: 14 }}>{a.title}</b>
                <div className="sub">{a.description}</div>
                {at && <div className="sub" style={{ color: "var(--success)" }}>Unlocked {prettyDay(localDay(at))}</div>}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="XP history">
        <Card className="tight">
          {events.length ? (
            <div className="list">
              {events.slice(0, 100).map((e) => (
                <div key={e.id} className="list-item">
                  <Award size={18} className="faint" />
                  <div className="grow">
                    <div className="title ellipsis">{e.reason}</div>
                    <div className="sub">{prettyDay(e.date)}</div>
                  </div>
                  <b style={{ color: "var(--accent)" }}>+{e.amount}</b>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No XP yet" text="Complete tasks, exercises, lessons and reviews to earn XP." />
          )}
        </Card>
      </Section>
      <p className="faint small center mt">
        XP rules: university task +{s.settings.xp.university}, programming exercise +{s.settings.xp.programmingExercise}, language lesson +{s.settings.xp.languageLesson}, all daily priorities +{s.settings.xp.allPriorities}, evening review +{s.settings.xp.eveningReview}. Each event counts once; undoing it removes its XP.
      </p>
    </Page>
  );
}

function ChallengeRow({ title, progress, label, xp }: { title: string; progress: number; label: string; xp: number }) {
  return (
    <div className="col gap-s" style={{ marginBottom: 12 }}>
      <div className="row between small">
        <span>{title}</span>
        <span className={progress >= 1 ? "tag success" : "faint"}>{progress >= 1 ? `+${xp} XP ✓` : `${label} · +${xp} XP`}</span>
      </div>
      <Bar value={progress} tone={progress >= 1 ? "success" : undefined} />
    </div>
  );
}

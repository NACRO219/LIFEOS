// Leitner spaced repetition + pinyin tone helpers.
import { addDays } from "./date";
import type { VocabCard } from "./types";

export const BOX_INTERVALS = [0, 1, 3, 7, 14, 30]; // days until next review per box

export function dueCards(cards: VocabCard[], today: string) {
  return cards.filter((c) => c.nextReview <= today).sort((a, b) => a.box - b.box || a.nextReview.localeCompare(b.nextReview));
}

export function reviewCard(card: VocabCard, correct: boolean, today: string): VocabCard {
  const box = correct ? Math.min(card.box + 1, BOX_INTERVALS.length - 1) : 0;
  const interval = correct ? BOX_INTERVALS[box] : 0;
  return {
    ...card,
    box,
    nextReview: addDays(today, Math.max(interval, correct ? 1 : 0)),
    reviews: card.reviews + 1,
    correct: card.correct + (correct ? 1 : 0),
  };
}

const TONE_MARKS: Record<string, [string, number]> = {};
const groups: [string, string][] = [
  ["a", "āáǎà"],
  ["e", "ēéěè"],
  ["i", "īíǐì"],
  ["o", "ōóǒò"],
  ["u", "ūúǔù"],
  ["ü", "ǖǘǚǜ"],
];
for (const [base, marks] of groups) [...marks].forEach((m, i) => (TONE_MARKS[m] = [base, i + 1]));

/** Tone numbers (1-5) of each syllable. Accepts tone marks ("nǐ hǎo") or numbers ("ni3 hao3"). */
export function pinyinTones(pinyin: string): number[] {
  const syllables = pinyin.trim().toLowerCase().split(/[\s'’\-]+/).filter(Boolean);
  return syllables.map((syl) => {
    const num = syl.match(/([1-5])$/);
    if (num) return Number(num[1]);
    for (const ch of syl) if (TONE_MARKS[ch]) return TONE_MARKS[ch][1];
    return 5; // neutral
  });
}

export function hasTones(pinyin: string) {
  return /[1-5]\b|[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(pinyin);
}

export function stripTones(pinyin: string) {
  return pinyin
    .split("")
    .map((ch) => TONE_MARKS[ch]?.[0] ?? ch)
    .join("")
    .replace(/([a-zü]+)[1-5]/gi, "$1");
}

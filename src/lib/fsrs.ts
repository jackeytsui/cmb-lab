import type { SrsCardState, SrsRating } from "@/db/schema/srs";

export interface FsrsSnapshot {
  state: SrsCardState;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  reps: number;
  lapses: number;
}

export interface FsrsResult {
  nextState: SrsCardState;
  dueAt: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
}

const ratingEase: Record<SrsRating, number> = {
  again: 0.5,
  hard: 0.85,
  good: 1,
  easy: 1.3,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scheduleFsrsReview(snapshot: FsrsSnapshot, rating: SrsRating): FsrsResult {
  const now = new Date();

  const baseStability = snapshot.stability > 0 ? snapshot.stability : 0.3;
  const difficultyShift = rating === "again" ? 0.6 : rating === "hard" ? 0.2 : rating === "easy" ? -0.25 : -0.1;
  const nextDifficulty = clamp(snapshot.difficulty + difficultyShift, 1, 10);

  let nextState: SrsCardState = snapshot.state;
  if (rating === "again") {
    nextState = "relearning";
  } else if (snapshot.state === "new") {
    nextState = "learning";
  } else if (snapshot.state === "learning" || snapshot.state === "relearning") {
    nextState = "review";
  }

  const retentionBoost = 1 + (10 - nextDifficulty) / 40;
  const ratingBoost = ratingEase[rating];
  const nextStability = rating === "again"
    ? clamp(baseStability * 0.55, 0.1, 365)
    : clamp(baseStability * retentionBoost * ratingBoost + 0.15, 0.1, 365);

  let intervalDays = Math.max(1, Math.round(nextStability));
  if (snapshot.state === "new" && rating !== "again") intervalDays = rating === "hard" ? 1 : 2;
  if (rating === "again") intervalDays = 0;

  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + intervalDays);

  return {
    nextState,
    dueAt,
    stability: nextStability,
    difficulty: nextDifficulty,
    elapsedDays: snapshot.elapsedDays,
    scheduledDays: intervalDays,
    reps: snapshot.reps + 1,
    lapses: snapshot.lapses + (rating === "again" ? 1 : 0),
  };
}

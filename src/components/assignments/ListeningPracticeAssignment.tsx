"use client";

import { useState, useRef, useEffect } from "react";
import { Check, X, Eye, Play, Pause } from "lucide-react";
import { normalizePinyin } from "@/lib/assignment-types";
import type { ListeningPracticeConfig, ListeningPracticeSubmissionData } from "@/lib/assignment-types";

interface ListeningPracticeAssignmentProps {
  lessonId: string;
  config: ListeningPracticeConfig;
}

type SentenceState = {
  input: string;
  correct: boolean | null; // null = unchecked
  givenUp: boolean;
  revealed: boolean;
};

export function ListeningPracticeAssignment({ lessonId, config }: ListeningPracticeAssignmentProps) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [sentenceStates, setSentenceStates] = useState<SentenceState[]>(
    () => config.sentences.map(() => ({ input: "", correct: null, givenUp: false, revealed: false })),
  );
  const [allDone, setAllDone] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load existing submission
  useEffect(() => {
    fetch(`/api/assignments/${lessonId}/submission`)
      .then((r) => r.json())
      .then(({ submission }) => {
        if (!submission) return;
        const data: ListeningPracticeSubmissionData = JSON.parse(submission.submissionData);
        setSentenceStates((prev) =>
          prev.map((s, i) => {
            const saved = data.answers.find((a) => a.index === i);
            if (!saved) return s;
            return {
              input: saved.studentPinyin,
              correct: saved.correct,
              givenUp: saved.givenUp,
              revealed: saved.correct || saved.givenUp,
            };
          }),
        );
        setAllDone(data.answers.every((a) => a.correct || a.givenUp));
      })
      .catch(() => null);
  }, [lessonId]);

  const saveProgress = async (states: SentenceState[]) => {
    const answers = states.map((s, i) => ({
      index: i,
      studentPinyin: s.input,
      correct: s.correct ?? false,
      givenUp: s.givenUp,
    }));
    const data: ListeningPracticeSubmissionData = { answers };
    await fetch(`/api/assignments/${lessonId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionData: JSON.stringify(data) }),
    }).catch(() => null);
  };

  const handleCheck = async (i: number) => {
    const sentence = config.sentences[i];
    if (!sentence) return;
    const isCorrect =
      normalizePinyin(sentenceStates[i].input) === normalizePinyin(sentence.expectedPinyin);

    const next = sentenceStates.map((s, idx) =>
      idx === i
        ? { ...s, correct: isCorrect, revealed: isCorrect }
        : s,
    );
    setSentenceStates(next);
    const done = next.every((s) => s.correct || s.givenUp);
    setAllDone(done);
    await saveProgress(next);
  };

  const handleGiveUp = async (i: number) => {
    const next = sentenceStates.map((s, idx) =>
      idx === i ? { ...s, correct: false, givenUp: true, revealed: true } : s,
    );
    setSentenceStates(next);
    const done = next.every((s) => s.correct || s.givenUp);
    setAllDone(done);
    await saveProgress(next);
  };

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (audioPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setAudioPlaying(!audioPlaying);
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Audio player */}
      <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
        <p className="text-sm font-medium text-zinc-300 mb-3">Listen to the audio</p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          src={`/api/assignments/${lessonId}/listening-audio`}
          onEnded={() => setAudioPlaying(false)}
          preload="metadata"
          className="hidden"
        />
        <button
          type="button"
          onClick={toggleAudio}
          className="flex items-center gap-2 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-600 transition-colors"
        >
          {audioPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {audioPlaying ? "Pause" : "Play"}
        </button>
        <p className="mt-2 text-xs text-zinc-500">You can replay any part of the audio at any time.</p>
      </div>

      {/* Sentences */}
      <div className="space-y-5">
        {config.sentences.map((sentence, i) => {
          const s = sentenceStates[i];
          if (!s) return null;
          const isDone = s.correct !== null;

          return (
            <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Sentence {i + 1}</p>
                  <p className="text-base text-white">{sentence.chinese}</p>
                </div>
                {s.correct === true && (
                  <span className="flex items-center gap-1 text-sm font-medium text-green-400">
                    <Check className="w-4 h-4" /> Correct
                  </span>
                )}
                {s.givenUp && (
                  <span className="flex items-center gap-1 text-sm font-medium text-red-400">
                    <X className="w-4 h-4" /> Incorrect
                  </span>
                )}
              </div>

              {s.revealed && (
                <div className="rounded bg-zinc-700/50 px-3 py-2 text-sm text-zinc-300">
                  <span className="text-zinc-500 text-xs mr-2">Answer:</span>
                  {sentence.expectedPinyin}
                </div>
              )}

              {!isDone && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={s.input}
                    onChange={(e) => {
                      const next = sentenceStates.map((x, idx) =>
                        idx === i ? { ...x, input: e.target.value } : x,
                      );
                      setSentenceStates(next);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCheck(i);
                    }}
                    placeholder="Type pinyin here…"
                    className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleCheck(i)}
                    disabled={!s.input.trim()}
                    className="flex items-center gap-1.5 rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGiveUp(i)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    Give Up
                  </button>
                </div>
              )}

              {s.correct === false && !s.givenUp && (
                <p className="text-xs text-orange-400">Not quite — try again!</p>
              )}
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="flex items-start gap-3 rounded-lg border border-green-700/40 bg-green-950/30 p-4">
          <Check className="h-5 w-5 shrink-0 text-green-400 mt-0.5" />
          <p className="text-sm text-green-200">
            All sentences checked! Great listening practice.
          </p>
        </div>
      )}
    </div>
  );
}

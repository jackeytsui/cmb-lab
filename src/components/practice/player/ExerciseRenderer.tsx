"use client";

import type { PracticeExercise } from "@/db/schema/practice";
import type { ExerciseDefinition } from "@/types/exercises";
import { MultipleChoiceRenderer } from "./renderers/MultipleChoiceRenderer";
import { FillInBlankRenderer } from "./renderers/FillInBlankRenderer";
import { MatchingRenderer } from "./renderers/MatchingRenderer";
import { OrderingRenderer } from "./renderers/OrderingRenderer";
import { AudioRecordingRenderer } from "./renderers/AudioRecordingRenderer";
import { FreeTextRenderer } from "./renderers/FreeTextRenderer";
import { VideoRecordingRenderer } from "./renderers/VideoRecordingRenderer";

// ============================================================
// Props
// ============================================================

interface ExerciseRendererProps {
  exercise: PracticeExercise;
  onSubmit: (response: unknown) => void;
  disabled?: boolean;
  savedAnswer?: unknown;
}

// ============================================================
// ExerciseRenderer — polymorphic dispatcher
// ============================================================

export function ExerciseRenderer({
  exercise,
  onSubmit,
  disabled,
  savedAnswer,
}: ExerciseRendererProps) {
  const def = exercise.definition as ExerciseDefinition;
  const lang = exercise.language;

  switch (def.type) {
    case "multiple_choice":
      return (
        <MultipleChoiceRenderer
          definition={def}
          language={lang}
          onSubmit={onSubmit}
          disabled={disabled}
          savedAnswer={savedAnswer as { selectedOptionId: string }}
        />
      );
    case "fill_in_blank":
      return (
        <FillInBlankRenderer
          definition={def}
          language={lang}
          onSubmit={onSubmit}
          disabled={disabled}
          savedAnswer={savedAnswer as { answers: string[] }}
        />
      );
    case "matching":
      return (
        <MatchingRenderer
          definition={def}
          language={lang}
          onSubmit={onSubmit}
          disabled={disabled}
          savedAnswer={savedAnswer as { pairs: { leftId: string; rightId: string }[] }}
        />
      );
    case "ordering":
      return (
        <OrderingRenderer
          definition={def}
          language={lang}
          onSubmit={onSubmit}
          disabled={disabled}
          savedAnswer={savedAnswer as { orderedIds: string[] }}
        />
      );
    case "audio_recording":
      return (
        <AudioRecordingRenderer
          definition={def}
          language={lang}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case "free_text":
      return (
        <FreeTextRenderer
          definition={def}
          language={lang}
          onSubmit={onSubmit}
          disabled={disabled}
          savedAnswer={savedAnswer as { text: string }}
        />
      );
    case "video_recording":
      return (
        <VideoRecordingRenderer
          exerciseId={exercise.id}
          definition={def}
          onAnswer={onSubmit}
          savedAnswer={savedAnswer as string}
          isSubmitted={!!disabled}
        />
      );
    default:
      return (
        <div className="text-zinc-500 p-4 text-center">
          Unknown exercise type
        </div>
      );
  }
}

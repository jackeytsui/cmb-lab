"use client";

import { useState } from "react";
import {
  ListChecks,
  TextCursorInput,
  ArrowLeftRight,
  ListOrdered,
  Mic,
  PenLine,
  Video,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PracticeExercise } from "@/db/schema";
import type { ExerciseDefinition } from "@/types/exercises";
import { MultipleChoiceForm } from "./MultipleChoiceForm";
import { FillInBlankForm } from "./FillInBlankForm";
import { AudioRecordingForm } from "./AudioRecordingForm";
import { FreeTextForm } from "./FreeTextForm";
import { MatchingPairsForm } from "./MatchingPairsForm";
import { OrderingForm } from "./OrderingForm";
import { VideoRecordingForm } from "./video-recording/VideoRecordingFormWrapper";

// ============================================================
// Exercise Type Metadata
// ============================================================

const EXERCISE_TYPES = [
  { value: "multiple_choice", label: "Multiple Choice", icon: ListChecks },
  { value: "fill_in_blank", label: "Fill in Blank", icon: TextCursorInput },
  { value: "matching", label: "Matching", icon: ArrowLeftRight },
  { value: "ordering", label: "Ordering", icon: ListOrdered },
  { value: "audio_recording", label: "Audio Recording", icon: Mic },
  { value: "free_text", label: "Free Text", icon: PenLine },
  { value: "video_recording", label: "Video Response", icon: Video },
] as const;

type ExerciseType = (typeof EXERCISE_TYPES)[number]["value"];

const LANGUAGE_OPTIONS = [
  { value: "cantonese", label: "Cantonese only" },
  { value: "mandarin", label: "Mandarin only" },
  { value: "both", label: "Both languages" },
] as const;

type Language = (typeof LANGUAGE_OPTIONS)[number]["value"];

// ============================================================
// Props
// ============================================================

interface ExerciseFormProps {
  practiceSetId: string;
  exercise?: PracticeExercise; // Existing exercise for edit mode
  onSave: (exercise: PracticeExercise) => void;
  onCancel: () => void;
  onLocalSave?: (data: {
    type: string;
    language: string;
    definition: ExerciseDefinition;
  }) => void;
}

// ============================================================
// Component
// ============================================================

export function ExerciseForm({
  practiceSetId,
  exercise,
  onSave,
  onCancel,
  onLocalSave,
}: ExerciseFormProps) {
  const isEditMode = !!exercise;

  const [exerciseType, setExerciseType] = useState<ExerciseType>(
    (exercise?.type as ExerciseType) ?? "multiple_choice"
  );
  const [language, setLanguage] = useState<Language>(
    (exercise?.language as Language) ?? "both"
  );
  const [isSaving, setIsSaving] = useState(false);

  return (
    <div className="space-y-5 rounded-lg border border-zinc-700 bg-zinc-800 p-5">
      {/* Header */}
      <h3 className="text-lg font-semibold text-white">
        {isEditMode ? "Edit Exercise" : "New Exercise"}
      </h3>

      {/* Exercise Type Selector */}
      <div className="space-y-2">
        <Label className="text-zinc-300">
          Exercise Type <span className="text-red-400">*</span>
        </Label>
        <Select
          value={exerciseType}
          onValueChange={(value) => setExerciseType(value as ExerciseType)}
          disabled={isEditMode}
        >
          <SelectTrigger className="border-zinc-600 bg-zinc-700 text-white disabled:opacity-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-zinc-600 bg-zinc-700">
            {EXERCISE_TYPES.map(({ value, label, icon: Icon }) => (
              <SelectItem
                key={value}
                value={value}
                className="text-white hover:bg-zinc-600"
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-zinc-400" />
                  {label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEditMode && (
          <p className="text-xs text-zinc-500">
            Exercise type cannot be changed after creation.
          </p>
        )}
      </div>

      {/* Language Selector */}
      <div className="space-y-2">
        <Label className="text-zinc-300">
          Language <span className="text-red-400">*</span>
        </Label>
        <Select
          value={language}
          onValueChange={(value) => setLanguage(value as Language)}
        >
          <SelectTrigger className="border-zinc-600 bg-zinc-700 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-zinc-600 bg-zinc-700">
            {LANGUAGE_OPTIONS.map(({ value, label }) => (
              <SelectItem
                key={value}
                value={value}
                className="text-white hover:bg-zinc-600"
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type-Specific Sub-Forms */}
      {exerciseType === "multiple_choice" && (
        <MultipleChoiceForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}
      {exerciseType === "fill_in_blank" && (
        <FillInBlankForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}

      {exerciseType === "matching" && (
        <MatchingPairsForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}
      {exerciseType === "ordering" && (
        <OrderingForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}
      {exerciseType === "audio_recording" && (
        <AudioRecordingForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}
      {exerciseType === "free_text" && (
        <FreeTextForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}
      {exerciseType === "video_recording" && (
        <VideoRecordingForm
          exercise={exercise}
          language={language}
          practiceSetId={practiceSetId}
          onSave={onSave}
          onCancel={onCancel}
          isSaving={isSaving}
          setIsSaving={setIsSaving}
          onLocalSave={onLocalSave}
        />
      )}
    </div>
  );
}

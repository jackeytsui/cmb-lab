import { z } from "zod";

// ============================================================
// TypeScript Interfaces — 6 Exercise Definition Types
// These define the shape of the JSONB `definition` column per exercise type
// ============================================================

export interface MultipleChoiceDefinition {
  type: "multiple_choice";
  question: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  explanation?: string;
}

export interface FillInBlankDefinition {
  type: "fill_in_blank";
  sentence: string; // Use {{blank}} placeholders, e.g. "I {{blank}} to the store {{blank}}."
  blanks: {
    id: string;
    correctAnswer: string;
    acceptableAnswers?: string[];
  }[];
  explanation?: string;
}

export interface MatchingDefinition {
  type: "matching";
  pairs: {
    id: string;
    left: string; // e.g., Chinese character
    right: string; // e.g., English meaning
  }[];
  explanation?: string;
}

export interface OrderingDefinition {
  type: "ordering";
  items: {
    id: string;
    text: string;
    correctPosition: number; // 0-indexed
  }[];
  explanation?: string;
}

export interface AudioRecordingDefinition {
  type: "audio_recording";
  targetPhrase: string; // What the student should say
  referenceText?: string; // Context / translation
  explanation?: string;
}

export interface FreeTextDefinition {
  type: "free_text";
  prompt: string; // The question/instruction
  sampleAnswer?: string; // For AI grading context
  rubric?: string; // Grading criteria for AI
  minLength?: number;
  maxLength?: number;
  explanation?: string;
}

export interface VideoRecordingDefinition {
  type: "video_recording";
  prompt: string; // Text prompt
  videoPromptId?: string; // Optional legacy coach video prompt
  videoThreadId?: string; // ID of the Video Thread (VideoAsk style series)
  explanation?: string;
}

export type ExerciseDefinition =
  | MultipleChoiceDefinition
  | FillInBlankDefinition
  | MatchingDefinition
  | OrderingDefinition
  | AudioRecordingDefinition
  | FreeTextDefinition
  | VideoRecordingDefinition;

// ============================================================
// Zod Schemas — One per exercise type + discriminated union
// ============================================================

export const multipleChoiceSchema = z.object({
  type: z.literal("multiple_choice"),
  question: z.string().min(5),
  options: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1),
      })
    )
    .min(2)
    .max(6),
  correctOptionId: z.string(),
  explanation: z.string().optional(),
});

export const fillInBlankSchema = z.object({
  type: z.literal("fill_in_blank"),
  sentence: z.string().min(5),
  blanks: z
    .array(
      z.object({
        id: z.string(),
        correctAnswer: z.string().min(1),
        acceptableAnswers: z.array(z.string()).optional(),
      })
    )
    .min(1),
  explanation: z.string().optional(),
});

export const matchingSchema = z.object({
  type: z.literal("matching"),
  pairs: z
    .array(
      z.object({
        id: z.string(),
        left: z.string().min(1),
        right: z.string().min(1),
      })
    )
    .min(2)
    .max(10),
  explanation: z.string().optional(),
});

export const orderingSchema = z.object({
  type: z.literal("ordering"),
  items: z
    .array(
      z.object({
        id: z.string(),
        text: z.string().min(1),
        correctPosition: z.number().int().min(0),
      })
    )
    .min(2)
    .max(10),
  explanation: z.string().optional(),
});

export const audioRecordingSchema = z.object({
  type: z.literal("audio_recording"),
  targetPhrase: z.string().min(1),
  referenceText: z.string().optional(),
  explanation: z.string().optional(),
});

export const freeTextSchema = z.object({
  type: z.literal("free_text"),
  prompt: z.string().min(5),
  sampleAnswer: z.string().optional(),
  rubric: z.string().optional(),
  minLength: z.number().int().min(1).optional(),
  maxLength: z.number().int().min(1).optional(),
  explanation: z.string().optional(),
});

export const videoRecordingSchema = z.object({
  type: z.literal("video_recording"),
  prompt: z.string().min(1),
  videoPromptId: z.string().optional(),
  videoThreadId: z.string().optional(),
  explanation: z.string().optional(),
});

export const exerciseDefinitionSchema = z.discriminatedUnion("type", [
  multipleChoiceSchema,
  fillInBlankSchema,
  matchingSchema,
  orderingSchema,
  audioRecordingSchema,
  freeTextSchema,
  videoRecordingSchema,
]);

// ============================================================
// Top-level Exercise Form Schema (metadata + definition)
// ============================================================

export const exerciseFormSchema = z.object({
  practiceSetId: z.string().uuid(),
  type: z.enum([
    "multiple_choice",
    "fill_in_blank",
    "matching",
    "ordering",
    "audio_recording",
    "free_text",
    "video_recording",
  ]),
  language: z.enum(["cantonese", "mandarin", "both"]),
  definition: exerciseDefinitionSchema,
  sortOrder: z.number().optional().default(0),
});

// ============================================================
// Inferred Types from Zod Schemas
// ============================================================

export type ExerciseFormData = z.infer<typeof exerciseFormSchema>;

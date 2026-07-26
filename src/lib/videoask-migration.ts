/**
 * VideoAsk → Video Threads migration transform.
 *
 * Pure functions that convert a raw VideoAsk form export (as returned by
 * GET https://api.videoask.com/forms/{form_id}) into the normalized shape
 * the CMB Lab video-threads system stores:
 *
 *   VideoAsk form      → videoThreads row
 *   VideoAsk question  → videoThreadSteps row (media ingested to Mux separately)
 *   option logic jumps → step.logic  [{ condition, nextStepId }]
 *   default jump       → step.fallbackStepId
 *
 * The VideoAsk API has shipped several field spellings for logic jumps over
 * the years, so target extraction is deliberately tolerant. The migration
 * script keeps the raw JSON export on disk, so if a real export uses a shape
 * not covered here, add it to `extractOptionTarget` / `extractDefaultTarget`
 * and re-run the import — no need to re-export.
 *
 * No I/O happens here — fetching, Mux ingest, and DB writes live in
 * scripts/migrate-videoask.ts. That keeps this file unit-testable
 * (src/lib/__tests__/videoask-migration.test.ts).
 */

// ---------------------------------------------------------------------------
// VideoAsk API shapes (only fields we read; everything optional but ids)
// ---------------------------------------------------------------------------

export interface VideoAskOption {
  option_id?: string | null;
  label?: string | null;
  value?: string | null;
  // Logic jump target — spelling varies by API era
  target_question_id?: string | null;
  jump_to_question_id?: string | null;
  next_question_id?: string | null;
  target?: { question_id?: string | null } | null;
}

export interface VideoAskQuestion {
  question_id: string;
  type?: string | null; // "standard", "multiple_choice", "thank_you", ...
  label?: string | null;
  title?: string | null;
  overlay_text?: string | null;
  transcription?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  thumbnail?: string | null;
  share_url?: string | null;
  allowed_answer_media_types?: string[] | null;
  options?: VideoAskOption[] | null;
  // Question-level default jump — spelling varies by API era
  jump_to_question_id?: string | null;
  default_target_question_id?: string | null;
  target?: { question_id?: string | null } | null;
}

export interface VideoAskForm {
  form_id: string;
  title?: string | null;
  label?: string | null;
  description?: string | null;
  share_url?: string | null;
  respondents_count?: number | null;
  questions?: VideoAskQuestion[] | null;
}

// ---------------------------------------------------------------------------
// Normalized output shapes
// ---------------------------------------------------------------------------

export type StepResponseType =
  | "video"
  | "audio"
  | "text"
  | "multiple_choice"
  | "button";

export interface NormalizedStep {
  /** Original VideoAsk question_id — used to wire logic after DB insert */
  vaQuestionId: string;
  promptText: string | null;
  responseType: StepResponseType;
  allowedResponseTypes: StepResponseType[] | null;
  responseOptions: { options: { label: string; value: string }[] } | null;
  /** Per-option logic jumps, targets still in VideoAsk question ids */
  optionJumps: { optionValue: string; vaTargetQuestionId: string }[];
  /** Question-level default jump, target still a VideoAsk question id */
  defaultJumpVaQuestionId: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  isEndScreen: boolean;
  sortOrder: number;
  positionX: number;
  positionY: number;
}

export interface NormalizedThread {
  vaFormId: string;
  title: string;
  description: string;
  shareUrl: string | null;
  respondentsCount: number | null;
  steps: NormalizedStep[];
}

/** Shape of videoThreadSteps.logic entries (legacy button routing) */
export interface StepLogicEntry {
  condition: string;
  nextStepId: string;
}

// ---------------------------------------------------------------------------
// Idempotency marker
// ---------------------------------------------------------------------------

const MARKER_RE = /\[videoask:([A-Za-z0-9_-]+)\]/;

/** Marker embedded in the thread description so re-runs can skip the form. */
export function videoaskMarker(formId: string): string {
  return `[videoask:${formId}]`;
}

export function extractVideoaskFormId(
  description: string | null | undefined
): string | null {
  if (!description) return null;
  const match = description.match(MARKER_RE);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Target extraction (tolerant across VideoAsk API field spellings)
// ---------------------------------------------------------------------------

function extractOptionTarget(option: VideoAskOption): string | null {
  return (
    option.target_question_id ??
    option.jump_to_question_id ??
    option.next_question_id ??
    option.target?.question_id ??
    null
  );
}

function extractDefaultTarget(question: VideoAskQuestion): string | null {
  return (
    question.jump_to_question_id ??
    question.default_target_question_id ??
    question.target?.question_id ??
    null
  );
}

function optionValue(option: VideoAskOption, index: number): string {
  return option.value ?? option.label ?? option.option_id ?? `option_${index + 1}`;
}

function optionLabel(option: VideoAskOption, index: number): string {
  return option.label ?? option.value ?? `Option ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Response type mapping
// ---------------------------------------------------------------------------

const MEDIA_TYPE_MAP: Record<string, StepResponseType> = {
  video: "video",
  audio: "audio",
  text: "text",
};

function mapResponseTypes(question: VideoAskQuestion): {
  responseType: StepResponseType;
  allowedResponseTypes: StepResponseType[] | null;
} {
  if (question.options && question.options.length > 0) {
    return { responseType: "multiple_choice", allowedResponseTypes: null };
  }

  const allowed = (question.allowed_answer_media_types ?? [])
    .map((t) => MEDIA_TYPE_MAP[t])
    .filter((t): t is StepResponseType => Boolean(t));

  if (allowed.length === 0) {
    // No answer collected — acknowledgement/continue step
    return { responseType: "button", allowedResponseTypes: null };
  }

  return {
    responseType: allowed[0],
    allowedResponseTypes: allowed.length > 1 ? allowed : null,
  };
}

function isEndScreenQuestion(question: VideoAskQuestion): boolean {
  const type = (question.type ?? "").toLowerCase();
  if (type.includes("thank") || type.includes("end")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Form → normalized thread
// ---------------------------------------------------------------------------

const NODE_SPACING_X = 320;
const NODE_START_X = 60;
const NODE_Y = 150;

export function transformForm(form: VideoAskForm): NormalizedThread {
  const questions = form.questions ?? [];
  const title = form.title ?? form.label ?? `VideoAsk ${form.form_id}`;

  const descriptionParts = [
    form.description?.trim(),
    `Migrated from VideoAsk. ${videoaskMarker(form.form_id)}`,
  ].filter(Boolean);

  const steps: NormalizedStep[] = questions.map((question, index) => {
    const { responseType, allowedResponseTypes } = mapResponseTypes(question);

    const options = (question.options ?? []).map((opt, i) => ({
      label: optionLabel(opt, i),
      value: optionValue(opt, i),
    }));

    const optionJumps = (question.options ?? []).flatMap((opt, i) => {
      const target = extractOptionTarget(opt);
      return target
        ? [{ optionValue: optionValue(opt, i), vaTargetQuestionId: target }]
        : [];
    });

    return {
      vaQuestionId: question.question_id,
      promptText:
        question.overlay_text ?? question.title ?? question.label ?? null,
      responseType,
      allowedResponseTypes,
      responseOptions: options.length > 0 ? { options } : null,
      optionJumps,
      defaultJumpVaQuestionId: extractDefaultTarget(question),
      mediaUrl: question.media_url ?? null,
      thumbnailUrl: question.thumbnail ?? null,
      isEndScreen: isEndScreenQuestion(question),
      sortOrder: index,
      positionX: NODE_START_X + index * NODE_SPACING_X,
      positionY: NODE_Y,
    };
  });

  // A question nothing jumps to and that collects no answer at the end of the
  // form acts as an end screen even without an explicit type.
  if (steps.length > 0) {
    const last = steps[steps.length - 1];
    if (last.responseType === "button" && last.optionJumps.length === 0) {
      last.isEndScreen = true;
    }
  }

  return {
    vaFormId: form.form_id,
    title,
    description: descriptionParts.join("\n\n"),
    shareUrl: form.share_url ?? null,
    respondentsCount: form.respondents_count ?? null,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Logic resolution (after steps are inserted and DB uuids are known)
// ---------------------------------------------------------------------------

export interface ResolvedConnections {
  logic: StepLogicEntry[] | null;
  fallbackStepId: string | null;
  /** VideoAsk question ids referenced by jumps but missing from the id map */
  unresolved: string[];
}

/**
 * Convert a step's VideoAsk-id jumps into DB uuids.
 * `idMap` maps vaQuestionId → inserted videoThreadSteps.id.
 */
export function resolveStepConnections(
  step: NormalizedStep,
  idMap: Map<string, string>
): ResolvedConnections {
  const unresolved: string[] = [];

  const logic: StepLogicEntry[] = [];
  for (const jump of step.optionJumps) {
    const target = idMap.get(jump.vaTargetQuestionId);
    if (target) {
      logic.push({ condition: jump.optionValue, nextStepId: target });
    } else {
      unresolved.push(jump.vaTargetQuestionId);
    }
  }

  let fallbackStepId: string | null = null;
  if (step.defaultJumpVaQuestionId) {
    const target = idMap.get(step.defaultJumpVaQuestionId);
    if (target) {
      fallbackStepId = target;
    } else {
      unresolved.push(step.defaultJumpVaQuestionId);
    }
  }

  return {
    logic: logic.length > 0 ? logic : null,
    fallbackStepId,
    unresolved,
  };
}

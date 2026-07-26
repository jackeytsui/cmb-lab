/**
 * VideoAsk → Video Threads migration transform.
 *
 * Pure functions that convert a raw VideoAsk form export (as returned by
 * GET https://api.videoask.com/forms/{form_id}) into the normalized shape
 * the CMB Lab video-threads system stores:
 *
 *   VideoAsk form           → videoThreads row
 *   VideoAsk question       → videoThreadSteps row (media ingested to Mux separately)
 *   logic_actions op "is"   → step.logic  [{ condition: optionContent, nextStepId }]
 *   logic_actions op "always" → step.fallbackStepId
 *   jump to "goodbye"       → synthetic end-screen step appended to the thread
 *   canvas_metadata         → step positions (scaled to the React Flow builder)
 *
 * Field shapes here were verified against a real export of all 439 forms in
 * the CantoMando VideoAsk account (2026-07-26):
 *   - question.type is "standard" or "poll"
 *   - choices live in question.poll_options[] with `content` labels
 *   - branching lives in question.logic_actions[]:
 *       { action: "jump",
 *         details: { to: { type: "question"|"goodbye"|"url", value } },
 *         condition: { op: "always"|"is",
 *                      vars: [{type:"question",value},{type:"option",value}] } }
 *
 * No I/O happens here — fetching, Mux ingest, and DB writes live in
 * scripts/migrate-videoask.ts. That keeps this file unit-testable
 * (src/lib/__tests__/videoask-migration.test.ts).
 */

// ---------------------------------------------------------------------------
// VideoAsk API shapes (only fields we read)
// ---------------------------------------------------------------------------

export interface VideoAskLogicVar {
  type?: string | null; // "question" | "option"
  value?: string | null;
}

export interface VideoAskLogicAction {
  action?: string | null; // "jump"
  details?: {
    to?: { type?: string | null; value?: string | null } | null;
  } | null;
  condition?: {
    op?: string | null; // "always" | "is"
    vars?: VideoAskLogicVar[] | null;
  } | null;
}

export interface VideoAskPollOption {
  id?: string | null;
  option_id?: string | null;
  content?: string | null;
  ref?: string | null;
}

export interface VideoAskQuestion {
  question_id: string;
  type?: string | null; // "standard" | "poll"
  label?: string | null;
  title?: string | null;
  transcription?: string | null;
  media_type?: string | null;
  media_url?: string | null;
  media_duration?: number | null;
  thumbnail?: string | null;
  share_url?: string | null;
  allowed_answer_media_types?: string[] | null;
  poll_options?: VideoAskPollOption[] | null;
  allow_multiple_selection?: boolean | null;
  logic_actions?: VideoAskLogicAction[] | null;
}

export interface VideoAskForm {
  form_id: string;
  title?: string | null;
  status?: string | null;
  share_url?: string | null;
  respondents_count?: number | null;
  questions?: VideoAskQuestion[] | null;
  canvas_metadata?: {
    positions?: Record<string, { x?: number | null; y?: number | null }> | null;
  } | null;
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

/**
 * Sentinel jump target for VideoAsk's "goodbye" end screen. The transform
 * appends one synthetic end step per thread and registers it in the id map
 * under this key, so goodbye jumps resolve like any question jump.
 */
export const GOODBYE_TARGET = "__goodbye__";

export interface NormalizedStep {
  /** Original VideoAsk question_id (or GOODBYE_TARGET for the synthetic end step) */
  vaQuestionId: string;
  promptText: string | null;
  responseType: StepResponseType;
  allowedResponseTypes: StepResponseType[] | null;
  responseOptions: { options: { label: string; value: string }[] } | null;
  /** Per-option jumps; target is a VideoAsk question id or GOODBYE_TARGET */
  optionJumps: { optionValue: string; vaTargetQuestionId: string }[];
  /** Unconditional jump; a VideoAsk question id or GOODBYE_TARGET */
  defaultJumpVaQuestionId: string | null;
  /** Jumps to external URLs — not supported by the thread player, surfaced for review */
  externalUrlJumps: string[];
  /** Conditions referencing other questions — can't map to the player's per-step logic */
  crossQuestionConditions: number;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  mediaDurationSeconds: number | null;
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
  status: string | null;
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
  if (question.poll_options && question.poll_options.length > 0) {
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

function optionContent(option: VideoAskPollOption, index: number): string {
  return option.content ?? option.option_id ?? option.id ?? `Option ${index + 1}`;
}

// ---------------------------------------------------------------------------
// Logic actions → jumps
// ---------------------------------------------------------------------------

interface ExtractedJumps {
  optionJumps: { optionValue: string; vaTargetQuestionId: string }[];
  defaultJump: string | null;
  externalUrlJumps: string[];
  crossQuestionConditions: number;
}

function extractJumps(question: VideoAskQuestion): ExtractedJumps {
  const optionContentById = new Map<string, string>();
  (question.poll_options ?? []).forEach((opt, i) => {
    const content = optionContent(opt, i);
    if (opt.option_id) optionContentById.set(opt.option_id, content);
    if (opt.id) optionContentById.set(opt.id, content);
  });

  const result: ExtractedJumps = {
    optionJumps: [],
    defaultJump: null,
    externalUrlJumps: [],
    crossQuestionConditions: 0,
  };

  for (const action of question.logic_actions ?? []) {
    if (action.action !== "jump") continue;
    const to = action.details?.to;
    if (!to?.type) continue;

    if (to.type === "url") {
      if (to.value) result.externalUrlJumps.push(to.value);
      continue;
    }

    const target =
      to.type === "goodbye" ? GOODBYE_TARGET : to.type === "question" ? to.value : null;
    if (!target) continue;

    const op = action.condition?.op ?? "always";

    if (op === "always") {
      // Last "always" wins if several exist (VideoAsk UIs only produce one)
      result.defaultJump = target;
      continue;
    }

    if (op === "is") {
      const vars = action.condition?.vars ?? [];
      const questionVar = vars.find((v) => v.type === "question")?.value;
      const optionVar = vars.find((v) => v.type === "option")?.value;

      // The player evaluates step.logic against the CURRENT step's answer, so
      // only same-question conditions can be wired. Cross-question conditions
      // are counted and surfaced for manual review.
      if (questionVar && questionVar !== question.question_id) {
        result.crossQuestionConditions++;
        continue;
      }

      const content = optionVar ? optionContentById.get(optionVar) : undefined;
      if (content) {
        result.optionJumps.push({
          optionValue: content,
          vaTargetQuestionId: target,
        });
      } else {
        result.crossQuestionConditions++;
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Canvas positions
// ---------------------------------------------------------------------------

// VideoAsk's canvas spaces nodes ~480px apart; the CMB builder uses ~320px.
const POSITION_SCALE = 1 / 1.5;
const NODE_SPACING_X = 320;
const NODE_START_X = 60;
const NODE_Y = 150;

function stepPosition(
  form: VideoAskForm,
  questionId: string,
  index: number
): { x: number; y: number } {
  const pos = form.canvas_metadata?.positions?.[`question:${questionId}`];
  if (pos && typeof pos.x === "number") {
    return {
      x: NODE_START_X + Math.round(pos.x * POSITION_SCALE),
      y: NODE_Y + Math.round((pos.y ?? 0) * POSITION_SCALE),
    };
  }
  return { x: NODE_START_X + index * NODE_SPACING_X, y: NODE_Y };
}

// ---------------------------------------------------------------------------
// Form → normalized thread
// ---------------------------------------------------------------------------

const GOODBYE_PROMPT = "You're all done — thanks!";

export function transformForm(form: VideoAskForm): NormalizedThread {
  const questions = form.questions ?? [];
  const title = form.title ?? `VideoAsk ${form.form_id}`;

  const description = `Migrated from VideoAsk. ${videoaskMarker(form.form_id)}`;

  const steps: NormalizedStep[] = questions.map((question, index) => {
    const { responseType, allowedResponseTypes } = mapResponseTypes(question);
    const jumps = extractJumps(question);

    const options = (question.poll_options ?? []).map((opt, i) => {
      const content = optionContent(opt, i);
      return { label: content, value: content };
    });

    const { x, y } = stepPosition(form, question.question_id, index);

    return {
      vaQuestionId: question.question_id,
      promptText: question.title ?? question.label ?? null,
      responseType,
      allowedResponseTypes,
      responseOptions: options.length > 0 ? { options } : null,
      optionJumps: jumps.optionJumps,
      defaultJumpVaQuestionId: jumps.defaultJump,
      externalUrlJumps: jumps.externalUrlJumps,
      crossQuestionConditions: jumps.crossQuestionConditions,
      mediaUrl: question.media_url ?? null,
      thumbnailUrl: question.thumbnail ?? null,
      mediaDurationSeconds:
        typeof question.media_duration === "number"
          ? Math.round(question.media_duration)
          : null,
      isEndScreen: false,
      sortOrder: index,
      positionX: x,
      positionY: y,
    };
  });

  // Any jump to VideoAsk's "goodbye" screen needs a landing step, otherwise
  // the player's implicit sortOrder+1 fallthrough would continue past the
  // intended end of a branch. Append one synthetic end screen and route all
  // goodbye jumps to it.
  const needsGoodbye = steps.some(
    (s) =>
      s.defaultJumpVaQuestionId === GOODBYE_TARGET ||
      s.optionJumps.some((j) => j.vaTargetQuestionId === GOODBYE_TARGET)
  );

  if (needsGoodbye) {
    const rightmostX = Math.max(...steps.map((s) => s.positionX), 0);
    steps.push({
      vaQuestionId: GOODBYE_TARGET,
      promptText: GOODBYE_PROMPT,
      responseType: "button",
      allowedResponseTypes: null,
      responseOptions: null,
      optionJumps: [],
      defaultJumpVaQuestionId: null,
      externalUrlJumps: [],
      crossQuestionConditions: 0,
      mediaUrl: null,
      thumbnailUrl: null,
      mediaDurationSeconds: null,
      isEndScreen: true,
      sortOrder: steps.length,
      positionX: rightmostX + NODE_SPACING_X,
      positionY: NODE_Y,
    });
  } else if (steps.length > 0) {
    // Linear form with no explicit goodbye: the last step ends the thread.
    const last = steps[steps.length - 1];
    if (last.responseType === "button" && last.optionJumps.length === 0) {
      last.isEndScreen = true;
    }
  }

  return {
    vaFormId: form.form_id,
    title,
    description,
    shareUrl: form.share_url ?? null,
    status: form.status ?? null,
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
  /** Jump targets missing from the id map (never silently written) */
  unresolved: string[];
}

/**
 * Convert a step's VideoAsk-id jumps into DB uuids.
 * `idMap` maps vaQuestionId → inserted videoThreadSteps.id, and must include
 * GOODBYE_TARGET when the thread has a synthetic end step.
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

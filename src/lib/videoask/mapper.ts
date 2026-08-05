import type { ResponseType } from "@/types/video-thread-player";

type JsonObject = Record<string, unknown>;

export type NormalizedVideoAskOption = {
  label: string;
  value: string;
  aliases: string[];
};

export type NormalizedVideoAskLogicEdge = {
  conditionValue: string | null;
  targetQuestionId: string | null;
  isDefault: boolean;
  source: JsonObject;
};

export type NormalizedVideoAskQuestion = {
  id: string;
  label: string;
  title: string;
  promptText: string;
  transcription: string | null;
  mediaId: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  responseType: ResponseType;
  allowedResponseTypes: ResponseType[];
  options: NormalizedVideoAskOption[];
  logicEdges: NormalizedVideoAskLogicEdge[];
  explicitEnd: boolean;
  warnings: string[];
  source: JsonObject;
};

export type NormalizedVideoAskForm = {
  id: string;
  title: string;
  folderId: string | null;
  folderName: string | null;
  shareUrl: string | null;
  updatedAt: Date | null;
  description: string | null;
  questions: NormalizedVideoAskQuestion[];
  warnings: string[];
  source: JsonObject;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function asObjects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonObject =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
    : [];
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function scalarStrings(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(scalarStrings);
  if (value && typeof value === "object") {
    return Object.values(value as JsonObject).flatMap(scalarStrings);
  }
  return [];
}

function normalizeOption(option: JsonObject, index: number): NormalizedVideoAskOption {
  const label =
    stringValue(option.content, option.label, option.title) ??
    `Option ${index + 1}`;
  const canonical =
    stringValue(option.option_id, option.id, option.ref, option.value) ?? label;
  return {
    label,
    value: canonical,
    aliases: unique(
      [
        canonical,
        label,
        stringValue(option.option_id),
        stringValue(option.id),
        stringValue(option.ref),
        stringValue(option.value),
      ].filter((value): value is string => Boolean(value)),
    ),
  };
}

function normalizeAllowedResponseTypes(
  questionType: string,
  rawAllowed: unknown,
  hasOptions: boolean,
): { primary: ResponseType; allowed: ResponseType[] } {
  if (hasOptions || questionType === "poll" || questionType === "nps") {
    return { primary: "multiple_choice", allowed: ["multiple_choice"] };
  }

  const supported = new Set<ResponseType>(["video", "audio", "text"]);
  const allowed = Array.isArray(rawAllowed)
    ? unique(
        rawAllowed
          .map((value) => String(value).toLowerCase() as ResponseType)
          .filter((value) => supported.has(value)),
      )
    : [];

  if (allowed.length > 0) return { primary: allowed[0], allowed };
  return { primary: "button", allowed: ["button"] };
}

function normalizeTarget(action: JsonObject): {
  questionId: string | null;
  isGoodbye: boolean;
} {
  const details = asObject(action.details);
  const target = asObject(details.to);
  const targetType = stringValue(target.type)?.toLowerCase();
  const targetValue = stringValue(target.value, details.question_id);
  if (targetType === "goodbye" || targetType === "end") {
    return { questionId: null, isGoodbye: true };
  }
  return {
    questionId: targetValue,
    isGoodbye: false,
  };
}

function normalizeLogic(
  actions: JsonObject[],
  options: NormalizedVideoAskOption[],
): {
  edges: NormalizedVideoAskLogicEdge[];
  explicitEnd: boolean;
  warnings: string[];
} {
  const edges: NormalizedVideoAskLogicEdge[] = [];
  const warnings: string[] = [];
  let explicitEnd = false;

  for (const action of actions) {
    if (stringValue(action.action)?.toLowerCase() !== "jump") {
      warnings.push(`Unsupported logic action: ${stringValue(action.action) ?? "unknown"}`);
      continue;
    }

    const condition = asObject(action.condition);
    const operator = stringValue(condition.op)?.toLowerCase();
    const isDefault = !operator || operator === "always";
    const target = normalizeTarget(action);
    if (!target.isGoodbye && !target.questionId) {
      warnings.push("A jump action has no recognized destination");
      continue;
    }

    if (isDefault) {
      edges.push({
        conditionValue: null,
        targetQuestionId: target.questionId,
        isDefault: true,
        source: action,
      });
      if (target.isGoodbye) explicitEnd = true;
      continue;
    }

    const conditionValues = scalarStrings(condition.vars);
    const matchingOption = options.find((option) =>
      option.aliases.some((alias) => conditionValues.includes(alias)),
    );
    const conditionValue = matchingOption?.value ?? conditionValues.at(-1) ?? null;
    if (!matchingOption && options.length > 0) {
      warnings.push(
        `Could not tie a logic condition to a choice: ${conditionValues.join(", ")}`,
      );
    }
    if (!conditionValue) {
      warnings.push("A conditional jump has no recognized answer value");
      continue;
    }
    edges.push({
      conditionValue,
      targetQuestionId: target.questionId,
      isDefault: false,
      source: action,
    });
  }

  return { edges, explicitEnd, warnings };
}

function questionSortValue(question: JsonObject, fallback: number) {
  const label = Number(question.label);
  return Number.isFinite(label) ? label : fallback;
}

export function normalizeVideoAskForm(payload: unknown): NormalizedVideoAskForm {
  const source = asObject(payload);
  const id = stringValue(source.form_id, source.id);
  if (!id) throw new Error("VideoAsk form is missing form_id");

  const formMetadata = asObject(source.metadata);
  const rawQuestions = asObjects(source.questions);
  const warnings: string[] = [];

  const questions = rawQuestions
    .map((question, index) => ({ question, index }))
    .sort(
      (a, b) =>
        questionSortValue(a.question, a.index) -
        questionSortValue(b.question, b.index),
    )
    .map(({ question }, index): NormalizedVideoAskQuestion => {
      const questionId = stringValue(question.question_id, question.id);
      if (!questionId) {
        throw new Error(`VideoAsk form ${id} has a step without question_id`);
      }
      const metadata = asObject(question.metadata);
      const questionType =
        stringValue(question.type)?.toLowerCase() ?? "standard";
      const options = asObjects(question.poll_options).map(normalizeOption);
      const response = normalizeAllowedResponseTypes(
        questionType,
        question.allowed_answer_media_types,
        options.length > 0,
      );
      const logic = normalizeLogic(asObjects(question.logic_actions), options);
      warnings.push(
        ...logic.warnings.map(
          (warning) => `Step ${stringValue(question.label) ?? index + 1}: ${warning}`,
        ),
      );

      const prompt =
        stringValue(metadata.text, question.title) ?? `Step ${index + 1}`;
      return {
        id: questionId,
        label: stringValue(question.label) ?? String(index + 1),
        title: stringValue(question.title) ?? prompt,
        promptText: prompt,
        transcription: stringValue(
          question.transcription,
          metadata.transcription,
        ),
        mediaId: stringValue(question.media_id),
        mediaType: stringValue(question.media_type)?.toLowerCase() ?? null,
        mediaUrl: stringValue(question.media_url),
        thumbnailUrl: stringValue(question.thumbnail, question.thumbnail_url),
        responseType: response.primary,
        allowedResponseTypes: response.allowed,
        options:
          response.primary === "button" && options.length === 0
            ? [{ label: "Continue", value: "continue", aliases: ["continue"] }]
            : options,
        logicEdges: logic.edges,
        explicitEnd: logic.explicitEnd,
        warnings: logic.warnings,
        source: question,
      };
    });

  if (questions.length === 0) warnings.push("Form has no questions");

  const folder = asObject(source.folder);
  return {
    id,
    title: stringValue(source.title, source.name) ?? "Untitled VideoAsk",
    folderId: stringValue(source.folder_id, folder.id),
    folderName: stringValue(source.folder_name, folder.name),
    shareUrl: stringValue(source.share_url),
    updatedAt: dateValue(source.updated_at),
    description: stringValue(
      formMetadata.description,
      formMetadata.text,
      source.description,
    ),
    questions,
    warnings,
    source,
  };
}

export function videoAskFolderKey(folderId: string | null) {
  return folderId || "__root__";
}

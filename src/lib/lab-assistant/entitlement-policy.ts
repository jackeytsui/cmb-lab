export type LabAssistantCoachingAccess = {
  innerCircle: boolean;
  oneOnOne: boolean;
};

export type RestrictedCoachingTopic = "inner_circle" | "one_on_one";

const INNER_CIRCLE_PATTERN =
  /\bicgc\b|inner[\s-]*circle|group[\s-]*(?:coaching|session|class|call)/i;
const ONE_ON_ONE_PATTERN =
  /\b1\s*[:/-]\s*1\b|\bone[\s-]*(?:on|to)[\s-]*one\b/i;
const COACHING_FOLLOW_UP_PATTERN =
  /\b(?:join|link|url|zoom|meeting|session|recording|replay|call|today|tonight|tomorrow|schedule|calendar|time|where|when|send|repeat)\b/i;

const NO_AUTHORIZED_RESULTS =
  "No information available for features outside this student's verified access.";

/**
 * Detect protected coaching topics from the recent conversation, not just the
 * latest message. This covers follow-ups such as “send me the link” after the
 * student previously mentioned ICGC.
 */
export function detectRestrictedCoachingTopic(
  recentConversationText: readonly string[],
): RestrictedCoachingTopic | null {
  const recent = recentConversationText.slice(-8);
  const latest = recent.at(-1) ?? "";
  if (INNER_CIRCLE_PATTERN.test(latest)) return "inner_circle";
  if (ONE_ON_ONE_PATTERN.test(latest)) return "one_on_one";

  // Carry the protected topic across turns only for a genuine follow-up. An
  // unrelated later question must not inherit a stale coaching topic.
  if (!COACHING_FOLLOW_UP_PATTERN.test(latest)) return null;
  const previous = recent.slice(0, -1).join("\n");
  if (INNER_CIRCLE_PATTERN.test(previous)) return "inner_circle";
  if (ONE_ON_ONE_PATTERN.test(previous)) return "one_on_one";
  return null;
}

export function canAccessRestrictedCoachingTopic(
  access: LabAssistantCoachingAccess,
  topic: RestrictedCoachingTopic,
): boolean {
  return topic === "inner_circle" ? access.innerCircle : access.oneOnOne;
}

export function restrictedCoachingReply(
  topic: RestrictedCoachingTopic,
): string {
  const label =
    topic === "inner_circle" ? "Inner Circle Group Coaching" : "1:1 Coaching";
  return `${label} isn’t included in your current CMB Lab access, so I can’t provide its private session or join links. If you think your access is incorrect, tell me and I’ll ask the support team to check it.`;
}

/**
 * Defense in depth for RAG results. Published help content can contain private
 * coaching URLs, so remove any protected blocks that the signed-in student is
 * not entitled to see before the text reaches the model.
 */
export function filterKnowledgeForCoachingAccess(
  knowledge: string,
  access: LabAssistantCoachingAccess,
): string {
  const allowedBlocks = knowledge.split(/\n{2,}/).filter((block) => {
    if (!access.innerCircle && INNER_CIRCLE_PATTERN.test(block)) return false;
    if (!access.oneOnOne && ONE_ON_ONE_PATTERN.test(block)) return false;
    return true;
  });

  return allowedBlocks.join("\n\n").trim() || NO_AUTHORIZED_RESULTS;
}

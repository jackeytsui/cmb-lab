export type AssignmentCorrectionOperation = "replace" | "delete" | "insert";

export interface AssignmentCorrectionChange {
  operation?: AssignmentCorrectionOperation;
  startOffset: number;
  endOffset: number;
  originalText: string;
  suggestedChinese: string;
}

export function correctionOperation(
  change: Pick<AssignmentCorrectionChange, "operation">,
): AssignmentCorrectionOperation {
  return change.operation ?? "replace";
}

export function isValidCorrectionChange(
  change: AssignmentCorrectionChange,
  originalSentence: string,
): boolean {
  const { startOffset, endOffset, originalText, suggestedChinese } = change;
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    endOffset < startOffset ||
    endOffset > originalSentence.length
  ) {
    return false;
  }

  const operation = correctionOperation(change);
  if (operation === "insert") {
    return (
      startOffset === endOffset &&
      originalText === "" &&
      suggestedChinese.trim().length > 0
    );
  }

  if (
    endOffset <= startOffset ||
    originalSentence.slice(startOffset, endOffset) !== originalText
  ) {
    return false;
  }

  if (operation === "delete") {
    return suggestedChinese === "";
  }

  return suggestedChinese.trim().length > 0;
}

/**
 * Non-empty ranges may touch but not overlap. Insertions may sit at a range
 * boundary, but not inside a changed range or on another insertion point.
 */
export function hasConflictingCorrectionChanges(
  changes: AssignmentCorrectionChange[],
): boolean {
  const ranged = changes
    .filter((change) => correctionOperation(change) !== "insert")
    .sort((a, b) => a.startOffset - b.startOffset);

  for (let index = 1; index < ranged.length; index += 1) {
    if (ranged[index].startOffset < ranged[index - 1].endOffset) return true;
  }

  const insertionOffsets = new Set<number>();
  for (const change of changes) {
    if (correctionOperation(change) !== "insert") continue;
    if (insertionOffsets.has(change.startOffset)) return true;
    insertionOffsets.add(change.startOffset);

    if (
      ranged.some(
        (range) =>
          change.startOffset > range.startOffset &&
          change.startOffset < range.endOffset,
      )
    ) {
      return true;
    }
  }

  return false;
}

/** Build the clean suggested sentence from the reviewer's tracked changes. */
export function applyCorrectionChanges(
  originalSentence: string,
  changes: AssignmentCorrectionChange[],
): string {
  const sorted = [...changes].sort((a, b) => {
    if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
    if (correctionOperation(a) === "insert") return -1;
    if (correctionOperation(b) === "insert") return 1;
    return a.endOffset - b.endOffset;
  });

  let cursor = 0;
  let result = "";
  for (const change of sorted) {
    const operation = correctionOperation(change);
    if (operation === "insert") {
      if (change.startOffset < cursor) continue;
      result += originalSentence.slice(cursor, change.startOffset);
      result += change.suggestedChinese;
      cursor = change.startOffset;
      continue;
    }

    if (change.startOffset < cursor) continue;
    result += originalSentence.slice(cursor, change.startOffset);
    if (operation === "replace") result += change.suggestedChinese;
    cursor = change.endOffset;
  }

  return result + originalSentence.slice(cursor);
}

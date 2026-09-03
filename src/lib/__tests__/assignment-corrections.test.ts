import { describe, expect, it } from "vitest";
import {
  applyCorrectionChanges,
  hasConflictingCorrectionChanges,
  isValidCorrectionChange,
  type AssignmentCorrectionChange,
} from "../assignment-corrections";

const replacement: AssignmentCorrectionChange = {
  operation: "replace",
  startOffset: 1,
  endOffset: 3,
  originalText: "今天",
  suggestedChinese: "昨日",
};

describe("isValidCorrectionChange", () => {
  const sentence = "我今天上课";

  it("validates replace, delete, and insert operations", () => {
    expect(isValidCorrectionChange(replacement, sentence)).toBe(true);
    expect(
      isValidCorrectionChange(
        {
          operation: "delete",
          startOffset: 3,
          endOffset: 4,
          originalText: "上",
          suggestedChinese: "",
        },
        sentence,
      ),
    ).toBe(true);
    expect(
      isValidCorrectionChange(
        {
          operation: "insert",
          startOffset: 3,
          endOffset: 3,
          originalText: "",
          suggestedChinese: "去",
        },
        sentence,
      ),
    ).toBe(true);
  });

  it("rejects malformed operation shapes", () => {
    expect(
      isValidCorrectionChange(
        { ...replacement, operation: "insert", originalText: "今天" },
        sentence,
      ),
    ).toBe(false);
    expect(
      isValidCorrectionChange(
        { ...replacement, operation: "delete", suggestedChinese: "昨日" },
        sentence,
      ),
    ).toBe(false);
    expect(
      isValidCorrectionChange(
        { ...replacement, originalText: "明天" },
        sentence,
      ),
    ).toBe(false);
  });
});

describe("hasConflictingCorrectionChanges", () => {
  it("allows boundary insertions and touching ranges", () => {
    expect(
      hasConflictingCorrectionChanges([
        replacement,
        {
          operation: "insert",
          startOffset: 3,
          endOffset: 3,
          originalText: "",
          suggestedChinese: "去",
        },
        {
          operation: "delete",
          startOffset: 3,
          endOffset: 4,
          originalText: "上",
          suggestedChinese: "",
        },
      ]),
    ).toBe(false);
  });

  it("rejects duplicate insertions and insertions inside changed ranges", () => {
    const insertion: AssignmentCorrectionChange = {
      operation: "insert",
      startOffset: 2,
      endOffset: 2,
      originalText: "",
      suggestedChinese: "很",
    };
    expect(hasConflictingCorrectionChanges([replacement, insertion])).toBe(
      true,
    );
    expect(
      hasConflictingCorrectionChanges([
        insertion,
        { ...insertion, suggestedChinese: "也" },
      ]),
    ).toBe(true);
  });
});

describe("applyCorrectionChanges", () => {
  it("combines replacements, removals, and additions into one sentence", () => {
    expect(
      applyCorrectionChanges("我今天很去学校", [
        replacement,
        {
          operation: "delete",
          startOffset: 3,
          endOffset: 4,
          originalText: "很",
          suggestedChinese: "",
        },
        {
          operation: "insert",
          startOffset: 5,
          endOffset: 5,
          originalText: "",
          suggestedChinese: "了",
        },
      ]),
    ).toBe("我昨日去了学校");
  });

  it("treats legacy corrections without an operation as replacements", () => {
    expect(applyCorrectionChanges("我今天上课", [replacement])).toBe(
      "我昨日上课",
    );
  });
});

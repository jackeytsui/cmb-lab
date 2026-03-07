import { describe, it, expect } from "vitest";
import {
  gradeMultipleChoice,
  gradeFillInBlank,
  gradeMatching,
  gradeOrdering,
  type GradeResult,
} from "@/lib/practice-grading";
import type {
  MultipleChoiceDefinition,
  FillInBlankDefinition,
  MatchingDefinition,
  OrderingDefinition,
} from "@/types/exercises";

// ============================================================
// gradeMultipleChoice
// ============================================================

describe("gradeMultipleChoice", () => {
  const definition: MultipleChoiceDefinition = {
    type: "multiple_choice",
    question: "What does '你好' mean?",
    options: [
      { id: "a", text: "Goodbye" },
      { id: "b", text: "Hello" },
      { id: "c", text: "Thank you" },
    ],
    correctOptionId: "b",
    explanation: "你好 (nǐ hǎo) is the standard Mandarin greeting.",
  };

  it("returns isCorrect=true and score=100 when selectedOptionId matches correctOptionId", () => {
    const result: GradeResult = gradeMultipleChoice("b", definition);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
    expect(result.feedback).toContain("Correct");
  });

  it("returns isCorrect=false and score=0 when selectedOptionId does NOT match", () => {
    const result: GradeResult = gradeMultipleChoice("a", definition);
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
    expect(result.feedback).toContain("Hello"); // shows correct answer text
  });

  it("includes explanation when present in definition", () => {
    const result: GradeResult = gradeMultipleChoice("b", definition);
    expect(result.explanation).toBe(
      "你好 (nǐ hǎo) is the standard Mandarin greeting."
    );
  });

  it("omits explanation when not present in definition", () => {
    const noExplanation: MultipleChoiceDefinition = {
      type: "multiple_choice",
      question: "Pick one",
      options: [
        { id: "x", text: "X" },
        { id: "y", text: "Y" },
      ],
      correctOptionId: "x",
    };
    const result: GradeResult = gradeMultipleChoice("x", noExplanation);
    expect(result.explanation).toBeUndefined();
  });
});

// ============================================================
// gradeFillInBlank
// ============================================================

describe("gradeFillInBlank", () => {
  const definition: FillInBlankDefinition = {
    type: "fill_in_blank",
    sentence: "I {{blank}} to the {{blank}} yesterday.",
    blanks: [
      {
        id: "b1",
        correctAnswer: "went",
        acceptableAnswers: ["walked"],
      },
      {
        id: "b2",
        correctAnswer: "store",
      },
    ],
    explanation: "Simple past tense exercise.",
  };

  it("returns score=100 and isCorrect=true when all blanks are correct", () => {
    const result: GradeResult = gradeFillInBlank(["went", "store"], definition);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("returns partial score when some blanks are correct (1 of 2)", () => {
    const result: GradeResult = gradeFillInBlank(
      ["went", "market"],
      definition
    );
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(50);
  });

  it("handles case-insensitive comparison", () => {
    const result: GradeResult = gradeFillInBlank(["Went", "Store"], definition);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("trims whitespace from student answers", () => {
    const result: GradeResult = gradeFillInBlank(
      [" went ", " store "],
      definition
    );
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("accepts acceptable answers (not just correctAnswer)", () => {
    const result: GradeResult = gradeFillInBlank(
      ["walked", "store"],
      definition
    );
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("handles Chinese characters correctly (trim/lowercase does not break them)", () => {
    const chineseDef: FillInBlankDefinition = {
      type: "fill_in_blank",
      sentence: "{{blank}}是我的朋友。",
      blanks: [
        {
          id: "b1",
          correctAnswer: "他",
          acceptableAnswers: ["她"],
        },
      ],
    };
    const result: GradeResult = gradeFillInBlank([" 他 "], chineseDef);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });
});

// ============================================================
// gradeMatching
// ============================================================

describe("gradeMatching", () => {
  const definition: MatchingDefinition = {
    type: "matching",
    pairs: [
      { id: "p1", left: "猫", right: "Cat" },
      { id: "p2", left: "狗", right: "Dog" },
      { id: "p3", left: "鸟", right: "Bird" },
    ],
    explanation: "Animal vocabulary.",
  };

  it("returns score=100 and isCorrect=true when all pairs matched correctly", () => {
    const userPairs = [
      { leftId: "p1", rightId: "p1" },
      { leftId: "p2", rightId: "p2" },
      { leftId: "p3", rightId: "p3" },
    ];
    const result: GradeResult = gradeMatching(userPairs, definition);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("returns partial score when some pairs are correct (2 of 3)", () => {
    // Only p1 is correct (leftId === rightId)
    // p2: leftId=p2, rightId=p3 -> not equal -> wrong
    // p3: leftId=p3, rightId=p2 -> not equal -> wrong
    // So 1 of 3 correct
    // User gets 2 correct
    const userPairs2 = [
      { leftId: "p1", rightId: "p1" }, // correct
      { leftId: "p2", rightId: "p2" }, // correct
      { leftId: "p3", rightId: "p1" }, // wrong
    ];
    const result: GradeResult = gradeMatching(userPairs2, definition);
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(67); // Math.round(2/3 * 100) = 67
  });

  it("returns score=0 when zero matches are correct", () => {
    const userPairs = [
      { leftId: "p1", rightId: "p2" },
      { leftId: "p2", rightId: "p3" },
      { leftId: "p3", rightId: "p1" },
    ];
    const result: GradeResult = gradeMatching(userPairs, definition);
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(0);
  });
});

// ============================================================
// gradeOrdering
// ============================================================

describe("gradeOrdering", () => {
  const definition: OrderingDefinition = {
    type: "ordering",
    items: [
      { id: "i1", text: "First", correctPosition: 0 },
      { id: "i2", text: "Second", correctPosition: 1 },
      { id: "i3", text: "Third", correctPosition: 2 },
    ],
    explanation: "Order from first to last.",
  };

  it("returns score=100 and isCorrect=true when all items in correct position", () => {
    const result: GradeResult = gradeOrdering(["i1", "i2", "i3"], definition);
    expect(result.isCorrect).toBe(true);
    expect(result.score).toBe(100);
  });

  it("returns partial score when some items are in correct position (1 of 3)", () => {
    // i1 at index 0 -> correctPosition=0 -> correct
    // i3 at index 1 -> correctPosition=2 -> wrong
    // i2 at index 2 -> correctPosition=1 -> wrong
    const result: GradeResult = gradeOrdering(["i1", "i3", "i2"], definition);
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(33); // Math.round(1/3 * 100) = 33
  });

  it("calculates score correctly for completely reversed order", () => {
    // i3 at index 0 -> correctPosition=2 -> wrong
    // i2 at index 1 -> correctPosition=1 -> correct!
    // i1 at index 2 -> correctPosition=0 -> wrong
    const result: GradeResult = gradeOrdering(["i3", "i2", "i1"], definition);
    expect(result.isCorrect).toBe(false);
    expect(result.score).toBe(33); // Math.round(1/3 * 100) = 33
  });
});

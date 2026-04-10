"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type QType = "single" | "multiple" | "true_false";

interface QOption {
  id: string;
  text: string;
}

interface QQuestion {
  id: string;
  prompt: string;
  type: QType;
  options: QOption[];
  correctOptionIds: string[];
  explanation?: string;
  points: number;
}

interface QuizContent {
  description?: string;
  passingScore: number;
  questions: QQuestion[];
}

function uuid(): string {
  return crypto.randomUUID();
}

function makeTrueFalseOptions(): QOption[] {
  return [
    { id: uuid(), text: "True" },
    { id: uuid(), text: "False" },
  ];
}

export function QuizBuilder({
  lessonId,
  content,
  onUpdate,
}: {
  lessonId: string;
  content: Record<string, unknown>;
  onUpdate: (next: Record<string, unknown>) => void;
}) {
  const initial: QuizContent = {
    description: (content.description as string) ?? "",
    passingScore: (content.passingScore as number) ?? 70,
    questions: (content.questions as QQuestion[]) ?? [],
  };

  const [draft, setDraft] = useState<QuizContent>(initial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const addQuestion = () => {
    const newQ: QQuestion = {
      id: uuid(),
      prompt: "",
      type: "single",
      options: [
        { id: uuid(), text: "" },
        { id: uuid(), text: "" },
      ],
      correctOptionIds: [],
      points: 1,
    };
    setDraft((prev) => ({ ...prev, questions: [...prev.questions, newQ] }));
  };

  const removeQuestion = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== id),
    }));
  };

  const updateQuestion = (id: string, updates: Partial<QQuestion>) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === id ? { ...q, ...updates } : q,
      ),
    }));
  };

  const changeType = (id: string, nextType: QType) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== id) return q;
        if (nextType === "true_false") {
          const options = makeTrueFalseOptions();
          return { ...q, type: nextType, options, correctOptionIds: [] };
        }
        return { ...q, type: nextType, correctOptionIds: [] };
      }),
    }));
  };

  const addOption = (qId: string) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === qId
          ? { ...q, options: [...q.options, { id: uuid(), text: "" }] }
          : q,
      ),
    }));
  };

  const removeOption = (qId: string, optId: string) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              options: q.options.filter((o) => o.id !== optId),
              correctOptionIds: q.correctOptionIds.filter((id) => id !== optId),
            }
          : q,
      ),
    }));
  };

  const updateOption = (qId: string, optId: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === qId
          ? {
              ...q,
              options: q.options.map((o) =>
                o.id === optId ? { ...o, text } : o,
              ),
            }
          : q,
      ),
    }));
  };

  const toggleCorrect = (qId: string, optId: string) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== qId) return q;
        if (q.type === "multiple") {
          const next = q.correctOptionIds.includes(optId)
            ? q.correctOptionIds.filter((id) => id !== optId)
            : [...q.correctOptionIds, optId];
          return { ...q, correctOptionIds: next };
        }
        // single or true_false: replace
        return { ...q, correctOptionIds: [optId] };
      }),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/course-library/lessons/${lessonId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: draft }),
        },
      );
      if (res.ok) {
        onUpdate(draft as unknown as Record<string, unknown>);
        setSavedAt(new Date());
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Quiz</h3>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Passing score:</span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft.passingScore}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  passingScore: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)),
                }))
              }
              className="w-16 rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
            <span className="text-muted-foreground">%</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Description (optional)
        </label>
        <textarea
          value={draft.description ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, description: e.target.value }))
          }
          rows={2}
          placeholder="Shown to students before the quiz"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-3">
        {draft.questions.map((q, idx) => (
          <div
            key={q.id}
            className="rounded-md border border-border bg-background p-3 space-y-3"
          >
            <div className="flex items-start gap-2">
              <span className="text-xs font-semibold text-muted-foreground mt-2">
                Q{idx + 1}
              </span>
              <div className="flex-1 space-y-2">
                <textarea
                  value={q.prompt}
                  onChange={(e) =>
                    updateQuestion(q.id, { prompt: e.target.value })
                  }
                  rows={2}
                  placeholder="Question prompt"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => changeType(q.id, e.target.value as QType)}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="single">Single choice</option>
                    <option value="multiple">Multiple choice</option>
                    <option value="true_false">True / False</option>
                  </select>
                  <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    Points:
                    <input
                      type="number"
                      min={1}
                      value={q.points}
                      onChange={(e) =>
                        updateQuestion(q.id, {
                          points: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs"
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeQuestion(q.id)}
                className="p-1 text-muted-foreground/50 hover:text-red-500"
                title="Delete question"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 ml-8">
              {q.options.map((opt) => {
                const isCorrect = q.correctOptionIds.includes(opt.id);
                return (
                  <div key={opt.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleCorrect(q.id, opt.id)}
                      className={cn(
                        "flex items-center justify-center w-5 h-5 rounded border shrink-0 transition-colors",
                        isCorrect
                          ? "border-emerald-500 bg-emerald-500 text-white"
                          : "border-border bg-background hover:border-emerald-500/50",
                      )}
                      title={isCorrect ? "Correct answer" : "Mark as correct"}
                    >
                      {isCorrect && <Check className="w-3 h-3" />}
                    </button>
                    <input
                      type="text"
                      value={opt.text}
                      onChange={(e) =>
                        updateOption(q.id, opt.id, e.target.value)
                      }
                      disabled={q.type === "true_false"}
                      placeholder="Option text"
                      className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-70"
                    />
                    {q.type !== "true_false" && q.options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeOption(q.id, opt.id)}
                        className="p-1 text-muted-foreground/50 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
              {q.type !== "true_false" && (
                <button
                  type="button"
                  onClick={() => addOption(q.id)}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add option
                </button>
              )}
            </div>

            <div className="ml-8">
              <input
                type="text"
                value={q.explanation ?? ""}
                onChange={(e) =>
                  updateQuestion(q.id, { explanation: e.target.value })
                }
                placeholder="Explanation (shown after grading, optional)"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addQuestion}
        className="w-full rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 inline-flex items-center justify-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Add question
      </button>

      {dirty && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            Save quiz
          </button>
        </div>
      )}
      {savedAt && !dirty && (
        <p className="text-[10px] text-emerald-500 text-right">
          Saved at {savedAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}

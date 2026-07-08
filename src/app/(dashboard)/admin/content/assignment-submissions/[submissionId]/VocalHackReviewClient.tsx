"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Plus, Send, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ModelAnnotatedSentence } from "@/components/assignments/ModelAnnotatedSentence";
import { isLoomUrl, sanitizeRecordingUrl } from "@/lib/recording-embed";
import { generateModelPinyin } from "@/lib/generate-model-pinyin";
import { fetchProperTranslations } from "@/lib/mandarin-generation";

// ---------------------------------------------------------------------------
// Vocal Hack review: listen to each recording (seekable) and, per sentence,
// write ONE OR MORE alternative correct phrasings — each with pinyin + English
// auto-generated from the Chinese and editable — then add an extra comment and
// a Loom link. No score: pronunciation review is qualitative.
// ---------------------------------------------------------------------------

export interface VocalHackCorrection {
  chinese: string;
  pinyin: string;
  english: string;
}

export interface VocalHackReviewSentenceDto {
  id: string;
  promptLabel: string;
  chineseText: string;
  generatedPinyin: string;
  generatedEnglish: string;
  hasVideo: boolean;
  hasRecording: boolean;
  corrections: VocalHackCorrection[];
}

export interface VocalHackReviewDto {
  id: string;
  lessonId: string;
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  recordingUrl: string | null;
  extraComment: string | null;
  studentName: string | null;
  studentEmail: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  assignmentDescription: string;
  sentences: VocalHackReviewSentenceDto[];
}

interface CorrectionEntry {
  key: string;
  chinese: string;
  pinyin: string;
  english: string;
  generating: boolean;
}

let keyCounter = 0;
const nextKey = () => `c${keyCounter++}`;

function toEntry(c: VocalHackCorrection): CorrectionEntry {
  return { key: nextKey(), ...c, generating: false };
}

export function VocalHackReviewClient({
  submission,
}: {
  submission: VocalHackReviewDto;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Record<string, CorrectionEntry[]>>(
    () => {
      const initial: Record<string, CorrectionEntry[]> = {};
      for (const s of submission.sentences) {
        initial[s.id] = s.corrections.map(toEntry);
      }
      return initial;
    },
  );
  const [extraComment, setExtraComment] = useState(
    submission.extraComment ?? "",
  );
  const [recordingUrl, setRecordingUrl] = useState(
    submission.recordingUrl ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchEntry = (
    sentenceId: string,
    key: string,
    next: Partial<CorrectionEntry>,
  ) =>
    setEntries((prev) => ({
      ...prev,
      [sentenceId]: prev[sentenceId].map((e) =>
        e.key === key ? { ...e, ...next } : e,
      ),
    }));

  const addEntry = (sentenceId: string) =>
    setEntries((prev) => ({
      ...prev,
      [sentenceId]: [
        ...prev[sentenceId],
        { key: nextKey(), chinese: "", pinyin: "", english: "", generating: false },
      ],
    }));

  const removeEntry = (sentenceId: string, key: string) =>
    setEntries((prev) => ({
      ...prev,
      [sentenceId]: prev[sentenceId].filter((e) => e.key !== key),
    }));

  const generateEntry = async (sentenceId: string, key: string) => {
    const entry = entries[sentenceId]?.find((e) => e.key === key);
    const chinese = entry?.chinese.trim();
    if (!chinese) return;
    patchEntry(sentenceId, key, { generating: true });
    try {
      const [pinyin, translations] = await Promise.all([
        generateModelPinyin(chinese),
        fetchProperTranslations([chinese], "zh-CN"),
      ]);
      patchEntry(sentenceId, key, {
        pinyin,
        english: translations?.join(" ").trim() || entry?.english || "",
        generating: false,
      });
    } catch {
      patchEntry(sentenceId, key, { generating: false });
    }
  };

  const recordingTrimmed = recordingUrl.trim();
  const recordingValid =
    recordingTrimmed === "" || Boolean(sanitizeRecordingUrl(recordingTrimmed));
  const showLoomWarning =
    recordingTrimmed !== "" && recordingValid && !isLoomUrl(recordingTrimmed);

  const handleSubmit = async () => {
    for (const s of submission.sentences) {
      for (const entry of entries[s.id]) {
        if (entry.chinese.trim() && !entry.pinyin.trim()) {
          setError(
            `A correction for "${s.chineseText}" has no pinyin — click Generate first.`,
          );
          return;
        }
      }
    }
    if (!recordingValid) {
      setError("Recording link is not a valid URL.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/assignment-submissions/${submission.id}/vocal-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentences: submission.sentences.map((s) => ({
              sentenceId: s.id,
              corrections: entries[s.id]
                .filter((e) => e.chinese.trim())
                .map((e) => ({
                  chinese: e.chinese,
                  pinyin: e.pinyin,
                  english: e.english,
                })),
            })),
            extraComment,
            recordingUrl: recordingTrimmed || undefined,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to submit review");
        return;
      }
      toast.success("Review submitted — the student has been notified.");
      router.push("/admin/content/assignment-submissions");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {submission.lessonTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {submission.courseTitle} → {submission.moduleTitle}
            </p>
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">
                {submission.studentName || "Unnamed"}
              </span>{" "}
              <span className="text-muted-foreground">
                ({submission.studentEmail})
              </span>
            </p>
          </div>
          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-500">
            Vocal Hack
          </span>
        </div>
        {submission.assignmentDescription && (
          <div
            className="prose prose-invert prose-sm mt-4 max-w-none border-t border-border pt-4 text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: submission.assignmentDescription,
            }}
          />
        )}
      </div>

      <div className="space-y-5">
        {submission.sentences.map((sentence, idx) => {
          const sentenceEntries = entries[sentence.id];
          return (
            <div
              key={sentence.id}
              className="rounded-lg border border-border bg-card p-5 space-y-4"
            >
              <p className="text-sm font-semibold text-foreground">
                {idx + 1}. {sentence.promptLabel || `Sentence ${idx + 1}`}
              </p>

              {sentence.hasVideo && (
                <div className="overflow-hidden rounded-lg bg-black">
                  <video
                    src={`/api/course-library/vocal-hack-video/${submission.lessonId}?sentence=${encodeURIComponent(sentence.id)}#t=0.1`}
                    controls
                    playsInline
                    preload="metadata"
                    controlsList="nodownload"
                    className="mx-auto max-h-64 w-full"
                  />
                </div>
              )}

              <div className="rounded-md bg-background px-3 py-3">
                <ModelAnnotatedSentence
                  chinese={sentence.chineseText}
                  pinyin={sentence.generatedPinyin}
                  english={sentence.generatedEnglish}
                />
              </div>

              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Student&apos;s recording
                </p>
                {sentence.hasRecording ? (
                   
                  <audio
                    controls
                    preload="metadata"
                    controlsList="nodownload"
                    src={`/api/course-library/assignment-recordings/${sentence.id}`}
                    className="w-full"
                  />
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No recording submitted.
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-md border border-border bg-background p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">
                    Corrections (add one or more correct ways to say it)
                  </p>
                  <button
                    type="button"
                    onClick={() => addEntry(sentence.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    Add correction
                  </button>
                </div>

                {sentenceEntries.length === 0 ? (
                  <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    No corrections — will be marked as well read.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sentenceEntries.map((entry, entryIdx) => (
                      <div
                        key={entry.key}
                        className="space-y-2 rounded-md border border-border/70 bg-card p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Option {entryIdx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeEntry(sentence.id, entry.key)}
                            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500"
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={entry.chinese}
                            onChange={(e) =>
                              patchEntry(sentence.id, entry.key, {
                                chinese: e.target.value,
                              })
                            }
                            onBlur={() => {
                              if (entry.chinese.trim() && !entry.pinyin.trim()) {
                                generateEntry(sentence.id, entry.key);
                              }
                            }}
                            placeholder="Correct sentence in Chinese"
                            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-base"
                          />
                          <button
                            type="button"
                            onClick={() => generateEntry(sentence.id, entry.key)}
                            disabled={!entry.chinese.trim() || entry.generating}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent disabled:opacity-40"
                          >
                            {entry.generating ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            Generate
                          </button>
                        </div>
                        <input
                          type="text"
                          value={entry.pinyin}
                          onChange={(e) =>
                            patchEntry(sentence.id, entry.key, {
                              pinyin: e.target.value,
                            })
                          }
                          placeholder="Pinyin (auto-generated, editable)"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        />
                        <input
                          type="text"
                          value={entry.english}
                          onChange={(e) =>
                            patchEntry(sentence.id, entry.key, {
                              english: e.target.value,
                            })
                          }
                          placeholder="English (auto-generated, editable)"
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        />
                        {entry.chinese.trim() && entry.pinyin.trim() && (
                          <div className="rounded-md bg-background px-3 py-2">
                            <p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                              Student will see
                            </p>
                            <ModelAnnotatedSentence
                              chinese={entry.chinese}
                              pinyin={entry.pinyin}
                              english={entry.english}
                              fontSize={20}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          Extra Comment (optional)
        </h2>
        <RichTextEditor
          value={extraComment}
          onChange={setExtraComment}
          placeholder="Overall feedback on pronunciation, tones, pace..."
          compact
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Recording Link (optional)
        </h2>
        <input
          type="url"
          value={recordingUrl}
          onChange={(e) => setRecordingUrl(e.target.value)}
          placeholder="https://www.loom.com/share/..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {!recordingValid && (
          <p className="text-xs text-red-500">Not a valid URL.</p>
        )}
        {showLoomWarning && (
          <p className="text-xs text-amber-500">
            Warning: this does not look like a Loom link. Please double-check
            before submitting.
          </p>
        )}
        {recordingTrimmed !== "" && recordingValid && !showLoomWarning && (
          <p className="text-xs text-emerald-500">✓ Loom link detected</p>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
          )}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {submission.status === "reviewed" ? "Update review" : "Complete review"}
        </button>
      </div>
    </div>
  );
}

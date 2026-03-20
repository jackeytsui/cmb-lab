"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ErrorAlert } from "@/components/ui/error-alert";

interface ImportSummary {
  modules: number;
  lessons: number;
  attachments: number;
  practiceSets: number;
  exercises: number;
}

interface CourseContentImporterProps {
  courseId: string;
  onImported: () => void;
}

const TEMPLATE = `{
  "modules": [
    {
      "title": "Module 1: Basics",
      "description": "Optional module description",
      "lessons": [
        {
          "title": "Lesson 1",
          "description": "Optional lesson description",
          "content": "<p>This is a text lesson block.</p>",
          "video": {
            "muxPlaybackId": "your_mux_playback_id",
            "durationSeconds": 420
          },
          "attachments": [
            {
              "title": "Worksheet PDF",
              "url": "https://example.com/file.pdf",
              "type": "link"
            }
          ],
          "activities": [
            {
              "type": "assignment",
              "prompt": "Write 5 sentences introducing yourself."
            },
            {
              "type": "exercise",
              "language": "both",
              "definition": {
                "type": "fill_in_blank",
                "sentence": "I {{blank}} Mandarin {{blank}} day.",
                "blanks": [
                  { "id": "b1", "correctAnswer": "practice" },
                  { "id": "b2", "correctAnswer": "every" }
                ]
              }
            }
          ],
          "assessments": [
            {
              "title": "Lesson 1 Quiz",
              "status": "draft",
              "exercises": [
                {
                  "language": "both",
                  "definition": {
                    "type": "multiple_choice",
                    "question": "Which tone is this?",
                    "options": [
                      { "id": "a", "text": "First tone" },
                      { "id": "b", "text": "Second tone" }
                    ],
                    "correctOptionId": "b"
                  }
                },
                {
                  "language": "both",
                  "definition": {
                    "type": "audio_recording",
                    "targetPhrase": "你好，我叫..."
                  }
                },
                {
                  "language": "both",
                  "definition": {
                    "type": "video_recording",
                    "prompt": "Record a 30-second self-introduction."
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;

export function CourseContentImporter({
  courseId,
  onImported,
}: CourseContentImporterProps) {
  const [payload, setPayload] = useState(TEMPLATE);
  const [dryRun, setDryRun] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [created, setCreated] = useState<ImportSummary | null>(null);

  const parsedJson = useMemo(() => {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }, [payload]);

  const handleFileSelect = async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setPayload(text);
  };

  const handleImport = async () => {
    setError(null);
    setSummary(null);
    setCreated(null);

    if (!parsedJson) {
      setError("Invalid JSON. Please fix JSON format before importing.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/courses/${courseId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dryRun,
          payload: parsedJson,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to import course content");
      }

      if (dryRun) {
        setSummary(data.summary || null);
      } else {
        setCreated(data.created || null);
        onImported();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mb-8 rounded-lg border border-zinc-700 bg-zinc-900 p-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Course Content Importer</h3>
          <p className="text-sm text-zinc-400">
            Bulk import modules, lessons, video/text blocks, assignments, quizzes, and exercises from JSON.
          </p>
        </div>
      </div>

      {error && <ErrorAlert message={error} className="mb-4" />}

      <div className="mb-3">
        <label className="mb-2 block text-sm text-zinc-300">Upload JSON file (optional)</label>
        <Input
          type="file"
          accept=".json,application/json"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
          className="border-zinc-700 bg-zinc-800 text-zinc-200"
        />
      </div>

      <div className="mb-3">
        <label className="mb-2 block text-sm text-zinc-300">Import payload</label>
        <Textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          rows={18}
          className="font-mono text-xs border-zinc-700 bg-zinc-800 text-zinc-200"
        />
      </div>

      <div className="mb-4 flex items-center gap-2 text-sm text-zinc-300">
        <input
          id="dry-run"
          type="checkbox"
          checked={dryRun}
          onChange={(e) => setDryRun(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-600 bg-zinc-800"
        />
        <label htmlFor="dry-run">Dry run (validate only, no database writes)</label>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleImport} disabled={isSubmitting}>
          {isSubmitting ? "Processing..." : dryRun ? "Validate Import" : "Run Import"}
        </Button>
      </div>

      {summary && (
        <div className="mt-4 rounded border border-blue-900/60 bg-blue-950/20 p-3 text-sm text-blue-200">
          Dry run summary: {summary.modules} module(s), {summary.lessons} lesson(s),{" "}
          {summary.attachments} attachment(s), {summary.practiceSets} practice set(s),{" "}
          {summary.exercises} exercise(s).
        </div>
      )}

      {created && (
        <div className="mt-4 rounded border border-green-900/60 bg-green-950/20 p-3 text-sm text-green-200">
          Import completed: {created.modules} module(s), {created.lessons} lesson(s),{" "}
          {created.attachments} attachment(s), {created.practiceSets} practice set(s),{" "}
          {created.exercises} exercise(s).
        </div>
      )}
    </section>
  );
}

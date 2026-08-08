"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CloudOff, Loader2, NotebookPen } from "lucide-react";

type SaveState = "loading" | "idle" | "saving" | "saved" | "error";

export function VideoTypingWorkspace({ lessonId }: { lessonId: string }) {
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const loadedRef = useRef(false);
  const lastSavedRef = useRef("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/course-library/lessons/${lessonId}/notes`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load notes");
        return (await response.json()) as { content?: string };
      })
      .then((data) => {
        if (cancelled) return;
        const next = typeof data.content === "string" ? data.content : "";
        setContent(next);
        lastSavedRef.current = next;
        loadedRef.current = true;
        setSaveState("idle");
      })
      .catch(() => {
        if (cancelled) return;
        loadedRef.current = true;
        setSaveState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  const save = useCallback(
    async (nextContent: string) => {
      if (!loadedRef.current || nextContent === lastSavedRef.current) return;
      setSaveState("saving");
      try {
        const response = await fetch(
          `/api/course-library/lessons/${lessonId}/notes`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: nextContent }),
          },
        );
        if (!response.ok) throw new Error("Failed to save notes");
        lastSavedRef.current = nextContent;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [lessonId],
  );

  useEffect(() => {
    if (!loadedRef.current || content === lastSavedRef.current) return;
    setSaveState("idle");
    const timeout = window.setTimeout(() => void save(content), 700);
    return () => window.clearTimeout(timeout);
  }, [content, save]);

  return (
    <section className="flex min-h-[20rem] flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Typing practice
            </h2>
            <p className="text-xs text-muted-foreground">
              Type along while you watch
            </p>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
          aria-live="polite"
          data-testid="video-notes-save-state"
        >
          {saveState === "loading" || saveState === "saving" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : saveState === "saved" ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : saveState === "error" ? (
            <CloudOff className="h-3 w-3 text-amber-500" />
          ) : null}
          {saveState === "loading"
            ? "Loading"
            : saveState === "saving"
              ? "Saving"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : "Autosaves"}
        </span>
      </div>
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onBlur={() => void save(content)}
        maxLength={50_000}
        spellCheck={false}
        data-testid="video-typing-workspace"
        aria-label="Typing practice notes"
        placeholder="Start typing here… Try writing the words and sentences you hear."
        className="min-h-[16rem] flex-1 resize-y rounded-md border border-border bg-background p-3 text-base leading-7 text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/20"
      />
    </section>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { extractVideoId } from "@/lib/youtube";
import { cn } from "@/lib/utils";

interface UrlInputProps {
  onSubmit: (videoId: string, url: string) => void;
  isLoading?: boolean;
  className?: string;
  defaultUrl?: string;
  onSubmitAttempt?: () => void;
  submitButtonTourId?: string;
}

export function UrlInput({
  onSubmit,
  isLoading,
  className,
  defaultUrl,
  onSubmitAttempt,
  submitButtonTourId,
}: UrlInputProps) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const trimmed = url.trim();
    if (!trimmed) {
      setError("Please enter a YouTube URL");
      return;
    }

    const videoId = extractVideoId(trimmed);
    if (!videoId) {
      setError(
        "Please enter a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...)"
      );
      return;
    }

    setError(null);
    onSubmitAttempt?.();
    onSubmit(videoId, trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className={cn("flex gap-2", className)}>
      <div className="flex-1">
        <Input
          type="text"
          placeholder="Paste a YouTube URL..."
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          disabled={isLoading}
        />
        {error && (
          <p className="mt-1 text-sm text-destructive">{error}</p>
        )}
      </div>
      <Button type="submit" disabled={isLoading} data-tour-id={submitButtonTourId}>
        {isLoading ? "Loading..." : "Load Video"}
      </Button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/error-alert";

interface CoachFeedbackFormProps {
  submissionId: string;
  existingFeedback?: {
    loomUrl: string | null;
    feedbackText: string | null;
  };
}

/**
 * Form for coaches to provide feedback on student submissions.
 * Accepts Loom video URLs and/or written text feedback.
 */
export function CoachFeedbackForm({
  submissionId,
  existingFeedback,
}: CoachFeedbackFormProps) {
  const [loomUrl, setLoomUrl] = useState(existingFeedback?.loomUrl || "");
  const [feedbackText, setFeedbackText] = useState(
    existingFeedback?.feedbackText || ""
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Check if feedback was already submitted
  const hasExistingFeedback =
    existingFeedback?.loomUrl || existingFeedback?.feedbackText;

  // Validate Loom URL format
  const isValidLoomUrl = (url: string): boolean => {
    if (!url) return true; // Empty is valid (optional field)
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname === "loom.com" ||
        parsed.hostname === "www.loom.com" ||
        parsed.hostname === "share.loom.com"
      );
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate at least one field is filled
    if (!loomUrl.trim() && !feedbackText.trim()) {
      setError("Please provide a Loom URL or written feedback");
      return;
    }

    // Validate Loom URL if provided
    if (loomUrl.trim() && !isValidLoomUrl(loomUrl)) {
      setError("Invalid Loom URL. Must be from loom.com or share.loom.com");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(
        `/api/submissions/${submissionId}/feedback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            loomUrl: loomUrl.trim() || undefined,
            feedbackText: feedbackText.trim() || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save feedback");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show existing feedback view after successful submission or if feedback exists
  if (success || hasExistingFeedback) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">
            Feedback Sent
          </h3>
          <span data-testid="feedback-success" className="inline-flex items-center rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-500">
            Reviewed
          </span>
        </div>

        {(loomUrl || existingFeedback?.loomUrl) && (
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Loom Video</Label>
            <a
              href={loomUrl || existingFeedback?.loomUrl || ""}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline block truncate"
            >
              {loomUrl || existingFeedback?.loomUrl}
            </a>
          </div>
        )}

        {(feedbackText || existingFeedback?.feedbackText) && (
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">
              Written Feedback
            </Label>
            <p className="text-foreground whitespace-pre-wrap">
              {feedbackText || existingFeedback?.feedbackText}
            </p>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSuccess(false)}
          className="w-full"
        >
          Edit Feedback
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-border bg-card p-4 space-y-4"
    >
      <h3 className="text-lg font-semibold text-foreground">
        Provide Feedback
      </h3>

      {error && (
        <ErrorAlert message={error} />
      )}

      <div className="space-y-2">
        <Label htmlFor="loom-url">Loom Video URL (optional)</Label>
        <Input
          id="loom-url"
          type="url"
          placeholder="https://www.loom.com/share/..."
          value={loomUrl}
          onChange={(e) => setLoomUrl(e.target.value)}
          disabled={isSubmitting}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Record a personalized video response on Loom
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="feedback-text">Written Feedback (optional)</Label>
        <Textarea
          id="feedback-text"
          data-testid="feedback-input"
          placeholder="Write your feedback here..."
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          disabled={isSubmitting}
          rows={4}
          className="w-full resize-y"
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full" data-testid="send-feedback">
        {isSubmitting ? "Sending..." : "Send Feedback"}
      </Button>
    </form>
  );
}

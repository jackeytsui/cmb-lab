"use client";

import { useState, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AudioRecorder } from "./AudioRecorder";
import { FeedbackDisplay } from "@/components/interactions/FeedbackDisplay";
import { getFileExtensionForMimeType } from "@/lib/audio-utils";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { AudioGradingResponse } from "@/lib/grading";

interface AudioInteractionProps {
  /**
   * Unique identifier for this interaction.
   */
  interactionId: string;
  /**
   * Lesson this interaction belongs to.
   */
  lessonId: string;
  /**
   * The prompt/question to display to the student.
   */
  prompt: string;
  /**
   * Language context for grading.
   */
  language: "cantonese" | "mandarin" | "both";
  /**
   * Expected answer for grading comparison (optional).
   */
  expectedAnswer?: string;
  /**
   * Callback when interaction is completed successfully.
   */
  onComplete: () => void;
  /**
   * Optional custom submit handler for testing.
   * If not provided, uses /api/grade-audio endpoint.
   */
  onSubmit?: (blob: Blob, mimeType: string) => Promise<AudioGradingResponse>;
}

/**
 * Audio interaction component for pronunciation exercises.
 * Mirrors the TextInteraction pattern but accepts audio input.
 *
 * Flow:
 * 1. Display prompt
 * 2. Student records audio
 * 3. Student previews and can re-record
 * 4. Student submits for grading
 * 5. Display feedback (correct/incorrect)
 * 6. If correct, call onComplete after delay
 * 7. If incorrect, allow try again
 */
export function AudioInteraction({
  interactionId,
  lessonId: _lessonId,
  prompt,
  language,
  expectedAnswer,
  onComplete,
  onSubmit,
}: AudioInteractionProps) {
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioMimeType, setAudioMimeType] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AudioGradingResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle recording complete
  const handleRecordingComplete = useCallback(
    (blob: Blob, mimeType: string) => {
      setAudioBlob(blob);
      setAudioMimeType(mimeType);
      // Clear previous feedback when new recording is made
      setFeedback(null);
    },
    []
  );

  // Handle re-record
  const handleReset = useCallback(() => {
    setAudioBlob(null);
    setAudioMimeType(null);
    setFeedback(null);
  }, []);

  // Handle submission
  async function handleSubmit() {
    if (!audioBlob || !audioMimeType) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      let result: AudioGradingResponse;

      if (onSubmit) {
        // Use provided callback (for testing)
        result = await onSubmit(audioBlob, audioMimeType);
      } else {
        // Call /api/grade-audio endpoint
        // Use dynamic file extension based on detected MIME type
        const extension = getFileExtensionForMimeType(audioMimeType);
        const filename = `recording.${extension}`;

        const formData = new FormData();
        formData.append("audio", audioBlob, filename);
        formData.append("interactionId", interactionId);
        formData.append("expectedAnswer", expectedAnswer || "");
        formData.append("language", language);

        const response = await fetch("/api/grade-audio", {
          method: "POST",
          body: formData,
          // Note: Do NOT set Content-Type header - browser sets it with boundary
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          throw new Error(
            `Failed to grade audio: ${response.status} ${errorText}`
          );
        }

        result = await response.json();
      }

      setFeedback(result);

      if (result.isCorrect) {
        // Delay to show success feedback before continuing
        setTimeout(onComplete, 1500);
      }
    } catch (error) {
      console.error("Audio grading error:", error);
      // User-friendly error message for common scenarios
      let errorMessage = "Failed to grade your audio. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("504")) {
          errorMessage =
            "Grading timed out. Please try a shorter recording.";
        } else if (error.message.includes("502")) {
          errorMessage =
            "Grading service is temporarily unavailable. Please try again.";
        }
      }
      setFeedback({
        isCorrect: false,
        score: 0,
        feedback: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Handle try again
  function handleTryAgain() {
    handleReset();
  }

  return (
    <div className="space-y-6">
      {/* Prompt display */}
      <div className="text-xl text-white font-medium">
        <PhoneticText>{prompt}</PhoneticText>
      </div>

      {/* Audio recorder */}
      <AudioRecorder
        onRecordingComplete={handleRecordingComplete}
        onReset={handleReset}
        disabled={isSubmitting || (feedback?.isCorrect ?? false)}
      />

      {/* Submit button (shown when audio is recorded) */}
      {audioBlob && !feedback?.isCorrect && (
        <div className="flex justify-center">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            size="lg"
            className="min-w-[200px]"
          >
            {isSubmitting ? "Checking..." : "Submit Recording"}
          </Button>
        </div>
      )}

      {/* Animated feedback display */}
      <AnimatePresence mode="wait">
        {feedback && (
          <div className="space-y-2">
            <FeedbackDisplay feedback={feedback} />
            {/* Show transcription when available */}
            {feedback.transcription && (
              <p className="text-sm text-zinc-400 italic text-center">
                What we heard: {feedback.transcription}
              </p>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* Try Again button after incorrect feedback */}
      {feedback && !feedback.isCorrect && (
        <div className="flex justify-center">
          <Button
            onClick={handleTryAgain}
            variant="outline"
            disabled={isSubmitting}
          >
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}

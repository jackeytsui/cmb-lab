"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatePresence } from "framer-motion";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { IMEInput } from "./IMEInput";
import { FeedbackDisplay } from "./FeedbackDisplay";
import {
  textInteractionSchema,
  type TextInteractionFormValues,
} from "./InteractionSchema";
import { PhoneticText } from "@/components/phonetic/PhoneticText";
import type { GradingFeedback } from "@/lib/grading";

interface TextInteractionProps {
  interactionId: string;
  prompt: string;
  expectedAnswer?: string;
  language: "cantonese" | "mandarin" | "both";
  onComplete: () => void;
  onSubmit?: (response: string) => Promise<GradingFeedback>;
}

/**
 * Text interaction form component for Chinese language input.
 *
 * Uses IME-aware input for proper Chinese composition handling.
 * Validates with React Hook Form + Zod.
 * Calls onSubmit prop or /api/grade endpoint for AI grading.
 */
export function TextInteraction({
  interactionId,
  prompt,
  expectedAnswer,
  language,
  onComplete,
  onSubmit,
}: TextInteractionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<GradingFeedback | null>(null);

  const form = useForm<TextInteractionFormValues>({
    resolver: zodResolver(textInteractionSchema),
    defaultValues: { response: "" },
    mode: "onBlur",
  });

  async function handleSubmit(values: TextInteractionFormValues) {
    setIsSubmitting(true);
    setFeedback(null); // Clear previous feedback
    try {
      let result: GradingFeedback;

      if (onSubmit) {
        // Use provided callback (for testing without API)
        result = await onSubmit(values.response);
      } else {
        // Call grading API (will be created in Plan 02)
        const response = await fetch("/api/grade", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            interactionId,
            studentResponse: values.response,
            expectedAnswer,
            language,
          }),
        });

        if (!response.ok) {
          let errorMsg = "Failed to grade response";
          try {
            const errorData = await response.json();
            errorMsg = errorData.error || errorMsg;
          } catch {
            // ignore JSON parse error
          }
          throw new Error(`${errorMsg} (${response.status})`);
        }

        result = await response.json();
      }

      setFeedback(result);

      if (result.isCorrect) {
        // Delay to show success feedback before continuing
        setTimeout(onComplete, 1500);
      }
    } catch (error) {
      console.error("Grading error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setFeedback({
        isCorrect: false,
        score: 0,
        feedback: `Error: ${errorMessage}. Please try again.`,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleTryAgain() {
    form.reset();
    setFeedback(null);
  }

  return (
    <div className="space-y-6" data-testid="interaction-area">
      {/* Prompt display */}
      <div className="text-xl text-white font-medium">
        <PhoneticText>{prompt}</PhoneticText>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="response"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Your answer</FormLabel>
                <FormControl>
                  <IMEInput
                    placeholder="Type your response in Chinese..."
                    className="text-lg"
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Animated feedback display */}
          <AnimatePresence mode="wait">
            {feedback && <FeedbackDisplay feedback={feedback} />}
          </AnimatePresence>

          <div className="flex gap-3">
            <Button
              type="submit"
              disabled={isSubmitting || (feedback?.isCorrect ?? false)}
              className="flex-1"
              data-testid="submit-answer"
            >
              {isSubmitting
                ? "Checking..."
                : feedback?.isCorrect
                  ? "Correct!"
                  : "Submit"}
            </Button>

            {feedback && !feedback.isCorrect && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTryAgain}
                disabled={isSubmitting}
              >
                Try Again
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}

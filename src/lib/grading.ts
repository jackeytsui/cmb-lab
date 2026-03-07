/**
 * Request sent to n8n grading webhook
 */
export interface GradingRequest {
  interactionId: string;
  userId: string;
  studentResponse: string;
  expectedAnswer?: string;
  language: "cantonese" | "mandarin" | "both";
  prompt?: string; // Customizable grading prompt loaded from database
}

/**
 * Response from n8n grading webhook
 */
export interface GradingResponse {
  isCorrect: boolean;
  score: number; // 0-100
  feedback: string;
  corrections?: string[];
  hints?: string[];
  /** The correct answer (shown on success or for learning) */
  correctAnswer?: string;
}

/**
 * Combined feedback for UI display
 */
export type GradingFeedback = GradingResponse;

/**
 * Request sent to n8n audio grading webhook.
 * Audio is sent as FormData, not in this JSON structure.
 */
export interface AudioGradingRequest {
  interactionId: string;
  userId: string;
  expectedAnswer?: string;
  language: "cantonese" | "mandarin" | "both";
}

/**
 * Response from n8n audio grading webhook.
 * Same as text grading but includes transcription.
 */
export interface AudioGradingResponse extends GradingResponse {
  /** What the AI transcribed from the audio */
  transcription?: string;
}

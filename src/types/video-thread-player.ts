import { VideoThreadStep, VideoThread } from "@/db/schema/video-threads";

// Logic Rule
export interface StepLogic {
  condition: string; // The value of the option selected (e.g., "Yes", "Option A")
  nextStepId: string; // UUID of the next step
}

export interface LogicRule {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'exists' | 'gt' | 'lt';
  value: string;
  nextStepId: string;
}

// Response Options (for MC/Button)
export interface StepResponseOptions {
  options: Array<{
    label: string;
    value: string;
  }>;
}

// Extended Step Type with typed JSON fields
export interface PlayerStep extends Omit<VideoThreadStep, "logic" | "responseOptions" | "allowedResponseTypes" | "logicRules"> {
  logic: StepLogic[] | null;
  logicRules: LogicRule[] | null;
  responseOptions: StepResponseOptions | null;
  allowedResponseTypes: ResponseType[] | null;
  upload?: {
    muxPlaybackId: string | null;
  } | null;
}

// User Response Types
export type ResponseType = "video" | "audio" | "text" | "multiple_choice" | "button";

export interface PlayerResponse {
  stepId: string;
  responseType: ResponseType;
  content: string | Blob; // For text/MC, it's the value. For video/audio, it's the blob URL or ID.
  metadata?: any;
}

// Player State
export interface VideoThreadPlayerState {
  thread: VideoThread;
  steps: PlayerStep[];
  currentStepId: string | null;
  history: string[]; // List of visited step IDs for back navigation
  responses: Record<string, PlayerResponse>; // Map stepId -> Response
  status: "loading" | "playing" | "recording" | "uploading" | "completed" | "error";
  error: string | null;
  sessionId: string | null; // Server-side session ID for response tracking
  isSubmitting: boolean; // Prevents double-submissions
  recordingMode: "audio" | "video" | null; // Active recording mode for media responses
}

// Actions for useReducer
export type PlayerAction =
  | { type: "INIT_THREAD"; payload: { thread: VideoThread; steps: PlayerStep[] } }
  | { type: "SET_CURRENT_STEP"; payload: string }
  | { type: "RECORD_RESPONSE"; payload: PlayerResponse }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "GO_BACK" }
  | { type: "SET_STATUS"; payload: VideoThreadPlayerState["status"] }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_SESSION_ID"; payload: string }
  | { type: "SET_SUBMITTING"; payload: boolean }
  | { type: "SET_RECORDING_MODE"; payload: "audio" | "video" | null };

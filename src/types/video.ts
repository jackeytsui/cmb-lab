export const COMPLETION_THRESHOLD = 80;

export interface CuePoint {
  id: string;
  timestamp: number;
  completed: boolean;
  /** Optional reference to the underlying interaction record */
  interactionId?: string;
  /** Optional VideoPrompt ID for VideoAsk-style interactions */
  videoPromptId?: string;
}

export interface SubtitleCue {
  id: string;
  startTime: number;
  endTime: number;
  chinese: string;
  pinyin?: string;
  jyutping?: string;
  english?: string;
}

export interface ResolvedVideoAssignment {
  assignmentId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  title: string | null;
  notes: string | null;
  dueDate: Date | null;
  assignedAt: Date;
  completionPercent: number | null;
  lastPositionMs: number | null;
  sessionTitle: string | null;
  lastWatched: Date | null;
}

export interface StudentVideoProgress {
  studentId: string;
  studentName: string | null;
  studentEmail: string;
  completionPercent: number;
  lastWatched: Date | null;
  totalWatchedMs: number;
}

export interface VideoAssignmentProgressResult {
  assignment: {
    id: string;
    youtubeUrl: string;
    youtubeVideoId: string;
    title: string | null;
    dueDate: Date | null;
  };
  students: StudentVideoProgress[];
}

export type VideoState = "idle" | "playing" | "paused" | "pausedForInteraction";

export interface VideoContext {
  currentTime: number;
  duration: number;
  volume: number;
  cuePoints: CuePoint[];
  activeCuePoint: CuePoint | null;
  savedVolume: number;
}

export type VideoEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; time: number }
  | { type: "CUE_POINT_REACHED"; cuePoint: CuePoint }
  | { type: "INTERACTION_COMPLETE" }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "SEEK"; time: number }
  | { type: "SET_DURATION"; duration: number }
  | { type: "SET_CUE_POINTS"; cuePoints: CuePoint[] };

"use client";

import React, { useReducer, useState } from "react";
import { VideoPlayer } from "@/components/video/VideoPlayer";
import { Button } from "@/components/ui/button";
import {
  PlayerStep,
  VideoThreadPlayerState,
  PlayerAction,
  PlayerResponse,
} from "@/types/video-thread-player";
import { VideoThread } from "@/db/schema/video-threads";
import { StudentMediaRecorder } from "./StudentMediaRecorder";
import { cn } from "@/lib/utils";
import { CheckCircle2, ChevronLeft, Loader2, Mic, Video } from "lucide-react";
import Link from "next/link";

// Initial State
const initialState: VideoThreadPlayerState = {
  thread: {} as VideoThread,
  steps: [],
  currentStepId: null,
  history: [],
  responses: {},
  status: "loading",
  error: null,
  sessionId: null,
  isSubmitting: false,
  recordingMode: null,
};

// Reducer
function playerReducer(
  state: VideoThreadPlayerState,
  action: PlayerAction
): VideoThreadPlayerState {
  switch (action.type) {
    case "INIT_THREAD": {
      const firstStep =
        action.payload.steps.find((s) => s.sortOrder === 0) ||
        action.payload.steps[0];
      return {
        ...state,
        thread: action.payload.thread,
        steps: action.payload.steps,
        currentStepId: firstStep?.id || null,
        status: "playing",
        history: [],
        sessionId: null,
        isSubmitting: false,
      };
    }

    case "SET_CURRENT_STEP":
      return {
        ...state,
        currentStepId: action.payload,
        status: "playing",
        history: [...state.history, state.currentStepId!].filter(Boolean),
      };

    case "RECORD_RESPONSE":
      return {
        ...state,
        responses: {
          ...state.responses,
          [action.payload.stepId]: action.payload,
        },
      };

    case "SET_STATUS":
      return { ...state, status: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload, status: "error" };

    case "SET_SESSION_ID":
      return { ...state, sessionId: action.payload };

    case "SET_SUBMITTING":
      return { ...state, isSubmitting: action.payload };

    case "GO_BACK": {
      if (state.history.length === 0) return state;
      const previousStepId = state.history[state.history.length - 1];
      return {
        ...state,
        history: state.history.slice(0, -1),
        currentStepId: previousStepId,
        status: "playing",
        recordingMode: null,
      };
    }

    case "SET_RECORDING_MODE":
      return {
        ...state,
        recordingMode: action.payload,
        status: action.payload ? "recording" : "playing",
      };

    default:
      return state;
  }
}

interface VideoThreadPlayerProps {
  thread: VideoThread;
  steps: PlayerStep[];
  className?: string;
  resumeSessionId?: string | null;
  resumeStepId?: string | null;
}

export function VideoThreadPlayer({
  thread,
  steps,
  className,
  resumeSessionId,
  resumeStepId,
}: VideoThreadPlayerProps) {
  // Determine initial step: resume from lastStepId if it exists in steps, otherwise first step
  const resolvedInitialStepId = (() => {
    if (resumeStepId && steps.some((s) => s.id === resumeStepId)) {
      return resumeStepId;
    }
    return steps.find((s) => s.sortOrder === 0)?.id || steps[0]?.id || null;
  })();

  const [state, dispatch] = useReducer(playerReducer, {
    ...initialState,
    thread,
    steps,
    currentStepId: resolvedInitialStepId,
    sessionId: resumeSessionId ?? null,
    status: "playing",
  });

  // Local state for text input
  const [textValue, setTextValue] = useState("");

  const currentStep = state.steps.find((s) => s.id === state.currentStepId);
  const currentIndex = state.steps.findIndex((s) => s.id === state.currentStepId);

  // API-backed response handler
  const handleResponse = async (
    value: string,
    type: PlayerResponse["responseType"]
  ) => {
    if (!currentStep || state.isSubmitting) return;

    dispatch({ type: "SET_SUBMITTING", payload: true });

    // Clear any previous error
    if (state.error) {
      dispatch({ type: "SET_STATUS", payload: "playing" });
    }

    try {
      const res = await fetch(`/api/video-threads/${thread.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: currentStep.id,
          sessionId: state.sessionId,
          response: {
            type,
            content: value,
            // For audio/video: value IS the muxPlaybackId, store it in metadata too
            metadata: (type === "audio" || type === "video") ? { muxPlaybackId: value } : undefined,
          },
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error (${res.status})`);
      }

      const data: { nextStepId: string | null; sessionId: string; completed: boolean } =
        await res.json();

      // Store sessionId on first response
      if (!state.sessionId && data.sessionId) {
        dispatch({ type: "SET_SESSION_ID", payload: data.sessionId });
      }

      // Record response locally
      dispatch({
        type: "RECORD_RESPONSE",
        payload: {
          stepId: currentStep.id,
          responseType: type,
          content: value,
        },
      });

      // Advance or complete
      if (data.completed) {
        dispatch({ type: "SET_STATUS", payload: "completed" });
      } else if (data.nextStepId) {
        dispatch({ type: "SET_CURRENT_STEP", payload: data.nextStepId });
      } else {
        // Fallback: no next step and not explicitly completed
        dispatch({ type: "SET_STATUS", payload: "completed" });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to submit response";
      dispatch({ type: "SET_ERROR", payload: message });
    } finally {
      dispatch({ type: "SET_SUBMITTING", payload: false });
    }
  };

  // Text submit handler
  const handleTextSubmit = () => {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    handleResponse(trimmed, "text");
    setTextValue("");
  };

  // Media upload complete handler
  const handleMediaUploadComplete = async (result: { muxPlaybackId: string; uploadId: string }) => {
    const responseType = state.recordingMode === "audio" ? "audio" : "video";
    dispatch({ type: "SET_RECORDING_MODE", payload: null });
    await handleResponse(result.muxPlaybackId, responseType as PlayerResponse["responseType"]);
  };

  // Recording cancel handler
  const handleRecordingCancel = () => {
    dispatch({ type: "SET_RECORDING_MODE", payload: null });
  };

  // Completion screen
  if (state.status === "completed") {
    return (
      <div
        className={cn(
          "relative w-full max-w-4xl mx-auto aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center",
          className
        )}
      >
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto" />
          <h2 className="text-3xl font-bold text-white">Thread Complete!</h2>
          <p className="text-gray-300 text-lg">
            You&apos;ve finished all steps in this thread.
          </p>
          <Link
            href="/dashboard"
            className="inline-block mt-4 px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors"
          >
            Back to Dashboard
          </Link>
          <div className="mt-2">
            <button
              onClick={() =>
                dispatch({
                  type: "INIT_THREAD",
                  payload: { thread, steps },
                })
              }
              className="text-zinc-400 hover:text-white text-sm underline transition-colors"
            >
              Restart
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading / no step fallback
  if (!currentStep) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400 mr-2" />
        <span className="text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative w-full max-w-4xl mx-auto aspect-video bg-black rounded-lg overflow-hidden",
        className
      )}
    >
      {/* Video Layer -- key forces remount on step change for autoplay */}
      {currentStep.upload?.muxPlaybackId ? (
        <VideoPlayer
          key={currentStep.id}
          playbackId={currentStep.upload.muxPlaybackId}
          className="w-full h-full object-cover"
          autoPlay
          muted
        />
      ) : currentStep.videoUrl ? (
        <video
          key={currentStep.id}
          src={currentStep.videoUrl}
          className="w-full h-full object-cover"
          autoPlay
          controls={false}
          loop
          muted
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white">
          No Video Source
        </div>
      )}

      {/* Overlay Layer */}
      <div className="absolute inset-0 flex flex-col justify-end">
        {/* Gradient background for readability */}
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent p-8 space-y-4">
          {/* Back button + step indicator */}
          <div>
            {state.history.length > 0 && (
              <button
                onClick={() => dispatch({ type: "GO_BACK" })}
                className="text-white/70 hover:text-white text-sm flex items-center gap-1 mb-2 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            )}
            <span className="text-white/50 text-xs">
              Step {currentIndex + 1} of {state.steps.length}
            </span>
          </div>

          {/* Prompt text */}
          {currentStep.promptText && (
            <h2 className="text-2xl font-bold text-white drop-shadow-lg">
              {currentStep.promptText}
            </h2>
          )}

          {/* Error message */}
          {state.error && (
            <div className="bg-red-500/80 text-white text-sm px-4 py-2 rounded-lg">
              {state.error}
            </div>
          )}

          {/* Interaction Area */}
          <div className="flex flex-wrap gap-3">
            {currentStep.responseType === "button" ||
            currentStep.responseType === "multiple_choice" ? (
              // Button / Multiple Choice response
              currentStep.responseOptions?.options?.map((opt) => (
                <Button
                  key={opt.value}
                  onClick={() => handleResponse(opt.value, "button")}
                  disabled={state.isSubmitting}
                  variant="secondary"
                  className="text-lg px-6 py-3 bg-white/20 hover:bg-white/40 text-white border border-white/30 rounded-full backdrop-blur-sm transition-all disabled:opacity-50"
                >
                  {state.isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {opt.label}
                </Button>
              ))
            ) : currentStep.responseType === "text" ? (
              // Text input response
              <div className="flex w-full gap-3">
                <input
                  type="text"
                  value={textValue}
                  onChange={(e) => setTextValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleTextSubmit();
                    }
                  }}
                  placeholder="Type your response..."
                  disabled={state.isSubmitting}
                  className="flex-1 bg-white/15 backdrop-blur-sm text-white placeholder-white/50 border border-white/30 rounded-lg px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50"
                />
                <Button
                  onClick={handleTextSubmit}
                  disabled={state.isSubmitting || !textValue.trim()}
                  className="px-6 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {state.isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Submit"
                  )}
                </Button>
              </div>
            ) : currentStep.responseType === "audio" ? (
              // Audio recording response
              state.recordingMode === "audio" ? (
                <StudentMediaRecorder
                  mode="audio"
                  threadId={thread.id}
                  onUploadComplete={handleMediaUploadComplete}
                  onCancel={handleRecordingCancel}
                  disabled={state.isSubmitting}
                />
              ) : (
                <button
                  onClick={() => dispatch({ type: "SET_RECORDING_MODE", payload: "audio" })}
                  disabled={state.isSubmitting}
                  className="flex items-center gap-2 px-6 py-3 text-lg font-medium text-white bg-white/20 hover:bg-white/40 border border-white/30 rounded-full backdrop-blur-sm transition-all disabled:opacity-50"
                >
                  <Mic className="w-5 h-5" />
                  Record Audio
                </button>
              )
            ) : currentStep.responseType === "video" ? (
              // Video recording response
              state.recordingMode === "video" ? (
                <StudentMediaRecorder
                  mode="video"
                  threadId={thread.id}
                  onUploadComplete={handleMediaUploadComplete}
                  onCancel={handleRecordingCancel}
                  disabled={state.isSubmitting}
                />
              ) : (
                <button
                  onClick={() => dispatch({ type: "SET_RECORDING_MODE", payload: "video" })}
                  disabled={state.isSubmitting}
                  className="flex items-center gap-2 px-6 py-3 text-lg font-medium text-white bg-white/20 hover:bg-white/40 border border-white/30 rounded-full backdrop-blur-sm transition-all disabled:opacity-50"
                >
                  <Video className="w-5 h-5" />
                  Record Video
                </button>
              )
            ) : (
              // Fallback for unsupported response types
              <div className="text-white/70 text-sm">
                Response type &quot;{currentStep.responseType}&quot; is not yet
                supported.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

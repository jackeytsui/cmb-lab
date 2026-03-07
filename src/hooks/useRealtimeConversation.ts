"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createRealtimeSession,
  cleanupRealtimeSession,
  sendSessionUpdate,
  sendTextMessage,
  setupRemoteAudioPlayback,
  type RealtimeSession,
} from "@/lib/realtime-utils";
import type { LanguagePreference } from "@/lib/interactions";

/**
 * Fetch lesson instructions from server API (avoids importing DB module in client).
 */
async function fetchLessonInstructions(lessonId: string, lang: LanguagePreference): Promise<string> {
  const res = await fetch(`/api/lessons/${lessonId}/instructions?lang=${lang}`);
  if (!res.ok) throw new Error("Failed to load lesson instructions");
  const data = await res.json();
  return data.instructions;
}

/**
 * Connection status for realtime conversation
 */
export type RealtimeStatus = "idle" | "connecting" | "connected" | "error";

/**
 * A single turn in the conversation transcript
 */
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number; // Seconds from conversation start
}

/**
 * Data channel event from OpenAI Realtime API
 */
interface RealtimeEvent {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/**
 * Hook return value
 */
export interface UseRealtimeConversationReturn {
  /** Current connection status */
  status: RealtimeStatus;
  /** Error message if status is 'error' */
  error: string | null;
  /** Whether local microphone is muted */
  isMuted: boolean;
  /** Conversation ID for the current session */
  conversationId: string | null;
  /** Transcript of the conversation so far */
  turns: ConversationTurn[];
  /** Start voice conversation with lesson context */
  connect: (lessonId: string, languagePreference?: LanguagePreference) => Promise<void>;
  /** End voice conversation and save transcript */
  disconnect: () => Promise<void>;
  /** Toggle microphone mute */
  toggleMute: () => void;
  /** Send text message (for debugging/accessibility) */
  sendMessage: (text: string) => void;
}

/**
 * React hook for managing WebRTC voice conversation with OpenAI Realtime API
 *
 * Usage:
 * ```tsx
 * const { status, error, isMuted, turns, connect, disconnect, toggleMute } = useRealtimeConversation();
 *
 * // Start conversation with lesson context
 * await connect("lesson-uuid-here");
 *
 * // End conversation (saves transcript to database)
 * await disconnect();
 * ```
 */
export function useRealtimeConversation(): UseRealtimeConversationReturn {
  // State
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);

  // Refs for WebRTC objects (don't need re-renders)
  const sessionRef = useRef<RealtimeSession | null>(null);
  const cleanupAudioRef = useRef<(() => void) | null>(null);
  const pendingInstructionsRef = useRef<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const currentAiTranscriptRef = useRef<string>("");

  /**
   * Get seconds elapsed since conversation started
   */
  const getTimestamp = useCallback(() => {
    if (!startTimeRef.current) return 0;
    return Math.floor((Date.now() - startTimeRef.current) / 1000);
  }, []);

  /**
   * Add a turn to the transcript
   */
  const addTurn = useCallback(
    (role: "user" | "assistant", content: string) => {
      if (!content.trim()) return;
      const turn: ConversationTurn = {
        role,
        content: content.trim(),
        timestamp: getTimestamp(),
      };
      setTurns((prev) => [...prev, turn]);
    },
    [getTimestamp]
  );

  /**
   * Handle data channel messages from OpenAI
   */
  const handleDataChannelMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data: RealtimeEvent = JSON.parse(event.data);

        switch (data.type) {
          case "session.created":
            console.log("[Realtime] Session created");
            setStatus("connected");

            // Send pending instructions if any
            if (pendingInstructionsRef.current && sessionRef.current?.dc) {
              sendSessionUpdate(
                sessionRef.current.dc,
                pendingInstructionsRef.current
              );
              pendingInstructionsRef.current = null;
            }
            break;

          case "session.updated":
            console.log("[Realtime] Session updated");
            break;

          case "response.audio_transcript.delta":
            // AI is speaking - accumulate transcript
            if (data.delta) {
              currentAiTranscriptRef.current += data.delta;
            }
            break;

          case "response.audio_transcript.done":
            // AI finished speaking - capture complete content
            if (currentAiTranscriptRef.current) {
              addTurn("assistant", currentAiTranscriptRef.current);
              currentAiTranscriptRef.current = "";
            }
            break;

          case "conversation.item.input_audio_transcription.completed":
            // User speech transcribed
            if (data.transcript) {
              addTurn("user", data.transcript);
            }
            break;

          case "error":
            console.error("[Realtime] API error:", data);
            setError(data.error?.message || "Realtime API error");
            setStatus("error");
            break;

          default:
            // Log other events for debugging during development
            // console.log("[Realtime] Event:", data.type);
            break;
        }
      } catch (e) {
        console.error("[Realtime] Failed to parse message:", e);
      }
    },
    [addTurn]
  );

  /**
   * Start voice conversation with lesson context
   */
  const connect = useCallback(
    async (lessonId: string, languagePreference?: LanguagePreference) => {
      // Prevent multiple connections
      if (status === "connecting" || status === "connected") {
        console.warn("[Realtime] Already connecting or connected");
        return;
      }

      setStatus("connecting");
      setError(null);
      setTurns([]);
      currentAiTranscriptRef.current = "";

      try {
        // 1. Build lesson-aware AI instructions with language preference
        const instructions = await fetchLessonInstructions(lessonId, languagePreference || "both");

        // 2. Create conversation record in database
        const createResponse = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId }),
        });

        if (!createResponse.ok) {
          const errorData = await createResponse.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Failed to create conversation record"
          );
        }

        const { conversation } = await createResponse.json();
        setConversationId(conversation.id);
        startTimeRef.current = Date.now();

        // 3. Get ephemeral token from our API
        const tokenResponse = await fetch("/api/realtime/token", {
          method: "POST",
        });

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json().catch(() => ({}));
          throw new Error(
            errorData.error || "Failed to get voice session token"
          );
        }

        const { token } = await tokenResponse.json();

        // 4. Create WebRTC session
        const session = await createRealtimeSession(token);
        sessionRef.current = session;

        // 5. Set up audio playback for AI voice
        cleanupAudioRef.current = setupRemoteAudioPlayback(session.pc);

        // 6. Store instructions to send after session.created
        pendingInstructionsRef.current = instructions;

        // 7. Set up data channel event handlers
        session.dc.onmessage = handleDataChannelMessage;

        session.dc.onopen = () => {
          console.log("[Realtime] Data channel open");
        };

        session.dc.onclose = () => {
          console.log("[Realtime] Data channel closed");
          setStatus("idle");
        };

        session.dc.onerror = (e) => {
          console.error("[Realtime] Data channel error:", e);
          setError("Connection error");
          setStatus("error");
        };

        // 8. Handle connection state changes
        session.pc.onconnectionstatechange = () => {
          const state = session.pc.connectionState;
          console.log("[Realtime] Connection state:", state);

          if (state === "failed" || state === "disconnected") {
            setError("Connection lost");
            setStatus("error");
          }
        };
      } catch (e) {
        console.error("[Realtime] Connection failed:", e);

        let errorMessage = "Failed to connect to AI tutor";

        if (e instanceof Error) {
          if (e.name === "NotAllowedError") {
            errorMessage =
              "Microphone access denied. Please allow microphone access in your browser settings and try again.";
          } else if (e.name === "NotFoundError") {
            errorMessage =
              "No microphone found. Please connect a microphone and try again.";
          } else if (e.name === "NotReadableError") {
            errorMessage =
              "Microphone is in use by another application. Please close other apps using your mic and try again.";
          } else if (
            e.message.includes("Failed to get voice session token") ||
            e.message.includes("session")
          ) {
            errorMessage =
              "Unable to start voice session. The service may be temporarily unavailable.";
          } else {
            errorMessage = e.message || "Failed to connect to AI tutor";
          }
        }

        setError(errorMessage);
        setStatus("error");

        // Clean up partial session if any
        if (sessionRef.current) {
          cleanupRealtimeSession(
            sessionRef.current.pc,
            sessionRef.current.localStream
          );
          sessionRef.current = null;
        }
      }
    },
    [status, handleDataChannelMessage]
  );

  /**
   * End voice conversation and save transcript to database
   */
  const disconnect = useCallback(async () => {
    // Save transcript if we have a conversation ID and turns
    if (conversationId && turns.length > 0) {
      try {
        await fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endedAt: true,
            turns,
          }),
        });
        console.log("[Realtime] Transcript saved to database");
      } catch (e) {
        console.error("[Realtime] Failed to save transcript:", e);
        // Don't throw - still clean up the connection
      }
    } else if (conversationId) {
      // End conversation without turns
      try {
        await fetch(`/api/conversations/${conversationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endedAt: true }),
        });
      } catch (e) {
        console.error("[Realtime] Failed to end conversation:", e);
      }
    }

    // Clean up WebRTC session
    if (sessionRef.current) {
      cleanupRealtimeSession(
        sessionRef.current.pc,
        sessionRef.current.localStream
      );
      sessionRef.current = null;
    }

    if (cleanupAudioRef.current) {
      cleanupAudioRef.current();
      cleanupAudioRef.current = null;
    }

    // Reset state
    pendingInstructionsRef.current = null;
    startTimeRef.current = null;
    currentAiTranscriptRef.current = "";
    setConversationId(null);
    setTurns([]);
    setStatus("idle");
    setError(null);
    setIsMuted(false);
  }, [conversationId, turns]);

  /**
   * Toggle microphone mute
   */
  const toggleMute = useCallback(() => {
    if (!sessionRef.current?.localStream) {
      console.warn("[Realtime] No active session to mute");
      return;
    }

    const audioTracks = sessionRef.current.localStream.getAudioTracks();
    const newMutedState = !isMuted;

    audioTracks.forEach((track) => {
      track.enabled = !newMutedState;
    });

    setIsMuted(newMutedState);
  }, [isMuted]);

  /**
   * Send text message (for debugging/accessibility)
   */
  const sendMessage = useCallback((text: string) => {
    if (!sessionRef.current?.dc) {
      console.warn("[Realtime] No active session to send message");
      return;
    }

    sendTextMessage(sessionRef.current.dc, text);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        cleanupRealtimeSession(
          sessionRef.current.pc,
          sessionRef.current.localStream
        );
      }
      if (cleanupAudioRef.current) {
        cleanupAudioRef.current();
      }
    };
  }, []);

  return {
    status,
    error,
    isMuted,
    conversationId,
    turns,
    connect,
    disconnect,
    toggleMute,
    sendMessage,
  };
}

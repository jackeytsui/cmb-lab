"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { useRealtimeConversation } from "@/hooks/useRealtimeConversation";
import { useLanguagePreference } from "@/hooks/useLanguagePreference";
import { ConversationTranscript } from "./ConversationTranscript";

interface VoiceConversationProps {
  /** Lesson ID for conversation context */
  lessonId: string;
  /** Lesson title for display */
  lessonTitle: string;
}

/**
 * Voice conversation component for practicing with AI tutor.
 *
 * States:
 * - Idle: "Start Conversation" button
 * - Connecting: Loading spinner
 * - Connected: Active conversation UI with transcript, mute, and end buttons
 * - Error: Error message with retry button
 *
 * Features:
 * - Live transcript during conversation
 * - Mute/unmute microphone
 * - End conversation (saves transcript)
 * - Smooth state transitions with Framer Motion
 */
export function VoiceConversation({
  lessonId,
  lessonTitle,
}: VoiceConversationProps) {
  const {
    status,
    error,
    isMuted,
    turns,
    connect,
    disconnect,
    toggleMute,
  } = useRealtimeConversation();

  const { preference } = useLanguagePreference();

  /**
   * Handle start conversation
   */
  const handleStart = async () => {
    await connect(lessonId, preference);
  };

  /**
   * Handle end conversation
   */
  const handleEnd = async () => {
    await disconnect();
  };

  /**
   * Handle retry after error
   */
  const handleRetry = async () => {
    await connect(lessonId, preference);
  };

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="border-b border-zinc-800">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mic className="w-5 h-5 text-cyan-400" />
          Practice Conversation
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-6">
        <AnimatePresence mode="wait">
          {/* Idle State */}
          {status === "idle" && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-center py-8"
            >
              <div className="w-16 h-16 bg-cyan-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mic className="w-8 h-8 text-cyan-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Voice Practice
              </h3>
              <p className="text-zinc-400 text-sm mb-6 max-w-md mx-auto">
                Practice speaking with an AI tutor who knows the content of{" "}
                <span className="text-cyan-400">{lessonTitle}</span>. Get
                instant pronunciation feedback and conversational practice.
              </p>
              <Button
                onClick={handleStart}
                size="lg"
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <Phone className="w-4 h-4 mr-2" />
                Start Conversation
              </Button>
              <p className="text-xs text-zinc-500 mt-3">
                Requires microphone access
              </p>
            </motion.div>
          )}

          {/* Connecting State */}
          {status === "connecting" && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-center py-12"
            >
              <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mx-auto mb-4" />
              <p className="text-zinc-400">Connecting to AI tutor...</p>
              <p className="text-xs text-zinc-500 mt-2">
                Please allow microphone access if prompted
              </p>
            </motion.div>
          )}

          {/* Connected State */}
          {status === "connected" && (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {/* Status indicator */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-3 h-3 bg-green-500 rounded-full"
                    animate={{ opacity: [1, 0.5, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <span className="text-sm text-green-400">Connected</span>
                </div>
                <div className="flex items-center gap-2">
                  {isMuted ? (
                    <MicOff className="w-4 h-4 text-red-400" />
                  ) : (
                    <Mic className="w-4 h-4 text-cyan-400" />
                  )}
                  <span className="text-xs text-zinc-400">
                    {isMuted ? "Muted" : "Listening"}
                  </span>
                </div>
              </div>

              {/* Live transcript */}
              <ConversationTranscript turns={turns} isLive />

              {/* Control buttons */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <Button
                  onClick={toggleMute}
                  variant={isMuted ? "destructive" : "outline"}
                  size="icon"
                  className={
                    isMuted
                      ? "bg-red-600 hover:bg-red-500 border-red-600"
                      : "border-zinc-600 hover:border-zinc-500"
                  }
                  title={isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {isMuted ? (
                    <MicOff className="w-5 h-5" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </Button>

                <Button
                  onClick={handleEnd}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-500"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  End Conversation
                </Button>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {status === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="text-center py-8"
            >
              <div className="w-16 h-16 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Connection Error
              </h3>
              <p className="text-zinc-400 text-sm mb-2">
                {error || "Failed to connect to AI tutor"}
              </p>
              <p className="text-xs text-zinc-500 mb-6">
                Check your microphone permissions and internet connection
              </p>
              <Button
                onClick={handleRetry}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Try Again
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}

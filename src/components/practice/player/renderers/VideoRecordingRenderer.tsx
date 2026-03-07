"use client";

import { VideoRecordingDefinition } from "@/types/exercises";
import { VideoRecorder } from "./VideoRecorder";

interface VideoRecordingRendererProps {
  exerciseId: string;
  definition: VideoRecordingDefinition;
  onAnswer: (answer: string) => void;
  savedAnswer?: string;
  isSubmitted: boolean;
}

export function VideoRecordingRenderer({
  exerciseId,
  definition,
  onAnswer,
  savedAnswer,
  isSubmitted,
}: VideoRecordingRendererProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
        <h3 className="text-xl font-semibold text-white mb-4">
          {definition.prompt}
        </h3>

        <VideoRecorder
          videoPromptId={definition.videoPromptId}
          onRecordingComplete={(url) => onAnswer(url)}
          initialUrl={savedAnswer}
          readOnly={isSubmitted}
        />

        {definition.explanation && isSubmitted && (
          <div className="mt-6 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
            <h4 className="text-sm font-medium text-zinc-300 mb-1">
              Instructions
            </h4>
            <p className="text-sm text-zinc-400">{definition.explanation}</p>
          </div>
        )}
      </div>
    </div>
  );
}

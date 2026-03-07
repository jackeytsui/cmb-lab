"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoRecordingDefinition } from "@/types/exercises";
import { VideoThread } from "@/db/schema/video-threads";
import { Loader2 } from "lucide-react";

interface VideoRecordingFormProps {
  definition: VideoRecordingDefinition | null;
  onChange: (def: VideoRecordingDefinition) => void;
}

export function VideoRecordingForm({ definition, onChange }: VideoRecordingFormProps) {
  const [threads, setThreads] = useState<VideoThread[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Default state
  const promptText = definition?.prompt || "";
  const videoThreadId = definition?.videoThreadId || "";
  const explanation = definition?.explanation || "";

  useEffect(() => {
    // Fetch video threads
    fetch("/api/admin/video-threads")
      .then((res) => res.json())
      .then((data) => {
        if (data.threads) setThreads(data.threads);
      })
      .catch((err) => console.error("Failed to load video threads", err))
      .finally(() => setLoading(false));
  }, []);

  const update = (changes: Partial<VideoRecordingDefinition>) => {
    onChange({
      type: "video_recording",
      prompt: promptText,
      videoThreadId: videoThreadId || undefined,
      videoPromptId: undefined, // Clear legacy ID if setting new thread
      explanation: explanation || undefined,
      ...changes,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-zinc-300">Select Video Thread</Label>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading threads...
          </div>
        ) : (
          <Select
            value={videoThreadId}
            onValueChange={(val) => {
              const selectedThread = threads.find(t => t.id === val);
              update({ 
                videoThreadId: val,
                prompt: !promptText && selectedThread ? selectedThread.title : promptText
              });
            }}
          >
            <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
              <SelectValue placeholder="Select a VideoAsk thread..." />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-800">
              {threads.length === 0 ? (
                <div className="p-2 text-xs text-zinc-500 text-center">
                  No threads found. Create one in the Video Threads section.
                </div>
              ) : (
                threads.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-white hover:bg-zinc-700">
                    {t.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        )}
        <p className="text-xs text-zinc-500">
          Select a pre-configured video thread (series of questions).
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Prompt Text <span className="text-red-400">*</span></Label>
        <Input
          value={promptText}
          onChange={(e) => update({ prompt: e.target.value })}
          placeholder="e.g. Complete the video thread"
          className="border-zinc-700 bg-zinc-800 text-white"
        />
        <p className="text-xs text-zinc-500">
          Displayed to the student as the main instruction.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Explanation / Grading Rubric (Optional)</Label>
        <Textarea
          value={explanation}
          onChange={(e) => update({ explanation: e.target.value })}
          placeholder="Criteria for grading or sample answer context..."
          className="border-zinc-700 bg-zinc-800 text-white h-20"
        />
      </div>
    </div>
  );
}

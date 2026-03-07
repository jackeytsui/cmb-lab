"use client";

import { useState, useEffect } from "react";
import { VideoPromptRecorder } from "@/components/coach/video-prompts/VideoPromptRecorder";
import { VideoPromptList } from "@/components/coach/video-prompts/VideoPromptList";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { VideoPrompt } from "@/db/schema/video-prompts";

export function VideoPromptsClient() {
  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPrompts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/coach/video-prompts");
      const data = await res.json();
      if (data.prompts) setPrompts(data.prompts);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch video prompts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleDelete = async (id: string) => {
    // Optimistic update
    setPrompts((prev) => prev.filter((p) => p.id !== id));
    // Actually delete
    try {
      const res = await fetch(`/api/coach/video-prompts?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    } catch {
      toast.error("Failed to delete prompt");
      fetchPrompts(); // Revert
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Prompts Library</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Record and manage video questions for your lessons.
          </p>
        </div>
        <VideoPromptRecorder onSuccess={fetchPrompts} />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
        </div>
      ) : (
        <VideoPromptList 
            prompts={prompts} 
            onDelete={handleDelete}
        />
      )}
    </div>
  );
}

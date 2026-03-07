"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoThreadStep } from "@/db/schema/video-threads";
import { VideoPrompt } from "@/db/schema/video-prompts";

// Simplified props
interface VideoThreadStepEditorProps {
  initialData?: Partial<VideoThreadStep>;
  onSave: (data: Partial<VideoThreadStep>) => void;
  onCancel: () => void;
}

export function VideoThreadStepEditor({ initialData, onSave, onCancel }: VideoThreadStepEditorProps) {
  const [promptText, setPromptText] = useState(initialData?.promptText || "");
  const [responseType, setResponseType] = useState(initialData?.responseType || "video");
  const [videoSource, setVideoSource] = useState<string>(initialData?.uploadId || initialData?.videoUrl || "");
  
  // To populate video options
  const [prompts, setPrompts] = useState<VideoPrompt[]>([]);
  
  useEffect(() => {
      // Fetch prompts to use as videos (can reuse existing prompt logic or direct uploads)
      // For now, let's fetch video prompts as a source of "ready to use" videos
      fetch('/api/coach/video-prompts')
        .then(res => res.json())
        .then(data => {
            if(data.prompts) setPrompts(data.prompts);
        });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      
      // Determine if source is UUID (uploadId) or URL
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(videoSource);
      
      onSave({
          promptText,
          responseType: responseType as VideoThreadStep["responseType"],
          // If UUID, assume uploadId (linked to a prompt's upload asset). 
          // If URL, set videoUrl.
          // Note: In real app, we might want stricter differentiation.
          uploadId: isUuid ? videoSource : null,
          videoUrl: !isUuid ? videoSource : null,
      });
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-zinc-900 border-zinc-800">
      <div className="space-y-4">
        
        {/* Prompt Text */}
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Prompt / Question</Label>
          <Input 
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            placeholder="What should the student answer?"
            className="bg-zinc-800 border-zinc-700 text-white"
            autoFocus
          />
        </div>

        {/* Video Source */}
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Video Content</Label>
          <Select value={videoSource} onValueChange={setVideoSource}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue placeholder="Select a video..." />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
               {prompts.map(p => (
                   <SelectItem key={p.uploadId || p.videoUrl || p.id} value={p.uploadId || p.videoUrl || ""}>
                       {p.title}
                   </SelectItem>
               ))}
               <SelectItem value="no_video">No Video (Text Only)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-zinc-500">
              Select a recorded prompt. (Ensure prompts are created in Video Prompts section first)
          </p>
        </div>

        {/* Response Type */}
        <div className="space-y-1.5">
          <Label className="text-zinc-300">Student Response Type</Label>
          <Select 
            value={responseType} 
            onValueChange={(val) => setResponseType(val as any)}
          >
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="video">Video Recording</SelectItem>
              <SelectItem value="audio">Audio Recording</SelectItem>
              <SelectItem value="text">Text Input</SelectItem>
              <SelectItem value="button">Button (Continue)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onCancel} className="text-zinc-400 hover:text-white">
            Cancel
          </Button>
          <Button type="submit" className="bg-indigo-600 hover:bg-indigo-500 text-white">
            Save Step
          </Button>
        </div>
      </div>
    </form>
  );
}

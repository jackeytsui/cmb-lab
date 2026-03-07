"use client";

import { useState } from "react";
import { VideoPrompt } from "@/db/schema/video-prompts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Copy, Trash2, Edit } from "lucide-react";
import MuxPlayer from "@mux/mux-player-react";
import { formatDistanceToNow } from "date-fns";

interface VideoPromptListProps {
  prompts: VideoPrompt[];
  onDelete?: (id: string) => void;
  onEdit?: (prompt: VideoPrompt) => void;
}

export function VideoPromptList({ prompts, onDelete, onEdit }: VideoPromptListProps) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  if (prompts.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
        <p className="text-zinc-500">No video prompts created yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {prompts.map((prompt) => (
        <Card key={prompt.id} className="bg-zinc-900/50 border-zinc-800 overflow-hidden group">
          <div className="aspect-video bg-zinc-950 relative">
            {playingId === prompt.id && prompt.videoUrl ? (
              <MuxPlayer
                streamType="on-demand"
                playbackId={prompt.videoUrl.split("/").pop()?.replace(".m3u8", "")}
                metadata={{ video_title: prompt.title }}
                className="w-full h-full"
                autoPlay
              />
            ) : (
              <div 
                className="absolute inset-0 flex items-center justify-center cursor-pointer bg-zinc-900/50 hover:bg-zinc-900/30 transition-colors"
                onClick={() => prompt.videoUrl && setPlayingId(prompt.id)}
              >
                {prompt.videoUrl ? (
                    <div className="w-12 h-12 rounded-full bg-cyan-500/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 text-white ml-1" />
                    </div>
                ) : (
                    <div className="text-zinc-500 text-xs">Video Processing...</div>
                )}
              </div>
            )}
          </div>
          
          <CardHeader className="p-4 pb-2">
            <div className="flex justify-between items-start gap-2">
              <CardTitle className="text-base text-white line-clamp-1" title={prompt.title}>
                {prompt.title}
              </CardTitle>
              <span className="text-xs text-zinc-500 whitespace-nowrap">
                {formatDistanceToNow(new Date(prompt.createdAt), { addSuffix: true })}
              </span>
            </div>
            {prompt.description && (
              <p className="text-xs text-zinc-400 line-clamp-2 min-h-[2.5em]">
                {prompt.description}
              </p>
            )}
          </CardHeader>
          
          <CardContent className="p-4 pt-2 flex justify-between items-center border-t border-zinc-800/50 mt-2">
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-zinc-400 hover:text-white"
                onClick={() => onEdit?.(prompt)}
              >
                <Edit className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-zinc-400 hover:text-red-400"
                onClick={() => onDelete?.(prompt.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

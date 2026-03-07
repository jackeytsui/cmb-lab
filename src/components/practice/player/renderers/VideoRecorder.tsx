"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Video as VideoIcon, RefreshCcw, Trash2, Play, Pause } from "lucide-react";
import MuxPlayer from "@mux/mux-player-react";
import { toast } from "sonner";

interface VideoRecorderProps {
  videoPromptId?: string; // If provided, fetch video prompt
  onRecordingComplete: (url: string) => void;
  initialUrl?: string; // For saved answers
  readOnly?: boolean;
}

export function VideoRecorder({
  videoPromptId,
  onRecordingComplete,
  initialUrl,
  readOnly = false,
}: VideoRecorderProps) {
  const [coachVideoUrl, setCoachVideoUrl] = useState<string | null>(null);
  const [recordMode, setRecordMode] = useState<"video" | "audio">("video");
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl || null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Fetch coach video if ID provided
  useEffect(() => {
    if (videoPromptId) {
      fetch(`/api/video-prompts/${videoPromptId}`)
        .then(res => res.json())
        .then(data => {
          if (data.prompt?.videoUrl) {
            setCoachVideoUrl(data.prompt.videoUrl);
          }
        })
        .catch(err => console.error("Failed to load video prompt", err));
    }
  }, [videoPromptId]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopStream();
      // Only revoke if it's a blob URL we created, not if it's a server URL (initialUrl)
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    try {
      const constraints = {
        audio: true,
        video: recordMode === "video",
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current && recordMode === "video") {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play();
      }

      const mimeType = recordMode === "video" ? "video/webm" : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stopStream();
        // Automatically upload? Or wait for confirm?
        // Let's auto-upload to get the URL for onRecordingComplete
        uploadRecording(blob, mimeType);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Recording error:", err);
      toast.error("Could not access camera/microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadRecording = async (blob: Blob, mimeType: string) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      const ext = mimeType.includes("audio") ? "webm" : "webm"; // both usually webm
      const filename = `recording-${Date.now()}.${ext}`;
      formData.append("file", blob, filename);

      const res = await fetch("/api/submissions/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      
      onRecordingComplete(url);
      toast.success("Recording saved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload recording");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    if (previewUrl && previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setRecordedBlob(null);
  };

  // Render Coach Prompt Video
  const renderCoachVideo = () => {
    if (!coachVideoUrl) return null;
    return (
      <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 mb-6">
        <MuxPlayer
          streamType="on-demand"
          playbackId={coachVideoUrl.split("/").pop()?.replace(".m3u8", "")}
          className="w-full h-full"
          autoPlay={false}
        />
      </div>
    );
  };

  // Render Playback (Review)
  if (previewUrl) {
    const isVideo = previewUrl.endsWith(".webm") || previewUrl.endsWith(".mp4") || recordMode === "video"; // Basic guess
    // Ideally we store metadata about type, but for simple playback:
    
    return (
      <div className="space-y-4">
        {renderCoachVideo()}
        <div className="bg-zinc-950 rounded-lg p-4 border border-zinc-800 text-center">
            <h4 className="text-sm font-medium text-zinc-400 mb-2">Your Answer</h4>
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 mx-auto max-w-md">
                <video src={previewUrl} controls className="w-full h-full" />
            </div>
            {!readOnly && (
                <div className="mt-4">
                    <Button onClick={handleRetake} variant="outline" size="sm">
                        <RefreshCcw className="w-4 h-4 mr-2" />
                        Retake
                    </Button>
                </div>
            )}
        </div>
      </div>
    );
  }

  // Render Recorder
  return (
    <div className="space-y-6">
      {renderCoachVideo()}
      
      {!readOnly && (
        <div className="bg-zinc-950 rounded-lg p-6 border border-zinc-800 flex flex-col items-center gap-4">
            <h4 className="text-sm font-medium text-zinc-400">Record Answer</h4>
            
            {/* Live Preview */}
            <div className="relative aspect-video w-full max-w-md bg-black rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center">
                {recordMode === "video" ? (
                <video 
                    ref={videoRef} 
                    className="w-full h-full object-cover transform scale-x-[-1]" 
                    muted 
                    playsInline 
                />
                ) : (
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isRecording ? "bg-red-500/20 animate-pulse" : "bg-zinc-800"}`}>
                    <Mic className={`w-10 h-10 ${isRecording ? "text-red-500" : "text-zinc-400"}`} />
                </div>
                )}
            </div>

            {/* Controls */}
            {!isRecording && !isUploading && (
                <div className="flex gap-2">
                    <Button 
                        variant={recordMode === "video" ? "secondary" : "ghost"} 
                        onClick={() => setRecordMode("video")}
                        size="sm"
                    >
                        Video
                    </Button>
                    <Button 
                        variant={recordMode === "audio" ? "secondary" : "ghost"} 
                        onClick={() => setRecordMode("audio")}
                        size="sm"
                    >
                        Audio Only
                    </Button>
                </div>
            )}

            <div className="flex gap-4">
                {isRecording ? (
                    <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full min-w-[200px]">
                        Stop Recording
                    </Button>
                ) : isUploading ? (
                    <Button disabled size="lg" className="w-full min-w-[200px]">
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                    </Button>
                ) : (
                    <Button onClick={startRecording} size="lg" className="w-full min-w-[200px] bg-red-600 hover:bg-red-700">
                        <div className="w-3 h-3 rounded-full bg-white mr-2" />
                        Start Recording
                    </Button>
                )}
            </div>
        </div>
      )}
    </div>
  );
}

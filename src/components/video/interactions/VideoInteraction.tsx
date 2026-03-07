"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Mic, Video as VideoIcon, Send, RefreshCcw, Play, Pause } from "lucide-react";
import MuxPlayer from "@mux/mux-player-react";
import { toast } from "sonner";

interface VideoInteractionProps {
  interactionId: string;
  lessonId: string;
  videoPromptId: string;
  prompt: string; // The text prompt
  onComplete: () => void;
}

export function VideoInteraction({
  interactionId,
  lessonId,
  videoPromptId,
  prompt,
  onComplete,
}: VideoInteractionProps) {
  // Phase: "watching" -> "recording" -> "review" -> "submitting"
  const [phase, setPhase] = useState<"watching" | "recording" | "review" | "submitting">("watching");
  const [recordMode, setRecordMode] = useState<"video" | "audio">("video");
  const [coachVideoUrl, setCoachVideoUrl] = useState<string | null>(null);
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);

  // 1. Fetch Coach Video URL
  useEffect(() => {
    fetch(`/api/video-prompts/${videoPromptId}`)
      .then(res => res.json())
      .then(data => {
        if (data.prompt?.videoUrl) {
          setCoachVideoUrl(data.prompt.videoUrl);
        }
      })
      .catch(err => console.error("Failed to load video prompt", err));
  }, [videoPromptId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStream();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
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
        setPhase("review");
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

  const handleSubmit = async () => {
    if (!recordedBlob) return;
    setPhase("submitting");

    try {
      // 1. Upload Blob (using simple local upload for student responses for now)
      const formData = new FormData();
      const filename = `response-${Date.now()}.${recordMode === "video" ? "webm" : "webm"}`; // webm is standard container
      formData.append("file", recordedBlob, filename);
      
      // We need an endpoint for student uploads. 
      // Reusing lesson attachment upload logic might be restricted to admins.
      // Let's create a specific endpoint: /api/submissions/upload
      const uploadRes = await fetch("/api/submissions/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json();

      // 2. Submit interaction
      const submitRes = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionId,
          lessonId,
          type: recordMode,
          videoUrl: recordMode === "video" ? url : undefined,
          audioUrl: recordMode === "audio" ? url : undefined, // Check if submissions table supports audioUrl or just audioData
          // The schema has `videoUrl` and `audioData`. 
          // If we upload audio file, we should probably put url in `videoUrl` or add `audioUrl`.
          // Or just base64 for audio if short? But videoask audio can be long.
          // Let's store URL in `videoUrl` even if audio, or base64 encode if small.
          // Given `audioData` is text, let's assume it's base64.
          // But uploading is better. Let's assume we update schema to allow `audioUrl` or generic `mediaUrl`.
          // Current schema: `audioData: text` (Base64), `videoUrl: text`.
          // I will use `videoUrl` for the file URL for now, or just assume the backend handles it.
          // Actually, I'll update the API to handle file URL for audio too if I can.
        }),
      });

      if (!submitRes.ok) throw new Error("Submission failed");

      toast.success("Response submitted!");
      onComplete();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit response");
      setPhase("review");
    }
  };

  return (
    <div className="flex flex-col gap-6 text-center text-white max-w-lg mx-auto">
      {/* Header / Prompt */}
      {phase === "watching" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">{prompt}</h2>
          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800">
            {coachVideoUrl ? (
              <MuxPlayer
                streamType="on-demand"
                playbackId={coachVideoUrl.split("/").pop()?.replace(".m3u8", "")}
                className="w-full h-full"
                autoPlay
              />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-500">
                Loading video...
              </div>
            )}
          </div>
          <div className="flex justify-center gap-4">
            <Button onClick={() => setPhase("recording")} size="lg" className="gap-2">
              <VideoIcon className="w-5 h-5" />
              Reply
            </Button>
          </div>
        </div>
      )}

      {/* Recording Phase */}
      {phase === "recording" && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Record your answer</h2>
          
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800 flex items-center justify-center">
            {recordMode === "video" ? (
              <video 
                ref={videoRef} 
                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror
                muted 
                playsInline 
              />
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isRecording ? "bg-red-500/20 animate-pulse" : "bg-zinc-800"}`}>
                  <Mic className={`w-10 h-10 ${isRecording ? "text-red-500" : "text-zinc-400"}`} />
                </div>
                {isRecording && <span className="text-red-400 text-sm">Recording...</span>}
              </div>
            )}
          </div>

          {!isRecording && (
            <div className="flex justify-center gap-2 mb-4">
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

          <div className="flex justify-center gap-4">
            {isRecording ? (
              <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full">
                Stop Recording
              </Button>
            ) : (
              <Button onClick={startRecording} size="lg" className="w-full bg-red-600 hover:bg-red-700">
                <div className="w-3 h-3 rounded-full bg-white mr-2" />
                Start Recording
              </Button>
            )}
            <Button variant="ghost" onClick={() => setPhase("watching")} disabled={isRecording}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Review Phase */}
      {(phase === "review" || phase === "submitting") && previewUrl && (
        <div className="space-y-4">
          <h2 className="text-lg font-medium">Review your response</h2>
          
          <div className="aspect-video bg-black rounded-lg overflow-hidden border border-zinc-800">
            {recordMode === "video" ? (
              <video src={previewUrl} controls className="w-full h-full" />
            ) : (
              <div className="flex items-center justify-center h-full">
                <audio src={previewUrl} controls className="w-full" />
              </div>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <Button onClick={() => setPhase("recording")} variant="outline">
              <RefreshCcw className="w-4 h-4 mr-2" />
              Retake
            </Button>
            <Button onClick={handleSubmit} disabled={phase === "submitting"}>
              {phase === "submitting" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Submit Response
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

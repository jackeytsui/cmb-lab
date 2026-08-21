"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, Video, Upload, Trash2 } from "lucide-react";
import * as UpChunk from "@mux/upchunk";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Extend window for webkitAudioContext
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

interface VideoPromptRecorderProps {
  onSuccess: () => void;
}

const VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/mp4;codecs=h264,aac",
  "video/webm",
  "video/mp4",
];

function getSupportedVideoMimeType(): string | undefined {
  return VIDEO_MIME_TYPES.find((mimeType) =>
    MediaRecorder.isTypeSupported(mimeType),
  );
}

export function VideoPromptRecorder({ onSuccess }: VideoPromptRecorderProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const router = useRouter();

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      }
      stopStream();
    };
  }, [stopStream]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // Mute local preview to avoid feedback
        await videoRef.current.play();
      }

      const mimeType = getSupportedVideoMimeType();
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || "video/webm",
        });
        setRecordedBlob(blob);
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        stopStream();
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = url;
          videoRef.current.muted = false;
          videoRef.current.controls = true;
          // videoRef.current.play(); // Don't auto-play
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      stopStream();
      console.error("Error accessing camera:", err);
      toast.error("Could not access camera. Please check permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const resetRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    stopStream();
    setIsRecording(false);
    setRecordedBlob(null);
    setPreviewUrl(null);
    setUploadProgress(null);
    if (videoRef.current) {
      videoRef.current.src = "";
      videoRef.current.srcObject = null;
      videoRef.current.controls = false;
    }
  };

  const handleUpload = async () => {
    if (!recordedBlob || !title) return;

    setIsSubmitting(true);
    try {
      const extension = recordedBlob.type.includes("mp4") ? "mp4" : "webm";
      // 1. Get upload URL
      const uploadRes = await fetch("/api/admin/mux/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: `prompt-${Date.now()}.${extension}`,
          category: "prompt",
          tags: ["coach-recorder"],
        }),
      });
      
      if (!uploadRes.ok) throw new Error("Failed to get upload URL");
      
      const { uploadUrl, uploadId, dbUploadId } = await uploadRes.json();

      // 2. Upload file to Mux
      const upload = UpChunk.createUpload({
        endpoint: uploadUrl,
        file: new File([recordedBlob], `video-prompt.${extension}`, {
          type: recordedBlob.type || `video/${extension}`,
        }),
        chunkSize: 5120, // 5MB
      });

      upload.on("progress", (progress) => {
        setUploadProgress(progress.detail);
      });

      await new Promise<void>((resolve, reject) => {
        upload.on("success", () => resolve());
        upload.on("error", (err) => reject(err.detail));
      });

      // Mux assets and playback IDs are different identifiers. Wait for the
      // signed playback ID that SignedMuxPlayer expects.
      let muxPlaybackId: string | null = null;
      let attempts = 0;
      while (!muxPlaybackId && attempts < 30) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusRes = await fetch("/api/admin/mux/check-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId }),
        });
        if (!statusRes.ok) {
          throw new Error("Could not check video processing status");
        }
        const statusData = await statusRes.json();
        if (statusData.status === "errored") {
          throw new Error(statusData.errorMessage || "Mux could not process the video");
        }
        if (statusData.status === "ready" && statusData.muxPlaybackId) {
          muxPlaybackId = statusData.muxPlaybackId;
        }
        attempts++;
      }

      if (!muxPlaybackId) {
        throw new Error("Video processing timed out. Please try again.");
      }

      // 3. Save prompt
      const saveRes = await fetch("/api/coach/video-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          videoUrl: `https://stream.mux.com/${muxPlaybackId}.m3u8`,
          uploadId: dbUploadId,
          transcript: "", // Optional
        }),
      });

      if (!saveRes.ok) throw new Error("Failed to save prompt");

      toast.success("Video prompt created!");
      setOpen(false);
      resetRecording();
      setTitle("");
      setDescription("");
      onSuccess();
      router.refresh();

    } catch (err) {
      console.error(err);
      toast.error("Failed to upload video prompt");
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!val) resetRecording();
      setOpen(val);
    }}>
      <DialogTrigger asChild>
        <Button>
          <Video className="w-4 h-4 mr-2" />
          Create Video Prompt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] bg-zinc-900 border-zinc-800 text-zinc-100">
        <DialogHeader>
          <DialogTitle>Record New Video Prompt</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduce Yourself"
              className="bg-zinc-950 border-zinc-700"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions for the student..."
              className="bg-zinc-950 border-zinc-700 h-20"
            />
          </div>

          <div className="relative border-2 border-dashed border-zinc-800 rounded-lg p-4 bg-zinc-950/50 flex flex-col items-center justify-center min-h-[300px]">
            <video
              ref={videoRef}
              className={`w-full max-h-[400px] rounded-md ${!previewUrl && !isRecording && "hidden"}`}
              autoPlay={false}
              playsInline
            />
            
            {!isRecording && !previewUrl && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mx-auto">
                    <Video className="w-8 h-8 text-zinc-500" />
                </div>
                <p className="text-zinc-500 text-sm">
                  Record yourself asking a question or giving instructions.
                </p>
                <Button onClick={startRecording} variant="default">
                  Start Recording
                </Button>
              </div>
            )}

            {isRecording && (
                <div className="absolute bottom-10 flex gap-4">
                    <Button onClick={stopRecording} variant="destructive">
                        Stop Recording
                    </Button>
                </div>
            )}

            {previewUrl && !isRecording && (
                <div className="flex gap-2 mt-4">
                    <Button onClick={resetRecording} variant="outline" className="border-red-900/50 text-red-400 hover:bg-red-950/30">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Retake
                    </Button>
                </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button 
                onClick={handleUpload} 
                disabled={isSubmitting || !recordedBlob || !title}
            >
              {isSubmitting ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {uploadProgress !== null ? `Uploading ${Math.round(uploadProgress)}%` : "Processing..."}
                </>
              ) : (
                <>
                    <Upload className="mr-2 h-4 w-4" />
                    Save to Library
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
